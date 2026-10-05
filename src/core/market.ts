import { CITIES, CITY_ORDER, ITEMS, MARKET, type CityId, type ItemId } from '../config/balance';
import { addIncome, cityUnlocked, incomeMult } from './economy';
import { onSoldForContracts } from './contracts';
import { rand } from './state';
import type { GameState, MarketEvent } from './types';

/**
 * Demand-driven prices. Every city keeps, per item:
 *  - sat   (0.15..1): drops as you sell, recovers over time
 *  - trend (0.7..1.45): slow random drift
 * plus occasional news events that boost one item in one city.
 */

function market(s: GameState, city: CityId) {
  let m = s.markets[city];
  if (!m) {
    m = { sat: {}, trend: {} };
    s.markets[city] = m;
  }
  return m;
}

export function eventMult(s: GameState, city: CityId, item: ItemId): number {
  let mult = 1;
  for (const e of s.events) if (e.city === city && e.item === item && e.until > s.time) mult *= e.mult;
  return mult;
}

/** price before saturation — the "list price" a city pays right now */
export function listPrice(s: GameState, city: CityId, item: ItemId): number {
  const def = ITEMS[item];
  const m = market(s, city);
  return def.price * CITIES[city].mult[def.cat] * (m.trend[item] ?? 1) * eventMult(s, city, item);
}

/** what one more unit would sell for, all multipliers included */
export function price(s: GameState, city: CityId, item: ItemId, now = Date.now()): number {
  return listPrice(s, city, item) * (market(s, city).sat[item] ?? 1) * incomeMult(s, now);
}

/** Sells `n` units one at a time (each sale lowers the price a little). Returns $ earned. */
export function sell(s: GameState, city: CityId, item: ItemId, n = 1, now = Date.now()): number {
  const m = market(s, city);
  const def = ITEMS[item];
  const nominal = def.price * CITIES[city].mult[def.cat];
  const dropPerUnit = (nominal * 0.5 * MARKET.recovery) / CITIES[city].depth;
  let earned = 0;
  for (let i = 0; i < n; i++) {
    earned += price(s, city, item, now);
    m.sat[item] = Math.max(MARKET.minSat, (m.sat[item] ?? 1) - dropPerUnit);
  }
  addIncome(s, earned);
  if (city === 'local') s.stats.localEarned += earned;
  s.stats.sold[item] = (s.stats.sold[item] ?? 0) + n;
  onSoldForContracts(s, item, n);
  return earned;
}

export function tickMarkets(s: GameState, dt: number) {
  const k = 1 - Math.exp(-MARKET.recovery * dt);
  for (const city of CITY_ORDER) {
    const m = market(s, city);
    for (const item in m.sat) {
      const v = m.sat[item as ItemId] ?? 1;
      if (v < 1) m.sat[item as ItemId] = Math.min(1, v + (1 - v) * k);
    }
  }

  s.trendTimer += dt;
  while (s.trendTimer >= MARKET.trendInterval) {
    s.trendTimer -= MARKET.trendInterval;
    for (const city of CITY_ORDER) {
      if (city === 'local') continue; // the home town is steady
      const m = market(s, city);
      for (const item of Object.keys(ITEMS) as ItemId[]) {
        const cur = m.trend[item] ?? 1;
        // gaussian-ish step with gentle pull back to 1
        const g = (rand(s) + rand(s) + rand(s) - 1.5) * 2 * MARKET.trendVolatility;
        const next = cur * Math.exp(g) + (1 - cur) * 0.05;
        m.trend[item] = Math.min(MARKET.trendMax, Math.max(MARKET.trendMin, next));
      }
    }
  }

  s.events = s.events.filter((e) => e.until > s.time);
  if (s.time >= s.nextEventAt) {
    s.nextEventAt = s.time + MARKET.eventInterval * (0.5 + rand(s));
    const cities = CITY_ORDER.filter((c) => c !== 'local' && cityUnlocked(s, c));
    const items = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.stats.produced[i] ?? 0) > 0);
    if (cities.length && items.length) {
      const ev: MarketEvent = {
        city: cities[Math.floor(rand(s) * cities.length)],
        item: items[Math.floor(rand(s) * items.length)],
        mult: MARKET.eventMult,
        until: s.time + MARKET.eventDuration,
      };
      s.events.push(ev);
    }
  }
}

/** best city to ship an item to right now (excluding travel time) */
export function bestCity(s: GameState, item: ItemId): CityId {
  let best: CityId = 'local';
  let bp = -1;
  for (const c of CITY_ORDER) {
    if (!cityUnlocked(s, c)) continue;
    const p = price(s, c, item);
    if (p > bp) {
      bp = p;
      best = c;
    }
  }
  return best;
}

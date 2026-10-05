import { BALANCE, warehouseCapacity, type ItemId } from '../config/balance';
import { invTotal } from './state';
import { tick } from './sim';
import type { GameState, Inventory } from './types';

export interface OfflineReport {
  seconds: number; // absence credited (after the cap)
  awaySeconds: number; // real absence
  earned: number;
  sold: Inventory;
  capped: boolean;
}

/**
 * Credits the factory for time the game was closed.
 *
 * Short absences are simulated tick by tick. Long ones are simulated for a sample
 * window to measure the factory's steady-state rates (money, items sold, warehouse
 * growth) and the rest is extrapolated — exact simulation of 8 hours would freeze
 * the tab on bigger factories.
 */
export function applyOffline(state: GameState, awaySeconds: number): OfflineReport | null {
  if (!(awaySeconds > 0)) return null; // also catches clocks moved backwards (negative)
  const cap = BALANCE.offlineCapHours * 3600;
  const seconds = Math.min(awaySeconds, cap);
  const dt = BALANCE.tickSeconds;

  const moneyBefore = state.money;
  const soldBefore = { ...state.stats.sold };

  const sample = Math.min(seconds, BALANCE.offlineSampleSeconds);
  // warm-up (first half) lets belts fill; we measure rates on the second half
  const warm = sample / 2;
  let t = 0;
  for (; t < warm; t += dt) tick(state, dt);

  const moneyMid = state.money;
  const soldMid = { ...state.stats.sold };
  const whMid = new Map(state.buildings.filter((b) => b.type === 'warehouse').map((b) => [b.id, { ...b.input }]));
  const producedMid = { ...state.stats.produced };
  for (; t < sample; t += dt) tick(state, dt);

  const remaining = seconds - sample;
  if (remaining > 0) {
    const window = sample - warm;
    const scale = remaining / window;
    const dMoney = state.money - moneyMid;
    state.money += dMoney * scale;
    state.stats.totalEarned += dMoney * scale;
    for (const k of Object.keys(state.stats.sold) as ItemId[]) {
      const d = (state.stats.sold[k] ?? 0) - (soldMid[k] ?? 0);
      if (d > 0) state.stats.sold[k] = (state.stats.sold[k] ?? 0) + Math.floor(d * scale);
    }
    for (const k of Object.keys(state.stats.produced) as ItemId[]) {
      const d = (state.stats.produced[k] ?? 0) - (producedMid[k] ?? 0);
      if (d > 0) state.stats.produced[k] = (state.stats.produced[k] ?? 0) + Math.floor(d * scale);
    }
    // warehouses fill up at their measured rate, but never beyond capacity
    for (const b of state.buildings) {
      if (b.type !== 'warehouse') continue;
      const before = whMid.get(b.id) ?? {};
      const cap = warehouseCapacity(b.level);
      for (const k of Object.keys(b.input) as ItemId[]) {
        const d = (b.input[k] ?? 0) - (before[k] ?? 0);
        if (d <= 0) continue;
        const room = cap - invTotal(b.input);
        if (room <= 0) break;
        b.input[k] = (b.input[k] ?? 0) + Math.min(room, Math.floor(d * scale));
      }
    }
    state.time += remaining;
  }

  const sold: Inventory = {};
  for (const k of Object.keys(state.stats.sold) as ItemId[]) {
    const d = (state.stats.sold[k] ?? 0) - (soldBefore[k] ?? 0);
    if (d > 0) sold[k] = d;
  }
  return {
    seconds,
    awaySeconds,
    earned: state.money - moneyBefore,
    sold,
    capped: awaySeconds > cap,
  };
}

import { ITEMS, type ItemId } from '../config/balance';
import { CONTRACTS } from '../config/meta';
import { incomePerMinute } from './economy';
import { rand } from './state';
import type { Contract, GameState } from './types';

/**
 * Contracts: customers order N units of one product within a time limit and pay a
 * premium on completion. Any sale of that product (HQ, depot or shipped) counts.
 */

const between = (s: GameState, [a, b]: [number, number]) => a + (b - a) * rand(s);

function candidates(s: GameState): ItemId[] {
  const made = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.stats.produced[i] ?? 0) > 0);
  return made.length ? made : ['iron_ore'];
}

export function makeOffer(s: GameState): Contract {
  const items = candidates(s);
  // favour higher-tier goods the player can already make
  items.sort((a, b) => ITEMS[b].tier - ITEMS[a].tier);
  const pickFrom = items.slice(0, Math.max(2, Math.ceil(items.length / 2)));
  const item = pickFrom[Math.floor(rand(s) * pickFrom.length)];
  const value = Math.max(CONTRACTS.minValue, incomePerMinute(s) * between(s, CONTRACTS.valueMinutes));
  const qty = Math.max(10, Math.ceil(value / ITEMS[item].price / 5) * 5);
  return {
    id: s.nextId++,
    item,
    qty,
    progress: 0,
    reward: Math.round(qty * ITEMS[item].price * between(s, CONTRACTS.rewardMult)),
    duration: Math.round(between(s, CONTRACTS.durationMinutes)) * 60,
    expiresAt: 0,
  };
}

export function refreshOffers(s: GameState) {
  s.contracts.offers = Array.from({ length: CONTRACTS.offers }, () => makeOffer(s));
  s.contracts.refreshAt = s.time + CONTRACTS.refreshSeconds;
}

export function rerollCost(s: GameState): number {
  return Math.max(200, Math.round(s.money * CONTRACTS.rerollCost));
}

export function acceptContract(s: GameState, id: number): string | null {
  if (s.contracts.active.length >= CONTRACTS.maxActive) return 'err.maxContracts';
  const i = s.contracts.offers.findIndex((c) => c.id === id);
  if (i < 0) return 'err.notFound';
  const [c] = s.contracts.offers.splice(i, 1);
  c.expiresAt = s.time + c.duration;
  s.contracts.active.push(c);
  return null;
}

export function abandonContract(s: GameState, id: number) {
  s.contracts.active = s.contracts.active.filter((c) => c.id !== id);
}

export function rerollOffers(s: GameState): string | null {
  const cost = rerollCost(s);
  if (s.money < cost) return 'err.noMoney';
  s.money -= cost;
  refreshOffers(s);
  return null;
}

export function onSoldForContracts(s: GameState, item: ItemId, n: number) {
  for (const c of s.contracts.active) if (c.item === item) c.progress = Math.min(c.qty, c.progress + n);
}

export interface ContractResult {
  completed: Contract[];
  expired: Contract[];
}

export function tickContracts(s: GameState): ContractResult {
  const completed: Contract[] = [];
  const expired: Contract[] = [];
  s.contracts.active = s.contracts.active.filter((c) => {
    if (c.progress >= c.qty) {
      s.money += c.reward;
      s.stats.contracts++;
      completed.push(c);
      return false;
    }
    if (s.time >= c.expiresAt) {
      expired.push(c);
      return false;
    }
    return true;
  });
  if (s.time >= s.contracts.refreshAt || s.contracts.offers.length === 0) refreshOffers(s);
  return { completed, expired };
}

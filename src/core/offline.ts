import { BALANCE, storageCapacity, type ItemId } from '../config/balance';
import { offlineCapHours } from './economy';
import { invTotal } from './state';
import { tick, tickMacro } from './sim';
import type { Building, GameState, Inventory } from './types';

export interface OfflineReport {
  seconds: number; // absence credited (after the cap)
  awaySeconds: number; // real absence
  earned: number;
  sold: Inventory;
  capped: boolean;
  researchDone: string[];
}

/**
 * Credits the factory for time the game was closed.
 *
 * 1. Simulate a sample window tick by tick so belts fill and the factory reaches steady state.
 * 2. In the second half of the window, measure: income from instant (HQ/depot) sales,
 *    production, net growth of each warehouse, and the mix of goods arriving at docks.
 * 3. For the rest of the absence, run only the cheap "macro" layer (markets, vehicles,
 *    research, contracts) in coarse steps, adding instant income at the measured rate and
 *    feeding warehouses/docks at the measured rates (never past capacity).
 *
 * Exact simulation of 8+ hours would freeze the tab on bigger factories; this stays well
 * under a second while ships, research timers and price recovery still play out.
 */
export function applyOffline(state: GameState, awaySeconds: number, opts: { ignoreCap?: boolean } = {}): OfflineReport | null {
  if (!(awaySeconds > 0)) return null; // also catches clocks moved backwards (negative)
  const cap = opts.ignoreCap ? Infinity : offlineCapHours(state) * 3600;
  const seconds = Math.min(awaySeconds, cap);
  const dt = BALANCE.tickSeconds;

  const moneyBefore = state.money;
  const soldBefore = { ...state.stats.sold };
  const researchBefore = [...state.research.done];

  const sample = Math.min(seconds, BALANCE.offlineSampleSeconds);
  const warm = sample / 2;
  let t = 0;
  for (; t < warm; t += dt) tick(state, dt);

  const storages = state.buildings.filter((b) => b.type === 'warehouse' || b.type === 'dock');
  const midInput = new Map(storages.map((b) => [b.id, { ...b.input }]));
  const midRecv = new Map(storages.map((b) => [b.id, b.recv ?? 0]));
  const producedMid = { ...state.stats.produced };
  const localMid = state.stats.localEarned;
  const dockMix = new Map<number, Inventory>(); // what arrived at each dock, by item
  for (const d of storages) if (d.type === 'dock') dockMix.set(d.id, {});

  for (; t < sample; t += dt) {
    const snap = new Map<number, Inventory>();
    for (const d of storages) if (d.type === 'dock') snap.set(d.id, { ...d.input });
    tick(state, dt);
    // items that grew in a dock this tick arrived by belt (vehicles only remove)
    for (const d of storages) {
      if (d.type !== 'dock') continue;
      const before = snap.get(d.id) ?? {};
      const mix = dockMix.get(d.id)!;
      for (const k of Object.keys(d.input) as ItemId[]) {
        const g = (d.input[k] ?? 0) - (before[k] ?? 0);
        if (g > 0) mix[k] = (mix[k] ?? 0) + g;
      }
    }
  }

  const remaining = seconds - sample;
  if (remaining > 0) {
    const window = sample - warm;
    const localRate = Math.max(0, state.stats.localEarned - localMid) / window;
    const rates = new Map<number, Inventory>();
    for (const b of storages) rates.set(b.id, storageRate(b, midInput.get(b.id) ?? {}, (b.recv ?? 0) - (midRecv.get(b.id) ?? 0), dockMix.get(b.id), window));

    const step = BALANCE.offlineMacroStep;
    let left = remaining;
    while (left > 0) {
      const h = Math.min(step, left);
      left -= h;
      state.time += h;
      const inc = localRate * h;
      state.money += inc;
      state.stats.totalEarned += inc;
      state.stats.localEarned += inc;
      state.prestige.lifetimeEarned += inc;
      for (const b of storages) {
        const rate = rates.get(b.id) ?? {};
        const capB = storageCapacity(b.type, b.level);
        for (const k of Object.keys(rate) as ItemId[]) {
          const room = capB - invTotal(b.input);
          if (room <= 0) break;
          b.input[k] = (b.input[k] ?? 0) + Math.min(room, (rate[k] ?? 0) * h);
        }
      }
      tickMacro(state, h);
    }
    const scale = remaining / window;
    for (const k of Object.keys(state.stats.produced) as ItemId[]) {
      const d = (state.stats.produced[k] ?? 0) - (producedMid[k] ?? 0);
      if (d > 0) state.stats.produced[k] = (state.stats.produced[k] ?? 0) + Math.floor(d * scale);
    }
    for (const b of storages) for (const k of Object.keys(b.input) as ItemId[]) b.input[k] = Math.floor(b.input[k] ?? 0);
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
    researchDone: state.research.done.filter((r) => !researchBefore.includes(r)),
  };
}

/**
 * Warehouses: net growth per second (they also feed the factory, whose income is
 * already in the local-sales rate). Docks: gross arrivals per second, split by the
 * item mix that arrived — vehicles drain docks during the macro phase.
 */
function storageRate(b: Building, mid: Inventory, received: number, mix: Inventory | undefined, window: number): Inventory {
  const rate: Inventory = {};
  if (b.type === 'dock') {
    const total = mix ? invTotal(mix) : 0;
    if (!mix || total <= 0) return rate;
    for (const k of Object.keys(mix) as ItemId[]) rate[k] = ((received * (mix[k] ?? 0)) / total) / window;
    return rate;
  }
  for (const k of Object.keys(b.input) as ItemId[]) {
    const d = (b.input[k] ?? 0) - (mid[k] ?? 0);
    if (d > 0) rate[k] = d / window;
  }
  return rate;
}

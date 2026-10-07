import { BALANCE, POWER, TERRAIN, VEINS } from '../config/balance';
import { RETIRED_PERK_COSTS } from '../config/meta';
import { SAVE_VERSION, addRareDeposits, freshMarkets, generateGrades, invalidateOccupancy } from './state';
import type { GameState } from './types';
import { buildWorld, legacyOffset } from './worldgen';

const KEY = 'ore-to-empire/save';

/**
 * Local save. Phase 4 adds a cloud-save adapter (Supabase) behind the same
 * load/save interface; guests keep using this one.
 */
export interface SaveStore {
  load(): GameState | null;
  save(state: GameState): void;
  clear(): void;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  try {
    const data = JSON.parse(json) as GameState;
    if (!data || typeof data !== 'object' || !Array.isArray(data.buildings)) return null;
    return migrate(data);
  } catch {
    return null;
  }
}

/** Upgrades older saves to the current shape. Add a step per version bump. */
export function migrate(data: GameState): GameState | null {
  if (!data.version || data.version > SAVE_VERSION) return null; // corrupt, or from a newer build
  const d = data as GameState & Record<string, unknown>;
  if (d.version < 2) {
    // Phase 1 → Phase 2/3/4: new systems start empty; sand & uranium appear on unbought land
    addRareDeposits(d.world.deposits, d.world.size, d.seed);
    d.maxSeenTime = d.lastSaved;
    d.power = { ...d.power, battery: 0, batteryMax: 0, gen: d.power?.gen ?? POWER.hq };
    d.stats = { ...d.stats, upgrades: 0, contracts: 0, research: 0, trips: 0, localEarned: d.stats.totalEarned ?? 0 };
    d.research = { done: [], active: null };
    d.markets = freshMarkets();
    d.events = [];
    d.nextEventAt = d.time + 300;
    d.trendTimer = 0;
    d.vehicles = [];
    d.rng = (d.seed ^ 0x9e3779b9) >>> 0;
    d.prestige = { count: 0, shares: 0, perks: {}, lifetimeEarned: d.stats.totalEarned ?? 0 };
    d.contracts = { offers: [], active: [], refreshAt: 0 };
    d.daily = { day: '', missions: [], bonusClaimed: false };
    d.gems = 0;
    d.boostUntil = 0;
    d.offlineBonusHours = 0;
    d.version = 2;
  }
  if (d.version < 3) {
    // ore grades + rich veins
    d.world.grade = generateGrades(d.world.deposits, d.world.size, d.seed);
    d.veins = [];
    d.veinTimer = VEINS.firstAfter;
    d.version = 3;
  }
  if (d.version < 4) {
    expandWorld(d);
    d.licences = [];
    // perks that only worked when selling the company: give their shares back
    let refund = 0;
    for (const id of Object.keys(RETIRED_PERK_COSTS)) {
      const lvl = d.prestige.perks[id] ?? 0;
      for (let i = 0; i < lvl; i++) refund += RETIRED_PERK_COSTS[id][i] ?? 0;
      delete d.prestige.perks[id];
    }
    d.prestige.shares += refund;
    d.version = 4;
  }
  return d;
}

/** v1.2: the 32×32 map becomes the middle of a 64×64 one; everything on it moves with it */
function expandWorld(d: GameState) {
  const L = BALANCE.legacySize;
  if (d.world.size !== L) {
    d.world.terrain ??= new Array(d.world.size * d.world.size).fill(TERRAIN.land);
    return;
  }
  const off = legacyOffset();
  const w = buildWorld(d.seed, { deposits: d.world.deposits, grade: d.world.grade });
  const P = BALANCE.plotSize;
  const oldN = L / P;
  const n = w.size / P;
  const shift = off / P;
  const plots = new Array(n * n).fill(false);
  for (let py = 0; py < oldN; py++) for (let px = 0; px < oldN; px++) if (d.world.plots[py * oldN + px]) plots[(py + shift) * n + px + shift] = true;
  d.world = { size: w.size, deposits: w.deposits, grade: w.grade, terrain: w.terrain, plots };
  for (const b of d.buildings) {
    b.x += off;
    b.y += off;
  }
  for (const belt of d.belts) {
    belt.path = belt.path.map(([x, y]) => [x + off, y + off] as [number, number]);
    belt.points = belt.points.map(([x, y]) => [x + off, y + off] as [number, number]);
  }
  for (const v of d.veins ?? []) {
    v.x += off;
    v.y += off;
  }
  invalidateOccupancy(d);
}

export const localSave: SaveStore = {
  load() {
    const s = storage();
    const raw = s?.getItem(KEY);
    return raw ? deserialize(raw) : null;
  },
  save(state) {
    try {
      storage()?.setItem(KEY, serialize(state));
    } catch {
      /* quota or private mode — the game keeps running in memory */
    }
  },
  clear() {
    storage()?.removeItem(KEY);
  },
};

import { BALANCE, BUILDINGS, CITY_ORDER, ITEMS, POWER, VEINS, type BuildingType, type DepositId, type ItemId } from '../config/balance';
import type { MarketState } from './types';
import type { Building, GameState } from './types';

export const SAVE_VERSION = 3;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function idx(state: GameState, x: number, y: number) {
  return y * state.world.size + x;
}

export function inBounds(state: GameState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < state.world.size && y < state.world.size;
}

export function isUnlocked(state: GameState, x: number, y: number) {
  if (!inBounds(state, x, y)) return false;
  const p = BALANCE.plotSize;
  const plotsPerRow = state.world.size / p;
  return state.world.plots[Math.floor(y / p) * plotsPerRow + Math.floor(x / p)];
}

export function hqPosition(size: number) {
  const c = size / 2 - 1;
  return { x: c, y: c };
}

function generateDeposits(size: number, seed: number): (DepositId | null)[] {
  const rand = mulberry32(seed);
  const deposits: (DepositId | null)[] = new Array(size * size).fill(null);
  const hq = hqPosition(size);
  const reserved = (x: number, y: number) => Math.abs(x + 0.5 - (hq.x + 1)) < 3 && Math.abs(y + 0.5 - (hq.y + 1)) < 3;

  const cluster = (type: DepositId, cx: number, cy: number, n: number) => {
    let x = cx;
    let y = cy;
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 400) {
      if (x >= 1 && y >= 1 && x < size - 1 && y < size - 1 && !reserved(x, y) && deposits[y * size + x] === null) {
        deposits[y * size + x] = type;
        placed++;
      }
      const d = Math.floor(rand() * 4);
      x += d === 0 ? 1 : d === 1 ? -1 : 0;
      y += d === 2 ? 1 : d === 3 ? -1 : 0;
      x = Math.max(1, Math.min(size - 2, x));
      y = Math.max(1, Math.min(size - 2, y));
      // drift back toward the centre so clusters stay compact
      if (rand() < 0.35) {
        x += Math.sign(cx - x);
        y += Math.sign(cy - y);
      }
    }
  };

  // Starting area (the four unlocked plots: tiles 8..23). Fixed sectors so every
  // seed gives a fair start: iron NW + SE, coal NE, copper SW.
  const s = BALANCE.plotSize;
  const jitter = () => Math.floor(rand() * 3) - 1;
  cluster('iron_ore', s + 3 + jitter(), s + 3 + jitter(), 7);
  cluster('coal', 3 * s - 4 + jitter(), s + 3 + jitter(), 6);
  cluster('copper_ore', s + 3 + jitter(), 3 * s - 4 + jitter(), 6);
  cluster('iron_ore', 3 * s - 4 + jitter(), 3 * s - 4 + jitter(), 5);

  // Outer ring (locked land, bought in Phase 2) gets richer, bigger clusters.
  const types: DepositId[] = ['iron_ore', 'copper_ore', 'coal'];
  for (let i = 0; i < 14; i++) {
    const t = types[i % 3];
    let x = 0;
    let y = 0;
    do {
      x = 2 + Math.floor(rand() * (size - 4));
      y = 2 + Math.floor(rand() * (size - 4));
    } while (x >= s - 1 && x <= 3 * s && y >= s - 1 && y <= 3 * s);
    cluster(t, x, y, 6 + Math.floor(rand() * 6));
  }
  addRareDeposits(deposits, size, seed);
  return deposits;
}

/**
 * Sand and uranium (Phase 2) only appear on land you have to buy. Uses its own RNG
 * stream so it can be added to Phase-1 worlds during save migration.
 */
export function addRareDeposits(deposits: (DepositId | null)[], size: number, seed: number) {
  const rand = mulberry32(seed ^ 0x5bd1e995);
  const p = BALANCE.plotSize;
  const plots = size / p;
  const edge: [number, number][] = [];
  const corner: [number, number][] = [];
  for (let py = 0; py < plots; py++)
    for (let px = 0; px < plots; px++) {
      const outer = px === 0 || py === 0 || px === plots - 1 || py === plots - 1;
      if (!outer) continue;
      const isCorner = (px === 0 || px === plots - 1) && (py === 0 || py === plots - 1);
      (isCorner ? corner : edge).push([px, py]);
    }
  const pick = <T,>(arr: T[]) => arr.splice(Math.floor(rand() * arr.length), 1)[0];
  const blob = (type: DepositId, px: number, py: number, n: number) => {
    let x = px * p + 2 + Math.floor(rand() * (p - 4));
    let y = py * p + 2 + Math.floor(rand() * (p - 4));
    const cx = x;
    const cy = y;
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 300) {
      const inPlot = x >= px * p && x < (px + 1) * p && y >= py * p && y < (py + 1) * p;
      if (inPlot && deposits[y * size + x] === null) {
        deposits[y * size + x] = type;
        placed++;
      }
      const d = Math.floor(rand() * 4);
      x += d === 0 ? 1 : d === 1 ? -1 : 0;
      y += d === 2 ? 1 : d === 3 ? -1 : 0;
      if (rand() < 0.35) {
        x += Math.sign(cx - x);
        y += Math.sign(cy - y);
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    const [px, py] = pick(edge);
    blob('sand', px, py, 6);
  }
  for (let i = 0; i < 2; i++) {
    const [px, py] = pick(corner);
    blob('uranium_ore', px, py, 5);
  }
}

/**
 * Ore grade per tile. Tiles deep inside a cluster tend to be rich, lone edge
 * tiles poor; land you have to buy leans richer. Own RNG stream, so it can be
 * generated for older saves too.
 */
export function generateGrades(deposits: (DepositId | null)[], size: number, seed: number): number[] {
  const rand = mulberry32(seed ^ 0x1b873593);
  const grade = new Array(size * size).fill(0);
  const start = BALANCE.plotSize; // the four starting plots span [start, 3*start)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = deposits[y * size + x];
      if (!d) continue;
      let same = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && deposits[ny * size + nx] === d) same++;
        }
      const outer = x < start || y < start || x >= 3 * start || y >= 3 * start;
      const score = same + (rand() - 0.5) * 3 + (outer ? 1.2 : 0);
      grade[y * size + x] = score >= 5 ? 2 : score <= 1.5 ? 0 : 1;
    }
  return grade;
}

export function freshMarkets(): Partial<Record<(typeof CITY_ORDER)[number], MarketState>> {
  const out: Partial<Record<(typeof CITY_ORDER)[number], MarketState>> = {};
  for (const c of CITY_ORDER) {
    const sat: Partial<Record<ItemId, number>> = {};
    const trend: Partial<Record<ItemId, number>> = {};
    for (const i of Object.keys(ITEMS) as ItemId[]) {
      sat[i] = 1;
      trend[i] = 1;
    }
    out[c] = { sat, trend };
  }
  return out;
}

export function todayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newGame(seed = Math.floor(Math.random() * 1e9), now = Date.now()): GameState {
  const size = BALANCE.worldSize;
  const plotsPerRow = size / BALANCE.plotSize;
  const plots = new Array(plotsPerRow * plotsPerRow).fill(false);
  for (const [px, py] of BALANCE.startPlots) plots[py * plotsPerRow + px] = true;

  const deposits = generateDeposits(size, seed);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    money: BALANCE.startMoney,
    time: 0,
    lastSaved: now,
    maxSeenTime: now,
    world: { size, deposits, grade: generateGrades(deposits, size, seed), plots },
    veins: [],
    veinTimer: VEINS.firstAfter,
    buildings: [],
    belts: [],
    nextId: 1,
    beltLevel: 1,
    power: { gen: POWER.hq, demand: 0, satisfaction: 1, battery: 0, batteryMax: 0 },
    stats: {
      totalEarned: 0,
      sold: {},
      produced: {},
      incomeBuckets: new Array(60).fill(0),
      bucketTime: 0,
      upgrades: 0,
      contracts: 0,
      research: 0,
      trips: 0,
      localEarned: 0,
    },
    quests: { done: [], tutorialSkipped: false },
    settings: { lang: 'th', sound: true },
    research: { done: [], active: null },
    markets: freshMarkets(),
    events: [],
    nextEventAt: 300,
    trendTimer: 0,
    vehicles: [],
    rng: (seed ^ 0x9e3779b9) >>> 0,
    prestige: { count: 0, shares: 0, perks: {}, lifetimeEarned: 0 },
    contracts: { offers: [], active: [], refreshAt: 0 },
    daily: { day: '', missions: [], bonusClaimed: false },
    gems: 0,
    boostUntil: 0,
    offlineBonusHours: 0,
  };
  const hq = hqPosition(size);
  state.buildings.push(makeBuilding(state, 'hq', hq.x, hq.y));
  return state;
}

export function makeBuilding(state: GameState, type: BuildingType, x: number, y: number): Building {
  return {
    id: state.nextId++,
    type,
    x,
    y,
    level: 1,
    recipe: null,
    input: {},
    output: {},
    progress: 0,
    crafting: false,
    burn: 0,
    status: 'idle',
    rr: 0,
    placedAt: state.time,
  };
}

// ---------------------------------------------------------------------------
// Occupancy cache: which building / how many belts sit on each cell.
// ---------------------------------------------------------------------------

interface Occupancy {
  key: string;
  building: Int32Array; // building id or 0
  belts: Uint8Array; // number of belts crossing the cell
}

const occCache = new WeakMap<GameState, Occupancy>();

/** call after moving things without changing the building/belt count */
export function invalidateOccupancy(state: GameState) {
  occCache.delete(state);
}

export function occupancy(state: GameState): Occupancy {
  const key = `${state.nextId}:${state.buildings.length}:${state.belts.length}`;
  const cached = occCache.get(state);
  if (cached && cached.key === key) return cached;
  const n = state.world.size * state.world.size;
  const building = new Int32Array(n);
  const belts = new Uint8Array(n);
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) building[idx(state, b.x + dx, b.y + dy)] = b.id;
  }
  for (const belt of state.belts) for (const [x, y] of belt.path) belts[idx(state, x, y)]++;
  const occ = { key, building, belts };
  occCache.set(state, occ);
  return occ;
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  if (!inBounds(state, x, y)) return undefined;
  const id = occupancy(state).building[idx(state, x, y)];
  return id ? getBuilding(state, id) : undefined;
}

export function getBuilding(state: GameState, id: number): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function invTotal(inv: Record<string, number | undefined>): number {
  let t = 0;
  for (const k in inv) t += inv[k] ?? 0;
  return t;
}

/** Deterministic RNG stored in the save, so markets behave the same in tests and offline catch-up. */
export function rand(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function plotsPerRow(state: GameState) {
  return state.world.size / BALANCE.plotSize;
}

export function ownedPlots(state: GameState) {
  return state.world.plots.filter(Boolean).length;
}

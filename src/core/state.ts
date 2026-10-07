import { BALANCE, BUILDINGS, CITY_ORDER, ITEMS, POWER, VEINS, type BuildingType, type ItemId } from '../config/balance';
import { buildWorld, hqPosition } from './worldgen';
import type { MarketState } from './types';
import type { Building, GameState } from './types';

export const SAVE_VERSION = 4;

export { addRareDeposits, generateGrades, hqPosition, mulberry32 } from './worldgen';

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

  const { deposits, grade, terrain } = buildWorld(seed);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    money: BALANCE.startMoney,
    time: 0,
    lastSaved: now,
    maxSeenTime: now,
    world: { size, deposits, grade, terrain, plots },
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
    quests: { done: [], tutorialSkipped: false, introSeen: false },
    settings: { lang: 'th', sound: true },
    research: { done: [], active: null },
    markets: freshMarkets(),
    events: [],
    nextEventAt: 300,
    trendTimer: 0,
    vehicles: [],
    rng: (seed ^ 0x9e3779b9) >>> 0,
    licences: [],
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

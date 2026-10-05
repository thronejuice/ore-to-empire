import { BALANCE, BUILDINGS, type BuildingType, type DepositId } from '../config/balance';
import type { Building, GameState } from './types';

export const SAVE_VERSION = 1;

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
  return deposits;
}

export function newGame(seed = Math.floor(Math.random() * 1e9), now = Date.now()): GameState {
  const size = BALANCE.worldSize;
  const plotsPerRow = size / BALANCE.plotSize;
  const plots = new Array(plotsPerRow * plotsPerRow).fill(false);
  for (const [px, py] of BALANCE.startPlots) plots[py * plotsPerRow + px] = true;

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    money: BALANCE.startMoney,
    time: 0,
    lastSaved: now,
    world: { size, deposits: generateDeposits(size, seed), plots },
    buildings: [],
    belts: [],
    nextId: 1,
    beltLevel: 1,
    power: { gen: BALANCE.hqPower, demand: 0, satisfaction: 1 },
    stats: { totalEarned: 0, sold: {}, produced: {}, incomeBuckets: new Array(60).fill(0), bucketTime: 0 },
    quests: { done: [], tutorialSkipped: false },
    settings: { lang: 'th', sound: true },
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

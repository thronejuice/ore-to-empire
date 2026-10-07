import { BALANCE, TERRAIN, ZONE_MAP, type DepositId, type ZoneId } from '../config/balance';

/**
 * Map generation. The pre-v1.2 32×32 map is generated exactly as before and
 * placed in the middle of the 64×64 map as the home zone; the terrain zones
 * around it use their own RNG streams. So a v1.1 save expanded during migration
 * gets the same world a new v1.2 game with that seed would.
 */

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

export function hqPosition(size: number) {
  const c = size / 2 - 1;
  return { x: c, y: c };
}

const ZONE_CODES: Record<string, ZoneId> = { H: 'home', F: 'forest', R: 'river', S: 'sea', D: 'desert', V: 'volcano' };

export function zoneOfPlot(px: number, py: number): ZoneId {
  return ZONE_CODES[ZONE_MAP[py]?.[px] ?? 'H'] ?? 'home';
}

export function zoneOfTile(x: number, y: number): ZoneId {
  return zoneOfPlot(Math.floor(x / BALANCE.plotSize), Math.floor(y / BALANCE.plotSize));
}

// ---------------------------------------------------------------------------
// The home zone (the original map)
// ---------------------------------------------------------------------------

export function generateDeposits(size: number, seed: number): (DepositId | null)[] {
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
      const same = sameNeighbours(deposits, size, x, y, d);
      const outer = x < start || y < start || x >= 3 * start || y >= 3 * start;
      const score = same + (rand() - 0.5) * 3 + (outer ? 1.2 : 0);
      grade[y * size + x] = score >= 5 ? 2 : score <= 1.5 ? 0 : 1;
    }
  return grade;
}

function sameNeighbours(deposits: (DepositId | null)[], size: number, x: number, y: number, d: DepositId): number {
  let same = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && deposits[ny * size + nx] === d) same++;
    }
  return same;
}

// ---------------------------------------------------------------------------
// The terrain zones around it
// ---------------------------------------------------------------------------

export interface WorldTiles {
  size: number;
  deposits: (DepositId | null)[];
  grade: number[];
  terrain: number[];
}

/** Fills every tile outside the home zone: water, then resources, then their grades. */
export function generateZones(w: WorldTiles, seed: number) {
  const { size, deposits, terrain } = w;
  const P = BALANCE.plotSize;
  const rand = mulberry32(seed ^ 0x2545f491);
  const at = (x: number, y: number) => y * size + x;
  const zone = (x: number, y: number) => zoneOfTile(x, y);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const step = () => {
    const r = rand();
    return r < 0.3 ? -1 : r > 0.7 ? 1 : 0;
  };

  // sea: a ragged coastline along the bottom, reaching higher in the two bottom corners
  let coastMid = 57;
  let coastSide = 50;
  for (let x = 0; x < size; x++) {
    const side = x < P || x >= size - P;
    if (side) coastSide = clamp(coastSide + step(), 49, 51);
    else coastMid = clamp(coastMid + step(), 56, 58);
    for (let y = side ? coastSide : coastMid; y < size; y++) if (zone(x, y) === 'sea') terrain[at(x, y)] = TERRAIN.sea;
  }

  // river: a two-tile band winding west → east under the home block, into the sea at both ends
  let cy = 51;
  for (let x = P; x < size - P; x++) {
    const prev = cy;
    if (rand() < 0.35) cy = clamp(cy + (rand() < 0.5 ? -1 : 1), 50, 53);
    for (let y = Math.min(prev, cy); y <= Math.max(prev, cy) + 1; y++) terrain[at(x, y)] = TERRAIN.river;
  }

  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && zone(x, y) !== 'home' && terrain[at(x, y)] === TERRAIN.land && !deposits[at(x, y)];

  const tilesOf = (z: ZoneId) => {
    const out: [number, number][] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (zone(x, y) === z && terrain[at(x, y)] === TERRAIN.land) out.push([x, y]);
    return out;
  };

  const blob = (type: DepositId, z: ZoneId, pool: [number, number][], n: number) => {
    let start: [number, number] | null = null;
    for (let tries = 0; tries < 40 && !start; tries++) {
      const c = pool[Math.floor(rand() * pool.length)];
      if (c && free(c[0], c[1])) start = c;
    }
    if (!start) return;
    let [x, y] = start;
    const [cx, cy0] = start;
    let placed = 0;
    for (let guard = 0; placed < n && guard < 200; guard++) {
      if (free(x, y) && zone(x, y) === z) {
        deposits[at(x, y)] = type;
        placed++;
      }
      const d = Math.floor(rand() * 4);
      x += d === 0 ? 1 : d === 1 ? -1 : 0;
      y += d === 2 ? 1 : d === 3 ? -1 : 0;
      if (rand() < 0.35) {
        x += Math.sign(cx - x);
        y += Math.sign(cy0 - y);
      }
    }
  };
  const blobs = (type: DepositId, z: ZoneId, count: number, min: number, max: number) => {
    const pool = tilesOf(z);
    for (let i = 0; i < count; i++) blob(type, z, pool, min + Math.floor(rand() * (max - min + 1)));
  };

  // forest: groves of trees with flower meadows between them
  blobs('wood', 'forest', 30, 8, 14);
  blobs('flower', 'forest', 7, 5, 7);

  // river banks: clay right at the water's edge, plus a few clay beds
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (zone(x, y) !== 'river' || !free(x, y)) continue;
      const wet = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => terrain[at(clamp(x + dx, 0, size - 1), clamp(y + dy, 0, size - 1))] === TERRAIN.river);
      if (wet && rand() < 0.28) deposits[at(x, y)] = 'clay';
    }
  blobs('clay', 'river', 3, 4, 6);

  // desert: oil fields, gold, sand dunes
  blobs('crude_oil', 'desert', 8, 5, 7);
  blobs('gold_ore', 'desert', 6, 4, 5);
  blobs('sand', 'desert', 4, 5, 7);

  // volcano: sulfur, obsidian and hot vents for geothermal plants
  blobs('sulfur', 'volcano', 7, 5, 7);
  blobs('obsidian', 'volcano', 6, 4, 6);
  const volcano = tilesOf('volcano');
  for (let placed = 0, guard = 0; placed < 10 && guard < 400; guard++) {
    const [x, y] = volcano[Math.floor(rand() * volcano.length)];
    // a vent needs free ground around it so a 2×2 plant fits
    if (!free(x, y) || x >= size - 1 || y >= size - 1) continue;
    terrain[at(x, y)] = TERRAIN.vent;
    placed++;
  }

  gradeZones(w, seed);
}

/** grades for zone deposits (same rule as the home map, always counted as bought land) */
function gradeZones(w: WorldTiles, seed: number) {
  const rand = mulberry32(seed ^ 0x68e31da4);
  const { size, deposits, grade } = w;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = deposits[y * size + x];
      if (!d || zoneOfTile(x, y) === 'home') continue;
      const score = sameNeighbours(deposits, size, x, y, d) + (rand() - 0.5) * 3 + 1.2;
      grade[y * size + x] = score >= 5 ? 2 : score <= 1.5 ? 0 : 1;
    }
}

/** Offset of the legacy map inside the big one (tiles). */
export function legacyOffset(size = BALANCE.worldSize): number {
  return (size - BALANCE.legacySize) / 2;
}

/**
 * The full world for a seed: the legacy map (or an existing save's) in the middle,
 * the terrain zones around it.
 */
export function buildWorld(seed: number, legacy?: { deposits: (DepositId | null)[]; grade: number[] }): WorldTiles {
  const size = BALANCE.worldSize;
  const L = BALANCE.legacySize;
  const off = legacyOffset(size);
  const home = legacy ?? (() => {
    const deposits = generateDeposits(L, seed);
    return { deposits, grade: generateGrades(deposits, L, seed) };
  })();
  const w: WorldTiles = {
    size,
    deposits: new Array(size * size).fill(null),
    grade: new Array(size * size).fill(0),
    terrain: new Array(size * size).fill(TERRAIN.land),
  };
  for (let y = 0; y < L; y++)
    for (let x = 0; x < L; x++) {
      w.deposits[(y + off) * size + x + off] = home.deposits[y * L + x] ?? null;
      w.grade[(y + off) * size + x + off] = home.grade[y * L + x] ?? 0;
    }
  generateZones(w, seed);
  return w;
}

import { beltPoints, findPath, type PathCosts } from './pathfind';
import { getBuilding, idx, invalidateOccupancy } from './state';
import type { Belt, GameState } from './types';
import { beltCost } from './zones';

/**
 * "Tidy belts": rip up a set of belts and route them again together, looking for
 * the layout with the fewest crossings, then the fewest turns and tiles.
 * Buildings never move. Items riding the belts stay on them.
 */

export interface LayoutScore {
  crossings: number; // cells shared by 2+ belts
  tiles: number; // total belt length in cells
  turns: number;
}

export interface TidyPlan {
  ids: number[];
  routes: Map<number, { path: [number, number][]; points: [number, number][]; length: number }>;
  before: LayoutScore;
  after: LayoutScore;
  cost: number;
  /** layout fingerprint when planned; applying refuses if it changed */
  sig: string;
}

// heavier crossing/turn penalties than the one-at-a-time router, plus bundling
const TIDY_COSTS: PathCosts = { cross: 8, turn: 0.35, deposit: 3, hug: 0.15, water: 6 };
export const TIDY_ROUNDS = 4;
const TIDY_SHUFFLES = 8;

function turnsOf(path: [number, number][]): number {
  let t = 0;
  for (let i = 2; i < path.length; i++) {
    const dx1 = path[i - 1][0] - path[i - 2][0];
    const dy1 = path[i - 1][1] - path[i - 2][1];
    const dx2 = path[i][0] - path[i - 1][0];
    const dy2 = path[i][1] - path[i - 1][1];
    if (dx1 !== dx2 || dy1 !== dy2) t++;
  }
  return t;
}

export function scoreLayout(state: GameState, belts: Pick<Belt, 'path'>[] = state.belts): LayoutScore {
  const count = new Map<number, number>();
  let tiles = 0;
  let turns = 0;
  for (const b of belts) {
    tiles += Math.max(1, b.path.length);
    turns += turnsOf(b.path);
    for (const [x, y] of b.path) {
      const i = idx(state, x, y);
      count.set(i, (count.get(i) ?? 0) + 1);
    }
  }
  let crossings = 0;
  for (const c of count.values()) if (c > 1) crossings += c - 1;
  return { crossings, tiles, turns };
}

export function layoutSig(state: GameState): string {
  return (
    state.buildings.map((b) => `${b.id}:${b.x},${b.y}`).join('|') +
    '#' +
    state.belts.map((b) => `${b.id}:${b.from}>${b.to}:${b.path.length}`).join('|')
  );
}

const weight = (s: LayoutScore) => s.crossings * 100 + s.tiles + s.turns * 0.5;

/** Routes `order` one by one on top of `fixed`. Returns null if any belt has no route. */
function routeAll(state: GameState, fixed: Belt[], order: Belt[]) {
  const temp: GameState = { ...state, belts: [...fixed] }; // separate occupancy cache
  const out = new Map<number, [number, number][]>();
  for (const belt of order) {
    const from = getBuilding(state, belt.from);
    const to = getBuilding(state, belt.to);
    if (!from || !to) return null;
    const path = findPath(temp, from, to, TIDY_COSTS);
    if (!path) return null;
    out.set(belt.id, path);
    temp.belts = [...temp.belts, { ...belt, path }];
  }
  return { out, belts: temp.belts };
}

/**
 * Builds a tidier layout for the given belts (default: all). Tries several routing
 * orders, then improves the best one by re-routing each belt with the others fixed.
 * Pure: the state is not changed. Returns null if nothing would improve.
 */
export function planTidy(state: GameState, beltIds?: number[]): TidyPlan | null {
  const ids = beltIds ?? state.belts.map((b) => b.id);
  const target = state.belts.filter((b) => ids.includes(b.id));
  if (!target.length) return null;
  const fixed = state.belts.filter((b) => !ids.includes(b.id));
  const before = scoreLayout(state);

  const span = (b: Belt) => {
    const f = getBuilding(state, b.from)!;
    const t = getBuilding(state, b.to)!;
    return Math.abs(f.x - t.x) + Math.abs(f.y - t.y);
  };
  const orders: Belt[][] = [
    [...target].sort((a, b) => span(a) - span(b)), // short first
    [...target].sort((a, b) => span(b) - span(a)), // long first
    [...target].sort((a, b) => a.from - b.from || a.to - b.to), // grouped by source
    [...target].sort((a, b) => a.to - b.to || a.from - b.from), // grouped by destination
  ];
  // plus a few shuffled orders (seeded, so the same factory gives the same result)
  let seed = target.length * 2654435761;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < TIDY_SHUFFLES; k++) {
    const o = [...target];
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    orders.push(o);
  }

  let best: { paths: Map<number, [number, number][]>; score: LayoutScore } | null = null;
  for (const order of orders) {
    const r = routeAll(state, fixed, order);
    if (!r) continue;
    const score = scoreLayout(state, r.belts);
    if (!best || weight(score) < weight(best.score)) best = { paths: r.out, score };
  }
  if (!best) return null;

  // rip-up and re-route: each belt again with all the others in place
  for (let round = 0; round < TIDY_ROUNDS; round++) {
    let improved = false;
    for (const belt of target) {
      const others = [...fixed, ...target.filter((b) => b.id !== belt.id).map((b) => ({ ...b, path: best!.paths.get(b.id)! }))];
      const r = routeAll(state, others, [belt]);
      if (!r) continue;
      const score = scoreLayout(state, r.belts);
      if (weight(score) < weight(best.score) - 1e-9) {
        best.paths.set(belt.id, r.out.get(belt.id)!);
        best.score = score;
        improved = true;
      }
    }
    if (!improved) break;
  }

  if (weight(best.score) >= weight(before) - 1e-9) return null; // already as tidy as we can make it

  const routes: TidyPlan['routes'] = new Map();
  let oldCost = 0;
  let newCost = 0;
  for (const belt of target) {
    const path = best.paths.get(belt.id)!;
    const { points, length } = beltPoints(getBuilding(state, belt.from)!, getBuilding(state, belt.to)!, path);
    routes.set(belt.id, { path, points, length });
    oldCost += beltCost(state, belt.path);
    newCost += beltCost(state, path);
  }
  return {
    ids,
    routes,
    before,
    after: best.score,
    cost: Math.max(0, newCost - oldCost),
    sig: layoutSig(state),
  };
}

/** Applies a plan made by planTidy (checks it still fits the current belts). */
export function applyTidy(state: GameState, plan: TidyPlan): string | null {
  if (layoutSig(state) !== plan.sig) return 'err.layoutChanged';
  if (state.money < plan.cost) return 'err.noMoney';
  state.money -= plan.cost;
  state.belts = state.belts.map((b) => {
    const r = plan.routes.get(b.id);
    if (!r) return b;
    const scale = b.length > 0 ? r.length / b.length : 1;
    return { ...b, ...r, items: b.items.map((it) => ({ ...it, pos: Math.min(r.length, it.pos * scale) })) };
  });
  invalidateOccupancy(state);
  return null;
}

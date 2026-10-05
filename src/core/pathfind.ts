import { BUILDINGS } from '../config/balance';
import { idx, inBounds, isUnlocked, occupancy } from './state';
import type { Building, GameState } from './types';

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const CROSS_COST = 4; // crossing an existing belt is allowed (a bridge) but discouraged
const TURN_COST = 0.05; // prefer straight runs
const DEPOSIT_COST = 3; // keep ore deposits free for future drills

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    this.k.push(key);
    this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

function cellsOf(b: Building): [number, number][] {
  const def = BUILDINGS[b.type];
  const out: [number, number][] = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) out.push([b.x + dx, b.y + dy]);
  return out;
}

/**
 * Finds the cheapest belt route between two buildings. Returns the cells strictly
 * between them (may be empty when they touch), or null when no route exists.
 */
export function findPath(state: GameState, from: Building, to: Building): [number, number][] | null {
  const occ = occupancy(state);
  const size = state.world.size;
  const n = size * size;
  // node = cell * 4 + direction we arrived from
  const dist = new Float64Array(n * 4).fill(Infinity);
  const prev = new Int32Array(n * 4).fill(-1);
  const heap = new MinHeap();
  const srcCells = cellsOf(from);
  const isSrc = new Set(srcCells.map(([x, y]) => idx(state, x, y)));

  for (const [x, y] of srcCells) {
    for (let d = 0; d < 4; d++) {
      const node = idx(state, x, y) * 4 + d;
      dist[node] = 0;
      heap.push(0, node);
    }
  }

  while (heap.size) {
    const node = heap.pop();
    const cell = node >> 2;
    const dir = node & 3;
    const cx = cell % size;
    const cy = (cell - cx) / size;
    const base = dist[node];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (!inBounds(state, nx, ny)) continue;
      const ncell = idx(state, nx, ny);
      if (isSrc.has(ncell)) continue;
      const bid = occ.building[ncell];
      if (bid === to.id) {
        // reached the destination: rebuild the path back to the source
        const path: [number, number][] = [];
        let cur = node;
        while (cur !== -1 && !isSrc.has(cur >> 2)) {
          const c = cur >> 2;
          path.push([c % size, Math.floor(c / size)]);
          cur = prev[cur];
        }
        return path.reverse();
      }
      if (bid !== 0) continue;
      if (!isUnlocked(state, nx, ny)) continue;
      const step =
        1 +
        (occ.belts[ncell] > 0 ? CROSS_COST : 0) +
        (state.world.deposits[ncell] ? DEPOSIT_COST : 0) + (isSrc.has(cell) || d === dir ? 0 : TURN_COST);
      const nnode = ncell * 4 + d;
      if (base + step < dist[nnode]) {
        dist[nnode] = base + step;
        prev[nnode] = node;
        heap.push(base + step, nnode);
      }
    }
  }
  return null;
}

function nearestCell(b: Building, x: number, y: number): [number, number] {
  let best: [number, number] = [b.x, b.y];
  let bd = Infinity;
  for (const [cx, cy] of cellsOf(b)) {
    const d = Math.abs(cx - x) + Math.abs(cy - y);
    if (d < bd) {
      bd = d;
      best = [cx, cy];
    }
  }
  return best;
}

/** Polyline in tile units: source edge → path cell centres → destination edge. */
export function beltPoints(from: Building, to: Building, path: [number, number][]): { points: [number, number][]; length: number } {
  const points: [number, number][] = [];
  const c = (x: number, y: number): [number, number] => [x + 0.5, y + 0.5];
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  if (path.length === 0) {
    // touching buildings: a short stub across the shared edge
    let bestA: [number, number] = [from.x, from.y];
    let bestB: [number, number] = [to.x, to.y];
    outer: for (const a of cellsOf(from)) {
      for (const b of cellsOf(to)) {
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1) {
          bestA = a;
          bestB = b;
          break outer;
        }
      }
    }
    const ca = c(...bestA);
    const cb = c(...bestB);
    const m = mid(ca, cb);
    const p0 = mid(ca, m);
    const p1 = mid(m, cb);
    points.push(p0, p1);
  } else {
    const first = path[0];
    const last = path[path.length - 1];
    points.push(mid(c(...nearestCell(from, first[0], first[1])), c(...first)));
    for (const [x, y] of path) points.push(c(x, y));
    points.push(mid(c(...last), c(...nearestCell(to, last[0], last[1]))));
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { points, length };
}

/** Position along a polyline at distance s. */
export function pointAt(points: [number, number][], s: number): [number, number] {
  let rem = s;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (rem <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, rem / seg);
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    rem -= seg;
  }
  return points[points.length - 1];
}

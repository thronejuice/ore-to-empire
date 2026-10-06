import { GRADE_MULT, VEINS, type DepositId } from '../config/balance';
import { hasResearch } from './economy';
import { metaUnlocked } from './quests';
import { buildingAt, isUnlocked, rand } from './state';
import type { GameState, Vein } from './types';

/**
 * Ore grades (permanent, per tile) and rich veins (temporary bonus deposits).
 *
 * Rich veins only run while the game is open: offline catch-up switches them off
 * (see `veinsEnabled`), so a vein never empties or vanishes while the player is
 * away, and the extrapolated offline income never includes vein bonuses.
 */

export const veinsEnabled = { on: true };

export type VeinEvent =
  | { type: 'vein_spawn'; vein: Vein }
  | { type: 'vein_low'; vein: Vein }
  | { type: 'vein_depleted'; vein: Vein }
  | { type: 'vein_expired'; vein: Vein };

export function gradeAt(s: GameState, x: number, y: number): number {
  return s.world.grade?.[y * s.world.size + x] ?? 1;
}

export function veinAt(s: GameState, x: number, y: number): Vein | undefined {
  return s.veins.find((v) => v.x === x && v.y === y);
}

/** speed multiplier for a drill standing on x,y */
export function tileMult(s: GameState, x: number, y: number): number {
  const g = GRADE_MULT[gradeAt(s, x, y)] ?? 1;
  return veinsEnabled.on && veinAt(s, x, y) ? g * VEINS.mult : g;
}

/** a drill on x,y produced one ore: draw it from the vein, if any */
export function mineFromVein(s: GameState, x: number, y: number, events?: VeinEvent[]) {
  if (!veinsEnabled.on) return;
  const v = veinAt(s, x, y);
  if (!v) return;
  v.amount -= 1;
  if (!v.warned && v.amount <= v.total * VEINS.lowFraction) {
    v.warned = true;
    events?.push({ type: 'vein_low', vein: v });
  }
  if (v.amount <= 0) {
    s.veins = s.veins.filter((x2) => x2 !== v);
    events?.push({ type: 'vein_depleted', vein: v });
  }
}

function spawnSpot(s: GameState): [number, number, DepositId] | null {
  const spots: [number, number, DepositId][] = [];
  for (let y = 0; y < s.world.size; y++)
    for (let x = 0; x < s.world.size; x++) {
      const d = s.world.deposits[y * s.world.size + x];
      if (!d || !isUnlocked(s, x, y) || buildingAt(s, x, y) || veinAt(s, x, y)) continue;
      if (d === 'uranium_ore' && !hasResearch(s, 'r_nuclear')) continue;
      spots.push([x, y, d]);
    }
  if (!spots.length) return null;
  // favour ores the player already uses
  const used = spots.filter(([, , d]) => (s.stats.produced[d] ?? 0) > 0);
  const pool = used.length && rand(s) < 0.75 ? used : spots;
  return pool[Math.floor(rand(s) * pool.length)];
}

export function tickVeins(s: GameState, dt: number, events?: VeinEvent[]) {
  if (!veinsEnabled.on || !metaUnlocked(s)) return;
  // unclaimed veins fade away
  for (const v of [...s.veins]) {
    const b = buildingAt(s, v.x, v.y);
    if (b?.type === 'miner') continue;
    v.ttl -= dt;
    if (v.ttl <= 0) {
      s.veins = s.veins.filter((x) => x !== v);
      events?.push({ type: 'vein_expired', vein: v });
    }
  }
  // countdown to the next vein; it waits at zero while all slots are taken
  s.veinTimer = Math.max(0, s.veinTimer - dt);
  if (s.veinTimer > 0 || s.veins.length >= VEINS.maxActive) return;
  const spot = spawnSpot(s);
  const [a, b] = VEINS.interval;
  s.veinTimer = a + (b - a) * rand(s);
  if (!spot) return;
  const [x, y, type] = spot;
  const total = VEINS.amount[type];
  const v: Vein = { id: s.nextId++, x, y, type, amount: total, total, ttl: VEINS.unclaimedTtl, warned: false };
  s.veins.push(v);
  events?.push({ type: 'vein_spawn', vein: v });
}

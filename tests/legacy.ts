import { BALANCE } from '../src/config/balance';
import type { GameState } from '../src/core/types';
import { legacyOffset } from '../src/core/worldgen';

/**
 * Turns a current game into what a pre-v1.2 save of it looked like: the 32×32
 * home map only, coordinates relative to it, no terrain or licences.
 */
export function legacySave(s: GameState, version = 3): Record<string, unknown> {
  const L = BALANCE.legacySize;
  const off = legacyOffset();
  const size = s.world.size;
  const crop = <T,>(a: T[]) => {
    const out: T[] = [];
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) out.push(a[(y + off) * size + x + off]);
    return out;
  };
  const P = BALANCE.plotSize;
  const n = size / P;
  const plots: boolean[] = [];
  for (let py = 0; py < L / P; py++) for (let px = 0; px < L / P; px++) plots.push(s.world.plots[(py + off / P) * n + px + off / P]);
  const old = JSON.parse(JSON.stringify(s)) as GameState & Record<string, unknown>;
  old.world = { size: L, deposits: crop(s.world.deposits), grade: crop(s.world.grade), plots } as GameState['world'];
  for (const b of old.buildings) {
    b.x -= off;
    b.y -= off;
  }
  for (const belt of old.belts) {
    belt.path = belt.path.map(([x, y]) => [x - off, y - off]);
    belt.points = belt.points.map(([x, y]) => [x - off, y - off]);
  }
  for (const v of old.veins) {
    v.x -= off;
    v.y -= off;
  }
  delete (old as Record<string, unknown>).licences;
  old.version = version;
  return old;
}

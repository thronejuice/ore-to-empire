import { describe, expect, it } from 'vitest';
import { BALANCE, GRADE_MULT, VEINS, type DepositId } from '../src/config/balance';
import { createLink, moveBuilding, placeBuilding } from '../src/core/actions';
import { applyOffline } from '../src/core/offline';
import { skipTutorial } from '../src/core/quests';
import { tick, type SimEvent } from '../src/core/sim';
import { idx, newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { gradeAt, tileMult, veinAt } from '../src/core/veins';
import { legacyOffset } from '../src/core/worldgen';

const O = legacyOffset(); // the original map sits in the middle of the big one


const run = (s: GameState, seconds: number, events?: SimEvent[]) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds, events);
};
const hqId = (s: GameState) => s.buildings.find((b) => b.type === 'hq')!.id;

function tiles(s: GameState, type: DepositId, grade?: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = O + 8; y < O + 24; y++)
    for (let x = O + 8; x < O + 24; x++) if (s.world.deposits[idx(s, x, y)] === type && (grade === undefined || gradeAt(s, x, y) === grade)) out.push([x, y]);
  return out;
}

describe('ore grades', () => {
  it('every deposit has a grade; empty ground has none; starts have a mix', () => {
    let highs = 0;
    let lows = 0;
    for (let seed = 1; seed < 30; seed++) {
      const s = newGame(seed);
      for (let i = 0; i < s.world.deposits.length; i++) {
        if (!s.world.deposits[i]) expect(s.world.grade[i]).toBe(0);
        else expect([0, 1, 2]).toContain(s.world.grade[i]);
      }
      highs += tiles(s, 'iron_ore', 2).length;
      lows += tiles(s, 'iron_ore', 0).length;
      expect(tiles(s, 'iron_ore', 1).length + tiles(s, 'iron_ore', 2).length).toBeGreaterThan(0); // a usable start
    }
    expect(highs).toBeGreaterThan(10);
    expect(lows).toBeGreaterThan(10);
  });

  it('a high-grade drill out-produces a low-grade one by 2.5×', () => {
    for (let seed = 1; seed < 50; seed++) {
      const s = newGame(seed);
      const hi = tiles(s, 'iron_ore', 2)[0];
      const lo = tiles(s, 'iron_ore', 0)[0];
      if (!hi || !lo) continue;
      s.money = 1000;
      for (const p of [hi, lo]) {
        const m = placeBuilding(s, 'miner', p[0], p[1]);
        if (!m.ok) throw new Error(m.reason);
      }
      run(s, 15);
      const [mh, ml] = s.buildings.filter((b) => b.type === 'miner');
      const total = (b: typeof mh) => (b.output.iron_ore ?? 0) + b.progress;
      expect(total(mh) / total(ml)).toBeCloseTo(GRADE_MULT[2] / GRADE_MULT[0], 0);
      return;
    }
    throw new Error('no seed with both grades');
  });
});

describe('rich veins', () => {
  function ready(seed = 3) {
    const s = newGame(seed);
    skipTutorial(s);
    s.stats.produced.iron_ore = 1;
    return s;
  }

  it('do not appear during the tutorial, then appear after the first delay', () => {
    const s = newGame(3);
    run(s, VEINS.firstAfter + 5);
    expect(s.veins.length).toBe(0);
    const t = ready();
    const ev: SimEvent[] = [];
    run(t, VEINS.firstAfter + 1, ev);
    expect(t.veins.length).toBe(1);
    expect(ev.some((e) => e.type === 'vein_spawn')).toBe(true);
    const v = t.veins[0];
    expect(t.world.deposits[idx(t, v.x, v.y)]).toBe(v.type);
  });

  it('a drill on a vein mines ×3, draws it down, warns when low and stops the bonus when empty', () => {
    const s = ready();
    run(s, VEINS.firstAfter + 1);
    const v = s.veins[0];
    v.amount = v.total = 40; // short vein for the test
    s.money = 1e5;
    const m = placeBuilding(s, 'miner', v.x, v.y);
    if (!m.ok) throw new Error(m.reason);
    createLink(s, m.value.id, hqId(s));
    expect(tileMult(s, v.x, v.y)).toBeCloseTo(GRADE_MULT[gradeAt(s, v.x, v.y)] * VEINS.mult, 5);
    const ev: SimEvent[] = [];
    run(s, 60, ev);
    expect(ev.some((e) => e.type === 'vein_low')).toBe(true);
    expect(ev.some((e) => e.type === 'vein_depleted')).toBe(true);
    expect(veinAt(s, v.x, v.y)).toBeUndefined();
    expect(tileMult(s, v.x, v.y)).toBe(GRADE_MULT[gradeAt(s, v.x, v.y)]); // back to a normal tile
    expect(s.world.deposits[idx(s, v.x, v.y)]).toBe(v.type); // the ore itself stays
  });

  it('an unclaimed vein fades away; a claimed one does not', () => {
    const s = ready();
    run(s, VEINS.firstAfter + 1);
    const ev: SimEvent[] = [];
    run(s, VEINS.unclaimedTtl + 1, ev);
    expect(ev.some((e) => e.type === 'vein_expired')).toBe(true);

    const t = ready(5);
    run(t, VEINS.firstAfter + 1);
    const v = t.veins[0];
    t.money = 1e5;
    placeBuilding(t, 'miner', v.x, v.y);
    run(t, VEINS.unclaimedTtl + 10);
    expect(t.veins.some((x) => x.id === v.id)).toBe(true); // still there (output full, not mined out)
  });

  it('never more than two at once', () => {
    const s = ready();
    run(s, VEINS.firstAfter + VEINS.interval[1] * 2);
    expect(s.veins.length).toBeLessThanOrEqual(VEINS.maxActive);
  });

  it('pause while offline: no drain, no expiry, no bonus in offline income', () => {
    const s = ready();
    run(s, VEINS.firstAfter + 1);
    const v = s.veins[0];
    s.money = 1e5;
    const m = placeBuilding(s, 'miner', v.x, v.y);
    if (!m.ok) throw new Error();
    createLink(s, m.value.id, hqId(s));
    run(s, 20);
    const amount = v.amount;
    const ttl = v.ttl;
    const money = s.money;
    const rep = applyOffline(s, 4 * 3600)!;
    expect(v.amount).toBe(amount);
    expect(v.ttl).toBe(ttl);
    expect(s.veins).toContain(v);
    // income at the tile's normal grade (~0.5 ore/s × grade × 4 h), not ×3
    const normal = 0.5 * GRADE_MULT[gradeAt(s, v.x, v.y)] * 4 * 3600;
    expect(rep.earned).toBeLessThan(normal * 1.4);
    expect(s.money - money).toBeCloseTo(rep.earned, 5);
  });

  it('moving a drill onto a vein works and gets the bonus', () => {
    const s = ready();
    run(s, VEINS.firstAfter + 1);
    const v = s.veins[0];
    s.money = 1e5;
    const other = tiles(s, v.type).find(([x, y]) => !veinAt(s, x, y))!;
    const m = placeBuilding(s, 'miner', other[0], other[1]);
    if (!m.ok) throw new Error();
    expect(moveBuilding(s, m.value.id, v.x, v.y).ok).toBe(true);
    run(s, 5);
    expect(v.amount).toBeLessThan(v.total);
  });
});

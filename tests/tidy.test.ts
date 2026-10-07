import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { createLink, moveBuilding, placeBuilding } from '../src/core/actions';
import { tick } from '../src/core/sim';
import { newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { applyTidy, planTidy, scoreLayout } from '../src/core/tidy';
import { legacyOffset } from '../src/core/worldgen';

const O = legacyOffset(); // the original map sits in the middle of the big one


const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
};

/**
 * Two rows of warehouses linked "crosswise" in a deliberately bad order, so the
 * one-at-a-time router produces crossings.
 */
function messy() {
  const s = newGame(11);
  s.money = 1e6;
  s.world.deposits = s.world.deposits.map(() => null); // clear ore so placement is free
  s.world.grade = s.world.grade.map(() => 0);
  const top = [10, 12, 14, 16].map((x) => placeBuilding(s, 'warehouse', O + x, O + 9));
  const bottom = [10, 12, 14, 16].map((x) => placeBuilding(s, 'warehouse', O + x, O + 21));
  const ids = (arr: typeof top) => arr.map((r) => (r.ok ? r.value.id : 0));
  const t = ids(top);
  const b = ids(bottom);
  // reversed pairing: left-top → right-bottom etc., created in an awkward order
  for (const [i, j] of [
    [0, 3],
    [3, 0],
    [1, 2],
    [2, 1],
    [0, 1],
    [3, 2],
  ])
    expect(createLink(s, t[i], b[j]).ok).toBe(true);
  // give belts something to carry
  for (const r of top) if (r.ok) r.value.input = { iron_bar: 40 };
  run(s, 10);
  return s;
}

describe('tidy belts', () => {
  it('finds a layout with fewer crossings and keeps every item', () => {
    const s = messy();
    const before = scoreLayout(s);
    expect(before.crossings).toBeGreaterThan(0);
    const items = s.belts.reduce((a, b) => a + b.items.length, 0);

    const plan = planTidy(s);
    expect(plan).not.toBeNull();
    expect(plan!.after.crossings).toBeLessThanOrEqual(before.crossings);
    expect(plan!.after.crossings * 100 + plan!.after.tiles).toBeLessThan(before.crossings * 100 + before.tiles);

    const money = s.money;
    expect(applyTidy(s, plan!)).toBeNull();
    expect(s.money).toBe(money - plan!.cost);
    expect(scoreLayout(s)).toEqual(plan!.after);
    expect(s.belts.reduce((a, b) => a + b.items.length, 0)).toBe(items);
    for (const b of s.belts) for (const it of b.items) expect(it.pos).toBeLessThanOrEqual(b.length);
  });

  it('the factory keeps delivering after tidying', () => {
    const s = messy();
    const plan = planTidy(s)!;
    applyTidy(s, plan);
    const got = () => s.buildings.filter((b) => b.y === O + 21).reduce((a, b) => a + (b.input.iron_bar ?? 0), 0);
    const g0 = got();
    run(s, 20);
    expect(got()).toBeGreaterThan(g0 + 10);
  });

  it('does not change the state while planning, and a second pass finds nothing better', () => {
    const s = messy();
    const snap = JSON.stringify(s.belts);
    const plan = planTidy(s)!;
    expect(JSON.stringify(s.belts)).toBe(snap);
    applyTidy(s, plan);
    const again = planTidy(s);
    if (again) expect(again.after.crossings).toBeLessThanOrEqual(plan.after.crossings);
  });

  it('refuses a stale plan after the layout changed', () => {
    const s = messy();
    const plan = planTidy(s)!;
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    expect(moveBuilding(s, w.id, w.x, w.y + 3).ok).toBe(true);
    expect(applyTidy(s, plan)).toBe('err.layoutChanged');
  });

  it('can tidy just one building\'s belts', () => {
    const s = messy();
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    const mine = s.belts.filter((b) => b.from === w.id || b.to === w.id).map((b) => b.id);
    const others = JSON.stringify(s.belts.filter((b) => !mine.includes(b.id)).map((b) => b.path));
    const plan = planTidy(s, mine);
    if (plan) applyTidy(s, plan);
    expect(JSON.stringify(s.belts.filter((b) => !mine.includes(b.id)).map((b) => b.path))).toBe(others);
  });

  it('returns null when there is nothing to improve', () => {
    const s = newGame(1);
    expect(planTidy(s)).toBeNull();
  });
});

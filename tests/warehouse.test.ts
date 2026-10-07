import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RESERVE_STEPS, beltCarries, createLink, placeBuilding, setBeltFilter, stepReserve } from '../src/core/actions';
import { backgroundAlerts, CONTRACT_WARN_SECONDS, unlocksOf } from '../src/core/alerts';
import { buyPerk } from '../src/core/prestige';
import { startResearch } from '../src/core/research';
import { deserialize, serialize } from '../src/core/save';
import { tick } from '../src/core/sim';
import { newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { legacyOffset } from '../src/core/worldgen';

const O = legacyOffset();
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
};

/** a warehouse full of iron bars and copper bars, with two outgoing belts to two warehouses */
function sorter() {
  const s = newGame(11);
  s.money = 1e6;
  s.world.deposits = s.world.deposits.map(() => null);
  const w = placeBuilding(s, 'warehouse', O + 12, O + 12);
  const a = placeBuilding(s, 'warehouse', O + 12, O + 8);
  const b = placeBuilding(s, 'warehouse', O + 12, O + 16);
  if (!w.ok || !a.ok || !b.ok) throw new Error('place');
  w.value.input = { iron_bar: 60, copper_bar: 60 };
  const la = createLink(s, w.value.id, a.value.id);
  const lb = createLink(s, w.value.id, b.value.id);
  if (!la.ok || !lb.ok) throw new Error('link');
  const beltTo = (id: number) => s.belts.find((x) => x.to === id)!;
  return { s, w: w.value, a: a.value, b: b.value, beltA: beltTo(a.value.id), beltB: beltTo(b.value.id) };
}

describe('warehouse sorting', () => {
  it('without filters, everything flows out as before', () => {
    const { s, a, b } = sorter();
    run(s, 30);
    const got = (i: 'iron_bar' | 'copper_bar') => (a.input[i] ?? 0) + (b.input[i] ?? 0);
    expect(got('iron_bar')).toBeGreaterThan(5);
    expect(got('copper_bar')).toBeGreaterThan(5);
  });

  it('a filtered belt carries only its item', () => {
    const { s, a, b, beltA, beltB } = sorter();
    expect(setBeltFilter(s, beltA.id, 'iron_bar').ok).toBe(true);
    expect(setBeltFilter(s, beltB.id, 'copper_bar').ok).toBe(true);
    expect(beltCarries(s, beltA)).toEqual(['iron_bar']);
    run(s, 30);
    expect(a.input.iron_bar ?? 0).toBeGreaterThan(5);
    expect(a.input.copper_bar ?? 0).toBe(0);
    expect(b.input.copper_bar ?? 0).toBeGreaterThan(5);
    expect(b.input.iron_bar ?? 0).toBe(0);
  });

  it('a filter can be cleared, and survives a save', () => {
    const { s, beltA } = sorter();
    setBeltFilter(s, beltA.id, 'iron_bar');
    expect(deserialize(serialize(s))!.belts.find((x) => x.id === beltA.id)!.filter).toBe('iron_bar');
    expect(setBeltFilter(s, beltA.id, null).ok).toBe(true);
    expect(beltA.filter).toBeUndefined();
  });

  it('only warehouse belts can be filtered, and only to items the target takes', () => {
    const s = newGame(2);
    s.money = 1e6;
    s.world.deposits = s.world.deposits.map(() => null);
    const f = placeBuilding(s, 'furnace', O + 12, O + 12);
    const w = placeBuilding(s, 'warehouse', O + 14, O + 12);
    if (!f.ok || !w.ok) throw new Error('place');
    createLink(s, f.value.id, w.value.id);
    createLink(s, w.value.id, f.value.id);
    const fromFurnace = s.belts.find((x) => x.from === f.value.id)!;
    const toFurnace = s.belts.find((x) => x.to === f.value.id)!;
    expect(setBeltFilter(s, fromFurnace.id, 'iron_bar')).toEqual({ ok: false, reason: 'err.notWarehouse' });
    expect(setBeltFilter(s, toFurnace.id, 'copper_bar')).toEqual({ ok: false, reason: 'err.cantCarry' }); // furnace makes iron bars from iron ore
    expect(setBeltFilter(s, toFurnace.id, 'iron_ore').ok).toBe(true);
  });
});

describe('warehouse reserve', () => {
  it('keeps the reserve and sends only the extra', () => {
    const { s, w, a, b } = sorter();
    w.input = { iron_bar: 60 };
    w.reserve = { iron_bar: 50 };
    run(s, 60);
    expect(w.input.iron_bar).toBe(50);
    expect((a.input.iron_bar ?? 0) + (b.input.iron_bar ?? 0) + s.belts.reduce((n, x) => n + x.items.length, 0)).toBe(10);
  });

  it('"keep all" holds everything back', () => {
    const { s, w } = sorter();
    w.input = { iron_bar: 60 };
    w.reserve = { iron_bar: -1 };
    run(s, 30);
    expect(w.input.iron_bar).toBe(60);
  });

  it('steps through the presets and back down to nothing', () => {
    const { s, w } = sorter();
    const seen: number[] = [];
    for (let i = 0; i < RESERVE_STEPS.length + 2; i++) seen.push(stepReserve(s, w.id, 'coal', 1).ok ? (w.reserve?.coal ?? 0) : NaN);
    expect(seen).toEqual([...RESERVE_STEPS.slice(1), -1, -1, -1]);
    for (let i = 0; i < RESERVE_STEPS.length + 2; i++) stepReserve(s, w.id, 'coal', -1);
    expect(w.reserve?.coal).toBeUndefined();
  });
});

describe('background alerts', () => {
  it('schedules the active research for when it finishes, faster with the R&D perk', () => {
    const s = newGame(1);
    s.money = 1e6;
    expect(backgroundAlerts(s)).toEqual([]);
    startResearch(s, 'r_trucks'); // 60 s
    expect(backgroundAlerts(s)).toEqual([{ delayMs: 60_000, tag: 'research', kind: 'research', research: 'r_trucks' }]);
    s.prestige.shares = 10;
    buyPerk(s, 'p_research_speed');
    expect(backgroundAlerts(s)[0].delayMs).toBeCloseTo(60_000 / 1.1, 3);
  });

  it('warns about unfinished contracts 5 minutes before they run out', () => {
    const s = newGame(1);
    s.contracts.active = [
      { id: 1, item: 'iron_bar', qty: 50, progress: 20, reward: 900, duration: 1800, expiresAt: s.time + 1200 },
      { id: 2, item: 'wire', qty: 30, progress: 30, reward: 500, duration: 1800, expiresAt: s.time + 1200 }, // already done
      { id: 3, item: 'gear', qty: 10, progress: 0, reward: 200, duration: 1800, expiresAt: s.time + 120 }, // too late to warn
    ];
    expect(backgroundAlerts(s)).toEqual([{ delayMs: (1200 - CONTRACT_WARN_SECONDS) * 1000, tag: 'contract-1', kind: 'contract', item: 'iron_bar', left: 30 }]);
  });

  it('lists what a research unlocks', () => {
    const u = unlocksOf('r_petroleum');
    expect(u).toContainEqual({ kind: 'building', id: 'oil_pump' });
    expect(u).toContainEqual({ kind: 'building', id: 'refinery' });
    expect(u).toContainEqual({ kind: 'item', id: 'plastic' });
    expect(u).toContainEqual({ kind: 'zone', id: 'desert' });
    expect(unlocksOf('r_trucks')).toContainEqual({ kind: 'city', id: 'bangkok' });
    expect(unlocksOf('r_automation_1')).toEqual([]); // an effect only
  });
});

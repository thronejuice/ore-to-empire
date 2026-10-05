import { describe, expect, it } from 'vitest';
import { BALANCE, type DepositId } from '../src/config/balance';
import { createLink, placeBuilding, removeBuilding, setRecipe, upgradeBuilding } from '../src/core/actions';
import { applyOffline } from '../src/core/offline';
import { checkQuests, currentQuest, skipTutorial } from '../src/core/quests';
import { deserialize, serialize } from '../src/core/save';
import { tick } from '../src/core/sim';
import { hqPosition, idx, newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';

function findDeposit(s: GameState, type: DepositId, avoid: Set<number> = new Set()): [number, number] {
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 24; x++) {
      const i = idx(s, x, y);
      if (s.world.deposits[i] === type && !avoid.has(i)) return [x, y];
    }
  throw new Error('no deposit ' + type);
}

function run(s: GameState, seconds: number) {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
}

const hqId = (s: GameState) => s.buildings.find((b) => b.type === 'hq')!.id;

describe('world', () => {
  it('generates every starting resource inside the unlocked area for many seeds', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = newGame(seed);
      for (const t of ['iron_ore', 'copper_ore', 'coal'] as DepositId[]) expect(() => findDeposit(s, t)).not.toThrow();
      const hq = hqPosition(s.world.size);
      expect(s.world.deposits[idx(s, hq.x, hq.y)]).toBeNull();
    }
  });
});

describe('production chain', () => {
  it('mines iron, ships it to the HQ and gets paid', () => {
    const s = newGame(42);
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    expect(m.ok).toBe(true);
    const link = createLink(s, m.ok ? m.value.id : 0, hqId(s));
    expect(link.ok).toBe(true);
    const before = s.money;
    run(s, 60);
    // 0.5 ore/s for ~60s minus belt travel time
    expect(s.stats.sold.iron_ore ?? 0).toBeGreaterThan(20);
    expect(s.money).toBeGreaterThan(before + 20);
  });

  it('miner → furnace → HQ produces iron bars', () => {
    const s = newGame(7);
    s.money = 5000;
    const [x1, y1] = findDeposit(s, 'iron_ore');
    const [x2, y2] = findDeposit(s, 'iron_ore', new Set([idx(s, x1, y1)]));
    const m1 = placeBuilding(s, 'miner', x1, y1);
    const m2 = placeBuilding(s, 'miner', x2, y2);
    const f = placeBuilding(s, 'furnace', 15, 12);
    if (!m1.ok || !m2.ok || !f.ok) throw new Error('place failed');
    expect(createLink(s, m1.value.id, f.value.id).ok).toBe(true);
    expect(createLink(s, m2.value.id, f.value.id).ok).toBe(true);
    expect(createLink(s, f.value.id, hqId(s)).ok).toBe(true);
    run(s, 120);
    expect(s.stats.sold.iron_bar ?? 0).toBeGreaterThan(20);
    expect(s.stats.sold.iron_ore ?? 0).toBe(0);
  });

  it('a belt never carries items the destination does not accept', () => {
    const s = newGame(3);
    s.money = 10000;
    const [x, y] = findDeposit(s, 'copper_ore');
    const m = placeBuilding(s, 'miner', x, y);
    const f = placeBuilding(s, 'furnace', 12, 12); // defaults to the iron bar recipe
    if (!m.ok || !f.ok) throw new Error();
    expect(createLink(s, m.value.id, f.value.id).ok).toBe(true);
    run(s, 20);
    expect(s.belts[0].items.length).toBe(0);
    setRecipe(s, f.value.id, 'copper_bar');
    run(s, 20);
    expect(f.value.output.copper_bar ?? 0).toBeGreaterThan(0);
  });

  it('power shortage slows machines; a coal plant restores full speed', () => {
    const s = newGame(11);
    s.money = 100000;
    // 8 miners × 1.5 MW = 12 MW > 6 MW from the HQ
    const used = new Set<number>();
    const miners = [];
    for (let i = 0; i < 8; i++) {
      let pos: [number, number];
      try {
        pos = findDeposit(s, i % 2 ? 'copper_ore' : 'iron_ore', used);
      } catch {
        pos = findDeposit(s, 'iron_ore', used);
      }
      used.add(idx(s, pos[0], pos[1]));
      const m = placeBuilding(s, 'miner', pos[0], pos[1]);
      if (m.ok) miners.push(m.value);
    }
    run(s, 2);
    expect(s.power.satisfaction).toBeLessThan(1);

    const [cx, cy] = findDeposit(s, 'coal', used);
    const cm = placeBuilding(s, 'miner', cx, cy);
    const plant = placeBuilding(s, 'coal_plant', 18, 12);
    if (!cm.ok || !plant.ok) throw new Error(JSON.stringify(plant));
    expect(createLink(s, cm.value.id, plant.value.id).ok).toBe(true);
    run(s, 30);
    expect(s.power.gen).toBeGreaterThan(6);
  });

  it('warehouse stores items and passes them on', () => {
    const s = newGame(5);
    s.money = 10000;
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    const w = placeBuilding(s, 'warehouse', 14, 11);
    if (!m.ok || !w.ok) throw new Error();
    createLink(s, m.value.id, w.value.id);
    run(s, 40);
    expect(w.value.input.iron_ore ?? 0).toBeGreaterThan(5);
    createLink(s, w.value.id, hqId(s));
    run(s, 40);
    expect(s.stats.sold.iron_ore ?? 0).toBeGreaterThan(5);
  });

  it('upgrades make a miner faster', () => {
    const a = newGame(9);
    const b = newGame(9);
    a.money = b.money = 100000;
    const [x, y] = findDeposit(a, 'iron_ore');
    const ma = placeBuilding(a, 'miner', x, y);
    const mb = placeBuilding(b, 'miner', x, y);
    if (!ma.ok || !mb.ok) throw new Error();
    createLink(a, ma.value.id, hqId(a));
    createLink(b, mb.value.id, hqId(b));
    for (let i = 0; i < 4; i++) upgradeBuilding(b, mb.value.id);
    run(a, 60);
    run(b, 60);
    expect(b.stats.sold.iron_ore ?? 0).toBeGreaterThan((a.stats.sold.iron_ore ?? 0) * 1.5);
  });

  it('removing a building also removes its belts and refunds', () => {
    const s = newGame(2);
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    if (!m.ok) throw new Error();
    createLink(s, m.value.id, hqId(s));
    const before = s.money;
    const r = removeBuilding(s, m.value.id);
    expect(r.ok).toBe(true);
    expect(s.belts.length).toBe(0);
    expect(s.money).toBeGreaterThan(before);
  });

  it('cannot place a miner off a deposit or on locked land', () => {
    const s = newGame(1);
    s.money = 1000;
    expect(placeBuilding(s, 'miner', 0, 0).ok).toBe(false);
    const hq = hqPosition(s.world.size);
    expect(placeBuilding(s, 'furnace', hq.x, hq.y).ok).toBe(false);
  });
});

describe('offline progress and saves', () => {
  it('extrapolates income for long absences and caps at the limit', () => {
    const s = newGame(42);
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    if (!m.ok) throw new Error();
    createLink(s, m.value.id, hqId(s));
    run(s, 30);
    const t0 = performance.now();
    const rep = applyOffline(s, 20 * 3600)!;
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(rep.capped).toBe(true);
    expect(rep.seconds).toBe(BALANCE.offlineCapHours * 3600);
    // 0.5 ore/s × $1 × 8h ≈ $14 400
    expect(rep.earned).toBeGreaterThan(12000);
    expect(rep.earned).toBeLessThan(15500);
  });

  it('ignores clocks moved backwards', () => {
    const s = newGame(1);
    expect(applyOffline(s, -500)).toBeNull();
  });

  it('round-trips through JSON', () => {
    const s = newGame(8);
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    if (!m.ok) throw new Error();
    createLink(s, m.value.id, hqId(s));
    run(s, 10);
    const copy = deserialize(serialize(s))!;
    expect(copy.belts.length).toBe(1);
    run(copy, 10);
    expect(copy.money).toBeGreaterThanOrEqual(s.money);
  });
});

describe('quests', () => {
  it('tutorial advances and pays rewards', () => {
    const s = newGame(42);
    expect(currentQuest(s)?.id).toBe('tut_miner');
    const [x, y] = findDeposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    if (!m.ok) throw new Error();
    expect(checkQuests(s)?.id).toBe('tut_miner');
    createLink(s, m.value.id, hqId(s));
    expect(checkQuests(s)?.id).toBe('tut_link_hq');
    run(s, 15);
    const money = s.money;
    expect(checkQuests(s)?.id).toBe('tut_first_sale');
    expect(s.money).toBe(money + 20);
  });

  it('skipping the tutorial jumps to the first regular quest', () => {
    const s = newGame(1);
    skipTutorial(s);
    expect(currentQuest(s)?.id).toBe('q_earn');
  });
});

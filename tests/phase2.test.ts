import { describe, expect, it } from 'vitest';
import { BALANCE, POWER, type DepositId, type ResearchId } from '../src/config/balance';
import { PRESTIGE } from '../src/config/meta';
import { createLink, placeBuilding, setRecipe } from '../src/core/actions';
import { acceptContract, tickContracts } from '../src/core/contracts';
import { claimBonus, claimMission, ensureDaily, missionDone } from '../src/core/daily';
import { buyVehicle, setRoute } from '../src/core/fleet';
import { applyGemItem } from '../src/core/gems';
import { buyPlot, nextPlotPrice, plotForSale } from '../src/core/land';
import { price, sell } from '../src/core/market';
import { applyOffline } from '../src/core/offline';
import { buyPerk, canPrestige, prestige, sharesFor } from '../src/core/prestige';
import { isBuildingUnlocked } from '../src/core/quests';
import { startResearch } from '../src/core/research';
import { deserialize } from '../src/core/save';
import { tick } from '../src/core/sim';
import { idx, newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';

const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
};
const hqId = (s: GameState) => s.buildings.find((b) => b.type === 'hq')!.id;
const research = (s: GameState, ...ids: ResearchId[]) => s.research.done.push(...ids);

function deposit(s: GameState, type: DepositId, owned = true, skip = 0): [number, number] {
  for (let y = 0; y < s.world.size; y++)
    for (let x = 0; x < s.world.size; x++) {
      if (s.world.deposits[idx(s, x, y)] !== type) continue;
      const p = s.world.plots[Math.floor(y / 8) * 4 + Math.floor(x / 8)];
      if (owned && !p) continue;
      if (skip-- > 0) continue;
      return [x, y];
    }
  throw new Error('no ' + type);
}

describe('research', () => {
  it('gates recipes and buildings, runs on a timer and costs money', () => {
    const s = newGame(1);
    s.money = 100000;
    expect(isBuildingUnlocked(s, 'dock')).toBe(false);
    expect(startResearch(s, 'r_gears')).toBe('err.needResearch'); // needs steel first
    expect(startResearch(s, 'r_trucks')).toBeNull();
    expect(startResearch(s, 'r_steel')).toBe('err.researchBusy');
    expect(s.money).toBe(100000 - 3000);
    run(s, 61);
    expect(s.research.done).toContain('r_trucks');
    expect(isBuildingUnlocked(s, 'dock')).toBe(true);

    const f = placeBuilding(s, 'furnace', 12, 12);
    if (!f.ok) throw new Error();
    expect(setRecipe(s, f.value.id, 'steel').ok).toBe(false);
    research(s, 'r_steel');
    expect(setRecipe(s, f.value.id, 'steel').ok).toBe(true);
  });
});

describe('markets', () => {
  it('dumping one product lowers its price, which recovers over time', () => {
    const s = newGame(1);
    const p0 = price(s, 'local', 'iron_bar');
    sell(s, 'local', 'iron_bar', 400);
    const p1 = price(s, 'local', 'iron_bar');
    expect(p1).toBeLessThan(p0 * 0.8);
    run(s, 120);
    expect(price(s, 'local', 'iron_bar')).toBeGreaterThan(p1);
  });

  it('cities pay more for advanced goods than the home town', () => {
    const s = newGame(1);
    expect(price(s, 'bangkok', 'circuit')).toBeGreaterThan(price(s, 'local', 'circuit') * 1.5);
  });
});

describe('logistics', () => {
  it('a truck loads at a dock, drives to Bangkok and sells', () => {
    const s = newGame(4);
    s.money = 100000;
    research(s, 'r_trucks');
    const d = placeBuilding(s, 'dock', 12, 12);
    if (!d.ok) throw new Error(d.reason);
    d.value.input = { iron_bar: 50 };
    expect(buyVehicle(s, 'truck')).toBeNull();
    const before = s.money;
    run(s, 25); // loads (full at 30) and leaves
    expect(s.vehicles[0].phase).toBe('out');
    run(s, 50);
    expect(s.stats.trips).toBe(1);
    expect(s.money).toBeGreaterThan(before + 30 * 5);
    expect(setRoute(s, s.vehicles[0].id, 'singapore', 'auto')).toBe('err.noRoute');
  });

  it('belts feed a dock', () => {
    const s = newGame(4);
    s.money = 100000;
    research(s, 'r_trucks');
    const [x, y] = deposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    const d = placeBuilding(s, 'dock', 15, 10);
    if (!m.ok || !d.ok) throw new Error();
    expect(createLink(s, m.value.id, d.value.id).ok).toBe(true);
    run(s, 30);
    expect(d.value.input.iron_ore ?? 0).toBeGreaterThan(5);
  });
});

describe('land', () => {
  it('only plots next to owned land are for sale, with rising prices', () => {
    const s = newGame(1);
    s.money = 1e6;
    expect(plotForSale(s, 0, 0)).toBe(false); // corner, not adjacent
    expect(plotForSale(s, 0, 1)).toBe(true);
    const p1 = nextPlotPrice(s);
    expect(buyPlot(s, 0, 1)).toBeNull();
    expect(nextPlotPrice(s)).toBeGreaterThan(p1);
    expect(plotForSale(s, 0, 0)).toBe(true);
  });

  it('sand needs bought land; uranium needs the nuclear research', () => {
    const s = newGame(2);
    s.money = 1e7;
    expect(() => deposit(s, 'sand', true)).toThrow();
    const [ux, uy] = deposit(s, 'uranium_ore', false);
    s.world.plots[Math.floor(uy / 8) * 4 + Math.floor(ux / 8)] = true;
    expect(placeBuilding(s, 'miner', ux, uy).ok).toBe(false);
    research(s, 'r_nuclear');
    expect(placeBuilding(s, 'miner', ux, uy).ok).toBe(true);
  });
});

describe('power', () => {
  it('batteries store surplus and cover a shortfall', () => {
    const s = newGame(3);
    s.money = 1e6;
    research(s, 'r_glass', 'r_solar', 'r_fabricator', 'r_gears', 'r_steel', 'r_battery');
    placeBuilding(s, 'solar', 12, 12);
    const bat = placeBuilding(s, 'battery', 13, 12);
    if (!bat.ok) throw new Error(bat.reason);
    run(s, 20); // no consumers: 8.5 MW surplus charges the battery
    expect(bat.value.charge ?? 0).toBeGreaterThan(100);
    expect(s.power.batteryMax).toBe(POWER.batteryCapacity);
  });

  it('a nuclear plant burns fuel rods for 250 MW', () => {
    const s = newGame(3);
    s.money = 1e6;
    research(s, 'r_nuclear');
    const n = placeBuilding(s, 'nuclear_plant', 9, 9);
    if (!n.ok) throw new Error(n.reason);
    n.value.input = { fuel_rod: 2 };
    run(s, 1);
    expect(s.power.gen).toBeGreaterThanOrEqual(POWER.nuclear);
  });
});

describe('fabricator', () => {
  it('builds motors from three different inputs', () => {
    const s = newGame(3);
    s.money = 1e6;
    research(s, 'r_steel', 'r_gears', 'r_glass', 'r_fabricator');
    const fab = placeBuilding(s, 'fabricator', 9, 9);
    if (!fab.ok) throw new Error(fab.reason);
    expect(fab.value.recipe).toBe('motor');
    fab.value.input = { machine_part: 4, gear: 2, wire: 6 };
    research(s, 'r_solar');
    for (let i = 0; i < 3; i++) placeBuilding(s, 'solar', 12 + i, 12); // 6 MW HQ + 7.5 MW ≥ 12 MW
    run(s, 13);
    expect(fab.value.output.motor ?? 0).toBe(2);
  });
});

describe('offline v2', () => {
  it('keeps trucks shipping and research ticking while away', () => {
    const s = newGame(4);
    s.money = 1e6;
    research(s, 'r_trucks');
    const [x, y] = deposit(s, 'iron_ore');
    const [x2, y2] = deposit(s, 'iron_ore', true, 1);
    const d = placeBuilding(s, 'dock', 15, 10);
    for (const [mx, my] of [
      [x, y],
      [x2, y2],
    ]) {
      const m = placeBuilding(s, 'miner', mx, my);
      if (!m.ok || !d.ok) throw new Error();
      createLink(s, m.value.id, d.value.id);
    }
    buyVehicle(s, 'truck');
    startResearch(s, 'r_steel');
    const before = s.money;
    const rep = applyOffline(s, 2 * 3600)!;
    expect(s.research.done).toContain('r_steel');
    expect(s.stats.trips).toBeGreaterThan(20);
    // one truck: 30 ore per ~95 s round trip ≈ 2270 ore over 2 h × ~$0.9
    expect(rep.earned).toBeGreaterThan(1800);
    expect(s.money - before).toBeCloseTo(rep.earned, 5);
  });
});

describe('migration', () => {
  it('loads a Phase 1 save', () => {
    const old = newGame(9) as unknown as Record<string, unknown>;
    old.version = 1;
    for (const k of ['research', 'markets', 'vehicles', 'prestige', 'contracts', 'daily', 'gems']) delete old[k];
    const s = deserialize(JSON.stringify(old))!;
    expect(s.version).toBe(2);
    expect(s.research.done).toEqual([]);
    run(s, 5);
    expect(s.world.deposits.includes('sand')).toBe(true);
  });
});

describe('prestige', () => {
  it('needs $1M earned, converts to shares, keeps perks and gems', () => {
    const s = newGame(1);
    s.stats.totalEarned = PRESTIGE.minRunEarned - 1;
    expect(canPrestige(s)).toBe(false);
    s.stats.totalEarned = 4_000_000;
    expect(canPrestige(s)).toBe(true);
    s.gems = 42;
    s.research.done.push('r_trucks', 'r_gears');
    s.prestige.shares = 10;
    expect(buyPerk(s, 'p_research')).toBeNull();
    expect(buyPerk(s, 'p_cash')).toBeNull();
    const next = prestige(s, 5);
    expect(next.prestige.shares).toBe(10 - 6 - 1 + sharesFor(4_000_000));
    expect(next.prestige.count).toBe(1);
    expect(next.gems).toBe(42);
    expect(next.money).toBe(BALANCE.startMoney + 5000);
    expect(next.research.done).toEqual(['r_trucks']); // tier A only
    expect(next.buildings.length).toBe(1);
  });

  it('shares raise sale prices', () => {
    const s = newGame(1);
    const p = price(s, 'local', 'iron_bar');
    s.prestige.shares = 10;
    expect(price(s, 'local', 'iron_bar')).toBeCloseTo(p * 1.2, 5);
  });
});

describe('contracts & daily', () => {
  it('a contract completes from sales and pays its reward', () => {
    const s = newGame(1);
    s.stats.produced.iron_bar = 1;
    tickContracts(s);
    const offer = s.contracts.offers[0];
    expect(acceptContract(s, offer.id)).toBeNull();
    const money = s.money;
    sell(s, 'local', offer.item, offer.qty);
    const before = s.money;
    const res = tickContracts(s);
    expect(res.completed.length).toBe(1);
    expect(s.money - before).toBe(offer.reward);
    expect(money).toBeLessThan(before);
  });

  it('daily missions track progress from issue time and pay 25 gems max', () => {
    const s = newGame(1);
    ensureDaily(s, new Date('2026-10-06T09:00:00').getTime());
    expect(s.daily.missions.length).toBe(3);
    let gems = 0;
    for (const m of s.daily.missions) {
      expect(missionDone(s, m)).toBe(false);
      if (m.kind === 'sell') sell(s, 'local', m.item!, m.target);
      if (m.kind === 'earn') s.stats.totalEarned += m.target;
      if (m.kind === 'upgrade') s.stats.upgrades += m.target;
      if (m.kind === 'research') s.stats.research += 1;
      if (m.kind === 'contract') s.stats.contracts += 1;
      if (m.kind === 'trips') s.stats.trips += m.target;
      gems += claimMission(s, m.id);
    }
    gems += claimBonus(s);
    expect(gems).toBe(25);
    expect(claimBonus(s)).toBe(0);
    expect(ensureDaily(s, new Date('2026-10-06T22:00:00').getTime())).toBe(false);
    expect(ensureDaily(s, new Date('2026-10-07T07:00:00').getTime())).toBe(true);
  });
});

describe('gem items', () => {
  it('time skip pays out an hour of production even past the offline cap', () => {
    const s = newGame(42);
    const [x, y] = deposit(s, 'iron_ore');
    const m = placeBuilding(s, 'miner', x, y);
    if (!m.ok) throw new Error();
    createLink(s, m.value.id, hqId(s));
    run(s, 30);
    const rep = applyGemItem(s, 'skip_1h')!;
    expect(rep.earned).toBeGreaterThan(1500); // 0.5 ore/s × 3600 s × ~$1
  });

  it('boost doubles sale prices while active', () => {
    const s = newGame(1);
    const now = 1_000_000;
    const p = price(s, 'local', 'iron_bar', now);
    applyGemItem(s, 'boost_4h', now);
    expect(price(s, 'local', 'iron_bar', now + 1000)).toBeCloseTo(p * 2, 5);
    expect(price(s, 'local', 'iron_bar', now + 5 * 3600_000)).toBeCloseTo(p, 5);
  });
});

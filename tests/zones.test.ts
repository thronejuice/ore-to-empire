import { describe, expect, it } from 'vitest';
import { BALANCE, POWER, TERRAIN, ZONES, ZONE_ORDER, type BuildingType, type DepositId, type ResearchId, type ZoneId } from '../src/config/balance';
import { createLink, planLink, placeBuilding } from '../src/core/actions';
import { buyPlot, plotForSale, plotPrice } from '../src/core/land';
import { buyPerk } from '../src/core/prestige';
import { checkQuests, currentQuest, isBuildingUnlocked, QUESTS } from '../src/core/quests';
import { startResearch, tickResearch } from '../src/core/research';
import { deserialize } from '../src/core/save';
import { tick } from '../src/core/sim';
import { idx, newGame, plotsPerRow } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { legacyOffset, zoneOfTile } from '../src/core/worldgen';
import { beltCost, buyLicence, licenceState, terrainAt, zoneOfPlot } from '../src/core/zones';
import { legacySave } from './legacy';

const O = legacyOffset();
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
};
const hqId = (s: GameState) => s.buildings.find((b) => b.type === 'hq')!.id;
const research = (s: GameState, ...ids: ResearchId[]) => s.research.done.push(...ids);

/** own every plot of a zone (and its licence) without paying */
function openZone(s: GameState, z: ZoneId) {
  if (z !== 'home' && !s.licences.includes(z)) s.licences.push(z);
  const n = plotsPerRow(s);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) if (zoneOfPlot(px, py) === z) s.world.plots[py * n + px] = true;
}

function find(s: GameState, test: (x: number, y: number) => boolean, skip = 0): [number, number] {
  for (let y = 0; y < s.world.size; y++) for (let x = 0; x < s.world.size; x++) if (test(x, y) && skip-- <= 0) return [x, y];
  throw new Error('nothing found');
}
const depositIn = (s: GameState, d: DepositId, z: ZoneId, skip = 0) => find(s, (x, y) => s.world.deposits[idx(s, x, y)] === d && zoneOfTile(x, y) === z, skip);
const waterIn = (s: GameState, t: number, z: ZoneId) => find(s, (x, y) => terrainAt(s, x, y) === t && zoneOfTile(x, y) === z);
/** a free land tile next to x,y */
function landNear(s: GameState, x: number, y: number, w = 1, h = 1): [number, number] {
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        let ok = true;
        for (let j = 0; j < h && ok; j++)
          for (let i = 0; i < w && ok; i++) {
            const tx = nx + i;
            const ty = ny + j;
            if (tx < 0 || ty < 0 || tx >= s.world.size || ty >= s.world.size) ok = false;
            else if (terrainAt(s, tx, ty) !== TERRAIN.land || s.world.deposits[idx(s, tx, ty)] || s.buildings.some((b) => b.x === tx && b.y === ty)) ok = false;
          }
        if (ok) return [nx, ny];
      }
  throw new Error('no land near');
}

describe('the big map', () => {
  it('is 64×64 with the HQ and starting land in the middle', () => {
    const s = newGame(1);
    expect(s.world.size).toBe(64);
    expect(s.world.terrain.length).toBe(64 * 64);
    const hq = s.buildings[0];
    expect([hq.x, hq.y]).toEqual([31, 31]);
    expect(s.world.plots.filter(Boolean).length).toBe(4);
    for (const [px, py] of BALANCE.startPlots) expect(zoneOfPlot(px, py)).toBe('home');
  });

  it('every zone has its resources, for many seeds; the home zone has no water', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(seed);
      const count = (pred: (x: number, y: number) => boolean) => {
        let c = 0;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (pred(x, y)) c++;
        return c;
      };
      const dep = (d: DepositId, z: ZoneId) => count((x, y) => s.world.deposits[idx(s, x, y)] === d && zoneOfTile(x, y) === z);
      const ter = (t: number, z: ZoneId) => count((x, y) => terrainAt(s, x, y) === t && zoneOfTile(x, y) === z);
      expect(dep('wood', 'forest')).toBeGreaterThan(150);
      expect(dep('flower', 'forest')).toBeGreaterThan(15);
      expect(ter(TERRAIN.river, 'river')).toBeGreaterThan(80);
      expect(dep('clay', 'river')).toBeGreaterThan(10);
      expect(ter(TERRAIN.sea, 'sea')).toBeGreaterThan(300);
      expect(dep('crude_oil', 'desert')).toBeGreaterThan(20);
      expect(dep('gold_ore', 'desert')).toBeGreaterThan(10);
      expect(dep('sulfur', 'volcano')).toBeGreaterThan(20);
      expect(dep('obsidian', 'volcano')).toBeGreaterThan(10);
      expect(ter(TERRAIN.vent, 'volcano')).toBe(10);
      expect(count((x, y) => zoneOfTile(x, y) === 'home' && terrainAt(s, x, y) !== TERRAIN.land)).toBe(0);
      // water never carries a deposit
      expect(count((x, y) => terrainAt(s, x, y) !== TERRAIN.land && !!s.world.deposits[idx(s, x, y)])).toBe(0);
    }
  });

  it('the same seed always builds the same world', () => {
    expect(JSON.stringify(newGame(77).world)).toBe(JSON.stringify(newGame(77).world));
  });
});

describe('moving a v1.1 save to the big map', () => {
  function factory() {
    const s = newGame(7);
    s.money = 10000;
    const [mx, my] = find(s, (x, y) => s.world.deposits[idx(s, x, y)] === 'iron_ore' && s.world.plots[Math.floor(y / 8) * 8 + Math.floor(x / 8)]);
    const m = placeBuilding(s, 'miner', mx, my);
    if (!m.ok) throw new Error(m.reason);
    createLink(s, m.value.id, hqId(s));
    run(s, 20);
    return s;
  }

  it('keeps the factory, moves it to the middle and builds the same zones a new game gets', () => {
    const s = factory();
    const old = legacySave(s);
    const oldBuildings = (old.buildings as { x: number; y: number }[]).map((b) => [b.x, b.y]);
    const m = deserialize(JSON.stringify(old))!;
    expect(m.version).toBe(4);
    expect(m.world.size).toBe(64);
    expect(m.world.deposits).toEqual(s.world.deposits);
    expect(m.world.grade).toEqual(s.world.grade);
    expect(m.world.terrain).toEqual(s.world.terrain);
    expect(m.world.plots).toEqual(s.world.plots);
    expect(m.buildings.map((b) => [b.x, b.y])).toEqual(oldBuildings.map(([x, y]) => [x + O, y + O]));
    expect(m.belts).toEqual(s.belts);
    expect(m.licences).toEqual([]);
    const sold = m.stats.sold.iron_ore ?? 0;
    run(m, 30);
    expect(m.stats.sold.iron_ore ?? 0).toBeGreaterThan(sold + 5);
  });

  it('refunds perks that only worked when selling the company', () => {
    const s = newGame(3);
    const old = legacySave(s) as { prestige: GameState['prestige'] };
    old.prestige.shares = 2;
    old.prestige.perks = { p_cash: 3, p_research: 2, p_land: 1, p_speed: 2 };
    const m = deserialize(JSON.stringify(old))!;
    expect(m.prestige.shares).toBe(2 + 3 + (6 + 18) + 8);
    expect(m.prestige.perks).toEqual({ p_speed: 2 });
  });
});

describe('zone licences', () => {
  it('need their research and money, grant shares, and open the zone for buying land', () => {
    const s = newGame(1);
    s.money = 1e6;
    // own the home plot next to the forest so a forest plot is adjacent
    s.world.plots[3 * 8 + 2] = true;
    expect(plotForSale(s, 1, 3)).toBe(false); // forest, no licence
    expect(buyPlot(s, 1, 3)).toBe('err.needLicence');
    expect(licenceState(s, 'forest')).toBe('research');
    expect(buyLicence(s, 'forest')).toBe('err.needResearch');
    research(s, 'r_forestry');
    expect(licenceState(s, 'forest')).toBe('available');
    const money = s.money;
    expect(buyLicence(s, 'forest')).toBeNull();
    expect(s.money).toBe(money - ZONES.forest.licence);
    expect(s.prestige.shares).toBe(ZONES.forest.shares);
    expect(buyLicence(s, 'forest')).toBe('err.alreadyLicensed');
    expect(plotForSale(s, 1, 3)).toBe(true);
    expect(plotPrice(s, 1, 3)).toBe(ZONES.forest.landBase);
    expect(buyPlot(s, 1, 3)).toBeNull();
    expect(plotPrice(s, 1, 2)).toBe(Math.round(ZONES.forest.landBase * 1.35));
  });

  it('every zone has a research that opens it, cheapest first', () => {
    let last = 0;
    for (const z of ZONE_ORDER) {
      expect(ZONES[z].research).toBeTruthy();
      expect(ZONES[z].licence).toBeGreaterThan(last);
      last = ZONES[z].licence;
    }
  });

  it('the quests after motors lead through the licences to a rocket', () => {
    const s = newGame(1);
    s.quests.done = QUESTS.slice(0, QUESTS.findIndex((q) => q.id === 'q_lic_forest')).map((q) => q.id);
    expect(currentQuest(s)?.id).toBe('q_lic_forest');
    s.licences.push('forest');
    expect(checkQuests(s)?.id).toBe('q_lic_forest');
    expect(currentQuest(s)?.id).toBe('q_lic_river');
    expect(QUESTS[QUESTS.length - 1].id).toBe('q_rocket');
  });
});

describe('zone buildings', () => {
  function ready(z: ZoneId, ...r: ResearchId[]) {
    const s = newGame(5);
    s.money = 1e7;
    research(s, ...r);
    openZone(s, z);
    return s;
  }

  const extracts: [BuildingType, ZoneId, ResearchId[], DepositId | null, number | null, string][] = [
    ['lumber_camp', 'forest', ['r_forestry'], 'wood', null, 'wood'],
    ['flower_garden', 'forest', ['r_forestry'], 'flower', null, 'flower'],
    ['clay_pit', 'river', ['r_fishing'], 'clay', null, 'clay'],
    ['fishing_dock', 'river', ['r_fishing'], null, TERRAIN.river, 'fish'],
    ['fishing_dock', 'sea', ['r_fishing'], null, TERRAIN.sea, 'sea_fish'],
    ['seaweed_farm', 'sea', ['r_fishing', 'r_rail', 'r_trucks', 'r_marine'], null, TERRAIN.sea, 'seaweed'],
    ['oil_pump', 'desert', ['r_petroleum'], 'crude_oil', null, 'crude_oil'],
    ['miner', 'desert', [], 'gold_ore', null, 'gold_ore'],
    ['miner', 'volcano', [], 'sulfur', null, 'sulfur'],
  ];
  for (const [type, zone, r, dep, water, item] of extracts) {
    it(`${type} in the ${zone} gathers ${item}`, () => {
      const s = ready(zone, ...r);
      const [x, y] = dep ? depositIn(s, dep, zone) : waterIn(s, water!, zone);
      const b = placeBuilding(s, type, x, y);
      if (!b.ok) throw new Error(b.reason);
      run(s, 12);
      expect(s.stats.produced[item as keyof typeof s.stats.produced] ?? 0).toBeGreaterThan(0);
    });
  }

  it('extractors refuse the wrong tile; other buildings refuse water', () => {
    const s = ready('river', 'r_fishing', 'r_forestry');
    const [wx, wy] = waterIn(s, TERRAIN.river, 'river');
    expect(placeBuilding(s, 'furnace', wx, wy)).toEqual({ ok: false, reason: 'err.water' });
    expect(placeBuilding(s, 'lumber_camp', wx, wy)).toEqual({ ok: false, reason: 'place.lumber_camp' });
    const [lx, ly] = landNear(s, wx, wy);
    expect(placeBuilding(s, 'fishing_dock', lx, ly)).toEqual({ ok: false, reason: 'place.fishing_dock' });
    expect(placeBuilding(s, 'furnace', lx, ly).ok).toBe(true);
  });

  it('zone buildings unlock with their research', () => {
    const s = ready('forest');
    expect(isBuildingUnlocked(s, 'lumber_camp')).toBe(false);
    research(s, 'r_forestry');
    expect(isBuildingUnlocked(s, 'lumber_camp')).toBe(true);
    expect(isBuildingUnlocked(s, 'oil_pump')).toBe(false);
  });

  it('a geothermal plant must cover a vent and makes 60 MW with no fuel', () => {
    const s = ready('volcano', 'r_geology');
    const [vx, vy] = waterIn(s, TERRAIN.vent, 'volcano');
    const [lx, ly] = landNear(s, vx + 4, vy + 4, 2, 2);
    expect(placeBuilding(s, 'geothermal', lx, ly).ok).toBe(false);
    // any 2×2 spot that covers the vent
    let placed = false;
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ])
      if (!placed && placeBuilding(s, 'geothermal', vx + dx, vy + dy).ok) placed = true;
    expect(placed).toBe(true);
    run(s, 1);
    expect(s.power.gen).toBeGreaterThanOrEqual(POWER.hq + POWER.geothermal);
  });

  it('wood → charcoal fuels a coal plant', () => {
    const s = ready('forest', 'r_forestry');
    const [x, y] = depositIn(s, 'wood', 'forest');
    const lc = placeBuilding(s, 'lumber_camp', x, y);
    const [fx, fy] = landNear(s, x, y);
    const f = placeBuilding(s, 'furnace', fx, fy);
    const [px, py] = landNear(s, fx + 3, fy, 2, 2);
    const plant = placeBuilding(s, 'coal_plant', px, py);
    if (!lc.ok || !f.ok || !plant.ok) throw new Error('place');
    s.buildings.find((b) => b.id === f.value.id)!.recipe = 'charcoal';
    expect(createLink(s, lc.value.id, f.value.id).ok).toBe(true);
    expect(createLink(s, f.value.id, plant.value.id).ok).toBe(true);
    run(s, 60);
    expect(s.stats.produced.charcoal ?? 0).toBeGreaterThan(0);
    expect(plant.value.burn > 0 || (plant.value.input.charcoal ?? 0) > 0).toBe(true);
  });

  it('oil pump → refinery makes plastic', () => {
    const s = ready('desert', 'r_fabricator', 'r_petroleum');
    const [x, y] = depositIn(s, 'crude_oil', 'desert');
    const pump = placeBuilding(s, 'oil_pump', x, y);
    const [rx, ry] = landNear(s, x, y, 2, 2);
    const ref = placeBuilding(s, 'refinery', rx, ry);
    if (!pump.ok || !ref.ok) throw new Error(pump.ok ? (ref as { reason: string }).reason : pump.reason);
    expect(ref.value.recipe).toBe('plastic');
    expect(createLink(s, pump.value.id, ref.value.id).ok).toBe(true);
    research(s, 'r_solar');
    run(s, 40);
    expect(s.stats.produced.plastic ?? 0).toBeGreaterThan(0);
  });
});

describe('bridges', () => {
  it('belt tiles over water cost more, and the belt perk discounts them', () => {
    const s = newGame(2);
    const water: [number, number][] = [[0, 0]];
    let w = 0;
    for (let y = 0; y < 64 && !w; y++) for (let x = 0; x < 64 && !w; x++) if (terrainAt(s, x, y) === TERRAIN.river) (water[0] = [x, y]), w++;
    const land: [number, number][] = [[O + 10, O + 10]];
    expect(beltCost(s, water)).toBe(BALANCE.bridgeCostPerTile);
    expect(beltCost(s, land)).toBe(BALANCE.beltCostPerTile);
    expect(beltCost(s, [...land, ...water])).toBe(BALANCE.beltCostPerTile + BALANCE.bridgeCostPerTile);
    s.prestige.shares = 10;
    expect(buyPerk(s, 'p_belt_discount')).toBeNull();
    expect(beltCost(s, water)).toBe(Math.round(BALANCE.bridgeCostPerTile * 0.9));
  });

  it('a belt can cross the river, and pays the bridge price', () => {
    const s = newGame(4);
    s.money = 1e7;
    research(s, 'r_fishing');
    openZone(s, 'river');
    // a column of river water with land on both sides
    const [wx, wy] = waterIn(s, TERRAIN.river, 'river');
    let top = wy;
    while (terrainAt(s, wx, top - 1) !== TERRAIN.land) top--;
    let bottom = wy;
    while (terrainAt(s, wx, bottom + 1) !== TERRAIN.land) bottom++;
    s.world.deposits[idx(s, wx, top - 1)] = null;
    s.world.deposits[idx(s, wx, bottom + 1)] = null;
    // walls left and right so the only way across is straight over the water
    const a = placeBuilding(s, 'warehouse', wx, top - 1);
    const b = placeBuilding(s, 'warehouse', wx, bottom + 1);
    if (!a.ok || !b.ok) throw new Error('place');
    const plan = planLink(s, a.value.id, b.value.id);
    if (!plan.ok) throw new Error(plan.reason);
    const wet = plan.value.path.filter(([x, y]) => terrainAt(s, x, y) !== TERRAIN.land).length;
    expect(wet).toBeGreaterThan(0);
    expect(plan.value.cost).toBe(beltCost(s, plan.value.path));
    expect(plan.value.cost).toBeGreaterThanOrEqual(wet * BALANCE.bridgeCostPerTile);
  });
});

describe('new perks', () => {
  it('land agent lowers land prices; R&D lab speeds research', () => {
    const s = newGame(1);
    s.money = 1e6;
    const p = plotPrice(s, 2, 3);
    s.prestige.shares = 20;
    expect(buyPerk(s, 'p_land_discount')).toBeNull();
    expect(plotPrice(s, 2, 3)).toBe(Math.round(p * 0.92));
    expect(buyPerk(s, 'p_research_speed')).toBeNull();
    expect(startResearch(s, 'r_trucks')).toBeNull();
    tickResearch(s, 50); // 60 s research at +10 % speed: 55 s of effective time left → not yet
    expect(s.research.active?.remaining).toBeCloseTo(60 - 55, 5);
  });
});

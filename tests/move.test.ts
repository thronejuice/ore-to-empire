import { describe, expect, it } from 'vitest';
import { BALANCE, type DepositId } from '../src/config/balance';
import { createLink, moveBuilding, placeBuilding, upgradeBuilding } from '../src/core/actions';
import { tick } from '../src/core/sim';
import { buildingAt, idx, newGame } from '../src/core/state';
import type { GameState } from '../src/core/types';

const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += BALANCE.tickSeconds) tick(s, BALANCE.tickSeconds);
};
const hq = (s: GameState) => s.buildings.find((b) => b.type === 'hq')!;

function deposit(s: GameState, type: DepositId, skip = 0): [number, number] {
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 24; x++) if (s.world.deposits[idx(s, x, y)] === type && skip-- <= 0) return [x, y];
  throw new Error('no ' + type);
}

function emptyTile(s: GameState, near: [number, number]): [number, number] {
  for (let r = 1; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = near[0] + dx;
        const y = near[1] + dy;
        if (x < 8 || y < 8 || x > 23 || y > 23) continue;
        if (s.world.deposits[idx(s, x, y)] || buildingAt(s, x, y)) continue;
        if (s.belts.some((b) => b.path.some(([a, c]) => a === x && c === y))) continue;
        return [x, y];
      }
  throw new Error('no empty tile');
}

/** miner → furnace → HQ, running for a while */
function chain() {
  const s = newGame(7);
  s.money = 10000;
  const [mx, my] = deposit(s, 'iron_ore');
  const m = placeBuilding(s, 'miner', mx, my);
  const [fx, fy] = emptyTile(s, [mx, my]);
  const f = placeBuilding(s, 'furnace', fx, fy);
  if (!m.ok || !f.ok) throw new Error();
  createLink(s, m.value.id, f.value.id);
  createLink(s, f.value.id, hq(s).id);
  upgradeBuilding(s, f.value.id);
  upgradeBuilding(s, f.value.id);
  run(s, 30);
  return { s, miner: m.value, furnace: f.value };
}

describe('moving buildings', () => {
  it('keeps level, recipe, contents and both belts, which re-route to the new spot', () => {
    const { s, furnace } = chain();
    const before = { level: furnace.level, recipe: furnace.recipe, input: { ...furnace.input }, belts: s.belts.length };
    const onBelts = s.belts.reduce((a, b) => a + b.items.length, 0);
    const [nx, ny] = emptyTile(s, [furnace.x + 3, furnace.y + 3]);

    const r = moveBuilding(s, furnace.id, nx, ny);
    expect(r.ok).toBe(true);
    expect([furnace.x, furnace.y]).toEqual([nx, ny]);
    expect(buildingAt(s, nx, ny)?.id).toBe(furnace.id);
    expect(furnace.level).toBe(before.level);
    expect(furnace.recipe).toBe(before.recipe);
    expect(furnace.input).toEqual(before.input);
    expect(s.belts.length).toBe(before.belts);
    expect(s.belts.reduce((a, b) => a + b.items.length, 0)).toBe(onBelts); // no items lost
    for (const b of s.belts) for (const it of b.items) expect(it.pos).toBeLessThanOrEqual(b.length);

    // and the factory keeps producing
    const sold = s.stats.sold.iron_bar ?? 0;
    run(s, 60);
    expect(s.stats.sold.iron_bar ?? 0).toBeGreaterThan(sold + 5);
  });

  it('the old spot is free again and the new spot is taken', () => {
    const { s, furnace } = chain();
    const old: [number, number] = [furnace.x, furnace.y];
    const [nx, ny] = emptyTile(s, [furnace.x + 3, furnace.y + 3]);
    expect(moveBuilding(s, furnace.id, nx, ny).ok).toBe(true);
    expect(buildingAt(s, ...old)).toBeUndefined();
    expect(placeBuilding(s, 'furnace', nx, ny).ok).toBe(false);
  });

  it('refuses blocked or invalid spots and leaves everything unchanged', () => {
    const { s, miner, furnace } = chain();
    const snapshot = JSON.stringify({ b: s.buildings, belts: s.belts, money: s.money });
    expect(moveBuilding(s, furnace.id, miner.x, miner.y).ok).toBe(false); // occupied
    expect(moveBuilding(s, furnace.id, 0, 0).ok).toBe(false); // land not owned
    const [ex, ey] = emptyTile(s, [miner.x, miner.y]);
    expect(moveBuilding(s, miner.id, ex, ey)).toEqual({ ok: false, reason: 'err.needDeposit' });
    expect(JSON.stringify({ b: s.buildings, belts: s.belts, money: s.money })).toBe(snapshot);
  });

  it('a drill can move to another deposit', () => {
    const { s, miner } = chain();
    const [x2, y2] = deposit(s, 'iron_ore', 3);
    expect(moveBuilding(s, miner.id, x2, y2).ok).toBe(true);
    const sold = s.stats.sold.iron_bar ?? 0;
    run(s, 60);
    expect(s.stats.sold.iron_bar ?? 0).toBeGreaterThan(sold);
  });

  it('can slide onto cells its own belt used to cover', () => {
    const { s, furnace } = chain();
    const out = s.belts.find((b) => b.from === furnace.id)!;
    const [px, py] = out.path[0];
    expect(moveBuilding(s, furnace.id, px, py).ok).toBe(true);
  });

  it('rolls back when a belt cannot reach the new spot', () => {
    const { s, furnace } = chain();
    // wall the destination in with warehouses so no belt can get there
    const [nx, ny] = [20, 20];
    s.money = 1e6;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      placeBuilding(s, 'warehouse', nx + dx, ny + dy);
    expect(buildingAt(s, nx, ny)).toBeUndefined(); // test setup sanity
    expect(s.world.deposits[idx(s, nx, ny)]).toBeNull();
    const snapshot = JSON.stringify({ x: furnace.x, y: furnace.y, belts: s.belts });
    const r = moveBuilding(s, furnace.id, nx, ny);
    expect(r).toEqual({ ok: false, reason: 'err.cantReroute' });
    expect(JSON.stringify({ x: furnace.x, y: furnace.y, belts: s.belts })).toBe(snapshot);
    expect(buildingAt(s, furnace.x, furnace.y)?.id).toBe(furnace.id);
  });

  it('the HQ can move too', () => {
    const { s } = chain();
    const h = hq(s);
    expect(moveBuilding(s, h.id, 9, 20).ok || moveBuilding(s, h.id, 20, 9).ok).toBe(true);
    run(s, 40);
    expect(s.stats.sold.iron_bar ?? 0).toBeGreaterThan(0);
  });
});

import {
  BALANCE,
  BUILDINGS,
  EXTRACTORS,
  MOVE,
  TERRAIN,
  RESEARCH,
  ITEMS,
  RECIPES,
  beltUpgradeCost,
  upgradeCost,
  type BuildingType,
  type ItemId,
  type RecipeId,
} from '../config/balance';
import { beltMaxLevel, hasResearch, recipeUnlocked, recipesFor } from './economy';
import { beltPoints, findPath } from './pathfind';
import { getBuilding, idx, inBounds, invalidateOccupancy, isUnlocked, makeBuilding, occupancy } from './state';
import { acceptsType } from './sim';
import type { Belt, Building, GameState } from './types';
import { beltCost, extractAt, extractedItem, isExtractor, terrainAt, waterAt } from './zones';

function coversVent(state: GameState, x: number, y: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (terrainAt(state, x + dx, y + dy) === TERRAIN.vent) return true;
  return false;
}

/** Result of an action: ok, or a translation key explaining why not. */
export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): ActionResult<T> => ({ ok: true, value });
const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });

/**
 * Can a building of `type` stand at x,y? When moving, `ignore` is the building
 * being moved: its own cells and its own belts (which get re-routed) don't block.
 */
export function canPlace(state: GameState, type: BuildingType, x: number, y: number, ignore?: Building): ActionResult<undefined> {
  const def = BUILDINGS[type];
  const occ = occupancy(state);
  const ownBeltCells = new Map<number, number>();
  if (ignore) {
    for (const belt of state.belts) {
      if (belt.from !== ignore.id && belt.to !== ignore.id) continue;
      for (const [px, py] of belt.path) {
        const i = idx(state, px, py);
        ownBeltCells.set(i, (ownBeltCells.get(i) ?? 0) + 1);
      }
    }
  }
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(state, cx, cy)) return fail('err.outOfBounds');
      if (!isUnlocked(state, cx, cy)) return fail('err.locked');
      const i = idx(state, cx, cy);
      if (occ.building[i] && occ.building[i] !== ignore?.id) return fail('err.occupied');
      if (occ.belts[i] - (ownBeltCells.get(i) ?? 0) > 0) return fail('err.beltHere');
    }
  }
  const ex = EXTRACTORS[type];
  if (ex) {
    const item = extractAt(state, type, x, y);
    if (!item) return fail(type === 'miner' ? 'err.needDeposit' : `place.${type}`);
    if (item === 'uranium_ore' && !hasResearch(state, 'r_nuclear')) return fail('err.needResearch');
  } else {
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (waterAt(state, x + dx, y + dy)) return fail('err.water');
    if (type === 'geothermal' && !coversVent(state, x, y, def.w, def.h)) return fail('place.geothermal');
  }
  if (!ignore && state.money < def.cost) return fail('err.noMoney');
  return ok(undefined);
}

/**
 * Moves a building, keeping its level, recipe, contents and belts. Belts are
 * re-routed to the new spot; items riding them stay on (spread along the new
 * length). Moving costs the fee plus whatever the new routes cost beyond the old ones.
 * Nothing changes if any belt can't reach the new spot.
 */
export function moveBuilding(state: GameState, id: number, x: number, y: number): ActionResult<{ cost: number }> {
  const b = getBuilding(state, id);
  if (!b) return fail('err.notFound');
  if (b.x === x && b.y === y) return fail('err.samePlace');
  const check = canPlace(state, b.type, x, y, b);
  if (!check.ok) return check;
  const fee = moveFee(state, b);
  if (state.money < fee) return fail('err.noMoney');

  const own = state.belts.filter((belt) => belt.from === id || belt.to === id);
  const oldPos = { x: b.x, y: b.y };
  const oldCost = own.reduce((a, belt) => a + beltCost(state, belt.path), 0);

  // take the building's belts off the map, move it, then route each belt again
  state.belts = state.belts.filter((belt) => belt.from !== id && belt.to !== id);
  b.x = x;
  b.y = y;
  invalidateOccupancy(state);

  const rerouted: Belt[] = [];
  let newCost = 0;
  for (const belt of own) {
    const from = getBuilding(state, belt.from)!;
    const to = getBuilding(state, belt.to)!;
    const path = findPath(state, from, to);
    if (!path) {
      // undo everything
      state.belts = state.belts.filter((x2) => !rerouted.includes(x2));
      state.belts.push(...own);
      b.x = oldPos.x;
      b.y = oldPos.y;
      invalidateOccupancy(state);
      return fail('err.cantReroute');
    }
    const { points, length } = beltPoints(from, to, path);
    const scale = belt.length > 0 ? length / belt.length : 1;
    const nb = { ...belt, path, points, length, items: belt.items.map((it) => ({ ...it, pos: Math.min(length, it.pos * scale) })) };
    rerouted.push(nb);
    state.belts.push(nb); // later belts see this one (they may bridge over it)
    newCost += beltCost(state, path);
  }
  const cost = fee + Math.max(0, newCost - oldCost);
  if (state.money < cost) {
    state.belts = state.belts.filter((x2) => !rerouted.includes(x2));
    state.belts.push(...own);
    b.x = oldPos.x;
    b.y = oldPos.y;
    invalidateOccupancy(state);
    return fail('err.noMoney');
  }
  state.money -= cost;
  invalidateOccupancy(state);
  return ok({ cost });
}

export function placeBuilding(state: GameState, type: BuildingType, x: number, y: number): ActionResult<Building> {
  const check = canPlace(state, type, x, y);
  if (!check.ok) return check;
  const b = makeBuilding(state, type, x, y);
  const recipes = recipesFor(state, type);
  if (recipes.length) b.recipe = recipes[0];
  state.money -= BUILDINGS[type].cost;
  state.buildings.push(b);
  return ok(b);
}

export function removeBuilding(state: GameState, id: number): ActionResult<number> {
  const b = getBuilding(state, id);
  if (!b) return fail('err.notFound');
  if (b.type === 'hq') return fail('err.cantRemoveHq');
  let refund = Math.floor(totalInvested(b) * BALANCE.refundRate);
  for (const belt of state.belts.filter((x) => x.from === id || x.to === id)) {
    refund += Math.floor(beltCost(state, belt.path) * BALANCE.refundRate);
  }
  state.belts = state.belts.filter((x) => x.from !== id && x.to !== id);
  state.buildings = state.buildings.filter((x) => x.id !== id);
  state.money += refund;
  return ok(refund);
}

/** seconds left in the free-move window after building, or 0 */
export function freeMoveLeft(state: GameState, b: Building): number {
  if (b.placedAt === undefined) return 0;
  return Math.max(0, MOVE.freeSeconds - (state.time - b.placedAt));
}

/** fee for moving a building (belt tiles beyond the old lengths are extra) */
export function moveFee(state: GameState, b: Building): number {
  if (freeMoveLeft(state, b) > 0) return 0;
  let discount = 0;
  for (const id of state.research.done) discount += RESEARCH[id].moveDiscount ?? 0;
  const mult = Math.max(0, 1 - discount);
  const base = b.type === 'hq' ? MOVE.hqFee : Math.max(MOVE.min, totalInvested(b) * MOVE.rate);
  return Math.round(base * mult);
}

export function totalInvested(b: Building): number {
  let sum = BUILDINGS[b.type].cost;
  for (let l = 1; l < b.level; l++) sum += upgradeCost(b.type, l);
  return sum;
}

/** Item types the source could send that the destination would take. */
export function linkCarries(src: Building, dst: Building): ItemId[] {
  let produces: ItemId[];
  if (src.type === 'warehouse') produces = Object.keys(ITEMS) as ItemId[];
  else if (isExtractor(src.type)) produces = []; // depends on the tile: see linkCarriesIn
  else if (src.recipe) produces = Object.keys(RECIPES[src.recipe].outputs) as ItemId[];
  else produces = [];
  return produces.filter((i) => acceptsType(dst, i));
}

export function linkCarriesIn(state: GameState, src: Building, dst: Building): ItemId[] {
  if (isExtractor(src.type)) {
    const item = extractedItem(state, src);
    return item && acceptsType(dst, item) ? [item] : [];
  }
  return linkCarries(src, dst);
}

/** what this belt can carry, with a warehouse belt's item filter applied */
export function beltCarries(state: GameState, belt: Belt): ItemId[] {
  const src = getBuilding(state, belt.from);
  const dst = getBuilding(state, belt.to);
  if (!src || !dst) return [];
  if (belt.filter) return acceptsType(dst, belt.filter) ? [belt.filter] : [];
  return linkCarriesIn(state, src, dst);
}

/** belts leaving a warehouse: carry only one item, or anything (null) */
export function setBeltFilter(state: GameState, beltId: number, item: ItemId | null): ActionResult<undefined> {
  const belt = state.belts.find((b) => b.id === beltId);
  if (!belt) return fail('err.notFound');
  if (getBuilding(state, belt.from)?.type !== 'warehouse') return fail('err.notWarehouse');
  if (item) {
    const dst = getBuilding(state, belt.to);
    if (!dst || !acceptsType(dst, item)) return fail('err.cantCarry');
    belt.filter = item;
  } else delete belt.filter;
  // items already riding that no longer match stay on and get delivered: nothing is lost
  return ok(undefined);
}

/** steps for the warehouse "keep in stock" control; -1 = keep everything */
export const RESERVE_STEPS = [0, 10, 25, 50, 100, 200, 500, 1000, -1];

/** move a warehouse's reserve for one item one step up (+1) or down (-1) */
export function stepReserve(state: GameState, buildingId: number, item: ItemId, dir: 1 | -1): ActionResult<number> {
  const b = getBuilding(state, buildingId);
  if (!b || b.type !== 'warehouse') return fail('err.notWarehouse');
  const cur = b.reserve?.[item] ?? 0;
  let i = RESERVE_STEPS.indexOf(cur);
  if (i < 0) i = RESERVE_STEPS.findIndex((v) => v > cur || v < 0); // a value from elsewhere: snap to the next step
  const next = RESERVE_STEPS[Math.max(0, Math.min(RESERVE_STEPS.length - 1, i + dir))];
  b.reserve = { ...b.reserve, [item]: next };
  if (!next) delete b.reserve[item];
  return ok(next);
}

export interface LinkPlan {
  path: [number, number][];
  cost: number;
  carries: ItemId[];
}

export function planLink(state: GameState, fromId: number, toId: number): ActionResult<LinkPlan> {
  const from = getBuilding(state, fromId);
  const to = getBuilding(state, toId);
  if (!from || !to) return fail('err.notFound');
  if (from.id === to.id) return fail('err.sameBuilding');
  const fdef = BUILDINGS[from.type];
  const tdef = BUILDINGS[to.type];
  if (fdef.maxOut === 0) return fail('err.noOutput');
  if (tdef.maxIn === 0) return fail('err.noInput');
  if (state.belts.some((b) => b.from === from.id && b.to === to.id)) return fail('err.alreadyLinked');
  if (state.belts.filter((b) => b.from === from.id).length >= fdef.maxOut) return fail('err.maxOut');
  if (state.belts.filter((b) => b.to === to.id).length >= tdef.maxIn) return fail('err.maxIn');
  const path = findPath(state, from, to);
  if (!path) return fail('err.noPath');
  return ok({ path, cost: beltCost(state, path), carries: linkCarriesIn(state, from, to) });
}

export function createLink(state: GameState, fromId: number, toId: number): ActionResult<LinkPlan> {
  const plan = planLink(state, fromId, toId);
  if (!plan.ok) return plan;
  if (state.money < plan.value.cost) return fail('err.noMoney');
  const from = getBuilding(state, fromId)!;
  const to = getBuilding(state, toId)!;
  const { points, length } = beltPoints(from, to, plan.value.path);
  state.money -= plan.value.cost;
  state.belts.push({ id: state.nextId++, from: fromId, to: toId, path: plan.value.path, points, length, items: [] });
  return plan;
}

export function removeLink(state: GameState, beltId: number): ActionResult<number> {
  const belt = state.belts.find((b) => b.id === beltId);
  if (!belt) return fail('err.notFound');
  const refund = Math.floor(beltCost(state, belt.path) * BALANCE.refundRate);
  state.belts = state.belts.filter((b) => b.id !== beltId);
  state.money += refund;
  return ok(refund);
}

export function upgradeBuilding(state: GameState, id: number): ActionResult<number> {
  const b = getBuilding(state, id);
  if (!b) return fail('err.notFound');
  if (!isUpgradable(b)) return fail('err.notUpgradable');
  if (b.level >= BALANCE.maxBuildingLevel) return fail('err.maxLevel');
  const cost = upgradeCost(b.type, b.level);
  if (state.money < cost) return fail('err.noMoney');
  state.money -= cost;
  b.level++;
  state.stats.upgrades++;
  return ok(b.level);
}

export function isUpgradable(b: Building): boolean {
  return isExtractor(b.type) || ['furnace', 'assembler', 'fabricator', 'refinery', 'warehouse', 'dock'].includes(b.type);
}

export function setRecipe(state: GameState, id: number, recipe: RecipeId): ActionResult<undefined> {
  const b = getBuilding(state, id);
  if (!b) return fail('err.notFound');
  if (RECIPES[recipe].building !== b.type) return fail('err.badRecipe');
  if (!recipeUnlocked(state, recipe)) return fail('err.needResearch');
  if (b.recipe === recipe) return ok(undefined);
  b.recipe = recipe;
  b.input = {};
  b.crafting = false;
  b.progress = 0;
  // items already on incoming belts that no longer fit stay there until the link is removed;
  // clear them so nothing jams forever.
  for (const belt of state.belts) {
    if (belt.to === b.id) belt.items = belt.items.filter((it) => acceptsType(b, it.item));
  }
  return ok(undefined);
}

export function upgradeBelts(state: GameState): ActionResult<number> {
  if (state.beltLevel >= beltMaxLevel(state)) return fail('err.maxLevel');
  const cost = beltUpgradeCost(state.beltLevel);
  if (state.money < cost) return fail('err.noMoney');
  state.money -= cost;
  state.beltLevel++;
  return ok(state.beltLevel);
}

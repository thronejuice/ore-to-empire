import { BALANCE, EXTRACTORS, TERRAIN, ZONES, type BuildingType, type DepositId, type ItemId, type ZoneId } from '../config/balance';
import { PERK_VALUES } from '../config/meta';
import { hasResearch, perk } from './economy';
import { idx, inBounds } from './state';
import type { Building, GameState } from './types';
import { zoneOfTile } from './worldgen';

export { zoneOfPlot, zoneOfTile } from './worldgen';

export function terrainAt(s: GameState, x: number, y: number): number {
  return inBounds(s, x, y) ? (s.world.terrain?.[idx(s, x, y)] ?? TERRAIN.land) : TERRAIN.land;
}

export function waterAt(s: GameState, x: number, y: number): 'river' | 'sea' | null {
  const t = terrainAt(s, x, y);
  return t === TERRAIN.river ? 'river' : t === TERRAIN.sea ? 'sea' : null;
}

export function depositAt(s: GameState, x: number, y: number): DepositId | null {
  return inBounds(s, x, y) ? s.world.deposits[idx(s, x, y)] : null;
}

export function isExtractor(type: BuildingType): boolean {
  return !!EXTRACTORS[type];
}

/** what an extractor of `type` would gather standing on x,y (null: it can't stand there) */
export function extractAt(s: GameState, type: BuildingType, x: number, y: number): ItemId | null {
  const ex = EXTRACTORS[type];
  if (!ex) return null;
  if (ex.water) {
    const w = waterAt(s, x, y);
    return w ? (ex.water[w] ?? null) : null;
  }
  const d = depositAt(s, x, y);
  return d && ex.deposits?.includes(d) ? d : null;
}

/** what this building gathers, if it is an extractor */
export function extractedItem(s: GameState, b: Building): ItemId | null {
  return extractAt(s, b.type, b.x, b.y);
}

/** extractor types that could stand on this tile (for the tile sheet) */
export function extractorsFor(s: GameState, x: number, y: number): BuildingType[] {
  return (Object.keys(EXTRACTORS) as BuildingType[]).filter((t) => extractAt(s, t, x, y) !== null);
}

// ---------------------------------------------------------------- licences

export function zoneAt(_s: GameState, x: number, y: number): ZoneId {
  return zoneOfTile(x, y);
}

export function zoneLicensed(s: GameState, z: ZoneId): boolean {
  return z === 'home' || (s.licences ?? []).includes(z);
}

export type LicenceState = 'owned' | 'available' | 'research';

export function licenceState(s: GameState, z: ZoneId): LicenceState {
  if (zoneLicensed(s, z)) return 'owned';
  return hasResearch(s, ZONES[z].research) ? 'available' : 'research';
}

export function buyLicence(s: GameState, z: ZoneId): string | null {
  const st = licenceState(s, z);
  if (st === 'owned') return 'err.alreadyLicensed';
  if (st === 'research') return 'err.needResearch';
  const def = ZONES[z];
  if (s.money < def.licence) return 'err.noMoney';
  s.money -= def.licence;
  s.licences = [...(s.licences ?? []), z];
  s.prestige.shares += def.shares;
  return null;
}

// ---------------------------------------------------------------- belt prices

/** price of a belt route: bridges over water cost more; the belt perk discounts both */
export function beltCost(s: GameState, path: [number, number][]): number {
  let cost = 0;
  for (const [x, y] of path) cost += waterAt(s, x, y) ? BALANCE.bridgeCostPerTile : BALANCE.beltCostPerTile;
  if (!path.length) cost = BALANCE.beltCostPerTile; // touching buildings still need a stub
  return Math.round(cost * Math.max(0, 1 - perk(s, 'p_belt_discount') * PERK_VALUES.beltDiscountPerLevel));
}

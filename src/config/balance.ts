/**
 * ALL game-balance numbers live here. Tweak freely — nothing else in the
 * codebase hard-codes prices, speeds, costs or power values.
 *
 * Units:
 *  - time: seconds
 *  - money: $
 *  - power: MW
 *  - belt speed: tiles / second
 */

export type ItemId =
  | 'iron_ore'
  | 'copper_ore'
  | 'coal'
  | 'iron_bar'
  | 'copper_bar'
  | 'machine_part'
  | 'wire';

export type DepositId = 'iron_ore' | 'copper_ore' | 'coal';

export type BuildingType =
  | 'hq'
  | 'miner'
  | 'furnace'
  | 'assembler'
  | 'warehouse'
  | 'coal_plant'
  | 'depot';

export type RecipeId = 'iron_bar' | 'copper_bar' | 'machine_part' | 'wire';

export interface ItemDef {
  id: ItemId;
  /** base sell price per unit */
  price: number;
  /** render colour */
  color: number;
  tier: number;
}

export interface RecipeDef {
  id: RecipeId;
  building: BuildingType;
  inputs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
  time: number;
}

export interface BuildingDef {
  type: BuildingType;
  w: number;
  h: number;
  cost: number;
  /** MW drawn while working (0 for non-consumers) */
  power: number;
  /** can the player build it from the menu? */
  buildable: boolean;
  /** max outgoing / incoming belts */
  maxOut: number;
  maxIn: number;
  color: number;
  /** quest/tutorial unlock order (lower = earlier). 0 = available from start */
  unlockQuest?: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  iron_ore: { id: 'iron_ore', price: 1, color: 0x8a9bb0, tier: 1 },
  copper_ore: { id: 'copper_ore', price: 1.2, color: 0xd9824b, tier: 1 },
  coal: { id: 'coal', price: 1.5, color: 0x3a3f47, tier: 1 },
  iron_bar: { id: 'iron_bar', price: 5, color: 0xc9d4e0, tier: 2 },
  copper_bar: { id: 'copper_bar', price: 6, color: 0xf0a060, tier: 2 },
  machine_part: { id: 'machine_part', price: 14, color: 0x4fb3ff, tier: 3 },
  wire: { id: 'wire', price: 4, color: 0xffc94a, tier: 3 },
};

export const RECIPES: Record<RecipeId, RecipeDef> = {
  iron_bar: { id: 'iron_bar', building: 'furnace', inputs: { iron_ore: 2 }, outputs: { iron_bar: 1 }, time: 3 },
  copper_bar: { id: 'copper_bar', building: 'furnace', inputs: { copper_ore: 2 }, outputs: { copper_bar: 1 }, time: 3 },
  machine_part: { id: 'machine_part', building: 'assembler', inputs: { iron_bar: 2 }, outputs: { machine_part: 1 }, time: 4 },
  wire: { id: 'wire', building: 'assembler', inputs: { copper_bar: 1 }, outputs: { wire: 2 }, time: 2 },
};

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: { type: 'hq', w: 2, h: 2, cost: 0, power: 0, buildable: false, maxOut: 0, maxIn: 8, color: 0xff8a3d },
  miner: { type: 'miner', w: 1, h: 1, cost: 40, power: 1.5, buildable: true, maxOut: 2, maxIn: 0, color: 0x5d6b7d },
  furnace: { type: 'furnace', w: 1, h: 1, cost: 100, power: 3, buildable: true, maxOut: 2, maxIn: 3, color: 0xe0583a },
  assembler: { type: 'assembler', w: 1, h: 1, cost: 300, power: 5, buildable: true, maxOut: 2, maxIn: 3, color: 0x3d8bff, unlockQuest: 'q_assembler' },
  warehouse: { type: 'warehouse', w: 1, h: 1, cost: 150, power: 0, buildable: true, maxOut: 4, maxIn: 4, color: 0x8c7a5b, unlockQuest: 'q_warehouse' },
  coal_plant: { type: 'coal_plant', w: 2, h: 2, cost: 400, power: 0, buildable: true, maxOut: 0, maxIn: 3, color: 0x6f5ae0, unlockQuest: 'q_power' },
  depot: { type: 'depot', w: 1, h: 1, cost: 250, power: 0, buildable: true, maxOut: 0, maxIn: 4, color: 0x2fbf8f, unlockQuest: 'q_depot' },
};

export const BUILD_MENU_ORDER: BuildingType[] = ['miner', 'furnace', 'assembler', 'coal_plant', 'warehouse', 'depot'];

export const BALANCE = {
  startMoney: 200,

  // --- world ---
  worldSize: 32, // tiles (square)
  plotSize: 8, // land is bought in plots of plotSize×plotSize (Phase 2)
  /** plots unlocked at start, as [px, py] */
  startPlots: [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ] as [number, number][],

  // --- miners ---
  minerTime: 2, // seconds per ore at level 1

  // --- buffers ---
  inputBufferPerItem: 10,
  outputBufferTotal: 10,

  // --- storage ---
  warehouseCapacity: 200,
  warehouseCapacityPerLevel: 1.5, // multiplier per upgrade level

  // --- power ---
  hqPower: 6, // MW from the HQ's grid connection
  coalPlantPower: 20, // MW while burning
  coalBurnTime: 5, // seconds per coal
  coalPlantBuffer: 20,

  // --- belts ---
  beltCostPerTile: 2,
  beltBaseSpeed: 1.25,
  beltSpacing: 0.5, // min distance between items → throughput = speed / spacing
  beltSpeedUpgradeMult: 1.25,
  beltUpgradeBaseCost: 500,
  beltUpgradeCostMult: 2.5,
  beltMaxLevel: 8,

  // --- building upgrades ---
  upgradeCostMult: 1.8, // cost of level n→n+1 = buildCost * 1.8^n
  upgradeSpeedMult: 1.3, // speed ×1.3 per level
  upgradePowerMult: 1.2, // power draw ×1.2 per level
  maxBuildingLevel: 10,

  // --- refunds ---
  refundRate: 0.5,

  // --- offline ---
  offlineCapHours: 8,
  offlineMinSeconds: 60, // shorter absences are simulated in-game normally
  offlineSampleSeconds: 120, // how long we simulate to measure the factory's rate

  // --- sim ---
  tickSeconds: 0.1,
  autosaveSeconds: 10,
};

export function upgradeCost(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].cost * Math.pow(BALANCE.upgradeCostMult, level));
}

export function speedMult(level: number): number {
  return Math.pow(BALANCE.upgradeSpeedMult, level - 1);
}

export function powerDraw(type: BuildingType, level: number): number {
  return BUILDINGS[type].power * Math.pow(BALANCE.upgradePowerMult, level - 1);
}

export function beltSpeed(beltLevel: number): number {
  return BALANCE.beltBaseSpeed * Math.pow(BALANCE.beltSpeedUpgradeMult, beltLevel - 1);
}

export function beltUpgradeCost(beltLevel: number): number {
  return Math.round(BALANCE.beltUpgradeBaseCost * Math.pow(BALANCE.beltUpgradeCostMult, beltLevel - 1));
}

export function warehouseCapacity(level: number): number {
  return Math.round(BALANCE.warehouseCapacity * Math.pow(BALANCE.warehouseCapacityPerLevel, level - 1));
}

export function recipesFor(type: BuildingType): RecipeId[] {
  return (Object.keys(RECIPES) as RecipeId[]).filter((r) => RECIPES[r].building === type);
}

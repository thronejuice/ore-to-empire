import type { BuildingType, DepositId, ItemId, RecipeId } from '../config/balance';

export type Inventory = Partial<Record<ItemId, number>>;

export type BuildingStatus = 'working' | 'idle' | 'no_input' | 'output_full' | 'no_power' | 'no_fuel';

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  level: number;
  recipe: RecipeId | null;
  /** items waiting to be processed (or stored, for warehouses / coal plants) */
  input: Inventory;
  /** finished items waiting to leave on a belt */
  output: Inventory;
  /** 0..1 progress of the current craft */
  progress: number;
  crafting: boolean;
  /** coal plants: seconds of fuel left in the current lump */
  burn: number;
  status: BuildingStatus;
  /** round-robin pointer over outgoing belts */
  rr: number;
}

export interface BeltItem {
  item: ItemId;
  pos: number;
}

export interface Belt {
  id: number;
  from: number;
  to: number;
  /** grid cells the belt runs through (excluding the two buildings) */
  path: [number, number][];
  /** polyline in tile units, from the source edge to the destination edge */
  points: [number, number][];
  length: number;
  items: BeltItem[];
}

export interface Stats {
  totalEarned: number;
  sold: Inventory;
  produced: Inventory;
  /** money earned in each of the last 60 one-second buckets */
  incomeBuckets: number[];
  bucketTime: number;
}

export interface GameState {
  version: number;
  seed: number;
  money: number;
  time: number; // in-game seconds simulated
  lastSaved: number; // wall-clock ms
  world: { size: number; deposits: (DepositId | null)[]; plots: boolean[] };
  buildings: Building[];
  belts: Belt[];
  nextId: number;
  beltLevel: number;
  power: { gen: number; demand: number; satisfaction: number };
  stats: Stats;
  quests: { done: string[]; tutorialSkipped: boolean };
  settings: { lang: 'th' | 'en'; sound: boolean };
}

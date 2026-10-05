import type { BuildingType, CityId, DepositId, ItemId, RecipeId, ResearchId, VehicleType } from '../config/balance';

export type Inventory = Partial<Record<ItemId, number>>;

export type BuildingStatus = 'working' | 'idle' | 'no_input' | 'output_full' | 'no_power' | 'no_fuel' | 'locked';

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  level: number;
  recipe: RecipeId | null;
  /** items waiting to be processed (or stored, for warehouses / docks / plants) */
  input: Inventory;
  /** finished items waiting to leave on a belt */
  output: Inventory;
  progress: number;
  crafting: boolean;
  /** power plants: seconds of fuel left in the current lump */
  burn: number;
  /** batteries: stored energy (MJ) */
  charge?: number;
  /** storages: cumulative items received (offline catch-up uses it) */
  recv?: number;
  status: BuildingStatus;
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
  path: [number, number][];
  points: [number, number][];
  length: number;
  items: BeltItem[];
}

export interface Stats {
  totalEarned: number; // lifetime of this run
  sold: Inventory;
  produced: Inventory;
  incomeBuckets: number[];
  bucketTime: number;
  upgrades: number;
  contracts: number;
  research: number;
  trips: number;
  /** $ from instant sales at the HQ / depots (offline catch-up uses it) */
  localEarned: number;
}

export interface MarketState {
  /** saturation 0..1 per item (1 = full price) */
  sat: Inventory;
  /** slow random demand drift per item */
  trend: Inventory;
}

export interface MarketEvent {
  city: CityId;
  item: ItemId;
  mult: number;
  until: number; // game time
}

export interface Vehicle {
  id: number;
  type: VehicleType;
  city: CityId;
  /** 'auto' picks the best-paying goods for the destination */
  cargoFilter: ItemId | 'auto';
  phase: 'loading' | 'out' | 'back';
  t: number; // seconds spent in the current phase
  cargo: Inventory;
  lastTrip: number; // $ earned on the last trip
}

export interface Contract {
  id: number;
  item: ItemId;
  qty: number;
  progress: number;
  reward: number;
  duration: number; // seconds once accepted
  expiresAt: number; // game time (accepted contracts only)
}

export interface DailyMission {
  id: string;
  kind: 'sell' | 'earn' | 'upgrade' | 'contract' | 'research' | 'trips';
  item?: ItemId;
  target: number;
  base: number; // stat value when the mission was issued
  claimed: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  money: number;
  time: number;
  lastSaved: number;
  /** guards against clocks moved backwards: the latest wall-clock time we've seen */
  maxSeenTime: number;
  world: { size: number; deposits: (DepositId | null)[]; plots: boolean[] };
  buildings: Building[];
  belts: Belt[];
  nextId: number;
  beltLevel: number;
  power: { gen: number; demand: number; satisfaction: number; battery: number; batteryMax: number };
  stats: Stats;
  quests: { done: string[]; tutorialSkipped: boolean };
  settings: { lang: 'th' | 'en'; sound: boolean };

  // ---- Phase 2
  research: { done: ResearchId[]; active: { id: ResearchId; remaining: number } | null };
  markets: Partial<Record<CityId, MarketState>>;
  events: MarketEvent[];
  nextEventAt: number;
  trendTimer: number;
  vehicles: Vehicle[];
  rng: number;

  // ---- Phase 3
  prestige: { count: number; shares: number; perks: Partial<Record<string, number>>; lifetimeEarned: number };
  contracts: { offers: Contract[]; active: Contract[]; refreshAt: number };
  daily: { day: string; missions: DailyMission[]; bonusClaimed: boolean };

  // ---- Phase 4 (gems are mirrored from the server when signed in)
  gems: number;
  boostUntil: number; // wall-clock ms; income ×2 while active
  offlineBonusHours: number;
}

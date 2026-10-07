/**
 * ALL game-balance numbers live here. Tweak freely — nothing else in the
 * codebase hard-codes prices, speeds, costs or power values.
 *
 * Units: time = seconds · money = $ · power = MW · energy = MJ (MW·s) · belt speed = tiles/s
 */

// =============================================================================
// Items
// =============================================================================

export type ItemId =
  // tier 1 — raw
  | 'iron_ore'
  | 'copper_ore'
  | 'coal'
  | 'sand'
  | 'uranium_ore'
  // tier 2 — smelted
  | 'iron_bar'
  | 'copper_bar'
  | 'glass'
  | 'steel'
  // tier 3 — components
  | 'machine_part'
  | 'wire'
  | 'gear'
  | 'steel_beam'
  | 'fuel_rod'
  // tier 4 — assemblies
  | 'motor'
  | 'circuit'
  | 'battery_cell'
  | 'engine'
  // tier 5 — products
  | 'robot_arm'
  | 'computer'
  | 'electric_vehicle'
  // v1.2 zones — raw
  | 'fish'
  | 'sea_fish'
  | 'clay'
  | 'seaweed'
  | 'wood'
  | 'flower'
  | 'crude_oil'
  | 'gold_ore'
  | 'sulfur'
  | 'obsidian'
  // v1.2 — processed
  | 'brick'
  | 'charcoal'
  | 'gold_bar'
  | 'plastic'
  | 'lens'
  | 'rocket_fuel'
  | 'canned_food'
  | 'perfume'
  // tier 6–7
  | 'jewelry'
  | 'adv_chip'
  | 'satellite'
  | 'rocket';

export type DepositId =
  | 'iron_ore'
  | 'copper_ore'
  | 'coal'
  | 'sand'
  | 'uranium_ore'
  | 'clay'
  | 'wood'
  | 'flower'
  | 'crude_oil'
  | 'gold_ore'
  | 'sulfur'
  | 'obsidian';

/** market categories — each city pays differently per category */
export type Category = 'raw' | 'metal' | 'component' | 'electronics' | 'industrial' | 'energy' | 'vehicle' | 'food' | 'luxury' | 'space';

export interface ItemDef {
  id: ItemId;
  price: number; // base sell price per unit
  color: number;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  cat: Category;
}

const item = (id: ItemId, price: number, color: number, tier: ItemDef['tier'], cat: Category): ItemDef => ({ id, price, color, tier, cat });

export const ITEMS: Record<ItemId, ItemDef> = {
  iron_ore: item('iron_ore', 1, 0x8a9bb0, 1, 'raw'),
  copper_ore: item('copper_ore', 1.2, 0xd9824b, 1, 'raw'),
  coal: item('coal', 1.5, 0x3a3f47, 1, 'energy'),
  sand: item('sand', 1, 0xe6cf8f, 1, 'raw'),
  uranium_ore: item('uranium_ore', 8, 0x7fe36b, 1, 'energy'),

  iron_bar: item('iron_bar', 5, 0xc9d4e0, 2, 'metal'),
  copper_bar: item('copper_bar', 6, 0xf0a060, 2, 'metal'),
  glass: item('glass', 5, 0x9fe3f0, 2, 'metal'),
  steel: item('steel', 18, 0x7d8da3, 2, 'metal'),

  machine_part: item('machine_part', 14, 0x4fb3ff, 3, 'component'),
  wire: item('wire', 4, 0xffc94a, 3, 'component'),
  gear: item('gear', 8, 0xb0bccb, 3, 'component'),
  steel_beam: item('steel_beam', 45, 0x5d6f88, 3, 'component'),
  fuel_rod: item('fuel_rod', 120, 0x5fe08a, 3, 'energy'),

  motor: item('motor', 95, 0x6f7dff, 4, 'industrial'),
  circuit: item('circuit', 60, 0x2fbf8f, 4, 'electronics'),
  battery_cell: item('battery_cell', 70, 0xa0e050, 4, 'energy'),
  engine: item('engine', 260, 0xff7a59, 4, 'industrial'),

  robot_arm: item('robot_arm', 520, 0xffa23d, 5, 'industrial'),
  computer: item('computer', 600, 0x59d2ff, 5, 'electronics'),
  electric_vehicle: item('electric_vehicle', 2600, 0xff5fa2, 5, 'vehicle'),

  fish: item('fish', 2, 0x8fc7d9, 1, 'food'),
  sea_fish: item('sea_fish', 3, 0x4f8fd9, 1, 'food'),
  clay: item('clay', 1.5, 0xb87a56, 1, 'raw'),
  seaweed: item('seaweed', 2, 0x3f9a5c, 1, 'raw'),
  wood: item('wood', 1.5, 0x9a6b3f, 1, 'raw'),
  flower: item('flower', 3, 0xf07ab8, 1, 'luxury'),
  crude_oil: item('crude_oil', 4, 0x2b2530, 1, 'energy'),
  gold_ore: item('gold_ore', 10, 0xd9b64a, 1, 'raw'),
  sulfur: item('sulfur', 5, 0xe8e04a, 1, 'raw'),
  obsidian: item('obsidian', 8, 0x5a4a7a, 1, 'raw'),

  brick: item('brick', 7, 0xc8613f, 2, 'industrial'),
  charcoal: item('charcoal', 6, 0x55504c, 2, 'energy'),
  gold_bar: item('gold_bar', 45, 0xffd34a, 2, 'metal'),
  plastic: item('plastic', 18, 0xe8eef4, 2, 'component'),
  lens: item('lens', 40, 0xa58aff, 3, 'component'),
  rocket_fuel: item('rocket_fuel', 35, 0xff6a3d, 3, 'energy'),
  canned_food: item('canned_food', 20, 0xc0ccd8, 3, 'food'),
  perfume: item('perfume', 40, 0xff9ad5, 3, 'luxury'),

  jewelry: item('jewelry', 300, 0xffe27a, 6, 'luxury'),
  adv_chip: item('adv_chip', 480, 0x3ddcc4, 6, 'electronics'),
  satellite: item('satellite', 3200, 0xc8d6ff, 7, 'space'),
  rocket: item('rocket', 14000, 0xffffff, 7, 'space'),
};

// =============================================================================
// Buildings
// =============================================================================

export type BuildingType =
  | 'hq'
  | 'miner'
  | 'furnace'
  | 'assembler'
  | 'fabricator'
  | 'warehouse'
  | 'dock'
  | 'depot'
  | 'coal_plant'
  | 'solar'
  | 'battery'
  | 'nuclear_plant'
  | 'fishing_dock'
  | 'seaweed_farm'
  | 'clay_pit'
  | 'lumber_camp'
  | 'flower_garden'
  | 'oil_pump'
  | 'refinery'
  | 'geothermal';

export interface BuildingDef {
  type: BuildingType;
  w: number;
  h: number;
  cost: number;
  /** MW drawn while working (0 for non-consumers) */
  power: number;
  buildable: boolean;
  maxOut: number;
  maxIn: number;
  color: number;
  /** Phase-1 quest that unlocks it (reached = unlocked) */
  unlockQuest?: string;
  /** research that unlocks it */
  research?: ResearchId;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: { type: 'hq', w: 2, h: 2, cost: 0, power: 0, buildable: false, maxOut: 0, maxIn: 8, color: 0xff8a3d },
  miner: { type: 'miner', w: 1, h: 1, cost: 40, power: 1.5, buildable: true, maxOut: 2, maxIn: 0, color: 0x5d6b7d },
  furnace: { type: 'furnace', w: 1, h: 1, cost: 100, power: 3, buildable: true, maxOut: 2, maxIn: 3, color: 0xe0583a },
  assembler: { type: 'assembler', w: 1, h: 1, cost: 300, power: 5, buildable: true, maxOut: 2, maxIn: 3, color: 0x3d8bff, unlockQuest: 'q_assembler' },
  fabricator: { type: 'fabricator', w: 2, h: 2, cost: 6000, power: 12, buildable: true, maxOut: 2, maxIn: 4, color: 0x9d6bff, research: 'r_fabricator' },
  warehouse: { type: 'warehouse', w: 1, h: 1, cost: 150, power: 0, buildable: true, maxOut: 4, maxIn: 4, color: 0x8c7a5b, unlockQuest: 'q_warehouse' },
  dock: { type: 'dock', w: 2, h: 2, cost: 2500, power: 1, buildable: true, maxOut: 0, maxIn: 6, color: 0x23b5c9, research: 'r_trucks' },
  depot: { type: 'depot', w: 1, h: 1, cost: 250, power: 0, buildable: true, maxOut: 0, maxIn: 4, color: 0x2fbf8f, unlockQuest: 'q_depot' },
  coal_plant: { type: 'coal_plant', w: 2, h: 2, cost: 400, power: 0, buildable: true, maxOut: 0, maxIn: 3, color: 0x6f5ae0, unlockQuest: 'q_power' },
  solar: { type: 'solar', w: 1, h: 1, cost: 1500, power: 0, buildable: true, maxOut: 0, maxIn: 0, color: 0x3fa9f5, research: 'r_solar' },
  battery: { type: 'battery', w: 1, h: 1, cost: 4000, power: 0, buildable: true, maxOut: 0, maxIn: 0, color: 0xa0e050, research: 'r_battery' },
  nuclear_plant: { type: 'nuclear_plant', w: 3, h: 3, cost: 90000, power: 0, buildable: true, maxOut: 0, maxIn: 3, color: 0x5fe08a, research: 'r_nuclear' },
  fishing_dock: { type: 'fishing_dock', w: 1, h: 1, cost: 600, power: 1, buildable: true, maxOut: 2, maxIn: 0, color: 0x4f8fd9, research: 'r_fishing' },
  seaweed_farm: { type: 'seaweed_farm', w: 1, h: 1, cost: 500, power: 0.5, buildable: true, maxOut: 2, maxIn: 0, color: 0x3f9a5c, research: 'r_marine' },
  clay_pit: { type: 'clay_pit', w: 1, h: 1, cost: 400, power: 1.5, buildable: true, maxOut: 2, maxIn: 0, color: 0xb87a56, research: 'r_fishing' },
  lumber_camp: { type: 'lumber_camp', w: 1, h: 1, cost: 400, power: 1, buildable: true, maxOut: 2, maxIn: 0, color: 0x9a6b3f, research: 'r_forestry' },
  flower_garden: { type: 'flower_garden', w: 1, h: 1, cost: 500, power: 0.5, buildable: true, maxOut: 2, maxIn: 0, color: 0xf07ab8, research: 'r_forestry' },
  oil_pump: { type: 'oil_pump', w: 1, h: 1, cost: 2500, power: 4, buildable: true, maxOut: 2, maxIn: 0, color: 0x8a7a9a, research: 'r_petroleum' },
  refinery: { type: 'refinery', w: 2, h: 2, cost: 15000, power: 10, buildable: true, maxOut: 2, maxIn: 3, color: 0xd98a3f, research: 'r_petroleum' },
  geothermal: { type: 'geothermal', w: 2, h: 2, cost: 40000, power: 0, buildable: true, maxOut: 0, maxIn: 0, color: 0xff5a3d, research: 'r_geology' },
};

export const BUILD_MENU_ORDER: BuildingType[] = [
  'miner',
  'furnace',
  'assembler',
  'fabricator',
  'coal_plant',
  'solar',
  'battery',
  'nuclear_plant',
  'warehouse',
  'depot',
  'dock',
  'lumber_camp',
  'flower_garden',
  'fishing_dock',
  'clay_pit',
  'seaweed_farm',
  'oil_pump',
  'refinery',
  'geothermal',
];

/** Buildings that gather a raw resource from the tile they stand on. */
export interface ExtractorDef {
  /** seconds per item at level 1 */
  time: number;
  /** deposits it can stand on (it extracts the deposit itself) */
  deposits?: DepositId[];
  /** water it can stand on, and what it catches there */
  water?: Partial<Record<'river' | 'sea', ItemId>>;
}

export const EXTRACTORS: Partial<Record<BuildingType, ExtractorDef>> = {
  miner: { time: 2, deposits: ['iron_ore', 'copper_ore', 'coal', 'sand', 'uranium_ore', 'gold_ore', 'sulfur', 'obsidian'] },
  clay_pit: { time: 2, deposits: ['clay'] },
  lumber_camp: { time: 2.5, deposits: ['wood'] },
  flower_garden: { time: 4, deposits: ['flower'] },
  oil_pump: { time: 3, deposits: ['crude_oil'] },
  fishing_dock: { time: 3, water: { river: 'fish', sea: 'sea_fish' } },
  seaweed_farm: { time: 3, water: { sea: 'seaweed' } },
};

// =============================================================================
// Recipes
// =============================================================================

export type RecipeId =
  | 'iron_bar'
  | 'copper_bar'
  | 'glass'
  | 'steel'
  | 'machine_part'
  | 'wire'
  | 'gear'
  | 'steel_beam'
  | 'fuel_rod'
  | 'motor'
  | 'circuit'
  | 'battery_cell'
  | 'engine'
  | 'robot_arm'
  | 'computer'
  | 'electric_vehicle'
  | 'brick'
  | 'charcoal'
  | 'gold_bar'
  | 'lens'
  | 'plastic'
  | 'bioplastic'
  | 'rocket_fuel'
  | 'canned_food'
  | 'canned_food_river'
  | 'perfume'
  | 'jewelry'
  | 'adv_chip'
  | 'satellite'
  | 'rocket';

export interface RecipeDef {
  id: RecipeId;
  building: BuildingType;
  inputs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
  time: number;
  research?: ResearchId;
}

const recipe = (
  id: RecipeId,
  building: BuildingType,
  inputs: RecipeDef['inputs'],
  outputs: RecipeDef['outputs'],
  time: number,
  research?: ResearchId,
): RecipeDef => ({ id, building, inputs, outputs, time, research });

export const RECIPES: Record<RecipeId, RecipeDef> = {
  iron_bar: recipe('iron_bar', 'furnace', { iron_ore: 2 }, { iron_bar: 1 }, 3),
  copper_bar: recipe('copper_bar', 'furnace', { copper_ore: 2 }, { copper_bar: 1 }, 3),
  glass: recipe('glass', 'furnace', { sand: 2 }, { glass: 1 }, 3, 'r_glass'),
  steel: recipe('steel', 'furnace', { iron_bar: 2, coal: 1 }, { steel: 1 }, 5, 'r_steel'),

  machine_part: recipe('machine_part', 'assembler', { iron_bar: 2 }, { machine_part: 1 }, 4),
  wire: recipe('wire', 'assembler', { copper_bar: 1 }, { wire: 2 }, 2),
  gear: recipe('gear', 'assembler', { iron_bar: 1 }, { gear: 1 }, 2, 'r_gears'),
  steel_beam: recipe('steel_beam', 'assembler', { steel: 2 }, { steel_beam: 1 }, 6, 'r_gears'),
  fuel_rod: recipe('fuel_rod', 'assembler', { uranium_ore: 3, steel: 1 }, { fuel_rod: 1 }, 8, 'r_nuclear'),

  motor: recipe('motor', 'fabricator', { machine_part: 2, gear: 1, wire: 3 }, { motor: 1 }, 6, 'r_fabricator'),
  circuit: recipe('circuit', 'fabricator', { wire: 3, glass: 1, copper_bar: 1 }, { circuit: 1 }, 4, 'r_fabricator'),
  battery_cell: recipe('battery_cell', 'fabricator', { copper_bar: 2, steel: 1 }, { battery_cell: 1 }, 5, 'r_battery'),
  engine: recipe('engine', 'fabricator', { motor: 1, steel_beam: 2 }, { engine: 1 }, 10, 'r_engine'),
  robot_arm: recipe('robot_arm', 'fabricator', { motor: 2, circuit: 2 }, { robot_arm: 1 }, 15, 'r_robotics'),
  computer: recipe('computer', 'fabricator', { circuit: 4, glass: 1, steel_beam: 1 }, { computer: 1 }, 15, 'r_computing'),
  electric_vehicle: recipe('electric_vehicle', 'fabricator', { motor: 2, battery_cell: 3, computer: 1 }, { electric_vehicle: 1 }, 30, 'r_ev'),

  brick: recipe('brick', 'furnace', { clay: 2 }, { brick: 1 }, 3, 'r_fishing'),
  charcoal: recipe('charcoal', 'furnace', { wood: 2 }, { charcoal: 1 }, 3, 'r_forestry'),
  gold_bar: recipe('gold_bar', 'furnace', { gold_ore: 2 }, { gold_bar: 1 }, 5, 'r_petroleum'),
  lens: recipe('lens', 'furnace', { obsidian: 2 }, { lens: 1 }, 6, 'r_geology'),
  plastic: recipe('plastic', 'refinery', { crude_oil: 2 }, { plastic: 1 }, 4, 'r_petroleum'),
  bioplastic: recipe('bioplastic', 'assembler', { seaweed: 3 }, { plastic: 1 }, 4, 'r_marine'),
  rocket_fuel: recipe('rocket_fuel', 'refinery', { crude_oil: 2, sulfur: 1 }, { rocket_fuel: 1 }, 6, 'r_geology'),
  canned_food: recipe('canned_food', 'assembler', { sea_fish: 2, iron_bar: 1 }, { canned_food: 1 }, 4, 'r_fishing'),
  canned_food_river: recipe('canned_food_river', 'assembler', { fish: 3, iron_bar: 1 }, { canned_food: 1 }, 4, 'r_fishing'),
  perfume: recipe('perfume', 'assembler', { flower: 4, glass: 1 }, { perfume: 1 }, 5, 'r_forestry'),
  jewelry: recipe('jewelry', 'fabricator', { gold_bar: 2, lens: 1 }, { jewelry: 1 }, 12, 'r_microchips'),
  adv_chip: recipe('adv_chip', 'fabricator', { circuit: 2, gold_bar: 1, plastic: 2 }, { adv_chip: 1 }, 15, 'r_microchips'),
  satellite: recipe('satellite', 'fabricator', { adv_chip: 2, battery_cell: 2, lens: 2, plastic: 4 }, { satellite: 1 }, 40, 'r_aerospace'),
  rocket: recipe('rocket', 'fabricator', { engine: 4, rocket_fuel: 20, satellite: 1, steel_beam: 6 }, { rocket: 1 }, 90, 'r_aerospace'),
};

// =============================================================================
// Research
// =============================================================================

export type ResearchId =
  | 'r_trucks'
  | 'r_steel'
  | 'r_glass'
  | 'r_automation_1'
  | 'r_gears'
  | 'r_fabricator'
  | 'r_solar'
  | 'r_belts_2'
  | 'r_rail'
  | 'r_efficiency_1'
  | 'r_logistics'
  | 'r_battery'
  | 'r_engine'
  | 'r_containers'
  | 'r_automation_2'
  | 'r_port'
  | 'r_robotics'
  | 'r_computing'
  | 'r_nuclear'
  | 'r_belts_3'
  | 'r_export'
  | 'r_ev'
  | 'r_automation_3'
  | 'r_efficiency_2'
  | 'r_forestry'
  | 'r_fishing'
  | 'r_marine'
  | 'r_petroleum'
  | 'r_geology'
  | 'r_microchips'
  | 'r_aerospace';

export interface ResearchDef {
  id: ResearchId;
  /** column in the tree (A=0 … F=5) */
  tier: number;
  cost: number;
  time: number;
  requires: ResearchId[];
  /** passive effects */
  speed?: number; // +x machine speed (0.1 = +10 %)
  powerSave?: number; // −x power use
  beltMax?: number; // new max belt level
  capacity?: number; // +x vehicle capacity
  moveDiscount?: number; // −x moving fees
}

const r = (id: ResearchId, tier: number, cost: number, time: number, requires: ResearchId[], extra: Partial<ResearchDef> = {}): ResearchDef => ({
  id,
  tier,
  cost,
  time,
  requires,
  ...extra,
});

export const RESEARCH: Record<ResearchId, ResearchDef> = {
  r_trucks: r('r_trucks', 0, 3000, 60, []),
  r_steel: r('r_steel', 0, 2500, 60, []),
  r_glass: r('r_glass', 0, 2000, 45, []),
  r_automation_1: r('r_automation_1', 0, 5000, 120, [], { speed: 0.1 }),

  r_gears: r('r_gears', 1, 8000, 120, ['r_steel']),
  r_fabricator: r('r_fabricator', 1, 20000, 300, ['r_gears', 'r_glass']),
  r_solar: r('r_solar', 1, 12000, 180, ['r_glass']),
  r_belts_2: r('r_belts_2', 1, 10000, 180, ['r_automation_1'], { beltMax: 5 }),
  r_rail: r('r_rail', 1, 25000, 300, ['r_trucks']),
  r_efficiency_1: r('r_efficiency_1', 1, 15000, 240, ['r_automation_1'], { powerSave: 0.15 }),
  r_logistics: r('r_logistics', 1, 12000, 180, ['r_automation_1'], { moveDiscount: 0.5 }),

  r_battery: r('r_battery', 2, 40000, 480, ['r_fabricator', 'r_solar']),
  r_engine: r('r_engine', 2, 50000, 480, ['r_fabricator']),
  r_containers: r('r_containers', 2, 40000, 420, ['r_rail'], { capacity: 0.5 }),
  r_automation_2: r('r_automation_2', 2, 60000, 600, ['r_automation_1', 'r_fabricator'], { speed: 0.15 }),
  r_port: r('r_port', 2, 120000, 900, ['r_rail']),

  r_robotics: r('r_robotics', 3, 150000, 1200, ['r_engine']),
  r_computing: r('r_computing', 3, 180000, 1200, ['r_battery']),
  r_nuclear: r('r_nuclear', 3, 250000, 1800, ['r_battery', 'r_efficiency_1']),
  r_belts_3: r('r_belts_3', 3, 120000, 900, ['r_belts_2', 'r_automation_2'], { beltMax: 8 }),
  r_export: r('r_export', 3, 300000, 1800, ['r_port']),

  r_ev: r('r_ev', 4, 600000, 3600, ['r_robotics', 'r_computing']),
  r_automation_3: r('r_automation_3', 4, 500000, 3600, ['r_automation_2', 'r_computing'], { speed: 0.2 }),
  r_efficiency_2: r('r_efficiency_2', 4, 400000, 2400, ['r_efficiency_1', 'r_nuclear'], { powerSave: 0.2 }),

  r_forestry: r('r_forestry', 1, 15000, 180, ['r_automation_1']),
  r_fishing: r('r_fishing', 1, 20000, 240, ['r_trucks']),
  r_marine: r('r_marine', 2, 60000, 480, ['r_fishing', 'r_rail']),
  r_petroleum: r('r_petroleum', 2, 80000, 600, ['r_fabricator']),
  r_geology: r('r_geology', 3, 250000, 1200, ['r_petroleum', 'r_battery']),
  r_microchips: r('r_microchips', 4, 800000, 2400, ['r_computing', 'r_petroleum']),
  r_aerospace: r('r_aerospace', 5, 3000000, 5400, ['r_microchips', 'r_geology']),
};

// =============================================================================
// Markets & logistics
// =============================================================================

export type CityId = 'local' | 'bangkok' | 'chiangmai' | 'singapore' | 'tokyo';
export type VehicleType = 'truck' | 'train' | 'ship';

export interface CityDef {
  id: CityId;
  /** one-way travel time for a truck (speed 1), seconds. 0 = sold instantly at HQ / depots */
  travel: number;
  /** price multiplier per category */
  mult: Record<Category, number>;
  /**
   * Market depth in $/s: selling `depth` dollars per second of one item holds its price
   * at roughly half. Deeper markets absorb more before the price drops.
   */
  depth: number;
  vehicles: VehicleType[];
  research?: ResearchId;
}

const m = (
  raw: number,
  metal: number,
  component: number,
  electronics: number,
  industrial: number,
  energy: number,
  vehicle: number,
  food: number,
  luxury: number,
  space: number,
) => ({ raw, metal, component, electronics, industrial, energy, vehicle, food, luxury, space });

export const CITIES: Record<CityId, CityDef> = {
  local: { id: 'local', travel: 0, mult: m(1, 1, 1, 0.6, 0.6, 0.9, 0.4, 1, 0.7, 0.3), depth: 20, vehicles: [] },
  bangkok: { id: 'bangkok', travel: 45, mult: m(0.9, 1.15, 1.3, 1.45, 1.25, 1.1, 1.3, 1.3, 1.4, 1), depth: 60, vehicles: ['truck', 'train'], research: 'r_trucks' },
  chiangmai: { id: 'chiangmai', travel: 120, mult: m(0.8, 1.1, 1.25, 1.2, 1.65, 1.35, 1.4, 1.1, 1.2, 0.9), depth: 90, vehicles: ['truck', 'train'], research: 'r_rail' },
  singapore: { id: 'singapore', travel: 300, mult: m(0.7, 1.2, 1.3, 1.9, 1.4, 1.6, 1.7, 1.5, 1.8, 1.6), depth: 300, vehicles: ['ship'], research: 'r_port' },
  tokyo: { id: 'tokyo', travel: 450, mult: m(0.7, 1.1, 1.4, 1.7, 2.0, 1.4, 1.9, 1.6, 1.7, 2), depth: 400, vehicles: ['ship'], research: 'r_export' },
};

export const CITY_ORDER: CityId[] = ['local', 'bangkok', 'chiangmai', 'singapore', 'tokyo'];

export interface VehicleDef {
  type: VehicleType;
  capacity: number;
  /** travel-time divisor (2 = twice as fast as a truck) */
  speed: number;
  cost: number;
  research: ResearchId;
}

export const VEHICLES: Record<VehicleType, VehicleDef> = {
  truck: { type: 'truck', capacity: 30, speed: 1, cost: 1500, research: 'r_trucks' },
  train: { type: 'train', capacity: 120, speed: 1.5, cost: 25000, research: 'r_rail' },
  ship: { type: 'ship', capacity: 600, speed: 0.6, cost: 120000, research: 'r_port' },
};

export const MARKET = {
  recovery: 0.02, // fraction of the gap to full price recovered per second
  minSat: 0.15, // price never falls below 15 % of normal
  trendInterval: 60, // seconds between demand drifts
  trendVolatility: 0.08,
  trendMin: 0.7,
  trendMax: 1.45,
  eventInterval: 480, // average seconds between news events
  eventDuration: 600,
  eventMult: 1.6,
  vehicleMaxWait: 20, // seconds a vehicle waits at the dock before leaving partly loaded
};

// =============================================================================
// Power
// =============================================================================

export const POWER = {
  hq: 6,
  coalPlant: 20,
  coalBurnTime: 2.5, // 24 coal/min — about what one drill on normal ore digs, so its belt keeps flowing
  coalBuffer: 20,
  solar: 2.5,
  batteryCapacity: 900, // MJ
  batteryRate: 15, // MW in/out
  nuclear: 250,
  nuclearBurnTime: 90,
  nuclearBuffer: 6,
  geothermal: 60,
};

// =============================================================================
// Land
// =============================================================================

export const LAND = {
  basePrice: 3000,
  growth: 2.2,
  /** plots in the outer zones: zone base price × zoneGrowth^(plots already owned there) */
  zoneGrowth: 1.35,
};

// =============================================================================
// Zones (v1.2): the map is 8×8 plots; the old 32×32 map is the "home" block in
// the middle (plots 2..5), and five terrain zones surround it.
// =============================================================================

export type ZoneId = 'home' | 'forest' | 'river' | 'sea' | 'desert' | 'volcano';

export interface ZoneDef {
  id: ZoneId;
  /** licence price (0 = always open) */
  licence: number;
  research?: ResearchId;
  /** investor shares granted with the licence */
  shares: number;
  /** price of the first plot in the zone */
  landBase: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  home: { id: 'home', licence: 0, shares: 0, landBase: 0 },
  forest: { id: 'forest', licence: 30_000, research: 'r_forestry', shares: 2, landBase: 20_000 },
  river: { id: 'river', licence: 40_000, research: 'r_fishing', shares: 2, landBase: 30_000 },
  sea: { id: 'sea', licence: 150_000, research: 'r_marine', shares: 3, landBase: 80_000 },
  desert: { id: 'desert', licence: 250_000, research: 'r_petroleum', shares: 4, landBase: 150_000 },
  volcano: { id: 'volcano', licence: 800_000, research: 'r_geology', shares: 6, landBase: 500_000 },
};

export const ZONE_ORDER: ZoneId[] = ['forest', 'river', 'sea', 'desert', 'volcano'];

/** zone of each plot, row by row (F forest, V volcano, D desert, H home, R river, S sea) */
export const ZONE_MAP = ['FFVVVVDD', 'FFVVVVDD', 'FFHHHHDD', 'FFHHHHDD', 'FFHHHHDD', 'FFHHHHDD', 'SRRRRRRS', 'SSSSSSSS'];

/** tile terrain codes stored in world.terrain */
export const TERRAIN = { land: 0, river: 1, sea: 2, vent: 3 } as const;

// =============================================================================
// General
// =============================================================================

export const BALANCE = {
  startMoney: 200,

  worldSize: 64,
  plotSize: 8,
  /** size of the pre-v1.2 map; it sits in the middle of the big one as the home zone */
  legacySize: 32,
  startPlots: [
    [3, 3],
    [4, 3],
    [3, 4],
    [4, 4],
  ] as [number, number][],

  minerTime: 2,
  inputBufferPerItem: 10,
  outputBufferTotal: 10,

  warehouseCapacity: 200,
  warehouseCapacityPerLevel: 1.5,
  dockCapacity: 300,

  beltCostPerTile: 2,
  bridgeCostPerTile: 10, // belt tiles over water
  beltBaseSpeed: 1.25,
  beltSpacing: 0.5,
  beltSpeedUpgradeMult: 1.25,
  beltUpgradeBaseCost: 500,
  beltUpgradeCostMult: 2.5,
  beltBaseMaxLevel: 3, // research raises it (r_belts_2/3)

  upgradeCostMult: 1.8,
  upgradeSpeedMult: 1.3,
  upgradePowerMult: 1.2,
  maxBuildingLevel: 10,

  refundRate: 0.5,

  offlineCapHours: 8,
  offlineMinSeconds: 60,
  offlineSampleSeconds: 120,
  offlineMacroStep: 5,

  tickSeconds: 0.1,
  autosaveSeconds: 10,
};

// =============================================================================
// Helpers
// =============================================================================

export function upgradeCost(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].cost * Math.pow(BALANCE.upgradeCostMult, level));
}

export function levelSpeed(level: number): number {
  return Math.pow(BALANCE.upgradeSpeedMult, level - 1);
}

export function levelPower(type: BuildingType, level: number): number {
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

export function storageCapacity(type: BuildingType, level: number): number {
  return type === 'dock' ? Math.round(BALANCE.dockCapacity * Math.pow(BALANCE.warehouseCapacityPerLevel, level - 1)) : warehouseCapacity(level);
}

export function landPrice(plotsBought: number): number {
  return Math.round(LAND.basePrice * Math.pow(LAND.growth, plotsBought));
}

export function zoneLandPrice(zone: ZoneId, plotsOwnedThere: number): number {
  return Math.round(ZONES[zone].landBase * Math.pow(LAND.zoneGrowth, plotsOwnedThere));
}

export function allRecipesFor(type: BuildingType): RecipeId[] {
  return (Object.keys(RECIPES) as RecipeId[]).filter((id) => RECIPES[id].building === type);
}

/** Phase-1 alias kept for older imports */
export const speedMult = levelSpeed;
export const powerDraw = levelPower;

// =============================================================================
// Ore grades & rich veins
// =============================================================================

/** grade index stored per tile: 0 = low, 1 = normal, 2 = high */
export const GRADE_MULT = [0.6, 1, 1.5] as const;

export const VEINS = {
  mult: 3, // extra speed on a rich vein (on top of the tile's grade)
  maxActive: 2,
  firstAfter: 180, // seconds of play before the first vein (after the tutorial)
  interval: [480, 900] as [number, number], // seconds between new veins
  unclaimedTtl: 1200, // a vein no drill touches disappears after 20 min
  lowFraction: 0.25, // "running low" warning
  amount: { iron_ore: 1500, copper_ore: 1200, coal: 1000, sand: 1000, uranium_ore: 300, gold_ore: 400, sulfur: 800, obsidian: 600 } as Partial<Record<DepositId, number>>,
};

// =============================================================================
// Moving buildings
// =============================================================================

export const MOVE = {
  rate: 0.1, // fee = 10 % of what the building is worth (build + upgrades)
  min: 10,
  hqFee: 1000, // the HQ costs nothing to build, so it has a flat fee
  freeSeconds: 60, // moving right after building is free (fixing a misplacement)
};

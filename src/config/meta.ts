/**
 * Meta-progression numbers: prestige, contracts, daily missions, gem shop.
 * Like balance.ts, everything tunable lives here.
 */

// =============================================================================
// Prestige — "Sell the company"
// =============================================================================

export const PRESTIGE = {
  /** minimum money earned this run before the company can be sold */
  minRunEarned: 1_000_000,
  /** shares = floor(sqrt(runEarned / divisor)) */
  divisor: 40_000,
  /** each unspent share adds this much to all sale prices */
  incomePerShare: 0.02,
};

export type PerkId = 'p_cash' | 'p_speed' | 'p_trade' | 'p_offline' | 'p_research' | 'p_land';

export interface PerkDef {
  id: PerkId;
  max: number;
  /** cost in shares of level n → n+1 */
  cost: (level: number) => number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  p_cash: { id: 'p_cash', max: 10, cost: () => 1 }, // +$5,000 starting money per level
  p_speed: { id: 'p_speed', max: 10, cost: (l) => 2 + l }, // +5 % machine speed per level
  p_trade: { id: 'p_trade', max: 10, cost: (l) => 2 + l }, // +5 % sale prices per level
  p_offline: { id: 'p_offline', max: 4, cost: (l) => 3 + l * 2 }, // +1 h offline cap per level
  p_research: { id: 'p_research', max: 2, cost: (l) => (l === 0 ? 6 : 18) }, // keep tier A (then A+B) research
  p_land: { id: 'p_land', max: 2, cost: (l) => (l === 0 ? 8 : 20) }, // start with extra land plots
};

export const PERK_ORDER: PerkId[] = ['p_cash', 'p_speed', 'p_trade', 'p_offline', 'p_research', 'p_land'];

export const PERK_VALUES = {
  cashPerLevel: 5000,
  speedPerLevel: 0.05,
  tradePerLevel: 0.05,
  offlineHoursPerLevel: 1,
};

// =============================================================================
// Contracts
// =============================================================================

export const CONTRACTS = {
  offers: 3,
  maxActive: 2,
  refreshSeconds: 20 * 60,
  rerollCost: 0.02, // fraction of current money (min $200)
  minValue: 1500,
  /** target value = income-per-minute × U(min,max) minutes */
  valueMinutes: [5, 12] as [number, number],
  durationMinutes: [20, 45] as [number, number],
  rewardMult: [1.6, 2.3] as [number, number],
};

// =============================================================================
// Daily missions (3 per local day)
// =============================================================================

export const DAILY = {
  count: 3,
  gemsEach: 5,
  gemsBonus: 10, // for finishing all three — 25 gems/day total (the server enforces the same cap)
};

// =============================================================================
// Gem shop & packs (Phase 4). Prices are mirrored on the server — the server's table wins.
// =============================================================================

export type GemItemId = 'skip_1h' | 'boost_4h' | 'offline_plus4';

export interface GemItemDef {
  id: GemItemId;
  gems: number;
  max?: number; // permanent items only
}

export const GEM_ITEMS: Record<GemItemId, GemItemDef> = {
  skip_1h: { id: 'skip_1h', gems: 20 },
  boost_4h: { id: 'boost_4h', gems: 50 },
  offline_plus4: { id: 'offline_plus4', gems: 300, max: 4 }, // up to +16 h → 24 h total
};

export const GEM_ITEM_ORDER: GemItemId[] = ['skip_1h', 'boost_4h', 'offline_plus4'];

export type PackId = 'pack_s' | 'pack_m' | 'pack_l' | 'pack_xl' | 'starter';

export interface PackDef {
  id: PackId;
  gems: number;
  bonusPct: number;
  priceThb: number;
  boostHours?: number;
  oncePerAccount?: boolean;
}

export const PACKS: Record<PackId, PackDef> = {
  pack_s: { id: 'pack_s', gems: 100, bonusPct: 0, priceThb: 35 },
  pack_m: { id: 'pack_m', gems: 550, bonusPct: 10, priceThb: 179 },
  pack_l: { id: 'pack_l', gems: 1200, bonusPct: 20, priceThb: 349 },
  pack_xl: { id: 'pack_xl', gems: 3250, bonusPct: 30, priceThb: 899 },
  starter: { id: 'starter', gems: 500, bonusPct: 0, priceThb: 99, boostHours: 24, oncePerAccount: true },
};

export const PACK_ORDER: PackId[] = ['starter', 'pack_s', 'pack_m', 'pack_l', 'pack_xl'];

export const BOOST = {
  incomeMult: 2,
  hours: 4,
};

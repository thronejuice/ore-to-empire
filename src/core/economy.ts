import {
  BALANCE,
  CITIES,
  RECIPES,
  RESEARCH,
  VEHICLES,
  allRecipesFor,
  type BuildingType,
  type CityId,
  type RecipeId,
  type ResearchId,
  type VehicleType,
} from '../config/balance';
import { BOOST, PERK_VALUES, PRESTIGE } from '../config/meta';
import type { GameState } from './types';

/** Shared multipliers and unlock checks. Pure functions of the state. */

export function hasResearch(s: GameState, id: ResearchId | undefined): boolean {
  return !id || s.research.done.includes(id);
}

export function perk(s: GameState, id: string): number {
  return s.prestige.perks[id] ?? 0;
}

/** machine speed multiplier from research + prestige perks */
export function globalSpeed(s: GameState): number {
  let bonus = 0;
  for (const id of s.research.done) bonus += RESEARCH[id].speed ?? 0;
  bonus += perk(s, 'p_speed') * PERK_VALUES.speedPerLevel;
  return 1 + bonus;
}

/** power-use multiplier from efficiency research */
export function powerMult(s: GameState): number {
  let m = 1;
  for (const id of s.research.done) m *= 1 - (RESEARCH[id].powerSave ?? 0);
  return m;
}

export function boostActive(s: GameState, now = Date.now()): boolean {
  return s.boostUntil > now;
}

/** multiplier on every sale: prestige shares, trade perk, gem boost */
export function incomeMult(s: GameState, now = Date.now()): number {
  const base = 1 + s.prestige.shares * PRESTIGE.incomePerShare + perk(s, 'p_trade') * PERK_VALUES.tradePerLevel;
  return base * (boostActive(s, now) ? BOOST.incomeMult : 1);
}

export function beltMaxLevel(s: GameState): number {
  let max = BALANCE.beltBaseMaxLevel;
  for (const id of s.research.done) max = Math.max(max, RESEARCH[id].beltMax ?? 0);
  return max;
}

export function vehicleCapacity(s: GameState, type: VehicleType): number {
  let bonus = 0;
  for (const id of s.research.done) bonus += RESEARCH[id].capacity ?? 0;
  return Math.round(VEHICLES[type].capacity * (1 + bonus));
}

export function offlineCapHours(s: GameState): number {
  return BALANCE.offlineCapHours + s.offlineBonusHours + perk(s, 'p_offline') * PERK_VALUES.offlineHoursPerLevel;
}

export function recipeUnlocked(s: GameState, id: RecipeId): boolean {
  return hasResearch(s, RECIPES[id].research);
}

export function recipesFor(s: GameState, type: BuildingType): RecipeId[] {
  return allRecipesFor(type).filter((id) => recipeUnlocked(s, id));
}

export function cityUnlocked(s: GameState, city: CityId): boolean {
  return hasResearch(s, CITIES[city].research);
}

export function incomePerMinute(s: GameState): number {
  return s.stats.incomeBuckets.reduce((a, b) => a + b, 0);
}

/** records income into the rolling one-minute window and run totals */
export function addIncome(s: GameState, amount: number) {
  s.money += amount;
  s.stats.totalEarned += amount;
  s.prestige.lifetimeEarned += amount;
  s.stats.incomeBuckets[s.stats.incomeBuckets.length - 1] += amount;
}

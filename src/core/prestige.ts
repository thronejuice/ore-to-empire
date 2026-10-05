import { RESEARCH, type ResearchId } from '../config/balance';
import { PERKS, PERK_VALUES, PRESTIGE, type PerkId } from '../config/meta';
import { grantFreePlots } from './land';
import { QUESTS } from './quests';
import { newGame } from './state';
import type { GameState } from './types';

/** "Sell the company": reset the factory for permanent investor shares. */

export function sharesFor(runEarned: number): number {
  return Math.floor(Math.sqrt(Math.max(0, runEarned) / PRESTIGE.divisor));
}

export function canPrestige(s: GameState): boolean {
  return s.stats.totalEarned >= PRESTIGE.minRunEarned;
}

/** Earned this run → money needed for the next extra share (for the UI). */
export function nextShareAt(runEarned: number): number {
  const n = sharesFor(runEarned) + 1;
  return n * n * PRESTIGE.divisor;
}

export function perkCost(s: GameState, id: PerkId): number | null {
  const lvl = s.prestige.perks[id] ?? 0;
  if (lvl >= PERKS[id].max) return null;
  return PERKS[id].cost(lvl);
}

export function buyPerk(s: GameState, id: PerkId): string | null {
  const cost = perkCost(s, id);
  if (cost === null) return 'err.maxLevel';
  if (s.prestige.shares < cost) return 'err.noShares';
  s.prestige.shares -= cost;
  s.prestige.perks[id] = (s.prestige.perks[id] ?? 0) + 1;
  return null;
}

/**
 * Builds the next run. Keeps: prestige (with the new shares), settings, gems, boosts,
 * daily missions and Phase-1 quest progress. Perks apply their head starts.
 */
export function prestige(s: GameState, seed = Math.floor(Math.random() * 1e9), now = Date.now()): GameState {
  const gained = sharesFor(s.stats.totalEarned);
  const next = newGame(seed, now);
  next.settings = { ...s.settings };
  next.prestige = {
    count: s.prestige.count + 1,
    shares: s.prestige.shares + gained,
    perks: { ...s.prestige.perks },
    lifetimeEarned: s.prestige.lifetimeEarned,
  };
  next.gems = s.gems;
  next.boostUntil = s.boostUntil;
  next.offlineBonusHours = s.offlineBonusHours;
  next.daily = s.daily;
  next.quests = { done: QUESTS.map((q) => q.id), tutorialSkipped: true };
  next.money += (next.prestige.perks.p_cash ?? 0) * PERK_VALUES.cashPerLevel;

  const keepTier = (next.prestige.perks.p_research ?? 0) - 1; // 0 → tier A, 1 → tiers A+B
  if (keepTier >= 0) {
    next.research.done = s.research.done.filter((id: ResearchId) => RESEARCH[id].tier <= keepTier);
  }
  grantFreePlots(next, next.prestige.perks.p_land ?? 0);
  return next;
}

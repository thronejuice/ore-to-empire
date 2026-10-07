import { ITEMS, type ItemId } from '../config/balance';
import { DAILY } from '../config/meta';
import { incomePerMinute } from './economy';
import { metaUnlocked } from './quests';
import { researchState } from './research';
import { rand, todayKey } from './state';
import type { DailyMission, GameState } from './types';
import { RESEARCH, type ResearchId } from '../config/balance';

/**
 * Three missions per local calendar day. Progress is "stat now − stat when issued",
 * so nothing has to hook into every system.
 */

const SELL_TARGET: Record<number, number> = { 1: 300, 2: 150, 3: 80, 4: 20, 5: 5, 6: 3, 7: 1 };

function statFor(s: GameState, m: Pick<DailyMission, 'kind' | 'item'>): number {
  switch (m.kind) {
    case 'sell':
      return s.stats.sold[m.item!] ?? 0;
    case 'earn':
      return s.stats.totalEarned;
    case 'upgrade':
      return s.stats.upgrades;
    case 'contract':
      return s.stats.contracts;
    case 'research':
      return s.stats.research;
    case 'trips':
      return s.stats.trips;
  }
}

export function missionProgress(s: GameState, m: DailyMission): number {
  return Math.max(0, Math.min(m.target, statFor(s, m) - m.base));
}

export function missionDone(s: GameState, m: DailyMission): boolean {
  return missionProgress(s, m) >= m.target;
}

function makeMissions(s: GameState): DailyMission[] {
  const pool: Omit<DailyMission, 'base' | 'claimed' | 'id'>[] = [];
  const made = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.stats.produced[i] ?? 0) > 0);
  const sellable = made.length ? made : (['iron_ore'] as ItemId[]);
  const item = sellable.sort((a, b) => ITEMS[b].tier - ITEMS[a].tier)[Math.floor(rand(s) * Math.min(3, sellable.length))];
  pool.push({ kind: 'sell', item, target: SELL_TARGET[ITEMS[item].tier] });
  pool.push({ kind: 'earn', target: Math.max(2000, Math.round((incomePerMinute(s) * 20) / 100) * 100) });
  pool.push({ kind: 'upgrade', target: 3 });
  if (metaUnlocked(s)) pool.push({ kind: 'contract', target: 1 });
  const anyResearch = (Object.keys(RESEARCH) as ResearchId[]).some((id) => researchState(s, id) === 'available');
  if (anyResearch) pool.push({ kind: 'research', target: 1 });
  if (s.vehicles.length) pool.push({ kind: 'trips', target: 5 });

  const chosen: DailyMission[] = [];
  // always keep "sell" first, then pick the rest at random
  const rest = pool.slice(1);
  const picks = [pool[0]];
  while (picks.length < DAILY.count && rest.length) picks.push(rest.splice(Math.floor(rand(s) * rest.length), 1)[0]);
  for (const p of picks) chosen.push({ ...p, id: `${p.kind}-${p.item ?? ''}`, base: statFor(s, p), claimed: false });
  return chosen;
}

/** Issues today's missions if the day changed. Returns true when new ones were made. */
export function ensureDaily(s: GameState, now = Date.now()): boolean {
  const day = todayKey(now);
  if (s.daily.day === day) return false;
  s.daily = { day, missions: makeMissions(s), bonusClaimed: false };
  return true;
}

/** Marks a mission claimed; returns gems to grant (0 if not claimable). */
export function claimMission(s: GameState, id: string): number {
  const m = s.daily.missions.find((x) => x.id === id);
  if (!m || m.claimed || !missionDone(s, m)) return 0;
  m.claimed = true;
  return DAILY.gemsEach;
}

export function bonusClaimable(s: GameState): boolean {
  return !s.daily.bonusClaimed && s.daily.missions.length > 0 && s.daily.missions.every((m) => m.claimed);
}

export function claimBonus(s: GameState): number {
  if (!bonusClaimable(s)) return 0;
  s.daily.bonusClaimed = true;
  return DAILY.gemsBonus;
}

export function dailyClaimableCount(s: GameState): number {
  return s.daily.missions.filter((m) => !m.claimed && missionDone(s, m)).length + (bonusClaimable(s) ? 1 : 0);
}

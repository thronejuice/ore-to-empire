import { BUILDINGS, type BuildingType, type ItemId } from '../config/balance';
import { hasResearch, incomePerMinute } from './economy';
import { getBuilding, invTotal } from './state';
import type { GameState } from './types';

export interface QuestDef {
  id: string;
  /** tutorial steps get the coach overlay and can be skipped as a group */
  tutorial?: boolean;
  reward: number;
  check: (s: GameState) => boolean;
  progress?: (s: GameState) => [number, number];
  /** data-tut attribute of the UI element to highlight */
  highlight?: string;
}

const has = (s: GameState, t: BuildingType) => s.buildings.some((b) => b.type === t);
const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;
const sold = (s: GameState, i: ItemId) => s.stats.sold[i] ?? 0;
const linked = (s: GameState, from: BuildingType, to: BuildingType) =>
  s.belts.some((b) => getBuilding(s, b.from)?.type === from && getBuilding(s, b.to)?.type === to);
const maxLevel = (s: GameState) => Math.max(1, ...s.buildings.filter((b) => b.type !== 'hq').map((b) => b.level));

export const QUESTS: QuestDef[] = [
  {
    id: 'tut_miner',
    tutorial: true,
    reward: 0,
    highlight: 'build-miner',
    check: (s) => s.buildings.some((b) => b.type === 'miner' && s.world.deposits[b.y * s.world.size + b.x] === 'iron_ore'),
  },
  { id: 'tut_link_hq', tutorial: true, reward: 0, highlight: 'link-btn', check: (s) => linked(s, 'miner', 'hq') },
  { id: 'tut_first_sale', tutorial: true, reward: 20, check: (s) => sold(s, 'iron_ore') >= 1 },
  { id: 'tut_furnace', tutorial: true, reward: 0, highlight: 'build-furnace', check: (s) => has(s, 'furnace') },
  {
    id: 'tut_feed_furnace',
    tutorial: true,
    reward: 0,
    highlight: 'link-btn',
    check: (s) => linked(s, 'miner', 'furnace') && linked(s, 'furnace', 'hq'),
  },
  {
    id: 'tut_bar',
    tutorial: true,
    reward: 100,
    check: (s) => sold(s, 'iron_bar') >= 5,
    progress: (s) => [sold(s, 'iron_bar'), 5],
  },
  {
    id: 'q_earn',
    reward: 150,
    check: (s) => s.stats.totalEarned >= 600,
    progress: (s) => [Math.floor(s.stats.totalEarned), 600],
  },
  {
    id: 'q_power',
    reward: 300,
    highlight: 'build-coal_plant',
    check: (s) => s.buildings.some((b) => b.type === 'coal_plant' && b.burn > 0),
  },
  {
    id: 'q_assembler',
    reward: 500,
    highlight: 'build-assembler',
    check: (s) => sold(s, 'machine_part') >= 10,
    progress: (s) => [sold(s, 'machine_part'), 10],
  },
  {
    id: 'q_warehouse',
    reward: 400,
    highlight: 'build-warehouse',
    check: (s) => s.buildings.some((b) => b.type === 'warehouse' && invTotal(b.input) >= 50),
    progress: (s) => [Math.max(0, ...s.buildings.filter((b) => b.type === 'warehouse').map((b) => invTotal(b.input))), 50],
  },
  { id: 'q_copper', reward: 600, check: (s) => sold(s, 'wire') >= 30, progress: (s) => [sold(s, 'wire'), 30] },
  { id: 'q_miners', reward: 500, check: (s) => count(s, 'miner') >= 8, progress: (s) => [count(s, 'miner'), 8] },
  { id: 'q_depot', reward: 500, highlight: 'build-depot', check: (s) => s.belts.some((b) => getBuilding(s, b.to)?.type === 'depot') },
  { id: 'q_upgrade', reward: 800, check: (s) => maxLevel(s) >= 3, progress: (s) => [maxLevel(s), 3] },
  { id: 'q_belt', reward: 1000, highlight: 'upgrades-btn', check: (s) => s.beltLevel >= 2 },
  {
    id: 'q_income',
    reward: 2000,
    check: (s) => incomePerMinute(s) >= 600,
    progress: (s) => [Math.floor(incomePerMinute(s)), 600],
  },
  {
    id: 'q_earn2',
    reward: 5000,
    check: (s) => s.stats.totalEarned >= 25000,
    progress: (s) => [Math.floor(s.stats.totalEarned), 25000],
  },
];

export function currentQuestIndex(s: GameState): number {
  const i = QUESTS.findIndex((q) => !s.quests.done.includes(q.id));
  return i === -1 ? QUESTS.length : i;
}

export function currentQuest(s: GameState): QuestDef | undefined {
  return QUESTS[currentQuestIndex(s)];
}

export function isBuildingUnlocked(s: GameState, type: BuildingType): boolean {
  if (!hasResearch(s, BUILDINGS[type].research)) return false;
  const q = BUILDINGS[type].unlockQuest;
  if (!q) return true;
  const qi = QUESTS.findIndex((x) => x.id === q);
  return currentQuestIndex(s) >= qi;
}

/** Completes the current quest if its condition holds. Returns it (for a toast). */
export function checkQuests(s: GameState): QuestDef | null {
  const q = currentQuest(s);
  if (!q || !q.check(s)) return null;
  s.quests.done.push(q.id);
  s.money += q.reward;
  return q;
}

/** all Phase-1 quests finished → the research tree, markets and contracts are the goals now */
export function questsComplete(s: GameState): boolean {
  return currentQuestIndex(s) >= QUESTS.length;
}

/** contracts and daily missions open up once the tutorial is behind the player */
export function metaUnlocked(s: GameState): boolean {
  return QUESTS.filter((q) => q.tutorial).every((q) => s.quests.done.includes(q.id));
}

export function skipTutorial(s: GameState) {
  s.quests.tutorialSkipped = true;
  for (const q of QUESTS) if (q.tutorial && !s.quests.done.includes(q.id)) s.quests.done.push(q.id);
}

import { RESEARCH, type ResearchId } from '../config/balance';
import { PERK_VALUES } from '../config/meta';
import { perk } from './economy';
import type { GameState } from './types';

export type ResearchState = 'done' | 'active' | 'available' | 'locked';

export function researchState(s: GameState, id: ResearchId): ResearchState {
  if (s.research.done.includes(id)) return 'done';
  if (s.research.active?.id === id) return 'active';
  return RESEARCH[id].requires.every((r) => s.research.done.includes(r)) ? 'available' : 'locked';
}

export function startResearch(s: GameState, id: ResearchId): string | null {
  const st = researchState(s, id);
  if (st === 'done' || st === 'active') return 'err.alreadyResearched';
  if (st === 'locked') return 'err.needResearch';
  if (s.research.active) return 'err.researchBusy';
  const def = RESEARCH[id];
  if (s.money < def.cost) return 'err.noMoney';
  s.money -= def.cost;
  s.research.active = { id, remaining: def.time };
  return null;
}

/** Advances the active research. Returns the id if it just finished. */
export function tickResearch(s: GameState, dt: number): ResearchId | null {
  const a = s.research.active;
  if (!a) return null;
  a.remaining -= dt * (1 + perk(s, 'p_research_speed') * PERK_VALUES.researchSpeedPerLevel);
  if (a.remaining > 0) return null;
  s.research.done.push(a.id);
  s.research.active = null;
  s.stats.research++;
  return a.id;
}

export function cancelResearch(s: GameState): number {
  const a = s.research.active;
  if (!a) return 0;
  const refund = Math.round(RESEARCH[a.id].cost * 0.5);
  s.money += refund;
  s.research.active = null;
  return refund;
}

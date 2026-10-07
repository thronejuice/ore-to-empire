import { PERKS, type PerkId } from '../config/meta';
import type { GameState } from './types';

/** Investor perks, bought with shares (shares come from zone licences). */

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

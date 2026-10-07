import { BUILDINGS, CITIES, ITEMS, RECIPES, RESEARCH, VEHICLES, ZONES, type BuildingType, type CityId, type ItemId, type RecipeId, type ResearchId, type VehicleType, type ZoneId } from '../config/balance';
import { PERK_VALUES } from '../config/meta';
import { perk } from './economy';
import { researchState } from './research';
import type { GameState } from './types';

/** seconds before a contract runs out that a background alert fires */
export const CONTRACT_WARN_SECONDS = 300;

export interface BackgroundAlert {
  /** milliseconds from now */
  delayMs: number;
  /** groups alerts so a newer one replaces an older one */
  tag: string;
  kind: 'research' | 'contract';
  research?: ResearchId;
  item?: ItemId;
  left?: number;
}

/**
 * What to tell a player who switched to another tab. The game doesn't run while
 * hidden, so only things whose time is known in advance are scheduled: the
 * active research finishing, and active contracts nearing their deadline.
 */
export function backgroundAlerts(s: GameState): BackgroundAlert[] {
  const out: BackgroundAlert[] = [];
  const a = s.research.active;
  if (a) {
    const speed = 1 + perk(s, 'p_research_speed') * PERK_VALUES.researchSpeedPerLevel;
    out.push({ delayMs: Math.max(0, (a.remaining / speed) * 1000), tag: 'research', kind: 'research', research: a.id });
  }
  for (const c of s.contracts.active) {
    if (c.progress >= c.qty) continue;
    const warnIn = c.expiresAt - s.time - CONTRACT_WARN_SECONDS;
    if (warnIn > 0) out.push({ delayMs: warnIn * 1000, tag: `contract-${c.id}`, kind: 'contract', item: c.item, left: c.qty - c.progress });
  }
  return out;
}

export type Unlock =
  | { kind: 'building'; id: BuildingType }
  | { kind: 'item'; id: ItemId }
  | { kind: 'zone'; id: ZoneId }
  | { kind: 'city'; id: CityId }
  | { kind: 'vehicle'; id: VehicleType };

/** everything a research opens up, for the "research done" card */
export function unlocksOf(id: ResearchId): Unlock[] {
  const out: Unlock[] = [];
  for (const b of Object.keys(BUILDINGS) as BuildingType[]) if (BUILDINGS[b].research === id) out.push({ kind: 'building', id: b });
  const items = new Set<ItemId>();
  for (const r of Object.keys(RECIPES) as RecipeId[]) if (RECIPES[r].research === id) for (const o of Object.keys(RECIPES[r].outputs) as ItemId[]) items.add(o);
  for (const i of items) if (ITEMS[i]) out.push({ kind: 'item', id: i });
  for (const z of Object.keys(ZONES) as ZoneId[]) if (ZONES[z].research === id) out.push({ kind: 'zone', id: z });
  for (const c of Object.keys(CITIES) as CityId[]) if (CITIES[c].research === id) out.push({ kind: 'city', id: c });
  for (const v of Object.keys(VEHICLES) as VehicleType[]) if (VEHICLES[v].research === id) out.push({ kind: 'vehicle', id: v });
  return out;
}

export function availableResearchCount(s: GameState): number {
  return (Object.keys(RESEARCH) as ResearchId[]).filter((r) => researchState(s, r) === 'available').length;
}

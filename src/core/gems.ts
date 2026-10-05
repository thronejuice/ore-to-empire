import { BOOST, GEM_ITEMS, type GemItemId } from '../config/meta';
import { applyOffline, type OfflineReport } from './offline';
import type { GameState } from './types';

/**
 * What each gem item does to the game. Spending is checked elsewhere: locally for
 * guests (free daily gems only) or by the server for signed-in players.
 */

export function gemItemAvailable(s: GameState, id: GemItemId): boolean {
  const def = GEM_ITEMS[id];
  if (id === 'offline_plus4' && def.max !== undefined) return s.offlineBonusHours / 4 < def.max;
  return true;
}

export function applyGemItem(s: GameState, id: GemItemId, now = Date.now()): OfflineReport | null {
  switch (id) {
    case 'skip_1h':
      return applyOffline(s, 3600, { ignoreCap: true });
    case 'boost_4h':
      addBoost(s, BOOST.hours, now);
      return null;
    case 'offline_plus4':
      s.offlineBonusHours += 4;
      return null;
  }
}

export function addBoost(s: GameState, hours: number, now = Date.now()) {
  s.boostUntil = Math.max(now, s.boostUntil) + hours * 3600_000;
}

/** guest-side spend of locally held (free) gems */
export function spendLocalGems(s: GameState, id: GemItemId): string | null {
  const cost = GEM_ITEMS[id].gems;
  if (!gemItemAvailable(s, id)) return 'err.maxLevel';
  if (s.gems < cost) return 'err.noGems';
  s.gems -= cost;
  return null;
}

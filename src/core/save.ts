import { SAVE_VERSION } from './state';
import type { GameState } from './types';

const KEY = 'ore-to-empire/save';

/**
 * Local save. Phase 4 adds a cloud-save adapter (Supabase) behind the same
 * load/save interface; guests keep using this one.
 */
export interface SaveStore {
  load(): GameState | null;
  save(state: GameState): void;
  clear(): void;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  try {
    const data = JSON.parse(json) as GameState;
    if (!data || typeof data !== 'object' || !Array.isArray(data.buildings)) return null;
    return migrate(data);
  } catch {
    return null;
  }
}

/** Upgrades older saves to the current shape. Add a case per version bump. */
export function migrate(data: GameState): GameState | null {
  if (data.version > SAVE_VERSION) return null; // save from a newer build
  // v1 is the first version — nothing to migrate yet.
  data.version = SAVE_VERSION;
  return data;
}

export const localSave: SaveStore = {
  load() {
    const s = storage();
    const raw = s?.getItem(KEY);
    return raw ? deserialize(raw) : null;
  },
  save(state) {
    try {
      storage()?.setItem(KEY, serialize(state));
    } catch {
      /* quota or private mode — the game keeps running in memory */
    }
  },
  clear() {
    storage()?.removeItem(KEY);
  },
};

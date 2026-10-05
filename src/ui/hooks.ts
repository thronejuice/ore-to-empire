import { createContext, useContext, useSyncExternalStore } from 'react';
import { currentQuest } from '../core/quests';
import type { Game } from '../game';

export const GameContext = createContext<Game | null>(null);

/** Returns the game and re-renders on every emitted change (≈5×/s while running). */
export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error('GameContext missing');
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}

export function useT() {
  const game = useGame();
  return (key: string, params?: Record<string, string | number>) => game.t(key, params);
}

/** Is this UI element the current tutorial/quest target? */
export function useHighlight(id: string): boolean {
  const game = useGame();
  const q = currentQuest(game.state);
  if (!q?.highlight) return false;
  if (q.highlight === id) return true;
  // build-* targets live inside the build drawer: point at the Build button while it's closed
  if (id === 'build-btn' && q.highlight.startsWith('build-') && game.ui.panel !== 'build' && game.ui.mode.kind !== 'build') return true;
  return false;
}

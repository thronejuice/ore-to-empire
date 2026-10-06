import { describe, expect, it } from 'vitest';
import { prestige } from '../src/core/prestige';
import { deserialize, serialize } from '../src/core/save';
import { newGame } from '../src/core/state';

describe('intro popup flag', () => {
  it('is unseen on a fresh save and survives a save round-trip', () => {
    const s = newGame(1);
    expect(s.quests.introSeen).toBe(false);
    expect(deserialize(serialize(s))!.quests.introSeen).toBe(false);
  });

  it('counts as seen on saves from before the intro existed', () => {
    const s = newGame(1);
    delete s.quests.introSeen;
    expect(deserialize(serialize(s))!.quests.introSeen).not.toBe(false);
  });

  it('does not show again after selling the company', () => {
    expect(prestige(newGame(1), 2).quests.introSeen).toBe(true);
  });
});

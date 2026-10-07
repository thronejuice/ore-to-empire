import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/core/save';
import { newGame } from '../src/core/state';
import { legacySave } from './legacy';

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

  it('stays seen when a pre-v1.2 save moves to the big map', () => {
    const s = newGame(1);
    s.quests.introSeen = true;
    expect(deserialize(JSON.stringify(legacySave(s)))!.quests.introSeen).toBe(true);
  });
});

describe("what's new notes", () => {
  it('shows every note newer than the version the player last saw', async () => {
    const { notesFor } = await import('../src/ui/WhatsNew');
    expect(notesFor('1.1.1')).toEqual(['news.1', 'news.2', 'news.3', 'news.4', 'news.5']);
    expect(notesFor('1.2.0')).toEqual(['news.5']);
    expect(notesFor('1.2.1')).toEqual([]);
    expect(notesFor(undefined).length).toBe(5);
    expect(notesFor('1.10.0')).toEqual([]); // compared as numbers, not text
  });
});

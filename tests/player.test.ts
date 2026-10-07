import { describe, expect, it } from 'vitest';
import { maskCode, nameProblem, normaliseCode } from '../src/core/player';
import { newGame } from '../src/core/state';
import { deserialize } from '../src/core/save';
import { legacySave } from './legacy';

describe('player names', () => {
  it('accepts Thai, English, digits and _', () => {
    expect(nameProblem('SteelKing')).toBeNull();
    expect(nameProblem('เจ้าพ่อเหล็ก')).toBeNull();
    expect(nameProblem('ore_99')).toBeNull();
    expect(nameProblem('  abc  ')).toBeNull(); // trimmed
  });
  it('rejects bad names', () => {
    expect(nameProblem('ab')).toBe('short');
    expect(nameProblem('a'.repeat(17))).toBe('long');
    expect(nameProblem('has space')).toBe('chars');
    expect(nameProblem('emoji😀x')).toBe('chars');
    expect(nameProblem('Admin')).toBe('reserved');
  });
});

describe('recovery codes', () => {
  it('normalises what players type', () => {
    expect(normaliseCode('ore-abcd-efgh-jkmn-pqrs')).toBe('ORE-ABCD-EFGH-JKMN-PQRS');
    expect(normaliseCode('ABCD EFGH JKMN PQRS')).toBe('ORE-ABCD-EFGH-JKMN-PQRS');
    expect(normaliseCode('  ORE ABCDEFGHJKMNPQRS ')).toBe('ORE-ABCD-EFGH-JKMN-PQRS');
    expect(normaliseCode('ORE-ABCD')).toBeNull();
  });
  it('masks the middle', () => {
    expect(maskCode('ORE-ABCD-EFGH-JKMN-PQRS')).toBe('ORE-ABCD-••••-••••-PQRS');
  });
});

describe('player name in the save', () => {
  it('survives the move to the big map', () => {
    const s = newGame(1);
    s.player = { name: 'SteelKing' };
    expect(deserialize(JSON.stringify(legacySave(s)))!.player).toEqual({ name: 'SteelKing' });
  });
});

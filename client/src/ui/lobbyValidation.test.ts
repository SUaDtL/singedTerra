import { describe, it, expect } from 'vitest';
import {
  parseNumber,
  coerceSettings,
  normalizeRoomCode,
  isValidRoomCode,
  type RawSettings,
} from './lobbyValidation';

/** A fully-blank raw settings object; individual tests override single fields. */
function blankRaw(overrides: Partial<RawSettings> = {}): RawSettings {
  return {
    maxWind: '',
    gravity: '',
    seed: '',
    rounds: '',
    interestRate: '',
    suddenDeathTurn: '',
    armsLevel: '',
    ...overrides,
  };
}

describe('parseNumber', () => {
  it('returns undefined for a blank string', () => {
    expect(parseNumber('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only input', () => {
    expect(parseNumber('   ')).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('1abc')).toBeUndefined();
  });

  it('parses an integer', () => {
    expect(parseNumber('42')).toBe(42);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseNumber('  42  ')).toBe(42);
  });

  it('parses a float', () => {
    expect(parseNumber('0.15')).toBe(0.15);
  });

  it('parses a negative number', () => {
    expect(parseNumber('-3')).toBe(-3);
  });

  it('returns undefined for non-finite input', () => {
    expect(parseNumber('Infinity')).toBeUndefined();
    expect(parseNumber('NaN')).toBeUndefined();
  });
});

describe('coerceSettings', () => {
  it('returns undefined when every field is blank', () => {
    expect(coerceSettings(blankRaw())).toBeUndefined();
  });

  it('omits blank fields, keeping only what was set', () => {
    expect(coerceSettings(blankRaw({ maxWind: '5' }))).toEqual({ maxWind: 5 });
  });

  it('clamps maxWind at both bounds', () => {
    expect(coerceSettings(blankRaw({ maxWind: '-4' }))).toEqual({ maxWind: 0 });
    expect(coerceSettings(blankRaw({ maxWind: '999' }))).toEqual({ maxWind: 10 });
  });

  it('clamps gravity at both bounds', () => {
    expect(coerceSettings(blankRaw({ gravity: '0' }))).toEqual({ gravity: 0.05 });
    expect(coerceSettings(blankRaw({ gravity: '5' }))).toEqual({ gravity: 0.4 });
  });

  it('passes an in-range gravity through unchanged', () => {
    expect(coerceSettings(blankRaw({ gravity: '0.2' }))).toEqual({ gravity: 0.2 });
  });

  it('truncates the seed toward zero', () => {
    expect(coerceSettings(blankRaw({ seed: '12.9' }))).toEqual({ seed: 12 });
    expect(coerceSettings(blankRaw({ seed: '-4.9' }))).toEqual({ seed: -4 });
  });

  it('clamps interestRate at both bounds', () => {
    expect(coerceSettings(blankRaw({ interestRate: '-1' }))).toEqual({ interestRate: 0 });
    expect(coerceSettings(blankRaw({ interestRate: '5' }))).toEqual({ interestRate: 0.5 });
  });

  it('clamps suddenDeathTurn at both bounds and truncates', () => {
    expect(coerceSettings(blankRaw({ suddenDeathTurn: '-2' }))).toEqual({ suddenDeathTurn: 0 });
    expect(coerceSettings(blankRaw({ suddenDeathTurn: '999' }))).toEqual({ suddenDeathTurn: 50 });
    expect(coerceSettings(blankRaw({ suddenDeathTurn: '10.8' }))).toEqual({ suddenDeathTurn: 10 });
  });

  it('clamps armsLevel at both bounds and truncates', () => {
    expect(coerceSettings(blankRaw({ armsLevel: '-1' }))).toEqual({ armsLevel: 0 });
    expect(coerceSettings(blankRaw({ armsLevel: '9' }))).toEqual({ armsLevel: 4 });
    expect(coerceSettings(blankRaw({ armsLevel: '2.7' }))).toEqual({ armsLevel: 2 });
  });

  it('clamps rounds into range then forces odd (even in-range input)', () => {
    // 4 is in range [1,9] but even -> +1 => 5
    expect(coerceSettings(blankRaw({ rounds: '4' }))).toEqual({ rounds: 5 });
  });

  it('leaves an odd in-range rounds unchanged', () => {
    expect(coerceSettings(blankRaw({ rounds: '3' }))).toEqual({ rounds: 3 });
  });

  it('clamps rounds above range down to the odd max', () => {
    // 99 -> clamp to 9 (already odd)
    expect(coerceSettings(blankRaw({ rounds: '99' }))).toEqual({ rounds: 9 });
  });

  it('clamps rounds below range then forces odd', () => {
    // 0 -> clamp to 1 (odd)
    expect(coerceSettings(blankRaw({ rounds: '0' }))).toEqual({ rounds: 1 });
  });

  it('truncates a fractional even rounds before forcing odd', () => {
    // 4.9 -> trunc 4 -> clamp 4 -> even -> 5
    expect(coerceSettings(blankRaw({ rounds: '4.9' }))).toEqual({ rounds: 5 });
  });

  it('collects every field when all are set', () => {
    expect(
      coerceSettings({
        maxWind: '7',
        gravity: '0.3',
        seed: '100',
        rounds: '6',
        interestRate: '0.25',
        suddenDeathTurn: '20',
        armsLevel: '3',
      }),
    ).toEqual({
      maxWind: 7,
      gravity: 0.3,
      seed: 100,
      rounds: 7,
      interestRate: 0.25,
      suddenDeathTurn: 20,
      armsLevel: 3,
    });
  });

  it('ignores an invalid (non-numeric) field as if blank', () => {
    expect(coerceSettings(blankRaw({ maxWind: 'abc' }))).toBeUndefined();
  });
});

describe('normalizeRoomCode', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
  });

  it('strips non-alphanumeric characters', () => {
    expect(normalizeRoomCode('a-b c')).toBe('ABC');
    expect(normalizeRoomCode('!@#$')).toBe('');
  });

  it('truncates to 4 characters', () => {
    expect(normalizeRoomCode('abcdef')).toBe('ABCD');
  });

  it('combines strip + uppercase + truncate', () => {
    expect(normalizeRoomCode('a1-b2-c3')).toBe('A1B2');
  });
});

describe('isValidRoomCode', () => {
  it('accepts exactly 4 characters', () => {
    expect(isValidRoomCode('ABCD')).toBe(true);
  });

  it('rejects fewer than 4 characters', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
  });

  it('rejects more than 4 characters', () => {
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });

  it('trims surrounding whitespace before measuring', () => {
    expect(isValidRoomCode('  ABCD  ')).toBe(true);
    expect(isValidRoomCode('  AB  ')).toBe(false);
  });
});

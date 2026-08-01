import { describe, expect, it } from 'vitest';
import {
  isActiveSeatLocal,
  resolveActivePlayerOwnership,
  shouldAcceptLocalInput,
  type ActiveSeatOwnership,
} from './inputGate';

describe('local input authority gate', () => {
  it.each([
    {
      name: 'local human turn',
      gate: { activeIsAi: false, activeIsLocal: true, paused: false },
      expected: true,
    },
    {
      name: 'paused local human turn',
      gate: { activeIsAi: false, activeIsLocal: true, paused: true },
      expected: false,
    },
    {
      name: 'CPU turn',
      gate: { activeIsAi: true, activeIsLocal: false, paused: false },
      expected: false,
    },
    {
      name: 'remote network turn',
      gate: { activeIsAi: false, activeIsLocal: false, paused: false },
      expected: false,
    },
  ])('$name => $expected', ({ gate, expected }) => {
    expect(shouldAcceptLocalInput(gate)).toBe(expected);
  });

  it('rejects a CPU independently even if the seat is locally hosted', () => {
    expect(shouldAcceptLocalInput({
      activeIsAi: true,
      activeIsLocal: true,
      paused: false,
    })).toBe(false);
  });

  it.each([
    ['hot-seat human', 'hotseat', false, false, true],
    ['hot-seat CPU', 'hotseat', false, true, false],
    ['local network human', 'network', true, false, true],
    ['remote network human', 'network', false, false, false],
  ] as const)(
    '%s ownership => %s',
    (_name, mode, activePlayerOwned, activeIsAi, expected) => {
      expect(isActiveSeatLocal({
        mode,
        activePlayerOwned,
        activeIsAi,
      })).toBe(expected);
    },
  );

  it('accepts the network client\'s mapped ownership instead of comparing seat and engine ids', () => {
    const ownership = {
      mode: 'network',
      activePlayerOwned: true,
      activeIsAi: false,
    } satisfies ActiveSeatOwnership;

    expect(isActiveSeatLocal(ownership)).toBe(true);
  });

  it('resolves production ownership through the active client mapping', () => {
    const client = {
      ownsEnginePlayer: (enginePlayerId: string) => enginePlayerId === 'p3',
    };

    expect(resolveActivePlayerOwnership('network', client, 'p3')).toBe(true);
    expect(resolveActivePlayerOwnership('network', client, 'p1')).toBe(false);
    expect(resolveActivePlayerOwnership('hotseat', {}, 'p2')).toBe(true);
  });
});

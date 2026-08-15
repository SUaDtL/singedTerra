import { describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { battleCommandStateFor } from './battleCommandState';

function stateFor(
  phase: 'PLAYER_TURN' | 'FIRING' | 'RESOLVING' | 'ROUND_OVER' | 'GAME_OVER',
) {
  const engine = new GameEngine({
    players: [
      { name: 'Ranger', color: '#e84d4d' },
      { name: 'CPU', color: '#4d8ce8', ai: 'easy' },
    ],
    maxPlayers: 2,
    seed: 4,
  });
  const state = engine.getState();
  state.phase = phase;
  return state;
}

describe('battle command state', () => {
  it('makes a controllable human turn an explicit Fire decision', () => {
    const state = stateFor('PLAYER_TURN');

    expect(battleCommandStateFor(state, false, true)).toMatchObject({
      mode: 'decision',
      active: { name: 'Ranger', weapon: 'baby_missile', health: 100, fuel: 100 },
      solution: { angle: 45, power: 50, wind: state.wind },
      commitment: { label: 'Fire', available: true, explanation: null },
    });
  });

  it('explains a disabled human decision instead of presenting a stale Fire action', () => {
    const state = stateFor('PLAYER_TURN');

    expect(battleCommandStateFor(state, false, false).commitment).toEqual({
      label: 'Input unavailable',
      available: false,
      explanation: 'This battle is not accepting input.',
    });
  });

  it('turns firing and resolution into observation states', () => {
    expect(battleCommandStateFor(stateFor('FIRING'), false, true).commitment)
      .toEqual({ label: 'Watching impact', available: false, explanation: 'Shot in flight.' });
    expect(battleCommandStateFor(stateFor('RESOLVING'), false, true).commitment)
      .toEqual({ label: 'Resolving impact', available: false, explanation: 'Resolving terrain and damage.' });
  });

  it('identifies a CPU-held player turn as a handoff instead of a human decision', () => {
    const state = stateFor('PLAYER_TURN');
    state.activePlayerId = state.tanks[1]!.id;

    expect(battleCommandStateFor(state, false, true).commitment)
      .toEqual({ label: 'CPU turn', available: false, explanation: 'Awaiting CPU action.' });
  });

  it('names terminal and between-round states without exposing an action that cannot run', () => {
    expect(battleCommandStateFor(stateFor('ROUND_OVER'), false, true).commitment)
      .toEqual({ label: 'Preparing next round', available: false, explanation: 'Round transition in progress.' });
    expect(battleCommandStateFor(stateFor('GAME_OVER'), false, true).commitment)
      .toEqual({ label: 'After action report', available: false, explanation: 'Battle complete.' });
  });
});

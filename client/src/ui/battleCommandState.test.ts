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

function expectHonestState(
  command: ReturnType<typeof battleCommandStateFor>,
  expected: {
    readonly phase: 'decision' | 'submitting' | 'tracking' | 'resolving' | 'handoff' | 'recovery';
    readonly label: string;
    readonly commitEnabled?: boolean;
    readonly commander?: string;
  },
): void {
  expect(command.context.commander).toMatchObject({
    id: expect.any(String),
    name: expected.commander ?? 'Ranger',
  });
  expect(command.context.phaseLabel).toBe(expected.label);
  expect(command.commitment.phase).toBe(expected.phase);
  expect(command.commitment.commit?.enabled ?? false).toBe(expected.commitEnabled ?? false);
}

describe('battle command state', () => {
  it('projects a local player turn as the only enabled command decision', () => {
    const state = stateFor('PLAYER_TURN');
    const command = battleCommandStateFor(state, false, true, { activeIsLocal: true });

    expectHonestState(command, { phase: 'decision', label: 'Your firing decision', commitEnabled: true });
    expect(command.solution).toMatchObject({
      weapon: 'baby_missile', angle: 45, power: 50, wind: state.wind,
    });
    expect(command.commitment.commit).toEqual({ label: 'Fire', enabled: true });
  });

  it('labels a local fire submission without retaining a runnable commit', () => {
    expectHonestState(
      battleCommandStateFor(stateFor('PLAYER_TURN'), true, false, { activeIsLocal: true }),
      { phase: 'submitting', label: 'Submitting your shot' },
    );
  });

  it('tracks a fired shot and exposes only a valid local impact-learning cue', () => {
    const state = stateFor('RESOLVING');
    const cue = {
      readout: '84 PX LEFT OF CPU',
      correction: 'SHIFT IMPACT RIGHT',
      shooterId: state.activePlayerId,
      round: state.round,
      turn: state.turn,
      explosionId: 7,
    };
    const local = battleCommandStateFor(state, false, false, {
      activeIsLocal: true,
      impactLearningCue: cue,
    });
    const remote = battleCommandStateFor(state, false, false, {
      activeIsLocal: false,
      impactLearningCue: cue,
    });

    expectHonestState(
      battleCommandStateFor(stateFor('FIRING'), false, false, { activeIsLocal: true }),
      { phase: 'tracking', label: 'Shot in flight' },
    );
    expectHonestState(local, { phase: 'resolving', label: 'Resolving impact' });
    expect(local.context.lastSalvo).toEqual(cue);
    expect(remote.context.lastSalvo).toBeNull();
  });

  it('expires a cue outside the originating local resolving shot', () => {
    const state = stateFor('RESOLVING');
    const cue = {
      readout: '84 PX LEFT OF CPU', correction: 'SHIFT IMPACT RIGHT',
      shooterId: state.activePlayerId, round: state.round, turn: state.turn, explosionId: 7,
    };

    expect(battleCommandStateFor(state, false, false, {
      activeIsLocal: true,
      impactLearningCue: { ...cue, shooterId: 'other-commander' },
    }).context.lastSalvo).toBeNull();
    expect(battleCommandStateFor({ ...state, turn: state.turn + 1 }, false, false, {
      activeIsLocal: true,
      impactLearningCue: cue,
    }).context.lastSalvo).toBeNull();
    expect(battleCommandStateFor({ ...state, phase: 'PLAYER_TURN' }, false, true, {
      activeIsLocal: true,
      impactLearningCue: cue,
    }).context.lastSalvo).toBeNull();
  });

  it('hands off CPU and remote turns without offering a local commit', () => {
    const cpuState = stateFor('PLAYER_TURN');
    cpuState.activePlayerId = cpuState.tanks[1]!.id;

    expectHonestState(
      battleCommandStateFor(cpuState, false, false, { activeIsLocal: false }),
      { phase: 'handoff', label: 'CPU commander turn', commander: 'CPU' },
    );
    expectHonestState(
      battleCommandStateFor(stateFor('PLAYER_TURN'), false, false, { activeIsLocal: false }),
      { phase: 'handoff', label: 'Remote commander turn' },
    );
  });

  it('names verified report retry as recovery without making it a firing commit', () => {
    expectHonestState(
      battleCommandStateFor(stateFor('GAME_OVER'), false, false, {
        activeIsLocal: true,
        verifiedDeployment: { status: 'retryable' },
      }),
      { phase: 'recovery', label: 'Verification retry available' },
    );
  });

  it.each([
    'cap-adjudicating',
    'completion-pending',
    'retryable',
    'expired',
    'policy-refused',
    'failed',
  ] as const)('blocks Fire when verified deployment is %s', (status) => {
    expectHonestState(
      battleCommandStateFor(stateFor('PLAYER_TURN'), false, true, {
        activeIsLocal: true,
        verifiedInputAllowed: false,
        verifiedDeployment: { status },
      }),
      { phase: 'handoff', label: 'Input unavailable' },
    );
  });

  it('reserves retry recovery for the after-action report, never an in-flight shot', () => {
    const retryable = { status: 'retryable' as const };
    expectHonestState(
      battleCommandStateFor(stateFor('FIRING'), false, false, {
        activeIsLocal: true, verifiedDeployment: retryable,
      }),
      { phase: 'tracking', label: 'Shot in flight' },
    );
    expectHonestState(
      battleCommandStateFor(stateFor('RESOLVING'), false, false, {
        activeIsLocal: true, verifiedDeployment: retryable,
      }),
      { phase: 'resolving', label: 'Resolving impact' },
    );
    expectHonestState(
      battleCommandStateFor(stateFor('PLAYER_TURN'), true, false, {
        activeIsLocal: true, verifiedDeployment: retryable,
      }),
      { phase: 'submitting', label: 'Submitting your shot' },
    );
  });

  it('names unavailable local input without presenting a stale commit', () => {
    expectHonestState(
      battleCommandStateFor(stateFor('PLAYER_TURN'), false, false, { activeIsLocal: true }),
      { phase: 'handoff', label: 'Input unavailable' },
    );
  });
});

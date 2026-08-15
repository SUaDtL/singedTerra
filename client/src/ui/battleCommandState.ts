import type { GameState, TankState } from '@shared/types/GameState';

export type BattleCommandCommitmentPhase =
  | 'decision'
  | 'submitting'
  | 'tracking'
  | 'resolving'
  | 'handoff'
  | 'recovery';

/** A renderer-derived correction, admitted only after its existing local-shot checks. */
export interface BattleCommandImpactLearningCue {
  readonly readout: string;
  readonly correction: string;
  readonly shooterId: string;
  readonly round: number;
  readonly turn: number;
  readonly explosionId: number;
}

/** The verified/report state the HUD may already know without querying a service. */
export interface BattleCommandVerifiedDeployment {
  readonly status:
    | 'active'
    | 'cap-adjudicating'
    | 'completion-pending'
    | 'retryable'
    | 'expired'
    | 'policy-refused'
    | 'failed';
}

/** Presentation inputs only; none are allowed to alter engine or transport state. */
export interface BattleCommandStateOptions {
  readonly activeIsLocal?: boolean;
  /** The same authoritative verified-deployment gate that guards real input. */
  readonly verifiedInputAllowed?: boolean;
  readonly verifiedDeployment?: BattleCommandVerifiedDeployment | null;
  readonly impactLearningCue?: BattleCommandImpactLearningCue | null;
}

interface CommanderIdentity {
  readonly id: string;
  readonly name: string;
  readonly health: number;
  readonly fuel: number;
}

interface BattleCommandCommitment {
  readonly phase: BattleCommandCommitmentPhase;
  readonly label: string;
  readonly explanation: string | null;
  /** Fire is intentionally present only when the HUD can invoke its existing callback. */
  readonly commit: { readonly label: 'Fire'; readonly enabled: true } | null;
}

export interface BattleCommandState {
  readonly context: {
    readonly commander: CommanderIdentity | null;
    readonly phaseLabel: string;
    /** Never infer a correction: this is only a currently valid renderer cue. */
    readonly lastSalvo: BattleCommandImpactLearningCue | null;
  };
  readonly solution: {
    readonly weapon: string;
    readonly angle: number;
    readonly power: number;
    readonly wind: number;
  } | null;
  readonly commitment: BattleCommandCommitment;
}

function commandTank(state: GameState): TankState | null {
  return state.tanks.find((tank) => tank.id === state.activePlayerId) ?? null;
}

function commanderFor(tank: TankState | null): CommanderIdentity | null {
  if (tank === null) return null;
  return { id: tank.id, name: tank.playerName, health: tank.health, fuel: tank.fuel };
}

function solutionFor(state: GameState, tank: TankState | null): BattleCommandState['solution'] {
  if (tank === null) return null;
  return { weapon: tank.selectedWeapon, angle: tank.angle, power: tank.power, wind: state.wind };
}

function projectedState(
  state: GameState,
  tank: TankState | null,
  phaseLabel: string,
  commitment: BattleCommandCommitment,
  lastSalvo: BattleCommandImpactLearningCue | null = null,
): BattleCommandState {
  return {
    context: { commander: commanderFor(tank), phaseLabel, lastSalvo },
    solution: solutionFor(state, tank),
    commitment,
  };
}

const fireCommit = { label: 'Fire', enabled: true } as const;

function validImpactLearningCue(
  state: GameState,
  tank: TankState | null,
  activeIsLocal: boolean,
  cue: BattleCommandImpactLearningCue | null | undefined,
): BattleCommandImpactLearningCue | null {
  if (
    !activeIsLocal
    || state.phase !== 'RESOLVING'
    || tank === null
    || cue === null
    || cue === undefined
    || cue.shooterId !== tank.id
    || cue.round !== state.round
    || cue.turn !== state.turn
    || !Number.isInteger(cue.explosionId)
    || cue.explosionId <= 0
  ) return null;
  return cue;
}

function verifiedDeploymentBlocksInput(
  deployment: BattleCommandVerifiedDeployment | null | undefined,
): boolean {
  return deployment?.status === 'cap-adjudicating'
    || deployment?.status === 'completion-pending'
    || deployment?.status === 'retryable'
    || deployment?.status === 'expired'
    || deployment?.status === 'policy-refused'
    || deployment?.status === 'failed';
}

/**
 * Projects one honest console contract from authoritative, in-memory HUD data.
 * This display-only function never changes deterministic state, callbacks, or
 * network/verified-deployment authority.
 */
export function battleCommandStateFor(
  state: GameState,
  isFiring: boolean,
  canControl: boolean,
  options: BattleCommandStateOptions = {},
): BattleCommandState {
  const tank = commandTank(state);
  const activeIsLocal = options.activeIsLocal ?? canControl;
  const verifiedInputAllowed = options.verifiedInputAllowed
    ?? !verifiedDeploymentBlocksInput(options.verifiedDeployment);
  const retryableReport = options.verifiedDeployment?.status === 'retryable';

  if (state.phase === 'FIRING') {
    return projectedState(state, tank, 'Shot in flight', {
      phase: 'tracking', label: 'Tracking shot', explanation: 'Shot in flight.', commit: null,
    });
  }
  if (isFiring) {
    return projectedState(state, tank, 'Submitting your shot', {
      phase: 'submitting', label: 'Submitting shot',
      explanation: 'Awaiting the existing fire action.', commit: null,
    });
  }
  if (state.phase === 'RESOLVING') {
    return projectedState(state, tank, 'Resolving impact', {
      phase: 'resolving', label: 'Resolving impact',
      explanation: 'Resolving terrain and damage.', commit: null,
    }, validImpactLearningCue(state, tank, activeIsLocal, options.impactLearningCue));
  }
  if (state.phase === 'PLAYER_TURN' && tank?.ai !== null && tank?.ai !== undefined) {
    return projectedState(state, tank, 'CPU commander turn', {
      phase: 'handoff', label: 'Awaiting CPU action',
      explanation: 'The CPU controls this turn.', commit: null,
    });
  }
  if (state.phase === 'PLAYER_TURN' && !activeIsLocal) {
    return projectedState(state, tank, 'Remote commander turn', {
      phase: 'handoff', label: 'Awaiting remote action',
      explanation: 'Another commander controls this turn.', commit: null,
    });
  }
  if (state.phase === 'PLAYER_TURN' && tank !== null && canControl && verifiedInputAllowed) {
    return projectedState(state, tank, 'Your firing decision', {
      phase: 'decision', label: 'Fire ready', explanation: null, commit: fireCommit,
    });
  }
  if (state.phase === 'PLAYER_TURN') {
    return projectedState(state, tank, 'Input unavailable', {
      phase: 'handoff', label: 'Input unavailable',
      explanation: 'This battle is not accepting local input.', commit: null,
    });
  }
  if (state.phase === 'ROUND_OVER') {
    return projectedState(state, tank, 'Preparing next round', {
      phase: 'handoff', label: 'Preparing next round',
      explanation: 'Round transition in progress.', commit: null,
    });
  }
  if (state.phase === 'GAME_OVER') {
    if (retryableReport) {
      return projectedState(state, tank, 'Verification retry available', {
        phase: 'recovery', label: 'Retry verification in report',
        explanation: 'The verified report can retry through its existing recovery action.', commit: null,
      });
    }
    return projectedState(state, tank, 'After action report', {
      phase: 'recovery', label: 'After action report', explanation: 'Battle complete.', commit: null,
    });
  }
  return projectedState(state, tank, 'Awaiting battle', {
    phase: 'handoff', label: 'Awaiting battle', explanation: 'Battle has not started.', commit: null,
  });
}

import type { GameState, TankState } from '@shared/types/GameState';

export type BattleCommandMode = 'decision' | 'observation' | 'handoff' | 'terminal';

export interface BattleCommandState {
  readonly mode: BattleCommandMode;
  readonly active: {
    readonly id: string;
    readonly name: string;
    readonly weapon: string;
    readonly health: number;
    readonly fuel: number;
  } | null;
  readonly solution: {
    readonly angle: number;
    readonly power: number;
    readonly wind: number;
  } | null;
  readonly commitment: {
    readonly label: string;
    readonly available: boolean;
    readonly explanation: string | null;
  };
}

function activeCommandTank(state: GameState): TankState | null {
  return state.tanks.find((tank) => tank.id === state.activePlayerId && tank.alive) ?? null;
}

function baseState(state: GameState, activeTank: TankState | null) {
  return {
    active: activeTank === null
      ? null
      : {
        id: activeTank.id,
        name: activeTank.playerName,
        weapon: activeTank.selectedWeapon,
        health: activeTank.health,
        fuel: activeTank.fuel,
      },
    solution: activeTank === null
      ? null
      : { angle: activeTank.angle, power: activeTank.power, wind: state.wind },
  } as const;
}

/**
 * Presents one honest next-decision contract for every gameplay phase. This is
 * display-only: it derives from the existing deterministic GameState and never
 * controls engine, transport, or verified-deployment authority.
 */
export function battleCommandStateFor(
  state: GameState,
  isFiring: boolean,
  canControl: boolean,
): BattleCommandState {
  const activeTank = activeCommandTank(state);
  const base = baseState(state, activeTank);

  if (state.phase === 'FIRING' || isFiring) {
    return { ...base, mode: 'observation', commitment: {
      label: 'Watching impact', available: false, explanation: 'Shot in flight.',
    } };
  }
  if (state.phase === 'RESOLVING') {
    return { ...base, mode: 'observation', commitment: {
      label: 'Resolving impact', available: false, explanation: 'Resolving terrain and damage.',
    } };
  }
  if (state.phase === 'PLAYER_TURN' && activeTank?.ai !== null && activeTank?.ai !== undefined) {
    return { ...base, mode: 'handoff', commitment: {
      label: 'CPU turn', available: false, explanation: 'Awaiting CPU action.',
    } };
  }
  if (state.phase === 'PLAYER_TURN' && activeTank !== null && canControl) {
    return { ...base, mode: 'decision', commitment: {
      label: 'Fire', available: true, explanation: null,
    } };
  }
  if (state.phase === 'PLAYER_TURN') {
    return { ...base, mode: 'handoff', commitment: {
      label: 'Input unavailable', available: false, explanation: 'This battle is not accepting input.',
    } };
  }
  if (state.phase === 'ROUND_OVER') {
    return { ...base, mode: 'handoff', commitment: {
      label: 'Preparing next round', available: false, explanation: 'Round transition in progress.',
    } };
  }
  if (state.phase === 'GAME_OVER') {
    return { ...base, mode: 'terminal', commitment: {
      label: 'After action report', available: false, explanation: 'Battle complete.',
    } };
  }
  return { ...base, mode: 'handoff', commitment: {
    label: 'Awaiting battle', available: false, explanation: 'Battle has not started.',
  } };
}

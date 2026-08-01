import { describe, expect, it } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { Renderer } from './Renderer';

interface AnimationSeam {
  battlefieldBackdrop: { readonly isSettled: boolean };
  terrain: { readonly isMaterialSettled: boolean };
  tanks: { readonly isChassisArtSettled: boolean };
  bursts: unknown[];
  scorches: unknown[];
  wallContacts: unknown[];
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  prevMobilityPoses: Map<string, unknown>;
  mobilityEffects: { readonly isActive: boolean };
  tankRecoil: null;
  windGust: null;
  isAnimating(state: GameState): boolean;
}

function rendererWithChassisState(isChassisArtSettled: boolean): AnimationSeam {
  return Object.assign(Object.create(Renderer.prototype), {
    battlefieldBackdrop: { isSettled: true },
    terrain: { isMaterialSettled: true },
    tanks: { isChassisArtSettled },
    bursts: [],
    scorches: [],
    wallContacts: [],
    shake: 0,
    kickX: 0,
    kickY: 0,
    effectsBusy: 0,
    prevMobilityPoses: new Map(),
    mobilityEffects: { isActive: false },
    tankRecoil: null,
    windGust: null,
  }) as AnimationSeam;
}

function tank(alive: boolean): TankState {
  return {
    id: alive ? 'alive' : 'dead',
    alive,
    buried: false,
    health: alive ? 100 : 0,
  } as TankState;
}

function idleState(tanks: TankState[]): GameState {
  return {
    phase: 'PLAYER_TURN',
    tanks,
    projectiles: [],
    fire: [],
  } as unknown as GameState;
}

describe('Renderer tank chassis eligibility', () => {
  it('keeps an idle living-tank scene eligible until authored art is painted', () => {
    const renderer = rendererWithChassisState(false);
    const state = idleState([tank(true)]);

    expect(renderer.isAnimating(state)).toBe(true);

    renderer.tanks = { isChassisArtSettled: true };
    renderer.prevMobilityPoses.set('alive', { tankId: 'alive' });

    expect(renderer.isAnimating(state)).toBe(false);
  });

  it('does not spin an all-wreck scene while unpainted chassis art loads', () => {
    const renderer = rendererWithChassisState(false);
    renderer.prevMobilityPoses.set('dead', { tankId: 'dead' });

    expect(renderer.isAnimating(idleState([tank(false)]))).toBe(false);
    expect(rendererWithChassisState(false).isAnimating(idleState([]))).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '@shared/types/GameState';
import { Renderer } from './Renderer';

interface AnimationSeam {
  battlefieldBackdrop: { readonly isSettled: boolean };
  terrain: { readonly isMaterialSettled: boolean };
  bursts: unknown[];
  scorches: unknown[];
  wallContacts: unknown[];
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  tankRecoil: null;
  windGust: null;
  isAnimating(state: GameState): boolean;
}

function rendererWithMaterialState(isMaterialSettled: boolean): AnimationSeam {
  return Object.assign(Object.create(Renderer.prototype), {
    battlefieldBackdrop: { isSettled: true },
    terrain: { isMaterialSettled },
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

function idleState(): GameState {
  return {
    phase: 'PLAYER_TURN',
    tanks: [],
    projectiles: [],
    fire: [],
  } as unknown as GameState;
}

describe('Renderer terrain material eligibility', () => {
  it('keeps idle rendering eligible until the material is applied', () => {
    const renderer = rendererWithMaterialState(false);

    expect(renderer.isAnimating(idleState())).toBe(true);

    renderer.terrain = { isMaterialSettled: true };

    expect(renderer.isAnimating(idleState())).toBe(false);
  });

  it('does not consult terrain material state during active simulation', () => {
    const renderer = rendererWithMaterialState(false);
    const getter = vi.spyOn(renderer.terrain, 'isMaterialSettled', 'get');

    expect(renderer.isAnimating({
      ...idleState(),
      phase: 'FIRING',
    })).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });
});

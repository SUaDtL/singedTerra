import { describe, expect, it } from 'vitest';
import { effectiveGravity } from '@shared/engine/GameEngine';
import { resolveAimGuidePresentation } from './aimGuidePresentation';

describe('aim-guide presentation wiring', () => {
  it('combines local ownership with the engine-effective room gravity', () => {
    const openingGravity = {
      baseGravity: 0.2,
      turn: 0,
      suddenDeathTurn: 6,
    };
    const suddenDeathGravity = {
      baseGravity: 0.2,
      turn: 9,
      suddenDeathTurn: 6,
    };

    expect(resolveAimGuidePresentation({
      mode: 'network',
      activePlayerOwned: false,
      activeIsAi: false,
    }, suddenDeathGravity)).toEqual({
      visible: false,
      gravity: effectiveGravity(0.2, 9, 6),
    });
    expect(resolveAimGuidePresentation({
      mode: 'network',
      activePlayerOwned: true,
      activeIsAi: false,
    }, openingGravity)).toEqual({
      visible: true,
      gravity: 0.2,
    });
  });
});

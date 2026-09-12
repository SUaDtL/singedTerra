import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

const layers = readBattleConsoleContract('ownership/layers.json') as any;

describe('archived layer authority contract', () => {
  it('retains the declared Pixi authority limits as verification-only evidence', () => {
    expect(layers.claims.pixiGameplayAuthority).toBe(false);
    expect(layers.claims.pixiInputAuthority).toBe(false);
    expect(layers.claims.pixiSemanticAuthority).toBe(false);
  });
});

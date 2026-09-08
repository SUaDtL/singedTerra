import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { layerAuthorityDescriptor } from './adapter';

const layers = readBattleConsoleContract('ownership/layers.json') as any;

describe('AC-16 observable Pixi/DOM authority', () => {
  it('keeps Pixi non-interactive and semantic DOM authoritative in ready and fallback', () => {
    expect(layerAuthorityDescriptor()).toEqual({
      gameplayWorld: 'canvas-2d', pixi: 'non-interactive-chrome',
      semantics: 'preact-dom', input: 'preact-dom', fallbackSemantics: 'same-preact-dom',
      competingPhysicalOwner: false, recordKeys: layers.records.map((record: { key: string }) => record.key),
    });
    expect(layers.claims.pixiGameplayAuthority).toBe(false);
    expect(layers.claims.pixiInputAuthority).toBe(false);
    expect(layers.claims.pixiSemanticAuthority).toBe(false);
  });
});

// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';
import { SemanticContractTree, type SemanticNodeDefinition } from './components/SemanticContractTree';
import type { BattleConsolePresentationState } from './types';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { replayIntentTransition } from './inputArbiter';

const traces = readBattleConsoleContract('topology/intent-transition-traces.json') as any;

describe('AC-15 semantic and intent parity', () => {
  it('replays every observed transition with exact-once ordered intent and result parity', async () => {
    for (const trace of traces.observed) {
      const actual = await replayIntentTransition(trace);
      expect(actual).toEqual(trace.targetTransition);
      expect(actual.intents.length).toBeLessThanOrEqual(1);
    }
  });

  it('announces upgraded power against the live cap in the semantic console', () => {
    const host = document.createElement('div');
    const powerNode: SemanticNodeDefinition = {
      stableKey: 'node:output:Power:52',
      sourceRecord: {
        accessibleName: 'Power', checked: null, current: null, disabled: false,
        expanded: null, focusable: false,
        live: null, modal: false, parentKey: null, pressed: null, role: '', rootKey: 'command-console-host',
        tabIndex: -1, tag: 'OUTPUT', visibleText: '50',
      },
    };
    const state: BattleConsolePresentationState = {
      commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
      armory: { open: false, submitting: false, items: [] },
      ballistics: { angle: 45, power: 150, powerCap: 200, wind: 0 },
      fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
      settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
      coach: { step: null, briefingOpen: false },
      focusOwner: null,
    };

    render(<SemanticContractTree nodes={[powerNode]} rootKey="command-console-host" state={state} dispatch={() => undefined} />, host);

    const power = host.querySelector('output');
    expect(power?.textContent).toBe('150');
    expect(power?.getAttribute('aria-label')).toBe('Power 150 of 200');
  });
});

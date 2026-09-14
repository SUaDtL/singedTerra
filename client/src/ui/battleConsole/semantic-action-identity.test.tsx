// @vitest-environment jsdom

import { fireEvent } from '@testing-library/dom';
import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import type { BattleConsolePresentationState } from './types';

const actionKeys = vi.hoisted(() => new Set([
  'node:button:Move tank left, 8 fuel maximum:14',
  'node:button:Move tank right, 8 fuel maximum:20',
  'node:button:Select next weapon, current Baby Missile:32',
  'armory-inline-host::weapon-trigger',
  'command-console-host::aim-left-control',
  'node:button:Aim barrel right:44',
  'node:button:Decrease power:49',
  'node:button:Increase power:53',
  'command-console-host::settings-trigger',
  'command-console-host::fire',
]));

vi.mock('./runtimeData', async (importOriginal) => {
  const original = await importOriginal<typeof import('./runtimeData')>();
  return {
    ...original,
    battleConsoleSemanticNodes: original.battleConsoleSemanticNodes.map((node) => (
      actionKeys.has(node.stableKey)
        ? {
            ...node,
            sourceRecord: {
              ...node.sourceRecord,
              accessibleName: `Localized action ${node.stableKey}`,
              visibleText: `Localized ${node.stableKey}`,
            },
          }
        : node
    )),
  };
});

import { BattleConsoleRoot } from './BattleConsoleRoot';

const state: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Commander', portrait: null, health: 100 },
  mobility: { fuel: 8, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { available: true, credits: 8_000, open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, powerCap: 100, wind: 0, canAdjust: true },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};

const intentOracle = [
  ['node:button:Move tank left, 8 fuel maximum:14', { type: 'move', delta: -1 }],
  ['node:button:Move tank right, 8 fuel maximum:20', { type: 'move', delta: 1 }],
  ['node:button:Select next weapon, current Baby Missile:32', { type: 'weapon-next' }],
  ['armory-inline-host::weapon-trigger', { type: 'armory-open' }],
  ['command-console-host::aim-left-control', { type: 'angle-step', delta: -1 }],
  ['node:button:Aim barrel right:44', { type: 'angle-step', delta: 1 }],
  ['node:button:Decrease power:49', { type: 'power-step', delta: -1 }],
  ['node:button:Increase power:53', { type: 'power-step', delta: 1 }],
  ['command-console-host::settings-trigger', {
    type: 'settings-open',
    origin: 'command-console-host::settings-trigger',
  }],
  ['command-console-host::fire', { type: 'fire' }],
] as const;

describe('wide semantic action identity', () => {
  it('dispatches the literal command oracle after every captured English label changes', () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);

    for (const [stableKey, expectedIntent] of intentOracle) {
      dispatch.mockClear();
      const control = host.querySelector<HTMLButtonElement>(`[data-semantic-key="${stableKey}"]`);
      expect(control, stableKey).not.toBeNull();
      fireEvent.click(control!);
      expect(dispatch, stableKey).toHaveBeenCalledExactlyOnceWith(expectedIntent);
    }
  });

  it('keeps typed disabled state independent of the captured labels', () => {
    const host = document.createElement('div');
    render(
      <BattleConsoleRoot
        state={{
          ...state,
          mobility: { ...state.mobility, canMoveLeft: false, canMoveRight: false },
          weapon: { ...state.weapon, canCycle: false },
          armory: { ...state.armory, available: false },
          ballistics: { ...state.ballistics, canAdjust: false },
          fireControl: { ...state.fireControl, ready: false, submitting: true },
        }}
        lifecycleStatus="fallback"
        dispatch={vi.fn()}
      />,
      host,
    );

    for (const stableKey of [...actionKeys].slice(0, 9)) {
      const control = host.querySelector<HTMLButtonElement>(`[data-semantic-key="${stableKey}"]`);
      expect(control, stableKey).not.toBeNull();
      expect(control?.disabled, stableKey).toBe(stableKey !== 'command-console-host::settings-trigger');
    }
    expect(host.querySelector<HTMLButtonElement>(
      '[data-semantic-key="command-console-host::fire"]',
    )?.disabled).toBe(true);
  });
});

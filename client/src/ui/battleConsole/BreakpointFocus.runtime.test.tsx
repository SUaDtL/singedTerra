// @vitest-environment jsdom
import { getByRole } from '@testing-library/dom';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleConsoleRoot } from './BattleConsoleRoot';
import type { BattleConsolePresentationState } from './types';
const state: BattleConsolePresentationState = {
  commander: {
    id: 'p1',
    name: 'Player 1',
    portrait: {
      color: '#e84d4d',
      loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
    },
    health: 100,
  },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};



const host = document.createElement('div');
afterEach(() => { render(null, host); host.remove(); });
describe('AC-01 responsive focus continuity', () => {
  it.each([['wide', 'compact'], ['compact', 'standard']] as const)('preserves focused semantic control from %s to %s', (from, to) => {
    document.body.append(host);
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" layoutMode={from} dispatch={dispatch} />, host);
    getByRole(host, 'button', { name: 'Aim barrel left' }).focus();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" layoutMode={to} dispatch={dispatch} />, host);
    expect((document.activeElement as HTMLElement)?.dataset['semanticKey']).toBe('command-console-host::aim-left-control');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not steal focus from an open dialog during a breakpoint change', async () => {
    document.body.append(host);
    const dispatch = vi.fn();
    const openState = { ...state, settings: { ...state.settings, open: true } };
    render(<BattleConsoleRoot state={openState} lifecycleStatus="ready" layoutMode="wide" dispatch={dispatch} />, host);
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Trajectory guide'));
    const sound = getByRole(host, 'switch', { name: 'Sound' });
    sound.focus();
    render(<BattleConsoleRoot state={openState} lifecycleStatus="ready" layoutMode="compact" dispatch={dispatch} />, host);
    expect(document.activeElement).toBe(sound);
  });
  it('does not reuse stale console focus after focus moved outside', () => {
    document.body.append(host);
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" layoutMode="compact" dispatch={dispatch} />, host);
    getByRole(host, 'button', { name: 'Aim barrel left' }).focus();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" layoutMode="wide" dispatch={dispatch} />, host);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

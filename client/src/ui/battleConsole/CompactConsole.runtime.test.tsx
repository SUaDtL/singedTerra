// @vitest-environment jsdom
import { fireEvent, getByRole, queryAllByRole } from '@testing-library/dom';
import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
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


describe('AC-01 compact console successor', () => {
  it('renders one compact region and ten working targets with stable focus identities', () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" layoutMode="compact" dispatch={dispatch} />, host);
    expect(host.querySelector('[data-battle-console-compact-chassis]')).not.toBeNull();
    expect(getByRole(host, 'group', { name: "Player 1's tank. Mobility: Tracks. Hull: Armor Hull. Turret: Cupola. Barrel: Cannon." })).not.toBeNull();
    expect(queryAllByRole(host, 'region', { name: 'Turn command console' })).toHaveLength(1);
    expect(host.querySelectorAll('[data-battle-console-target-key]')).toHaveLength(10);
    expect(host.querySelector('[data-battle-console-semantic-ink]')).toBeNull();
    fireEvent.click(getByRole(host, 'button', { name: 'Battle settings' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'settings-open', origin: 'command-console-host::settings-trigger' });
    fireEvent.click(getByRole(host, 'button', { name: 'Aim barrel left' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'angle-step', delta: -1 });
    fireEvent.click(getByRole(host, 'button', { name: 'Fire Baby Missile' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'fire' });
    expect(getByRole(host, 'button', { name: 'Open Armory' }).dataset['semanticKey']).toBe('armory-inline-host::weapon-trigger');
    expect(host.querySelectorAll('button[aria-label*="Wind"]')).toHaveLength(0);
    expect(host.textContent).not.toMatch(/read only/i);
  });
  it('reflects blocked controls and changed fuel without stale values', () => {
    const host = document.createElement('div');
    const blocked = { ...state, mobility: { fuel: 9, canMoveLeft: false, canMoveRight: false }, weapon: { ...state.weapon, name: 'Heavy Missile', canCycle: false }, fireControl: { ...state.fireControl, ready: false, status: 'Resolving' } };
    render(<BattleConsoleRoot state={blocked} lifecycleStatus="fallback" layoutMode="compact" dispatch={vi.fn()} />, host);
    expect(host.querySelector('[data-battle-console-compact-chassis]')).not.toBeNull();
    expect(host.querySelector('[data-semantic-key="node:span:100 fuel remaining:19"]')?.textContent).toBe('9');
    for (const name of ['Move tank left, 8 fuel maximum', 'Select next weapon, current Heavy Missile', 'Aim barrel left', 'Increase power', 'Fire Heavy Missile']) expect(getByRole(host, 'button', { name })).toHaveProperty('disabled', true);
  });
});

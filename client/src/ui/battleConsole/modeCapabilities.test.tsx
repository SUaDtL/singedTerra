// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { getByRole } from '@testing-library/dom';
import { BattleConsoleRoot } from './BattleConsoleRoot';
import type { BattleConsolePresentationState } from './types';

function stateFor({
  armoryAvailable,
  canAdjust,
  canCycle,
  fireReady,
}: Readonly<{
  armoryAvailable: boolean;
  canAdjust: boolean;
  canCycle: boolean;
  fireReady: boolean;
}>): BattleConsolePresentationState {
  return {
    commander: { id: 'p1', name: 'Commander', portrait: null, health: 100 },
    mobility: { fuel: 100, canMoveLeft: armoryAvailable, canMoveRight: armoryAvailable },
    weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle },
    armory: {
      available: armoryAvailable,
      credits: 8_000,
      open: false,
      submitting: false,
      items: [],
    },
    ballistics: { angle: 45, power: 50, powerCap: 100, wind: 0, canAdjust },
    fireControl: { status: fireReady ? 'Fire ready' : 'No ammunition', guidance: '', ready: fireReady, submitting: false },
    settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
    coach: { step: null, briefingOpen: false },
    focusOwner: null,
  } as BattleConsolePresentationState;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('battle console mode capabilities', () => {
  it.each(['wide', 'compact'] as const)(
    'keeps CQ1 aim and fire active while unsupported %s controls are disabled',
    (layoutMode) => {
      const host = document.createElement('div');
      document.body.append(host);
      render(
        <BattleConsoleRoot
          state={stateFor({ armoryAvailable: false, canAdjust: true, canCycle: false, fireReady: true })}
          lifecycleStatus="ready"
          dispatch={vi.fn()}
          layoutMode={layoutMode}
        />,
        host,
      );

      expect((getByRole(host, 'button', { name: /move tank left/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((getByRole(host, 'button', { name: /move tank right/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((getByRole(host, 'button', { name: /select next weapon/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((getByRole(host, 'button', { name: /armory unavailable in this mode/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((getByRole(host, 'button', { name: /aim barrel left/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /aim barrel right/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /decrease power/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /increase power/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /fire baby missile/i }) as HTMLButtonElement).disabled).toBe(false);
    },
  );

  it.each(['wide', 'compact'] as const)(
    'keeps ordinary %s aim adjustable when the selected attack cannot commit',
    (layoutMode) => {
      const host = document.createElement('div');
      document.body.append(host);
      render(
        <BattleConsoleRoot
          state={stateFor({ armoryAvailable: true, canAdjust: true, canCycle: true, fireReady: false })}
          lifecycleStatus="ready"
          dispatch={vi.fn()}
          layoutMode={layoutMode}
        />,
        host,
      );

      expect((getByRole(host, 'button', { name: /aim barrel left/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /aim barrel right/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /decrease power/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /increase power/i }) as HTMLButtonElement).disabled).toBe(false);
      expect((getByRole(host, 'button', { name: /fire baby missile/i }) as HTMLButtonElement).disabled).toBe(true);
    },
  );
});

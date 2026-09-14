// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEAPONS, type WeaponType } from '@shared/engine/WeaponSystem';
import {
  VERIFIED_CHALLENGE_CQ1,
  type VerifiedChallengeDescriptor,
} from '@shared/net/verifiedChallenge';
import type {
  BattleConsoleLifecycleController,
  BattleConsoleLifecycleEnterRequest,
} from '../ui/battleConsole/lifecycle';
import { InputHandler } from '../input/InputHandler';
import { HUD } from '../ui/HUD';
import { VerifiedChallengeClient } from './VerifiedChallengeClient';

const descriptor = Object.freeze({
  ...VERIFIED_CHALLENGE_CQ1,
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  admittedAt: '2026-09-13T12:00:00.000000Z',
  expiresAt: '2026-09-13T12:30:00.000000Z',
}) as VerifiedChallengeDescriptor;

const implementedWeapons = (Object.keys(WEAPONS) as WeaponType[])
  .filter((weapon) => WEAPONS[weapon].implemented);

function makeLifecycle() {
  let request: BattleConsoleLifecycleEnterRequest | null = null;
  const enter = vi.fn(async (next: BattleConsoleLifecycleEnterRequest) => {
    request = next;
    return { generation: 1, committed: true, status: 'ready', resources: {} } as never;
  });
  const lifecycle = {
    enter,
    restart: enter,
    update: vi.fn(),
    destroy: vi.fn(async () => ({} as never)),
    snapshot: () => ({ activeGeneration: request ? 1 : null, status: 'ready', resources: {} }) as never,
  } satisfies BattleConsoleLifecycleController;
  return { lifecycle, enter, request: () => request };
}

function mountScenario() {
  const root = document.createElement('aside');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  const rail = document.createElement('div');
  const canvas = document.createElement('div');
  document.body.append(root, overlay, modal, rail, canvas);
  const retained = makeLifecycle();
  const hud = new HUD(root, overlay, modal, rail, { battleConsoleLifecycle: retained.lifecycle });
  const recordAcceptedFire = vi.fn(() => true);
  const client = new VerifiedChallengeClient({
    descriptor,
    recordAcceptedFire,
    onTerminal: vi.fn(),
  });
  hud.setInputCapabilities(client.inputCapabilities);
  const input = new InputHandler(canvas, (action) => client.sendAction(action), {
    capabilities: client.inputCapabilities,
    initialAngle: client.getState()?.tanks[0]?.angle,
    initialPower: client.getState()?.tanks[0]?.power,
    powerCap: descriptor.limits.power.max,
  });
  hud.onMove((delta) => input.stepMove(delta));
  hud.onTouchWeapon(() => input.nextWeapon());
  hud.onPrimaryAction(() => input.triggerFire());
  hud.onWeaponSelect((weapon) => {
    if (!client.inputCapabilities.weaponSelection) return;
    client.sendAction({ type: 'select_weapon', weapon });
    input.setWeapon(weapon);
  });
  hud.onBuy((purchase, tankId) => {
    if (!client.inputCapabilities.buying) return;
    client.sendAction({ type: 'buy', ...purchase, ...(tankId ? { tankId } : {}) });
  });
  hud.setVerifiedChallenge({
    session: { status: 'active', descriptor, transcript: [], computeAttempts: 0 },
    result: null,
  });
  hud.update(client.getState()!, false, true, true, true);
  return { canvas, client, hud, input, recordAcceptedFire, ...retained };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  vi.restoreAllMocks();
});

describe('CQ1 input capabilities', () => {
  it('keeps retained aim/fire usable while movement, cycling, buying, and equip stay unavailable', async () => {
    const qScenario = mountScenario();
    try {
      await vi.waitFor(() => expect(qScenario.enter).toHaveBeenCalledOnce());
      const projection = qScenario.request()!.initialState;
      expect.soft(projection.mobility).toMatchObject({ canMoveLeft: false, canMoveRight: false });
      expect.soft(projection.weapon.canCycle).toBe(false);
      expect.soft(projection.armory).toMatchObject({ available: false, credits: 8_000 });
      expect.soft(projection.armory.items.every((item) => !item.canBuy && !item.canEquip)).toBe(true);

      qScenario.input.attach();
      const shieldSteps = implementedWeapons.indexOf('shield');
      for (let index = 0; index < shieldSteps; index += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true }));
      }
      qScenario.input.stepMove(8);
      qScenario.input.stepAngle(-13);
      qScenario.input.stepPower(50);
      qScenario.input.triggerFire();

      expect.soft(qScenario.recordAcceptedFire).toHaveBeenCalledOnce();
      expect.soft(qScenario.recordAcceptedFire).toHaveBeenCalledWith({ angle: 32, power: 100 });
    } finally {
      qScenario.input.detach();
      await qScenario.hud.destroy();
    }

    const equipScenario = mountScenario();
    try {
      await vi.waitFor(() => expect(equipScenario.enter).toHaveBeenCalledOnce());
      equipScenario.request()!.dispatch({ type: 'armory-equip', weapon: 'shield' });
      equipScenario.request()!.dispatch({
        type: 'armory-buy',
        purchase: { weapon: 'missile' },
        tankId: equipScenario.client.getState()!.activePlayerId,
      });
      equipScenario.request()!.dispatch({ type: 'move', delta: 1 });
      equipScenario.input.stepAngle(-13);
      equipScenario.input.stepPower(50);
      equipScenario.input.triggerFire();

      expect.soft(equipScenario.recordAcceptedFire).toHaveBeenCalledOnce();
      expect.soft(equipScenario.recordAcceptedFire).toHaveBeenCalledWith({ angle: 32, power: 100 });
    } finally {
      equipScenario.input.detach();
      await equipScenario.hud.destroy();
    }
  });
});

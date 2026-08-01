import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { PlayerAction } from '@shared/types/PlayerAction';
import {
  FIRST_SALVO_PREFERENCE_KEY,
  type FirstSalvoEligibility,
  type FirstSalvoStorage,
} from './firstSalvoCoach';
import {
  FirstSalvoController,
  canCommitFirstSalvoAction,
  isFirstSalvoForced,
  observeAndForwardFirstSalvoAction,
} from './firstSalvoController';

const eligibleTurn: FirstSalvoEligibility = {
  phase: 'PLAYER_TURN',
  activeIsAi: false,
  activeIsLocal: true,
  activeTankAlive: true,
};

function memoryStorage(initial: Record<string, string> = {}): FirstSalvoStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const throwingStorage: FirstSalvoStorage = {
  getItem: () => { throw new Error('storage unavailable'); },
  setItem: () => { throw new Error('storage unavailable'); },
};

function activeTank() {
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  return state.tanks.find((tank) => tank.id === state.activePlayerId)!;
}

describe('FirstSalvoController', () => {
  it('observes before one unchanged forward through the real action seam', () => {
    const controller = new FirstSalvoController({ storage: memoryStorage() });
    const action: PlayerAction = { type: 'set_angle', angle: 72 };
    const send = vi.fn<(next: PlayerAction) => void>();
    const order: string[] = [];
    vi.spyOn(controller, 'observe').mockImplementation((next, eligibility) => {
      order.push('observe');
      return FirstSalvoController.prototype.observe.call(controller, next, eligibility);
    });
    send.mockImplementation(() => order.push('send'));

    observeAndForwardFirstSalvoAction(controller, action, eligibleTurn, true, send);

    expect(order).toEqual(['observe', 'send']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(action);
    expect(send.mock.calls[0]![0]).toBe(action);
    expect(action).toEqual({ type: 'set_angle', angle: 72 });
    expect(controller.stepFor(eligibleTurn)).toBe('power-and-wind');
  });

  it('does not advance or persist actions outside a living local human turn', () => {
    const storage = memoryStorage();
    const controller = new FirstSalvoController({ storage });

    controller.observe({ type: 'fire' }, { ...eligibleTurn, activeIsLocal: false });

    expect(controller.stepFor(eligibleTurn)).toBe('aim');
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBeNull();
  });

  it('persists completion while forwarding a fire action unchanged', () => {
    const storage = memoryStorage();
    const controller = new FirstSalvoController({ storage });
    const fire: PlayerAction = { type: 'fire' };

    expect(controller.observe(fire, eligibleTurn)).toBe(fire);

    expect(controller.stepFor(eligibleTurn)).toBeNull();
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBe('v1:completed');
  });

  it.each([
    ['fire', { type: 'fire' } as const, 'missile' as const],
    ['shield', { type: 'use_shield' } as const, 'shield' as const],
  ])('forwards rejected zero-ammo %s once unchanged without completing', (_label, action, weapon) => {
    const storage = memoryStorage();
    const controller = new FirstSalvoController({ storage });
    const tank = activeTank();
    tank.selectedWeapon = weapon;
    tank.inventory[weapon] = { count: 0, unlimited: false };
    const send = vi.fn<(next: PlayerAction) => void>();

    observeAndForwardFirstSalvoAction(
      controller,
      action,
      eligibleTurn,
      canCommitFirstSalvoAction(tank, action),
      send,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe(action);
    expect(action).toEqual(action.type === 'fire' ? { type: 'fire' } : { type: 'use_shield' });
    expect(controller.stepFor(eligibleTurn)).toBe('aim');
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBeNull();
  });

  it.each([
    [{ type: 'fire' } as const, 'missile' as const],
    [{ type: 'use_shield' } as const, 'shield' as const],
  ])('completes an accepted $type action', (action, weapon) => {
    const storage = memoryStorage();
    const controller = new FirstSalvoController({ storage });
    const tank = activeTank();
    tank.selectedWeapon = weapon;
    tank.inventory[weapon] = { count: 1, unlimited: false };

    observeAndForwardFirstSalvoAction(
      controller,
      action,
      eligibleTurn,
      canCommitFirstSalvoAction(tank, action),
      () => undefined,
    );

    expect(controller.stepFor(eligibleTurn)).toBeNull();
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBe('v1:completed');
  });

  it('skips immediately and replay affects only the in-memory session', () => {
    const storage = memoryStorage({ [FIRST_SALVO_PREFERENCE_KEY]: 'v1:completed' });
    const controller = new FirstSalvoController({ storage });

    controller.replay();
    expect(controller.stepFor(eligibleTurn)).toBe('aim');
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBe('v1:completed');

    controller.skip();
    expect(controller.stepFor(eligibleTurn)).toBeNull();
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBe('v1:skipped');
  });

  it('returns to the saved local preference for a new game in the same tab', () => {
    const storage = memoryStorage({ [FIRST_SALVO_PREFERENCE_KEY]: 'v1:completed' });
    const controller = new FirstSalvoController({ storage });

    controller.replay();
    expect(controller.stepFor(eligibleTurn)).toBe('aim');
    controller.startNewGame();

    expect(controller.stepFor(eligibleTurn)).toBeNull();
  });

  it('keeps cold and replacement controllers hidden for a persisted skip', () => {
    const storage = memoryStorage({ [FIRST_SALVO_PREFERENCE_KEY]: 'v1:skipped' });
    const cold = new FirstSalvoController({ storage });

    expect(cold.stepFor(eligibleTurn)).toBeNull();
    cold.startNewGame();
    expect(cold.stepFor(eligibleTurn)).toBeNull();

    const replacement = new FirstSalvoController({ storage });
    expect(replacement.stepFor(eligibleTurn)).toBeNull();
  });

  it('retains completion across a same-tab replacement game when storage throws', () => {
    const controller = new FirstSalvoController({ storage: throwingStorage });

    controller.observe({ type: 'fire' }, eligibleTurn);
    expect(controller.stepFor(eligibleTurn)).toBeNull();
    controller.startNewGame();

    expect(controller.stepFor(eligibleTurn)).toBeNull();
  });

  it('retains skip across a same-tab replacement game when storage throws', () => {
    const controller = new FirstSalvoController({ storage: throwingStorage });

    controller.skip();
    expect(controller.stepFor(eligibleTurn)).toBeNull();
    controller.startNewGame();

    expect(controller.stepFor(eligibleTurn)).toBeNull();
  });

  it('forces only the exact tutorial query flag without clearing stored preferences', () => {
    const storage = memoryStorage({
      [FIRST_SALVO_PREFERENCE_KEY]: 'v1:completed',
      'unrelated-setting': 'keep-me',
    });

    expect(isFirstSalvoForced('?tutorial=first-salvo')).toBe(true);
    expect(isFirstSalvoForced('?tutorial=other')).toBe(false);
    expect(isFirstSalvoForced('?e2e=hotseat&tutorial=first-salvo')).toBe(true);

    const controller = new FirstSalvoController({ storage, force: isFirstSalvoForced('?tutorial=first-salvo') });
    expect(controller.stepFor(eligibleTurn)).toBe('aim');
    expect(storage.getItem(FIRST_SALVO_PREFERENCE_KEY)).toBe('v1:completed');
    expect(storage.getItem('unrelated-setting')).toBe('keep-me');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEAPONS, type WeaponType } from '@shared/engine/WeaponSystem';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { InputHandler, type InputHandlerOptions } from './InputHandler';

const implementedWeapons = (Object.keys(WEAPONS) as WeaponType[])
  .filter((weapon) => WEAPONS[weapon].implemented);

describe('InputHandler public contract', () => {
  let target: HTMLElement;
  let emit: ReturnType<typeof vi.fn<(action: PlayerAction) => void>>;
  let handler: InputHandler;

  const emitted = (): PlayerAction[] => emit.mock.calls.map(([action]) => action);

  const createHandler = (options: InputHandlerOptions = {}): InputHandler => {
    handler = new InputHandler(target, emit, options);
    return handler;
  };

  const dispatchKey = (key: string, repeat = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      repeat,
    });
    window.dispatchEvent(event);
    return event;
  };

  const dispatchPointer = (
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
    {
      clientX = 303.3333333333,
      clientY = 170,
      pointerId = 1,
      pointerType = 'mouse',
      isPrimary = true,
      button = 0,
    }: Partial<{
      clientX: number;
      clientY: number;
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      button: number;
    }> = {},
  ): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({
      clientX,
      clientY,
      pointerId,
      pointerType,
      isPrimary,
      button,
    })) {
      Object.defineProperty(event, key, { value });
    }
    target.dispatchEvent(event);
    return event;
  };

  const setBounds = (width = 400, height = 300): void => {
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width,
      height,
      right: 10 + width,
      bottom: 20 + height,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
  };

  beforeEach(() => {
    target = document.createElement('div');
    const capturedPointers = new Set<number>();
    target.setPointerCapture = vi.fn((pointerId: number) => capturedPointers.add(pointerId));
    target.releasePointerCapture = vi.fn((pointerId: number) => capturedPointers.delete(pointerId));
    target.hasPointerCapture = vi.fn((pointerId: number) => capturedPointers.has(pointerId));
    document.body.append(target);
    emit = vi.fn<(action: PlayerAction) => void>();
    handler = createHandler();
  });

  afterEach(() => {
    handler.detach();
    target.remove();
    vi.restoreAllMocks();
  });

  it('attaches only once and detaches idempotently', () => {
    handler.attach();
    handler.attach();

    const attachedEvent = dispatchKey('ArrowLeft');
    expect(emitted()).toEqual([{ type: 'set_angle', angle: 47 }]);
    expect(attachedEvent.defaultPrevented).toBe(true);

    handler.detach();
    handler.detach();
    const detachedEvent = dispatchKey('ArrowLeft');
    expect(emitted()).toHaveLength(1);
    expect(detachedEvent.defaultPrevented).toBe(false);
  });

  it('maps arrow keys to configured absolute angle and power steps', () => {
    createHandler({ initialAngle: 50, initialPower: 50, angleStep: 7, powerStep: 11 }).attach();

    dispatchKey('ArrowLeft');
    dispatchKey('ArrowRight');
    dispatchKey('ArrowUp');
    dispatchKey('ArrowDown');

    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 57 },
      { type: 'set_angle', angle: 50 },
      { type: 'set_power', power: 61 },
      { type: 'set_power', power: 50 },
    ]);
  });

  it('maps default ArrowUp and ArrowDown to absolute power values', () => {
    handler.attach();

    dispatchKey('ArrowUp');
    dispatchKey('ArrowDown');

    expect(emitted()).toEqual([
      { type: 'set_power', power: 52 },
      { type: 'set_power', power: 50 },
    ]);
  });

  it('maps A and D to one bounded movement action per physical key press', () => {
    handler.attach();

    for (const key of ['a', 'A', 'd', 'D']) dispatchKey(key);

    expect(emitted()).toEqual([
      { type: 'move', delta: -8 },
      { type: 'move', delta: -8 },
      { type: 'move', delta: 8 },
      { type: 'move', delta: 8 },
    ]);
  });

  it('suppresses movement auto-repeat while preserving repeatable aim', () => {
    handler.attach();

    const repeatedMove = dispatchKey('d', true);
    const repeatedAim = dispatchKey('ArrowRight', true);

    expect(repeatedMove.defaultPrevented).toBe(true);
    expect(repeatedAim.defaultPrevented).toBe(true);
    expect(emitted()).toEqual([{ type: 'set_angle', angle: 43 }]);
  });

  it('exposes the same discrete movement seam to semantic HUD buttons', () => {
    handler.stepMove(-8);
    handler.stepMove(8);

    expect(emitted()).toEqual([
      { type: 'move', delta: -8 },
      { type: 'move', delta: 8 },
    ]);
  });

  it('cancels every handled key and passes unknown keys through', () => {
    handler.attach();

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', ' ', 'Spacebar', 'Enter', 'q', 'Q']) {
      expect(dispatchKey(key).defaultPrevented).toBe(true);
    }

    const tab = dispatchKey('Tab');
    const unknown = dispatchKey('x');
    expect(tab.defaultPrevented).toBe(false);
    expect(unknown.defaultPrevented).toBe(false);
    expect(emitted()).toHaveLength(13);
  });

  it('clamps constructor and setAim seeds, suppresses bound no-ops, and emits inward steps', () => {
    createHandler({ initialAngle: 999, initialPower: -1 });

    handler.stepAngle(1);
    handler.stepPower(-1);
    expect(emitted()).toEqual([]);

    handler.stepAngle(-1);
    handler.stepPower(1);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 179 },
      { type: 'set_power', power: 1 },
    ]);

    emit.mockClear();
    handler.setAim(-50, 500);
    handler.stepAngle(-1);
    handler.stepPower(1);
    expect(emitted()).toEqual([]);

    handler.stepAngle(1);
    handler.stepPower(-1);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 1 },
      { type: 'set_power', power: 99 },
    ]);
  });

  it('cycles implemented weapons in order, can be reseeded, and wraps from shield', () => {
    handler.nextWeapon();
    handler.nextWeapon();
    expect(emitted()).toEqual([
      { type: 'select_weapon', weapon: implementedWeapons[1] },
      { type: 'select_weapon', weapon: implementedWeapons[2] },
    ]);

    emit.mockClear();
    handler.setWeapon('shield');
    handler.nextWeapon();
    expect(emitted()).toEqual([{ type: 'select_weapon', weapon: implementedWeapons[0] }]);

    emit.mockClear();
    handler.setWeapon('missile');
    handler.nextWeapon();
    expect(emitted()).toEqual([{ type: 'select_weapon', weapon: implementedWeapons[2] }]);
  });

  it('triggerFire dispatches fire for projectiles and use_shield for shields', () => {
    handler.triggerFire();
    expect(emitted()).toEqual([{ type: 'fire' }]);

    emit.mockClear();
    handler.setWeapon('shield');
    handler.triggerFire();
    expect(emitted()).toEqual([{ type: 'use_shield' }]);
  });

  it('maps fire and cycle keyboard aliases', () => {
    handler.attach();

    for (const key of [' ', 'Spacebar', 'Enter']) dispatchKey(key);
    handler.setWeapon('shield');
    dispatchKey(' ');
    handler.setWeapon('baby_missile');
    for (const key of ['q', 'Q']) dispatchKey(key);

    expect(emitted()).toEqual([
      { type: 'fire' },
      { type: 'fire' },
      { type: 'fire' },
      { type: 'use_shield' },
      { type: 'select_weapon', weapon: implementedWeapons[1] },
      { type: 'select_weapon', weapon: implementedWeapons[2] },
    ]);
  });

  it('lets the dedicated Fire control own Space/Enter without a second global fire', () => {
    const button = document.createElement('button');
    button.className = 'st-hud__primary-action';
    const clicks = vi.fn();
    button.addEventListener('click', clicks);
    document.body.append(button);
    handler.attach();

    for (const key of [' ', 'Enter']) {
      button.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      }));
      // Model the browser's semantic activation that follows the key event.
      button.click();
    }

    expect(emitted()).toEqual([]);
    expect(clicks).toHaveBeenCalledTimes(2);
    button.remove();
  });

  it('keeps Space firing after a non-fire HUD button has focus', () => {
    const button = document.createElement('button');
    button.dataset.command = 'aim-left';
    document.body.append(button);
    handler.attach();

    for (const key of [' ', 'Spacebar']) {
      button.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      }));
    }

    expect(emitted()).toEqual([{ type: 'fire' }, { type: 'fire' }]);
    button.remove();
  });

  it('keeps Enter native on a focused non-fire HUD button', () => {
    const button = document.createElement('button');
    button.dataset.command = 'aim-left';
    const clicks = vi.fn();
    button.addEventListener('click', clicks);
    document.body.append(button);
    handler.attach();

    button.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    }));
    button.click();

    expect(emitted()).toEqual([]);
    expect(clicks).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('leaves focused text entry controls outside game keyboard handling', () => {
    const input = document.createElement('input');
    document.body.append(input);
    handler.attach();

    for (const key of [' ', 'Enter']) {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      }));
    }

    expect(emitted()).toEqual([]);
    input.remove();
  });

  it('lets a focused native control own A/D without a global movement action', () => {
    const button = document.createElement('button');
    document.body.append(button);
    handler.attach();

    for (const key of ['a', 'A', 'd', 'D']) {
      button.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      }));
    }

    expect(emitted()).toEqual([]);
    button.remove();
  });

  it('maps a primary mouse pointer to the existing logical angle and power projection', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    const rightward = dispatchPointer('pointerdown');
    expect(rightward.defaultPrevented).toBe(true);
    expect(emitted()).toHaveLength(2);
    expect(emitted()[0]).toMatchObject({ type: 'set_angle' });
    expect((emitted()[0] as Extract<PlayerAction, { type: 'set_angle' }>).angle).toBeCloseTo(0);
    expect(emitted()[1]).toEqual({ type: 'set_power', power: 100 });
    expect(target.setPointerCapture).toHaveBeenCalledOnce();
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);

    dispatchPointer('pointerup');
    emit.mockClear();
    handler.setAim(45, 50);
    dispatchPointer('pointerdown', { clientX: 210, clientY: 30, pointerId: 2 });
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 100 },
    ]);
  });

  it.each(['touch', 'pen'])('maps one primary %s contact through the same projection without firing', (pointerType) => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    const contact = dispatchPointer('pointerdown', {
      clientX: 210,
      clientY: 86,
      pointerId: 7,
      pointerType,
    });

    expect(contact.defaultPrevented).toBe(true);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 60 },
    ]);
    expect(emitted().some((action) => action.type === 'fire')).toBe(false);
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('ignores invalid pointer starts', () => {
    setBounds();
    handler.attach();

    const noTank = dispatchPointer('pointerdown');
    handler.setActiveTankScreenPos(600, 300);
    const nonLeft = dispatchPointer('pointerdown', { pointerId: 2, button: 1 });
    const secondaryTouch = dispatchPointer('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: false,
    });

    expect(noTank.defaultPrevented).toBe(false);
    expect(nonLeft.defaultPrevented).toBe(false);
    expect(secondaryTouch.defaultPrevented).toBe(false);
    expect(emitted()).toEqual([]);
  });

  it('keeps one gesture owner and ignores mismatched pointer tails', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchPointer('pointerdown', { pointerId: 11, pointerType: 'touch' });
    emit.mockClear();
    const secondDown = dispatchPointer('pointerdown', {
      clientX: 210,
      clientY: 100,
      pointerId: 12,
      pointerType: 'touch',
      isPrimary: false,
    });
    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 12, pointerType: 'touch' });
    dispatchPointer('pointerup', { pointerId: 12, pointerType: 'touch' });
    expect(secondDown.defaultPrevented).toBe(false);
    expect(emitted()).toEqual([]);

    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 11, pointerType: 'touch' });
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 50 },
    ]);

    dispatchPointer('pointerup', { pointerId: 11, pointerType: 'touch' });
    const actionCountAfterRelease = emitted().length;
    dispatchPointer('pointermove', { pointerId: 11, pointerType: 'touch' });

    expect(emitted()).toHaveLength(actionCountAfterRelease);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(11);
  });

  it('cancels a held contact when the direct-aim game-state gate closes', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300, 'p1');
    handler.attach();

    dispatchPointer('pointerdown', { pointerId: 15, pointerType: 'touch' });
    emit.mockClear();
    handler.setDirectAimEnabled(false);
    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 15, pointerType: 'touch' });
    dispatchPointer('pointerdown', { clientX: 210, clientY: 100, pointerId: 16, pointerType: 'touch' });

    expect(emitted()).toEqual([]);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(15);

    handler.setDirectAimEnabled(true);
    dispatchPointer('pointerdown', { clientX: 210, clientY: 100, pointerId: 17, pointerType: 'touch' });
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 50 },
    ]);
  });

  it('cancels a held contact when ownership hands off to another tank', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300, 'p1');
    handler.attach();

    dispatchPointer('pointerdown', { pointerId: 18, pointerType: 'pen' });
    emit.mockClear();
    handler.setActiveTankScreenPos(700, 300, 'p2');
    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 18, pointerType: 'pen' });

    expect(emitted()).toEqual([]);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(18);
  });

  it('fails closed and admits a later pointer when capture acquisition throws', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    target.setPointerCapture = vi.fn(() => { throw new DOMException('ended', 'NotFoundError'); });
    handler.attach();

    const failed = dispatchPointer('pointerdown', { pointerId: 19, pointerType: 'touch' });
    expect(failed.defaultPrevented).toBe(true);
    expect(emitted()).toEqual([]);

    target.setPointerCapture = vi.fn();
    dispatchPointer('pointerdown', { clientX: 210, clientY: 86, pointerId: 20, pointerType: 'touch' });
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 60 },
    ]);
  });

  it('tears down a held contact when the live gate changes between moves', () => {
    let allowed = true;
    createHandler({ canDirectAim: () => allowed });
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchPointer('pointerdown', { pointerId: 23, pointerType: 'touch' });
    emit.mockClear();
    allowed = false;
    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 23, pointerType: 'touch' });
    expect(emitted()).toEqual([]);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(23);

    allowed = true;
    dispatchPointer('pointermove', { clientX: 210, clientY: 100, pointerId: 23, pointerType: 'touch' });
    expect(emitted()).toEqual([]);
  });

  it.each(['pointercancel', 'lostpointercapture'] as const)(
    'stops applying pointer moves after %s',
    (endType) => {
      setBounds();
      handler.setActiveTankScreenPos(600, 300);
      handler.attach();

      dispatchPointer('pointerdown', { pointerId: 21, pointerType: 'pen' });
      emit.mockClear();
      dispatchPointer(endType, { pointerId: 21, pointerType: 'pen' });
      dispatchPointer('pointermove', {
        clientX: 210,
        clientY: 100,
        pointerId: 21,
        pointerType: 'pen',
      });

      expect(emitted()).toEqual([]);
      dispatchPointer('pointerdown', {
        clientX: 210,
        clientY: 100,
        pointerId: 22,
        pointerType: 'pen',
      });
      expect(emitted()).toEqual([
        { type: 'set_angle', angle: 90 },
        { type: 'set_power', power: 50 },
      ]);
    },
  );

  it('removes the pointer lifecycle and releases capture when detached', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchPointer('pointerdown', { pointerId: 31, pointerType: 'touch' });
    emit.mockClear();
    dispatchPointer('pointermove', {
      clientX: 210,
      clientY: 100,
      pointerId: 31,
      pointerType: 'touch',
    });
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 50 },
    ]);

    const actionCountBeforeDetach = emitted().length;
    handler.detach();
    dispatchPointer('pointermove', { pointerId: 31, pointerType: 'touch' });
    dispatchPointer('pointerdown', { pointerId: 32, pointerType: 'touch' });

    expect(emitted()).toHaveLength(actionCountBeforeDetach);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(31);
  });

  it.each([
    [0, 300],
    [400, 0],
  ])('emits nothing for %d by %d target bounds', (width, height) => {
    setBounds(width, height);
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchPointer('pointerdown');

    expect(emitted()).toEqual([]);
  });
});

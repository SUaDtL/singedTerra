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

  const dispatchKey = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
    window.dispatchEvent(event);
    return event;
  };

  const dispatchMouse = (
    type: 'mousedown' | 'mousemove' | 'mouseup',
    clientX: number,
    clientY: number,
    button = 0,
  ): MouseEvent => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX, clientY });
    (type === 'mousedown' ? target : window).dispatchEvent(event);
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

  it('cancels every handled key and passes unknown keys through', () => {
    handler.attach();

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'Enter', 'Tab', 'q', 'Q']) {
      expect(dispatchKey(key).defaultPrevented).toBe(true);
    }

    const unknown = dispatchKey('x');
    expect(unknown.defaultPrevented).toBe(false);
    expect(emitted()).toHaveLength(10);
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
    for (const key of ['Tab', 'q', 'Q']) dispatchKey(key);

    expect(emitted()).toEqual([
      { type: 'fire' },
      { type: 'fire' },
      { type: 'fire' },
      { type: 'use_shield' },
      { type: 'select_weapon', weapon: implementedWeapons[1] },
      { type: 'select_weapon', weapon: implementedWeapons[2] },
      { type: 'select_weapon', weapon: implementedWeapons[3] },
    ]);
  });

  it('maps CSS mouse coordinates to logical drag angle and power', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    const rightward = dispatchMouse('mousedown', 303.3333333333, 170);
    expect(rightward.defaultPrevented).toBe(true);
    expect(emitted()).toHaveLength(2);
    expect(emitted()[0]).toMatchObject({ type: 'set_angle' });
    expect((emitted()[0] as Extract<PlayerAction, { type: 'set_angle' }>).angle).toBeCloseTo(0);
    expect(emitted()[1]).toEqual({ type: 'set_power', power: 100 });

    dispatchMouse('mouseup', 303.3333333333, 170);
    emit.mockClear();
    handler.setAim(45, 50);
    dispatchMouse('mousedown', 210, 30);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 100 },
    ]);
  });

  it('ignores invalid drag starts', () => {
    setBounds();
    handler.attach();

    const noTank = dispatchMouse('mousedown', 303.3333333333, 170);
    handler.setActiveTankScreenPos(600, 300);
    const nonLeft = dispatchMouse('mousedown', 303.3333333333, 170, 1);

    expect(noTank.defaultPrevented).toBe(false);
    expect(nonLeft.defaultPrevented).toBe(false);
    expect(emitted()).toEqual([]);
  });

  it('stops applying moves after mouseup', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchMouse('mousedown', 303.3333333333, 170);
    emit.mockClear();
    dispatchMouse('mousemove', 210, 100);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 50 },
    ]);

    dispatchMouse('mouseup', 303.3333333333, 170);
    const actionCountAfterMouseup = emitted().length;
    dispatchMouse('mousemove', 303.3333333333, 170);

    expect(emitted()).toHaveLength(actionCountAfterMouseup);
  });

  it('removes in-flight drag listeners when detached', () => {
    setBounds();
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchMouse('mousedown', 303.3333333333, 170);
    emit.mockClear();
    dispatchMouse('mousemove', 210, 100);
    expect(emitted()).toEqual([
      { type: 'set_angle', angle: 90 },
      { type: 'set_power', power: 50 },
    ]);

    const actionCountBeforeDetach = emitted().length;
    handler.detach();
    dispatchMouse('mousemove', 303.3333333333, 170);

    expect(emitted()).toHaveLength(actionCountBeforeDetach);
  });

  it.each([
    [0, 300],
    [400, 0],
  ])('emits nothing for %d by %d target bounds', (width, height) => {
    setBounds(width, height);
    handler.setActiveTankScreenPos(600, 300);
    handler.attach();

    dispatchMouse('mousedown', 303.3333333333, 170);

    expect(emitted()).toEqual([]);
  });
});

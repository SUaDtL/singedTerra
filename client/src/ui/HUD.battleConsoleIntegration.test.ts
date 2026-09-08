// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { MAX_MOVE_DELTA } from '@shared/engine/Movement';
import type {
  BattleConsoleLifecycleController,
  BattleConsoleLifecycleEnterRequest,
} from './battleConsole/lifecycle';
import { HUD } from './HUD';

function makeLifecycle() {
  let request: BattleConsoleLifecycleEnterRequest | null = null;
  const enter = vi.fn(async (next: BattleConsoleLifecycleEnterRequest) => {
    request = next;
    return { generation: 1, committed: true, status: 'ready', resources: {} } as never;
  });
  const update = vi.fn();
  const destroy = vi.fn(async () => ({} as never));
  const lifecycle = {
    enter,
    restart: enter,
    update,
    destroy,
    snapshot: () => ({ activeGeneration: request ? 1 : null, status: 'ready', resources: {} }) as never,
  } satisfies BattleConsoleLifecycleController;
  return { lifecycle, enter, update, destroy, request: () => request };
}

function mount() {
  const root = document.createElement('div');
  root.id = 'hud';
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  const rail = document.createElement('div');
  document.body.append(root, overlay, modal, rail);
  const fake = makeLifecycle();
  const hud = new HUD(root, overlay, modal, rail, {
    battleConsoleLifecycle: fake.lifecycle,
  });
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  return { root, overlay, modal, rail, hud, state, ...fake };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('P-08 live battle-console integration', () => {
  it.each([
    [2048, 864, false],
    [1440, 900, false],
    [1024, 768, false],
    [844, 390, true],
  ])('AC-01 fits both presentation hosts to the battlefield at %sx%s', async (width, height, coarse) => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(height);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)' && coarse,
      addEventListener() {}, removeEventListener() {},
    }));
    const app = document.createElement('main');
    app.id = 'app';
    document.body.append(app);
    const { hud, rail, state, request } = mount();
    try {
      hud.update(state, false, true, true, true);
      const surface = rail.querySelector<HTMLElement>('[data-battle-console-surface]')!;
      expect(Number.parseFloat(surface.style.left)).toBe(0);
      expect(Number.parseFloat(surface.style.width)).toBe(1200);
      expect(Number.parseFloat(surface.style.top)).toBeGreaterThanOrEqual(0);
      expect(Number.parseFloat(surface.style.top) + Number.parseFloat(surface.style.height)).toBeLessThanOrEqual(198);
      const authored = request()!.layout;
      const semantic = surface.querySelector<HTMLElement>('[data-battle-console-host="semantic"]')!;
      const pixi = surface.querySelector<HTMLElement>('[data-battle-console-host="pixi"]')!;
      const fitScale = 1200 / authored.cssWidth;
      expect(semantic.style.transform).toBe(`scale(${fitScale})`);
      expect(pixi.style.transform).toBe(semantic.style.transform);
      expect(semantic.style.transformOrigin).toBe('0 0');
    } finally {
      await hud.destroy();
    }
  });

  it('publishes the typed wide, standard, and compact-touch mode on the public HUD host', async () => {
    const width = vi.spyOn(window, 'innerWidth', 'get');
    const matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    const { hud, root, state, enter } = mount();

    width.mockReturnValue(1388);
    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    expect(root.dataset['battleConsoleMode']).toBe('wide');

    width.mockReturnValue(1200);
    hud.update(state, false, true, true, true);
    expect(root.dataset['battleConsoleMode']).toBe('standard');

    width.mockReturnValue(960);
    hud.update(state, false, true, true, true);
    expect(root.dataset['battleConsoleMode']).toBe('compact-touch');

    width.mockReturnValue(1388);
    matchMedia.mockImplementation((query) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    hud.update(state, false, true, true, true);
    expect(root.dataset['battleConsoleMode']).toBe('compact-touch');
  });

  it('mounts one new console owner, projects live state, and destroys before re-entry', async () => {
    const { hud, rail, state, enter, update, destroy } = mount();

    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));

    const initial = enter.mock.calls[0]![0];
    const surface = rail.querySelector<HTMLElement>('[data-battle-console-surface]');
    expect(surface).not.toBeNull();
    expect(initial.semanticHost.parentElement).toBe(surface);
    expect(initial.pixiHost.parentElement).toBe(surface);
    expect(surface?.dataset['battleConsoleMode']).toBe('standard');
    expect({
      position: surface?.style.position,
      left: surface?.style.left,
      top: surface?.style.top,
      width: surface?.style.width,
      height: surface?.style.height,
      pointerEvents: surface?.style.pointerEvents,
      semanticPointerEvents: initial.semanticHost.style.pointerEvents,
      pixiPointerEvents: initial.pixiHost.style.pointerEvents,
    }).toEqual({
      position: 'absolute',
      left: '0px',
      top: '13.9491525423729px',
      width: '1200px',
      height: '183.0508474576271px',
      pointerEvents: 'none',
      semanticPointerEvents: 'none',
      pixiPointerEvents: 'none',
    });
    expect(initial.initialState).toMatchObject({
      commander: {
        id: state.activePlayerId,
        name: 'Alice',
        health: 100,
        portrait: {
          color: state.tanks[0]!.color,
          loadout: state.tanks[0]!.loadout,
        },
      },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null },
      ballistics: { angle: 45, power: 50, wind: state.wind },
      fireControl: { status: 'Fire ready', ready: true },
    });
    expect(rail.querySelector('.st-hud__command-console')).toBeNull();
    const liveHosts = [...rail.querySelectorAll<HTMLElement>('[data-battle-console-host]')];
    expect(liveHosts).toHaveLength(2);
    expect(liveHosts.map((host) => ({
      position: host.style.position,
      left: host.style.left,
      top: host.style.top,
    }))).toEqual([
      { position: 'absolute', left: '0px', top: '0px' },
      { position: 'absolute', left: '0px', top: '0px' },
    ]);

    state.tanks[0]!.health = 73;
    state.tanks[0]!.fuel = 61;
    hud.update(state, false, true, true, true);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commander: expect.objectContaining({ health: 73 }),
        mobility: expect.objectContaining({ fuel: 61 }),
      }),
      expect.any(Object),
    );

    await hud.leaveBattleConsole();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(rail.querySelector('[data-battle-console-surface]')).toBeNull();
    expect(rail.querySelectorAll('[data-battle-console-host]')).toHaveLength(0);
    expect(hud).toMatchObject({
      battleConsoleSurfaceHost: null,
      battleConsoleSemanticHost: null,
      battleConsolePixiHost: null,
      battleConsoleSettingsHost: null,
      battleConsoleArmoryHost: null,
      battleConsoleCoachHost: null,
    });

    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(2));
  });

  it('parks reusable semantic HUD nodes in the live document after console teardown', async () => {
    const { hud, state, enter } = mount();
    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    const internals = hud as unknown as Record<string, HTMLElement>;
    const persistentNodes: HTMLElement[] = [
      internals['liveMatchInspectorMenuEl'],
      internals['overlayProgressionSignInBtnEl'],
      internals['overlayVerifiedRetryBtnEl'],
      internals['verifiedStatusEl'],
      internals['fieldOrderEl'],
    ].filter((node): node is HTMLElement => node instanceof HTMLElement);

    await hud.leaveBattleConsole();

    expect(persistentNodes.every((node) => node.isConnected)).toBe(true);
    expect(persistentNodes.every((node) => node.hidden || node.closest('[hidden]') !== null)).toBe(true);
  });

  it.each([true, false])('restores parked verified status and Field Order to Match on re-entry (status first: %s)', async (statusFirst) => {
    const { hud, state, enter } = mount();
    try {
      hud.update(state, false, true, true, true);
      await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
      hud.setVerifiedDeployment(null);
      hud.setFieldOrder(null);
      await hud.leaveBattleConsole();
      const internals = hud as unknown as Record<string, HTMLElement>;
      const status = internals['verifiedStatusEl']!;
      const order = internals['fieldOrderEl']!;
      const match = internals['matchCardEl']!;
      expect(status.isConnected).toBe(true);
      expect(order.isConnected).toBe(true);
      expect(status.closest('[data-hud-semantic-parking]')).not.toBeNull();
      expect(order.closest('[data-hud-semantic-parking]')).not.toBeNull();

      hud.update(state, false, true, true, true);
      const restoreStatus = () => hud.setVerifiedDeployment({ status: 'policy-refused' });
      const restoreOrder = () => hud.setFieldOrder({
        id: 'hold-the-field', title: 'Hold the Field', instruction: 'Win the duel.',
        progress: { awaitingWinner: true }, result: null,
      });
      if (statusFirst) { restoreStatus(); restoreOrder(); }
      else { restoreOrder(); restoreStatus(); }

      expect(status.parentElement).toBe(match);
      expect(order.parentElement).toBe(status);
      expect(status.hidden).toBe(false);
      expect(order.hidden).toBe(false);
      expect(status.closest('[data-hud-semantic-parking]')).toBeNull();
      expect(status.textContent).toContain('That action is not permitted');
      expect(order.textContent).toContain('Hold the Field');
    } finally {
      await hud.destroy();
    }
  });

  it('restores parked diagnostics and retry controls to their active owners', async () => {
    const { hud, state } = mount();
    try {
      hud.update(state, false, true, true, true);
      hud.setVerifiedDeployment(null);
      hud.setLiveMatchDiagnostics(null);
      await hud.leaveBattleConsole();
      const internals = hud as unknown as Record<string, HTMLElement>;
      const inspector = internals['liveMatchInspectorMenuEl']!;
      const retry = internals['overlayVerifiedRetryBtnEl']!;
      expect(inspector.closest('[data-hud-semantic-parking]')).not.toBeNull();
      expect(retry.closest('[data-hud-semantic-parking]')).not.toBeNull();
      hud.setLiveMatchDiagnostics(() => undefined);
      expect(inspector.parentElement).toBe(internals['pauseActionsEl']);
      hud.setVerifiedDeployment({
        status: 'retryable', humanSalvos: 6, cpuSalvos: 6, humanLimit: 6, cpuLimit: 6,
        deadline: { remainingMs: 30_000, warning: 'one-minute', acceptsInput: false, canComplete: true },
      });
      expect(retry.parentElement).toBe(internals['overlayPrimaryBtnEl']!.parentElement);
      expect(retry.nextElementSibling).toBe(internals['overlayPrimaryBtnEl']);
      hud.setLiveMatchDiagnostics(null);
      hud.setVerifiedDeployment(null);
      expect(inspector.isConnected).toBe(false);
      expect(retry.isConnected).toBe(false);
    } finally {
      await hud.destroy();
    }
  });

  it('excludes parked retry controls from terminal-report keyboard navigation', async () => {
    const { hud, state } = mount();
    try {
      hud.update(state, false, true, true, true);
      hud.setVerifiedDeployment(null);
      await hud.leaveBattleConsole();
      const internals = hud as unknown as Record<string, HTMLElement>;
      const primary = internals['overlayPrimaryBtnEl']!;
      const menu = internals['overlayMenuBtnEl']!;
      (hud as unknown as { overlayShown: boolean }).overlayShown = true;
      primary.focus();
      primary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      expect(document.activeElement).toBe(menu);
    } finally {
      await hud.destroy();
    }
  });

  it('returns inspector focus to the visible Match opener when its former menu is hidden', async () => {
    const { hud, root, modal, state } = mount();
    try {
      hud.update(state, false, true, true, true);
      hud.setLiveMatchDiagnostics(() => ({
        schemaVersion: 1, mode: 'hotseat', execution: 'casual', phase: 'PLAYER_TURN',
        round: 1, totalRounds: 3, turn: 1,
        activeSeat: { ordinal: 1, alive: true, health: 100 },
        input: 'ready', transport: 'not-applicable',
      }));
      const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
      menu.focus();
      menu.click();
      modal.querySelector<HTMLButtonElement>('[data-ui="live-match-inspector-menu"]')!.click();
      // Model the responsive closed drawer; jsdom does not evaluate viewport media queries.
      root.style.display = 'none';
      modal.querySelector<HTMLButtonElement>('[data-action="close-live-match-inspector"]')!.click();
      const opener = (hud as unknown as { matchDrawerBtnEl: HTMLButtonElement }).matchDrawerBtnEl;
      expect(document.activeElement).toBe(opener);
      expect(opener.closest('[inert]')).toBeNull();
    } finally {
      await hud.destroy();
    }
  });

  it('keeps the fine-pointer console inside the scaled battle rail without double shrinking', async () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.append(app);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(960);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(540);
    const { hud, rail, state, enter } = mount();
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 198 },
    });

    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    const surface = rail.querySelector<HTMLElement>('[data-battle-console-surface]');
    expect(surface?.dataset['battleConsoleMode']).toBe('compact-touch');
    expect(surface?.style.left).toBe('0px');
    expect(surface?.style.top).toBe('13.25px');
    expect(surface?.style.zoom).toBe('');
    expect(surface?.style.width).toBe('1200px');
    expect(surface?.style.height).toBe('183.75px');
  });

  it('scales the command console with the battlefield instead of cancelling stage zoom', async () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.append(app);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1934);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1272);
    const { hud, root, rail, state, enter } = mount();
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 198 },
    });

    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));

    const surface = rail.querySelector<HTMLElement>('[data-battle-console-surface]');
    expect(root.dataset['battleConsoleMode']).toBe('standard');
    expect(surface?.style.zoom).toBe('');
    expect(surface?.style.left).toBe('0px');
    expect(surface?.style.top).toBe('13.9491525423729px');
    expect(surface?.style.width).toBe('1200px');
    expect(surface?.style.height).toBe('183.0508474576271px');
  });

  it('routes semantic intents to the existing callbacks without duplicating authority', async () => {
    const { hud, state, enter, update, request } = mount();
    const move = vi.fn();
    const fire = vi.fn();
    const weapon = vi.fn();
    const buy = vi.fn();
    const sound = vi.fn();
    hud.onMove(move);
    hud.onPrimaryAction(fire);
    hud.onWeaponSelect(weapon);
    hud.onBuy(buy);
    hud.onToggleSound(sound);

    hud.update(state, false, true, true, true);
    await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    const dispatch = request()!.dispatch;

    dispatch({ type: 'move', delta: -1 });
    dispatch({ type: 'fire' });
    dispatch({ type: 'weapon-select', weapon: 'missile' });
    dispatch({ type: 'armory-buy', purchase: { weapon: 'missile' }, tankId: state.activePlayerId });
    dispatch({ type: 'settings-toggle-sound' });
    dispatch({ type: 'armory-open' });

    expect(move).toHaveBeenCalledWith(-MAX_MOVE_DELTA);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(weapon).toHaveBeenCalledWith('missile');
    expect(buy).toHaveBeenCalledWith({ weapon: 'missile' }, state.activePlayerId);
    expect(sound).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ armory: expect.objectContaining({ open: true }) }),
      expect.any(Object),
    );
  });

  it('AC-08 revokes Armory actions with live input permission and restores them on the next actionable frame', async () => {
    const { hud, state, enter, update, request } = mount();
    try {
      hud.update(state, false, true, true, true);
      await vi.waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
      const initial = request()!.initialState;
      expect(initial.weapon.canCycle).toBe(true);
      expect(initial.armory.items.some((item) => item.canBuy)).toBe(true);
      expect(initial.armory.items.some((item) => item.canEquip)).toBe(true);

      const deniedFrames = [
        { state, isFiring: false, canControl: true, activeIsLocal: false, verifiedInputAllowed: true },
        { state, isFiring: false, canControl: false, activeIsLocal: true, verifiedInputAllowed: true },
        { state, isFiring: false, canControl: true, activeIsLocal: true, verifiedInputAllowed: false },
        { state, isFiring: true, canControl: true, activeIsLocal: true, verifiedInputAllowed: true },
        { state: { ...state, phase: 'RESOLVING' as const }, isFiring: false, canControl: true, activeIsLocal: true, verifiedInputAllowed: true },
      ];
      for (const frame of deniedFrames) {
        hud.update(frame.state, frame.isFiring, frame.canControl, frame.activeIsLocal, frame.verifiedInputAllowed);
        const denied = update.mock.lastCall![0] as typeof initial;
        expect(denied.weapon.canCycle).toBe(false);
        expect(denied.armory.items.every((item) => !item.canBuy && !item.canEquip)).toBe(true);
        hud.update(state, false, true, true, true);
        const restored = update.mock.lastCall![0] as typeof initial;
        expect(restored.weapon.canCycle).toBe(true);
        expect(restored.armory.items.some((item) => item.canBuy)).toBe(true);
        expect(restored.armory.items.some((item) => item.canEquip)).toBe(true);
      }
    } finally {
      await hud.destroy();
    }
  });
});

// @vitest-environment jsdom

import { fireEvent, getByRole, queryAllByRole, waitFor } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { projectResponsiveLayout } from './projection';
import { BattleConsoleResourceLedger, resourcesAreZero } from './resources';
import { mountBattleConsoleGeneration } from './mount';
import type { BattleConsolePresentationState } from './types';

const pixiRuntime = vi.hoisted(() => {
  let resolveTextures!: (textures: Record<string, unknown>) => void;
  const textures = new Promise<Record<string, unknown>>((resolve) => { resolveTextures = resolve; });
  return {
    applications: [] as Array<{ destroyed: boolean }>,
    denyWebGl: true,
    initGate: null as Promise<void> | null,
    rejectNextLoad: true,
    resolveTextures,
    textures,
    load: vi.fn((urls: string[]) => {
      if (pixiRuntime.rejectNextLoad) {
        pixiRuntime.rejectNextLoad = false;
        return Promise.reject(new Error('texture load failed'));
      }
      return pixiRuntime.textures.then(() => Object.fromEntries(
        urls.map((url) => [url, { source: { url }, destroy: vi.fn() }]),
      ));
    }),
    render: vi.fn(),
    resize: vi.fn(),
  };
});

vi.mock('pixi.js', () => ({
  Graphics: class {
    label = '';
    eventMode = 'auto';
    alpha = 1;
    rotation = 0;
    readonly position = { set: vi.fn() };
    readonly scale = { set: vi.fn(), x: 1 };
    moveTo() { return this; }
    arc() { return this; }
    closePath() { return this; }
    fill() { return this; }
    stroke() { return this; }
    lineTo() { return this; }
    circle() { return this; }
    clear() { return this; }
  },
  Application: class {
    readonly stage = { addChild: vi.fn() };
    readonly canvas = document.createElement('canvas');
    readonly renderer = { resize: pixiRuntime.resize, resolution: 1 };
    destroyed = false;
    constructor() {
      pixiRuntime.applications.push(this);
    }
    async init() {
      if (pixiRuntime.denyWebGl) throw new Error('WebGL unavailable');
      if (pixiRuntime.initGate) await pixiRuntime.initGate;
    }
    render() { pixiRuntime.render(); }
    destroy() { this.destroyed = true; }
  },
  Assets: { load: pixiRuntime.load, unload: vi.fn() },
  loadTextures: { config: { preferWorkers: true } },
  Container: class {
    label = '';
    eventMode = 'auto';
    interactiveChildren = true;
    visible = true;
    alpha = 1;
    rotation = 0;
    readonly position = { set: vi.fn() };
    readonly scale = { set: vi.fn(), x: 1 };
    addChild() {}
    destroy() {}
  },
  Sprite: class {
    label = '';
    eventMode = 'auto';
    width = 0;
    height = 0;
    visible = true;
    alpha = 1;
    constructor(readonly options: { texture: unknown }) {}
  },
  Rectangle: class {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  },
  Texture: class {
    readonly source: unknown;
    readonly frame: unknown;
    constructor(options: { source: unknown; frame: unknown }) {
      this.source = options.source;
      this.frame = options.frame;
    }
  },
}));

const baseState: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};

function hosts() {
  const semanticHost = document.createElement('div');
  const pixiHost = document.createElement('div');
  const surface = document.createElement('div');
  surface.dataset['battleConsoleSurface'] = '';
  surface.append(pixiHost, semanticHost);
  return { semanticHost, pixiHost, surface };
}

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolveReady) => { resolvePromise = resolveReady; });
  return { promise, resolve: resolvePromise };
}

async function flushMicrotasks(count = 20): Promise<void> {
  for (let index = 0; index < count; index++) await Promise.resolve();
}

describe('R10 independent semantic readiness', () => {
  it('settles semantic destroy while renderer initialization is held and destroys the unclaimed late app', async () => {
    const gate = deferred();
    const target = hosts();
    const resources = new BattleConsoleResourceLedger();
    pixiRuntime.denyWebGl = false;
    pixiRuntime.initGate = gate.promise;
    const applicationStart = pixiRuntime.applications.length;
    const mounted = await mountBattleConsoleGeneration({
      ...target,
      initialState: baseState,
      dispatch: () => {},
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 0, resources, isCurrent: () => true },
    });
    for (let index = 0; index < 20 && pixiRuntime.applications.length === applicationStart; index++) {
      await Promise.resolve();
    }
    expect(pixiRuntime.applications.length - applicationStart).toBe(1);
    let outcome = 'pending';
    const destroying = mounted!.destroy().then((snapshot) => {
      outcome = 'destroyed';
      return snapshot;
    });
    try {
      await flushMicrotasks();
      expect(outcome).toBe('destroyed');
      expect(resourcesAreZero(await destroying)).toBe(true);
      expect(target.semanticHost.childElementCount).toBe(0);
      expect(target.pixiHost.childElementCount).toBe(0);
    } finally {
      pixiRuntime.initGate = null;
      gate.resolve();
      await destroying;
      await flushMicrotasks(40);
    }
    expect(pixiRuntime.applications.at(-1)?.destroyed).toBe(true);
    expect(target.pixiHost.childElementCount).toBe(0);
  });

  it('falls back without WebGL and on asset failure, then stays live while retry textures are delayed', async () => {
    pixiRuntime.denyWebGl = true;
    const firstHosts = hosts();
    const firstResources = new BattleConsoleResourceLedger();
    const first = await mountBattleConsoleGeneration({
      ...firstHosts,
      initialState: baseState,
      dispatch: () => {},
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 1, resources: firstResources, isCurrent: () => true },
    });
    await waitFor(() => expect(first?.status).toBe('fallback'));
    expect(firstHosts.semanticHost.firstElementChild?.getAttribute('data-battle-console-state')).toBe('fallback');
    expect(pixiRuntime.load).not.toHaveBeenCalled();
    await first?.destroy();

    pixiRuntime.denyWebGl = false;
    const secondHosts = hosts();
    const secondResources = new BattleConsoleResourceLedger();
    const second = await mountBattleConsoleGeneration({
      ...secondHosts,
      initialState: baseState,
      dispatch: () => {},
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 2, resources: secondResources, isCurrent: () => true },
    });
    await waitFor(() => expect(second?.status).toBe('fallback'));
    await second?.destroy();

    const thirdHosts = hosts();
    const thirdResources = new BattleConsoleResourceLedger();
    const intents: unknown[] = [];
    let thirdCurrent = true;
    const third = await mountBattleConsoleGeneration({
      ...thirdHosts,
      initialState: baseState,
      dispatch: (intent) => intents.push(intent),
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 3, resources: thirdResources, isCurrent: () => thirdCurrent },
    });

    await waitFor(() => expect(pixiRuntime.load).toHaveBeenCalledTimes(2));
    expect(queryAllByRole(thirdHosts.semanticHost, 'region', { name: 'Turn command console' })).toHaveLength(1);
    expect(thirdHosts.pixiHost.childElementCount).toBe(0);
    expect(thirdHosts.surface.dataset).toMatchObject({
      battleConsoleReady: 'true',
      battleConsoleTexturesReady: 'false',
      battleConsolePendingResources: '1',
    });

    const latestState: BattleConsolePresentationState = {
      ...baseState,
      ballistics: { ...baseState.ballistics, angle: 73 },
      fireControl: { ...baseState.fireControl, status: 'Target acquired' },
    };
    third?.update(latestState, projectResponsiveLayout('standard', 2));
    expect(thirdHosts.semanticHost.textContent).toContain('73');
    expect(thirdHosts.semanticHost.textContent).toContain('Target acquired');
    fireEvent.click(getByRole(thirdHosts.semanticHost, 'button', { name: 'Fire Baby Missile' }));
    expect(intents).toEqual([{ type: 'fire' }]);

    thirdCurrent = false;
    fireEvent.click(getByRole(thirdHosts.semanticHost, 'button', { name: 'Fire Baby Missile' }));
    expect(intents).toEqual([{ type: 'fire' }]);

    const thirdDestroyed = await third?.destroy();
    const thirdDestroyedAgain = await third?.destroy();
    expect(thirdDestroyedAgain).toEqual(thirdDestroyed);
    expect(thirdDestroyed && resourcesAreZero(thirdDestroyed)).toBe(true);
    expect(thirdHosts.semanticHost.childElementCount).toBe(0);
    expect(thirdHosts.pixiHost.childElementCount).toBe(0);
    expect(thirdHosts.surface.dataset['battleConsoleReady']).toBe('false');

    const fourthHosts = hosts();
    const fourthResources = new BattleConsoleResourceLedger();
    const fourth = await mountBattleConsoleGeneration({
      ...fourthHosts,
      initialState: baseState,
      dispatch: () => {},
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 4, resources: fourthResources, isCurrent: () => true },
    });
    const standard = projectResponsiveLayout('standard', 2);
    fourth?.update(latestState, standard);
    expect(pixiRuntime.load).toHaveBeenCalledTimes(2);

    pixiRuntime.resolveTextures({});
    await waitFor(() => expect(fourthHosts.pixiHost.querySelectorAll('canvas')).toHaveLength(1));
    expect(fourthHosts.surface.dataset).toMatchObject({
      battleConsoleReady: 'true',
      battleConsoleTexturesReady: 'true',
      battleConsolePendingResources: '0',
    });
    expect(fourthHosts.semanticHost.textContent).toContain('73');
    expect(thirdHosts.pixiHost.childElementCount).toBe(0);

    const initialRenders = pixiRuntime.render.mock.calls.length;
    const initialResizes = pixiRuntime.resize.mock.calls.length;
    fourth?.update(latestState, standard);
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders);
    expect(pixiRuntime.resize).toHaveBeenCalledTimes(initialResizes);

    const materialChange: BattleConsolePresentationState = {
      ...latestState,
      ballistics: { ...latestState.ballistics, angle: 74 },
    };
    fourth?.update(materialChange, standard);
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders + 1);
    expect(pixiRuntime.resize).toHaveBeenCalledTimes(initialResizes);
    expect(fourthHosts.semanticHost.textContent).toContain('74');

    fourth?.update(materialChange, projectResponsiveLayout('compact', 2));
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders + 2);
    expect(pixiRuntime.resize).toHaveBeenCalledTimes(initialResizes + 1);

    const destroyed = await fourth?.destroy();
    expect(destroyed && resourcesAreZero(destroyed)).toBe(true);
    expect(fourthHosts.semanticHost.childElementCount).toBe(0);
    expect(fourthHosts.pixiHost.childElementCount).toBe(0);
  });
});

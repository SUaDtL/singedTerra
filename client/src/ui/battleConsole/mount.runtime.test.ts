// @vitest-environment jsdom

import { fireEvent, getByRole, queryAllByRole } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectResponsiveLayout } from './projection';
import { BattleConsoleResourceLedger, resourcesAreZero } from './resources';
import { mountBattleConsoleGeneration } from './mount';
import type { BattleConsolePresentationState } from './types';

const pixiRuntime = vi.hoisted(() => ({
  rejectTexture: false,
  render: vi.fn(),
  resize: vi.fn(),
  domAdapter: { createCanvas: vi.fn(() => document.createElement('canvas')) },
  activeDomAdapter: null as null | { createCanvas: (...args: unknown[]) => unknown },
  getTestContext: vi.fn(() => ({ isContextLost: () => false })),
  getMaxFragmentPrecision: vi.fn(() => 'mediump'),
  getMaxTexturesPerBatch: vi.fn(() => 8),
}));

vi.mock('pixi.js', async (importOriginal) => ({
  Graphics: (await importOriginal<typeof import('pixi.js')>()).Graphics,
  DOMAdapter: {
    get: () => pixiRuntime.activeDomAdapter ?? pixiRuntime.domAdapter,
    set: (adapter: { createCanvas: (...args: unknown[]) => unknown }) => {
      pixiRuntime.activeDomAdapter = adapter;
    },
  },
  getTestContext: pixiRuntime.getTestContext,
  getMaxFragmentPrecision: pixiRuntime.getMaxFragmentPrecision,
  getMaxTexturesPerBatch: pixiRuntime.getMaxTexturesPerBatch,
  Batcher: { defaultOptions: { maxTextures: undefined } },
  Application: class {
    readonly stage = { addChild: vi.fn() };
    readonly canvas = document.createElement('canvas');
    readonly renderer = { resize: pixiRuntime.resize, resolution: 1 };
    async init() {}
    render() { pixiRuntime.render(); }
    destroy() {}
  },
  Assets: {
    load: vi.fn(async () => {
      if (pixiRuntime.rejectTexture) throw new Error('texture load failed');
      return { source: {}, destroy: vi.fn() };
    }),
    unload: vi.fn(async () => {}),
  },
  loadTextures: { config: { preferWorkers: true } },
  Container: class {
    label = '';
    eventMode = 'auto';
    interactiveChildren = true;
    readonly position = { set: vi.fn() };
    readonly scale = { set: vi.fn() };
    addChild() {}
    destroy() {}
  },
  Sprite: class {
    label = '';
    eventMode = 'auto';
    width = 0;
    height = 0;
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
    destroy() {}
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

describe('P-06 real semantic/Pixi mount', () => {
  beforeEach(() => {
    pixiRuntime.rejectTexture = false;
    pixiRuntime.render.mockClear();
    pixiRuntime.resize.mockClear();
    pixiRuntime.activeDomAdapter = pixiRuntime.domAdapter;
    pixiRuntime.getTestContext.mockClear();
    pixiRuntime.getMaxFragmentPrecision.mockClear();
    pixiRuntime.getMaxTexturesPerBatch.mockClear();
  });

  it('does no compositor work for an unchanged projection and exactly one bounded commit per material or geometry change', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const surface = document.createElement('div');
    surface.dataset['battleConsoleSurface'] = '';
    surface.append(pixiHost, semanticHost);
    const resources = new BattleConsoleResourceLedger();
    const wide = projectResponsiveLayout('wide', 1);
    const mounted = await mountBattleConsoleGeneration({
      semanticHost,
      pixiHost,
      initialState: baseState,
      dispatch: () => {},
      layout: wide,
      generationToken: { generation: 6, resources, isCurrent: () => true },
    });
    const initialRenders = pixiRuntime.render.mock.calls.length;

    mounted?.update(baseState, wide);
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders);
    expect(pixiRuntime.resize).not.toHaveBeenCalled();

    const changedState = {
      ...baseState,
      ballistics: { ...baseState.ballistics, angle: baseState.ballistics.angle + 1 },
    };
    mounted?.update(changedState, wide);
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders + 1);
    expect(pixiRuntime.resize).not.toHaveBeenCalled();
    expect(semanticHost.textContent).toContain('46');

    mounted?.update(changedState, projectResponsiveLayout('standard', 1));
    expect(pixiRuntime.render).toHaveBeenCalledTimes(initialRenders + 2);
    expect(pixiRuntime.resize).toHaveBeenCalledTimes(1);

    await mounted?.destroy();
  });

  it('owns one semantic root, drops stale intents, updates in place, and destroys to zero', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const surface = document.createElement('div');
    surface.dataset['battleConsoleSurface'] = '';
    surface.append(pixiHost, semanticHost);
    const resources = new BattleConsoleResourceLedger();
    const intents: unknown[] = [];
    let current = true;
    const mounted = await mountBattleConsoleGeneration({
      semanticHost,
      pixiHost,
      initialState: baseState,
      dispatch: (intent) => intents.push(intent),
      layout: projectResponsiveLayout('wide', 1),
      generationToken: {
        generation: 7,
        resources,
        isCurrent: () => current,
      },
    });

    expect(mounted).not.toBeNull();
    expect(mounted?.status).toBe('ready');
    expect(surface.dataset).toMatchObject({
      battleConsoleGeneration: '7',
      battleConsoleReady: 'true',
      battleConsoleTexturesReady: 'true',
    });
    expect(queryAllByRole(semanticHost, 'region', { name: 'Turn command console' })).toHaveLength(1);
    expect(pixiHost.querySelectorAll('canvas')).toHaveLength(1);
    fireEvent.click(getByRole(semanticHost, 'button', { name: 'Fire Baby Missile' }));
    expect(intents).toEqual([{ type: 'fire' }]);

    mounted?.update({
      ...baseState,
      commander: { ...baseState.commander, name: 'Player 2' },
    }, projectResponsiveLayout('standard', 2));
    expect(semanticHost.textContent).toContain('Player 2');

    current = false;
    fireEvent.click(getByRole(semanticHost, 'button', { name: 'Fire Baby Missile' }));
    expect(intents).toEqual([{ type: 'fire' }]);

    const firstDestroy = await mounted?.destroy();
    const repeatedDestroy = await mounted?.destroy();
    expect(firstDestroy).toEqual(repeatedDestroy);
    expect(firstDestroy && resourcesAreZero(firstDestroy)).toBe(true);
    expect(semanticHost.childElementCount).toBe(0);
    expect(pixiHost.childElementCount).toBe(0);
    expect(surface.dataset['battleConsoleReady']).toBe('false');
  });

  it('keeps the same semantic tree operable when Pixi initialization falls back', async () => {
    pixiRuntime.rejectTexture = true;
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const surface = document.createElement('div');
    surface.dataset['battleConsoleSurface'] = '';
    surface.append(pixiHost, semanticHost);
    const resources = new BattleConsoleResourceLedger();
    const mounted = await mountBattleConsoleGeneration({
      semanticHost,
      pixiHost,
      initialState: baseState,
      dispatch: () => {},
      layout: projectResponsiveLayout('wide', 1),
      generationToken: { generation: 9, resources, isCurrent: () => true },
    });

    expect(mounted?.status).toBe('fallback');
    expect(surface.dataset).toMatchObject({
      battleConsoleGeneration: '9',
      battleConsoleReady: 'true',
      battleConsoleTexturesReady: 'true',
    });
    expect(queryAllByRole(semanticHost, 'region', { name: 'Turn command console' })).toHaveLength(1);
    expect(semanticHost.firstElementChild?.getAttribute('data-battle-console-state')).toBe('fallback');
    expect(pixiHost.childElementCount).toBe(0);
    expect(resources.snapshot().preactRoots).toBe(1);
    await mounted?.destroy();
  });
});

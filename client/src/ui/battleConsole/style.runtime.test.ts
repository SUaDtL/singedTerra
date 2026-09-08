// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { mountBattleConsoleGeneration } from './mount';
import { projectResponsiveLayout } from './projection';
import { BattleConsoleResourceLedger } from './resources';
import type { BattleConsolePresentationState } from './types';

vi.mock('pixi.js', () => ({
  Application: class {
    readonly stage = { addChild() {} };
    readonly canvas = document.createElement('canvas');
    readonly renderer = { resize() {}, resolution: 1 };
    async init() {}
    render() {}
    destroy() {}
  },
  Assets: { load: async () => ({ destroy() {} }), unload: async () => {} },
  Container: class {
    label = '';
    eventMode = 'auto';
    interactiveChildren = true;
    readonly position = { set() {} };
    readonly scale = { set() {} };
    addChild() {}
    destroy() {}
  },
  Sprite: class {
    label = '';
    eventMode = 'auto';
    width = 0;
    height = 0;
  },
}));

const state: BattleConsolePresentationState = {
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

describe('P-07 component-scoped battle-console styling', () => {
  it.each([
    ['compact', 240 / 347],
    ['standard', 295 / 347],
    ['wide', 1],
  ] as const)('publishes generated local classes and the typed %s projection', async (mode, scale) => {
    const semanticHost = document.createElement('div');
    const resources = new BattleConsoleResourceLedger();
    const mounted = await mountBattleConsoleGeneration({
      semanticHost,
      pixiHost: document.createElement('div'),
      initialState: state,
      dispatch: () => {},
      layout: projectResponsiveLayout(mode, 1),
      generationToken: { generation: 1, resources, isCurrent: () => true },
    });

    const root = semanticHost.firstElementChild as HTMLElement;
    expect(root.dataset.battleConsoleMode).toBe(mode);
    expect(root.dataset.battleConsoleScope).toBe('css-module');
    expect(root.style.getPropertyValue('--battle-console-scale')).toBe(String(scale));
    expect(root.className).not.toContain('battle-console-root');
    expect(root.className).not.toContain('st-hud__');
    expect(root.className).not.toBe('');

    const semanticNodes = [...root.querySelectorAll<HTMLElement>('[data-semantic-key]')];
    expect(semanticNodes.length).toBeGreaterThan(0);
    expect(semanticNodes.every((node) => node.className !== '')).toBe(true);
    expect(semanticNodes.some((node) => node.className.includes('st-hud__'))).toBe(false);

    await mounted?.destroy();
  });
});

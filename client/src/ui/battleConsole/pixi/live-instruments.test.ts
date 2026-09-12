import { describe, expect, it } from 'vitest';
import { Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { createBattleConsoleChromeScene, type BattleConsoleTextureSet } from './scene';
import { projectResponsiveLayout } from '../projection';
import type { BattleConsolePresentationState } from '../types';

const state: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 0, power: 0, wind: -3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false }, focusOwner: null,
};

function createScene() {
  const texture = new Texture({ source: new TextureSource({ width: 1388, height: 212 }) });
  const textures = Object.fromEntries(['wide', 'standard', 'compact'].map(mode => [mode, {
    static: texture, dynamic: texture,
  }])) as unknown as BattleConsoleTextureSet;
  return createBattleConsoleChromeScene({ Container, Graphics, Rectangle, Sprite, Texture }, textures);
}

describe('AC-08 live inert instruments', () => {
  it('does not repaint the old rectangular reticle backing over the restored fire face', () => {
    const scene = createScene();
    scene.project(projectResponsiveLayout('wide', 1), state);
    expect(scene.sockets.get('fire-reticle')!.visible).toBe(false);
    scene.destroy();
  });
  it('retires the canonical red portrait when the real commander state is projected', () => {
    const scene = createScene();
    scene.project(projectResponsiveLayout('wide', 1), state);
    expect(scene.sockets.get('tank-portrait')!.visible).toBe(false);
    scene.destroy();
  });
  it('moves the real angle needle from right through up to left as projected aim changes', () => {
    const scene = createScene();
    const layout = projectResponsiveLayout('wide', 1);
    scene.project(layout, state);
    const needle = scene.root.getChildByLabel('live-angle-needle', true);
    expect(needle).toBeInstanceOf(Graphics);
    expect([needle!.x, needle!.y]).toEqual([609, 102]);
    expect(needle!.rotation).toBeCloseTo(0);
    scene.project(layout, { ...state, ballistics: { ...state.ballistics, angle: 90 } });
    expect(needle!.rotation).toBeCloseTo(-Math.PI / 2);
    scene.project(layout, { ...state, ballistics: { ...state.ballistics, angle: 180 } });
    expect(needle!.rotation).toBeCloseTo(-Math.PI);
    expect(needle!.eventMode).toBe('none');
    scene.destroy();
    expect(needle!.destroyed).toBe(true);
  });

  it('changes the drawn power arc and needle with power without allocating new display objects', () => {
    const scene = createScene();
    const layout = projectResponsiveLayout('standard', 1);
    scene.project(layout, state);
    const arc = scene.root.getChildByLabel('live-power-arc', true) as Graphics;
    const needle = scene.root.getChildByLabel('live-power-needle', true);
    expect(arc).toBeInstanceOf(Graphics);
    expect([needle!.x, needle!.y]).toEqual([753, 102]);
    expect(arc.context.instructions).toHaveLength(0);
    const count = scene.root.children.length;
    scene.project(layout, { ...state, ballistics: { ...state.ballistics, power: 100 } });
    expect(arc.context.instructions.length).toBeGreaterThan(0);
    expect(arc.getLocalBounds().width).toBeGreaterThan(70);
    expect(needle!.rotation).toBeCloseTo(0);
    expect(scene.root.children).toHaveLength(count);
    scene.destroy();
  });

  it('normalizes the power instrument against the active permitted cap', () => {
    const scene = createScene();
    const layout = projectResponsiveLayout('wide', 1);
    scene.project(layout, {
      ...state,
      ballistics: { ...state.ballistics, power: 100, powerCap: 200 },
    });
    const needle = scene.root.getChildByLabel('live-power-needle', true);
    expect(needle!.rotation).toBeCloseTo(-Math.PI / 2);
    scene.destroy();
  });

  it('reverses the wind indicator and extinguishes ready lamps during submission', () => {
    const scene = createScene();
    const layout = projectResponsiveLayout('wide', 1);
    scene.project(layout, state);
    const wind = scene.root.getChildByLabel('live-wind-direction', true);
    const lamps = scene.root.getChildByLabel('live-ready-lamps', true);
    expect(wind).toBeInstanceOf(Graphics);
    expect([wind!.x, wind!.y]).toEqual([900, 94]);
    expect(wind!.scale.x).toBe(-1);
    expect(lamps!.alpha).toBe(1);
    scene.project(layout, { ...state, ballistics: { ...state.ballistics, wind: 3 },
      fireControl: { ...state.fireControl, submitting: true } });
    expect(wind!.scale.x).toBe(1);
    expect(lamps!.alpha).toBeLessThan(0.4);
    expect(scene.root.eventMode).toBe('none');
    expect(scene.root.interactiveChildren).toBe(false);
    scene.destroy();
  });
});

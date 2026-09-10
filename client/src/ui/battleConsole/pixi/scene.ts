import type { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';
import type { BattleConsolePresentationState } from '../types';
import chromeContract from '../../../../../.codearbiter/contracts/battle-console/topology/chrome-sockets.json';
import appearanceContract from '../../../../../.codearbiter/contracts/battle-console/state/dynamic-appearance.json';
import {
  battleConsoleModeAssets,
  battleConsoleModeAssetUrl,
} from '../modeAssets';
import type { BattleConsoleLayoutMode, ResponsiveLayoutProjection } from '../projection';

export function battleConsoleChromeUrl(baseUrl: string, mode: BattleConsoleLayoutMode = 'wide'): string {
  return battleConsoleModeAssetUrl(baseUrl, 'static-chrome', mode);
}

export function battleConsoleDynamicUrl(baseUrl: string, mode: BattleConsoleLayoutMode = 'wide'): string {
  return battleConsoleModeAssetUrl(baseUrl, 'canonical-pixi-layer', mode);
}

export const BATTLE_CONSOLE_CHROME_URL = battleConsoleChromeUrl(import.meta.env.BASE_URL);
export const BATTLE_CONSOLE_DYNAMIC_URL = battleConsoleDynamicUrl(import.meta.env.BASE_URL);
export const BATTLE_CONSOLE_LOGICAL_SIZE = Object.freeze({ width: 1388, height: 212 });
export const BATTLE_CONSOLE_ASSET_MODES = Object.freeze(['wide', 'standard', 'compact'] as const);

export interface ChromeSocketRegistration {
  readonly key: string;
  readonly rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly assembly: string;
  readonly semanticAuthority: false;
  readonly inputAuthority: false;
}

export const chromeSocketRegistry: readonly ChromeSocketRegistration[] = Object.freeze(
  chromeContract.sockets.map((socket) => Object.freeze({
    key: socket.key,
    rect: Object.freeze({ ...socket.rect }),
    assembly: socket.assembly,
    semanticAuthority: false as const,
    inputAuthority: false as const,
  })),
);

export const dynamicAppearanceRegistry = Object.freeze({
  expectationKeys: Object.freeze(appearanceContract.expectations.map((entry) => entry.key)),
  reconstructsOwners: false,
  usesMasksToHideWrongInk: false,
});

export function stateFreeChromeDescriptor() {
  return Object.freeze({
    socketKeys: Object.freeze(chromeSocketRegistry.map((socket) => socket.key)),
    liveInkKeys: Object.freeze([]),
    semanticAuthority: false,
    inputAuthority: false,
  });
}

export interface BattleConsolePixiConstructors {
  readonly Graphics?: new () => Graphics;
  readonly Container: new () => Container;
  readonly Sprite: new (options: { texture: Texture }) => Sprite;
  readonly Texture: new (options: { source: Texture['source']; frame: Rectangle }) => Texture;
  readonly Rectangle: new (x: number, y: number, width: number, height: number) => Rectangle;
}

export interface BattleConsoleChromeScene {
  readonly root: Container;
  readonly staticChrome: Sprite;
  readonly staticChromeByMode: ReadonlyMap<BattleConsoleLayoutMode, Sprite>;
  readonly sockets: ReadonlyMap<string, Container>;
  project(layout: ResponsiveLayoutProjection, state?: BattleConsolePresentationState): void;
  destroy(): void;
}

export type BattleConsoleTextureSet = Readonly<Record<BattleConsoleLayoutMode, Readonly<{
  static: Texture;
  dynamic: Texture;
}>>>;

/** Instrument ink is drawn in the same logical space as the existing brass rims. */
function createLiveInstruments(constructors: BattleConsolePixiConstructors, root: Container) {
  if (!constructors.Graphics) throw new Error('Pixi Graphics is required for live instruments');
  const layer = new constructors.Container();
  layer.label = 'battle-console-live-instruments';
  layer.eventMode = 'none';
  layer.interactiveChildren = false;
  root.addChild(layer);
  const graphics = (label: string) => {
    const drawing = new constructors.Graphics!();
    drawing.label = label;
    drawing.eventMode = 'none';
    layer.addChild(drawing);
    return drawing;
  };
  const face = graphics('live-instrument-faces');
  const centers = [609, 753, 900];
  for (const x of centers) {
    face.moveTo(x - 48, 102).arc(x, 102, 48, Math.PI, Math.PI * 2)
      .closePath().fill(0x101719);
    face.arc(x, 102, 39, Math.PI, Math.PI * 2).stroke({ color: 0x344448, width: 5 });
    for (let tick = 0; tick <= 10; tick++) {
      const angle = Math.PI + tick * Math.PI / 10;
      face.moveTo(x + Math.cos(angle) * 43, 102 + Math.sin(angle) * 43)
        .lineTo(x + Math.cos(angle) * 39, 102 + Math.sin(angle) * 39)
        .stroke({ color: 0xa48a50, width: tick % 5 === 0 ? 2 : 1 });
    }
  }
  const needle = (name: string, x: number, color: number) => {
    const drawing = graphics(name);
    drawing.moveTo(-4, 0).lineTo(36, 0).stroke({ color, width: 4, cap: 'round' });
    drawing.circle(0, 0, 4).fill(0xbda578);
    drawing.position.set(x, 102);
    return drawing;
  };
  const angleNeedle = needle('live-angle-needle', 609, 0x8ac8f4);
  const powerArc = graphics('live-power-arc');
  const powerNeedle = needle('live-power-needle', 753, 0xf4cc71);
  const wind = graphics('live-wind-direction');
  wind.moveTo(-25, 0).lineTo(25, 0).moveTo(14, -9).lineTo(25, 0).lineTo(14, 9)
    .stroke({ color: 0x8ac8f4, width: 3, cap: 'round', join: 'round' });
  wind.position.set(900, 94);
  const lamps = graphics('live-ready-lamps');
  for (let index = 0; index < 6; index++) {
    lamps.circle(1109 + index * 13, 100, 5).fill({ color: 0xaada55, alpha: 0.15 });
    lamps.circle(1109 + index * 13, 100, 2.5).fill(0xaada55);
  }
  let paintedPower: number | null = null;
  return {
    project(layout: ResponsiveLayoutProjection, state: BattleConsolePresentationState) {
      layer.scale.set(battleConsoleModeAssets[layout.mode].surface.width / BATTLE_CONSOLE_LOGICAL_SIZE.width);
      angleNeedle.rotation = -Math.max(0, Math.min(180, state.ballistics.angle)) * Math.PI / 180;
      const powerCap = Math.max(0, state.ballistics.powerCap ?? DEFAULT_POWER_CAP);
      const power = powerCap === 0
        ? 0
        : Math.max(0, Math.min(powerCap, state.ballistics.power)) / powerCap;
      powerNeedle.rotation = Math.PI * (power - 1);
      if (power !== paintedPower) {
        powerArc.clear();
        if (power > 0) powerArc.arc(753, 102, 39, Math.PI, Math.PI + power * Math.PI)
          .stroke({ color: 0xf4cc71, width: 5, cap: 'round' });
        paintedPower = power;
      }
      wind.scale.x = state.ballistics.wind < 0 ? -1 : 1;
      wind.alpha = state.ballistics.wind === 0 ? 0.25 : 1;
      lamps.alpha = state.fireControl.ready && !state.fireControl.submitting ? 1 : 0.18;
    },
  };
}

/** Builds one inert, indexed Pixi display tree below the semantic owner. */
export function createBattleConsoleChromeScene(
  constructors: BattleConsolePixiConstructors,
  textures: BattleConsoleTextureSet,
): BattleConsoleChromeScene {
  const root = new constructors.Container();
  root.label = 'battle-console-pixi-root';
  root.eventMode = 'none';
  root.interactiveChildren = false;

  const staticChromeByMode = new Map<BattleConsoleLayoutMode, Sprite>();
  for (const mode of BATTLE_CONSOLE_ASSET_MODES) {
    const staticChrome = new constructors.Sprite({ texture: textures[mode].static });
    staticChrome.label = `battle-console-static-chrome:${mode}`;
    staticChrome.eventMode = 'none';
    staticChrome.width = battleConsoleModeAssets[mode].surface.width;
    staticChrome.height = battleConsoleModeAssets[mode].surface.height;
    staticChrome.visible = mode === 'wide';
    root.addChild(staticChrome);
    staticChromeByMode.set(mode, staticChrome);
  }
  const staticChrome = staticChromeByMode.get('wide')!;

  const sockets = new Map<string, Container>();
  const socketSprites = new Map<string, ReadonlyMap<BattleConsoleLayoutMode, Sprite>>();
  for (const registration of chromeSocketRegistry) {
    if (sockets.has(registration.key)) {
      throw new Error(`Duplicate battle-console chrome socket: ${registration.key}`);
    }
    const socket = new constructors.Container();
    socket.label = `battle-console-socket:${registration.key}`;
    socket.eventMode = 'none';
    socket.interactiveChildren = false;
    const sprites = new Map<BattleConsoleLayoutMode, Sprite>();
    for (const mode of BATTLE_CONSOLE_ASSET_MODES) {
      const region = battleConsoleModeAssets[mode].dynamic.regions.find((candidate) => candidate.key === registration.key);
      if (!region) throw new Error(`Missing ${mode} battle-console chrome socket: ${registration.key}`);
      const frame = new constructors.Rectangle(
        region.atlasRect.x,
        region.atlasRect.y,
        region.atlasRect.width,
        region.atlasRect.height,
      );
      const framedTexture = new constructors.Texture({ source: textures[mode].dynamic.source, frame });
      const dynamicSprite = new constructors.Sprite({ texture: framedTexture });
      dynamicSprite.label = `battle-console-dynamic:${registration.key}:${mode}`;
      dynamicSprite.eventMode = 'none';
      dynamicSprite.width = region.targetRect.width;
      dynamicSprite.height = region.targetRect.height;
      dynamicSprite.visible = mode === 'wide';
      socket.addChild(dynamicSprite);
      sprites.set(mode, dynamicSprite);
    }
    root.addChild(socket);
    sockets.set(registration.key, socket);
    socketSprites.set(registration.key, sprites);
  }

  let destroyed = false;
  let instruments: ReturnType<typeof createLiveInstruments> | null = null;
  return {
    root,
    staticChrome,
    staticChromeByMode,
    sockets,
    project(layout, state) {
      if (destroyed) return;
      root.scale.set(1);
      for (const mode of BATTLE_CONSOLE_ASSET_MODES) {
        const staticSprite = staticChromeByMode.get(mode)!;
        staticSprite.visible = mode === layout.mode;
      }
      for (const registration of chromeSocketRegistry) {
        const socket = sockets.get(registration.key)!;
        const region = battleConsoleModeAssets[layout.mode].dynamic.regions
          .find((candidate) => candidate.key === registration.key)!;
        socket.position.set(region.targetRect.x, region.targetRect.y);
        for (const mode of BATTLE_CONSOLE_ASSET_MODES) {
          socketSprites.get(registration.key)!.get(mode)!.visible = mode === layout.mode;
        }
        if (state) {
          socket.visible = !['tank-portrait', 'angle-arc', 'angle-needle', 'power-arc', 'power-needle', 'wind-glyph', 'ready-lamps', 'fire-reticle'].includes(registration.key);
          if (registration.key === 'ready-icon') socket.alpha = state.fireControl.ready && !state.fireControl.submitting ? 1 : 0.18;
        }
      }
      if (state) {
        instruments ??= createLiveInstruments(constructors, root);
        instruments.project(layout, state);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sockets.clear();
      root.destroy({ children: true });
    },
  };
}

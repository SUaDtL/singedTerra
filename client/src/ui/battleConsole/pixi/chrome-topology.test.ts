import { describe, expect, it, vi } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';
import { battleConsoleModeAssets } from '../modeAssets';
import { projectResponsiveLayout } from '../projection';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { chromeSocketRegistry, createBattleConsoleChromeScene } from './scene';

const chrome = readBattleConsoleContract('topology/chrome-sockets.json') as any;

describe('AC-13 complete chrome registry', () => {
  it('registers each bounded physical socket once without semantic or input authority', () => {
    expect(chromeSocketRegistry).toEqual(chrome.sockets.map((socket: Record<string, unknown>) => ({
      key: socket.key, rect: socket.rect,
      semanticAuthority: false, inputAuthority: false,
    })));
  });

  it('fills every dynamic socket from its canonical atlas frame', () => {
    class FakeContainer {
      label = '';
      eventMode = 'auto';
      interactiveChildren = true;
      children: unknown[] = [];
      position = { set: vi.fn() };
      scale = { set: vi.fn() };
      addChild(child: unknown) { this.children.push(child); }
      destroy() {}
    }
    class FakeSprite {
      label = '';
      eventMode = 'auto';
      width = 0;
      height = 0;
      visible = true;
      constructor(readonly options: { texture: unknown }) {}
    }
    class FakeRectangle {
      constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
      ) {}
    }
    class FakeTexture {
      constructor(readonly options: { source: unknown; frame: FakeRectangle }) {}
    }
    const textures = Object.fromEntries((['wide', 'standard', 'compact'] as const).map((mode) => [mode, {
      static: { source: { key: `static:${mode}` } },
      dynamic: { source: { key: `dynamic:${mode}` } },
    }]));
    const scene = createBattleConsoleChromeScene(
      { Container: FakeContainer, Sprite: FakeSprite, Texture: FakeTexture, Rectangle: FakeRectangle } as never,
      textures as never,
    );

    for (const registration of chromeSocketRegistry) {
      const socket = scene.sockets.get(registration.key) as unknown as FakeContainer;
      expect(socket.children).toHaveLength(3);
      const sprite = socket.children[0] as FakeSprite;
      const framed = sprite.options.texture as FakeTexture;
      expect(framed.options.source).toBe((textures as Record<string, { dynamic: { source: unknown } }>).wide!.dynamic.source);
      expect(framed.options.frame).toEqual(new FakeRectangle(
        registration.rect.x,
        registration.rect.y,
        registration.rect.width,
        registration.rect.height,
      ));
      expect(sprite.width).toBe(registration.rect.width);
      expect(sprite.height).toBe(registration.rect.height);
    }

    scene.project(projectResponsiveLayout('standard', 1));
    expect((scene.root as unknown as FakeContainer).scale.set).toHaveBeenLastCalledWith(1);
    for (const registration of chromeSocketRegistry) {
      const socket = scene.sockets.get(registration.key) as unknown as FakeContainer;
      const region = battleConsoleModeAssets.standard.dynamic.regions
        .find((candidate) => candidate.key === registration.key)!;
      expect(socket.position.set).toHaveBeenLastCalledWith(region.targetRect.x, region.targetRect.y);
      expect((socket.children[1] as FakeSprite).visible).toBe(true);
      expect((socket.children[0] as FakeSprite).visible).toBe(false);
    }
  });
});

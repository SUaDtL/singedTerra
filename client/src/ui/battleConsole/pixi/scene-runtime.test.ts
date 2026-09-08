import { describe, expect, it } from 'vitest';
import { battleConsoleChromeUrl, battleConsoleDynamicUrl } from './scene';

describe('P-04 static-host asset URL', () => {
  it('resolves the chrome below an arbitrary Vite project base', () => {
    expect(battleConsoleChromeUrl('/singedTerra/')).toBe(
      '/singedTerra/art/battle-console-integrated/static-chrome.png',
    );
  });

  it('resolves the canonical dynamic Pixi atlas below the same project base', () => {
    expect(battleConsoleDynamicUrl('/singedTerra/')).toBe(
      '/singedTerra/art/battle-console-integrated/canonical-pixi-layer.png',
    );
  });

  it('resolves preprojected standard and compact owner layers without changing the wide URL', () => {
    expect(battleConsoleChromeUrl('/singedTerra/', 'wide')).toBe(
      '/singedTerra/art/battle-console-integrated/static-chrome.png',
    );
    expect(battleConsoleChromeUrl('/singedTerra/', 'standard')).toBe(
      '/singedTerra/art/battle-console-integrated/static-chrome-standard.png',
    );
    expect(battleConsoleDynamicUrl('/singedTerra/', 'compact')).toBe(
      '/singedTerra/art/battle-console-integrated/canonical-pixi-layer-compact.png',
    );
  });
});

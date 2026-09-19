import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplicationSurfaceController, type ApplicationSurfaceState } from './ApplicationSurface';

function mountSurfaces(): {
  readonly battle: HTMLElement;
  readonly pregame: HTMLElement;
} {
  document.body.innerHTML = `
    <main id="app">
      <div id="stage"><canvas id="game"></canvas></div>
      <div id="hud"></div>
      <div id="modal-layer"></div>
    </main>
    <section id="lobby"><button type="button">Start</button></section>
  `;

  return {
    battle: document.querySelector<HTMLElement>('#app')!,
    pregame: document.querySelector<HTMLElement>('#lobby')!,
  };
}

function expectUnavailable(root: HTMLElement): void {
  expect(root.hidden).toBe(true);
  expect(root.inert).toBe(true);
  expect(root.getAttribute('aria-hidden')).toBe('true');
}

function expectAvailable(root: HTMLElement): void {
  expect(root.hidden).toBe(false);
  expect(root.inert).toBe(false);
  expect(root.hasAttribute('aria-hidden')).toBe(false);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ApplicationSurfaceController', () => {
  it('owns the complete pregame surface state', () => {
    const roots = mountSurfaces();
    const controller = new ApplicationSurfaceController(roots, 'pregame');

    expect(controller.state).toBe('pregame');
    expectAvailable(roots.pregame);
    expect(roots.pregame.hasAttribute('aria-busy')).toBe(false);
    expectUnavailable(roots.battle);
  });

  it('keeps the initiating pregame workspace visible but inert and busy while launching', () => {
    const roots = mountSurfaces();
    const controller = new ApplicationSurfaceController(roots, 'pregame');

    controller.setState('launching');

    expect(controller.state).toBe('launching');
    expect(roots.pregame.hidden).toBe(false);
    expect(roots.pregame.inert).toBe(true);
    expect(roots.pregame.hasAttribute('aria-hidden')).toBe(false);
    expect(roots.pregame.getAttribute('aria-busy')).toBe('true');
    expectUnavailable(roots.battle);
  });

  it('reveals only the existing battle surface after acquisition succeeds', () => {
    const roots = mountSurfaces();
    const battleSubtree = roots.battle.innerHTML;
    const controller = new ApplicationSurfaceController(roots, 'pregame');

    controller.setState('launching');
    controller.setState('battle');

    expect(controller.state).toBe('battle');
    expectUnavailable(roots.pregame);
    expect(roots.pregame.hasAttribute('aria-busy')).toBe(false);
    expectAvailable(roots.battle);
    expect(roots.battle.innerHTML).toBe(battleSubtree);
  });

  it.each<ApplicationSurfaceState>(['pregame', 'launching', 'battle'])(
    'reapplies %s deterministically after external attribute drift',
    (state) => {
      const roots = mountSurfaces();
      const controller = new ApplicationSurfaceController(roots, state);
      roots.battle.hidden = false;
      roots.battle.inert = false;
      roots.battle.removeAttribute('aria-hidden');
      roots.pregame.hidden = false;
      roots.pregame.inert = false;
      roots.pregame.removeAttribute('aria-hidden');
      roots.pregame.removeAttribute('aria-busy');

      controller.setState(state);

      if (state === 'battle') {
        expectUnavailable(roots.pregame);
        expectAvailable(roots.battle);
      } else {
        expect(roots.pregame.hidden).toBe(false);
        expect(roots.pregame.inert).toBe(state === 'launching');
        expect(roots.pregame.hasAttribute('aria-hidden')).toBe(false);
        expect(roots.pregame.getAttribute('aria-busy')).toBe(state === 'launching' ? 'true' : null);
        expectUnavailable(roots.battle);
      }
    },
  );
});

describe('application root ownership', () => {
  it('keeps the pregame root outside the scaled battle tree without changing that subtree', () => {
    const source = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    const battle = parsed.querySelector<HTMLElement>('#app')!;
    const pregame = parsed.querySelector<HTMLElement>('#lobby')!;

    expect(pregame.parentElement).toBe(parsed.body);
    expect(battle.contains(pregame)).toBe(false);
    expect([...battle.children].map((child) => child.id)).toEqual([
      'stage',
      'hud',
      'modal-layer',
    ]);
    expect([...battle.querySelectorAll('#stage > *')].map((child) => child.id)).toEqual([
      'game',
      'game-overlay',
      'battle-rail',
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import type { TankLoadout } from '@shared/types/TankLoadout';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../renderer/TankLoadoutPreview';
import { HUD } from './HUD';

vi.mock('../renderer/TankLoadoutPreview', () => ({
  clearTankLoadoutPreview: vi.fn((canvas: HTMLCanvasElement) => {
    delete canvas.dataset['tankPreviewSignature'];
  }),
  paintTankLoadoutPreview: vi.fn(),
}));

const ALICE_LOADOUT: TankLoadout = {
  treads: 'ranger',
  hull: 'bulwark',
  turret: 'jackal',
  barrel: 'ranger',
};

const BOB_LOADOUT: TankLoadout = {
  treads: 'bulwark',
  hull: 'ranger',
  turret: 'foundry',
  barrel: 'jackal',
};

function mount(): {
  root: HTMLElement;
  hud: HUD;
  state: GameState;
} {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d', loadout: ALICE_LOADOUT },
      { name: 'Bob', color: '#4d8ce8', loadout: BOB_LOADOUT },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state);
  return { root, hud, state };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD active tank identity portrait', () => {
  it('paints one exact mixed loadout and names every authored part', () => {
    const { root, state } = mount();
    const portrait = root.querySelector<HTMLCanvasElement>('.st-hud__tank-portrait')!;

    expect(portrait).not.toBeNull();
    expect(root.querySelectorAll('.st-hud__tank-portrait')).toHaveLength(1);
    expect(portrait.getAttribute('role')).toBe('img');
    expect(portrait.getAttribute('aria-label')).toBe(
      "Alice's tank. Mobility: Spider Legs. Hull: Siege Hull. "
      + 'Turret: Sensor Ring. Barrel: Railgun.',
    );
    expect(paintTankLoadoutPreview).toHaveBeenCalledTimes(1);
    expect(paintTankLoadoutPreview).toHaveBeenCalledWith(
      portrait,
      '#e84d4d',
      state.tanks[0]!.loadout,
    );
  });

  it('does not repaint unchanged frames and repaints exact identity changes', () => {
    const { root, hud, state } = mount();
    const portrait = root.querySelector<HTMLCanvasElement>('.st-hud__tank-portrait')!;

    hud.update(state);
    expect(paintTankLoadoutPreview).toHaveBeenCalledTimes(1);

    state.turn += 1;
    state.activePlayerId = state.tanks[1]!.id;
    hud.update(state);

    expect(paintTankLoadoutPreview).toHaveBeenCalledTimes(2);
    expect(paintTankLoadoutPreview).toHaveBeenLastCalledWith(
      portrait,
      '#4d8ce8',
      state.tanks[1]!.loadout,
    );
    expect(portrait.getAttribute('aria-label')).toBe(
      "Bob's tank. Mobility: Hover. Hull: Scout Hull. "
      + 'Turret: Cupola. Barrel: Howitzer.',
    );

    state.tanks[1]!.color = '#a855f7';
    state.tanks[1]!.loadout = { ...state.tanks[1]!.loadout, turret: 'bulwark' };
    hud.update(state);

    expect(paintTankLoadoutPreview).toHaveBeenCalledTimes(3);
    expect(paintTankLoadoutPreview).toHaveBeenLastCalledWith(
      portrait,
      '#a855f7',
      state.tanks[1]!.loadout,
    );
    expect(portrait.getAttribute('aria-label')).toContain('Turret: Bunker.');
  });

  it('clears stale portrait identity when no active tank can be presented', () => {
    const { root, hud, state } = mount();
    const portrait = root.querySelector<HTMLCanvasElement>('.st-hud__tank-portrait')!;
    portrait.dataset['tankPreviewSignature'] = 'queued-old-tank';

    state.phase = 'GAME_OVER';
    hud.update(state);

    expect(portrait.getAttribute('aria-label')).toBe('No active tank.');
    expect(portrait.dataset['tankPreviewSignature']).toBeUndefined();
    expect(clearTankLoadoutPreview).toHaveBeenCalledOnce();

    state.phase = 'PLAYER_TURN';
    state.activePlayerId = 'missing';
    hud.update(state);
    expect(portrait.getAttribute('aria-label')).toBe('No active tank.');
  });

  it.each(['FIRING', 'RESOLVING'] as const)(
    'clears a painted dead shooter during %s without erasing shot progress',
    (phase) => {
      const { root, hud, state } = mount();
      const portrait = root.querySelector<HTMLCanvasElement>('.st-hud__tank-portrait')!;
      const progress = root.querySelector<HTMLElement>('.st-hud__aim')!;
      portrait.dataset['tankPreviewSignature'] = 'queued-dead-shooter';
      state.phase = phase;
      state.tanks[0]!.alive = false;

      hud.update(state);

      expect(portrait.getAttribute('aria-label')).toBe('No active tank.');
      expect(portrait.dataset['tankPreviewSignature']).toBeUndefined();
      expect(clearTankLoadoutPreview).toHaveBeenCalledOnce();
      expect(progress.getAttribute('aria-label')).toContain("Alice's shot");
      expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);
    },
  );
});

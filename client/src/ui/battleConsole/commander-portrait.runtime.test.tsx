import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BattleConsoleRoot } from './BattleConsoleRoot';
import type { BattleConsolePresentationState } from './types';

describe('AC-08 active commander portrait', () => {
  it('keeps the real canvas visible when Pixi is ready and repaints the next commander', async () => {
    const style = document.createElement('style');
    const css = readFileSync(resolve(process.cwd(), 'src/ui/battleConsole/BattleConsole.module.css'), 'utf8');
    style.textContent = [...css.matchAll(/[^{}]*\[data-battle-console-portrait\][^{}]*\{[^{}]*\}/g)]
      .map(match => match[0]).join('\n');
    document.head.append(style);
    const host = document.createElement('div');
    document.body.append(host);
    const state: BattleConsolePresentationState = {
      commander: { id: 'p1', name: 'Player 1', health: 100, portrait: {
        color: '#e84d4d', loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
      } },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
      armory: { open: false, submitting: false, items: [] },
      ballistics: { angle: 45, power: 50, wind: -1.3 },
      fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
      settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
      coach: { step: null, briefingOpen: false }, focusOwner: null,
    };
    const classes = { root: 'root', inline: 'inline', portal: 'portal', semanticNode: 'semanticNode', weaponIcon: 'weaponIcon' };
    try {
      render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={() => {}} classNames={classes} />, host);
      const portrait = host.querySelector<HTMLCanvasElement>('[data-battle-console-portrait]')!;
      expect(getComputedStyle(portrait).display).toBe('block');
      await vi.waitFor(() => expect(portrait.dataset.tankPreviewSignature).toContain('#e84d4d'));
      render(<BattleConsoleRoot state={{ ...state, commander: { ...state.commander, id: 'p2', name: 'CPU 1',
        portrait: { ...state.commander.portrait!, color: '#4d8ee8' } } }} lifecycleStatus="ready" dispatch={() => {}} classNames={classes} />, host);
      await vi.waitFor(() => expect(portrait.dataset.tankPreviewSignature).toContain('#4d8ee8'));
      expect(portrait.getAttribute('aria-label')).toBe("CPU 1's tank.");
      expect(getComputedStyle(portrait).display).toBe('block');
    } finally {
      render(null, host);
      host.remove();
      style.remove();
    }
  });
});

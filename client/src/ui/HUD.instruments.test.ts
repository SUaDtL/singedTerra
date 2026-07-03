/**
 * HUD.instruments.test.ts — the mobile instrument cluster contract.
 *
 * On coarse-pointer (touch) the analog dials are hidden and replaced by bold
 * numeric readouts: the dials' thin 1–3px gold strokes go sub-pixel and vanish
 * when the whole #app is zoom-scaled down on a phone (the "I only see
 * Instruments" bug). Both representations are built into the DOM and CSS picks
 * one, so they MUST always carry the same value — this test locks that mirror
 * invariant so the mobile readout can never silently drift from the desktop dial.
 *
 * It also guards the power-gauge label position (y=50): the number must sit
 * inside the arch, not on the 140° arc stroke where it was unreadable.
 */
import { describe, it, expect } from 'vitest';
import { HUD } from './HUD';
import { GameEngine } from '@shared/engine/GameEngine';

function mountHud(): HTMLElement {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  // A deterministic 2-player game — seed fixed so tank angle/power are stable.
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  hud.update(engine.getState());
  return root;
}

describe('HUD instrument cluster', () => {
  it('mobile numeric readouts mirror the analog dial labels, gauge-for-gauge', () => {
    const root = mountHud();

    // Both representations are always in the DOM (CSS chooses which is visible).
    // Document order is elev, wind, power for both the SVG labels and the cells.
    const svgLabels = root.querySelectorAll('.st-hud__gauge-label');
    const numValues = root.querySelectorAll('.st-hud__gauge-num-value');

    expect(svgLabels.length).toBe(3);
    expect(numValues.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      expect(numValues[i]?.textContent).toBe(svgLabels[i]?.textContent);
    }
  });

  it('seats the power-gauge number inside the arch (y=50), off the arc stroke', () => {
    const root = mountHud();
    const pwrLabel = root.querySelector('.st-hud__gauge-label--lg');
    expect(pwrLabel?.getAttribute('y')).toBe('50');
  });
});

import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS } from '@shared/engine/WeaponSystem';

/**
 * HUD is an HTML/CSS overlay (SPEC §8), NOT canvas-drawn. MVP1 grows the MVP0
 * text readout into a full overlay: per-player health bars, a wind indicator,
 * active-tank aim/weapon readout, and a GAME_OVER panel with a Restart button.
 *
 * The static DOM + injected <style> are built exactly ONCE (lazily, on first
 * update). `update()` runs every animation frame, so it only mutates text /
 * widths / classes on cached node references — it never rebuilds DOM or attaches
 * listeners, keeping per-frame work cheap and leak-free.
 */
export class HUD {
  private readonly root: HTMLElement;

  /** Restart callback registered via {@link onRestart}; may arrive before or after the overlay shows. */
  private restartCb: (() => void) | null = null;

  /** Whether the static DOM scaffold has been built yet. */
  private built = false;

  // Cached node references (populated by `build()`).
  private playersEl!: HTMLElement;
  private windArrowEl!: HTMLElement;
  private windValueEl!: HTMLElement;
  private weaponValueEl!: HTMLElement;
  private aimEl!: HTMLElement;
  private overlayEl!: HTMLElement;
  private overlayTextEl!: HTMLElement;

  /** Per-tank-id cache of the bar's mutable nodes, so updates skip rebuilds. */
  private rows = new Map<string, PlayerRow>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Register the restart callback fired when the GAME_OVER Restart button is clicked. */
  onRestart(cb: () => void): void {
    this.restartCb = cb;
  }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(state: GameState): void {
    if (!this.built) this.build();

    this.syncPlayers(state);
    this.syncWind(state.wind);
    this.syncAim(state);
    this.syncOverlay(state);
  }

  /** Build the static DOM scaffold + inject styles. Runs once (idempotent). */
  private build(): void {
    HUD.injectStyle();
    this.root.classList.add('st-hud');
    this.root.innerHTML = '';

    // Player health-bar column (top-left).
    this.playersEl = document.createElement('div');
    this.playersEl.className = 'st-hud__players';

    // Wind indicator (top-right): arrow + numeric value.
    const wind = document.createElement('div');
    wind.className = 'st-hud__wind';
    const windLabel = document.createElement('span');
    windLabel.className = 'st-hud__wind-label';
    windLabel.textContent = 'Wind';
    this.windArrowEl = document.createElement('span');
    this.windArrowEl.className = 'st-hud__wind-arrow';
    this.windValueEl = document.createElement('span');
    this.windValueEl.className = 'st-hud__wind-value';
    wind.append(windLabel, this.windArrowEl, this.windValueEl);

    // Active weapon readout (top-right, directly under the wind indicator; SPEC §8).
    const weapon = document.createElement('div');
    weapon.className = 'st-hud__weapon';
    const weaponLabel = document.createElement('span');
    weaponLabel.className = 'st-hud__weapon-label';
    weaponLabel.textContent = 'Weapon';
    this.weaponValueEl = document.createElement('span');
    this.weaponValueEl.className = 'st-hud__weapon-value';
    weapon.append(weaponLabel, this.weaponValueEl);

    // Active-tank aim readout (bottom strip): angle + power.
    this.aimEl = document.createElement('div');
    this.aimEl.className = 'st-hud__aim';

    // Controls legend (bottom-right, unobtrusive; built once, never updated).
    const controls = document.createElement('div');
    controls.className = 'st-hud__controls';
    controls.innerHTML =
      '<span><kbd>&larr;</kbd>/<kbd>&rarr;</kbd> Aim</span>' +
      '<span><kbd>&uarr;</kbd>/<kbd>&darr;</kbd> Power</span>' +
      '<span><kbd>Tab</kbd>/<kbd>Q</kbd> Weapon</span>' +
      '<span><kbd>Space</kbd>/<kbd>Enter</kbd> Fire</span>';

    // GAME_OVER overlay (hidden until phase === GAME_OVER).
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'st-hud__overlay st-hud__overlay--hidden';
    const panel = document.createElement('div');
    panel.className = 'st-hud__overlay-panel';
    this.overlayTextEl = document.createElement('div');
    this.overlayTextEl.className = 'st-hud__overlay-text';
    const restartBtn = document.createElement('button');
    restartBtn.className = 'st-hud__restart';
    restartBtn.type = 'button';
    restartBtn.textContent = 'Restart';
    // Listener attached ONCE here (never in update) — fires the stored callback.
    restartBtn.addEventListener('click', () => this.restartCb?.());
    panel.append(this.overlayTextEl, restartBtn);
    this.overlayEl.append(panel);

    this.root.append(this.playersEl, wind, weapon, this.aimEl, controls, this.overlayEl);
    this.built = true;
  }

  /** Reconcile the per-player health bars against `state.tanks`. */
  private syncPlayers(state: GameState): void {
    const seen = new Set<string>();

    for (const tank of state.tanks) {
      seen.add(tank.id);
      let row = this.rows.get(tank.id);
      if (!row) {
        row = this.createRow(tank);
        this.rows.set(tank.id, row);
        this.playersEl.append(row.el);
      }
      this.syncRow(row, tank, tank.id === state.activePlayerId);
    }

    // Remove rows for tanks that disappeared (defensive; tanks normally persist).
    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.el.remove();
      this.rows.delete(id);
    }
  }

  /** Create the static node structure for one player's health bar. */
  private createRow(tank: TankState): PlayerRow {
    const el = document.createElement('div');
    el.className = 'st-hud__player';

    const swatch = document.createElement('span');
    swatch.className = 'st-hud__swatch';
    swatch.style.backgroundColor = tank.color;

    const name = document.createElement('span');
    name.className = 'st-hud__name';
    name.textContent = tank.playerName;

    const hp = document.createElement('span');
    hp.className = 'st-hud__hp';

    const bar = document.createElement('span');
    bar.className = 'st-hud__bar';
    const fill = document.createElement('span');
    fill.className = 'st-hud__bar-fill';
    fill.style.backgroundColor = tank.color;
    bar.append(fill);

    el.append(swatch, name, hp, bar);
    return { el, hp, fill };
  }

  /** Mutate a player row's volatile bits (hp text, bar width, alive/active classes). */
  private syncRow(row: PlayerRow, tank: TankState, active: boolean): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;

    row.hp.textContent = `${health}`;
    row.fill.style.width = `${Math.max(0, Math.min(100, health))}%`;
    row.el.classList.toggle('st-hud__player--dead', dead);
    row.el.classList.toggle('st-hud__player--active', active && !dead);
  }

  /** Update the wind arrow direction + numeric value (one decimal). */
  private syncWind(wind: number): void {
    // Treat tiny magnitudes as calm so the arrow does not jitter near zero.
    const arrow = Math.abs(wind) < 0.05 ? '•' : wind > 0 ? '→' : '←';
    this.windArrowEl.textContent = arrow;
    this.windValueEl.textContent = Math.abs(wind).toFixed(1);
  }

  /** Update the active tank's angle / power / weapon name readout. */
  private syncAim(state: GameState): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank) {
      this.aimEl.textContent = '';
      this.weaponValueEl.textContent = '—';
      return;
    }
    const weaponName = WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon;
    this.weaponValueEl.textContent = weaponName;
    this.aimEl.textContent =
      `${tank.playerName}  ·  ` +
      `Angle ${Math.round(tank.angle)}°  ·  ` +
      `Power ${Math.round(tank.power)}`;
  }

  /** Show/hide the GAME_OVER overlay and set its winner/draw message. */
  private syncOverlay(state: GameState): void {
    if (state.phase !== 'GAME_OVER') {
      this.overlayEl.classList.add('st-hud__overlay--hidden');
      return;
    }

    if (state.winner === null) {
      // 0 alive (mutual kill) => DRAW per engine contract.
      this.overlayTextEl.textContent = 'Draw';
    } else {
      const winner = state.tanks.find((t) => t.id === state.winner);
      this.overlayTextEl.textContent = winner
        ? `${winner.playerName} wins!`
        : 'Game Over';
    }
    this.overlayEl.classList.remove('st-hud__overlay--hidden');
  }

  /** Inject the HUD stylesheet exactly once per document. */
  private static injectStyle(): void {
    if (document.getElementById(HUD.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HUD.STYLE_ID;
    style.textContent = HUD.CSS;
    document.head.append(style);
  }

  private static readonly STYLE_ID = 'st-hud-style';

  private static readonly CSS = `
.st-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: system-ui, sans-serif;
  color: #f5f5f5;
}
.st-hud__players {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.st-hud__player {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 13px;
}
.st-hud__player--active {
  background: rgba(255, 255, 255, 0.22);
  box-shadow: 0 0 0 2px #ffd54a;
}
.st-hud__player--dead {
  opacity: 0.5;
  text-decoration: line-through;
}
.st-hud__swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.st-hud__name { min-width: 72px; }
.st-hud__hp {
  min-width: 26px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.st-hud__bar {
  display: inline-block;
  width: 90px;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}
.st-hud__bar-fill {
  display: block;
  height: 100%;
  transition: width 120ms linear;
}
.st-hud__wind {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 13px;
}
.st-hud__wind-arrow { font-size: 16px; }
.st-hud__wind-value { font-variant-numeric: tabular-nums; }
.st-hud__weapon {
  position: absolute;
  top: 36px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 13px;
}
.st-hud__weapon-label { opacity: 0.7; }
.st-hud__weapon-value { font-weight: 600; color: #ffd54a; }
.st-hud__controls {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(245, 245, 245, 0.7);
  font-size: 10px;
  line-height: 1.4;
}
.st-hud__controls kbd {
  display: inline-block;
  padding: 0 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
  font-family: inherit;
  font-size: 9px;
}
.st-hud__aim {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  font-size: 13px;
  white-space: nowrap;
}
.st-hud__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}
.st-hud__overlay--hidden { display: none; }
.st-hud__overlay-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 32px;
  border-radius: 8px;
  background: rgba(20, 20, 24, 0.92);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
.st-hud__overlay-text {
  font-size: 24px;
  font-weight: 600;
}
.st-hud__restart {
  pointer-events: auto;
  cursor: pointer;
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  background: #ffd54a;
  color: #1a1a1a;
  font-size: 15px;
  font-weight: 600;
}
.st-hud__restart:hover { background: #ffe27a; }
`;
}

/** Cached mutable nodes for a single player's health bar. */
interface PlayerRow {
  el: HTMLElement;
  hp: HTMLElement;
  fill: HTMLElement;
}

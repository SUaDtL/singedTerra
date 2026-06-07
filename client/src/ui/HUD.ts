import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import type { WeaponType } from '@shared/engine/WeaponSystem';

/**
 * Weapons shown in the strip: only `implemented` ones, in stable WeaponSystem
 * key order. This MUST stay literally identical to InputHandler's
 * IMPLEMENTED_WEAPONS predicate+order so the active-highlight tracks Tab/Q
 * cycling. Defined locally (not imported) to keep UI modules decoupled.
 */
const STRIP_WEAPONS: WeaponType[] = (Object.keys(WEAPONS) as WeaponType[])
  .filter((type) => WEAPONS[type].implemented);

/** Glyph shown in place of a numeric count for unlimited-ammo weapons. */
const AMMO_UNLIMITED_GLYPH = '∞';

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

  /** Callback fired when a weapon strip button is clicked. */
  private weaponSelectCb: ((weapon: WeaponType) => void) | null = null;

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
  private stripEl!: HTMLElement;

  /** Per-weapon strip cells: button + its ammo-count node, for cheap per-frame updates. */
  private weaponCells = new Map<WeaponType, { el: HTMLButtonElement; ammo: HTMLElement }>();

  /** Per-tank-id cache of the bar's mutable nodes, so updates skip rebuilds. */
  private rows = new Map<string, PlayerRow>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Register the restart callback fired when the GAME_OVER Restart button is clicked. */
  onRestart(cb: () => void): void {
    this.restartCb = cb;
  }

  /** Register the weapon-select callback fired when a strip button is clicked. */
  onWeaponSelect(cb: (weapon: WeaponType) => void): void {
    this.weaponSelectCb = cb;
  }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(state: GameState, isFiring = false): void {
    if (!this.built) this.build();

    this.syncPlayers(state);
    this.syncWind(state.wind);
    this.syncAim(state, isFiring);
    this.syncStrip(state, isFiring);
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

    // Clickable weapon strip (bottom-left): one button per implemented weapon,
    // showing name + live ammo count. Listeners attached ONCE here.
    this.stripEl = document.createElement('div');
    this.stripEl.className = 'st-hud__strip';
    for (const type of STRIP_WEAPONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'st-hud__weapon-btn';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'st-hud__weapon-btn-name';
      nameSpan.textContent = WEAPONS[type].name;
      const ammoSpan = document.createElement('span');
      ammoSpan.className = 'st-hud__weapon-btn-ammo';
      btn.append(nameSpan, ammoSpan);
      // Capture `type` per-iteration (for-of/const). Listener attached once.
      btn.addEventListener('click', () => this.weaponSelectCb?.(type));
      this.weaponCells.set(type, { el: btn, ammo: ammoSpan });
      this.stripEl.append(btn);
    }

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

    this.root.append(this.playersEl, wind, weapon, this.aimEl, this.stripEl, controls, this.overlayEl);
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
    return { el, hp, fill, lastHealth: Math.max(0, Math.round(tank.health)) };
  }

  /** Mutate a player row's volatile bits (hp text, bar width, alive/active classes). */
  private syncRow(row: PlayerRow, tank: TankState, active: boolean): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;

    // Damage flash: re-trigger the ::after wash whenever health drops. Remove +
    // force reflow + re-add restarts the CSS animation even on consecutive hits.
    if (health < row.lastHealth) {
      row.el.classList.remove('st-hud__player--hit');
      void row.el.offsetWidth;
      row.el.classList.add('st-hud__player--hit');
    }
    row.lastHealth = health;

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
  private syncAim(state: GameState, isFiring = false): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank) {
      this.aimEl.textContent = '';
      this.weaponValueEl.textContent = '—';
      return;
    }
    if (isFiring) {
      this.aimEl.textContent = `${tank.playerName}  ·  Sending...`;
      return;
    }
    const weaponName = WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon;
    this.weaponValueEl.textContent = weaponName;
    this.aimEl.textContent =
      `${tank.playerName}  ·  ` +
      `Angle ${Math.round(tank.angle)}°  ·  ` +
      `Power ${Math.round(tank.power)}`;
  }

  /** Reconcile the weapon strip: active highlight + live ammo counts. No DOM rebuild. */
  private syncStrip(state: GameState, isFiring: boolean): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    for (const [type, cell] of this.weaponCells) {
      const entry = tank?.inventory[type];
      const unlimited = entry?.unlimited ?? false;
      const count = entry?.count ?? 0;
      const depleted = !unlimited && count <= 0; // out of ammo
      cell.ammo.textContent = unlimited ? AMMO_UNLIMITED_GLYPH : `${count}`;
      cell.el.classList.toggle(
        'st-hud__weapon-btn--active',
        !!tank && tank.selectedWeapon === type,
      );
      cell.el.classList.toggle('st-hud__weapon-btn--depleted', depleted);
      // Disable while firing, when no active tank, or when depleted, so a click
      // cannot emit a select for an unusable weapon. (Engine still re-validates;
      // this is UX only.)
      cell.el.disabled = isFiring || !tank || depleted;
    }
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
  font-family: var(--font-sans);
  color: var(--text);
}
.st-hud__players {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.st-hud__player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.62);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-size: 13px;
  transition: box-shadow 160ms ease, background 160ms ease, opacity 220ms ease;
}
.st-hud__player--active {
  background: rgba(142, 47, 83, 0.42);
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold), 0 0 12px rgba(255, 210, 63, 0.35);
  animation: st-hud-pulse 1.6s ease-in-out infinite;
}
.st-hud__player--dead {
  opacity: 0.45;
  text-decoration: line-through;
}
/* Damage flash — a fading red wash on the ::after layer so it never fights the
   active-player pulse animation on the element itself. */
.st-hud__player--hit::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 4px;
  pointer-events: none;
  background: rgba(232, 77, 77, 0.6);
  animation: st-hud-flash 420ms ease forwards;
}
.st-hud__swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.st-hud__name { min-width: 74px; }
.st-hud__hp {
  min-width: 26px;
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-gold);
}
.st-hud__bar {
  display: inline-block;
  width: 92px;
  height: 8px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.st-hud__bar-fill {
  display: block;
  height: 100%;
  transition: width 160ms ease;
}
.st-hud__wind,
.st-hud__weapon {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 9px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.62);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-size: 13px;
}
.st-hud__wind { top: 10px; }
.st-hud__weapon { top: 40px; }
.st-hud__wind-label,
.st-hud__weapon-label {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 10px;
}
.st-hud__wind-arrow { font-size: 16px; color: var(--tank-blue-lite); }
.st-hud__wind-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-gold);
}
.st-hud__weapon-value {
  font-family: var(--font-display);
  font-weight: bold;
  letter-spacing: 0.5px;
  color: var(--gold);
}
.st-hud__controls {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 5px 9px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.5);
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.4;
}
.st-hud__controls kbd {
  display: inline-block;
  padding: 0 4px;
  border-radius: 2px;
  background: rgba(255, 210, 63, 0.14);
  color: var(--text-gold);
  font-family: var(--font-mono);
  font-size: 9px;
}
.st-hud__aim {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.62);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: nowrap;
  color: var(--text-gold);
}
.st-hud__strip {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-width: 360px;
  pointer-events: auto;
}
.st-hud__weapon-btn {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid rgba(255, 210, 63, 0.18);
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.7);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 1.2;
  transition: background 130ms ease, border-color 130ms ease, transform 80ms ease;
}
.st-hud__weapon-btn:hover:not(:disabled) {
  background: rgba(255, 122, 31, 0.28);
  border-color: var(--ember);
}
.st-hud__weapon-btn:active:not(:disabled) { transform: translateY(1px); }
.st-hud__weapon-btn--active {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold), 0 0 8px rgba(255, 210, 63, 0.35);
  color: var(--gold);
}
.st-hud__weapon-btn--depleted { opacity: 0.4; }
.st-hud__weapon-btn:disabled { cursor: default; }
.st-hud__weapon-btn-ammo {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-gold);
  opacity: 0.9;
}
.st-hud__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 7, 22, 0.66);
  pointer-events: auto;
}
.st-hud__overlay--hidden { display: none; }
.st-hud__overlay-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 28px 40px;
  border-radius: 8px;
  background: rgba(12, 7, 22, 0.92);
  border: 2px solid var(--gold);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 122, 31, 0.25);
}
.st-hud__overlay-text {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: bold;
  letter-spacing: 1px;
  color: var(--gold);
  text-shadow: 0 0 16px rgba(255, 122, 31, 0.5);
}
.st-hud__restart {
  pointer-events: auto;
  cursor: pointer;
  padding: 9px 24px;
  border: none;
  border-radius: 4px;
  background: var(--gold);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 0.5px;
  transition: background 130ms ease, transform 80ms ease;
}
.st-hud__restart:hover { background: var(--ember); }
.st-hud__restart:active { transform: translateY(1px); }

@keyframes st-hud-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--gold), 0 0 8px rgba(255, 210, 63, 0.25); }
  50% { box-shadow: 0 0 0 1px var(--gold), 0 0 16px rgba(255, 210, 63, 0.5); }
}
@keyframes st-hud-flash {
  from { opacity: 1; }
  to { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .st-hud__player--active { animation: none; }
  .st-hud__player--hit::after { animation: none; opacity: 0; }
  .st-hud__bar-fill,
  .st-hud__weapon-btn,
  .st-hud__restart { transition: none; }
}
`;
}

/** Cached mutable nodes for a single player's health bar. */
interface PlayerRow {
  el: HTMLElement;
  hp: HTMLElement;
  fill: HTMLElement;
  /** Last rendered health, to detect drops and trigger the damage flash. */
  lastHealth: number;
}

import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import type { ConnectionState } from '../client/GameClient';

/**
 * Weapons shown in the strip: only `implemented` ones, in stable WeaponSystem
 * key order. This MUST stay literally identical to InputHandler's
 * IMPLEMENTED_WEAPONS predicate+order so the active-highlight tracks Tab/Q
 * cycling. Defined locally (not imported) to keep UI modules decoupled.
 */
const STRIP_WEAPONS: WeaponType[] = (Object.keys(WEAPONS) as WeaponType[])
  .filter((type) => WEAPONS[type].implemented);

/**
 * Weapons sold in the store: implemented AND finite-stock. An unlimited weapon
 * (baby_missile) has nothing to buy, so it is excluded. Same stable key order.
 */
const STORE_WEAPONS: WeaponType[] = STRIP_WEAPONS.filter(
  (type) => type !== 'baby_missile',
);

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
  /** Side-panel root (#hud) — status widgets stack here, off the canvas. */
  private readonly root: HTMLElement;
  /** On-canvas overlay root (#game-overlay) — controls legend + liveness widgets. */
  private readonly overlayRoot: HTMLElement;
  /** Full-app modal layer (#modal-layer), ABOVE the CRT chrome — store + game-over
   *  modals mount here so they render crisp and span canvas+panel (P3-16). */
  private readonly modalRoot: HTMLElement;

  /** Restart callback registered via {@link onRestart}; may arrive before or after the overlay shows. */
  private restartCb: (() => void) | null = null;

  /** Callback fired when a weapon strip button is clicked. */
  private weaponSelectCb: ((weapon: WeaponType) => void) | null = null;

  /** Callback fired when the player quits a game back to the lobby (in-game Menu / game-over Main Menu). */
  private quitCb: (() => void) | null = null;

  /** Callback fired when a store Buy button is clicked. */
  private buyCb: ((weapon: WeaponType) => void) | null = null;

  /** Whether the store panel is currently open. */
  private storeOpen = false;

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
  private storeBtnEl!: HTMLButtonElement;
  private storeEl!: HTMLElement;
  private storeCreditsEl!: HTMLElement;
  // Networked liveness widgets (P1-6): a persistent connection banner (shown only
  // while reconnecting/connecting) and a transient toast for failed shots.
  private connBannerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Per-store-row nodes (buy button + owned count), for cheap per-frame sync. */
  private storeCells = new Map<WeaponType, { buyBtn: HTMLButtonElement; owned: HTMLElement }>();

  /** Per-weapon strip cells: button + its ammo-count node, for cheap per-frame updates. */
  private weaponCells = new Map<WeaponType, { el: HTMLButtonElement; ammo: HTMLElement }>();

  /** Per-tank-id cache of the bar's mutable nodes, so updates skip rebuilds. */
  private rows = new Map<string, PlayerRow>();

  constructor(root: HTMLElement, overlayRoot: HTMLElement, modalRoot: HTMLElement) {
    this.root = root;
    this.overlayRoot = overlayRoot;
    this.modalRoot = modalRoot;
  }

  /** Register the restart callback fired when the GAME_OVER Restart button is clicked. */
  onRestart(cb: () => void): void {
    this.restartCb = cb;
  }

  /** Register the weapon-select callback fired when a strip button is clicked. */
  onWeaponSelect(cb: (weapon: WeaponType) => void): void {
    this.weaponSelectCb = cb;
  }

  /** Register the callback fired when the player quits a game back to the lobby. */
  onQuit(cb: () => void): void {
    this.quitCb = cb;
  }

  /** Register the callback fired when a store Buy button is clicked. */
  onBuy(cb: (weapon: WeaponType) => void): void {
    this.buyCb = cb;
  }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(state: GameState, isFiring = false): void {
    if (!this.built) this.build();

    this.syncPlayers(state);
    this.syncWind(state.wind);
    this.syncAim(state, isFiring);
    this.syncStrip(state, isFiring);
    this.syncStore(state);
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

    // Weapon strip (bottom-left): a framed "Arsenal" panel with a titled header
    // and a 2-column grid of buttons, each showing name + live ammo count.
    // Listeners attached ONCE here.
    this.stripEl = document.createElement('div');
    this.stripEl.className = 'st-hud__strip';
    const stripTitle = document.createElement('div');
    stripTitle.className = 'st-hud__strip-title';
    stripTitle.textContent = 'Arsenal';
    const stripGrid = document.createElement('div');
    stripGrid.className = 'st-hud__strip-grid';
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
      stripGrid.append(btn);
    }
    this.stripEl.append(stripTitle, stripGrid);

    // Store toggle button (side panel) + the store modal (on the canvas overlay).
    // Clicking the button opens/closes the modal; buying is wired per-row below.
    this.storeBtnEl = document.createElement('button');
    this.storeBtnEl.type = 'button';
    this.storeBtnEl.className = 'st-hud__store-btn';
    this.storeBtnEl.addEventListener('click', () => this.toggleStore());

    this.storeEl = document.createElement('div');
    this.storeEl.className = 'st-hud__store st-hud__store--hidden';
    const storePanel = document.createElement('div');
    storePanel.className = 'st-hud__store-panel';
    const storeHeader = document.createElement('div');
    storeHeader.className = 'st-hud__store-header';
    const storeTitle = document.createElement('div');
    storeTitle.className = 'st-hud__store-title';
    storeTitle.textContent = 'Store';
    this.storeCreditsEl = document.createElement('div');
    this.storeCreditsEl.className = 'st-hud__store-credits';
    storeHeader.append(storeTitle, this.storeCreditsEl);

    const storeGrid = document.createElement('div');
    storeGrid.className = 'st-hud__store-grid';
    for (const type of STORE_WEAPONS) {
      const def = WEAPONS[type];
      const row = document.createElement('div');
      row.className = 'st-hud__store-row';

      const info = document.createElement('div');
      info.className = 'st-hud__store-info';
      const nm = document.createElement('span');
      nm.className = 'st-hud__store-name';
      nm.textContent = def.name;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-owned';
      info.append(nm, owned);

      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'st-hud__store-buy';
      // Price line: "$1,875 ×5" (bundle). Listener attached ONCE.
      buyBtn.innerHTML =
        `<span class="st-hud__store-price">$${def.price.toLocaleString()}</span>` +
        `<span class="st-hud__store-bundle">+${def.bundleSize}</span>`;
      buyBtn.addEventListener('click', () => this.buyCb?.(type));

      row.append(info, buyBtn);
      storeGrid.append(row);
      this.storeCells.set(type, { buyBtn, owned });
    }

    const storeClose = document.createElement('button');
    storeClose.type = 'button';
    storeClose.className = 'st-hud__store-close';
    storeClose.textContent = 'Close';
    storeClose.addEventListener('click', () => this.toggleStore(false));

    storePanel.append(storeHeader, storeGrid, storeClose);
    this.storeEl.append(storePanel);

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
    const overlayMenuBtn = document.createElement('button');
    overlayMenuBtn.className = 'st-hud__restart st-hud__restart--ghost';
    overlayMenuBtn.type = 'button';
    overlayMenuBtn.textContent = 'Main Menu';
    overlayMenuBtn.addEventListener('click', () => this.quitCb?.());
    const overlayBtns = document.createElement('div');
    overlayBtns.className = 'st-hud__overlay-btns';
    overlayBtns.append(restartBtn, overlayMenuBtn);
    panel.append(this.overlayTextEl, overlayBtns);
    this.overlayEl.append(panel);

    // Persistent Quit/Menu button (top of the side panel) — returns to the lobby.
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'st-hud__menu';
    menu.textContent = '⤺ Menu';
    menu.addEventListener('click', () => this.quitCb?.());

    // Status widgets stack in the side panel (this.root = #hud). The controls
    // legend + liveness widgets go on the canvas overlay (#game-overlay) so they
    // sit over the play field; the store + game-over modals go on #modal-layer.
    // Networked liveness widgets (P1-6) — top-center over the canvas. The banner
    // shows only while the link is down; the toast flashes a failed-shot message.
    this.connBannerEl = document.createElement('div');
    this.connBannerEl.className = 'st-hud__conn st-hud__conn--hidden';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-hud__toast st-hud__toast--hidden';

    this.root.append(menu, this.playersEl, wind, weapon, this.aimEl, this.storeBtnEl, this.stripEl);
    // Controls legend + liveness widgets stay on the canvas overlay (positioned
    // relative to the play field). The store + game-over modals go on the full-app
    // modal layer ABOVE the CRT chrome so they render crisp and centered (P3-16).
    this.overlayRoot.append(controls, this.connBannerEl, this.toastEl);
    this.modalRoot.append(this.storeEl, this.overlayEl);
    this.built = true;
  }

  /**
   * Reflect the networked Realtime connection state (P1-6). Shows a persistent
   * top-center banner while 'connecting'/'reconnecting'; hides it once 'connected'.
   * No-op before the HUD is built (build() runs on the first update()).
   */
  setConnection(state: ConnectionState): void {
    if (!this.built) this.build();
    const down = state !== 'connected';
    this.connBannerEl.textContent =
      state === 'reconnecting' ? '⚠ Connection lost — reconnecting…' : 'Connecting…';
    this.connBannerEl.classList.toggle('st-hud__conn--hidden', !down);
  }

  /**
   * Flash a transient message over the canvas (P1-6) — used when a shot fails to
   * send or never echoes, so the player knows to try again rather than staring at
   * a frozen "Sending…". Auto-hides after a few seconds.
   */
  flashMessage(message: string): void {
    if (!this.built) this.build();
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('st-hud__toast--hidden');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('st-hud__toast--hidden');
      this.toastTimer = null;
    }, 4000);
  }

  /** Open/close the store modal. With no argument, toggles. */
  private toggleStore(open?: boolean): void {
    this.storeOpen = open ?? !this.storeOpen;
    this.storeEl.classList.toggle('st-hud__store--hidden', !this.storeOpen);
  }

  /**
   * Reflect the ACTIVE tank's wallet/inventory into the store: credit balance,
   * per-weapon owned count, and per-row affordability. Buying is only allowed
   * during PLAYER_TURN (no acting mid-flight), so every Buy button is disabled
   * outside it OR when the active tank can't afford that bundle. Also keeps the
   * toggle button's credit badge current.
   */
  private syncStore(state: GameState): void {
    const active = state.tanks.find((t) => t.id === state.activePlayerId);
    const credits = active?.credits ?? 0;
    const canAct = state.phase === 'PLAYER_TURN';

    this.storeBtnEl.textContent = `⛁ Store · $${credits.toLocaleString()}`;
    this.storeCreditsEl.textContent = `Credits: $${credits.toLocaleString()}`;

    for (const [type, cell] of this.storeCells) {
      const def = WEAPONS[type];
      const slot = active?.inventory[type];
      const owned = slot ? (slot.unlimited ? '∞' : String(slot.count)) : '0';
      if (cell.owned.textContent !== `Own ${owned}`) cell.owned.textContent = `Own ${owned}`;
      const affordable = canAct && credits >= def.price;
      cell.buyBtn.disabled = !affordable;
      cell.buyBtn.classList.toggle('st-hud__store-buy--disabled', !affordable);
    }
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
    name.textContent = HUD.playerLabel(tank);

    const hp = document.createElement('span');
    hp.className = 'st-hud__hp';

    const bar = document.createElement('span');
    bar.className = 'st-hud__bar';
    const fill = document.createElement('span');
    fill.className = 'st-hud__bar-fill';
    fill.style.backgroundColor = tank.color;
    bar.append(fill);

    el.append(swatch, name, hp, bar);
    return { el, hp, fill, name, swatch, lastHealth: Math.max(0, Math.round(tank.health)) };
  }

  /** Mutate a player row's volatile bits (hp text, bar width, alive/active classes). */
  private syncRow(row: PlayerRow, tank: TankState, active: boolean): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;

    // Reconcile identity. Rows are cached by tank.id (the seat slot p1/p2/...),
    // and the persistent HUD reuses them across games — so without this a reused
    // seat keeps the previous game's name/color. Guard the name (textContent
    // round-trips cleanly); reassign colors unconditionally since the browser
    // normalizes backgroundColor and a 2-4 node restyle is negligible.
    const label = HUD.playerLabel(tank);
    if (row.name.textContent !== label) row.name.textContent = label;
    row.swatch.style.backgroundColor = tank.color;
    row.fill.style.backgroundColor = tank.color;

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
  /** Health-bar label: a 🤖 prefix marks a CPU-controlled tank. */
  private static playerLabel(tank: TankState): string {
    return `${tank.ai ? '🤖 ' : ''}${tank.playerName}`;
  }

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
  font-family: var(--font-sans);
  color: var(--text);
  font-size: 13px;
}
.st-hud__players {
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 4px 9px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.55);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-size: 13px;
}
.st-hud__menu {
  width: 100%;
  pointer-events: auto;
  cursor: pointer;
  padding: 6px 10px;
  border: 1px solid rgba(255, 210, 63, 0.3);
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.7);
  color: var(--text-gold);
  font-family: var(--font-sans);
  font-size: 12px;
  letter-spacing: 0.5px;
  transition: background 130ms ease, border-color 130ms ease;
}
.st-hud__menu:hover { background: rgba(255, 122, 31, 0.3); border-color: var(--ember); }
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
  padding: 5px 10px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.55);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-gold);
}
.st-hud__strip {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 9px 8px;
  background: rgba(12, 7, 22, 0.5);
  border: 1px solid rgba(255, 210, 63, 0.14);
  border-radius: 6px;
  pointer-events: auto;
}
.st-hud__strip-title {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.st-hud__strip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
.st-hud__weapon-btn {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
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
/* Networked liveness widgets (P1-6): connection banner + transient toast. */
.st-hud__conn {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  padding: 6px 14px;
  border-radius: 6px;
  font: 600 13px/1.2 system-ui, sans-serif;
  letter-spacing: 0.02em;
  color: #ffe9b0;
  background: rgba(120, 60, 10, 0.92);
  border: 1px solid rgba(255, 180, 80, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  white-space: nowrap;
}
.st-hud__conn--hidden { display: none; }
.st-hud__toast {
  position: absolute;
  top: 44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  padding: 6px 14px;
  border-radius: 6px;
  font: 600 13px/1.2 system-ui, sans-serif;
  color: #ffd7d7;
  background: rgba(90, 20, 28, 0.92);
  border: 1px solid rgba(255, 120, 120, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  white-space: nowrap;
}
.st-hud__toast--hidden { display: none; }
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
.st-hud__overlay-btns { display: flex; gap: 12px; }
.st-hud__restart--ghost {
  background: transparent;
  color: var(--gold);
  border: 1px solid var(--gold);
}
.st-hud__restart--ghost:hover { background: rgba(255, 210, 63, 0.16); }

/* ---- Store ---- */
.st-hud__store-btn {
  width: 100%;
  pointer-events: auto;
  cursor: pointer;
  padding: 7px 10px;
  margin-top: 4px;
  border: 1px solid rgba(122, 215, 255, 0.4);
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.7);
  color: var(--tank-blue-lite, #7ad7ff);
  font-family: var(--font-sans);
  font-size: 12px;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  transition: background 130ms ease, border-color 130ms ease;
}
.st-hud__store-btn:hover { background: rgba(122, 215, 255, 0.18); border-color: #7ad7ff; }
.st-hud__store {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 4, 12, 0.62);
  pointer-events: auto;
  /* No z-index: store + game-over are siblings on #modal-layer, so DOM order
   * governs — game-over (appended last) correctly paints above an open store. */
}
.st-hud__store--hidden { display: none; }
.st-hud__store-panel {
  width: min(440px, 86%);
  max-height: 86%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: 1px solid rgba(122, 215, 255, 0.45);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(18, 11, 30, 0.98), rgba(10, 6, 18, 0.98));
  box-shadow: 0 0 28px rgba(122, 215, 255, 0.22);
}
.st-hud__store-header { display: flex; align-items: baseline; justify-content: space-between; }
.st-hud__store-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 1px;
  color: var(--gold);
}
.st-hud__store-credits {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: #7ad7ff;
  font-size: 13px;
}
.st-hud__store-grid { display: flex; flex-direction: column; gap: 6px; }
.st-hud__store-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 210, 63, 0.16);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}
.st-hud__store-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.st-hud__store-name { color: var(--text-gold); font-size: 13px; }
.st-hud__store-owned {
  opacity: 0.6;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}
.st-hud__store-buy {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 78px;
  padding: 5px 10px;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: rgba(255, 210, 63, 0.12);
  color: var(--text-gold);
  font-family: var(--font-mono);
  transition: background 120ms ease;
}
.st-hud__store-buy:hover { background: rgba(255, 210, 63, 0.26); }
.st-hud__store-price { font-size: 12px; font-variant-numeric: tabular-nums; }
.st-hud__store-bundle { font-size: 9px; opacity: 0.7; }
.st-hud__store-buy--disabled { opacity: 0.32; cursor: not-allowed; }
.st-hud__store-buy--disabled:hover { background: rgba(255, 210, 63, 0.12); }
.st-hud__store-close {
  align-self: flex-end;
  pointer-events: auto;
  cursor: pointer;
  padding: 7px 18px;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: transparent;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 13px;
}
.st-hud__store-close:hover { background: rgba(255, 210, 63, 0.16); }

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
  /** Identity nodes, reconciled each frame so a reused seat id (p1/p2) picks up
   *  the new game's player name/color instead of the previous occupant's. */
  name: HTMLElement;
  swatch: HTMLElement;
  /** Last rendered health, to detect drops and trigger the damage flash. */
  lastHealth: number;
}

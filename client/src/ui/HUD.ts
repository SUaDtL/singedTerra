import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import type { ConnectionState, TurnWatch } from '../client/GameClient';

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
 * Barrel-relative aim readout (P3-13b). The engine angle is a GLOBAL compass
 * value (0=right, 90=up, 180=left). Shown raw, the number doesn't track the
 * visible barrel — a left-firing tank reads "135°" while its barrel looks
 * raised ~45° — so ←/→ feel inverted. Present it instead as ELEVATION above the
 * horizon (0=flat, 90=straight up) plus an aim-direction arrow, so the number
 * rises and falls WITH the barrel for either side. Display-only: the logged
 * set_angle values are untouched, so deterministic replay is unaffected.
 */
function aimReadout(angle: number): string {
  const a = Math.round(angle);
  const elevation = a <= 90 ? a : 180 - a;
  const dir = a < 90 ? '▶' : a > 90 ? '◀' : '▲'; // aiming right / left / straight up
  return `Elev ${elevation}° ${dir}`;
}

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

  /** Callback fired when a store Buy button is clicked. Optional tankId targets a
   *  specific tank (used by the ROUND_OVER between-rounds shop); omitted => active tank. */
  private buyCb: ((weapon: WeaponType, tankId?: string) => void) | null = null;

  /** Callback fired when the player starts the next round from the ROUND_OVER shop. */
  private nextRoundCb: (() => void) | null = null;

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
  /** "Round N of M" indicator (side panel); hidden in single-round matches. */
  private roundEl!: HTMLElement;
  private overlayEl!: HTMLElement;
  private overlayTextEl!: HTMLElement;
  /** Final scoreboard table inside the GAME_OVER panel (round wins / kills / damage). */
  private overlayScoreEl!: HTMLElement;
  /** Highest round number seen, to fire the one-shot round-transition banner. */
  private lastSeenRound = 1;
  // ROUND_OVER between-rounds shop modal.
  private roundOverEl!: HTMLElement;
  private roundOverTitleEl!: HTMLElement;
  private roundOverScoreEl!: HTMLElement;
  private roundOverShopEl!: HTMLElement;
  private roundOverTankSel!: HTMLSelectElement;
  private roundOverCreditsEl!: HTMLElement;
  /** Per-weapon buy cells in the ROUND_OVER shop (button + owned count). */
  private roundOverCells = new Map<WeaponType, { buyBtn: HTMLButtonElement; owned: HTMLElement }>();
  /** Whether the ROUND_OVER modal is currently shown (build standings once on entry). */
  private roundOverShown = false;
  /** Tank id selected in the between-rounds shop (which tank a buy targets). */
  private shopTankId: string | null = null;
  private stripEl!: HTMLElement;
  private storeBtnEl!: HTMLButtonElement;
  private storeEl!: HTMLElement;
  private storeCreditsEl!: HTMLElement;
  // Networked liveness widgets (P1-6): a persistent connection banner (shown only
  // while reconnecting/connecting) and a transient toast for failed shots.
  private connBannerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  // Opponent-turn watchdog banner (P1-6b): "Waiting for {name}…", escalating to a
  // disconnect notice with a leave-to-lobby button.
  private turnWatchEl!: HTMLElement;

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
  onBuy(cb: (weapon: WeaponType, tankId?: string) => void): void {
    this.buyCb = cb;
  }

  /** Register the callback fired when the player starts the next round. */
  onNextRound(cb: () => void): void {
    this.nextRoundCb = cb;
  }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(state: GameState, isFiring = false): void {
    if (!this.built) this.build();

    this.syncRound(state);
    this.syncPlayers(state);
    this.syncWind(state.wind);
    this.syncAim(state, isFiring);
    this.syncStrip(state, isFiring);
    this.syncStore(state);
    this.syncRoundOver(state);
    this.syncOverlay(state);
  }

  /**
   * Round indicator + one-shot round-transition banner (V1 match structure). The
   * "Round N of M" label is shown only for multi-round matches. When the engine's
   * round counter advances (a round resolved and the match continues), flash a
   * transient "{winner} won round K" banner — reusing the toast layer. A counter
   * that goes backwards means a new game started, so reset silently.
   */
  private syncRound(state: GameState): void {
    const multi = state.totalRounds > 1;
    this.roundEl.classList.toggle('st-hud__round--hidden', !multi);
    if (multi) this.roundEl.textContent = `Round ${state.round} of ${state.totalRounds}`;

    if (state.round > this.lastSeenRound && state.phase !== 'GAME_OVER') {
      const completed = state.round - 1;
      const winner = state.tanks.find((t) => t.id === state.lastRoundWinnerId);
      this.flashMessage(
        winner ? `${winner.playerName} won round ${completed}` : `Round ${completed} drawn`,
      );
    }
    this.lastSeenRound = state.round;
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

    // Round indicator (side panel): "Round N of M" — hidden in single-round matches.
    this.roundEl = document.createElement('div');
    this.roundEl.className = 'st-hud__round st-hud__round--hidden';

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
    // Final scoreboard (round wins / kills / damage), populated in syncOverlay.
    this.overlayScoreEl = document.createElement('div');
    this.overlayScoreEl.className = 'st-hud__score';
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
    panel.append(this.overlayTextEl, this.overlayScoreEl, overlayBtns);
    this.overlayEl.append(panel);

    // ROUND_OVER between-rounds shop modal (hidden until phase === ROUND_OVER).
    this.roundOverEl = document.createElement('div');
    this.roundOverEl.className = 'st-hud__overlay st-hud__overlay--hidden';
    const roPanel = document.createElement('div');
    roPanel.className = 'st-hud__overlay-panel';
    this.roundOverTitleEl = document.createElement('div');
    this.roundOverTitleEl.className = 'st-hud__overlay-text';
    this.roundOverScoreEl = document.createElement('div');
    this.roundOverScoreEl.className = 'st-hud__score';

    // Shop: a tank selector + that tank's credits, then a grid of buy buttons.
    this.roundOverShopEl = document.createElement('div');
    this.roundOverShopEl.className = 'st-hud__roundshop';
    const shopHead = document.createElement('div');
    shopHead.className = 'st-hud__roundshop-head';
    const shopTitle = document.createElement('span');
    shopTitle.className = 'st-hud__roundshop-title';
    shopTitle.textContent = 'Between-rounds shop';
    this.roundOverTankSel = document.createElement('select');
    this.roundOverTankSel.className = 'st-hud__roundshop-sel';
    this.roundOverTankSel.addEventListener('change', () => {
      this.shopTankId = this.roundOverTankSel.value || null;
    });
    this.roundOverCreditsEl = document.createElement('span');
    this.roundOverCreditsEl.className = 'st-hud__roundshop-credits';
    shopHead.append(shopTitle, this.roundOverTankSel, this.roundOverCreditsEl);

    const shopGrid = document.createElement('div');
    shopGrid.className = 'st-hud__roundshop-grid';
    for (const type of STORE_WEAPONS) {
      const def = WEAPONS[type];
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'st-hud__store-buy';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = def.name;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'st-hud__store-price';
      priceSpan.textContent = `$${def.price}`;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-bundle';
      buyBtn.append(nameSpan, priceSpan, owned);
      buyBtn.addEventListener('click', () => {
        if (this.shopTankId) this.buyCb?.(type, this.shopTankId);
      });
      this.roundOverCells.set(type, { buyBtn, owned });
      shopGrid.append(buyBtn);
    }
    this.roundOverShopEl.append(shopHead, shopGrid);

    const nextRoundBtn = document.createElement('button');
    nextRoundBtn.className = 'st-hud__restart';
    nextRoundBtn.type = 'button';
    nextRoundBtn.textContent = 'Start Next Round';
    nextRoundBtn.addEventListener('click', () => this.nextRoundCb?.());

    roPanel.append(this.roundOverTitleEl, this.roundOverScoreEl, this.roundOverShopEl, nextRoundBtn);
    this.roundOverEl.append(roPanel);

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
    this.turnWatchEl = document.createElement('div');
    this.turnWatchEl.className = 'st-hud__turnwatch st-hud__turnwatch--hidden';

    this.root.append(menu, this.roundEl, this.playersEl, wind, weapon, this.aimEl, this.storeBtnEl, this.stripEl);
    // Controls legend + liveness widgets stay on the canvas overlay (positioned
    // relative to the play field). The store + game-over modals go on the full-app
    // modal layer ABOVE the CRT chrome so they render crisp and centered (P3-16).
    this.overlayRoot.append(controls, this.connBannerEl, this.toastEl, this.turnWatchEl);
    this.modalRoot.append(this.storeEl, this.overlayEl, this.roundOverEl);
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

  /**
   * Reflect the opponent-turn watchdog (P1-6b). 'clear' hides the banner; 'waiting'
   * shows a non-blocking "Waiting for {name}…"; 'stalled' switches to a disconnect
   * notice with a "Leave to lobby" button (wired to the same quit callback as the
   * in-game Menu). Rebuilt on each transition — these fire rarely, never per frame.
   */
  setTurnWatch(watch: TurnWatch): void {
    if (!this.built) this.build();
    if (watch.state === 'clear') {
      this.turnWatchEl.classList.add('st-hud__turnwatch--hidden');
      this.turnWatchEl.replaceChildren();
      return;
    }
    this.turnWatchEl.classList.remove('st-hud__turnwatch--hidden');
    this.turnWatchEl.classList.toggle('st-hud__turnwatch--stalled', watch.state === 'stalled');
    this.turnWatchEl.replaceChildren();

    const msg = document.createElement('span');
    if (watch.state === 'waiting') {
      msg.textContent = `Waiting for ${watch.playerName}…`;
      this.turnWatchEl.append(msg);
    } else {
      msg.textContent = `${watch.playerName} may have disconnected`;
      const leave = document.createElement('button');
      leave.type = 'button';
      leave.className = 'st-hud__turnwatch-leave';
      leave.textContent = 'Leave to lobby';
      leave.addEventListener('click', () => this.quitCb?.());
      this.turnWatchEl.append(msg, leave);
    }
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
      this.syncRow(row, tank, tank.id === state.activePlayerId, state.totalRounds);
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

    const pips = document.createElement('span');
    pips.className = 'st-hud__pips';

    const bar = document.createElement('span');
    bar.className = 'st-hud__bar';
    const fill = document.createElement('span');
    fill.className = 'st-hud__bar-fill';
    fill.style.backgroundColor = tank.color;
    bar.append(fill);

    el.append(swatch, name, pips, hp, bar);
    return {
      el, hp, fill, name, swatch, pips,
      lastHealth: Math.max(0, Math.round(tank.health)),
      lastPips: '',
    };
  }

  /** Mutate a player row's volatile bits (hp text, bar width, alive/active classes). */
  private syncRow(row: PlayerRow, tank: TankState, active: boolean, totalRounds: number): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;

    // Round-win pips (V1 match structure): one slot per round needed to clinch
    // (ceil(N/2)), filled = roundWins. Hidden entirely in a single-round match.
    // Rebuilt only when the (wins/clinch) signature changes — not every frame.
    const clinch = Math.max(1, Math.ceil(totalRounds / 2));
    const sig = totalRounds > 1 ? `${Math.min(tank.roundWins, clinch)}/${clinch}` : '';
    if (sig !== row.lastPips) {
      row.pips.textContent =
        totalRounds > 1
          ? '●'.repeat(Math.min(tank.roundWins, clinch)) +
            '○'.repeat(Math.max(0, clinch - tank.roundWins))
          : '';
      row.lastPips = sig;
    }

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
      `${aimReadout(tank.angle)}  ·  ` +
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

  /** Tracks whether the GAME_OVER panel is currently shown, so its content (winner
   *  text + scoreboard) builds ONCE on entry rather than every frame. */
  private overlayShown = false;

  /** Show/hide the GAME_OVER overlay and set its winner/draw message + scoreboard. */
  private syncOverlay(state: GameState): void {
    if (state.phase !== 'GAME_OVER') {
      this.overlayEl.classList.add('st-hud__overlay--hidden');
      this.overlayShown = false;
      return;
    }
    if (this.overlayShown) return; // already built for this game-over screen

    if (state.winner === null) {
      // 0 alive (mutual kill) / round-win tie => DRAW per engine contract.
      this.overlayTextEl.textContent = 'Draw';
    } else {
      const winner = state.tanks.find((t) => t.id === state.winner);
      this.overlayTextEl.textContent = winner
        ? `${winner.playerName} wins!`
        : 'Game Over';
    }
    this.buildScoreboard(state, this.overlayScoreEl);
    this.overlayEl.classList.remove('st-hud__overlay--hidden');
    this.overlayShown = true;
  }

  /**
   * Show/update the ROUND_OVER between-rounds shop. On entry it builds the standings
   * + the tank selector once; while shown it keeps the selected tank's credits and
   * each buy button's affordability/owned-count live (a buy mutates state without a
   * phase change, so the modal stays open and reflects the purchase next frame).
   */
  private syncRoundOver(state: GameState): void {
    if (state.phase !== 'ROUND_OVER') {
      this.roundOverEl.classList.add('st-hud__overlay--hidden');
      this.roundOverShown = false;
      return;
    }

    if (!this.roundOverShown) {
      const completed = state.round - 1;
      const winner = state.tanks.find((t) => t.id === state.lastRoundWinnerId);
      this.roundOverTitleEl.textContent = winner
        ? `Round ${completed}: ${winner.playerName} wins — Round ${state.round} of ${state.totalRounds}`
        : `Round ${completed} drawn — Round ${state.round} of ${state.totalRounds}`;
      this.buildScoreboard(state, this.roundOverScoreEl);

      // Tank selector: human tanks only (bots shop via the AI on their own turn).
      const humans = state.tanks.filter((t) => !t.ai);
      this.roundOverTankSel.innerHTML = '';
      for (const t of humans) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.playerName;
        this.roundOverTankSel.append(opt);
      }
      this.roundOverShopEl.style.display = humans.length > 0 ? '' : 'none';
      if (!this.shopTankId || !humans.some((t) => t.id === this.shopTankId)) {
        this.shopTankId = humans[0]?.id ?? null;
      }
      if (this.shopTankId) this.roundOverTankSel.value = this.shopTankId;
      this.roundOverEl.classList.remove('st-hud__overlay--hidden');
      this.roundOverShown = true;
    }

    // Live shop sync for the selected tank (credits + per-weapon affordability).
    const tank = state.tanks.find((t) => t.id === this.shopTankId);
    this.roundOverCreditsEl.textContent = tank ? `${tank.credits} cr` : '';
    for (const [type, cell] of this.roundOverCells) {
      const def = WEAPONS[type];
      const slot = tank?.inventory[type];
      cell.owned.textContent = slot ? `have ${slot.count}` : '';
      cell.buyBtn.disabled = !tank || tank.credits < def.price;
    }
  }

  /**
   * Build a scoreboard table into `el`: one row per tank with round wins (only for
   * multi-round matches), kills, and total damage dealt, ordered by round wins then
   * damage. Used by the GAME_OVER panel and the ROUND_OVER standings.
   */
  private buildScoreboard(state: GameState, el: HTMLElement): void {
    const multi = state.totalRounds > 1;
    const ranked = [...state.tanks].sort(
      (a, b) => b.roundWins - a.roundWins || b.totalDamage - a.totalDamage,
    );
    const cell = (text: string, cls: string): string => `<span class="${cls}">${text}</span>`;
    const head =
      cell('Player', 'st-hud__score-th') +
      (multi ? cell('Wins', 'st-hud__score-th st-hud__score-num') : '') +
      cell('Kills', 'st-hud__score-th st-hud__score-num') +
      cell('Dmg', 'st-hud__score-th st-hud__score-num');
    const rows = ranked
      .map((t) => {
        const name = `${t.ai ? '🤖 ' : ''}${t.playerName}`;
        return (
          cell(name, 'st-hud__score-name') +
          (multi ? cell(`${t.roundWins}`, 'st-hud__score-num') : '') +
          cell(`${t.kills}`, 'st-hud__score-num') +
          cell(`${Math.round(t.totalDamage)}`, 'st-hud__score-num')
        );
      })
      .join('');
    el.style.setProperty('--score-cols', multi ? '4' : '3');
    el.innerHTML = head + rows;
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
/* Opponent-turn watchdog banner (P1-6b): top-center, below the conn/toast slot. */
.st-hud__turnwatch {
  position: absolute;
  top: 78px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-radius: 6px;
  font: 600 13px/1.2 system-ui, sans-serif;
  letter-spacing: 0.02em;
  color: var(--text-gold, #ffe9b0);
  background: rgba(40, 28, 60, 0.92);
  border: 1px solid rgba(255, 210, 63, 0.5);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  white-space: nowrap;
}
.st-hud__turnwatch--stalled {
  color: #ffd7d7;
  background: rgba(90, 20, 28, 0.92);
  border-color: rgba(255, 120, 120, 0.7);
}
.st-hud__turnwatch--hidden { display: none; }
.st-hud__turnwatch-leave {
  pointer-events: auto;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--gold, #ffd23f);
  background: transparent;
  color: var(--gold, #ffd23f);
  font: 600 12px/1 system-ui, sans-serif;
}
.st-hud__turnwatch-leave:hover { background: rgba(255, 210, 63, 0.16); }
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

/* Round indicator (side panel) — "Round N of M". */
.st-hud__round {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.5px;
  color: var(--text-gold);
  text-transform: uppercase;
  text-align: center;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 210, 63, 0.18);
}
.st-hud__round--hidden { display: none; }

/* Per-player round-win pips (●/○ slots up to the clinch count). */
.st-hud__pips {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--gold);
  margin-left: auto;
}

/* Final scoreboard grid inside the GAME_OVER panel. */
.st-hud__score {
  display: grid;
  grid-template-columns: 1fr repeat(calc(var(--score-cols, 3) - 1), auto);
  gap: 4px 14px;
  margin: 10px 0 4px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.st-hud__score-th {
  font-family: var(--font-display);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.18);
}
.st-hud__score-name { text-align: left; }
.st-hud__score-num { text-align: right; font-family: var(--font-mono); }

/* ROUND_OVER between-rounds shop. */
.st-hud__roundshop {
  margin: 12px 0;
  padding: 10px;
  border: 1px solid rgba(255, 210, 63, 0.2);
  border-radius: 6px;
  background: rgba(12, 7, 22, 0.5);
}
.st-hud__roundshop-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.st-hud__roundshop-title {
  font-family: var(--font-display);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-gold);
}
.st-hud__roundshop-sel {
  pointer-events: auto;
  background: rgba(12, 7, 22, 0.8);
  color: var(--text);
  border: 1px solid var(--gold);
  border-radius: 4px;
  padding: 3px 6px;
  font-family: var(--font-sans);
}
.st-hud__roundshop-credits {
  margin-left: auto;
  font-family: var(--font-mono);
  color: var(--text-gold);
  font-variant-numeric: tabular-nums;
}
.st-hud__roundshop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

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
  /** Round-win pips (V1 match structure); empty in single-round matches. */
  pips: HTMLElement;
  /** Last rendered health, to detect drops and trigger the damage flash. */
  lastHealth: number;
  /** Last rendered "roundWins/clinch" signature, to skip pip rebuilds. */
  lastPips: string;
}

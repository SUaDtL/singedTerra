import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS, ACCESSORIES } from '@shared/engine/WeaponSystem';
import type { WeaponType, AccessoryType } from '@shared/engine/WeaponSystem';
import type { ConnectionState, TurnWatch } from '../client/GameClient';
import { MAX_WIND } from '@shared/engine/Physics';
import {
  gaugeFraction,
  windNeedleOffset,
  elevationNeedleDeg,
  elevationDegrees,
  aimDirectionGlyph,
  powerLabel,
  windMagnitudeLabel,
  windDirectionSymbol,
} from './gaugeMath';

/**
 * What a store Buy click requests: exactly one of a weapon bundle or an accessory, mirroring the
 * engine's `BuyAction` "exactly one of weapon/accessory" invariant. The HUD emits this and the
 * caller (main.ts) forwards it verbatim into a `buy` action — so the store stays decoupled from the
 * action/transport layer.
 */
export type StorePurchase = { weapon?: WeaponType; accessory?: AccessoryType };

/** Accessories sold in the store, in stable record order (currently just Battery). */
const STORE_ACCESSORIES: AccessoryType[] = Object.keys(ACCESSORIES) as AccessoryType[];

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
 * Persist the arsenal-collapsed preference so it survives turns and reloads. UI
 * preference only (never touches the engine / action log), and guarded because
 * localStorage can throw in private-mode / sandboxed frames.
 */
const ARSENAL_COLLAPSED_KEY = 'st_arsenal_collapsed';
function readArsenalCollapsed(): boolean {
  try {
    return localStorage.getItem(ARSENAL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
function writeArsenalCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(ARSENAL_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* localStorage unavailable — preference just won't persist across reloads */
  }
}

/**
 * Barrel-relative aim readout (P3-13b). The engine angle is a GLOBAL compass
 * value (0=right, 90=up, 180=left). Shown raw, the number doesn't track the
 * visible barrel — a left-firing tank reads "135°" while its barrel looks
 * raised ~45° — so ←/→ feel inverted. Present it instead as ELEVATION above the
 * horizon (0=flat, 90=straight up) plus an aim-direction arrow, so the number
 * rises and falls WITH the barrel for either side. Display-only: the logged
 * set_angle values are untouched, so deterministic replay is unaffected.
 *
 * Delegates to gaugeMath helpers so the computation is not duplicated.
 */
function aimReadout(angle: number): string {
  return `Elev ${elevationDegrees(angle)}° ${aimDirectionGlyph(angle)}`;
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

  /** Callback fired when a store Buy button is clicked. `purchase` carries exactly one of a weapon
   *  or an accessory. Optional tankId targets a specific tank (used by the ROUND_OVER between-rounds
   *  shop); omitted => active tank. */
  private buyCb: ((purchase: StorePurchase, tankId?: string) => void) | null = null;

  /** Callback fired when the player starts the next round from the ROUND_OVER shop. */
  private nextRoundCb: (() => void) | null = null;

  // Touch-aim strip callbacks (M2 mobile). Invoked by the on-screen stepper buttons;
  // main.ts wires these to InputHandler's public step methods.
  private touchAngleCb: ((delta: number) => void) | null = null;
  private touchPowerCb: ((delta: number) => void) | null = null;
  private touchFireCb: (() => void) | null = null;
  private touchWeaponCb: (() => void) | null = null;

  /** Whether the store panel is currently open. */
  private storeOpen = false;

  /** Whether the static DOM scaffold has been built yet. */
  private built = false;

  // Cached node references (populated by `build()`).
  private playersEl!: HTMLElement;
  private weaponValueEl!: HTMLElement;
  private aimEl!: HTMLElement;
  /** Aim readout sub-node: the "Sending..." text line shown during firing. */
  private aimTextEl!: HTMLElement;
  /** "Round N of M" indicator (side panel); hidden in single-round matches. */
  private roundEl!: HTMLElement;
  private overlayEl!: HTMLElement;
  /** In-game PAUSE overlay (opened by the side-panel Menu button). Non-destructive:
   *  the client/engine keeps running underneath, so Resume returns to the live game. */
  private pauseEl!: HTMLElement;
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
  /** Collapse/expand control for the arsenal strip + its persisted state. */
  private stripToggleEl!: HTMLButtonElement;
  private stripCollapsed = false;
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

  /** Per-accessory store-row nodes (PLAYER_TURN store) — battery etc. */
  private storeAccessoryCells = new Map<AccessoryType, { buyBtn: HTMLButtonElement; owned: HTMLElement }>();
  /** Per-accessory cells in the ROUND_OVER between-rounds shop. */
  private roundOverAccessoryCells = new Map<AccessoryType, { buyBtn: HTMLButtonElement; owned: HTMLElement }>();

  /** Room arms level (0–4), set once per game via {@link setArmsLevel}. Above-level store rows are
   *  shown disabled. Defaults to the max (4 => nothing gated) for full back-compat. UI-only — the
   *  engine independently enforces the same gate, so this never affects determinism. */
  private armsLevel = 4;

  /** Per-weapon strip cells: button + its ammo-count node, for cheap per-frame updates. */
  private weaponCells = new Map<WeaponType, { el: HTMLButtonElement; ammo: HTMLElement }>();

  /** Per-tank-id cache of the bar's mutable nodes, so updates skip rebuilds. */
  private rows = new Map<string, PlayerRow>();

  // ── Instrument cluster gauge nodes (cockpit HUD, #44) ──────────────────
  // Cached once in build(); mutated each frame in syncWind / syncAim.
  // Elevation gauge SVG nodes:
  private gaugeElevNeedle!: SVGLineElement;
  private gaugeElevLabel!: SVGTextElement;
  // Wind gauge SVG nodes:
  private gaugeWindMarker!: SVGRectElement;
  private gaugeWindLabel!: SVGTextElement;
  // Power gauge SVG nodes:
  private gaugePowerArc!: SVGPathElement;
  private gaugePowerLabel!: SVGTextElement;
  // Mobile numeric readouts (coarse-pointer). The analog dials' thin gold strokes
  // dissolve to sub-pixel when the whole #app is zoom-scaled down on a phone, so on
  // touch devices we hide the dials and show these bold numeric values instead. They
  // mirror the SVG label strings verbatim (populated in syncWind / syncAim), so both
  // representations always agree — CSS decides which one is visible.
  private numElevValue!: HTMLElement;
  private numWindValue!: HTMLElement;
  private numPowerValue!: HTMLElement;
  // Active-player name row (replaces old aimTextEl player portion):
  private activePlayerEl!: HTMLElement;

  // Touch-aim strip (M2 mobile): fire + weapon buttons need per-frame sync.
  private touchStripEl!: HTMLElement;
  private touchFireBtnEl!: HTMLButtonElement;
  private touchWeaponBtnEl!: HTMLButtonElement;

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
  onBuy(cb: (purchase: StorePurchase, tankId?: string) => void): void {
    this.buyCb = cb;
  }

  /** Register the callback fired when the player starts the next round. */
  onNextRound(cb: () => void): void {
    this.nextRoundCb = cb;
  }

  /**
   * Set the room's arms level (0–4) so the store can show above-level weapons/accessories as locked.
   * UI-only: the engine independently enforces the same gate in `applyBuy`, so a stale or unset value
   * never causes a desync — it only changes which rows LOOK buyable. Called once at game creation.
   */
  setArmsLevel(level: number): void {
    this.armsLevel = level;
  }

  // Touch-aim strip registrations (M2 mobile).
  onTouchAngle(cb: (delta: number) => void): void { this.touchAngleCb = cb; }
  onTouchPower(cb: (delta: number) => void): void { this.touchPowerCb = cb; }
  onTouchFire(cb: () => void): void { this.touchFireCb = cb; }
  onTouchWeapon(cb: () => void): void { this.touchWeaponCb = cb; }

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

    this.buildPlayers();
    this.buildRound();
    const instruments = this.buildInstrumentCluster();
    this.buildActiveRow();
    const controls = this.buildControlsLegend();
    this.buildArsenal();
    this.buildStore();
    this.buildEndScreens();
    this.buildRoundShop();
    const menu = this.buildMenu();
    this.buildLiveness();
    this.buildTouchStrip();

    // Touch strip goes into the HUD side panel, NOT the canvas overlay, so it
    // can never overlap the play field. margin-top:auto (via CSS) pushes it to
    // the bottom of the panel column.
    this.root.append(menu, this.roundEl, this.playersEl, instruments, this.activePlayerEl, this.aimEl, this.storeBtnEl, this.stripEl, this.touchStripEl);
    // Controls and liveness widgets stay on the canvas overlay. The controls card
    // is pinned to the upper-left sky so it never forces side-panel scrolling or
    // obscures the lower terrain/tanks.
    this.overlayRoot.append(controls, this.connBannerEl, this.toastEl, this.turnWatchEl);
    this.modalRoot.append(this.storeEl, this.overlayEl, this.roundOverEl, this.pauseEl);
    this.built = true;
  }

  /** Player health-bar column (top-left). */
  private buildPlayers(): void {
    // Player health-bar column (top-left).
    this.playersEl = document.createElement('div');
    this.playersEl.className = 'st-hud__players';
  }

  /** Round indicator (side panel): "Round N of M". */
  private buildRound(): void {
    // Round indicator (side panel): "Round N of M" — hidden in single-round matches.
    this.roundEl = document.createElement('div');
    this.roundEl.className = 'st-hud__round st-hud__round--hidden';
  }

  /** Cockpit instrument cluster (#44): three SVG gauges + mobile numeric readouts. */
  private buildInstrumentCluster(): HTMLElement {
    // ── Cockpit instrument cluster (#44) ────────────────────────────────
    // One framed panel holding three SVG gauges in a row: Elevation, Wind, Power.
    // All needle/fill geometry is driven by gaugeMath helpers; nothing inline here.

    const instruments = document.createElement('div');
    instruments.className = 'st-hud__instruments';
    const instrTitle = document.createElement('div');
    instrTitle.className = 'st-hud__instr-title';
    instrTitle.textContent = 'Instruments';

    // ── Elevation gauge (semicircular dial, 180° arc) ──
    // Needle pivots at center of a 72×44 SVG.  Arc: 180° semicircle, flat edge down.
    // Angle mapping via elevationNeedleDeg(angle): 0=right(3 o'clock), 90=up, 180=left.
    // SVG coordinate origin: top-left.  Dial center: (36, 40).  Arc radius: 30.
    // The arc goes from (6,40) [left, 180°] to (66,40) [right, 0°] along the top.
    const elevSvg = HUD.makeSvg(72, 56);
    elevSvg.setAttribute('aria-label', 'Elevation gauge');
    // Dial arc track
    const elevTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    elevTrack.setAttribute('d', 'M 6 40 A 30 30 0 0 1 66 40');
    elevTrack.setAttribute('class', 'st-hud__gauge-track');
    // Center pivot mark
    const elevPivot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    elevPivot.setAttribute('cx', '36');
    elevPivot.setAttribute('cy', '40');
    elevPivot.setAttribute('r', '2.5');
    elevPivot.setAttribute('class', 'st-hud__gauge-pivot');
    // Needle (pivots at dial center 36,40; points upward at natural 0° rotation)
    this.gaugeElevNeedle = document.createElementNS('http://www.w3.org/2000/svg', 'line') as SVGLineElement;
    this.gaugeElevNeedle.setAttribute('x1', '36');
    this.gaugeElevNeedle.setAttribute('y1', '40');
    this.gaugeElevNeedle.setAttribute('x2', '36');
    this.gaugeElevNeedle.setAttribute('y2', '12');
    this.gaugeElevNeedle.setAttribute('class', 'st-hud__gauge-needle');
    // Tick marks at 0°, 45°, 90°, 135°, 180° of the dial arc
    const elevTicks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    elevTicks.setAttribute('class', 'st-hud__gauge-ticks');
    for (const deg of [0, 45, 90, 135, 180]) {
      // Map dial degrees → SVG angle: 0°=right, rotated CCW from positive-x axis.
      // dial deg 0 → SVG 0° from center pointing right; 90 → pointing up (−90° SVG); 180 → left
      const rad = ((180 - deg) * Math.PI) / 180; // 0=right at SVG angle 0
      const r = 30; const cx = 36; const cy = 40;
      const x1 = cx + r * Math.cos(rad);
      const y1 = cy - r * Math.sin(rad);
      const x2 = cx + (r - 5) * Math.cos(rad);
      const y2 = cy - (r - 5) * Math.sin(rad);
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      elevTicks.append(tick);
    }
    // On-gauge numeric label (elevation degrees + direction glyph)
    this.gaugeElevLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text') as SVGTextElement;
    this.gaugeElevLabel.setAttribute('x', '36');
    this.gaugeElevLabel.setAttribute('y', '52');
    this.gaugeElevLabel.setAttribute('text-anchor', 'middle');
    this.gaugeElevLabel.setAttribute('class', 'st-hud__gauge-label');
    this.gaugeElevLabel.textContent = '0° ▶';
    elevSvg.append(elevTrack, elevTicks, elevPivot, this.gaugeElevNeedle, this.gaugeElevLabel);
    const elevCell = document.createElement('div');
    elevCell.className = 'st-hud__gauge-cell';
    const elevCellTitle = document.createElement('div');
    elevCellTitle.className = 'st-hud__gauge-cell-title';
    elevCellTitle.textContent = 'Elev';
    elevCell.append(elevCellTitle, elevSvg);

    // ── Wind gauge (horizontal center-zero track) ──
    // Track: 64px wide, center at x=32. Marker slides left/right by windNeedleOffset×28px.
    const windSvg = HUD.makeSvg(72, 56);
    windSvg.setAttribute('aria-label', 'Wind gauge');
    // Track background bar
    const windTrack = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    windTrack.setAttribute('x', '4');
    windTrack.setAttribute('y', '22');
    windTrack.setAttribute('width', '64');
    windTrack.setAttribute('height', '6');
    windTrack.setAttribute('rx', '3');
    windTrack.setAttribute('class', 'st-hud__gauge-track-rect');
    // Center tick
    const windCenter = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windCenter.setAttribute('x1', '36');
    windCenter.setAttribute('y1', '18');
    windCenter.setAttribute('x2', '36');
    windCenter.setAttribute('y2', '34');
    windCenter.setAttribute('class', 'st-hud__gauge-ticks');
    // End ticks
    const windTickL = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windTickL.setAttribute('x1', '4'); windTickL.setAttribute('y1', '20');
    windTickL.setAttribute('x2', '4'); windTickL.setAttribute('y2', '32');
    windTickL.setAttribute('class', 'st-hud__gauge-ticks');
    const windTickR = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windTickR.setAttribute('x1', '68'); windTickR.setAttribute('y1', '20');
    windTickR.setAttribute('x2', '68'); windTickR.setAttribute('y2', '32');
    windTickR.setAttribute('class', 'st-hud__gauge-ticks');
    // Moving marker (diamond shape via rect rotated 45°, centered on track center y=25)
    this.gaugeWindMarker = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
    this.gaugeWindMarker.setAttribute('x', '32');
    this.gaugeWindMarker.setAttribute('y', '22');
    this.gaugeWindMarker.setAttribute('width', '8');
    this.gaugeWindMarker.setAttribute('height', '8');
    this.gaugeWindMarker.setAttribute('rx', '1');
    this.gaugeWindMarker.setAttribute('transform', 'rotate(45, 36, 25)');
    this.gaugeWindMarker.setAttribute('class', 'st-hud__gauge-needle-rect');
    // Label
    this.gaugeWindLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text') as SVGTextElement;
    this.gaugeWindLabel.setAttribute('x', '36');
    this.gaugeWindLabel.setAttribute('y', '52');
    this.gaugeWindLabel.setAttribute('text-anchor', 'middle');
    this.gaugeWindLabel.setAttribute('class', 'st-hud__gauge-label');
    this.gaugeWindLabel.textContent = '• 0.0';
    windSvg.append(windTrack, windTickL, windTickR, windCenter, this.gaugeWindMarker, this.gaugeWindLabel);
    const windCell = document.createElement('div');
    windCell.className = 'st-hud__gauge-cell';
    const windCellTitle = document.createElement('div');
    windCellTitle.className = 'st-hud__gauge-cell-title';
    windCellTitle.textContent = 'Wind';
    windCell.append(windCellTitle, windSvg);

    // ── Power gauge (arc fill driven by stroke-dasharray) ──
    // Arc: 220° sweep from bottom-left to bottom-right (like a fuel gauge).
    // SVG 80×56. Center (40,48). Radius 28. Start angle = 200° from positive-x (bottom-left).
    // We use a fixed-length path and manipulate stroke-dasharray to fill it.
    // Arc length ≈ 2π×28×(220/360) ≈ 107.5 — we'll compute precisely.
    const pwrSvg = HUD.makeSvg(72, 56);
    pwrSvg.setAttribute('aria-label', 'Power gauge');
    const PWR_R = 26; const PWR_CX = 36; const PWR_CY = 46;
    // Start angle: 200° (bottom-left), end angle: 340° (bottom-right) — 140° sweep total
    // Using CSS convention: 0° = top, clockwise. For SVG path arcs we use standard math angles.
    // Start: 200° from SVG +x axis (measured clockwise from top = 110° from +x counter-clockwise)
    // Let's use the sweep directly: start at SVG angle 200° CW from top:
    // SVG +x is 3 o'clock. Our start = -140° from +x (i.e. 220° CW from +x).
    // Simpler: start = lower-left, end = lower-right with a 220° sweep going CCW through top.
    // In SVG large-arc=1, sweep=0 (CCW):
    //   start point at angle 160° from +x (going CCW means angle decreasing for CW motion)
    // Actually let's use: start = 200° from +x (CCW / standard math = bottom-left area)
    //   start: (cx + r*cos(200°), cy - r*sin(200°))  [SVG y flipped]
    //   = (36 + 26*cos(200°), 46 - 26*sin(200°))
    //   = (36 + 26*(-0.940), 46 - 26*(-0.342))
    //   = (36 - 24.44, 46 + 8.89) = (11.56, 54.89) → ~(12, 55)
    //   end: angle -20° from +x (= 340°): (cx + r*cos(-20°), cy - r*sin(-20°))
    //   = (36 + 26*0.940, 46 + 26*0.342) = (60.44, 54.89) → ~(60, 55)
    // sweep = 140° (from 200° going CW: 200→340 = 140°)
    // large-arc: 140° < 180° so large-arc=0
    const psx = PWR_CX + PWR_R * Math.cos((200 * Math.PI) / 180);
    const psy = PWR_CY - PWR_R * Math.sin((200 * Math.PI) / 180);
    const pex = PWR_CX + PWR_R * Math.cos((-20 * Math.PI) / 180);
    const pey = PWR_CY - PWR_R * Math.sin((-20 * Math.PI) / 180);
    const pwrArcD = `M ${psx.toFixed(2)} ${psy.toFixed(2)} A ${PWR_R} ${PWR_R} 0 0 1 ${pex.toFixed(2)} ${pey.toFixed(2)}`;
    // Arc circumference for a 140° sweep
    const PWR_ARC_LEN = 2 * Math.PI * PWR_R * (140 / 360);
    // Track (full arc, dim)
    const pwrTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pwrTrack.setAttribute('d', pwrArcD);
    pwrTrack.setAttribute('class', 'st-hud__gauge-track');
    // Fill arc (same path, stroke-dasharray driven by gaugeFraction × ARC_LEN)
    this.gaugePowerArc = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    this.gaugePowerArc.setAttribute('d', pwrArcD);
    this.gaugePowerArc.setAttribute('stroke-dasharray', `0 ${PWR_ARC_LEN.toFixed(2)}`);
    this.gaugePowerArc.setAttribute('class', 'st-hud__gauge-power-fill');
    // Store arc length as data attribute for frame updates
    this.gaugePowerArc.dataset['arcLen'] = String(PWR_ARC_LEN.toFixed(4));
    // End-cap dot at start position (low end)
    const pwrDotL = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pwrDotL.setAttribute('cx', psx.toFixed(2));
    pwrDotL.setAttribute('cy', psy.toFixed(2));
    pwrDotL.setAttribute('r', '2.5');
    pwrDotL.setAttribute('class', 'st-hud__gauge-pivot');
    const pwrDotR = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pwrDotR.setAttribute('cx', pex.toFixed(2));
    pwrDotR.setAttribute('cy', pey.toFixed(2));
    pwrDotR.setAttribute('r', '2.5');
    pwrDotR.setAttribute('class', 'st-hud__gauge-pivot');
    // Numeric label
    this.gaugePowerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text') as SVGTextElement;
    this.gaugePowerLabel.setAttribute('x', '36');
    // y=50 seats the number INSIDE the arch's open interior. The arc is only a 140°
    // sweep, so near the horizontal centre the curve still descends through the ~y44
    // band and the number collided with the stroke (hard to read); y=50 clears the
    // stroke above and the base pivots below.
    this.gaugePowerLabel.setAttribute('y', '50');
    this.gaugePowerLabel.setAttribute('text-anchor', 'middle');
    this.gaugePowerLabel.setAttribute('class', 'st-hud__gauge-label st-hud__gauge-label--lg');
    this.gaugePowerLabel.textContent = '0';
    pwrSvg.append(pwrTrack, this.gaugePowerArc, pwrDotL, pwrDotR, this.gaugePowerLabel);
    const pwrCell = document.createElement('div');
    pwrCell.className = 'st-hud__gauge-cell';
    const pwrCellTitle = document.createElement('div');
    pwrCellTitle.className = 'st-hud__gauge-cell-title';
    pwrCellTitle.textContent = 'Power';
    pwrCell.append(pwrCellTitle, pwrSvg);

    // Assemble the instrument cluster row
    const gaugeRow = document.createElement('div');
    gaugeRow.className = 'st-hud__gauge-row';
    gaugeRow.append(elevCell, windCell, pwrCell);

    // Mobile numeric readouts — same three values as bold text, shown INSTEAD of the
    // dials on coarse-pointer (see the field comment). Each cell is a dim title + a
    // big value node that syncWind/syncAim keep in lockstep with the SVG labels.
    const gaugeNums = document.createElement('div');
    gaugeNums.className = 'st-hud__gauge-nums';
    const mkNumCell = (title: string, initial: string): { cell: HTMLElement; value: HTMLElement } => {
      const cell = document.createElement('div');
      cell.className = 'st-hud__gauge-num';
      const t = document.createElement('div');
      t.className = 'st-hud__gauge-num-title';
      t.textContent = title;
      const value = document.createElement('div');
      value.className = 'st-hud__gauge-num-value';
      value.textContent = initial;
      cell.append(t, value);
      return { cell, value };
    };
    const elevNumCell = mkNumCell('Elev', '0° ▶');
    const windNumCell = mkNumCell('Wind', '• 0.0');
    const powerNumCell = mkNumCell('Power', '0');
    this.numElevValue = elevNumCell.value;
    this.numWindValue = windNumCell.value;
    this.numPowerValue = powerNumCell.value;
    gaugeNums.append(elevNumCell.cell, windNumCell.cell, powerNumCell.cell);

    instruments.append(instrTitle, gaugeRow, gaugeNums);
    return instruments;
  }

  /** Active-player + weapon readout row, plus the firing "Sending..." strip. */
  private buildActiveRow(): void {
    // ── Active player + weapon name row (replaces aim text + old wind/weapon blocks) ──
    // This shows "PlayerName  ·  WeaponName" in one compact row. It persists below the
    // gauges and is hidden during the firing "Sending..." state (replaced by aimTextEl).
    this.activePlayerEl = document.createElement('div');
    this.activePlayerEl.className = 'st-hud__active-row';
    // aimEl is the "Sending..." firing strip — shown only during isFiring state.
    this.aimEl = document.createElement('div');
    this.aimEl.className = 'st-hud__aim';
    this.aimTextEl = document.createElement('span');
    this.aimTextEl.className = 'st-hud__aim-text';
    this.aimEl.append(this.aimTextEl);
    this.aimEl.classList.add('st-hud__aim--hidden');

    // Active weapon readout — kept as a text row (not a gauge; SPEC says "may be
    // repositioned"). Placed inside activePlayerEl alongside the player name.
    const weapon = document.createElement('div');
    weapon.className = 'st-hud__weapon';
    const weaponLabel = document.createElement('span');
    weaponLabel.className = 'st-hud__weapon-label';
    weaponLabel.textContent = 'Weapon';
    this.weaponValueEl = document.createElement('span');
    this.weaponValueEl.className = 'st-hud__weapon-value';
    weapon.append(weaponLabel, this.weaponValueEl);
    // Active player row: player name + weapon readout, shown when not firing.
    // Sits directly below the instrument cluster.
    this.activePlayerEl.append(weapon);
  }

  /** Controls legend (bottom-right; built once, never updated). */
  private buildControlsLegend(): HTMLElement {
    // Controls legend (bottom-right, unobtrusive; built once, never updated).
    const controls = document.createElement('div');
    controls.className = 'st-hud__controls';
    controls.innerHTML =
      '<span class="st-hud__control-cell"><span class="st-hud__keypair"><kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span>Aim</span></span>' +
      '<span class="st-hud__control-cell"><span class="st-hud__keypair"><kbd>&uarr;</kbd><kbd>&darr;</kbd></span><span>Power</span></span>' +
      '<span class="st-hud__control-cell"><span class="st-hud__keypair"><kbd>Tab</kbd><kbd>Q</kbd></span><span>Weapon</span></span>' +
      '<span class="st-hud__control-cell"><span class="st-hud__keypair"><kbd>Space</kbd><kbd>Enter</kbd></span><span>Fire</span></span>';
    return controls;
  }

  /** Weapon strip ("Arsenal"): collapsible grid of per-weapon buttons. */
  private buildArsenal(): void {
    // Weapon strip (bottom-left): a framed "Arsenal" panel with a titled header
    // and a 2-column grid of buttons, each showing name + live ammo count.
    // Listeners attached ONCE here.
    this.stripEl = document.createElement('div');
    this.stripEl.className = 'st-hud__strip';
    // Header row: "Arsenal" title + a collapse/expand toggle. Collapsing folds the
    // grid away to reclaim vertical space (mobile especially); the state persists.
    const stripHeader = document.createElement('div');
    stripHeader.className = 'st-hud__strip-header';
    const stripTitle = document.createElement('div');
    stripTitle.className = 'st-hud__strip-title';
    stripTitle.textContent = 'Arsenal';
    const stripToggle = document.createElement('button');
    stripToggle.type = 'button';
    stripToggle.className = 'st-hud__strip-toggle';
    stripToggle.addEventListener('click', () => this.toggleStripCollapsed());
    stripHeader.append(stripTitle, stripToggle);
    this.stripToggleEl = stripToggle;
    const stripGrid = document.createElement('div');
    stripGrid.className = 'st-hud__strip-grid';
    for (const type of STRIP_WEAPONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'st-hud__weapon-btn';
      btn.dataset['weapon'] = type; // stable hook for owned-only visibility + tests
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
    this.stripEl.append(stripHeader, stripGrid);
    // Restore the persisted collapsed state (survives turns and reloads).
    this.stripCollapsed = readArsenalCollapsed();
    this.applyStripCollapsed();
  }

  /** Store toggle button (side panel) + the store modal (on the modal layer). */
  private buildStore(): void {
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
      buyBtn.addEventListener('click', () => this.buyCb?.({ weapon: type }));

      row.append(info, buyBtn);
      storeGrid.append(row);
      this.storeCells.set(type, { buyBtn, owned });
    }

    // Accessory rows (Battery etc.) — same row markup as weapons, but the buy emits an
    // `accessory` purchase. The blurb (e.g. "+100 power cap") stands in for the bundle line.
    for (const key of STORE_ACCESSORIES) {
      const acc = ACCESSORIES[key];
      const row = document.createElement('div');
      row.className = 'st-hud__store-row';

      const info = document.createElement('div');
      info.className = 'st-hud__store-info';
      const nm = document.createElement('span');
      nm.className = 'st-hud__store-name';
      nm.textContent = acc.name;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-owned';
      info.append(nm, owned);

      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'st-hud__store-buy';
      buyBtn.innerHTML =
        `<span class="st-hud__store-price">$${acc.price.toLocaleString()}</span>` +
        `<span class="st-hud__store-bundle">${acc.blurb}</span>`;
      buyBtn.addEventListener('click', () => this.buyCb?.({ accessory: key }));

      row.append(info, buyBtn);
      storeGrid.append(row);
      this.storeAccessoryCells.set(key, { buyBtn, owned });
    }

    const storeClose = document.createElement('button');
    storeClose.type = 'button';
    storeClose.className = 'st-hud__store-close';
    storeClose.textContent = 'Close';
    storeClose.addEventListener('click', () => this.toggleStore(false));

    storePanel.append(storeHeader, storeGrid, storeClose);
    this.storeEl.append(storePanel);

    // Click-outside-to-dismiss (review #8): a click on the store BACKDROP (storeEl
    // itself, not the centered panel) closes the store. Clicks inside storePanel have a
    // descendant target, so buying/closing within the store is unaffected. The store
    // overlay lives in #modal-layer above the canvas, so this click never reaches the
    // play field (no stray aim/fire). Scoped to the in-turn store; the flow-gated
    // game-over / round-over modals deliberately do NOT get casual dismiss.
    this.storeEl.addEventListener('click', (e) => {
      if (e.target === this.storeEl) this.toggleStore(false);
    });
  }

  /** GAME_OVER overlay + the non-destructive PAUSE overlay. */
  private buildEndScreens(): void {
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

    // PAUSE overlay — opened by the side-panel Menu button. Non-destructive: it does
    // NOT tear the game down and does NOT stop the client loop (REQUIRED for networked
    // lockstep, where the loop must keep applying the broadcast action log to stay in
    // seq sync). Resume just hides it; Quit runs the existing teardown-to-lobby path.
    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'st-hud__overlay st-hud__overlay--hidden';
    const pausePanel = document.createElement('div');
    pausePanel.className = 'st-hud__overlay-panel';
    const pauseText = document.createElement('div');
    pauseText.className = 'st-hud__overlay-text';
    pauseText.textContent = 'Paused';
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'st-hud__restart';
    resumeBtn.type = 'button';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => this.togglePause(false));
    const pauseQuitBtn = document.createElement('button');
    pauseQuitBtn.className = 'st-hud__restart st-hud__restart--ghost';
    pauseQuitBtn.type = 'button';
    pauseQuitBtn.textContent = 'Quit to Menu';
    pauseQuitBtn.addEventListener('click', () => { this.togglePause(false); this.quitCb?.(); });
    const pauseBtns = document.createElement('div');
    pauseBtns.className = 'st-hud__overlay-btns';
    pauseBtns.append(resumeBtn, pauseQuitBtn);
    pausePanel.append(pauseText, pauseBtns);
    this.pauseEl.append(pausePanel);
  }

  /** ROUND_OVER between-rounds shop modal. */
  private buildRoundShop(): void {
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
        if (this.shopTankId) this.buyCb?.({ weapon: type }, this.shopTankId);
      });
      this.roundOverCells.set(type, { buyBtn, owned });
      shopGrid.append(buyBtn);
    }
    // Accessory cells (Battery etc.) in the between-rounds shop — buy for the selected tank.
    for (const key of STORE_ACCESSORIES) {
      const acc = ACCESSORIES[key];
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'st-hud__store-buy';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = acc.name;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'st-hud__store-price';
      priceSpan.textContent = `$${acc.price}`;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-bundle';
      buyBtn.append(nameSpan, priceSpan, owned);
      buyBtn.addEventListener('click', () => {
        if (this.shopTankId) this.buyCb?.({ accessory: key }, this.shopTankId);
      });
      this.roundOverAccessoryCells.set(key, { buyBtn, owned });
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
  }

  /** Persistent Quit/Menu button (top of the side panel). */
  private buildMenu(): HTMLElement {
    // Persistent Quit/Menu button (top of the side panel) — returns to the lobby.
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'st-hud__menu';
    menu.textContent = '⤺ Menu';
    // Opens the non-destructive PAUSE overlay (Resume / Quit), NOT a direct quit —
    // so the player can get back into the live game (review #5).
    menu.addEventListener('click', () => this.togglePause(true));
    return menu;
  }

  /** Networked liveness widgets: connection banner, toast, turn-watch. */
  private buildLiveness(): void {
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
  }

  /** Touch-aim strip (M2 mobile): angle/power/weapon/fire buttons. */
  private buildTouchStrip(): void {
    // Touch-aim strip (M2 mobile): angle, power, weapon-cycle, fire buttons along
    // the bottom of #game-overlay. Shown only on coarse-pointer (touch) devices via
    // CSS. Each stepper uses hold-to-repeat: tap = immediate step; hold 400ms = fast
    // repeat at 80ms intervals, matching keyboard auto-repeat feel.
    this.touchStripEl = document.createElement('div');
    this.touchStripEl.className = 'st-hud__touch-strip';

    const mkTouchBtn = (label: string, extra?: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `st-hud__touch-btn${extra ? ` ${extra}` : ''}`;
      b.textContent = label;
      return b;
    };

    /** Wire hold-to-repeat on a stepper button. Immediate step on pointerdown,
     *  then fast repeat after a short hold. pointerCapture keeps events firing
     *  if the finger drifts off the button. */
    const wireRepeater = (btn: HTMLButtonElement, action: () => void): void => {
      let holdTimer: ReturnType<typeof setTimeout> | null = null;
      let repeatTimer: ReturnType<typeof setInterval> | null = null;
      const stop = (): void => {
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        if (repeatTimer !== null) { clearInterval(repeatTimer); repeatTimer = null; }
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        action();
        holdTimer = setTimeout(() => {
          holdTimer = null;
          repeatTimer = setInterval(action, 80);
        }, 400);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
    };

    const touchAngleL = mkTouchBtn('◀\nAim');
    const touchAngleR = mkTouchBtn('Aim\n▶');
    const touchPowerD = mkTouchBtn('▼\nPwr');
    const touchPowerU = mkTouchBtn('Pwr\n▲');
    this.touchWeaponBtnEl = mkTouchBtn('⇄\nWeapon', 'st-hud__touch-weapon');
    this.touchFireBtnEl = mkTouchBtn('🔥 FIRE', 'st-hud__touch-fire');

    wireRepeater(touchAngleL, () => this.touchAngleCb?.(-3));
    wireRepeater(touchAngleR, () => this.touchAngleCb?.(3));
    wireRepeater(touchPowerD, () => this.touchPowerCb?.(-3));
    wireRepeater(touchPowerU, () => this.touchPowerCb?.(3));
    this.touchWeaponBtnEl.addEventListener('click', () => this.touchWeaponCb?.());
    this.touchFireBtnEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchFireCb?.();
    });

    this.touchStripEl.append(touchAngleL, touchAngleR, touchPowerD, touchPowerU, this.touchWeaponBtnEl, this.touchFireBtnEl);
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

  /** True while the in-game PAUSE overlay is open. Read by main.ts to drop local
   *  human input (aim/fire) while paused — the rAF loop keeps running regardless. */
  private paused = false;

  /** Whether the in-game PAUSE overlay is currently open. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Open/close the store modal. With no argument, toggles. */
  /** Show/hide the in-game PAUSE overlay. Non-destructive — the client/engine keeps
   *  running underneath (the networked lockstep loop MUST keep applying the broadcast
   *  log to stay in sync), so Resume returns to the exact live game. Local human input
   *  is suppressed while open via main.ts's gate (#52), NOT by stopping the loop. */
  private togglePause(show: boolean): void {
    this.paused = show;
    this.pauseEl.classList.toggle('st-hud__overlay--hidden', !show);
  }

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
      const locked = def.armsLevel > this.armsLevel;
      const owned = slot ? (slot.unlimited ? '∞' : String(slot.count)) : '0';
      const label = locked ? `🔒 Arms Lv ${def.armsLevel}` : `Own ${owned}`;
      if (cell.owned.textContent !== label) cell.owned.textContent = label;
      const buyable = canAct && !locked && credits >= def.price;
      cell.buyBtn.disabled = !buyable;
      cell.buyBtn.classList.toggle('st-hud__store-buy--disabled', !buyable);
    }

    // Accessory rows: owned-readout is the effect (battery => current power cap), gated by arms level.
    for (const [key, cell] of this.storeAccessoryCells) {
      const acc = ACCESSORIES[key];
      const locked = acc.armsLevel > this.armsLevel;
      const label = locked
        ? `🔒 Arms Lv ${acc.armsLevel}`
        : key === 'battery'
          ? `Cap ${active?.powerCap ?? 100}`
          : '';
      if (cell.owned.textContent !== label) cell.owned.textContent = label;
      const buyable = canAct && !locked && credits >= acc.price;
      cell.buyBtn.disabled = !buyable;
      cell.buyBtn.classList.toggle('st-hud__store-buy--disabled', !buyable);
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

  /**
   * Update the wind SVG gauge: slide the marker horizontally and refresh the label.
   * The half-track half-width is 32px (track spans x=4..68, center=36, half=32).
   * windNeedleOffset returns [-1,1]; marker center starts at x=36.
   * The marker is a rotated rect with natural center at (x+4, y+4) after the 45° rotate
   * around (x+4, y+4) = (36, 25). We translate it by offset×30px.
   */
  private syncWind(wind: number): void {
    const offset = windNeedleOffset(wind, MAX_WIND); // [-1, 1]
    const tx = offset * 26; // ±26px keeps the 8px diamond inside the 4..68 track at max wind
    // Marker: rect x=32 y=22 w=8 h=8, rotated 45° around its center (36,26).
    // Translate center by tx: new center at (36+tx, 26). Update transform.
    const cx = 36 + tx;
    this.gaugeWindMarker.setAttribute('x', String(cx - 4));
    this.gaugeWindMarker.setAttribute('transform', `rotate(45, ${cx}, 26)`);
    // Label: "→ 3.2" / "← 3.2" / "• 0.0"
    const sym = windDirectionSymbol(wind);
    const mag = windMagnitudeLabel(wind);
    const lbl = `${sym} ${mag}`;
    if (this.gaugeWindLabel.textContent !== lbl) this.gaugeWindLabel.textContent = lbl;
    if (this.numWindValue.textContent !== lbl) this.numWindValue.textContent = lbl;
  }

  /** Update the active tank's SVG gauges + weapon/player name row. */
  private syncAim(state: GameState, isFiring = false): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank) {
      // No active tank: blank gauges, hide active row.
      this.activePlayerEl.classList.remove('st-hud__active-row--hidden');
      this.aimEl.classList.add('st-hud__aim--hidden');
      this.weaponValueEl.textContent = '—';
      // Zero out gauges
      this.gaugeElevNeedle.setAttribute('transform', '');
      if (this.gaugeElevLabel.textContent !== '0° ▶') this.gaugeElevLabel.textContent = '0° ▶';
      if (this.numElevValue.textContent !== '0° ▶') this.numElevValue.textContent = '0° ▶';
      this.gaugeWindMarker.setAttribute('x', '32');
      this.gaugeWindMarker.setAttribute('transform', 'rotate(45, 36, 26)');
      if (this.gaugeWindLabel.textContent !== '• 0.0') this.gaugeWindLabel.textContent = '• 0.0';
      if (this.numWindValue.textContent !== '• 0.0') this.numWindValue.textContent = '• 0.0';
      const arcLen = parseFloat(this.gaugePowerArc.dataset['arcLen'] ?? '0');
      this.gaugePowerArc.setAttribute('stroke-dasharray', `0 ${arcLen.toFixed(2)}`);
      if (this.gaugePowerLabel.textContent !== '0') this.gaugePowerLabel.textContent = '0';
      if (this.numPowerValue.textContent !== '0') this.numPowerValue.textContent = '0';
      return;
    }

    if (isFiring) {
      // Firing: show "Sending…" in the aim strip; hide the normal active-player row.
      this.aimTextEl.textContent = `${tank.playerName}  ·  Sending...`;
      this.aimEl.classList.remove('st-hud__aim--hidden');
      this.activePlayerEl.classList.add('st-hud__active-row--hidden');
      // Keep gauges frozen at their last values during flight — no update.
      return;
    }

    // Normal PLAYER_TURN state: show active player + weapon row, hide aim strip.
    this.aimEl.classList.add('st-hud__aim--hidden');
    this.activePlayerEl.classList.remove('st-hud__active-row--hidden');
    const weaponName = WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon;
    this.weaponValueEl.textContent = weaponName;

    // ── Elevation gauge ──
    // elevationNeedleDeg(angle) gives [0,180]: 0=right, 90=up, 180=left.
    // The needle SVG natural position (no transform) points up (from y=40 to y=12),
    // which corresponds to dial 90°. So we rotate by (needleDeg - 90)° around the pivot.
    const needleDeg = elevationNeedleDeg(tank.angle);
    const needleRot = needleDeg - 90; // 0→−90° (right), 90→0° (up), 180→+90° (left)
    this.gaugeElevNeedle.setAttribute('transform', `rotate(${needleRot}, 36, 40)`);
    const elevLbl = `${elevationDegrees(tank.angle)}° ${aimDirectionGlyph(tank.angle)}`;
    if (this.gaugeElevLabel.textContent !== elevLbl) this.gaugeElevLabel.textContent = elevLbl;
    if (this.numElevValue.textContent !== elevLbl) this.numElevValue.textContent = elevLbl;

    // ── Power gauge (arc fill) ──
    const fraction = gaugeFraction(tank.power, 0, tank.powerCap ?? 100);
    const arcLen = parseFloat(this.gaugePowerArc.dataset['arcLen'] ?? '0');
    const filled = fraction * arcLen;
    const gap = arcLen - filled;
    const dasharrayVal = `${filled.toFixed(2)} ${gap.toFixed(2)}`;
    this.gaugePowerArc.setAttribute('stroke-dasharray', dasharrayVal);
    const pwrLbl = powerLabel(tank.power);
    if (this.gaugePowerLabel.textContent !== pwrLbl) this.gaugePowerLabel.textContent = pwrLbl;
    if (this.numPowerValue.textContent !== pwrLbl) this.numPowerValue.textContent = pwrLbl;
  }

  /** Flip and persist the arsenal-collapsed preference. */
  private toggleStripCollapsed(): void {
    this.stripCollapsed = !this.stripCollapsed;
    writeArsenalCollapsed(this.stripCollapsed);
    this.applyStripCollapsed();
  }

  /** Reflect the collapsed state onto the strip DOM + toggle affordance. */
  private applyStripCollapsed(): void {
    this.stripEl.classList.toggle('st-hud__strip--collapsed', this.stripCollapsed);
    // ▸ points right when collapsed (click to open), ▾ down when expanded.
    this.stripToggleEl.textContent = this.stripCollapsed ? '▸' : '▾';
    this.stripToggleEl.setAttribute('aria-expanded', String(!this.stripCollapsed));
    this.stripToggleEl.setAttribute(
      'aria-label',
      this.stripCollapsed ? 'Expand arsenal' : 'Collapse arsenal',
    );
  }

  /** Reconcile the weapon strip: owned-only visibility, active highlight, live ammo. No DOM rebuild. */
  private syncStrip(state: GameState, isFiring: boolean): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    for (const [type, cell] of this.weaponCells) {
      const entry = tank?.inventory[type];
      const unlimited = entry?.unlimited ?? false;
      const count = entry?.count ?? 0;
      const depleted = !unlimited && count <= 0; // out of ammo
      const owned = unlimited || count > 0;
      // Owned-only: show a button only for weapons the tank actually holds, plus
      // whatever is currently selected (never orphan the active selection). This
      // keeps the strip compact and scales as weapons are added.
      const selected = !!tank && tank.selectedWeapon === type;
      const visible = owned || selected;
      cell.el.classList.toggle('st-hud__weapon-btn--hidden', !visible);
      cell.ammo.textContent = unlimited ? AMMO_UNLIMITED_GLYPH : `${count}`;
      cell.el.classList.toggle('st-hud__weapon-btn--active', selected);
      cell.el.classList.toggle('st-hud__weapon-btn--depleted', depleted);
      // Disable while firing, when no active tank, or when depleted, so a click
      // cannot emit a select for an unusable weapon. (Engine still re-validates;
      // this is UX only.)
      cell.el.disabled = isFiring || !tank || depleted;
    }
    // Sync touch-aim strip: fire disabled while firing/no tank; weapon label = current weapon.
    const canAct = !isFiring && !!tank && state.phase === 'PLAYER_TURN';
    this.touchFireBtnEl.disabled = !canAct;
    this.touchWeaponBtnEl.disabled = !canAct;
    const weaponName = tank ? (WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon) : 'Weapon';
    const touchWeaponLabel = `⇄\n${weaponName}`;
    if (this.touchWeaponBtnEl.textContent !== touchWeaponLabel) {
      this.touchWeaponBtnEl.textContent = touchWeaponLabel;
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
   * Explicitly hide BOTH end-of-game overlays (the GAME_OVER winner panel and the
   * ROUND_OVER shop) and reset their "shown" guards. syncOverlay/syncRoundOver only
   * hide these while the render loop is running, so once a game is torn down (quit to
   * menu / restart) nothing else would clear a lingering "{winner} wins!" banner — it
   * would bleed over the lobby. Called from the game teardown path (#13). Idempotent.
   */
  hideEndScreens(): void {
    this.overlayEl.classList.add('st-hud__overlay--hidden');
    this.overlayShown = false;
    this.roundOverEl.classList.add('st-hud__overlay--hidden');
    this.roundOverShown = false;
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
      const locked = def.armsLevel > this.armsLevel;
      cell.owned.textContent = locked ? `🔒 Lv ${def.armsLevel}` : slot ? `have ${slot.count}` : '';
      cell.buyBtn.disabled = !tank || locked || tank.credits < def.price;
    }
    for (const [key, cell] of this.roundOverAccessoryCells) {
      const acc = ACCESSORIES[key];
      const locked = acc.armsLevel > this.armsLevel;
      cell.owned.textContent = locked
        ? `🔒 Lv ${acc.armsLevel}`
        : key === 'battery'
          ? `cap ${tank?.powerCap ?? 100}`
          : '';
      cell.buyBtn.disabled = !tank || locked || tank.credits < acc.price;
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
    // SECURITY: playerName is peer-controlled in networked play (server-validated
    // only for non-empty/len/uniqueness, NOT for HTML). Escape every interpolated
    // value so a name like `<svg/onload=…>` renders as inert text, not live markup.
    const esc = (s: string): string =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      );
    const cell = (text: string, cls: string): string => `<span class="${cls}">${esc(text)}</span>`;
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

  /** Create an SVG element with the correct namespace and a fixed viewBox. */
  private static makeSvg(w: number, h: number): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(h));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return svg;
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
  padding: 4px 8px;
  border-radius: 5px;
  background:
    linear-gradient(90deg, rgba(255, 210, 63, 0.055), rgba(12, 7, 22, 0.68) 32%),
    rgba(12, 7, 22, 0.62);
  border: 1px solid rgba(255, 210, 63, 0.18);
  font-size: 13px;
  transition: box-shadow 160ms ease, background 160ms ease, opacity 220ms ease;
}
.st-hud__player--active {
  background:
    linear-gradient(90deg, rgba(255, 210, 63, 0.16), rgba(142, 47, 83, 0.42) 42%, rgba(12, 7, 22, 0.72)),
    rgba(142, 47, 83, 0.42);
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold), 0 0 14px rgba(255, 210, 63, 0.38), inset 0 0 18px rgba(255, 122, 31, 0.10);
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
.st-hud__weapon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(255, 210, 63, 0.07), rgba(12, 7, 22, 0.62) 46%),
    rgba(12, 7, 22, 0.55);
  border: 1px solid rgba(255, 210, 63, 0.20);
  font-size: 13px;
}
.st-hud__menu {
  width: 100%;
  pointer-events: auto;
  cursor: pointer;
  padding: 7px 10px;
  border: 1px solid rgba(255, 210, 63, 0.38);
  border-radius: 5px;
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.08), rgba(12, 7, 22, 0.76));
  color: var(--text-gold);
  font-family: var(--font-sans);
  font-size: 12px;
  letter-spacing: 0.5px;
  transition: background 130ms ease, border-color 130ms ease;
}
.st-hud__menu:hover { background: rgba(255, 122, 31, 0.3); border-color: var(--ember); }
.st-hud__weapon-label {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 10px;
}
.st-hud__weapon-value {
  font-family: var(--font-display);
  font-weight: bold;
  letter-spacing: 0.5px;
  color: var(--gold);
}
.st-hud__controls {
  position: absolute;
  top: 14px;
  left: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  width: 168px;
  box-sizing: border-box;
  padding: 8px 9px 9px;
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(22, 13, 46, 0.54), rgba(12, 7, 22, 0.68)),
    rgba(12, 7, 22, 0.62);
  border: 1px solid rgba(255, 210, 63, 0.14);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22), inset 0 0 14px rgba(255, 122, 31, 0.04);
  color: rgba(233, 228, 242, 0.76);
  font-size: 10px;
  line-height: 1.45;
  letter-spacing: 0.02em;
}
.st-hud__controls::before {
  content: 'Commands';
  grid-column: 1 / -1;
  margin-bottom: 2px;
  padding-bottom: 3px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.14);
  color: var(--text-dim);
  font-family: var(--font-display);
  font-size: 8px;
  letter-spacing: 2px;
  text-align: center;
  text-transform: uppercase;
}
.st-hud__control-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 30px;
  min-width: 0;
  padding: 4px 2px;
  border: 1px solid rgba(255, 210, 63, 0.10);
  border-radius: 4px;
  background: rgba(255, 210, 63, 0.035);
  text-align: center;
}
.st-hud__keypair {
  display: flex;
  justify-content: center;
  gap: 3px;
  width: 100%;
  min-width: 0;
}
.st-hud__controls kbd {
  display: inline-block;
  min-width: 12px;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(255, 210, 63, 0.18);
  border: 1px solid rgba(255, 210, 63, 0.18);
  color: var(--text-gold);
  font-family: var(--font-mono);
  font-size: 8.5px;
  text-align: center;
}
.st-hud__aim {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.55);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-gold);
}
.st-hud__aim-text { white-space: nowrap; }
.st-hud__strip {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 9px 8px;
  background:
    linear-gradient(180deg, rgba(255, 210, 63, 0.045), rgba(12, 7, 22, 0.55)),
    rgba(12, 7, 22, 0.5);
  border: 1px solid rgba(255, 210, 63, 0.18);
  border-radius: 6px;
  pointer-events: auto;
}
.st-hud__strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.st-hud__strip-title {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.st-hud__strip-toggle {
  pointer-events: auto;
  cursor: pointer;
  flex: 0 0 auto;
  min-width: 22px;
  min-height: 22px;
  padding: 0 4px;
  border: 1px solid rgba(255, 210, 63, 0.22);
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.7);
  color: var(--text-gold);
  font-size: 11px;
  line-height: 1;
}
.st-hud__strip-toggle:hover { border-color: var(--gold); color: var(--gold); }
.st-hud__strip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
/* Collapsed: fold the button grid away, keep the header + toggle. */
.st-hud__strip--collapsed .st-hud__strip-grid { display: none; }
/* Owned-only: hide weapons the tank doesn't hold (and isn't aiming with).
 * Compound selector (0,0,2,0) so it outranks the base .st-hud__weapon-btn
 * display:flex regardless of source order. */
.st-hud__weapon-btn.st-hud__weapon-btn--hidden { display: none; }
.st-hud__weapon-btn {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 9px;
  border: 1px solid rgba(255, 210, 63, 0.18);
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(255, 210, 63, 0.035), rgba(12, 7, 22, 0.74)),
    rgba(12, 7, 22, 0.7);
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
  background:
    linear-gradient(180deg, rgba(255, 210, 63, 0.22), rgba(255, 122, 31, 0.12)),
    rgba(12, 7, 22, 0.78);
  box-shadow: 0 0 0 1px var(--gold), 0 0 12px rgba(255, 210, 63, 0.42);
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
  padding: 9px 10px;
  margin-top: 4px;
  border: 1px solid rgba(122, 215, 255, 0.46);
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(122, 215, 255, 0.08), rgba(12, 7, 22, 0.70)),
    rgba(12, 7, 22, 0.7);
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

/* ===== Touch-aim strip (M2 mobile) ===================================== */
/* Hidden on precise-pointer (mouse) devices; shown on coarse (touch). */
.st-hud__touch-strip {
  display: none;
  /* Push to the bottom of the #hud flex column by consuming leftover space above. */
  margin-top: auto;
  width: 100%;
  flex-shrink: 0;
  gap: 4px;
  padding: 6px 8px;
  box-sizing: border-box;
  background: rgba(12, 7, 22, 0.88);
  border-top: 1px solid rgba(255, 210, 63, 0.22);
  pointer-events: auto;
  /* Prevent touch gestures (scroll, pinch) hijacking button presses. */
  touch-action: none;
}
@media (pointer: coarse) {
  .st-hud__touch-strip { display: flex; }
}
.st-hud__touch-btn {
  flex: 1;
  cursor: pointer;
  /* 52px ensures ~40px effective height even at 0.78× game scale on phones. */
  min-height: 52px;
  padding: 4px 2px;
  border: 1px solid rgba(255, 210, 63, 0.28);
  border-radius: 6px;
  background: rgba(12, 7, 22, 0.82);
  color: var(--text-gold);
  font-family: var(--font-sans);
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
  white-space: pre-line;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  transition: background 60ms ease;
}
.st-hud__touch-btn:active:not(:disabled) { background: rgba(255, 122, 31, 0.32); }
.st-hud__touch-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.st-hud__touch-weapon {
  border-color: rgba(122, 215, 255, 0.4);
  color: var(--tank-blue-lite, #7ad7ff);
}
.st-hud__touch-fire {
  background: rgba(142, 47, 83, 0.55);
  border-color: var(--ember);
  color: var(--text);
  font-weight: bold;
  font-size: 13px;
  flex: 1.4;
}
.st-hud__touch-fire:active:not(:disabled) { background: rgba(212, 86, 42, 0.65); }

/* ===== Coarse-pointer (touch) overrides ================================ */
/* Enlarge interactive targets to ≥44px and hide the keyboard legend. */
@media (pointer: coarse) {
  .st-hud__controls { display: none; }
  .st-hud__weapon-btn { min-height: 44px; }
  .st-hud__strip-toggle { min-width: 44px; min-height: 44px; }
  .st-hud__store-buy  { min-height: 44px; }
  .st-hud__restart    { min-height: 48px; padding-top: 12px; padding-bottom: 12px; }
  .st-hud__menu       { min-height: 44px; }
  .st-hud__store-btn  { min-height: 44px; }
  .st-hud__store-close { min-height: 44px; }
  .st-hud__turnwatch-leave { min-height: 44px; padding: 0 14px; }
}

/* ===== Cockpit instrument cluster (#44) ================================ */
/* A single bordered panel holding three SVG gauges in a row. All sizing is
 * box-sizing:border-box and width:100% so nothing overflows the 264px panel. */
.st-hud__instruments {
  box-sizing: border-box;
  width: 100%;
  padding: 9px 9px 10px;
  background:
    radial-gradient(90% 80% at 50% 0%, rgba(255, 210, 63, 0.10), rgba(255, 210, 63, 0) 58%),
    linear-gradient(180deg, rgba(28, 16, 50, 0.88), rgba(12, 7, 22, 0.76));
  border: 1px solid rgba(255, 210, 63, 0.40);
  border-radius: 8px;
  box-shadow:
    inset 0 0 16px rgba(255, 122, 31, 0.10),
    inset 0 -14px 22px rgba(0, 0, 0, 0.22),
    0 5px 16px rgba(0, 0, 0, 0.34);
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
  /* flex-shrink:0 is load-bearing. #hud is a flex column; when the touch strip
   * (coarse-pointer) pushes total content past the 600px panel, flex shrinks
   * children — and overflow:hidden zeroes this panel's automatic minimum size
   * (min-height:auto floors only overflow:visible items). Without this, the
   * cluster is the sacrificial child: it crushes to title-height and clips the
   * gauges AND the numeric readouts, leaving only "Instruments" visible on
   * phones. Opting out of shrink lets #hud's own overflow-y:auto scroll instead. */
  flex-shrink: 0;
}
.st-hud__instr-title {
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 3.2px;
  text-transform: uppercase;
  color: rgba(255, 233, 168, 0.66);
  text-align: center;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.18);
}
/* Three equal-width gauge cells in a row, no overflow. */
.st-hud__gauge-row {
  display: flex;
  flex-direction: row;
  gap: 4px;
  width: 100%;
  overflow: hidden;
}
.st-hud__gauge-cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.st-hud__gauge-cell-title {
  font-family: var(--font-display);
  font-size: 8px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: center;
}
/* SVG gauge shared element styles — referenced by SVG class attributes. */
.st-hud__gauge-track {
  fill: none;
  stroke: rgba(255, 210, 63, 0.18);
  stroke-width: 3;
  stroke-linecap: round;
}
.st-hud__gauge-track-rect {
  fill: rgba(255, 210, 63, 0.12);
  stroke: rgba(255, 210, 63, 0.22);
  stroke-width: 1;
}
.st-hud__gauge-ticks {
  fill: none;
  stroke: rgba(255, 210, 63, 0.35);
  stroke-width: 1;
  stroke-linecap: round;
}
.st-hud__gauge-pivot {
  fill: var(--gold);
}
.st-hud__gauge-needle {
  stroke: var(--gold);
  stroke-width: 2;
  stroke-linecap: round;
}
/* Wind marker (rotated rect) */
.st-hud__gauge-needle-rect {
  fill: var(--gold);
}
/* Power arc fill: gold→ember gradient effect via a single stroke color;
 * stroke-dasharray is set per-frame via JS. */
.st-hud__gauge-power-fill {
  fill: none;
  stroke: var(--ember);
  stroke-width: 4;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px rgba(255, 122, 31, 0.6));
}
/* On-gauge numeric labels: monospace, small, gold. */
.st-hud__gauge-label {
  fill: var(--text-gold);
  font-family: var(--font-mono);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}
.st-hud__gauge-label--lg {
  font-size: 11px;
  fill: var(--gold);
  font-weight: bold;
}
/* ── Mobile numeric readouts (coarse-pointer alternative to the dials) ──────
 * The analog dials' 1–3px gold strokes go sub-pixel and vanish when #app is
 * zoom-scaled down on a phone (leaving only the bold "Instruments" title
 * legible). On touch devices we hide the dials and show these bold numbers
 * instead. Hidden by default so fine-pointer (desktop) keeps the dials. */
.st-hud__gauge-nums {
  display: none;
  gap: 4px;
  width: 100%;
}
.st-hud__gauge-num {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 3px 2px;
  background: rgba(255, 210, 63, 0.06);
  border-radius: 4px;
}
.st-hud__gauge-num-title {
  font-family: var(--font-display);
  font-size: 8px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.st-hud__gauge-num-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: bold;
  color: var(--text-gold);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  white-space: nowrap;
}
/* Dials -> numeric readouts is driven by the ACTUAL HUD scale, not pointer type:
 * main.ts flags #app.is-compact when the zoom drops below the dial-legibility
 * threshold, so small / remote FINE-pointer windows get numerics too, not just
 * touch devices (a pointer test left those users staring at dissolved dials).
 * The compound #app.is-compact selector easily outranks the base display rules. */
#app.is-compact .st-hud__gauge-row  { display: none; }
#app.is-compact .st-hud__gauge-nums { display: flex; }
/* On touch devices, lift the touch controls up to sit right after the players
 * list (before the instruments) instead of being pinned to the bottom of the
 * scrollable panel. Every child from instruments onward gets order:1; the touch
 * strip keeps the default order:0, so (being the last DOM child of #hud) it
 * renders at the end of the order:0 group: after menu/round/players. */
@media (pointer: coarse) {
  .st-hud__touch-strip { margin-top: 0; }
  .st-hud__instruments,
  .st-hud__active-row,
  .st-hud__aim,
  .st-hud__store-btn,
  .st-hud__strip { order: 1; }
}
/* Active player + weapon row (below the cluster). */
.st-hud__active-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
  /* Same flex-crush guard as .st-hud__instruments: this is the only other #hud
   * flex child with overflow:hidden, so without it the name/weapon row is the
   * next element squeezed to zero when the panel content overflows on touch. */
  flex-shrink: 0;
}
.st-hud__active-row--hidden { display: none; }
/* The aim strip is only shown during "Sending..." (firing state). */
.st-hud__aim--hidden { display: none; }
/* Gauges are reduced-motion-safe by construction: needle/marker/fill are driven by
   direct attribute mutation (transform / stroke-dasharray) with no CSS transition,
   so they snap to each new value instantly — there is nothing to suppress. */
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

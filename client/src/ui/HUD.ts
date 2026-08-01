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
import { resolveInitialArsenalCollapsed } from './arsenalPreference';
import { makeHudGlyph, makeHudIcon } from './hudIcons';
import { makeWeaponIcon } from './weaponIcons';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../renderer/TankLoadoutPreview';
import { tankLoadoutAccessibleLabel } from './tankPartLabels';
import type { FirstSalvoStep } from './firstSalvoCoach';

/**
 * What a store Buy click requests: exactly one of a weapon bundle or an accessory, mirroring the
 * engine's `BuyAction` "exactly one of weapon/accessory" invariant. The HUD emits this and the
 * caller (main.ts) forwards it verbatim into a `buy` action — so the store stays decoupled from the
 * action/transport layer.
 */
export type StorePurchase = { weapon?: WeaponType; accessory?: AccessoryType };

/** Accessories sold in the store, in stable catalog order. */
const STORE_ACCESSORIES: AccessoryType[] = Object.keys(ACCESSORIES) as AccessoryType[];

/**
 * Weapons shown in the strip: only `implemented` ones, in stable WeaponSystem
 * key order. This MUST stay literally identical to InputHandler's
 * IMPLEMENTED_WEAPONS predicate+order so the active-highlight tracks Q
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
function readStoredArsenalPreference(): string | null {
  try {
    return localStorage.getItem(ARSENAL_COLLAPSED_KEY);
  } catch {
    return null;
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
  /** Per-document suffix for unique aria-controls relationships in remounted HUDs. */
  private static arsenalDrawerSequence = 0;

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

  /** Local-only coach callbacks. Task 3 observes actions and owns progression/persistence. */
  private firstSalvoSkipCb: (() => void) | null = null;
  private firstSalvoReplayCb: (() => void) | null = null;
  private firstSalvoStep: FirstSalvoStep | null = null;

  // Coarse-pointer command callbacks. Invoked by the on-screen dock buttons;
  // main.ts wires these to InputHandler's public step methods.
  private touchAngleCb: ((delta: number) => void) | null = null;
  private touchPowerCb: ((delta: number) => void) | null = null;
  private touchWeaponCb: (() => void) | null = null;
  /** Callback fired by the shared rail action (projectile fire or shield activation). */
  private primaryActionCb: (() => void) | null = null;
  /** Callback fired by one semantic mobility-rocker activation. */
  private moveCb: ((delta: number) => void) | null = null;

  /** Whether the store panel is currently open. */
  private storeOpen = false;

  /** Whether the static DOM scaffold has been built yet. */
  private built = false;

  // Cached node references (populated by `build()`).
  private playersEl!: HTMLElement;
  private weaponValueEl!: HTMLElement;
  private aimEl!: HTMLElement;
  /** Aim readout sub-node: pending / flight / resolving progress text. */
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
  private stripToggleLabelEl!: HTMLElement;
  private stripCollapsed = false;
  private storeBtnEl!: HTMLButtonElement;
  private storeBtnLabelEl!: HTMLElement;
  private commandConsoleEl!: HTMLElement;
  private turnActionsEl!: HTMLElement;
  private primaryActionBtnEl!: HTMLButtonElement;
  private primaryActionLabelEl!: HTMLElement;
  private firstSalvoEl!: HTMLElement;
  private firstSalvoProgressEl!: HTMLElement;
  private firstSalvoCopyEl!: HTMLElement;
  private firstSalvoStatusEl!: HTMLElement;
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
  // Active-player name row (replaces old aimTextEl player portion):
  private activePlayerEl!: HTMLElement;
  private turnStatusEl!: HTMLElement;
  private turnOwnerEl!: HTMLElement;
  private tankPortraitEl!: HTMLCanvasElement;
  private tankPortraitSignature: string | null = null;
  private weaponIconEl!: HTMLElement;
  private selectedWeaponIconType: WeaponType | null = null;
  private moveLeftBtnEl!: HTMLButtonElement;
  private moveRightBtnEl!: HTMLButtonElement;
  private fuelValueEl!: HTMLElement;
  private fuelMeterEl!: HTMLElement;
  /** Last turn actually presented in the owner row; resets between games. */
  private lastPresentedTurnKey: string | null = null;

  // Coarse-pointer dock: weapon button needs per-frame sync.
  private touchStripEl!: HTMLElement;
  private touchWeaponBtnEl!: HTMLButtonElement;
  private touchWeaponLabelEl!: HTMLElement;
  private touchMoveLeftBtnEl!: HTMLButtonElement;
  private touchMoveRightBtnEl!: HTMLButtonElement;
  private touchMenuBtnEl!: HTMLButtonElement;
  private touchCommandBtns: HTMLButtonElement[] = [];

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

  /** Register the local-only First Salvo dismissal callback. */
  onFirstSalvoSkip(cb: () => void): void {
    this.firstSalvoSkipCb = cb;
  }

  /** Register the pause-panel callback that restarts First Salvo for the current match. */
  onFirstSalvoReplay(cb: () => void): void {
    this.firstSalvoReplayCb = cb;
  }

  /**
   * Present one local coach step without touching the game client or action log.
   * Repeating the same value is intentionally a no-op because callers may report
   * the same frame state on every animation frame.
   */
  setFirstSalvoStep(step: FirstSalvoStep | null): void {
    if (this.firstSalvoStep === step) return;
    this.firstSalvoStep = step;
    if (this.built) this.syncFirstSalvo();
  }

  /**
   * Set the room's arms level (0–4) so the store can show above-level weapons/accessories as locked.
   * UI-only: the engine independently enforces the same gate in `applyBuy`, so a stale or unset value
   * never causes a desync — it only changes which rows LOOK buyable. Called once at game creation.
   */
  setArmsLevel(level: number): void {
    this.armsLevel = level;
  }

  // Coarse-pointer command registrations.
  onTouchAngle(cb: (delta: number) => void): void { this.touchAngleCb = cb; }
  onTouchPower(cb: (delta: number) => void): void { this.touchPowerCb = cb; }
  onTouchWeapon(cb: () => void): void { this.touchWeaponCb = cb; }
  /** Register the shared Fire / Activate shield action. */
  onPrimaryAction(cb: () => void): void { this.primaryActionCb = cb; }
  /** Register one bounded left/right movement commitment. */
  onMove(cb: (delta: number) => void): void { this.moveCb = cb; }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(state: GameState, isFiring = false, canControl = true): void {
    if (!this.built) this.build();

    const hasActiveTurn = state.phase === 'PLAYER_TURN' ||
      state.phase === 'FIRING' ||
      state.phase === 'RESOLVING';
    const activeTank = state.tanks.find((tank) => tank.id === state.activePlayerId);
    const validActiveId = hasActiveTurn && activeTank?.alive
      ? state.activePlayerId
      : null;
    const presentedTurnKey = validActiveId !== null &&
      state.phase === 'PLAYER_TURN' &&
      !isFiring
      ? `${state.round}:${state.turn}:${validActiveId}`
      : null;
    const isHandoff = presentedTurnKey !== null &&
      presentedTurnKey !== this.lastPresentedTurnKey;
    this.syncRound(state);
    this.syncPlayers(state, isHandoff);
    this.syncWind(state.wind);
    this.syncAim(state, isFiring, isHandoff);
    this.syncMobility(state, isFiring, canControl);
    this.syncStrip(state, isFiring, canControl);
    this.syncStore(state);
    this.syncRoundOver(state);
    this.syncOverlay(state);
    if (presentedTurnKey !== null) this.lastPresentedTurnKey = presentedTurnKey;
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
    this.root.classList.add('st-hud', 'st-ui-shell');
    this.root.dataset['ui'] = 'combat-rail';
    this.root.innerHTML = '';

    this.buildPlayers();
    this.buildRound();
    const instruments = this.buildInstrumentCluster();
    this.buildActiveRow();
    const controls = this.buildControlsLegend();
    this.buildArsenal();
    this.buildStore();
    this.buildTurnActions();
    this.buildCommandConsole();
    this.buildEndScreens();
    this.buildRoundShop();
    const menu = this.buildMenu();
    this.buildLiveness();
    this.buildTouchStrip();
    this.buildFirstSalvoCoach();

    this.root.append(
      menu,
      this.roundEl,
      this.playersEl,
      instruments,
      this.commandConsoleEl,
      this.stripEl,
    );
    // buildArsenal resolves the persisted state before the rail children exist;
    // re-apply it now so a stored-open drawer also isolates covered controls.
    this.applyStripCollapsed();
    // Pointer-specific command surfaces share the upper-left sky position. CSS
    // shows the keyboard deck on fine pointers and the interactive dock on coarse
    // pointers, preserving the narrow rail for live telemetry.
    this.overlayRoot.append(
      controls,
      this.touchStripEl,
      this.connBannerEl,
      this.toastEl,
      this.turnWatchEl,
      this.firstSalvoEl,
    );
    this.modalRoot.append(this.storeEl, this.overlayEl, this.roundOverEl, this.pauseEl);
    this.built = true;
    this.syncFirstSalvo();
  }

  /** Player health-bar column (top-left). */
  private buildPlayers(): void {
    // Player health-bar column (top-left).
    this.playersEl = document.createElement('div');
    this.playersEl.className = 'st-hud__players st-ui-section st-ui-section--roster';
  }

  /** Round indicator (side panel): "Round N of M". */
  private buildRound(): void {
    // Round indicator (side panel): "Round N of M" — hidden in single-round matches.
    this.roundEl = document.createElement('div');
    this.roundEl.className =
      'st-hud__round st-hud__round--hidden st-ui-section st-ui-section--round';
  }

  /** Responsive analog fire-control console (#44). */
  private buildInstrumentCluster(): HTMLElement {
    // One inset console with large elevation/power dials and a wide wind rail.
    // All volatile geometry remains driven by the pure gaugeMath helpers.

    const instruments = document.createElement('div');
    instruments.className =
      'st-hud__instruments st-ui-section st-ui-section--instrument';
    const instrTitle = document.createElement('div');
    instrTitle.className = 'st-hud__instr-title';
    instrTitle.textContent = 'Ballistic Computer';

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
    elevCell.className = 'st-hud__gauge-cell st-hud__gauge-cell--elevation';
    elevCell.dataset['firstSalvoTarget'] = 'aim';
    const elevCellTitle = document.createElement('div');
    elevCellTitle.className = 'st-hud__gauge-cell-title';
    elevCellTitle.textContent = 'Elevation';
    elevCell.append(elevCellTitle, elevSvg);

    // ── Wind gauge (horizontal center-zero track) ──
    // Wide center-zero rail. The marker traverses 116px while remaining in-frame.
    const windSvg = HUD.makeSvg(144, 52);
    windSvg.setAttribute('aria-label', 'Wind gauge');
    // Track background bar
    const windTrack = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    windTrack.setAttribute('x', '8');
    windTrack.setAttribute('y', '18');
    windTrack.setAttribute('width', '128');
    windTrack.setAttribute('height', '6');
    windTrack.setAttribute('rx', '3');
    windTrack.setAttribute('class', 'st-hud__gauge-track-rect');
    // Center tick
    const windCenter = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windCenter.setAttribute('x1', '72');
    windCenter.setAttribute('y1', '14');
    windCenter.setAttribute('x2', '72');
    windCenter.setAttribute('y2', '30');
    windCenter.setAttribute('class', 'st-hud__gauge-ticks');
    // End ticks
    const windTickL = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windTickL.setAttribute('x1', '8'); windTickL.setAttribute('y1', '16');
    windTickL.setAttribute('x2', '8'); windTickL.setAttribute('y2', '28');
    windTickL.setAttribute('class', 'st-hud__gauge-ticks');
    const windTickR = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    windTickR.setAttribute('x1', '136'); windTickR.setAttribute('y1', '16');
    windTickR.setAttribute('x2', '136'); windTickR.setAttribute('y2', '28');
    windTickR.setAttribute('class', 'st-hud__gauge-ticks');
    // Moving marker (diamond shape via rect rotated 45°, centered on track center y=25)
    this.gaugeWindMarker = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
    this.gaugeWindMarker.setAttribute('x', '68');
    this.gaugeWindMarker.setAttribute('y', '18');
    this.gaugeWindMarker.setAttribute('width', '8');
    this.gaugeWindMarker.setAttribute('height', '8');
    this.gaugeWindMarker.setAttribute('rx', '1');
    this.gaugeWindMarker.setAttribute('transform', 'rotate(45, 72, 22)');
    this.gaugeWindMarker.setAttribute('class', 'st-hud__gauge-needle-rect');
    // Label
    this.gaugeWindLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text') as SVGTextElement;
    this.gaugeWindLabel.setAttribute('x', '72');
    this.gaugeWindLabel.setAttribute('y', '46');
    this.gaugeWindLabel.setAttribute('text-anchor', 'middle');
    this.gaugeWindLabel.setAttribute('class', 'st-hud__gauge-label');
    this.gaugeWindLabel.textContent = '• 0.0';
    windSvg.append(windTrack, windTickL, windTickR, windCenter, this.gaugeWindMarker, this.gaugeWindLabel);
    const windCell = document.createElement('div');
    windCell.className = 'st-hud__gauge-cell st-hud__gauge-cell--wind';
    windCell.dataset['firstSalvoTarget'] = 'power-and-wind';
    const windCellTitle = document.createElement('div');
    windCellTitle.className = 'st-hud__gauge-cell-title';
    windCellTitle.textContent = 'Wind Vector';
    windCell.append(windCellTitle, windSvg);

    // ── Power gauge (arc fill driven by stroke-dasharray) ──
    // Match the elevation dial's 72×56 frame, center, radius, and semicircle so
    // the two primary controls read as one balanced instrument pair.
    const pwrSvg = HUD.makeSvg(72, 56);
    pwrSvg.setAttribute('aria-label', 'Power gauge');
    const PWR_R = 30;
    const PWR_CX = 36;
    const PWR_CY = 40;
    const pwrArcD = 'M 6 40 A 30 30 0 0 1 66 40';
    const PWR_ARC_LEN = Math.PI * PWR_R;
    // Track (full arc, dim)
    const pwrTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pwrTrack.setAttribute('d', pwrArcD);
    pwrTrack.setAttribute('class', 'st-hud__gauge-track');
    const pwrTicks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pwrTicks.setAttribute('class', 'st-hud__gauge-ticks');
    for (const deg of [0, 45, 90, 135, 180]) {
      const rad = ((180 - deg) * Math.PI) / 180;
      const x1 = PWR_CX + PWR_R * Math.cos(rad);
      const y1 = PWR_CY - PWR_R * Math.sin(rad);
      const x2 = PWR_CX + (PWR_R - 5) * Math.cos(rad);
      const y2 = PWR_CY - (PWR_R - 5) * Math.sin(rad);
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      pwrTicks.append(tick);
    }
    // Fill arc (same path, stroke-dasharray driven by gaugeFraction × ARC_LEN)
    this.gaugePowerArc = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    this.gaugePowerArc.setAttribute('d', pwrArcD);
    this.gaugePowerArc.setAttribute('stroke-dasharray', `0 ${PWR_ARC_LEN.toFixed(2)}`);
    this.gaugePowerArc.setAttribute('class', 'st-hud__gauge-power-fill');
    // Store arc length as data attribute for frame updates
    this.gaugePowerArc.dataset['arcLen'] = String(PWR_ARC_LEN.toFixed(4));
    // End-cap dot at start position (low end)
    const pwrDotL = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pwrDotL.setAttribute('cx', '6');
    pwrDotL.setAttribute('cy', '40');
    pwrDotL.setAttribute('r', '2.5');
    pwrDotL.setAttribute('class', 'st-hud__gauge-pivot');
    const pwrDotR = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pwrDotR.setAttribute('cx', '66');
    pwrDotR.setAttribute('cy', '40');
    pwrDotR.setAttribute('r', '2.5');
    pwrDotR.setAttribute('class', 'st-hud__gauge-pivot');
    // Numeric label
    this.gaugePowerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text') as SVGTextElement;
    this.gaugePowerLabel.setAttribute('x', '36');
    this.gaugePowerLabel.setAttribute('y', '52');
    this.gaugePowerLabel.setAttribute('text-anchor', 'middle');
    this.gaugePowerLabel.setAttribute('class', 'st-hud__gauge-label st-hud__gauge-label--lg');
    this.gaugePowerLabel.textContent = '0';
    pwrSvg.append(
      pwrTrack,
      pwrTicks,
      this.gaugePowerArc,
      pwrDotL,
      pwrDotR,
      this.gaugePowerLabel,
    );
    const pwrCell = document.createElement('div');
    pwrCell.className = 'st-hud__gauge-cell st-hud__gauge-cell--power';
    pwrCell.dataset['firstSalvoTarget'] = 'power-and-wind';
    const pwrCellTitle = document.createElement('div');
    pwrCellTitle.className = 'st-hud__gauge-cell-title';
    pwrCellTitle.textContent = 'Power';
    pwrCell.append(pwrCellTitle, pwrSvg);

    // Assemble the instrument cluster row
    const gaugeRow = document.createElement('div');
    gaugeRow.className = 'st-hud__gauge-row';
    gaugeRow.append(elevCell, pwrCell, windCell);

    instruments.append(instrTitle, gaugeRow);
    return instruments;
  }

  /** Active-player + weapon readout row, plus shot-progress status. */
  private buildActiveRow(): void {
    // ── Active player + weapon name row (replaces aim text + old wind/weapon blocks) ──
    // This shows "PlayerName  ·  WeaponName" in one compact row. It persists below the
    // gauges and is hidden while the shot-progress status is shown.
    this.activePlayerEl = document.createElement('div');
    this.activePlayerEl.className = 'st-hud__active-row';
    this.turnStatusEl = document.createElement('div');
    this.turnStatusEl.className = 'st-hud__turn-status';
    this.turnStatusEl.setAttribute('role', 'status');
    this.turnStatusEl.setAttribute('aria-live', 'polite');
    this.turnStatusEl.setAttribute('aria-atomic', 'true');
    this.turnStatusEl.setAttribute('aria-label', 'No active turn.');
    // aimEl announces transport, flight, and resolution progress without changing
    // the compact rail's height.
    this.aimEl = document.createElement('div');
    this.aimEl.className = 'st-hud__aim';
    this.aimEl.setAttribute('role', 'status');
    this.aimEl.setAttribute('aria-live', 'polite');
    this.aimEl.setAttribute('aria-atomic', 'true');
    this.aimEl.setAttribute('aria-label', 'No shot in progress.');
    this.aimTextEl = document.createElement('span');
    this.aimTextEl.className = 'st-hud__aim-text';
    this.aimEl.append(this.aimTextEl);
    this.aimEl.classList.add('st-hud__aim--hidden');

    // Active weapon readout — kept as a text row (not a gauge; SPEC says "may be
    // repositioned"). Placed inside activePlayerEl alongside the player name.
    const owner = document.createElement('div');
    owner.className = 'st-hud__turn-identity';
    const ownerKicker = document.createElement('span');
    ownerKicker.className = 'st-hud__turn-kicker';
    ownerKicker.textContent = 'Active turn';
    this.turnOwnerEl = document.createElement('span');
    this.turnOwnerEl.className = 'st-hud__turn-owner';
    owner.append(ownerKicker, this.turnOwnerEl);
    const portraitFrame = document.createElement('div');
    portraitFrame.className = 'st-hud__tank-portrait-frame';
    this.tankPortraitEl = document.createElement('canvas');
    this.tankPortraitEl.className = 'st-hud__tank-portrait';
    this.tankPortraitEl.setAttribute('role', 'img');
    this.tankPortraitEl.setAttribute('aria-label', 'No active tank.');
    portraitFrame.append(this.tankPortraitEl);
    const identity = document.createElement('div');
    identity.className = 'st-hud__identity-lockup';
    identity.append(portraitFrame, this.turnStatusEl);

    const weapon = document.createElement('div');
    weapon.className = 'st-hud__weapon';
    this.weaponIconEl = document.createElement('span');
    this.weaponIconEl.className = 'st-hud__weapon-icon';
    this.weaponIconEl.setAttribute('aria-hidden', 'true');
    const weaponCopy = document.createElement('span');
    weaponCopy.className = 'st-hud__weapon-copy';
    const weaponLabel = document.createElement('span');
    weaponLabel.className = 'st-hud__weapon-label';
    weaponLabel.textContent = 'Weapon';
    this.weaponValueEl = document.createElement('span');
    this.weaponValueEl.className = 'st-hud__weapon-value';
    weaponCopy.append(weaponLabel, this.weaponValueEl);
    weapon.append(this.weaponIconEl, weaponCopy);

    const mobility = document.createElement('div');
    mobility.className = 'st-hud__mobility';
    mobility.setAttribute('role', 'group');
    mobility.setAttribute('aria-label', 'Tank movement');
    const makeMoveButton = (
      delta: -8 | 8,
      label: string,
      direction: string,
      key: string,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'st-hud__move-btn';
      button.dataset['move'] = String(delta);
      button.setAttribute('aria-label', label);
      const directionEl = document.createElement('span');
      directionEl.className = 'st-hud__move-direction';
      directionEl.setAttribute('aria-hidden', 'true');
      directionEl.textContent = direction;
      const keyEl = document.createElement('kbd');
      keyEl.setAttribute('aria-hidden', 'true');
      keyEl.textContent = key;
      button.append(directionEl, keyEl);
      button.addEventListener('click', () => this.moveCb?.(delta));
      return button;
    };
    this.moveLeftBtnEl = makeMoveButton(-8, 'Move tank left, 8 fuel maximum', '‹', 'A');
    this.moveRightBtnEl = makeMoveButton(8, 'Move tank right, 8 fuel maximum', '›', 'D');
    const fuel = document.createElement('div');
    fuel.className = 'st-hud__fuel';
    const fuelReadout = document.createElement('div');
    fuelReadout.className = 'st-hud__fuel-readout';
    const fuelLabel = document.createElement('span');
    fuelLabel.className = 'st-hud__fuel-label';
    fuelLabel.textContent = 'Fuel';
    this.fuelValueEl = document.createElement('span');
    this.fuelValueEl.className = 'st-hud__fuel-value';
    fuelReadout.append(this.fuelValueEl, fuelLabel);
    this.fuelMeterEl = document.createElement('div');
    this.fuelMeterEl.className = 'st-hud__fuel-meter st-hud__fuel-dial';
    this.fuelMeterEl.setAttribute('role', 'progressbar');
    this.fuelMeterEl.setAttribute('aria-label', 'Movement fuel');
    this.fuelMeterEl.setAttribute('aria-valuemin', '0');
    this.fuelMeterEl.setAttribute('aria-valuemax', '100');
    this.fuelMeterEl.append(fuelReadout);
    fuel.append(this.fuelMeterEl);
    mobility.append(this.moveLeftBtnEl, fuel, this.moveRightBtnEl);

    const tactical = document.createElement('div');
    tactical.className = 'st-hud__tactical-row';
    tactical.append(weapon, mobility);

    // Identity owns the full primary row. Weapon, fuel, and movement share a
    // separate tactical row instead of competing with and truncating the player.
    this.turnStatusEl.append(owner);
    this.activePlayerEl.append(identity, tactical);
  }

  /** Fine-pointer command deck (upper-left overlay; built once). */
  private buildControlsLegend(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'st-hud__controls';
    controls.setAttribute('role', 'region');
    controls.setAttribute('aria-label', 'Keyboard commands');
    controls.dataset['ui'] = 'command-deck';

    const header = document.createElement('div');
    header.className = 'st-hud__controls-header';
    const title = document.createElement('span');
    title.className = 'st-hud__controls-title';
    title.textContent = 'Command Deck';
    const mode = document.createElement('span');
    mode.className = 'st-hud__controls-mode';
    mode.textContent = 'Keyboard';
    header.append(title, mode);

    const grid = document.createElement('div');
    grid.className = 'st-hud__control-grid';
    const definitions = [
      { command: 'aim', label: 'Aim', glyph: 'aim', keys: ['←', '→'] },
      { command: 'power', label: 'Power', glyph: 'power', keys: ['↑', '↓'] },
      { command: 'move', label: 'Move', glyph: 'move', keys: ['A', 'D'] },
      { command: 'weapon', label: 'Weapon', glyph: 'weapon', keys: ['Q'] },
      { command: 'fire', label: 'Fire', glyph: 'fire', keys: ['Space', 'Enter'], primary: true },
    ] as const;
    for (const definition of definitions) {
      const cell = document.createElement('div');
      cell.className = 'st-hud__control-cell';
      if ('primary' in definition) cell.classList.add('st-hud__control-cell--primary');
      cell.dataset['command'] = definition.command;
      const label = document.createElement('span');
      label.className = 'st-hud__control-label';
      label.textContent = definition.label;
      const keypair = document.createElement('span');
      keypair.className = 'st-hud__keypair';
      for (const key of definition.keys) {
        const hint = document.createElement('kbd');
        hint.textContent = key;
        keypair.append(hint);
      }
      cell.append(makeHudGlyph(definition.glyph, 15), label, keypair);
      grid.append(cell);
    }
    controls.append(header, grid);
    return controls;
  }

  /** Weapon strip ("Arsenal"): collapsible grid of per-weapon buttons. */
  private buildArsenal(): void {
    // Weapon strip (bottom-left): a framed "Arsenal" panel with a titled header
    // and a 2-column grid of buttons, each showing name + live ammo count.
    // Listeners attached ONCE here.
    this.stripEl = document.createElement('div');
    this.stripEl.className =
      'st-hud__strip st-ui-section st-ui-section--arsenal';
    this.stripEl.dataset['ui'] = 'arsenal-drawer';
    // Header row: "Arsenal" title + a collapse/expand toggle. Collapsing folds the
    // grid away to reclaim vertical space (mobile especially); the state persists.
    const stripHeader = document.createElement('div');
    stripHeader.className = 'st-hud__strip-header';
    const stripTitle = document.createElement('div');
    stripTitle.className = 'st-hud__strip-title';
    const stripTitleText = document.createElement('span');
    stripTitleText.textContent = 'Arsenal';
    stripTitle.append(makeHudGlyph('arsenal', 15), stripTitleText);
    const stripToggle = document.createElement('button');
    stripToggle.type = 'button';
    stripToggle.className = 'st-hud__strip-toggle st-ui-icon-action';
    const stripToggleLabel = document.createElement('span');
    stripToggleLabel.className = 'st-hud__strip-toggle-label';
    stripToggle.append(makeHudIcon('disclosure', 16), stripToggleLabel);
    stripToggle.addEventListener('click', () => this.toggleStripCollapsed());
    stripHeader.append(stripTitle, stripToggle);
    this.stripToggleEl = stripToggle;
    this.stripToggleLabelEl = stripToggleLabel;
    const stripGrid = document.createElement('div');
    stripGrid.className = 'st-hud__strip-grid';
    stripGrid.id = `st-hud-arsenal-drawer-${HUD.arsenalDrawerSequence++}`;
    stripGrid.setAttribute('role', 'region');
    stripGrid.setAttribute('aria-label', 'Weapon arsenal');
    stripToggle.setAttribute('aria-controls', stripGrid.id);
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
      btn.append(makeWeaponIcon(type, 14), nameSpan, ammoSpan);
      // Capture `type` per-iteration (for-of/const). Listener attached once.
      btn.addEventListener('click', () => this.weaponSelectCb?.(type));
      this.weaponCells.set(type, { el: btn, ammo: ammoSpan });
      stripGrid.append(btn);
    }
    this.stripEl.append(stripHeader, stripGrid);
    this.stripEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.stripCollapsed) return;
      event.preventDefault();
      event.stopPropagation();
      this.stripCollapsed = true;
      writeArsenalCollapsed(true);
      this.applyStripCollapsed();
      this.stripToggleEl.focus();
    });
    const stored = readStoredArsenalPreference();
    this.stripCollapsed = resolveInitialArsenalCollapsed(stored);
    this.applyStripCollapsed();
  }

  /** Store toggle button (side panel) + the store modal (on the modal layer). */
  private buildStore(): void {
    // Store toggle button (side panel) + the store modal (on the canvas overlay).
    // Clicking the button opens/closes the modal; buying is wired per-row below.
    this.storeBtnEl = document.createElement('button');
    this.storeBtnEl.type = 'button';
    this.storeBtnEl.className = 'st-hud__store-btn st-ui-action';
    this.storeBtnLabelEl = document.createElement('span');
    this.storeBtnLabelEl.className = 'st-hud__store-btn-label';
    this.storeBtnEl.append(makeHudGlyph('store', 15), this.storeBtnLabelEl);
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
      const nameLine = document.createElement('div');
      nameLine.className = 'st-hud__store-name-line';
      nameLine.append(makeWeaponIcon(type, 16), nm);
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-owned';
      info.append(nameLine, owned);

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

  /** One bounded action row: economy on the left, turn commitment on the right. */
  private buildTurnActions(): void {
    this.turnActionsEl = document.createElement('div');
    this.turnActionsEl.className = 'st-hud__turn-actions';

    this.primaryActionBtnEl = document.createElement('button');
    this.primaryActionBtnEl.type = 'button';
    this.primaryActionBtnEl.className =
      'st-hud__primary-action st-ui-action';
    this.primaryActionBtnEl.dataset['firstSalvoTarget'] = 'fire';
    this.primaryActionLabelEl = document.createElement('span');
    this.primaryActionLabelEl.className = 'st-hud__primary-action-label';
    this.primaryActionBtnEl.append(
      makeHudGlyph('fire', 17),
      this.primaryActionLabelEl,
    );
    // Click deliberately owns every activation. Pointerdown would double-dispatch
    // on touch when the browser follows it with the button's semantic click.
    this.primaryActionBtnEl.addEventListener('click', () => this.primaryActionCb?.());

    this.turnActionsEl.append(this.storeBtnEl, this.primaryActionBtnEl);
  }

  /** Compact, non-blocking instruction card; local action observation stays in main.ts. */
  private buildFirstSalvoCoach(): void {
    this.firstSalvoEl = document.createElement('aside');
    this.firstSalvoEl.className = 'st-hud__first-salvo st-hud__first-salvo--hidden';
    this.firstSalvoEl.dataset['ui'] = 'first-salvo-coach';
    this.firstSalvoEl.setAttribute('role', 'region');
    this.firstSalvoEl.setAttribute('aria-label', 'First Salvo coach');

    this.firstSalvoProgressEl = document.createElement('div');
    this.firstSalvoProgressEl.className = 'st-hud__first-salvo-progress';
    this.firstSalvoCopyEl = document.createElement('div');
    this.firstSalvoCopyEl.className = 'st-hud__first-salvo-copy';
    this.firstSalvoStatusEl = document.createElement('div');
    this.firstSalvoStatusEl.className = 'st-hud__first-salvo-status';
    this.firstSalvoStatusEl.dataset['firstSalvoStatus'] = '';
    this.firstSalvoStatusEl.setAttribute('role', 'status');
    this.firstSalvoStatusEl.setAttribute('aria-live', 'polite');
    this.firstSalvoStatusEl.setAttribute('aria-atomic', 'true');

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'st-hud__first-salvo-skip';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      this.setFirstSalvoStep(null);
      this.firstSalvoSkipCb?.();
    });

    this.firstSalvoEl.append(
      this.firstSalvoProgressEl,
      this.firstSalvoCopyEl,
      this.firstSalvoStatusEl,
      skipBtn,
    );
  }

  /** Reconciles card copy and static target rings without rebuilding DOM per frame. */
  private syncFirstSalvo(): void {
    const copy = this.firstSalvoCopyFor(this.firstSalvoStep);
    this.firstSalvoEl.classList.toggle('st-hud__first-salvo--hidden', copy === null);
    for (const scope of [this.root, this.overlayRoot]) {
      for (const target of scope.querySelectorAll<HTMLElement>('[data-first-salvo-target]')) {
        target.classList.toggle(
          'st-hud__first-salvo-target--active',
          copy !== null && target.dataset['firstSalvoTarget'] === this.firstSalvoStep,
        );
      }
    }
    if (copy === null) {
      this.firstSalvoProgressEl.textContent = '';
      this.firstSalvoCopyEl.textContent = '';
      this.firstSalvoStatusEl.textContent = '';
      return;
    }
    if (this.firstSalvoProgressEl.textContent !== copy.progress) {
      this.firstSalvoProgressEl.textContent = copy.progress;
    }
    if (this.firstSalvoCopyEl.textContent !== copy.instruction) {
      this.firstSalvoCopyEl.textContent = copy.instruction;
      this.firstSalvoStatusEl.textContent = `${copy.progress}. ${copy.instruction}`;
    }
  }

  private firstSalvoCopyFor(step: FirstSalvoStep | null): {
    progress: string;
    instruction: string;
  } | null {
    switch (step) {
      case 'aim':
        return {
          progress: 'First Salvo · 1 / 3 · Aim',
          instruction: 'Set elevation with Arrow keys or the Aim controls.',
        };
      case 'power-and-wind':
        return {
          progress: 'First Salvo · 2 / 3 · Power + wind',
          instruction: 'Set Power, then read the Wind Vector before you fire.',
        };
      case 'fire':
        return {
          progress: 'First Salvo · 3 / 3 · Primary action',
          instruction: 'Use Space, Enter, or the highlighted primary action.',
        };
      default:
        return null;
    }
  }

  /** One semantic surface for identity, progress, tactics, economy, and Fire. */
  private buildCommandConsole(): void {
    this.commandConsoleEl = document.createElement('section');
    this.commandConsoleEl.className =
      'st-hud__command-console st-ui-section st-ui-section--active';
    this.commandConsoleEl.setAttribute('role', 'region');
    this.commandConsoleEl.setAttribute('aria-label', 'Turn command console');
    this.commandConsoleEl.append(
      this.activePlayerEl,
      this.aimEl,
      this.turnActionsEl,
    );
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
    const replayFirstSalvoBtn = document.createElement('button');
    replayFirstSalvoBtn.className = 'st-hud__restart st-hud__restart--ghost';
    replayFirstSalvoBtn.type = 'button';
    replayFirstSalvoBtn.textContent = 'Replay First Salvo';
    replayFirstSalvoBtn.addEventListener('click', () => {
      this.togglePause(false);
      this.firstSalvoReplayCb?.();
    });
    const pauseQuitBtn = document.createElement('button');
    pauseQuitBtn.className = 'st-hud__restart st-hud__restart--ghost';
    pauseQuitBtn.type = 'button';
    pauseQuitBtn.textContent = 'Quit to Menu';
    pauseQuitBtn.addEventListener('click', () => { this.togglePause(false); this.quitCb?.(); });
    const pauseBtns = document.createElement('div');
    pauseBtns.className = 'st-hud__overlay-btns';
    pauseBtns.append(resumeBtn, replayFirstSalvoBtn, pauseQuitBtn);
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
    menu.className = 'st-hud__menu st-ui-action st-ui-action--quiet';
    menu.setAttribute('aria-label', 'Menu');
    const label = document.createElement('span');
    label.textContent = 'Menu';
    menu.append(makeHudGlyph('menu', 14), label);
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

  /** Coarse-pointer command dock: combat steppers, weapon cycle, and menu. */
  private buildTouchStrip(): void {
    this.touchStripEl = document.createElement('div');
    this.touchStripEl.className = 'st-hud__touch-strip';
    this.touchStripEl.setAttribute('role', 'toolbar');
    this.touchStripEl.setAttribute('aria-label', 'Touch commands');

    const mkTouchBtn = (
      command: string,
      ariaLabel: string,
      symbol: string | Node,
      label: string,
      extra?: string,
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `st-hud__touch-btn${extra ? ` ${extra}` : ''}`;
      b.dataset['command'] = command;
      b.setAttribute('aria-label', ariaLabel);
      const symbolEl = document.createElement('span');
      symbolEl.className = 'st-hud__touch-symbol';
      symbolEl.setAttribute('aria-hidden', 'true');
      if (typeof symbol === 'string') symbolEl.textContent = symbol;
      else symbolEl.append(symbol);
      const labelEl = document.createElement('span');
      labelEl.className = 'st-hud__touch-label';
      labelEl.textContent = label;
      b.append(symbolEl, labelEl);
      return b;
    };

    /** Wire hold-to-repeat on a stepper button. Immediate step on pointerdown,
     *  then fast repeat after a short hold. pointerCapture keeps events firing
     *  if the finger drifts off the button. */
    const wireRepeater = (btn: HTMLButtonElement, action: () => void): void => {
      let holdTimer: ReturnType<typeof setTimeout> | null = null;
      let repeatTimer: ReturnType<typeof setInterval> | null = null;
      let activePointerId: number | null = null;
      const stop = (event?: PointerEvent): void => {
        if (
          event
          && activePointerId !== null
          && event.pointerId !== activePointerId
        ) return;
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        if (repeatTimer !== null) { clearInterval(repeatTimer); repeatTimer = null; }
        activePointerId = null;
      };
      btn.addEventListener('pointerdown', (e) => {
        if (activePointerId !== null) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        activePointerId = e.pointerId;
        btn.setPointerCapture(e.pointerId);
        action();
        holdTimer = setTimeout(() => {
          holdTimer = null;
          repeatTimer = setInterval(action, 80);
        }, 400);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('lostpointercapture', stop);
      // Pointer taps already step on pointerdown. A synthetic click with detail 0
      // is keyboard activation, so support it without double-stepping a tap.
      btn.addEventListener('click', (event) => {
        if (event.detail === 0) action();
      });
    };

    const touchAngleL = mkTouchBtn('aim-left', 'Aim barrel left', '◀', 'Aim');
    const touchAngleR = mkTouchBtn('aim-right', 'Aim barrel right', '▶', 'Aim');
    const touchPowerD = mkTouchBtn('power-down', 'Decrease power', '−', 'Power');
    const touchPowerU = mkTouchBtn('power-up', 'Increase power', '+', 'Power');
    touchAngleL.dataset['firstSalvoTarget'] = 'aim';
    touchAngleR.dataset['firstSalvoTarget'] = 'aim';
    touchPowerD.dataset['firstSalvoTarget'] = 'power-and-wind';
    touchPowerU.dataset['firstSalvoTarget'] = 'power-and-wind';
    this.touchMoveLeftBtnEl = mkTouchBtn(
      'move-left',
      'Move tank left, 8 fuel maximum',
      '‹',
      'Move',
    );
    this.touchMoveRightBtnEl = mkTouchBtn(
      'move-right',
      'Move tank right, 8 fuel maximum',
      '›',
      'Move',
    );
    this.touchWeaponBtnEl = mkTouchBtn(
      'weapon',
      'Cycle weapon, current Baby Missile',
      makeHudIcon('weapon', 18),
      'Baby Missile',
      'st-hud__touch-weapon',
    );
    this.touchWeaponLabelEl = this.touchWeaponBtnEl.querySelector(
      '.st-hud__touch-label',
    )!;
    this.touchMenuBtnEl = mkTouchBtn(
      'menu',
      'Open menu',
      makeHudGlyph('menu', 18),
      'Menu',
      'st-hud__touch-menu',
    );

    wireRepeater(touchAngleL, () => this.touchAngleCb?.(3));
    wireRepeater(touchAngleR, () => this.touchAngleCb?.(-3));
    wireRepeater(touchPowerD, () => this.touchPowerCb?.(-3));
    wireRepeater(touchPowerU, () => this.touchPowerCb?.(3));
    this.touchMoveLeftBtnEl.addEventListener('click', () => this.moveCb?.(-8));
    this.touchMoveRightBtnEl.addEventListener('click', () => this.moveCb?.(8));
    this.touchWeaponBtnEl.addEventListener('click', () => this.touchWeaponCb?.());
    this.touchMenuBtnEl.addEventListener('click', () => this.togglePause(true));

    this.touchCommandBtns = [
      touchAngleL,
      touchAngleR,
      touchPowerD,
      touchPowerU,
      this.touchMoveLeftBtnEl,
      this.touchMoveRightBtnEl,
      this.touchWeaponBtnEl,
      this.touchMenuBtnEl,
    ];
    this.touchStripEl.append(...this.touchCommandBtns);
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

    const storeLabel = `Store · $${credits.toLocaleString()}`;
    if (this.storeBtnLabelEl.textContent !== storeLabel) {
      this.storeBtnLabelEl.textContent = storeLabel;
    }
    this.storeBtnEl.setAttribute('aria-label', storeLabel);
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

    // Accessory rows show the live resource each purchase improves.
    for (const [key, cell] of this.storeAccessoryCells) {
      const acc = ACCESSORIES[key];
      const locked = acc.armsLevel > this.armsLevel;
      const label = locked
        ? `🔒 Arms Lv ${acc.armsLevel}`
        : key === 'battery'
          ? `Cap ${active?.powerCap ?? 100}`
          : `Fuel ${Math.max(0, Math.floor(active?.fuel ?? 0))}`;
      if (cell.owned.textContent !== label) cell.owned.textContent = label;
      const buyable = canAct && !locked && credits >= acc.price;
      cell.buyBtn.disabled = !buyable;
      cell.buyBtn.classList.toggle('st-hud__store-buy--disabled', !buyable);
    }
  }

  /** Reconcile the per-player health bars against `state.tanks`. */
  private syncPlayers(state: GameState, isHandoff: boolean): void {
    const seen = new Set<string>();

    for (const tank of state.tanks) {
      seen.add(tank.id);
      let row = this.rows.get(tank.id);
      if (!row) {
        row = this.createRow(tank);
        this.rows.set(tank.id, row);
        this.playersEl.append(row.el);
      }
      this.syncRow(
        row,
        tank,
        tank.id === state.activePlayerId,
        state.totalRounds,
        isHandoff,
      );
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
  private syncRow(
    row: PlayerRow,
    tank: TankState,
    active: boolean,
    totalRounds: number,
    isHandoff: boolean,
  ): void {
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
    if (!active) {
      row.el.classList.remove('st-hud__player--handoff');
    } else if (isHandoff && !dead) {
      row.el.classList.remove('st-hud__player--handoff');
      void row.el.offsetWidth;
      row.el.classList.add('st-hud__player--handoff');
    }
  }

  /**
   * Update the wind SVG gauge: slide the marker horizontally and refresh the label.
   * The half-track half-width is 32px (track spans x=4..68, center=36, half=32).
   * windNeedleOffset returns [-1,1]; marker center starts at x=72.
   * The marker is a rotated rect with natural center at (x+4, y+4) after the 45° rotate
   * around (x+4, y+4) = (72, 22). We translate it by offset×58px.
   */
  private syncWind(wind: number): void {
    const offset = windNeedleOffset(wind, MAX_WIND); // [-1, 1]
    const tx = offset * 58;
    // Marker: rect x=68 y=18 w=8 h=8, rotated around its center (72,22).
    const cx = 72 + tx;
    this.gaugeWindMarker.setAttribute('x', String(cx - 4));
    this.gaugeWindMarker.setAttribute('transform', `rotate(45, ${cx}, 22)`);
    // Label: "→ 3.2" / "← 3.2" / "• 0.0"
    const sym = windDirectionSymbol(wind);
    const mag = windMagnitudeLabel(wind);
    const lbl = `${sym} ${mag}`;
    if (this.gaugeWindLabel.textContent !== lbl) this.gaugeWindLabel.textContent = lbl;
  }

  /** Update the active tank's SVG gauges + weapon/player name row. */
  private syncAim(state: GameState, isFiring = false, isHandoff = false): void {
    const hasActiveTurn = state.phase === 'PLAYER_TURN' ||
      state.phase === 'FIRING' ||
      state.phase === 'RESOLVING';
    const activeTank = hasActiveTurn
      ? state.tanks.find((candidate) => candidate.id === state.activePlayerId)
      : undefined;
    // PLAYER_TURN names only a living seat owner. During FIRING/RESOLVING the
    // same id identifies the shooter, who may have died to their own blast while
    // the deterministic engine still settles terrain for the surviving seats.
    const tank = activeTank &&
      (state.phase !== 'PLAYER_TURN' || activeTank.alive)
      ? activeTank
      : undefined;
    if (!tank) {
      // No active tank: blank gauges and clear identity rather than leaving a
      // stale player named through a terminal or defensive state.
      this.activePlayerEl.classList.toggle('st-hud__active-row--hidden', true);
      this.aimEl.classList.toggle('st-hud__aim--hidden', true);
      if (this.turnOwnerEl.textContent !== '') this.turnOwnerEl.textContent = '';
      if (this.weaponValueEl.textContent !== '—') this.weaponValueEl.textContent = '—';
      if (this.selectedWeaponIconType !== null) {
        this.weaponIconEl.replaceChildren();
        this.selectedWeaponIconType = null;
      }
      if (this.aimTextEl.textContent !== '') this.aimTextEl.textContent = '';
      if (this.turnStatusEl.getAttribute('aria-label') !== 'No active turn.') {
        this.turnStatusEl.setAttribute('aria-label', 'No active turn.');
      }
      if (this.aimEl.getAttribute('aria-label') !== 'No shot in progress.') {
        this.aimEl.setAttribute('aria-label', 'No shot in progress.');
      }
      if (this.activePlayerEl.style.getPropertyValue('--st-turn-color') !== '') {
        this.activePlayerEl.style.removeProperty('--st-turn-color');
      }
      this.syncTankPortrait();
      // Zero out gauges
      this.gaugeElevNeedle.setAttribute('transform', '');
      if (this.gaugeElevLabel.textContent !== '0° ▶') this.gaugeElevLabel.textContent = '0° ▶';
      this.gaugeWindMarker.setAttribute('x', '68');
      this.gaugeWindMarker.setAttribute('transform', 'rotate(45, 72, 22)');
      if (this.gaugeWindLabel.textContent !== '• 0.0') this.gaugeWindLabel.textContent = '• 0.0';
      const arcLen = parseFloat(this.gaugePowerArc.dataset['arcLen'] ?? '0');
      this.gaugePowerArc.setAttribute('stroke-dasharray', `0 ${arcLen.toFixed(2)}`);
      if (this.gaugePowerLabel.textContent !== '0') this.gaugePowerLabel.textContent = '0';
      return;
    }

    const ownerLabel = HUD.playerLabel(tank);
    const progress = state.phase === 'FIRING'
      ? {
          text: `${ownerLabel} · Shot in flight...`,
          label: `${ownerLabel}'s shot is in flight.`,
        }
      : state.phase === 'RESOLVING'
        ? {
            text: `${ownerLabel} · Terrain settling...`,
            label: `${ownerLabel}'s shot is resolving.`,
          }
        : isFiring
          ? {
              text: `${ownerLabel} · Sending shot...`,
              label: `${ownerLabel} is sending a shot.`,
            }
          : null;

    if (progress) {
      // Shot progress still names the shooter while deterministic resolution
      // finishes, but a destroyed vehicle must not retain an active portrait.
      this.syncTankPortrait(tank.alive ? tank : undefined);
      if (this.aimTextEl.textContent !== progress.text) {
        this.aimTextEl.textContent = progress.text;
      }
      if (this.aimEl.getAttribute('aria-label') !== progress.label) {
        this.aimEl.setAttribute('aria-label', progress.label);
      }
      this.aimEl.classList.toggle('st-hud__aim--hidden', false);
      this.activePlayerEl.classList.toggle('st-hud__active-row--hidden', true);
      // Keep gauges frozen at their last values while a shot is progressing.
      return;
    }

    // Normal PLAYER_TURN state: show active player + weapon row, hide aim strip.
    this.aimEl.classList.toggle('st-hud__aim--hidden', true);
    this.activePlayerEl.classList.toggle('st-hud__active-row--hidden', false);
    const weaponName = WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon;
    this.syncTankPortrait(tank);
    if (this.turnOwnerEl.textContent !== ownerLabel) {
      this.turnOwnerEl.textContent = ownerLabel;
    }
    if (this.turnOwnerEl.title !== ownerLabel) {
      this.turnOwnerEl.title = ownerLabel;
    }
    if (this.weaponValueEl.textContent !== weaponName) {
      this.weaponValueEl.textContent = weaponName;
    }
    if (this.selectedWeaponIconType !== tank.selectedWeapon) {
      this.weaponIconEl.replaceChildren(makeWeaponIcon(tank.selectedWeapon, 19));
      this.selectedWeaponIconType = tank.selectedWeapon;
    }
    if (
      this.activePlayerEl.style.getPropertyValue('--st-turn-color') !== tank.color
    ) {
      this.activePlayerEl.style.setProperty('--st-turn-color', tank.color);
    }
    const activeLabel =
      `${ownerLabel}'s turn. Weapon ${weaponName}. ${Math.max(0, Math.floor(tank.fuel))} fuel remaining.`;
    if (this.turnStatusEl.getAttribute('aria-label') !== activeLabel) {
      this.turnStatusEl.setAttribute('aria-label', activeLabel);
    }
    if (isHandoff) {
      this.activePlayerEl.classList.remove('st-hud__active-row--handoff');
      void this.activePlayerEl.offsetWidth;
      this.activePlayerEl.classList.add('st-hud__active-row--handoff');
    }

    // ── Elevation gauge ──
    // elevationNeedleDeg(angle) gives [0,180]: 0=right, 90=up, 180=left.
    // The needle SVG natural position points up. Positive SVG rotation moves it
    // clockwise toward screen-right, so a rightward 45° barrel needs +45°.
    const needleDeg = elevationNeedleDeg(tank.angle);
    const needleRot = 90 - needleDeg; // 0→+90° (right), 90→0° (up), 180→−90° (left)
    this.gaugeElevNeedle.setAttribute('transform', `rotate(${needleRot}, 36, 40)`);
    const elevLbl = `${elevationDegrees(tank.angle)}° ${aimDirectionGlyph(tank.angle)}`;
    if (this.gaugeElevLabel.textContent !== elevLbl) this.gaugeElevLabel.textContent = elevLbl;

    // ── Power gauge (arc fill) ──
    const fraction = gaugeFraction(tank.power, 0, tank.powerCap ?? 100);
    const arcLen = parseFloat(this.gaugePowerArc.dataset['arcLen'] ?? '0');
    const filled = fraction * arcLen;
    const gap = arcLen - filled;
    const dasharrayVal = `${filled.toFixed(2)} ${gap.toFixed(2)}`;
    this.gaugePowerArc.setAttribute('stroke-dasharray', dasharrayVal);
    const pwrLbl = powerLabel(tank.power);
    if (this.gaugePowerLabel.textContent !== pwrLbl) this.gaugePowerLabel.textContent = pwrLbl;
  }

  /** Repaint the authored vehicle portrait only when its visible identity changes. */
  private syncTankPortrait(tank?: TankState): void {
    if (!tank) {
      if (
        this.tankPortraitSignature !== null
        || this.tankPortraitEl.dataset['tankPreviewSignature'] !== undefined
      ) {
        clearTankLoadoutPreview(this.tankPortraitEl);
      }
      this.tankPortraitSignature = null;
      if (this.tankPortraitEl.getAttribute('aria-label') !== 'No active tank.') {
        this.tankPortraitEl.setAttribute('aria-label', 'No active tank.');
      }
      return;
    }
    const signature = [
      tank.id,
      tank.color,
      tank.loadout.treads,
      tank.loadout.hull,
      tank.loadout.turret,
      tank.loadout.barrel,
    ].join('|');
    const ownerLabel = HUD.playerLabel(tank);
    const accessibleLabel = tankLoadoutAccessibleLabel(ownerLabel, tank.loadout);
    if (this.tankPortraitEl.getAttribute('aria-label') !== accessibleLabel) {
      this.tankPortraitEl.setAttribute('aria-label', accessibleLabel);
    }
    if (signature === this.tankPortraitSignature) return;
    this.tankPortraitSignature = signature;
    paintTankLoadoutPreview(this.tankPortraitEl, tank.color, tank.loadout);
  }

  /** Reconcile the authoritative fuel readout and bounded movement controls. */
  private syncMobility(state: GameState, isFiring: boolean, canControl: boolean): void {
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId);
    const fuel = tank ? Math.max(0, Math.floor(tank.fuel)) : 0;
    const visibleValue = tank ? String(fuel) : '—';
    if (this.fuelValueEl.textContent !== visibleValue) {
      this.fuelValueEl.textContent = visibleValue;
    }
    const fuelLabel = tank ? `${fuel} fuel remaining` : 'No active fuel';
    if (this.fuelValueEl.getAttribute('aria-label') !== fuelLabel) {
      this.fuelValueEl.setAttribute('aria-label', fuelLabel);
    }
    const fuelTier = fuel > 0 ? Math.floor((fuel - 1) / 100) : 0;
    const tierFuel = fuel > 0 ? fuel - fuelTier * 100 : 0;
    const fuelLevel = `${tierFuel}%`;
    if (this.fuelMeterEl.style.getPropertyValue('--st-fuel-level') !== fuelLevel) {
      this.fuelMeterEl.style.setProperty('--st-fuel-level', fuelLevel);
    }
    const fuelFloor = String(fuelTier * 100);
    if (this.fuelMeterEl.getAttribute('aria-valuemin') !== fuelFloor) {
      this.fuelMeterEl.setAttribute('aria-valuemin', fuelFloor);
    }
    const fuelCeiling = String(Math.max(100, (fuelTier + 1) * 100));
    if (this.fuelMeterEl.getAttribute('aria-valuemax') !== fuelCeiling) {
      this.fuelMeterEl.setAttribute('aria-valuemax', fuelCeiling);
    }
    const fuelNow = String(fuel);
    if (this.fuelMeterEl.getAttribute('aria-valuenow') !== fuelNow) {
      this.fuelMeterEl.setAttribute('aria-valuenow', fuelNow);
    }
    if (this.fuelMeterEl.getAttribute('aria-valuetext') !== fuelLabel) {
      this.fuelMeterEl.setAttribute('aria-valuetext', fuelLabel);
    }
    const fuelBand = fuelTier > 0
      ? 'reserve'
      : fuel <= 0
        ? 'empty'
        : fuel <= 25
          ? 'low'
          : 'normal';
    if (this.fuelMeterEl.dataset['fuelBand'] !== fuelBand) {
      this.fuelMeterEl.dataset['fuelBand'] = fuelBand;
    }
    const fuelTierValue = String(fuelTier);
    if (this.fuelMeterEl.dataset['fuelTier'] !== fuelTierValue) {
      this.fuelMeterEl.dataset['fuelTier'] = fuelTierValue;
    }
    const fuelTone = fuelTier === 0
      ? 'base'
      : fuelTier === 1
        ? 'reserve'
        : 'deep-reserve';
    if (this.fuelMeterEl.dataset['fuelTone'] !== fuelTone) {
      this.fuelMeterEl.dataset['fuelTone'] = fuelTone;
    }

    const canMove = canControl &&
      !isFiring &&
      state.phase === 'PLAYER_TURN' &&
      !!tank?.alive &&
      !tank.buried &&
      fuel > 0;
    const disabled = !canMove;
    for (const button of [
      this.moveLeftBtnEl,
      this.moveRightBtnEl,
      this.touchMoveLeftBtnEl,
      this.touchMoveRightBtnEl,
    ]) {
      if (button.disabled !== disabled) button.disabled = disabled;
      const ariaDisabled = String(disabled);
      if (button.getAttribute('aria-disabled') !== ariaDisabled) {
        button.setAttribute('aria-disabled', ariaDisabled);
      }
    }
  }

  /** Flip and persist the arsenal-collapsed preference. */
  private toggleStripCollapsed(): void {
    this.stripCollapsed = !this.stripCollapsed;
    writeArsenalCollapsed(this.stripCollapsed);
    this.applyStripCollapsed();
    if (this.stripCollapsed) this.stripToggleEl.focus();
  }

  /** Reflect the collapsed state onto the strip DOM + toggle affordance. */
  private applyStripCollapsed(): void {
    this.stripEl.classList.toggle('st-hud__strip--collapsed', this.stripCollapsed);
    this.stripEl.classList.toggle('st-hud__strip--open', !this.stripCollapsed);
    this.stripToggleEl.setAttribute('aria-expanded', String(!this.stripCollapsed));
    this.stripToggleEl.setAttribute(
      'aria-label',
      this.stripCollapsed ? 'Expand arsenal' : 'Collapse arsenal',
    );
    this.stripToggleLabelEl.textContent = this.stripCollapsed ? 'Expand' : 'Close';
    for (const child of [...this.root.children]) {
      if (child !== this.stripEl) (child as HTMLElement).inert = !this.stripCollapsed;
    }
    if (this.touchStripEl) this.touchStripEl.inert = !this.stripCollapsed;
  }

  /** Reconcile the weapon strip: owned-only visibility, active highlight, live ammo. No DOM rebuild. */
  private syncStrip(state: GameState, isFiring: boolean, canControl: boolean): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    const canAct = canControl && !isFiring && !!tank && state.phase === 'PLAYER_TURN';
    const selectedInventory = tank?.inventory[tank.selectedWeapon];
    const selectedUsable = !!selectedInventory &&
      (selectedInventory.unlimited || selectedInventory.count > 0);
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
      cell.el.setAttribute('aria-pressed', String(selected));
      cell.el.classList.toggle('st-hud__weapon-btn--depleted', depleted);
      // Disable while firing, when no active tank, or when depleted, so a click
      // cannot emit a select for an unusable weapon. (Engine still re-validates;
      // this is UX only.)
      cell.el.disabled = !canAct || depleted;
    }
    // Sync the shared primary action and touch weapon stepper from the same
    // explicit local-ownership state.
    for (const button of this.touchCommandBtns) {
      if (
        button === this.touchMoveLeftBtnEl
        || button === this.touchMoveRightBtnEl
        || button === this.touchMenuBtnEl
      ) continue;
      button.disabled = !canAct;
      button.setAttribute('aria-disabled', String(!canAct));
    }
    const weaponName = tank ? (WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon) : 'Weapon';
    const isShield = tank?.selectedWeapon === 'shield';
    const actionLabel = isShield ? 'Activate shield' : 'Fire';
    const actionAccessibleName = isShield ? actionLabel : `${actionLabel} ${weaponName}`;
    if (this.primaryActionLabelEl.textContent !== actionLabel) {
      this.primaryActionLabelEl.textContent = actionLabel;
    }
    this.primaryActionBtnEl.setAttribute('aria-label', actionAccessibleName);
    const canCommit = canAct && selectedUsable;
    this.primaryActionBtnEl.disabled = !canCommit;
    this.primaryActionBtnEl.setAttribute('aria-disabled', String(!canCommit));
    if (this.touchWeaponLabelEl.textContent !== weaponName) {
      this.touchWeaponLabelEl.textContent = weaponName;
    }
    this.touchWeaponBtnEl.setAttribute('aria-label', `Cycle weapon, current ${weaponName}`);
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
    this.lastPresentedTurnKey = null;
    if (this.built) {
      this.activePlayerEl.classList.remove('st-hud__active-row--handoff');
      for (const row of this.rows.values()) {
        row.el.classList.remove('st-hud__player--handoff');
      }
    }
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
          : `fuel ${Math.max(0, Math.floor(tank?.fuel ?? 0))}`;
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
  font-size: var(--ui-type-title);
}
.st-hud__players {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.st-hud__player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 2px;
  border: 0;
  border-bottom: 1px solid var(--ui-line);
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  transition: box-shadow 160ms ease, background 160ms ease, opacity 220ms ease;
}
.st-hud__player--active {
  background:
    linear-gradient(90deg, var(--ui-surface-active), rgba(142, 47, 83, 0.16) 58%, transparent);
  border-left: 2px solid var(--ui-action);
  padding-left: 6px;
  box-shadow: inset 10px 0 18px rgba(255, 122, 31, 0.06);
}
.st-hud__player--handoff {
  animation: st-hud-roster-handoff 560ms ease-out;
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
  display: grid;
  grid-template-columns: 23px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 5px 4px;
  border: 1px solid rgba(255, 210, 63, 0.16);
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(255, 210, 63, 0.055), rgba(7, 4, 12, 0.42));
  font-size: var(--ui-type-title);
}
.st-hud__weapon-icon {
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border-radius: 4px;
  color: var(--gold);
  background: rgba(255, 210, 63, 0.07);
  box-shadow: inset 0 0 0 1px rgba(255, 210, 63, 0.14);
}
.st-hud__weapon-icon .st-weapon-icon {
  width: 17px;
  height: 17px;
}
.st-hud__weapon-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}
.st-hud__turn-identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  gap: 2px;
}
.st-hud__identity-lockup {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.st-hud__tank-portrait-frame {
  position: relative;
  width: 84px;
  height: 48px;
  overflow: hidden;
  border: 1px solid rgba(255, 210, 63, 0.2);
  border-radius: 5px;
  background:
    radial-gradient(circle at 50% 82%, color-mix(in srgb, var(--st-turn-color) 22%, transparent), transparent 48%),
    linear-gradient(180deg, rgba(122, 215, 255, 0.055), rgba(7, 4, 12, 0.8));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.025),
    0 0 11px color-mix(in srgb, var(--st-turn-color) 16%, transparent);
}
.st-hud__tank-portrait-frame::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(105deg, transparent 28%, rgba(255, 233, 168, 0.09) 48%, transparent 66%);
  mix-blend-mode: screen;
}
.st-hud__tank-portrait {
  display: block;
  width: 84px;
  height: 48px;
}
.st-hud__turn-status {
  display: block;
  width: 100%;
  min-width: 0;
}
.st-hud__turn-kicker {
  color: var(--ui-muted);
  font-family: var(--font-display);
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 1.7px;
  text-transform: uppercase;
  white-space: nowrap;
}
.st-hud__turn-owner {
  min-width: 0;
  max-width: 100%;
  color: var(--ui-copy);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.45px;
  text-shadow: 0 0 10px color-mix(in srgb, var(--st-turn-color) 62%, transparent);
  white-space: normal;
  overflow-wrap: anywhere;
}
.st-hud__menu {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ui-space-2);
  width: 100%;
  pointer-events: auto;
  cursor: pointer;
  padding: 7px 2px 9px;
  border: 0;
  border-bottom: 1px solid var(--ui-line);
  border-radius: 0;
  background: transparent;
  color: var(--ui-muted);
  font-family: var(--font-sans);
  font-size: var(--ui-type-body);
  letter-spacing: 0.5px;
  transition: background 130ms ease, border-color 130ms ease;
}
.st-hud__menu:hover { background: var(--ui-surface-active); color: var(--ui-action); }
.st-hud__weapon-label {
  color: var(--ui-muted);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
}
.st-hud__weapon-value {
  display: block;
  min-width: 0;
  font-family: var(--font-display);
  font-weight: bold;
  font-size: 10px;
  line-height: 1.15;
  letter-spacing: 0.25px;
  color: var(--gold);
  white-space: nowrap;
}
.st-hud__controls {
  position: absolute;
  top: 14px;
  left: 14px;
  width: 208px;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 9px;
  background:
    radial-gradient(110% 90% at 0% 0%, rgba(122, 215, 255, 0.10), transparent 48%),
    linear-gradient(180deg, rgba(31, 18, 51, 0.92), rgba(9, 5, 16, 0.92));
  border: 1px solid rgba(255, 210, 63, 0.32);
  box-shadow:
    inset 0 0 0 1px rgba(8, 4, 13, 0.78),
    inset 0 0 22px rgba(255, 122, 31, 0.06),
    0 10px 28px rgba(0, 0, 0, 0.35);
  color: var(--ui-muted);
}
.st-hud__controls-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  margin-bottom: 6px;
  padding: 0 2px 5px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.22);
}
.st-hud__controls-title {
  color: var(--text-dim);
  font-family: var(--font-display);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 1.7px;
  text-transform: uppercase;
}
.st-hud__controls-mode {
  padding: 2px 5px;
  border: 1px solid rgba(122, 215, 255, 0.25);
  border-radius: 99px;
  color: var(--tank-blue-lite, #7ad7ff);
  font-family: var(--font-mono);
  font-size: 6px;
  letter-spacing: 0.8px;
  line-height: 1;
  text-transform: uppercase;
}
.st-hud__control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}
.st-hud__control-cell {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  align-items: center;
  gap: 0 5px;
  min-height: 38px;
  min-width: 0;
  padding: 4px 5px;
  border: 1px solid rgba(255, 210, 63, 0.14);
  border-radius: 5px;
  background:
    linear-gradient(145deg, rgba(255, 233, 168, 0.045), transparent 52%),
    rgba(9, 5, 17, 0.68);
  box-shadow: inset 0 1px 0 rgba(255, 233, 168, 0.04);
}
.st-hud__control-cell .st-ui-glyph {
  grid-row: 1 / 3;
  width: 25px;
  height: 25px;
}
.st-hud__control-label {
  align-self: end;
  color: var(--ui-copy);
  font-family: var(--font-sans);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.45px;
  line-height: 1;
  text-transform: uppercase;
}
.st-hud__keypair {
  display: flex;
  align-items: center;
  align-self: start;
  gap: 2px;
  min-width: 0;
}
.st-hud__controls kbd {
  display: inline-block;
  min-width: 10px;
  padding: 1px 2px;
  border: 1px solid rgba(255, 210, 63, 0.22);
  border-radius: 2px;
  background: rgba(255, 210, 63, 0.08);
  color: var(--ui-muted);
  font-family: var(--font-mono);
  font-size: 6.5px;
  line-height: 1.2;
  text-align: center;
}
.st-hud__control-cell--primary {
  grid-column: 1 / -1;
  grid-template-columns: 25px minmax(0, 1fr) auto;
  grid-template-rows: 1fr;
  min-height: 34px;
  border-color: rgba(255, 122, 31, 0.34);
  background:
    linear-gradient(90deg, rgba(255, 122, 31, 0.13), transparent 70%),
    rgba(9, 5, 17, 0.78);
}
.st-hud__control-cell--primary .st-ui-glyph { grid-row: 1; }
.st-hud__control-cell--primary .st-hud__control-label { align-self: center; }
.st-hud__control-cell--primary .st-hud__keypair {
  align-self: center;
  justify-self: end;
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
  font-size: var(--ui-type-body);
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
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-family: var(--font-display);
  font-size: var(--ui-type-label);
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.st-hud__strip-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  cursor: pointer;
  flex: 0 0 auto;
  min-width: 22px;
  min-height: 22px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--text-gold);
  font-size: 11px;
  line-height: 1;
}
.st-hud__strip-toggle:hover { background: var(--ui-surface-active); color: var(--gold); }
.st-hud__strip-toggle .st-ui-icon {
  margin: 0;
  transition: transform 130ms ease;
}
.st-hud__strip-toggle-label {
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.st-hud__strip--open .st-hud__strip-toggle .st-ui-icon {
  transform: rotate(180deg);
}
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
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-sm);
  background:
    linear-gradient(180deg, rgba(255, 210, 63, 0.035), rgba(12, 7, 22, 0.74)),
    var(--ui-surface);
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
.st-weapon-icon {
  display: block;
  flex: 0 0 auto;
  color: var(--ui-muted);
  stroke: currentColor;
  filter: drop-shadow(0 0 3px rgba(255, 233, 168, 0.08));
}
.st-hud__weapon-btn .st-weapon-icon,
.st-hud__store-name-line .st-weapon-icon {
  width: 18px;
  height: 18px;
}
.st-weapon-icon[data-family='nuclear'],
.st-weapon-icon[data-family='death'] { color: var(--tank-red-lite); }
.st-weapon-icon[data-family='fire'],
.st-weapon-icon[data-family='volatile'] { color: var(--ember); }
.st-weapon-icon[data-family='defense'] { color: var(--tank-blue-lite); }
.st-weapon-icon[data-family='terrain'] { color: #c49359; }
.st-weapon-icon[data-family='drill'] { color: #f3a83b; }
.st-hud__weapon-btn--active .st-weapon-icon {
  color: var(--gold);
  filter: drop-shadow(0 0 4px rgba(255, 210, 63, 0.42));
}
.st-hud__weapon-btn-name {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
}
.st-hud__weapon-btn-ammo {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-gold);
  opacity: 0.9;
}
/* First Salvo stays compact and non-modal: the card is pointer-transparent; only Skip receives pointer input. */
.st-hud__first-salvo {
  position: absolute;
  left: 14px;
  bottom: 12px;
  z-index: 22;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  width: min(244px, calc(100% - 28px));
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid rgba(255, 210, 63, 0.68);
  border-radius: 6px;
  background:
    linear-gradient(115deg, rgba(255, 210, 63, 0.13), transparent 56%),
    rgba(15, 8, 25, 0.94);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 233, 168, 0.08);
  color: var(--text);
  pointer-events: none;
}
.st-hud__first-salvo--hidden { display: none; }
.st-hud__first-salvo-progress {
  grid-column: 1;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
}
.st-hud__first-salvo-copy {
  grid-column: 1 / -1;
  color: var(--ui-copy);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
  text-align: left;
}
.st-hud__first-salvo-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.st-hud__first-salvo-skip {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
  min-height: 24px;
  padding: 3px 6px;
  border: 1px solid rgba(255, 210, 63, 0.34);
  border-radius: 3px;
  background: transparent;
  color: var(--ui-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  pointer-events: auto;
}
.st-hud__first-salvo-skip:hover { color: var(--text-gold); border-color: var(--gold); }
.st-hud__first-salvo-skip:focus-visible,
.st-hud__restart:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.st-hud__first-salvo-target--active {
  position: relative;
  z-index: 2;
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  box-shadow: 0 0 0 1px rgba(255, 122, 31, 0.58), 0 0 14px rgba(255, 210, 63, 0.42);
  animation: st-hud-first-salvo-target 1.7s ease-in-out infinite;
}
@keyframes st-hud-first-salvo-target {
  50% { box-shadow: 0 0 0 1px rgba(255, 122, 31, 0.84), 0 0 20px rgba(255, 210, 63, 0.68); }
}
@media (prefers-reduced-motion: reduce) {
  .st-hud__first-salvo-target--active { animation: none; }
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

/* ---- Turn actions + Store ---- */
.st-hud__turn-actions {
  display: flex;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px 7px;
  border-top: 1px solid rgba(255, 210, 63, 0.14);
  background: rgba(6, 3, 11, 0.34);
  flex-shrink: 0;
}
.st-hud__turn-actions .st-hud__store-btn {
  width: auto;
  min-width: 0;
  flex: 0.9;
}
.st-hud__primary-action {
  min-width: 0;
  min-height: 42px;
  flex: 1.35;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  pointer-events: auto;
  cursor: pointer;
  border: 1px solid var(--ui-action);
  border-radius: var(--ui-radius-md);
  background:
    linear-gradient(180deg, rgba(212, 86, 42, 0.72), rgba(115, 30, 57, 0.86));
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--ui-type-body);
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  box-shadow:
    inset 0 1px 0 rgba(255, 233, 168, 0.24),
    0 0 14px rgba(255, 122, 31, 0.18);
  transition:
    background 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease;
}
.st-hud__primary-action:hover:not(:disabled) {
  border-color: var(--gold);
  background:
    linear-gradient(180deg, rgba(234, 101, 43, 0.86), rgba(142, 47, 83, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 233, 168, 0.32),
    0 0 18px rgba(255, 122, 31, 0.28);
}
.st-hud__primary-action:active:not(:disabled) {
  transform: translateY(1px);
}
.st-hud__primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.38;
  filter: saturate(0.45);
  box-shadow: none;
}
.st-hud__store-btn {
  display: flex;
  align-items: center;
  width: 100%;
  pointer-events: auto;
  cursor: pointer;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  padding: 7px 8px;
  margin: 0;
  border: 1px solid rgba(255, 210, 63, 0.20);
  border-radius: var(--ui-radius-md);
  background: rgba(255, 210, 63, 0.035);
  color: var(--ui-muted);
  font-family: var(--font-sans);
  font-size: var(--ui-type-body);
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  transition: background 130ms ease, border-color 130ms ease;
}
.st-hud__store-btn:hover { background: var(--ui-surface-active); color: var(--ui-action); }
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
.st-hud__store-name-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
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
@keyframes st-hud-turn-handoff {
  0% {
    filter: brightness(1.65);
    box-shadow: inset 3px 0 var(--st-turn-color), 0 0 18px rgba(255, 210, 63, 0.34);
  }
  100% {
    filter: brightness(1);
    box-shadow: inset 3px 0 transparent, 0 0 0 rgba(255, 210, 63, 0);
  }
}
@keyframes st-hud-roster-handoff {
  0% { filter: brightness(1.55); }
  100% { filter: brightness(1); }
}
@media (prefers-reduced-motion: reduce) {
  .st-hud__player--active { animation: none; }
  .st-hud__player--handoff,
  .st-hud__active-row--handoff { animation: none; }
  .st-hud__player--hit::after { animation: none; opacity: 0; }
  .st-hud__bar-fill,
  .st-hud__weapon-btn,
  .st-hud__restart,
  .st-hud__touch-btn { transition: none; }
}

/* ===== Coarse-pointer command dock ===================================== */
/* Hidden on precise pointers; replaces the keyboard deck on touch. */
.st-hud__touch-strip {
  position: absolute;
  top: 14px;
  left: 14px;
  display: none;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 6px;
  width: min(896px, calc(100% - 28px));
  /* 72 logical px resolves to 45 rendered px at the supported 0.625 phone scale. */
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 210, 63, 0.32);
  border-radius: 10px;
  background:
    radial-gradient(100% 120% at 0% 0%, rgba(122, 215, 255, 0.10), transparent 52%),
    linear-gradient(180deg, rgba(28, 16, 47, 0.94), rgba(8, 5, 15, 0.94));
  box-shadow:
    inset 0 0 0 1px rgba(8, 4, 13, 0.78),
    0 10px 28px rgba(0, 0, 0, 0.38);
  pointer-events: auto;
  /* Prevent touch gestures (scroll, pinch) hijacking button presses. */
  touch-action: none;
}
@media (pointer: coarse) {
  .st-hud__touch-strip { display: grid; }
}
.st-hud__touch-strip[inert] { display: none; }
.st-hud__touch-btn {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  place-items: center;
  gap: 4px;
  min-width: 0;
  cursor: pointer;
  /* 52px ensures ~40px effective height even at 0.78× game scale on phones. */
  min-height: 72px;
  padding: 5px 6px;
  border: 1px solid rgba(255, 210, 63, 0.27);
  border-radius: 6px;
  background:
    linear-gradient(145deg, rgba(255, 233, 168, 0.07), transparent 50%),
    rgba(10, 6, 18, 0.86);
  box-shadow:
    inset 0 1px 0 rgba(255, 233, 168, 0.06),
    0 2px 7px rgba(0, 0, 0, 0.24);
  color: var(--text-gold);
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  transition:
    background 70ms ease,
    border-color 70ms ease,
    transform 70ms ease;
}
.st-hud__touch-symbol {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 210, 63, 0.20);
  border-radius: 5px;
  background: rgba(255, 210, 63, 0.08);
  color: var(--gold);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}
.st-hud__touch-label {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-copy);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.35px;
  line-height: 1.05;
  text-align: left;
  text-overflow: ellipsis;
}
.st-hud__touch-btn:active:not(:disabled) {
  transform: translateY(1px);
  border-color: rgba(255, 122, 31, 0.58);
  background:
    linear-gradient(145deg, rgba(255, 122, 31, 0.20), transparent 58%),
    rgba(16, 8, 24, 0.94);
}
.st-hud__touch-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.st-hud__touch-weapon {
  grid-column: span 2;
  border-color: rgba(122, 215, 255, 0.42);
  color: var(--tank-blue-lite, #7ad7ff);
}
.st-hud__touch-weapon .st-hud__touch-symbol {
  border-color: rgba(122, 215, 255, 0.30);
  background: rgba(122, 215, 255, 0.08);
  color: var(--tank-blue-lite, #7ad7ff);
}
.st-hud__touch-menu {
  border-color: rgba(192, 132, 252, 0.34);
  color: var(--ui-muted);
}
.st-hud__touch-menu .st-hud__touch-symbol {
  border-color: rgba(192, 132, 252, 0.28);
  background: rgba(192, 132, 252, 0.08);
  color: var(--ui-muted);
}
.st-hud__touch-menu .st-ui-glyph {
  width: 25px;
  height: 25px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
/* ===== Coarse-pointer (touch) overrides ================================ */
/* Enlarge interactive targets to ≥44px and hide the keyboard legend. */
@media (pointer: coarse) {
  .st-hud__controls { display: none; }
  .st-hud__weapon-btn { min-height: 44px; }
  .st-hud__strip-toggle { min-width: 72px; min-height: 72px; }
  .st-hud__store-buy  { min-height: 44px; }
  .st-hud__restart    { min-height: 48px; padding-top: 12px; padding-bottom: 12px; }
  #hud .st-hud__menu  { display: none; }
  .st-hud__store-btn  { min-height: 44px; }
  /* #app zoom reaches 0.625 at the supported phone-landscape viewport, so
     72 logical px preserves a >=44 CSS-pixel hit target after scaling. */
  .st-hud__primary-action { min-height: 72px; }
  .st-hud__store-close { min-height: 44px; }
  .st-hud__turnwatch-leave { min-height: 44px; padding: 0 14px; }
}

/* ===== Ballistic fire-control console ================================== */
.st-hud__instruments {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  background:
    linear-gradient(135deg, rgba(255, 210, 63, 0.10), transparent 28%),
    radial-gradient(120% 80% at 50% 0%, rgba(255, 122, 31, 0.16), transparent 62%),
    linear-gradient(180deg, #241535 0%, #0d0816 100%);
  border: 2px solid rgba(255, 210, 63, 0.54);
  border-radius: 7px;
  box-shadow:
    inset 0 0 0 2px rgba(8, 4, 13, 0.92),
    inset 0 0 24px rgba(255, 122, 31, 0.12),
    0 0 0 1px rgba(255, 233, 168, 0.10),
    0 7px 18px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: hidden;
  /* Keep the console physical; the fitted combat rail does not flex-crush it. */
  flex-shrink: 0;
}
.st-hud__instruments::before {
  content: '';
  position: absolute;
  inset: 5px;
  border: 1px solid rgba(255, 233, 168, 0.10);
  border-radius: 3px;
  pointer-events: none;
}
.st-hud__instruments::after {
  content: '';
  position: absolute;
  top: 7px;
  left: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #09050e;
  border: 1px solid rgba(255, 233, 168, 0.30);
  box-shadow: 222px 0 #09050e, 0 140px #09050e, 222px 140px #09050e;
  pointer-events: none;
}
.st-hud__instr-title {
  font-family: var(--font-display);
  font-size: var(--ui-type-label);
  font-weight: bold;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: var(--text-gold);
  text-shadow: 0 0 8px rgba(255, 122, 31, 0.34);
  text-align: center;
  padding: 1px 12px 6px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.30);
}
.st-hud__gauge-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    'elevation power'
    'wind wind';
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.st-hud__gauge-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 6px 3px;
  border: 1px solid rgba(255, 210, 63, 0.24);
  border-radius: 5px;
  background:
    radial-gradient(circle at 50% 58%, rgba(255, 210, 63, 0.10), transparent 58%),
    linear-gradient(180deg, rgba(7, 4, 12, 0.84), rgba(18, 10, 27, 0.78));
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.72),
    inset 0 1px 0 rgba(255, 233, 168, 0.08);
}
.st-hud__gauge-cell--elevation { grid-area: elevation; }
.st-hud__gauge-cell--power { grid-area: power; }
.st-hud__gauge-cell--wind {
  grid-area: wind;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  padding: 3px 8px;
}
.st-hud__gauge-cell > svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.st-hud__gauge-cell--elevation > svg,
.st-hud__gauge-cell--power > svg {
  width: 88%;
}
.st-hud__gauge-cell-title {
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: rgba(255, 233, 168, 0.70);
  text-align: center;
}
.st-hud__gauge-track {
  fill: none;
  stroke: rgba(255, 210, 63, 0.30);
  stroke-width: 4;
  stroke-linecap: round;
  filter: drop-shadow(0 0 2px rgba(255, 122, 31, 0.26));
}
.st-hud__gauge-track-rect {
  fill: rgba(255, 210, 63, 0.14);
  stroke: rgba(255, 210, 63, 0.42);
  stroke-width: 2;
}
.st-hud__gauge-ticks {
  fill: none;
  stroke: rgba(255, 233, 168, 0.62);
  stroke-width: 1.6;
  stroke-linecap: round;
}
.st-hud__gauge-pivot {
  fill: var(--gold);
  filter: drop-shadow(0 0 3px rgba(255, 210, 63, 0.66));
}
.st-hud__gauge-needle {
  stroke: var(--gold);
  stroke-width: 3;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px rgba(255, 210, 63, 0.66));
}
.st-hud__gauge-needle-rect {
  fill: var(--gold);
  filter: drop-shadow(0 0 3px rgba(255, 210, 63, 0.72));
}
.st-hud__gauge-power-fill {
  fill: none;
  stroke: var(--ember);
  stroke-width: 5;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(255, 122, 31, 0.72));
}
.st-hud__gauge-label {
  fill: var(--text-gold);
  font-family: var(--font-mono);
  font-size: var(--ui-type-body);
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}
.st-hud__gauge-label--lg {
  font-size: var(--ui-type-title);
  fill: var(--gold);
}
#app.is-compact .st-hud__gauge-track { stroke-width: 5; }
#app.is-compact .st-hud__gauge-ticks { stroke-width: 2; }
#app.is-compact .st-hud__gauge-needle { stroke-width: 4; }
#app.is-compact .st-hud__gauge-label { font-size: 12px; }
@media (pointer: coarse) {
  #app .st-hud__instruments {
    gap: 1px;
    padding: 0 7px;
  }
  #app .st-hud__instr-title {
    padding: 0 8px;
  }
  #app .st-hud__gauge-row {
    gap: 3px;
  }
  #app .st-hud__gauge-cell {
    gap: 1px;
    padding: 2px 5px 0;
  }
  #app .st-hud__gauge-cell--wind {
    padding: 1px 6px;
  }
}
/* On touch devices, lift the touch controls up to sit right after the players
 * list (before the instruments) instead of being pinned to the bottom of the
 * fitted panel. Every child from instruments onward gets order:1; the touch
 * strip keeps the default order:0, so (being the last DOM child of #hud) it
 * renders at the end of the order:0 group: after menu/round/players. */
@media (pointer: coarse) {
  .st-hud__touch-strip { margin-top: 0; }
  .st-hud__instruments,
  .st-hud__command-console,
  .st-hud__strip { order: 1; }
}
/* One command surface: identity first, tactics second, commitment last. */
.st-hud__command-console {
  --ui-section-padding: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex-shrink: 0;
  overflow: hidden;
}
.st-hud__active-row {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  padding: 7px 8px 6px 12px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--st-turn-color) 15%, transparent), transparent 62%);
  flex-shrink: 0;
}
.st-hud__tactical-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 94px;
  align-items: stretch;
  gap: 5px;
  min-width: 0;
}
.st-hud__tactical-row .st-hud__weapon {
  min-width: 0;
}
.st-hud__mobility {
  display: grid;
  grid-template-columns: 27px minmax(36px, 1fr) 27px;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  pointer-events: auto;
}
.st-hud__move-btn {
  min-width: 0;
  min-height: 34px;
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 1px solid rgba(122, 215, 255, 0.32);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(122, 215, 255, 0.12), rgba(12, 7, 22, 0.72));
  color: var(--tank-blue-lite, #7ad7ff);
  cursor: pointer;
  font-family: var(--font-mono);
  font-weight: 700;
  line-height: 1;
}
.st-hud__move-direction {
  color: var(--tank-blue-lite, #7ad7ff);
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 0.8;
}
.st-hud__move-btn kbd {
  min-width: 12px;
  padding: 1px 2px;
  border: 1px solid rgba(122, 215, 255, 0.22);
  border-radius: 2px;
  background: rgba(122, 215, 255, 0.08);
  color: rgba(183, 225, 255, 0.78);
  font-family: var(--font-mono);
  font-size: 6px;
  line-height: 1;
}
.st-hud__move-btn:hover:not(:disabled) {
  border-color: rgba(122, 215, 255, 0.68);
  background:
    linear-gradient(180deg, rgba(122, 215, 255, 0.24), rgba(12, 7, 22, 0.72));
}
.st-hud__move-btn:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.st-hud__move-btn:disabled {
  cursor: not-allowed;
  opacity: 0.36;
}
.st-hud__fuel {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0 1px;
}
.st-hud__fuel-readout {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  pointer-events: none;
}
.st-hud__fuel-label {
  color: var(--ui-muted);
  font-family: var(--font-display);
  font-size: 6px;
  line-height: 1;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.st-hud__fuel-value {
  color: var(--gold);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 0.9;
}
.st-hud__fuel-meter {
  --st-fuel-level: 0%;
  --st-fuel-color: var(--gold);
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  border-radius: 50%;
  background:
    conic-gradient(
      from -90deg,
      var(--st-fuel-color) 0 var(--st-fuel-level),
      rgba(255, 210, 63, 0.11) var(--st-fuel-level) 100%
    );
  box-shadow:
    0 0 7px color-mix(in srgb, var(--st-fuel-color) 22%, transparent),
    inset 0 0 0 1px rgba(255, 233, 168, 0.08);
  isolation: isolate;
}
.st-hud__fuel-meter::before {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 38%, rgba(69, 39, 77, 0.92), rgba(7, 4, 12, 0.98) 72%);
  box-shadow: inset 0 0 0 1px rgba(255, 233, 168, 0.08);
}
.st-hud__fuel-meter[data-fuel-band="low"] {
  --st-fuel-color: var(--ember);
}
.st-hud__fuel-meter[data-fuel-band="low"] .st-hud__fuel-value {
  color: var(--ember);
}
.st-hud__fuel-meter[data-fuel-band="empty"] {
  --st-fuel-color: rgba(154, 134, 184, 0.55);
}
.st-hud__fuel-meter[data-fuel-band="empty"] .st-hud__fuel-value {
  color: var(--ui-muted);
}
.st-hud__fuel-meter[data-fuel-tone="reserve"] {
  --st-fuel-color: var(--tank-blue-lite, #7fb0ff);
}
.st-hud__fuel-meter[data-fuel-tone="deep-reserve"] {
  --st-fuel-color: #c084fc;
}
.st-hud__active-row::before {
  content: '';
  position: absolute;
  inset: 5px auto 5px 2px;
  width: 3px;
  border-radius: 999px;
  background: var(--st-turn-color, var(--ui-action));
  box-shadow: 0 0 8px var(--st-turn-color, var(--ui-action));
}
#app.is-compact .st-hud__active-row {
  gap: 3px;
  padding-block: 2px;
}
#app.is-compact .st-hud__turn-actions {
  padding: 3px 6px;
}
#app.is-compact .st-hud__move-btn {
  min-height: 40px;
}
#app.is-compact .st-hud__fuel-label {
  font-size: 7px;
  letter-spacing: 0.35px;
}
#app.is-compact .st-hud__fuel-value {
  font-size: 12px;
}
#app.is-compact .st-hud__controls-title {
  font-size: 9.5px;
}
#app.is-compact .st-hud__control-label {
  font-size: 9px;
}
#app.is-compact .st-hud__controls kbd {
  font-size: 7.5px;
}
@media (pointer: coarse) {
  #app .st-hud__active-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 94px;
    grid-template-rows: auto auto;
    gap: 3px 5px;
    padding-block: 2px;
  }
  #app .st-hud__identity-lockup {
    grid-column: 1;
    grid-row: 1;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 5px;
  }
  #app .st-hud__tank-portrait-frame,
  #app .st-hud__tank-portrait {
    width: 70px;
    height: 40px;
  }
  #app .st-hud__tactical-row {
    display: contents;
  }
  #app .st-hud__tactical-row .st-hud__weapon {
    grid-column: 1;
    grid-row: 2;
  }
  #app .st-hud__mobility {
    grid-column: 2;
    grid-row: 1 / span 2;
    grid-template-columns: 1fr;
    justify-items: center;
  }
  #app .st-hud__mobility > .st-hud__move-btn {
    display: none;
  }
  #app .st-hud__fuel-meter {
    width: 46px;
    height: 46px;
    min-width: 46px;
    min-height: 46px;
  }
  #app .st-hud__turn-actions {
    padding: 3px 6px;
  }
  #app .st-hud__move-btn,
  #app .st-hud__store-btn {
    min-height: 56px;
  }
  #app.is-compact .st-hud__move-btn,
  #app.is-compact .st-hud__store-btn,
  #app.is-compact .st-hud__primary-action {
    min-height: 78px;
  }
}
.st-hud__active-row--handoff {
  animation: st-hud-turn-handoff 560ms ease-out;
}
.st-hud__active-row--hidden { display: none; }
/* Shot progress replaces the owner row during submit, flight, and resolution. */
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

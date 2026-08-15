import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS, ACCESSORIES } from '@shared/engine/WeaponSystem';
import type { WeaponType, AccessoryType } from '@shared/engine/WeaponSystem';
import type { ConnectionState, TurnWatch } from '../client/GameClient';
import {
  elevationDegrees,
  powerLabel,
  windMagnitudeLabel,
} from './gaugeMath';
import { resolveInitialArsenalCollapsed } from './arsenalPreference';
import { makeHudGlyph, makeHudIcon } from './hudIcons';
import { STORE_CATALOG } from './storeCatalog';
import { makeWeaponIcon } from './weaponIcons';
import { WEAPON_INTEL } from './weaponIntel';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../renderer/TankLoadoutPreview';
import { tankLoadoutAccessibleLabel } from './tankPartLabels';
import type { FirstSalvoStep } from './firstSalvoCoach';
import { QUICK_CHAT_MESSAGES, type QuickChatKey } from '../client/quickChat';
import {
  earnedHotSeatMatchXp,
  type HotSeatProgressionReceipt,
} from '../client/hotSeatProgression';
import type {
  VerifiedDeploymentDeadline,
  VerifiedDeploymentReceipt,
} from '../client/verifiedDeployment';
import {
  commanderCareerForVerifiedProgression,
  commanderPromotionBetweenVerified,
} from '../client/commanderCareer';
import type { LiveMatchSnapshot } from '../client/liveMatchDiagnostics';
import { renderFieldOrder, type FieldOrder } from '../client/fieldOrder';
import {
  battleCommandStateFor,
  type BattleCommandCommitmentPhase,
  type BattleCommandImpactLearningCue,
} from './battleCommandState';

/**
 * What a store Buy click requests: exactly one of a weapon bundle or an accessory, mirroring the
 * engine's `BuyAction` "exactly one of weapon/accessory" invariant. The HUD emits this and the
 * caller (main.ts) forwards it verbatim into a `buy` action — so the store stays decoupled from the
 * action/transport layer.
 */
export type StorePurchase = { weapon?: WeaponType; accessory?: AccessoryType };

interface HUDVerifiedDeploymentDetails {
  readonly humanSalvos: number;
  readonly cpuSalvos: number;
  readonly humanLimit: number;
  readonly cpuLimit: number;
  readonly deadline: VerifiedDeploymentDeadline;
}

export type HUDVerifiedDeploymentState =
  | ({ readonly status: 'active' | 'cap-adjudicating' | 'completion-pending' | 'retryable' }
    & HUDVerifiedDeploymentDetails)
  | ({ readonly status: 'expired' } & HUDVerifiedDeploymentDetails)
  | { readonly status: 'policy-refused' | 'failed' };

type CombatFocus = 'decision' | 'outcome' | 'terminal';

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
  /** Protected bottom-band root (#battle-rail) for fine-pointer commands and liveness. */
  private readonly railRoot: HTMLElement;
  /** Full-app modal layer (#modal-layer), ABOVE the CRT chrome — store + game-over
   *  modals mount here so they render crisp and span canvas+panel (P3-16). */
  private readonly modalRoot: HTMLElement;

  /** Restart callback registered via {@link onRestart}; may arrive before or after the overlay shows. */
  private restartCb: (() => void) | null = null;

  /** Callback fired when a weapon strip button is clicked. */
  private weaponSelectCb: ((weapon: WeaponType) => void) | null = null;

  /** Callback fired when the player quits a game back to the lobby (in-game Menu / game-over Main Menu). */
  private quitCb: (() => void) | null = null;
  private pauseChangeCb: ((paused: boolean) => void) | null = null;
  private quickChatCb: ((key: QuickChatKey) => void) | null = null;
  private quickChatEnabled = false;

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
  private progressionSignInCb: (() => void) | null = null;
  private verifiedRetryCb: (() => void) | null = null;
  private verifiedContinueCasualCb: (() => void) | null = null;
  private verifiedReturnToBatteryCb: (() => void) | null = null;
  private verifiedNextOrderCb: (() => void) | null = null;
  private verifiedNextOrderArmed = false;
  /** Last server-backed report state, used only by the display projection. */
  private verifiedDeploymentState: HUDVerifiedDeploymentState | null = null;
  /** Existing renderer-derived local learning; null means no valid correction exists. */
  private impactLearningCue: BattleCommandImpactLearningCue | null = null;
  private liveMatchDiagnosticsProvider: (() => LiveMatchSnapshot | undefined) | null = null;
  private liveMatchInspectorEl!: HTMLElement;
  private liveMatchInspectorDataEl!: HTMLElement;
  private liveMatchInspectorCopyEl!: HTMLButtonElement;
  private liveMatchInspectorCloseEl!: HTMLButtonElement;
  private liveMatchInspectorMenuEl!: HTMLButtonElement;
  private liveMatchInspectorPreviousFocus: HTMLElement | null = null;

  // Shared command callbacks. The responsive rail owns one semantic control set;
  // main.ts wires these to InputHandler's public steps.
  private touchAngleCb: ((delta: number) => void) | null = null;
  private touchPowerCb: ((delta: number) => void) | null = null;
  private touchWeaponCb: (() => void) | null = null;
  /** Toggle for the deterministic trajectory projection, shared by G and touch. */
  private aimGuideCb: (() => void) | null = null;
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
  private weaponEl!: HTMLElement;
  private weaponValueEl!: HTMLElement;
  private weaponAmmoEl!: HTMLElement;
  private commanderHealthEl!: HTMLElement;
  private aimEl!: HTMLElement;
  /** Aim readout sub-node: pending / flight / resolving progress text. */
  private aimTextEl!: HTMLElement;
  /** Persistent round-format summary in the side ledger. */
  private roundEl!: HTMLElement;
  /** Persistent free-for-all/team orientation for the match ledger. */
  private matchModeEl!: HTMLElement;
  /** Local Quick Duel operation briefing; absent on all other routes. */
  private quickOperationEl!: HTMLElement;
  private quickOperation: { readonly title: string; readonly briefing: string } | null = null;
  private overlayEl!: HTMLElement;
  /** In-game PAUSE overlay (opened by the side-panel Menu button). Non-destructive:
   *  the client/engine keeps running underneath, so Resume returns to the live game. */
  private pauseEl!: HTMLElement;
  private pauseResumeBtnEl!: HTMLButtonElement;
  private pauseReplayFirstSalvoBtnEl!: HTMLButtonElement;
  private pauseActionsEl!: HTMLElement;
  private pausePreviousFocus: HTMLElement | null = null;
  private overlayTextEl!: HTMLElement;
  /** Final scoreboard table inside the GAME_OVER panel (round wins / kills / damage). */
  private overlayScoreEl!: HTMLElement;
  private overlayStatusEl!: HTMLElement;
  private overlayQuickOperationEl!: HTMLElement;
  private overlayFieldOrderEl!: HTMLElement;
  private overlayProgressionReceiptEl!: HTMLElement;
  private overlayProgressionHandoffEl!: HTMLElement;
  private overlayProgressionSignInBtnEl!: HTMLButtonElement;
  private overlayVerifiedRetryBtnEl!: HTMLButtonElement;
  private overlayTankEl!: HTMLCanvasElement;
  private overlayPrimaryBtnEl!: HTMLButtonElement;
  private overlayMenuBtnEl!: HTMLButtonElement;
  private overlayPreviousFocus: HTMLElement | null = null;
  private terminalPayoffStatusEl!: HTMLElement;
  private terminalState: GameState | null = null;
  private terminalImpactComplete = false;
  private terminalPayoffTimer: ReturnType<typeof setTimeout> | null = null;
  private terminalPayoffLocked = false;
  private terminalPayoffRootWasInert = false;
  private terminalPayoffOverlayWasInert = false;
  private readonly reduceMotion: boolean;
  private verifiedStatusEl!: HTMLElement;
  private verifiedBudgetEl!: HTMLElement;
  private verifiedDeadlineEl!: HTMLElement;
  private verifiedStateEl!: HTMLElement;
  private fieldOrderEl!: HTMLElement;
  private verifiedRetryBtnEl!: HTMLButtonElement;
  private verifiedExpiryEl!: HTMLElement;
  private verifiedContinueBtnEl!: HTMLButtonElement;
  private verifiedBatteryBtnEl!: HTMLButtonElement;
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
  private arsenalDrawerCloseEl!: HTMLButtonElement;
  private stripBodyEl!: HTMLElement;
  private stripCollapsed = false;
  private weaponIntelEl!: HTMLElement;
  private weaponIntelNameEl!: HTMLElement;
  private weaponIntelAmmoEl!: HTMLElement;
  private weaponIntelRoleEl!: HTMLElement;
  private weaponIntelTerrainEl!: HTMLElement;
  private weaponIntelDamageEl!: HTMLElement;
  private weaponIntelUseCaseEl!: HTMLElement;
  private selectedIntelWeapon: WeaponType = 'baby_missile';
  private focusedIntelWeapon: WeaponType | null = null;
  private pointedIntelWeapon: WeaponType | null = null;
  private intelInputMode: 'keyboard' | 'pointer' = 'keyboard';
  private pointerIntelFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private renderedIntelWeapon: WeaponType | null = null;
  private renderedIntelAmmo: string | null = null;
  private storeBtnEl!: HTMLButtonElement;
  private storeBtnLabelEl!: HTMLElement;
  private commandConsoleEl!: HTMLElement;
  private consoleContextEl!: HTMLElement;
  private lastSalvoEl!: HTMLElement;
  private lastSalvoReadoutEl!: HTMLElement;
  private lastSalvoCorrectionEl!: HTMLElement;
  private lastSalvoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private consoleSolutionEl!: HTMLElement;
  private consoleCommitmentEl!: HTMLElement;
  private matchDrawerBtnEl!: HTMLButtonElement;
  private matchDrawerCloseEl!: HTMLButtonElement;
  private consoleStateEl!: HTMLElement;
  private consoleExplanationEl!: HTMLElement;

  private turnActionsEl!: HTMLElement;
  private primaryActionBtnEl!: HTMLButtonElement;
  private primaryActionLabelEl!: HTMLElement;
  private firstSalvoEl!: HTMLElement;
  private firstSalvoProgressEl!: HTMLElement;
  private firstSalvoCopyEl!: HTMLElement;
  private firstSalvoStatusEl!: HTMLElement;
  private firstSalvoBriefingEl!: HTMLElement;
  private firstSalvoBriefingEnterBtnEl!: HTMLButtonElement;
  private firstSalvoBriefingAcknowledged = false;
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
  private quickChatRootEl!: HTMLElement;
  private quickChatPanelEl!: HTMLElement;
  private quickChatToggleEl!: HTMLButtonElement;

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

  /** Responsive solution controls share one authority gate across input types. */
  private solutionTurnCommandBtns: HTMLButtonElement[] = [];
  private solutionWeaponCommandBtnEl!: HTMLButtonElement;
  private solutionAdjustmentsEl!: HTMLElement;
  private solutionAngleValueEl!: HTMLElement;
  private solutionPowerValueEl!: HTMLElement;
  private solutionWindValueEl!: HTMLElement;

  constructor(
    root: HTMLElement,
    overlayRoot: HTMLElement,
    modalRoot: HTMLElement,
    railRoot: HTMLElement,
  ) {
    this.root = root;
    this.overlayRoot = overlayRoot;
    this.modalRoot = modalRoot;
    // Legacy isolated HUD mounts supplied the overlay as the fourth argument
    // before the protected rail existed. Keep those tests and embedders on the
    // original side-panel topology; real gameplay always supplies #battle-rail.
    this.railRoot = railRoot === overlayRoot ? root : railRoot;
    this.reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  /** Register the callback fired by the anonymous After Action sign-in handoff. */
  onProgressionSignIn(cb: () => void): void {
    this.progressionSignInCb = cb;
  }

  onVerifiedRetry(cb: () => void): void { this.verifiedRetryCb = cb; }
  onVerifiedContinueCasual(cb: () => void): void { this.verifiedContinueCasualCb = cb; }
  onVerifiedReturnToBattery(cb: () => void): void { this.verifiedReturnToBatteryCb = cb; }
  onVerifiedNextOrder(cb: () => void): void { this.verifiedNextOrderCb = cb; }

  /** Accepts only a cue already admitted by the renderer's local-shot validity rules. */
  setImpactLearningCue(cue: BattleCommandImpactLearningCue | null): void {
    this.impactLearningCue = cue;
  }

  /** Enables the read-only maintainer inspector only for an explicit safe snapshot provider. */
  setLiveMatchDiagnostics(provider: (() => LiveMatchSnapshot | undefined) | null): void {
    this.liveMatchDiagnosticsProvider = provider;
    if (this.built) this.syncLiveMatchDiagnostics();
  }

  /** Register a local presentation-state callback for immediate input teardown. */
  onPauseChange(cb: (paused: boolean) => void): void {
    this.pauseChangeCb = cb;
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
    const previousStep = this.firstSalvoStep;
    this.firstSalvoStep = step;
    if (step === null) this.firstSalvoBriefingAcknowledged = false;
    if (!this.built) return;
    if (previousStep === null && step !== null && !this.firstSalvoBriefingAcknowledged) {
      this.showFirstSalvoBriefing();
    }
    this.syncFirstSalvo();
  }

  /** Presentation-only input gate while the First Salvo entry briefing owns focus. */
  isFirstSalvoBriefingOpen(): boolean {
    return this.built && !this.firstSalvoBriefingEl.hidden;
  }

  /**
   * Set the room's arms level (0–4) so the store can show above-level weapons/accessories as locked.
   * UI-only: the engine independently enforces the same gate in `applyBuy`, so a stale or unset value
   * never causes a desync — it only changes which rows LOOK buyable. Called once at game creation.
   */
  setArmsLevel(level: number): void {
    this.armsLevel = level;
  }

  // Shared fine/coarse command registrations.
  onTouchAngle(cb: (delta: number) => void): void { this.touchAngleCb = cb; }
  onTouchPower(cb: (delta: number) => void): void { this.touchPowerCb = cb; }
  onTouchWeapon(cb: () => void): void { this.touchWeaponCb = cb; }
  onAimGuide(cb: () => void): void { this.aimGuideCb = cb; }
  /** Register the shared Fire / Activate shield action. */
  onPrimaryAction(cb: () => void): void { this.primaryActionCb = cb; }
  /** Register one bounded left/right movement commitment. */
  onMove(cb: (delta: number) => void): void { this.moveCb = cb; }
  onQuickChat(cb: (key: QuickChatKey) => void): void { this.quickChatCb = cb; }

  setQuickChatEnabled(enabled: boolean): void {
    this.quickChatEnabled = enabled;
    if (this.built) this.syncQuickChatAvailability();
  }

  showQuickChat(message: { key: QuickChatKey; playerName: string }): void {
    if (!this.built) this.build();
    this.flashMessage(`${message.playerName}: ${QUICK_CHAT_MESSAGES[message.key]}`);
  }

  /** Update the overlay to reflect the latest game state (called every frame). */
  update(
    state: GameState,
    isFiring = false,
    canControl = true,
    activeIsLocal = canControl,
    verifiedInputAllowed = true,
  ): void {
    if (!this.built) this.build();

    this.syncBattleCommandState(state, isFiring, canControl, activeIsLocal, verifiedInputAllowed);

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

  /** Keep the rail's promise honest while the authoritative engine changes phase. */
  private syncBattleCommandState(
    state: GameState,
    isFiring: boolean,
    canControl: boolean,
    activeIsLocal: boolean,
    verifiedInputAllowed: boolean,
  ): void {
    const command = battleCommandStateFor(state, isFiring, canControl, {
      activeIsLocal,
      verifiedInputAllowed,
      verifiedDeployment: this.verifiedDeploymentState,
      impactLearningCue: this.impactLearningCue,
    });
    const combatFocus: CombatFocus = command.commitment.phase === 'decision'
      ? 'decision'
      : command.commitment.phase === 'submitting'
        || command.commitment.phase === 'tracking'
        || command.commitment.phase === 'resolving'
        ? 'outcome'
        : 'terminal';
    this.syncCombatFocus(combatFocus);
    this.consoleCommitmentEl.dataset['commandMode'] = command.commitment.phase;
    this.consoleCommitmentEl.dataset['commandPhase'] = command.commitment.phase;
    this.consoleCommitmentEl.dataset['phaseLabel'] = command.context.phaseLabel;
    this.commandConsoleEl.dataset['commandPhase'] = command.commitment.phase;
    this.commandConsoleEl.dataset['phaseLabel'] = command.context.phaseLabel;
    const commander = command.context.commander;
    if (commander === null) {
      delete this.consoleCommitmentEl.dataset['commanderId'];
      delete this.commandConsoleEl.dataset['commanderId'];
    } else {
      this.consoleCommitmentEl.dataset['commanderId'] = commander.id;
      this.commandConsoleEl.dataset['commanderId'] = commander.id;
    }
    const text = command.commitment.commit !== null
      ? `${command.commitment.label} · ${commander?.name ?? 'Commander'}`
      : `${command.commitment.label}${commander ? ` · ${commander.name}` : ''}`;
    if (this.consoleStateEl.textContent !== text) this.consoleStateEl.textContent = text;
    if (command.commitment.explanation === null) {
      this.consoleStateEl.removeAttribute('title');
    } else if (this.consoleStateEl.title !== command.commitment.explanation) {
      this.consoleStateEl.title = command.commitment.explanation;
    }
    this.syncCommitmentPresentation(
      command.commitment.phase,
      command.commitment.commit !== null,
      command.commitment.explanation ?? command.commitment.label,
    );
    this.syncLastSalvoCue(command.context.lastSalvo);
  }


  /** Present only the projection's live, renderer-admitted learning cue. */
  private syncLastSalvoCue(cue: BattleCommandImpactLearningCue | null): void {
    if (cue === null) {
      if (this.lastSalvoEl.hidden || this.lastSalvoHideTimer !== null) return;
      this.lastSalvoHideTimer = setTimeout(() => {
        this.lastSalvoHideTimer = null;
        this.lastSalvoEl.hidden = true;
        this.lastSalvoReadoutEl.textContent = '';
        this.lastSalvoCorrectionEl.textContent = '';
      }, 1_400);
      return;
    }
    if (this.lastSalvoHideTimer !== null) {
      clearTimeout(this.lastSalvoHideTimer);
      this.lastSalvoHideTimer = null;
    }
    this.lastSalvoEl.hidden = false;
    this.lastSalvoReadoutEl.textContent = cue.readout;
    this.lastSalvoCorrectionEl.textContent = cue.correction;
  }

  /** Replace a committed decision with phase context; never leave an inert Fire affordance. */
  private syncCommitmentPresentation(
    phase: BattleCommandCommitmentPhase,
    hasCommit: boolean,
    explanation: string,
  ): void {
    if (hasCommit) {
      // Weapon, angle, power, and wind already have one live visual owner in
      // Fire Control. The terminal owns only commitment state and the one
      // irreversible action; duplicating the solution here would create a
      // second ballistic panel with divergent hierarchy.
      this.consoleExplanationEl.hidden = true;
      this.consoleExplanationEl.textContent = '';
      if (!this.aimEl.isConnected) {
        const coach = this.firstSalvoEl?.parentElement === this.consoleCommitmentEl
          ? this.firstSalvoEl
          : null;
        this.consoleCommitmentEl.insertBefore(this.aimEl, coach);
      }
      // Touch keeps its coach in the solution value band, but it still owns
      // the sole primary action until dismissed; Aim/Power remain available.
      const coachOwnsPrimary = !this.firstSalvoEl.classList.contains('st-hud__first-salvo--hidden')
        && (this.firstSalvoEl.parentElement === this.consoleCommitmentEl
          || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));
      if (!coachOwnsPrimary && !this.turnActionsEl.isConnected) {
        this.consoleCommitmentEl.append(this.turnActionsEl);
      }
      return;
    }

    const focusedCombatControl = this.turnActionsEl.contains(document.activeElement);
    this.turnActionsEl.remove();
    const tracksOutcome = phase === 'submitting' || phase === 'tracking' || phase === 'resolving';
    if (tracksOutcome) {
      if (!this.aimEl.isConnected) this.consoleCommitmentEl.append(this.aimEl);
    } else {
      this.aimEl.remove();
    }
    this.consoleExplanationEl.hidden = false;
    if (this.consoleExplanationEl.textContent !== explanation) {
      this.consoleExplanationEl.textContent = explanation;
    }
    if (focusedCombatControl) this.consoleStateEl.focus({ preventScroll: true });
  }

  private syncCombatFocus(focus: CombatFocus): void {
    this.root.dataset['combatFocus'] = focus;
    this.overlayRoot.dataset['combatFocus'] = focus;
    this.railRoot.dataset['combatFocus'] = focus;
    // These are mixed-interactivity regions: the Command Menu remains available
    // while direct combat controls are disabled. Keep disabled semantics on the
    // controls are disabled. Keep disabled semantics on the individual controls
    // and describe the current mode at the region boundary instead.
    this.commandConsoleEl.removeAttribute('aria-disabled');
    if (focus === 'decision') {
      this.commandConsoleEl.setAttribute('aria-label', 'Turn command console');
    } else if (focus === 'outcome') {
      this.commandConsoleEl.setAttribute(
        'aria-label',
        'Shot outcome in progress. Combat controls unavailable; Command Menu remains available.',
      );
    } else {
      this.commandConsoleEl.setAttribute(
        'aria-label',
        'Turn command console outside an active turn. Combat controls inactive; Command Menu remains available.',
      );
    }
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
    this.matchModeEl.textContent = state.tanks.some((tank) => tank.team === 1 || tank.team === 2)
      ? 'Team battle'
      : 'Free-for-all';
    this.roundEl.classList.remove('st-hud__round--hidden');
    this.roundEl.textContent = multi
      ? `Round ${state.round} of ${state.totalRounds}`
      : 'Single round';

    if (state.round > this.lastSeenRound && state.phase !== 'GAME_OVER') {
      const completed = state.round - 1;
      const winner = state.tanks.find((t) => t.id === state.lastRoundWinnerId);
      this.flashMessage(
        winner
          ? `${winner.playerName}${state.lastRoundWinnerTeam ? ` (Team ${state.lastRoundWinnerTeam})` : ''} won round ${completed}`
          : `Round ${completed} drawn`,
      );
    }
    this.lastSeenRound = state.round;
  }

  /** Build the static DOM scaffold + inject styles. Runs once (idempotent). */
  private build(): void {
    HUD.injectStyle();
    this.root.classList.add('st-hud', 'st-ui-shell');
    this.root.dataset['ui'] = 'match-ledger';
    this.root.setAttribute('role', 'complementary');
    this.root.setAttribute('aria-label', 'Match ledger');
    this.root.innerHTML = '';

    this.buildPlayers();
    this.buildVerifiedDeployment();
    this.buildRound();
    this.buildActiveRow();
    this.buildArsenal();
    const controls = this.buildSolutionControls();
    this.buildStore();
    this.buildTurnActions();
    this.buildCommandConsole(controls);
    this.buildEndScreens();
    this.buildRoundShop();
    const menu = this.buildMenu();
    this.buildMatchDrawer();
    this.buildLiveness();
    this.buildFirstSalvoCoach();
    this.buildLiveMatchDiagnostics();

    this.root.append(
      this.matchDrawerCloseEl,
      menu,
      this.matchModeEl,
      this.quickOperationEl,
      this.roundEl,
      this.playersEl,
      this.connBannerEl,
    );
    // buildArsenal resolves the persisted state before the rail children exist;
    // re-apply it now so a stored-open drawer also isolates covered controls.
    this.applyStripCollapsed();
    // Quick Chat stays outside the match ledger. Transient send/turn notices
    // stay with the protected command rail; combat input never gets a second
    // overlay-only touch surface.
    this.overlayRoot.append(this.quickChatRootEl, this.matchDrawerBtnEl);
    this.railRoot.append(
      this.commandConsoleEl,
      this.toastEl,
      this.turnWatchEl,
    );
    this.modalRoot.append(
      this.terminalPayoffStatusEl,
      this.storeEl,
      this.overlayEl,
      this.roundOverEl,
      this.pauseEl,
      this.verifiedExpiryEl,
      this.liveMatchInspectorEl,
      this.firstSalvoBriefingEl,
    );
    this.built = true;
    // Splash dismissal can happen after an entry briefing was made visible.
    // Reclaim focus only if that modal still owns the interaction; ordinary
    // matches and a dismissed briefing remain completely unaffected.
    window.addEventListener('st:splash-dismissed', () => {
      if (this.isFirstSalvoBriefingOpen()) {
        this.firstSalvoBriefingEnterBtnEl.focus({ preventScroll: true });
      }
    });
    this.syncFirstSalvo();
    this.syncQuickChatAvailability();
    this.syncLiveMatchDiagnostics();
  }

  /** Player health-bar column (top-left). */
  private buildPlayers(): void {
    this.playersEl = document.createElement('ol');
    this.playersEl.className = 'st-hud__players st-ui-section st-ui-section--roster';
    this.playersEl.setAttribute('aria-label', 'Turn order');
  }

  /** Round indicator (side panel): "Round N of M". */
  private buildRound(): void {
    this.matchModeEl = document.createElement('div');
    this.matchModeEl.className = 'st-hud__match-mode st-ui-section';
    this.matchModeEl.dataset['ui'] = 'match-mode';
    this.matchModeEl.textContent = 'Free-for-all';

    this.quickOperationEl = document.createElement('div');
    this.quickOperationEl.className = 'st-hud__match-mode st-ui-section';
    this.quickOperationEl.dataset['ui'] = 'quick-operation';
    this.quickOperationEl.hidden = true;

    // Round indicator (side panel): "Round N of M" — hidden in single-round matches.
    this.roundEl = document.createElement('div');
    this.roundEl.className = 'st-hud__round st-ui-section st-ui-section--round';
  }

  /** Displays local-only Quick Duel context without influencing match authority. */
  setQuickOperation(operation: { readonly title: string; readonly briefing: string } | null): void {
    if (!this.built) this.build();
    this.quickOperation = operation;
    this.quickOperationEl.hidden = operation === null;
    this.overlayQuickOperationEl.hidden = operation === null;
    this.overlayQuickOperationEl.textContent = operation === null
      ? ''
      : `Operation · ${operation.title} — ${operation.briefing}`;
    this.quickOperationEl.textContent = operation === null ? '' : `${operation.title} · ${operation.briefing}`;
  }

  /** Compact, in-shell status for an authenticated verified deployment. */
  private buildVerifiedDeployment(): void {
    this.verifiedStatusEl = document.createElement('section');
    this.verifiedStatusEl.className =
      'st-hud__verified-deployment st-ui-section st-ui-section--verified';
    this.verifiedStatusEl.setAttribute('role', 'status');
    this.verifiedStatusEl.setAttribute('aria-live', 'polite');
    this.verifiedStatusEl.setAttribute('aria-atomic', 'true');
    this.verifiedStatusEl.hidden = true;

    const title = document.createElement('div');
    title.className = 'st-hud__verified-title';
    title.textContent = 'Verified deployment';
    this.verifiedBudgetEl = document.createElement('div');
    this.verifiedBudgetEl.className = 'st-hud__verified-budget';
    this.verifiedDeadlineEl = document.createElement('div');
    this.verifiedDeadlineEl.className = 'st-hud__verified-deadline';
    this.verifiedStateEl = document.createElement('div');
    this.verifiedStateEl.className = 'st-hud__verified-state';
    this.fieldOrderEl = document.createElement('div');
    this.fieldOrderEl.className = 'st-hud__field-order';
    this.fieldOrderEl.dataset['ui'] = 'field-order';
    this.fieldOrderEl.setAttribute('role', 'status');
    this.fieldOrderEl.setAttribute('aria-live', 'polite');
    this.fieldOrderEl.hidden = true;
    this.verifiedRetryBtnEl = document.createElement('button');
    this.verifiedRetryBtnEl.type = 'button';
    this.verifiedRetryBtnEl.className = 'st-hud__verified-retry';
    this.verifiedRetryBtnEl.textContent = 'Retry verification';
    this.verifiedRetryBtnEl.hidden = true;
    this.verifiedRetryBtnEl.addEventListener('click', () => {
      if (!this.verifiedRetryBtnEl.hidden && !this.verifiedRetryBtnEl.disabled) {
        this.verifiedRetryCb?.();
      }
    });
    this.verifiedStatusEl.append(
      title,
      this.verifiedBudgetEl,
      this.verifiedDeadlineEl,
      this.verifiedStateEl,
      this.fieldOrderEl,
      this.verifiedRetryBtnEl,
    );

    this.verifiedExpiryEl = document.createElement('section');
    this.verifiedExpiryEl.className = 'st-hud__verified-expiry';
    this.verifiedExpiryEl.setAttribute('role', 'dialog');
    this.verifiedExpiryEl.setAttribute('aria-modal', 'true');
    this.verifiedExpiryEl.setAttribute('aria-labelledby', 'st-verified-expiry-title');
    this.verifiedExpiryEl.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'st-hud__verified-expiry-panel';
    const expiryTitle = document.createElement('h2');
    expiryTitle.id = 'st-verified-expiry-title';
    expiryTitle.textContent = 'Verification expired';
    const expiryCopy = document.createElement('p');
    expiryCopy.textContent = 'Choose how to continue this battle.';
    const actions = document.createElement('div');
    actions.className = 'st-hud__verified-expiry-actions';
    this.verifiedContinueBtnEl = document.createElement('button');
    this.verifiedContinueBtnEl.type = 'button';
    this.verifiedContinueBtnEl.className = 'st-hud__verified-continue';
    this.verifiedContinueBtnEl.textContent = 'Continue casually';
    this.verifiedContinueBtnEl.addEventListener('click', () => {
      if (!this.verifiedExpiryEl.hidden) this.verifiedContinueCasualCb?.();
    });
    this.verifiedBatteryBtnEl = document.createElement('button');
    this.verifiedBatteryBtnEl.type = 'button';
    this.verifiedBatteryBtnEl.className = 'st-hud__verified-battery';
    this.verifiedBatteryBtnEl.textContent = 'Return to Battery';
    this.verifiedBatteryBtnEl.addEventListener('click', () => {
      if (!this.verifiedExpiryEl.hidden) this.verifiedReturnToBatteryCb?.();
    });
    actions.append(this.verifiedContinueBtnEl, this.verifiedBatteryBtnEl);
    panel.append(expiryTitle, expiryCopy, actions);
    this.verifiedExpiryEl.append(panel);
    this.verifiedExpiryEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || this.verifiedExpiryEl.hidden) return;
      event.preventDefault();
      const actions = [this.verifiedContinueBtnEl, this.verifiedBatteryBtnEl];
      const current = actions.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? actions.length - 1 : current - 1)
        : (current < 0 || current === actions.length - 1 ? 0 : current + 1);
      actions[next]!.focus({ preventScroll: true });
    });
  }

  /** Active-player + weapon readout row, plus shot-progress status. */
  private buildActiveRow(): void {
    // ── Active player + weapon name row (replaces aim text + old wind/weapon blocks) ──
    // This shows "PlayerName  ·  WeaponName" in one compact row. It persists below the
    // decision controls and is hidden while the shot-progress status is shown.
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

    // Active weapon readout — kept as a text row (the spec says it may be
    // repositioned"). Placed inside activePlayerEl alongside the player name.
    const owner = document.createElement('div');
    owner.className = 'st-hud__turn-identity';
    const ownerKicker = document.createElement('span');
    ownerKicker.className = 'st-hud__turn-kicker';
    ownerKicker.textContent = 'Active turn';
    this.turnOwnerEl = document.createElement('span');
    this.turnOwnerEl.className = 'st-hud__turn-owner';
    this.commanderHealthEl = document.createElement('span');
    this.commanderHealthEl.className = 'st-hud__commander-health';
    this.commanderHealthEl.dataset['ui'] = 'commander-health';
    this.commanderHealthEl.setAttribute('aria-label', 'No active commander health');
    owner.append(ownerKicker, this.turnOwnerEl, this.commanderHealthEl);
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

    const weapon = document.createElement('section');
    weapon.className = 'st-hud__weapon';
    weapon.dataset['ui'] = 'weapon-bay';
    weapon.dataset['valueOwner'] = 'weapon';
    weapon.setAttribute('aria-label', 'Weapon and ammunition');
    this.weaponEl = weapon;
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
    this.weaponAmmoEl = document.createElement('span');
    this.weaponAmmoEl.className = 'st-hud__weapon-ammo';
    weaponCopy.append(weaponLabel, this.weaponValueEl, this.weaponAmmoEl);
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
    tactical.append(mobility);

    // Identity and mobility stay together as commander context. Weapon choice
    // belongs to the lower-rail firing solution built below.
    this.turnStatusEl.append(owner);
    this.activePlayerEl.append(identity, tactical);
  }

  /** Fine-pointer controls that directly adjust the authoritative firing solution. */
  private buildSolutionControls(): HTMLElement {
    const makeControl = (
      action: string,
      key: string,
      label: string,
      direction: string,
      run: () => void,
      firstSalvoTarget?: string,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'st-hud__solution-control';
      button.dataset['commandAction'] = action;
      button.setAttribute('aria-label', label);
      if (firstSalvoTarget) button.dataset['firstSalvoTarget'] = firstSalvoTarget;
      const directionEl = document.createElement('span');
      directionEl.className = 'st-hud__solution-direction';
      directionEl.setAttribute('aria-hidden', 'true');
      directionEl.textContent = direction;
      const hint = document.createElement('kbd');
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = key;
      button.append(directionEl, hint);
      button.addEventListener('click', run);
      this.solutionTurnCommandBtns.push(button);
      return button;
    };

    this.solutionWeaponCommandBtnEl = makeControl(
      'weapon-next',
      'Q',
      'Select next weapon',
      '›',
      () => this.touchWeaponCb?.(),
    );
    this.weaponEl.append(this.solutionWeaponCommandBtnEl, this.stripToggleEl);

    const controls = document.createElement('div');
    controls.className = 'st-hud__solution-adjustments';
    controls.dataset['ui'] = 'solution-adjustments';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Angle and power adjustments');
    this.solutionAdjustmentsEl = controls;

    const makeGroup = (
      control: 'angle' | 'power',
      label: string,
      buttons: HTMLButtonElement[],
    ): { readonly group: HTMLElement; readonly value: HTMLElement } => {
      const group = document.createElement('div');
      group.className = 'st-hud__solution-adjustment';
      group.dataset['control'] = control;
      group.dataset['valueOwner'] = control;
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      const title = document.createElement('span');
      title.className = 'st-hud__solution-adjustment-label';
      title.textContent = label;
      const value = document.createElement('output');
      value.className = 'st-hud__solution-adjustment-value';
      value.setAttribute('aria-live', 'off');
      group.append(title, value, ...buttons);
      return { group, value };
    };
    const angle = makeGroup('angle', 'Angle', [
      makeControl('aim-left', '←', 'Aim barrel left', '−', () => this.touchAngleCb?.(3), 'aim'),
      makeControl('aim-right', '→', 'Aim barrel right', '+', () => this.touchAngleCb?.(-3), 'aim'),
    ]);
    const power = makeGroup('power', 'Power', [
      makeControl('power-down', '↓', 'Decrease power', '−', () => this.touchPowerCb?.(-3), 'power-and-wind'),
      makeControl('power-up', '↑', 'Increase power', '+', () => this.touchPowerCb?.(3), 'power-and-wind'),
    ]);
    this.solutionAngleValueEl = angle.value;
    this.solutionPowerValueEl = power.value;
    const wind = document.createElement('div');
    wind.className = 'st-hud__solution-wind';
    wind.dataset['valueOwner'] = 'wind';
    wind.dataset['firstSalvoTarget'] = 'power-and-wind';
    wind.setAttribute('aria-label', 'Wind');
    const windLabel = document.createElement('span');
    windLabel.className = 'st-hud__solution-adjustment-label';
    windLabel.textContent = 'Wind';
    this.solutionWindValueEl = document.createElement('output');
    this.solutionWindValueEl.className = 'st-hud__solution-adjustment-value';
    wind.append(windLabel, this.solutionWindValueEl);
    const guide = document.createElement('button');
    guide.type = 'button';
    guide.className = 'st-hud__trajectory-guide';
    guide.dataset['ui'] = 'deterministic-aim-guide';
    guide.dataset['guideModel'] = 'fixed-step-ballistic';
    guide.setAttribute('aria-label', 'Deterministic trajectory guide on the battlefield');
    const guideLabel = document.createElement('span');
    guideLabel.className = 'st-hud__trajectory-guide-label';
    guideLabel.textContent = 'Guide';
    const guideHint = document.createElement('kbd');
    guideHint.setAttribute('aria-hidden', 'true');
    guideHint.textContent = 'G';
    guide.append(makeHudGlyph('aim', 14), guideLabel, guideHint);
    guide.addEventListener('click', () => this.aimGuideCb?.());
    // The trajectory guide is live firing context, not a fourth command card.
    // Keeping it with Wind makes its global-G hint available without reserving a
    // separate row in the protected battle rail.
    wind.append(guide);
    controls.append(angle.group, power.group, wind);
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
    this.stripEl.setAttribute('role', 'dialog');
    this.stripEl.setAttribute('aria-modal', 'true');
    // The trigger lives in the weapon bay; the drawer itself stays one reusable
    // owned-only surface and keeps its persisted disclosure state.
    const stripToggle = document.createElement('button');
    stripToggle.type = 'button';
    stripToggle.className = 'st-hud__strip-toggle st-ui-icon-action st-hud__arsenal-trigger';
    const stripToggleLabel = document.createElement('span');
    stripToggleLabel.className = 'st-hud__strip-toggle-label';
    stripToggle.append(
      makeHudGlyph('arsenal', 15),
      stripToggleLabel,
      makeHudIcon('disclosure', 16),
    );
    stripToggle.addEventListener('click', () => this.toggleStripCollapsed());
    this.stripToggleEl = stripToggle;
    this.stripToggleLabelEl = stripToggleLabel;
    const stripBody = document.createElement('div');
    stripBody.className = 'st-hud__strip-body';
    stripBody.id = `st-hud-arsenal-drawer-${HUD.arsenalDrawerSequence++}`;
    this.stripBodyEl = stripBody;
    const drawerHeader = document.createElement('div');
    drawerHeader.className = 'st-hud__arsenal-drawer-header';
    const drawerTitle = document.createElement('span');
    drawerTitle.className = 'st-hud__arsenal-drawer-title';
    drawerTitle.id = `st-hud-armory-title-${HUD.arsenalDrawerSequence}`;
    drawerTitle.textContent = 'Armory';
    this.stripEl.setAttribute('aria-labelledby', drawerTitle.id);
    this.arsenalDrawerCloseEl = document.createElement('button');
    this.arsenalDrawerCloseEl.type = 'button';
    this.arsenalDrawerCloseEl.className = 'st-hud__arsenal-drawer-close';
    this.arsenalDrawerCloseEl.setAttribute('aria-label', 'Close Armory');
    this.arsenalDrawerCloseEl.textContent = 'Close';
    this.arsenalDrawerCloseEl.addEventListener('click', () => this.closeArmory());
    drawerHeader.append(drawerTitle, this.arsenalDrawerCloseEl);
    const stripGrid = document.createElement('div');
    stripGrid.className = 'st-hud__strip-grid';
    stripGrid.id = `${stripBody.id}-grid`;
    stripGrid.setAttribute('role', 'region');
    stripGrid.setAttribute('aria-label', 'Weapon arsenal');
    stripToggle.setAttribute('aria-controls', stripBody.id);
    const intel = document.createElement('section');
    intel.className = 'st-hud__weapon-intel';
    intel.id = `${stripGrid.id}-intel`;
    intel.setAttribute('role', 'status');
    intel.setAttribute('aria-live', 'polite');
    intel.setAttribute('aria-atomic', 'true');
    intel.tabIndex = 0;
    const intelHeader = document.createElement('div');
    intelHeader.className = 'st-hud__weapon-intel-header';
    const intelName = document.createElement('h3');
    intelName.className = 'st-hud__weapon-intel-name';
    intelName.id = `${intel.id}-heading`;
    intel.setAttribute('aria-labelledby', intelName.id);
    const intelAmmo = document.createElement('span');
    intelAmmo.className = 'st-hud__weapon-intel-ammo';
    intelHeader.append(intelName, intelAmmo);
    const makeIntelField = (label: string, field: keyof typeof WEAPON_INTEL.baby_missile) => {
      const row = document.createElement('p');
      row.className = 'st-hud__weapon-intel-field';
      row.dataset['intelField'] = field;
      const term = document.createElement('span');
      term.className = 'st-hud__weapon-intel-label';
      term.textContent = label;
      const value = document.createElement('span');
      value.className = 'st-hud__weapon-intel-value';
      row.append(term, value);
      return { row, value };
    };
    const role = makeIntelField('Role', 'role');
    const terrain = makeIntelField('Terrain', 'terrain');
    const damage = makeIntelField('Effect', 'damage');
    const useCase = makeIntelField('Use', 'useCase');
    intel.append(intelHeader, role.row, terrain.row, damage.row, useCase.row);
    this.weaponIntelEl = intel;
    this.weaponIntelNameEl = intelName;
    this.weaponIntelAmmoEl = intelAmmo;
    this.weaponIntelRoleEl = role.value;
    this.weaponIntelTerrainEl = terrain.value;
    this.weaponIntelDamageEl = damage.value;
    this.weaponIntelUseCaseEl = useCase.value;
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
      btn.setAttribute('aria-describedby', intel.id);
      // Capture `type` per-iteration (for-of/const). Listener attached once.
      btn.addEventListener('focus', () => {
        this.focusedIntelWeapon = type;
        if (this.intelInputMode === 'keyboard') this.renderWeaponIntel();
      });
      btn.addEventListener('blur', () => {
        if (this.focusedIntelWeapon === type) this.focusedIntelWeapon = null;
        this.renderWeaponIntel();
      });
      btn.addEventListener('pointerdown', () => {
        this.cancelPointerIntelFallback();
        this.intelInputMode = 'pointer';
        this.pointedIntelWeapon = null;
      });
      btn.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        this.cancelPointerIntelFallback();
        if (this.pointedIntelWeapon === type) return;
        this.pointedIntelWeapon = type;
        this.renderWeaponIntel();
      });
      btn.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'touch') return;
        if (this.pointedIntelWeapon === type) this.pointedIntelWeapon = null;
        this.cancelPointerIntelFallback();
        this.pointerIntelFallbackTimer = setTimeout(() => {
          this.pointerIntelFallbackTimer = null;
          if (this.pointedIntelWeapon === null) this.renderWeaponIntel();
        }, 0);
      });
      btn.addEventListener('click', () => {
        this.selectedIntelWeapon = type;
        this.renderWeaponIntel();
        this.weaponSelectCb?.(type);
      });
      this.weaponCells.set(type, { el: btn, ammo: ammoSpan });
      stripGrid.append(btn);
    }
    stripBody.append(drawerHeader, intel, stripGrid);
    this.stripEl.append(stripBody);
    this.stripEl.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
        this.intelInputMode = 'keyboard';
        this.renderWeaponIntel();
      }
      if (event.key === 'Tab' && !this.stripCollapsed) {
        const focusable = [...this.stripEl.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter((element) => !element.hidden && element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }
      }
      if (event.key !== 'Escape' || this.stripCollapsed) return;
      event.preventDefault();
      event.stopPropagation();
      this.closeArmory();
    });
    this.modalRoot.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.stripCollapsed || !this.stripEl.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      this.closeArmory();
    }, true);
    const stored = readStoredArsenalPreference();
    this.stripCollapsed = resolveInitialArsenalCollapsed(stored);
  }

  /** Render the active preview without rebuilding the dossier DOM. */
  private renderWeaponIntel(): void {
    const type = this.intelInputMode === 'keyboard'
      ? this.focusedIntelWeapon ?? this.pointedIntelWeapon ?? this.selectedIntelWeapon
      : this.pointedIntelWeapon ?? this.focusedIntelWeapon ?? this.selectedIntelWeapon;
    const definition = WEAPONS[type];
    const intel = WEAPON_INTEL[type];
    const ammo = `Ammo ${this.weaponCells.get(type)?.ammo.textContent ?? '0'}`;
    if (this.renderedIntelWeapon !== type) {
      this.weaponIntelEl.dataset['weapon'] = type;
      this.weaponIntelNameEl.textContent = definition.name;
      this.weaponIntelRoleEl.textContent = intel.role;
      this.weaponIntelTerrainEl.textContent = intel.terrain;
      this.weaponIntelDamageEl.textContent = intel.damage;
      this.weaponIntelUseCaseEl.textContent = intel.useCase;
      this.weaponIntelEl.scrollTop = 0;
      this.renderedIntelWeapon = type;
    }
    if (this.renderedIntelAmmo !== ammo) {
      this.weaponIntelAmmoEl.textContent = ammo;
      this.renderedIntelAmmo = ammo;
    }
  }

  /** Drop transient comparison state whenever the drawer or active loadout changes. */
  private resetWeaponIntelPreview(): void {
    this.cancelPointerIntelFallback();
    this.focusedIntelWeapon = null;
    this.pointedIntelWeapon = null;
    this.intelInputMode = 'keyboard';
  }

  /** Coalesce pointerleave/pointermove into one comparison announcement. */
  private cancelPointerIntelFallback(): void {
    if (this.pointerIntelFallbackTimer === null) return;
    clearTimeout(this.pointerIntelFallbackTimer);
    this.pointerIntelFallbackTimer = null;
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
    this.storeEl.setAttribute('role', 'dialog');
    this.storeEl.setAttribute('aria-modal', 'true');
    this.storeEl.setAttribute('aria-label', 'Store');
    const storePanel = document.createElement('div');
    storePanel.className = 'st-hud__store-panel';
    const storeHeader = document.createElement('div');
    storeHeader.className = 'st-hud__store-header';
    const storeTitle = document.createElement('div');
    storeTitle.className = 'st-hud__store-title';
    storeTitle.textContent = 'Store';
    this.storeCreditsEl = document.createElement('div');
    this.storeCreditsEl.className = 'st-hud__store-credits';
    const storeMenu = document.createElement('button');
    storeMenu.type = 'button';
    storeMenu.className = 'st-hud__store-menu';
    storeMenu.dataset['command'] = 'open-menu';
    storeMenu.setAttribute('aria-label', 'Open Command Menu');
    storeMenu.textContent = 'Menu';
    storeMenu.addEventListener('click', () => this.togglePause(true));
    storeHeader.append(storeTitle, this.storeCreditsEl, storeMenu);

    const catalog = document.createElement('div');
    catalog.className = 'st-hud__store-catalog';
    for (const catalogSection of STORE_CATALOG) {
      const section = document.createElement('section');
      section.className = 'st-hud__store-section';
      const title = document.createElement('h2');
      title.textContent = catalogSection.title;
      const grid = document.createElement('div');
      grid.className = 'st-hud__store-section-grid';
      for (const entry of catalogSection.entries) {
        grid.append(
          entry.kind === 'weapon'
            ? this.createStoreWeaponCard(entry.type, entry.summary)
            : this.createStoreAccessoryCard(entry.type, entry.summary),
        );
      }
      section.append(title, grid);
      catalog.append(section);
    }

    const storeClose = document.createElement('button');
    storeClose.type = 'button';
    storeClose.className = 'st-hud__store-close';
    storeClose.textContent = 'Close';
    storeClose.addEventListener('click', () => this.toggleStore(false));
    const storeFooter = document.createElement('div');
    storeFooter.className = 'st-hud__store-footer';
    storeFooter.append(storeClose);

    storePanel.append(storeHeader, catalog, storeFooter);
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

  private createStoreWeaponCard(type: WeaponType, summary: string): HTMLElement {
    const def = WEAPONS[type];
    const row = document.createElement('div');
    row.className = 'st-hud__store-row';
    const info = document.createElement('div');
    info.className = 'st-hud__store-info';
    const name = document.createElement('span');
    name.className = 'st-hud__store-name';
    name.textContent = def.name;
    const nameLine = document.createElement('div');
    nameLine.className = 'st-hud__store-name-line';
    nameLine.append(makeWeaponIcon(type, 16), name);
    const summaryEl = document.createElement('span');
    summaryEl.className = 'st-hud__store-summary';
    summaryEl.textContent = summary;
    const owned = document.createElement('span');
    owned.className = 'st-hud__store-owned';
    info.append(nameLine, summaryEl, owned);

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'st-hud__store-buy';
    buyBtn.setAttribute(
      'aria-label',
      `Buy ${def.name} for $${def.price.toLocaleString()}, bundle of ${def.bundleSize}`,
    );
    buyBtn.innerHTML =
      `<span class="st-hud__store-price">$${def.price.toLocaleString()}</span>` +
      `<span class="st-hud__store-bundle">+${def.bundleSize}</span>`;
    buyBtn.addEventListener('click', () => this.buyCb?.({ weapon: type }));
    row.append(info, buyBtn);
    this.storeCells.set(type, { buyBtn, owned });
    return row;
  }

  private createStoreAccessoryCard(key: AccessoryType, summary: string): HTMLElement {
    const acc = ACCESSORIES[key];
    const row = document.createElement('div');
    row.className = 'st-hud__store-row';
    const info = document.createElement('div');
    info.className = 'st-hud__store-info';
    const name = document.createElement('span');
    name.className = 'st-hud__store-name';
    name.textContent = acc.name;
    const summaryEl = document.createElement('span');
    summaryEl.className = 'st-hud__store-summary';
    summaryEl.textContent = summary;
    const owned = document.createElement('span');
    owned.className = 'st-hud__store-owned';
    info.append(name, summaryEl, owned);

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'st-hud__store-buy';
    buyBtn.setAttribute(
      'aria-label',
      `Buy ${acc.name} for $${acc.price.toLocaleString()}, bundle of ${acc.bundleSize}`,
    );
    buyBtn.innerHTML =
      `<span class="st-hud__store-price">$${acc.price.toLocaleString()}</span>` +
      `<span class="st-hud__store-bundle">+${acc.bundleSize}</span>`;
    buyBtn.addEventListener('click', () => this.buyCb?.({ accessory: key }));
    row.append(info, buyBtn);
    this.storeAccessoryCells.set(key, { buyBtn, owned });
    return row;
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

    this.turnActionsEl.append(this.primaryActionBtnEl);
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

    this.firstSalvoBriefingEl = document.createElement('div');
    this.firstSalvoBriefingEl.className = 'st-hud__first-salvo-briefing';
    this.firstSalvoBriefingEl.dataset['ui'] = 'first-salvo-briefing';
    this.firstSalvoBriefingEl.setAttribute('role', 'dialog');
    this.firstSalvoBriefingEl.setAttribute('aria-modal', 'true');
    this.firstSalvoBriefingEl.setAttribute('aria-labelledby', 'st-first-salvo-briefing-title');
    this.firstSalvoBriefingEl.hidden = true;
    const briefingPanel = document.createElement('section');
    briefingPanel.className = 'st-hud__first-salvo-briefing-panel';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'st-hud__first-salvo-briefing-eyebrow';
    eyebrow.textContent = 'Operational briefing';
    const title = document.createElement('h2');
    title.id = 'st-first-salvo-briefing-title';
    title.textContent = 'First Salvo';
    const briefing = document.createElement('ol');
    briefing.className = 'st-hud__first-salvo-briefing-steps';
    for (const [name, detail] of [
      ['Aim', 'Set elevation toward the target.'],
      ['Wind', 'Read the vector before setting power.'],
      ['Commit', 'Fire once the solution is ready.'],
    ] as const) {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = name;
      const copy = document.createElement('span');
      copy.textContent = detail;
      item.append(label, copy);
      briefing.append(item);
    }
    this.firstSalvoBriefingEnterBtnEl = document.createElement('button');
    this.firstSalvoBriefingEnterBtnEl.type = 'button';
    this.firstSalvoBriefingEnterBtnEl.className = 'st-hud__restart';
    this.firstSalvoBriefingEnterBtnEl.textContent = 'Enter battle';
    this.firstSalvoBriefingEnterBtnEl.addEventListener('click', () => {
      this.firstSalvoBriefingAcknowledged = true;
      this.firstSalvoBriefingEl.hidden = true;
      this.syncFirstSalvo();
      // Return focus to the stable phase rail, not an adjustment button: global
      // keyboard commands remain native while assistive tech announces readiness.
      this.consoleStateEl.focus({ preventScroll: true });
    });
    // The entry briefing has one intentional action.  Do not let Shift+Tab or
    // Tab fall through to obscured combat controls while it is modal.
    this.firstSalvoBriefingEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      this.firstSalvoBriefingEnterBtnEl.focus({ preventScroll: true });
    });
    briefingPanel.append(eyebrow, title, briefing, this.firstSalvoBriefingEnterBtnEl);
    this.firstSalvoBriefingEl.append(briefingPanel);
  }

  private showFirstSalvoBriefing(): void {
    this.firstSalvoBriefingEl.hidden = false;
    this.firstSalvoBriefingEnterBtnEl.focus({ preventScroll: true });
  }

  /** Reconciles card copy and static target rings without rebuilding DOM per frame. */
  private syncFirstSalvo(): void {
    const copy = this.firstSalvoCopyFor(this.firstSalvoStep);
    const visible = copy !== null && this.firstSalvoBriefingAcknowledged;
    this.firstSalvoEl.classList.toggle('st-hud__first-salvo--hidden', !visible);
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;

    // On touch the coach uses the value band of the firing solution: its Skip
    // target stays large without obscuring the live Aim/Power buttons below.
    const anchor = this.firstSalvoStep === 'fire' ? 'terminal' : 'solution';
    if (copy === null) delete this.firstSalvoEl.dataset['coachAnchor'];
    else this.firstSalvoEl.dataset['coachAnchor'] = anchor;
    const destination = anchor === 'terminal'
      ? this.consoleCommitmentEl
      : this.consoleSolutionEl;
    // A compact touch terminal cannot honestly show a 44px Skip target and a
    // second Fire target at once. The final coach owns that cell; dismissal
    // restores the one real primary action before ordinary play resumes.
    if (visible && (anchor === 'terminal' || coarsePointer)) this.turnActionsEl.remove();
    if (this.firstSalvoEl.parentElement !== destination) {
      destination.append(this.firstSalvoEl);
    }
    if (!visible
      && this.consoleCommitmentEl.dataset['commandMode'] === 'decision'
      && !this.turnActionsEl.isConnected) {
      this.consoleCommitmentEl.append(this.turnActionsEl);
    }
    for (const scope of [this.root, this.overlayRoot, this.railRoot]) {
      for (const target of scope.querySelectorAll<HTMLElement>('[data-first-salvo-target]')) {
        target.classList.toggle(
          'st-hud__first-salvo-target--active',
          visible && target.dataset['firstSalvoTarget'] === this.firstSalvoStep,
        );
      }
    }
    if (copy === null) {
      this.firstSalvoBriefingEl.hidden = true;
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
          instruction: 'Set Aim with Arrow keys.',
        };
      case 'power-and-wind':
        return {
          progress: 'First Salvo · 2 / 3 · Power + wind',
          instruction: 'Set Power; read Wind Vector.',
        };
      case 'fire':
        return {
          progress: 'First Salvo · 3 / 3 · Primary action',
          instruction: 'Press Space or Enter.',
        };
      default:
        return null;
    }
  }

  /** One semantic surface for identity, progress, tactics, economy, and Fire. */
  private buildCommandConsole(controls: HTMLElement): void {
    this.commandConsoleEl = document.createElement('section');
    this.commandConsoleEl.className =
      'st-hud__command-console st-ui-section st-ui-section--active';
    this.commandConsoleEl.setAttribute('role', 'region');
    this.commandConsoleEl.setAttribute('aria-label', 'Turn command console');
    const context = document.createElement('section');
    context.className = 'st-hud__console-context';
    context.setAttribute('aria-label', 'Active commander');
    this.lastSalvoEl = document.createElement('div');
    this.lastSalvoEl.className = 'st-hud__last-salvo';
    this.lastSalvoEl.dataset['ui'] = 'last-salvo-cue';
    this.lastSalvoEl.setAttribute('role', 'status');
    this.lastSalvoEl.setAttribute('aria-live', 'polite');
    this.lastSalvoEl.setAttribute('aria-atomic', 'true');
    this.lastSalvoEl.hidden = true;
    const lastSalvoLabel = document.createElement('span');
    lastSalvoLabel.className = 'st-hud__last-salvo-label';
    lastSalvoLabel.textContent = 'Last salvo';
    this.lastSalvoReadoutEl = document.createElement('span');
    this.lastSalvoReadoutEl.className = 'st-hud__last-salvo-readout';
    this.lastSalvoCorrectionEl = document.createElement('strong');
    this.lastSalvoCorrectionEl.className = 'st-hud__last-salvo-correction';
    this.lastSalvoEl.append(
      lastSalvoLabel,
      this.lastSalvoReadoutEl,
      this.lastSalvoCorrectionEl,
    );
    const tacticalRow = this.activePlayerEl.querySelector('.st-hud__tactical-row');
    (tacticalRow ?? context).append(this.lastSalvoEl);
    context.append(this.activePlayerEl);
    this.consoleContextEl = context;

    const solution = document.createElement('section');
    solution.className = 'st-hud__console-solution';
    solution.dataset['ui'] = 'firing-solution';
    solution.setAttribute('aria-label', 'Firing solution');

    // Buying is a gameplay decision inside Armory, alongside loadout choice;
    // it is not a third standalone card or a Command Menu destination.
    this.stripBodyEl.append(this.storeBtnEl);
    solution.append(this.weaponEl, controls, this.stripEl);
    this.consoleSolutionEl = solution;

    const terminal = document.createElement('section');
    terminal.className = 'st-hud__fire-terminal';
    terminal.setAttribute('aria-label', 'Fire control phase');
    const state = document.createElement('div');
    state.className = 'st-hud__console-state';
    state.setAttribute('role', 'status');
    state.setAttribute('aria-live', 'polite');
    state.tabIndex = -1;
    const explanation = document.createElement('div');
    explanation.className = 'st-hud__commitment-explanation';
    explanation.hidden = true;
    terminal.append(state, explanation, this.aimEl, this.turnActionsEl);
    this.consoleCommitmentEl = terminal;
    this.consoleStateEl = state;
    this.consoleExplanationEl = explanation;


    solution.append(terminal);
    this.commandConsoleEl.append(context, solution);
  }

  /** GAME_OVER overlay + the non-destructive PAUSE overlay. */
  private buildEndScreens(): void {
    this.terminalPayoffStatusEl = document.createElement('div');
    this.terminalPayoffStatusEl.className = 'st-hud__terminal-payoff-status';
    this.terminalPayoffStatusEl.setAttribute('role', 'status');
    this.terminalPayoffStatusEl.setAttribute('aria-live', 'polite');
    this.terminalPayoffStatusEl.setAttribute('aria-atomic', 'true');

    // GAME_OVER overlay (hidden until phase === GAME_OVER).
    this.overlayEl = document.createElement('div');
    this.overlayEl.className =
      'st-hud__overlay st-hud__overlay--victory st-hud__overlay--hidden';
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    this.overlayEl.setAttribute('aria-labelledby', 'st-victory-title');
    this.overlayEl.setAttribute('aria-hidden', 'true');

    const backdrop = document.createElement('img');
    backdrop.className = 'st-hud__victory-backdrop';
    backdrop.src = `${import.meta.env.BASE_URL}splash-hero.png`;
    backdrop.alt = '';
    backdrop.draggable = false;
    backdrop.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.className = 'st-hud__overlay-panel st-hud__overlay-panel--victory';

    const hero = document.createElement('section');
    hero.className = 'st-hud__victory-hero';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'st-hud__victory-eyebrow';
    eyebrow.textContent = 'After action report';
    const tankFrame = document.createElement('div');
    tankFrame.className = 'st-hud__victory-tank-frame';
    this.overlayTankEl = document.createElement('canvas');
    this.overlayTankEl.className = 'st-hud__victory-tank';
    this.overlayTankEl.setAttribute('aria-hidden', 'true');
    this.overlayTankEl.hidden = true;
    tankFrame.append(this.overlayTankEl);
    hero.append(eyebrow, tankFrame);

    const report = document.createElement('section');
    report.className = 'st-hud__victory-report';
    this.overlayStatusEl = document.createElement('div');
    this.overlayStatusEl.className = 'st-hud__victory-status';
    this.overlayQuickOperationEl = document.createElement('div');
    this.overlayQuickOperationEl.className = 'st-hud__victory-operation';
    this.overlayQuickOperationEl.dataset['ui'] = 'quick-operation-report';
    this.overlayQuickOperationEl.hidden = true;
    this.overlayFieldOrderEl = document.createElement('div');
    this.overlayFieldOrderEl.className = 'st-hud__victory-field-order';
    this.overlayFieldOrderEl.setAttribute('role', 'status');
    this.overlayFieldOrderEl.hidden = true;
    this.overlayProgressionReceiptEl = document.createElement('div');
    this.overlayProgressionReceiptEl.className = 'st-hud__victory-progression-receipt';
    this.overlayProgressionReceiptEl.setAttribute('role', 'status');
    this.overlayProgressionReceiptEl.setAttribute('aria-live', 'polite');
    this.overlayProgressionReceiptEl.hidden = true;
    this.overlayProgressionHandoffEl = document.createElement('div');
    this.overlayProgressionHandoffEl.className = 'st-hud__victory-progression-handoff';
    this.overlayProgressionHandoffEl.setAttribute('role', 'status');
    this.overlayProgressionHandoffEl.setAttribute('aria-live', 'polite');
    this.overlayProgressionHandoffEl.setAttribute('aria-atomic', 'true');
    this.overlayProgressionHandoffEl.hidden = true;
    const handoffPrompt = document.createElement('p');
    handoffPrompt.textContent = 'Sign in to record future matches.';
    this.overlayProgressionSignInBtnEl = document.createElement('button');
    this.overlayProgressionSignInBtnEl.className = 'st-hud__victory-progression-sign-in';
    this.overlayProgressionSignInBtnEl.type = 'button';
    this.overlayProgressionSignInBtnEl.textContent = 'Sign in';
    this.overlayProgressionSignInBtnEl.addEventListener('click', () => this.progressionSignInCb?.());
    this.overlayProgressionHandoffEl.append(handoffPrompt);
    this.overlayTextEl = document.createElement('h1');
    this.overlayTextEl.id = 'st-victory-title';
    this.overlayTextEl.className = 'st-hud__overlay-text st-hud__victory-title';
    const scoreLabel = document.createElement('div');
    scoreLabel.className = 'st-hud__victory-score-label';
    scoreLabel.textContent = 'Final standings';
    // Final scoreboard (round wins / kills / damage), populated in syncOverlay.
    this.overlayScoreEl = document.createElement('div');
    this.overlayScoreEl.className = 'st-hud__score';
    const restartBtn = document.createElement('button');
    restartBtn.className = 'st-hud__restart st-hud__victory-primary';
    restartBtn.type = 'button';
    restartBtn.textContent = 'Play again';
    // Listener attached ONCE here (never in update) — fires the stored callback.
    restartBtn.addEventListener('click', () => {
      if (!this.overlayShown) return;
      if (this.verifiedNextOrderArmed) {
        restartBtn.blur();
        this.verifiedNextOrderCb?.();
        return;
      }
      this.restartCb?.();
    });
    const overlayMenuBtn = document.createElement('button');
    overlayMenuBtn.className = 'st-hud__restart st-hud__restart--ghost';
    overlayMenuBtn.type = 'button';
    overlayMenuBtn.textContent = 'Main Menu';
    overlayMenuBtn.addEventListener('click', () => {
      if (this.overlayShown) this.quitCb?.();
    });
    this.overlayVerifiedRetryBtnEl = document.createElement('button');
    this.overlayVerifiedRetryBtnEl.className = 'st-hud__restart st-hud__victory-verified-retry';
    this.overlayVerifiedRetryBtnEl.type = 'button';
    this.overlayVerifiedRetryBtnEl.textContent = 'Retry verification';
    this.overlayVerifiedRetryBtnEl.addEventListener('click', () => {
      if (this.overlayShown && this.overlayVerifiedRetryBtnEl.isConnected && !this.overlayVerifiedRetryBtnEl.disabled) {
        this.verifiedRetryCb?.();
      }
    });
    const overlayBtns = document.createElement('div');
    overlayBtns.className = 'st-hud__overlay-btns';
    overlayBtns.append(restartBtn, overlayMenuBtn);
    this.overlayPrimaryBtnEl = restartBtn;
    this.overlayMenuBtnEl = overlayMenuBtn;
    report.append(
      this.overlayStatusEl,
      this.overlayQuickOperationEl,
      this.overlayFieldOrderEl,
      this.overlayProgressionReceiptEl,
      this.overlayProgressionHandoffEl,
      this.overlayTextEl,
      scoreLabel,
      this.overlayScoreEl,
      overlayBtns,
    );
    panel.append(hero, report);
    this.overlayEl.append(backdrop, panel);
    this.overlayEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !this.overlayShown) return;
      event.preventDefault();
      const actions = [
        ...(this.overlayProgressionHandoffEl.hidden ? [] : [this.overlayProgressionSignInBtnEl]),
        ...(this.overlayVerifiedRetryBtnEl.isConnected ? [this.overlayVerifiedRetryBtnEl] : []),
        this.overlayPrimaryBtnEl,
        this.overlayMenuBtnEl,
      ];
      const current = actions.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? actions.length - 1 : current - 1)
        : (current < 0 || current === actions.length - 1 ? 0 : current + 1);
      actions[next]!.focus({ preventScroll: true });
    });

    // PAUSE overlay — opened by the side-panel Menu button. Non-destructive: it does
    // NOT tear the game down and does NOT stop the client loop (REQUIRED for networked
    // lockstep, where the loop must keep applying the broadcast action log to stay in
    // seq sync). Resume just hides it; Quit runs the existing teardown-to-lobby path.
    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'st-hud__overlay st-hud__overlay--hidden';
    this.pauseEl.dataset['ui'] = 'command-menu';
    this.pauseEl.setAttribute('role', 'dialog');
    this.pauseEl.setAttribute('aria-modal', 'true');
    this.pauseEl.setAttribute('aria-label', 'Command Menu');
    this.pauseEl.setAttribute('aria-hidden', 'true');
    const pausePanel = document.createElement('div');
    pausePanel.className = 'st-hud__overlay-panel';
    const pauseText = document.createElement('h2');
    pauseText.className = 'st-hud__overlay-text';
    pauseText.textContent = 'Command Menu';
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'st-hud__restart';
    resumeBtn.type = 'button';
    resumeBtn.textContent = 'Resume';
    this.pauseResumeBtnEl = resumeBtn;
    resumeBtn.addEventListener('click', () => this.togglePause(false));
    const replayFirstSalvoBtn = document.createElement('button');
    replayFirstSalvoBtn.className = 'st-hud__restart st-hud__restart--ghost';
    replayFirstSalvoBtn.type = 'button';
    replayFirstSalvoBtn.textContent = 'Replay First Salvo';
    this.pauseReplayFirstSalvoBtnEl = replayFirstSalvoBtn;
    replayFirstSalvoBtn.addEventListener('click', () => {
      this.togglePause(false);
      this.firstSalvoReplayCb?.();
    });
    const pauseQuitBtn = document.createElement('button');
    pauseQuitBtn.className = 'st-hud__restart st-hud__restart--ghost';
    pauseQuitBtn.type = 'button';
    pauseQuitBtn.textContent = 'Return to Lobby';
    pauseQuitBtn.addEventListener('click', () => { this.togglePause(false); this.quitCb?.(); });
    const pauseBtns = document.createElement('div');
    pauseBtns.className = 'st-hud__overlay-btns';
    this.pauseActionsEl = pauseBtns;
    pauseBtns.append(resumeBtn);
    const pauseExit = document.createElement('div');
    pauseExit.className = 'st-hud__command-menu-exit';
    pauseExit.dataset['ui'] = 'command-menu-exit';
    pauseExit.setAttribute('role', 'group');
    pauseExit.setAttribute('aria-label', 'Leave this match');
    pauseExit.append(pauseQuitBtn);
    pausePanel.append(pauseText, pauseBtns, pauseExit);
    this.pauseEl.append(pausePanel);
    this.pauseEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const actions = [...this.pauseEl.querySelectorAll<HTMLButtonElement>('button')]
        .filter((button) => !button.disabled);
      const current = actions.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? actions.length - 1 : current - 1)
        : (current < 0 || current === actions.length - 1 ? 0 : current + 1);
      event.preventDefault();
      actions[next]?.focus({ preventScroll: true });
    });
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

  /** Compact Match trigger for the drawer presentation on constrained layouts. */
  private buildMatchDrawer(): void {
    this.matchDrawerBtnEl = document.createElement('button');
    this.matchDrawerBtnEl.type = 'button';
    this.matchDrawerBtnEl.className = 'st-hud__match-drawer-toggle st-ui-action st-ui-action--quiet';
    this.matchDrawerBtnEl.dataset['ui'] = 'match-drawer-toggle';
    this.matchDrawerBtnEl.setAttribute('aria-label', 'Open match ledger');
    this.matchDrawerBtnEl.setAttribute('aria-controls', 'hud');
    this.matchDrawerBtnEl.setAttribute('aria-expanded', 'false');
    this.matchDrawerBtnEl.append(makeHudGlyph('menu', 14), document.createTextNode('Match'));
    this.matchDrawerBtnEl.addEventListener('click', () => {
      this.setMatchDrawerOpen(!this.root.classList.contains('st-hud--match-drawer-open'));
    });
    this.matchDrawerCloseEl = document.createElement('button');
    this.matchDrawerCloseEl.type = 'button';
    this.matchDrawerCloseEl.className = 'st-hud__match-drawer-close st-ui-action st-ui-action--quiet';
    this.matchDrawerCloseEl.textContent = 'Close';
    this.matchDrawerCloseEl.setAttribute('aria-label', 'Close match ledger');
    this.matchDrawerCloseEl.addEventListener('click', () => this.setMatchDrawerOpen(false));
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.root.classList.contains('st-hud--match-drawer-open')) {
        event.preventDefault();
        this.setMatchDrawerOpen(false);
      }
    });
  }

  private setMatchDrawerOpen(open: boolean): void {
    if (open && !this.stripCollapsed) return;
    this.root.classList.toggle('st-hud--match-drawer-open', open);
    this.matchDrawerBtnEl.setAttribute('aria-expanded', String(open));
    this.matchDrawerBtnEl.tabIndex = open ? -1 : 0;
    this.matchDrawerBtnEl.setAttribute('aria-hidden', String(open));
    if (open) this.matchDrawerCloseEl.focus({ preventScroll: true });
    else this.matchDrawerBtnEl.focus({ preventScroll: true });
  }

  /** Maintainer-only read-only battle inspector. It is never mounted in ordinary play. */
  private buildLiveMatchDiagnostics(): void {
    this.liveMatchInspectorEl = document.createElement('section');
    this.liveMatchInspectorEl.className = 'st-hud__overlay st-hud__overlay--hidden';
    this.liveMatchInspectorEl.dataset['ui'] = 'live-match-inspector';
    this.liveMatchInspectorEl.setAttribute('role', 'dialog');
    this.liveMatchInspectorEl.setAttribute('aria-modal', 'true');
    this.liveMatchInspectorEl.setAttribute('aria-hidden', 'true');
    this.liveMatchInspectorEl.setAttribute('aria-labelledby', 'st-live-match-inspector-title');

    const panel = document.createElement('div');
    panel.className = 'st-hud__overlay-panel';
    const title = document.createElement('h2');
    title.id = 'st-live-match-inspector-title';
    title.className = 'st-hud__overlay-text';
    title.textContent = 'Live match inspector';
    const copy = document.createElement('p');
    copy.textContent = 'Read-only public snapshot. It does not contain match identity or credentials.';
    this.liveMatchInspectorDataEl = document.createElement('pre');
    this.liveMatchInspectorDataEl.className = 'st-hud__live-diagnostics-data';
    this.liveMatchInspectorCopyEl = document.createElement('button');
    this.liveMatchInspectorCopyEl.type = 'button';
    this.liveMatchInspectorCopyEl.className = 'st-hud__restart';
    this.liveMatchInspectorCopyEl.dataset['action'] = 'copy-live-match-snapshot';
    this.liveMatchInspectorCopyEl.textContent = 'Copy snapshot';
    this.liveMatchInspectorCopyEl.addEventListener('click', () => {
      const text = this.liveMatchInspectorDataEl.textContent ?? '';
      void globalThis.navigator?.clipboard?.writeText(text).catch(() => undefined);
    });
    this.liveMatchInspectorCloseEl = document.createElement('button');
    this.liveMatchInspectorCloseEl.type = 'button';
    this.liveMatchInspectorCloseEl.className = 'st-hud__restart st-hud__restart--ghost';
    this.liveMatchInspectorCloseEl.dataset['action'] = 'close-live-match-inspector';
    this.liveMatchInspectorCloseEl.textContent = 'Close inspector';
    this.liveMatchInspectorCloseEl.addEventListener('click', () => this.closeLiveMatchInspector());
    const actions = document.createElement('div');
    actions.className = 'st-hud__overlay-btns';
    actions.append(this.liveMatchInspectorCopyEl, this.liveMatchInspectorCloseEl);
    panel.append(title, copy, this.liveMatchInspectorDataEl, actions);
    this.liveMatchInspectorEl.append(panel);
    this.liveMatchInspectorEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || this.liveMatchInspectorEl.classList.contains('st-hud__overlay--hidden')) return;
      event.preventDefault();
      const actions = [this.liveMatchInspectorCopyEl, this.liveMatchInspectorCloseEl];
      const current = actions.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? actions.length - 1 : current - 1)
        : (current < 0 || current === actions.length - 1 ? 0 : current + 1);
      actions[next]!.focus({ preventScroll: true });
    });

    this.liveMatchInspectorMenuEl = document.createElement('button');
    this.liveMatchInspectorMenuEl.type = 'button';
    this.liveMatchInspectorMenuEl.className = 'st-hud__restart st-hud__restart--ghost';
    this.liveMatchInspectorMenuEl.dataset['ui'] = 'live-match-inspector-menu';
    this.liveMatchInspectorMenuEl.textContent = 'Inspect live match';
    this.liveMatchInspectorMenuEl.addEventListener('click', () => {
      this.togglePause(false);
      this.openLiveMatchInspector();
    });
  }

  private syncLiveMatchDiagnostics(): void {
    const enabled = this.liveMatchDiagnosticsProvider !== null;
    if (enabled && !this.liveMatchInspectorMenuEl.isConnected) {
      this.pauseActionsEl.insertBefore(this.liveMatchInspectorMenuEl, this.pauseActionsEl.lastElementChild);
    } else if (!enabled && this.liveMatchInspectorMenuEl.isConnected) {
      this.closeLiveMatchInspector();
      this.liveMatchInspectorDataEl.textContent = '';
      this.liveMatchInspectorMenuEl.remove();
    }
  }

  private openLiveMatchInspector(): void {
    const snapshot = this.liveMatchDiagnosticsProvider?.();
    if (!snapshot) return;
    const focused = document.activeElement;
    this.liveMatchInspectorPreviousFocus = focused instanceof HTMLElement ? focused : null;
    this.liveMatchInspectorDataEl.textContent = JSON.stringify(snapshot, null, 2);
    this.liveMatchInspectorEl.classList.remove('st-hud__overlay--hidden');
    this.liveMatchInspectorEl.setAttribute('aria-hidden', 'false');
    this.setLiveMatchInspectorIsolation(true);
    this.liveMatchInspectorCopyEl.focus({ preventScroll: true });
  }

  private closeLiveMatchInspector(): void {
    if (!this.liveMatchInspectorEl || this.liveMatchInspectorEl.classList.contains('st-hud__overlay--hidden')) return;
    this.liveMatchInspectorEl.classList.add('st-hud__overlay--hidden');
    this.liveMatchInspectorEl.setAttribute('aria-hidden', 'true');
    this.setLiveMatchInspectorIsolation(false);
    const previous = this.liveMatchInspectorPreviousFocus;
    this.liveMatchInspectorPreviousFocus = null;
    const fallback = this.root.querySelector<HTMLElement>('.st-hud__menu');
    const target = previous?.isConnected && !previous.closest('[inert]') ? previous : fallback;
    target?.focus({ preventScroll: true });
  }

  private setLiveMatchInspectorIsolation(active: boolean): void {
    const appSiblings = this.modalRoot.parentElement
      ? [...this.modalRoot.parentElement.children].filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.modalRoot)
      : [];
    const modalSiblings = [...this.modalRoot.children].filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== this.liveMatchInspectorEl);
    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['liveMatchInspectorPreviousInert'] !== undefined) continue;
        surface.dataset['liveMatchInspectorPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['liveMatchInspectorPreviousAriaHidden'] = surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
      } else {
        const previousInert = surface.dataset['liveMatchInspectorPreviousInert'];
        if (previousInert === undefined) continue;
        surface.inert = previousInert === 'true';
        const previousAria = surface.dataset['liveMatchInspectorPreviousAriaHidden'];
        if (previousAria === '__absent__' || previousAria === undefined) surface.removeAttribute('aria-hidden');
        else surface.setAttribute('aria-hidden', previousAria);
        delete surface.dataset['liveMatchInspectorPreviousInert'];
        delete surface.dataset['liveMatchInspectorPreviousAriaHidden'];
      }
    }
  }

  /** Ledger connection state plus transient toast and turn-watch notices. */
  private buildLiveness(): void {
    // Connection is durable orientation, while send/turn notices remain transient.
    this.connBannerEl = document.createElement('div');
    this.connBannerEl.className = 'st-hud__conn st-ui-section';
    this.connBannerEl.dataset['connectionState'] = 'local';
    this.connBannerEl.setAttribute('role', 'status');
    this.connBannerEl.setAttribute('aria-live', 'polite');
    this.connBannerEl.textContent = 'Ready';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-hud__toast st-hud__toast--hidden';
    this.turnWatchEl = document.createElement('div');
    this.turnWatchEl.className = 'st-hud__turnwatch st-hud__turnwatch--hidden';

    this.quickChatRootEl = document.createElement('div');
    this.quickChatRootEl.className = 'st-hud__quick-chat st-hud__quick-chat--hidden';
    this.quickChatToggleEl = document.createElement('button');
    this.quickChatToggleEl.type = 'button';
    this.quickChatToggleEl.className = 'st-hud__quick-chat-toggle';
    this.quickChatToggleEl.textContent = 'Quick chat';
    this.quickChatToggleEl.setAttribute('aria-label', 'Open quick chat');
    this.quickChatToggleEl.setAttribute('aria-expanded', 'false');
    this.quickChatPanelEl = document.createElement('div');
    this.quickChatPanelEl.className = 'st-hud__quick-chat-panel st-hud__quick-chat-panel--hidden';
    this.quickChatPanelEl.setAttribute('role', 'menu');
    for (const [key, label] of Object.entries(QUICK_CHAT_MESSAGES) as Array<[QuickChatKey, string]>) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'st-hud__quick-chat-option';
      option.dataset['quickChat'] = key;
      option.setAttribute('role', 'menuitem');
      option.textContent = label;
      option.addEventListener('click', () => {
        this.quickChatCb?.(key);
        this.closeQuickChat();
      });
      this.quickChatPanelEl.append(option);
    }
    this.quickChatToggleEl.addEventListener('click', () => {
      const open = this.quickChatPanelEl.classList.contains('st-hud__quick-chat-panel--hidden');
      if (open) {
        this.quickChatPanelEl.classList.remove('st-hud__quick-chat-panel--hidden');
        this.quickChatToggleEl.setAttribute('aria-expanded', 'true');
      } else {
        this.closeQuickChat();
      }
    });
    this.quickChatRootEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeQuickChat();
    });
    this.quickChatRootEl.append(this.quickChatToggleEl, this.quickChatPanelEl);
  }

  private closeQuickChat(): void {
    this.quickChatPanelEl.classList.add('st-hud__quick-chat-panel--hidden');
    this.quickChatToggleEl.setAttribute('aria-expanded', 'false');
  }

  private syncQuickChatAvailability(): void {
    this.quickChatRootEl.classList.toggle('st-hud__quick-chat--hidden', !this.quickChatEnabled);
    if (!this.quickChatEnabled) this.closeQuickChat();
  }

  /**
   * Reflect the networked Realtime connection state in the persistent match ledger.
   * No-op before the HUD is built (build() runs on the first update()).
   */
  setConnection(state: ConnectionState): void {
    if (!this.built) this.build();
    this.connBannerEl.dataset['connectionState'] = state;
    this.connBannerEl.textContent =
      state === 'connected' ? 'Ready' :
      state === 'reconnecting' ? '⚠ Connection lost — reconnecting…' : 'Connecting…';
    this.connBannerEl.classList.remove('st-hud__conn--hidden');
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
    if (show) {
      const focused = document.activeElement;
      this.pausePreviousFocus = focused instanceof HTMLElement ? focused : null;
      this.toggleStore(false);
      if (this.firstSalvoReplayCb) {
        this.pauseActionsEl.append(this.pauseReplayFirstSalvoBtnEl);
      } else {
        this.pauseReplayFirstSalvoBtnEl.remove();
      }
    }
    this.paused = show;
    this.pauseEl.classList.toggle('st-hud__overlay--hidden', !show);
    this.pauseEl.setAttribute('aria-hidden', String(!show));
    this.setCommandMenuIsolation(show);
    this.pauseChangeCb?.(show);
    if (show) {
      this.pauseResumeBtnEl.focus({ preventScroll: true });
      return;
    }
    const previousFocus = this.pausePreviousFocus;
    this.pausePreviousFocus = null;
    const isVisibleFocusTarget = (element: HTMLElement | null): element is HTMLElement => {
      if (!element?.isConnected || element.closest('[inert]')) return false;
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    const fallbackMenu = [this.root.querySelector<HTMLButtonElement>('.st-hud__menu')]
      .find(isVisibleFocusTarget);
    const focusTarget = isVisibleFocusTarget(previousFocus) ? previousFocus : fallbackMenu;
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  /** Isolate every full-app surface except the active Command Menu. */
  private setCommandMenuIsolation(active: boolean): void {
    const appSiblings = this.modalRoot.parentElement
      ? [...this.modalRoot.parentElement.children]
        .filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== this.modalRoot)
      : [];
    const modalSiblings = [...this.modalRoot.children]
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.pauseEl);

    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['commandMenuPreviousInert'] !== undefined) continue;
        surface.dataset['commandMenuPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['commandMenuPreviousAriaHidden'] =
          surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
        continue;
      }

      const previousInert = surface.dataset['commandMenuPreviousInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['commandMenuPreviousAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) {
        surface.removeAttribute('aria-hidden');
      } else {
        surface.setAttribute('aria-hidden', previousAria);
      }
      delete surface.dataset['commandMenuPreviousInert'];
      delete surface.dataset['commandMenuPreviousAriaHidden'];
    }
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

    const storeLabel = `Buy weapons · $${credits.toLocaleString()}`;
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
          : key === 'parachute'
            ? `Parachutes ${active?.accessories.parachute ?? 0}`
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

    for (const [index, tank] of state.tanks.entries()) {
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
        index + 1,
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
    const el = document.createElement('li');
    el.className = 'st-hud__player';

    const order = document.createElement('span');
    order.className = 'st-hud__turn-order';
    order.setAttribute('aria-hidden', 'true');

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

    el.append(order, swatch, name, pips, hp, bar);
    return {
      el, hp, fill, name, swatch, pips, order,
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
    turnOrder: number,
  ): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;
    row.el.dataset['turnOrder'] = String(turnOrder);
    row.order.textContent = String(turnOrder).padStart(2, '0');

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
    row.el.setAttribute(
      'aria-label',
      `${turnOrder}. ${HUD.playerLabel(tank)}, ${health} health${active && !dead ? ', active turn' : ''}`,
    );
    if (!active) {
      row.el.classList.remove('st-hud__player--handoff');
    } else if (isHandoff && !dead) {
      row.el.classList.remove('st-hud__player--handoff');
      void row.el.offsetWidth;
      row.el.classList.add('st-hud__player--handoff');
    }
  }

  /** Project authoritative wind into Fire Control's single live value. */
  private syncWind(wind: number): void {
    const mag = windMagnitudeLabel(wind);
    const solutionWind = wind === 0 ? 'Calm' : `${mag} ${wind < 0 ? 'left' : 'right'}`;
    if (this.solutionWindValueEl.textContent !== solutionWind) {
      this.solutionWindValueEl.textContent = solutionWind;
    }
  }

  /** Update the active commander and live firing values. */
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
      // No active tank: clear decision values and identity rather than leaving a
      // stale player named through a terminal or defensive state.
      this.activePlayerEl.classList.toggle('st-hud__active-row--hidden', true);
      this.aimEl.classList.toggle('st-hud__aim--hidden', true);
      if (this.turnOwnerEl.textContent !== '') this.turnOwnerEl.textContent = '';
      if (this.weaponValueEl.textContent !== '—') this.weaponValueEl.textContent = '—';
      if (this.weaponAmmoEl.textContent !== '—') this.weaponAmmoEl.textContent = '—';
      if (this.commanderHealthEl.textContent !== '—') this.commanderHealthEl.textContent = '—';
      this.commanderHealthEl.setAttribute('aria-label', 'No active commander health');
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
      this.solutionAngleValueEl.textContent = '—';
      this.solutionPowerValueEl.textContent = '—';
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
      // The terminal status carries progress, while the commander remains the
      // visual anchor for the whole committed-shot phase. Hiding it left the
      // left rail blank on ordinary desktop and compact play.
      this.activePlayerEl.classList.toggle('st-hud__active-row--hidden', false);
      // Keep decision values frozen while a shot is progressing.
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
    const health = Math.max(0, Math.floor(tank.health));
    const healthLabel = `${health} HP`;
    if (this.commanderHealthEl.textContent !== healthLabel) {
      this.commanderHealthEl.textContent = healthLabel;
    }
    const healthAriaLabel = `${health} health remaining`;
    if (this.commanderHealthEl.getAttribute('aria-label') !== healthAriaLabel) {
      this.commanderHealthEl.setAttribute('aria-label', healthAriaLabel);
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
      `${ownerLabel}'s turn. ${health} health. Weapon ${weaponName}. ${Math.max(0, Math.floor(tank.fuel))} fuel remaining.`;
    if (this.turnStatusEl.getAttribute('aria-label') !== activeLabel) {
      this.turnStatusEl.setAttribute('aria-label', activeLabel);
    }
    if (isHandoff) {
      this.activePlayerEl.classList.remove('st-hud__active-row--handoff');
      void this.activePlayerEl.offsetWidth;
      this.activePlayerEl.classList.add('st-hud__active-row--handoff');
    }

    const elevation = elevationDegrees(tank.angle);
    const solutionAngle = `${elevation}°`;
    if (this.solutionAngleValueEl.textContent !== solutionAngle) {
      this.solutionAngleValueEl.textContent = solutionAngle;
    }
    const pwrLbl = powerLabel(tank.power);
    if (this.solutionPowerValueEl.textContent !== pwrLbl) {
      this.solutionPowerValueEl.textContent = pwrLbl;
    }
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
    paintTankLoadoutPreview(
      this.tankPortraitEl,
      tank.color,
      tank.loadout,
      'tactical',
    );
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
    for (const button of [this.moveLeftBtnEl, this.moveRightBtnEl]) {
      if (button.disabled !== disabled) button.disabled = disabled;
      const ariaDisabled = String(disabled);
      if (button.getAttribute('aria-disabled') !== ariaDisabled) {
        button.setAttribute('aria-disabled', ariaDisabled);
      }
    }
  }

  /** Flip and persist the arsenal-collapsed preference. */
  private toggleStripCollapsed(): void {
    if (!this.stripCollapsed) {
      this.closeArmory();
      return;
    }
    this.stripCollapsed = false;
    this.setMatchDrawerOpen(false);
    this.modalRoot.append(this.stripEl);
    writeArsenalCollapsed(false);
    this.applyStripCollapsed();
    this.arsenalDrawerCloseEl.focus({ preventScroll: true });
  }

  private closeArmory(): void {
    if (this.stripCollapsed) return;
    this.stripCollapsed = true;
    this.consoleSolutionEl.append(this.stripEl);
    writeArsenalCollapsed(true);
    this.applyStripCollapsed();
    this.stripToggleEl.focus({ preventScroll: true });
  }

  /** Reflect the collapsed state onto the strip DOM + toggle affordance. */
  private applyStripCollapsed(): void {
    this.resetWeaponIntelPreview();
    this.stripEl.classList.toggle('st-hud__strip--collapsed', this.stripCollapsed);
    this.stripEl.classList.toggle('st-hud__strip--open', !this.stripCollapsed);
    this.stripToggleEl.setAttribute('aria-expanded', String(!this.stripCollapsed));
    this.stripToggleEl.setAttribute(
      'aria-label',
      this.stripCollapsed ? 'Open Armory — equip or buy weapons' : 'Close Armory',
    );
    this.stripToggleEl.setAttribute('aria-hidden', String(!this.stripCollapsed));
    this.stripToggleEl.tabIndex = this.stripCollapsed ? 0 : -1;
    this.stripToggleLabelEl.textContent = this.stripCollapsed ? 'Armory · equip / buy' : 'Close Armory';
    this.stripBodyEl.hidden = this.stripCollapsed;
    this.weaponIntelEl.hidden = this.stripCollapsed;
    this.renderWeaponIntel();
    for (const child of [...this.root.children]) {
      if (child !== this.commandConsoleEl) (child as HTMLElement).inert = !this.stripCollapsed;
    }
    for (const child of [...this.railRoot.children]) {
      if (child !== this.commandConsoleEl) (child as HTMLElement).inert = !this.stripCollapsed;
    }
    if (this.consoleCommitmentEl) this.consoleCommitmentEl.inert = !this.stripCollapsed;
    if (this.consoleContextEl) this.consoleContextEl.inert = !this.stripCollapsed;
    this.matchDrawerBtnEl.inert = !this.stripCollapsed;
    this.solutionAdjustmentsEl.inert = !this.stripCollapsed;
    this.solutionWeaponCommandBtnEl.inert = !this.stripCollapsed;
    if (!this.stripCollapsed) {
      this.solutionAdjustmentsEl.setAttribute('aria-hidden', 'true');
    } else {
      this.solutionAdjustmentsEl.removeAttribute('aria-hidden');
    }
  }

  /** Reconcile the weapon strip: owned-only visibility, active highlight, live ammo. No DOM rebuild. */
  private syncStrip(state: GameState, isFiring: boolean, canControl: boolean): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    const canAct = canControl && !isFiring && !!tank?.alive && state.phase === 'PLAYER_TURN';
    const selectedInventory = tank?.inventory[tank.selectedWeapon];
    const selectedUsable = !!selectedInventory &&
      (selectedInventory.unlimited || selectedInventory.count > 0);
    const previousSelected = this.selectedIntelWeapon;
    const ammo = !tank
      ? '—'
      : selectedInventory?.unlimited
        ? AMMO_UNLIMITED_GLYPH
        : String(selectedInventory?.count ?? 0);
    if (this.weaponAmmoEl.textContent !== ammo) this.weaponAmmoEl.textContent = ammo;
    this.weaponAmmoEl.setAttribute(
      'aria-label',
      !tank
        ? 'No active ammunition'
        : selectedInventory?.unlimited
          ? 'Unlimited ammunition'
          : `${selectedInventory?.count ?? 0} rounds remaining`,
    );
    if (tank) this.selectedIntelWeapon = tank.selectedWeapon;
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
    const previewIsHidden = (type: WeaponType | null) => type !== null &&
      this.weaponCells.get(type)?.el.classList.contains('st-hud__weapon-btn--hidden');
    if (
      previousSelected !== this.selectedIntelWeapon ||
      previewIsHidden(this.focusedIntelWeapon) ||
      previewIsHidden(this.pointedIntelWeapon)
    ) {
      this.resetWeaponIntelPreview();
    }
    this.renderWeaponIntel();
    // Sync every shared rail stepper from the same explicit local-ownership state.
    for (const button of this.solutionTurnCommandBtns) {
      button.disabled = !canAct;
      button.setAttribute('aria-disabled', String(!canAct));
    }
    const weaponName = tank ? (WEAPONS[tank.selectedWeapon]?.name ?? tank.selectedWeapon) : 'Weapon';
    const isShield = tank?.selectedWeapon === 'shield' || tank?.selectedWeapon === 'heavy_shield';
    const actionLabel = isShield ? 'Activate shield' : 'Fire';
    const actionAccessibleName = isShield ? actionLabel : `${actionLabel} ${weaponName}`;
    if (this.primaryActionLabelEl.textContent !== actionLabel) {
      this.primaryActionLabelEl.textContent = actionLabel;
    }
    this.primaryActionBtnEl.setAttribute('aria-label', actionAccessibleName);
    const canCommit = canAct && selectedUsable;
    this.primaryActionBtnEl.disabled = !canCommit;
    this.primaryActionBtnEl.setAttribute('aria-disabled', String(!canCommit));
    this.solutionWeaponCommandBtnEl.setAttribute(
      'aria-label',
      `Select next weapon, current ${weaponName}`,
    );
  }

  /** Tracks whether the GAME_OVER panel is currently shown, so its content (winner
   *  text + scoreboard) builds ONCE on entry rather than every frame. */
  private overlayShown = false;

  private verifiedCountdown(remainingMs: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} remaining`;
  }

  private setVerifiedExpiryIsolation(active: boolean): void {
    const appSiblings = this.modalRoot.parentElement
      ? [...this.modalRoot.parentElement.children]
        .filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== this.modalRoot)
      : [];
    const modalSiblings = [...this.modalRoot.children]
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.verifiedExpiryEl);
    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['verifiedExpiryPreviousInert'] !== undefined) continue;
        surface.dataset['verifiedExpiryPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['verifiedExpiryPreviousAriaHidden'] =
          surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
        continue;
      }
      const previousInert = surface.dataset['verifiedExpiryPreviousInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['verifiedExpiryPreviousAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) {
        surface.removeAttribute('aria-hidden');
      } else {
        surface.setAttribute('aria-hidden', previousAria);
      }
      delete surface.dataset['verifiedExpiryPreviousInert'];
      delete surface.dataset['verifiedExpiryPreviousAriaHidden'];
    }
  }

  private hideVerifiedExpiry(): void {
    this.verifiedExpiryEl.hidden = true;
    this.setVerifiedExpiryIsolation(false);
  }

  /** Present only server-backed verified state; null retires every verified surface. */
  setVerifiedDeployment(state: HUDVerifiedDeploymentState | null): void {
    this.verifiedDeploymentState = state;
    if (!this.built) this.build();
    this.verifiedRetryBtnEl.hidden = true;
    this.verifiedRetryBtnEl.disabled = true;
    const isRetryable = state?.status === 'retryable';
    const retiringFocusedOverlayRetry = !isRetryable
      && this.overlayShown
      && document.activeElement === this.overlayVerifiedRetryBtnEl;
    this.overlayVerifiedRetryBtnEl.disabled = !isRetryable;
    if (!isRetryable) {
      if (retiringFocusedOverlayRetry) this.overlayPrimaryBtnEl.focus({ preventScroll: true });
      this.overlayVerifiedRetryBtnEl.remove();
    }
    if (state === null) {
      this.verifiedStatusEl.hidden = true;
      this.verifiedStatusEl.remove();
      this.verifiedBudgetEl.textContent = '';
      this.verifiedDeadlineEl.textContent = '';
      this.verifiedStateEl.textContent = '';
      this.hideVerifiedExpiry();
      return;
    }

    if (!this.verifiedStatusEl.isConnected) {
      this.root.insertBefore(this.verifiedStatusEl, this.roundEl);
    }
    this.verifiedStatusEl.hidden = false;
    if (!('deadline' in state)) {
      this.verifiedBudgetEl.textContent = '';
      this.verifiedDeadlineEl.textContent = '';
      this.verifiedStateEl.textContent = state.status === 'policy-refused'
        ? 'That action is not permitted in verified deployment.'
        : 'Verified deployment is unavailable. Return to the Battery.';
      this.hideVerifiedExpiry();
      return;
    }

    this.verifiedBudgetEl.textContent =
      `Salvos · You ${state.humanSalvos} / ${state.humanLimit} · CPU ${state.cpuSalvos} / ${state.cpuLimit}`;
    this.verifiedDeadlineEl.textContent = this.verifiedCountdown(state.deadline.remainingMs);
    if (state.status === 'cap-adjudicating') {
      this.verifiedStateEl.textContent = 'Salvo cap reached. Adjudicating verified result.';
    } else if (state.status === 'completion-pending') {
      this.verifiedStateEl.textContent = 'Verification pending';
    } else if (state.status === 'retryable') {
      this.verifiedStateEl.textContent = 'Verification needs another attempt.';
      this.verifiedRetryBtnEl.hidden = false;
      this.verifiedRetryBtnEl.disabled = false;
      this.overlayVerifiedRetryBtnEl.disabled = false;
      if (!this.overlayVerifiedRetryBtnEl.isConnected) {
        this.overlayPrimaryBtnEl.before(this.overlayVerifiedRetryBtnEl);
      }
    } else if (state.status === 'expired') {
      this.verifiedStateEl.textContent = 'Verification expired.';
    } else if (state.deadline.warning === 'five-minutes') {
      this.verifiedStateEl.textContent = 'Five minutes remain';
    } else if (state.deadline.warning === 'one-minute') {
      this.verifiedStateEl.textContent = 'One minute remains';
    } else {
      this.verifiedStateEl.textContent = 'Deployment active';
    }

    if (state.status !== 'expired') {
      this.hideVerifiedExpiry();
      return;
    }
    if (this.paused) this.togglePause(false);
    const openingExpiryDecision = this.verifiedExpiryEl.hidden;
    this.verifiedExpiryEl.hidden = false;
    this.setVerifiedExpiryIsolation(true);
    if (openingExpiryDecision) this.verifiedContinueBtnEl.focus({ preventScroll: true });
  }

  /** Present one public client-only Field Order only while verified play owns it. */
  setFieldOrder(order: FieldOrder | null): void {
    if (!this.built) this.build();
    if (order !== null && !this.fieldOrderEl.isConnected) {
      this.verifiedStatusEl.append(this.fieldOrderEl);
      if (!this.verifiedStatusEl.isConnected) {
        this.root.insertBefore(this.verifiedStatusEl, this.roundEl);
      }
    }
    this.fieldOrderEl.hidden = order === null;
    if (order === null) {
      this.fieldOrderEl.textContent = '';
      this.fieldOrderEl.remove();
      this.overlayFieldOrderEl.hidden = true;
      this.overlayFieldOrderEl.textContent = '';
      return;
    }
    const copy = renderFieldOrder(order);
    this.fieldOrderEl.textContent = copy.status;
    this.overlayFieldOrderEl.textContent = copy.report;
    this.overlayFieldOrderEl.hidden = order.result === null;
  }

  /** Isolate every full-app surface except the active terminal report. */
  private setVictoryIsolation(active: boolean): void {
    const appSiblings = this.modalRoot.parentElement
      ? [...this.modalRoot.parentElement.children]
        .filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== this.modalRoot)
      : [];
    const modalSiblings = [...this.modalRoot.children]
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement
          && element !== this.overlayEl
          && element !== this.terminalPayoffStatusEl);

    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['victoryPreviousInert'] !== undefined) continue;
        surface.dataset['victoryPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['victoryPreviousAriaHidden'] =
          surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
        continue;
      }

      const previousInert = surface.dataset['victoryPreviousInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['victoryPreviousAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) {
        surface.removeAttribute('aria-hidden');
      } else {
        surface.setAttribute('aria-hidden', previousAria);
      }
      delete surface.dataset['victoryPreviousInert'];
      delete surface.dataset['victoryPreviousAriaHidden'];
    }
  }

  private hideVictoryReport(restoreFocus = true): void {
    if (this.terminalPayoffTimer !== null) {
      clearTimeout(this.terminalPayoffTimer);
      this.terminalPayoffTimer = null;
    }
    this.unlockTerminalPayoff();
    this.overlayEl.classList.add('st-hud__overlay--hidden');
    this.overlayEl.setAttribute('aria-hidden', 'true');
    this.setVictoryIsolation(false);
    this.overlayTankEl.hidden = true;
    if (this.overlayTankEl.dataset['tankPreviewSignature'] !== undefined) {
      clearTankLoadoutPreview(this.overlayTankEl);
    }
    this.overlayEl.style.removeProperty('--st-victory-color');
    this.overlayProgressionReceiptEl.hidden = true;
    this.overlayProgressionReceiptEl.textContent = '';
    this.overlayProgressionReceiptEl.classList.remove(
      'st-hud__victory-progression-receipt--promotion',
    );
    this.verifiedNextOrderArmed = false;
    this.overlayPrimaryBtnEl.textContent = 'Play again';
    this.clearAnonymousProgressionHandoff();
    this.overlayShown = false;
    this.terminalState = null;
    this.terminalImpactComplete = false;
    delete this.terminalPayoffStatusEl.dataset['payoffStartedAt'];
    delete this.terminalPayoffStatusEl.dataset['impactCompletedAt'];
    delete this.terminalPayoffStatusEl.dataset['payoffReadyAt'];
    this.terminalPayoffStatusEl.textContent = '';

    const previousFocus = this.overlayPreviousFocus;
    this.overlayPreviousFocus = null;
    if (
      restoreFocus
      && previousFocus?.isConnected
      && !previousFocus.closest('[inert]')
    ) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  /** Name the accepted XP and next server-derived level milestone without adding another action. */
  setProgressionReceipt(receipt: {
    won: boolean;
    receipt: HotSeatProgressionReceipt;
  }): void {
    const earnedXp = earnedHotSeatMatchXp(receipt.won);
    const summary = receipt.receipt.current;
    const remainingXp = summary.nextLevelXp - summary.levelXp;
    const outcome = receipt.won ? 'Victory' : 'Match complete';
    this.overlayProgressionReceiptEl.classList.remove(
      'st-hud__victory-progression-receipt--promotion',
    );
    const summaryLine = document.createElement('span');
    summaryLine.className = 'st-hud__victory-progression-summary';
    summaryLine.textContent =
      `${outcome} · +${earnedXp} XP · ${remainingXp} XP to Level ${summary.level + 1}`;
    this.overlayProgressionReceiptEl.replaceChildren(summaryLine);
    this.overlayProgressionReceiptEl.hidden = false;
    this.clearAnonymousProgressionHandoff();
  }

  /** Render rank language only from the accepted verified-replay receipt. */
  setVerifiedProgressionReceipt(receipt: VerifiedDeploymentReceipt): void {
    if (!this.built) this.build();
    const current = receipt.progression.current;
    const promotion = commanderPromotionBetweenVerified(
      {
        evidence: receipt.progression.prior.evidence,
        progressionVersion: receipt.progression.prior.progressionVersion,
        level: receipt.progression.prior.level,
      },
      {
        evidence: current.evidence,
        progressionVersion: current.progressionVersion,
        level: current.level,
      },
    );
    const career = commanderCareerForVerifiedProgression({
      evidence: current.evidence,
      progressionVersion: current.progressionVersion,
      level: current.level,
    });
    const outcome = receipt.result.outcome === 'win'
      ? 'victory'
      : receipt.result.outcome;
    const summaryLine = document.createElement('span');
    summaryLine.className = 'st-hud__victory-progression-summary';
    summaryLine.textContent =
      `Verified ${outcome} · +${receipt.result.verifiedXp} XP · Level ${current.level} · ${current.levelXp} / ${current.nextLevelXp} XP`;
    const children: HTMLElement[] = [summaryLine];
    this.overlayProgressionReceiptEl.classList.toggle(
      'st-hud__victory-progression-receipt--promotion',
      promotion !== null,
    );
    if (promotion) {
      const promotionCard = document.createElement('section');
      promotionCard.className = 'st-hud__victory-promotion';
      const kicker = document.createElement('div');
      kicker.className = 'st-hud__victory-promotion-kicker';
      kicker.textContent = 'Commander promoted';
      const code = document.createElement('div');
      code.className = 'st-hud__victory-promotion-code';
      code.textContent = promotion.code;
      const insignia = document.createElement('div');
      insignia.className = 'st-hud__victory-promotion-insignia';
      insignia.setAttribute('aria-label', promotion.insignia.label);
      insignia.textContent = promotion.insignia.mark;
      const title = document.createElement('div');
      title.className = 'st-hud__victory-promotion-title';
      title.textContent = promotion.title;
      promotionCard.append(kicker, code, insignia, title);
      children.push(promotionCard);
    }
    if (career?.next) {
      const next = document.createElement('div');
      next.className = 'st-hud__victory-career-next';
      const xpToNext = Math.max(
        0,
        (career.next.level - current.level) * current.nextLevelXp - current.levelXp,
      );
      next.textContent =
        `${xpToNext.toLocaleString('en-US')} XP to ${career.next.code} ${career.next.title} at Level ${career.next.level}`;
      children.push(next);
    }
    this.overlayProgressionReceiptEl.replaceChildren(...children);
    this.overlayProgressionReceiptEl.hidden = false;
    this.verifiedNextOrderArmed = true;
    this.overlayPrimaryBtnEl.textContent = 'Brief next order';
    this.clearAnonymousProgressionHandoff();
  }

  private clearAnonymousProgressionHandoff(): void {
    this.overlayProgressionHandoffEl.hidden = true;
    this.overlayProgressionSignInBtnEl.remove();
  }

  /** Show the future-only account handoff for an anonymous local match. */
  setAnonymousProgressionHandoff(): void {
    if (!this.overlayProgressionReceiptEl.hidden) return;
    this.overlayProgressionHandoffEl.append(this.overlayProgressionSignInBtnEl);
    this.overlayProgressionHandoffEl.hidden = false;
  }

  private lockTerminalPayoff(): void {
    if (this.terminalPayoffLocked) return;
    this.setVictoryIsolation(true);
    this.terminalPayoffRootWasInert = this.root.inert;
    this.terminalPayoffOverlayWasInert = this.overlayRoot.inert;
    this.root.inert = true;
    this.overlayRoot.inert = true;
    this.terminalPayoffLocked = true;
    this.terminalPayoffStatusEl.dataset['payoffStartedAt'] = String(performance.now());
    delete this.terminalPayoffStatusEl.dataset['payoffReadyAt'];
    this.terminalPayoffStatusEl.textContent =
      'Terminal impact resolving. After action report incoming.';
  }

  private unlockTerminalPayoff(): void {
    if (!this.terminalPayoffLocked) return;
    this.root.inert = this.terminalPayoffRootWasInert;
    this.overlayRoot.inert = this.terminalPayoffOverlayWasInert;
    this.terminalPayoffLocked = false;
  }

  private scheduleTerminalReport(): void {
    if (
      !this.terminalImpactComplete
      || this.terminalState === null
      || this.terminalPayoffTimer !== null
      || this.overlayShown
    ) return;
    this.terminalPayoffTimer = setTimeout(() => {
      this.terminalPayoffTimer = null;
      const terminalState = this.terminalState;
      if (!terminalState || terminalState.phase !== 'GAME_OVER') return;
      this.showVictoryReport(terminalState);
    }, this.reduceMotion ? 120 : 420);
  }

  /** Begin the readable payoff beat only after the renderer says the impact has settled. */
  notifyTerminalImpactComplete(): void {
    this.terminalImpactComplete = true;
    this.terminalPayoffStatusEl.dataset['impactCompletedAt'] = String(performance.now());
    this.scheduleTerminalReport();
  }

  private showVictoryReport(state: GameState): void {
    this.unlockTerminalPayoff();
    this.overlayQuickOperationEl.hidden = this.quickOperation === null;
    this.overlayQuickOperationEl.textContent = this.quickOperation === null
      ? ''
      : `Operation · ${this.quickOperation.title} — ${this.quickOperation.briefing}`;
    if (state.winner === null) {
      // 0 alive (mutual kill) / round-win tie => DRAW per engine contract.
      this.overlayTextEl.textContent = 'Draw';
      this.overlayStatusEl.textContent = 'No tank standing';
      this.overlayTankEl.hidden = true;
      if (this.overlayTankEl.dataset['tankPreviewSignature'] !== undefined) {
        clearTankLoadoutPreview(this.overlayTankEl);
      }
      this.overlayEl.style.setProperty('--st-victory-color', '#ffd23f');
    } else {
      const winner = state.tanks.find((t) => t.id === state.winner);
      this.overlayTextEl.textContent = winner
        ? `${winner.playerName}${state.winnerTeam ? ` — Team ${state.winnerTeam}` : ''} wins`
        : 'Game Over';
      this.overlayStatusEl.textContent = winner ? 'Match winner' : 'Match complete';
      if (winner) {
        this.overlayTankEl.hidden = false;
        this.overlayEl.style.setProperty('--st-victory-color', winner.color);
        paintTankLoadoutPreview(
          this.overlayTankEl,
          winner.color,
          winner.loadout,
          'spotlight',
        );
      } else {
        this.overlayTankEl.hidden = true;
        if (this.overlayTankEl.dataset['tankPreviewSignature'] !== undefined) {
          clearTankLoadoutPreview(this.overlayTankEl);
        }
        this.overlayEl.style.setProperty('--st-victory-color', '#ffd23f');
      }
    }
    this.buildScoreboard(state, this.overlayScoreEl);
    this.setVictoryIsolation(true);
    this.overlayEl.classList.remove('st-hud__overlay--hidden');
    this.overlayEl.setAttribute('aria-hidden', 'false');
    this.overlayShown = true;
    this.terminalPayoffStatusEl.dataset['payoffReadyAt'] = String(performance.now());
    this.terminalPayoffStatusEl.textContent = 'After action report ready.';
    this.overlayPrimaryBtnEl.focus({ preventScroll: true });
  }

  /** Show/hide the GAME_OVER overlay, sequenced after terminal impact completion. */
  private syncOverlay(state: GameState): void {
    if (state.phase !== 'GAME_OVER') {
      if (this.overlayShown || this.terminalState !== null) this.hideVictoryReport();
      return;
    }
    if (this.overlayShown) return;
    if (this.terminalState === null) {
      // A networked game may end beneath Pause; terminal state supersedes it.
      if (this.paused) this.togglePause(false);
      const focused = document.activeElement;
      this.overlayPreviousFocus = focused instanceof HTMLElement ? focused : null;
      this.terminalState = state;
      this.lockTerminalPayoff();
    }
    this.scheduleTerminalReport();
  }

  /**
   * Explicitly hide BOTH end-of-game overlays (the GAME_OVER winner panel and the
   * ROUND_OVER shop) and reset their "shown" guards. syncOverlay/syncRoundOver only
   * hide these while the render loop is running, so once a game is torn down (quit to
   * menu / restart) nothing else would clear a lingering "{winner} wins!" banner — it
   * would bleed over the lobby. Called from the game teardown path (#13). Idempotent.
   */
  hideEndScreens(): void {
    if (this.built) this.hideVictoryReport(false);
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
          : key === 'parachute'
            ? `parachutes ${tank?.accessories.parachute ?? 0}`
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
        const winnerClass = t.id === state.winner ? ' st-hud__score-cell--winner' : '';
        return (
          cell(name, `st-hud__score-name${winnerClass}`) +
          (multi ? cell(`${t.roundWins}`, `st-hud__score-num${winnerClass}`) : '') +
          cell(`${t.kills}`, `st-hud__score-num${winnerClass}`) +
          cell(`${Math.round(t.totalDamage)}`, `st-hud__score-num${winnerClass}`)
        );
      })
      .join('');
    el.style.setProperty('--score-cols', multi ? '4' : '3');
    el.innerHTML = head + rows;
  }

  /** Inject the HUD stylesheet exactly once per document. */
  /** Health-bar label: a 🤖 prefix marks a CPU-controlled tank. */
  private static playerLabel(tank: TankState): string {
    const team = tank.team === 1 || tank.team === 2 ? ` · T${tank.team}` : '';
    return `${tank.ai ? '🤖 ' : ''}${tank.playerName}${team}`;
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
  margin: 0;
  padding: 0;
  list-style: none;
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
.st-hud__turn-order {
  flex: 0 0 18px;
  color: var(--ui-muted);
  font: 700 10px/1 var(--font-mono);
  text-align: center;
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
  grid-template-columns: 144px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.st-hud__tank-portrait-frame {
  position: relative;
  width: 144px;
  height: 80px;
  overflow: hidden;
  border: 0;
  border-radius: 5px;
  background:
    radial-gradient(circle at 50% 82%, color-mix(in srgb, var(--st-turn-color) 22%, transparent), transparent 48%),
    linear-gradient(180deg, rgba(122, 215, 255, 0.055), rgba(7, 4, 12, 0.8));
  box-shadow:
    inset 0 0 0 1px rgba(255, 210, 63, 0.2),
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
  width: 144px;
  height: 80px;
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
#battle-rail .st-hud__conn,
#battle-rail .st-hud__toast,
#battle-rail .st-hud__turnwatch {
  right: 16px;
  left: auto;
  transform: none;
}
#battle-rail .st-hud__conn { top: 4px; }
#battle-rail .st-hud__toast { top: 36px; }
#battle-rail .st-hud__turnwatch { top: 68px; }
.st-hud__aim {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  padding: 5px 10px;
  border-radius: 4px;
  background: rgba(12, 7, 22, 0.55);
  border: 1px solid rgba(255, 210, 63, 0.14);
  font-family: var(--font-mono);
  font-size: var(--ui-type-body);
  line-height: 1.5;
  color: var(--text-gold);
}
.st-hud__aim-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
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
/* The Armory is reparented into the modal layer while open. Keep that modal
 * independently bounded: the old rail-only open rule left it at natural
 * content height on touch, extending past the fitted stage. */
#modal-layer > .st-hud__strip--open {
  position: absolute;
  inset: clamp(8px, 8%, 48px) clamp(8px, 4%, 32px);
  box-sizing: border-box;
  z-index: 2;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-color: var(--ui-line-strong);
  background: var(--ui-surface-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
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
.st-hud__strip-toggle[aria-expanded='true'] > .st-ui-icon:last-child {
  transform: rotate(180deg);
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
.st-hud__strip-body {
  display: grid;
  grid-template-columns: minmax(180px, 0.48fr) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  flex: 1 1 auto;
  gap: 5px;
  overflow: hidden;
}
.st-hud__strip-body[hidden] { display: none; }
.st-hud__arsenal-drawer-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.24);
}
.st-hud__arsenal-drawer-title {
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.st-hud__arsenal-drawer-close {
  min-width: 52px;
  min-height: 30px;
  padding: 3px 9px;
  border: 1px solid rgba(255, 210, 63, 0.38);
  border-radius: 3px;
  background: rgba(255, 210, 63, 0.08);
  color: var(--text-gold);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
}
.st-hud__arsenal-drawer-close:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.st-hud__strip-grid {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
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
.st-weapon-icon[data-weapon='heavy_shield'] { color: #b77aff; }
.st-weapon-icon[data-family='terrain'] { color: #c49359; }
.st-weapon-icon[data-family='drill'] { color: #f3a83b; }
.st-weapon-icon[data-family='tracer'] { color: #55e6ff; }
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
.st-hud__weapon-intel {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  box-sizing: border-box;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 9px;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid rgba(122, 215, 255, 0.3);
  border-radius: var(--ui-radius-sm);
  background:
    linear-gradient(135deg, rgba(122, 215, 255, 0.08), transparent 52%),
    rgba(7, 6, 13, 0.86);
  box-shadow: inset 0 0 18px rgba(122, 215, 255, 0.04);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.st-hud__weapon-intel[hidden] { display: none; }
.st-hud__weapon-intel-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(255, 210, 63, 0.2);
}
.st-hud__weapon-intel-name {
  color: var(--gold);
  font-family: var(--font-display);
  margin: 0;
  font-size: var(--st-weapon-intel-name-size, 12px);
  letter-spacing: 0.7px;
}
.st-hud__weapon-intel-ammo {
  color: var(--tank-blue-lite, #7ad7ff);
  font-family: var(--font-mono);
  font-size: var(--st-weapon-intel-ammo-size, 9px);
  white-space: nowrap;
}
.st-hud__weapon-intel-field {
  display: grid;
  gap: 1px;
  min-width: 0;
  margin: 0;
}
.st-hud__weapon-intel-label {
  color: var(--ui-muted);
  font-family: var(--font-mono);
  font-size: var(--st-weapon-intel-label-size, 7px);
  font-weight: 700;
  letter-spacing: 0.9px;
  line-height: 1.1;
  text-transform: uppercase;
}
.st-hud__weapon-intel-value {
  color: var(--ui-copy);
  font-family: var(--font-sans);
  font-size: var(--st-weapon-intel-value-size, 9px);
  line-height: 1.25;
  overflow-wrap: anywhere;
}
#app.is-compact .st-hud__weapon-intel {
  box-sizing: border-box;
  flex: 0 0 210px;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px 7px;
  padding: 6px 7px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
#app.is-compact .st-hud__weapon-intel-name {
  font-size: var(--st-weapon-intel-name-size, 12px);
}
#app.is-compact .st-hud__weapon-intel-value {
  font-size: var(--st-weapon-intel-value-size, 9px);
  line-height: 1.15;
}
/* First Salvo becomes a compact in-console ribbon after its one-time briefing. */
.st-hud__first-salvo {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 7px;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  max-height: 44px;
  box-sizing: border-box;
  padding: 0 5px;
  border: 1px solid rgba(255, 210, 63, 0.68);
  border-radius: 4px;
  background:
    linear-gradient(115deg, rgba(255, 210, 63, 0.13), transparent 56%),
    rgba(15, 8, 25, 0.94);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 233, 168, 0.08);
  color: var(--text);
  overflow: hidden;
}
.st-hud__first-salvo--hidden { display: none; }
.st-hud__first-salvo-progress {
  grid-column: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.st-hud__first-salvo-copy {
  grid-column: 2;
  color: var(--ui-copy);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  grid-column: 3;
  grid-row: 1;
  min-width: 40px;
  min-height: 40px;
  padding: 3px 6px;
  border: 1px solid rgba(255, 210, 63, 0.34);
  border-radius: 3px;
  background: transparent;
  color: var(--ui-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
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
.st-hud__quick-chat {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  font: 600 12px/1.2 system-ui, sans-serif;
}
.st-hud__quick-chat--hidden { display: none; }
.st-hud__quick-chat-toggle,
.st-hud__quick-chat-option {
  border: 1px solid rgba(255, 210, 63, 0.58);
  border-radius: 5px;
  padding: 6px 10px;
  color: var(--text-gold, #ffe9b0);
  background: rgba(30, 18, 48, 0.94);
  font: inherit;
  cursor: pointer;
}
.st-hud__quick-chat-toggle:hover,
.st-hud__quick-chat-option:hover { background: rgba(100, 54, 28, 0.96); }
.st-hud__quick-chat-toggle:focus-visible,
.st-hud__quick-chat-option:focus-visible {
  outline: 2px solid var(--ui-focus, #fff);
  outline-offset: 2px;
}
.st-hud__quick-chat-panel {
  display: grid;
  gap: 4px;
  min-width: 148px;
}
.st-hud__quick-chat-panel--hidden { display: none; }
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
.st-hud__command-menu-exit {
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 210, 63, 0.28);
}
.st-hud__restart--ghost {
  background: transparent;
  color: var(--gold);
  border: 1px solid var(--gold);
}
.st-hud__restart--ghost:hover { background: rgba(255, 210, 63, 0.16); }

/* ---- Victory after-action report ------------------------------------- */
.st-hud__overlay--victory {
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 38% 48%, color-mix(in srgb, var(--st-victory-color, #ffd23f) 15%, transparent), transparent 36%),
    rgba(5, 3, 11, 0.84);
}
.st-hud__victory-backdrop {
  position: absolute;
  inset: -3%;
  z-index: -2;
  width: 106%;
  height: 106%;
  object-fit: cover;
  opacity: 0.25;
  filter: saturate(0.72) contrast(1.08) brightness(0.58) blur(1px);
  transform: scale(1.02);
}
.st-hud__overlay--victory::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(90deg, rgba(6, 3, 12, 0.70), transparent 42%, rgba(6, 3, 12, 0.76)),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 4px);
  pointer-events: none;
}
.st-hud__overlay-panel--victory {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(300px, 0.92fr) minmax(360px, 1.08fr);
  align-items: stretch;
  gap: 0;
  width: min(840px, calc(100% - 44px));
  max-height: calc(100% - 36px);
  min-height: 376px;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--st-victory-color, #ffd23f) 72%, #fff 8%);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(24, 13, 39, 0.98), rgba(8, 5, 17, 0.99));
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.72),
    0 0 0 1px rgba(255, 236, 186, 0.08) inset,
    0 0 42px color-mix(in srgb, var(--st-victory-color, #ffd23f) 24%, transparent);
  animation: st-hud-victory-arrive 360ms cubic-bezier(.2,.82,.2,1) both;
}
.st-hud__victory-hero {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 30px 28px 26px;
  overflow: hidden;
  border-right: 1px solid rgba(255, 232, 179, 0.12);
  background:
    radial-gradient(circle at 50% 68%, color-mix(in srgb, var(--st-victory-color, #ffd23f) 24%, transparent), transparent 45%),
    linear-gradient(155deg, rgba(255,255,255,0.035), rgba(0,0,0,0.18));
}
.st-hud__victory-hero::before {
  content: '';
  position: absolute;
  inset: 14px;
  border: 1px solid rgba(255, 232, 179, 0.08);
  border-radius: 9px;
  pointer-events: none;
}
.st-hud__victory-eyebrow,
.st-hud__victory-status,
.st-hud__victory-score-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.22em;
}
.st-hud__victory-eyebrow {
  position: relative;
  z-index: 1;
  color: var(--text-gold);
  font-size: 11px;
}
.st-hud__victory-tank-frame {
  position: relative;
  min-height: 240px;
  display: grid;
  place-items: center;
  animation: st-hud-victory-float 3.6s ease-in-out infinite;
}
.st-hud__victory-tank-frame::after {
  content: '';
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 32px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--st-victory-color, #ffd23f) 36%, transparent);
  filter: blur(14px);
  opacity: 0.72;
}
.st-hud__victory-tank {
  position: relative;
  z-index: 1;
  width: 280px;
  max-width: 96%;
  height: auto;
  image-rendering: auto;
  filter: drop-shadow(0 18px 16px rgba(0,0,0,0.58));
}
.st-hud__victory-report {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  padding: 34px 38px 32px;
}
.st-hud__victory-status {
  color: var(--st-victory-color, var(--gold));
  font-size: 10px;
  font-weight: 700;
}
.st-hud__victory-operation {
  margin-top: 8px;
  color: #ffe0a0;
  font: 700 10px/1.4 var(--font-mono);
  letter-spacing: 0.03em;
}
.st-hud__victory-operation[hidden] { display: none; }
.st-hud__victory-field-order {
  margin-top: 8px;
  color: #c5f0c4;
  font: 700 10px var(--font-mono);
  letter-spacing: 0.04em;
}
.st-hud__victory-field-order[hidden] { display: none; }
.st-hud__victory-progression-receipt {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 10px;
  align-self: flex-start;
  width: min(100%, 430px);
  box-sizing: border-box;
  margin-top: 12px;
  padding: 5px 8px;
  color: #c5f0c4;
  border: 1px solid rgba(151, 229, 149, 0.48);
  border-radius: 4px;
  background: rgba(78, 147, 74, 0.16);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.st-hud__victory-progression-summary {
  grid-column: 1 / -1;
}
.st-hud__victory-progression-receipt[hidden] { display: none; }
.st-hud__victory-progression-receipt--promotion {
  border-color: rgba(255, 210, 63, 0.72);
  background: linear-gradient(135deg, rgba(255, 210, 63, 0.16), rgba(78, 147, 74, 0.14));
}
.st-hud__victory-promotion {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 3px 10px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 210, 63, 0.28);
}
.st-hud__victory-promotion-kicker {
  grid-column: 1 / -1;
  color: var(--gold);
  font-size: 9px;
}
.st-hud__victory-promotion-code,
.st-hud__victory-promotion-insignia {
  color: var(--gold);
  font-size: 17px;
}
.st-hud__victory-promotion-title { color: var(--text); }
.st-hud__victory-career-next {
  grid-column: 1 / -1;
  color: var(--text-dim);
  font-size: 9px;
}
#app.is-compact .st-hud__victory-progression-summary {
  font-size: calc(var(--st-store-buy-target) * 0.2);
}
.st-hud__victory-progression-handoff {
  display: grid;
  justify-items: start;
  gap: 8px;
  margin-top: 12px;
  color: var(--text-dim);
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.35;
}
.st-hud__victory-progression-handoff[hidden] { display: none; }
.st-hud__victory-progression-handoff p { margin: 0; }
.st-hud__victory-progression-sign-in {
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 210, 63, 0.42);
  border-radius: 7px;
  background: rgba(255, 210, 63, 0.08);
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.st-hud__victory-progression-sign-in:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.st-hud__victory-title {
  margin: 7px 0 28px;
  color: var(--text);
  font-size: clamp(30px, 3.2vw, 45px);
  line-height: 0.98;
  letter-spacing: -0.025em;
  text-wrap: balance;
  text-shadow: 0 0 22px color-mix(in srgb, var(--st-victory-color, #ffd23f) 28%, transparent);
}
.st-hud__victory-score-label {
  color: var(--ui-muted);
  font-size: 9px;
}
.st-hud__overlay-panel--victory .st-hud__score {
  width: 100%;
  margin: 8px 0 28px;
  gap: 0;
  font-size: 13px;
}
.st-hud__overlay-panel--victory .st-hud__score > * {
  padding: 7px 9px;
  border-bottom: 1px solid rgba(255, 232, 179, 0.08);
}
.st-hud__overlay-panel--victory .st-hud__score-th {
  padding-top: 4px;
  color: var(--ui-muted);
  border-bottom-color: rgba(255, 232, 179, 0.16);
}
.st-hud__score-cell--winner {
  color: #fff6d6;
  background: color-mix(in srgb, var(--st-victory-color, #ffd23f) 15%, transparent);
  border-bottom-color: color-mix(in srgb, var(--st-victory-color, #ffd23f) 24%, transparent) !important;
}
.st-hud__score-name.st-hud__score-cell--winner {
  box-shadow: 3px 0 0 var(--st-victory-color, var(--gold)) inset;
  font-weight: 800;
}
.st-hud__overlay-panel--victory .st-hud__overlay-btns { width: 100%; }
.st-hud__overlay-panel--victory .st-hud__restart {
  flex: 1;
  min-height: 44px;
  border-radius: 7px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.st-hud__victory-primary {
  border: 1px solid color-mix(in srgb, var(--st-victory-color, #ffd23f) 74%, #fff 12%);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--st-victory-color, #ffd23f) 78%, #fff 8%),
    color-mix(in srgb, var(--st-victory-color, #ffd23f) 72%, #000 22%));
}
@keyframes st-hud-victory-arrive {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes st-hud-victory-float {
  50% { transform: translateY(-4px); }
}

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
  width: min(920px, calc(100% - 36px));
  height: min(720px, calc(100% - 28px));
  max-height: 86%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid rgba(122, 215, 255, 0.45);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(18, 11, 30, 0.98), rgba(10, 6, 18, 0.98));
  box-shadow: 0 0 28px rgba(122, 215, 255, 0.22);
}
.st-hud__store-header {
  display: flex;
  flex: 0 0 auto;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(122, 215, 255, 0.16);
}
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
.st-hud__store-menu {
  pointer-events: auto;
  cursor: pointer;
  min-height: 34px;
  padding: 5px 10px;
  border: 1px solid rgba(255, 210, 63, 0.58);
  border-radius: 4px;
  background: transparent;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 12px;
}
.st-hud__store-menu:hover { background: rgba(255, 210, 63, 0.16); }
.st-hud__store-catalog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 18px 18px;
  scrollbar-gutter: stable;
}
.st-hud__store-section { min-width: 0; }
.st-hud__store-section h2 {
  margin: 0 0 8px;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.st-hud__store-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.st-hud__store-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 70px;
  padding: 8px;
  border: 1px solid rgba(255, 210, 63, 0.18);
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018));
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}
.st-hud__store-row:hover {
  border-color: rgba(255, 210, 63, 0.42);
  background: linear-gradient(135deg, rgba(255, 210, 63, 0.11), rgba(255, 255, 255, 0.03));
}
.st-hud__store-row:focus-within {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(255, 210, 63, 0.2);
}
.st-hud__store-info { display: flex; flex: 1 1 auto; flex-direction: column; gap: 3px; min-width: 0; }
.st-hud__store-name-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.st-hud__store-name { color: var(--text-gold); font-size: 13px; }
.st-hud__store-summary {
  color: var(--ui-muted);
  font-size: 10px;
  line-height: 1.25;
}
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
.st-hud__store-catalog .st-hud__store-buy {
  flex: 0 0 auto;
  min-width: 70px;
  min-height: max(44px, var(--st-store-buy-target, 44px));
  padding: 5px 8px;
  transition: background 120ms ease, box-shadow 120ms ease;
}
.st-hud__store-buy:hover { background: rgba(255, 210, 63, 0.26); }
.st-hud__store-menu:focus-visible,
.st-hud__store-catalog .st-hud__store-buy:focus-visible,
.st-hud__store-close:focus-visible {
  outline: 2px solid #7ad7ff;
  outline-offset: 2px;
}
.st-hud__store-price { font-size: 12px; font-variant-numeric: tabular-nums; }
.st-hud__store-bundle { font-size: 9px; opacity: 0.7; }
.st-hud__store-buy--disabled { opacity: 0.32; cursor: not-allowed; }
.st-hud__store-buy--disabled:hover { background: rgba(255, 210, 63, 0.12); }
.st-hud__store-footer {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 10px 18px 14px;
  border-top: 1px solid rgba(122, 215, 255, 0.16);
}
.st-hud__store-close {
  pointer-events: auto;
  cursor: pointer;
  min-height: 40px;
  padding: 7px 18px;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: transparent;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 13px;
}
.st-hud__store-close:hover { background: rgba(255, 210, 63, 0.16); }
#app.is-compact .st-hud__store-panel {
  width: calc(100% - 24px);
  height: calc(100% - 20px);
  max-height: 92%;
}
#app.is-compact .st-hud__store-catalog { grid-template-columns: minmax(0, 1fr); }
#app.is-compact .st-hud__store-section-grid { grid-template-columns: minmax(0, 1fr); }
#app.is-compact .st-hud__store-row { min-height: 64px; }
/* Preserve the compact design floor on top of the all-scale physical target. */
#app.is-compact .st-hud__store-catalog .st-hud__store-buy {
  min-height: max(72px, var(--st-store-buy-target, 72px));
}

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

.st-hud__verified-deployment {
  display: grid;
  gap: 3px;
  padding: 8px 9px;
  border: 1px solid rgba(91, 190, 255, 0.34);
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(34, 79, 112, 0.28), rgba(15, 18, 32, 0.78));
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.35;
}
.st-hud__verified-deployment[hidden] { display: none; }
.st-hud__verified-title {
  color: #8dd6ff;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.st-hud__verified-budget { color: var(--text); }
.st-hud__verified-deadline { color: var(--gold); }
.st-hud__verified-state { color: var(--text-dim); }
.st-hud__field-order {
  color: #c5f0c4;
  font-weight: 700;
}
.st-hud__field-order[hidden] { display: none; }
.st-hud__verified-retry {
  min-height: 36px;
  margin-top: 3px;
  border: 1px solid rgba(141, 214, 255, 0.62);
  border-radius: 4px;
  background: rgba(63, 120, 184, 0.22);
  color: #bfe8ff;
  font: 700 10px var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.st-hud__verified-retry[hidden] { display: none; }
.st-hud__verified-expiry {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(8, 8, 16, 0.84);
  backdrop-filter: blur(5px);
}
.st-hud__verified-expiry[hidden] { display: none; }
.st-hud__verified-expiry-panel {
  width: min(100%, 430px);
  box-sizing: border-box;
  padding: 24px;
  border: 1px solid rgba(255, 210, 63, 0.54);
  border-radius: 8px;
  background: linear-gradient(160deg, rgba(46, 29, 44, 0.98), rgba(15, 14, 27, 0.98));
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.62);
  color: var(--text);
}
.st-hud__verified-expiry-panel h2 { margin: 0 0 8px; color: var(--gold); }
.st-hud__verified-expiry-panel p { margin: 0; color: var(--text-dim); }
.st-hud__verified-expiry-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}
.st-hud__verified-expiry-actions button {
  min-height: 44px;
  border: 1px solid rgba(255, 210, 63, 0.42);
  border-radius: 5px;
  background: rgba(255, 210, 63, 0.09);
  color: var(--text);
  font: 700 11px var(--font-display);
}
.st-hud__terminal-payoff-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
#app.is-compact .st-hud__verified-expiry-actions { grid-template-columns: 1fr; }

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
  .st-hud__overlay-panel--victory,
  .st-hud__victory-tank-frame { animation: none; }
  .st-hud__player--active { animation: none; }
  .st-hud__player--handoff,
  .st-hud__active-row--handoff { animation: none; }
  .st-hud__player--hit::after { animation: none; opacity: 0; }
  .st-hud__bar-fill,
  .st-hud__weapon-btn,
  .st-hud__restart { transition: none; }
}

/* ===== Coarse-pointer (touch) overrides ================================ */
/* Enlarge interactive targets to ≥44px and hide the keyboard legend. */
@media (pointer: coarse) {
  #battle-rail { padding: 4px 8px; }
  #hud .st-ui-glyph { width: 31px; height: 31px; }
  #hud .st-ui-glyph > .st-ui-icon { width: 25px; height: 25px; }
  .st-hud__weapon-btn .st-weapon-icon,
  .st-hud__store-name-line .st-weapon-icon { width: 23px; height: 23px; }
  .st-hud__conn { top: 176px; }
  .st-hud__toast { top: 214px; }
  .st-hud__turnwatch { top: 252px; }
  /* The fixed stage scales to ~0.488 on Pixel 5 landscape. Match the drawer
     toggle's authored 91px floor so weapon choices remain >=44 rendered px. */
  .st-hud__weapon-btn { min-height: 91px; }
  .st-hud__strip-toggle { min-width: 91px; min-height: 91px; }
  .st-hud__store-buy { min-height: 44px; }
  .st-hud__store-catalog .st-hud__store-buy {
    min-height: max(44px, var(--st-store-buy-target, 44px));
  }
  .st-hud__restart    { min-height: 48px; padding-top: 12px; padding-bottom: 12px; }
  #hud .st-hud__menu  { display: none; }
  .st-hud__store-btn  { min-height: 44px; }
  /* The supported Pixel 5 landscape viewport zooms the fixed stage to 0.488x,
     so 91 logical px preserves a >=44 CSS-pixel hit target after scaling. */
  .st-hud__primary-action { min-height: 91px; }
  .st-hud__first-salvo-skip { min-width: 91px; min-height: 91px; }
  .st-hud__store-close { min-height: 44px; }
  .st-hud__store-menu { min-height: 91px; }
  .st-hud__turnwatch-leave { min-height: 44px; padding: 0 14px; }
  #battle-rail .st-hud__turnwatch--stalled {
    top: 0;
    box-sizing: border-box;
    height: 98px;
    padding: 0 8px;
  }
  #battle-rail .st-hud__turnwatch--stalled .st-hud__turnwatch-leave {
    min-height: 91px;
  }
}

/* Touch uses the same semantic command console. */
@media (pointer: coarse) {
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
  min-width: 40px;
  min-height: 40px;
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
  font-size: var(--st-command-readability-size, 11px);
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
  width: 100%;
  min-width: 0;
  pointer-events: none;
}
.st-hud__fuel-label {
  box-sizing: border-box;
  width: 100%;
  color: var(--ui-muted);
  font-family: var(--font-mono);
  font-size: var(--st-command-readability-size, 11px);
  line-height: 1;
  letter-spacing: 0.1px;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
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
#app.is-compact .st-hud__identity-lockup {
  grid-template-columns: 90px minmax(0, 1fr);
}
#app.is-compact .st-hud__tank-portrait-frame,
#app.is-compact .st-hud__tank-portrait {
  width: 90px;
  height: 50px;
}
#app.is-compact .st-hud__turn-actions {
  padding: 3px 6px;
}
#app.is-compact .st-hud__move-btn {
  min-height: 40px;
}
#app.is-compact .st-hud__fuel-label {
  font-size: 9px;
  letter-spacing: 0.35px;
}
#app.is-compact .st-hud__fuel-value {
  font-size: 15px;
}
#app.is-compact .st-hud__control-label {
  font-size: 11px;
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
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 5px;
  }
  #app .st-hud__tank-portrait-frame,
  #app .st-hud__tank-portrait {
    width: 72px;
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
  #app.is-compact .st-hud__identity-lockup {
    grid-column: 1 / -1;
    grid-template-columns: 90px minmax(0, 1fr);
  }
  #app.is-compact .st-hud__mobility {
    grid-row: 2;
  }
  #app .st-hud__mobility > .st-hud__move-btn {
    display: none;
  }
  #app .st-hud__fuel-meter {
    width: 58px;
    height: 58px;
    min-width: 58px;
    min-height: 58px;
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
    min-height: 91px;
  }
}
.st-hud__active-row--handoff {
  animation: st-hud-turn-handoff 560ms ease-out;
}
#app .st-hud__active-row--hidden { display: none; }
/* Shot progress replaces the owner row during submit, flight, and resolution. */
.st-hud__aim--hidden { display: none; }

/* ===== Battle command surface ==========================================
 * The protected rail is the active-turn workspace, not a second side panel.
 * Commander context and the nested Fire Control surface stay in one scan path
 * from left to right.  The terminal action belongs to Fire Control; it must
 * never reserve an empty outer grid track. */
#battle-rail .st-hud__command-console {
  pointer-events: auto;
  display: grid;
  grid-template-columns: minmax(218px, 0.86fr) minmax(0, 2.91fr);
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}
.st-hud__first-salvo-briefing {
  position: absolute;
  inset: 0;
  z-index: 72;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(5, 3, 10, 0.76);
  pointer-events: auto;
}
.st-hud__first-salvo-briefing[hidden] { display: none; }
.st-hud__first-salvo-briefing-panel {
  width: min(520px, calc(100% - 24px));
  box-sizing: border-box;
  padding: 22px;
  border: 1px solid rgba(255, 210, 63, 0.7);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(67, 37, 23, 0.98), rgba(12, 7, 22, 0.98));
  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.64);
  color: var(--ui-copy);
}
.st-hud__first-salvo-briefing-eyebrow {
  color: var(--gold);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.st-hud__first-salvo-briefing-panel h2 {
  margin: 5px 0 14px;
  color: var(--text-gold);
  font-family: var(--font-display);
  font-size: 26px;
}
.st-hud__first-salvo-briefing-steps {
  display: grid;
  gap: 8px;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}
.st-hud__first-salvo-briefing-steps li {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 10px;
  font-size: 13px;
  line-height: 1.35;
}
.st-hud__first-salvo-briefing-steps strong { color: var(--gold); }
.st-hud__first-salvo-briefing-panel > .st-hud__restart { width: 100%; min-height: 44px; }
@media (pointer: coarse) {
  .st-hud__first-salvo {
    height: 44px;
    padding-block: 0;
    border-width: 0;
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.42),
      inset 0 0 0 1px rgba(255, 210, 63, 0.68);
  }
  .st-hud__first-salvo-skip { min-height: 44px; }
}
#battle-rail .st-hud__console-context,
#battle-rail .st-hud__console-solution {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 210, 63, 0.26);
  border-radius: 7px;
  background:
    linear-gradient(145deg, rgba(255, 233, 168, 0.06), transparent 44%),
    rgba(10, 6, 19, 0.72);
  box-shadow: inset 0 0 0 1px rgba(8, 4, 13, 0.56);
}
#battle-rail .st-hud__console-context {
  position: relative;
  display: flex;
  align-items: stretch;
}
#battle-rail .st-hud__console-context .st-hud__active-row {
  flex: 1;
  padding: 7px 8px 7px 12px;
}
/* Fine-pointer Commander is a genuine dossier, not a small card stranded in
   a tall rail column.  The portrait consumes the available identity band;
   mobility remains pinned to the operational edge. */
@media (pointer: fine) {
  #battle-rail .st-hud__console-context .st-hud__active-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  #battle-rail .st-hud__identity-lockup {
    align-content: start;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    min-height: 0;
  }
  #battle-rail .st-hud__tank-portrait-frame,
  #battle-rail .st-hud__tank-portrait {
    width: 100%;
    height: auto;
    aspect-ratio: 144 / 80;
    min-height: 0;
  }
  #battle-rail .st-hud__tactical-row {
    grid-row: 2;
  }
}
#battle-rail .st-hud__console-solution {
  position: relative;
  display: grid;
  grid-template-columns: minmax(190px, 0.95fr) minmax(180px, 1.05fr) minmax(180px, 0.9fr);
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: 6px;
  padding: 5px;
}
#battle-rail .st-hud__console-solution > .st-hud__weapon {
  grid-column: 1;
  grid-row: 1;
  grid-template-columns: 25px minmax(0, 1fr) 40px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 3px 5px;
  padding: 5px;
}
#battle-rail .st-hud__console-solution .st-hud__weapon-icon { grid-column: 1; grid-row: 1; }
#battle-rail .st-hud__console-solution .st-hud__weapon-copy { grid-column: 2; grid-row: 1; }
.st-hud__weapon-ammo {
  color: var(--ui-copy);
  font-family: var(--font-mono);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}
#battle-rail .st-hud__console-solution .st-hud__weapon > .st-hud__solution-control {
  grid-column: 3;
  grid-row: 1;
}
#battle-rail .st-hud__arsenal-trigger {
  grid-column: 1 / -1;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 40px;
  padding: 2px 5px;
  border: 1px solid rgba(255, 210, 63, 0.28);
  border-radius: 4px;
  color: var(--gold);
  background: rgba(255, 210, 63, 0.06);
}
#battle-rail .st-hud__arsenal-trigger .st-ui-glyph { width: 25px; height: 25px; }
#battle-rail .st-hud__arsenal-trigger > .st-ui-icon:last-child { margin-left: auto; }
#battle-rail .st-hud__solution-adjustments {
  grid-column: 3;
  grid-row: 1;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 4px;
  min-width: 0;
}
#battle-rail .st-hud__solution-adjustment {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px 40px;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 3px;
  border: 1px solid rgba(122, 215, 255, 0.24);
  border-radius: 4px;
  background: rgba(9, 5, 17, 0.52);
}
.st-hud__solution-adjustment-label {
  color: var(--ui-copy);
  font-family: var(--font-display);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}
.st-hud__solution-control {
  display: grid;
  place-items: center;
  gap: 1px;
  min-width: 40px;
  min-height: 40px;
  padding: 2px;
  border: 1px solid rgba(122, 215, 255, 0.32);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(122, 215, 255, 0.14), rgba(12, 7, 22, 0.72));
  color: var(--tank-blue-lite, #7ad7ff);
  cursor: pointer;
}
.st-hud__solution-control:hover:not(:disabled) { border-color: rgba(122, 215, 255, 0.7); }
.st-hud__solution-control:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 1px; }
.st-hud__solution-control:disabled { cursor: not-allowed; opacity: 0.36; }
.st-hud__solution-direction { font-family: var(--font-display); font-size: 13px; font-weight: 800; line-height: 1.05; }
.st-hud__solution-control kbd,
.st-hud__trajectory-guide kbd {
  min-width: 13px;
  padding: 1px 3px;
  border: 1px solid rgba(122, 215, 255, 0.25);
  border-radius: 2px;
  background: rgba(122, 215, 255, 0.08);
  color: rgba(183, 225, 255, 0.82);
  font-family: var(--font-mono);
  font-size: var(--st-command-readability-size, 11px);
  line-height: 1;
}
#battle-rail .st-hud__trajectory-guide {
  grid-column: 1 / -1;
  grid-row: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 16px;
  color: var(--ui-muted);
  font-size: 8px;
  letter-spacing: 0.5px;
}
#battle-rail .st-hud__console-solution > .st-hud__first-salvo {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-self: stretch;
  width: auto;
  max-width: 100%;
  margin-inline: 5px;
}
#battle-rail .st-hud__last-salvo {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 6px;
  min-height: 40px;
  padding: 4px 7px;
  overflow: hidden;
  border: 1px solid rgba(255, 210, 63, 0.42);
  border-radius: 4px;
  background: rgba(37, 20, 27, 0.9);
  color: var(--ui-copy);
  font-size: var(--st-command-readability-size, 11px);
  line-height: 1.05;
}
#battle-rail .st-hud__last-salvo[hidden] { display: none; }
#battle-rail .st-hud__last-salvo-label {
  grid-row: 1 / -1;
  color: var(--ui-muted);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
}
#battle-rail .st-hud__last-salvo-readout,
#battle-rail .st-hud__last-salvo-correction {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#battle-rail .st-hud__last-salvo-correction {
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 12px;
}
#battle-rail .st-hud__tactical-row:has(.st-hud__last-salvo:not([hidden])) > .st-hud__mobility {
  display: none;
}
#battle-rail .st-hud__strip--collapsed { display: none; }
#battle-rail .st-hud__strip--open {
  position: absolute;
  inset: 4px;
  z-index: 8;
  display: flex;
  margin: 0;
  padding: 6px;
  /* Only the weapon grid may scroll. Letting the entire drawer scroll moves
     its cards behind the arena and makes an apparently visible weapon unclickable. */
  overflow: hidden;
  border: 1px solid var(--ui-line-strong);
  border-radius: 6px;
  background: var(--ui-surface-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
}
#battle-rail .st-hud__turn-owner,
#battle-rail .st-hud__weapon-label,
#battle-rail .st-hud__weapon-value,
#battle-rail .st-hud__weapon-ammo,
#battle-rail .st-hud__solution-adjustment-label,
#battle-rail .st-hud__solution-direction,
#battle-rail .st-hud__trajectory-guide,
#battle-rail .st-hud__first-salvo-progress,
#battle-rail .st-hud__first-salvo-copy,
#battle-rail .st-hud__first-salvo-skip,
#battle-rail .st-hud__console-state,
#battle-rail .st-hud__commitment-explanation {
  font-size: var(--st-command-readability-size, 11px);
}
#app #battle-rail .st-hud__turn-owner,
#app #battle-rail .st-hud__fuel-value,
#app #battle-rail .st-hud__weapon-value,
#app #battle-rail .st-hud__console-state,
#app #battle-rail .st-hud__primary-action-label {
  font-size: calc(var(--st-command-readability-size, 11px) * 1.1);
}
#app.is-compact #battle-rail .st-hud__fuel-label {
  font-size: var(--st-command-readability-size, 11px);
}
#battle-rail .st-hud__weapon-label { line-height: 1.25; }
#app.is-compact #battle-rail .st-hud__weapon-label { display: none; }
  @media (pointer: coarse) {
  #battle-rail .st-hud__command-console {
    --st-rail-touch-target: var(--st-deployment-choice-target, 91px);
    grid-template-columns: 270px minmax(0, 1fr);
    gap: 5px;
  }
  #hud .st-hud__menu {
    display: flex;
    min-height: var(--st-rail-touch-target, var(--st-deployment-choice-target, 91px));
  }
  #battle-rail .st-hud__active-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 4px;
    padding: 5px 7px 5px 10px;
  }
  #battle-rail .st-hud__identity-lockup {
    grid-column: 1;
    grid-row: 1;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 5px;
  }
  #battle-rail .st-hud__tank-portrait-frame,
  #battle-rail .st-hud__tank-portrait {
    width: 90px;
    height: 50px;
  }
  #battle-rail .st-hud__tactical-row {
    display: block;
    grid-column: 1;
    grid-row: 2;
  }
  #battle-rail .st-hud__mobility {
    display: grid;
    grid-template-columns: var(--st-rail-touch-target) minmax(58px, 1fr) var(--st-rail-touch-target);
    gap: 4px;
  }
  #battle-rail .st-hud__mobility > .st-hud__move-btn {
    display: flex;
    min-width: var(--st-rail-touch-target);
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__fuel-meter {
    width: 58px;
    height: 58px;
    min-width: 58px;
    min-height: 58px;
  }
  #battle-rail .st-hud__console-solution {
    grid-template-columns: 180px 150px minmax(360px, 1fr);
    grid-template-rows: minmax(var(--st-rail-touch-target), 1fr) auto auto;
    gap: 4px;
    padding: 4px;
  }
  #battle-rail .st-hud__console-solution > .st-hud__weapon {
    grid-template-columns: 25px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) var(--st-rail-touch-target);
    gap: 3px 4px;
    padding: 3px;
  }
  #battle-rail .st-hud__console-solution .st-hud__weapon-copy {
    overflow: hidden;
  }
  #battle-rail .st-hud__console-solution .st-hud__weapon-value,
  #battle-rail .st-hud__console-solution .st-hud__weapon-ammo {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #battle-rail .st-hud__console-solution .st-hud__weapon > .st-hud__solution-control {
    display: none;
  }
  #battle-rail .st-hud__arsenal-trigger {
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__arsenal-drawer-close {
    min-width: var(--st-rail-touch-target);
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__solution-adjustments {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: minmax(var(--st-rail-touch-target), 1fr);
    gap: 4px;
  }
  #battle-rail .st-hud__solution-adjustment {
    grid-template-columns: repeat(2, minmax(var(--st-rail-touch-target), 1fr));
    grid-template-rows: auto minmax(var(--st-rail-touch-target), 1fr);
    gap: 2px;
    padding: 2px;
  }
  #battle-rail .st-hud__solution-adjustment-label {
    grid-column: 1 / -1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #battle-rail .st-hud__solution-control {
    min-width: var(--st-rail-touch-target);
    min-height: var(--st-rail-touch-target);
    touch-action: manipulation;
  }
  #battle-rail .st-hud__solution-control kbd,
  #battle-rail .st-hud__trajectory-guide kbd {
    display: none;
  }
  #battle-rail .st-hud__console-solution > .st-hud__first-salvo,
  #battle-rail .st-hud__fire-terminal > .st-hud__first-salvo {
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__first-salvo-skip {
    box-sizing: border-box;
    min-width: var(--st-rail-touch-target);
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__fire-terminal .st-hud__turn-actions {
    padding: 4px;
  }
  #battle-rail .st-hud__fire-terminal .st-hud__primary-action {
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__console-state,
  #battle-rail .st-hud__commitment-explanation,
  #battle-rail .st-hud__turn-owner,
  #battle-rail .st-hud__weapon-value {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* At the narrow Pixel-landscape envelope, keep only information that changes
     shot decisions. Redundant headings remain available through the region,
     group, and SVG accessible names while the live values get real space. */
  #app.is-compact #battle-rail .st-hud__console-solution {
    grid-template-columns: 180px 146px minmax(380px, 1fr);
  }
  #app.is-compact #battle-rail .st-hud__console-solution > .st-hud__weapon {
    grid-template-columns: minmax(0, 1fr);
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-icon {
    display: none;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-copy {
    grid-column: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: center;
    justify-content: center;
    gap: 2px;
    line-height: 1;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-value {
    flex: 0 1 auto;
    width: 100%;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-ammo {
    flex: 0 0 auto;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment-label {
    display: none;
  }
  #app.is-compact #battle-rail .st-hud__trajectory-guide {
    display: none;
  }
}
@media (pointer: fine) {
  #app.is-compact #battle-rail .st-hud__fuel-meter {
    width: 42px;
    height: 42px;
    min-width: 42px;
    min-height: 42px;
  }
  #app.is-compact #battle-rail .st-hud__console-solution > .st-hud__weapon {
    grid-template-columns: minmax(0, 1fr) 40px;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-icon {
    display: none;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon-copy {
    grid-column: 1;
  }
  #app.is-compact #battle-rail .st-hud__console-solution .st-hud__weapon > .st-hud__solution-control {
    grid-column: 2;
  }
}
/* The completed firing surface has one working row.  A collapsed Armory is
   represented by its trigger in the weapon bay; it must not reserve a blank
   second row.  The live guide rides with Wind instead of becoming a fourth card. */
#battle-rail .st-hud__console-solution {
  grid-template-rows: minmax(0, 1fr);
}
#battle-rail .st-hud__console-solution > .st-hud__strip:not(.st-hud__strip--open) {
  display: none;
}
#battle-rail .st-hud__solution-adjustments {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(132px, 0.5fr);
  grid-template-rows: minmax(0, 1fr);
}
#battle-rail .st-hud__solution-wind {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
}
#battle-rail .st-hud__solution-wind .st-hud__trajectory-guide {
  grid-column: auto;
  grid-row: auto;
  position: static;
  align-self: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
/* Consolidated Fire Control: one equal-height live decision surface, not a
   collection of decorative cards. */
#battle-rail .st-hud__fire-terminal {
  grid-column: 3;
  grid-row: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid rgba(255, 210, 63, 0.22);
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.04), transparent 42%);
}
#battle-rail .st-hud__fire-terminal .st-hud__console-state {
  padding: 7px 8px 4px;
  color: var(--text-gold);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.15px;
  line-height: 1.1;
  text-align: center;
  text-transform: uppercase;
}
#battle-rail .st-hud__fire-terminal .st-hud__commitment-explanation { align-self: center; padding: 4px 10px; color: var(--ui-copy); font-size: 12px; font-weight: 650; line-height: 1.25; text-align: center; }
#battle-rail .st-hud__fire-terminal .st-hud__aim { align-self: stretch; margin: 5px 6px 4px; }
#battle-rail .st-hud__fire-terminal .st-hud__turn-actions { padding: 6px; border-top-color: rgba(255, 210, 63, 0.24); min-width: 0; max-width: 100%; }
#battle-rail .st-hud__fire-terminal .st-hud__primary-action { min-height: 50px; min-width: 0; max-width: 100%; }
#battle-rail .st-hud__fire-terminal > .st-hud__first-salvo { grid-row: 2; align-self: center; justify-self: stretch; width: auto; max-width: 100%; margin-inline: 5px; }
#battle-rail .st-hud__fire-terminal:has(> .st-hud__first-salvo:not(.st-hud__first-salvo--hidden)) > .st-hud__aim { visibility: hidden; }
#battle-rail .st-hud__console-solution { grid-template-columns: minmax(166px, 0.72fr) minmax(250px, 1.32fr) minmax(112px, 0.36fr); grid-template-rows: minmax(0, 1fr); }
#battle-rail .st-hud__console-solution > .st-hud__strip:not(.st-hud__strip--open) { display: none; }
#battle-rail .st-hud__solution-adjustments { grid-column: 2; grid-row: 1 / -1; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(132px, 0.5fr); grid-template-rows: minmax(0, 1fr); align-items: stretch; }
#battle-rail .st-hud__solution-adjustment, #battle-rail .st-hud__solution-wind, #battle-rail .st-hud__fire-terminal, #battle-rail .st-hud__console-solution > .st-hud__weapon { align-self: stretch; height: 100%; }
#battle-rail .st-hud__solution-adjustment { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto minmax(0, 1fr) 32px; box-sizing: border-box; }
#battle-rail .st-hud__solution-adjustment-label { grid-column: 1 / -1; grid-row: 1; }
#battle-rail .st-hud__solution-adjustment-value { grid-column: 1 / -1; grid-row: 2; align-self: center; color: var(--text-gold); font-family: var(--font-mono); font-size: calc(var(--st-command-readability-size, 11px) * 1.2); font-weight: 800; text-align: center; }
#battle-rail .st-hud__solution-adjustment .st-hud__solution-control { grid-row: 3; width: 100%; box-sizing: border-box; }
#battle-rail .st-hud__solution-wind { grid-column: 3; grid-row: 1; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; }
#battle-rail .st-hud__solution-wind > .st-hud__solution-adjustment-label { grid-row: 1; }
#battle-rail .st-hud__solution-wind > .st-hud__solution-adjustment-value { grid-row: 2; }
#battle-rail .st-hud__solution-wind > .st-hud__trajectory-guide { grid-row: 3; position: static; width: 100%; min-width: 0; min-height: 44px; padding: 0; border: 0; background: transparent; }
#battle-rail .st-hud__trajectory-guide-label { display: none; }
#battle-rail .st-hud__commander-health { display: inline-flex; width: fit-content; margin-top: 3px; padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--st-turn-color, var(--gold)) 58%, transparent); border-radius: 999px; color: var(--text-gold); font-family: var(--font-mono); font-size: var(--st-command-readability-size, 11px); font-weight: 800; line-height: 1; }
/* The terminal earns its area in the decision phase: live phase/ownership at
   the top, the deterministic shot readback in the middle, and the one commit
   action anchored at the bottom.  Fire is important, but it is not a blank
   red billboard. */
#battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal {
  /* A semantic terminal is still a member of the Fire Control row, but it
     does not pretend to be a fifth card once its only decision content is
     phase plus Fire. Leave the surrounding battlefield-facing surface alone. */
  grid-template-rows: auto auto;
  align-content: end;
  gap: 6px;
  border-left-width: 0;
  background-image: none;
}
#battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal .st-hud__console-state {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  overflow: hidden;
  clip: auto;
  clip-path: none;
  white-space: normal;
}
#battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal .st-hud__aim {
  grid-row: 2;
  align-self: center;
}
#battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal .st-hud__turn-actions {
  grid-row: 3;
  align-self: end;
  height: auto;
  padding: 5px;
}
#battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal .st-hud__primary-action {
  height: auto;
  min-height: 50px;
}
#battle-rail[data-combat-focus="outcome"] .st-hud__fire-terminal { grid-column: 1 / -1; }
#battle-rail[data-combat-focus="outcome"] .st-hud__fire-terminal > .st-hud__aim {
  order: 0;
  min-height: 0;
  padding: 7px 9px;
  border: 1px solid rgba(255, 210, 63, 0.72);
  border-radius: 4px;
  background:
    radial-gradient(120% 100% at 50% 0%, rgba(255, 210, 63, 0.2), transparent 62%),
    linear-gradient(180deg, rgba(66, 35, 24, 0.96), rgba(19, 10, 24, 0.98));
}
#battle-rail[data-combat-focus="outcome"] .st-hud__fire-terminal > .st-hud__turn-actions,
#battle-rail[data-combat-focus="outcome"] .st-hud__console-solution {
  filter: saturate(0.55) brightness(0.72);
}
#battle-rail[data-combat-focus="outcome"] .st-hud__fire-terminal .st-hud__console-state, #battle-rail[data-combat-focus="outcome"] .st-hud__fire-terminal .st-hud__aim { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-hud__match-drawer-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 210, 63, 0.42);
  border-radius: 5px;
  color: var(--text-gold);
  background: linear-gradient(180deg, rgba(66, 39, 67, 0.94), rgba(18, 9, 27, 0.96));
  box-shadow: inset 0 0 0 1px rgba(255, 233, 168, 0.08), 0 5px 14px rgba(0, 0, 0, 0.35);
  font: 700 var(--st-command-readability-size, 11px)/1 var(--font-display);
  letter-spacing: 0.8px;
  cursor: pointer;
}
.st-hud__match-drawer-toggle:hover { border-color: var(--gold); color: var(--gold); }
.st-hud__match-drawer-toggle:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
@media (pointer: coarse) {
  #battle-rail .st-hud__command-console { grid-template-columns: 282px minmax(0, 1fr); }
  /* Touch spends the constrained rail height on live inputs, not a duplicate
     tank portrait. Commander identity, health, fuel and movement remain. */
  #battle-rail .st-hud__console-context .st-hud__active-row { box-sizing: border-box; width: 100%; min-width: 0; grid-template-rows: auto minmax(0, 1fr); gap: 2px; padding: 3px 5px 3px 8px; }
  #battle-rail .st-hud__identity-lockup { grid-template-columns: minmax(0, 1fr); }
  #battle-rail .st-hud__tank-portrait-frame { display: none; }
  #battle-rail .st-hud__mobility { grid-column: 1 / -1; grid-row: 2; grid-template-columns: var(--st-rail-touch-target) 58px var(--st-rail-touch-target); min-width: 0; }
  #battle-rail .st-hud__console-solution { gap: 2px; padding: 2px; }
  #battle-rail .st-hud__console-solution { grid-template-columns: 160px minmax(0, 1fr) 124px; }
  #battle-rail .st-hud__solution-adjustments { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) var(--st-rail-touch-target); overflow: hidden; }
  #battle-rail .st-hud__solution-adjustment { grid-template-rows: auto minmax(0, 1fr) var(--st-rail-touch-target); min-height: 0; padding: 2px; gap: 1px; overflow: hidden; }
  #battle-rail .st-hud__solution-wind { grid-column: 1 / -1; grid-row: 2; grid-template-columns: minmax(0, 1fr) var(--st-rail-touch-target); grid-template-rows: minmax(0, 1fr); align-items: stretch; }
  #battle-rail .st-hud__solution-wind > .st-hud__solution-adjustment-value { grid-column: 1; grid-row: 1; align-self: center; }
  #app.is-compact #battle-rail .st-hud__solution-wind > .st-hud__trajectory-guide { display: flex; grid-column: 2; grid-row: 1; box-sizing: border-box; width: var(--st-rail-touch-target); height: var(--st-rail-touch-target); min-height: 0; max-height: 100%; }
  #battle-rail .st-hud__solution-adjustment .st-hud__solution-control { min-width: var(--st-rail-touch-target); min-height: var(--st-rail-touch-target); height: var(--st-rail-touch-target); box-sizing: border-box; }
  #battle-rail .st-hud__trajectory-guide, #battle-rail .st-hud__fire-terminal .st-hud__primary-action { min-width: var(--st-rail-touch-target); min-height: var(--st-rail-touch-target); }
  #app.is-compact #battle-rail[data-combat-focus="decision"] .st-hud__fire-terminal .st-hud__primary-action {
    min-height: var(--st-rail-touch-target);
  }
  #battle-rail .st-hud__fire-terminal > .st-hud__first-salvo {
    height: var(--st-rail-touch-target);
    min-height: var(--st-rail-touch-target);
    max-height: var(--st-rail-touch-target);
    /* The compact terminal is only 112 logical px wide: do not spend its
       5px desktop inset twice when the coach owns the 44px Skip target. */
    margin-inline: 0;
  }

  /* This is the terminal compact topology.  Keep it last: earlier cockpit
     rules used the third track for a detached commitment card, whereas the
     terminal is now Fire Control's third cell. */
  #app.is-compact #battle-rail .st-hud__console-solution {
    grid-template-columns: 160px minmax(0, 1fr) 124px;
    grid-template-rows: minmax(0, 1fr);
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustments {
    grid-column: 2;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) var(--st-rail-touch-target);
  }
  #app.is-compact #battle-rail .st-hud__fire-terminal {
    grid-column: 3;
    grid-row: 1;
  }
}

/* The 200px protected rail has exactly one coarse touch row.  Each numerical
   adjustment keeps its two real actions beside its live value rather than
   stacking two 44px physical targets vertically. */
@media (pointer: coarse) {
  #battle-rail .st-hud__console-context .st-hud__active-row {
    display: grid;
    grid-template-rows: minmax(0, 1fr) var(--st-rail-touch-target);
    min-height: 0;
  }
  #battle-rail .st-hud__identity-lockup,
  #battle-rail .st-hud__tactical-row {
    min-height: 0;
    overflow: hidden;
  }
  #app.is-compact #battle-rail .st-hud__console-solution {
    grid-template-columns: 156px minmax(0, 1fr) 112px;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustments {
    grid-column: 2;
    grid-row: 1;
    grid-template-columns: minmax(182px, 1fr) minmax(182px, 1fr) 96px;
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment {
    grid-template-columns: var(--st-rail-touch-target) minmax(0, 1fr) var(--st-rail-touch-target);
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    padding: 2px;
    gap: 1px;
    overflow: hidden;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment-label {
    display: none;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment-value {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
    align-self: center;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment .st-hud__solution-control {
    grid-row: 1;
    height: var(--st-rail-touch-target);
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment .st-hud__solution-control:first-of-type {
    grid-column: 1;
  }
  #app.is-compact #battle-rail .st-hud__solution-adjustment .st-hud__solution-control:last-of-type {
    grid-column: 3;
  }
  #app.is-compact #battle-rail .st-hud__solution-wind {
    grid-column: 3;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) var(--st-rail-touch-target);
  }
  #app.is-compact #battle-rail .st-hud__solution-wind > .st-hud__solution-adjustment-label {
    display: none;
  }
  #app.is-compact #battle-rail .st-hud__solution-wind > .st-hud__solution-adjustment-value {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }
  #app.is-compact #battle-rail .st-hud__solution-wind > .st-hud__trajectory-guide {
    grid-column: 1;
    grid-row: 2;
    justify-self: stretch;
    width: 100%;
  }
}

@media (pointer: fine) {
  #battle-rail .st-hud__identity-lockup { overflow: hidden; }
  #battle-rail .st-hud__tank-portrait-frame {
    width: auto;
    height: 100%;
    max-width: 100%;
    aspect-ratio: 144 / 80;
    justify-self: center;
  }
  #battle-rail .st-hud__tank-portrait {
    width: 100%;
    height: 100%;
    max-width: 100%;
  }
}

/* Numerical Fire Control is reduced-motion-safe: its values update as text and
   controls do not animate between decision states. */
`;

}

/** Cached mutable nodes for a single player's health bar. */
interface PlayerRow {
  el: HTMLElement;
  order: HTMLElement;
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

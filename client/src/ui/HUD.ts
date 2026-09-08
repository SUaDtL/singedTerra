import hudCss from './HUD.css?raw';
import type { GameState, TankState } from '@shared/types/GameState';
import { WEAPONS, ACCESSORIES } from '@shared/engine/WeaponSystem';
import type { WeaponType, AccessoryType } from '@shared/engine/WeaponSystem';
import type { ConnectionState, TurnWatch } from '../client/GameClient';
import { MAX_MOVE_DELTA } from '@shared/engine/Movement';
import { makeHudGlyph, makeHudIcon } from './hudIcons';
import { STORE_CATALOG } from './storeCatalog';
import { makeWeaponIcon } from './weaponIcons';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../renderer/TankLoadoutPreview';
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
  type BattleCommandImpactLearningCue,
} from './battleCommandState';
import {
  createBattleConsoleLifecycle,
  type BattleConsoleLifecycleController,
} from './battleConsole/lifecycle';
import {
  fitBattleConsoleLayoutToRail,
  projectBattleConsoleLayoutForViewport,
  type BattleConsoleLayoutMode,
  type ResponsiveLayoutProjection,
} from './battleConsole/projection';
import { projectBattleConsoleState } from './battleConsole/projectState';
import {
  dispatchBattleConsoleIntent,
  type BattleConsoleControllerPort,
} from './battleConsole/intentAdapter';
import type {
  BattleConsoleHostMode,
  BattleConsoleIntent,
  BattleConsolePresentationState,
} from './battleConsole/types';

function publicBattleConsoleHostMode(mode: BattleConsoleLayoutMode): BattleConsoleHostMode {
  return mode === 'compact' ? 'compact-touch' : mode;
}

/**
 * What a store Buy click requests: exactly one of a weapon bundle or an accessory, mirroring the
 * engine's `BuyAction` "exactly one of weapon/accessory" invariant. The HUD emits this and the
 * caller (main.ts) forwards it verbatim into a `buy` action — so the store stays decoupled from the
 * action/transport layer.
 */
export type StorePurchase = { weapon?: WeaponType; accessory?: AccessoryType };

/** Renderer/audio-owned local preferences projected by the Battle Settings dialog. */
export interface HUDBattleSettingsState {
  readonly aimGuideEnabled: boolean;
  readonly soundEnabled: boolean;
}

export interface HUDOptions {
  readonly battleConsoleLifecycle?: BattleConsoleLifecycleController;
}

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
  /** Toggle for the persisted local audio preference, shared by M and Settings. */
  private toggleSoundCb: (() => void) | null = null;
  /** Callback fired by the shared rail action (projectile fire or shield activation). */
  private primaryActionCb: (() => void) | null = null;
  /** Callback fired by one semantic mobility-rocker activation. */
  private moveCb: ((delta: number) => void) | null = null;

  /** Whether the static DOM scaffold has been built yet. */
  private built = false;

  // Cached node references (populated by `build()`).
  private playersEl!: HTMLElement;
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
  private battleSettingsState: HUDBattleSettingsState = {
    aimGuideEnabled: true,
    soundEnabled: true,
  };
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
  private overlayPrimaryLabelEl!: HTMLSpanElement;
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
  private verifiedExpiryPreviousFocus: HTMLElement | null = null;
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
  private roundOverPreviousFocus: HTMLElement | null = null;
  /** Tank id selected in the between-rounds shop (which tank a buy targets). */
  private shopTankId: string | null = null;
  /** Shrink-wrapped presentation owner for Match-only information. */
  private matchCardEl!: HTMLElement;
  private matchDrawerBtnEl!: HTMLButtonElement;
  private matchDrawerCloseEl!: HTMLButtonElement;
  private firstSalvoBriefingAcknowledged = false;
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
  /** Per-accessory cells in the ROUND_OVER between-rounds shop. */
  private roundOverAccessoryCells = new Map<AccessoryType, { buyBtn: HTMLButtonElement; owned: HTMLElement }>();

  /** Room arms level (0–4), set once per game via {@link setArmsLevel}. Above-level store rows are
   *  shown disabled. Defaults to the max (4 => nothing gated) for full back-compat. UI-only — the
   *  engine independently enforces the same gate, so this never affects determinism. */
  private armsLevel = 4;

  /** Per-tank-id cache of the bar's mutable nodes, so updates skip rebuilds. */
  private rows = new Map<string, PlayerRow>();



  // Active-player name row (replaces old aimTextEl player portion):
  private readonly battleConsoleLifecycle: BattleConsoleLifecycleController;
  private battleConsoleSurfaceHost: HTMLElement | null = null;
  private battleConsoleSemanticHost: HTMLElement | null = null;
  private battleConsolePixiHost: HTMLElement | null = null;
  private battleConsoleSettingsHost: HTMLElement | null = null;
  private battleConsoleArmoryHost: HTMLElement | null = null;
  private battleConsoleCoachHost: HTMLElement | null = null;
  /** Connected, hidden ownership for reusable semantic nodes omitted by live state. */
  private semanticParkingEl: HTMLElement | null = null;
  private battleConsoleActive = false;
  private battleConsoleEntering: Promise<void> | null = null;
  private battleConsoleArmoryOpen = false;
  private battleConsoleSettingsOpen = false;
  private battleConsoleCoachBriefingOpen = false;
  private battleConsoleSettingsReturnFocusKey: string | null = null;
  private battleConsoleLastFrame: {
    readonly state: GameState;
    readonly isFiring: boolean;
    readonly canControl: boolean;
    readonly activeIsLocal: boolean;
    readonly verifiedInputAllowed: boolean;
  } | null = null;
  private destroyed = false;
  private destroyPromise: Promise<void> | null = null;
  /** Last turn actually presented in the owner row; resets between games. */
  private lastPresentedTurnKey: string | null = null;

  constructor(
    root: HTMLElement,
    overlayRoot: HTMLElement,
    modalRoot: HTMLElement,
    railRoot: HTMLElement,
    options: HUDOptions = {},
  ) {
    this.root = root;
    this.overlayRoot = overlayRoot;
    this.modalRoot = modalRoot;
    // Legacy isolated HUD mounts supplied the overlay as the fourth argument
    // before the protected rail existed. Keep those tests and embedders on the
    // original side-panel topology; real gameplay always supplies #battle-rail.
    this.railRoot = railRoot === overlayRoot ? root : railRoot;
    this.battleConsoleLifecycle = options.battleConsoleLifecycle ?? createBattleConsoleLifecycle();
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
    if (step === null) {
      this.firstSalvoBriefingAcknowledged = false;
      this.battleConsoleCoachBriefingOpen = false;
    }
    if (previousStep === null && step !== null && !this.firstSalvoBriefingAcknowledged) {
      this.battleConsoleCoachBriefingOpen = true;
    }
    if (!this.built) return;
    this.refreshBattleConsole();
  }

  /** Presentation-only input gate while the First Salvo entry briefing owns focus. */
  isFirstSalvoBriefingOpen(): boolean {
    return this.built && this.battleConsoleCoachBriefingOpen;
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
  onToggleSound(cb: () => void): void { this.toggleSoundCb = cb; }
  setBattleSettingsState(state: HUDBattleSettingsState): void {
    this.battleSettingsState = state;
    if (this.built) this.refreshBattleConsole();
  }
  /** Register the shared Fire / Activate shield action. */
  onPrimaryAction(cb: () => void): void { this.primaryActionCb = cb; }
  /** Register one bounded left/right movement commitment. */
  onMove(cb: (delta: number) => void): void { this.moveCb = cb; }
  onQuickChat(cb: (key: QuickChatKey) => void): void { this.quickChatCb = cb; }

  /** Release the active battle-console generation. */
  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyed = true;
    this.battleConsoleActive = false;
    this.battleConsoleEntering = null;
    window.removeEventListener('resize', this.handleBattleConsoleEnvironmentChange);
    window.removeEventListener('orientationchange', this.handleBattleConsoleEnvironmentChange);
    this.destroyPromise = this.battleConsoleLifecycle.destroy().then(() => {
      this.releaseBattleConsoleHosts();
    });
    return this.destroyPromise;
  }

  private releaseBattleConsoleHosts(): void {
    this.battleConsoleSurfaceHost?.remove();
    this.battleConsoleSettingsHost?.remove();
    this.battleConsoleArmoryHost?.remove();
    this.battleConsoleCoachHost?.remove();
    this.battleConsoleSurfaceHost = null;
    this.battleConsoleSemanticHost = null;
    this.battleConsolePixiHost = null;
    this.battleConsoleSettingsHost = null;
    this.battleConsoleArmoryHost = null;
    this.battleConsoleCoachHost = null;
  }

  private parkReusableSemanticNodes(): void {
    if (!this.built) return;
    const parking = this.semanticParkingEl ?? document.createElement('div');
    parking.dataset['hudSemanticParking'] = '';
    parking.hidden = true;
    parking.inert = true;
    if (parking.parentElement !== this.modalRoot) this.modalRoot.append(parking);
    this.semanticParkingEl = parking;
    for (const node of [
      this.liveMatchInspectorMenuEl,
      this.overlayProgressionSignInBtnEl,
      this.overlayVerifiedRetryBtnEl,
      this.verifiedStatusEl,
      this.fieldOrderEl,
    ]) {
      if (!node.isConnected) parking.append(node);
    }
  }

  /** Destroy one game-owned console generation before lobby/restart re-entry. */
  async leaveBattleConsole(): Promise<void> {
    this.battleConsoleActive = false;
    this.battleConsoleEntering = null;
    await this.battleConsoleLifecycle.destroy();
    this.releaseBattleConsoleHosts();
    // These semantic controls are stable HUD-owned nodes reused by later states.
    // Keep inactive ones under one connected hidden owner rather than retaining
    // them as detached nodes between games.
    this.parkReusableSemanticNodes();
    this.battleConsoleArmoryOpen = false;
    this.battleConsoleSettingsOpen = false;
    this.battleConsoleCoachBriefingOpen = false;
    this.battleConsoleSettingsReturnFocusKey = null;
    this.battleConsoleLastFrame = null;
  }

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
    if (this.destroyed) return;
    if (!this.built) this.build();

    this.battleConsoleLastFrame = {
      state,
      isFiring,
      canControl,
      activeIsLocal,
      verifiedInputAllowed,
    };

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
    this.syncRoundOver(state);
    this.syncOverlay(state);
    this.refreshBattleConsole();
    if (presentedTurnKey !== null) this.lastPresentedTurnKey = presentedTurnKey;
  }

  private ensureBattleConsoleHosts(): void {
    const surface = this.battleConsoleSurfaceHost ?? document.createElement('div');
    surface.dataset['battleConsoleSurface'] = '';
    surface.style.position = 'absolute';
    // Transformed descendants retain their larger layout bounds. `hidden`
    // lets browser focus scroll those bounds and shift the whole console;
    // clipping contains the chrome without creating a scroll container.
    surface.style.overflow = 'clip';
    surface.style.zIndex = '7';
    surface.style.pointerEvents = 'none';
    if (surface.parentElement !== this.railRoot) this.railRoot.append(surface);
    this.battleConsoleSurfaceHost = surface;

    const ensureHost = (
      current: HTMLElement | null,
      owner: 'semantic' | 'pixi' | 'settings' | 'armory' | 'coach',
      parent: HTMLElement,
    ): HTMLElement => {
      const host = current ?? document.createElement('div');
      if (owner === 'semantic' || owner === 'pixi') {
        host.dataset['battleConsoleHost'] = owner;
        host.style.position = 'absolute';
        host.style.inset = 'auto';
        host.style.zIndex = owner === 'semantic' ? '2' : '1';
        host.style.pointerEvents = 'none';
      } else {
        host.dataset['battleConsolePortalHost'] = owner;
      }
      if (host.parentElement !== parent) parent.append(host);
      return host;
    };

    this.battleConsolePixiHost = ensureHost(
      this.battleConsolePixiHost,
      'pixi',
      surface,
    );
    this.battleConsoleSemanticHost = ensureHost(
      this.battleConsoleSemanticHost,
      'semantic',
      surface,
    );
    this.battleConsoleSettingsHost = ensureHost(
      this.battleConsoleSettingsHost,
      'settings',
      this.modalRoot,
    );
    this.battleConsoleArmoryHost = ensureHost(
      this.battleConsoleArmoryHost,
      'armory',
      this.modalRoot,
    );
    this.battleConsoleCoachHost = ensureHost(
      this.battleConsoleCoachHost,
      'coach',
      this.modalRoot,
    );
  }

  private battleConsoleLayout(): ResponsiveLayoutProjection {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    if (!document.getElementById('app')) {
      return projectBattleConsoleLayoutForViewport({
        viewportWidth,
        viewportHeight: 600,
        stageViewportWidth: 1200,
        devicePixelRatio: window.devicePixelRatio || 1,
        coarsePointer,
      });
    }
    return projectBattleConsoleLayoutForViewport({
      viewportWidth,
      viewportHeight: window.innerHeight,
      stageViewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio || 1,
      coarsePointer,
    });
  }

  private positionBattleConsoleHosts(layout: ResponsiveLayoutProjection): void {
    const publicMode = publicBattleConsoleHostMode(layout.mode);
    this.root.dataset['battleConsoleMode'] = publicMode;
    const railWidth = this.railRoot.clientWidth || 1200;
    const railHeight = this.railRoot.clientHeight || 198;
    const fit = fitBattleConsoleLayoutToRail(layout, railWidth);
    // Keep one logical pixel of bottom clearance; the whole stage, including
    // this surface, now scales as one composition.
    const top = railHeight - fit.height - 1;
    if (this.battleConsoleSurfaceHost) {
      this.battleConsoleSurfaceHost.dataset['battleConsoleMode'] = publicMode;
      this.battleConsoleSurfaceHost.style.left = '0px';
      this.battleConsoleSurfaceHost.style.top = `${top}px`;
      this.battleConsoleSurfaceHost.style.width = `${fit.width}px`;
      this.battleConsoleSurfaceHost.style.height = `${fit.height}px`;
      this.battleConsoleSurfaceHost.style.removeProperty('zoom');
    }
    for (const host of [this.battleConsolePixiHost, this.battleConsoleSemanticHost]) {
      if (!host) continue;
      host.style.left = '0px';
      host.style.top = '0px';
      host.style.transform = `scale(${fit.surfaceScale})`;
      host.style.transformOrigin = '0 0';
    }
  }

  private battleConsoleArmoryItems(
    tank: TankState | null,
    canAct: boolean,
  ): BattleConsolePresentationState['armory']['items'] {
    const credits = tank?.credits ?? 0;
    return STORE_CATALOG.flatMap((section) => section.entries.map((entry) => {
      if (entry.kind === 'weapon') {
        const definition = WEAPONS[entry.type];
        const inventory = tank?.inventory[entry.type];
        const ammo = inventory?.unlimited ? null : inventory?.count ?? 0;
        const unlocked = definition.armsLevel <= this.armsLevel;
        return {
          key: `weapon:${entry.type}`,
          name: definition.name,
          description: entry.summary,
          purchase: { weapon: entry.type },
          price: definition.price,
          bundleSize: definition.bundleSize,
          owned: inventory?.unlimited ? 1 : inventory?.count ?? 0,
          ammo,
          equipped: tank?.selectedWeapon === entry.type,
          canBuy: canAct && unlocked && credits >= definition.price,
          canEquip: canAct
            && unlocked
            && tank?.selectedWeapon !== entry.type
            && (inventory?.unlimited === true || (inventory?.count ?? 0) > 0),
        };
      }

      const definition = ACCESSORIES[entry.type];
      const unlocked = definition.armsLevel <= this.armsLevel;
      return {
        key: `accessory:${entry.type}`,
        name: definition.name,
        description: entry.summary,
        purchase: { accessory: entry.type },
        price: definition.price,
        bundleSize: definition.bundleSize,
        owned: tank?.accessories[entry.type] ?? 0,
        ammo: null,
        equipped: false,
        canBuy: canAct && unlocked && credits >= definition.price,
        canEquip: false,
      };
    }));
  }

  private projectLiveBattleConsole(): BattleConsolePresentationState | null {
    const frame = this.battleConsoleLastFrame;
    if (!frame) return null;
    const { state, isFiring, canControl, activeIsLocal, verifiedInputAllowed } = frame;
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId) ?? null;
    const command = battleCommandStateFor(state, isFiring, canControl, {
      activeIsLocal,
      verifiedInputAllowed,
      verifiedDeployment: this.verifiedDeploymentState,
      impactLearningCue: this.impactLearningCue,
    });
    const canAct = state.phase === 'PLAYER_TURN'
      && !isFiring
      && canControl
      && activeIsLocal
      && verifiedInputAllowed
      && tank?.alive === true;
    const selectedWeapon = tank?.selectedWeapon ?? 'baby_missile';
    const selectedDefinition = WEAPONS[selectedWeapon];
    const selectedInventory = tank?.inventory[selectedWeapon];
    const focusOwner = document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>('[data-semantic-key]')?.dataset['semanticKey'] ?? null
      : null;

    return projectBattleConsoleState({
      commander: {
        id: tank?.id ?? null,
        name: tank?.playerName ?? 'Awaiting commander',
        portrait: tank ? { color: tank.color, loadout: tank.loadout } : null,
        health: tank?.health ?? null,
      },
      mobility: {
        fuel: tank ? Math.max(0, Math.floor(tank.fuel)) : null,
        canMoveLeft: canAct && !tank!.buried && tank!.fuel > 0,
        canMoveRight: canAct && !tank!.buried && tank!.fuel > 0,
      },
      weapon: {
        type: selectedWeapon,
        name: selectedDefinition.name,
        ammo: selectedInventory?.unlimited ? null : selectedInventory?.count ?? 0,
        canCycle: canAct,
      },
      armory: {
        credits: tank?.credits ?? null,
        open: this.battleConsoleArmoryOpen,
        submitting: isFiring,
        items: this.battleConsoleArmoryItems(tank, canAct),
      },
      ballistics: {
        angle: tank?.angle ?? 0,
        power: tank?.power ?? 0,
        wind: state.wind,
      },
      fireControl: {
        status: command.commitment.label,
        guidance: command.commitment.explanation ?? '',
        ready: command.commitment.commit !== null,
        submitting: command.commitment.phase === 'submitting',
      },
      settings: {
        open: this.battleConsoleSettingsOpen,
        soundEnabled: this.battleSettingsState.soundEnabled,
        guideEnabled: this.battleSettingsState.aimGuideEnabled,
        returnFocusKey: this.battleConsoleSettingsReturnFocusKey,
      },
      coach: {
        step: this.firstSalvoStep,
        briefingOpen: this.battleConsoleCoachBriefingOpen,
      },
      focusOwner,
    });
  }

  private readonly battleConsoleControllerPort: BattleConsoleControllerPort = {
    move: (delta) => this.moveCb?.(delta * MAX_MOVE_DELTA),
    selectNextWeapon: () => this.touchWeaponCb?.(),
    selectWeapon: (weapon) => this.weaponSelectCb?.(weapon),
    openArmory: () => {
      this.battleConsoleSettingsOpen = false;
      this.battleConsoleArmoryOpen = true;
      this.refreshBattleConsole();
    },
    closeArmory: () => {
      this.battleConsoleArmoryOpen = false;
      this.refreshBattleConsole();
    },
    buy: (purchase, tankId) => this.buyCb?.(purchase, tankId),
    equip: (weapon) => this.weaponSelectCb?.(weapon),
    stepAngle: (delta) => this.touchAngleCb?.(delta),
    stepPower: (delta) => this.touchPowerCb?.(delta),
    openSettings: (origin) => {
      this.battleConsoleArmoryOpen = false;
      this.battleConsoleSettingsReturnFocusKey = origin;
      this.battleConsoleSettingsOpen = true;
      this.refreshBattleConsole();
    },
    closeSettings: () => {
      this.battleConsoleSettingsOpen = false;
      this.refreshBattleConsole();
    },
    toggleSound: () => {
      this.toggleSoundCb?.();
      this.refreshBattleConsole();
    },
    toggleGuide: () => {
      this.aimGuideCb?.();
      this.refreshBattleConsole();
    },
    fire: () => this.primaryActionCb?.(),
    skipCoach: () => {
      this.setFirstSalvoStep(null);
      this.firstSalvoSkipCb?.();
    },
    enterCoach: () => {
      this.firstSalvoBriefingAcknowledged = true;
      this.battleConsoleCoachBriefingOpen = false;
      this.refreshBattleConsole();
    },
  };

  private dispatchBattleConsole = (intent: BattleConsoleIntent): void => {
    void dispatchBattleConsoleIntent(this.battleConsoleControllerPort, intent);
  };

  private refreshBattleConsole(): void {
    if (!this.built || this.destroyed) return;
    const state = this.projectLiveBattleConsole();
    if (!state) return;
    this.ensureBattleConsoleHosts();
    if (this.battleConsoleSurfaceHost) {
      this.battleConsoleSurfaceHost.dataset['activeCommander'] = state.commander.id ?? '';
      this.battleConsoleSurfaceHost.dataset['battleConsolePhase'] = this.battleConsoleLastFrame?.state.phase
        .toLowerCase()
        .replaceAll('_', '-') ?? 'unmounted';
    }
    const layout = this.battleConsoleLayout();
    this.positionBattleConsoleHosts(layout);

    if (this.battleConsoleActive) {
      this.battleConsoleLifecycle.update(state, layout);
      return;
    }
    if (this.battleConsoleEntering) return;

    this.battleConsoleActive = true;
    const entering = this.battleConsoleLifecycle.enter({
      semanticHost: this.battleConsoleSemanticHost!,
      pixiHost: this.battleConsolePixiHost!,
      portalHosts: {
        settings: this.battleConsoleSettingsHost,
        armory: this.battleConsoleArmoryHost,
        coach: this.battleConsoleCoachHost,
      },
      initialState: state,
      dispatch: this.dispatchBattleConsole,
      layout,
    }).then((result) => {
      if (!this.battleConsoleActive || !result.committed) return;
      const latest = this.projectLiveBattleConsole();
      if (latest) this.battleConsoleLifecycle.update(latest, this.battleConsoleLayout());
    }).finally(() => {
      if (this.battleConsoleEntering === entering) this.battleConsoleEntering = null;
    });
    this.battleConsoleEntering = entering;
  }

  private handleBattleConsoleEnvironmentChange = (): void => {
    this.refreshBattleConsole();
  };

  /** Cross-owner entry used by the retained Command Menu. */
  private showBattleConsoleSettings(): void {
    if (this.paused) this.togglePause(false);
    this.battleConsoleArmoryOpen = false;
    this.battleConsoleSettingsReturnFocusKey = 'pause-origin::menu-trigger';
    this.battleConsoleSettingsOpen = true;
    this.refreshBattleConsole();
  }

  private dismissBattleConsoleSettings(): void {
    this.battleConsoleSettingsOpen = false;
    this.refreshBattleConsole();
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

    // ROUND_OVER already owns the completed-round fact in its authored title.
    // A second transient result would remain visible behind that modal and turn
    // one authoritative state into two competing overlays.
    if (
      state.round > this.lastSeenRound
      && state.phase !== 'GAME_OVER'
      && state.phase !== 'ROUND_OVER'
    ) {
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
    this.buildRound();
    this.buildDeploymentStatus();
    this.buildEndScreens();
    this.buildRoundShop();
    const menu = this.buildMenu();
    this.buildMatchDrawer();
    this.buildLiveness();
    this.buildLiveMatchDiagnostics();

    this.matchCardEl = document.createElement('div');
    this.matchCardEl.className = 'st-hud__match-card';
    this.matchCardEl.dataset['matchSkin'] = 'ornate-field-console';
    const matchTitle = document.createElement('h2');
    matchTitle.className = 'st-hud__match-title';
    matchTitle.dataset['ui'] = 'match-title';
    matchTitle.textContent = 'Match';
    this.matchCardEl.append(
      matchTitle,
      this.matchDrawerCloseEl,
      menu,
      this.matchModeEl,
      this.quickOperationEl,
      this.roundEl,
      this.playersEl,
      this.connBannerEl,
    );
    this.root.append(this.matchCardEl);
    this.ensureBattleConsoleHosts();
    // Quick Chat stays outside the match ledger. Transient send/turn notices
    // stay with the protected command rail; combat input never gets a second
    // overlay-only touch surface.
    this.overlayRoot.append(this.quickChatRootEl, this.matchDrawerBtnEl);
    this.railRoot.append(
      this.battleConsoleSurfaceHost!,
      this.toastEl,
      this.turnWatchEl,
    );
    this.modalRoot.append(
      this.terminalPayoffStatusEl,
      this.overlayEl,
      this.roundOverEl,
      this.pauseEl,
      this.verifiedExpiryEl,
      this.liveMatchInspectorEl,
      this.battleConsoleSettingsHost!,
      this.battleConsoleArmoryHost!,
      this.battleConsoleCoachHost!,
    );
    this.built = true;
    this.syncQuickChatAvailability();
    this.syncLiveMatchDiagnostics();
    window.addEventListener('resize', this.handleBattleConsoleEnvironmentChange);
    window.addEventListener('orientationchange', this.handleBattleConsoleEnvironmentChange);
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

  /** Retained verified-play status, deliberately separate from the retired battle-console owner. */
  private buildDeploymentStatus(): void {
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
    this.verifiedRetryBtnEl.addEventListener(
      'click',
      () => {
        if (!this.verifiedRetryBtnEl.hidden && !this.verifiedRetryBtnEl.disabled) {
          this.verifiedRetryCb?.();
        }
      },
    );
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
    this.verifiedContinueBtnEl.addEventListener(
      'click',
      () => {
        if (!this.verifiedExpiryEl.hidden) this.verifiedContinueCasualCb?.();
      },
    );
    this.verifiedBatteryBtnEl = document.createElement('button');
    this.verifiedBatteryBtnEl.type = 'button';
    this.verifiedBatteryBtnEl.className = 'st-hud__verified-battery';
    this.verifiedBatteryBtnEl.textContent = 'Return to Battery';
    this.verifiedBatteryBtnEl.addEventListener(
      'click',
      () => {
        if (!this.verifiedExpiryEl.hidden) this.verifiedReturnToBatteryCb?.();
      },
    );
    actions.append(this.verifiedContinueBtnEl, this.verifiedBatteryBtnEl);
    panel.append(expiryTitle, expiryCopy, actions);
    this.verifiedExpiryEl.append(panel);
    this.verifiedExpiryEl.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Tab' || this.verifiedExpiryEl.hidden) return;
        event.preventDefault();
        const buttons = [this.verifiedContinueBtnEl, this.verifiedBatteryBtnEl];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey
          ? (current <= 0 ? buttons.length - 1 : current - 1)
          : (current < 0 || current === buttons.length - 1 ? 0 : current + 1);
        buttons[next]!.focus({ preventScroll: true });
      },
    );
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
    hero.append(tankFrame);

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
    this.overlayPrimaryLabelEl = document.createElement('span');
    this.overlayPrimaryLabelEl.className = 'st-hud__victory-action-label';
    this.overlayPrimaryLabelEl.textContent = 'Play again';
    restartBtn.append(makeHudGlyph('weapon', 18), this.overlayPrimaryLabelEl);
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
    const overlayMenuLabel = document.createElement('span');
    overlayMenuLabel.className = 'st-hud__victory-action-label';
    overlayMenuLabel.textContent = 'Main Menu';
    overlayMenuBtn.append(makeHudGlyph('menu', 18), overlayMenuLabel);
    overlayMenuBtn.addEventListener('click', () => {
      if (this.overlayShown) this.quitCb?.();
    });
    this.overlayVerifiedRetryBtnEl = document.createElement('button');
    this.overlayVerifiedRetryBtnEl.className = 'st-hud__restart st-hud__victory-verified-retry';
    this.overlayVerifiedRetryBtnEl.type = 'button';
    this.overlayVerifiedRetryBtnEl.textContent = 'Retry verification';
    this.overlayVerifiedRetryBtnEl.addEventListener('click', () => {
      if (this.overlayShown && this.overlayVerifiedRetryBtnEl.parentElement === this.overlayPrimaryBtnEl.parentElement && !this.overlayVerifiedRetryBtnEl.disabled) {
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
    // The generated frame owns one engraved header across both content bays.
    // Keep its live title as a direct child so it registers to that hardware
    // instead of inheriting the left portrait bay's grid/static position.
    panel.append(eyebrow, hero, report);
    this.overlayEl.append(panel);
    this.overlayEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !this.overlayShown) return;
      event.preventDefault();
      const actions = [
        ...(this.overlayProgressionHandoffEl.hidden ? [] : [this.overlayProgressionSignInBtnEl]),
        ...(this.overlayVerifiedRetryBtnEl.parentElement === this.overlayPrimaryBtnEl.parentElement
          && !this.overlayVerifiedRetryBtnEl.disabled ? [this.overlayVerifiedRetryBtnEl] : []),
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
    pausePanel.className = 'st-hud__overlay-panel st-hud__command-menu-panel';
    const pauseText = document.createElement('h2');
    pauseText.className = 'st-hud__overlay-text';
    pauseText.textContent = 'Command Menu';
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'st-hud__restart';
    resumeBtn.type = 'button';
    resumeBtn.setAttribute('aria-label', 'Resume');
    resumeBtn.textContent = 'Resume';
    this.pauseResumeBtnEl = resumeBtn;
    resumeBtn.addEventListener('click', () => this.togglePause(false));
    const replayFirstSalvoBtn = document.createElement('button');
    replayFirstSalvoBtn.className = 'st-hud__restart st-hud__restart--ghost';
    replayFirstSalvoBtn.type = 'button';
    replayFirstSalvoBtn.setAttribute('aria-label', 'Replay First Salvo');
    replayFirstSalvoBtn.textContent = 'Replay First Salvo';
    this.pauseReplayFirstSalvoBtnEl = replayFirstSalvoBtn;
    replayFirstSalvoBtn.addEventListener('click', () => {
      this.togglePause(false);
      this.firstSalvoReplayCb?.();
    });
    const battleSettingsBtn = document.createElement('button');
    battleSettingsBtn.className = 'st-hud__restart st-hud__restart--ghost';
    battleSettingsBtn.type = 'button';
    battleSettingsBtn.dataset['command'] = 'battle-settings';
    battleSettingsBtn.setAttribute('aria-label', 'Battle Settings');
    battleSettingsBtn.textContent = 'Battle Settings';
    battleSettingsBtn.addEventListener('click', () => this.showBattleConsoleSettings());
    const pauseQuitBtn = document.createElement('button');
    pauseQuitBtn.className = 'st-hud__restart st-hud__restart--ghost';
    pauseQuitBtn.type = 'button';
    pauseQuitBtn.textContent = 'Return to Lobby';
    pauseQuitBtn.addEventListener('click', () => { this.togglePause(false); this.quitCb?.(); });
    const pauseBtns = document.createElement('div');
    pauseBtns.className = 'st-hud__overlay-btns';
    this.pauseActionsEl = pauseBtns;
    pauseBtns.append(resumeBtn, battleSettingsBtn);
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
    this.roundOverEl.setAttribute('role', 'dialog');
    this.roundOverEl.setAttribute('aria-modal', 'true');
    this.roundOverEl.setAttribute('aria-labelledby', 'st-round-over-title');
    const roPanel = document.createElement('div');
    roPanel.className = 'st-hud__overlay-panel st-hud__overlay-panel--round-shop';
    this.roundOverTitleEl = document.createElement('div');
    this.roundOverTitleEl.className = 'st-hud__overlay-text';
    this.roundOverTitleEl.id = 'st-round-over-title';
    this.roundOverScoreEl = document.createElement('div');
    this.roundOverScoreEl.className = 'st-hud__score';

    // Shop: a tank selector + that tank's credits, then a grid of buy buttons.
    this.roundOverShopEl = document.createElement('div');
    this.roundOverShopEl.className = 'st-hud__roundshop';
    const shopHead = document.createElement('div');
    shopHead.className = 'st-hud__roundshop-head';
    const shopTitle = document.createElement('span');
    shopTitle.className = 'st-hud__roundshop-title';
    shopTitle.textContent = 'Round shop';
    this.roundOverTankSel = document.createElement('select');
    this.roundOverTankSel.className = 'st-hud__roundshop-sel';
    this.roundOverTankSel.addEventListener('change', () => {
      this.shopTankId = this.roundOverTankSel.value || null;
    });
    this.roundOverCreditsEl = document.createElement('span');
    this.roundOverCreditsEl.className = 'st-hud__roundshop-credits';
    const selectorWell = document.createElement('div');
    selectorWell.className = 'st-hud__roundshop-select-well';
    selectorWell.append(this.roundOverTankSel, makeHudIcon('disclosure', 18));
    shopHead.append(shopTitle, this.roundOverCreditsEl, selectorWell);

    const shopGrid = document.createElement('div');
    shopGrid.className = 'st-hud__roundshop-grid';
    for (const type of STORE_WEAPONS) {
      const def = WEAPONS[type];
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'st-hud__store-buy st-hud__roundshop-buy';
      buyBtn.dataset['weapon'] = type;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'st-hud__roundshop-item-name';
      nameSpan.textContent = def.name;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'st-hud__store-price';
      priceSpan.textContent = `$${def.price.toLocaleString()}`;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-bundle';
      buyBtn.append(makeWeaponIcon(type, 18), nameSpan, priceSpan, owned);
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
      buyBtn.className = 'st-hud__store-buy st-hud__roundshop-buy';
      buyBtn.dataset['accessory'] = key;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'st-hud__roundshop-item-name';
      nameSpan.textContent = acc.name;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'st-hud__store-price';
      priceSpan.textContent = `$${acc.price.toLocaleString()}`;
      const owned = document.createElement('span');
      owned.className = 'st-hud__store-bundle';
      buyBtn.append(makeHudGlyph('store', 18), nameSpan, priceSpan, owned);
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
    const nextRoundLabel = document.createElement('span');
    nextRoundLabel.className = 'st-hud__restart-label';
    nextRoundLabel.textContent = 'Start Next Round';
    nextRoundBtn.append(makeHudGlyph('right', 17), nextRoundLabel);
    nextRoundBtn.addEventListener('click', () => this.nextRoundCb?.());

    roPanel.append(this.roundOverTitleEl, this.roundOverScoreEl, this.roundOverShopEl, nextRoundBtn);
    this.roundOverEl.append(roPanel);
    this.roundOverEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...this.roundOverEl.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled)',
      )].filter((element) => !element.hidden && !element.closest('[hidden]'));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
  }

  /** Persistent Quit/Menu button (top of the side panel). */
  private buildMenu(): HTMLElement {
    // Persistent Quit/Menu button (top of the side panel) — returns to the lobby.
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'st-hud__menu st-ui-action st-ui-action--quiet';
    menu.setAttribute('aria-label', 'Menu');
    menu.append(makeHudIcon('menu', 14));
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
    this.matchDrawerBtnEl.textContent = 'Match';
    this.matchDrawerBtnEl.addEventListener('click', () => {
      this.setMatchDrawerOpen(!this.root.classList.contains('st-hud--match-drawer-open'));
    });
    this.matchDrawerCloseEl = document.createElement('button');
    this.matchDrawerCloseEl.type = 'button';
    this.matchDrawerCloseEl.className = 'st-hud__match-drawer-close st-ui-action st-ui-action--quiet';
    this.matchDrawerCloseEl.append(makeHudIcon('close', 14));
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
    if (enabled && this.liveMatchInspectorMenuEl.parentElement !== this.pauseActionsEl) {
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
    this.dismissBattleConsoleSettings();
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
    const isVisibleFocusTarget = (element: HTMLElement | null): element is HTMLElement => {
      if (!element?.isConnected || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    const target = [previous, this.root.querySelector<HTMLElement>('.st-hud__menu'), this.matchDrawerBtnEl]
      .find(isVisibleFocusTarget);
    target?.focus({ preventScroll: true });
  }

  private setLiveMatchInspectorIsolation(active: boolean): void {
    if (active) this.hideTransientMessage();
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
    if (this.modalOwnsInteraction()) {
      this.hideTransientMessage();
      return;
    }
    this.toastEl.classList.remove('st-hud__toast--hidden');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('st-hud__toast--hidden');
      this.toastTimer = null;
    }, 4000);
  }

  /** Modal chrome owns the full interaction; stale rail notices must not show through it. */
  private hideTransientMessage(): void {
    this.toastEl.classList.add('st-hud__toast--hidden');
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private modalOwnsInteraction(): boolean {
    return this.paused
      || this.battleConsoleArmoryOpen
      || this.battleConsoleSettingsOpen
      || this.battleConsoleCoachBriefingOpen
      || this.roundOverShown
      || this.overlayShown
      || this.terminalState !== null
      || this.verifiedExpiryEl?.hidden === false
      || !this.liveMatchInspectorEl.classList.contains('st-hud__overlay--hidden');
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

  /** True whenever authored modal chrome owns the interaction and the gameplay
   * input layer must not mutate aim, weapon, movement, or fire state behind it. */
  isGameplayInputBlocked(): boolean {
    return this.built && this.modalOwnsInteraction();
  }

  /** Show/hide the in-game PAUSE overlay. Non-destructive — the client/engine keeps
   *  running underneath (the networked lockstep loop MUST keep applying the broadcast
   *  log to stay in sync), so Resume returns to the exact live game. Local human input
   *  is suppressed while open via main.ts's gate (#52), NOT by stopping the loop. */
  private togglePause(show: boolean): void {
    if (show) {
      const focused = document.activeElement;
      this.pausePreviousFocus = focused instanceof HTMLElement ? focused : null;
      if (this.root.classList.contains('st-hud--match-drawer-open')) {
        this.pausePreviousFocus = this.matchDrawerBtnEl;
        this.setMatchDrawerOpen(false);
      }
      this.battleConsoleArmoryOpen = false;
      this.battleConsoleSettingsOpen = false;
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
    this.refreshBattleConsole();
    if (show) {
      this.pauseResumeBtnEl.focus({ preventScroll: true });
      return;
    }
    if (this.root.classList.contains('st-hud--match-drawer-open')) {
      this.pausePreviousFocus = null;
      this.setMatchDrawerOpen(false);
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
    if (active) this.hideTransientMessage();
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
    el.className = 'st-hud__player st-hud__player-row';

    const order = document.createElement('span');
    order.className = 'st-hud__turn-order';
    order.dataset['rosterField'] = 'ordinal';
    order.setAttribute('aria-hidden', 'true');

    const activeMarker = document.createElement('span');
    activeMarker.className = 'st-hud__player-active-marker';
    activeMarker.dataset['rosterField'] = 'active-marker';
    activeMarker.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'st-hud__name';
    name.dataset['rosterField'] = 'name';
    const playerLabel = HUD.playerLabel(tank);
    name.textContent = playerLabel;
    name.dataset['nameFit'] = playerLabel.length > 12 ? 'compact' : 'default';

    const hp = document.createElement('span');
    hp.className = 'st-hud__hp';
    hp.dataset['rosterField'] = 'health';

    const ammo = document.createElement('span');
    ammo.className = 'st-hud__ammo';
    ammo.dataset['rosterField'] = 'ammo';

    const bar = document.createElement('span');
    bar.className = 'st-hud__bar st-hud__health-swatch';
    bar.dataset['rosterField'] = 'health-swatch';
    const fill = document.createElement('span');
    fill.className = 'st-hud__bar-fill';
    fill.style.backgroundColor = tank.color;
    bar.append(fill);

    el.append(order, activeMarker, name, ammo, hp, bar);
    return {
      el, hp, fill, name, ammo, order,
      lastHealth: Math.max(0, Math.round(tank.health)),
    };
  }

  /** Mutate a player row's volatile bits (hp text, bar width, alive/active classes). */
  private syncRow(
    row: PlayerRow,
    tank: TankState,
    active: boolean,
    isHandoff: boolean,
    turnOrder: number,
  ): void {
    const health = Math.max(0, Math.round(tank.health));
    const dead = !tank.alive || health <= 0;
    row.el.dataset['turnOrder'] = String(turnOrder);
    row.order.textContent = String(turnOrder).padStart(2, '0');

    const ammo = tank.inventory[tank.selectedWeapon];
    row.ammo.textContent = ammo.unlimited ? AMMO_UNLIMITED_GLYPH : String(ammo.count);
    row.ammo.setAttribute(
      'aria-label',
      `${WEAPONS[tank.selectedWeapon].name} ammo ${ammo.unlimited ? 'unlimited' : ammo.count}`,
    );

    // Reconcile identity. Rows are cached by tank.id (the seat slot p1/p2/...),
    // and the persistent HUD reuses them across games — so without this a reused
    // seat keeps the previous game's name/color. Guard the name (textContent
    // round-trips cleanly); reassign colors unconditionally since the browser
    // normalizes backgroundColor and a 2-4 node restyle is negligible.
    const label = HUD.playerLabel(tank);
    if (row.name.textContent !== label) row.name.textContent = label;
    const nameFit = label.length > 12 ? 'compact' : 'default';
    if (row.name.dataset['nameFit'] !== nameFit) row.name.dataset['nameFit'] = nameFit;
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

  /** Tracks whether the GAME_OVER panel is currently shown, so its content (winner
   *  text + scoreboard) builds ONCE on entry rather than every frame. */
  private overlayShown = false;

  private deploymentCountdown(remainingMs: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} remaining`;
  }

  private setDeploymentExpiryIsolation(active: boolean): void {
    if (active) {
      this.hideTransientMessage();
    }
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
        if (surface.dataset['deploymentExpiryPriorInert'] !== undefined) continue;
        surface.dataset['deploymentExpiryPriorInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['deploymentExpiryPriorAriaHidden'] =
          surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
        continue;
      }
      const previousInert = surface.dataset['deploymentExpiryPriorInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['deploymentExpiryPriorAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) {
        surface.removeAttribute('aria-hidden');
      } else {
        surface.setAttribute('aria-hidden', previousAria);
      }
      delete surface.dataset['deploymentExpiryPriorInert'];
      delete surface.dataset['deploymentExpiryPriorAriaHidden'];
    }
  }

  private hideDeploymentExpiry(): void {
    const wasOpen = this.verifiedExpiryEl.hidden === false;
    const expiryOwnedFocus = this.verifiedExpiryEl.contains(document.activeElement);
    this.verifiedExpiryEl.hidden = true;
    this.setDeploymentExpiryIsolation(false);
    if (wasOpen && expiryOwnedFocus) {
      const consoleFallback = this.railRoot.querySelector<HTMLElement>(
        '[data-battle-console-action="fire"]:not([disabled]), [aria-label="Battle settings"]',
      );
      const fallback = consoleFallback?.isConnected ? consoleFallback : this.matchDrawerBtnEl;
      const target = this.verifiedExpiryPreviousFocus?.isConnected
        ? this.verifiedExpiryPreviousFocus
        : fallback;
      target?.focus({ preventScroll: true });
    }
    this.verifiedExpiryPreviousFocus = null;
  }

  /** Project verified-deployment truth into both retained status and successor console state. */
  setVerifiedDeployment(state: HUDVerifiedDeploymentState | null): void {
    this.verifiedDeploymentState = state;
    if (!this.built) this.build();
    if (state?.status === 'expired') {
      this.battleConsoleSettingsOpen = false;
      this.battleConsoleArmoryOpen = false;
    }
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
      this.hideDeploymentExpiry();
      this.refreshBattleConsole();
      return;
    }

    if (this.verifiedStatusEl.parentElement !== this.matchCardEl) {
      this.matchCardEl.insertBefore(this.verifiedStatusEl, this.roundEl);
    }
    this.verifiedStatusEl.hidden = false;
    if (!('deadline' in state)) {
      this.verifiedBudgetEl.textContent = '';
      this.verifiedDeadlineEl.textContent = '';
      this.verifiedStateEl.textContent = state.status === 'policy-refused'
        ? 'That action is not permitted in verified deployment.'
        : 'Verified deployment is unavailable. Return to the Battery.';
      this.hideDeploymentExpiry();
      this.refreshBattleConsole();
      return;
    }

    this.verifiedBudgetEl.textContent =
      `Salvos · You ${state.humanSalvos} / ${state.humanLimit} · CPU ${state.cpuSalvos} / ${state.cpuLimit}`;
    this.verifiedDeadlineEl.textContent = this.deploymentCountdown(state.deadline.remainingMs);
    if (state.status === 'cap-adjudicating') {
      this.verifiedStateEl.textContent = 'Salvo cap reached. Adjudicating verified result.';
    } else if (state.status === 'completion-pending') {
      this.verifiedStateEl.textContent = 'Verification pending';
    } else if (state.status === 'retryable') {
      this.verifiedStateEl.textContent = 'Verification needs another attempt.';
      this.verifiedRetryBtnEl.hidden = false;
      this.verifiedRetryBtnEl.disabled = false;
      this.overlayVerifiedRetryBtnEl.disabled = false;
      if (this.overlayVerifiedRetryBtnEl.parentElement !== this.overlayPrimaryBtnEl.parentElement) {
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
      this.hideDeploymentExpiry();
      this.refreshBattleConsole();
      return;
    }
    if (this.paused) this.togglePause(false);
    const openingExpiryDecision = this.verifiedExpiryEl.hidden;
    if (openingExpiryDecision) {
      const active = document.activeElement;
      this.verifiedExpiryPreviousFocus = active instanceof HTMLElement && active !== document.body
        ? active
        : (this.railRoot.querySelector<HTMLElement>('[data-battle-console-action="fire"]')
          ?? this.matchDrawerBtnEl);
    }
    this.verifiedExpiryEl.hidden = false;
    this.setDeploymentExpiryIsolation(true);
    if (openingExpiryDecision) this.verifiedContinueBtnEl.focus({ preventScroll: true });
    this.refreshBattleConsole();
  }

  /** Present one public client-only Field Order only while verified play owns it. */
  setFieldOrder(order: FieldOrder | null): void {
    if (!this.built) this.build();
    if (order !== null) {
      if (this.fieldOrderEl.parentElement !== this.verifiedStatusEl) {
        this.verifiedStatusEl.append(this.fieldOrderEl);
      }
      if (this.verifiedStatusEl.parentElement !== this.matchCardEl) {
        this.matchCardEl.insertBefore(this.verifiedStatusEl, this.roundEl);
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
    if (active) this.hideTransientMessage();
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
    this.overlayPrimaryLabelEl.textContent = 'Play again';
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
    this.overlayPrimaryLabelEl.textContent = 'Brief next order';
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
    this.battleConsoleSettingsOpen = false;
    this.battleConsoleArmoryOpen = false;
    this.battleConsoleCoachBriefingOpen = false;
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
    if (this.roundOverShown) this.setRoundOverIsolation(false);
    this.roundOverEl.classList.add('st-hud__overlay--hidden');
    this.roundOverShown = false;
    this.roundOverPreviousFocus = null;
    this.lastPresentedTurnKey = null;
    if (this.built) {
      for (const row of this.rows.values()) {
        row.el.classList.remove('st-hud__player--handoff');
      }
    }
  }

  /** Exclude every app/modal peer while the between-round report owns focus. */
  private setRoundOverIsolation(active: boolean): void {
    if (active) this.hideTransientMessage();
    const appSiblings = this.modalRoot.parentElement
      ? [...this.modalRoot.parentElement.children]
        .filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== this.modalRoot)
      : [];
    const modalSiblings = [...this.modalRoot.children]
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.roundOverEl);

    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['roundOverPreviousInert'] !== undefined) continue;
        surface.dataset['roundOverPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['roundOverPreviousAriaHidden'] =
          surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
        continue;
      }
      const previousInert = surface.dataset['roundOverPreviousInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['roundOverPreviousAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) {
        surface.removeAttribute('aria-hidden');
      } else {
        surface.setAttribute('aria-hidden', previousAria);
      }
      delete surface.dataset['roundOverPreviousInert'];
      delete surface.dataset['roundOverPreviousAriaHidden'];
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
      const wasShown = this.roundOverShown;
      this.roundOverEl.classList.add('st-hud__overlay--hidden');
      this.roundOverShown = false;
      if (wasShown) {
        this.setRoundOverIsolation(false);
        const previous = this.roundOverPreviousFocus;
        this.roundOverPreviousFocus = null;
        const focusTarget = previous?.isConnected && !previous.closest('[inert]')
          ? previous
          : (this.railRoot.querySelector<HTMLElement>(
            '[data-semantic-key="command-console-host::fire"]',
          ) ?? this.matchDrawerBtnEl);
        focusTarget.focus({ preventScroll: true });
      }
      return;
    }

    this.battleConsoleArmoryOpen = false;
    this.battleConsoleSettingsOpen = false;
    this.battleConsoleCoachBriefingOpen = false;

    if (!this.roundOverShown) {
      const focused = document.activeElement;
      this.roundOverPreviousFocus = focused instanceof HTMLElement ? focused : null;
      const completed = state.round - 1;
      const winner = state.tanks.find((t) => t.id === state.lastRoundWinnerId);
      this.roundOverTitleEl.textContent = `Round ${completed} complete · ${state.round}/${state.totalRounds}`;
      this.roundOverTitleEl.setAttribute(
        'aria-label',
        winner
          ? `Round ${completed}: ${winner.playerName} won. Round ${state.round} of ${state.totalRounds}.`
          : `Round ${completed}: draw. Round ${state.round} of ${state.totalRounds}.`,
      );
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
      this.setRoundOverIsolation(true);
      const focusTarget = humans.length > 0
        ? this.roundOverTankSel
        : this.roundOverEl.querySelector<HTMLButtonElement>('.st-hud__restart');
      focusTarget?.focus({ preventScroll: true });
    }

    // Live shop sync for the selected tank (credits + per-weapon affordability).
    const tank = state.tanks.find((t) => t.id === this.shopTankId);
    this.roundOverCreditsEl.textContent = tank ? `${tank.credits.toLocaleString()} cr` : '';
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

  private static injectStyle(): void {
    if (document.getElementById(HUD.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HUD.STYLE_ID;
    style.textContent = hudCss;
    document.head.append(style);
  }

  private static readonly STYLE_ID = 'st-hud-style';



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
  /** Selected weapon's current ammo count. */
  ammo: HTMLElement;
  /** Last rendered health, to detect drops and trigger the damage flash. */
  lastHealth: number;
}

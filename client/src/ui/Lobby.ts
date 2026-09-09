import { normalizeCreateRoomFallback, projectAuthoritativeNetworkMode, WIND_DEFAULT, GRAVITY_DEFAULT, type ModeSetup, type ModePlayer } from '../client/modeConfig';
import lobbyCss from './Lobby.css?raw';
import { VerifiedDeploymentSession, type VerifiedDeploymentState as LobbyVerifiedDeploymentState, type VerifiedDeploymentAccountPort } from '../client/VerifiedDeploymentSession';
import type { AiDifficulty } from '@shared/types/GameState';
import {
  DEFAULT_TANK_LOADOUT,
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  normalizeTankLoadout,
  type TankKitId,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import { clamp } from '@shared/engine/math';
import { buildLobbyHotSeatView } from './LobbyHotSeatView';
import { QUICK_OPERATIONS, quickOperationById, quickOperationOptions } from '../client/quickOperations';
import { buildLobbyBrowseView } from './LobbyBrowseView';
import { buildLobbyCreateView } from './LobbyCreateView';
import { buildLobbyJoinView } from './LobbyJoinView';
import { buildLobbyOnlineView, buildLobbyShellView } from './LobbyShellView';
import { buildLobbyWaitingView } from './LobbyWaitingView';
import { buildAccountPanelOverlayContent, buildAccountPanelView } from './AccountPanelView';
import { buildLobbyOverlayView } from './LobbyOverlayView';
import { buildLobbyGarageView } from './LobbyGarageView';
import {
  buildProductionDiagnosticsView,
  type ProductionDiagnosticsCopyStatus,
} from './ProductionDiagnosticsView';
import { buildRoomInviteUrl, readRoomInviteCode } from './roomInvite';
import {
  LobbyTransport,
  type NetworkPlayer,
  type RoomOptions,
  type BrowseRoom,
  type RoomVisibility,
  type FetchedRoom,
} from '../client/LobbyTransport';
import {
  LobbySession,
  type LobbySessionEvent,
  type LobbyWaitingState,
} from '../client/LobbySession';
import { LobbyRoomController } from '../client/LobbyRoomController';
import type { SessionDescriptor } from '../lib/sessionDescriptor';
import {
  AccountSession,
  type AccountCredentials,
  type AccountMode,
  type AccountState,
} from '../client/AccountSession';
import { createFieldOrder, type FieldOrder } from '../client/fieldOrder';
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel';
import {
  type VerifiedDeploymentDescriptor,
  type VerifiedDeploymentReceipt,
  type VerifiedDeploymentStart,
} from '../client/verifiedDeployment';
import {
  VerifiedDeploymentStorage,
} from '../client/verifiedDeploymentStorage';
import {
  PRODUCTION_DIAGNOSTIC_CHECKS,
  cancelVerifiedCompletionResponseDiagnostic,
  createProductionDiagnostics,
  productionDiagnosticsReceiptForState,
  type DiagnosticCheckResult,
  type ProductionDiagnostics,
  type ProductionDiagnosticsReadiness,
  type ProductionDiagnosticsState,
} from '../client/ProductionDiagnostics';
import type {
  HotSeatMatchResult,
  HotSeatProgressionReceipt,
} from '../client/hotSeatProgression';
import {
  CURRENT_NETWORK_RULESET_VERSION,
  normalizeNetworkRulesetVersion,
} from '../client/networkRuleset';
import {
  type LobbySettings,
  WIND_MIN,
  WIND_MAX,
  GRAVITY_MIN,
  GRAVITY_MAX,
  ROUNDS_MIN,
  ROUNDS_MAX,
  ROUNDS_DEFAULT,
  INTEREST_MIN,
  INTEREST_MAX,
  SUDDEN_DEATH_MIN,
  SUDDEN_DEATH_MAX,
  ARMS_MIN,
  ARMS_MAX,
  ARMS_DEFAULT,
  parseOnlineRounds,
  parseOnlineEconomy,
  coerceSettings,
  normalizeRoomCode,
  isValidRoomCode,
} from './lobbyValidation';
import { paintTankLoadoutPreview } from '../renderer/TankLoadoutPreview';
import {
  TANK_PART_VARIANT_LABELS,
  TANK_SLOT_LABELS,
} from './tankPartLabels';

export type { LobbySettings } from './lobbyValidation';
// NetworkPlayer/AiDifficulty are used across the online flow (bots in rooms).

/** Play mode chosen in the lobby. */
export type GameMode = 'hotseat' | 'network';

/** A single player entry chosen in the lobby (name + unique color). */
export type LobbyPlayer = ModePlayer;

/** Configuration produced by the lobby once the player(s) are ready. */
export interface LobbyConfig extends ModeSetup {
  /** Local Quick Duel presentation only; never enters the deterministic action protocol. */
  quickOperation?: { readonly id: string; readonly title: string; readonly briefing: string };
  /** Auth-owned verified execution context. Server config and recovery transcript stay immutable. */
  verifiedDeployment?: {
    readonly descriptor: VerifiedDeploymentDescriptor;
    readonly transcript: readonly VerifiedHumanFire[];
    readonly fieldOrder: FieldOrder | null;
  };
}

/** Fixed color palette; each player must pick a unique entry. */
const PALETTE = [
  { name: 'Red', value: '#e84d4d' },
  { name: 'Blue', value: '#4d8ce8' },
  { name: 'Green', value: '#4de87a' },
  { name: 'Yellow', value: '#e8c84d' },
  { name: 'Purple', value: '#a855f7' },
] as const satisfies ReadonlyArray<{ name: string; value: string }>;

function presetLoadout(kit: TankKitId): TankLoadout {
  return {
    treads: kit,
    hull: kit,
    turret: kit,
    barrel: kit,
  };
}

/** Stable authored example build for a newly constructed hot-seat row. */
function seatPresetLoadout(index: number): TankLoadout {
  const kit = TANK_KIT_IDS[index % TANK_KIT_IDS.length] ?? TANK_KIT_IDS[0];
  return presetLoadout(kit);
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const STYLE_ID = 'lobby-style';

function browserQuickDuelSeed(): number {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0]!;
}

// View-only advanced-settings defaults/steps (placeholders + input granularity).
// The bounds (WIND_MIN/MAX, GRAVITY_MIN/MAX, ROUNDS_*, INTEREST_*, SUDDEN_DEATH_*,
// ARMS_*) live in ./lobbyValidation alongside the coercion that enforces them.
const GRAVITY_STEP = 0.01;
const INTEREST_STEP = 0.05;
const INTEREST_DEFAULT = 0;
const SUDDEN_DEATH_DEFAULT = 0;

/** Raw (string) working state for the advanced-settings inputs. */
interface SettingsState {
  maxWind: string;
  gravity: string;
  /** Horizontal arena boundary behavior (blank = open). */
  walls: string;
  /** Authored battlefield world (blank = Automatic). */
  battlefieldWorld: string;
  /** Terrain hazard select value (blank = none). */
  hazards: string;
  seed: string;
  rounds: string;
  interestRate: string;
  suddenDeathTurn: string;
  /** Arms level as a select value ('' = default/4). */
  armsLevel: string;
  teamMode: string;
}

/** A working row of player config state in the setup UI. */
interface PlayerRowState {
  name: string;
  color: string;
  /** CPU difficulty for this seat, or undefined for a human. */
  ai?: AiDifficulty;
  loadout: TankLoadout;
}

interface PreviewVehicle {
  owner: string;
  name: string;
  color: string;
  loadout: TankLoadout;
}

/** Active tab on the lobby. */
type LobbyTab = 'hotseat' | 'online';

/** Sub-view within the Play Online tab. */
type OnlineSubView = 'create' | 'join' | 'browse' | 'waiting';

export interface AccountSessionPort extends VerifiedDeploymentAccountPort {
  readonly state: AccountState;
  initialize(): Promise<void>;
  submit(mode: AccountMode, credentials: AccountCredentials): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null>;

}

export type { VerifiedDeploymentState as LobbyVerifiedDeploymentState } from '../client/VerifiedDeploymentSession';

type AccountSessionFactory = (
  onChange: (state: AccountState) => void,
) => AccountSessionPort;

export type ProductionDiagnosticsFactory = (
) => ProductionDiagnostics | Promise<ProductionDiagnostics>;

const defaultProductionDiagnosticsFactory: ProductionDiagnosticsFactory = async () => {
  const { supabase } = await import('../lib/supabase');
  return createProductionDiagnostics(supabase, { readiness: 'loading' });
};

const DIAGNOSTICS_LOCAL_FAILURE: DiagnosticCheckResult = Object.freeze({
  id: PRODUCTION_DIAGNOSTIC_CHECKS[0].id,
  label: PRODUCTION_DIAGNOSTIC_CHECKS[0].label,
  status: 'FAIL',
  code: 'request_failed',
});

/**
 * Lobby is the pre-game DOM overlay (SPEC §3): pick the number of players,
 * enter names, and choose a unique color per player from a fixed palette.
 * Calls onReady with the resulting hot-seat config when the player starts.
 */
export class Lobby {
  private accountAuthenticationChangeCb: ((identityChanged: boolean) => void) | null = null;
  private readonly root: HTMLElement;
  private readonly onReady: (config: LobbyConfig) => void;
  /** Owns every listener attached to the current replaceable lobby tree. */
  private renderListeners = new AbortController();

  /** Owns the seven Edge-Function calls (create/join/list/heartbeat/ready/leave/update). */
  private readonly transport = new LobbyTransport();
  private readonly session: LobbySession;
  private readonly roomController: LobbyRoomController;
  private readonly accountSession: AccountSessionPort;
  private readonly verifiedSession: VerifiedDeploymentSession;
  private verifiedLaunchBusy = false;
  private verifiedAbandonIntent = false;
  private accountPanelOpen = false;
  private accountMode: AccountMode = 'sign-in';
  private readonly createDiagnostics: ProductionDiagnosticsFactory;
  private diagnosticsIntentActive = false;
  private diagnosticsAutorunRequested = false;
  private diagnosticsAutorunStarted = false;
  private diagnosticsFactoryStarted = false;
  private diagnosticsGeneration = 0;
  private diagnostics: ProductionDiagnostics | undefined;
  private diagnosticsFallbackState: ProductionDiagnosticsState | undefined;
  private diagnosticsCopyStatus: ProductionDiagnosticsCopyStatus = 'idle';
  private diagnosticsCopyGeneration = 0;
  private diagnosticsRunGeneration = 0;
  private diagnosticsLastReadiness: ProductionDiagnosticsReadiness | undefined;
  private diagnosticsSawAuthenticatedAccount = false;

  /** Working state for the player rows (defaults Player 1..N + palette order). */
  private players: PlayerRowState[] = [];

  /** Raw working state for the advanced-settings inputs (blank = use default). */
  private settings: SettingsState = { maxWind: '', gravity: '', walls: '', battlefieldWorld: '', hazards: '', seed: '', rounds: '', interestRate: '', suddenDeathTurn: '', armsLevel: '', teamMode: '' };

  /** Whether the Operations Settings overlay is open (persist across renders). */
  private settingsOpen = false;

  /** Whether Hot Seat's optional preparation controls are expanded. */
  private hotSeatCustomizationOpen = false;

  // ---- Tab / online sub-view state ----
  private surface: 'chooser' | 'preparation' = 'chooser';
  private activeTab: LobbyTab = 'hotseat';
  private onlineSubView: OnlineSubView = 'create';

  // Create form state
  private onlineName = '';
  private onlineNameSource: 'none' | 'profile' | 'user' = 'none';
  private onlineColor: string = PALETTE[0].value;
  private onlineLoadout: TankLoadout = { ...DEFAULT_TANK_LOADOUT };
  /** Compact layouts expose one touch-sized Garage editor at a time. */
  private openGarageOwner: string | null = null;
  /** Garage owner currently featured in the large vehicle-bay preview. */
  private spotlightOwner: string | null = null;
  private onlineMaxPlayers = 2;
  private onlineMaxWind = '';
  private onlineGravity = '';
  /** Horizontal arena boundary behavior (blank = open). */
  private onlineWalls = '';
  /** Authored battlefield world (blank = Automatic). */
  private onlineBattlefieldWorld = '';
  /** Deterministic terrain hazard mode (blank = none). */
  private onlineHazards = '';
  private onlineRounds = '';
  private onlineInterestRate = '';
  private onlineSuddenDeath = '';
  /** Arms level select value for the room being created ('' = default/4). */
  private onlineArmsLevel = '';
  /** Opt-in 2v2 setting; the Edge validator activates it only for four seats. */
  private onlineTeamMode = false;
  /** Visibility for the room being created; defaults to public. */
  private onlineVisibility: RoomVisibility = 'public';
  /** Number of CPU opponents to seed into the room on create (0..maxPlayers-1). */
  private onlineBots = 0;
  /** Difficulty applied to all seeded CPU opponents. */
  private onlineBotDifficulty: AiDifficulty = 'medium';

  // Join form state. Default the join color to the SECOND palette entry (Blue)
  // rather than the first (Red) — the create form defaults to Red, so if both
  // the host and a joiner accept the defaults they no longer collide. The
  // waiting-room Ready-Up guard (below) is the authoritative client-side block;
  // this just removes the most common accidental clash.
  private joinCode = '';
  // Name is shared with the Create form (this.onlineName) so it persists when
  // switching between online sub-views / tabs.
  private joinColor: string = PALETTE[1].value;

  // Browse (public rooms) sub-view state.
  private browseRooms: BrowseRoom[] = [];

  constructor(
    root: HTMLElement,
    onReady: (config: LobbyConfig) => void,
    createAccountSession: AccountSessionFactory = (onChange) => new AccountSession(onChange),
    createDiagnostics: ProductionDiagnosticsFactory = defaultProductionDiagnosticsFactory,
    private readonly generateQuickDuelSeed: () => number = browserQuickDuelSeed,
  ) {
    this.root = root;
    this.onReady = onReady;
    this.players = [defaultRow(0), defaultRow(1)];
    this.session = new LobbySession(this.transport, (event) => this.handleSessionEvent(event));
    this.roomController = new LobbyRoomController(
      this.transport,
      this.session,
      () => this.render(),
      (intent) => { this.onlineSubView = intent; },
      (handoff) => this.onReady(handoff),
    );
    this.accountSession = createAccountSession(() => { this.renderForAccountChange(); });
    this.verifiedSession = new VerifiedDeploymentSession(
      this.accountSession, (now) => new VerifiedDeploymentStorage(localStorage, now),
    );
    this.syncOnlineNameFromAccount();
    this.createDiagnostics = createDiagnostics;
    const diagnosticsParams = new URL(window.location.href).searchParams;
    this.diagnosticsIntentActive = diagnosticsParams.get('diagnostics') === '1';
    this.diagnosticsAutorunRequested = this.diagnosticsIntentActive
      && diagnosticsParams.get('autorun') === '1';
    if (this.diagnosticsIntentActive) {
      this.settingsOpen = false;
      this.openGarageOwner = null;
    }
    const inviteCode = readRoomInviteCode(window.location.href);
    if (inviteCode) {
      this.surface = 'preparation';
      this.activeTab = 'online';
      this.onlineSubView = 'join';
      this.joinCode = inviteCode;
    }
  }

  private renderForAccountChange(): void {
    if (this.accountSession.state.status !== 'authenticated') {
      cancelVerifiedCompletionResponseDiagnostic();
    }
    const identityChanged = this.verifiedSession.syncAccountIdentity(cancelVerifiedCompletionResponseDiagnostic);
    if (identityChanged) this.roomController.accountIdentityChanged();
    const recoveryGeneration = this.verifiedSession.advanceRecoveryGeneration();
    const restoreFocus = this.accountPanelOpen;
    const restoreLocalBattleFocus = document.activeElement instanceof HTMLButtonElement
      && this.root.contains(document.activeElement)
      && document.activeElement.textContent === 'Local Battle';
    this.verifiedSession.freezeVerifiedDeploymentForAccountChange();
    this.syncOnlineNameFromAccount();
    this.syncDiagnosticsReadiness();
    this.maybeAutorunDiagnostics();
    this.render();
    this.accountAuthenticationChangeCb?.(identityChanged);
    if (restoreFocus) this.focusAccountOverlay();
    else if (restoreLocalBattleFocus) this.diagnosticsReturnFocus()?.focus();
    void this.verifiedSession.revalidateFrozenVerifiedDeployment(recoveryGeneration);
  }

  private syncOnlineNameFromAccount(): void {
    const state = this.accountSession.state;
    if (state.status === 'authenticated') {
      if (this.onlineNameSource !== 'user') {
        this.onlineName = state.profile.displayName;
        this.onlineNameSource = 'profile';
      }
      return;
    }
    if (this.onlineNameSource === 'profile') {
      this.onlineName = '';
      this.onlineNameSource = 'none';
    }
  }

  private setOnlineName(value: string): void {
    this.onlineName = value;
    this.onlineNameSource = 'user';
  }

  private diagnosticsReadiness(): ProductionDiagnosticsReadiness {
    const status = this.accountSession.state.status;
    if (status === 'authenticated') {
      this.diagnosticsSawAuthenticatedAccount = true;
      return 'authenticated';
    }
    if (status === 'anonymous' && this.diagnosticsSawAuthenticatedAccount) return 'signed-out';
    return status;
  }

  private syncDiagnosticsReadiness(): void {
    if (!this.diagnosticsIntentActive || !this.diagnostics) return;
    const readiness = this.diagnosticsReadiness();
    if (readiness !== this.diagnosticsLastReadiness) {
      this.diagnosticsLastReadiness = readiness;
      this.diagnosticsCopyGeneration += 1;
      this.diagnosticsCopyStatus = 'idle';
      if (readiness !== 'authenticated') this.diagnosticsRunGeneration += 1;
    }
    try {
      this.diagnostics.setReadiness(readiness);
      this.diagnosticsFallbackState = undefined;
    } catch {
      this.diagnosticsRunGeneration += 1;
      this.diagnosticsFallbackState = { status: 'unavailable' };
    }
  }

  private startDiagnostics(): void {
    if (!this.diagnosticsIntentActive || this.diagnosticsFactoryStarted) return;
    this.diagnosticsFactoryStarted = true;
    this.diagnosticsFallbackState = { status: 'loading' };
    const generation = ++this.diagnosticsGeneration;

    let created: ProductionDiagnostics | Promise<ProductionDiagnostics>;
    try {
      created = this.createDiagnostics();
    } catch {
      this.failDiagnosticsFactory(generation);
      return;
    }

    let then: unknown;
    try {
      then = (created as PromiseLike<ProductionDiagnostics>).then;
    } catch {
      this.failDiagnosticsFactory(generation);
      return;
    }
    if (typeof then !== 'function') {
      this.acceptDiagnostics(created as ProductionDiagnostics, generation);
      return;
    }

    void Promise.resolve(created).then(
      (diagnostics) => { this.acceptDiagnostics(diagnostics, generation); },
      () => { this.failDiagnosticsFactory(generation); },
    );
  }

  private acceptDiagnostics(diagnostics: ProductionDiagnostics, generation: number): void {
    if (!this.diagnosticsIntentActive || generation !== this.diagnosticsGeneration) {
      try { diagnostics.dispose(); } catch { /* late diagnostics stay discarded */ }
      return;
    }
    this.diagnostics = diagnostics;
    this.diagnosticsLastReadiness = undefined;
    this.diagnosticsFallbackState = undefined;
    this.syncDiagnosticsReadiness();
    this.maybeAutorunDiagnostics();
    this.render();
  }

  private failDiagnosticsFactory(generation: number): void {
    if (!this.diagnosticsIntentActive || generation !== this.diagnosticsGeneration) return;
    this.diagnosticsFallbackState = { status: 'unavailable' };
    this.render();
  }

  private diagnosticsState(): ProductionDiagnosticsState {
    if (this.diagnosticsFallbackState) return this.diagnosticsFallbackState;
    try {
      return this.diagnostics?.state ?? { status: 'loading' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  private maybeAutorunDiagnostics(): void {
    if (
      !this.diagnosticsIntentActive
      || !this.diagnosticsAutorunRequested
      || this.diagnosticsAutorunStarted
      || !this.diagnostics
      || this.diagnosticsFallbackState !== undefined
      || this.accountSession.state.status !== 'authenticated'
    ) return;
    this.diagnosticsAutorunStarted = true;
    this.runDiagnostics();
  }

  private runDiagnostics(): void {
    if (!this.diagnosticsIntentActive || !this.diagnostics) return;
    this.diagnosticsCopyGeneration += 1;
    this.diagnosticsCopyStatus = 'idle';
    this.diagnosticsFallbackState = undefined;
    const runGeneration = ++this.diagnosticsRunGeneration;
    let run: Promise<DiagnosticCheckResult>;
    try {
      run = this.diagnostics.runChecks();
    } catch {
      this.diagnosticsFallbackState = DIAGNOSTICS_LOCAL_FAILURE;
      this.render();
      return;
    }
    this.render();
    const generation = this.diagnosticsGeneration;
    void Promise.resolve(run).then(
      () => {
        if (
          !this.diagnosticsIntentActive
          || generation !== this.diagnosticsGeneration
          || runGeneration !== this.diagnosticsRunGeneration
        ) return;
        this.render();
      },
      () => {
        if (
          !this.diagnosticsIntentActive
          || generation !== this.diagnosticsGeneration
          || runGeneration !== this.diagnosticsRunGeneration
        ) return;
        this.diagnosticsFallbackState = DIAGNOSTICS_LOCAL_FAILURE;
        this.render();
      },
    );
  }

  private copyDiagnosticsReceipt(): void {
    const receipt = productionDiagnosticsReceiptForState(this.diagnosticsState());
    if (!receipt) {
      this.diagnosticsCopyStatus = 'failed';
      this.render();
      return;
    }

    const copyGeneration = ++this.diagnosticsCopyGeneration;
    let copy: Promise<void>;
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
      copy = clipboard.writeText(JSON.stringify(receipt, null, 2));
    } catch {
      this.diagnosticsCopyStatus = 'failed';
      this.render();
      return;
    }
    void Promise.resolve(copy).then(
      () => {
        if (
          !this.diagnosticsIntentActive
          || copyGeneration !== this.diagnosticsCopyGeneration
        ) return;
        this.diagnosticsCopyStatus = 'copied';
        this.render();
      },
      () => {
        if (
          !this.diagnosticsIntentActive
          || copyGeneration !== this.diagnosticsCopyGeneration
        ) return;
        this.diagnosticsCopyStatus = 'failed';
        this.render();
      },
    );
  }

  private openAccountFromDiagnostics(): void {
    if (!this.diagnosticsIntentActive) return;
    this.settingsOpen = false;
    this.openGarageOwner = null;
    this.accountMode = 'sign-in';
    this.accountPanelOpen = true;
    this.render();
    this.focusAccountOverlay();
  }

  private closeDiagnostics(): void {
    if (!this.diagnosticsIntentActive) return;
    this.diagnosticsIntentActive = false;
    this.diagnosticsAutorunRequested = false;
    this.diagnosticsGeneration += 1;
    this.diagnosticsRunGeneration += 1;
    this.diagnosticsCopyGeneration += 1;
    const diagnostics = this.diagnostics;
    this.diagnostics = undefined;
    this.diagnosticsLastReadiness = undefined;
    this.diagnosticsFallbackState = undefined;
    this.diagnosticsCopyStatus = 'idle';
    try { diagnostics?.dispose(); } catch { /* disposal is terminal and local */ }

    const url = new URL(window.location.href);
    url.searchParams.delete('diagnostics');
    url.searchParams.delete('autorun');
    try {
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch {
      // The diagnostics lifecycle still closes if a hostile history shim fails.
    }
    this.render();
  }

  private diagnosticsReturnFocus(): HTMLElement | null {
    return [...this.root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Local Battle')
      ?? this.root.querySelector<HTMLButtonElement>('.account-panel button')
      ?? this.root.querySelector<HTMLButtonElement>('button');
  }

  private focusAccountOverlay(): void {
    const overlay = this.root.querySelector<HTMLElement>('.lobby-overlay');
    (overlay?.querySelector<HTMLElement>('.account-panel__form input')
      ?? overlay?.querySelector<HTMLElement>('.account-panel button')
      ?? overlay?.querySelector<HTMLElement>('.lobby-overlay__close'))?.focus();
  }

  private handleSessionEvent(event: LobbySessionEvent): void {
    if (event.type === 'changed') {
      this.render();
    } else if (event.type === 'ready') {
      if (event.source === 'direct') this.onlineBusy = false;
      this.emitNetworkReady(event.room);
    } else {
      this.onlineSubView = 'create';
      this.onlineBusy = false;
      this.onlineError = event.message;
      this.render();
    }
  }

  private get waitingRoomId(): string {
    return this.session.waiting.roomId;
  }

  private get onlineBusy(): boolean {
    return this.roomController.projection.busy;
  }

  private set onlineBusy(busy: boolean) {
    this.roomController.setBusy(busy);
  }

  private get onlineError(): string {
    return this.roomController.projection.error;
  }

  private set onlineError(error: string) {
    this.roomController.setError(error);
  }

  private get rejoinCandidate(): { descriptor: SessionDescriptor; room: FetchedRoom } | null {
    return this.roomController.projection.rejoinCandidate;
  }

  private set rejoinCandidate(candidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null) {
    this.roomController.setRejoinCandidate(candidate);
  }

  private set waitingRoomId(roomId: LobbyWaitingState['roomId']) {
    this.session.replaceWaiting({ ...this.session.waiting, roomId });
  }

  private get waitingRoomCode(): string {
    return this.session.waiting.roomCode;
  }

  private set waitingRoomCode(roomCode: LobbyWaitingState['roomCode']) {
    this.session.replaceWaiting({ ...this.session.waiting, roomCode });
  }

  private get waitingPlayerId(): string {
    return this.session.waiting.playerId;
  }

  private set waitingPlayerId(playerId: LobbyWaitingState['playerId']) {
    this.session.replaceWaiting({ ...this.session.waiting, playerId });
  }

  private get waitingToken(): string {
    return this.session.waiting.token;
  }

  private set waitingToken(token: LobbyWaitingState['token']) {
    this.session.replaceWaiting({ ...this.session.waiting, token });
  }

  private get waitingPlayers(): NetworkPlayer[] {
    return this.session.waiting.players;
  }

  private set waitingPlayers(players: LobbyWaitingState['players']) {
    this.session.replaceWaiting({ ...this.session.waiting, players });
  }

  private get waitingSeed(): number {
    return this.session.waiting.seed;
  }

  private set waitingSeed(seed: LobbyWaitingState['seed']) {
    this.session.replaceWaiting({ ...this.session.waiting, seed });
  }

  private get waitingOptions(): RoomOptions {
    return this.session.waiting.options;
  }

  private set waitingOptions(options: LobbyWaitingState['options']) {
    this.session.replaceWaiting({ ...this.session.waiting, options });
  }

  private get waitingThisPlayerReady(): boolean {
    return this.session.waiting.thisPlayerReady;
  }

  private set waitingThisPlayerReady(thisPlayerReady: LobbyWaitingState['thisPlayerReady']) {
    this.session.replaceWaiting({ ...this.session.waiting, thisPlayerReady });
  }

  /**
   * Render the hot-seat setup overlay: choose 2-4 players, name each, and pick
   * a unique color. A Start button validates and hands a config to onReady.
   */
  show(options: { readonly focusVerifiedDeployment?: boolean } = {}): void {
    this.roomController.activate();
    this.injectStyle();
    this.startDiagnostics();
    this.render();
    this.root.hidden = false;
    if (options.focusVerifiedDeployment) {
      this.root.querySelector<HTMLButtonElement>(
        '.lobby-verified-deployment__launch:not(:disabled)',
      )?.focus({ preventScroll: true });
    }
    void this.accountSession.initialize();
    void this.checkRejoinCandidate();
  }

  /**
   * T-09 (AC-05) — on lobby entry, validate any stored session descriptor
   * against a live `rooms` read: only a descriptor whose room is `active` with
   * the stored seat still present makes the "Rejoin your game" affordance
   * appear. `fetchRoom` is async, so this kicks off in the background and
   * re-renders once it resolves — mirrors the browse-rooms poll pattern
   * (`fetchRooms` mutates state then calls `this.render()`).
   */
  private async checkRejoinCandidate(): Promise<void> {
    await this.roomController.checkRejoinCandidate();
  }

  /** Hide the lobby overlay (e.g. once the game starts). */
  hide(): void {
    this.roomController.retire();
    this.cleanupWaitingChannel();
    this.stopBrowsePoll();
    this.renderListeners.abort();
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  refreshAccount(): Promise<void> {
    return this.accountSession.refresh();
  }

  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null> {
    return this.accountSession.recordHotSeatMatch(result);
  }

  get verifiedDeployment(): LobbyVerifiedDeploymentState {
    return this.verifiedSession.verifiedDeployment;
  }

  async startVerifiedDeployment(now = Date.now()): Promise<VerifiedDeploymentStart | null> {
    return this.verifiedSession.startVerifiedDeployment(now);
  }

  recordVerifiedDeploymentFire(value: VerifiedHumanFire, now = Date.now()): boolean {
    return this.verifiedSession.recordVerifiedDeploymentFire(value, now);
  }

  refreshVerifiedDeploymentDeadline(now = Date.now()): LobbyVerifiedDeploymentState {
    return this.verifiedSession.refreshVerifiedDeploymentDeadline(now);
  }

  async completeVerifiedDeployment(now = Date.now()): Promise<VerifiedDeploymentReceipt | null> {
    return this.verifiedSession.completeVerifiedDeployment(now);
  }

  retryVerifiedDeploymentCompletion(now = Date.now()): Promise<VerifiedDeploymentReceipt | null> {
    return this.verifiedSession.retryVerifiedDeploymentCompletion(now);
  }

  async abandonVerifiedDeployment(): Promise<boolean> {
    return this.verifiedSession.abandonVerifiedDeployment();
  }

  continueVerifiedDeploymentCasually(): boolean {
    return this.verifiedSession.continueVerifiedDeploymentCasually();
  }

  returnVerifiedDeploymentToBattery(): boolean {
    return this.verifiedSession.returnVerifiedDeploymentToBattery();
  }

  isAccountAnonymous(): boolean {
    return this.accountSession.state.status === 'anonymous';
  }

  isAccountAuthenticated(): boolean {
    return this.accountSession.state.status === 'authenticated';
  }

  onAccountAuthenticationChange(callback: (identityChanged: boolean) => void): void {
    this.accountAuthenticationChangeCb = callback;
  }

  showAccountSignIn(): void {
    this.accountMode = 'sign-in';
    this.settingsOpen = false;
    this.openGarageOwner = null;
    this.accountPanelOpen = true;
    this.render();
    this.focusAccountOverlay();
  }

  /** Inject the lobby's scoped <style> once (do NOT edit index.html). */
  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = lobbyCss;
    document.head.append(style);
  }

  /** Re-render the lobby card from current working state. */
  private render(): void {
    this.renderListeners.abort();
    this.renderListeners = new AbortController();
    this.root.replaceChildren();

    // The chooser does not own preparation UI. Constructing it eagerly creates an
    // entire listener-bearing DOM tree that is never mounted and therefore appears
    // as retained detached DOM in a real Chromium heap snapshot.
    let vehiclePreview: HTMLElement | undefined;
    let content: HTMLElement | undefined;
    let controls: HTMLElement | undefined;
    if (this.surface === 'preparation') {
      vehiclePreview = this.renderVehiclePreview();
      controls = this.renderControlsLegend();
      if (this.activeTab === 'hotseat') {
        content = this.renderHotSeatTab();
      } else {
        const onlineContent = this.onlineSubView === 'create'
          ? this.renderCreateForm()
          : this.onlineSubView === 'join'
            ? this.renderJoinForm()
            : this.onlineSubView === 'browse'
              ? this.renderBrowse()
              : this.renderWaitingRoom();
        content = buildLobbyOnlineView(onlineContent);
      }
    }

    const accountOptions = (open: boolean, triggerOnly = false) => ({
      state: this.accountSession.state,
      open,
      triggerOnly,
      mode: this.accountMode,
      onOpen: () => {
        this.settingsOpen = false;
        this.openGarageOwner = null;
        this.accountPanelOpen = true;
        this.render();
      },
      onClose: () => {
        this.accountPanelOpen = false;
        this.render();
        if (!this.diagnosticsIntentActive) {
          this.root.querySelector<HTMLButtonElement>('.account-panel button')?.focus();
        }
      },
      onModeChange: (mode: AccountMode) => {
        this.accountMode = mode;
        this.render();
        this.focusAccountOverlay();
      },
      onSubmit: (mode: AccountMode, credentials: AccountCredentials) => {
        void this.accountSession.submit(mode, credentials);
      },
      onSignOut: () => { void this.accountSession.signOut(); },
      listenerSignal: this.renderListeners.signal,
    });

    const accountPanel = buildAccountPanelView(accountOptions(this.accountPanelOpen, true));
    if (this.diagnosticsIntentActive) accountPanel?.removeAttribute('aria-label');

    const card = buildLobbyShellView({
      activeTab: this.activeTab,
      surface: this.surface,
      showBack: !(this.activeTab === 'online' && this.onlineSubView === 'waiting'),
      rejoinAvailable: this.rejoinCandidate !== null,
      account: accountPanel,
      vehiclePreview,
      content,
      controls,
      onTabChange: (tab) => {
        this.activeTab = tab;
        this.surface = 'preparation';
        this.render();
      },
      quickOperations: QUICK_OPERATIONS,
      onQuickDuel: (operationId) => { this.startQuickDuel(operationId); },
      onRejoin: () => { void this.handleRejoin(); },
      onBack: () => {
        const choice = this.activeTab === 'hotseat' ? 'Local Battle' : 'Play Online';
        if (this.activeTab === 'online' && this.onlineSubView === 'browse') {
          this.stopBrowsePoll();
          this.onlineSubView = 'create';
          this.onlineError = '';
        }
        this.surface = 'chooser';
        this.render();
        [...this.root.querySelectorAll<HTMLButtonElement>('.lobby-deployment-chooser button')]
          .find((button) => button.textContent === choice)
          ?.focus();
      },
      listenerSignal: this.renderListeners.signal,
    });

    this.root.append(card);
    if (this.accountPanelOpen) {
      const accountContent = buildAccountPanelOverlayContent(accountOptions(true));
      if (accountContent) {
        this.root.append(buildLobbyOverlayView({
          label: 'Player account',
          kicker: 'PLAYER RECORD',
          variant: 'account',
          body: accountContent,
          onClose: accountOptions(true).onClose,
          listenerSignal: this.renderListeners.signal,
        }));
      }
    } else if (this.diagnosticsIntentActive) {
      this.root.append(buildProductionDiagnosticsView({
        state: this.diagnosticsState(),
        completionRetryProbe: this.diagnostics?.completionRetryProbe ?? { status: 'idle' },
        pagesProvenance: this.diagnostics?.pagesProvenance ?? { status: 'idle' },
        copyStatus: this.diagnosticsCopyStatus,
        onRun: () => { this.runDiagnostics(); },
        onCopyReceipt: () => { this.copyDiagnosticsReceipt(); },
        onOpenAccount: () => { this.openAccountFromDiagnostics(); },
        onArmCompletionRetryProbe: () => {
          this.diagnostics?.armCompletionRetryProbe();
          this.render();
        },
        onCancelCompletionRetryProbe: () => {
          this.diagnostics?.cancelCompletionRetryProbe();
          this.render();
        },
        onRunPagesProvenance: () => {
          const run = this.diagnostics?.runPagesProvenance();
          this.render();
          void run?.finally(() => { if (this.diagnosticsIntentActive) this.render(); });
        },
        onClose: () => { this.closeDiagnostics(); },
        resolveReturnFocus: () => this.diagnosticsReturnFocus(),
        listenerSignal: this.renderListeners.signal,
      }));
    } else if (this.settingsOpen) {
      const advanced = this.renderAdvancedOverlay();
      if (advanced) {
        this.root.append(buildLobbyOverlayView({
          label: 'Operations Settings',
          kicker: 'BATTLEFIELD PROTOCOL',
          variant: 'operations',
          body: advanced,
          onClose: () => {
            this.settingsOpen = false;
            this.render();
            this.root.querySelector<HTMLButtonElement>('.lobby-advanced-trigger')?.focus();
          },
          listenerSignal: this.renderListeners.signal,
        }));
      }
    }
    const activeGarage = !this.accountPanelOpen && !this.diagnosticsIntentActive
      ? this.root.querySelector<HTMLElement>(
      '.lobby-garage.editing',
      )
      : null;
    if (activeGarage) {
      this.root.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href]',
      ).forEach((control) => {
        if (!activeGarage.contains(control)) control.setAttribute('inert', '');
      });
    }
  }

  /**
   * Non-blocking controls legend shown in the lobby BEFORE the canvas is
   * uncovered, so keyboard players know the aim/power/fire keys up front
   * (P3-13b). Mirrors the in-game on-canvas legend; purely informational, so it
   * never gates the start flow.
   */
  private renderControlsLegend(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'lobby-controls';
    el.innerHTML =
      '<span class="lobby-controls__title">Controls</span>' +
      '<span><kbd>&larr;</kbd>/<kbd>&rarr;</kbd> Aim</span>' +
      '<span><kbd>&uarr;</kbd>/<kbd>&darr;</kbd> Power</span>' +
      '<span><kbd>Q</kbd> Weapon</span>' +
      '<span><kbd>Space</kbd>/<kbd>Enter</kbd> Fire</span>';
    return el;
  }

  private previewRoster(): PreviewVehicle[] {
    if (this.activeTab === 'hotseat') {
      return this.players.map((player, index) => ({
        owner: `player-${index + 1}`,
        name: player.name || `Player ${index + 1}`,
        color: player.color,
        loadout: normalizeTankLoadout(player.loadout),
      }));
    }

    if (this.onlineSubView === 'waiting' && this.waitingPlayers.length > 0) {
      return this.waitingPlayers.map((player) => ({
        owner: player.id === this.waitingPlayerId
          ? 'online-player'
          : `network-${player.id}`,
        name: player.name || 'Player',
        color: player.color,
        loadout: normalizeTankLoadout(player.loadout),
      }));
    }

    return [{
      owner: 'online-player',
      name: this.onlineName || 'You',
      color: this.onlineSubView === 'create' ? this.onlineColor : this.joinColor,
      loadout: normalizeTankLoadout(this.onlineLoadout),
    }];
  }

  private spotlightVehicle(
    roster: readonly PreviewVehicle[],
  ): PreviewVehicle | undefined {
    if (this.spotlightOwner !== null) {
      const selected = roster.find((vehicle) => vehicle.owner === this.spotlightOwner);
      if (selected) return selected;
    }
    if (this.activeTab === 'online' && this.onlineSubView === 'waiting') {
      const local = roster.find((vehicle) => vehicle.owner === 'online-player');
      if (local) return local;
    }
    return roster[0];
  }

  /** Update preview identity only, preserving focus in the editing input. */
  private syncPreviewName(owner: string, name: string): void {
    const nextName = name.trim() || (owner.startsWith('player-')
      ? `Player ${owner.slice('player-'.length)}`
      : 'You');
    for (const vehicle of this.root.querySelectorAll<HTMLElement>('[data-preview-owner]')) {
      if (vehicle.dataset.previewOwner !== owner) continue;
      const label = vehicle.querySelector<HTMLElement>(
        vehicle.classList.contains('lobby-preview__spotlight')
          ? '.lobby-preview__spotlight-name'
          : '.lobby-preview__name',
      );
      if (label) label.textContent = nextName;
      if (vehicle.classList.contains('lobby-preview__spotlight')) {
        vehicle.setAttribute('aria-label', `${nextName} vehicle spotlight`);
      }
    }
  }

  /** Rebuild only the pointer-transparent bay, never the focused form. */
  private refreshVehiclePreview(): void {
    this.root.querySelector('.lobby-preview')?.replaceWith(this.renderVehiclePreview());
  }

  /** Select an editor without repainting an already-correct assembled tank. */
  private activatePreviewOwner(owner: string): void {
    const currentOwner = this.spotlightVehicle(this.previewRoster())?.owner;
    this.spotlightOwner = owner;
    if (currentOwner !== owner) this.refreshVehiclePreview();
  }

  /** Live Garage bay: one selected build at inspection scale plus roster context. */
  private renderVehiclePreview(): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'lobby-preview';

    const label = document.createElement('div');
    label.className = 'lobby-preview__label';
    label.textContent = 'Vehicle Bay';

    const roster = this.previewRoster();
    const featured = this.spotlightVehicle(roster);
    const spotlight = document.createElement('section');
    spotlight.className = 'lobby-preview__spotlight';
    if (featured) {
      spotlight.dataset.owner = featured.owner;
      spotlight.dataset.previewOwner = featured.owner;
      spotlight.style.setProperty('--tank-color', featured.color);
      spotlight.setAttribute('aria-label', `${featured.name.trim() || 'Player'} vehicle spotlight`);

      const identity = document.createElement('div');
      identity.className = 'lobby-preview__spotlight-identity';
      const name = document.createElement('span');
      name.className = 'lobby-preview__spotlight-name';
      name.textContent = featured.name.trim() || 'Player';
      identity.append(name);

      const canvas = document.createElement('canvas');
      canvas.className = 'lobby-preview__spotlight-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      paintTankLoadoutPreview(canvas, featured.color, featured.loadout, 'spotlight');

      const parts = document.createElement('div');
      parts.className = 'lobby-preview__parts';
      parts.setAttribute('role', 'list');
      parts.setAttribute('aria-label', 'Selected tank parts');
      for (const slot of TANK_PART_SLOTS) {
        const part = document.createElement('div');
        part.className = 'lobby-preview__part';
        part.dataset.slot = slot;
        part.setAttribute('role', 'listitem');
        const role = document.createElement('span');
        role.textContent = TANK_SLOT_LABELS[slot];
        const variant = document.createElement('strong');
        variant.textContent = TANK_PART_VARIANT_LABELS[slot][featured.loadout[slot]];
        part.append(role, variant);
        parts.append(part);
      }
      spotlight.append(identity, canvas, parts);
    }

    const convoy = document.createElement('div');
    convoy.className = 'lobby-preview__convoy';
    roster.slice(0, MAX_PLAYERS).forEach((player, index) => {
      convoy.append(this.renderPreviewTank(
        player.owner,
        player.name || `Player ${index + 1}`,
        player.color,
        index,
        player.loadout,
      ));
    });

    preview.append(label, spotlight, convoy);
    return preview;
  }

  private renderPreviewTank(
    owner: string,
    name: string,
    color: string,
    index: number,
    loadout: TankLoadout,
  ): HTMLElement {
    const tank = document.createElement('div');
    tank.className = 'lobby-preview__tank';
    tank.dataset.owner = owner;
    tank.dataset.previewOwner = owner;
    tank.style.setProperty('--tank-color', color);
    tank.style.setProperty('--slot', String(index));

    const canvas = document.createElement('canvas');
    canvas.className = 'lobby-preview__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    paintTankLoadoutPreview(canvas, color, loadout);
    const label = document.createElement('div');
    label.className = 'lobby-preview__name';
    label.textContent = name.trim() || `Player ${index + 1}`;

    tank.append(canvas, label);
    return tank;
  }

  /** Compact preset shortcut plus independent four-slot selectors. */
  private renderGarage(
    owner: string,
    ownerLabel: string,
    value: TankLoadout,
    onChange: (next: TankLoadout) => void,
  ): HTMLElement {
    return buildLobbyGarageView({
      owner,
      ownerLabel,
      value,
      editing: this.openGarageOwner === owner,
      isEditing: () => this.openGarageOwner === owner,
      listenerSignal: this.renderListeners.signal,
      onChange,
      onOpen: (nextOwner) => this.openGarage(nextOwner),
      onClose: (nextOwner) => this.closeGarage(nextOwner),
      onSpotlight: (nextOwner) => { this.spotlightOwner = nextOwner; },
      onFocus: (nextOwner, selector) => this.focusGarageControl(nextOwner, selector),
    });
  }

  private garageFor(owner: string): HTMLElement | undefined {
    return Array.from(this.root.querySelectorAll<HTMLElement>('.lobby-garage'))
      .find((garage) => garage.dataset.owner === owner);
  }

  private focusGarageControl(owner: string, selector: string): void {
    this.garageFor(owner)
      ?.querySelector<HTMLButtonElement>(selector)
      ?.focus();
  }

  private openGarage(owner: string): void {
    this.openGarageOwner = owner;
    this.render();
    this.focusGarageControl(owner, '[data-preset]');
  }

  private closeGarage(owner: string): void {
    this.openGarageOwner = null;
    this.render();
    this.garageFor(owner)
      ?.querySelector<HTMLButtonElement>('.lobby-garage__open')
      ?.focus();
  }

  /**
   * T-10 (rejoin-after-refresh, AC-06) — activate the validated rejoin
   * candidate. Builds a network `LobbyConfig` from the validated room +
   * the stored descriptor's playerId and hands it to `onReady`, mirroring the
   * shape `emitNetworkReady` (below) and `rematchToConfig` (main.ts) produce.
   * `main.ts`'s `startGame` → `createClient` owns constructing the actual
   * `NetworkClient` and running its chunked-replay `initialize()`; this method
   * never touches NetworkClient directly.
   *
   * T-11 (AC-07) — re-validates before committing: the room can go
   * finished/deleted, or the stored seat can drop out of `players`, in the
   * window between the banner rendering and this click. If the re-fetch shows
   * the session is no longer live, this does NOT throw and does NOT call
   * `onReady`: it clears the stored descriptor, surfaces a short message via
   * the lobby's existing `onlineError` notice field, drops the candidate, and
   * re-renders back to the normal (no-affordance) lobby.
   */
  private async handleRejoin(): Promise<void> {
    await this.roomController.rejoin();
  }

  // ---- Hot Seat tab ----

  private startQuickDuel(operationId: unknown = 'standard'): void {
    const seed = this.generateQuickDuelSeed();
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) return;
    if (new URL(window.location.href).searchParams.get('e2e') === 'quick-duel-seed') {
      const target = window as typeof window & {
        __singedTerraE2E?: { quickDuelSeed?: number };
      };
      target.__singedTerraE2E = Object.freeze({ quickDuelSeed: seed });
    }
    const human = this.players[0] ?? defaultRow(0);
    const humanPlayer = {
      name: human.name.trim() || 'Player 1',
      color: human.color,
      loadout: normalizeTankLoadout(human.loadout),
    };
    const cpuColor = (PALETTE.find((color) => color.value !== humanPlayer.color) ?? PALETTE[0]).value;
    const cpuPlayer = {
      name: 'CPU 1',
      color: cpuColor,
      ai: 'medium' as const,
      loadout: normalizeTankLoadout(seatPresetLoadout(1)),
    };
    const operation = quickOperationById(operationId);
    const composedOptions = quickOperationOptions(operation.id, {
      maxPlayers: 2,
      players: [humanPlayer, cpuPlayer],
      seed,
      rounds: 3,
    });
    // Roster ownership remains on LobbyConfig.players. The catalog helper proves
    // a complete GameEngine projection, then this existing settings channel carries
    // only the optional engine knobs it has always owned.
    const { maxPlayers: _maxPlayers, players: _players, ...settings } = composedOptions;
    this.onReady({
      mode: 'hotseat',
      players: [humanPlayer, cpuPlayer],
      playerNames: [humanPlayer.name, cpuPlayer.name],
      settings,
      quickOperation: {
        id: operation.id,
        title: operation.title,
        briefing: operation.briefing,
      },
    });
  }

  private emitVerifiedDeployment(): boolean {
    const current = this.verifiedSession.verifiedDeployment;
    if (current.status !== 'active' && current.status !== 'retryable') return false;
    const { descriptor, transcript, fieldOrder } = current;
    const options = descriptor.config.options;
    const players: LobbyPlayer[] = options.players.map((player) => ({
      name: player.name,
      color: player.color,
      ...('ai' in player ? { ai: player.ai } : {}),
    }));
    this.onReady({
      mode: 'hotseat',
      players,
      playerNames: players.map((player) => player.name),
      settings: {
        seed: descriptor.config.seed,
        maxWind: options.maxWind,
        gravity: options.gravity,
        walls: options.walls,
        hazards: options.hazards,
        rounds: options.rounds,
        interestRate: options.interestRate,
        suddenDeathTurn: options.suddenDeathTurn,
        armsLevel: options.armsLevel,
        teamMode: options.teamMode,
        rulesetVersion: descriptor.rulesetVersion,
      },
      verifiedDeployment: { descriptor, transcript, fieldOrder },
    });
    return true;
  }

  private async launchVerifiedDeployment(): Promise<void> {
    if (this.verifiedLaunchBusy) return;
    if (this.emitVerifiedDeployment()) return;
    this.verifiedLaunchBusy = true;
    this.verifiedAbandonIntent = false;
    this.render();
    const started = await this.startVerifiedDeployment();
    this.verifiedLaunchBusy = false;
    if (!started || !this.emitVerifiedDeployment()) this.render();
  }

  private verifiedHotSeatView() {
    const account = this.accountSession.state;
    if (account.status !== 'authenticated') return null;
    const current = this.verifiedSession.verifiedDeployment;
    const resumable = current.status === 'active'
      || current.status === 'completion-pending'
      || current.status === 'retryable'
      || current.status === 'expired'
      || current.status === 'frozen';
    const transcript = resumable ? current.transcript : Object.freeze([] as VerifiedHumanFire[]);
    const message = current.status === 'failed'
      ? current.error
      : current.status === 'retryable'
        ? 'Recovered terminal evidence. Resume to retry verification.'
        : resumable
          ? `Recovered ${transcript.length} of 6 human salvos.`
          : null;
    const stateBusy = current.status === 'completion-pending'
      || current.status === 'expired'
      || current.status === 'frozen';
    const fieldOrder = resumable
      ? current.fieldOrder
      : createFieldOrder(account.profile.summary?.verifiedProgression);
    return {
      action: resumable ? 'resume' as const : 'start' as const,
      commanderName: account.profile.displayName,
      busy: account.busy || this.verifiedLaunchBusy || stateBusy,
      message,
      abandonIntent: this.verifiedAbandonIntent,
      fieldOrder,
      onLaunch: () => { void this.launchVerifiedDeployment(); },
      onRequestAbandon: () => {
        if (account.busy || this.verifiedLaunchBusy || stateBusy) return;
        this.verifiedAbandonIntent = true;
        this.render();
      },
      onConfirmAbandon: () => {
        if (this.verifiedLaunchBusy) return;
        this.verifiedLaunchBusy = true;
        this.render();
        void this.abandonVerifiedDeployment().then(() => {
          this.verifiedLaunchBusy = false;
          this.verifiedAbandonIntent = false;
          this.render();
        });
      },
      onCancelAbandon: () => {
        this.verifiedAbandonIntent = false;
        this.render();
      },
    };
  }

  private renderHotSeatTab(): HTMLElement {
    const verifiedDeployment = this.verifiedHotSeatView();
    return buildLobbyHotSeatView({
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      playerCount: this.players.length,
      playerRows: this.players.map((_, index) => this.renderRow(index)),
      advanced: this.renderAdvanced(),
      customizationOpen: this.hotSeatCustomizationOpen,
      validationMessage: this.validationError(),
      verifiedDeployment,
      ...(verifiedDeployment === null ? {} : {
        quickOperations: QUICK_OPERATIONS,
        onQuickOperation: (operationId: string) => { this.startQuickDuel(operationId); },
      }),
      onPlayerCountChange: (count) => { this.setPlayerCount(count); },
      onCustomizationToggle: (open) => { this.hotSeatCustomizationOpen = open; },
      onStart: () => {
        if (this.validationError() !== null) return;
        const players = this.players.map((player, index) => ({
          name: player.name.trim() || (player.ai ? `CPU ${index + 1}` : `Player ${index + 1}`),
          color: player.color,
          loadout: normalizeTankLoadout(player.loadout),
          ...(player.ai ? { ai: player.ai } : {}),
        }));
        const settings = this.parseSettings();
        this.onReady({
          mode: 'hotseat',
          players,
          playerNames: players.map((player) => player.name),
          ...(settings ? { settings } : {}),
        });
      },
      listenerSignal: this.renderListeners.signal,
    });
  }

  // ---- Create Room sub-view ----

  private renderCreateForm(): HTMLElement {
    return buildLobbyCreateView({
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      playerCount: this.onlineMaxPlayers,
      botCount: this.onlineBots,
      botDifficulty: this.onlineBotDifficulty,
      visibility: this.onlineVisibility,
      busy: this.onlineBusy,
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.onlineColor,
        (value) => { this.setOnlineName(value); },
        (value) => { this.onlineColor = value; this.render(); },
        [],
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
      ),
      advanced: this.renderAdvanced(),
      status: this.renderOnlineStatus(),
      onPlayerCountChange: (count) => {
        this.onlineMaxPlayers = count;
        if (this.onlineBots > count - 1) this.onlineBots = count - 1;
        this.render();
      },
      onBotCountChange: (count) => { this.onlineBots = count; this.render(); },
      onBotDifficultyChange: (difficulty) => { this.onlineBotDifficulty = difficulty; },
      onVisibilityChange: (visibility) => { this.onlineVisibility = visibility; },
      onCreate: () => { void this.handleCreateRoom(); },
      onJoin: () => {
        this.onlineSubView = 'join';
        this.onlineError = '';
        this.render();
      },
      onBrowse: () => { this.enterBrowse(); },
      listenerSignal: this.renderListeners.signal,
    });
  }

  private renderOnlineAdvancedFields(): HTMLElement {
    const fields = document.createElement('div');
    fields.className = 'lobby-advanced-fields';
    fields.append(
      this.onlineNumberField('Wind cap', this.onlineMaxWind, (value) => { this.onlineMaxWind = value; }, {
        min: WIND_MIN, max: WIND_MAX, step: 1, placeholder: String(WIND_DEFAULT),
        hint: `${WIND_MIN}–${WIND_MAX}`,
      }),
      this.onlineNumberField('Gravity', this.onlineGravity, (value) => { this.onlineGravity = value; }, {
        min: GRAVITY_MIN, max: GRAVITY_MAX, step: GRAVITY_STEP, placeholder: String(GRAVITY_DEFAULT),
        hint: `${GRAVITY_MIN}–${GRAVITY_MAX}`,
      }),
      this.onlineChoiceField('Side walls', this.onlineWalls, (value) => { this.onlineWalls = value; }, [
        { value: '', label: 'Open — shots exit' },
        { value: 'reflective', label: 'Reflective — bank shots' },
        { value: 'wrap', label: 'Wrap — cross the arena' },
        { value: 'concrete', label: 'Concrete — impact at edge' },
      ], 'shots exit, rebound, or cross through paired arena edges'),
      this.onlineChoiceField('Battlefield', this.onlineBattlefieldWorld, (value) => { this.onlineBattlefieldWorld = value; }, [
        { value: '', label: 'Automatic — terrain decides' },
        { value: 'ember-dusk', label: 'Ember Dusk — post-apocalypse' },
        { value: 'obsidian-caldera', label: 'Obsidian Caldera — volcanic night' },
        { value: 'glassstorm-expanse', label: 'Glassstorm Expanse — ice' },
      ], 'visual world only; terrain and physics stay unchanged'),
      this.onlineChoiceField('Terrain hazards', this.onlineHazards, (value) => { this.onlineHazards = value; }, [
        { value: '', label: 'None — classic terrain' },
        { value: 'lava', label: 'Lava — lethal pools' },
      ], 'deterministic lava pools are solid to shells but lethal to tanks'),
      this.onlineChoiceField('Teams', this.onlineTeamMode ? '2v2' : '', (value) => { this.onlineTeamMode = value === '2v2'; }, [
        { value: '', label: 'Free-for-all' },
        { value: '2v2', label: '2v2 — alternating seats' },
      ], 'four seats only; teammates cannot damage each other'),
      this.onlineNumberField('Rounds', this.onlineRounds, (value) => { this.onlineRounds = value; }, {
        min: ROUNDS_MIN, max: ROUNDS_MAX, step: 2, placeholder: String(ROUNDS_DEFAULT), hint: 'best-of-N, odd',
      }),
      this.onlineNumberField('Interest', this.onlineInterestRate, (value) => { this.onlineInterestRate = value; }, {
        min: INTEREST_MIN, max: INTEREST_MAX, step: INTEREST_STEP, placeholder: String(INTEREST_DEFAULT), hint: 'per-round credit interest (0–0.5)',
      }),
      this.onlineNumberField('Sudden death', this.onlineSuddenDeath, (value) => { this.onlineSuddenDeath = value; }, {
        min: SUDDEN_DEATH_MIN, max: SUDDEN_DEATH_MAX, step: 1, placeholder: String(SUDDEN_DEATH_DEFAULT), hint: 'gravity ramps past this turn (0 = off)',
      }),
      this.onlineNumberField('Arms level', this.onlineArmsLevel, (value) => { this.onlineArmsLevel = value; }, {
        min: ARMS_MIN, max: ARMS_MAX, step: 1, placeholder: String(ARMS_DEFAULT), hint: '0 = basic … 4 = full arsenal',
      }),
    );
    return fields;
  }

  private async handleCreateRoom(): Promise<void> {
    const name = this.onlineName.trim();
    if (!name) {
      this.onlineError = 'Enter your name.';
      this.render();
      return;
    }
    if (name.length > 20) {
      this.onlineError = 'Name must be 20 characters or fewer.';
      this.render();
      return;
    }
    const rounds = this.parseOnlineRounds();
    const economy = this.parseOnlineEconomy();
    const used = new Set<string>([this.onlineColor]);
    const bots: Array<{ name: string; color: string; ai: AiDifficulty; loadout: TankLoadout }> = [];
    for (let i = 0; i < this.onlineBots; i++) {
      const color = PALETTE.find((candidate) => !used.has(candidate.value));
      if (!color) break;
      used.add(color.value);
      bots.push({
        name: `CPU ${i + 1}`,
        color: color.value,
        ai: this.onlineBotDifficulty,
        loadout: presetLoadout(TANK_KIT_IDS[(i + 1) % TANK_KIT_IDS.length]!),
      });
    }
    await this.roomController.create({
      playerName: name,
      color: this.onlineColor,
      loadout: normalizeTankLoadout(this.onlineLoadout),
      bots,
      maxPlayers: this.onlineMaxPlayers,
      visibility: this.onlineVisibility,
      maxWind: this.onlineMaxWind,
      gravity: this.onlineGravity,
      walls: this.onlineWalls,
      battlefieldWorld: this.onlineBattlefieldWorld,
      hazards: this.onlineHazards,
      rounds: this.onlineRounds,
      interestRate: this.onlineInterestRate,
      suddenDeath: this.onlineSuddenDeath,
      armsLevel: this.onlineArmsLevel,
      teamMode: this.onlineTeamMode,
    }, () => normalizeCreateRoomFallback({ name, rounds, economy }, {
      seed: this.waitingSeed,
      maxPlayers: this.onlineMaxPlayers,
      maxWind: this.onlineMaxWind,
      gravity: this.onlineGravity,
      walls: this.onlineWalls,
      battlefieldWorld: this.onlineBattlefieldWorld,
      hazards: this.onlineHazards,
      teamMode: this.onlineTeamMode,
      color: this.onlineColor,
      loadout: this.onlineLoadout,
    }));
  }
  // ---- Join Room sub-view ----

  private renderJoinForm(): HTMLElement {
    return buildLobbyJoinView({
      code: this.joinCode,
      busy: this.onlineBusy,
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.joinColor,
        (value) => { this.setOnlineName(value); },
        (value) => { this.joinColor = value; this.render(); },
        [],
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
      ),
      status: this.renderOnlineStatus(),
      onCodeInput: (value) => {
        this.joinCode = normalizeRoomCode(value);
        return this.joinCode;
      },
      onJoin: () => { void this.handleJoinRoom(); },
      onCreate: () => {
        this.onlineSubView = 'create';
        this.onlineError = '';
        this.render();
      },
      onBrowse: () => { this.enterBrowse(); },
      listenerSignal: this.renderListeners.signal,
    });
  }

  private async handleJoinRoom(): Promise<void> {
    const code = this.joinCode.trim().toUpperCase();
    if (!isValidRoomCode(code)) {
      this.onlineError = 'Enter a 4-character room code.';
      this.render();
      return;
    }
    await this.joinByCode(code);
  }

  /**
   * Shared join flow used by both the Join form and the Browse list. Reads
   * this.onlineName / this.joinColor (callers set these before invoking), POSTs
   * join_room with the given code, and transitions to the waiting room on
   * success. Stops the browse poll on a successful join.
   */
  private async joinByCode(code: string): Promise<void> {
    const name = this.onlineName.trim();
    if (!name) {
      this.onlineError = 'Enter your name.';
      this.render();
      return;
    }
    if (name.length > 20) {
      this.onlineError = 'Name must be 20 characters or fewer.';
      this.render();
      return;
    }
    await this.roomController.join({
      code,
      playerName: name,
      color: this.joinColor,
      loadout: normalizeTankLoadout(this.onlineLoadout),
    }, code, {
      maxPlayers: 2,
      maxWind: 10,
      gravity: 0.15,
      walls: 'open',
      rulesetVersion: CURRENT_NETWORK_RULESET_VERSION,
    });
  }
  // ---- Browse (public rooms) sub-view ----

  /** Switch to the browse view and start polling list_rooms. */
  private enterBrowse(): void {
    this.onlineSubView = 'browse';
    this.onlineError = '';
    this.browseRooms = [];
    this.render();
    void this.fetchRooms();
    this.startBrowsePoll();
  }

  /** Begin (or restart) the 3s list_rooms poll. */
  private startBrowsePoll(): void {
    this.session.startBrowsePoll(() => { void this.fetchRooms(); });
  }

  /** Stop the list_rooms poll if running. */
  private stopBrowsePoll(): void {
    this.session.stopBrowsePoll();
  }

  /** Leave the browse view back to a given sub-view, stopping the poll. */
  private leaveBrowse(to: OnlineSubView): void {
    this.stopBrowsePoll();
    this.onlineSubView = to;
    this.onlineError = '';
    this.render();
  }

  private async fetchRooms(): Promise<void> {
    try {
      const { ok, data } = await this.transport.listRooms();

      // Only repaint if still on the browse view (the user may have navigated
      // away between the request and its response).
      if (this.onlineSubView !== 'browse') return;

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to load rooms.';
        this.render();
        return;
      }

      this.browseRooms = data?.rooms ?? [];
      this.onlineError = '';
      this.render();
    } catch (err) {
      console.error('Lobby.fetchRooms: network error —', err);
      if (this.onlineSubView !== 'browse') return;
      this.onlineError = 'Network error. Try again.';
      this.render();
    }
  }

  private renderBrowse(): HTMLElement {
    return buildLobbyBrowseView({
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.joinColor,
        (value) => { this.setOnlineName(value); },
        (value) => { this.joinColor = value; this.render(); },
        [],
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
      ),
      status: this.renderOnlineStatus(),
      rooms: this.browseRooms,
      busy: this.onlineBusy,
      onJoin: (code) => { void this.joinByCode(code); },
      onCreate: () => { this.leaveBrowse('create'); },
      onJoinByCode: () => { this.leaveBrowse('join'); },
      listenerSignal: this.renderListeners.signal,
    });
  }

  // ---- Waiting Room sub-view ----

  private renderWaitingRoom(): HTMLElement {
    const colorClash = this.myColorClashes();
    const nameClash = this.myNameClashes();
    return buildLobbyWaitingView({
      roomCode: this.waitingRoomCode,
      players: this.waitingPlayers,
      maxPlayers: this.waitingOptions.maxPlayers,
      busy: this.onlineBusy,
      thisPlayerReady: this.waitingThisPlayerReady,
      clashColors: this.duplicateColors(),
      clashNames: this.duplicateNames(),
      colorClash,
      nameClash,
      selfEdit: this.renderWaitingSelfEdit(),
      status: this.renderOnlineStatus(),
      onCopyInvite: (button, status) => {
        void this.copyWaitingRoomInvite(button, status);
      },
      onReady: () => { void this.handleReadyUp(); },
      onLeave: () => { void this.handleLeaveRoom(); },
      listenerSignal: this.renderListeners.signal,
    });
  }

  /** Copy a public-code-only room invite and report the result without a modal. */
  private async copyWaitingRoomInvite(
    button: HTMLButtonElement,
    status: HTMLElement,
  ): Promise<void> {
    const inviteUrl = buildRoomInviteUrl(window.location.href, this.waitingRoomCode);
    try {
      if (!inviteUrl || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(inviteUrl);
      button.textContent = 'Copy invite link';
      status.classList.remove('error');
      status.setAttribute('role', 'status');
      status.textContent = 'Invite copied';
    } catch {
      button.textContent = 'Copy invite link';
      status.classList.add('error');
      status.setAttribute('role', 'alert');
      status.textContent =
        `Could not copy invite link. Share code ${this.waitingRoomCode} instead.`;
    }
  }

  private async subscribeWaitingRoom(): Promise<void> {
    return this.session.subscribeWaitingRoom();
  }

  private startHeartbeat(): void {
    this.session.startHeartbeat();
  }

  private stopHeartbeat(): void {
    this.session.stopHeartbeat();
  }

  private emitNetworkReady(room: { players: NetworkPlayer[]; seed: number; options: RoomOptions }): void {
    if (normalizeNetworkRulesetVersion(room.options.rulesetVersion) !== CURRENT_NETWORK_RULESET_VERSION) {
      this.onlineError = 'This room uses an older game build and cannot start here.';
      this.onlineBusy = false;
      this.render();
      return;
    }
    const config = projectAuthoritativeNetworkMode({
      ...room,
      roomId: this.waitingRoomId,
      code: this.waitingRoomCode,
      options: { ...room.options, rulesetVersion: normalizeNetworkRulesetVersion(room.options.rulesetVersion) },
    }, { playerId: this.waitingPlayerId, token: this.waitingToken });
    this.onReady(config);
  }

  private async handleReadyUp(): Promise<void> {
    // Defense in depth: never let a clashing player ready up, even if the button
    // somehow fires. The UI already disables the button in this case.
    if (this.myColorClashes() || this.myNameClashes()) {
      this.onlineError =
        'Another player already has your name or color. Change it above to start.';
      this.render();
      return;
    }
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const result = await this.session.readyUp();
      if ('stale' in result) return;
      const { ok, data } = result;

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to ready up.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      this.onlineBusy = false;

      if (data?.started) {
        // LobbySession emits the synchronized ready event for this direct start.
        return;
      }

      this.render();
    } catch (err) {
      console.error('Lobby.readyUp: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.onlineBusy = false;
      this.render();
    }
  }

  /** Colors held by more than one player currently in the waiting room. */
  private duplicateColors(): Set<string> {
    const counts = new Map<string, number>();
    for (const p of this.waitingPlayers) {
      counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [color, n] of counts) if (n > 1) dupes.add(color);
    return dupes;
  }

  /** Names (trimmed, case-insensitive) held by more than one player — mirrors
   *  duplicateColors so a name clash carries a cue visible to ALL players (P2-11),
   *  not just the clashing client's own warning. */
  private duplicateNames(): Set<string> {
    const counts = new Map<string, number>();
    for (const p of this.waitingPlayers) {
      const key = p.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [name, n] of counts) if (n > 1) dupes.add(name);
    return dupes;
  }

  /** Whether THIS client's player shares its color with another player. */
  private myColorClashes(): boolean {
    const me = this.waitingPlayers.find((p) => p.id === this.waitingPlayerId);
    if (!me) return false;
    return this.waitingPlayers.some(
      (p) => p.id !== this.waitingPlayerId && p.color === me.color,
    );
  }

  /**
   * Whether THIS client's player shares its name (trimmed, case-insensitive)
   * with another player — mirrors myColorClashes for the name-uniqueness rule.
   */
  private myNameClashes(): boolean {
    const me = this.waitingPlayers.find((p) => p.id === this.waitingPlayerId);
    if (!me) return false;
    const mine = me.name.trim().toLowerCase();
    return this.waitingPlayers.some(
      (p) => p.id !== this.waitingPlayerId && p.name.trim().toLowerCase() === mine,
    );
  }

  /**
   * Render the self-edit controls in the waiting room: color swatches (others'
   * colors disabled) and an inline rename input. Each commits via update_player.
   */
  private renderWaitingSelfEdit(): HTMLElement {
    const wrapper = document.createElement('div');
    const me = this.waitingPlayers.find((p) => p.id === this.waitingPlayerId);
    if (!me) return wrapper;

    const heading = document.createElement('p');
    heading.style.cssText = 'color:var(--text-dim);font-size:13px;margin:8px 0 6px;';
    heading.textContent = 'Your name & color:';
    wrapper.append(heading);

    // Inline rename: text input + Apply (also commits on Enter / blur).
    const nameField = document.createElement('div');
    nameField.className = 'lobby-field';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'lobby-name';
    nameInput.maxLength = 20;
    nameInput.value = me.name;
    nameInput.placeholder = 'Name';
    nameInput.addEventListener('input', () => {
      this.activatePreviewOwner('online-player');
      this.syncPreviewName('online-player', nameInput.value);
    }, { signal: this.renderListeners.signal });
    const commitName = (): void => {
      const next = nameInput.value.trim();
      if (!next || next === me.name.trim()) return;
      void this.updateMe({ name: next });
    };
    nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); commitName(); }
    }, { signal: this.renderListeners.signal });
    nameInput.addEventListener('blur', () => { commitName(); }, { signal: this.renderListeners.signal });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'lobby-btn';
    applyBtn.style.cssText = 'padding:6px 12px;font-size:13px;';
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = this.onlineBusy;
    applyBtn.addEventListener('click', () => { commitName(); }, { signal: this.renderListeners.signal });

    nameField.append(nameInput, applyBtn);
    wrapper.append(nameField);

    // Color swatches: colors held by OTHER players are shown taken/disabled.
    const otherColors = this.waitingPlayers
      .filter((p) => p.id !== this.waitingPlayerId)
      .map((p) => p.color);
    const swatches = document.createElement('div');
    swatches.className = 'lobby-swatches';
    for (const color of PALETTE) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'lobby-swatch';
      swatch.style.background = color.value;
      swatch.title = color.name;
      const taken = otherColors.includes(color.value);
      if (me.color === color.value) swatch.classList.add('selected');
      if (taken) swatch.classList.add('taken');
      swatch.addEventListener('click', () => {
        if (taken || this.onlineBusy || color.value === me.color) return;
        this.spotlightOwner = 'online-player';
        void this.updateMe({ color: color.value });
      }, { signal: this.renderListeners.signal });
      swatches.append(swatch);
    }
    wrapper.append(swatches);
    wrapper.append(this.renderGarage(
      'online-player',
      'Your',
      normalizeTankLoadout(me.loadout),
      (loadout) => {
        if (this.onlineBusy) return;
        void this.updateMe({ loadout });
      },
    ));

    return wrapper;
  }

  /**
   * POST update_player to change this player's name and/or color in place. On
   * 409 (taken) surface the server error and re-render WITHOUT mutating local
   * state. On success, adopt the returned players list for immediacy (Realtime
   * will also broadcast the same change to everyone).
   */
  private async updateMe(fields: {
    name?: string;
    color?: string;
    loadout?: TankLoadout;
  }): Promise<void> {
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const result = await this.session.updatePlayer(fields);
      if ('stale' in result) return;
      const { ok, data } = result;

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to update.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      this.onlineBusy = false;
      this.render();
    } catch (err) {
      console.error('Lobby.updatePlayer: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.onlineBusy = false;
      this.render();
    }
  }

  /**
   * Leave the waiting room: best-effort POST leave_room (proceed even on
   * error), then tear down the Realtime subscription and return to the create
   * view.
   */
  private async handleLeaveRoom(): Promise<void> {
    await this.roomController.leave();
  }
  private cleanupWaitingChannel(): void {
    this.session.cleanupWaitingChannel();
  }

  // ---- Shared online helpers ----

  private renderOnlineStatus(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'online-status' + (this.onlineError ? ' error' : '');
    el.textContent = this.onlineError || '';
    return el;
  }

  /**
   * Render a name input + inline color swatches row for the online forms.
   * takenColors can be used to mark swatches already taken by other players
   * (for the waiting room display), but in create/join forms it's empty.
   */
  private renderOnlineNameColor(
    nameValue: string,
    colorValue: string,
    onName: (v: string) => void,
    onColor: (v: string) => void,
    takenColors: string[],
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const label = document.createElement('label');
    label.textContent = 'Your name';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'lobby-name';
    nameInput.maxLength = 20;
    nameInput.value = nameValue;
    nameInput.placeholder = 'Name';
    nameInput.addEventListener('input', () => {
      onName(nameInput.value);
      this.activatePreviewOwner('online-player');
      this.syncPreviewName('online-player', nameInput.value);
    }, { signal: this.renderListeners.signal });

    const swatches = document.createElement('div');
    swatches.className = 'lobby-swatches';
    for (const color of PALETTE) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'lobby-swatch';
      swatch.style.background = color.value;
      swatch.title = color.name;
      const taken = takenColors.includes(color.value);
      if (colorValue === color.value) swatch.classList.add('selected');
      if (taken) swatch.classList.add('taken');
      swatch.addEventListener('click', () => {
        if (taken) return;
        this.spotlightOwner = 'online-player';
        onColor(color.value);
      }, { signal: this.renderListeners.signal });
      swatches.append(swatch);
    }

    field.append(label, nameInput, swatches);
    return field;
  }

  private onlineNumberField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { min?: number; max?: number; step?: number; placeholder: string; hint: string },
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const lab = document.createElement('label');
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    if (opts.step !== undefined) input.step = String(opts.step);
    input.placeholder = opts.placeholder;
    input.value = value;
    input.addEventListener('input', () => { onChange(input.value); }, { signal: this.renderListeners.signal });

    const hint = document.createElement('span');
    hint.className = 'lobby-hint';
    hint.textContent = opts.hint;

    field.append(lab, input, hint);
    return field;
  }

  // ---- Hot seat helpers (unchanged) ----

  /** Render one player's row (name input + color swatches). */
  private renderRow(index: number): HTMLElement {
    const player = this.players[index];
    if (player === undefined) throw new RangeError(`Missing lobby player at index ${index}`);
    const row = document.createElement('div');
    row.className = 'lobby-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'lobby-name';
    name.value = player.name;
    // Match online-room validators so hot-seat and networked player identity
    // share one visible contract.
    name.maxLength = 20;
    name.placeholder = `Player ${index + 1}`;
    name.addEventListener('input', () => {
      player.name = name.value;
      const owner = `player-${index + 1}`;
      this.activatePreviewOwner(owner);
      this.syncPreviewName(owner, name.value);
      this.refreshStartState();
    }, { signal: this.renderListeners.signal });

    const swatches = document.createElement('div');
    swatches.className = 'lobby-swatches';
    for (const color of PALETTE) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'lobby-swatch';
      swatch.style.background = color.value;
      swatch.title = color.name;
      const takenByOther = this.players.some(
        (p, i) => i !== index && p.color === color.value,
      );
      if (player.color === color.value) swatch.classList.add('selected');
      if (takenByOther) swatch.classList.add('taken');
      swatch.addEventListener('click', () => {
        if (takenByOther) return;
        this.spotlightOwner = `player-${index + 1}`;
        player.color = color.value;
        this.render();
      }, { signal: this.renderListeners.signal });
      swatches.append(swatch);
    }

    // Control selector: Human or a CPU difficulty. A CPU seat ignores its name
    // input visually (kept for color/label) and is driven by the AI at runtime.
    const control = document.createElement('select');
    control.className = 'lobby-control';
    control.title = 'Who controls this tank';
    const OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
      { value: 'human', label: '👤 Human' },
      { value: 'easy', label: '🤖 CPU · Easy' },
      { value: 'medium', label: '🤖 CPU · Medium' },
      { value: 'hard', label: '🤖 CPU · Hard' },
    ];
    for (const o of OPTIONS) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if ((player.ai ?? 'human') === o.value) opt.selected = true;
      control.append(opt);
    }
    control.addEventListener('change', () => {
      const v = control.value;
      player.ai = v === 'human' ? undefined : (v as AiDifficulty);
      // Default a friendly CPU name if the seat is still on its placeholder.
      if (player.ai && !player.name.trim()) {
        player.name = `CPU ${index + 1}`;
      }
      this.render();
    }, { signal: this.renderListeners.signal });

    row.append(name, swatches, control);
    row.append(this.renderGarage(
      `player-${index + 1}`,
      `Player ${index + 1}`,
      player.loadout,
      (loadout) => {
        player.loadout = loadout;
        this.render();
      },
    ));
    return row;
  }

  /**
   * Render the collapsible "Advanced settings" section: wind cap, gravity, and
   * seed. Each input stays blank (placeholder shows the engine default) unless
   * the user types a value; blank fields are omitted from the emitted config so
   * the engine default applies.
   */
  private renderAdvanced(): HTMLElement {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lobby-advanced-trigger lobby-btn secondary';
    trigger.textContent = 'Advanced settings';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', () => {
      this.accountPanelOpen = false;
      this.settingsOpen = true;
      this.render();
    }, { signal: this.renderListeners.signal });
    return trigger;
  }

  private renderAdvancedOverlay(): HTMLElement | null {
    if (this.activeTab === 'hotseat') return this.renderAdvancedFields();
    if (this.onlineSubView === 'create') return this.renderOnlineAdvancedFields();
    return null;
  }

  private renderAdvancedFields(): HTMLElement {
    const fields = document.createElement('div');
    fields.className = 'lobby-advanced-fields';
    fields.append(
      this.numberField('Wind cap', 'maxWind', {
        min: WIND_MIN,
        max: WIND_MAX,
        step: 1,
        placeholder: String(WIND_DEFAULT),
        hint: `${WIND_MIN}–${WIND_MAX}`,
      }),
      this.numberField('Gravity', 'gravity', {
        min: GRAVITY_MIN,
        max: GRAVITY_MAX,
        step: GRAVITY_STEP,
        placeholder: String(GRAVITY_DEFAULT),
        hint: `${GRAVITY_MIN}–${GRAVITY_MAX}`,
      }),
      this.settingsChoiceField(
        'Side walls',
        'walls',
        [
          { value: '', label: 'Open — shots exit' },
          { value: 'reflective', label: 'Reflective — bank shots' },
          { value: 'wrap', label: 'Wrap — cross the arena' },
          { value: 'concrete', label: 'Concrete — impact at edge' },
        ],
        'shots exit, rebound, or cross through paired arena edges',
      ),
      this.settingsChoiceField(
        'Battlefield',
        'battlefieldWorld',
        [
          { value: '', label: 'Automatic — terrain decides' },
          { value: 'ember-dusk', label: 'Ember Dusk — post-apocalypse' },
          { value: 'obsidian-caldera', label: 'Obsidian Caldera — volcanic night' },
          { value: 'glassstorm-expanse', label: 'Glassstorm Expanse — ice' },
        ],
        'visual world only; terrain and physics stay unchanged',
      ),
      this.settingsChoiceField(
        'Terrain hazards',
        'hazards',
        [
          { value: '', label: 'None — classic terrain' },
          { value: 'lava', label: 'Lava — lethal pools' },
        ],
        'deterministic lava pools are solid to shells but lethal to tanks',
      ),
      this.settingsChoiceField(
        'Teams',
        'teamMode',
        [
          { value: '', label: 'Free-for-all' },
          { value: '2v2', label: '2v2 — alternating seats' },
        ],
        'four seats only; teammates cannot damage each other',
      ),
      this.numberField('Seed', 'seed', {
        step: 1,
        placeholder: 'default',
        hint: 'integer, blank = default',
      }),
      this.numberField('Rounds', 'rounds', {
        min: ROUNDS_MIN,
        max: ROUNDS_MAX,
        step: 2,
        placeholder: String(ROUNDS_DEFAULT),
        hint: 'best-of-N, odd',
      }),
      this.numberField('Interest', 'interestRate', {
        min: INTEREST_MIN,
        max: INTEREST_MAX,
        step: INTEREST_STEP,
        placeholder: String(INTEREST_DEFAULT),
        hint: 'per-round credit interest (0–0.5)',
      }),
      this.numberField('Sudden death', 'suddenDeathTurn', {
        min: SUDDEN_DEATH_MIN,
        max: SUDDEN_DEATH_MAX,
        step: 1,
        placeholder: String(SUDDEN_DEATH_DEFAULT),
        hint: 'gravity ramps past this turn (0 = off)',
      }),
      this.numberField('Arms level', 'armsLevel', {
        min: ARMS_MIN,
        max: ARMS_MAX,
        step: 1,
        placeholder: String(ARMS_DEFAULT),
        hint: '0 = basic … 4 = full arsenal',
      }),
    );

    return fields;
  }

  /** Build one labelled number input bound to a SettingsState key. */
  private numberField(
    label: string,
    key: keyof SettingsState,
    opts: { min?: number; max?: number; step?: number; placeholder: string; hint: string },
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const lab = document.createElement('label');
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    if (opts.step !== undefined) input.step = String(opts.step);
    input.placeholder = opts.placeholder;
    input.value = this.settings[key];
    input.addEventListener('input', () => {
      this.settings[key] = input.value;
    }, { signal: this.renderListeners.signal });

    const hint = document.createElement('span');
    hint.className = 'lobby-hint';
    hint.textContent = opts.hint;

    field.append(lab, input, hint);
    return field;
  }

  /** Build one labelled select bound to a hot-seat SettingsState key. */
  private settingsChoiceField(
    label: string,
    key: keyof SettingsState,
    choices: ReadonlyArray<{ value: string; label: string }>,
    hintText: string,
  ): HTMLElement {
    return this.choiceField(`lobby-hotseat-${key}`, label, this.settings[key], (value) => {
      this.settings[key] = value;
    }, choices, hintText);
  }

  /** Build one labelled select for an online advanced setting. */
  private onlineChoiceField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    choices: ReadonlyArray<{ value: string; label: string }>,
    hintText: string,
  ): HTMLElement {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return this.choiceField(`lobby-online-${slug}`, label, value, onChange, choices, hintText);
  }

  private choiceField(
    controlId: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    choices: ReadonlyArray<{ value: string; label: string }>,
    hintText: string,
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const lab = document.createElement('label');
    lab.textContent = label;
    lab.htmlFor = controlId;

    const select = document.createElement('select');
    select.id = controlId;
    for (const choice of choices) {
      const option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      option.selected = choice.value === value;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value), { signal: this.renderListeners.signal });

    const hint = document.createElement('span');
    hint.className = 'lobby-hint';
    hint.id = `${controlId}-hint`;
    hint.textContent = hintText;
    select.setAttribute('aria-describedby', hint.id);

    field.append(lab, select, hint);
    return field;
  }

  /**
   * Parse the raw settings inputs into a LobbySettings, omitting blank/invalid
   * fields (so engine defaults hold). Returns undefined if nothing is set.
   */
  private parseSettings(): LobbySettings | undefined {
    return coerceSettings(this.settings);
  }

  /**
   * Parse the online "Rounds" input into a clamped, ODD best-of-N value, or
   * undefined when blank (engine default = single round). Shared by the create
   * body and the local waitingOptions so both agree on the value sent to the room.
   */
  private parseOnlineRounds(): number | undefined {
    return parseOnlineRounds(this.onlineRounds);
  }

  /**
   * Parse the online SE-parity economy inputs (interest / sudden-death / arms-level) into clamped
   * values, omitting blanks. Shared by the create-room body and the local waitingOptions so both
   * agree on exactly what the room is created with (and thus what every client's engine builds).
   */
  private parseOnlineEconomy(): { interestRate?: number; suddenDeathTurn?: number; armsLevel?: number } {
    return parseOnlineEconomy(this.onlineInterestRate, this.onlineSuddenDeath, this.onlineArmsLevel);
  }

  /** Grow/shrink the working player list, assigning unique default colors. */
  private setPlayerCount(count: number): void {
    const next = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
    if (next > this.players.length) {
      for (let i = this.players.length; i < next; i += 1) {
        this.players.push({
          name: this.players[i]?.name ?? `Player ${i + 1}`,
          color: this.firstFreeColor(),
          loadout: seatPresetLoadout(i),
        });
      }
    } else {
      this.players.length = next;
    }
    this.render();
  }

  /** First palette color not already used by an existing row. */
  private firstFreeColor(): string {
    const used = new Set(this.players.map((p) => p.color));
    const free = PALETTE.find((c) => !used.has(c.value));
    return (free ?? PALETTE[0]).value;
  }

  /** Lightweight refresh of the Start button + error without full re-render. */
  private refreshStartState(): void {
    const error = this.root.querySelector<HTMLElement>('.lobby-error');
    const start = this.root.querySelector<HTMLButtonElement>('.lobby-start');
    const customization = this.root.querySelector<HTMLDetailsElement>(
      '.lobby-hotseat-customization',
    );
    const msg = this.validationError();
    if (error) error.textContent = msg ?? '';
    if (start) start.disabled = msg !== null;
    if (customization) {
      customization.dataset.invalid = String(msg !== null);
      if (msg !== null) {
        customization.open = true;
        this.hotSeatCustomizationOpen = true;
      }
    }
  }

  /** Return a validation error message, or null if the config is valid. */
  private validationError(): string | null {
    if (this.players.length < MIN_PLAYERS || this.players.length > MAX_PLAYERS) {
      return `Choose ${MIN_PLAYERS}-${MAX_PLAYERS} players.`;
    }
    if (this.players.some((p) => p.name.trim().length === 0)) {
      return 'Every player needs a name.';
    }
    const colors = this.players.map((p) => p.color);
    if (new Set(colors).size !== colors.length) {
      return 'Each player must pick a unique color.';
    }
    return null;
  }
}

/** Default row for slot `i`: "Player i+1" + the i-th palette color. */
function defaultRow(i: number): PlayerRowState {
  return {
    name: `Player ${i + 1}`,
    color: (PALETTE[i % PALETTE.length] ?? PALETTE[0]).value,
    loadout: seatPresetLoadout(i),
  };
}

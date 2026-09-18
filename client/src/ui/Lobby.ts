import { normalizeCreateRoomFallback, projectAuthoritativeNetworkMode, WIND_DEFAULT, GRAVITY_DEFAULT, type ModeSetup, type ModePlayer } from '../client/modeConfig';
import lobbyCss from './Lobby.css?raw';
import lobbyConsoleCss from './LobbyConsole.css?raw';
import commandCenterCss from './commandCenter/CommandCenter.css?raw';
import commandPanelFrameUrl from './commandCenter/assets/chrome/panel-frame.png';
import commandIronTileUrl from './commandCenter/assets/chrome/iron-tile.png';
import commandGoldTileUrl from './commandCenter/assets/chrome/gold-tile.png';
import commandMapTileUrl from './commandCenter/assets/chrome/map-tile.png';
import commandButtonFrameUrl from './commandCenter/assets/chrome/button-frame.png';
import commandButtonSelectedFrameUrl from './commandCenter/assets/chrome/button-selected-frame.png';
import commandButtonHoverFrameUrl from './commandCenter/assets/chrome/button-hover-frame.png';
import commandButtonPressedFrameUrl from './commandCenter/assets/chrome/button-pressed-frame.png';
import commandButtonGoldFrameUrl from './commandCenter/assets/chrome/button-gold-frame.png';
import commandButtonDisabledFrameUrl from './commandCenter/assets/chrome/button-disabled-frame.png';
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
import {
  buildLobbyLocalBattleView,
  buildLobbyVerifiedOperationsView,
  updateVerifiedChallengeCountdown,
  type LobbyVerifiedSurface,
} from './LobbyHotSeatView';
import {
  quickOperationById,
  type PracticeObjectiveDescriptor,
  type QuickOperation,
} from '../client/quickOperations';
import { composeQuickDuelLaunch } from '../client/quickDuelLaunch';
import {
  operationForSeedChallenge,
  readSeedChallengeUrl,
  type PublicSeedChallenge,
  type SeedChallengeReadResult,
} from '../client/seedChallenge';
import { isFirstSalvoPreferenceUnseen } from './firstSalvoCoach';
import { buildLobbyBrowseView } from './LobbyBrowseView';
import { buildLobbyCreateView } from './LobbyCreateView';
import { buildLobbyJoinView } from './LobbyJoinView';
import { buildLobbyShellView } from './LobbyShellView';
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
import {
  createFieldOrder,
  createPracticeFieldOrderById,
  renderFieldOrder,
  type FieldOrder,
} from '../client/fieldOrder';
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel';
import {
  type VerifiedChallengeDescriptor,
  type VerifiedChallengeHumanFire,
} from '@shared/net/verifiedChallenge';
import {
  type VerifiedDeploymentDescriptor,
  type VerifiedDeploymentReceipt,
  type VerifiedDeploymentStart,
} from '../client/verifiedDeployment';
import {
  VerifiedDeploymentStorage,
} from '../client/verifiedDeploymentStorage';
import {
  VerifiedChallengeSession,
  type VerifiedChallengeSessionState,
} from '../client/VerifiedChallengeSession';
import { VerifiedChallengeStorage } from '../client/verifiedChallengeStorage';
import { VerifiedChallengeTransport } from '../client/verifiedChallenge';
import { createVerifiedChallengeInvoker } from '../client/verifiedChallengeBackend';
import { parseCampaignRun } from '@shared/campaign/definitions';
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from '../campaign/content/episode';
import { FUEL_STOP_FIXTURE } from '../campaign/content/fuel-stop';
import { campaignDescriptorFromCheckpoint, createCampaignCheckpoint } from '../campaign/checkpoint';
import { createCampaignRunState, type CampaignRunState } from '../campaign/runReducer';
import { createCampaignLoadout } from '../campaign/loadout';
import {
  createCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../campaign/replay';
import { createIndexedDbCampaignStorage, type CampaignStorage } from '../campaign/storage';
import {
  CampaignSavePresentationOwner,
} from './commandCenter/CampaignSavePresentation';
import {
  browserCampaignRunReplacementConfirmation,
  CampaignRunReplacementCoordinator,
  type CampaignRunReplacementConfirmationPort,
} from './commandCenter/CampaignRunReplacement';
import {
  createAshRoadCommandCategoryContribution,
  type CampaignCommandContext,
  type CampaignKitId,
} from './commandCenter/CampaignCommandView';
import {
  createSkirmishCommandCategoryContribution,
  type ImportedSkirmishChallenge,
  type SkirmishCommandContext,
} from './commandCenter/SkirmishCommandView';
import {
  createMultiplayerCommandCategoryContribution,
  type MultiplayerCommandContext,
} from './commandCenter/MultiplayerCommandView';
import {
  createCommandCenterShell,
  type CommandCenterShell,
} from './commandCenter/CommandCenterShell';
import {
  createSessionCommandSelectionStore,
  resolveCommandRegistry,
  resolveInitialCommandSelection,
  type SessionCommandSelectionStore,
} from './commandCenter/registry';
import {
  commandCategoryId,
  commandItemId,
  type CommandCategoryContribution,
} from './commandCenter/contracts';
import type { VerifiedCareerState } from '../client/verifiedCareer';
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
  TANK_KIT_LABELS,
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
  /** Device-local campaign progress paired with the strict campaign descriptor. */
  campaignRunState?: CampaignRunState;
  /** Strict replay payload selected through the public device-local resume affordance. */
  campaignReplayPayload?: CampaignReplayPayload;
  /** CAS revision paired with campaignReplayPayload at lobby selection time. */
  campaignReplayRevision?: number;
  /** Local Quick Duel presentation only; never enters the deterministic action protocol. */
  quickOperation?: {
    readonly id: string;
    readonly title: string;
    readonly briefing: string;
    readonly practiceObjective?: PracticeObjectiveDescriptor;
  };
  /** Public local seed identity only; never enters a room or account contract. */
  publicSeedChallenge?: PublicSeedChallenge;
  /** Auth-owned verified execution context. Server config and recovery transcript stay immutable. */
  verifiedDeployment?: {
    readonly descriptor: VerifiedDeploymentDescriptor;
    readonly transcript: readonly VerifiedHumanFire[];
    readonly fieldOrder: FieldOrder | null;
  };
  /** Current retained challenge execution. Main constructs the retained adapter from this data only. */
  verifiedChallenge?: {
    readonly descriptor: VerifiedChallengeDescriptor;
    readonly transcript: readonly VerifiedChallengeHumanFire[];
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

const COMMAND_CENTER_ASSET_CSS = `#lobby {
  --command-panel-frame: url("${commandPanelFrameUrl}");
  --command-iron-tile: url("${commandIronTileUrl}");
  --command-gold-tile: url("${commandGoldTileUrl}");
  --command-map-tile: url("${commandMapTileUrl}");
  --command-button-frame: url("${commandButtonFrameUrl}");
  --command-button-selected-frame: url("${commandButtonSelectedFrameUrl}");
  --command-button-hover-frame: url("${commandButtonHoverFrameUrl}");
  --command-button-pressed-frame: url("${commandButtonPressedFrameUrl}");
  --command-button-gold-frame: url("${commandButtonGoldFrameUrl}");
  --command-button-disabled-frame: url("${commandButtonDisabledFrameUrl}");
}`;

function browserQuickDuelSeed(): number {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0]!;
}

/** Browser privacy/storage failures must not prevent the local guest route. */
function firstSalvoPreferenceUnseen(): boolean {
  try {
    return isFirstSalvoPreferenceUnseen(window.localStorage);
  } catch {
    return true;
  }
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

export interface LobbyLaunchFocusSnapshot {
  readonly key: string;
  readonly occurrence: number;
  readonly inOverlay: boolean;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
}

const LOBBY_FOCUS_ATTRIBUTES = [
  'data-verified-surface',
  'data-operation-id',
  'data-online-route',
  'name',
  'aria-label',
] as const;

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
  revalidateIdentity?(expectedAccountId: string): Promise<boolean>;
  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null>;
  readonly verifiedCareer?: VerifiedCareerState;
  refreshVerifiedCareer?(): Promise<void>;
  subscribeVerifiedCareer?(onChange: (state: VerifiedCareerState) => void): () => void;
}

export type { VerifiedDeploymentState as LobbyVerifiedDeploymentState } from '../client/VerifiedDeploymentSession';

type AccountSessionFactory = (
  onChange: (state: AccountState) => void,
) => AccountSessionPort;

export type VerifiedChallengeSessionFactory = (
  authenticatedAccountId: () => string | null,
) => VerifiedChallengeSession;

const defaultVerifiedChallengeSessionFactory: VerifiedChallengeSessionFactory = (authenticatedAccountId) => {
  const transport = new VerifiedChallengeTransport(async (operation, body) => {
    const { supabase } = await import('../lib/supabase');
    const invoke = createVerifiedChallengeInvoker(
      supabase as unknown as Parameters<typeof createVerifiedChallengeInvoker>[0],
      authenticatedAccountId,
    );
    return invoke(operation, body);
  });
  return new VerifiedChallengeSession(
    transport,
    new VerifiedChallengeStorage(localStorage),
    authenticatedAccountId,
  );
};

export type ProductionDiagnosticsFactory = (
) => ProductionDiagnostics | Promise<ProductionDiagnostics>;

const defaultProductionDiagnosticsFactory: ProductionDiagnosticsFactory = async () => {
  const { supabase } = await import('../lib/supabase');
  return createProductionDiagnostics(supabase, { readiness: 'loading' });
};

const defaultCampaignStorage: CampaignStorage = Object.freeze({
  load: (slotId: string) => createIndexedDbCampaignStorage().load(slotId),
  compareAndSwap: (input: Parameters<CampaignStorage['compareAndSwap']>[0]) => (
    createIndexedDbCampaignStorage().compareAndSwap(input)
  ),
});

interface LobbyCommandCenterContext extends
  CampaignCommandContext,
  SkirmishCommandContext,
  MultiplayerCommandContext {}

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
  private readonly seedChallenge: SeedChallengeReadResult;
  /** Owns every listener attached to the current replaceable lobby tree. */
  private renderListeners = new AbortController();

  /** Owns the seven Edge-Function calls (create/join/list/heartbeat/ready/leave/update). */
  private readonly transport = new LobbyTransport();
  private readonly session: LobbySession;
  private readonly roomController: LobbyRoomController;
  private readonly accountSession: AccountSessionPort;
  private readonly verifiedSession: VerifiedDeploymentSession;
  private readonly verifiedChallengeSession: VerifiedChallengeSession;
  private verifiedChallengeBusy = false;
  private verifiedChallengeCareerRefreshSessionId: string | null = null;
  private verifiedChallengeRetryTimer: ReturnType<typeof setTimeout> | null = null;
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

  private verifiedHotSeatSurface: LobbyVerifiedSurface = 'deployment';
  private focusVerifiedDeploymentRequested = false;
  private focusVerifiedChallengeRequested = false;

  // ---- Tab / online sub-view state ----
  private activeTab: LobbyTab = 'hotseat';
  private onlineSubView: OnlineSubView = 'create';
  private inviteRouteRequested = false;
  private contextualOnlineEntryPending = true;
  private onlineWorkspaceSuspended = false;
  private browseLifetimeSignal: AbortSignal | null = null;
  private networkRecoveryRetry: (() => void) | null = null;
  private readonly campaignSavePresentation: CampaignSavePresentationOwner;
  private readonly campaignRunReplacement: CampaignRunReplacementCoordinator;
  private readonly commandSelectionStore: SessionCommandSelectionStore;
  private commandCenterShell: CommandCenterShell<LobbyCommandCenterContext> | null = null;
  private campaignInitialPromotionEligible = false;
  private selectedCampaignKit: CampaignKitId = 'precision';
  private pendingLaunchFocus: LobbyLaunchFocusSnapshot | null = null;

  // Create form state
  private onlineName = '';
  private onlineNameSource: 'none' | 'profile' | 'user' = 'none';
  private onlineColor: string = PALETTE[0].value;
  private onlineLoadout: TankLoadout = { ...DEFAULT_TANK_LOADOUT };
  /** Compact layouts expose one touch-sized Garage editor at a time. */
  private openGarageOwner: string | null = null;
  /** Exact Garage control to restore after an asynchronous Online mutation settles. */
  private pendingGarageFocus: { owner: string; selector: string } | null = null;
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
    createVerifiedChallengeSession: VerifiedChallengeSessionFactory = defaultVerifiedChallengeSessionFactory,
    campaignSaveStorage: CampaignStorage = defaultCampaignStorage,
    campaignRunReplacementConfirmation: CampaignRunReplacementConfirmationPort =
      browserCampaignRunReplacementConfirmation,
  ) {
    this.root = root;
    this.onReady = onReady;
    this.commandSelectionStore = createSessionCommandSelectionStore(window.sessionStorage);
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
    const authenticatedAccountId = (): string | null => this.accountSession.state.status === 'authenticated'
      ? this.accountSession.state.profile.id
      : null;
    this.verifiedChallengeSession = createVerifiedChallengeSession(authenticatedAccountId);
    this.campaignSavePresentation = new CampaignSavePresentationOwner(campaignSaveStorage);
    this.campaignRunReplacement = new CampaignRunReplacementCoordinator(
      campaignSaveStorage,
      this.campaignSavePresentation,
      campaignRunReplacementConfirmation,
    );
    this.accountSession.subscribeVerifiedCareer?.(() => { this.render(); });
    this.syncOnlineNameFromAccount();
    this.createDiagnostics = createDiagnostics;
    this.seedChallenge = readSeedChallengeUrl(window.location.href);
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
      this.inviteRouteRequested = true;
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
    if (this.verifiedChallengeSession.syncAccount()) {
      this.verifiedChallengeCareerRefreshSessionId = null;
    }
    if (identityChanged) this.roomController.accountIdentityChanged();
    const recoveryGeneration = this.verifiedSession.advanceRecoveryGeneration();
    const restoreFocus = this.accountPanelOpen;
    this.verifiedSession.freezeVerifiedDeploymentForAccountChange();
    this.syncOnlineNameFromAccount();
    this.syncDiagnosticsReadiness();
    this.maybeAutorunDiagnostics();
    this.render();
    this.accountAuthenticationChangeCb?.(identityChanged);
    const overlay = this.root.querySelector<HTMLElement>('.lobby-overlay');
    if (restoreFocus && !overlay?.contains(document.activeElement)) this.focusAccountOverlay();
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
    return this.root.querySelector<HTMLElement>(
      '.command-center__workspace-host .command-center__primary-action:not(:disabled), '
      + '.command-center__workspace-host .primary:not(:disabled), '
      + '[data-command-item][aria-current="true"]',
    )
      ?? this.root.querySelector<HTMLButtonElement>('.account-panel button')
      ?? this.root.querySelector<HTMLButtonElement>('button');
  }

  private lobbyReturnFocusTarget(): HTMLElement | null {
    if (this.accountPanelOpen || this.settingsOpen || this.diagnosticsIntentActive) return null;
    return this.root.querySelector<HTMLElement>(
      '.command-center__workspace-host .command-center__primary-action:not(:disabled), '
      + '.command-center__workspace-host .primary:not(:disabled), '
      + '[data-command-item][aria-current="true"]',
    );
  }

  private focusLobbyReturnTarget(): void {
    this.lobbyReturnFocusTarget()?.focus({ preventScroll: true });
  }

  private lobbyFocusableControls(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, summary, a[href], [tabindex]',
    )].filter((control) => !control.closest('[inert]')
      && !(control instanceof HTMLButtonElement && control.disabled)
      && !(control instanceof HTMLInputElement && control.disabled)
      && !(control instanceof HTMLSelectElement && control.disabled)
      && !(control instanceof HTMLTextAreaElement && control.disabled));
  }

  private lobbyFocusKey(control: HTMLElement): string | null {
    const tag = control.tagName.toLowerCase();
    if (control.id) return `${tag}|id|${control.id}`;
    for (const attribute of LOBBY_FOCUS_ATTRIBUTES) {
      const value = control.getAttribute(attribute);
      if (value) return `${tag}|${attribute}|${value}`;
    }
    if (control instanceof HTMLButtonElement || tag === 'summary') {
      const text = control.textContent?.trim();
      if (text) return `${tag}|text|${text}`;
    }
    return null;
  }

  private captureLobbyFocus(): LobbyLaunchFocusSnapshot | null {
    const active = document.activeElement;
    if (this.root.hidden || !(active instanceof HTMLElement) || !this.root.contains(active)) return null;
    if ((this.accountPanelOpen || this.settingsOpen) && !active.closest('.lobby-overlay')) return null;
    const key = this.lobbyFocusKey(active);
    if (!key) return null;
    const matching = this.lobbyFocusableControls().filter((control) => this.lobbyFocusKey(control) === key);
    const occurrence = matching.indexOf(active);
    if (occurrence < 0) return null;
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    let selectionDirection: LobbyLaunchFocusSnapshot['selectionDirection'] = null;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      try {
        selectionStart = active.selectionStart;
        selectionEnd = active.selectionEnd;
        selectionDirection = active.selectionDirection;
      } catch {
        // Input types without a text selection still retain focus.
      }
    }
    return {
      key,
      occurrence,
      inOverlay: active.closest('.lobby-overlay') !== null,
      selectionStart,
      selectionEnd,
      selectionDirection,
    };
  }

  private restoreLobbyFocus(snapshot: LobbyLaunchFocusSnapshot | null): void {
    if (!snapshot) return;
    const matching = this.lobbyFocusableControls().filter((control) => (
      this.lobbyFocusKey(control) === snapshot.key
      && (control.closest('.lobby-overlay') !== null) === snapshot.inOverlay
    ));
    const target = matching[snapshot.occurrence];
    if (!target) return;
    target.focus({ preventScroll: true });
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
      try {
        target.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd,
          snapshot.selectionDirection ?? undefined,
        );
      } catch {
        // Input types without a text selection still retain focus.
      }
    }
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
  show(options: {
    readonly focusLobby?: boolean;
    readonly focusVerifiedDeployment?: boolean;
    readonly focusVerifiedChallenge?: boolean;
  } = {}): void {
    if (this.commandCenterShell === null || this.root.hidden) {
      this.contextualOnlineEntryPending = true;
    }
    if (options.focusVerifiedDeployment || options.focusVerifiedChallenge) {
      // Verified sessions return through their public command item while the
      // retained session owners continue to supply state and callbacks.
      this.activeTab = 'hotseat';
      this.verifiedHotSeatSurface = options.focusVerifiedChallenge ? 'challenge' : 'deployment';
      this.commandSelectionStore.remember({
        categoryId: commandCategoryId('multiplayer'),
        itemId: commandItemId('verified-operations'),
      });
      this.focusVerifiedDeploymentRequested = true;
      this.focusVerifiedChallengeRequested = options.focusVerifiedChallenge === true;
    }
    this.roomController.activate();
    this.injectStyle();
    this.startDiagnostics();
    this.render();
    this.root.hidden = false;
    this.focusRequestedVerifiedDeployment();
    if (options.focusLobby) this.focusLobbyReturnTarget();
    void this.accountSession.initialize();
    void this.checkRejoinCandidate();
    void this.checkCampaignResume();
  }

  private async checkCampaignResume(): Promise<void> {
    const refresh = this.campaignSavePresentation.refresh();
    if (!this.root.hidden) {
      this.commandCenterShell?.update(this.campaignCommandContext());
    }
    await refresh;
    if (!this.root.hidden) {
      const context = this.campaignCommandContext();
      this.commandCenterShell?.update(context);
      if (
        context.savePresentation.status === 'compatible'
        && this.campaignInitialPromotionEligible
      ) {
        const promoted = this.commandCenterShell?.promoteInitialSelection({
          categoryId: commandCategoryId('campaigns'),
          itemId: commandItemId('ash-road'),
        }) === true;
        if (promoted) this.campaignInitialPromotionEligible = false;
      }
    }
  }

  /** Capture the meaningful control that initiated one application launch. */
  captureLaunchFocus(): LobbyLaunchFocusSnapshot | null {
    const pending = this.pendingLaunchFocus;
    this.pendingLaunchFocus = null;
    return pending ?? this.captureLobbyFocus();
  }

  /** Restore a still-valid initiating control after launch acquisition fails. */
  restoreLaunchFocus(snapshot: LobbyLaunchFocusSnapshot | null): void {
    this.restoreLobbyFocus(snapshot);
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.root.contains(active)) return;
    const networkRetry = this.root.querySelector<HTMLElement>('[data-network-recovery-retry]');
    if (networkRetry) {
      networkRetry.focus({ preventScroll: true });
      return;
    }
    this.lobbyReturnFocusTarget()?.focus({ preventScroll: true });
  }

  /** Re-project the campaign save owner after a launch failed to commit. */
  async refreshCampaignSaveAfterLaunchFailure(): Promise<void> {
    await this.checkCampaignResume();
  }

  /**
   * Surface a non-network launch failure in the still-mounted owner workspace.
   * The existing primary action remains its retry path; network recovery keeps
   * using showNetworkRecovery instead.
   */
  showLaunchFailure(message: string): void {
    // Battle-originated restarts begin with the lobby intentionally unmounted.
    // Reconstruct its remembered owner before presenting a recoverable failure;
    // lobby-originated launches keep their existing DOM and local state intact.
    if (!this.root.firstElementChild) this.show();
    let alert = this.root.querySelector<HTMLElement>('[data-launch-failure]');
    if (!alert) {
      alert = document.createElement('p');
      alert.dataset.launchFailure = '';
      alert.className = 'lobby-launch-failure';
      alert.setAttribute('role', 'alert');
      const owner = this.root.querySelector<HTMLElement>('.command-center__workspace-host')
        ?? this.root;
      owner.prepend(alert);
    }
    alert.textContent = message;
  }

  /** Restore the online preparation surface after match acquisition times out. */
  showNetworkRecovery(message: string, retry: () => void): void {
    this.onlineBusy = false;
    this.onlineError = message;
    this.networkRecoveryRetry = retry;
    if (!this.root.firstElementChild) this.show();
    else this.render();
    const recovery = this.root.querySelector<HTMLElement>('[data-network-recovery-retry]')
      ?.closest<HTMLElement>('[role="alert"]');
    recovery?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.root.querySelector<HTMLElement>('[data-network-recovery-retry]')
      ?.focus({ preventScroll: true });
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
    this.networkRecoveryRetry = null;
    this.pendingLaunchFocus = null;
    this.campaignSavePresentation.invalidate();
    this.commandCenterShell?.destroy();
    this.commandCenterShell = null;
    this.roomController.retire();
    this.cleanupWaitingChannel();
    this.stopBrowsePoll();
    if (this.verifiedChallengeRetryTimer !== null) {
      clearTimeout(this.verifiedChallengeRetryTimer);
      this.verifiedChallengeRetryTimer = null;
    }
    this.renderListeners.abort();
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  refreshAccount(): Promise<void> {
    return this.accountSession.refresh();
  }

  revalidateAccountIdentity(): Promise<boolean> {
    const account = this.accountSession.state;
    if (account.status !== 'authenticated' || !this.accountSession.revalidateIdentity) {
      return Promise.resolve(false);
    }
    return this.accountSession.revalidateIdentity(account.profile.id);
  }

  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null> {
    return this.accountSession.recordHotSeatMatch(result);
  }

  get verifiedDeployment(): LobbyVerifiedDeploymentState {
    return this.verifiedSession.verifiedDeployment;
  }

  get verifiedChallenge(): VerifiedChallengeSessionState {
    if (this.verifiedChallengeSession.syncAccount()) {
      this.verifiedChallengeCareerRefreshSessionId = null;
    }
    return this.verifiedChallengeSession.projectDeadline();
  }

  async launchVerifiedChallenge(): Promise<VerifiedChallengeSessionState> {
    if (this.verifiedChallengeBusy) return this.verifiedChallenge;
    this.verifiedChallengeSession.syncAccount();
    let current = this.verifiedChallengeSession.projectDeadline();
    if (current.status === 'active') {
      this.emitVerifiedChallenge();
      return current;
    }
    this.verifiedChallengeBusy = true;
    this.render();
    if (current.status === 'idle') current = await this.verifiedChallengeSession.recover();
    if (current.status === 'idle' || current.status === 'start-unavailable'
      || current.status === 'expired' || current.status === 'abandoned'
      || current.status === 'invalid' || current.status === 'verification_unavailable'
      || current.status === 'completed') {
      const starting = this.verifiedChallengeSession.start();
      this.render();
      current = await starting;
    }
    this.verifiedChallengeBusy = false;
    if (current.status !== 'active' || !this.emitVerifiedChallenge()) this.render();
    return current;
  }

  recordVerifiedChallengeFire(value: VerifiedChallengeHumanFire): boolean {
    return this.verifiedChallengeSession.recordAcceptedFire(value);
  }

  async completeVerifiedChallenge(): Promise<VerifiedChallengeSessionState> {
    const state = await this.verifiedChallengeSession.complete();
    this.refreshVerifiedCareerForReceipt(state);
    return state;
  }

  async retryVerifiedChallengeCompletion(): Promise<VerifiedChallengeSessionState> {
    const state = await this.verifiedChallengeSession.retry();
    this.refreshVerifiedCareerForReceipt(state);
    return state;
  }

  abandonVerifiedChallenge(): Promise<VerifiedChallengeSessionState> {
    return this.verifiedChallengeSession.abandon();
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

  private importedSkirmishChallenge(): ImportedSkirmishChallenge | null {
    if (this.seedChallenge.status !== 'valid') return null;
    const operation = operationForSeedChallenge(this.seedChallenge.challenge);
    const fieldOrder = operation?.practiceObjective
      ? createPracticeFieldOrderById(operation.practiceObjective.fieldOrderId)
      : null;
    if (!operation || !fieldOrder) return null;
    return {
      operation,
      objective: renderFieldOrder(fieldOrder).brief,
      seed: this.seedChallenge.challenge.seed,
    };
  }

  private campaignCommandContext(): LobbyCommandCenterContext {
    return {
      savePresentation: this.campaignSavePresentation.presentation,
      resumeCandidate: this.campaignSavePresentation.resumeCandidate,
      selectedKit: this.selectedCampaignKit,
      onSelectKit: (kitId) => { this.selectedCampaignKit = kitId; },
      onStart: (kitId) => this.startAshRoad(kitId),
      onResume: () => { this.resumeAshRoad(); },
      onNewRun: (kitId, lifetime) => this.startAshRoad(kitId, lifetime),
      onRetrySave: () => this.checkCampaignResume(),
      firstSalvoAvailable: firstSalvoPreferenceUnseen(),
      importedChallenge: this.importedSkirmishChallenge(),
      importedChallengeInvalid: this.seedChallenge.status === 'invalid',
      onLaunchQuickOperation: (operationId) => { this.startQuickDuel(operationId); },
      onLaunchImportedChallenge: () => { this.startSeedChallenge(); },
      verifiedOperationsAvailable: this.isAccountAuthenticated(),
      buildLocalBattleWorkspace: (listenerSignal) => (
        this.renderLocalBattleCommandWorkspace(listenerSignal)
      ),
      buildVerifiedOperationsWorkspace: (listenerSignal) => (
        this.renderVerifiedOperationsCommandWorkspace(listenerSignal)
      ),
      buildOnlineBattleWorkspace: (listenerSignal) => (
        this.renderOnlineBattleCommandWorkspace(listenerSignal)
      ),
      releaseOnlineBattleWorkspace: () => { this.releaseOnlineBattleCommandWorkspace(); },
    };
  }

  private commandCenterContributions(): readonly CommandCategoryContribution<
    LobbyCommandCenterContext
  >[] {
    const multiplayer = createMultiplayerCommandCategoryContribution<LobbyCommandCenterContext>();
    return [
      createAshRoadCommandCategoryContribution<LobbyCommandCenterContext>(),
      createSkirmishCommandCategoryContribution<LobbyCommandCenterContext>(),
      multiplayer,
    ];
  }

  private mountCommandCenter(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'lobby-command-center';
    const context = this.campaignCommandContext();
    const contributions = this.commandCenterContributions();
    const registry = resolveCommandRegistry(contributions, context);
    const campaigns = {
      categoryId: commandCategoryId('campaigns'),
      itemId: commandItemId('ash-road'),
    };
    const firstSalvo = {
      categoryId: commandCategoryId('skirmishes'),
      itemId: commandItemId('first-salvo'),
    };
    const standardQuickDuel = {
      categoryId: commandCategoryId('skirmishes'),
      itemId: commandItemId('standard'),
    };
    const importedChallenge = {
      categoryId: commandCategoryId('skirmishes'),
      itemId: commandItemId('imported-challenge'),
    };
    const online = {
      categoryId: commandCategoryId('multiplayer'),
      itemId: commandItemId('online'),
    };
    const resolvedInitialSelection = resolveInitialCommandSelection(registry, {
      ...(this.contextualOnlineEntryPending && (this.inviteRouteRequested || this.rejoinCandidate)
        ? { explicitInviteOrRejoin: online }
        : {}),
      ...(this.seedChallenge.status === 'valid' ? {
        importedChallenge: { explicit: true, validated: true, selection: importedChallenge },
      } : {}),
      campaign: {
        compatible: this.campaignSavePresentation.presentation.status === 'compatible',
        selection: campaigns,
      },
      firstSalvo,
      standardQuickDuel,
    }, this.commandSelectionStore);
    if (resolvedInitialSelection?.source === 'explicit-invite-or-rejoin') {
      this.contextualOnlineEntryPending = false;
      this.inviteRouteRequested = false;
      this.commandSelectionStore.remember(resolvedInitialSelection.selection);
    }
    this.campaignInitialPromotionEligible = resolvedInitialSelection?.source === 'first-salvo'
      || resolvedInitialSelection?.source === 'standard-quick-duel';
    const initialSelection = resolvedInitialSelection?.selection ?? campaigns;
    this.commandCenterShell = createCommandCenterShell(host, {
      contributions,
      context,
      initialSelection,
      selectionStore: {
        read: () => this.commandSelectionStore.read(),
        remember: (selection) => {
          this.contextualOnlineEntryPending = false;
          return this.commandSelectionStore.remember(selection);
        },
        clear: () => { this.commandSelectionStore.clear(); },
      },
    });
    return host;
  }

  /** Inject the lobby's scoped <style> once (do NOT edit index.html). */
  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `${lobbyCss}\n${lobbyConsoleCss}\n${commandCenterCss}`;
    style.textContent += `\n${COMMAND_CENTER_ASSET_CSS}`;
    document.head.append(style);
  }

  /** Re-render the lobby card from current working state. */
  private render(): void {
    const explicitVerifiedFocusRequested = this.focusVerifiedDeploymentRequested;
    const focusSnapshot = this.captureLobbyFocus();
    this.commandCenterShell?.destroy();
    this.commandCenterShell = null;
    this.renderListeners.abort();
    this.renderListeners = new AbortController();
    this.root.replaceChildren();

    const accountOptions = (open: boolean, triggerOnly = false) => ({
      state: this.accountSession.state,
      verifiedCareer: this.accountSession.verifiedCareer,
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
      account: accountPanel,
      commandCenter: this.mountCommandCenter(),
    });

    this.root.append(card);
    this.focusRequestedVerifiedDeployment();
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
    if (activeGarage && this.root.classList.contains('is-compact')) {
      this.root.querySelector<HTMLElement>('.lobby-preview')
        ?.setAttribute('aria-hidden', 'true');
    }
    if (activeGarage) {
      this.root.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href]',
      ).forEach((control) => {
        if (!activeGarage.contains(control)) control.setAttribute('inert', '');
      });
    }
    if (!explicitVerifiedFocusRequested) this.restoreLobbyFocus(focusSnapshot);
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
    const current = this.root.querySelector('.lobby-preview');
    const presentation = current?.classList.contains('lobby-preview--inspection')
      ? 'inspection'
      : 'formation';
    current?.replaceWith(this.renderVehiclePreview(presentation));
  }

  /** Select an editor without repainting an already-correct assembled tank. */
  private activatePreviewOwner(owner: string): void {
    const currentOwner = this.spotlightVehicle(this.previewRoster())?.owner;
    this.spotlightOwner = owner;
    for (const seat of this.root.querySelectorAll<HTMLElement>('[data-crew-seat]')) {
      const selected = seat.dataset.crewSeat === owner;
      if (selected) seat.setAttribute('aria-current', 'true');
      else seat.removeAttribute('aria-current');
      seat.querySelector<HTMLButtonElement>('[data-crew-seat-select]')
        ?.setAttribute('aria-pressed', String(selected));
    }
    if (currentOwner !== owner) this.refreshVehiclePreview();
  }

  /** Live Garage bay: one selected build at inspection scale plus roster context. */
  private renderVehiclePreview(presentation: 'formation' | 'inspection' = 'formation'): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'lobby-preview';
    if (presentation === 'inspection') preview.classList.add('lobby-preview--inspection');

    const label = document.createElement('div');
    label.className = 'lobby-preview__label';
    label.textContent = presentation === 'inspection' ? 'Selected vehicle' : 'Vehicle Bay';

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
    color: string,
    value: TankLoadout,
    onChange: (next: TankLoadout) => void,
    listenerSignal: AbortSignal = this.renderListeners.signal,
    disabled = false,
  ): HTMLElement {
    return buildLobbyGarageView({
      owner,
      ownerLabel,
      color,
      value,
      editing: this.openGarageOwner === owner,
      disabled,
      isEditing: () => this.openGarageOwner === owner,
      listenerSignal,
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
    this.pendingGarageFocus = { owner, selector };
    this.restorePendingGarageFocus();
  }

  private restorePendingGarageFocus(): void {
    const pending = this.pendingGarageFocus;
    if (!pending) return;
    const garage = this.garageFor(pending.owner);
    if (!garage) {
      this.pendingGarageFocus = null;
      return;
    }
    const target = garage.querySelector<HTMLButtonElement>(pending.selector);
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      this.pendingGarageFocus = null;
      return;
    }
    const close = garage.querySelector<HTMLButtonElement>('.lobby-garage__close');
    if (close) {
      close.focus({ preventScroll: true });
      return;
    }
    garage.tabIndex = -1;
    garage.focus({ preventScroll: true });
  }

  private openGarage(owner: string): void {
    this.pendingGarageFocus = null;
    this.openGarageOwner = owner;
    this.spotlightOwner = owner;
    this.render();
    this.focusGarageControl(owner, '[data-preset]');
  }

  private closeGarage(owner: string): void {
    this.pendingGarageFocus = { owner, selector: '.lobby-garage__open' };
    this.openGarageOwner = null;
    this.render();
    this.restorePendingGarageFocus();
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
    const operation = quickOperationById(operationId);
    // P04 cards only advertise objectives for their finite solver-proven seed.
    const seed = operation.practiceObjective?.contentVersion === 2
      ? operation.practiceObjective.seed
      : this.generateQuickDuelSeed();
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) return;
    if (new URL(window.location.href).searchParams.get('e2e') === 'quick-duel-seed') {
      const target = window as typeof window & {
        __singedTerraE2E?: { quickDuelSeed?: number };
      };
      target.__singedTerraE2E = Object.freeze({ quickDuelSeed: seed });
    }
    this.launchQuickDuel(operation, seed, 'local-selection');
  }

  private async startAshRoad(kitId: CampaignKitId, lifetime?: AbortSignal): Promise<void> {
    const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === ASH_ROAD_ROUTE_IDS.highRoad);
    if (!route) throw new Error('Ash Road is missing its public opening route');
    const run = parseCampaignRun({
      kind: 'campaign-run',
      runVersion: 1,
      runId: 'ash-road-local-run',
      episodeId: ASH_ROAD_EPISODE.episodeId,
      episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
      episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
      combatProfileId: FUEL_STOP_FIXTURE.combatProfile.profileId,
      combatProfileVersion: FUEL_STOP_FIXTURE.combatProfile.profileVersion,
      combatProfileContentDigest: FUEL_STOP_FIXTURE.combatProfile.contentDigest,
      routeId: route.id,
      encounterIds: route.encounterIds,
      currentEncounterIndex: 0,
    });
    if (!run) throw new Error('Ash Road public run is invalid');
    const checkpoint = createCampaignCheckpoint({
      run,
      encounter: FUEL_STOP_FIXTURE.encounter,
      combatProfile: FUEL_STOP_FIXTURE.combatProfile,
      attempt: 1,
      supplies: 2,
    });
    const campaignRunState = createCampaignRunState(
      checkpoint,
      createCampaignLoadout({
        offensiveWeaponIds: kitId === 'assault'
          ? ['missile', 'cluster_bomb']
          : kitId === 'breach'
            ? ['missile', 'sandhog']
            : ['missile', 'napalm'],
      }),
    );
    const config: LobbyConfig = {
      mode: 'hotseat',
      experience: 'campaign',
      campaign: {
        encounter: checkpoint.encounter,
        combatProfile: FUEL_STOP_FIXTURE.combatProfile,
      },
      campaignRunState,
      players: [
        { name: 'Ranger', color: PALETTE[0].value },
        { name: 'Defender', color: PALETTE[1].value, ai: 'hard' },
      ],
      playerNames: ['Ranger', 'Defender'],
    };
    const saveStatus = this.campaignSavePresentation.presentation.status;
    if (saveStatus === 'empty') {
      this.onReady(config);
      return;
    }
    if (saveStatus !== 'compatible' && saveStatus !== 'complete') return;

    const payload = createCampaignReplayPayload({
      runState: campaignRunState,
      acceptedCommands: [],
    });
    const replacement = await this.campaignRunReplacement.replace(payload);
    if (lifetime?.aborted) {
      // A confirmed replacement may commit after its initiating view retires.
      // Re-project that durable state without reviving the stale view or
      // launching from its callback.
      if (replacement.status === 'replaced') await this.checkCampaignResume();
      return;
    }
    if (replacement.status !== 'replaced') {
      if (replacement.status === 'conflict') {
        this.render();
        this.showLaunchFailure(
          'Campaign progress changed in another session. Review the refreshed save before trying again.',
        );
        this.root.querySelector<HTMLElement>('[data-command-primary]')?.focus({ preventScroll: true });
      }
      return;
    }
    this.onReady({
      ...config,
      campaignReplayPayload: replacement.payload,
      campaignReplayRevision: replacement.revision,
    });
  }

  private resumeAshRoad(): void {
    const resume = this.campaignSavePresentation.resumeCandidate;
    if (!resume) return;
    this.pendingLaunchFocus = this.captureLobbyFocus();
    if (!this.campaignSavePresentation.beginRestoring()) return;
    this.render();
    const { payload, revision } = resume;
    const runState = payload.runState;
    const descriptor = campaignDescriptorFromCheckpoint(
      runState.checkpoint,
      runState.attemptCheckpoint.loadout,
    );
    this.onReady({
      mode: 'hotseat',
      experience: 'campaign',
      campaign: descriptor,
      campaignRunState: runState,
      campaignReplayPayload: payload,
      campaignReplayRevision: revision,
      players: [
        { name: 'Ranger', color: PALETTE[0].value },
        { name: 'Defender', color: PALETTE[1].value, ai: 'hard' },
      ],
      playerNames: ['Ranger', 'Defender'],
    });
  }

  /** Imported input reaches launch only after strict ST1 resolution. */
  private startSeedChallenge(): void {
    if (this.seedChallenge.status !== 'valid') return;
    const operation = operationForSeedChallenge(this.seedChallenge.challenge);
    if (!operation) return;
    this.launchQuickDuel(operation, this.seedChallenge.challenge.seed, 'imported-public-challenge');
  }

  private launchQuickDuel(
    operation: QuickOperation,
    seed: number,
    origin: PublicSeedChallenge['origin'],
  ): void {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) return;
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
    this.onReady(composeQuickDuelLaunch({ operation, seed, origin, human: humanPlayer, cpu: cpuPlayer }));
  }

  private emitVerifiedChallenge(): boolean {
    const current = this.verifiedChallengeSession.state;
    const account = this.accountSession.state;
    if (current.status !== 'active' || account.status !== 'authenticated'
      || current.descriptor.accountId !== account.profile.id) return false;
    const { descriptor, transcript } = current;
    const human: LobbyPlayer = {
      name: account.profile.displayName,
      color: PALETTE[0].value,
      loadout: normalizeTankLoadout(seatPresetLoadout(0)),
    };
    const cpu: LobbyPlayer = {
      name: 'CPU 1',
      color: PALETTE[1].value,
      ai: 'hard',
      loadout: normalizeTankLoadout(seatPresetLoadout(1)),
    };
    this.onReady({
      mode: 'hotseat',
      players: [human, cpu],
      playerNames: [human.name, cpu.name],
      settings: {
        seed: descriptor.seed,
        maxWind: descriptor.rules.maxWind,
        gravity: descriptor.rules.gravity,
        walls: descriptor.rules.walls,
        hazards: descriptor.rules.hazards,
        rounds: descriptor.rules.rounds,
        interestRate: descriptor.rules.interestRate,
        suddenDeathTurn: descriptor.rules.suddenDeathTurn,
        armsLevel: descriptor.rules.armsLevel,
        teamMode: descriptor.rules.teamMode,
      },
      verifiedChallenge: { descriptor, transcript },
    });
    return true;
  }

  private refreshVerifiedCareerForReceipt(state: VerifiedChallengeSessionState): void {
    if (state.status !== 'completed'
      || state.receipt.sessionId === this.verifiedChallengeCareerRefreshSessionId) return;
    this.verifiedChallengeCareerRefreshSessionId = state.receipt.sessionId;
    void this.accountSession.refreshVerifiedCareer?.();
  }

  private verifiedChallengeHotSeatView() {
    const account = this.accountSession.state;
    if (account.status !== 'authenticated') return null;
    const state = this.verifiedChallenge;
    const career = this.accountSession.verifiedCareer
      ?? Object.freeze({ status: 'unavailable' as const, accountId: account.profile.id });
    const retryDelaySeconds = this.verifiedChallengeSession.retryDelaySeconds;
    this.scheduleVerifiedChallengeRetryRender(retryDelaySeconds);
    return {
      accountId: account.profile.id,
      busy: account.busy || this.verifiedChallengeBusy,
      retryDelaySeconds,
      state,
      career,
      onLaunch: () => { void this.launchVerifiedChallenge(); },
      onRetry: () => {
        if (this.verifiedChallengeBusy) return;
        this.verifiedChallengeBusy = true;
        this.render();
        void this.retryVerifiedChallengeCompletion().then(() => {
          this.verifiedChallengeBusy = false;
          this.render();
        });
      },
      onAbandon: () => {
        if (this.verifiedChallengeBusy) return;
        this.verifiedChallengeBusy = true;
        this.render();
        void this.abandonVerifiedChallenge().then(() => {
          this.verifiedChallengeBusy = false;
          this.render();
        });
      },
    };
  }

  private scheduleVerifiedChallengeRetryRender(retryDelaySeconds: number): void {
    if (retryDelaySeconds <= 0) {
      if (this.verifiedChallengeRetryTimer !== null) clearTimeout(this.verifiedChallengeRetryTimer);
      this.verifiedChallengeRetryTimer = null;
      return;
    }
    if (this.verifiedChallengeRetryTimer !== null) return;
    this.verifiedChallengeRetryTimer = setTimeout(() => {
      this.verifiedChallengeRetryTimer = null;
      if (this.root.hidden) return;
      const remaining = this.verifiedChallengeSession.retryDelaySeconds;
      updateVerifiedChallengeCountdown(this.root, this.verifiedChallengeSession.state,
        remaining, this.accountSession.state.busy || this.verifiedChallengeBusy);
      this.scheduleVerifiedChallengeRetryRender(remaining);
    }, Math.min(1_000, retryDelaySeconds * 1_000));
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
        const abandonment = this.abandonVerifiedDeployment();
        this.render();
        void abandonment.then(() => {
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

  private renderLocalBattleCommandWorkspace(listenerSignal: AbortSignal): HTMLElement {
    this.activeTab = 'hotseat';
    const workspace = document.createElement('div');
    workspace.className = 'multiplayer-command__local-workspace';
    workspace.append(
      buildLobbyLocalBattleView({
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        playerCount: this.players.length,
        playerRows: this.players.map((_, index) => this.renderRow(index, listenerSignal)),
        vehicleInspection: this.renderVehiclePreview('inspection'),
        advanced: this.renderHotSeatBattlefield(listenerSignal),
        validationMessage: this.validationError(),
        onPlayerCountChange: (count) => { this.setPlayerCount(count); },
        onStart: () => { this.startLocalBattle(); },
        listenerSignal,
      }),
    );
    return workspace;
  }

  private renderVerifiedOperationsCommandWorkspace(listenerSignal: AbortSignal): HTMLElement {
    this.activeTab = 'hotseat';
    const workspace = document.createElement('div');
    workspace.className = 'multiplayer-command__verified-workspace';
    workspace.append(buildLobbyVerifiedOperationsView({
      verifiedDeployment: this.verifiedHotSeatView(),
      verifiedChallenge: this.verifiedChallengeHotSeatView(),
      verifiedSurface: this.verifiedHotSeatSurface,
      onVerifiedSurfaceChange: (surface, restoreFocus) => {
        this.verifiedHotSeatSurface = surface;
        this.render();
        if (restoreFocus) {
          this.root.querySelector<HTMLButtonElement>(
            `[role="tab"][data-verified-surface="${surface}"]`,
          )?.focus({ preventScroll: true });
        }
      },
      listenerSignal,
    }));
    return workspace;
  }

  private renderOnlineBattleCommandWorkspace(listenerSignal: AbortSignal): HTMLElement {
    const resumed = this.onlineWorkspaceSuspended;
    if (resumed) {
      this.onlineWorkspaceSuspended = false;
      this.roomController.activate();
      if (this.onlineSubView === 'waiting') void this.subscribeWaitingRoom();
    }
    this.browseLifetimeSignal = this.onlineSubView === 'browse' ? listenerSignal : null;
    if (resumed && this.onlineSubView === 'browse') {
      void this.fetchRooms(listenerSignal);
      this.startBrowsePoll();
    }
    this.activeTab = 'online';
    const onlineContent = this.networkRecoveryRetry
      ? this.renderOnlineRecoveryWorkspace(listenerSignal)
      : this.rejoinCandidate && this.onlineSubView === 'create'
        ? this.renderOnlineRejoinWorkspace(listenerSignal)
        : this.onlineSubView === 'create'
          ? this.renderCreateForm(listenerSignal)
          : this.onlineSubView === 'join'
            ? this.renderJoinForm(listenerSignal)
            : this.onlineSubView === 'browse'
              ? this.renderBrowse(listenerSignal)
              : this.renderWaitingRoom(listenerSignal);
    onlineContent.classList.add('multiplayer-command__online-route');
    const workspace = document.createElement('div');
    workspace.className = 'multiplayer-command__online-workspace';
    workspace.append(this.renderVehiclePreview(), onlineContent);
    return workspace;
  }

  private renderOnlineRejoinWorkspace(listenerSignal: AbortSignal): HTMLElement {
    const section = document.createElement('section');
    section.className = 'lobby-route-brief lobby-route-brief--online multiplayer-command__online-context';
    const header = document.createElement('header');
    header.className = 'lobby-route-brief__header';
    const title = document.createElement('h2');
    title.className = 'lobby-route-brief__title';
    title.textContent = 'Active operation';
    const description = document.createElement('p');
    description.className = 'lobby-route-brief__purpose';
    description.textContent = 'A compatible network battle is ready to resume.';
    header.append(title, description);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'lobby-btn primary';
    action.textContent = 'Rejoin your game';
    action.addEventListener('click', () => { void this.handleRejoin(); }, { signal: listenerSignal });
    section.append(header, action);
    return section;
  }

  private renderOnlineRecoveryWorkspace(listenerSignal: AbortSignal): HTMLElement {
    const section = document.createElement('section');
    section.className = 'lobby-route-brief lobby-route-brief--online multiplayer-command__online-context';
    const header = document.createElement('header');
    header.className = 'lobby-route-brief__header';
    const title = document.createElement('h2');
    title.className = 'lobby-route-brief__title';
    title.textContent = 'Recovery required';
    const description = document.createElement('p');
    description.className = 'lobby-route-brief__purpose';
    description.textContent = 'The operation is still selected. Retry without losing its owner.';
    header.append(title, description);
    section.append(header, this.renderOnlineStatus(true, listenerSignal));
    return section;
  }

  private releaseOnlineBattleCommandWorkspace(): void {
    // Shell-driven renders synchronously replace the same selected Online view.
    // Defer resource suspension so only a genuine navigation away tears down
    // browse/waiting resources rather than cancelling the route's own repaint.
    queueMicrotask(() => {
      if (this.root.querySelector('[data-multiplayer-command-view="online"]')) return;
      if (this.onlineWorkspaceSuspended) return;
      this.onlineWorkspaceSuspended = true;
      this.browseLifetimeSignal = null;
      this.roomController.suspendWorkspace();
      this.stopBrowsePoll();
      if (this.onlineSubView === 'waiting') this.cleanupWaitingChannel();
    });
  }

  private startLocalBattle(): void {
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
  }

  // ---- Create Room sub-view ----

  private renderCreateForm(listenerSignal: AbortSignal = this.renderListeners.signal): HTMLElement {
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
        listenerSignal,
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.onlineColor,
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
        listenerSignal,
        this.onlineBusy,
      ),
      advanced: this.renderAdvanced(listenerSignal),
      status: this.renderOnlineStatus(false, listenerSignal),
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
      listenerSignal,
    });
  }

  private renderOnlineAdvancedFields(
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const fields = document.createElement('div');
    fields.className = 'lobby-advanced-fields';
    fields.append(
      this.onlineNumberField('Wind cap', this.onlineMaxWind, (value) => { this.onlineMaxWind = value; }, {
        min: WIND_MIN, max: WIND_MAX, step: 1, placeholder: String(WIND_DEFAULT),
        hint: `${WIND_MIN}–${WIND_MAX}`,
      }, listenerSignal),
      this.onlineNumberField('Gravity', this.onlineGravity, (value) => { this.onlineGravity = value; }, {
        min: GRAVITY_MIN, max: GRAVITY_MAX, step: GRAVITY_STEP, placeholder: String(GRAVITY_DEFAULT),
        hint: `${GRAVITY_MIN}–${GRAVITY_MAX}`,
      }, listenerSignal),
      this.onlineChoiceField('Side walls', this.onlineWalls, (value) => { this.onlineWalls = value; }, [
        { value: '', label: 'Open — shots exit' },
        { value: 'reflective', label: 'Reflective — bank shots' },
        { value: 'wrap', label: 'Wrap — cross the arena' },
        { value: 'concrete', label: 'Concrete — impact at edge' },
      ], 'shots exit, rebound, or cross through paired arena edges', listenerSignal),
      this.onlineChoiceField('Battlefield', this.onlineBattlefieldWorld, (value) => { this.onlineBattlefieldWorld = value; }, [
        { value: '', label: 'Automatic — terrain decides' },
        { value: 'ember-dusk', label: 'Ember Dusk — post-apocalypse' },
        { value: 'obsidian-caldera', label: 'Obsidian Caldera — volcanic night' },
        { value: 'glassstorm-expanse', label: 'Glassstorm Expanse — ice' },
      ], 'visual world only; terrain and physics stay unchanged', listenerSignal),
      this.onlineChoiceField('Terrain hazards', this.onlineHazards, (value) => { this.onlineHazards = value; }, [
        { value: '', label: 'None — classic terrain' },
        { value: 'lava', label: 'Lava — lethal pools' },
      ], 'deterministic lava pools are solid to shells but lethal to tanks', listenerSignal),
      this.onlineChoiceField('Teams', this.onlineTeamMode ? '2v2' : '', (value) => { this.onlineTeamMode = value === '2v2'; }, [
        { value: '', label: 'Free-for-all' },
        { value: '2v2', label: '2v2 — alternating seats' },
      ], 'four seats only; teammates cannot damage each other', listenerSignal),
      this.onlineNumberField('Rounds', this.onlineRounds, (value) => { this.onlineRounds = value; }, {
        min: ROUNDS_MIN, max: ROUNDS_MAX, step: 2, placeholder: String(ROUNDS_DEFAULT), hint: 'best-of-N, odd',
      }, listenerSignal),
      this.onlineNumberField('Interest', this.onlineInterestRate, (value) => { this.onlineInterestRate = value; }, {
        min: INTEREST_MIN, max: INTEREST_MAX, step: INTEREST_STEP, placeholder: String(INTEREST_DEFAULT), hint: 'per-round credit interest (0–0.5)',
      }, listenerSignal),
      this.onlineNumberField('Sudden death', this.onlineSuddenDeath, (value) => { this.onlineSuddenDeath = value; }, {
        min: SUDDEN_DEATH_MIN, max: SUDDEN_DEATH_MAX, step: 1, placeholder: String(SUDDEN_DEATH_DEFAULT), hint: 'gravity ramps past this turn (0 = off)',
      }, listenerSignal),
      this.onlineNumberField('Arms level', this.onlineArmsLevel, (value) => { this.onlineArmsLevel = value; }, {
        min: ARMS_MIN, max: ARMS_MAX, step: 1, placeholder: String(ARMS_DEFAULT), hint: '0 = basic … 4 = full arsenal',
      }, listenerSignal),
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

  private renderJoinForm(listenerSignal: AbortSignal = this.renderListeners.signal): HTMLElement {
    return buildLobbyJoinView({
      code: this.joinCode,
      busy: this.onlineBusy,
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.joinColor,
        (value) => { this.setOnlineName(value); },
        (value) => { this.joinColor = value; this.render(); },
        [],
        listenerSignal,
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.joinColor,
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
        listenerSignal,
        this.onlineBusy,
      ),
      status: this.renderOnlineStatus(false, listenerSignal),
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
      listenerSignal,
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
    void this.fetchRooms(this.browseLifetimeSignal);
    this.startBrowsePoll();
  }

  /** Begin (or restart) the 3s list_rooms poll. */
  private startBrowsePoll(): void {
    this.session.startBrowsePoll(() => { void this.fetchRooms(this.browseLifetimeSignal); });
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

  private async fetchRooms(lifetimeSignal: AbortSignal | null = this.browseLifetimeSignal): Promise<void> {
    if (lifetimeSignal?.aborted) return;
    try {
      const { ok, data } = await this.transport.listRooms();

      // Only repaint if still on the browse view (the user may have navigated
      // away between the request and its response).
      if (lifetimeSignal?.aborted || this.onlineSubView !== 'browse') return;

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to load rooms.';
        this.render();
        return;
      }

      this.browseRooms = data?.rooms ?? [];
      this.onlineError = '';
      this.render();
    } catch (err) {
      if (lifetimeSignal?.aborted || this.onlineSubView !== 'browse') return;
      console.error('Lobby.fetchRooms: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.render();
    }
  }

  private renderBrowse(listenerSignal: AbortSignal = this.renderListeners.signal): HTMLElement {
    return buildLobbyBrowseView({
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.joinColor,
        (value) => { this.setOnlineName(value); },
        (value) => { this.joinColor = value; this.render(); },
        [],
        listenerSignal,
      ),
      garage: this.renderGarage(
        'online-player',
        'Your',
        this.joinColor,
        this.onlineLoadout,
        (loadout) => {
          this.onlineLoadout = loadout;
          this.render();
        },
        listenerSignal,
        this.onlineBusy,
      ),
      status: this.renderOnlineStatus(false, listenerSignal),
      rooms: this.browseRooms,
      busy: this.onlineBusy,
      onJoin: (code) => { void this.joinByCode(code); },
      onRefresh: () => { void this.fetchRooms(listenerSignal); },
      onCreate: () => { this.leaveBrowse('create'); },
      onJoinByCode: () => { this.leaveBrowse('join'); },
      listenerSignal,
    });
  }

  // ---- Waiting Room sub-view ----

  private renderWaitingRoom(listenerSignal: AbortSignal = this.renderListeners.signal): HTMLElement {
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
      selfEdit: this.renderWaitingSelfEdit(listenerSignal),
      status: this.renderOnlineStatus(false, listenerSignal),
      onCopyInvite: (button, status) => {
        void this.copyWaitingRoomInvite(button, status);
      },
      onReady: () => { void this.handleReadyUp(); },
      onLeave: () => { void this.handleLeaveRoom(); },
      listenerSignal,
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
  private renderWaitingSelfEdit(
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
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
    nameInput.disabled = this.onlineBusy;
    nameInput.addEventListener('input', () => {
      this.activatePreviewOwner('online-player');
      this.syncPreviewName('online-player', nameInput.value);
    }, { signal: listenerSignal });
    const commitName = (): void => {
      if (this.onlineBusy) return;
      const next = nameInput.value.trim();
      if (!next || next === me.name.trim()) return;
      void this.updateMe({ name: next });
    };
    nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); commitName(); }
    }, { signal: listenerSignal });
    nameInput.addEventListener('blur', () => { commitName(); }, { signal: listenerSignal });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'lobby-btn';
    applyBtn.style.cssText = 'padding:6px 12px;font-size:13px;';
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = this.onlineBusy;
    applyBtn.addEventListener('click', () => { commitName(); }, { signal: listenerSignal });

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
      }, { signal: listenerSignal });
      swatches.append(swatch);
    }
    wrapper.append(swatches);
    wrapper.append(this.renderGarage(
      'online-player',
      'Your',
      me.color,
      normalizeTankLoadout(me.loadout),
      (loadout) => {
        if (this.onlineBusy) return;
        void this.updateMe({ loadout });
      },
      listenerSignal,
      this.onlineBusy,
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
    if (this.onlineBusy) return;
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const result = await this.session.updatePlayer(fields);
      if ('stale' in result) {
        this.pendingGarageFocus = null;
        return;
      }
      const { ok, data } = result;

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to update.';
        this.onlineBusy = false;
        this.render();
        this.restorePendingGarageFocus();
        return;
      }

      this.onlineBusy = false;
      this.render();
      this.restorePendingGarageFocus();
    } catch (err) {
      console.error('Lobby.updatePlayer: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.onlineBusy = false;
      this.render();
      this.restorePendingGarageFocus();
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

  private renderOnlineStatus(
    includeRecovery = false,
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'online-status' + (this.onlineError ? ' error' : '');
    if (this.networkRecoveryRetry && !includeRecovery) return el;
    if (this.onlineError) {
      el.setAttribute('role', 'alert');
      const message = document.createElement('span');
      message.textContent = this.onlineError;
      el.append(message);
    }
    if (includeRecovery && this.networkRecoveryRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'lobby-btn primary';
      retry.dataset.networkRecoveryRetry = '';
      retry.textContent = 'Retry game recovery';
      retry.addEventListener('click', () => {
        const action = this.networkRecoveryRetry;
        this.networkRecoveryRetry = null;
        action?.();
      }, { signal: listenerSignal });
      el.append(retry);
    }
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
    listenerSignal: AbortSignal = this.renderListeners.signal,
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
    }, { signal: listenerSignal });

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
      }, { signal: listenerSignal });
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
    listenerSignal: AbortSignal = this.renderListeners.signal,
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
    input.addEventListener('input', () => { onChange(input.value); }, { signal: listenerSignal });

    const hint = document.createElement('span');
    hint.className = 'lobby-hint';
    hint.textContent = opts.hint;

    field.append(lab, input, hint);
    return field;
  }

  // ---- Hot seat helpers (unchanged) ----

  /** Render one player's row (name input + color swatches). */
  private renderRow(
    index: number,
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const player = this.players[index];
    if (player === undefined) throw new RangeError(`Missing lobby player at index ${index}`);
    const owner = `player-${index + 1}`;
    const ownerLabel = `Player ${index + 1}`;
    const selected = this.spotlightVehicle(this.previewRoster())?.owner === owner;
    const uniformKit = TANK_KIT_IDS.find((kit) =>
      TANK_PART_SLOTS.every((slot) => player.loadout[slot] === kit),
    );
    const appearance = uniformKit
      ? `${TANK_KIT_LABELS[uniformKit]} loadout`
      : `Mixed assembly: ${TANK_PART_SLOTS.map((slot) =>
        TANK_PART_VARIANT_LABELS[slot][player.loadout[slot]],
      ).join(', ')}`;
    const row = document.createElement('div');
    row.className = 'lobby-row';
    row.dataset.crewSeat = owner;
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${ownerLabel} crew seat`);
    if (selected) row.setAttribute('aria-current', 'true');

    const seatSelector = document.createElement('button');
    seatSelector.type = 'button';
    seatSelector.className = 'lobby-row__selector';
    seatSelector.dataset.crewSeatSelect = owner;
    seatSelector.setAttribute('aria-pressed', String(selected));
    seatSelector.setAttribute('aria-label', `Inspect ${ownerLabel} vehicle, ${appearance}`);
    const seatLabel = document.createElement('span');
    seatLabel.className = 'lobby-row__seat-label';
    seatLabel.textContent = ownerLabel;
    const appearanceLabel = document.createElement('strong');
    appearanceLabel.className = 'lobby-row__appearance';
    appearanceLabel.textContent = appearance;
    seatSelector.append(seatLabel, appearanceLabel);
    seatSelector.addEventListener('click', () => {
      this.activatePreviewOwner(owner);
    }, { signal: listenerSignal });

    row.addEventListener('focusin', () => {
      this.activatePreviewOwner(owner);
    }, { signal: listenerSignal });

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'lobby-name';
    name.value = player.name;
    // Match online-room validators so hot-seat and networked player identity
    // share one visible contract.
    name.maxLength = 20;
    name.placeholder = `Player ${index + 1}`;
    name.setAttribute('aria-label', `Player ${index + 1} name`);
    name.addEventListener('input', () => {
      player.name = name.value;
      this.activatePreviewOwner(owner);
      this.syncPreviewName(owner, name.value);
      this.refreshStartState();
    }, { signal: listenerSignal });

    const swatches = document.createElement('div');
    swatches.className = 'lobby-swatches';
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', `Player ${index + 1} color`);
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
      swatch.setAttribute('aria-pressed', String(player.color === color.value));
      swatch.setAttribute(
        'aria-label',
        `${ownerLabel} paint: ${color.name}${takenByOther ? ', unavailable' : ''}`,
      );
      if (takenByOther) swatch.setAttribute('aria-disabled', 'true');
      swatch.addEventListener('click', () => {
        if (takenByOther) return;
        this.spotlightOwner = owner;
        player.color = color.value;
        this.render();
      }, { signal: listenerSignal });
      swatches.append(swatch);
    }

    // Control selector: Human or a CPU difficulty. A CPU seat ignores its name
    // input visually (kept for color/label) and is driven by the AI at runtime.
    const control = document.createElement('select');
    control.className = 'lobby-control';
    control.title = 'Who controls this tank';
    control.setAttribute('aria-label', `Player ${index + 1} controller`);
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
      this.spotlightOwner = owner;
      // Default a friendly CPU name if the seat is still on its placeholder.
      if (player.ai && !player.name.trim()) {
        player.name = `CPU ${index + 1}`;
      }
      this.render();
    }, { signal: listenerSignal });

    row.append(seatSelector, name, swatches, control);
    row.append(this.renderGarage(
      owner,
      ownerLabel,
      player.color,
      player.loadout,
      (loadout) => {
        player.loadout = loadout;
        this.render();
      },
      listenerSignal,
    ));
    return row;
  }

  /**
   * Render the collapsible "Advanced settings" section: wind cap, gravity, and
   * seed. Each input stays blank (placeholder shows the engine default) unless
   * the user types a value; blank fields are omitted from the emitted config so
   * the engine default applies.
   */
  private renderAdvanced(listenerSignal: AbortSignal = this.renderListeners.signal): HTMLElement {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lobby-advanced-trigger lobby-btn secondary';
    trigger.textContent = 'Advanced settings';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', () => {
      this.accountPanelOpen = false;
      this.settingsOpen = true;
      this.render();
    }, { signal: listenerSignal });
    return trigger;
  }

  /** Direct Hot Seat battlefield controls share the exact SettingsState parsed at launch. */
  private renderHotSeatBattlefield(
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const fields = document.createElement('div');
    fields.className = 'lobby-hotseat-battlefield';
    fields.append(
      this.numberField('Rounds', 'rounds', {
        min: ROUNDS_MIN, max: ROUNDS_MAX, step: 2,
        placeholder: String(ROUNDS_DEFAULT), hint: 'best-of-N, odd',
      }, listenerSignal),
      this.numberField('Wind', 'maxWind', {
        min: WIND_MIN, max: WIND_MAX, step: 1,
        placeholder: String(WIND_DEFAULT), hint: `${WIND_MIN}–${WIND_MAX}`,
      }, listenerSignal),
      this.choiceField('lobby-hotseat-direct-walls', 'Walls', this.settings.walls, (value) => {
        this.settings.walls = value;
      }, [
        { value: '', label: 'Open — shots exit' },
        { value: 'reflective', label: 'Reflective — bank shots' },
        { value: 'wrap', label: 'Wrap — paired edges' },
        { value: 'concrete', label: 'Concrete — impact at edge' },
      ], 'arena edge behavior', listenerSignal),
      this.renderAdvanced(listenerSignal),
    );
    return fields;
  }

  private focusRequestedVerifiedDeployment(): void {
    if (!this.focusVerifiedDeploymentRequested || this.root.hidden) return;
    const verifiedItem = this.root.querySelector<HTMLButtonElement>(
      '[data-command-item="verified-operations"]',
    );
    if (this.focusVerifiedChallengeRequested) {
      const target = this.root.querySelector<HTMLButtonElement>('[data-verified-challenge] button:not(:disabled)')
        ?? this.root.querySelector<HTMLButtonElement>('[data-verified-surface="challenge"]')
        ?? verifiedItem;
      if (!target) return;
      target.focus();
      this.focusVerifiedChallengeRequested = false;
      this.focusVerifiedDeploymentRequested = false;
      return;
    }
    if (!verifiedItem) return;
    (this.root.querySelector<HTMLButtonElement>(
      '.lobby-verified-deployment__launch:not(:disabled)',
    ) ?? verifiedItem).focus({ preventScroll: true });
    this.focusVerifiedDeploymentRequested = false;
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
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const lab = document.createElement('label');
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.setAttribute('aria-label', label);
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    if (opts.step !== undefined) input.step = String(opts.step);
    input.placeholder = opts.placeholder;
    input.value = this.settings[key];
    input.addEventListener('input', () => {
      this.settings[key] = input.value;
    }, { signal: listenerSignal });

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
    listenerSignal: AbortSignal = this.renderListeners.signal,
  ): HTMLElement {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return this.choiceField(
      `lobby-online-${slug}`,
      label,
      value,
      onChange,
      choices,
      hintText,
      listenerSignal,
    );
  }

  private choiceField(
    controlId: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    choices: ReadonlyArray<{ value: string; label: string }>,
    hintText: string,
    listenerSignal: AbortSignal = this.renderListeners.signal,
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
    select.addEventListener('change', () => onChange(select.value), { signal: listenerSignal });

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
    const msg = this.validationError();
    if (error) error.textContent = msg ?? '';
    if (start) start.disabled = msg !== null;
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

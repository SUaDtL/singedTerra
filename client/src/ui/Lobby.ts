import type { AiDifficulty } from '@shared/types/GameState';
import {
  normalizeBattlefieldWorldId,
  normalizeWallMode,
} from '@shared/types/GameOptions';
import { normalizeTerrainHazardMode } from '@shared/engine/Terrain';
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
import { buildLobbyBrowseView } from './LobbyBrowseView';
import { buildLobbyCreateView } from './LobbyCreateView';
import { buildLobbyJoinView } from './LobbyJoinView';
import { buildLobbyOnlineView, buildLobbyShellView } from './LobbyShellView';
import { buildLobbyWaitingView } from './LobbyWaitingView';
import { buildAccountPanelOverlayContent, buildAccountPanelView } from './AccountPanelView';
import { buildLobbyOverlayView } from './LobbyOverlayView';
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
import { writeSession, clearSession, readSession, isLiveSession, type SessionDescriptor } from '../lib/sessionDescriptor';
import {
  AccountSession,
  type AccountCredentials,
  type AccountMode,
  type AccountState,
} from '../client/AccountSession';
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
  parseNumber,
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
export interface LobbyPlayer {
  /** Supabase-assigned UUID; present in network mode, absent in hot-seat. */
  id?: string;
  name: string;
  color: string;
  /** CPU difficulty when this seat is a computer opponent (hot-seat only);
   *  absent => human. */
  ai?: AiDifficulty;
  /** Presentation-only authored part selection. */
  loadout?: TankLoadout;
}

/** Configuration produced by the lobby once the player(s) are ready. */
export interface LobbyConfig {
  mode: GameMode;
  /** Chosen players (2-4) with unique colors. Consumed by main.ts. */
  players: LobbyPlayer[];
  /** Convenience list of names, kept for compatibility. */
  playerNames: string[];
  /** Room code for network mode (4-char alphanumeric), if applicable. */
  roomCode?: string;
  /** UUID of the room (network mode only). */
  roomId?: string;
  /** UUID assigned to this client's player (network mode only). */
  playerId?: string;
  /** Secret per-seat credential issued by create_room/join_room (network mode
   *  only). Required on every mutating request; ADR-0009 split-identity. */
  token?: string;
  /** Optional advanced engine settings; only set fields are present. */
  settings?: LobbySettings;
}

// localStorage key under which a seat's SECRET token is persisted, keyed by the
// PUBLIC playerId (not roomId) — playerId is stable across a rematch (the
// server copies the token to the successor room under the same seat id), so
// this key keeps resolving to a valid token after migration. All access is
// guarded by try/catch: private-mode / disabled storage must not crash the game.
const SEAT_TOKEN_PREFIX = 'singedterra:seat:';

function seatTokenKey(playerId: string): string {
  return `${SEAT_TOKEN_PREFIX}${playerId}`;
}

/** Best-effort persist of a seat token; never throws. */
function writeSeatToken(playerId: string, token: string): void {
  try {
    localStorage.setItem(seatTokenKey(playerId), token);
  } catch {
    /* localStorage unavailable — token just isn't persisted across reloads */
  }
}

/**
 * Best-effort read of a persisted seat token; never throws. Mirrors
 * `readSeatToken` in `client/src/client/NetworkClient.ts` (same key scheme) —
 * used by T-10's `handleRejoin()` to pass the stored secret explicitly (belt
 * and suspenders: NetworkClient also falls back to this same localStorage
 * read internally when the constructor's `token` param is empty).
 */
function readSeatToken(playerId: string): string | undefined {
  try {
    return localStorage.getItem(seatTokenKey(playerId)) ?? undefined;
  } catch {
    return undefined; // localStorage unavailable — nothing persisted
  }
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

// View-only advanced-settings defaults/steps (placeholders + input granularity).
// The bounds (WIND_MIN/MAX, GRAVITY_MIN/MAX, ROUNDS_*, INTEREST_*, SUDDEN_DEATH_*,
// ARMS_*) live in ./lobbyValidation alongside the coercion that enforces them.
const WIND_DEFAULT = 10;
const GRAVITY_STEP = 0.01;
const GRAVITY_DEFAULT = 0.15;
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

export interface AccountSessionPort {
  readonly state: AccountState;
  initialize(): Promise<void>;
  submit(mode: AccountMode, credentials: AccountCredentials): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null>;
}

type AccountSessionFactory = (
  onChange: (state: AccountState) => void,
) => AccountSessionPort;

/**
 * Lobby is the pre-game DOM overlay (SPEC §3): pick the number of players,
 * enter names, and choose a unique color per player from a fixed palette.
 * Calls onReady with the resulting hot-seat config when the player starts.
 */
export class Lobby {
  private readonly root: HTMLElement;
  private readonly onReady: (config: LobbyConfig) => void;

  /** Owns the seven Edge-Function calls (create/join/list/heartbeat/ready/leave/update). */
  private readonly transport = new LobbyTransport();
  private readonly session: LobbySession;
  private readonly accountSession: AccountSessionPort;
  private accountPanelOpen = false;
  private accountMode: AccountMode = 'sign-in';

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

  // Shared online status message
  private onlineError = '';
  private onlineBusy = false;
  private leavingRoom = false;

  /**
   * T-09 (rejoin-after-refresh, AC-05) — the validated rejoin candidate, set
   * only once `checkRejoinCandidate()` confirms the stored session descriptor
   * points at a still-`active` room with the stored seat present. `null` means
   * "no affordance": either no descriptor was stored, validation hasn't
   * resolved yet, or the room turned out to be stale/invalid.
   */
  private rejoinCandidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null = null;

  constructor(
    root: HTMLElement,
    onReady: (config: LobbyConfig) => void,
    createAccountSession: AccountSessionFactory = (onChange) => new AccountSession(onChange),
  ) {
    this.root = root;
    this.onReady = onReady;
    this.players = [defaultRow(0), defaultRow(1)];
    this.session = new LobbySession(this.transport, (event) => this.handleSessionEvent(event));
    this.accountSession = createAccountSession(() => { this.renderForAccountChange(); });
    const inviteCode = readRoomInviteCode(window.location.href);
    if (inviteCode) {
      this.surface = 'preparation';
      this.activeTab = 'online';
      this.onlineSubView = 'join';
      this.joinCode = inviteCode;
    }
  }

  private renderForAccountChange(): void {
    const restoreFocus = this.accountPanelOpen;
    this.render();
    if (restoreFocus) this.focusAccountOverlay();
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
  show(): void {
    this.injectStyle();
    this.render();
    this.root.hidden = false;
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
    const descriptor = readSession();
    if (!descriptor) {
      this.rejoinCandidate = null;
      return;
    }
    const room = await this.transport.fetchRoom(descriptor.roomId);
    if (isLiveSession(descriptor, room)) {
      this.rejoinCandidate = { descriptor, room: room! };
      this.render();
    } else {
      // T-11 (AC-07) — a stale descriptor (finished/deleted/seat-removed room)
      // is forgotten silently on passive load: no banner, no error message,
      // and no more re-validating a room that will never come back.
      this.rejoinCandidate = null;
      clearSession();
    }
  }

  /** Hide the lobby overlay (e.g. once the game starts). */
  hide(): void {
    this.cleanupWaitingChannel();
    this.stopBrowsePoll();
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  refreshAccount(): Promise<void> {
    return this.accountSession.refresh();
  }

  recordHotSeatMatch(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null> {
    return this.accountSession.recordHotSeatMatch(result);
  }

  isAccountAnonymous(): boolean {
    return this.accountSession.state.status === 'anonymous';
  }

  showAccountSignIn(): void {
    this.accountMode = 'sign-in';
    this.accountPanelOpen = true;
    this.render();
    this.focusAccountOverlay();
  }

  /** Inject the lobby's scoped <style> once (do NOT edit index.html). */
  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Fill the whole 1200x600 stage (same size as the game field). The #app
         gold frame + CRT overlay still frame it. Primary lobby views fit the
         stage without an inner scrollbar; dense online lists may still scroll. */
      #lobby .lobby-card {
        position: relative;
        width: 100%;
        height: 100%;
        max-width: none;
        margin: 0;
        box-sizing: border-box;
        padding: 26px 56px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        justify-content: safe center;
        background:
          radial-gradient(70% 92% at 78% 42%, rgba(142, 47, 83, 0.24), rgba(142, 47, 83, 0) 54%),
          radial-gradient(40% 80% at 18% 50%, rgba(255, 210, 63, 0.08), rgba(255, 210, 63, 0) 58%),
          linear-gradient(90deg, rgba(12, 7, 22, 0.98) 0%, rgba(12, 7, 22, 0.94) 48%, rgba(18, 10, 34, 0.90) 100%);
        border: none;
        border-radius: 0;
        color: var(--text);
        font-family: var(--font-sans);
      }
      #lobby .lobby-card::before {
        content: '';
        position: absolute;
        top: 58px;
        right: 52px;
        bottom: 54px;
        width: min(520px, 42%);
        pointer-events: none;
        border: 1px solid rgba(255, 210, 63, 0.20);
        border-radius: 10px;
        background:
          radial-gradient(circle at 62% 46%, rgba(255, 233, 168, 0.82) 0 3%, rgba(255, 178, 74, 0.50) 7%, rgba(255, 122, 31, 0.16) 18%, rgba(255, 122, 31, 0) 26%),
          radial-gradient(80% 42% at 50% 70%, rgba(255, 122, 31, 0.18), rgba(255, 122, 31, 0) 64%),
          linear-gradient(180deg, rgba(22, 13, 46, 0.10) 0%, rgba(58, 29, 94, 0.16) 42%, rgba(142, 47, 83, 0.24) 62%, rgba(90, 58, 34, 0.54) 62.5%, rgba(29, 18, 11, 0.78) 100%),
          repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 5px);
        box-shadow:
          0 18px 46px rgba(0, 0, 0, 0.38),
          inset 0 0 0 1px rgba(255, 233, 168, 0.08),
          inset 0 -42px 55px rgba(29, 18, 11, 0.50);
        opacity: 0.78;
      }
      #lobby .lobby-card::after {
        content: 'LOCKSTEP ARTILLERY';
        position: absolute;
        right: 74px;
        bottom: 72px;
        pointer-events: none;
        color: rgba(255, 233, 168, 0.30);
        font-family: var(--font-display);
        font-size: 10px;
        letter-spacing: 3px;
      }
      #lobby .lobby-preview {
        position: absolute;
        top: 58px;
        right: 52px;
        bottom: 54px;
        width: min(520px, 42%);
        max-width: none;
        margin: 0;
        z-index: 2;
        pointer-events: none;
        overflow: hidden;
        border: 1px solid rgba(255, 210, 63, 0.24);
        border-radius: 10px;
        background:
          radial-gradient(circle at 67% 45%, rgba(255, 233, 168, 0.85) 0 3%, rgba(255, 178, 74, 0.50) 8%, rgba(255, 122, 31, 0.16) 19%, rgba(255, 122, 31, 0) 30%),
          linear-gradient(180deg, rgba(22, 13, 46, 0.20) 0%, rgba(58, 29, 94, 0.22) 45%, rgba(142, 47, 83, 0.30) 62%, rgba(90, 58, 34, 0.60) 62.5%, rgba(29, 18, 11, 0.88) 100%),
          repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 5px);
        box-shadow:
          0 18px 46px rgba(0, 0, 0, 0.38),
          inset 0 0 0 1px rgba(255, 233, 168, 0.08),
          inset 0 -42px 55px rgba(29, 18, 11, 0.50);
      }
      #lobby .lobby-preview::before,
      #lobby .lobby-preview::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        pointer-events: none;
      }
      #lobby .lobby-preview::before {
        bottom: 132px;
        height: 74px;
        background:
          linear-gradient(166deg, transparent 0 42%, rgba(22, 13, 46, 0.42) 42.4% 56%, transparent 56.4%),
          linear-gradient(12deg, transparent 0 54%, rgba(255, 122, 31, 0.10) 54.4% 63%, transparent 63.4%);
      }
      #lobby .lobby-preview::after {
        bottom: 0;
        height: 140px;
        background:
          linear-gradient(170deg, transparent 0 42%, rgba(122, 79, 46, 0.44) 42.4% 47%, transparent 47.4%),
          repeating-linear-gradient(to right, rgba(255, 210, 63, 0.045) 0 4px, transparent 4px 24px),
          linear-gradient(180deg, rgba(122, 79, 46, 0.54), rgba(29, 18, 11, 0.92));
        clip-path: polygon(0 24%, 18% 11%, 37% 22%, 55% 6%, 73% 18%, 100% 8%, 100% 100%, 0 100%);
      }
      #lobby .lobby-preview__label {
        position: absolute;
        left: 22px;
        top: 18px;
        color: rgba(255, 233, 168, 0.42);
        font-family: var(--font-display);
        font-size: 9px;
        letter-spacing: 2.6px;
        text-transform: uppercase;
      }
      #lobby .lobby-preview__spotlight {
        position: absolute;
        z-index: 3;
        top: 40px;
        left: 18px;
        right: 18px;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        justify-items: center;
        color: var(--text);
        filter: drop-shadow(0 18px 18px rgba(0, 0, 0, 0.34));
      }
      #lobby .lobby-preview__spotlight-identity {
        position: absolute;
        top: 6px;
        left: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 20px);
        color: var(--text-gold);
        font: 700 13px/1 var(--font-display);
        letter-spacing: 0.7px;
        text-shadow: 0 2px 7px rgba(0, 0, 0, 0.75);
      }
      #lobby .lobby-preview__spotlight-identity::before {
        content: '';
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--tank-color);
        box-shadow: 0 0 10px var(--tank-color);
      }
      #lobby .lobby-preview__spotlight-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #lobby .lobby-preview__spotlight-canvas {
        display: block;
        width: min(320px, 82%);
        height: auto;
      }
      #lobby .lobby-preview__parts {
        width: min(440px, calc(100% - 24px));
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 5px;
        margin-top: -12px;
      }
      #lobby .lobby-preview__part {
        min-width: 0;
        padding: 6px 5px;
        border-top: 1px solid rgba(255, 210, 63, 0.25);
        background: linear-gradient(180deg, rgba(12, 7, 22, 0.48), rgba(12, 7, 22, 0.18));
        text-align: center;
      }
      #lobby .lobby-preview__part span,
      #lobby .lobby-preview__part strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #lobby .lobby-preview__part span {
        color: rgba(255, 233, 168, 0.48);
        font: 700 8px/1.2 var(--font-sans);
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
      #lobby .lobby-preview__part strong {
        margin-top: 3px;
        color: rgba(255, 233, 168, 0.90);
        font: 700 9px/1.15 var(--font-mono);
      }
      #lobby .lobby-preview__convoy {
        position: absolute;
        z-index: 3;
        left: 0;
        right: 0;
        bottom: 103px;
        height: 82px;
      }
      #lobby .lobby-preview__tank {
        position: absolute;
        left: calc(var(--slot, 0) * 108px + 22px);
        bottom: calc(var(--slot, 0) * -2px);
        width: 90px;
        height: 56px;
        animation: lobby-tank-roll 2.4s ease-in-out infinite;
        animation-delay: calc(var(--slot, 0) * -0.42s);
        filter: drop-shadow(0 11px 12px rgba(0, 0, 0, 0.42));
      }
      #lobby .lobby-preview__canvas {
        display: block;
        width: 84px;
        height: 48px;
      }
      #lobby .lobby-preview__name {
        position: absolute;
        left: 50%;
        top: 49px;
        transform: translateX(-50%);
        max-width: 80px;
        overflow: hidden;
        color: rgba(255, 233, 168, 0.78);
        font: 700 10px/1 var(--font-mono);
        text-overflow: ellipsis;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        white-space: nowrap;
      }
      @keyframes lobby-tank-roll {
        0%, 100% { translate: 0 0; }
        45% { translate: 10px -2px; }
        70% { translate: 18px 1px; }
      }
      @media (prefers-reduced-motion: reduce) {
        #lobby .lobby-preview__tank { animation: none; }
      }
      /* Keep the form readable on the wide panel: constrain content width,
         centred, while the dusk panel itself spans the full field. */
      #lobby .lobby-card > * {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 600px;
        margin-left: 32px;
        margin-right: auto;
      }
      #lobby .lobby-card > .lobby-preview {
        position: absolute;
        top: 58px;
        right: 52px;
        bottom: 54px;
        left: auto;
        width: min(520px, 42%);
        height: auto;
        max-width: none;
        margin: 0;
        z-index: 2;
      }
      #lobby h1 {
        margin: 0 0 2px; font-size: 42px; line-height: 1; letter-spacing: 0.5px;
        font-family: var(--font-display); font-weight: bold;
        color: var(--gold);
        text-shadow:
          0 2px 0 rgba(12, 7, 22, 0.85),
          0 0 20px rgba(255, 122, 31, 0.48);
      }
      #lobby .lobby-sub {
        margin: 0 0 14px;
        color: var(--text-dim);
        font-size: 13px;
        letter-spacing: 0.02em;
      }
      #lobby .lobby-field { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      #lobby .lobby-field > label { width: 92px; color: var(--text-dim); font-size: 13px; }
      #lobby select, #lobby input[type="text"] {
        background:
          linear-gradient(180deg, rgba(255, 210, 63, 0.045), rgba(12, 7, 22, 0.78)),
          rgba(12, 7, 22, 0.78);
        color: var(--text);
        border: 1px solid rgba(255, 210, 63, 0.28);
        border-radius: 6px; padding: 8px 10px; font-size: 14px; font-family: var(--font-sans);
      }
      #lobby select:focus, #lobby input[type="text"]:focus {
        outline: none; border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold);
      }
      #lobby .lobby-rows { display: flex; flex-direction: column; gap: 7px; margin: 5px 0 10px; }
      #lobby .lobby-row { display: flex; align-items: center; gap: 10px; }
      #lobby .lobby-row { flex-wrap: wrap; }
      #lobby .lobby-row .lobby-name { flex: 1; }
      #lobby .lobby-row input[type="text"] { width: 100%; box-sizing: border-box; }
      #lobby .lobby-swatches { display: flex; gap: 6px; }
      #lobby .lobby-control {
        flex: 0 0 auto;
        padding: 8px 10px;
        border: 1px solid rgba(255, 210, 63, 0.34);
        border-radius: 6px;
        background: linear-gradient(180deg, rgba(255, 210, 63, 0.06), rgba(12, 7, 22, 0.88));
        color: var(--text-gold, #ffe9b0);
        font-family: var(--font-sans, sans-serif);
        font-size: 12px;
        cursor: pointer;
      }
      #lobby .lobby-control:hover { border-color: var(--ember, #ff7a1f); }
      #lobby .lobby-garage {
        flex: 1 0 100%;
        display: grid;
        grid-template-columns: 42px minmax(174px, auto) 1fr;
        align-items: center;
        gap: 6px;
        padding: 5px 7px;
        box-sizing: border-box;
        border: 1px solid rgba(255, 210, 63, 0.16);
        border-radius: 7px;
        background: linear-gradient(90deg, rgba(255, 210, 63, 0.055), rgba(12, 7, 22, 0.45));
      }
      #lobby .lobby-garage__heading {
        color: var(--text-gold);
        font: 700 10px/1 var(--font-display);
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      #lobby .lobby-garage__open,
      #lobby .lobby-garage__close {
        display: none;
      }
      #lobby .lobby-garage__presets,
      #lobby .lobby-garage__slots {
        display: flex;
        gap: 3px;
        min-width: 0;
      }
      #lobby .lobby-garage button {
        min-height: 28px;
        border: 1px solid rgba(255, 210, 63, 0.20);
        border-radius: 5px;
        background: rgba(12, 7, 22, 0.72);
        color: var(--text-dim);
        cursor: pointer;
        font-family: var(--font-sans);
      }
      #lobby .lobby-garage button:hover,
      #lobby .lobby-garage button:focus-visible {
        border-color: var(--ember);
        color: var(--text-gold);
      }
      #lobby .lobby-garage__preset {
        padding: 4px 5px;
        font-size: 9px;
      }
      #lobby .lobby-garage__preset.selected {
        border-color: var(--gold);
        color: var(--ink);
        background: linear-gradient(180deg, #ffe478, #d99b21);
      }
      #lobby .lobby-garage__slot {
        flex: 1;
        min-width: 0;
        padding: 3px 2px;
        text-align: left;
      }
      #lobby .lobby-garage__slot span,
      #lobby .lobby-garage__slot strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #lobby .lobby-garage__slot span {
        color: rgba(255, 233, 168, 0.52);
        font-size: 8px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      #lobby .lobby-garage__slot strong {
        color: var(--text);
        font-size: 9px;
        font-weight: 700;
      }
      #lobby .lobby-hotseat.crowded .lobby-sub { display: none; }
      #lobby .lobby-hotseat.crowded .lobby-field { margin-bottom: 4px; }
      #lobby .lobby-rows.crowded {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 8px;
        margin: 2px 0 6px;
      }
      #lobby .lobby-rows.crowded .lobby-row {
        display: grid;
        grid-template-columns: minmax(68px, 1fr) auto 78px;
        align-items: center;
        gap: 4px;
        padding: 4px;
        min-width: 0;
        border: 1px solid rgba(255, 210, 63, 0.13);
        border-radius: 7px;
        background: rgba(12, 7, 22, 0.36);
      }
      #lobby .lobby-rows.crowded .lobby-name { min-width: 0; }
      #lobby .lobby-rows.crowded .lobby-row input[type="text"] {
        padding: 6px 7px;
        font-size: 11px;
      }
      #lobby .lobby-rows.crowded .lobby-swatches { gap: 2px; }
      #lobby .lobby-rows.crowded .lobby-swatch {
        width: 13px;
        height: 13px;
        border-width: 1px;
        box-shadow: inset 0 -3px 4px rgba(0, 0, 0, 0.22);
      }
      #lobby .lobby-rows.crowded .lobby-control {
        width: 78px;
        min-width: 0;
        padding: 6px 4px;
        font-size: 9px;
      }
      #lobby .lobby-rows.crowded .lobby-garage {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: 3px;
        padding: 3px;
      }
      #lobby .lobby-rows.crowded .lobby-garage__heading { display: none; }
      #lobby .lobby-rows.crowded .lobby-garage__presets,
      #lobby .lobby-rows.crowded .lobby-garage__slots {
        display: contents;
      }
      #lobby .lobby-rows.crowded .lobby-garage button {
        min-height: 24px;
        padding: 2px;
        font-size: 0;
        text-align: center;
      }
      #lobby .lobby-rows.crowded .lobby-garage button::after {
        content: attr(data-short);
        font-size: 9px;
        font-weight: 700;
      }
      #lobby .lobby-rows.crowded .lobby-garage__slot > * { display: none; }
      #lobby .lobby-swatch {
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        border: 2px solid transparent; padding: 0; background-clip: padding-box;
        transition: transform 80ms ease;
        box-shadow: inset 0 -6px 8px rgba(0, 0, 0, 0.22);
      }
      #lobby .lobby-swatch:hover { transform: scale(1.12); }
      #lobby .lobby-swatch.selected { border-color: var(--gold); box-shadow: 0 0 8px rgba(255, 210, 63, 0.5); }
      #lobby .lobby-swatch.taken { opacity: 0.3; cursor: not-allowed; }
      /* Below 0.8 stage scale, tiny inline controls become a single large
         Garage trigger plus a focused editor. Logical dimensions account for
         the whole-stage CSS zoom, preserving >=24 rendered-pixel targets. */
      #app.is-compact #lobby .lobby-swatch,
      #app.is-compact #lobby .lobby-rows.crowded .lobby-swatch {
        width: 44px;
        height: 44px;
        border-width: 2px;
      }
      #app.is-compact #lobby .lobby-rows.crowded .lobby-row {
        grid-template-columns: minmax(60px, 1fr) 68px 48px;
      }
      #app.is-compact #lobby .lobby-rows.crowded .lobby-swatches {
        grid-column: 1 / -1;
        grid-row: 2;
        justify-content: center;
        gap: 4px;
      }
      #app.is-compact #lobby .lobby-rows.crowded .lobby-control {
        grid-column: 2;
        grid-row: 1;
        width: 68px;
      }
      #app.is-compact #lobby .lobby-rows.crowded .lobby-garage:not(.editing) {
        grid-column: 3;
        grid-row: 1;
      }
      #app.is-compact #lobby .lobby-garage:not(.editing),
      #app.is-compact #lobby .lobby-rows.crowded .lobby-garage:not(.editing) {
        display: block;
        padding: 0;
        border: 0;
        background: none;
      }
      #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__heading,
      #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__presets,
      #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__slots,
      #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__close {
        display: none;
      }
      #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__open {
        display: flex;
        width: 100%;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        color: var(--text-gold);
        font-size: 13px;
        font-weight: 700;
      }
      #app.is-compact #lobby .lobby-rows.crowded
        .lobby-garage:not(.editing) .lobby-garage__open {
        padding: 4px;
        font-size: 9px;
        line-height: 1.05;
      }
      #app.is-compact #lobby .lobby-garage.editing {
        position: fixed;
        inset: 28px;
        z-index: 100;
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr);
        grid-template-rows: auto auto minmax(0, 1fr) auto;
        align-content: stretch;
        gap: 8px;
        padding: 16px;
        overflow: hidden;
        border: 2px solid rgba(255, 210, 63, 0.66);
        border-radius: 0;
        background:
          radial-gradient(circle at 80% 20%, rgba(142, 47, 83, 0.24), transparent 38%),
          linear-gradient(145deg, #160d2e, #0c0716 72%);
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.78);
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__editor-header {
        display: block;
        grid-column: 1 / -1;
        color: var(--gold);
        font-size: 14px;
        letter-spacing: 1.5px;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__build-summary {
        grid-column: 1 / -1;
        margin: 0;
        color: var(--text-dim);
        font: 11px/1.25 var(--font-sans);
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__preset-group,
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__component-group {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 5px;
        min-width: 0;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__group-label {
        color: rgba(255, 233, 168, 0.56);
        font: 700 9px/1 var(--font-display);
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__open {
        display: none;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__presets,
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slots {
        display: grid;
        gap: 10px;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slots {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      #app.is-compact #lobby .lobby-garage.editing button {
        min-height: 52px;
        padding: 8px 12px;
        font-size: 13px;
      }
      #app.is-compact #lobby .lobby-garage.editing button::after {
        content: none;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slot {
        text-align: left;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slot > * {
        display: block;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slot span {
        font-size: 10px;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__slot strong {
        font-size: 13px;
      }
      #app.is-compact #lobby .lobby-garage.editing .lobby-garage__close {
        display: block;
        grid-column: 1 / -1;
        color: var(--ink);
        font-weight: 800;
        background: linear-gradient(180deg, #ffe478, #d99b21);
      }
      @media (pointer: coarse) {
        #app.is-compact #lobby .lobby-swatch,
        #app.is-compact #lobby .lobby-rows.crowded .lobby-swatch {
          width: 50px;
          height: 50px;
        }
        #app.is-compact #lobby .lobby-rows.crowded .lobby-row {
          grid-template-columns: minmax(60px, 1fr) 68px 50px;
        }
        #app.is-compact #lobby .lobby-garage:not(.editing) .lobby-garage__open {
          min-height: 50px;
        }
      }
      #lobby .lobby-error { color: var(--tank-red); font-size: 13px; min-height: 18px; margin-bottom: 10px; }
      #lobby .lobby-error:empty { display: none; }
      /* Rejoin affordance (T-09) — a prominent banner at the top of the lobby,
         shown only when a stored session validates as still live. */
      #lobby .lobby-rejoin-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        margin: 0 0 18px; padding: 10px 14px;
        background: rgba(255, 210, 63, 0.1);
        border: 1px solid rgba(255, 210, 63, 0.35);
        border-radius: 6px;
      }
      #lobby .lobby-rejoin-text { color: var(--text-gold, #ffe9b0); font-size: 13px; }
      #lobby .lobby-rejoin-banner .lobby-btn { padding: 6px 14px; font-size: 13px; flex: 0 0 auto; }
      #lobby .lobby-start {
        width: 100%; padding: 12px; font-size: 16px; font-weight: bold; cursor: pointer;
        background:
          linear-gradient(180deg, #ffe478, var(--gold) 52%, #d99b21);
        color: var(--ink); border: none; border-radius: 7px;
        font-family: var(--font-display); letter-spacing: 0.5px;
        box-shadow: 0 10px 26px rgba(255, 122, 31, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.35);
        transition: background 130ms ease, transform 80ms ease, box-shadow 130ms ease;
      }
      #lobby .lobby-start:hover:not(:disabled) {
        background: linear-gradient(180deg, #ffb86c, var(--ember) 56%, var(--ember-deep));
        box-shadow: 0 12px 30px rgba(255, 122, 31, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.24);
      }
      #lobby .lobby-start:active:not(:disabled) { transform: translateY(1px); }
      #lobby .lobby-start:disabled { background: rgba(255, 255, 255, 0.12); color: var(--text-dim); cursor: not-allowed; }
      #lobby .lobby-advanced { margin: 0 0 10px; border-top: 1px solid rgba(255, 210, 63, 0.14); padding-top: 8px; }
      #lobby .lobby-advanced > summary {
        cursor: pointer; color: var(--text-dim); font-size: 13px; list-style: none;
        user-select: none; margin-bottom: 4px;
      }
      #lobby .lobby-advanced > summary::-webkit-details-marker { display: none; }
      #lobby .lobby-advanced > summary::before { content: '\\25B8 '; }
      #lobby .lobby-advanced[open] > summary::before { content: '\\25BE '; }
      #lobby .lobby-advanced .lobby-field > label { width: 110px; }
      #lobby .lobby-advanced input[type="number"] {
        background: rgba(12, 7, 22, 0.7); color: var(--text); border: 1px solid rgba(255, 210, 63, 0.2);
        border-radius: 5px; padding: 6px 8px; font-size: 14px; width: 110px; font-family: var(--font-mono);
      }
      #lobby .lobby-advanced .lobby-hint { color: var(--text-dim); font-size: 12px; margin-left: 8px; }

      /* Tab bar */
      #lobby .lobby-tabs {
        display: flex; gap: 6px; margin-bottom: 14px;
        padding: 4px;
        border: 1px solid rgba(255, 210, 63, 0.16);
        border-radius: 9px;
        background: rgba(12, 7, 22, 0.58);
      }
      #lobby .lobby-tab {
        flex: 1;
        padding: 9px 18px; font-size: 14px; font-weight: 700;
        cursor: pointer; background: none; border: 1px solid transparent;
        border-radius: 6px;
        color: var(--text-dim);
        font-family: var(--font-sans);
        transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      #lobby .lobby-tab.active {
        color: var(--text-gold);
        border-color: rgba(255, 210, 63, 0.36);
        background: rgba(255, 210, 63, 0.10);
      }
      #lobby .lobby-tab:hover:not(.active) { color: var(--text); }
      #lobby .lobby-mode-context {
        margin: 0 0 12px;
        padding: 0 2px 10px;
        border-bottom: 1px solid rgba(255, 210, 63, 0.16);
      }
      #lobby .lobby-mode-context h2 {
        margin: 0 0 3px;
        color: var(--text-gold);
        font-family: var(--font-display);
        font-size: 19px;
        letter-spacing: 0.04em;
      }
      #lobby .lobby-mode-context p {
        margin: 0;
        color: var(--text-dim);
        font-size: 13px;
        line-height: 1.35;
      }
      @media (pointer: coarse) {
        #lobby .lobby-mode-context {
          display: flex;
          align-items: baseline;
          gap: 7px;
          margin-bottom: 5px;
          padding-bottom: 4px;
        }
        #lobby .lobby-mode-context h2 { margin: 0; font-size: 16px; }
        #lobby .lobby-mode-context p { font-size: 11px; }
        #lobby .lobby-mode-context + .lobby-hotseat .lobby-sub { display: none; }
      }
      #app.is-compact #lobby .lobby-mode-panel[aria-labelledby="lobby-mode-online"] .lobby-sub {
        margin-bottom: 5px;
      }

      /* Online sub-views */
      #lobby .lobby-btn {
        padding: 9px 18px; font-size: 14px; font-weight: bold; cursor: pointer;
        background: var(--gold); color: var(--ink); border: none; border-radius: 5px;
        font-family: var(--font-display); letter-spacing: 0.3px;
        transition: background 130ms ease, transform 80ms ease;
      }
      #lobby .lobby-btn:hover:not(:disabled) { background: var(--ember); }
      #lobby .lobby-btn:active:not(:disabled) { transform: translateY(1px); }
      #lobby .lobby-btn:disabled { background: rgba(255, 255, 255, 0.12); color: var(--text-dim); cursor: not-allowed; }
      #lobby .lobby-btn.secondary {
        background: none; color: var(--text-dim); text-decoration: underline;
        padding: 9px 0; font-family: var(--font-sans); font-weight: 500;
      }
      #lobby .lobby-btn.secondary:hover { color: var(--text-gold); background: none; }
      #lobby .lobby-btn-row {
        display: flex; align-items: center; gap: 16px; margin-top: 4px;
      }
      #lobby .lobby-online-actions {
        display: flex; flex-wrap: wrap; align-items: baseline; gap: 16px; margin-top: 4px;
      }
      #lobby .lobby-online-primary {
        flex: 0 0 auto;
      }
      #lobby .lobby-online-alternatives {
        display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px;
      }
      #lobby .lobby-online-alternatives-label {
        margin: 0; color: var(--text-dim); font-size: 12px; white-space: nowrap;
      }
      #lobby .lobby-online-alternatives-buttons {
        display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
      }
      #lobby .online-code-display {
        display: flex; gap: 8px; justify-content: center; margin: 12px 0;
      }
      #lobby .online-code-char {
        width: 40px; height: 44px; background: rgba(12, 7, 22, 0.8);
        border: 1px solid rgba(255, 210, 63, 0.25);
        border-radius: 6px; display: flex; align-items: center; justify-content: center;
        font-size: 24px; font-weight: 700; letter-spacing: 0; color: var(--gold);
        font-family: var(--font-mono);
      }
      #lobby .online-invite {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
        gap: 8px 12px; margin: 0 0 20px;
      }
      #lobby .online-invite-copy {
        min-width: 164px;
      }
      #lobby .online-invite-status {
        flex: 1 1 100%; min-height: 18px; margin: 0;
        color: var(--ready); font-size: 12px; text-align: center;
      }
      #lobby .online-invite-status.error { color: var(--tank-red); }
      #lobby .online-player-list {
        list-style: none; margin: 0 0 16px; padding: 0;
        display: flex; flex-direction: column; gap: 6px;
      }
      #lobby .online-player-row {
        display: flex; align-items: center; gap: 10px; font-size: 14px;
      }
      #lobby .online-player-dot {
        width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      }
      #lobby .online-player-dot.clash {
        box-shadow: 0 0 0 2px var(--tank-red); outline: 1px solid var(--tank-red);
      }
      #lobby .online-badge {
        margin-left: auto; font-size: 12px; padding: 2px 8px; border-radius: 10px;
        font-weight: 600; font-family: var(--font-mono);
      }
      #lobby .online-badge.ready { background: rgba(77, 232, 122, 0.16); color: var(--ready); }
      #lobby .online-badge.waiting { background: rgba(255, 210, 63, 0.16); color: var(--gold); }
      #lobby .online-status { color: var(--text-dim); font-size: 13px; min-height: 18px; margin-bottom: 10px; }
      #lobby .online-status.error { color: var(--tank-red); }
      #lobby .lobby-code-input {
        background: rgba(12, 7, 22, 0.8); color: var(--gold);
        border: 1px solid rgba(255, 210, 63, 0.25);
        border-radius: 5px; padding: 6px 8px; font-size: 20px; font-weight: 700;
        width: 80px; text-align: center; letter-spacing: 4px; text-transform: uppercase;
        font-family: var(--font-mono);
      }
      /* Pre-canvas controls legend (P3-13b): non-blocking footer so keyboard
         players learn aim/power/fire before the play field is uncovered. */
      #lobby .lobby-controls {
        position: absolute;
        right: 72px;
        bottom: 72px;
        left: auto;
        z-index: 4;
        width: min(478px, calc(42% - 30px));
        max-width: none;
        box-sizing: border-box;
        display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
        gap: 5px 12px;
        margin: 0; padding: 9px 12px;
        border: 1px solid rgba(255, 210, 63, 0.16);
        border-radius: 8px;
        background: rgba(12, 7, 22, 0.78);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
        color: var(--text-dim); font-size: 12px;
      }
      #lobby .lobby-controls .lobby-controls__title {
        color: var(--text-gold); font-size: 11px;
        text-transform: uppercase; letter-spacing: 0.5px;
      }
      #lobby .lobby-controls kbd {
        font-family: var(--font-mono); font-size: 11px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 210, 63, 0.25);
        border-radius: 3px; padding: 1px 5px;
      }
      #lobby .account-panel {
        position: absolute; top: 16px; right: 18px; z-index: 8;
        width: auto; max-width: none; margin: 0;
        display: flex; align-items: center; gap: 8px;
        color: var(--text); font-family: var(--font-sans);
      }
      #lobby .account-panel--open {
        width: min(330px, calc(100% - 36px)); padding: 12px;
        display: grid; gap: 10px;
        background: rgba(13, 8, 23, 0.98);
        border: 1px solid var(--ui-line-strong); border-radius: 8px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
      }
      #lobby .account-panel__header,
      #lobby .account-panel__modes {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      #lobby .account-panel button,
      #lobby .account-panel input {
        min-height: 34px; border-radius: 5px;
        border: 1px solid var(--ui-line-strong);
        background: rgba(255, 255, 255, 0.05); color: var(--text);
      }
      #lobby .account-panel button { cursor: pointer; padding: 6px 10px; }
      #lobby .account-panel button.active,
      #lobby .account-panel__submit { color: var(--ink); background: var(--gold); }
      #lobby .account-panel button:focus-visible,
      #lobby .account-panel input:focus-visible { outline: none; box-shadow: var(--ui-focus); }
      #lobby .account-panel__identity {
        grid-column: 1; min-width: 0;
        color: var(--text-gold); font-weight: 700; overflow-wrap: anywhere;
      }
      #lobby .account-panel__account-trigger {
        max-width: min(330px, calc(100vw - 36px));
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #lobby .account-panel--open > .account-panel__account-trigger {
        justify-self: start; min-width: 0; max-width: 100%;
        padding-inline: 0; border-color: transparent; background: transparent;
        color: var(--text-gold); font-weight: 700; text-align: left;
      }
      #lobby .account-panel--authenticated.account-panel--open {
        width: min(410px, calc(100vw - 36px));
        box-sizing: border-box;
        display: grid; grid-template-columns: minmax(0, 1fr) max-content max-content;
        align-items: center; gap: 8px 14px;
      }
      #lobby .account-panel--authenticated:not(.account-panel--open) > :not(.account-panel__account-trigger):not(.account-panel__record) {
        display: none;
      }
      #lobby .account-panel__progress {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px 12px;
        justify-content: space-between;
        margin: 0;
        min-width: 0;
        padding: 0 2px;
        box-sizing: border-box;
        width: 100%;
      }
      #lobby .account-panel__progress-item { display: grid; justify-items: start; gap: 1px; }
      #lobby .account-panel__progress dt,
      #lobby .account-panel__summary-unavailable {
        color: var(--text-dim); font-size: 9px; line-height: 1.2;
      }
      #lobby .account-panel__progress dd {
        margin: 0; color: var(--text); font-family: var(--font-mono); font-size: 13px;
      }
      #app.is-compact #lobby .account-panel__progress dt,
      #app.is-compact #lobby .account-panel__summary-unavailable {
        font-size: 14px; line-height: 1.25;
      }
      #app.is-compact #lobby .account-panel__progress dd {
        font-size: 16px; line-height: 1.2;
      }
      #lobby .account-panel__xp {
        grid-column: 1 / -1; min-width: 0;
        display: grid; gap: 4px;
      }
      #lobby .account-panel__summary-unavailable { grid-column: 1 / -1; }
      #lobby .account-panel--authenticated > .account-panel__close {
        grid-column: 2; grid-row: 1; justify-self: end;
      }
      #lobby .account-panel--authenticated > .account-panel__secondary:not(.account-panel__close) {
        grid-column: 3; grid-row: 1; justify-self: end;
      }
      #lobby .account-panel__xp-header {
        display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
      }
      #lobby .account-panel__xp-label,
      #lobby .account-panel__xp-remaining {
        color: var(--text-dim); font-size: 10px; line-height: 1.25;
      }
      #lobby .account-panel__xp-value {
        color: var(--text); font-family: var(--font-mono); font-size: 12px;
      }
      #lobby .account-panel__xp-meter {
        display: block; width: 100%; height: 10px; accent-color: var(--gold);
      }
      #app.is-compact #lobby .account-panel__xp-label,
      #app.is-compact #lobby .account-panel__xp-remaining {
        font-size: 14px;
      }
      #app.is-compact #lobby .account-panel__xp-value {
        font-size: 16px;
      }
      #lobby .account-panel__form { display: grid; gap: 9px; }
      #lobby .account-panel__field { display: grid; gap: 4px; font-size: 11px; color: var(--text-dim); }
      #lobby .account-panel__field input { box-sizing: border-box; width: 100%; padding: 7px 9px; }
      #lobby .account-panel__error { color: #ff9c9c; font-size: 11px; line-height: 1.35; }
      #lobby:has(> .lobby-overlay[data-overlay-presentation="stage-modal"]) > .lobby-card {
        opacity: 0;
        pointer-events: none;
      }
      #lobby .lobby-overlay {
        position: absolute; inset: 0; z-index: 40; pointer-events: auto;
        overflow: hidden;
      }
      #lobby .lobby-overlay__backdrop {
        position: absolute; inset: 0; width: auto; height: auto; padding: 0;
        border: 0;
        background-color: rgba(4, 7, 9, 0.985);
        background-image:
          linear-gradient(90deg, rgba(6, 8, 10, 0.98), rgba(12, 13, 14, 0.96) 49%, rgba(27, 20, 15, 0.94)),
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 5px),
          radial-gradient(70% 92% at 78% 42%, rgba(142, 47, 83, 0.18), transparent 58%);
        box-shadow: inset 0 0 0 1px rgba(255, 188, 80, 0.20);
        cursor: default;
      }
      #lobby .lobby-overlay__surface {
        position: absolute; z-index: 1; top: 50%; left: 50%;
        width: min(760px, calc(100% - 72px)); max-height: calc(100% - 48px);
        box-sizing: border-box; overflow-x: hidden; overflow-y: auto; transform: translate(-50%, -50%);
        border: 1px solid rgba(255, 188, 80, 0.78); border-left: 4px solid #ffbc50;
        border-radius: 0; background:
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
          linear-gradient(145deg, rgba(18, 14, 9, 0.99), rgba(4, 7, 9, 0.99));
        box-shadow: 16px 18px 0 rgba(0, 0, 0, 0.33), 0 24px 70px rgba(0, 0, 0, 0.70);
        color-scheme: dark;
      }
      #lobby .lobby-overlay--account .lobby-overlay__surface {
        width: min(720px, calc(100% - 96px));
      }
      #lobby .lobby-overlay--operations .lobby-overlay__surface {
        width: min(1040px, calc(100% - 72px));
      }
      #lobby .lobby-overlay__header {
        display: flex; align-items: start; justify-content: space-between; gap: 16px;
        padding: 18px 20px 14px; border-bottom: 1px solid rgba(229, 161, 65, 0.36);
      }
      #lobby .lobby-overlay__kicker {
        display: block; color: rgba(255, 224, 159, 0.72);
        font: 700 10px/1 var(--font-mono); letter-spacing: 2px;
      }
      #lobby .lobby-overlay__title { margin: 7px 0 0; color: #ffe0a0; font-size: 24px; }
      #lobby .lobby-overlay__close,
      #lobby .lobby-advanced-trigger {
        min-height: 36px; border: 1px solid rgba(255, 188, 80, 0.65); border-radius: 0;
        background: rgba(7, 10, 12, 0.86); color: #ffe0a0; cursor: pointer;
      }
      #lobby .lobby-overlay__close { padding: 6px 12px; }
      #lobby .lobby-overlay__body { padding: 18px 20px 22px; }
      #lobby .lobby-overlay .account-panel {
        position: static; width: auto; max-width: none; margin: 0; color: var(--text);
      }
      #lobby .lobby-overlay .account-panel--open {
        width: auto; padding: 0; border: 0; background: transparent; box-shadow: none;
      }
      #lobby .lobby-overlay .account-panel--authenticated.account-panel--open {
        width: auto; display: grid; grid-template-columns: minmax(0, 1fr);
      }
      #lobby .lobby-overlay .account-panel--authenticated > .account-panel__secondary:not(.account-panel__close) {
        grid-column: 1 / -1; grid-row: auto; justify-self: end;
      }
      #lobby .lobby-advanced-fields { display: grid; gap: 8px; }
      #lobby .lobby-overlay .lobby-advanced-fields .lobby-field {
        display: grid; grid-template-columns: 170px minmax(260px, 340px) minmax(0, 1fr);
        align-items: center; gap: 8px 14px; margin: 0;
      }
      #lobby .lobby-overlay .lobby-advanced-fields .lobby-field > label {
        grid-column: 1; width: auto; min-width: 0; margin: 0;
      }
      #lobby .lobby-overlay .lobby-advanced-fields input[type="number"],
      #lobby .lobby-overlay .lobby-advanced-fields select {
        grid-column: 2; box-sizing: border-box; width: 100%; min-width: 0;
        min-height: 38px; margin: 0; padding: 7px 10px;
        border: 1px solid rgba(229, 161, 65, 0.42); border-radius: 0;
        background: rgba(4, 7, 9, 0.92); color: rgba(255, 239, 205, 0.94);
        font-family: var(--font-mono);
      }
      #lobby .lobby-overlay .lobby-advanced-fields .lobby-hint {
        grid-column: 3; min-width: 0; margin: 0; color: rgba(225, 214, 191, 0.68);
        font-size: 12px; line-height: 1.35;
      }
      @media (max-width: 700px) {
        #lobby .account-panel { top: 10px; right: 10px; }
        #lobby .account-panel--open { width: calc(100% - 20px); box-sizing: border-box; }
        #lobby .account-panel--authenticated.account-panel--open { width: calc(100% - 20px); }
        #lobby .account-panel__account-trigger { max-width: calc(100vw - 20px); }
        #lobby .lobby-overlay__surface {
          width: calc(100% - 24px); max-height: calc(100% - 24px);
        }
        #lobby .lobby-overlay__header { padding: 12px 14px 10px; }
        #lobby .lobby-overlay__title { font-size: 18px; }
        #lobby .lobby-overlay__body { padding: 13px 14px 16px; }
        #lobby .lobby-overlay .lobby-advanced-fields .lobby-field {
          grid-template-columns: minmax(0, 1fr); gap: 4px;
        }
        #lobby .lobby-overlay .lobby-advanced-fields .lobby-field > label,
        #lobby .lobby-overlay .lobby-advanced-fields input[type="number"],
        #lobby .lobby-overlay .lobby-advanced-fields select,
        #lobby .lobby-overlay .lobby-advanced-fields .lobby-hint { grid-column: 1; }
      }
      #app.is-compact #lobby .lobby-overlay__surface {
        width: calc(100% - 40px);
        max-height: calc(100% - 32px);
      }
      #app.is-compact #lobby .lobby-overlay .lobby-advanced-fields .lobby-field {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
        gap: 3px;
      }
      #app.is-compact #lobby .lobby-overlay .lobby-advanced-fields .lobby-field > label,
      #app.is-compact #lobby .lobby-overlay .lobby-advanced-fields input[type="number"],
      #app.is-compact #lobby .lobby-overlay .lobby-advanced-fields select,
      #app.is-compact #lobby .lobby-overlay .lobby-advanced-fields .lobby-hint { grid-column: 1; }

      /* Command preparation system: pre-game surfaces inherit the same
         austere field-console language as the battlefield HUD. */
      #lobby .lobby-card {
        padding-block: 16px;
        background:
          linear-gradient(90deg, rgba(6, 8, 10, 0.98), rgba(12, 13, 14, 0.95) 49%, rgba(27, 20, 15, 0.92)),
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px);
      }
      /* The real Vehicle Bay now owns the battlefield preview. The older card
         pseudo-plane shared its bounds and produced a second, ghosted frame. */
      #lobby .lobby-card::before { content: none; }
      #lobby .lobby-card::before,
      #lobby .lobby-preview,
      #lobby .lobby-garage,
      #lobby .lobby-rows.crowded .lobby-row,
      #lobby .lobby-rejoin-banner,
      #lobby .lobby-tabs,
      #lobby .lobby-controls,
      #lobby .account-panel--open,
      #app.is-compact #lobby .lobby-garage.editing {
        border-radius: 0;
      }
      #lobby .lobby-command-header {
        display: flex;
        align-items: center;
        min-height: 10px;
        margin: 0 0 4px;
        padding: 0 0 2px;
        border-bottom: 1px solid rgba(229, 161, 65, 0.58);
      }
      #lobby .lobby-command-header__kicker {
        margin: 0;
        color: rgba(255, 224, 159, 0.78);
        font: 700 10px/1 var(--font-mono);
        letter-spacing: 2.2px;
      }
      #lobby h1 {
        color: #ffd477;
        letter-spacing: 1.8px;
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.9), 0 0 18px rgba(214, 111, 29, 0.24);
      }
      #lobby .lobby-sub,
      #lobby .lobby-mode-context p,
      #lobby .online-status,
      #lobby .lobby-controls,
      #lobby .account-panel__xp-label,
      #lobby .account-panel__xp-remaining {
        color: rgba(225, 214, 191, 0.68);
      }
      #lobby .lobby-mode-context,
      #lobby .lobby-advanced {
        border-color: rgba(229, 161, 65, 0.30);
      }
      #lobby .lobby-mode-context h2,
      #lobby .lobby-preview__spotlight-identity,
      #lobby .lobby-garage__heading,
      #lobby .lobby-controls .lobby-controls__title {
        color: #ffd477;
      }
      #lobby select,
      #lobby input[type="text"],
      #lobby .lobby-code-input,
      #lobby .lobby-advanced input[type="number"],
      #lobby .account-panel input {
        border-color: rgba(229, 161, 65, 0.34);
        border-radius: 0;
        background: rgba(4, 7, 9, 0.84);
      }
      #lobby .lobby-control,
      #lobby .lobby-garage button,
      #lobby .lobby-tab,
      #lobby .online-code-char,
      #lobby .online-badge,
      #lobby .lobby-controls kbd,
      #lobby .account-panel button {
        border-radius: 0;
      }
      #lobby .lobby-control,
      #lobby .lobby-garage button,
      #lobby .lobby-tab,
      #lobby .lobby-controls kbd,
      #lobby .account-panel button,
      #lobby .account-panel input {
        border-color: rgba(229, 161, 65, 0.34);
        background: rgba(7, 10, 12, 0.78);
      }
      #lobby .lobby-tabs {
        gap: 0;
        padding: 0;
        background: rgba(4, 7, 9, 0.72);
        border-color: rgba(229, 161, 65, 0.38);
      }
      #lobby .lobby-tab {
        color: rgba(225, 214, 191, 0.64);
        border-color: transparent;
      }
      #lobby .lobby-tab + .lobby-tab { border-left-color: rgba(229, 161, 65, 0.24); }
      #lobby .lobby-tab.active {
        color: #ffe0a0;
        border-color: rgba(229, 161, 65, 0.58);
        background: linear-gradient(180deg, rgba(169, 97, 27, 0.28), rgba(24, 18, 11, 0.86));
      }
      #lobby .lobby-start,
      #lobby .lobby-online-primary,
      #lobby .lobby-btn.primary,
      #lobby .account-panel button.active,
      #lobby .account-panel__submit {
        border: 1px solid rgba(255, 211, 119, 0.74);
        border-radius: 0;
        color: #fff0c9;
        background: linear-gradient(180deg, #3d2a12, #20160b 64%, #130e08);
        box-shadow: inset 3px 0 0 rgba(255, 188, 80, 0.56), inset 0 1px 0 rgba(255, 239, 187, 0.16);
      }
      #lobby .lobby-start:hover:not(:disabled),
      #lobby .lobby-online-primary:hover:not(:disabled),
      #lobby .lobby-btn.primary:hover:not(:disabled),
      #lobby .account-panel button.active:hover:not(:disabled),
      #lobby .account-panel__submit:hover:not(:disabled) {
        background: linear-gradient(180deg, #5d3d16, #2f210e 64%, #191109);
        box-shadow: inset 3px 0 0 #ffbc50, 0 0 0 1px rgba(255, 211, 119, 0.24);
      }
      #lobby .lobby-btn.secondary,
      #lobby .account-panel__secondary {
        color: rgba(225, 214, 191, 0.72);
        text-decoration: none;
        border-bottom: 1px solid rgba(229, 161, 65, 0.42);
      }
      #lobby .lobby-btn.secondary:hover,
      #lobby .account-panel__secondary:hover {
        color: #ffe0a0;
        border-bottom-color: #ffd477;
      }
      #lobby .lobby-online-actions {
        gap: 14px;
        padding-top: 5px;
        border-top: 1px solid rgba(229, 161, 65, 0.18);
      }
      #lobby .lobby-online-alternatives-label {
        color: rgba(225, 214, 191, 0.52);
        font-family: var(--font-mono);
        letter-spacing: 0.35px;
      }
      #lobby .online-code-char,
      #lobby .online-badge {
        border: 1px solid rgba(229, 161, 65, 0.32);
        background: rgba(7, 10, 12, 0.84);
      }
      #lobby .online-player-row {
        padding: 5px 7px;
        border-left: 2px solid rgba(229, 161, 65, 0.28);
        background: rgba(7, 10, 12, 0.36);
      }
      #lobby .online-player-list { gap: 4px; }
      #lobby .lobby-controls {
        background: rgba(4, 7, 9, 0.90);
        border-color: rgba(229, 161, 65, 0.36);
      }
      #lobby .account-panel--open {
        background: linear-gradient(155deg, rgba(19, 15, 10, 0.99), rgba(4, 7, 9, 0.99));
        border-color: rgba(229, 161, 65, 0.54);
        box-shadow: 12px 14px 0 rgba(0, 0, 0, 0.28), 0 18px 42px rgba(0, 0, 0, 0.58);
      }
      #lobby .account-panel__account-trigger {
        color: #ffe0a0;
        border-left: 2px solid rgba(255, 188, 80, 0.70);
      }
      #lobby .account-panel__record {
        display: grid;
        width: min(390px, calc(100vw - 36px));
        gap: 4px;
        padding: 7px 9px 8px;
        box-sizing: border-box;
        border: 1px solid rgba(229, 161, 65, 0.46);
        border-left: 3px solid rgba(255, 188, 80, 0.72);
        background: linear-gradient(100deg, rgba(20, 16, 10, 0.98), rgba(5, 8, 10, 0.94));
      }
      #lobby .account-panel__record h2 {
        margin: 0;
        color: rgba(255, 224, 159, 0.72);
        font: 700 8px/1 var(--font-mono);
        letter-spacing: 1.6px;
      }
      #lobby .account-panel__record .account-panel__account-trigger {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
        align-items: baseline;
        column-gap: 8px;
        row-gap: 3px;
        width: 100%;
        max-width: 100%;
        min-height: 24px;
        padding: 0;
        text-align: left;
        border: 0;
        border-left: 0;
        background: transparent;
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
      }
      #lobby .account-panel__commander-name {
        grid-column: 1;
        grid-row: 1;
        min-width: 0;
        overflow-wrap: anywhere;
        color: #ffe0a0;
        font-weight: 700;
      }
      #lobby .account-panel__commander-level {
        grid-column: 2;
        grid-row: 1;
        color: rgba(255, 224, 159, 0.78);
        font: 700 0.78em/1 var(--font-mono);
        letter-spacing: 0.4px;
        white-space: nowrap;
      }
      #lobby .account-panel__commander-rank-row {
        grid-column: 1;
        grid-row: 2;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      #lobby .account-panel__commander-rank {
        color: #f4bc58;
        font: 800 9px/1.1 var(--font-mono);
        letter-spacing: 0.75px;
        text-transform: uppercase;
      }
      #lobby .account-panel__commander-insignia,
      #lobby .account-panel__career-insignia {
        color: #ffd36f;
        font-family: var(--font-display);
        letter-spacing: 1px;
        text-shadow: 0 0 10px rgba(255, 188, 80, 0.3);
        white-space: nowrap;
      }
      #lobby .account-panel__record-milestone {
        grid-column: 2;
        grid-row: 2;
        justify-self: end;
        color: rgba(216, 198, 162, 0.82);
        font: 700 9px/1.15 var(--font-mono);
        letter-spacing: 0.45px;
        text-transform: uppercase;
      }
      #lobby .account-panel__record .account-panel__career-next {
        grid-column: 1 / -1;
        grid-row: 3;
        padding-top: 3px;
        border-top: 1px solid rgba(229, 161, 65, 0.22);
        color: rgba(216, 198, 162, 0.76);
        font: 700 8px/1.15 var(--font-mono);
        letter-spacing: 0.55px;
      }
      #lobby .account-panel__record-xp {
        display: block;
        width: 100%;
        height: 5px;
        accent-color: #d79a38;
      }
      #app.is-compact #lobby .account-panel__record {
        gap: 1px;
        padding: 2px 3px;
      }
      #app.is-compact #lobby .account-panel { top: 0; }
      #app.is-compact #lobby .account-panel__record h2 {
        font-size: calc(var(--st-store-buy-target) * 0.19);
        letter-spacing: 1px;
      }
      #app.is-compact #lobby .account-panel__record .account-panel__account-trigger {
        min-height: calc(var(--st-store-buy-target) * 0.55);
        font-size: calc(var(--st-store-buy-target) * 0.19);
      }
      #app.is-compact #lobby .account-panel__record-milestone {
        font-size: calc(var(--st-store-buy-target) * 0.16);
      }
      #app.is-compact #lobby .account-panel__commander-rank,
      #app.is-compact #lobby .account-panel__record .account-panel__career-next {
        font-size: calc(var(--st-store-buy-target) * 0.2);
      }
      #app.is-compact #lobby .account-panel__commander-insignia {
        font-size: calc(var(--st-store-buy-target) * 0.24);
      }
      #app.is-compact #lobby .account-panel__record-xp {
        height: calc(var(--st-store-buy-target) * 0.1);
      }
      #lobby .account-panel__xp-meter { accent-color: #d79a38; }
      #lobby .account-panel__career {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 5px;
        padding: 10px 12px;
        border: 1px solid rgba(229, 161, 65, 0.32);
        border-left: 3px solid rgba(255, 188, 80, 0.72);
        background: linear-gradient(90deg, rgba(229, 161, 65, 0.12), rgba(5, 8, 10, 0.24));
      }
      #lobby .account-panel__career-current {
        grid-column: 2;
        color: #ffe0a0;
        font: 800 13px/1.1 var(--font-mono);
        letter-spacing: 0.7px;
        text-transform: uppercase;
      }
      #lobby .account-panel__career > .account-panel__career-next {
        grid-column: 1 / -1;
        color: var(--text-dim);
        font: 700 10px/1.25 var(--font-mono);
        letter-spacing: 0.35px;
      }
      #lobby .account-panel__career-insignia { font-size: 20px; }
      #app.is-compact #lobby .account-panel__career > .account-panel__career-next {
        font-size: 16px;
      }
      #app.is-compact #lobby .account-panel__career-current { font-size: 16px; }
      #app.is-compact #lobby .account-panel__career-insignia { font-size: 24px; }
      #app.is-compact #lobby .lobby-command-header {
        min-height: 8px;
        margin-bottom: 0;
        padding-bottom: 0;
      }
      #app.is-compact #lobby .lobby-command-header__kicker { font-size: 8px; letter-spacing: 1.6px; }

      /* The online follow-through is an operations board, not a detached
         stack of setup controls. Discovery and staging share one field-report
         hierarchy while their transport actions remain local to each view. */
      #lobby .lobby-operations-board {
        border-left: 2px solid rgba(255, 188, 80, 0.68);
        background: linear-gradient(90deg, rgba(32, 22, 12, 0.56), rgba(7, 10, 12, 0.22) 72%, transparent);
        padding: 0 0 0 9px;
      }
      #lobby .lobby-operations-board__header {
        display: flex;
        align-items: baseline;
        gap: 9px;
        min-width: 0;
      }
      #lobby .lobby-operations-board__title {
        flex: 0 0 auto;
        margin: 0;
        color: #ffe0a0;
        font: 700 11px/1 var(--font-display);
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      #lobby .lobby-operations-board__purpose {
        min-width: 0;
        margin: 0;
        color: rgba(225, 214, 191, 0.66);
        font: 11px/1.2 var(--font-sans);
      }
      #lobby .lobby-operations-board__crew,
      #lobby .lobby-operations-board__section,
      #lobby .lobby-operations-board__mission,
      #lobby .lobby-operations-board__roster {
        margin-top: 6px;
        padding-top: 5px;
        border-top: 1px solid rgba(229, 161, 65, 0.18);
      }
      #lobby .lobby-operations-board__section-label,
      #lobby .lobby-operations-board__roster-label,
      #lobby .lobby-operations-board__readiness {
        margin: 0 0 6px;
        color: rgba(255, 224, 159, 0.72);
        font: 11px/1.2 var(--font-mono);
        letter-spacing: 0.35px;
        text-transform: uppercase;
      }
      #lobby .lobby-operations-board__mission .online-code-display {
        justify-content: flex-start;
        margin: 6px 0;
      }
      #lobby .lobby-operations-board__mission .online-invite {
        justify-content: flex-start;
        margin-bottom: 4px;
      }
      #lobby .lobby-operations-board .online-player-list { margin-bottom: 8px; }
      #lobby .lobby-operations-board__empty { color: var(--text-dim); }
      #lobby .lobby-operations-board__room-meta {
        margin-left: 8px;
        color: var(--text-dim);
        font-size: 12px;
      }
      #lobby .lobby-operations-board__room-join {
        margin-left: auto;
        padding: 4px 12px;
        font-size: 13px;
      }
      #lobby .online-clash-tag {
        margin-left: 6px;
        color: var(--tank-red, #e8554d);
        font-size: 11px;
        white-space: nowrap;
      }
      #lobby .lobby-operations-board__actions {
        margin-top: 7px;
        padding-top: 5px;
        border-top: 1px solid rgba(229, 161, 65, 0.18);
      }
      #app.is-compact #lobby .lobby-operations-board { padding-left: 5px; }
      #app.is-compact #lobby .lobby-operations-board__header { gap: 5px; }
      #app.is-compact #lobby .lobby-operations-board__title { font-size: 10px; }
      #app.is-compact #lobby .lobby-operations-board__purpose { display: none; }
      #app.is-compact #lobby .lobby-operations-board__crew,
      #app.is-compact #lobby .lobby-operations-board__section,
      #app.is-compact #lobby .lobby-operations-board__mission,
      #app.is-compact #lobby .lobby-operations-board__roster {
        margin-top: 4px;
        padding-top: 3px;
      }

      /* Immediate player commitments use the same field-brief language as the
         command shell: an operational title, contained setup, and a distinct
         action boundary rather than an anonymous stack of browser controls. */
      #lobby .lobby-route-brief {
        border-left: 2px solid rgba(255, 188, 80, 0.68);
        background: linear-gradient(90deg, rgba(32, 22, 12, 0.56), rgba(7, 10, 12, 0.22) 72%, transparent);
        padding: 0 0 0 9px;
      }
      #lobby .lobby-route-brief__header {
        display: flex;
        align-items: baseline;
        gap: 9px;
        min-width: 0;
      }
      #lobby .lobby-route-brief__title {
        margin: 0;
        color: #ffe0a0;
        flex: 0 0 auto;
        font: 700 11px/1 var(--font-display);
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      #lobby .lobby-route-brief__purpose {
        min-width: 0;
        margin: 0;
        color: rgba(225, 214, 191, 0.66);
        font: 11px/1.2 var(--font-sans);
      }
      #lobby .lobby-hotseat-ready {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 3px 12px;
        margin-top: 5px;
        padding: 8px 10px;
        border-left: 2px solid rgba(255, 188, 80, 0.78);
        border-top: 1px solid rgba(255, 210, 63, 0.25);
        border-bottom: 1px solid rgba(255, 210, 63, 0.14);
        background: linear-gradient(90deg, rgba(54, 34, 12, 0.62), rgba(9, 11, 13, 0.12));
      }
      #lobby .lobby-hotseat-ready h3 {
        grid-row: 1 / span 2;
        margin: 0;
        color: #ffd46e;
        font: 700 11px/1 var(--font-display);
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
      #lobby .lobby-hotseat-ready strong {
        color: #ffe6af;
        font: 700 12px/1 var(--font-display);
      }
      #lobby .lobby-hotseat-ready p {
        margin: 0;
        color: rgba(225, 214, 191, 0.68);
        font: 11px/1.15 var(--font-sans);
      }
      #lobby .lobby-hotseat-customization {
        margin-top: 5px;
        min-width: 0;
      }
      #lobby .lobby-hotseat-customization > summary {
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 188, 80, 0.5);
        background: rgba(16, 14, 12, 0.74);
        color: rgba(255, 224, 159, 0.78);
        cursor: pointer;
        font: 700 11px/1 var(--font-display);
        letter-spacing: 0.35px;
        list-style: none;
      }
      #lobby .lobby-hotseat-customization > summary::-webkit-details-marker { display: none; }
      #lobby .lobby-hotseat-customization > summary::before {
        content: '\\25B8';
        margin-right: 7px;
        color: #d89a32;
      }
      #lobby .lobby-hotseat-customization[open] > summary::before { content: '\\25BE'; }
      #lobby .lobby-hotseat-customization > summary:hover,
      #lobby .lobby-hotseat-customization > summary:focus-visible {
        border-color: rgba(255, 210, 63, 0.82);
        color: #ffe6af;
      }
      #lobby .lobby-hotseat:has(.lobby-hotseat-customization[open]) .lobby-hotseat-ready {
        display: none;
      }
      #lobby .lobby-hotseat:has(.lobby-hotseat-customization[open]) .lobby-route-brief__header {
        display: none;
      }
      #lobby .lobby-deployment:has(.lobby-hotseat-customization[open])
        > .lobby-deployment__mission-brief {
        display: none;
      }
      #lobby .lobby-route-brief__setup {
        margin-top: 4px;
      }
      #lobby .lobby-route-brief__setup > .lobby-field > label,
      #lobby .lobby-preparation-section__body > .lobby-field > label {
        color: rgba(255, 224, 159, 0.74);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.45px;
        text-transform: uppercase;
      }
      /* The primary setup routes describe an operation, not a loose stack of
         browser fields. Keep the route builders' controls intact while giving
         each player decision a consistent command-frame boundary. */
      #lobby .lobby-preparation-section {
        position: relative;
        margin: 5px 0 0;
        padding: 5px 9px 6px;
        border-left: 2px solid rgba(255, 188, 80, 0.68);
        border-top: 1px solid rgba(255, 210, 63, 0.22);
        border-bottom: 1px solid rgba(255, 210, 63, 0.12);
        border-radius: 0;
        background: linear-gradient(90deg, rgba(37, 25, 13, 0.54), rgba(9, 11, 13, 0.14) 76%, transparent);
      }
      #lobby .lobby-preparation-section__title {
        margin: 0;
        color: #ffe0a0;
        font: 700 10px/1 var(--font-display);
        letter-spacing: 0.95px;
        text-transform: uppercase;
      }
      #lobby .lobby-preparation-section__purpose {
        margin: 4px 0 0;
        color: rgba(225, 214, 191, 0.62);
        font: 11px/1.25 var(--font-sans);
      }
      #lobby .lobby-preparation-section__body {
        display: grid;
        gap: 6px;
        min-width: 0;
        margin-top: 4px;
      }
      #lobby .lobby-preparation-section__body > .lobby-advanced {
        margin: 0;
        padding-top: 6px;
      }
      #lobby .lobby-preparation-section .lobby-rows { margin: 0; }
      #lobby .lobby-preparation-section .lobby-field { margin: 0; }
      #lobby .lobby-route-brief--online .lobby-route-brief__setup {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        row-gap: 5px;
        align-items: start;
      }
      #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="command-vehicle"] {
        grid-column: 1 / -1;
      }
      #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="operation-profile"] {
        grid-column: 1 / -1;
      }
      #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="battlefield-protocol"],
      #lobby .lobby-route-brief--online .lobby-error {
        grid-column: 1 / -1;
      }
      @media (min-width: 701px) {
        #lobby .lobby-advanced-trigger {
          min-height: 0; height: 32px; padding: 0 10px; line-height: 1;
        }
        #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="command-vehicle"] .lobby-name {
          flex: 1 1 140px; min-width: 0; width: auto;
        }
        #lobby .lobby-route-brief--online .lobby-garage {
          grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 3px; padding: 3px;
        }
        #lobby .lobby-route-brief--online .lobby-garage__heading { display: none; }
        #lobby .lobby-route-brief--online .lobby-garage__presets,
        #lobby .lobby-route-brief--online .lobby-garage__slots { display: contents; }
        #lobby .lobby-route-brief--online .lobby-garage button {
          min-height: 24px; padding: 2px; font-size: 0; text-align: center;
        }
        #lobby .lobby-route-brief--online .lobby-garage button::after {
          content: attr(data-short); font-size: 9px; font-weight: 700;
        }
        #lobby .lobby-route-brief--online .lobby-garage__slot > * { display: none; }
        #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="operation-profile"] .lobby-preparation-section__body {
          grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; row-gap: 4px;
        }
        #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="operation-profile"] .lobby-field {
          min-width: 0;
        }
        #lobby .lobby-route-brief--online .lobby-preparation-section[data-preparation-section="operation-profile"] .lobby-field > select {
          flex: 1; min-width: 0;
        }
        #lobby .lobby-route-brief--online .online-status:empty { display: none; }
      }
      #app.is-compact #lobby .lobby-route-brief {
        padding-left: 5px;
      }
      #app.is-compact #lobby .lobby-route-brief__header {
        gap: 5px;
      }
      #app.is-compact #lobby .lobby-route-brief__title { font-size: 10px; }
      #app.is-compact #lobby .lobby-route-brief__purpose { display: none; }
      #app.is-compact #lobby .lobby-hotseat-ready {
        grid-template-columns: auto minmax(0, 1fr);
        padding: 5px 7px;
      }
      #app.is-compact #lobby .lobby-hotseat-ready p { display: none; }
      #app.is-compact #lobby .lobby-hotseat-customization > summary { min-height: 34px; }
      #app.is-compact #lobby .lobby-route-brief__setup {
        margin-top: 0;
      }
      #app.is-compact #lobby .lobby-route-brief__setup > .lobby-field > label { width: 78px; }
      #app.is-compact #lobby .lobby-preparation-section {
        margin-top: 2px;
        padding: 2px 5px 3px;
      }
      #app.is-compact #lobby .lobby-preparation-section__title { font-size: 9px; }
      #app.is-compact #lobby .lobby-preparation-section__purpose {
        display: none;
      }
      #app.is-compact #lobby .lobby-preparation-section__body {
        gap: 2px;
        margin-top: 2px;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-route-brief__setup {
        display: block;
      }

      /* One route hierarchy, shared by every pre-game screen. The route
         content beneath it keeps its established gameplay and network logic. */
      #lobby .lobby-deployment {
        position: relative;
        z-index: 3;
        width: 100%;
        min-height: calc(100% - 32px);
        display: grid;
        grid-template-columns: minmax(0, 1.12fr) minmax(420px, 0.88fr);
        grid-template-areas:
          'masthead masthead'
          'rail preview'
          'brief preview'
          'panel preview'
          'controls preview';
        grid-template-rows: auto auto auto minmax(0, 1fr) auto;
        column-gap: 32px;
        row-gap: 9px;
        align-content: center;
      }
      #lobby .lobby-card > .lobby-deployment {
        width: calc(100% - 104px);
        max-width: none;
        margin-left: 52px;
        margin-right: 52px;
      }
      #lobby .lobby-deployment__masthead {
        grid-area: masthead;
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
      }
      #lobby .lobby-deployment__masthead > h1,
      #lobby .lobby-deployment__masthead > .lobby-command-header {
        grid-column: 1;
      }
      #lobby .lobby-deployment__masthead > .account-panel {
        grid-column: 2;
        grid-row: 1 / span 2;
        position: relative;
        top: auto;
        right: auto;
        z-index: 4;
        margin: 0;
      }
      #lobby .lobby-deployment__masthead > .account-panel--open {
        grid-column: 1 / -1;
        grid-row: 3;
        justify-self: end;
        margin-top: 8px;
      }
      #lobby .lobby-deployment__masthead > .lobby-rejoin-banner {
        grid-column: 1 / -1;
        margin: 8px 0 0;
      }
      #lobby .lobby-deployment__masthead > .lobby-rejoin-banner .lobby-btn {
        min-height: max(58px, calc(var(--st-deployment-choice-target, 44px) * 1.2));
        font-size: max(18px, calc(var(--st-deployment-choice-target, 44px) * 0.34));
      }
      #lobby .lobby-deployment-chooser {
        grid-column: 1 / -1;
        grid-row: 2 / -1;
        align-self: center;
        justify-self: center;
        width: min(780px, 72%);
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 24px;
        border-block: 1px solid rgba(255, 210, 63, 0.32);
        background: linear-gradient(90deg, transparent, rgba(32, 22, 12, 0.72), transparent);
      }
      #lobby .lobby-deployment-chooser .lobby-btn {
        min-height: var(--st-deployment-choice-target, 44px);
        letter-spacing: 0.9px;
        text-transform: uppercase;
      }
      #lobby .lobby-deployment-chooser .lobby-btn.primary {
        grid-column: 1 / -1;
        min-height: max(58px, calc(var(--st-deployment-choice-target, 44px) * 1.2));
        font-size: max(18px, calc(var(--st-deployment-choice-target, 44px) * 0.34));
        letter-spacing: 1.4px;
      }
      #lobby .lobby-deployment-chooser .lobby-deployment-choice--secondary {
        border: 1px solid rgba(170, 132, 72, 0.72);
        background: #111416 linear-gradient(180deg, rgba(28, 30, 31, 0.96), rgba(8, 10, 12, 0.98));
        color: #d8c6a2;
        box-shadow: inset 0 1px 0 rgba(255, 236, 196, 0.08);
      }
      #lobby .lobby-deployment-chooser .lobby-deployment-choice--secondary:hover:not(:disabled) {
        border-color: rgba(229, 161, 65, 0.9);
        background: #171716 linear-gradient(180deg, rgba(42, 39, 33, 0.98), rgba(12, 12, 12, 0.98));
        color: #ffe0a0;
      }
      #lobby .lobby-deployment__back {
        grid-area: rail;
        justify-self: start;
        min-height: 34px;
        padding: 5px 14px;
        letter-spacing: 0.7px;
        text-transform: uppercase;
      }
      #lobby .lobby-deployment__mission-brief {
        grid-area: brief;
        margin: 0;
        padding: 12px 0 14px;
        border-top: 1px solid rgba(255, 210, 63, 0.34);
        border-bottom: 1px solid rgba(255, 210, 63, 0.16);
      }
      #lobby .lobby-deployment > .lobby-mode-panel {
        grid-area: panel;
        min-width: 0;
        align-self: start;
      }
      #lobby .lobby-deployment > .lobby-preview {
        position: relative;
        inset: auto;
        grid-area: preview;
        width: auto;
        min-width: 0;
        min-height: 362px;
        height: 100%;
        margin: 0;
      }
      #lobby .lobby-deployment > .lobby-controls {
        position: absolute;
        right: 20px;
        bottom: 18px;
        z-index: 4;
        margin: 0;
      }
      #app.is-compact #lobby .lobby-deployment {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        grid-template-areas:
          'rail masthead'
          'brief brief'
          'panel panel';
        grid-template-rows: auto auto minmax(0, 1fr);
        column-gap: 8px;
        row-gap: 5px;
      }
      #app.is-compact #lobby .lobby-deployment__back,
      #app.is-compact #lobby .lobby-deployment__mission-brief,
      #app.is-compact #lobby .lobby-deployment > .lobby-mode-panel {
        width: min(600px, 52%);
      }
      #app.is-compact #lobby .lobby-deployment-chooser {
        width: min(760px, 70%);
        gap: 8px;
        padding: 12px;
      }
      #app.is-compact #lobby .lobby-deployment__back {
        width: max-content;
        align-self: center;
        min-height: var(--st-deployment-choice-target, 44px);
      }
      #app.is-compact #lobby .lobby-card:has(.lobby-deployment__back) {
        padding-block: 12px;
      }
      #app.is-compact #lobby .lobby-deployment > .lobby-preview {
        display: block;
        position: absolute;
        inset: 70px 0 30px auto;
        grid-area: auto;
        width: min(520px, 42%);
        min-height: 0;
        height: auto;
      }
      #app.is-compact #lobby .lobby-deployment > .lobby-controls { bottom: 56px; }
      #app.is-compact #lobby .lobby-deployment__masthead { min-height: 0; }
      #app.is-compact #lobby .lobby-deployment__masthead:has(.account-panel__record) {
        min-height: 205px;
      }
      #app.is-compact #lobby .lobby-deployment:has(.account-panel__record)
        > .lobby-preview {
        inset-block-start: 165px;
      }
      #app.is-compact #lobby .lobby-deployment__masthead > .account-panel,
      #app.is-compact #lobby .lobby-deployment__masthead > .account-panel--open {
        position: absolute;
        top: 0;
        right: 0;
        left: auto;
        grid-column: auto;
        grid-row: auto;
        justify-self: auto;
        margin: 0;
      }
      #app.is-compact #lobby .lobby-deployment__masthead:has(.account-panel--open)
        ~ .lobby-preview,
      #app.is-compact #lobby .lobby-deployment__masthead:has(.account-panel--open)
        ~ .lobby-controls {
        visibility: hidden;
      }
      #app.is-compact #lobby:has(.lobby-garage.editing) .lobby-preview {
        visibility: hidden;
      }
      #app.is-compact #lobby .lobby-deployment__mission-brief {
        display: block;
        padding: 5px 0;
      }
      #app.is-compact #lobby .lobby-deployment:has(.lobby-hotseat-customization[open])
        > .lobby-deployment__mission-brief {
        display: none;
      }
      #app.is-compact #lobby .lobby-deployment:has(.lobby-hotseat-customization[open]) {
        row-gap: 0;
      }
      /* The fixed game stage is intentionally zoomed as one unit. Logical
         compact sizes preserve physical legibility without overgrowing the
         Vehicle Bay; the shorter coarse-pointer viewport gets a stronger tier. */
      #app.is-compact #lobby .lobby-mode-context h2,
      #app.is-compact #lobby .lobby-deployment .lobby-tab,
      #app.is-compact #lobby .lobby-mode-panel:not([hidden]) .lobby-btn.primary,
      #app.is-compact #lobby .lobby-hotseat-ready h3,
      #app.is-compact #lobby .lobby-route-brief--online .lobby-preparation-section__title,
      #app.is-compact #lobby .account-panel > button,
      #app.is-compact #lobby .account-panel__record .account-panel__account-trigger,
      #app.is-compact #lobby .lobby-preview__spotlight-identity {
        font-size: 21px;
      }
      #app.is-compact #lobby .lobby-command-header__kicker,
      #app.is-compact #lobby .lobby-preview__label,
      #app.is-compact #lobby .lobby-preview__part span,
      #app.is-compact #lobby .lobby-preview__part strong {
        font-size: 18px;
      }
      #app.is-compact #lobby .lobby-preview__part strong {
        font-family: var(--font-sans);
        letter-spacing: -1.8px;
      }
      #app.is-compact #lobby .lobby-preview__part span {
        letter-spacing: -0.8px;
      }
      #app.is-compact #lobby .lobby-preview__parts {
        width: calc(100% - 8px);
        gap: 3px;
      }
      #app.is-compact #lobby .lobby-preview__part {
        padding-inline: 3px;
      }
      #app.is-compact #lobby .lobby-preview__convoy {
        bottom: 80px;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-route-brief__setup {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 4px;
        align-items: start;
      }
      #app.is-compact #lobby .lobby-route-brief--online
        .lobby-preparation-section[data-preparation-section="command-vehicle"] {
        grid-column: 1 / -1;
      }
      #app.is-compact #lobby .lobby-route-brief--online
        .lobby-preparation-section[data-preparation-section="operation-profile"] {
        grid-column: 1;
      }
      #app.is-compact #lobby .lobby-route-brief--online
        .lobby-preparation-section[data-preparation-section="battlefield-protocol"] {
        grid-column: 2;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-online-actions {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: center;
        gap: 8px;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-online-alternatives {
        flex-wrap: nowrap;
        gap: 6px;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-online-alternatives-label {
        display: none;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-online-alternatives-buttons {
        flex-wrap: nowrap;
        gap: 8px;
      }
      #app.is-compact #lobby .lobby-route-brief--online .lobby-btn.secondary {
        padding-block: 4px;
      }
      @media (pointer: coarse) {
        #app.is-compact #lobby .lobby-mode-context h2,
        #app.is-compact #lobby .lobby-deployment .lobby-tab,
        #app.is-compact #lobby .lobby-mode-panel:not([hidden]) .lobby-btn.primary,
        #app.is-compact #lobby .lobby-hotseat-ready h3,
        #app.is-compact #lobby .lobby-route-brief--online .lobby-preparation-section__title,
        #app.is-compact #lobby .account-panel > button,
        #app.is-compact #lobby .account-panel__record .account-panel__account-trigger,
        #app.is-compact #lobby .lobby-preview__spotlight-identity {
          font-size: 25px;
        }
        #app.is-compact #lobby .lobby-command-header__kicker,
        #app.is-compact #lobby .lobby-preview__label,
        #app.is-compact #lobby .lobby-preview__part span,
        #app.is-compact #lobby .lobby-preview__part strong {
          font-size: 21px;
        }
      }
    `;
    document.head.append(style);
  }

  /** Re-render the lobby card from current working state. */
  private render(): void {
    this.root.replaceChildren();

    const vehiclePreview = this.renderVehiclePreview();
    let content: HTMLElement;
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

    const accountOptions = (open: boolean, triggerOnly = false) => ({
      state: this.accountSession.state,
      open,
      triggerOnly,
      mode: this.accountMode,
      onOpen: () => {
        this.settingsOpen = false;
        this.accountPanelOpen = true;
        this.render();
      },
      onClose: () => {
        this.accountPanelOpen = false;
        this.render();
        this.root.querySelector<HTMLButtonElement>('.account-panel button')?.focus();
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
    });

    const card = buildLobbyShellView({
      activeTab: this.activeTab,
      surface: this.surface,
      showBack: !(this.activeTab === 'online' && this.onlineSubView === 'waiting'),
      rejoinAvailable: this.rejoinCandidate !== null,
      account: buildAccountPanelView(accountOptions(this.accountPanelOpen, true)),
      vehiclePreview,
      content,
      controls: this.renderControlsLegend(),
      onTabChange: (tab) => {
        this.activeTab = tab;
        this.surface = 'preparation';
        this.render();
      },
      onQuickDuel: () => { this.startQuickDuel(); },
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
        }));
      }
    }
    if (this.settingsOpen) {
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
        }));
      }
    }
    const activeGarage = this.root.querySelector<HTMLElement>(
      '.lobby-garage.editing',
    );
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
    const loadout = normalizeTankLoadout(value);
    const editing = this.openGarageOwner === owner;
    const garage = document.createElement('section');
    garage.className = 'lobby-garage';
    garage.classList.toggle('editing', editing);
    garage.dataset.owner = owner;
    garage.setAttribute('aria-label', editing ? `Vehicle Bay: ${ownerLabel}` : `${ownerLabel} tank Garage`);
    if (editing) {
      garage.setAttribute('role', 'dialog');
      garage.setAttribute('aria-modal', 'true');
    }

    const heading = document.createElement('span');
    heading.className = `lobby-garage__heading${editing ? ' lobby-garage__editor-header' : ''}`;
    heading.textContent = editing ? `Vehicle Bay: ${ownerLabel}` : 'Garage';

    const uniformKit = TANK_KIT_IDS.find((kit) =>
      TANK_PART_SLOTS.every((slot) => loadout[slot] === kit),
    );
    const summary = document.createElement('p');
    summary.className = 'lobby-garage__build-summary';
    summary.textContent = uniformKit
      ? `${TANK_KIT_LABELS[uniformKit]} loadout`
      : `Mixed assembly: ${TANK_PART_SLOTS.map((slot) =>
        `${TANK_SLOT_LABELS[slot]} ${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}`,
      ).join(', ')}`;

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'lobby-garage__open';
    open.textContent = 'Customize tank';
    open.setAttribute('aria-label', `Customize ${ownerLabel} tank`);
    open.addEventListener('click', () => {
      this.openGarage(owner);
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'lobby-garage__close';
    close.textContent = 'Done';
    close.setAttribute('aria-label', 'Done customizing tank');
    close.addEventListener('click', () => {
      this.closeGarage(owner);
    });

    const presets = document.createElement('div');
    presets.className = 'lobby-garage__presets';
    for (const kit of TANK_KIT_IDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lobby-garage__preset';
      button.dataset.preset = kit;
      button.dataset.short = kit.charAt(0).toUpperCase();
      button.textContent = TANK_KIT_LABELS[kit];
      const active = TANK_PART_SLOTS.every((slot) => loadout[slot] === kit);
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute(
        'aria-label',
        `Apply ${TANK_KIT_LABELS[kit]} preset to ${ownerLabel}`,
      );
      button.addEventListener('click', () => {
        this.spotlightOwner = owner;
        onChange(presetLoadout(kit));
        this.focusGarageControl(owner, `[data-preset="${kit}"]`);
      });
      presets.append(button);
    }

    const slots = document.createElement('div');
    slots.className = 'lobby-garage__slots';
    for (const slot of TANK_PART_SLOTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lobby-garage__slot';
      button.dataset.slot = slot;
      button.dataset.kit = loadout[slot];
      button.dataset.short =
        `${TANK_SLOT_LABELS[slot].slice(0, 2).toUpperCase()}\u00b7` +
        loadout[slot].charAt(0).toUpperCase();
      button.setAttribute(
        'aria-label',
        `Change ${ownerLabel} ${TANK_SLOT_LABELS[slot].toLowerCase()}, ` +
        `currently ${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}`,
      );
      button.innerHTML =
        `<span>${TANK_SLOT_LABELS[slot]}</span>` +
        `<strong>${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}</strong>`;
      button.addEventListener('click', () => {
        const current = TANK_KIT_IDS.indexOf(loadout[slot]);
        const nextKit = TANK_KIT_IDS[(current + 1) % TANK_KIT_IDS.length]!;
        this.spotlightOwner = owner;
        onChange({ ...loadout, [slot]: nextKit });
        this.focusGarageControl(owner, `[data-slot="${slot}"]`);
      });
      slots.append(button);
    }

    const presetGroup = document.createElement('section');
    presetGroup.className = 'lobby-garage__preset-group';
    presetGroup.setAttribute('aria-label', 'Preset loadouts');
    const presetLabel = document.createElement('span');
    presetLabel.className = 'lobby-garage__group-label';
    presetLabel.textContent = 'Preset loadouts';
    presetGroup.append(presetLabel, presets);

    const componentGroup = document.createElement('section');
    componentGroup.className = 'lobby-garage__component-group';
    componentGroup.setAttribute('aria-label', 'Component bay');
    const componentLabel = document.createElement('span');
    componentLabel.className = 'lobby-garage__group-label';
    componentLabel.textContent = 'Component bay';
    componentGroup.append(componentLabel, slots);

    garage.addEventListener('keydown', (event) => {
      if (this.openGarageOwner !== owner) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeGarage(owner);
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = Array.from(garage.querySelectorAll<HTMLButtonElement>(
        '[data-preset], [data-slot], .lobby-garage__close',
      ));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    if (editing) {
      garage.append(heading, summary, presetGroup, componentGroup, close);
    } else {
      garage.append(heading, open, presets, slots, close);
    }
    return garage;
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
    if (!this.rejoinCandidate) return;
    const { descriptor } = this.rejoinCandidate;

    const room = await this.transport.fetchRoom(descriptor.roomId);
    if (!isLiveSession(descriptor, room)) {
      clearSession();
      this.rejoinCandidate = null;
      this.onlineError = 'That game is no longer available.';
      this.render();
      return;
    }
    const liveRoom = room!;

    // The secret seat token never lives in the session descriptor (ADR-0009) —
    // read it back from its own localStorage key, keyed by the public playerId.
    const token = readSeatToken(descriptor.playerId) ?? '';

    const config: LobbyConfig = {
      mode: 'network',
      players: liveRoom.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        loadout: normalizeTankLoadout(p.loadout),
        ...(p.ai ? { ai: p.ai } : {}),
      })),
      playerNames: liveRoom.players.map((p) => p.name),
      roomCode: liveRoom.code,
      roomId: liveRoom.id,
      playerId: descriptor.playerId,
      token,
      settings: {
        seed: liveRoom.seed,
        maxWind: liveRoom.options.maxWind,
        gravity: liveRoom.options.gravity,
        ...(normalizeWallMode(liveRoom.options.walls) !== 'open'
          ? { walls: normalizeWallMode(liveRoom.options.walls) }
          : {}),
        ...(normalizeBattlefieldWorldId(liveRoom.options.battlefieldWorld) !== undefined
          ? { battlefieldWorld: normalizeBattlefieldWorldId(liveRoom.options.battlefieldWorld) }
          : {}),
        ...(normalizeTerrainHazardMode(liveRoom.options.hazards) !== 'none'
          ? { hazards: normalizeTerrainHazardMode(liveRoom.options.hazards) }
          : {}),
        ...(liveRoom.options.rounds !== undefined ? { rounds: liveRoom.options.rounds } : {}),
        ...(liveRoom.options.interestRate !== undefined ? { interestRate: liveRoom.options.interestRate } : {}),
        ...(liveRoom.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: liveRoom.options.suddenDeathTurn } : {}),
        ...(liveRoom.options.armsLevel !== undefined ? { armsLevel: liveRoom.options.armsLevel } : {}),
        ...(liveRoom.options.teamMode === true ? { teamMode: true } : {}),
        rulesetVersion: normalizeNetworkRulesetVersion(liveRoom.options.rulesetVersion),
      },
    };
    this.onReady(config);
  }

  // ---- Hot Seat tab ----

  private startQuickDuel(): void {
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
    this.onReady({
      mode: 'hotseat',
      players: [humanPlayer, cpuPlayer],
      playerNames: [humanPlayer.name, cpuPlayer.name],
    });
  }

  private renderHotSeatTab(): HTMLElement {
    return buildLobbyHotSeatView({
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      playerCount: this.players.length,
      playerRows: this.players.map((_, index) => this.renderRow(index)),
      advanced: this.renderAdvanced(),
      customizationOpen: this.hotSeatCustomizationOpen,
      validationMessage: this.validationError(),
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
        (value) => { this.onlineName = value; },
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
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const rounds = this.parseOnlineRounds();
      const economy = this.parseOnlineEconomy();

      // Build CPU seats with palette colors unique vs the creator + each other.
      const used = new Set<string>([this.onlineColor]);
      const bots: Array<{
        name: string;
        color: string;
        ai: AiDifficulty;
        loadout: TankLoadout;
      }> = [];
      for (let i = 0; i < this.onlineBots; i++) {
        const c = PALETTE.find((p) => !used.has(p.value));
        if (!c) break; // ran out of distinct colors
        used.add(c.value);
        bots.push({
          name: `CPU ${i + 1}`,
          color: c.value,
          ai: this.onlineBotDifficulty,
          loadout: presetLoadout(
            TANK_KIT_IDS[(i + 1) % TANK_KIT_IDS.length]!,
          ),
        });
      }

      const { ok, data } = await this.transport.createRoom({
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
      });

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to create room.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      // Guard against a structurally-wrong 200 (contract drift): without this, the
      // `!` assertions below would assign undefined-as-string and silently break the
      // Realtime subscription with no visible error (dx-007).
      if (!data?.roomId || !data.code || !data.playerId || !data.token) {
        this.onlineError = 'Unexpected server response — please try again.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      // Transition to waiting room. Prefer the server's full players array (it
      // includes any CPU seats with their generated ids); fall back to just us.
      this.waitingRoomId = data.roomId;
      this.waitingRoomCode = data.code;
      this.waitingPlayerId = data.playerId;
      this.waitingToken = data.token;
      writeSeatToken(data.playerId, data.token);
      writeSession({ roomId: this.waitingRoomId, roomCode: this.waitingRoomCode, playerId: this.waitingPlayerId });
      this.waitingPlayers = data.players ?? [{
        id: data.playerId,
        name,
        color: this.onlineColor,
        ready: false,
        loadout: normalizeTankLoadout(this.onlineLoadout),
      }];
      const fallbackOptions: RoomOptions = {
        maxPlayers: this.onlineMaxPlayers,
        maxWind: parseNumber(this.onlineMaxWind) !== undefined
          ? clamp(parseNumber(this.onlineMaxWind)!, WIND_MIN, WIND_MAX)
          : WIND_DEFAULT,
        gravity: parseNumber(this.onlineGravity) !== undefined
          ? clamp(parseNumber(this.onlineGravity)!, GRAVITY_MIN, GRAVITY_MAX)
          : GRAVITY_DEFAULT,
        walls: normalizeWallMode(this.onlineWalls),
        ...(normalizeBattlefieldWorldId(this.onlineBattlefieldWorld) !== undefined
          ? { battlefieldWorld: normalizeBattlefieldWorldId(this.onlineBattlefieldWorld) }
          : {}),
        ...(normalizeTerrainHazardMode(this.onlineHazards) !== 'none'
          ? { hazards: normalizeTerrainHazardMode(this.onlineHazards) }
          : {}),
        ...(rounds !== undefined ? { rounds } : {}),
        ...economy,
        ...(this.onlineTeamMode && this.onlineMaxPlayers === 4 ? { teamMode: true } : {}),
      };
      const authoritativeOptions = data.options ?? fallbackOptions;
      this.waitingOptions = {
        ...authoritativeOptions,
        rulesetVersion: normalizeNetworkRulesetVersion(authoritativeOptions.rulesetVersion),
      };
      this.waitingThisPlayerReady = false;
      this.onlineSubView = 'waiting';
      this.onlineError = '';
      this.onlineBusy = false;
      this.render();
      void this.subscribeWaitingRoom();
    } catch (err) {
      console.error('Lobby.createRoom: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.onlineBusy = false;
      this.render();
    }
  }

  // ---- Join Room sub-view ----

  private renderJoinForm(): HTMLElement {
    return buildLobbyJoinView({
      code: this.joinCode,
      busy: this.onlineBusy,
      nameColor: this.renderOnlineNameColor(
        this.onlineName,
        this.joinColor,
        (value) => { this.onlineName = value; },
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
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const { ok, data } = await this.transport.joinRoom({
        code,
        playerName: name,
        color: this.joinColor,
        loadout: normalizeTankLoadout(this.onlineLoadout),
      });

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to join room.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      if (!data?.roomId || !data.playerId || !data.token) {
        this.onlineError = 'Unexpected server response — please try again.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      // Joined successfully — stop browsing and enter the waiting room.
      this.stopBrowsePoll();
      this.waitingRoomId = data.roomId;
      this.waitingRoomCode = code;
      this.waitingPlayerId = data.playerId;
      this.waitingToken = data.token;
      writeSeatToken(data.playerId, data.token);
      writeSession({ roomId: this.waitingRoomId, roomCode: this.waitingRoomCode, playerId: this.waitingPlayerId });
      this.waitingSeed = data.seed ?? 0;
      const authoritativeOptions = data.options ?? {
        maxPlayers: 2,
        maxWind: 10,
        gravity: 0.15,
        walls: 'open' as const,
        rulesetVersion: CURRENT_NETWORK_RULESET_VERSION,
      };
      this.waitingOptions = {
        ...authoritativeOptions,
        rulesetVersion: normalizeNetworkRulesetVersion(authoritativeOptions.rulesetVersion),
      };
      this.waitingPlayers = data.players ?? [];
      this.waitingThisPlayerReady = false;
      this.onlineSubView = 'waiting';
      this.onlineError = '';
      this.onlineBusy = false;
      this.render();
      void this.subscribeWaitingRoom();
    } catch (err) {
      console.error('Lobby.joinRoom: network error —', err);
      this.onlineError = 'Network error. Try again.';
      this.onlineBusy = false;
      this.render();
    }
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
        (value) => { this.onlineName = value; },
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
    const config: LobbyConfig = {
      mode: 'network',
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        loadout: normalizeTankLoadout(p.loadout),
        ...(p.ai ? { ai: p.ai } : {}),
      })),
      playerNames: room.players.map((p) => p.name),
      roomCode: this.waitingRoomCode,
      roomId: this.waitingRoomId,
      playerId: this.waitingPlayerId,
      token: this.waitingToken,
      settings: {
        seed: room.seed,
        maxWind: room.options.maxWind,
        gravity: room.options.gravity,
        ...(normalizeWallMode(room.options.walls) !== 'open'
          ? { walls: normalizeWallMode(room.options.walls) }
          : {}),
        ...(normalizeBattlefieldWorldId(room.options.battlefieldWorld) !== undefined
          ? { battlefieldWorld: normalizeBattlefieldWorldId(room.options.battlefieldWorld) }
          : {}),
        ...(normalizeTerrainHazardMode(room.options.hazards) !== 'none'
          ? { hazards: normalizeTerrainHazardMode(room.options.hazards) }
          : {}),
        // Best-of-N comes from the SYNCED room row so every client's engine agrees
        // (a per-client value would desync the deterministic lockstep). Absent on
        // pre-feature rooms => engine defaults to a single round.
        ...(room.options.rounds !== undefined ? { rounds: room.options.rounds } : {}),
        // SE-parity economy — same sourcing as rounds: from the synced room row, so every
        // client builds an identical engine. Absent on pre-feature rooms => engine defaults.
        ...(room.options.interestRate !== undefined ? { interestRate: room.options.interestRate } : {}),
        ...(room.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: room.options.suddenDeathTurn } : {}),
        ...(room.options.armsLevel !== undefined ? { armsLevel: room.options.armsLevel } : {}),
        ...(room.options.teamMode === true ? { teamMode: true } : {}),
        rulesetVersion: normalizeNetworkRulesetVersion(room.options.rulesetVersion),
      },
    };
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
    });
    const commitName = (): void => {
      const next = nameInput.value.trim();
      if (!next || next === me.name.trim()) return;
      void this.updateMe({ name: next });
    };
    nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); commitName(); }
    });
    nameInput.addEventListener('blur', () => { commitName(); });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'lobby-btn';
    applyBtn.style.cssText = 'padding:6px 12px;font-size:13px;';
    applyBtn.textContent = 'Apply';
    applyBtn.disabled = this.onlineBusy;
    applyBtn.addEventListener('click', () => { commitName(); });

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
      });
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
    if (this.leavingRoom) return;
    this.leavingRoom = true;
    this.onlineBusy = true;
    this.render();
    try {
      await this.session.leaveRoom();
    } catch (err) {
      console.debug('Lobby.leaveRoom: best-effort leave failed —', err);
      // Best-effort — leave the room locally regardless.
    }
    this.leavingRoom = false;
    clearSession(); // explicit leave forgets the rejoin session (AC-04) regardless of POST outcome
    this.onlineSubView = 'create';
    this.onlineBusy = false;
    this.onlineError = '';
    this.render();
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
    });

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
      });
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
    input.addEventListener('input', () => { onChange(input.value); });

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
    });

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
      });
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
    });

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
    });
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
    });

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
    select.addEventListener('change', () => onChange(select.value));

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

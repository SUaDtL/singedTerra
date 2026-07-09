import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { AiDifficulty } from '@shared/types/GameState';
import { clamp } from '@shared/engine/math';
import { armsLabel, roundsLabel, botLabel } from './browseLabels';
import {
  LobbyTransport,
  type NetworkPlayer,
  type RoomOptions,
  type BrowseRoom,
  type RoomVisibility,
  type FetchedRoom,
} from '../client/LobbyTransport';
import { writeSession, clearSession, readSession, isLiveSession, type SessionDescriptor } from '../lib/sessionDescriptor';
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
const PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Red', value: '#e84d4d' },
  { name: 'Blue', value: '#4d8ce8' },
  { name: 'Green', value: '#4de87a' },
  { name: 'Yellow', value: '#e8c84d' },
  { name: 'Purple', value: '#a855f7' },
];

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
  seed: string;
  rounds: string;
  interestRate: string;
  suddenDeathTurn: string;
  /** Arms level as a select value ('' = default/4). */
  armsLevel: string;
}

/** A working row of player config state in the setup UI. */
interface PlayerRowState {
  name: string;
  color: string;
  /** CPU difficulty for this seat, or undefined for a human. */
  ai?: AiDifficulty;
}

/** Active tab on the lobby. */
type LobbyTab = 'hotseat' | 'online';

/** Sub-view within the Play Online tab. */
type OnlineSubView = 'create' | 'join' | 'browse' | 'waiting';

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

  /** Working state for the player rows (defaults Player 1..N + palette order). */
  private players: PlayerRowState[] = [];

  /** Raw working state for the advanced-settings inputs (blank = use default). */
  private settings: SettingsState = { maxWind: '', gravity: '', seed: '', rounds: '', interestRate: '', suddenDeathTurn: '', armsLevel: '' };

  /** Whether the advanced-settings <details> is open (persist across renders). */
  private settingsOpen = false;

  // ---- Tab / online sub-view state ----
  private activeTab: LobbyTab = 'hotseat';
  private onlineSubView: OnlineSubView = 'create';

  // Create form state
  private onlineName = '';
  private onlineColor = PALETTE[0].value;
  private onlineMaxPlayers = 2;
  private onlineMaxWind = '';
  private onlineGravity = '';
  private onlineRounds = '';
  private onlineInterestRate = '';
  private onlineSuddenDeath = '';
  /** Arms level select value for the room being created ('' = default/4). */
  private onlineArmsLevel = '';
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
  private joinColor = PALETTE[1].value;

  // Browse (public rooms) sub-view state.
  private browseRooms: BrowseRoom[] = [];
  private browsePollId: ReturnType<typeof setInterval> | null = null;

  // Waiting room state (populated after create/join succeeds)
  private waitingRoomId = '';
  private waitingRoomCode = '';
  private waitingPlayerId = '';
  /** Secret per-seat credential for this room, captured from create_room/join_room. */
  private waitingToken = '';
  private waitingPlayers: NetworkPlayer[] = [];
  private waitingSeed = 0;
  private waitingOptions: RoomOptions = {
    maxPlayers: 2,
    maxWind: 10,
    gravity: 0.15,
  };
  private waitingThisPlayerReady = false;
  private waitingChannel: RealtimeChannel | null = null;
  /**
   * Lazily-loaded Supabase client. The hot-seat path (the common case) never
   * needs it, so we keep `@supabase/supabase-js` out of the initial bundle and
   * dynamic-import it only when the waiting room first subscribes (see
   * `getSupabase`). Mirrors the `await import('./lib/supabase')` seam in main.ts.
   */
  private supabaseClient: SupabaseClient | null = null;

  /** Heartbeat interval keeping THIS player's lastSeen fresh; lifetime == waiting channel. */
  private waitingHeartbeatId: ReturnType<typeof setInterval> | null = null;

  /**
   * "Meaningful signature" of the last-rendered waiting-room players + status,
   * EXCLUDING lastSeen. Used to suppress the 10s heartbeat-driven Realtime
   * UPDATE re-renders (de-flicker) while keeping ready/name/color/join/leave
   * changes instant.
   */
  private lastWaitingSig = '';

  // Shared online status message
  private onlineError = '';
  private onlineBusy = false;

  /**
   * T-09 (rejoin-after-refresh, AC-05) — the validated rejoin candidate, set
   * only once `checkRejoinCandidate()` confirms the stored session descriptor
   * points at a still-`active` room with the stored seat present. `null` means
   * "no affordance": either no descriptor was stored, validation hasn't
   * resolved yet, or the room turned out to be stale/invalid.
   */
  private rejoinCandidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null = null;

  constructor(root: HTMLElement, onReady: (config: LobbyConfig) => void) {
    this.root = root;
    this.onReady = onReady;
    this.players = [defaultRow(0), defaultRow(1)];
  }

  /**
   * Render the hot-seat setup overlay: choose 2-4 players, name each, and pick
   * a unique color. A Start button validates and hands a config to onReady.
   */
  show(): void {
    this.injectStyle();
    this.render();
    this.root.hidden = false;
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

  /** Inject the lobby's scoped <style> once (do NOT edit index.html). */
  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Fill the whole 1200x600 stage (same size as the game field). The #app
         gold frame + CRT overlay still frame it; content is vertically centred,
         falling back to top-aligned + scroll when it would overflow. */
      #lobby .lobby-card {
        position: relative;
        width: 100%;
        height: 100%;
        max-width: none;
        margin: 0;
        box-sizing: border-box;
        padding: 34px 56px;
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
        left: calc(var(--slot, 0) * 88px + 28px);
        bottom: calc(var(--slot, 0) * -2px);
        width: 70px;
        height: 42px;
        animation: lobby-tank-roll 2.4s ease-in-out infinite;
        animation-delay: calc(var(--slot, 0) * -0.42s);
        filter: drop-shadow(0 11px 12px rgba(0, 0, 0, 0.42));
      }
      #lobby .lobby-preview__barrel {
        position: absolute;
        left: 36px;
        top: 4px;
        width: 32px;
        height: 7px;
        border-radius: 999px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--tank-color) 52%, white), color-mix(in srgb, var(--tank-color) 55%, black));
        border: 2px solid rgba(18, 8, 10, 0.95);
        transform: rotate(-34deg);
        transform-origin: 0 50%;
      }
      #lobby .lobby-preview__turret {
        position: absolute;
        left: 25px;
        top: 15px;
        width: 23px;
        height: 12px;
        border-radius: 10px 10px 3px 3px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--tank-color) 72%, white), color-mix(in srgb, var(--tank-color) 72%, black));
        border: 2px solid rgba(18, 8, 10, 0.95);
      }
      #lobby .lobby-preview__body {
        position: absolute;
        left: 13px;
        top: 23px;
        width: 42px;
        height: 15px;
        border-radius: 4px 4px 2px 2px;
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--tank-color) 70%, white) 0 28%, var(--tank-color) 28% 68%, color-mix(in srgb, var(--tank-color) 62%, black) 68%);
        border: 2px solid rgba(18, 8, 10, 0.95);
      }
      #lobby .lobby-preview__tread {
        position: absolute;
        left: 7px;
        top: 34px;
        width: 55px;
        height: 13px;
        border-radius: 4px 4px 7px 7px;
        background:
          radial-gradient(circle at 15px 7px, #2a2118 0 4px, transparent 4.5px),
          radial-gradient(circle at 28px 7px, #2a2118 0 4px, transparent 4.5px),
          radial-gradient(circle at 41px 7px, #2a2118 0 4px, transparent 4.5px),
          linear-gradient(180deg, color-mix(in srgb, var(--tank-color) 46%, black), #130908);
        border: 2px solid rgba(18, 8, 10, 0.98);
      }
      #lobby .lobby-preview__name {
        position: absolute;
        left: 50%;
        top: 52px;
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
        max-width: 520px;
        margin-left: 104px;
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
        margin: 0 0 2px; font-size: 48px; letter-spacing: 0.5px;
        font-family: var(--font-display); font-weight: bold;
        color: var(--gold);
        text-shadow:
          0 2px 0 rgba(12, 7, 22, 0.85),
          0 0 20px rgba(255, 122, 31, 0.48);
      }
      #lobby .lobby-sub {
        margin: 0 0 22px;
        color: var(--text-dim);
        font-size: 13px;
        letter-spacing: 0.02em;
      }
      #lobby .lobby-field { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
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
      #lobby .lobby-rows { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 18px; }
      #lobby .lobby-row { display: flex; align-items: center; gap: 10px; }
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
      #lobby .lobby-swatch {
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        border: 2px solid transparent; padding: 0; background-clip: padding-box;
        transition: transform 80ms ease;
        box-shadow: inset 0 -6px 8px rgba(0, 0, 0, 0.22);
      }
      #lobby .lobby-swatch:hover { transform: scale(1.12); }
      #lobby .lobby-swatch.selected { border-color: var(--gold); box-shadow: 0 0 8px rgba(255, 210, 63, 0.5); }
      #lobby .lobby-swatch.taken { opacity: 0.3; cursor: not-allowed; }
      #lobby .lobby-error { color: var(--tank-red); font-size: 13px; min-height: 18px; margin-bottom: 10px; }
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
        width: 100%; padding: 14px; font-size: 16px; font-weight: bold; cursor: pointer;
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
      #lobby .lobby-advanced { margin: 0 0 16px; border-top: 1px solid rgba(255, 210, 63, 0.14); padding-top: 12px; }
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
        display: flex; gap: 6px; margin-bottom: 20px;
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
      #lobby .online-code-display {
        display: flex; gap: 8px; justify-content: center; margin: 12px 0 20px;
      }
      #lobby .online-code-char {
        width: 40px; height: 44px; background: rgba(12, 7, 22, 0.8);
        border: 1px solid rgba(255, 210, 63, 0.25);
        border-radius: 6px; display: flex; align-items: center; justify-content: center;
        font-size: 24px; font-weight: 700; letter-spacing: 0; color: var(--gold);
        font-family: var(--font-mono);
      }
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
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px;
        margin-top: 20px; padding: 12px 14px;
        border: 1px solid rgba(255, 210, 63, 0.16);
        border-radius: 8px;
        background: rgba(12, 7, 22, 0.50);
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
    `;
    document.head.append(style);
  }

  /** Re-render the lobby card from current working state. */
  private render(): void {
    this.root.replaceChildren();

    const card = document.createElement('div');
    card.className = 'lobby-card';

    const title = document.createElement('h1');
    title.textContent = 'singedTerra';
    card.append(title);
    card.append(this.renderVehiclePreview());

    // Rejoin affordance (T-09, AC-05) — shown ONLY once a stored session
    // descriptor has been validated live; placed at the very top so it's
    // visible on load regardless of which tab is active.
    if (this.rejoinCandidate) {
      card.append(this.renderRejoinBanner());
    }

    // Tab bar
    card.append(this.renderTabBar());

    if (this.activeTab === 'hotseat') {
      card.append(this.renderHotSeatTab());
    } else {
      card.append(this.renderOnlineTab());
    }

    card.append(this.renderControlsLegend());

    this.root.append(card);
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
      '<span><kbd>Tab</kbd>/<kbd>Q</kbd> Weapon</span>' +
      '<span><kbd>Space</kbd>/<kbd>Enter</kbd> Fire</span>';
    return el;
  }

  /** Live color preview: the selected roster rendered as rolling vector tanks. */
  private renderVehiclePreview(): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'lobby-preview';

    const label = document.createElement('div');
    label.className = 'lobby-preview__label';
    label.textContent = this.activeTab === 'hotseat' ? 'Roster Preview' : 'Vehicle Bay';

    const convoy = document.createElement('div');
    convoy.className = 'lobby-preview__convoy';
    const roster = this.activeTab === 'hotseat'
      ? this.players
      : [{ name: this.onlineName || 'You', color: this.onlineColor }];
    roster.slice(0, MAX_PLAYERS).forEach((player, index) => {
      convoy.append(this.renderPreviewTank(player.name || `Player ${index + 1}`, player.color, index));
    });

    preview.append(label, convoy);
    return preview;
  }

  private renderPreviewTank(name: string, color: string, index: number): HTMLElement {
    const tank = document.createElement('div');
    tank.className = 'lobby-preview__tank';
    tank.style.setProperty('--tank-color', color);
    tank.style.setProperty('--slot', String(index));

    const barrel = document.createElement('div');
    barrel.className = 'lobby-preview__barrel';
    const turret = document.createElement('div');
    turret.className = 'lobby-preview__turret';
    const body = document.createElement('div');
    body.className = 'lobby-preview__body';
    const tread = document.createElement('div');
    tread.className = 'lobby-preview__tread';
    const label = document.createElement('div');
    label.className = 'lobby-preview__name';
    label.textContent = name.trim() || `Player ${index + 1}`;

    tank.append(barrel, turret, body, tread, label);
    return tank;
  }

  /**
   * T-09 (AC-05) — the "Rejoin your game" affordance. Only rendered when
   * `checkRejoinCandidate()` has confirmed a live session. Styling mirrors the
   * lobby's existing status/banner conventions (`.online-status`, `.lobby-btn`)
   * rather than inventing a new visual language.
   */
  private renderRejoinBanner(): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'lobby-rejoin-banner';

    const text = document.createElement('span');
    text.className = 'lobby-rejoin-text';
    text.textContent = 'You have a game in progress.';
    banner.append(text);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lobby-btn';
    btn.textContent = 'Rejoin your game';
    btn.addEventListener('click', () => { void this.handleRejoin(); });
    banner.append(btn);

    return banner;
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
      players: liveRoom.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ...(p.ai ? { ai: p.ai } : {}) })),
      playerNames: liveRoom.players.map((p) => p.name),
      roomCode: liveRoom.code,
      roomId: liveRoom.id,
      playerId: descriptor.playerId,
      token,
      settings: {
        seed: liveRoom.seed,
        maxWind: liveRoom.options.maxWind,
        gravity: liveRoom.options.gravity,
        ...(liveRoom.options.rounds !== undefined ? { rounds: liveRoom.options.rounds } : {}),
        ...(liveRoom.options.interestRate !== undefined ? { interestRate: liveRoom.options.interestRate } : {}),
        ...(liveRoom.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: liveRoom.options.suddenDeathTurn } : {}),
        ...(liveRoom.options.armsLevel !== undefined ? { armsLevel: liveRoom.options.armsLevel } : {}),
      },
    };
    this.onReady(config);
  }

  // ---- Tab bar ----

  private renderTabBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'lobby-tabs';

    const hotSeatBtn = document.createElement('button');
    hotSeatBtn.type = 'button';
    hotSeatBtn.className = 'lobby-tab' + (this.activeTab === 'hotseat' ? ' active' : '');
    hotSeatBtn.textContent = 'Hot Seat';
    hotSeatBtn.addEventListener('click', () => {
      this.activeTab = 'hotseat';
      this.render();
    });

    const onlineBtn = document.createElement('button');
    onlineBtn.type = 'button';
    onlineBtn.className = 'lobby-tab' + (this.activeTab === 'online' ? ' active' : '');
    onlineBtn.textContent = 'Play Online';
    onlineBtn.addEventListener('click', () => {
      this.activeTab = 'online';
      this.render();
    });

    bar.append(hotSeatBtn, onlineBtn);
    return bar;
  }

  // ---- Hot Seat tab ----

  private renderHotSeatTab(): HTMLElement {
    const frag = document.createDocumentFragment();

    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent = 'Hot-seat setup — choose 2-4 players, name them, pick a color.';
    frag.append(sub);

    // Player count selector.
    const countField = document.createElement('div');
    countField.className = 'lobby-field';
    const countLabel = document.createElement('label');
    countLabel.textContent = 'Players';
    const countSelect = document.createElement('select');
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === this.players.length) opt.selected = true;
      countSelect.append(opt);
    }
    countSelect.addEventListener('change', () => {
      this.setPlayerCount(Number(countSelect.value));
    });
    countField.append(countLabel, countSelect);
    frag.append(countField);

    // Per-player rows.
    const rows = document.createElement('div');
    rows.className = 'lobby-rows';
    this.players.forEach((_, i) => rows.append(this.renderRow(i)));
    frag.append(rows);

    // Advanced (engine) settings.
    frag.append(this.renderAdvanced());

    // Validation error message.
    const error = document.createElement('div');
    error.className = 'lobby-error';
    error.textContent = this.validationError() ?? '';
    frag.append(error);

    // Start button.
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'lobby-start';
    start.textContent = 'Start Game';
    start.disabled = this.validationError() !== null;
    start.addEventListener('click', () => {
      if (this.validationError() !== null) return;
      const players = this.players.map((p, i) => ({
        name: p.name.trim() || (p.ai ? `CPU ${i + 1}` : `Player ${i + 1}`),
        color: p.color,
        ...(p.ai ? { ai: p.ai } : {}),
      }));
      const settings = this.parseSettings();
      this.onReady({
        mode: 'hotseat',
        players,
        playerNames: players.map((p) => p.name),
        ...(settings ? { settings } : {}),
      });
    });
    frag.append(start);

    // Wrap in a container so we can return an Element
    const wrapper = document.createElement('div');
    wrapper.append(frag);
    return wrapper;
  }

  // ---- Online tab ----

  private renderOnlineTab(): HTMLElement {
    const wrapper = document.createElement('div');

    if (this.onlineSubView === 'create') {
      wrapper.append(this.renderCreateForm());
    } else if (this.onlineSubView === 'join') {
      wrapper.append(this.renderJoinForm());
    } else if (this.onlineSubView === 'browse') {
      wrapper.append(this.renderBrowse());
    } else {
      wrapper.append(this.renderWaitingRoom());
    }

    return wrapper;
  }

  // ---- Create Room sub-view ----

  private renderCreateForm(): HTMLElement {
    const frag = document.createElement('div');

    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent = 'Create a new online room and invite friends.';
    frag.append(sub);

    // Name + color row
    frag.append(this.renderOnlineNameColor(
      this.onlineName,
      this.onlineColor,
      (v) => { this.onlineName = v; },
      (v) => { this.onlineColor = v; this.render(); },
      /* takenColors */ [],
    ));

    // Max players
    const mpField = document.createElement('div');
    mpField.className = 'lobby-field';
    const mpLabel = document.createElement('label');
    mpLabel.textContent = 'Players';
    const mpSelect = document.createElement('select');
    for (let n = 2; n <= 4; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === this.onlineMaxPlayers) opt.selected = true;
      mpSelect.append(opt);
    }
    mpSelect.addEventListener('change', () => {
      this.onlineMaxPlayers = Number(mpSelect.value);
      // Keep bot count valid (need ≥1 human seat).
      if (this.onlineBots > this.onlineMaxPlayers - 1) this.onlineBots = this.onlineMaxPlayers - 1;
      this.render();
    });
    mpField.append(mpLabel, mpSelect);
    frag.append(mpField);

    // CPU opponents: seed N bot seats (0..maxPlayers-1) at a chosen difficulty.
    // They occupy seats immediately (always ready), so the remaining seats are
    // the human ones friends join via the code. Driven by whichever client is
    // connected (see NetworkClient.maybeDriveBot).
    const botField = document.createElement('div');
    botField.className = 'lobby-field';
    const botLabel = document.createElement('label');
    botLabel.textContent = 'CPU opponents';
    const botSelect = document.createElement('select');
    for (let n = 0; n <= this.onlineMaxPlayers - 1; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === this.onlineBots) opt.selected = true;
      botSelect.append(opt);
    }
    botSelect.addEventListener('change', () => { this.onlineBots = Number(botSelect.value); this.render(); });
    botField.append(botLabel, botSelect);
    if (this.onlineBots > 0) {
      const diffSelect = document.createElement('select');
      for (const d of ['easy', 'medium', 'hard'] as AiDifficulty[]) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d[0].toUpperCase() + d.slice(1);
        if (d === this.onlineBotDifficulty) opt.selected = true;
        diffSelect.append(opt);
      }
      diffSelect.addEventListener('change', () => { this.onlineBotDifficulty = diffSelect.value as AiDifficulty; });
      botField.append(diffSelect);
    }
    frag.append(botField);

    // Visibility toggle (public is listed/joinable from Browse; private is
    // code-only). Defaults to public.
    const visField = document.createElement('div');
    visField.className = 'lobby-field';
    const visLabel = document.createElement('label');
    visLabel.textContent = 'Visibility';
    const visSelect = document.createElement('select');
    for (const v of ['public', 'private'] as RoomVisibility[]) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v === 'public' ? 'Public' : 'Private';
      if (v === this.onlineVisibility) opt.selected = true;
      visSelect.append(opt);
    }
    visSelect.addEventListener('change', () => {
      this.onlineVisibility = visSelect.value as RoomVisibility;
    });
    visField.append(visLabel, visSelect);
    frag.append(visField);

    // Advanced settings (wind cap + gravity; no seed — server-generated)
    const details = document.createElement('details');
    details.className = 'lobby-advanced';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced settings';
    details.append(summary);
    details.append(
      this.onlineNumberField('Wind cap', this.onlineMaxWind, (v) => { this.onlineMaxWind = v; }, {
        min: WIND_MIN, max: WIND_MAX, step: 1, placeholder: String(WIND_DEFAULT),
        hint: `${WIND_MIN}–${WIND_MAX}`,
      }),
      this.onlineNumberField('Gravity', this.onlineGravity, (v) => { this.onlineGravity = v; }, {
        min: GRAVITY_MIN, max: GRAVITY_MAX, step: GRAVITY_STEP, placeholder: String(GRAVITY_DEFAULT),
        hint: `${GRAVITY_MIN}–${GRAVITY_MAX}`,
      }),
      this.onlineNumberField('Rounds', this.onlineRounds, (v) => { this.onlineRounds = v; }, {
        min: ROUNDS_MIN, max: ROUNDS_MAX, step: 2, placeholder: String(ROUNDS_DEFAULT),
        hint: 'best-of-N, odd',
      }),
      this.onlineNumberField('Interest', this.onlineInterestRate, (v) => { this.onlineInterestRate = v; }, {
        min: INTEREST_MIN, max: INTEREST_MAX, step: INTEREST_STEP, placeholder: String(INTEREST_DEFAULT),
        hint: 'per-round credit interest (0–0.5)',
      }),
      this.onlineNumberField('Sudden death', this.onlineSuddenDeath, (v) => { this.onlineSuddenDeath = v; }, {
        min: SUDDEN_DEATH_MIN, max: SUDDEN_DEATH_MAX, step: 1, placeholder: String(SUDDEN_DEATH_DEFAULT),
        hint: 'gravity ramps past this turn (0 = off)',
      }),
      this.onlineNumberField('Arms level', this.onlineArmsLevel, (v) => { this.onlineArmsLevel = v; }, {
        min: ARMS_MIN, max: ARMS_MAX, step: 1, placeholder: String(ARMS_DEFAULT),
        hint: '0 = basic … 4 = full arsenal',
      }),
    );
    frag.append(details);

    // Status / error
    frag.append(this.renderOnlineStatus());

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'lobby-btn-row';

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'lobby-btn';
    createBtn.textContent = this.onlineBusy ? 'Creating...' : 'Create Room';
    createBtn.disabled = this.onlineBusy;
    createBtn.addEventListener('click', () => { void this.handleCreateRoom(); });

    const joinLink = document.createElement('button');
    joinLink.type = 'button';
    joinLink.className = 'lobby-btn secondary';
    joinLink.textContent = 'Join Room instead';
    joinLink.addEventListener('click', () => {
      this.onlineSubView = 'join';
      this.onlineError = '';
      this.render();
    });

    const browseLink = document.createElement('button');
    browseLink.type = 'button';
    browseLink.className = 'lobby-btn secondary';
    browseLink.textContent = 'Browse public rooms';
    browseLink.addEventListener('click', () => { this.enterBrowse(); });

    btnRow.append(createBtn, joinLink, browseLink);
    frag.append(btnRow);

    return frag;
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
      const bots: Array<{ name: string; color: string; ai: AiDifficulty }> = [];
      for (let i = 0; i < this.onlineBots; i++) {
        const c = PALETTE.find((p) => !used.has(p.value));
        if (!c) break; // ran out of distinct colors
        used.add(c.value);
        bots.push({ name: `CPU ${i + 1}`, color: c.value, ai: this.onlineBotDifficulty });
      }

      const { ok, data } = await this.transport.createRoom({
        playerName: name,
        color: this.onlineColor,
        bots,
        maxPlayers: this.onlineMaxPlayers,
        visibility: this.onlineVisibility,
        maxWind: this.onlineMaxWind,
        gravity: this.onlineGravity,
        rounds: this.onlineRounds,
        interestRate: this.onlineInterestRate,
        suddenDeath: this.onlineSuddenDeath,
        armsLevel: this.onlineArmsLevel,
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
      }];
      this.waitingOptions = {
        maxPlayers: this.onlineMaxPlayers,
        maxWind: parseNumber(this.onlineMaxWind) !== undefined
          ? clamp(parseNumber(this.onlineMaxWind)!, WIND_MIN, WIND_MAX)
          : WIND_DEFAULT,
        gravity: parseNumber(this.onlineGravity) !== undefined
          ? clamp(parseNumber(this.onlineGravity)!, GRAVITY_MIN, GRAVITY_MAX)
          : GRAVITY_DEFAULT,
        ...(rounds !== undefined ? { rounds } : {}),
        ...economy,
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
    const frag = document.createElement('div');

    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent = 'Enter the 4-character room code to join.';
    frag.append(sub);

    // Code input
    const codeField = document.createElement('div');
    codeField.className = 'lobby-field';
    const codeLabel = document.createElement('label');
    codeLabel.textContent = 'Room code';
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.className = 'lobby-code-input';
    codeInput.maxLength = 4;
    codeInput.value = this.joinCode;
    codeInput.placeholder = 'XXXX';
    codeInput.addEventListener('input', () => {
      this.joinCode = normalizeRoomCode(codeInput.value);
      codeInput.value = this.joinCode;
    });
    codeField.append(codeLabel, codeInput);
    frag.append(codeField);

    // Name + color
    frag.append(this.renderOnlineNameColor(
      this.onlineName,
      this.joinColor,
      (v) => { this.onlineName = v; },
      (v) => { this.joinColor = v; this.render(); },
      [],
    ));

    // Status / error
    frag.append(this.renderOnlineStatus());

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'lobby-btn-row';

    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.className = 'lobby-btn';
    joinBtn.textContent = this.onlineBusy ? 'Joining...' : 'Join Room';
    joinBtn.disabled = this.onlineBusy;
    joinBtn.addEventListener('click', () => { void this.handleJoinRoom(); });

    const createLink = document.createElement('button');
    createLink.type = 'button';
    createLink.className = 'lobby-btn secondary';
    createLink.textContent = 'Create instead';
    createLink.addEventListener('click', () => {
      this.onlineSubView = 'create';
      this.onlineError = '';
      this.render();
    });

    const browseLink = document.createElement('button');
    browseLink.type = 'button';
    browseLink.className = 'lobby-btn secondary';
    browseLink.textContent = 'Browse public rooms';
    browseLink.addEventListener('click', () => { this.enterBrowse(); });

    btnRow.append(joinBtn, createLink, browseLink);
    frag.append(btnRow);

    return frag;
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
      const { ok, data } = await this.transport.joinRoom({ code, playerName: name, color: this.joinColor });

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
      this.waitingOptions = data.options ?? { maxPlayers: 2, maxWind: 10, gravity: 0.15 };
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
    this.stopBrowsePoll();
    this.browsePollId = setInterval(() => { void this.fetchRooms(); }, 3000);
  }

  /** Stop the list_rooms poll if running. */
  private stopBrowsePoll(): void {
    if (this.browsePollId !== null) {
      clearInterval(this.browsePollId);
      this.browsePollId = null;
    }
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
    const frag = document.createElement('div');

    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent = 'Public rooms looking for players.';
    frag.append(sub);

    // Name + color for the joiner (no colors are pre-taken in this view).
    frag.append(this.renderOnlineNameColor(
      this.onlineName,
      this.joinColor,
      (v) => { this.onlineName = v; },
      (v) => { this.joinColor = v; this.render(); },
      /* takenColors */ [],
    ));

    // Status / error
    frag.append(this.renderOnlineStatus());

    // Room list
    const list = document.createElement('ul');
    list.className = 'online-player-list';
    if (this.browseRooms.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'online-player-row';
      empty.style.cssText = 'color:var(--text-dim);';
      empty.textContent = 'No public rooms right now.';
      list.append(empty);
    } else {
      for (const room of this.browseRooms) {
        const row = document.createElement('li');
        row.className = 'online-player-row';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = room.hostName || '(unnamed host)';

        // Match-shape metadata: rounds · arms tier · CPU count (each omitted when empty).
        const metaSpan = document.createElement('span');
        metaSpan.style.cssText = 'margin-left:8px;color:var(--text-dim);font-size:12px;';
        metaSpan.textContent = [
          roundsLabel(room.rounds),
          armsLabel(room.armsLevel),
          botLabel(room.botCount),
        ].filter(Boolean).join(' · ');

        const joinBtn = document.createElement('button');
        joinBtn.type = 'button';
        joinBtn.className = 'lobby-btn';
        joinBtn.style.cssText = 'margin-left:auto;padding:4px 12px;font-size:13px;';
        const full = room.playerCount >= room.maxPlayers;
        joinBtn.textContent = `Join (${room.playerCount}/${room.maxPlayers})`;
        joinBtn.disabled = full || this.onlineBusy;
        joinBtn.addEventListener('click', () => {
          if (full) return;
          void this.joinByCode(room.code);
        });

        row.append(nameSpan, metaSpan, joinBtn);
        list.append(row);
      }
    }
    frag.append(list);

    // Back links
    const btnRow = document.createElement('div');
    btnRow.className = 'lobby-btn-row';

    const createLink = document.createElement('button');
    createLink.type = 'button';
    createLink.className = 'lobby-btn secondary';
    createLink.textContent = 'Create instead';
    createLink.addEventListener('click', () => { this.leaveBrowse('create'); });

    const joinLink = document.createElement('button');
    joinLink.type = 'button';
    joinLink.className = 'lobby-btn secondary';
    joinLink.textContent = 'Join by code';
    joinLink.addEventListener('click', () => { this.leaveBrowse('join'); });

    btnRow.append(createLink, joinLink);
    frag.append(btnRow);

    return frag;
  }

  // ---- Waiting Room sub-view ----

  private renderWaitingRoom(): HTMLElement {
    const frag = document.createElement('div');

    // Sub-copy reflects HUMAN readiness, not raw seat counts (P2-11): a room of
    // 1 human + 3 CPU is not "waiting for players" — its bots are always ready, so
    // counting them made the room look perpetually unfilled. Show humans-ready, the
    // CPU count, and only flag "waiting for players" when seats are genuinely open.
    const humans = this.waitingPlayers.filter((p) => !p.ai);
    const humansReady = humans.filter((p) => p.ready).length;
    const cpuCount = this.waitingPlayers.length - humans.length;
    const seatsOpen = this.waitingPlayers.length < this.waitingOptions.maxPlayers;
    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent =
      `${humansReady}/${humans.length} human${humans.length === 1 ? '' : 's'} ready`
      + (cpuCount > 0 ? ` · ${cpuCount} CPU` : '')
      + (seatsOpen ? ' · waiting for players to join' : '');
    frag.append(sub);

    // Room code display
    const codeLabel = document.createElement('p');
    codeLabel.style.cssText = 'color:var(--text-dim);font-size:13px;margin:0 0 6px;';
    codeLabel.textContent = 'Share this code:';
    frag.append(codeLabel);

    const codeDisplay = document.createElement('div');
    codeDisplay.className = 'online-code-display';
    const codeChars = this.waitingRoomCode.padEnd(4, ' ').split('');
    for (const ch of codeChars) {
      const charBox = document.createElement('div');
      charBox.className = 'online-code-char';
      charBox.textContent = ch.trim() || ' ';
      codeDisplay.append(charBox);
    }
    frag.append(codeDisplay);

    // Player list
    const listHeader = document.createElement('p');
    listHeader.style.cssText = 'color:var(--text-dim);font-size:13px;margin:0 0 8px;';
    listHeader.textContent = `Players (${this.waitingPlayers.length}/${this.waitingOptions.maxPlayers}):`;
    frag.append(listHeader);

    // Colors held by more than one player in the room. A shared color makes the
    // two tanks visually indistinguishable in-game, so we surface it here and
    // block the game from starting until it is resolved (see Ready-Up gate).
    const clashColors = this.duplicateColors();
    const clashNames = this.duplicateNames();

    const playerList = document.createElement('ul');
    playerList.className = 'online-player-list';
    for (const p of this.waitingPlayers) {
      const row = document.createElement('li');
      row.className = 'online-player-row';

      const dot = document.createElement('div');
      dot.className = 'online-player-dot' + (clashColors.has(p.color) ? ' clash' : '');
      dot.style.background = p.color;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;

      // Accessible clash cue (P2-11): a red ring on the dot relies on color alone
      // and was only meaningful to the clashing client. Add a text/icon tag on ANY
      // row sharing a color or name, so every player can see (and read) the clash.
      const sharesColor = clashColors.has(p.color);
      const sharesName = clashNames.has(p.name.trim().toLowerCase());
      if (sharesColor || sharesName) {
        const tag = document.createElement('span');
        tag.className = 'online-clash-tag';
        const what = sharesColor && sharesName ? 'color + name' : sharesColor ? 'color' : 'name';
        tag.textContent = `⚠ shared ${what}`;
        tag.style.cssText = 'color:var(--tank-red,#e8554d);font-size:11px;margin-left:6px;white-space:nowrap;';
        nameSpan.append(tag);
      }

      const badge = document.createElement('span');
      if (p.ai) {
        // Bot seats are always ready; badge them as CPU + difficulty so a mostly-CPU
        // room doesn't read as waiting on humans who will never come.
        const diff = p.ai.charAt(0).toUpperCase() + p.ai.slice(1);
        badge.className = 'online-badge ready';
        badge.textContent = `🤖 ${diff}`;
      } else {
        badge.className = 'online-badge ' + (p.ready ? 'ready' : 'waiting');
        badge.textContent = p.ready ? 'Ready' : 'Waiting...';
      }

      row.append(dot, nameSpan, badge);
      playerList.append(row);
    }
    frag.append(playerList);

    // Self-edit controls: a player can fix a name/color clash in place (via
    // update_player) without leaving and rejoining.
    frag.append(this.renderWaitingSelfEdit());

    // If THIS player clashes on color and/or name with someone else, show an
    // actionable warning and block ready-up. Now resolvable in place via the
    // self-edit controls above.
    const colorClash = this.myColorClashes();
    const nameClash = this.myNameClashes();
    const myClash = colorClash || nameClash;
    if (myClash) {
      const warn = document.createElement('p');
      warn.className = 'online-status error';
      const parts: string[] = [];
      if (colorClash) parts.push('color');
      if (nameClash) parts.push('name');
      warn.textContent =
        `Another player already has your ${parts.join(' and ')}. Change it above to start.`;
      frag.append(warn);
    }

    // Status / error
    frag.append(this.renderOnlineStatus());

    // Ready / Leave buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'lobby-btn-row';

    const readyBtn = document.createElement('button');
    readyBtn.type = 'button';
    readyBtn.className = 'lobby-btn';
    if (this.waitingThisPlayerReady) {
      readyBtn.textContent = 'Waiting for others...';
      readyBtn.disabled = true;
    } else if (myClash) {
      // Block readying up while this player's name or color clashes — prevents
      // starting a game with two indistinguishable tanks (or duplicate names)
      // even if the server's join-time uniqueness check is an older deploy.
      readyBtn.textContent = 'Ready Up';
      readyBtn.disabled = true;
    } else {
      readyBtn.textContent = 'Ready Up';
      readyBtn.disabled = this.onlineBusy;
    }
    readyBtn.addEventListener('click', () => { void this.handleReadyUp(); });

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'lobby-btn secondary';
    leaveBtn.textContent = 'Leave';
    leaveBtn.addEventListener('click', () => { void this.handleLeaveRoom(); });

    btnRow.append(readyBtn, leaveBtn);
    frag.append(btnRow);

    return frag;
  }

  /**
   * Dynamic-import + memoize the Supabase client. Keeps `@supabase/supabase-js`
   * out of the hot-seat initial bundle; the chunk is fetched only on the first
   * networked waiting-room subscription.
   */
  private async getSupabase(): Promise<SupabaseClient> {
    if (!this.supabaseClient) {
      const mod = await import('../lib/supabase');
      this.supabaseClient = mod.supabase;
    }
    return this.supabaseClient;
  }

  private async subscribeWaitingRoom(): Promise<void> {
    this.cleanupWaitingChannel();
    const roomId = this.waitingRoomId;
    const supabase = await this.getSupabase();

    this.waitingChannel = supabase
      .channel(`rooms:${roomId}`)
      .on(
        'postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0],
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload: { new: { players?: NetworkPlayer[]; status?: string; seed?: number; options?: RoomOptions } }) => {
          const row = payload.new;
          if (Array.isArray(row.players)) {
            this.waitingPlayers = row.players;
          }
          if (row.seed !== undefined) {
            this.waitingSeed = row.seed;
          }
          if (row.options !== undefined) {
            this.waitingOptions = row.options;
          }

          if (row.status === 'active') {
            this.cleanupWaitingChannel();
            this.emitNetworkReady(row as { players: NetworkPlayer[]; seed: number; options: RoomOptions });
            return;
          }

          // Dead-room: if I'm no longer in the roster (reaped as a stale ghost, or
          // otherwise removed), the room is effectively gone for me — bail to the
          // create view instead of waiting forever on a row I'm not part of (P1-6b).
          if (
            Array.isArray(row.players) &&
            !row.players.some((p) => p.id === this.waitingPlayerId)
          ) {
            this.handleRoomGone('You are no longer in this room.');
            return;
          }

          // De-flicker: heartbeats rewrite the row every 10s/player (bumping each
          // player's lastSeen), which would otherwise trigger a re-render on a
          // ~10s cadence. Compute a signature of the meaningful state EXCLUDING
          // lastSeen and only re-render when it actually changed. State above is
          // always updated from the row regardless.
          const sig = this.waitingSignature(this.waitingPlayers, row.status);
          if (sig !== this.lastWaitingSig) {
            this.lastWaitingSig = sig;
            this.render();
          }
        },
      )
      .on(
        // Dead-room: the whole row was deleted (last player left, or the lazy-GC
        // reaper culled a fully-stale room) — return to the create view instead of
        // freezing on a room that no longer exists (P1-6b).
        'postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0],
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          this.handleRoomGone('This room is no longer available.');
        },
      )
      .subscribe();

    // Tie the heartbeat lifetime to the waiting channel. subscribeWaitingRoom is
    // called from BOTH the create and join paths, so this covers both.
    this.startHeartbeat();
  }

  /**
   * "Meaningful signature" of the waiting-room state — id/name/color/ready per
   * player plus the room status — deliberately EXCLUDING lastSeen so heartbeat
   * writes don't change it.
   */
  private waitingSignature(players: NetworkPlayer[], status?: string): string {
    return (
      players.map((p) => `${p.id}|${p.name}|${p.color}|${p.ready}`).join(',') +
      '|' +
      (status ?? '')
    );
  }

  /**
   * Start the heartbeat loop: best-effort POST heartbeat every 10s so the server
   * keeps THIS player's lastSeen fresh and the lazy-GC reaper doesn't treat them
   * as a closed-tab ghost. Errors are ignored. Clears any prior interval first.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.waitingHeartbeatId = setInterval(() => {
      void this.transport.heartbeat({ roomId: this.waitingRoomId, playerId: this.waitingPlayerId, token: this.waitingToken }).catch(() => {
        // Best-effort: a missed heartbeat just means one stale window; the next
        // tick recovers it. Never surface heartbeat errors to the UI.
      });
    }, 10000);
  }

  /** Stop the heartbeat loop if running. */
  private stopHeartbeat(): void {
    if (this.waitingHeartbeatId !== null) {
      clearInterval(this.waitingHeartbeatId);
      this.waitingHeartbeatId = null;
    }
  }

  private emitNetworkReady(room: { players: NetworkPlayer[]; seed: number; options: RoomOptions }): void {
    const config: LobbyConfig = {
      mode: 'network',
      players: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ...(p.ai ? { ai: p.ai } : {}) })),
      playerNames: room.players.map((p) => p.name),
      roomCode: this.waitingRoomCode,
      roomId: this.waitingRoomId,
      playerId: this.waitingPlayerId,
      token: this.waitingToken,
      settings: {
        seed: room.seed,
        maxWind: room.options.maxWind,
        gravity: room.options.gravity,
        // Best-of-N comes from the SYNCED room row so every client's engine agrees
        // (a per-client value would desync the deterministic lockstep). Absent on
        // pre-feature rooms => engine defaults to a single round.
        ...(room.options.rounds !== undefined ? { rounds: room.options.rounds } : {}),
        // SE-parity economy — same sourcing as rounds: from the synced room row, so every
        // client builds an identical engine. Absent on pre-feature rooms => engine defaults.
        ...(room.options.interestRate !== undefined ? { interestRate: room.options.interestRate } : {}),
        ...(room.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: room.options.suddenDeathTurn } : {}),
        ...(room.options.armsLevel !== undefined ? { armsLevel: room.options.armsLevel } : {}),
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
      const { ok, data } = await this.transport.readyUp({ roomId: this.waitingRoomId, playerId: this.waitingPlayerId, token: this.waitingToken });

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to ready up.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      if (Array.isArray(data?.players)) {
        this.waitingPlayers = data.players;
      }
      this.waitingThisPlayerReady = true;
      this.onlineBusy = false;

      if (data?.started) {
        // Game started immediately (e.g. last player readied up).
        // The Realtime UPDATE may arrive momentarily; if it hasn't yet, trigger
        // the transition directly from the ready_up response.
        this.cleanupWaitingChannel();
        this.emitNetworkReady({
          players: this.waitingPlayers,
          seed: this.waitingSeed,
          options: this.waitingOptions,
        });
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
        void this.updateMe({ color: color.value });
      });
      swatches.append(swatch);
    }
    wrapper.append(swatches);

    return wrapper;
  }

  /**
   * POST update_player to change this player's name and/or color in place. On
   * 409 (taken) surface the server error and re-render WITHOUT mutating local
   * state. On success, adopt the returned players list for immediacy (Realtime
   * will also broadcast the same change to everyone).
   */
  private async updateMe(fields: { name?: string; color?: string }): Promise<void> {
    this.onlineBusy = true;
    this.onlineError = '';
    this.render();

    try {
      const { ok, data } = await this.transport.updatePlayer({
        roomId: this.waitingRoomId,
        playerId: this.waitingPlayerId,
        token: this.waitingToken,
        fields,
      });

      if (!ok || data?.error) {
        this.onlineError = data?.error ?? 'Failed to update.';
        this.onlineBusy = false;
        this.render();
        return;
      }

      if (Array.isArray(data?.players)) {
        this.waitingPlayers = data.players;
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
    const roomId = this.waitingRoomId;
    const playerId = this.waitingPlayerId;
    const token = this.waitingToken;
    try {
      await this.transport.leaveRoom({ roomId, playerId, token });
    } catch (err) {
      console.debug('Lobby.leaveRoom: best-effort leave failed —', err);
      // Best-effort — leave the room locally regardless.
    }
    clearSession(); // explicit leave forgets the rejoin session (AC-04) regardless of POST outcome
    this.cleanupWaitingChannel();
    this.onlineSubView = 'create';
    this.onlineError = '';
    this.render();
  }

  /**
   * Handle a waiting room that has vanished out from under this client — either
   * deleted (DELETE event) or with this player no longer in its roster (P1-6b).
   * Tears the channel/heartbeat down, resets waiting state so nothing stale leaks
   * into a later create/join, and returns to the create view with an explanation.
   * Idempotent: a no-op once we've already left a waiting room.
   */
  private handleRoomGone(message: string): void {
    if (!this.waitingRoomId) return; // already left / handled
    this.cleanupWaitingChannel();
    this.waitingRoomId = '';
    this.waitingRoomCode = '';
    this.waitingPlayerId = '';
    this.waitingToken = '';
    this.waitingPlayers = [];
    this.waitingThisPlayerReady = false;
    this.onlineSubView = 'create';
    this.onlineError = message;
    this.render();
  }

  private cleanupWaitingChannel(): void {
    // Heartbeat lifetime == waiting-channel lifetime: this runs on leave, hide,
    // and game start, so the loop is torn down in every exit path.
    this.stopHeartbeat();
    this.lastWaitingSig = '';
    if (this.waitingChannel) {
      void this.supabaseClient?.removeChannel(this.waitingChannel);
      this.waitingChannel = null;
    }
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
    nameInput.addEventListener('input', () => { onName(nameInput.value); });

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
    const row = document.createElement('div');
    row.className = 'lobby-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'lobby-name';
    name.value = this.players[index].name;
    name.maxLength = 16;
    name.placeholder = `Player ${index + 1}`;
    name.addEventListener('input', () => {
      this.players[index].name = name.value;
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
      if (this.players[index].color === color.value) swatch.classList.add('selected');
      if (takenByOther) swatch.classList.add('taken');
      swatch.addEventListener('click', () => {
        if (takenByOther) return;
        this.players[index].color = color.value;
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
      if ((this.players[index].ai ?? 'human') === o.value) opt.selected = true;
      control.append(opt);
    }
    control.addEventListener('change', () => {
      const v = control.value;
      this.players[index].ai = v === 'human' ? undefined : (v as AiDifficulty);
      // Default a friendly CPU name if the seat is still on its placeholder.
      if (this.players[index].ai && !this.players[index].name.trim()) {
        this.players[index].name = `CPU ${index + 1}`;
      }
      this.render();
    });

    row.append(name, swatches, control);
    return row;
  }

  /**
   * Render the collapsible "Advanced settings" section: wind cap, gravity, and
   * seed. Each input stays blank (placeholder shows the engine default) unless
   * the user types a value; blank fields are omitted from the emitted config so
   * the engine default applies.
   */
  private renderAdvanced(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'lobby-advanced';
    details.open = this.settingsOpen;
    details.addEventListener('toggle', () => {
      this.settingsOpen = details.open;
    });

    const summary = document.createElement('summary');
    summary.textContent = 'Advanced settings';
    details.append(summary);

    details.append(
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

    return details;
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
    color: PALETTE[i % PALETTE.length].value,
  };
}


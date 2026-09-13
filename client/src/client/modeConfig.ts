import type { AiDifficulty } from '@shared/types/GameState';
import type { TeamId } from '@shared/types/GameOptions';
import { normalizeTankLoadout, type TankLoadout } from '@shared/types/TankLoadout';
import { CURRENT_NETWORK_RULESET_VERSION } from './networkRuleset';
import { clamp } from '@shared/engine/math';
import {
  normalizeBattlefieldWorldId,
  normalizeWallMode,
  type BattlefieldWorldId,
  type NetworkRulesetVersion,
  type WallMode,
  type TerrainHazardMode,
} from '@shared/types/GameOptions';
import { normalizeTerrainHazardMode } from '@shared/engine/Terrain';
import {
  CURRENT_ROOM_COMMAND_VERSION,
  type RoomCommandVersion,
} from '@shared/net/roomCommand';

export const CURRENT_ROOM_LIFECYCLE_VERSION = 1;

/**
 * Optional advanced engine settings chosen in the lobby. Each field is omitted
 * (undefined) when the user leaves it at default/blank, so the engine's own
 * defaults apply. Consumed by main.ts and forwarded to GameEngine.
 */
export interface ModeSettings {
  /** Wind cap, 0..10 (engine default 10). */
  maxWind?: number;
  /** Gravity in px/tick, ~0.05..0.40 (engine default 0.15). */
  gravity?: number;
  /** Terrain seed; blank => engine's reproducible default. */
  seed?: number;
  /** Best-of-N match length, odd 1..9 (engine default 1 = single round). */
  rounds?: number;
  /** Per-round credit interest rate, 0..0.5 (engine default 0 = no interest). */
  interestRate?: number;
  /** Sudden-death per-round turn threshold, integer ≥0 (engine default 0/absent = off). */
  suddenDeathTurn?: number;
  /** Arms-level store gate, integer 0..4 (engine default 4 = everything buyable). */
  armsLevel?: number;
  /** Opt-in deterministic 2v2 mode; only valid with four seats. */
  teamMode?: boolean;
  /** Non-open sidewall rule; omitted means the legacy open boundary. */
  walls?: WallMode;
  /** Presentation-only authored world; omitted means Automatic. */
  battlefieldWorld?: BattlefieldWorldId;
  /** Opt-in deterministic terrain hazard mode; blank means none. */
  hazards?: TerrainHazardMode;
  /** Server-authoritative deterministic network room contract. */
  rulesetVersion?: NetworkRulesetVersion;
  /** Exact network command contract admitted by the room referee. */
  commandProtocolVersion?: RoomCommandVersion;
  /** Server-admitted presence lease capability; absent for legacy rooms. */
  roomLifecycleVersion?: typeof CURRENT_ROOM_LIFECYCLE_VERSION;
}

// Advanced-settings bounds + engine defaults (shown as placeholders so the user
// sees the default without us actually sending it — blank/default => omitted).
export const WIND_DEFAULT = 10;
export const GRAVITY_DEFAULT = 0.15;
export const WIND_MIN = 0;
export const WIND_MAX = 10;
export const GRAVITY_MIN = 0.05;
export const GRAVITY_MAX = 0.4;
export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 9;
export const ROUNDS_DEFAULT = 1;
// SE-parity economy bounds + engine defaults (shown as placeholders; blank/default => omitted).
export const INTEREST_MIN = 0;
export const INTEREST_MAX = 0.5;       // up to 50% per round
export const SUDDEN_DEATH_MIN = 0;     // 0/blank => off
export const SUDDEN_DEATH_MAX = 50;
export const ARMS_MIN = 0;
export const ARMS_MAX = 4;
export const ARMS_DEFAULT = 4;         // everything buyable (back-compat)

/** Raw (string) advanced-settings inputs, exactly as typed into the UI. */
export interface RawModeSettings {
  maxWind: string;
  gravity: string;
  seed: string;
  rounds: string;
  interestRate: string;
  suddenDeathTurn: string;
  /** Arms level as a select value ('' = default/4). */
  armsLevel: string;
  /** Wall mode select value (blank/open = default). */
  walls: string;
  /** Presentation-only authored world select value (blank = Automatic). */
  battlefieldWorld: string;
  hazards: string;
  teamMode?: string;
}

/** Parse a trimmed numeric string; undefined for blank or non-finite input. */
export function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoundedNumber(raw: string, min: number, max: number): number | undefined {
  const value = parseNumber(raw);
  return value === undefined ? undefined : clamp(value, min, max);
}

/**
 * Parse the raw settings inputs into a ModeSettings, omitting blank/invalid
 * fields (so engine defaults hold). Returns undefined if nothing is set.
 */
export function normalizeRawModeSettings(raw: RawModeSettings): ModeSettings | undefined {
  const out: ModeSettings = {};

  const maxWind = parseBoundedNumber(raw.maxWind, WIND_MIN, WIND_MAX);
  if (maxWind !== undefined) {
    out.maxWind = maxWind;
  }

  const gravity = parseBoundedNumber(raw.gravity, GRAVITY_MIN, GRAVITY_MAX);
  if (gravity !== undefined) {
    out.gravity = gravity;
  }

  const seed = parseNumber(raw.seed);
  if (seed !== undefined) {
    out.seed = Math.trunc(seed);
  }

  const rounds = parseOnlineRounds(raw.rounds);
  if (rounds !== undefined) out.rounds = rounds;

  Object.assign(out, parseOnlineEconomy(raw.interestRate, raw.suddenDeathTurn, raw.armsLevel));

  const walls = normalizeWallMode(raw.walls);
  if (walls !== 'open') out.walls = walls;

  const battlefieldWorld = normalizeBattlefieldWorldId(raw.battlefieldWorld);
  if (battlefieldWorld !== undefined) out.battlefieldWorld = battlefieldWorld;
  const hazards = normalizeTerrainHazardMode(raw.hazards);
  if (hazards !== 'none') out.hazards = hazards;

  if (raw.teamMode === '2v2') out.teamMode = true;

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Parse the online "Rounds" input into a clamped, ODD best-of-N value, or
 * undefined when blank (engine default = single round). Shared by the create
 * body and the local waitingOptions so both agree on the value sent to the room.
 */
export function parseOnlineRounds(raw: string): number | undefined {
  const parsed = parseNumber(raw);
  if (parsed === undefined) return undefined;
  const clamped = clamp(Math.trunc(parsed), ROUNDS_MIN, ROUNDS_MAX);
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

/**
 * Parse the online SE-parity economy inputs (interest / sudden-death / arms-level) into clamped
 * values, omitting blanks. Shared by the create-room body and the local waitingOptions so both
 * agree on exactly what the room is created with (and thus what every client's engine builds).
 */
export function parseOnlineEconomy(
  interestRaw: string,
  suddenDeathRaw: string,
  armsLevelRaw: string,
): { interestRate?: number; suddenDeathTurn?: number; armsLevel?: number } {
  const out: { interestRate?: number; suddenDeathTurn?: number; armsLevel?: number } = {};
  const interest = parseNumber(interestRaw);
  if (interest !== undefined) out.interestRate = clamp(interest, INTEREST_MIN, INTEREST_MAX);
  const sudden = parseNumber(suddenDeathRaw);
  if (sudden !== undefined) out.suddenDeathTurn = clamp(Math.trunc(sudden), SUDDEN_DEATH_MIN, SUDDEN_DEATH_MAX);
  const arms = parseNumber(armsLevelRaw);
  if (arms !== undefined) out.armsLevel = clamp(Math.trunc(arms), ARMS_MIN, ARMS_MAX);
  return out;
}


/** Non-UI compatibility shape; callers can narrow to the strict mode variants. */
export interface ModeSetup {
  mode: 'hotseat' | 'network';
  players: ModePlayer[];
  playerNames: string[];
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  token?: string;
  settings?: ModeSettings;
}
export interface ModePlayer {
  id?: string;
  name: string;
  color: string;
  ai?: AiDifficulty;
  team?: TeamId;
  loadout?: TankLoadout;
}
export type HotSeatModeSetup = ModeSetup & { mode: 'hotseat' };
export type NetworkModeSetup = ModeSetup & {
  mode: 'network';
  players: Array<ModePlayer & { id: string }>;
  roomId: string;
  roomCode: string;
  playerId: string;
  settings: ModeSettings & { seed: number };
};
/** Ready/rejoin have already required normalized room options before handoff. */
export type AdmittedNetworkModeSetup = NetworkModeSetup & {
  settings: ModeSettings & {
    seed: number;
    maxWind: number;
    gravity: number;
    rulesetVersion: NetworkRulesetVersion;
    commandProtocolVersion: typeof CURRENT_ROOM_COMMAND_VERSION;
  };
};
export type ClientModeSetup = HotSeatModeSetup | NetworkModeSetup;

export interface AuthoritativeRoomMode {
  roomId: string;
  code: string;
  seed: number;
  options: ModeSettings;
  players: Array<ModePlayer & { id: string }>;
}

/** Preserve server-admitted identities while normalizing presentation and valid team fields. */
export function projectNetworkPlayers(players: AuthoritativeRoomMode['players']): NetworkModeSetup['players'] {
  return players.map((player) => ({
    id: player.id, name: player.name, color: player.color,
    ...(player.ai ? { ai: player.ai } : {}),
    ...(player.team === 1 || player.team === 2 ? { team: player.team } : {}),
    loadout: normalizeTankLoadout(player.loadout),
  }));
}

type AdmittedAuthoritativeRoomMode = AuthoritativeRoomMode & {
  options: ModeSettings & {
    maxWind: number;
    gravity: number;
    rulesetVersion: NetworkRulesetVersion;
    commandProtocolVersion: typeof CURRENT_ROOM_COMMAND_VERSION;
  };
};

/** No numeric coercion here: these values have already crossed server admission. */
export function projectAuthoritativeNetworkMode(
  info: AdmittedAuthoritativeRoomMode,
  seat: { playerId: string; token: string },
): AdmittedNetworkModeSetup & { token: string };
export function projectAuthoritativeNetworkMode(
  info: AuthoritativeRoomMode,
  seat: { playerId: string; token: string },
): NetworkModeSetup & { token: string };
export function projectAuthoritativeNetworkMode(
  info: AuthoritativeRoomMode,
  seat: { playerId: string; token?: string },
): NetworkModeSetup;
export function projectAuthoritativeNetworkMode(
  info: AuthoritativeRoomMode,
  seat: { playerId: string; token?: string },
): NetworkModeSetup {
  const walls = normalizeWallMode(info.options.walls);
  const battlefieldWorld = normalizeBattlefieldWorldId(info.options.battlefieldWorld);
  const hazards = normalizeTerrainHazardMode(info.options.hazards);
  return {
    mode: 'network',
    players: projectNetworkPlayers(info.players),
    playerNames: info.players.map((player) => player.name),
    roomCode: info.code,
    roomId: info.roomId,
    playerId: seat.playerId,
    ...(seat.token !== undefined ? { token: seat.token } : {}),
    settings: {
      seed: info.seed,
      maxWind: info.options.maxWind,
      gravity: info.options.gravity,
      ...(walls !== 'open' ? { walls } : {}),
      ...(battlefieldWorld !== undefined ? { battlefieldWorld } : {}),
      ...(hazards !== 'none' ? { hazards } : {}),
      ...(info.options.rounds !== undefined ? { rounds: info.options.rounds } : {}),
      ...(info.options.interestRate !== undefined ? { interestRate: info.options.interestRate } : {}),
      ...(info.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: info.options.suddenDeathTurn } : {}),
      ...(info.options.armsLevel !== undefined ? { armsLevel: info.options.armsLevel } : {}),
      ...(info.options.teamMode === true ? { teamMode: true } : {}),
      ...(info.options.rulesetVersion !== undefined
        ? { rulesetVersion: info.options.rulesetVersion }
        : {}),
      ...(info.options.commandProtocolVersion !== undefined
        ? { commandProtocolVersion: info.options.commandProtocolVersion }
        : {}),
      ...(info.options.roomLifecycleVersion === CURRENT_ROOM_LIFECYCLE_VERSION
        ? { roomLifecycleVersion: CURRENT_ROOM_LIFECYCLE_VERSION }
        : {}),
    },
  };
}

export interface CreateRoomRequest {
  playerName: string;
  color: string;
  loadout: TankLoadout;
  rulesetVersion: NetworkRulesetVersion;
  commandProtocolVersion: typeof CURRENT_ROOM_COMMAND_VERSION;
  roomLifecycleVersion: typeof CURRENT_ROOM_LIFECYCLE_VERSION;
  bots?: CreateRoomModeInput['bots'];
  options: Omit<ModeSettings, 'seed' | 'rulesetVersion'> & {
    maxPlayers: number;
    visibility: 'public' | 'private';
    walls: WallMode;
  };
}

/** Normalize the click-time create request; blanks remain omitted. */
export function normalizeCreateRoomRequest(params: CreateRoomModeInput): CreateRoomRequest {
  const maxWind = parseBoundedNumber(params.maxWind, WIND_MIN, WIND_MAX);
  const gravity = parseBoundedNumber(params.gravity, GRAVITY_MIN, GRAVITY_MAX);
  const rounds = parseOnlineRounds(params.rounds);
  const economy = parseOnlineEconomy(params.interestRate, params.suddenDeath, params.armsLevel);

  const body: CreateRoomRequest = {
    playerName: params.playerName,
    color: params.color,
    loadout: params.loadout,
    rulesetVersion: CURRENT_NETWORK_RULESET_VERSION,
    commandProtocolVersion: CURRENT_ROOM_COMMAND_VERSION,
    roomLifecycleVersion: CURRENT_ROOM_LIFECYCLE_VERSION,
    ...(params.bots.length > 0 ? { bots: params.bots } : {}),
    options: {
      maxPlayers: params.maxPlayers,
      visibility: params.visibility,
      walls: normalizeWallMode(params.walls),
      ...(normalizeBattlefieldWorldId(params.battlefieldWorld) !== undefined
        ? { battlefieldWorld: normalizeBattlefieldWorldId(params.battlefieldWorld) }
        : {}),
      ...(normalizeTerrainHazardMode(params.hazards) !== 'none'
        ? { hazards: normalizeTerrainHazardMode(params.hazards) }
        : {}),
      ...(maxWind !== undefined ? { maxWind } : {}),
      ...(gravity !== undefined ? { gravity } : {}),
      ...(rounds !== undefined ? { rounds } : {}),
      ...economy,
      ...(params.teamMode && params.maxPlayers === 4 ? { teamMode: true } : {}),
    },
  };

  return body;
}

export interface CreateRoomCapturedFallback {
  name: string;
  rounds?: number;
  economy: ReturnType<typeof parseOnlineEconomy>;
}
export interface CreateRoomCurrentFallback {
  seed: number;
  maxPlayers: number;
  maxWind: string;
  gravity: string;
  walls: string;
  battlefieldWorld: string;
  hazards: string;
  teamMode: boolean;
  color: string;
  loadout: TankLoadout;
}
/** The caller preserves the captured and response-time observations independently. */
export function normalizeCreateRoomFallback(captured: CreateRoomCapturedFallback, current: CreateRoomCurrentFallback) {
  const maxWind = parseBoundedNumber(current.maxWind, WIND_MIN, WIND_MAX);
  const gravity = parseBoundedNumber(current.gravity, GRAVITY_MIN, GRAVITY_MAX);
  const battlefieldWorld = normalizeBattlefieldWorldId(current.battlefieldWorld);
  const hazards = normalizeTerrainHazardMode(current.hazards);
  return {
    seed: current.seed,
    options: {
      maxPlayers: current.maxPlayers,
      maxWind: maxWind ?? WIND_DEFAULT,
      gravity: gravity ?? GRAVITY_DEFAULT,
      walls: normalizeWallMode(current.walls),
      ...(battlefieldWorld !== undefined ? { battlefieldWorld } : {}),
      ...(hazards !== 'none' ? { hazards } : {}),
      ...(captured.rounds !== undefined ? { rounds: captured.rounds } : {}),
      ...captured.economy,
      ...(current.teamMode && current.maxPlayers === 4 ? { teamMode: true } : {}),
    },
    players: [{ id: '', name: captured.name, color: current.color, ready: false,
      loadout: normalizeTankLoadout(current.loadout) }],
  };
}

export interface CreateRoomModeInput {
  playerName: string;
  color: string;
  loadout: TankLoadout;
  bots: Array<{
    name: string;
    color: string;
    ai: AiDifficulty;
    loadout: TankLoadout;
  }>;
  maxPlayers: number;
  visibility: 'public' | 'private';
  /** Raw advanced-settings inputs, exactly as typed into the UI. */
  maxWind: string;
  gravity: string;
  walls: string;
  battlefieldWorld?: string;
  hazards?: string;
  rounds: string;
  interestRate: string;
  suddenDeath: string;
  armsLevel: string;
  teamMode?: boolean;
}

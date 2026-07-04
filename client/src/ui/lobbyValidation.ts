import { clamp } from '@shared/engine/math';

/**
 * Optional advanced engine settings chosen in the lobby. Each field is omitted
 * (undefined) when the user leaves it at default/blank, so the engine's own
 * defaults apply. Consumed by main.ts and forwarded to GameEngine.
 */
export interface LobbySettings {
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
}

// Advanced-settings bounds + engine defaults (shown as placeholders so the user
// sees the default without us actually sending it — blank/default => omitted).
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
export interface RawSettings {
  maxWind: string;
  gravity: string;
  seed: string;
  rounds: string;
  interestRate: string;
  suddenDeathTurn: string;
  /** Arms level as a select value ('' = default/4). */
  armsLevel: string;
}

/** Parse a trimmed numeric string; undefined for blank or non-finite input. */
export function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse the raw settings inputs into a LobbySettings, omitting blank/invalid
 * fields (so engine defaults hold). Returns undefined if nothing is set.
 */
export function coerceSettings(raw: RawSettings): LobbySettings | undefined {
  const out: LobbySettings = {};

  const maxWind = parseNumber(raw.maxWind);
  if (maxWind !== undefined) {
    out.maxWind = clamp(maxWind, WIND_MIN, WIND_MAX);
  }

  const gravity = parseNumber(raw.gravity);
  if (gravity !== undefined) {
    out.gravity = clamp(gravity, GRAVITY_MIN, GRAVITY_MAX);
  }

  const seed = parseNumber(raw.seed);
  if (seed !== undefined) {
    out.seed = Math.trunc(seed);
  }

  const rounds = parseNumber(raw.rounds);
  if (rounds !== undefined) {
    // Clamp into range, then force ODD (an even best-of-N can't break a tie cleanly).
    const clamped = clamp(Math.trunc(rounds), ROUNDS_MIN, ROUNDS_MAX);
    out.rounds = clamped % 2 === 0 ? clamped + 1 : clamped;
  }

  const interestRate = parseNumber(raw.interestRate);
  if (interestRate !== undefined) {
    out.interestRate = clamp(interestRate, INTEREST_MIN, INTEREST_MAX);
  }

  const suddenDeathTurn = parseNumber(raw.suddenDeathTurn);
  if (suddenDeathTurn !== undefined) {
    out.suddenDeathTurn = clamp(Math.trunc(suddenDeathTurn), SUDDEN_DEATH_MIN, SUDDEN_DEATH_MAX);
  }

  const armsLevel = parseNumber(raw.armsLevel);
  if (armsLevel !== undefined) {
    out.armsLevel = clamp(Math.trunc(armsLevel), ARMS_MIN, ARMS_MAX);
  }

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

/**
 * Normalize a raw room-code input as the user types: uppercase, strip anything
 * that isn't A–Z/0–9, and cap at 4 characters.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/** A room code is valid once it has exactly 4 (trimmed) characters. */
export function isValidRoomCode(code: string): boolean {
  return code.trim().length === 4;
}

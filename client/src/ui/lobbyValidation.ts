/** Compatibility exports for UI consumers; normalization is owned by the client setup boundary. */
export {
  normalizeRawModeSettings as coerceSettings,
  parseNumber, parseOnlineRounds, parseOnlineEconomy,
  WIND_MIN, WIND_MAX, GRAVITY_MIN, GRAVITY_MAX, ROUNDS_MIN, ROUNDS_MAX, ROUNDS_DEFAULT,
  INTEREST_MIN, INTEREST_MAX, SUDDEN_DEATH_MIN, SUDDEN_DEATH_MAX,
  ARMS_MIN, ARMS_MAX, ARMS_DEFAULT,
} from '../client/modeConfig';
export type { ModeSettings as LobbySettings, RawModeSettings as RawSettings } from '../client/modeConfig';

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

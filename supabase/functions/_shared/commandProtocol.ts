export const LEGACY_ROOM_COMMAND_VERSION = 1 as const
export const CURRENT_ROOM_COMMAND_VERSION = 2 as const
export type RoomCommandVersion = 1 | 2

export type CommandVersionResult =
  | { ok: true; version: RoomCommandVersion }
  | { ok: false }

export function resolveRequestedCommandVersion(value: unknown): CommandVersionResult {
  if (value === undefined) return { ok: true, version: LEGACY_ROOM_COMMAND_VERSION }
  return value === 1 || value === 2 ? { ok: true, version: value } : { ok: false }
}

export function resolveStoredCommandVersion(options: unknown): CommandVersionResult {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return { ok: false }
  return resolveRequestedCommandVersion((options as Record<string, unknown>).commandProtocolVersion)
}

export function commandVersionCompatibility(
  requested: RoomCommandVersion,
  stored: RoomCommandVersion,
): { ok: true } | { ok: false; requiredCommandProtocolVersion: RoomCommandVersion } {
  return requested === stored
    ? { ok: true }
    : { ok: false, requiredCommandProtocolVersion: stored }
}

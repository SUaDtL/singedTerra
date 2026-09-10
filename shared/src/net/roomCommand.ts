export const LEGACY_ROOM_COMMAND_VERSION = 1 as const;
export const CURRENT_ROOM_COMMAND_VERSION = 2 as const;

export type RoomCommandVersion =
  | typeof LEGACY_ROOM_COMMAND_VERSION
  | typeof CURRENT_ROOM_COMMAND_VERSION;

export type CommandActorRole = 'engine-seat' | 'shop-seat' | 'transition-initiator';

export interface CommandActorBinding {
  role: CommandActorRole;
  tankId: string;
}

export interface RoomCommandEnvelopeV2<TAction = unknown> {
  version: typeof CURRENT_ROOM_COMMAND_VERSION;
  intentId: string;
  expectedRevision: number;
  actorPlayerId: string;
  action: TAction;
  nextActiveIndex?: number;
  roundOver?: true;
}

/**
 * Every client proxying the same deterministic CPU phase must derive the same
 * identity. The action payload is deliberately absent: reusing the identity
 * with a changed payload must conflict at the referee.
 */
export function cpuRoomIntentId(input: {
  roomId: string;
  expectedRevision: number;
  actorPlayerId: string;
  kind: string;
}): string {
  const { roomId, expectedRevision, actorPlayerId, kind } = input;
  if (!roomId || !actorPlayerId || !kind || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TypeError('Invalid CPU room-intent identity input');
  }
  return `cpu:v2:${encodeURIComponent(roomId)}:${expectedRevision}:${encodeURIComponent(actorPlayerId)}:${encodeURIComponent(kind)}`;
}

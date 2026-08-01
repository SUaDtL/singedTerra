/** State that gates whether a LOCAL human input is honored right now. */
export interface LocalInputGate {
  /** True while a CPU tank holds the turn (its keys would drive the bot). */
  activeIsAi: boolean;
  /** True when this browser owns the active human seat (always true for hot-seat humans). */
  activeIsLocal: boolean;
  /** True while the in-game Pause overlay is open. */
  paused: boolean;
}

export interface ActiveSeatOwnership {
  mode: 'hotseat' | 'network';
  /** Result of the active GameClient's own engine-id ownership translation. */
  activePlayerOwned: boolean;
  activeIsAi: boolean;
}

interface EnginePlayerOwner {
  ownsEnginePlayer?(enginePlayerId: string): boolean;
}

/** Resolve the active tank in the engine namespace owned by the current client. */
export function resolveActivePlayerOwnership(
  mode: 'hotseat' | 'network',
  client: EnginePlayerOwner,
  activePlayerId: string,
): boolean {
  return mode === 'hotseat' || client.ownsEnginePlayer?.(activePlayerId) === true;
}

/** Resolve whether this browser should present controls for the active seat. */
export function isActiveSeatLocal(ownership: ActiveSeatOwnership): boolean {
  if (ownership.activeIsAi) return false;
  return ownership.mode === 'hotseat' || ownership.activePlayerOwned;
}

/**
 * Whether a LOCAL human input (keyboard arrows/space, mouse drag-aim, or the
 * touch strip) should be honored this moment. Dropped when a CPU tank holds the
 * turn, another network browser owns the active seat, or the in-game Pause
 * overlay is open, so a reflex input cannot act from an unavailable context.
 *
 * Pure and DOM-free on purpose: it is the single source of the gate that both
 * the keyboard/mouse emit callback and the touch callbacks consult, and a
 * harness pins its truth table without a browser. It deliberately does NOT touch
 * the rAF loop — networked lockstep keeps applying the broadcast log underneath.
 */
export function shouldAcceptLocalInput(gate: LocalInputGate): boolean {
  return gate.activeIsLocal && !gate.activeIsAi && !gate.paused;
}

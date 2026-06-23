/** State that gates whether a LOCAL human input is honored right now. */
export interface LocalInputGate {
  /** True while a CPU tank holds the turn (its keys would drive the bot). */
  activeIsAi: boolean;
  /** True while the in-game Pause overlay is open. */
  paused: boolean;
}

/**
 * Whether a LOCAL human input (keyboard arrows/space, mouse drag-aim, or the
 * touch strip) should be honored this moment. Dropped when a CPU tank holds the
 * turn — its keys would drive the bot — or when the in-game Pause overlay is
 * open, so a reflex keypress can't change aim or fire a shot while paused (#52).
 *
 * Pure and DOM-free on purpose: it is the single source of the gate that both
 * the keyboard/mouse emit callback and the touch callbacks consult, and a
 * harness pins its truth table without a browser. It deliberately does NOT touch
 * the rAF loop — networked lockstep keeps applying the broadcast log underneath.
 */
export function shouldAcceptLocalInput(gate: LocalInputGate): boolean {
  return !gate.activeIsAi && !gate.paused;
}

import type { AiDifficulty } from './GameState';
import type { TankLoadout } from './TankLoadout';

/** Horizontal battlefield boundary rule. */
export type WallMode = 'open' | 'reflective' | 'wrap';

/** Starter-weapon damage curve selected by an execution context. */
export type StarterWeaponFalloff = 'linear' | 'decisive';

/** Deterministic network-room contract understood by the current client. */
export type NetworkRulesetVersion = 1 | 2;

/** Fail closed to the legacy open boundary at every untyped room seam. */
export function normalizeWallMode(value: unknown): WallMode {
  return value === 'reflective' || value === 'wrap' ? value : 'open';
}

/**
 * Per-room game configuration set at room creation. Consumed by the engine
 * (GameEngine/Tank) and the network client. (Formerly lived in a socket.io
 * `Events.ts` contract; the socket.io stack was removed in favor of the Supabase
 * lockstep layer — see REVIEW_BACKLOG P2-12 — so this config moved to its own
 * module and the dead event/payload types were deleted.)
 */
export interface GameOptions {
  /** Number of players (2–4 for MVP1). */
  maxPlayers: number;
  /**
   * Explicit per-player name + color (2–4). When provided, the engine builds
   * exactly this many tanks via placeTanks; when absent it falls back to the
   * default two-tank layout. `maxPlayers` should agree with `players.length`.
   * `ai` marks a CPU-controlled seat at a difficulty (absent/undefined => human).
   */
  players?: Array<{
    name: string;
    color: string;
    ai?: AiDifficulty;
    /** Presentation-only authored part selection. */
    loadout?: TankLoadout;
  }>;
  /** Terrain RNG seed; same seed → same terrain. */
  seed?: number;
  /** Wind strength cap; defaults to MAX_WIND. */
  maxWind?: number;
  /** Gravity strength; defaults to GRAVITY. */
  gravity?: number;
  /** Horizontal boundary behavior; defaults to open (legacy OOB miss). */
  walls?: WallMode;
  /**
   * Edge-enforced deterministic contract for a network room. Missing means the
   * deployed legacy ruleset 1. The engine itself only consumes the derived
   * feature switches; clients carry this value for referee requests.
   */
  rulesetVersion?: NetworkRulesetVersion;
  /**
   * Interior blast curve for Baby Missile and Missile. Defaults to `linear` so
   * mixed deployed client versions remain deterministic in networked rooms.
   * Hot-seat explicitly opts into `decisive`; network mode must stay linear
   * until rooms have an Edge-enforced ruleset compatibility boundary.
   */
  starterWeaponFalloff?: StarterWeaponFalloff;
  /**
   * Best-of-N match length (V1 round system). Defaults to 1 — a single round, i.e.
   * the original "first elimination ends the game" behavior (full back-compat). For
   * N > 1 the match runs until a tank clinches ceil(N/2) round wins (or all N rounds
   * are played); each round regenerates terrain from a seed DERIVED from `seed` +
   * the round index, so every networked client replays the same rounds with no new
   * action. Credits + purchased inventory carry between rounds; health/shield/fuel/
   * position reset. See docs/archive/SPRINT6_MATCH_STRUCTURE.md.
   */
  rounds?: number;
  /**
   * Per-round credit interest rate (V1 SE-parity economy). At each ROUND_OVER boundary
   * every tank earns `floor(credits * interestRate)` on its carried (post-payout)
   * balance, adding save-vs-spend tension to the between-rounds shop. Defaults to 0 (no
   * interest — full back-compat). INTEGER-floored so a networked replay never drifts on a
   * fractional credit. A single-round match (`rounds` 1) has no boundary, so none applies.
   */
  interestRate?: number;
  /**
   * Sudden-death stalemate-breaker (V1 SE-parity match-flow). When set to a turn index `T`,
   * effective gravity ramps up as a PURE FUNCTION of the PER-ROUND turn (turns since THIS
   * round began): it equals the base gravity while `roundTurn <= T` and
   * `base * (1 + (roundTurn - T) * ramp)` once `roundTurn > T`, shrinking max range each turn
   * so an entrenched duel within a round must resolve. PER-ROUND (not match-global): every
   * round of a best-of-N match starts fresh at base gravity, so a long earlier round never
   * carries escalation into the next. Absent/0 => off (back-compat). Physics-input only (no
   * terrain mutation); same round-turn => same gravity on every client.
   */
  suddenDeathTurn?: number;
  /**
   * Arms-level store gate (V1 SE-parity economy, 0–4). A purchase whose weapon `armsLevel`
   * exceeds this is rejected engine-side, so a room can be a "basic" (low-level) duel or a
   * full-arsenal brawl. Defaults to the max (4 => everything buyable — back-compat). Gates
   * the store only; the opening loadout is unaffected.
   */
  armsLevel?: number;
}

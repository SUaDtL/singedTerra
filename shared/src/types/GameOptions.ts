import type { AiDifficulty } from './GameState';

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
  players?: Array<{ name: string; color: string; ai?: AiDifficulty }>;
  /** Terrain RNG seed; same seed → same terrain. */
  seed?: number;
  /** Wind strength cap; defaults to MAX_WIND. */
  maxWind?: number;
  /** Gravity strength; defaults to GRAVITY. */
  gravity?: number;
  /**
   * Best-of-N match length (V1 round system). Defaults to 1 — a single round, i.e.
   * the original "first elimination ends the game" behavior (full back-compat). For
   * N > 1 the match runs until a tank clinches ceil(N/2) round wins (or all N rounds
   * are played); each round regenerates terrain from a seed DERIVED from `seed` +
   * the round index, so every networked client replays the same rounds with no new
   * action. Credits + purchased inventory carry between rounds; health/shield/fuel/
   * position reset. See docs/SPRINT6_MATCH_STRUCTURE.md.
   */
  rounds?: number;
}

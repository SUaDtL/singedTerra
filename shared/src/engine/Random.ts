/**
 * Deterministic seeded PRNG stream for the engine (SPEC §4.4 wind generation).
 *
 * Determinism is a hard requirement: NO Math.random, NO wall-clock. This module
 * exposes the same mulberry32 + hashSeed mixing used by terrain generation, but
 * as an INDEPENDENT, stateful stream so the wind sequence can be advanced once
 * per turn without consuming (and thereby perturbing) the terrain generator.
 *
 * Same seed + same number of advances => identical value sequence, always.
 */

/**
 * Seeded PRNG (mulberry32). Returns a closure yielding floats in [0, 1). The
 * internal state advances by one on every call — call it exactly once per unit
 * of randomness you need so the stream stays reproducible.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fold an arbitrary caller seed (float, negative, NaN, Infinity, or > 2^32) into
 * a well-mixed uint32 (MurmurHash3 fmix32 finalizer). Mirrors Terrain's hashSeed
 * so the wind stream is seeded from the same game seed without aliasing.
 */
function hashSeed(seed: number): number {
  const n = Number.isFinite(seed) ? seed : 0x9e3779b9;
  const frac = Math.floor((n - Math.floor(n)) * 0x100000000) >>> 0;
  const lo = Math.floor(n) | 0;
  const hi = Math.floor(n / 0x100000000) | 0;
  let h = (lo ^ frac ^ Math.imul(hi, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Create an independent, reproducible RNG stream from a game seed. The returned
 * function yields the next float in [0, 1) and advances the stream by one.
 *
 * This is its OWN mulberry32 instance seeded from the game seed — it never
 * consumes the terrain generator's stream (so advancing wind cannot perturb
 * terrain or vice-versa). Same seed + same number of advances => identical
 * sequence, always.
 */
export function createRng(seed: number): () => number {
  return mulberry32(hashSeed(seed));
}

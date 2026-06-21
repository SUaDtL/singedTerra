---
status: accepted
date: 2026-06-21
title: Seeded PRNG and fixed timestep for determinism
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: shared/src/engine/Physics.ts, shared/src/engine/Random.ts, shared/src/engine/Terrain.ts
---

# ADR-0003 — Seeded PRNG and fixed timestep for determinism

## Status
Accepted (retroactive formalization; recorded 2026-06-21)

## Context
Deterministic lockstep (ADR-0002) is only sound if every client's engine produces byte-identical
results from the same inputs. Floating point, wall-clock time, and ambient randomness are the classic
sources of divergence.

## Decision
Physics uses a **fixed 16ms timestep** and a **seeded mulberry32 PRNG** (`shared/src/engine/Random.ts`,
folded via MurmurHash3 fmix32). No `Math.random()`, `Date.now()`, or `performance.now()` in the engine.
Wind and terrain seeds are generated once per turn/game and fed in as inputs. Tunable constants
(gravity, wind cap, radii) stay named constants, not scattered magic numbers.

## Alternatives considered
- **Ambient `Math.random` + real-time dt** — simplest to write, fatal to lockstep; rejected.
- **Lockstep with periodic state reconciliation** — papers over nondeterminism at bandwidth cost;
  rejected in favor of true determinism.

## Consequences
Same `(seed, actions)` ⇒ identical final state on every client and across replays. Enables the
deterministic test harnesses to pin behavior byte-for-byte. New randomness must be drawn from the
seeded stream, never from the platform.

## Risks
A subtle float or ordering change can desync without an obvious error; mitigated by the
`determinism`/`lockstep` harnesses and the `math.mjs`/`random.mjs` primitive characterization tests.

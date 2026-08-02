# Heavy Impact Hit-Stop Specification

## Intent

Make the largest detonations land with a brief moment of visual weight before
the existing directional camera kick, particles, and crater reveal take over.
The battlefield currently reacts immediately, so even its strongest blast
package lacks the tiny anticipation beat common to satisfying impact effects.

## Player contract

- A newly observed explosion with radius at least 50 logical pixels holds the
  already-painted pre-impact battlefield for exactly two rendered frames.
- The hold admits the explosion once, so audio and the existing DOM bloom start
  immediately while the canvas releases into the existing burst, debris,
  damage, shake, and directional recoil package after the hold.
- Smaller explosions and ordinary cluster bomblets do not hold the frame.
- A simultaneous explosion batch is judged by its largest new radius and can
  create only one bounded hold.
- Reduced-motion preference suppresses the hold entirely.
- Reset/rematch clears any pending hold.

## Architecture

- Hit-stop is renderer-owned transient presentation state derived from existing
  `ExplosionEvent` data after deterministic simulation has already produced it.
- The renderer does not pause, skip, or mutate `GameEngine`, action-log replay,
  networking, terrain, tanks, projectiles, or HUD state.
- During the hold, the current canvas pixels remain untouched and renderer-owned
  effect ages do not advance. The engine may continue fixed-step simulation.
- A pure helper owns the finite threshold/frame policy and fails closed for
  malformed input.
- No dependency, shared-engine, Edge Function, schema, migration, Supabase, or
  authorization change is allowed.

## Acceptance

- Pure tests pin the threshold, exact two-frame bound, reduced-motion behavior,
  and malformed-input fallback.
- Renderer tests prove one admission per explosion batch, no early canvas draw
  or effect aging, release on the third render, small-blast pass-through,
  reduced-motion pass-through, idle-animation liveness, and reset cleanup.
- Existing directional-kick, explosion-signature, damage, audio, rendering, and
  deterministic suites remain green.
- Full local verification, designated adversarial review, exact-head hosted CI,
  PR-only squash merge, exact-SHA Pages provenance, and live smoke pass.

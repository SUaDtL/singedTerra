# Projectile Motion Streaks Specification

## Intent

Make shell velocity readable from the first flight frame and immediately after
an airburst split. The existing position-history trail remains valuable, but it
cannot show direction until a projectile has accumulated multiple samples.

## Player contract

- Every finite in-flight projectile moving at a readable speed receives one
  short, velocity-aligned light ribbon directly behind its live payload.
- The ribbon points opposite the true current velocity. Left-, right-, rising-,
  and falling-motion all remain visually correct.
- Faster payloads make a longer and slightly brighter ribbon; the existing
  weapon profile still owns accent color and payload scale.
- A stationary, near-stationary, or malformed projectile receives no invented
  direction cue.
- The streak is drawn after the bounded history trail and before the payload
  halo/silhouette, so the live shell remains the visual focus.

## Presentation bounds

- A pure helper maps finite velocity and payload scale to immutable endpoints,
  width, and alpha.
- Ribbon length is bounded from 6 through 28 logical pixels, width from 1.5
  through 5 logical pixels, and peak alpha at or below 0.44.
- Each projectile uses exactly one Canvas linear gradient and two strokes per
  rendered frame; no particle, history, timer, or retained collection is added.
- Canvas state is balanced and every emitted coordinate/style value is finite.

## Architecture

- The helper and draw route remain inside `client/src/renderer/`.
- `ProjectileRenderer` consumes the same authoritative `ProjectileState`
  velocity already used to orient the payload silhouette.
- Existing ring-buffer identity/reset behavior, shared physics, replay/action
  logs, Edge Functions, database schema, and Supabase deployment are unchanged.
- No dependency or asset pipeline is introduced.

## Acceptance

- Pure tests pin all directions, magnitude scaling, exact caps, immutability,
  near-zero rejection, and non-finite fail-closed behavior.
- Renderer tests prove the live velocity is consumed, the gradient/strokes sit
  between history and halo, weapon accent/scale are preserved, all geometry is
  bounded, and caller Canvas state is restored.
- Parent and newly split child projectiles receive correct first-frame streaks
  without inheriting history.
- A real-browser comparison covers stopped, slow, fast, reverse, and split
  payloads, followed by one live hot-seat shot with no page error.
- Full local verification, independent review, hosted CI/CodeQL, merge
  cleanliness, exact-SHA Pages provenance, and live smoke pass.

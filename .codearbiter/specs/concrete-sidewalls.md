# Concrete Sidewalls

**Status:** Approved under the standing passion-project sprint authority
**Date:** 2026-08-03
**Branch:** `codex/concrete-sidewalls`

## Problem

The shipped open, reflective, and wrap boundary modes give the arena three
distinct traversal rules, but no hard boundary. A concrete sidewall should make
the edge itself a tactical target: a shell that reaches it stops and detonates
at the exact contact point instead of disappearing, reflecting, or transferring.

## SMARTS decision

Concrete sidewalls are selected over movement/fuel follow-up, ambient effects,
and a broader wall-family rewrite. They reuse the shipped deterministic wall,
room-option, renderer, and audio seams; the player-visible payoff is immediate;
and they avoid the auth/referee boundary, migrations, dependencies, and new
action-log state. The slice remains independently testable and reversible.

## Player contract

- Room setup offers `Open`, `Reflective`, `Wrap`, and `Concrete`; `Open` remains
  the default and existing rooms remain compatible.
- In concrete mode, a projectile crossing the left or right battlefield edge
  stops at the exact swept wall contact and detonates there in the same fixed
  tick.
- Concrete contact does not reflect, wrap, or consume a second movement segment.
  The existing explosion, terrain deformation, damage, flight cap, and turn
  resolution paths remain authoritative.
- Paired amber concrete rails identify the rule. A contact produces one bounded
  impact accent at the contacted edge and a distinct short procedural cue.
- Reduced motion keeps static rails and suppresses animated contact accents.
- CPU shot search returns the wall contact as the predicted impact, matching live
  execution; open, reflective, and wrap paths remain unchanged.
- The opening aim guide stops at the first concrete wall contact.

## Technical contract

- Extend `WallMode` to `'open' | 'reflective' | 'wrap' | 'concrete'`.
- Invalid wall values normalize to `open` at every existing room boundary.
- `collide` and `sweepCollide` report the same wall contact used by reflective
  and wrap modes; no second wall formula is introduced.
- Live `GameEngine` maps a concrete wall result to the existing ground-impact
  path at the wall coordinate, while recording the existing monotonic
  `wallImpacts` event for presentation.
- `AiShotSearch` returns the concrete wall coordinate as its impact endpoint.
- Existing JSON room options carry the new mode through hot-seat, create-room,
  network initialization, rejoin, and rematch. No migration, auth, service
  boundary, action-log field, or new dependency is introduced.

## Acceptance

- Deterministic harnesses prove exact left/right concrete contact, same-tick
  detonation, terrain/damage behavior, live/AI endpoint parity, replay parity,
  clone independence, and open/reflective/wrap regression safety.
- Aim-guide and renderer tests prove first-contact termination, amber paired
  rails, one bounded contact accent, and reduced-motion behavior.
- Audio tests prove a distinct bounded concrete profile and no cue for open mode.
- Lobby, transport, network, create-room, rejoin, rematch, and Edge tests prove
  concrete persistence and invalid-value normalization to open.
- Production-browser coverage proves selection, visible rails, and no document
  overflow on desktop and coarse-pointer landscape profiles.
- `npm run check`, client tests/coverage, Edge tests, browser E2E, production
  build, audit, secret scan, and diff hygiene pass before review and delivery.

## Out of scope

- Ceiling, floor, destructible, moving, or purchasable walls.
- Tank movement, blast wrapping, cross-edge damage, auth/referee changes,
  migrations, new dependencies, merge, or deployment within the slice.

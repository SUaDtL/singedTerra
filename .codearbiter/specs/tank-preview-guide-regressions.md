# Tank Preview and Launch Guide Regression Specification

**Status:** approved under the standing passion-project sprint authority
**Owner:** SUaDtL
**Date:** 2026-07-30

## Problem

Two recent presentation changes broke the combat read:

- Modular tank previews and battlefield tanks compress treads, hull, and turret
  into the same destination rectangle. Transparent atlas padding is scaled into
  each rectangle, so the authored components overlap as a smeared top-down
  object instead of stacking into a recognizable tank.
- The launch guide leaves the barrel coaxially, then applies a decorative
  upward flourish. That visible kink reads as an alignment error and has
  survived multiple attempts to disguise it.

## Goal

Restore immediately readable modular tanks and one unbroken muzzle direction
cue without changing deterministic physics, collision, damage, tank state,
network actions, or backend contracts.

## Tank composition contract

- Each authored component is cropped from its real occupied atlas bounds rather
  than scaling an entire padded 256-by-128 cell.
- Mobility, hull, and turret use distinct destination boxes and vertically
  stack into a side-view silhouette around the existing tank surface anchor.
- Tracks, spider legs, hover gear, and wheels remain visibly distinct at
  Garage-preview and battlefield scale.
- Every barrel rotates around the shared engine pivot and its visible muzzle
  ends at the shared 22-logical-pixel projectile spawn point.
- Mixed loadouts remain data-driven and connected; the source atlas, player
  identity tint, fallbacks, and loadout schema remain unchanged.

## Launch guide contract

- Every guide sample lies on the exact forward ray from the shared visible
  muzzle; no later flourish, lift, curve, or second-barrel effect is allowed.
- Power may continue to change the bounded ray length and sample spacing.
- The cue remains deliberately short and exposes no terrain intersection,
  impact marker, wind correction, bounce solution, or complete trajectory.
- It is acceptable for the straight cue to coincide with a very short shot
  near the muzzle.

## Verification

- RED/GREEN catalog tests pin tight in-cell crops, non-identical component
  boxes, side-view vertical stacking, and exact barrel pivot/muzzle geometry.
- RED/GREEN guide tests pin all samples coaxial across representative angles
  and powers.
- Browser acceptance proves all four complete kits and mixed previews produce
  vertically layered, connected silhouettes and that the complete rendered
  guide remains aligned with the barrel.
- Run deterministic checks, client coverage, Edge tests, production build,
  full E2E, runtime audit, diff hygiene, secret scan, adversarial review,
  exact-head hosted CI, merge, Pages deployment, and public verification.

## Explicit non-goals

- No ballistic predictor, range finder, impact marker, weapon tuning, physics
  change, new dependency, paid asset, migration, or Supabase change.
- The paused Sandhog weapon slice is not part of this regression repair.

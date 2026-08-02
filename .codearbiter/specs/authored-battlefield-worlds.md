# Authored Battlefield Worlds

**Status:** Approved through the maintainer's standing passion-project sprint authority
**Task:** `art.feature.0002`
**Date:** 2026-08-02

## Problem

The live battlefield has one strong authored dusk panorama, but every match opens
on that same world. Repetition makes the visual upgrade feel like a skin rather
than a place even though the current 2:1 bitmap already maps cleanly to the 2:1
logical canvas.
The game needs richer environmental identity without moving biome choice into
physics, networking, persistence, or room configuration.

## Player outcome

Each new match opens on one of three visually distinct, high-fidelity scorched
worlds. The initial deterministic terrain chooses the world, so lockstep clients
see the same place; the choice remains fixed as craters deform the battlefield.
Panoramas preserve their authored 2:1 proportions on the current 1200x600 logical
canvas and retain clear foreground
readability for terrain, tanks, trajectories, explosions, and the HUD.

## Scope

- Keep the existing ember dusk panorama and add two project-owned authored WebP
  panoramas: an obsidian volcanic caldera and a cold glass-storm wasteland.
- Add a typed three-world catalog with stable ids, player-facing names, and
  base-aware asset paths.
- Select one world once per match from a stable hash of the initial terrain
  bitmap; reset that presentation choice only when `Renderer.reset()` starts a
  fresh game.
- Load only the selected world, allocate no image per frame, and keep the current
  complete procedural atmosphere during loading or failure.
- Draw every panorama with aspect-preserving centered cover geometry: the full
  source on today's matching 2:1 canvas, with a safe crop only if that ratio changes.
- Add causal unit, renderer-seam, asset, and production-browser contracts.
- Record generated-art provenance and player-visible world behavior in docs.

## Non-goals

- No biome gameplay modifiers, terrain-material rules, weather hazards, time of
  day controls, player-selectable room option, lobby field, persistence, or save.
- No engine, terrain generation, seed, action log, replay, network, Supabase,
  backend, auth, crypto, secret, schema, migration, dependency, or lockfile change.
- No runtime randomness, wall-clock selection, asset download, animation video,
  foreground terrain, baked tank, projectile, explosion, text, UI, or sun.
- No replacement of live stars, sun, haze, wind cues, terrain, tanks, or effects.

## Deterministic presentation contract

1. Equal terrain bytes always return the same world id in every browser context.
2. The selector is pure and bounded, and all catalog entries are reachable by
   representative deterministic terrain fixtures.
3. `BattlefieldBackdrop.select(terrain)` is idempotent until `reset()`; terrain
   mutation after selection cannot switch assets.
4. `reset()` retires the previous image lifecycle and permits exactly one fresh
   selection/allocation for the next match.
5. A stale load/error callback from a retired image cannot change the new match's
   selected state.

## Visual and asset contract

- Every panorama is opaque WebP, exactly 2:1, at least 1536 pixels wide, and no
  larger than 500,000 transfer bytes.
- The two new worlds are materially distinct from each other and from ember dusk
  in palette and silhouette while sharing cinematic illustrated realism.
- Important middle-distance forms remain outside the foreground play band and
  inside a center-safe composition that survives bounded camera overscan.
- Draw uses the full source with no geometric distortion on the current 2:1
  logical battlefield and bounded camera overscan; a centered crop is fallback
  geometry for a future non-matching destination ratio.
- Existing procedural atmosphere is complete whenever the selected bitmap is
  unselected, loading, invalid, or failed.

## Acceptance

- Focused tests first fail on the absent catalog, terrain selector, fixed-per-game
  lifecycle, stale-callback guard, aspect-preserving crop, and new assets.
- Asset/browser checks prove format, dimensions, opacity, size, catalog requests,
  visible composition, and a viewport-fitted single-page game.
- Visual review covers all three assets plus a live desktop and Pixel landscape
  battlefield, including foreground contrast and the center crop.
- One designated adversarial review reports no Critical, High, Important, or
  Medium findings before commit.
- Full local gates, exact-head hosted CI, PR-only merge, exact-SHA Pages provenance,
  production smoke, and localhost hygiene pass.

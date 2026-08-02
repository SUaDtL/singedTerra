# World-Matched Terrain Materials

**Status:** Approved through the maintainer's standing passion-project sprint authority
**Task:** `art.feature.0003`
**Date:** 2026-08-02

## Problem

The three authored battlefield panoramas now make matches feel like distinct
places, but all three still render the same ember-brown ground palette and the
same rock grain. The repeated foreground breaks the world identity at the most
visible gameplay layer and makes Obsidian Caldera and Glassstorm Expanse read as
sky swaps rather than complete battlefields.

## Player outcome

Every authored world has a coherent ground identity at gameplay scale:

- Ember Dusk keeps its established scorched-earth strata and rock grain.
- Obsidian Caldera uses dark volcanic glass and basalt with restrained hot seams.
- Glassstorm Expanse uses a pale salt-and-crystal crust over cool mineral depths.

Terrain remains readable beneath red and blue tanks, the real trajectory hint,
projectiles, explosions, crater edges, and the HTML HUD.

## Scope

- Extend each typed battlefield-world profile with one project-owned terrain
  material asset and one renderer palette.
- Keep `client/public/art/terrain-material.webp` as Ember Dusk's material and add
  two opaque 256x256 WebPs for Obsidian Caldera and Glassstorm Expanse.
- Select the backdrop, palette, and material atomically from the client's pristine
  initial terrain through the existing deterministic presentation seam.
- Load only the selected material for a match, allocate no image per frame, and
  freeze the complete world profile until `Renderer.reset()`.
- Make material selection/reset generation-safe: a retired image's late load,
  error, or timeout cannot alter the active match.
- Invalidate the terrain cache when a world is selected and once when its material
  becomes ready; preserve deformation-version caching afterward.
- Retain a complete palette-only fallback while the selected material is loading,
  invalid, or unavailable.
- Add causal unit, renderer-seam, asset, and production-browser contracts, plus
  player-facing and art-provenance documentation.

## Non-goals

- No biome gameplay modifier, friction, armor, damage, wind, gravity, collision,
  terrain-generation, or deformation change.
- No engine, seed, action-log, replay, network, Supabase, backend, auth, crypto,
  secret, schema, migration, dependency, or lockfile change.
- No player-selectable world, lobby field, persistence, save, weather animation,
  particles, baked tank, projectile, explosion, text, UI, logo, or watermark.
- No per-frame image allocation, runtime randomness, external asset request, or
  replacement of existing sky, tank, trajectory, effect, or HUD layers.

## Deterministic presentation contract

1. The existing pure pristine-terrain selector remains the only world decision.
2. One selected `BattlefieldWorld` supplies the matching panorama, material, and
   palette; equal initial terrain bytes therefore produce the same complete visual
   world in hot-seat and replayed network clients.
3. Selection is idempotent until reset. Mutable crater pixels cannot change any
   world asset or palette.
4. Reset retires both panorama and material lifecycles and permits exactly one
   fresh complete-world selection for the next game.
5. Material loading remains presentation-only and never enters deterministic
   state, snapshots, action payloads, or lockstep ordering.

## Visual and asset contract

- All three material assets are opaque WebP, exactly 256x256, no larger than
  100,000 transfer bytes, and retain useful non-flat luminance grain.
- Edge continuity is bounded so the two-logical-pixels-per-texel wrapping does not
  introduce obvious tile seams.
- The three palettes are materially distinct in sampled terrain RGB, not merely
  differently named or differently sourced assets.
- Surface rims, crater walls, exposed strata, bevel lighting, coverage alpha, and
  deformation silhouettes remain intact.
- Palette-only fallback remains visually complete and world-matched; a missing
  texture removes grain, not the world's ground identity.
- Desktop-fine, coarse-pointer landscape, and small-window profiles remain fitted
  without document or HUD scrolling.

## Acceptance

- Focused tests first fail on absent world material/palette metadata, atomic
  renderer routing, lazy selected-only loading, reset/stale-callback isolation,
  and palette-driven terrain pixels.
- Asset/browser tests prove all three material URLs, format, dimensions, opacity,
  byte cap, useful grain, bounded edge continuity, selected-only requests, world
  distinction, cache application, and a fitted single-page game.
- Visual review covers all material assets and all three live deterministic seed
  fixtures at desktop and Pixel landscape gameplay scale.
- One designated adversarial review reports no Critical, High, Important, Medium,
  or other merge-blocking findings before commit.
- Full local gates, exact-head hosted CI, PR-only merge, exact-SHA Pages provenance,
  production smoke, and localhost hygiene pass.

# Terrain Edge Bevel Lighting

## Problem

The cached terrain has a strong depth ramp, strata, and a lit top rim, but newly
cut crater walls and overhangs still read as flat pixel boundaries. Explosions
have gained richer light and motion while the permanently changed battlefield
does not retain an equally dimensional result.

## Goal

Give every exposed terrain surface a small directional bevel so hills, crater
walls, caves, and debris read as solid volume without adding per-frame work,
assets, dependencies, or simulation state.

## Requirements

1. A pure helper derives a finite signed bevel intensity from a solid pixel's
   bounded local terrain neighborhood. Air and malformed geometry fail closed.
2. Light comes from the upper left: upward and leftward exposure receives a
   warm highlight; rightward and downward exposure receives a cool shadow.
3. The bevel reaches at most three solid pixels inward and decays
   monotonically. Fully enclosed terrain remains unchanged.
4. Samples beyond the world frame count as solid so the sealed left, right, and
   bottom boundaries do not acquire false edge lighting.
5. `TerrainRenderer` blends the cached base RGB toward the existing rim or backdrop
   palette while preserving the existing coverage alpha, strata, depth ramp,
   version cache, and source bitmap.
6. All additional work occurs only during the existing terrain-version rebuild.
   No retained collection, idle animation, gameplay field, replay value,
   dependency, migration, Edge Function, or Supabase change is introduced.

## Acceptance

- Pure tests pin light direction, exact three-pixel falloff, enclosure, frame
  boundaries, malformed inputs, and source nonmutation.
- Renderer tests prove a synthetic crater receives opposite readable wall
  bevels while deep interior color, coverage alpha, caching, and bitmap bytes
  remain unchanged.
- A production browser comparison shows crater walls and natural hills gaining
  depth without noisy banding, edge artifacts, or reduced readability.
- Renderer, deterministic, coverage, Edge, build, and browser matrices remain
  green.

## Non-goals

- Physics normals, collision changes, terrain material state, dynamic shadows,
  continuous lighting animation, or bitmap/sprite assets.
- Any networked cosmetic contract or Supabase deployment.

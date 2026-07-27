# Napalm Firelight Bloom Specification

## Intent

Make active napalm feel like a sustained battlefield hazard by pooling its
existing per-column ember blocks into broad, localized firelight. The light is
presentation-only and derives entirely from the current deterministic fire
cells and live terrain.

## Player-visible contract

- Consecutive burning columns form bounded warm light pools behind the existing
  flame tongues.
- Broad fields split into overlapping pools so long napalm and hot-napalm burns
  illuminate their full footprint without one oversized wash.
- Remaining cell life controls bounded bloom strength and vertical reach.
- The bloom is drawn additively over the battlefield and restored before any
  caller Canvas state can leak.
- Dying cells taper to a faint ember glow; absent or unusable fire cells emit no
  pool.

## Bounds and failure behavior

- Each pool covers at most 32 consecutive columns.
- At most eight strongest pools render per frame, returned in world-x order.
- Pool radii and alpha are finite and explicitly capped.
- Duplicate x positions keep only their strongest valid remaining life.
- Unsorted cells are supported. Non-integer or out-of-frame x, non-finite or
  non-positive life, and malformed terrain surfaces fail closed.
- Input arrays and cells are never mutated.

## Architecture and compatibility

- Pool derivation is a pure client renderer helper with focused boundary tests.
- The production seam replaces per-column glow rectangles inside the existing
  `drawFire` pass; flame geometry, fire simulation, damage, timing, audio, and
  idle-animation policy remain authoritative and unchanged.
- No retained particle collection, bitmap asset, dependency, lockfile,
  gameplay state, replay action, migration, Edge Function, or Supabase contract
  is added.

## Acceptance

1. Pure tests pin grouping, splitting, intensity, caps, ordering, malformed
   input, duplicates, and immutability.
2. Renderer tests prove exact pool geometry, additive compositing, terrain
   anchoring, draw-before-flame order, and Canvas restoration.
3. Real-browser inspection checks ordinary napalm for useful warmth, readable
   tanks/projectiles, and no harsh bands; a 181-column hot-napalm-scale oracle
   proves bounded full-field coverage.
4. Focused and full governed verification are green.

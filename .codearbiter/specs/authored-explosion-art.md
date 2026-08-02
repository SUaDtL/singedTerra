# Authored Explosion Art Specification

## Intent

Make the game’s most common detonations look intentionally illustrated rather
than assembled from canvas gradients and geometric fragments. Preserve the
existing explosion system’s readable weapon reach, timing, feedback, and
deterministic boundaries while introducing one production-quality raster asset.

## Player contract

- Conventional missile-family explosions use a nine-frame hand-painted blast
  sequence with a white-hot ignition, asymmetric fireball, and ember breakup.
- The artwork stays centered on the authoritative impact point and entirely
  inside the existing visual reach radius; radius and duration still come from
  the authoritative explosion event.
- Nuclear, earth-moving, incendiary, scatter, funky, shield, and bouncing-mine
  signatures keep their distinct procedural silhouettes.
- Reduced-motion users keep the current non-sprite presentation; the new
  frame-by-frame animation is suppressed.
- If the image is loading, malformed, unavailable, or cannot be painted, the
  complete existing procedural explosion remains available for that burst.
- Loading the asset during an already-running burst must not switch its visual
  language mid-animation.

## Asset contract

- One 768×768 transparent WebP contains an exact 3×3 grid of 256×256 cells,
  read left-to-right and then top-to-bottom.
- The generated source was produced with the built-in image-generation path on
  a flat chroma background, locally keyed to alpha, downscaled, and compressed.
- The final repository asset is `client/public/art/explosion-sheet.webp`; no
  generated source or temporary preview is committed.
- The shipped asset must remain below 250 KB, have transparent corners, and
  preserve all nine occupied cells.

## Architecture

- A small fail-soft image painter owns URL resolution, exact dimension checks,
  frame selection, draw geometry, and load-state behavior.
- Renderer burst admission snapshots whether authored art is usable, so a burst
  is either authored for its whole life or procedural for its whole life.
- The renderer retains the existing radius-scaled glow behind authored frames
  and the existing particles, damage text, scorch, audio, kick, shake, and
  hit-stop around them.
- No shared-engine, physics, replay, action-log, network, Supabase, Edge Function,
  schema, migration, authorization, dependency, or lockfile change is allowed.

## Acceptance

- Pure painter tests pin asset URL/base handling, exact dimensions, timeout and
  error failure, frame progression, radius-bounded geometry, and draw failure.
- Renderer tests prove conventional-only selection, per-burst fallback locking,
  procedural signature fallback, reduced-motion behavior, and load liveness.
- An asset contract verifies format, dimensions, size ceiling, transparent
  corners, and non-empty alpha coverage in all nine cells.
- Existing explosion signatures, blast reach, hit-stop, damage, audio, rendering,
  and deterministic suites remain green.
- Full local verification, designated adversarial review, exact-head hosted CI,
  PR-only squash merge, exact-SHA Pages provenance, and live smoke pass.

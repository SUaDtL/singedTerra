# Turn-Start Wind Gusts Specification

## Intent

Make the battlefield's most important environmental variable visible in the
world, not only as a HUD number. Each new aiming turn should briefly sweep the
sky in the current wind direction, giving the handoff atmosphere and an
immediate directional cue without creating perpetual idle animation.

## Player contract

- The first visible `PLAYER_TURN` frame for each authoritative `(round, turn)`
  may spawn one short sky gust derived from that turn's finite wind value.
- Positive wind moves ribbons right; negative wind moves them left. Stronger
  wind makes the bounded ribbons longer, faster, brighter, and more numerous.
- Near-calm wind remains visually calm rather than inventing motion.
- Loading or reconnecting directly into a `PLAYER_TURN` may show that current
  turn's gust once; repeated frames for the same turn never retrigger it.
- The gust lives behind terrain, tanks, projectiles, explosions, and HUD
  feedback, and does not resemble a predicted trajectory or target marker.
- Reduced motion suppresses the gust completely. The existing HUD wind value
  remains the informational source.
- Reset clears both the live gust and its turn-dedupe key.

## Presentation bounds

- Gust lifetime is exactly 48 rendered frames and then the renderer returns to
  its existing idle-skip behavior.
- A finite non-calm wind maps to 5 through 11 sky ribbons.
- Ribbon length is bounded from 28 through 68 logical pixels, speed from 1.4
  through 4.0 logical pixels per frame, and peak alpha at or below 0.28.
- Ribbons use fixed procedural lanes and wrap within an explicit off-canvas
  margin; no unbounded particle collection or per-frame allocation is allowed.

## Architecture

- A pure client helper maps wind to a frozen bounded visual profile.
- `Renderer` owns at most one client-only gust, detects the existing
  `(round, turn, phase)` transition, and draws it after the static sky but
  before terrain.
- `isAnimating()` remains true only while the bounded gust is live.
- No dependency, shared engine, replay/action log, Edge Function, schema, or
  Supabase deployment change is allowed.

## Acceptance

- Pure tests pin sign, calm/non-finite rejection, monotonic strength scaling,
  exact caps, and input immutability.
- Real renderer tests prove one admission per turn, round/turn separation,
  first-observation behavior, reduced-motion suppression, reset, exact
  48-frame liveness, idle release, and draw order behind terrain.
- Stateful Canvas tests prove finite bounded geometry, directional travel,
  alpha/lifetime envelope, wrap behavior, and caller-state restoration.
- A real-browser contact sheet and live deterministic hot-seat transition show
  calm, light-left, strong-right, and recovery states with no page error.
- Full local verification, independent review, hosted CI/CodeQL, merge
  cleanliness, exact-SHA Pages provenance, and live smoke pass.

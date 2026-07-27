# Armor Hit Bursts Specification

## Intent

Make successful unshielded damage read on the struck chassis itself. Damage
numbers explain the result, but a surviving tank currently gives no immediate
local reaction until it crosses the damaged-health threshold.

## Player contract

- A strict authoritative health drop on a living, visible tank spawns one
  short armor-local impact burst in addition to the existing damage number.
- Larger health losses create a stronger bounded flash and more metal sparks.
- The burst combines a white-hot core, the tank's owner color, and warm metal
  glints so the affected chassis remains identifiable.
- Repeated damage ticks coalesce into one active burst per tank rather than
  flooding transient state. Separate tanks remain independent.
- Lethal and buried-tank drops keep their existing K.O., wreck, and numeric
  feedback without adding an above-terrain armor burst.
- Reduced motion keeps the informational damage number but suppresses the new
  decorative burst and sparks.
- Reset clears every active armor burst.

## Presentation bounds

- Burst lifetime is exactly 14 rendered frames.
- Local flash radius is bounded from 16 to 28 logical pixels.
- Spark count is bounded from 4 to 10 and uses the existing transient spark
  lifecycle.
- Repeated damage refreshes and strengthens an existing same-tank burst but
  does not add a second burst or a second spark fan while it remains active.

## Architecture

- The existing renderer health-delta seam remains the only admission point.
- A pure client helper maps a finite positive damage amount to a bounded visual
  profile.
- `EffectsRenderer` owns the transient burst and draws it with balanced Canvas
  state before sparks and informational text.
- No dependency, shared engine, action log, Edge Function, schema, or Supabase
  deployment change is allowed.

## Acceptance

- Pure tests pin damage scaling, exact caps, lifetime, and malformed input
  rejection.
- Effects tests prove same-tank coalescing, multi-tank independence, bounded
  Canvas geometry, draw order, expiry, reset, reduced motion, and caller-state
  restoration.
- Real renderer tests prove only surviving visible health drops admit a burst,
  while unchanged/healed, shield-only, lethal, buried, and first-observation
  states do not.
- A real-browser comparison shows light and heavy armor hits at gameplay scale
  with no application error.
- Full local verification, independent review, hosted CI/CodeQL, merge
  cleanliness, exact-SHA Pages provenance, and live smoke pass.

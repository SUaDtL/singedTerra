# Direct Touch Aim Specification

## Intent

Give coarse-pointer players the same direct battlefield aiming gesture desktop
players already have. A primary finger or pen contact on the battlefield sets
angle and power from the active tank, and moving that contact refines the shot.
The existing Touch Command Deck remains available for discrete adjustments and
Fire remains an explicit separate commitment.

## Context and SMARTS selection

Exact deployed main at `018956ab2c2dd9a6c81fd35ac4f814dc63c40ae2`
has a strong fitted coarse-pointer Command Deck, but `InputHandler` attaches only
`mousedown`/`mousemove`/`mouseup`. Three bounded approaches were compared:

1. **Unify drag aim on Pointer Events.** Reuse the existing absolute angle/power
   projection for mouse, pen, and one primary touch.
2. **Add a virtual joystick.** This supplies continuous control but adds another
   large overlay, a new gesture model, and more responsive geometry.
3. **Polish the stepper buttons again.** Lower risk, but it does not close the
   direct-manipulation gap or materially change mobile play.

Approach 1 wins. It exposes an already-proven causal path to touch with minimal
new UI, gives immediate player agency, and keeps deterministic engine and
network contracts untouched. Confidence is high.

## Player contract

- Mouse, pen, and a single primary finger share one battlefield gesture:
  contact sets the barrel direction and power from the active tank; moving the
  contact refines both values continuously.
- A contact is useful without pixel-perfect tank acquisition. Its vector is
  always measured from the active tank's barrel origin, matching desktop drag
  aim and the visible trajectory hint.
- The gesture never fires, selects a weapon, moves the tank, or bypasses local
  turn ownership. Fire remains the tactical-rail action.
- The existing Touch Command Deck stays visible and unchanged as the precision
  fallback. Its Aim, Power, Drive, Weapon, and Menu controls retain their exact
  signed callbacks and state gates.
- Only a primary pointer may own the gesture. Secondary contacts, extra fingers,
  non-left mouse buttons, and unrelated pointer IDs are ignored.
- Pointer capture keeps refinement stable if the active contact leaves the
  canvas. Release, cancel, lost capture, or handler detach ends the gesture and
  removes all transient state.
- The canvas suppresses browser pan/zoom handling for its direct-manipulation
  surface; controls outside the canvas keep their existing touch behavior.
- The real bounded trajectory guide remains the only gesture feedback. No target
  ranger, auto-fire affordance, haptic dependency, or new overlay is added.

## Architecture and data flow

- Replace the mouse-only listeners in `InputHandler` with Pointer Events on the
  canvas target.
- Track one active pointer ID. On a valid `pointerdown`, capture that pointer,
  project its CSS coordinates into logical canvas coordinates, and reuse the
  current absolute angle/power setters.
- Apply matching `pointermove` events only for the active ID. End cleanly on
  `pointerup`, `pointercancel`, or `lostpointercapture`.
- Keep all action emission through the existing `InputHandler` callback and
  `main.ts` local-input gate. No direct engine call or synthetic keyboard/mouse
  event is introduced.
- Add `touch-action: none` to `#game`, the exact direct-manipulation surface.

## Error and edge behavior

- Zero-sized canvas bounds or unknown tank position emit nothing.
- Duplicate downs while a gesture is active do not steal ownership.
- A pointer move/up/cancel with the wrong ID is ignored.
- Pointer capture APIs are feature-tested so jsdom and older harness doubles do
  not fail; browser behavior remains covered in Chromium.
- Detach is idempotent and leaves no active pointer or window-level listener.

## Boundaries

- Client input, canvas CSS, player documentation, and tests only.
- No engine, physics, trajectory math, replay, action union, network, Supabase,
  backend, dependency, lockfile, asset, auth, crypto, secret, schema, migration,
  irreversible, or destructive change.
- No worktree or branch cleanup belongs to this slice.

## Acceptance

- Focused unit tests first fail against the mouse-only implementation, then prove
  mouse parity, primary touch/pen causality, exact logical coordinate mapping,
  pointer ownership, capture/release/cancel cleanup, invalid input rejection, and
  detach safety.
- Production Playwright on the coarse-pointer project proves a real touchscreen
  contact changes live elevation and power exactly once, advances First Salvo,
  leaves Fire enabled, and does not launch a projectile.
- Fine-pointer production coverage proves mouse drag still works without double
  dispatch after the Pointer Event migration.
- The complete client coverage, deterministic harness chain, Edge suite,
  production build, Playwright matrix, dependency audit, secret scan,
  adversarial review, exact-head hosted CI, PR-only squash merge, exact-SHA Pages
  provenance, live smoke, and localhost hygiene all pass.

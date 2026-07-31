# Turn Command Console Specification

**Status:** approved under the standing passion-project sprint authority
**Owner:** SUaDtL
**Date:** 2026-07-30

## Problem

The right rail has the correct combat controls, but its active-turn information
still reads as several unrelated strips. Player identity, weapon, movement,
fuel, Store, and Fire use different visual grammars and compete for attention.
The movement buttons compress keyboard hints and direction into cryptic strings,
fuel is a tiny boxed number, and the selected weapon lacks the authored icon
language already used by Arsenal and Store. The result is functional but does
not feel like one deliberate command surface.

## Goal

Turn the active-player slice into one compact fire-control console with a clear
reading order: who acts, what is loaded, how the tank can move, and which action
commits the turn. It must remain immediately playable with mouse, keyboard, or
touch and preserve the single-page fitted game.

## Structure and hierarchy

- One semantic **Turn command console** region owns active identity, shot
  progress, selected weapon, fuel/movement, Store, and Fire.
- The top identity band visibly labels **Active turn** and renders the complete
  allowed 20-character player name without ellipsis at every supported game
  viewport.
- The active tank color remains a restrained ownership accent, not a full-panel
  wash, and handoff animation remains reduced-motion safe.
- The selected weapon and movement module share one tactical row beneath
  identity. Fire and Store share one action row within the same console frame.
- Shot submission, flight, and terrain-resolution status replace the identity
  content within the same console rather than appearing as a detached strip.

## Weapon and mobility contract

- The selected weapon tile renders the same authored weapon-family glyph used
  by Arsenal and Store, plus the full weapon name without ellipsis.
- Changing weapon updates glyph, name, accessible status, and Fire label from
  authoritative state without rebuilding unrelated controls.
- Movement remains two semantic buttons with visible left/right direction and
  separate `A` / `D` keyboard hints; no fused `A‹` or `›D` text.
- Fuel is a labeled, tabular value plus a bounded 0–100 progress meter whose
  accessible value updates after authoritative movement.
- Movement preserves the existing ±8 request, disabled rules, callbacks,
  keyboard behavior, focus treatment, and touch activation semantics.

## Action contract

- Fire is the visually dominant action and retains one semantic button, current
  weapon labeling, disabled state, keyboard activation, and the existing live
  fire callback.
- Store remains secondary but clearly interactive and continues to show the
  active tank's current credits.
- Neither action duplicates on touch or moves outside the right rail.
- Store, Fire, weapon selection, and movement retain existing deterministic and
  network action contracts; this slice changes presentation only.

## Fit and quality contract

- The console has no internal text ellipsis for valid player or weapon names,
  no overlap, no flex crush, and no horizontal or vertical scroll.
- The full HUD and document remain fitted at desktop-fine, pixel-touch, and
  small-window acceptance viewports with Arsenal both collapsed and expanded.
- Fine-pointer actions remain at least 24 logical pixels tall. Coarse-pointer
  Store, Fire, movement, and Arsenal targets retain the established effective
  44 CSS-pixel minimum after game scaling.
- Existing turn announcements remain atomic and name player, weapon, and fuel.
  Fuel exposes `progressbar`, `aria-valuemin`, `aria-valuemax`, and
  `aria-valuenow`.
- Focus remains visible, tab order remains logical, and reduced-motion mode
  suppresses decorative handoff animation.

## Verification

- RED/GREEN unit tests pin the single semantic console, identity hierarchy,
  weapon glyph synchronization, split direction/keycap markup, fuel progress
  semantics, authoritative updates, and stable callbacks.
- Browser tests use maximum-length player names and the longest shipped weapon
  label to prove complete text, containment, target size, zero scroll, and
  interaction across all viewport projects.
- A live fire path proves that the redesigned primary action still commits one
  shot; a live movement path proves fuel and its progress meter update without
  ending the turn.
- Deterministic checks, client tests and coverage, Edge tests, production build,
  full E2E, runtime audit, diff hygiene, secret scan, adversarial review, exact
  hosted CI, deployment provenance, and public play all pass before delivery.

## Out of scope

- Changes to weapons, fuel cost, movement distance, credits, physics, AI,
  action logs, Supabase contracts, schemas, migrations, or deterministic state.
- A full trajectory prediction, landing marker, new gameplay shortcut, new
  dependency, paid asset, or another tank family.
- Redesigning the ballistic gauges, player health roster, Arsenal drawer, Store
  modal contents, or global menu beyond the seams needed to fit the console.

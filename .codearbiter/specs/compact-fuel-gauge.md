# Compact Fuel Gauge

## Status

Approved as SUaDtL under the standing passion-project sprint authority.

## Problem

Movement fuel is currently presented as a tiny `FUEL 100` text row above a
three-pixel bar. Inside the fixed 94-pixel mobility rocker, the label and
three-digit value compete for width and can visually collide. The result reads
like cramped form data rather than an instrument in the ballistic console.

## Player outcome

Replace the rectangular fuel cell with a compact circular gauge that reads at a
glance, keeps the exact remaining value legible, and remains visually balanced
between the left/right movement controls.

## Acceptance contract

- The fuel control is a square circular dial centered between the existing
  semantic movement buttons; it must not increase the 94-pixel mobility width.
- A conic ring communicates one 100-point fuel tank at a time. Fuel 1–100 fills
  gold; 101–200 wraps and refills in cyan; 201–300 and later reserve tiers wrap
  again in a third violet accent. The exact total and a separate `FUEL` label
  sit inside the ring without overlap.
- The ring changes to a warning accent at 25 fuel or below and an empty state at
  zero. This is redundant with the number; color is never the only signal.
- Boosted fuel remains exact in text, `aria-valuenow`, and `aria-valuetext`.
  `aria-valuemin`/`aria-valuemax` describe the active 100-point tier, so a
  purchased reserve reports 175 within 100–200 rather than an impossible 175
  of 100, and its semantic fraction matches the wrapped visual ring.
- The existing `progressbar` name, min/max/value semantics, movement callbacks,
  disabled rules, active-turn announcement, and authoritative live update are
  preserved.
- The dial and both movement controls remain contained and readable across
  desktop-fine, coarse touch, and small-window layouts with no page or HUD
  scrolling.
- The gauge has no transition or animation and therefore remains reduced-motion
  safe by construction.

## Boundaries

- No movement fuel rules, costs, engine state, action shape, replay, Supabase,
  store economy, or input binding changes.
- No dependency, migration, paid asset, Canvas rendering, or backend deployment.

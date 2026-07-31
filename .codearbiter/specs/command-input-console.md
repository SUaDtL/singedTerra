# Command Input Console

## Status

Approved as SUaDtL under the standing passion-project sprint authority.

## Problem

The desktop command legend is still a generic grid of oversized keycap cards,
so it looks detached from the authored ballistic console. On coarse-pointer
layouts the five touch controls are compressed into roughly 26-by-33 rendered
pixel targets in the side rail, have no explicit accessible names, and the two
aim buttons dispatch the opposite signed angle delta from their visible
left/right direction.

## Player outcome

Present one coherent command system: a compact, icon-led keyboard deck on
fine-pointer screens and a strong interactive touch dock in the same upper-left
battlefield position on coarse-pointer screens. Every visible direction must
match the barrel movement it causes.

## Acceptance contract

- The desktop deck has an explicit titled header, five named commands (Aim,
  Power, Move, Weapon, Fire), distinct authored icons, and compact secondary key
  hints. Fire receives full-width primary emphasis.
- The deck uses the same surface, border, typography, glow, and token family as
  the right-side ballistic console without obscuring tanks or forcing page/HUD
  scrolling.
- Coarse-pointer layouts replace the noninteractive keyboard deck with an
  interactive five-button touch dock in the canvas overlay, not the narrow HUD
  rail.
- Every touch target is at least 44 rendered pixels tall and 44 rendered pixels
  wide at the supported 915-by-412 landscape viewport.
- Touch controls expose explicit accessible names and stable `data-command`
  identities for aim left, aim right, power down, power up, and weapon cycle.
- Aim left emits a positive three-degree delta and visibly rotates the barrel
  left; aim right emits a negative three-degree delta and reverses that change.
  Power down/up retain negative/positive three-unit deltas.
- Tap remains one step; hold-to-repeat retains its 400ms delay and 80ms cadence.
  Keyboard activation of the semantic touch buttons remains possible without a
  duplicate pointer activation.
- Weapon cycling continues to show the current selected weapon and respects the
  existing local-control/disabled gate.
- Desktop-fine, pixel-touch, and small-window layouts remain single-page,
  contained, and free of HUD scrolling.

## Boundaries

- No deterministic engine, angle convention, keyboard mapping, movement rule,
  power rule, weapon order, action shape, replay, Supabase, or backend change.
- No dependency, migration, paid asset, Canvas renderer, or deployment-service
  change.

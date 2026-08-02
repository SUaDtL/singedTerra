# Command Deck Legibility Specification

## Intent

Bring the fine-pointer Command Deck up to the visual and readability standard of
the right-side tactical HUD. The production deck currently compresses its core
labels to 8px and its keycaps to 6.5px inside a 208px panel, so a useful command
reference reads like incidental microcopy instead of a deliberate cockpit
surface.

## SMARTS selection

Three bounded approaches were considered:

1. Enlarge and rebalance the existing keyboard reference with CSS only.
2. Turn the reference cells into clickable duplicate game controls.
3. Add live angle, power, fuel, and weapon state to the deck.

Approach 1 wins. It materially improves the weakest visible surface while
preserving the established input path and avoiding duplicate controls or a
second stateful HUD. Approaches 2 and 3 add interaction and state wiring without
solving a player need that the touch dock and Ballistic Computer do not already
own.

## Player contract

- On fine-pointer layouts, the Command Deck remains a five-command keyboard
  reference in the existing order: Aim, Power, Move, Weapon, Fire.
- The panel is 236 logical pixels wide with a stronger opaque cockpit surface,
  a clearly separated header, and no horizontal or vertical content clipping.
- The title is at least 10.5px, the mode chip at least 7.5px, command labels at
  least 10px, and keycap text at least 8.5px before the app-level fit transform.
- Command glyph frames are at least 30x30 logical pixels; ordinary rows are at
  least 46px high and the full-width Fire row is at least 42px high.
- The Fire row remains the sole primary command and has visibly stronger ember
  emphasis than the four reference rows.
- The deck remains in the upper-left sky, does not overlap the centered Impact
  Monitor frame, and creates no page scroll or game-overlay overflow in the
  desktop-fine and small-window production layouts.
- Coarse-pointer users continue to receive the existing interactive touch dock;
  the keyboard deck stays hidden and the touch surface is unchanged.

## Architecture

- Preserve the existing semantic DOM and command order in `HUD.ts`.
- Change only the embedded Command Deck CSS and its causal browser geometry
  assertions.
- Keep all values in the existing logical stage coordinate system so the one
  app-level scale transform remains the sole responsive fit mechanism.
- No new component, runtime state, event listener, canvas pass, asset, or
  dependency is introduced.

## Boundaries

- No input binding or game-command behavior changes.
- No engine, physics, replay, action-log, networking, Supabase, Edge Function,
  auth, crypto, secret, schema, or migration changes.
- No dependency or lockfile changes.
- No worktree or branch cleanup is part of this slice.

## Acceptance

- A real production-bundle Playwright test proves the exact five-command order,
  minimum typography, glyph, row, and panel geometry on desktop-fine and
  small-window projects.
- The same test proves the Fire row remains full-width and visually primary,
  and that the deck and game overlay do not overflow.
- Existing touch-dock assertions prove the coarse-pointer surface is unchanged.
- Focused HUD unit tests, the full client suite, deterministic harness chain,
  Edge tests, production build, full Playwright matrix, dependency audit,
  secret scan, designated adversarial review, exact-head hosted CI, PR-only
  squash merge, exact-SHA Pages provenance, and live smoke all pass.

# Mobile Command Deck Clarity

## Problem

The coarse-pointer control dock is mechanically correct but visually weak. Eight buttons are presented as one flat nine-column strip; paired directions repeat the same `Aim`, `Power`, and `Move` labels, so players must infer which member of each pair does what. That ambiguity makes correct left/right behavior feel reversed.

## Outcome

Present a production-ready Touch Command Deck whose hierarchy makes every direction obvious without changing deterministic input semantics or adding another Fire control.

## Requirements

- Preserve the current signed mappings: aim left `+3`, aim right `-3`, power less `-3`, power more `+3`, drive left `-8`, drive right `+8`.
- Add a compact `Command Deck` / `Touch` header matching the fine-pointer command surface.
- Group paired controls under visible `Aim`, `Power`, and `Drive` headings.
- Give paired buttons explicit visible labels: `Left` / `Right`, `Less` / `More`, and `Left` / `Right`.
- Replace text-only directional symbols with bounded icons through the existing Lucide HUD icon seam.
- Keep Weapon and Menu in the same dock; keep the existing rail Fire button as the only primary action.
- Preserve hold-to-repeat, multi-touch cancellation, first-salvo highlighting, disabled-state behavior, and callbacks.
- At the supported Pixel 5 landscape viewport, every button must remain at least 44 CSS pixels, the dock must stay inside the battlefield overlay, its rendered height must not exceed 78 CSS pixels, and the page/HUD must not scroll.
- In their visible states, the connection banner, failure toast, turn-watch banner, and First Salvo coach must not intersect the dock. Coarse-pointer liveness notices may move below the bounded top command band; the First Salvo coach remains in its lower stage slot.

## Non-goals

- No engine, physics, network, or backend changes.
- No remapping based on player seat or tank facing; directions remain screen-space.
- No new dependency and no duplicate Fire action.

## Acceptance

- Unit tests prove semantic grouping, icon identity, visible direction labels, exact signed callbacks, repeat safety, first-salvo target continuity, and disabled-state continuity after regrouping.
- Production Chromium Pixel 5 coverage proves grouped geometry, minimum target size, bounded dock height, non-overlap with every shared-overlay visible state, and no page/HUD overflow.
- Full client and repository gates remain green.

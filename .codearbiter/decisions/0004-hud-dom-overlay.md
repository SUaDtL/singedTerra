---
status: accepted
date: 2026-06-21
title: HUD is an HTML/CSS overlay, not canvas-drawn
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: client/src/ui/HUD.ts, client/src/renderer/HUDRenderer.ts
---

# ADR-0004 — HUD is an HTML/CSS overlay, not canvas-drawn

## Status
Accepted (retroactive formalization; recorded 2026-06-21)

## Context
The HUD (health bars, aim/power readout, weapon strip, store, scoreboard) needs to be readable and
easy to style. Drawing it into the canvas means manual layout math and reinventing text/box styling.

## Decision
The HUD is **HTML/CSS overlaid on the canvas**, not drawn on it. `HUDRenderer` is an intentional no-op
stub; the real HUD lives in `client/src/ui/HUD.ts` as DOM that is built once and mutated per frame.
Canvas draws only the game world (sky, terrain, tanks, projectile, explosion).

## Alternatives considered
- **Canvas-drawn HUD** — full control but heavy coordinate math, poor text rendering, hard to style;
  rejected.
- **A UI framework (React/etc.)** — overkill for a no-dependency game; rejected.

## Consequences
HUD styling uses CSS; no canvas coordinate math for UI. Keeps the canvas draw order purely the game
world. Constraint: do not render HUD elements into the canvas.

## Risks
DOM/canvas alignment under CSS scaling must be maintained; a known mobile trade-off (the strip can
overlap the bottom terrain band) is tracked separately.

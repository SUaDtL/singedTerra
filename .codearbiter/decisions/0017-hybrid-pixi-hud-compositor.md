---
status: accepted
date: 2026-08-21
title: Adopt a hybrid PixiJS HUD compositor with semantic DOM controls
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0004-hud-dom-overlay
governs: client/src/ui/*, client/src/renderer/*, client/src/style.css, client/public/battle-*, scripts/assets/*, package.json, client/package.json, package-lock.json
---

# ADR-0017 - Adopt a hybrid PixiJS HUD compositor with semantic DOM controls

## Status
Accepted

## Context
ADR-0004 chose an HTML/CSS-only HUD when singedTerra was a bounded proof of
concept and avoiding dependencies was more important than producing a deeply
authored game interface. The project is now a sustained, playable game. Repeated
attempts to match the approved physical-console reference with one large DOM/CSS
cascade produced brittle viewport exceptions, mismatched decorative assets, and
controls that remained visually detached from their recesses despite extensive
geometry tests.

The maintainer explicitly removed the proof-of-concept cost and dependency
constraint on 2026-08-21. The new requirement is to choose the architecture that
best supports a polished, responsive, game-quality HUD without changing the
deterministic game engine, network protocol, or static-hosting model.

## Decision
Adopt a hybrid battle-HUD architecture:

- PixiJS is the client runtime visual compositor for the battle console,
  authored chrome, nine-slice panels, instrument faces, state illumination, and
  responsive socket geometry.
- The existing Canvas 2D renderer continues to draw the game world. PixiJS does
  not replace physics, terrain, tanks, projectiles, explosions, or the
  deterministic renderer contract.
- Live HTML controls remain the semantic and interaction layer for text,
  focus, keyboard/touch input, accessible names, dialogs, and callbacks. The
  Pixi surface is non-interactive and sits beneath those DOM controls.
- One shared layout model defines visual sockets and DOM-control bounds in a
  reference coordinate system. Three authored modes - wide fine-pointer,
  standard fine-pointer, and compact touch - use uniform scaling, anchors, and
  bounded reflow rather than per-resolution CSS patch stacks.
- Sharp is a root development dependency used by a deterministic asset compiler
  for crop, trim, resize, nine-slice extraction, compositing, and optimized
  PNG/WebP output. Generated artifacts retain source provenance and hashes.
- PixiJS is lazy-loaded with the battle surface so lobby and account routes do
  not pay the runtime cost. Vite continues to emit a static GitHub Pages bundle.

The reviewed candidate pins are `pixi.js@8.20.0` and `sharp@0.35.3`; they must
still clear the repository dependency gate before installation.

This decision supersedes ADR-0004's prohibition on canvas-rendered HUD visuals
and its implicit no-UI-dependency premise. It retains ADR-0004's useful boundary
that gameplay-world rendering stays separate and that accessible interactive UI
must not be reduced to pixels.

## Alternatives considered
- **Continue HTML/CSS/SVG-only fitting** - rejected because the existing 13k-line
  HUD stylesheet and overlapping responsive cascades have repeatedly passed
  geometry tests while failing the approved visual reference.
- **Adopt a complete game engine such as Phaser** - rejected because world
  rendering, deterministic simulation, networking, and deployment already work;
  replacing them expands risk without improving the specific HUD problem.
- **Bake the complete console and controls into raster images** - rejected
  because state, localization, legal player names, accessibility, focus, and
  input feedback must remain live and testable.
- **Use PixiJS for the entire game** - deferred. The current Canvas 2D world
  renderer is not the source of the HUD mismatch and remains outside this
  decision.

## Consequences
The console can be authored as one visual system with predictable nine-slice
behavior, layered lighting, and shared layout coordinates instead of hundreds
of competing selectors. DOM semantics and existing callbacks survive while the
visual layer becomes purpose-built for game UI. Static hosting remains intact,
but the client gains a reviewed runtime dependency, an asset-build dependency,
an explicit preload/lazy-load path, and a compositor lifecycle that must handle
WebGL initialization failure and cleanup.

Migration proceeds component by component. The first proof slice is Commander
plus Fuel across all three layout modes; later components cannot advance until
that slice visually matches the supplied reference and its DOM/Pixi alignment is
regression-tested. Superseded CSS and old assets are removed only after the new
owner proves parity.

## Risks
DOM and Pixi sockets can drift under scaling, device-pixel ratio, font loading,
or late asset decode. WebGL/context failure can leave an unusable or blank HUD
unless the DOM retains a readable fail-soft presentation. PixiJS can inflate the
initial bundle unless it is isolated and lazy-loaded. Nine-slice metadata and
generated assets can become unreviewable unless the Sharp pipeline is
deterministic and source provenance is recorded. These risks require geometry,
visual, accessibility, bundle, context-loss, and cross-viewport tests before
the architecture is accepted as delivered.

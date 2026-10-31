---
status: accepted
date: 2026-10-29
title: Keep battle controls available across deployment recovery
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0018-preact-battle-console-semantic-ownership
governs: client/src/ui/battleConsole/lifecycle.ts, client/src/ui/battleConsole/mount.tsx, client/src/ui/battleConsole/pixi/*, client/src/ui/battleConsole/*.test.*, client/src/main.ts, client/src/ui/HUD.ts
---

# ADR-0020 - Keep battle controls available across deployment recovery

## Status
Accepted

The owner selected "Retain the recovery design (Recommended)" on 2026-10-29 in response to the explicit question about formally retaining startup-loaded semantic controls, lazy Pixi and battle-only mounting. This records that governance decision; it does not claim new hosted or user acceptance evidence.

## Context
ADR-0018 required both the Preact semantic controls and Pixi to load lazily on battle entry. The later deployment-recovery fix statically imports the semantic mount through `battleConsole/lifecycle.ts`: an already-open page retains the controls it needs even if deployment removes its old chunks. The lifecycle still mounts those controls only when battle starts. Pixi remains an optional lazy visual dependency.

## Decision
Retain the recovery design chosen by the owner:

- Include the battle-console semantic UI in the startup import graph so an already-open game does not depend on a later semantic-control chunk download after deployment.
- Mount, update and destroy the semantic tree through the existing battle lifecycle; startup code availability does not mount battle controls on lobby or account routes.
- Keep Pixi lazy and non-interactive, with complete usable semantic controls when optional visual loading fails.
- Supersede only ADR-0018's requirement that Preact load lazily on battle entry. Retain its single semantic owner, typed state and intents, Canvas2D world authority, accessibility and static-hosting boundaries.

## Alternatives considered
- Restore lazy semantic loading with an equivalent recovery mechanism: not selected by the owner in the explicit architecture question.
- Retain the existing recovery design: selected by the owner, including the lazy-Pixi and battle-only-mounting boundaries.

## Consequences
The semantic controls contribute to startup code loading. The existing recovery design remains the maintained implementation instead of being treated as an unresolved architectural variance. Loading code and mounting the UI remain separate responsibilities.

## Risks
Startup size and initialization work remain visible during normal build review. A later change that restores a semantic dynamic import could reintroduce the removed-chunk failure. None of this establishes physical-device, listening, endurance, release or deployment acceptance.

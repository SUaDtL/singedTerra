# Lobby Hot Seat View Builder Refactor Spec

**Issue:** #129
**Stage:** 1
**Change type:** behavior-preserving refactor
**Approval:** bounded standing passion-project approval, logged separately

## Problem

`Lobby.renderHotSeatTab()` still owns a complete top-level view's DOM despite the production browser oracle now covering it. Its presentation can be isolated without moving player state, validation rules, normalization, settings parsing, or launch effects.

## Goal

Extract Hot Seat composition into a directly tested stateless builder while Lobby remains the sole owner of player state and game-start behavior.

## Design

Create `buildLobbyHotSeatView(options)` in `client/src/ui/LobbyHotSeatView.ts`. It receives min/max/current player counts, prebuilt player rows and advanced-settings nodes, the current validation message, and callbacks for count changes and Start Game.

The builder owns subcopy, selector options/selection, crowded layout classes, node order, validation text, and Start button disabled/click behavior. Lobby keeps `setPlayerCount()`, `renderRow()`, `renderAdvanced()`, `validationError()`, player normalization, `parseSettings()`, and `onReady()`.

## Approved surface

| File | Change |
| --- | --- |
| `client/src/ui/Lobby.ts` | Replace private `renderHotSeatTab()` body with a thin adapter. |
| `client/src/ui/LobbyHotSeatView.ts` | Add stateless Hot Seat builder and options interface. |
| `client/src/ui/LobbyHotSeatView.test.ts` | Add direct causal DOM/action tests. |
| `.codearbiter/specs/lobby-hot-seat-view-builder.md` | Record spec. |
| `.codearbiter/plans/lobby-hot-seat-view-builder.md` | Record plan/evidence. |
| `.codearbiter/overrides.log` | Append bounded approval receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS/TDD/verification/review receipts. |

## Acceptance criteria

1. Pre-existing Lobby tests and 15-case browser matrix pass before production edits; `Lobby.ts` line/branch coverage clears 60%.
2. Direct seam tests fail behaviorally against a compile-only shell, then pass.
3. Exact subcopy, count options/selection, shared-node order, crowded classes, validation text, Start disabled state, and callbacks are preserved.
4. `Lobby.renderHotSeatTab()` becomes a thin adapter; all player/settings/launch behavior remains Lobby-owned.
5. No pre-existing test changes; full local/hosted gates, one adversarial review, PR-only merge, Pages provenance, and live smoke pass.
6. The PR advances but does not close #129.

## Non-goals

- Changing Hot Seat UX, copy, validation, player defaults, settings, or game launch.
- Extracting player rows, Advanced settings, tabs, Create, or Join.
- Changing CSS, dependencies, backend, auth, crypto, migrations, or workflows.

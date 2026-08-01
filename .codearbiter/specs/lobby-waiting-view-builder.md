# Lobby Waiting View Builder Refactor Spec

**Issue:** #129
**Stage:** 1
**Change type:** behavior-preserving refactor
**Approval:** bounded standing passion-project approval, logged separately

## Problem

The browser and session oracles now cover Waiting Room rendering and lifecycle, but `Lobby.renderWaitingRoom()` still combines about 160 lines of DOM composition with Lobby-owned state and effects. That keeps the largest network view embedded in the view god module and prevents direct testing of its rendering decisions.

## Goal

Extract the complete Waiting Room DOM composition into a directly tested stateless builder while leaving Lobby as the sole owner of duplicate detection, clipboard work, ready/leave effects, Realtime, heartbeat, transport, session, and render lifecycle.

## Design

Create `buildLobbyWaitingView(options)` in `client/src/ui/LobbyWaitingView.ts`.

The builder receives:

- current room code, roster, capacity, busy state, and local ready state;
- Lobby-computed duplicate color/name sets and local clash booleans;
- prebuilt self-edit and online-status nodes;
- callbacks for copy invite, ready up, and leave.

The builder owns only Waiting Room presentation: readiness subcopy, room-code cells, invite controls/status node, player header/list/badges/clash cues, placement of shared nodes, local clash warning, and action-button text/disabled state. The copy callback receives the exact button/status elements so `Lobby.copyWaitingRoomInvite()` remains unchanged.

## Approved surface

| File | Change |
| --- | --- |
| `client/src/ui/Lobby.ts` | Replace private `renderWaitingRoom()` body with a thin state-to-options adapter. |
| `client/src/ui/LobbyWaitingView.ts` | Add stateless Waiting Room builder and options interface. |
| `client/src/ui/LobbyWaitingView.test.ts` | Add direct causal DOM/action tests. |
| `.codearbiter/specs/lobby-waiting-view-builder.md` | Record this spec. |
| `.codearbiter/plans/lobby-waiting-view-builder.md` | Record implementation plan/evidence. |
| `.codearbiter/overrides.log` | Append the bounded standing-approval receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, TDD, verification, and review receipts. |

## Acceptance criteria

1. Pre-existing Waiting/Lobby unit tests and the 15-case Lobby browser matrix pass before production edits; `Lobby.ts` coverage clears the stage-1 60% line/branch floor.
2. New direct seam tests fail behaviorally against a compile-only shell before implementation, then pass.
3. The builder preserves exact subcopy pluralization/CPU/open-seat text, four-cell code display, copy invite elements/ARIA, roster count/order, color/name clash presentation, bot/human badges, shared-node order, local clash warning, and Ready/Leave button behavior.
4. `Lobby.renderWaitingRoom()` becomes a thin adapter while `duplicateColors()`, `duplicateNames()`, `myColorClashes()`, `myNameClashes()`, `copyWaitingRoomInvite()`, `handleReadyUp()`, and `handleLeaveRoom()` remain Lobby-owned.
5. Realtime, heartbeat, polling, transport, session, loadout editing, visible text, classes, inline styles, DOM order, callback timing, and async behavior remain unchanged.
6. No pre-existing test file changes. Direct tests, focused Waiting/Lobby tests, 15-case browser oracle, full client/Playwright/deterministic/Edge gates, coverage, build, audit, secret scan, and diff hygiene remain green.
7. One adversarial reviewer clears the exact package. The PR advances but does not close #129; Create/Join/Hot Seat remain future per-view cells.

## Non-goals

- Changing Waiting Room UX, copy, styling, accessibility, or room semantics.
- Extracting self-edit, Garage, online status, Create, Join, Hot Seat, or shared field builders.
- Changing duplicate normalization, clipboard implementation, Realtime, heartbeat, transport, session, dependencies, backend, auth, crypto, migrations, or workflows.

# Sprint spec: Lobby Browse View Builder

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Issue #129 tracks `Lobby.ts` as a view god module. PRs #245 and #246 now protect every major Lobby branch with a production-bundle browser oracle, so the first view can move without blind DOM or geometry drift. `renderBrowse()` is the smallest network-owned branch and is less stateful than Waiting Room.

## SMARTS decision

Extract the complete Browse composition into a stateless DOM builder. Lobby retains state, transport, polling, shared identity/Garage/status builders, and callback effects; the new builder owns Browse copy, room/empty rows, metadata, disabled states, and navigation controls.

| Lens | Stateless full-view builder | Room-list helper only | Stateful Browse class |
|---|---|---|---|
| Scalable | Strong: establishes the per-view builder pattern for #129. | Weak: leaves the view method as coordinator and composer. | Adequate, but adds lifecycle machinery. |
| Maintainable | Strong: explicit data, prebuilt shared nodes, and callbacks. | Adequate, but only removes the loop. | Weak for a DOM branch rebuilt by Lobby render. |
| Available | Strong: plain TypeScript and DOM APIs already used. | Strong. | Strong. |
| Reliable | Strong: preserves evaluation and append order mechanically. | Strong but low-value. | Adequate, with more state ownership risk. |
| Testable | Strong: new exported seam can be tested directly. | Strong for rows only. | Adequate, with heavier setup. |
| Securable | Strong: no transport, credential, or backend ownership moves. | Strong. | Adequate, but state duplication raises risk. |

**Recommendation:** stateless full-view builder. Strength: **strong**.

## Refactor surface contract

| File | Symbol | Signature / ownership | Consumer |
|---|---|---|---|
| `client/src/ui/Lobby.ts` | private `renderBrowse()` | Signature remains `(): HTMLElement`; state and side effects remain on `Lobby`. | `Lobby.renderOnlineTab()` only. |
| `client/src/ui/LobbyBrowseView.ts` | new `buildLobbyBrowseView()` | Exported stateless builder accepting prebuilt shared nodes, `BrowseRoom` data, busy state, and four callbacks; returns `HTMLElement`. | `Lobby.renderBrowse()` only. |
| `client/src/ui/LobbyBrowseView.test.ts` | direct seam tests | Pins existing empty, populated, disabled, join, and back-navigation behavior. | Vitest only. |
| `e2e/lobby-layout.spec.ts` | pre-existing Browse browser oracle | Must remain byte-unmodified and green. | Playwright. |

No public `Lobby` constructor or method signature changes. No external module gains access to Lobby state.

## Acceptance criteria

1. Pre-existing client and Browse browser tests pass before production edits; stage-1 `Lobby.ts` coverage remains at least 60% for both lines and branches.
2. New seam tests fail before the builder implementation and directly exercise the real returned DOM and callbacks.
3. `LobbyBrowseView.ts` owns the Browse subcopy, shared-node placement, empty/room list, rounds/arms/CPU metadata, full/busy disabled logic, Join action, and Create/Join-by-code navigation.
4. `Lobby.renderBrowse()` becomes a thin adapter that builds existing shared nodes, passes current state, and maps callbacks to the existing methods/state updates.
5. Browse polling, `fetchRooms()`, `joinByCode()`, `leaveBrowse()`, transport, session, player loadout state, visible text, classes, inline styles, DOM order, and callback timing remain unchanged.
6. No pre-existing test file is modified. The direct builder tests, 15-case Lobby browser matrix, full client suite, full Playwright suite, deterministic/Edge gates, typecheck/build, coverage, audit, secret scan, and diff hygiene remain green.
7. One adversarial reviewer clears the exact package. The PR advances but does not close #129; Waiting Room remains the next per-view extraction.

## Non-goals

- Extracting Waiting Room, Create, Join, Hot Seat, Garage, or shared field builders.
- Changing Lobby visuals, copy, accessibility semantics, polling, Realtime, transport, or session behavior.
- Adding dependencies, CSS, runtime test hooks, backend code, auth, crypto, migrations, or workflows.

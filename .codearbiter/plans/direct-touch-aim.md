# Direct Touch Aim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mouse, pen, and one primary finger set and refine live angle and power directly on the battlefield without firing.

**Architecture:** Replace the mouse-only drag lifecycle in `InputHandler` with one captured primary Pointer Event lifecycle while retaining the existing CSS-to-logical coordinate projection and absolute action setters. Keep the canvas as the exact direct-manipulation surface, the Touch Command Deck as a precision fallback, and all emissions behind the existing `main.ts` local-input gate.

**Tech Stack:** TypeScript, DOM Pointer Events, Canvas 2D, Vitest/jsdom, Playwright production Chromium, Vite.

## Global Constraints

- Mouse, pen, and one primary touch use identical absolute angle/power projection.
- The gesture never fires and never synthesizes keyboard or mouse events.
- Track one active primary pointer ID; reject secondary, non-primary, mismatched, and non-left mouse input.
- Pointer up, cancel, lost capture, and detach clear ownership safely.
- Preserve the Touch Command Deck and bounded trajectory-guide behavior.
- Client input, exact canvas CSS, player docs, and tests only.
- No engine, physics, action schema, replay, network, backend, dependency, lockfile, asset, auth, crypto, secret, schema, migration, irreversible, or destructive change.

---

### Task 1: Pin the unified pointer lifecycle

**Files:**
- Modify: `client/src/input/InputHandler.test.ts`
- Test: `client/src/input/InputHandler.ts`

**Interfaces:**
- Consumes: existing `InputHandler.attach()`, `detach()`, `setAim()`, and `setActiveTankScreenPos()`.
- Produces: a browser-facing contract for `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and `lostpointercapture` on the configured target.

- [x] **Step 1: Replace mouse-only test helpers with a pointer helper**

  Add a helper that dispatches a cancelable `PointerEvent` with explicit
  `pointerId`, `pointerType`, `isPrimary`, `button`, `clientX`, and `clientY`.
  Stub `setPointerCapture`, `releasePointerCapture`, and `hasPointerCapture` on
  the target so capture calls and cleanup are observable in jsdom.

- [x] **Step 2: Add failing mouse-parity and touch/pen causal tests**

  Require a primary left-mouse down at the existing logical test coordinates to
  emit the same absolute angle/power pair as before. Require primary touch and
  pen contacts to use the same projection, capture their IDs, and emit no Fire
  action. A single contact must emit at most one angle and one power change.

- [x] **Step 3: Add failing ownership and cleanup tests**

  Require secondary/non-primary pointers and non-left mouse buttons to emit
  nothing; require a second pointer not to steal an active gesture; require
  mismatched move/up/cancel events to be ignored; and require matching up,
  cancel, lost capture, and `detach()` to release or clear the active pointer so
  later moves emit nothing.

- [x] **Step 4: Observe and log TDD RED**

  Run:

  ```powershell
  npm exec --workspace client vitest run src/input/InputHandler.test.ts
  ```

  Expected: the new pointer contracts fail because production still registers
  only mouse events and owns no pointer ID/capture lifecycle. Existing keyboard,
  weapon, movement, and mouse-drag contracts remain green until their helpers are
  intentionally migrated.

### Task 2: Implement direct touch aim and production causality

**Files:**
- Modify: `client/src/input/InputHandler.ts`
- Modify: `client/src/style.css`
- Modify: `client/src/input/InputHandler.test.ts`
- Modify: `e2e/first-salvo.spec.ts`
- Modify: `docs/PLAYING.md`

**Interfaces:**
- Consumes: `InputHandler.emit(PlayerAction)`, the existing absolute
  `setAngleAbsolute(number)` / `setPowerAbsolute(number)` methods, and the
  `main.ts` local-input gate.
- Produces: one active pointer lifecycle keyed by `activePointerId: number | null`
  and the unchanged `set_angle` / `set_power` action stream.

- [x] **Step 1: Replace mouse attachment with target-local Pointer Events**

  Register `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and
  `lostpointercapture` on the canvas target. Remove `mousedown` plus window-level
  `mousemove`/`mouseup`. On valid down, store the pointer ID, call
  `setPointerCapture(pointerId)` when available, prevent default, and project the
  contact immediately.

- [x] **Step 2: Enforce single-pointer ownership and deterministic cleanup**

  Accept only `isPrimary`, a free active slot, and either non-mouse pointers or
  left-button mouse input. Move only the active ID. On matching up/cancel/lost
  capture, clear ownership and release capture when still held. `detach()` must
  remove every target listener and clear capture without emitting.

- [x] **Step 3: Reuse the exact projection and expose the canvas gesture**

  Generalize `applyDragAim` to consume `{ clientX, clientY }`, leaving its
  CSS-to-logical mapping, rounding, clamps, and absolute setters unchanged. Add
  `touch-action: none` to `#game` only; do not change the overlay or command-deck
  touch rules.

- [x] **Step 4: Add production-browser causal coverage**

  In the Pixel-touch First Salvo route, use Chromium touchscreen input on a
  known battlefield coordinate and prove live elevation/power change, the coach
  advances from step 1, Fire stays enabled, and the engine remains in
  `PLAYER_TURN` with no projectile. Retain the fine-pointer mouse-drag route and
  assert its one gesture does not double-dispatch after Pointer Event migration.

- [x] **Step 5: Update the player guide**

  Document that touch players can tap or drag on the battlefield for coarse
  direct aim/power and use the Command Deck for fine adjustment; state explicitly
  that the gesture does not fire.

- [x] **Step 6: Observe focused GREEN and self-review**

  Run:

  ```powershell
  npm exec --workspace client vitest run src/input/InputHandler.test.ts
  npx playwright test e2e/first-salvo.spec.ts --project=desktop-fine --project=pixel-touch --project=small-window
  npm run typecheck
  ```

  Inspect exact emitted action counts, pointer-capture teardown, visible gauge
  movement, and absence of projectile/fire state. Confirm watched ports 4173 and
  5173-5177 are empty after Playwright exits.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

**Interfaces:**
- Consumes: the exact Task 1-2 diff and test evidence.
- Produces: one reviewed, verified, ready PR with deployment provenance.

- [x] **Step 1: Run the complete local gate**

  ```powershell
  npm run coverage:client
  npm run check
  npm run check:edge
  npm run build
  npm run test:e2e
  npm run audit:deps
  git diff --check
  ```

  Also run the state-free secret scan and prove ports 4173 and 5173-5177 are not
  listening.

- [x] **Step 2: Dispatch one designated adversarial review**

  Supply the spec, plan, sprint log, focused/broad evidence, and exact diff.
  Resolve every Critical, High, Medium/Important, pointer-causality,
  accessibility, responsive-layout, governance, and merge-blocking finding.

- [x] **Step 3: Route commit and PR through `$ca-commit` and `$ca-pr`**

  Mark `input.feature.0001` done only after implementation and local review pass.
  Commit, push, and open one ready PR against `main`.

- [ ] **Step 4: Clear exact-head hosted CI, merge, deploy, and verify production**

  After the behavior head is green, log the PR-specific merge-stop override under
  standing authority. Require the governance-only final head to re-clear hosted
  CI and exact-package adversarial review, squash merge, then verify exact
  merge-SHA Pages provenance, HTTP 200, hosted live smoke, and localhost hygiene.

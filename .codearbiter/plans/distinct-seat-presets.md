# Distinct Seat Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the four existing authored tank silhouettes immediately by assigning each new hot-seat seat a stable, distinct preset.

**Architecture:** Add one pure seat-index-to-preset helper in `Lobby.ts` and use it only at hot-seat row construction seams. Preserve all existing Garage mutation, config submission, rendering, online, and engine paths.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright production Chromium, existing Canvas tank-part atlas.

## Global Constraints

- Stable cycle: seat 1 Foundry, seat 2 Ranger, seat 3 Bulwark, seat 4 Jackal.
- Return fresh loadout objects; never share mutable row state.
- Never reset existing rows when player count grows.
- Preserve all free preset and independent-slot customization.
- Hot-seat defaults only; online self and waiting-room behavior remain unchanged.
- Client lobby defaults, docs, and tests only; no engine, renderer geometry,
  assets, network, backend, dependencies, lockfile, auth, schema, or migrations.

---

### Task 1: Pin distinct fresh-lobby defaults

**Files:**
- Modify: `client/src/ui/Lobby.garage.test.ts`
- Test: `client/src/ui/Lobby.ts`

- [x] **Step 1: Add failing two-seat default assertions**

  Require a fresh lobby to expose Player 1 as Foundry/Tracks and Player 2 as
  Ranger/Spider Legs before any Garage interaction. Prove the selected preset
  buttons and preview signatures agree.

- [x] **Step 2: Add failing four-seat and isolation assertions**

  Increase the roster to four and require Foundry, Ranger, Bulwark, Jackal in
  stable seat order. Mutate one row through the Garage and prove another row is
  unchanged; grow an edited roster and prove existing edits survive.

- [x] **Step 3: Observe and log TDD RED**

  Run:

  ```powershell
  npm exec --workspace client vitest run src/ui/Lobby.garage.test.ts
  ```

  Expected: the new Player 2 and larger-roster expectations fail because every
  new human row still copies `DEFAULT_TANK_LOADOUT`.

### Task 2: Implement stable seat presets and browser causality

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.garage.test.ts`
- Modify: `e2e/garage-spotlight.spec.ts`
- Modify: `docs/PLAYING.md`

- [x] **Step 1: Add one pure seat preset helper**

  Resolve the kit from `TANK_KIT_IDS` with a bounded modulo and build a fresh
  complete preset through the existing `presetLoadout` helper.

- [x] **Step 2: Route only new hot-seat rows through it**

  Use the helper in `defaultRow()` and the roster-growth path. Do not modify
  current rows, online self state, waiting-room state, or bot preset behavior.

- [x] **Step 3: Add production-browser acceptance**

  In the existing Garage spotlight route, assert the untouched fresh-lobby part
  labels and preview signatures for both players, start the match, and prove the
  live E2E state exposes the exact Foundry/Ranger loadouts.

- [x] **Step 4: Update player documentation**

  Explain that hot-seat seats start with distinct example builds and that every
  component remains freely customizable before launch.

- [x] **Step 5: Observe focused GREEN and self-review**

  Run the focused Lobby unit file, the exact Garage production route, and
  `npm run typecheck`. Inspect a fresh desktop and compact lobby capture for
  clearly distinct P1/P2 silhouettes and no overflow. Stop the preview and prove
  ports 4173 and 5173-5177 are empty.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

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
  Resolve every Critical, High, Medium/Important, causality, accessibility,
  responsive-layout, governance, and merge-blocking finding.

- [x] **Step 3: Route commit and PR through `$ca-commit` and `$ca-pr`**

  Mark `garage.feature.0001` done only after implementation and local review.
  Commit, push, and open one ready PR against `main`.

- [ ] **Step 4: Clear exact-head hosted CI, merge, deploy, and verify production**

  After the behavior head is green, log the PR-specific merge-stop override
  under standing authority. Require the governance-only final head to re-clear
  hosted CI and exact-package adversarial review, squash merge, then verify exact
  merge-SHA Pages provenance, HTTP 200, hosted live smoke, and localhost hygiene.

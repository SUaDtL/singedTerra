# Battle Console Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Make the protected battle rail a single readable decision console
without duplicated firing facts or competing cards.

**Architecture:** `HUD` keeps the existing command-state projection and
callbacks. It removes the commitment readback as a second presentation of the
solution, makes weapon purchasing a persistent part of the firing solution,
and makes Fire a terminal cell of the same Fire Control surface. CSS removes
blank Commander and ledger chrome rather than inflating controls, restores
playfield height through the protected floor, and changes no authority.

**Tech stack:** TypeScript DOM HUD, existing CSS rail tokens, Vitest, Playwright.

## Global constraints

- Client presentation plus the shared protected arena-floor constant and its
  deterministic verifier/diagnostics compatibility surfaces. No renderer
  prediction, network protocol, Auth policy, schema, progression, dependency,
  or action-log change. The floor must ship in both `verified_replay_probe`
  and `complete_verified_deployment`, which bundle the shared replay code.
- Preserve one primary Fire action in a controllable decision state and none in
  every other state.
- Raise the shared floor only with replay/verifier harness evidence, and
  preserve every existing desktop, compact, and touch
  containment target.

### Task 1: Prove and remove duplicate decision readback

**Files:**

- Modify `client/src/ui/HUD.shell.test.ts`.
- Modify `client/src/ui/HUD.commandInput.test.ts`.
- Modify `client/src/ui/HUD.ts`.

- [x] Write failing decision-state assertions that Firing Solution is the only
  live owner of weapon, angle, power, and wind values and Commitment has no
  `data-ui="shot-readback"` descendant.
- [x] Run the focused HUD tests and verify failure because the current
  Commitment card renders the duplicate solution summary.
- [x] Remove the duplicate commitment readback, add current numerical values to
  the existing angle/power adjustment groups, and retain exactly one command
  callback per button.
- [x] Re-run focused tests and prove state transitions still replace Fire with
  submitting, tracking, resolving, handoff, and recovery status.

### Task 2: Recompose the lower rail hierarchy

**Files:**

- Modify `client/src/style.css`.
- Modify `client/src/ui/HUD.shell.test.ts`.
- Modify `e2e/hud-layout.spec.ts`.

- [x] Write failing browser geometry assertions that Commander excludes firing
  facts, Commitment excludes solution values, and Firing Solution contains the
  real weapon, adjustment, and wind boxes without sibling intersection.
- [x] Run the browser contract on desktop, 900x520, and Pixel landscape; record
  the current duplicate/readback layout failure.
- [x] Recompose the rail as a compact Commander strip plus one Fire Control:
  it owns all firing data, the gameplay Armory equip/buy route, controls,
  phase state, and Fire.
  Remove the separate Ballistic Computer/Commitment cards, collapse trajectory
  guidance into solution metadata, and make Match a drawer below 1416:600.
- [x] Re-run the browser matrix, including First Salvo and flight transitions,
  and retain the font floor, target floor, no-scroll, and arena-clearance
  contracts.

### Task 3: Prove real control and phase behavior

**Files:**

- Modify `e2e/command-console-journey.spec.ts`.
- Modify focused HUD/input tests only if the journey exposes a missing causal
  seam.

- [x] Write a failing journey that changes weapon, angle, and power through the
  sole solution surface, moves the tank, fires one shot, and verifies that the
  tracking state has no duplicate decision readback or second Fire action.
- [x] Run the journey RED, then implement only the missing presentation wiring
  required for the existing controls to satisfy it.
- [x] Run focused client tests, full browser matrix, full client suite,
  deterministic checks, typecheck, and diff-check.

### Task 4: Govern and deliver

- [x] Append SMARTS, RED/GREEN evidence, visual review findings, and every
  correction to the UTF-8 append-only sprint log.
- [x] Give the spec, plan, sprint log, exact tests, rendered screenshots, and
  final diff to an adversarial reviewer; resolve every Critical, High, and
  merge-blocking finding.
- [ ] Commit, open a PR, require exact-head hosted CI/CodeQL/Pages, merge under
  standing authority, and verify the exact Pages deploy provenance and health.

# Pregame Overlay Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Account and Operations Settings feel like deliberate stage-owned game surfaces with no ghosted or reflowed lobby composition.

**Architecture:** Extend `LobbyOverlayView` with an explicit presentation variant and stable stage-modal hooks while retaining its existing lifecycle and focus ownership. `Lobby` continues to mount the base card and overlay as siblings; scoped CSS visually suppresses only the inert base card and gives the overlay an opaque full-stage backdrop plus variant-sized contained surfaces. Production Playwright validates computed visual state and geometry rather than inferring success from `position: fixed`.

**Tech Stack:** TypeScript DOM UI, scoped lobby CSS, Vitest/jsdom, Playwright against the production Vite bundle.

## Global constraints

- Work test-first; no production edit before the corresponding RED is observed.
- Client presentation only. Do not alter AccountSession, credentials, progression arithmetic, settings parsing/serialization, lobby transport, gameplay, Supabase, migrations, or dependencies.
- Preserve the current modal keyboard, inert-state, one-overlay, and focus-restoration contracts.
- Test `desktop-fine`, `pixel-touch`, and `small-window` without using the unrelated listener on port 4173; use an isolated strict port and stop only that exact process.
- Do not read or modify `.codearbiter/sprint-log.md`.

---

### Task 1: Make overlay presentation intent explicit

**Files:**
- Modify: `client/src/ui/LobbyOverlayView.ts`
- Modify: `client/src/ui/LobbyOverlayView.test.ts`
- Modify: `client/src/ui/Lobby.ts`

**Interfaces:**
- `LobbyOverlayViewOptions.variant: 'account' | 'operations'`
- Produces `.lobby-overlay--account` or `.lobby-overlay--operations` plus `data-overlay-presentation="stage-modal"`.

- [x] Write focused tests that require the variant class and stage-modal data contract while retaining labelled dialog, backdrop, close, Escape, focus loop, and inert restoration.
- [x] Run `npm -w @singedterra/client run test -- LobbyOverlayView.test.ts` and verify RED because the option/hooks do not exist.
- [x] Add the smallest typed variant contract and pass `account`/`operations` from the two Lobby call sites.
- [x] Rerun the focused test GREEN and run `Lobby.account.test.ts` plus `Lobby.advancedOverlay.test.ts` to prove composition behavior is unchanged.

### Task 2: Prove the player-visible failure in a real browser

**Files:**
- Modify: `e2e/lobby-layout.spec.ts`
- Modify: `e2e/account-progression-summary.spec.ts`

**Interfaces:**
- Consumes the stage-modal hooks from Task 1.
- Produces reusable assertions for full-stage bounds, opaque base suppression,
  surface containment, and operations field layout.

- [x] Replace the old fixed-position-only checks with Account and Operations tests that capture lobby/base geometry before open, then assert: base geometry is unchanged; base visual opacity is zero; overlay and backdrop bounds match the lobby; surface stays inside the lobby; surface owns scrolling; and the variant is correct.
- [x] At desktop require each Operations row's label, control, and explanation to share stable column starts and every control to share a bounded width. At compact require each row to be one-column, ordered, non-overlapping, and contained.
- [x] Retain Escape and opener-focus checks and run the focused specs on an isolated production preview across all three projects.
- [x] Verify RED specifically because the current base card remains visible and the overlay uses viewport-fixed rather than stage-owned computed bounds.

### Task 3: Implement the opaque stage-owned composition

**Files:**
- Modify: `client/src/ui/Lobby.ts`

**Interfaces:**
- Consumes `.lobby-overlay--account`, `.lobby-overlay--operations`, and
  `[data-overlay-presentation="stage-modal"]`.
- Changes presentation only; no state or form callbacks change.

- [x] Scope CSS so an active stage-modal visually suppresses the sibling `.lobby-card` without removing it from layout or changing its geometry.
- [x] Make the overlay/backdrop absolute to the full lobby stage, use an opaque tactical field-console background, and keep the surface contained with its own overflow.
- [x] Size Account as a focused record/auth console and Operations as a wider console. Normalize Operations label/control/hint columns, control widths, min-widths, and the compact one-column branch.
- [x] Run the focused browser tests GREEN in all three projects, then rerun focused DOM tests.

### Task 4: Mutation, complete verification, and delivery

**Files:**
- Modify: `.codearbiter/plans/pregame-overlay-containment.md` checkboxes/evidence only as needed
- Create later in docs closeout: `.codearbiter/reports/2026-08-10-pregame-overlay-containment.md`

- [x] Temporarily re-expose `.lobby-card` (or weaken the backdrop below the asserted opacity) and prove the visual-state browser test fails for the causal reason; revert the mutation and rerun GREEN.
- [x] Run focused tests, full client, deterministic harness/typecheck, Edge suite, dependency audit, production build, diff hygiene, and the complete isolated non-live browser matrix.
- [x] Stage only the bounded slice and run canonical security and migration passes.
- [ ] Give one adversarial reviewer the exact spec, plan, sprint evidence, tests, mutation log, and final diff. Resolve every Critical, High, and merge blocker and repeat exact-final review after corrections.
- [ ] Commit through `$ca-commit`, open through `$ca-pr`, require all hosted checks green on the exact reviewed head, merge under standing authority, verify exact-main Pages provenance/live smoke/public health, then persist the delivery receipt through the docs lane.

## Plan self-review

The plan covers both previously reported overlays, distinguishes visual
containment from mere fixed positioning, preserves every behavior boundary,
and gives the compact branch direct production-browser evidence. It contains no
placeholder, backend, dependency, or unrelated menu-overhaul work.

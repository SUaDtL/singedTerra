# Weapon Intel Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every implemented arsenal weapon understandable before a player spends ammunition.

**Architecture:** Add one exhaustive client-only tactical-copy catalog and render it through one persistent region inside the existing arsenal drawer. HUD events preview focused or pointed weapons, while the selected weapon remains the stable fallback. No engine or action behavior changes.

**Tech Stack:** TypeScript, DOM, CSS injected by `HUD.ts`, Vitest/jsdom, Playwright/Chromium.

## Global Constraints

- Work test-first and preserve the RED output before production edits.
- Keep the feature inside the existing arsenal drawer; no tooltip, popover, or modal.
- Cover every implemented `WeaponType` exhaustively.
- Support mouse, keyboard, and touch without changing weapon selection semantics.
- Keep drawer, HUD, and page geometry contained in desktop-fine, pixel-touch, and small-window.
- Do not touch engine, network, Supabase, auth, progression, dependencies, assets, schemas, or migrations.

---

### Task 1: Exhaustive tactical intel catalog

**Files:**
- Create: `client/src/ui/weaponIntel.ts`
- Create: `client/src/ui/weaponIntel.test.ts`

**Interfaces:**
- Produces: `WeaponIntel` and `WEAPON_INTEL: Record<WeaponType, WeaponIntel>` with `role`, `terrain`, `damage`, and `useCase` strings.

- [ ] Write a failing unit test that iterates the implemented keys in `WEAPONS`, requires an exactly matching intel key set, and requires every field to be non-empty and concise.
- [ ] Run `npm test --workspace client -- --run client/src/ui/weaponIntel.test.ts` and record the expected module-not-found RED.
- [ ] Add the exhaustive authored catalog with qualitative, player-facing tactical copy for all 18 implemented weapons.
- [ ] Re-run the focused test and keep it green.

### Task 2: Input-complete arsenal dossier behavior

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.arsenal.test.ts`

**Interfaces:**
- Consumes: `WEAPON_INTEL`.
- Produces: `.st-hud__weapon-intel` with named fields and live ammo; every weapon button receives `aria-describedby`.

- [ ] Add failing HUD tests for selected default content, keyboard focus preview, pointer preview and selected fallback, click persistence, live ammo updates, accessible description wiring, and hidden-with-collapsed behavior.
- [ ] Run `npm test --workspace client -- --run client/src/ui/HUD.arsenal.test.ts` and record assertion RED caused by the absent dossier.
- [ ] Build one dossier below the arsenal grid, cache its field nodes, and add focused preview helpers without rebuilding per frame.
- [ ] Wire `focus`, `pointerenter`, `pointerleave`, and the existing click listener so previews never emit selection and click emits selection exactly once.
- [ ] Reconcile selected fallback and live ammunition in `syncStrip`; preserve Escape focus return and collapse state.
- [ ] Re-run both focused Vitest files and keep them green.

### Task 3: Battlefield-safe responsive composition

**Files:**
- Modify: `client/src/ui/HUD.ts` (injected HUD CSS)
- Create: `e2e/weapon-intel.spec.ts`

**Interfaces:**
- Consumes: dossier DOM from Task 2.
- Produces: fitted drawer composition across the existing Playwright project matrix.

- [ ] Add a Playwright test that opens the arsenal, proves selected intel, exercises pointer preview on desktop, focus preview on fine-pointer projects, and touch selection on pixel-touch.
- [ ] Assert computed geometry: dossier inside drawer and viewport, drawer disjoint from the canvas, no page overflow, no increase in `#hud` scroll height, and 44-pixel weapon targets on touch.
- [ ] Run `npm run test:e2e -- --grep "weapon intel"` and record the expected RED before CSS/behavior completion.
- [ ] Add compact dossier layout, restrained qualitative labels, and bounded overflow inside the existing drawer.
- [ ] Re-run the focused browser test and affected `hud-layout` guardrails across all projects.

### Task 4: Verification and review package

**Files:**
- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md`
- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-final-review-package.md`
- Modify via `$ca-task`: `.codearbiter/open-tasks.md`

- [ ] Run focused unit and browser suites, client suite, typecheck, deterministic harness, build, dependency audit, and the complete Playwright matrix.
- [ ] Record RED/GREEN evidence, SMARTS decisions, test results, and the exact final staged diff hash in sprint evidence.
- [ ] Assemble the exact spec, plan, audit, evidence, tests, and final diff in one adversarial review package.
- [ ] Dispatch one fresh adversarial reviewer; resolve every Critical, High, and other merge-blocking finding and regenerate exact-head review evidence after any correction.
- [ ] Mark `ux.hud.0002` done through `$ca-task`, route through `$ca-commit` and `$ca-pr`, require hosted CI green on the exact reviewed head, merge under standing authority, verify Pages production, and write the delivery receipt.

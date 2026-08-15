# Adaptive Battle Command Console — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Every behavioral task starts RED and ends with an exact browser proof.

**Goal:** Turn the protected lower arena band into a coherent, phase-aware combat console that helps a player form, commit, and learn from a shot without covering the battlefield or duplicating controls.

**Architecture:** Keep deterministic simulation and the existing HUD callbacks unchanged. Replace the current redistributed HUD with one display model (`BattleCommandState`) and one adaptive console: commander/last-salvo context, firing solution, and phase-aware commitment. The right rail becomes a match ledger; mouse and touch operate the same semantic controls in the protected lower band.

**Tech stack:** TypeScript, Canvas/HTML HUD, CSS grid, Vitest, deterministic engine harnesses, Playwright.

## Global constraints

- `ARENA_FLOOR_Y` remains the single shared engine/layout floor contract; no CSS-only battlefield boundary.
- Hot-seat and online play consume the same HUD state projection and callbacks; no new transport, authority, persistence, Auth, Edge, or dependency surface.
- The trajectory presentation must reuse the existing deterministic aim-guide path. Do not invent a cosmetic impact prediction.
- Critical text is at least 12 CSS px; body/labels are at least 11 CSS px; touch targets are at least 44 by 44 CSS px.
- The protected lower band contains every persistent combat command. The battlefield and all actual 2–4-seat rendered tank envelopes stay clear.
- Exactly one enabled shot-commit action exists during a controllable player turn. No Fire affordance survives submitting, flight, resolving, CPU/remote handoff, or terminal recovery.
- First Salvo is an inline rail coach. The entry overlay owns the expanded briefing.

## Rejection criteria

Reject a change that leaves two command surfaces, turns the right rail back into fire control, presents a grey disabled Fire button as the next action, hides a needed action behind ambiguous decoration, uses labels too small to read, lets touch controls cover the battlefield, or proves only DOM presence/geometry instead of a real battle journey.

## Task 1: Model an honest console state

**Files:**
- Modify: `client/src/ui/battleCommandState.ts`
- Modify: `client/src/ui/battleCommandState.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Test: `client/src/ui/HUD.combatFocus.test.ts`

**Interfaces:**
- Consume: `GameState`, existing HUD firing/control flags, existing verified/report state and impact-learning cue.
- Produce: `BattleCommandState` with `context`, `solution`, and `commitment` fields. `commitment` is one of `decision`, `submitting`, `tracking`, `resolving`, `handoff`, or `recovery` and contains no action that cannot presently run.

- [ ] Write focused RED tests for a player decision, local submission, firing, resolving, CPU/remote turn, report/retry, and unavailable input. Assert each state contains a persistent commander identity plus an honest phase label, and only the decision state exposes an enabled commit.
- [ ] Run `npm -w @singedterra/client exec vitest run src/ui/battleCommandState.test.ts src/ui/HUD.combatFocus.test.ts`; confirm the missing state fields fail.
- [ ] Extend the pure projection using only authoritative in-memory HUD inputs. Capture an existing impact-learning cue only when its current validity rules permit it; otherwise return `null` rather than an invented correction.
- [ ] Render the projected phase state from one HUD synchronization point; do not add an alternate fire callback or transport branch.
- [ ] Re-run the focused tests and `npm run typecheck`; commit `feat(console): model phase-aware battle decisions`.

## Task 2: Build the unified firing solution

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.shell.test.ts`
- Modify: `client/src/ui/HUD.commandInput.test.ts`
- Modify: `client/src/ui/HUD.mobility.test.ts` (or the existing control callback test)
- Modify: `client/src/style.css`

**Interfaces:**
- Consume: existing weapon selection, aim, power, move, store/menu, and aim-guide callbacks.
- Produce: one lower-rail solution surface with weapon/ammo, Arsenal drawer trigger, angle/power controls, wind, trajectory guide, and compact keyboard hints attached to the controls they describe.

- [ ] Write DOM RED assertions that the solution surface has exactly one weapon bay, real previous/next or drawer access, real angle/power adjustment controls, readable wind, and a deterministic aim-guide host. Assert the old desktop hotkey grid and any side-rail Arsenal/fire-control descendants are absent.
- [ ] Run the focused HUD tests and confirm failure because the old deck still owns the controls.
- [ ] Recompose existing nodes/callbacks into the solution surface. The Arsenal trigger opens the existing drawer/menu and restores focus to its trigger on close. Keep movement with commander context, not as a duplicate solution card.
- [ ] Attach small keyboard hints to their actual controls; remove standalone clickable Fire/Enter duplicates.
- [ ] Re-run focused tests and `npm run typecheck`; commit `feat(console): unify firing solution controls`.

## Task 3: Make commitment transform instead of disable

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.shell.test.ts`
- Modify: `client/src/ui/HUD.firstSalvo.test.ts`
- Modify: `client/src/main.hotSeatProgression.test.ts`
- Test: `e2e/first-salvo.spec.ts`

**Interfaces:**
- Consume: `BattleCommandState.commitment`, the existing guarded Fire/retry/report callbacks, and the First Salvo controller.
- Produce: one commitment zone that has Fire only in a controllable decision and otherwise presents transmitting, tracking, resolving, handoff, or recovery content without stale combat controls.

- [ ] Write RED tests that activate Fire and drive the real callback through `decision -> submitting/tracking -> resolving -> handoff`; assert the original Fire element is removed, focus remains in the console, and the phase copy is useful rather than blank.
- [ ] Add an explicit retryable-report path that retains the existing in-report retry action without creating a second terminal action in the console.
- [ ] Run the targeted HUD/main/browser tests and confirm they fail under the disabled-Fire layout.
- [ ] Implement element replacement/visibility changes from the state model, preserving the current guarded callbacks and focus semantics.
- [ ] Move First Salvo to a 32–44px inline ribbon in the relevant solution/commitment zone. Expand the entry overlay with the three-part operational briefing (aim, wind, commit), one clear Enter action, and normal keyboard/touch activation.
- [ ] Re-run focused tests; commit `feat(console): transform commitment through combat phases`.

## Task 4: Convert the right rail to a ledger

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/style.css`
- Modify: `client/src/ui/HUD.shell.test.ts`
- Test: `e2e/hud-layout.spec.ts`

**Interfaces:**
- Consume: existing round, roster, objective/verification, and connection presentation nodes.
- Produce: a right-side ledger with menu, round/mode, roster/health/turn order, objective/verification, and connection only.

- [ ] Write RED browser and DOM assertions that `#game-overlay`'s side rail has no weapon selection, angle/power, Arsenal, Store, or Fire descendants; it retains the ledger elements and its menu remains reachable.
- [ ] Run the targeted tests and confirm they fail against the present Fire Control/Arsenal composition.
- [ ] Move combat controls into the lower console and rename/remove the Fire Control treatment. Do not add filler merely to occupy empty ledger space.
- [ ] Re-run targeted tests and typecheck; commit `refactor(console): leave the side rail as match ledger`.

## Task 5: Give touch the same console, not a second deck

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/style.css`
- Modify: `client/src/ui/HUD.commandInput.test.ts`
- Test: `e2e/hud-layout.spec.ts`
- Test: `e2e/first-salvo.spec.ts`

**Interfaces:**
- Consume: semantic desktop control callbacks and the protected rail root.
- Produce: responsive rail controls whose touch targets use the same weapon/aim/power/move actions and whose secondary actions use the Command Menu/drawer.

- [ ] Write Pixel-landscape RED assertions that no persistent touch Command Deck lies over the canvas; every touch action is in `#battle-rail`, each target is at least 44px, labels do not collide, and the primary action is visible.
- [ ] Extend the desktop/compact/Pixel geometry matrix to prove 1600×900, 900×520, and Pixel 5 landscape no document overflow, constant rail height through phase changes, and clearance from every real configured/default 2–4-seat widest rendered chassis envelope.
- [ ] Implement responsive grid variants that preserve commander identity, weapon/ammo, wind, one context cue, and the active phase action; collapse only secondary labels and route secondary tools to the menu.
- [ ] Re-run the full HUD/First Salvo browser matrix and focused client tests; commit `feat(console): give touch the unified command surface`.

## Task 6: Prove the whole decision loop

**Files:**
- Test: `e2e/hud-layout.spec.ts`
- Test: `e2e/first-salvo.spec.ts`
- Test: existing online/hot-seat battle journey specs
- Modify: `.codearbiter/plans/commander-career-loop-milestone-2.md`
- Modify: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Modify: `.codearbiter/sprint-log.md`

- [ ] Write an end-to-end RED journey for hot-seat and deterministic online CPU paths: choose weapon, adjust aim/power, move/fuel, open/close Arsenal with focus return, Fire once, observe tracking and impact, retain the allowed last-salvo cue, hand off to CPU/remote, and reach the verified recovery affordance without duplicate Fire.
- [ ] Add visual-review assertions that reject empty/illegible control columns: body labels >=11px, critical values/actions >=12px, no visible overlap, no side-rail combat controls, and exactly one active commit control.
- [ ] Run the journey tests and confirm failure before the recomposed console is complete.
- [ ] Execute the complete affected client suite, `npm run check`, `npm run check:edge`, typecheck, and the full browser matrix. Give the final diff, test output, plan, and append-only evidence to adversarial and coverage reviewers; resolve every blocker.
- [ ] Record only observed local/hosted/deployment/production facts. Then commit the evidence/governance slice.

## Completion evidence

The candidate is rejected unless exact-head hosted CI, CodeQL, Edge tests, and rendering E2E are green; Pages has deployed the merged head; the client and the two shared-floor verifier Edge consumers are deployed; and fresh production journeys prove both the rebuilt hot-seat console and an online/CPU console without making award or network claims beyond observation.

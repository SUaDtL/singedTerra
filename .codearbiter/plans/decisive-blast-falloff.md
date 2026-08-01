# Decisive Starter-Weapon Falloff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for implementation, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Make landed hot-seat Baby Missile and Missile blasts more decisive without changing their hit rate, direct-hit peaks, visible reach, terrain deformation, other weapons, or mixed-version network replay.

**Architecture:** Keep blast geometry authoritative and shared. Add one optional detonation exponent in the weapon catalog, apply it in the pure physics damage curve, and thread it through an explicit execution-context option. Hot-seat opts in; network engines retain the fail-closed linear default until an Edge-enforced room ruleset boundary exists. Tests cover both execution rules, the pure curve, catalog selection, actual detonation, unchanged controls, and the deterministic 100-seed calibration.

**Tech Stack:** TypeScript, deterministic shared engine, existing `tsx` harnesses; no dependency.

## Global constraints

- TDD RED must be captured before production edits.
- No changes to canvas dimensions, placement, launch physics, wind, terrain radius, visual radius, max damage, economy, backend, migrations, or dependencies.
- Omitted/invalid exponent values must not introduce NaN or non-deterministic behavior.
- One adversarial exact-diff review, exact-head hosted CI, PR-only merge, Pages provenance, and live smoke remain required.

---

### Task 1: Pin the damage-curve contract in RED

**Files:**

- Modify: `scripts/checks/blast_reach.mjs`
- Create if isolation is clearer: `scripts/checks/damage_falloff.mjs`
- Modify: `package.json` only if a new harness file is added

- [x] Assert exponent `2` yields 100% at center, 75% at half radius, and 0% at/beyond edge.
- [x] Assert the omitted exponent retains today's linear 50% midpoint.
- [x] Assert Baby Missile and Missile declare exponent `2`; a premium or multi-hit control omits it.
- [x] Assert actual engine detonation uses the decisive curve for Baby Missile and the linear curve for the control.
- [x] Run the focused test and record the expected RED against unmodified production code.

### Task 2: Implement the smallest deterministic curve seam

**Files:**

- Modify: `shared/src/engine/Physics.ts`
- Modify: `shared/src/engine/WeaponSystem.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `shared/src/types/GameOptions.ts`
- Modify: `client/src/main.ts`
- Create: `client/src/client/gameEngineOptions.ts`
- Create: `client/src/client/gameEngineOptions.test.ts`
- Modify only if contract text requires correction: `docs/SPEC.md`

- [x] Add the optional positive falloff exponent to the detonation contract.
- [x] Implement the exponent in the centralized pure damage calculation with linear default behavior.
- [x] Select exponent `2` for Baby Missile and Missile only.
- [x] Thread the exponent through `GameEngine.detonate()` without changing blast reach or terrain deformation.
- [x] Default engines to linear, opt only hot-seat into decisive falloff, and preserve mixed-version network replay.
- [x] Route production construction through a pure, directly tested mode-to-engine-options builder.
- [x] Make the focused RED test green.

### Task 3: Verify combat calibration and full determinism

**Files:**

- Modify: `.codearbiter/sprint-log.md` by append only
- Modify: `.codearbiter/overrides.log` by append only when an authorized gate is bypassed

- [x] Re-run the deterministic 100-seed 49-degree / 70-power calibration and record hit rate plus landed-shot mean/median before and after.
- [x] Run `npm run check`, `npm run coverage:client`, `npm run build`, and `git diff --check`.
- [x] Run the state-free secret scan and confirm no hard-gated surface changed.
- [x] Use one local server only for focused browser verification; stop it after use.
- [ ] Adversarially review the exact diff and correct every Critical, High, and merge-blocking finding.
- [ ] Commit through the codeArbiter gate, push, open a ready PR, require hosted CI green on the exact reviewed head, and merge through the PR.
- [ ] Verify Pages current-main provenance and live smoke, then update/close issue #45 with measured evidence.
- [ ] Immediately select the next highest-value bounded sprint cell.

# Deterministic AI Weapon Personalities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three deterministic weapon-preference profiles to the shared CPU planner while preserving current physics, difficulty, replay, and network contracts.

**Architecture:** Keep personality as a pure `computeAiPlan` input with a stable id-derived default. Centralize profile ordering beside the existing effective-damage ranking, then let the current ammo, arms-level, shield, parachute, and hard-restock gates filter those preferences. The client continues to emit the same ordinary actions and the Edge referee remains unchanged.

**Tech Stack:** TypeScript shared engine, deterministic `scripts/checks/ai.mjs` harness, npm workspace typecheck.

## Global Constraints

- No `Math.random()`, wall-clock input, new action kind, or physics change.
- No auth, persistence, migration, secret, dependency, or referee-contract changes.
- Test-first: prove the new profile assertions fail before changing `AI.ts`.
- An omitted personality intentionally uses the stable AI-id-derived profile; the mapping keeps p1 conservative so the existing baseline fixture remains backward-compatible while other CPU seats gain variety.

---

### Task 1: RED personality contract

**Files:**
- Modify: `scripts/checks/ai.mjs`
- Modify: `.codearbiter/sprint-log.md`

**Interfaces:**
- Consume: current `computeAiPlan(state, tankId, difficulty, gravity, armsLevel)`.
- Produce: failing assertions for explicit aggressive, conservative, area-denial profiles and stable omitted-input derivation.

- [ ] **Step 1: Write the failing assertions**

  Add one controlled full-stock fixture and assert that explicit profiles select their documented weapon families, while two omitted calls for the same tank id are identical.

- [ ] **Step 2: Run the harness to verify RED**

  Run `npx tsx scripts/checks/ai.mjs`.

  Expected: the new personality assertions fail because the planner has no personality input; existing AI checks continue to report their prior behavior.

### Task 2: GREEN pure personality selection

**Files:**
- Modify: `shared/src/types/GameState.ts`
- Modify: `shared/src/engine/AI.ts`
- Modify: `scripts/checks/ai.mjs`

**Interfaces:**
- Consume: `AiDifficulty`, `TankState`, existing `AI_EFFECTIVE_DAMAGE`, ammo/arms gates, and `hashId`.
- Produce: `AiPersonality`, `deriveAiPersonality(aiTankId)`, and `computeAiPlan(..., personality?)` with deterministic profile-aware loadout selection.

- [ ] **Step 1: Add the minimal type and profile ordering**

  Define the three-string union, stable id-derived default, and profile ranking helper. Keep conservative as the existing weakest-sufficient-finisher path; apply profile ordering only after existing availability and difficulty filters.

- [ ] **Step 2: Run focused GREEN verification**

  Run `npx tsx scripts/checks/ai.mjs` and `npm run typecheck`.

  Expected: the new assertions and all existing AI checks pass.

### Task 3: Full parity and review evidence

**Files:**
- Modify: `.codearbiter/sprint-log.md`

**Interfaces:**
- Consume: spec acceptance criteria, local test output, final diff, and task board state.
- Produce: full verification and adversarial review receipts; no production files outside the scoped shared AI/harness changes.

- [ ] **Step 1: Run the complete local matrix**

  Run `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run build`, `npm run test:e2e`, `git diff --check`, and `python C:\Users\brenn\.codex\plugins\cache\codearbiter\ca-codex\0.4.0\hooks\preview.py secrets`.

- [ ] **Step 2: Package the adversarial review**

  Send the spec, plan, sprint log, task board, all affected tests, and final diff to Euler. Resolve every Critical, High, Medium, Low, and merge-blocking finding before commit/PR.

- [ ] **Step 3: Deliver through commit, PR, hosted checks, merge, and production verification**

  Use the governed commit and PR paths; merge only after hosted checks are green on the exact reviewed head. This slice has no Supabase deployment surface; verify the Pages deployment and live client health after merge.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `shared/src/engine/AI.ts`, `scripts/checks/ai.mjs`.

The latest change to this historical plan reachable from `origin/main` is `dad107f1132a` (feat(ai): add deterministic weapon personalities). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

# Fire Projection Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for implementation, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Remove decay-only `state.fire` array allocation and sorting without changing a byte of deterministic napalm behavior.

**Architecture:** Keep the private Map authoritative. At the existing `syncFire()` projection seam, verify whether the current sorted array names the same keys. Update life scalars in place when it does; otherwise rebuild and sort exactly as before. Pin both allocation identity and the pre-fix state trace in one source-level harness.

**Tech Stack:** TypeScript deterministic shared engine and existing `tsx` harnesses; no dependency.

## Global constraints

- TDD RED must precede production edits and fail on projection allocation, not unrelated behavior.
- Preserve exact fire contents, ordering, damage, phase timing, and deterministic trace.
- Do not implement the stale gradient-cache proposal.
- One adversarial exact-package review, exact-head hosted CI, PR-only merge, Pages provenance, and live smoke remain required.

### Task 1: Pin RED allocation and parity contracts

**Files:**

- Create: `scripts/checks/fire_projection.mjs`
- Modify: `package.json`

- [x] Drive a real deterministic napalm shot through public engine actions.
- [x] Distinguish decay-only ticks from topology changes without mocks.
- [x] Assert stable identity for decay-only projections and replacement on topology change.
- [x] Pin the pre-fix phase/fire/health trace digest as an independent literal.
- [x] Run against unmodified production code and record RED: 0/55 decay-only projections reused; 44/44 topology changes replaced; trace digest stable.

### Task 2: Implement the minimal projection reuse

**Files:**

- Modify: `shared/src/engine/GameEngine.ts`

- [x] Validate current projection length, sorted order, and membership against the authoritative Map.
- [x] Update only cell life in place when topology matches.
- [x] Preserve the existing rebuild-and-sort path for topology changes.
- [x] Make the focused harness green without changing its assertions.

### Task 3: Verify, review, and deliver

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when authorized gates are bypassed: `.codearbiter/overrides.log`

- [x] Run `npm run check`, client and Edge tests, `npm run coverage:client`, `npm run build`, `npm run audit:deps`, and `git diff --check`.
- [x] Run the state-free secret scan and hard-surface diff classification.
- [x] Give one adversarial subagent the spec, plan, sprint log, RED/GREEN evidence, verification, and exact diff; correct every merge blocker.
- [ ] Commit through `$ca-commit`, push, and open a ready PR through `$ca-pr`.
- [ ] Require every hosted check green on the exact reviewed head, then use the standing PR-only merge authority.
- [ ] Verify Pages exact-main provenance and live smoke; close issue #68 with the reviewed disposition.
- [ ] Select the next highest-value bounded sprint cell.

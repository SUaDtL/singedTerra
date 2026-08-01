# Direct Client Helper Vitest Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for the test contracts, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Give `retry.ts` and `audioEdges.ts` complete direct client-suite coverage without changing production code.

**Architecture:** Add colocated Vitest files. Drive retry timing deterministically with fake timers and express the pure audio behavior as complete input/output tables. Keep the existing root harnesses as independent coverage.

**Tech Stack:** TypeScript, Vitest 4 fake timers, existing V8 coverage; no dependency.

## Global constraints

- Production files must remain byte-identical to `origin/main`.
- No real delay may enter the focused suite.
- Exact error object identity is part of the retry exhaustion contract.
- One adversarial exact-package review, exact-head hosted CI, PR-only merge, and Pages provenance remain required.

### Task 1: Cover retry directly

**Files:**

- Create: `client/src/client/retry.test.ts`

- [x] Cover immediate success and transient retry success.
- [x] Cover exhausted failure and assert exact final error identity.
- [x] Cover attempts clamping, default delay, custom delay, and zero delay with fake timers.

### Task 2: Cover audio edge helpers directly

**Files:**

- Create: `client/src/renderer/audioEdges.test.ts`

- [x] Cover every fire-edge state transition.
- [x] Cover decrease, equality, increase, and multi-hop Betty deltas.
- [x] Cover the complete three-boolean OOB fizzle truth table.

### Task 3: Verify, review, and deliver

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when authorized gates are bypassed: `.codearbiter/overrides.log`

- [x] Prove staged protected files preserve their exact `origin/main` byte prefixes before commit.
- [x] Run focused tests and targeted coverage, then `npm run check`, client and Edge tests, full client coverage, `npm run build`, dependency audit, secret scan, and `git diff --check`.
- [x] Give one adversarial subagent the exact diff and evidence; correct every merge blocker and obtain a clean follow-up verdict.
- [x] Commit through `$ca-commit`, push, and open a ready PR through `$ca-pr` with `Closes #134`.
- [ ] Require every hosted check green on the exact reviewed head, then use the standing PR-only merge authority.
- [ ] Verify Pages exact-main provenance and live smoke, then select the next bounded sprint cell.

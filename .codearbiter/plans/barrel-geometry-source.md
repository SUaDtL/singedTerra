# Shared Barrel Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task by task.
> **Status:** APPROVED — user approved 2026-07-21.

**Goal:** Replace client-owned barrel geometry copies with shared engine imports and prove both behavioral parity and source ownership.

**Architecture:** The dependency direction remains client to shared. Existing numerical muzzle assertions pin the approved visual contract; TypeScript-AST assertions in the same harness pin renderer consumption of the shared API.

**Tech Stack:** TypeScript, TypeScript compiler API, existing tsx deterministic harnesses; no new dependency.

## Global Constraints

- Preserve exact 20px pivot and 22px barrel behavior.
- `shared/src/engine/Tank.ts` remains the geometry owner.
- Client renderers import shared geometry; shared never imports client code.
- No Canvas mock, visible art change, physics change, dependency, lockfile, workflow, or Supabase change.
- Task workers leave changes uncommitted; codeArbiter owns one landing commit.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | AST drift guard and renderer refactor | — | muzzle RED/GREEN plus unmodified parity harnesses | ACCEPTED |
| T2 | Review closure, full matrix, commit, PR, and green CI | T1 | reviews, commit gate, hosted checks | IN PROGRESS |

---

### Task 1: Guard source ownership and remove renderer copies

**Files:**

- Modify: `scripts/checks/muzzle.mjs`
- Modify: `shared/src/engine/Tank.ts` comments only
- Modify: `client/src/renderer/TankRenderer.ts`
- Modify: `client/src/renderer/Renderer.ts`

- [x] **Prove the unmodified baseline**

Run `npx tsx scripts/checks/muzzle.mjs` before edits and retain its existing numerical pass receipt.

- [x] **Write the failing structural regression**

Extend `muzzle.mjs` with TypeScript-AST checks for required imports/calls and forbidden client mirror
declarations. Run the focused harness before renderer edits and capture RED caused by current copies.

- [x] **Apply the minimal shared-source refactor**

Import and use `BARREL_LENGTH`, `BARREL_PIVOT_HEIGHT`, and `barrelTip` at the approved call sites.
Delete only the redundant client geometry constants/arithmetic and correct stale ownership comments.

- [x] **Prove GREEN and parity**

Run the focused muzzle harness, `npm run typecheck`, and the pre-existing collision, AI determinism,
and sudden-death harnesses without changing their numerical expectations.

- [x] **Request task review**

Require both spec-compliance and quality approval. The reviewer must confirm that the structural guard
would fail if either renderer returned to a private geometry constant or stopped calling `barrelTip`.

---

### Task 2: Close review and open a green pull request

- [x] **Run whole-diff review and coverage audit**

Zero Critical/Important or CRITICAL/HIGH findings may remain. Coverage must explicitly assess mirror
constant reintroduction, missing shared imports, and call-site drift.

- [x] **Run the complete final matrix**

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

- [x] **Append SMARTS and verification receipts**

Record selection, RED/GREEN evidence, parity, review outcomes, exact test counts, and unchanged
dependency/lockfile state in `.codearbiter/sprint-log.md` without rewriting prior entries.

- [ ] **Run `$ca-commit`**

Stage exact paths only. Classification is `refactor(renderer)` unless review finds a behavioral fix.

- [ ] **Run `$ca-pr` and `$ca-watch`**

Open a PR referencing #153, never merge it, and watch every available check to green.

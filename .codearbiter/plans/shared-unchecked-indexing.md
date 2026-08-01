# Shared Unchecked Indexing Implementation Plan

> **For agentic execution:** Follow this plan sequentially with review checkpoints. Preserve all pre-existing behavioral tests; the TypeScript strictness failure is the primary RED.

**Goal:** Enable `noUncheckedIndexedAccess` for the deterministic shared core and resolve every resulting production finding without changing runtime behavior or deterministic output.

**Architecture:** The stricter option is owned by `shared/tsconfig.json`, keeping this migration isolated from the much larger client/test-fixture surface. Each compiler finding is handled at its owning invariant boundary with an explicit guard, fallback, or null result. Existing harnesses remain the parity oracle.

**Tech Stack:** TypeScript 7 native preview through the existing `tsc` alias, npm workspaces, deterministic `scripts/checks/*.mjs` harnesses, Vitest.

## Global Constraints

- Do not change random draws, ordering, physics, gameplay constants, state/action shapes, or network behavior.
- Do not add a dependency or modify the lockfile.
- Do not enable the option for the client or base config in this cell.
- Avoid broad non-null assertions and casts; make missing-value handling explicit.
- Preserve all pre-existing tests and harness expectations.

---

### Task 1: Enable the shared strictness boundary and resolve foundational lookups

**Files:**
- Modify: `shared/tsconfig.json`
- Modify as required by compiler output: `shared/src/engine/AI.ts`
- Modify as required by compiler output: `shared/src/engine/Tank.ts`
- Modify as required by compiler output: `shared/src/engine/Terrain.ts`
- Modify as required by compiler output: `shared/src/net/replay.ts`

- [x] **Step 1: Record compiler RED**

  Run: `npm -w @singedterra/shared exec tsc -- --noEmit --noUncheckedIndexedAccess`

  Expected: FAIL with the captured 29 shared findings.

- [x] **Step 2: Add the shared compiler option**

  Set `noUncheckedIndexedAccess: true` only in `shared/tsconfig.json`.

- [x] **Step 3: Resolve AI, tank, terrain, and replay findings minimally**

  Add explicit empty/bounds handling while preserving successful-path return values, random-number consumption, terrain output, tank placement, and replay order. Add focused regression tests only where a previously unrepresented missing case becomes reachable.

- [x] **Step 4: Run focused shared typecheck and relevant harnesses**

  Run: `npm -w @singedterra/shared run typecheck`

  Run the affected deterministic harnesses for AI, terrain, movement/placement, and replay.

  Expected: PASS with unchanged behavioral expectations.

### Task 2: Resolve GameEngine findings and prove parity

**Files:**
- Modify as required by compiler output: `shared/src/engine/GameEngine.ts`
- Add a focused shared/client test only if a new guard needs direct behavioral proof

- [x] **Step 1: Classify each GameEngine finding before editing**

  Identify whether each lookup is protected by game configuration, loop bounds, or tournament-state invariants. Choose an explicit guard/fallback that preserves the existing valid-state path.

- [x] **Step 2: Resolve every GameEngine compiler finding**

  Keep turn rotation, winner selection, scoring, and deterministic state transitions byte-for-byte equivalent for valid games. Fail safely for structurally impossible empty cases without inventing state.

- [x] **Step 3: Capture shared GREEN**

  Run: `npm -w @singedterra/shared run typecheck`

  Expected: PASS with `noUncheckedIndexedAccess` read from `shared/tsconfig.json`.

- [x] **Step 4: Run full local verification**

  Run: `npm run check`

  Run: `npm run test:client`

  Run: `npm run build`

  Run: `npm run audit:deps`

  Expected: all PASS.

- [ ] **Step 5: Review, land, deploy, and update issue progress**

  Run one adversarial subagent over the exact package, correct every Critical/High/Medium/merge blocker, pass the codeArbiter commit and PR gates, wait for all exact-head hosted checks, merge only under the separately logged standing merge authority, verify exact deployment provenance plus live smoke, and add a concise issue #70 progress note that the deterministic shared boundary is complete while the client migration remains.

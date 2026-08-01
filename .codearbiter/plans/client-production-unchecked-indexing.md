# Client Production Unchecked Indexing Implementation Plan

> **For agentic execution:** Follow this plan sequentially with review checkpoints. The production compiler failure is the primary RED; preserve all existing behavioral tests.

**Goal:** Enforce `noUncheckedIndexedAccess` across browser production code without mixing 239 test-fixture findings into the same review package.

**Architecture:** A new `client/tsconfig.production.json` extends the current client project, excludes `*.test.ts`, and owns the stricter option. `client/package.json` runs that project plus the unchanged complete compile, so production receives the new guarantee while all test source keeps its existing typecheck coverage.

**Tech Stack:** TypeScript 7 native preview through the existing `tsc` alias, npm workspaces, Vitest, deterministic harnesses, Vite.

## Global Constraints

- Do not alter shared engine behavior, random consumption, render order, gameplay constants, input semantics, network contracts, or Lobby flows.
- Do not add a dependency or modify the lockfile.
- Do not change test fixtures solely for this compiler migration.
- Avoid broad assertions/casts; make empty and out-of-range behavior explicit.
- Keep the original full client compile in the normal typecheck path.

---

### Task 1: Establish the enforced production boundary and close input/rendering findings

**Files:**
- Create: `client/tsconfig.production.json`
- Modify: `client/package.json`
- Modify as required: `client/src/input/InputHandler.ts`
- Modify as required: `client/src/renderer/EffectsRenderer.ts`
- Modify as required: `client/src/renderer/napalmFirelight.ts`
- Modify as required: `client/src/renderer/ProjectileRenderer.ts`
- Modify as required: `client/src/renderer/Renderer.ts`
- Modify as required: `client/src/renderer/ringBuffer.ts`
- Modify as required: `client/src/renderer/terrainEdges.ts`
- Modify as required: `client/src/renderer/TerrainRenderer.ts`
- Modify as required: `client/src/ui/theme.ts`

- [ ] **Step 1: Add the strict production project and capture RED**

  Add the config and `typecheck:production` script, then run it.

  Expected: FAIL with exactly 52 production findings across the classified 11 files.

- [ ] **Step 2: Resolve input and renderer findings minimally**

  Use total access helpers, bounded iteration, explicit empty guards, and neutral presentation fallbacks. Add focused regression tests only where a newly handled malformed input has observable behavior.

- [ ] **Step 3: Run the production strict command and affected renderer/input tests**

  Expected: only the remaining Lobby/view findings, then GREEN after Task 2.

### Task 2: Close Lobby/view findings and prove the additive compiler contract

**Files:**
- Modify as required: `client/src/ui/Lobby.ts`
- Modify as required: `client/src/ui/LobbyCreateView.ts`
- Add a focused test only if a newly reachable malformed/empty case needs direct proof

- [ ] **Step 1: Resolve exact Lobby/view findings without changing flows**

  Guard indexed selections and parsed view data at their owning boundaries; preserve valid roster, garage, and navigation behavior.

- [ ] **Step 2: Capture production GREEN and full-project GREEN**

  Run: `npm -w @singedterra/client run typecheck:production`

  Run: `npm -w @singedterra/client run typecheck`

  Expected: both PASS; the second command still includes all 119 test files under the existing policy.

- [ ] **Step 3: Run full local verification**

  Run: `npm run check`

  Run: `npm run test:client`

  Run: `npm run build`

  Run: `npm run audit:deps`

  Expected: all PASS.

- [ ] **Step 4: Review, land, deploy, and update issue progress**

  Run one adversarial subagent over the exact package, correct every Critical/High/Medium/merge blocker, pass the codeArbiter commit and PR gates, wait for exact-head hosted CI, merge under the separately logged standing authority, verify deployment provenance plus live smoke, and note on issue #70 that only strict test-fixture migration remains.

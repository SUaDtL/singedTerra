# Projectile Renderer Strict Test Fixtures Implementation Plan

> **For agentic execution:** Follow this plan sequentially. The compiler failure is the primary RED; preserve the tests' assertion semantics rather than merely satisfying types.

**Goal:** Enforce `noUncheckedIndexedAccess` for the two projectile renderer suites and establish the reusable strict-test migration seam.

**Architecture:** `client/tsconfig.tests-strict.json` extends the production-strict config, replaces its exclusion with an empty list, and explicitly includes the two migrated suites. Client `typecheck` remains additive: production strict, migrated-test strict, then the unchanged complete compile.

## Global constraints

- No production or shared-engine change.
- No dependency or lockfile change.
- Keep missing fixture data test-fatal; never hide it with optional chaining or fabricated fallback values.
- Do not modify assertions unrelated to exact compiler findings.

### Task 1: Establish the strict-test boundary and capture RED

**Files:**
- Create: `client/tsconfig.tests-strict.json`
- Modify: `client/package.json`

- [ ] Add the explicit two-file strict test project and `typecheck:tests-strict` script.
- [ ] Wire it between production strictness and the unchanged full compile.
- [ ] Run the strict-test command and capture exactly 43 findings: 29 plus 14.

### Task 2: Migrate the two projectile renderer suites

**Files:**
- Modify: `client/src/renderer/ProjectileRenderer.test.ts`
- Modify: `client/src/renderer/ProjectileRenderer.groundShadow.test.ts`

- [ ] Replace unchecked fixture indexing with assertion-backed helpers, destructuring, or explicit guards.
- [ ] Preserve failure quality: absent expected calls or projectiles must fail causally.
- [ ] Run the strict-test project to GREEN.
- [ ] Run both focused suites and confirm unchanged test counts.

### Task 3: Verify, review, land, and deploy

- [ ] Run production strict and the unchanged complete compile.
- [ ] Run `npm run check`, `npm run test:client`, `npm run build`, and `npm run audit:deps`.
- [ ] Run one adversarial subagent over the exact package and correct every Critical/High/Medium/merge blocker.
- [ ] Pass codeArbiter commit/PR gates, exact-head hosted CI, standing-authority squash merge, deployment provenance, and live smoke.
- [ ] Update issue #70 with the reduced measured remainder, then select the next bounded cell.

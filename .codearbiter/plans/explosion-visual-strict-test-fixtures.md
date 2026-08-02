# Explosion Visual Strict Test Fixtures Implementation Plan

> **For agentic execution:** Follow this plan sequentially. Preserve assertion semantics; the compiler failure is the primary RED.

**Goal:** Add the two explosion visual suites to the enforced strict-test set and close their 47 indexed-fixture findings.

**Architecture:** Extend the explicit include list in the existing `tsconfig.tests-strict.json`. Use assertion-fatal local guards inside the two target suites. Normal typecheck remains production strict, migrated tests strict, then the complete compile.

## Global constraints

- No production or shared-engine change.
- No dependency or lockfile change.
- Missing expected render evidence must fail, not become optional.
- Do not modify assertions unrelated to exact compiler findings.

### Task 1: Extend enforcement and capture RED

**Files:**
- Modify: `client/tsconfig.tests-strict.json`

- [ ] Add the two explosion visual suites to the explicit include list.
- [ ] Run `typecheck:tests-strict` and capture exactly 47 new findings: 27 plus 20.

### Task 2: Migrate explosion visual fixtures

**Files:**
- Modify: `client/src/renderer/Renderer.explosionSignatures.test.ts`
- Modify: `client/src/renderer/Renderer.blastLighting.test.ts`

- [ ] Replace unchecked trace indexing with causal guards, tuples, or bounded access.
- [ ] Run strict migrated-test compile to GREEN.
- [ ] Run the two focused suites and preserve all 16 tests.
- [ ] Re-run the full-client strict inventory and prove 149 findings remain with zero migrated-suite findings.

### Task 3: Verify, review, land, and deploy

- [ ] Run normal typecheck, `npm run check`, `npm run test:client`, `npm run build`, dependency audit, and diff checks.
- [ ] Obtain one exact-package adversarial review and correct every Critical/High/Medium/merge blocker.
- [ ] Pass commit/PR gates, exact-head hosted CI, standing-authority squash merge, deployment provenance, and live smoke.
- [ ] Update issue #70 with the measured remainder and select the next bounded cell.

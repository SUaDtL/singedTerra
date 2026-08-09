# World Atmospheric Signatures Plan

**Execution:** resumed sprint; standing approval covers this bounded plan.

## Constraints

- Presentation-only client slice; no engine, replay, network, Supabase, auth, migration, dependency, or gameplay writes.
- Test-first: each behavior must be red before its production implementation.
- Preserve the existing optional requested-world renderer API and legacy prototype seams.
- Do not stage or remove `.codearbiter/open-tasks.md.lock`.

## Tasks

### 1. World profile and deterministic field

- [x] Add RED catalog assertions for immutable, bounded distinct world profiles.
- [x] Add RED field tests for reproducibility, distinct ids, frozen output, and hard count cap.
- [x] Implement the minimal immutable profiles and deterministic bounded field.

### 2. Atmosphere lifecycle and paint paths

- [x] Add RED lifecycle tests for frozen selection, reset, finite arrival, and reduced motion.
- [x] Implement layer selection/reset/advance ownership.
- [x] Add RED motif tests for ember glow, ash flake, and crystal streak paint paths.
- [x] Implement the bounded Canvas paint paths.

### 3. Renderer integration

- [x] Add RED selection and idle-eligibility tests.
- [x] Route the exact selected world to backdrop, terrain, and atmosphere; reset on new game.
- [x] Add RED call-order test and draw/advance after the sky before wind/terrain.
- [x] Repair prototype seam compatibility discovered by the full suite.

### 4. Delivery evidence

- [x] Run baseline `npm install` and `npm run check`.
- [x] Run focused tests, full client test suite, and typecheck.
- [x] Run build, browser validation, diff hygiene, complete local gate, dependency audit, secret scan, and causal mutation checks.
- [x] Assemble an adversarial review package with this spec, plan, sprint evidence, tests, and final diff; resolve both Medium blockers and receive exact-diff CLEAR re-review.
- [ ] Commit/PR/exact-head CI/merge under standing authority; verify Pages deployment and production health.

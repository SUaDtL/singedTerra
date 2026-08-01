# Combat Identity Card Implementation Plan

**Goal:** Make the active custom tank visually unmistakable in combat without enlarging or moving world-space art.

**Architecture:** Add a third render-only preview profile and let the HUD opt into it. Keep player identity and lifecycle logic in HUD, authored assembly in `TankPartArt`, and deterministic battlefield geometry untouched.

## Constraints

- Approved nine-file surface only.
- No asset, dependency, lockfile, engine, renderer-world, input, backend, auth, crypto, migration, workflow, issue, or task-tracker change.
- Preserve thumbnail and spotlight profiles byte-for-behavior, accessible naming, retry invalidation, and single-page layout.

### Task 1: Baseline and RED

- [x] Run focused preview, portrait, tank-part, and HUD-layout tests on the untouched branch.
- [x] Add unit expectations for a 144x80 direct scale-two tactical profile and exact HUD mode selection.
- [x] Add computed-geometry browser expectations for desktop emphasis, compact/coarse bounds, visibility, and zero overflow.
- [x] Observe causal RED while unchanged focused tests remain green.

### Task 2: Minimal implementation

- [x] Add the typed `tactical` profile to `TankLoadoutPreview` without changing existing profiles.
- [x] Request tactical mode from HUD and expand the desktop portrait frame with compact/coarse overrides.
- [x] Pass focused unit, typecheck, and browser matrix gates.

### Task 3: Verify and deliver

- [x] Pass full deterministic, client, Edge, Playwright, coverage, build, audit, secret, Pages-base, and diff gates.
- [x] Clear one adversarial review with every Critical/High/Medium/merge blocker corrected.
- [ ] Commit, PR, exact-head CI, logged merge authority, fresh final-head CI, squash merge, Pages provenance, and live smoke.
- [ ] Immediately select the next highest-value safe cell under the standing goal.

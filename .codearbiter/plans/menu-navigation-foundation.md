# Command Menu Navigation Foundation Plan

**Execution:** `ux.menu.0001` under standing approval.

## Constraints

- Client UI only. No engine, replay, network, Supabase, Auth, migration, dependency, or gameplay-rule change.
- Keep Fire, weapon selection, Store entry, and Arsenal direct combat surfaces.
- Menu must never pause the simulation or suppress Realtime updates.
- Work test-first and preserve the existing modal-layer accessibility conventions.

## Tasks

### 1. Describe the menu state at its observable boundary

- [ ] Add RED HUD tests for both Menu entry points, named Command Menu hierarchy, primary Resume, separated Return to Lobby, and tutorial replay availability.
- [ ] Add RED tests for Store-close-on-open, single active voluntary modal, and focus restoration.

### 2. Implement the smallest navigation foundation

- [ ] Add explicit menu trigger ownership and focus return state.
- [ ] Rename and restructure the existing pause modal into Command Menu without changing callback contracts.
- [ ] Close optional Store state before presenting Command Menu; preserve current lockstep-safe render/update behavior.

### 3. Verify responsive player interaction

- [ ] Add real-browser desktop, landscape-touch, and small-window geometry/interaction coverage.
- [ ] Update player and UI-system docs with the menu hierarchy and non-pausing constraint.

### 4. Deliver

- [ ] Run focused and full client tests, typecheck, build, deterministic gate, dependency audit, secret scan, and browser tests.
- [ ] Send the spec, plan, sprint log, tests, and exact final diff to one adversarial reviewer; resolve all blockers and re-review the exact corrected diff.
- [ ] Commit, open PR, verify exact-head hosted CI, merge under standing authority, deploy Pages, verify production health, and record the receipt.

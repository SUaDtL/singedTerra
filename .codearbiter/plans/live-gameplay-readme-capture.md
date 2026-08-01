# Live Gameplay README Capture Plan

**Goal:** Refresh the public repository hero with an exact, current production gameplay frame.

**Architecture:** Treat the screenshot as a documentation artifact. Capture the already-deployed deterministic hot-seat view in an ephemeral browser, dismiss its splash and one-time coach through existing UI, validate dimensions and visible HUD landmarks, optimize without altering composition, and change only its README description.

## Constraints

- Approved six-file surface only.
- No runtime, test, dependency, lockfile, backend, auth, crypto, migration, workflow, issue, or task-tracker change.
- Do not launch a localhost; production is already proven at the target SHA.
- Do not alter production data or persist browser state.

### Task 1: Baseline and capture

- [x] Record the replaced asset hash, dimensions, and visible stale portrait state.
- [x] Capture production at 1440x720 through `?e2e=hotseat` after dismissing the splash and one-time coach.
- [x] Optimize to bounded JPEG size and update the README alternative text.

### Task 2: Verify

- [x] Prove exact dimensions, valid decode, bounded file size, and README reference.
- [x] Inspect the rendered artifact for full single-page composition, current tactical portrait, barrel alignment, and absence of overlays/clipping.
- [x] Pass build, Markdown/link hygiene, secret scan, and diff gates.

### Task 3: Review and deliver

- [x] Clear one adversarial review with every Critical/High/Medium/merge blocker corrected.
- [ ] Commit, PR, exact-head CI, logged merge authority, fresh final-head CI, squash merge, Pages provenance, and live smoke.
- [ ] Immediately select the next highest-value safe cell under the standing goal.

# Active tank identity portrait implementation plan

## Task 1: Pin the identity contract in RED

- [x] Add focused HUD coverage for one portrait, exact mixed-loadout labeling,
  repaint stability, handoff repainting, and stale-identity clearing.
- [x] Extend production-browser coverage with portrait containment,
  recognizable rendered size, and no-scroll assertions for every supported
  viewport.

## Task 2: Build the portrait

- [x] Add the authored preview canvas to the active-turn identity row.
- [x] Reconcile color/loadout signatures without per-frame canvas repainting.
- [x] Add accessible part vocabulary and responsive visual framing.

## Task 3: Review, verify, and deliver

- [x] Inspect every supported viewport and resolve one adversarial review.
- [x] Run the complete local gate, commit, open a stacked ready PR, and prove
  exact-head hosted CI/CodeQL.

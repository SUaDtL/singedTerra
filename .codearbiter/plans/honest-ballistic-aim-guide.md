# Honest Ballistic Aim Guide Implementation Plan

## Task 1: Pin the straight-laser defect in RED

- [x] Replace the all-samples-coaxial unit contract with failing physics-parity
  tests for muzzle tangency, fixed-step gravity/wind curvature, bounded reach,
  tick ceiling, and first-contact truncation.
- [x] Add failing Renderer tests for a monotonically fading segmented curve with
  no endpoint marker.
- [x] Add failing production-browser acceptance for right- and left-facing
  authored-barrel continuity plus visible bounded curvature.

## Task 2: Build the bounded honest trajectory

- [x] Simulate the short preview from shared launch and step primitives using
  live wind, effective gravity, terrain, tanks, and wall mode.
- [x] Preserve the exact muzzle, add the zero-time tangent interpolation sample,
  cap traveled reach to the existing formula, and stop at the first swept
  contact or fourteen ticks.
- [x] Render distance-faded curve segments and beads without a solid laser or
  landing marker.

## Task 3: Prove player-facing behavior

- [x] Verify aim, power, wind, normal/sudden-death gravity, local ownership, the
  persisted `G` toggle, and turn handoff.
- [x] Verify both authored barrel directions, every viewport project, no page
  scrolling, and no HUD/canvas regression.

## Task 4: Review, verify, and deliver

- [x] Resolve all Critical, High, gameplay, rendering, accessibility,
  performance, security, and coverage findings.
- [x] Run focused tests, root checks, client coverage, Edge tests, production
  build, full E2E, runtime audit, diff hygiene, and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Prove exact-head hosted CI and CodeQL green, merge under standing
  authority, deploy Pages, verify the public guide, and continue the sprint.

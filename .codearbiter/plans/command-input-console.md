# Command Input Console Implementation Plan

## Task 1: Pin correctness and presentation defects in RED

- [x] Add HUD unit contracts for the five icon-led keyboard commands, exact key
  hints, explicit touch identities/names, and causal signed callback deltas.
- [x] Add production-browser contracts for command-deck hierarchy, overlay
  placement, 44-pixel touch targets, visible angle/power changes, and fitted
  viewport geometry.

## Task 2: Build the unified command system

- [x] Extend the explicit icon seam with bounded command glyphs and rebuild the
  desktop legend as a semantic command deck.
- [x] Move the coarse-pointer controls from the narrow rail into a responsive
  upper-left touch dock and strengthen their visual/interaction states.
- [x] Correct touch aim direction while preserving repeat timing, power,
  weapon-cycle, local-control, and reduced-motion behavior.

## Task 3: Review, verify, and deliver

- [x] Inspect every viewport and resolve one adversarial review.
- [ ] Run the complete local gate, commit, open a ready PR, and prove exact-head
  hosted CI/CodeQL.
- [ ] Merge, deploy, verify the public desktop deck and mobile dock, then
  continue the sprint.

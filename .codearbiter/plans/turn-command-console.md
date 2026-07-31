# Turn Command Console Implementation Plan

## Task 1: Pin the current fragmentation in RED

- [x] Add failing unit tests for one semantic command-console wrapper containing
  identity/progress, weapon, fuel/movement, Store, and Fire.
- [x] Add failing unit tests for weapon-glyph synchronization, split
  direction/keycap markup, and accessible fuel progress updates.
- [x] Add failing browser acceptance for complete maximum-length player and
  longest-weapon labels, console containment, target sizes, and zero scroll.

## Task 2: Build the coherent console

- [x] Recompose the existing active row, progress strip, and action row into one
  persistent command-console region without changing callback ownership.
- [x] Add the selected weapon glyph, directional movement markup, and bounded
  accessible fuel meter driven from authoritative state.
- [x] Establish one visual hierarchy for identity, tactics, economy, and the
  primary Fire action using the existing design tokens and icon catalog.

## Task 3: Fit and prove live behavior

- [x] Tune standard, compact, coarse-pointer, and expanded-Arsenal layouts
  without flex crush, ellipsis, overlap, or page/HUD scroll.
- [x] Prove movement spends fuel and updates the meter without ending the turn;
  weapon changes update glyph/name/Fire; Fire commits exactly one live shot.
- [x] Preserve focus order, visible focus, atomic announcements, disabled
  states, touch target minimums, and reduced-motion behavior.

## Task 4: Review, verify, and deliver

- [x] Resolve all Critical, High, gameplay, rendering, accessibility,
  performance, security, and coverage findings.
- [x] Run focused tests, deterministic checks, client coverage, Edge tests,
  production build, full E2E, runtime audit, diff hygiene, and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Prove exact-head hosted CI and CodeQL green, merge under standing
  authority, deploy Pages, and verify the public command console.

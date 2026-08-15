# Shot Commitment Loop Implementation Plan

**Goal:** Turn the decision-time commitment region into a truthful, readable
shot card without changing how a salvo is simulated or submitted.

**Architecture:** `battleCommandStateFor` remains the pure source of the
already-selected firing values. `HUD` projects those values into a semantic
four-field card only while its commitment phase is `decision`; existing phase
presentation continues to own all post-Fire states. Browser geometry verifies
the rendered result rather than relying on DOM presence alone.

**Constraints:** one enabled Fire action; no predictive telemetry; no
engine/network/Auth/schema/Edge/protocol/award/dependency change; TDD and
desktop/compact/Pixel browser proof required.

## Task 1: Render and retire the factual decision card

- [x] Add a RED pure projection assertion for sign-correct selected weapon,
  angle, power, and wind copy; run
  `npm -w @singedterra/client run test -- src/ui/battleCommandState.test.ts`
  and observe the missing decision explanation.
- [x] Implement the minimal decision projection in
  `client/src/ui/battleCommandState.ts`; reuse the current firing values and
  render wind to one decimal rather than raw floating-point precision.
- [x] Add a RED HUD-shell assertion for a missing `[data-ui="shot-readback"]`
  section, then build a labeled four-field `dl` in `client/src/ui/HUD.ts` and
  synchronize it only in the `decision` phase.
- [x] Prove the card hides after the real primary action enters submission and
  that no second Fire action exists.
- [x] Run focused client tests and strict typecheck GREEN.

## Task 2: Prove responsive live composition

- [x] Extend `e2e/hud-layout.spec.ts` to assert the live card, its semantic
  label, its real Arsenal-driven weapon update, and its containment plus
  pairwise item separation.
- [x] Run the exact desktop, compact, and Pixel browser contract with
  `npx playwright test e2e/hud-layout.spec.ts --grep "turn command console is coherent" --workers=2`.
- [x] Run the complete local regression matrix: client 163 files / 1,620
  tests, deterministic checks, Edge 352/352, and Playwright 325 passed / 38
  profile-gated skips. Resolve the compact First Salvo coach containment and
  delayed briefing-fixture race found by that matrix without weakening either
  browser contract.
- [x] Give the spec, plan, sprint log, tests, and exact diff to an adversarial
  reviewer; resolve every Critical, High, and merge-blocking finding. The
  reviewer required a precise First Salvo ownership exception; the all-profile
  journey now proves the decision card hides at step 3 and returns after Skip.
- [ ] Commit, open a PR, require exact-head CI/CodeQL/Pages, verify the Pages
  deployment, and capture a bounded production smoke receipt before acceptance.

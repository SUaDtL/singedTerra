# First Strike Tactical Objective Plan

**Initiative:** `career.initiative.0001`
**Spec:** `.codearbiter/specs/first-strike-objective.md`
**Status:** approved under standing continuous-improvement authority

## File structure

- Create `client/src/client/firstStrikeObjective.ts`: pure verified-duel
  objective state machine; consumes settled human-salvo damage facts and the
  human transcript count, then produces public presentation data.
- Create `client/src/client/firstStrikeObjective.test.ts`: causal state-machine
  tests for hit, delayed third-shot resolution, miss, and inactive paths.
- Modify `client/src/main.ts`: instantiate/reset the objective with a verified
  deployment, observe settled state, and supply public presentation to HUD.
- Modify `client/src/ui/HUD.ts` and focused HUD tests: render a non-actionable
  objective status and a non-focusable terminal result in the report.
- Modify `client/src/ui/Lobby.ts` and its view tests: place the static objective
  brief in authenticated Verified Deployment and Commander Dossier surfaces.
- Modify production-browser coverage for desktop, compact, and touch launch,
  terminal result, focus, and ordinary-mode absence.

## Task 1: Define the deterministic objective seam

- [x] Write a failing `firstStrikeObjective` test that sends three human salvos
  through facts representing an unresolved third fire, then a settled third
  human-salvo damage result; expect `active` before resolution and `achieved`
  after it.
- [x] Add RED cases for first/second-shot hit, three settled misses, terminal
  third-shot hit, a resumed transcript count, and every non-verified or
  casual-continued input.
- [x] Implement the smallest pure reducer with explicit success-before-miss
  precedence and no storage, transport, or engine mutation.
- [x] Run the focused reducer suite GREEN and mutation-check the third-shot
  resolution predicate and success precedence.

## Task 2: Compose the objective through deployment and combat

- [x] Write main/Lobby/HUD RED tests for signed-in brief/dossier copy, active
  status, achieved/missed terminal report text, no extra report action, and
  ordinary-mode absence.
- [x] Wire a fresh/resumed verified deployment to a new reducer session;
  observe the existing controller's transcript count plus its local settled
  human-salvo damage projection on state change; retire it on casual
  continuation or teardown.
- [x] Render only the public text in the existing HUD/report hierarchy and keep
  focus on the existing primary report action.
- [x] Run focused composition tests GREEN and strict typecheck.

## Task 3: Prove real-browser player outcomes

- [x] Add desktop and Pixel touch coverage that launches the
  authenticated verified brief, observes the objective, and verifies report
  focus/action parity; add ordinary-mode absence coverage.
- [x] Run desktop, compact, and touch browser coverage plus the full client
  suite.
- [x] Run the deterministic suite GREEN.
- [x] Package the spec, plan, evidence, tests, and exact diff for adversarial
  review; resolve every Critical, High, and merge-blocking finding before the
  commit/PR/deploy/production sequence.

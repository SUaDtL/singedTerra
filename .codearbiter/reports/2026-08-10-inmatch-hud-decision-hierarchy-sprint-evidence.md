# In-match HUD decision hierarchy sprint evidence

## Scope and authority

- Task: `ux.hud.0001`
- Spec: `.codearbiter/specs/inmatch-hud-decision-hierarchy.md`
- Plan: `.codearbiter/plans/inmatch-hud-decision-hierarchy.md`
- Bounded spec and plan approved under the user's standing continuous-improvement authority.
- Source: unresolved P1 battle-UI hierarchy finding in the persisted adversarial player-experience audit.

## SMARTS decision

- Options: state-responsive focus; compact-touch-only rail collapse; move to the lower-ranked mobile entry handoff.
- Verdict: state-responsive focus.
- Strength/confidence: strong/high.
- Reason: the current HUD already has a coherent decision console and live progress strip, so changing emphasis by game state addresses the report without removing information, changing controls, or introducing a separate mobile-only model.

## Baseline

- Base: `ec7f5069840065a4bd0abfbbe086d110b750f00b`.
- `npm install`: 145 packages installed, 0 vulnerabilities; no manifest or lockfile change.
- Public desktop and landscape-touch screenshots confirmed the same active decision emphasis remains present before and after a shot state would begin; no production files changed during the audit.

## Task 1 RED

- Focused unit: `npm -w @singedterra/client run test -- HUD.combatFocus.test.ts` exited 1 with 1 failed file and 9/9 expected failures. The focus attributes were absent and outcome command surfaces had no `aria-disabled` state.
- Production browser: built the unchanged production implementation, served the owned bundle on port 4174, and ran the causal Fire test across all projects. It exited 1 with 3/3 expected failures because `#hud` had no `data-combat-focus="decision"` in desktop-fine, pixel-touch, or small-window.
- The unrelated listener on port 4173 was not reused or stopped.

## Task 1 GREEN

- `HUD.update()` now derives `decision|outcome|terminal` only from phase plus the pending-fire flag and synchronizes `data-combat-focus` on `#hud` and `#game-overlay`.
- Outcome keeps the visible polite live progress status while individual native and ARIA-disabled combat controls remain the source of truth.
- HUD-owned CSS places progress first and gives it full emphasis while demoting instruments, actions, roster, arsenal, and fine/touch command decks. It uses no transitions, reparenting, or input/gameplay changes.
- Focused unit: 1 file passed, 9/9 tests passed.
- Production build: exit 0; shared/client typechecks and Vite production build passed.
- Full browser guardrail: `npx playwright test e2e/hud-layout.spec.ts` against the owned 4174 production preview passed 55 tests with 20 intentional project skips across desktop-fine, pixel-touch, and small-window. The causal test ran with reduced motion and restored decision focus after outcome.

## Mutation proof

- Removed the `syncCombatFocus` transition call: focused unit exited 1 with 9/9 failures, including decision/outcome/terminal mapping, ARIA state, and restoration.
- Removed outcome `order` and opacity declarations: the causal browser test exited 1 with 3/3 project failures at the computed order assertion (`progress order 0` was not less than `instruments order 0`).
- Both mutations were restored before the final focused unit, production build, and full browser run.

## Adversarial-review correction

- Reviewed staged diff hash: `222242f8759d71b47592ac730a61f40999470f57`.
- Verdict: no Critical or High findings; two Important merge blockers and one Medium finding.
- Important 1: `aria-disabled` on the mixed command-console and touch-toolbar parents falsely described the still-enabled Store and Menu controls as unavailable.
- Important 2: outcome opacity on parent containers compounded with disabled/dead child opacity, reducing effective visibility to roughly 0.14-0.17 in the worst paths while the browser assertion could still pass at zero opacity.
- Medium: terminal focus used `aria-disabled="false"` on the mixed parents even though their combat controls were inactive.

### Correction RED

- Focused unit: 1 file ran 10 tests; 3 failed as expected. Outcome, restored decision, and terminal cases all observed the stale parent `aria-disabled` values instead of accurate mixed-region semantics.
- Production browser: the strengthened real-Fire test failed 3/3 projects as expected because both mixed parents retained `aria-disabled`; the failure occurred before the new effective-opacity assertions.
- Tests independently require dynamic decision/outcome/terminal labels, semantically enabled Store/Menu utilities, no disabled state on mixed parents, no alpha demotion on parent surfaces, minimum effective opacity for disabled combat controls and player rows, readable arsenal and available utilities, non-alpha visual demotion, and progress priority.

### Correction GREEN

- `syncCombatFocus` removes parent `aria-disabled` and provides state-accurate dynamic labels. Outcome and terminal labels distinguish inactive combat controls from the available Store/Menu utilities; decision labels restore the normal command names.
- Outcome demotion now uses authored `saturate(...) brightness(...)` filters only. Parent opacity stays at 1, preserving existing child disabled/dead treatments and information readability; no transition was added.
- Focused unit: 1 file, 10/10 passed.
- Production build: exit 0; shared and client typechecks plus Vite production build passed.
- Full production HUD guardrail against the owned port-4174 preview: 55 tests passed with 20 intentional profile-specific skips across desktop-fine, pixel-touch, and small-window.

### Correction mutation proof

- Reintroduced parent `aria-disabled` semantics: the focused unit failed 3/10 cases on outcome, decision restoration, and terminal semantics.
- Reintroduced the reviewed parent alpha demotion: the causal browser test failed 3/3 projects, reporting parent opacity values `0.42, 0.42, 0.38, 0.38, 0.38, 0.38` instead of six opaque parent surfaces.
- Both mutations were restored before the final focused unit, production build, and full browser run.

## Final local verification

- `npm run check`: exit 0 after 124.9 seconds; typechecks and every deterministic engine/check harness passed.
- `npm run coverage:client`: exit 0; the complete client coverage lane passed.
- `npm run check:edge`: exit 0; 267 Edge Function tests passed with 0 failures and Deno type-checking passed.
- `npm run audit:deps`: exit 0; npm reported 0 vulnerabilities.
- Production build with bounded non-secret test values: exit 0; shared/client typechecks and Vite build passed.
- Full production HUD guardrail against the owned port-4174 preview: 55 applicable tests passed and 20 profile-specific tests skipped as designed across desktop-fine, pixel-touch, and small-window.
- Rendered outcome screenshots from all three profiles were inspected: progress remained contained and prominent, the decision surfaces receded without disappearing, and no overlap, clipping, or page reflow was visible. The temporary screenshot-only test instrumentation and artifacts are not part of the diff.
- One first screenshot rerun accidentally targeted the unrelated port-4173 listener and failed before finding the HUD. It was diagnosed as a harness URL mismatch, not counted as implementation evidence, and rerun against the owned port-4174 preview; the unrelated listener was never reused or stopped.
- `$ca-preview` reviewed the complete unstaged/untracked file set, predicted `coverage-auditor` from the `HUD.ts` source change, found no secret candidates, and proved git status remained unchanged.

## Final adversarial review

- Initial staged-diff review found and blocked the three issues documented above.
- Corrected staged-diff hash `ade8eb4a6d0aa2f67579b3209a9c7e9092df4ee2` was independently verified by the same reviewer.
- Re-review verdict: both Important blockers and the Medium terminal-semantics finding are resolved; no Critical, High, Important, or merge-blocking finding remains.
- Three non-blocking Medium test-strengthening ideas remain. First, parse and bound computed `saturate()` and `brightness()` values so neutral or zero-brightness mutations cannot satisfy token-presence assertions. Second, assert restored decision-state filter and order values after outcome instead of relying only on focus attributes, labels, and identity visibility. Third, compare progress geometry against sibling instruments/actions so an absolute-position overlap mutation cannot pass containment alone. Existing causal, effective-opacity, parent-opacity, authored-filter, visual, and mutation evidence is sufficient for this slice; all three are recorded for the next appropriate HUD-test strengthening pass.
- After the implementation verdict, the task board was changed from in-progress to done and this final review record was added. The reviewer receives that documentation-only delta with the final staged diff.

## Exact corrected-state gates

- On the corrected staged implementation, `npm run check` exited 0 after 93.6 seconds.
- On the same state, `npm run coverage:client`, `npm run check:edge` (267 passed, 0 failed), and `npm run audit:deps` (0 vulnerabilities) all exited 0.
- The correction worker's production build and complete HUD browser run passed as documented above; controller-focused unit verification passed 10/10.
- `$ca-pr` coverage audit passed with no Critical, High, or BLOCK finding and produced the three non-blocking Medium strengthening ideas recorded above.

## Assignment boundary

- No commit or push performed.
- Broad plan gates, review, landing, hosted CI, merge, and deployment remain outside this direct Task 1 assignment.

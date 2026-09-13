# P02 implementation plan

## Acceptance ledger

| ID | Criterion |
| --- | --- |
| AC-01 | P02-AC1 deterministic First Salvo versus Standard projection |
| AC-02 | P02-AC2 unseen-preference chooser route and disclosure |
| AC-03 | P02-AC3 returning chooser and rejoin precedence |
| AC-04 | P02-AC4 generated-seed introductory launch and unchanged Standard launch |
| AC-05 | P02-AC5 strict v1 preservation and optional v2 timing validation |
| AC-06 | P02-AC6 explicit no-telemetry and pending-human-evidence documentation |

Intent backstop: the bounded scope is covered by AC-01 through AC-06. If every criterion passes, no in-scope behavior remains untested; human outcomes remain expressly outside automated acceptance.

## Tasks

| ID | Paths | Verification | Maps to | Covers | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | `client/src/client/quickOperations.test.ts`, `client/src/ui/firstSalvoCoach.test.ts` | `npm -w @singedterra/client exec vitest run src/client/quickOperations.test.ts src/ui/firstSalvoCoach.test.ts` | O-01, O-02 | AC-01, AC-02, AC-03 | — | COMPLETE |
| T-02 | `client/src/ui/LobbyShellView.test.ts`, `client/src/ui/Lobby.quickDuel.test.ts` | `npm -w @singedterra/client exec vitest run src/ui/LobbyShellView.test.ts src/ui/Lobby.quickDuel.test.ts` | O-03, O-04 | AC-02, AC-03, AC-04 | T-01 | COMPLETE |
| T-03 | `scripts/checks/manual_baseline.test.mjs` | `node --test scripts/checks/manual_baseline.test.mjs` | O-05 | AC-05 | — | COMPLETE |
| T-04 | `client/src/client/quickOperations.ts`, `client/src/ui/firstSalvoCoach.ts`, `client/src/ui/LobbyShellView.ts`, `client/src/ui/Lobby.ts` | focused client checks in T-01/T-02 | O-01–O-04 | AC-01–AC-04 | T-01, T-02 | COMPLETE |
| T-05 | `scripts/product-evidence/manualBaseline.mjs`, `docs/product-evidence/p01-manual-observation-template.md`, `docs/product-evidence/p01-manual-report-template.md` | manual-baseline check and document review | O-05, O-06 | AC-05, AC-06 | T-03 | COMPLETE |
| T-06 | `e2e/ordinary-guest-journey.spec.ts`, all P02 paths | Parent-owned ordinary splash-to-first-shot browser execution; `npm run test:client`, `node --test scripts/checks/manual_baseline.test.mjs`, `npm run typecheck` | O-01–O-06 | AC-01–AC-06 | T-04, T-05 | COMPLETE |

MVP slice: T-01 through T-05. T-06 verifies the completed slice. The parent integrated P03 into this worktree and owns the final build, browser proof, commit, and PR. Production publication remains a separate approval.

## TDD obligation ledger

- O-01 · AC-01 · OPEN
- O-02 · AC-02/AC-03 · OPEN
- O-03 · AC-02 · OPEN
- O-04 · AC-04 · OPEN
- O-05 · AC-05 · OPEN
- O-06 · AC-06 · OPEN

## Completion evidence

The original Terra/high author ran causal client and manual-schema RED checks before implementation: missing First Salvo catalog/CTA/filtering and rejected p02 schema/doc expectations. Its final four-file focused suite passed 37 tests, offline checks passed 11, and full client passed 1,934. The preserved author source is stash `06ec6e136e60e61d381ffb366f8b525eb1d078b9`; original session `01a098ae-befe-78f3-ac59-05561e01a3b3` retains the RED output and corrections.

Parent integration preserves foundations `3b6b346` and P03 `05b2bf1`. The final review adds causal projection, exact launch, returning-instance, unreadable-preference, v2 aggregation, and human-evidence boundary regressions. Combined coverage run passes 208 files and 1,946 tests (94.12% lines; 84.24% branches); offline checks pass 12. Browser proof passes 41 cases with four existing profile-specific skips, including all three untouched-entry First Salvo real-shot paths and all 18 P03 practice cases. See `../reports/product-v2-p02-evidence.md` for binding, independent review, limitations, and final gates.

The pre-existing complete browser storage-getter failure is outside the First Salvo preference-read guarantee and was harvested to the task board. The product experiment is incomplete until consented human observations support understanding/replay claims; the optional timing schema does not identify the selected route.

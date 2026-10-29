# Post-match progression milestone implementation plan

**Status:** in progress under the standing improvement-goal authority
**Date:** 2026-08-10
**Task:** `mvp2.progression.0008`

## Task 1: Pin the trusted receipt contract RED

- [x] Add focused AccountSession tests proving an accepted result returns only a freshly advanced validated summary and suppresses stale or unavailable refresh state.
- [x] Add reporter/composition tests proving the refreshed summary and win flag reach the active victory report once, while stale game generations remain suppressed.
- [x] Add HUD tests for exact win/non-win XP and next-level milestone text, semantic live status, reset, and compact containment.
- [x] Run the focused tests and preserve the expected RED failures before implementation.

## Task 2: Implement the smallest client-only handoff

- [x] Return the freshly advanced account summary from the existing result-recording path without changing backend authority.
- [x] Carry one typed progression receipt through Lobby, the hot-seat reporter, and main composition.
- [x] Replace the generic acknowledgement with earned XP and the next level milestone; hide it when no trustworthy refreshed summary exists.
- [x] Keep the existing generation, mode, AI, E2E, duplicate, and focus/isolation guards unchanged.

## Task 3: Prove behavior and presentation

- [x] Run focused GREEN tests.
- [x] Mutate win XP, non-win XP, next-level arithmetic, stale-refresh suppression, and generation guards; require the tests to fail for each mutation.
- [x] Run full client, Edge, deterministic harness, typecheck/build, dependency, secret, migration, and browser matrix checks.
- [x] Inspect desktop and compact/touch victory reports for containment and hierarchy.

## Task 4: Review and deliver

- [ ] Generate an exact final package containing this spec, plan, sprint evidence, tests, mutations, and full staged diff.
- [ ] Give one adversarial subagent the exact package and resolve every Critical, High, Medium/Important, accessibility, responsive, interaction, governance, and merge-blocking finding.
- [ ] Commit only after fresh security/migration passes and the commit gate.
- [ ] Open the PR through the sanctioned PR lane; require exact-head CI, CodeQL, and reviewer status green before merge.
- [ ] Merge under standing authority, verify exact-main Pages provenance and production health, then persist a delivery receipt and select the next SMARTS improvement.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current casual/verified trust split. Current source/oracles: `client/src/client/AccountSession.ts`, `client/src/ui/HUD.victoryReport.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `769d6c7f420f` (feat(progression): name the next level milestone). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

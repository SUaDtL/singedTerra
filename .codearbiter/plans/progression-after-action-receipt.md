# Progression After-Action Receipt Plan

**Execution:** `mvp2.progression.0007` under standing approval.

## Constraints

- Client presentation and existing result callback wiring only. No Auth contract, Supabase, migration, persistence, XP formula, dependency, engine, or action-protocol change.
- The receipt must mean only that the existing server-confirmed match record completed. Never calculate or display client-owned XP.
- Preserve the victory report's two-action focus loop and reset receipt state between games.
- Work test-first. Keep the canonical sprint log byte-for-byte preserved under the established H-05 encoding control.

## Tasks

### 1. Prove the trusted receipt boundary

- [ ] Add a RED `hotSeatProgression` regression that success delivery emits one receipt result, while false and rejected delivery do not.
- [ ] Keep the one terminal frame, local human seat, and fixture exclusions causal in the test.

### 2. Surface the bounded receipt

- [ ] Add a RED HUD victory-report test for a polite, noninteractive receipt that does not join the focus loop and clears on exit.
- [ ] Add a RED `main` composition test that forwards a successful local result only for its active session.
- [ ] Implement the minimal reporter callback, guarded main wiring, and HUD receipt state.

### 3. Verify and deliver

- [ ] Run focused reporter, HUD, and main coverage; then the relevant browser, client, type, deterministic, build, audit, diff, and secret gates.
- [ ] Give one adversarial reviewer the spec, plan, current sprint log, tests, and exact diff. Resolve all Critical, High, and merge-blocking findings before exact-head PR CI and guarded delivery.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current trusted receipt boundary. Current source/oracles: `client/src/client/hotSeatProgression.ts`, `client/src/ui/HUD.victoryReport.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `0803dc2ae83f` (feat(progression): acknowledge recorded hot-seat matches (#355)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

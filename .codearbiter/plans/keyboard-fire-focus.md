# Plan: Keyboard Fire After HUD Focus

- [x] Add unit RED coverage for a focused non-fire HUD button and preserve the dedicated Fire, text-entry, and focused-Enter contracts.
- [x] Make the smallest `InputHandler` key-specific guard change: allow Space keys through non-text HUD buttons, while excluding the dedicated Fire control from global handling to prevent duplicate activation; retain native Enter behavior for focused controls.
- [x] Add browser acceptance coverage that clicks a gameplay HUD control, verifies focus remains there, fires with Space, and proves semantic Fire activation is exactly once.
- [x] Run the complete local gates, package the spec/plan/sprint log/tests/diff for final adversarial review, and resolve all merge-blocking findings.
- [ ] Use exact-head hosted checks and normal delivery/health verification.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current input owner. Current source/oracles: `client/src/input/InputHandler.ts`, `client/src/input/InputHandler.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `c40e0b7517ac` (fix(input): preserve Space fire after HUD focus). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

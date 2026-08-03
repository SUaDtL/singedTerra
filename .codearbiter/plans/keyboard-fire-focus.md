# Plan: Keyboard Fire After HUD Focus

- [x] Add unit RED coverage for a focused non-fire HUD button and preserve the dedicated Fire, text-entry, and focused-Enter contracts.
- [x] Make the smallest `InputHandler` key-specific guard change: allow Space keys through non-text HUD buttons, while excluding the dedicated Fire control from global handling to prevent duplicate activation; retain native Enter behavior for focused controls.
- [x] Add browser acceptance coverage that clicks a gameplay HUD control, verifies focus remains there, fires with Space, and proves semantic Fire activation is exactly once.
- [x] Run the complete local gates, package the spec/plan/sprint log/tests/diff for final adversarial review, and resolve all merge-blocking findings.
- [ ] Use exact-head hosted checks and normal delivery/health verification.

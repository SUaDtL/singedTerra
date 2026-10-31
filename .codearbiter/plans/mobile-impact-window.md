# Mobile Impact Window Implementation Plan

**Goal:** Restore a meaningful cinematic impact window on compact mobile layouts while preserving the desktop monitor contract.

**Architecture:** `impactMonitor.ts` will own a named compact geometry profile selected from an explicit presentation input. `Renderer` passes compact presentation state without touching engine state. `ImpactMonitorPainter` continues to paint one reusable atomic composite.

## Constraints

- Presentation only. Do not change gameplay, determinism, network, HUD input, auth, persistence, Supabase, migrations, or dependencies.
- Desktop and reduced-motion contracts remain intact.
- Do not read or edit `.codearbiter/sprint-log.md` (H-05).
- Preserve unrelated dirty worktrees and leave generated task-board locks untracked.

### Task 1: Pin compact physical impact visibility

**Files:**
- Modify: `e2e/impact-monitor.spec.ts`
- Modify: `client/src/renderer/Renderer.impactMonitor.test.ts`

- [x] Add a failing browser assertion that derives the real rendered impact frame from the game canvas and requires compact width and height floors after stage zoom.
- [x] Add a failing renderer assertion for the compact physical frame while keeping the current desktop profile exact.
- [x] Run focused tests and record the pre-fix compact frame dimensions (127.6px at synthetic 0.58 scale; 161.15px on Pixel at the initial 1.5 cap).

### Task 2: Select compact geometry in the renderer

**Files:**
- Modify: `client/src/renderer/impactMonitor.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Modify: `client/src/renderer/Renderer.impactMonitor.test.ts`

- [x] Add a presentation-only compact geometry selector with bounded source and frame rectangles.
- [x] Pass compact state from the renderer without changing burst selection, world offsets, or painter ordering.
- [x] Run focused geometry, painter, and renderer tests until green.

### Task 3: Verify player-visible behavior

**Files:**
- Test: `e2e/impact-monitor.spec.ts`
- Test: `client/src/renderer/impactMonitorGeometry.test.ts`
- Test: `client/src/renderer/Renderer.impactMonitor.test.ts`

- [x] Run the production-bundle impact monitor test across desktop, Pixel touch, and small-window projects.
- [x] Verify compact physical frame floors and desktop invariance together.
- [x] Run full client tests, deterministic harness, production build, dependency audit, secret scan, and diff check.

### Task 4: Governed delivery

- [x] Mark `ux.impact.0001` done via `taskwrite.py` only after implementation and evidence are complete.
- [x] Give an adversarial reviewer the spec, plan, H-05 exception, test evidence, and exact final diff; resolve every blocker.
- [ ] Commit, PR, exact-head CI, merge, Pages deployment, and live provenance receipt.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `client/src/renderer/impactMonitor.ts`, `client/src/renderer/Renderer.impactMonitor.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `e68a7add2685` (fix(renderer): restore readable compact impact window). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

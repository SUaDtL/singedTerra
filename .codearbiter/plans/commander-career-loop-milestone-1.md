# Commander Career Loop — Milestone 1 Plan

**Status:** in progress under standing initiative approval
**Date:** 2026-08-10
**Initiative:** `career.initiative.0001`

## Goal

Ship the verified-only career identity boundary before battle, honest casual progression feedback after battle, and a bounded shared-engine replay proof that can support later verified awards.

## Architecture

Create a pure career-rank presentation model that consumes only a validated level. Extend the existing trusted hot-seat record result to carry immutable prior/current progression summaries after exact-delta verification. `AccountPanelView` consumes the pure model for the pre-game dossier; `HUD` consumes the same model and trusted receipt for the After Action Report. Existing account, result-recording, modal, and gameplay ownership remain unchanged.

## Constraints

- Work test-first; no production implementation before causal RED tests.
- Rank is recognition only. Do not gate or alter tanks, weapons, worlds, modes, economy, or simulation.
- Do not invent XP or trust an unvalidated client summary.
- Do not change Supabase, Auth, schema, migrations, dependencies, network actions, or progression version.
- Preserve the victory modal action set, focus loop, isolation, stale-session guard, and reduced-motion behavior.
- Do not read or rewrite malformed `.codearbiter/sprint-log.md`.

### Task 1 — Pin the career model RED

**Files:**
- Create: `client/src/client/commanderCareer.test.ts`
- Create: `client/src/client/commanderCareer.ts`

- [x] Write table-driven failing tests for every authored rank threshold, current identity, next rank, terminal rank, and invalid-level fail-closed behavior.
- [x] Verify RED because the model does not exist.
- [x] Implement the smallest pure typed rank model.
- [x] Verify GREEN and mutate threshold ordering, boundary comparison, and terminal handling independently.

### Task 2 — Pin the trusted progression receipt RED

**Files:**
- Modify: `client/src/client/hotSeatProgression.ts`
- Modify: `client/src/client/AccountSession.test.ts`
- Modify: `client/src/client/AccountSession.ts`
- Modify affected reporter, Lobby, and composition tests/types.

- [x] Write failing tests requiring exact prior/current summaries after a recorded result and no receipt for stale, missing, malformed, duplicate, or wrong-delta refreshes.
- [x] Verify RED against the current current-summary-only return contract.
- [x] Implement one typed immutable receipt after existing validation.
- [x] Verify GREEN and mutate prior-summary capture, expected-delta comparison, and stale refresh suppression independently.

### Task 3 — Pin pre-game career identity RED

**Files:**
- Modify: `client/src/ui/AccountPanelView.test.ts`
- Modify: `client/src/ui/AccountPanelView.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/account-progression-summary.spec.ts`

- [x] Add failing semantic tests for matching current rank and next-rank milestone in the collapsed dossier and open record.
- [x] Add browser assertions for rank hierarchy, text containment, and no overlap at desktop, compact, and touch viewports; the first real-browser run exposed the touch overlap.
- [x] Implement the model-backed dossier/record presentation and responsive styling.
- [x] Verify GREEN and prove the compact containment oracle fails against the pre-correction masthead/preview reservation.

### Task 4 — Pin honest After Action progression RED

**Files:**
- Modify: `client/src/ui/HUD.victoryReport.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify affected composition/browser tests.

- [x] Add failing tests for ordinary progress, win/loss XP, casual threshold isolation, reset, polite announcement, and unchanged focus actions.
- [x] Add browser geometry/accessibility assertions for the real victory report across desktop, compact, and touch layouts.
- [x] Keep casual receipts progression-only and structurally unable to render rank or promotion while verified awards remain frozen.
- [x] Verify GREEN and mutate threshold detection; model and HUD tests rejected the mutation.

### Task 5 — Review and deliver the milestone

- [x] Run focused tests, full client suite, deterministic checks, Edge checks, coverage, typecheck/build, audit, migration validation, and full Playwright matrix.
- [x] Persist RED/GREEN, mutation, SMARTS, and matrix evidence in a milestone report without touching the malformed canonical sprint log.
- [ ] Give one adversarial reviewer the initiative spec, this plan, milestone report, tests, and exact final diff. Resolve every Critical, High, and merge-blocking finding and rerun against the corrected exact package.
- [ ] Complete commit gate, open the PR through the sanctioned lane, require exact-head hosted CI, merge under standing authority, verify Pages deployment and production behavior, and persist the delivery receipt.
- [ ] Keep `career.initiative.0001` active and immediately plan Milestone 2 from production evidence and the adversarial player-experience findings.

## Self-review

- Every Milestone 1 acceptance criterion maps to Tasks 1–5.
- The pure career model is the only owner of rank thresholds and labels.
- No current result seam can produce a promotion claim; that remains deferred to a verified award path.
- No placeholder, entitlement, backend, or gameplay work is bundled into this milestone.

## Coverage-audit correction

The final coverage audit found that the browser promotion oracle fabricated DOM that no
production path could render. ADR-0013 and ADR-0014 intentionally freeze promotion claims
until verified awards exist, while casual hot-seat receipts remain progression-only. The
fabricated oracle was removed instead of adding an E2E bypass. Account geometry now runs
through a deterministic authenticated session and the real Lobby/AccountPanelView
composition. Replay parser, legality, and exact tick-ceiling branches are locked by focused
mutation-resistant tests.

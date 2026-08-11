# Commander Career Loop — Milestone 1 Sprint Evidence

**Date:** 2026-08-10
**Initiative:** `career.initiative.0001`
**Branch:** `codex/commander-career-loop`
**Base:** `015812b4c90c06c48259f8fd66eabd3a7e4a4e3a`

## Outcome

Milestone 1 changes verified progression from arithmetic-only feedback into a visible Commander career identity. Only nested `verified_replay_v1` progression maps to a stable rank and next-rank milestone in pre-game account surfaces. Accepted hot-seat results remain casual progression receipts and cannot render rank or promotion.

No existing tank, weapon, world, mode, or Garage choice is locked. No gameplay advantage is attached to rank.

## SMARTS record

Selected the additive verified-career route over content locks or a copy-only XP patch. The first implementation exposed that existing hot-seat XP was not strong enough evidence for rank, so ADR-0013 and ADR-0014 froze awards and narrowed this milestone to verified identity presentation plus replay feasibility. The initiative remains active.

## TDD evidence

- Career model RED: focused Vitest failed to resolve the absent `commanderCareer` module.
- Trusted receipt RED: `AccountSession` returned only the current summary; the new prior/current assertion failed causally.
- Dossier RED: three `AccountPanelView` cases failed because rank, next-rank semantics, and career panel did not exist.
- Invalidated RED: early promotion HUD tests assumed casual receipts could drive rank. ADR-0013/0014 rejected that premise; the final tests require casual threshold crossings to remain progression-only.
- GREEN: 153 client files and 1,214 tests passed after implementation and review corrections.

## Mutation and adversarial evidence

- Moving the Artillerist threshold from Level 5 to 6 caused four model tests to fail.
- Rank-model threshold mutations still fail model tests, but no current HUD path consumes that model for promotion.
- Win and loss receipts both prove that casual threshold crossings cannot produce rank or promotion claims.
- Switching from Account A to Account B while a matching-XP result refresh was deferred initially produced a cross-account receipt. The corrected generation-and-profile guard made the same adversarial test green.
- Removing semantic insignia content made the rank model and UI accessibility tests fail; each rank now owns a visible mark and accessible label.
- The first isolated real-browser pass caught a Pixel-touch regression: the expanded dossier overlapped the vehicle spotlight and escaped the masthead reservation. Increasing the dossier-aware masthead and preview reservation made the same oracle green.
- The review-corrected production bundle was tested in each real project viewport. Reachable verified rank text retains at least eight physical pixels in the account composition; ordinary After Action progression remains contained and disjoint from title, score, actions, and tank content.
- Stale, unavailable, duplicate, idempotent, wrong-delta, anonymous, AI-owned, network, E2E-fixture, and superseded-session suppression remain covered by the existing focused suites.

## Verification matrix

- `npm run test:client`: PASS — 153 files, 1,214 tests.
- `npm run check`: PASS — typecheck, migration classification, profile identity, and all deterministic harnesses.
- `npm run check:edge`: PASS — 267 tests.
- `npm run coverage:client`: PASS — 95.58% lines, 84.01% branches overall; `commanderCareer.ts` 100% lines and 95.45% branches.
- `npm run audit:deps`: PASS — 0 vulnerabilities.
- `npm run build`: PASS — production Vite bundle.
- Corrected focused account and victory Playwright pass: PASS — 21 passed, 3 intentional compact-only skips.
- Full Playwright production-bundle matrix: PASS — 258 passed, 30 intentional skips.
- `git diff --check`: PASS.

The full browser matrix ran against an isolated preview on port 4181 because port 4173 belongs to an unrelated local service. The exact listener was verified as this worktree's Vite preview; it remains active only until the final review package is accepted, then will be stopped and re-verified absent.

## Boundaries

Client progression presentation and trusted summary handoff only. No Auth, Supabase, schema, migration, dependency, progression formula, deterministic engine, network action, economy, or entitlement change.

## Remaining gates

- State-free secret/security and migration passes at the exact staged diff.
- Corrected exact final review package and the same adversarial reviewer's merge verdict.
- Commit gate, PR, exact-head hosted CI, merge, Pages deployment, production provenance, and milestone delivery receipt.

## Review correction - independently verified progression

The adversarial milestone review blocked the original rank source because ADR-0012's client-attested hot-seat history explicitly cannot grant ranks. The user selected independently verified progression and accepted completion-time deterministic replay. ADR-0013 and ADR-0014 record that correction. The original rank implementation remains frozen and MUST NOT ship until its inputs are changed from casual XP to verified XP.

### Feasibility TDD

- RED: focused Deno typecheck failed because `verifiedMatchReplay.ts` did not exist.
- First execution: the real shared engine imported and replayed successfully, then independent terminal-prefix checking exposed that the original five-row fixture contained two post-terminal actions the permissive adapter silently ignored.
- GREEN: the exact three-action terminal prefix at seed `0x7a17b00c` reaches `GAME_OVER`, winner `p2`, turn 2, using the real `GameEngine` and canonical `replayNetworkAction` path. The original five-row transcript is now an explicit `trailing_action` rejection fixture.
- First review: BLOCK. The adapter still accepted nonterminal/trailing work, permissive runtime values, caller-expanded limits, broad options, and had no maximum-cost evidence. The same review found that rank rendering was still reachable from casual XP.
- Corrected bounds RED/GREEN: initial 64/48/32,000/640 theoretical ceilings were rejected because no maximum accepted workload reached them. Hard ceilings are now the measured terminal envelope: 15 total actions, 14 turn-ending actions, 448 total ticks, and 198 ticks per turn-ending action. Optional caller limits can only tighten them. The maximum four-seat team transcript reaches the action and total-tick ceilings; the Bouncing Betty terminal fixture reaches the per-turn ceiling. Overflow is rejected before engine construction or before the next over-budget tick.
- Corrected parser RED/GREEN: versioned configuration and every canonical action variant are exact-key parsed; nonfinite, over-posted, unsupported, ignored, unaffordable, wrong-phase, and no-state-change values fail closed.
- Corrected terminal RED/GREEN: empty, nonterminal, and trailing transcripts are distinct failures; `actionCount` now means accepted and applied actions only.
- Roster RED/GREEN: verified matches accept 2-4 distinct seats, require at least one human, reject team metadata outside team mode, and require an exact 2v2 roster in team mode. Initially verified rounds are limited to one or three.
- Rank-source RED/GREEN: casual summaries and ordinary hot-seat receipts cannot render rank, insignia, or promotion content. Only the exact nested `verified_replay_v1` progression shape reaches the career model.

## Final coverage-audit correction

The dedicated coverage auditor blocked the first committed head because the Playwright
promotion oracle constructed its own markup rather than invoking reachable production
behavior. That test overstated the slice: verified awards are deliberately not implemented,
and casual receipts MUST NOT claim promotion. The fabricated promotion oracle was removed.
The real account composition now receives a deterministic authenticated session through the
Lobby factory seam, proving verified rank selection, modal rendering, accessibility, and
geometry without replacing production DOM. The same pass raised compact next-rank typography
after the real composition exposed a seven-physical-pixel label.

Replay coverage now includes exact 448/447 total-tick and 198/197 per-turn boundaries plus
table-driven parser and legality cases. Temporarily mutating both tick guards from `>=` to `>`
made both adjacent-boundary tests fail; restoring production returned the focused and full
Edge suites to green.
- Mutation matrix: removing the total-action admission guard changed `action_limit` to `non_terminal`; disabling total/per-turn tick guards removed both expected budget failures; disabling both exact-terminal checks changed `trailing_action` to `illegal_action`; disabling exact fire keys changed an over-posted action from `invalid_action` to `non_terminal`; widening gravity admitted a rejected configuration; permitting caller-expanded ceilings removed the expected `invalid_limits`; disabling the no-state-change purchase check changed an unaffordable Nuke from `illegal_action` to `non_terminal`; replacing own-property allowlists with `in` admitted prototype names; synthesizing verified evidence from casual level exposed `R-03 / Bombardier`; and selecting outer casual metrics while retaining verified rank changed the divergent Level 2 career label to casual Level 20. Every focused mutation run failed causally. All guards were restored before final verification.

### Feasibility verification

- Focused strict replay and workload suites: PASS - 12 tests.
- Terrain-heavy terminal replay medians across seven runs remained below 2 ms in the final focused run; Bouncing Betty reaches the exact 198-tick per-turn ceiling. Exact terminal facts and tick counts remained stable.
- Four-seat premium cost probes: Death's Head 112 ticks and Hot Napalm 179 ticks; both remained below 5 ms in the final focused run. Test-only inventory seeding isolates engine cost and never changes verifier legality.
- Exact best-of-three replay: PASS - winner `p2`, 190 ticks. The maximum accepted exact four-seat 2v2 replay uses 15 actions, 14 turn-ending actions, and all 448 accepted ticks; final full-adapter median was 1.28 ms with an approximately 2.77 MB heap delta.
- `npm run check:edge`: PASS - 279 tests.
- `npm run test:client`: PASS - 153 files, 1,220 tests.
- `npm run typecheck`: PASS.
- `deno bundle --check --platform deno`: PASS - 13 modules, 102,699 bytes; generated artifact removed after inspection.
- `git diff --check`: PASS.

The primary Supabase limits page currently documents 256 MB memory, 2 seconds CPU per request, and 150/400-second Free/Paid worker duration, while Supabase's CPU troubleshooting page documents 200 ms active CPU. The proof therefore uses the stricter 100 ms local target. These measurements establish local feasibility, not a hosted SLA. No migration, endpoint, Auth change, database write, dependency, deployment, or player-facing eligibility change is included; a non-awarding hosted probe remains mandatory before verified awards are enabled.

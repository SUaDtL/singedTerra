# Commander Career Milestone 2 final review package

Date: 2026-08-12
Branch: `codex/commander-career-milestone-2`
Base commit: `499ea46da8397049b875c71332be1a998d44d669`
Review target: exact staged diff against the base commit

## Approved product contract

- Spec: `.codearbiter/specs/commander-career-loop-milestone-2.md`
- Plan: `.codearbiter/plans/commander-career-loop-milestone-2.md`
- Sprint and SMARTS record: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Security boundary: `.codearbiter/security-controls.md`
- Governing decisions: ADR-0012, ADR-0013, ADR-0014, and ADR-0016

The reviewed outcome is one Auth-owned, server-seeded Verified Deployment duel. The browser records only accepted human Baby Missile fire. Completion independently regenerates bounded CPU turns, replays through the shared engine, atomically stores immutable evidence, and awards only separate `verified_replay_v1` progression. Recovery, account switching, expiry, retry, idempotency, contract drain, and generic failure behavior are part of the contract.

Player-facing steering included in this diff:

- Each casual Quick Duel deployment receives one fresh browser-generated unsigned 32-bit seed, while one deployment remains deterministic and verified seeds remain server-owned and immutable.
- A victory report waits for the real terminal impact to finish and then preserves a readable 420 ms payoff beat, or 120 ms under reduced motion, with duplicate input inert.

## Test-first and correction evidence

Task reports and adversarial packages are under `.superpowers/sdd/commander-career-loop-milestone-2/`. The append-only sprint record lists each causal RED, GREEN, mutation result, reviewer BLOCK, correction, and acceptance for T-01 through T-08. T-08's fresh correction reviewer returned PASS with no Critical, High, or other merge-blocking findings after independently running the 27-case browser lifecycle matrix.

## Fresh final local evidence

All commands ran on the Windows host from this exact worktree on 2026-08-12:

- `npm run audit:deps`: PASS, 0 vulnerabilities.
- `npm run check:edge`: PASS, 352 tests.
- `npm run test:client`: PASS, 1,478 tests across 158 files.
- `npm run coverage:client`: PASS, 95.28% lines and 84.84% branches. The repository is stage 1 and both clear the 60% floor.
- `npm run check`: PASS.
- `npm run build`: PASS, including shared/client typecheck and production Vite build.
- `node scripts/checks/verified_deployment_migration.mjs && node scripts/checks/verified_deployment_drain.mjs`: PASS.
- `npm run test:e2e`: PASS, 292 tests with 29 intentional profile skips. This includes consecutive Quick Duel seed receipts, refresh recovery, expiry choices, terminal retry, verified promotion, and real impact payoff timing.
- `git diff --check`: PASS.

No coverage exemption is used. Live PostgreSQL 15 migration execution, hosted exact-head CI, ordered Supabase rollout, authenticated hosted probe, client merge/deploy, contract enablement, and production health proof remain delivery gates after review.

## Review correction round 1

The first holistic adversary returned BLOCK with no Critical or High findings and two merge-blocking Medium findings:

1. Stale or unavailable local account state could suppress an award already accepted by the server, while a separate post-transaction summary call could race another same-account completion.
2. Account B activity after refresh could overwrite account A's still-recoverable transcript.

The exact correction adds immutable result-specific prior/current progression to the same per-account completion transaction, removes the mutable follow-up summary RPC from completion, accepts only a refreshed authoritative summary that contains that immutable result, and uses a bounded four-record owner-session recovery envelope without storing account identity. Causal tests cover concurrent-device ordering, same-evidence retry after another award, stale and null local summaries, malformed progression projections, and A to B to refresh to B activity to A recovery. All 48 migration mutations and the full corrected matrices above pass.

The review's Low probabilistic Quick Duel test finding is also resolved: browser coverage proves a bounded seed receipt on every launch, while deterministic injected unit tests prove distinct supplied redeployments and one generator call per launch. A valid 32-bit collision no longer fails CI.

## Exact diff and exclusion

Review the immutable staged set with:

`git diff --cached --binary --find-renames 499ea46da8397049b875c71332be1a998d44d669`

Review staged paths with:

`git diff --cached --name-status`

The unrelated untracked `NUL` artifact is deliberately excluded and preserved. It is not part of this slice, and this package grants no destructive cleanup authority.

## Required adversarial verdict

Return `PASS` or `BLOCK`, then list findings by Critical, High, Medium, Low. Treat any Critical, High, security/auth/crypto violation, unsafe or non-additive migration behavior, dishonest coverage claim, test bypass, unbounded replay/request path, weak ownership/idempotency boundary, progression award without independent replay, deployment-drain defect, or other merge-blocking issue as `BLOCK`.

Specifically attempt to falsify:

1. The client can submit only the bounded human transcript and cannot choose CPU actions, owner, seed, outcome, XP, level, rank, or rewards.
2. Auth ownership, per-account limiting, body bounds/deadlines, expiry, replay-before-write, immutable evidence, idempotent retry, and conflicting-evidence refusal fail closed without identifier or credential disclosure.
3. Shared browser and Edge replay behavior is one bounded engine path, including hard tick/probe/swept-work limits.
4. Casual Quick Duel gets a fresh seed once per launch without compromising deterministic in-match behavior or verified server seed ownership.
5. Refresh, account switch, return-to-owner, abandon, expiry, casual continuation, terminal retry, and account-summary refresh cannot duplicate or misattribute an award.
6. The report cannot cover or interrupt the real terminal impact and cannot accept duplicate navigation during its payoff beat.
7. Migration 016 is additive, PostgreSQL 15 compatible, least-privilege, owner-private, deletion-safe, and drain-safe. Starts remain disabled until the ordered rollout proves readiness.
8. The tests and mutation evidence actually protect the claimed behavior, and both required coverage metrics clear the maturity floor.

Do not edit files. Report every merge blocker even when its severity label would otherwise be Medium.

# mvp2.progression.0006 adversarial review package

Date: 2026-08-09
Branch: `codex/persistent-hotseat-progression`
Base: `origin/main@da0eb94b073354232163f2d75a19efd9f1f27a56`
Status: corrected exact diff CLEAR

## Bounded specification and plan

- Spec: `.codearbiter/specs/persistent-hotseat-progression.md`
- Plan: `.codearbiter/plans/persistent-hotseat-progression.md`
- Security controls: `.codearbiter/security-controls.md`
- Sprint audit input: `.codearbiter/sprint-log.md`
- Task board: `.codearbiter/open-tasks.md` (`mvp2.progression.0006` in progress)

Signed-in hot-seat Player 1 receives one immutable match result per ordinary
match. A fresh client UUID is generated for the match; the browser reports only
the first real `GAME_OVER`, and a Supabase Auth-validating Edge Function derives
the user id from the bearer. The server stores only `{user_id, match_id, won}`.
`account_summary` combines exact owner-scoped hot-seat counts with existing
network history before applying unchanged progression V1 arithmetic.

The result is explicitly casual, client-attested history. It cannot grant
gameplay power, rewards, ranks, entitlements, or anti-cheat trust. E2E modes,
network matches, anonymous sessions, and an AI-controlled Player 1 do not
report.

## SMARTS decisions

1. Select an Auth-owned immutable result row over local-only XP or complete
   action-log upload/replay. This is specific to the reported missing hot-seat
   progression, measurable through exact counts and one idempotency key,
   attainable with one additive table/function/client seam, relevant to the
   persistent-player priority, time-bounded to this slice, and strong while the
   trust ceiling is explicit. Local-only state is not durable; authoritative
   replay is disproportionate for casual non-entitlement history. Confidence:
   high.
2. Map the signed-in account to hot-seat Player 1. This preserves ordinary
   hot-seat semantics and avoids inventing multi-account local identity.
   Confidence: high.
3. Retry one transient result-delivery failure. The reporter must latch once to
   prevent duplicate terminal observations, while the endpoint is intentionally
   idempotent; two total attempts add bounded resilience without delaying
   gameplay or creating an unbounded queue. Confidence: high.

## TDD RED and GREEN

- Migration harness RED: missing migration 015, then deliberately impossible
  digest. GREEN pins normalized-LF SHA-256
  `0aa7d21dbb9cf3f69ba08fcf01aa32d3a9f50bb8e982bd28d6327f969e83ff7e`.
- Edge RED: focused Deno suite failed because
  `record_hotseat_match/index.ts` did not exist. GREEN: six endpoint tests.
- Summary RED: eight account-summary cases failed because local count queries
  were unconsumed and totals excluded hot-seat history. GREEN: nineteen tests.
- Client RED: missing reporter, backend/session method, and Lobby delegation
  produced the named focused failures. GREEN after implementation.
- Reliability RED: the new transient-outage session test returned `false` after
  one failed invocation. GREEN uses the existing bounded retry helper and
  proves two calls followed by one profile refresh.

## Mutation evidence

- Invert winner comparison: three reporter tests fail.
- Remove terminal latch: duplicate-observation test sees two reports and fails.
- Replace Auth-derived insert user with body match id: four endpoint cases fail.
- Remove hot-seat aggregation: local-win summary fails with 0/0 XP instead of
  one match, one win, and 200 XP.
- Grant authenticated INSERT in the migration fixture: profile identity harness
  rejects the mutation.

All mutations were restored before the final matrix.

## Initial adversarial findings and corrections

The designated reviewer returned BLOCK with zero Critical, one High, and two
Important merge-blocking findings.

1. The approved client-attested design contradicted ADR-0011's blanket ban on
   client-reported progress. `$ca-adr` recorded the already user-approved
   bounded exception as accepted ADR-0012, partially superseding only that
   clause. The append-only decision log received DECISION-0015 through a
   byte-preserving ASCII append whose full prior byte prefix was verified
   unchanged. Security controls now permit only `{matchId, won}` for casual
   hot-seat history while continuing to ban request-owned identity, XP, levels,
   totals, rewards, ranks, entitlements, gameplay power, and anti-cheat claims.
2. PostgreSQL canonicalizes UUID output to lowercase, so uppercase request UUIDs
   could conflict on exact replay. The handler now canonicalizes once before
   lookup, insert, comparison, and logging. Exact-replay and uniqueness-race
   uppercase tests fail before and pass after the correction.
3. Safe count values could overflow after multiplication by 100. The handler
   now validates match XP, win XP, and their sum with `Number.isSafeInteger`
   before level derivation. The focused boundary case fails before and passes
   after the correction, and the static harness requires all three guards.

Focused corrected evidence: profile/ADR/migration harness green;
`record_hotseat_match` 7/7; `account_summary` 19/19. The corrected complete
matrix below is refreshed: deterministic checks, 1,048 client tests, 265 Edge
tests, coverage, build, dependency audit, 200 applicable browser tests, product
diff hygiene, and the state-free secret scan are all green.

The designated corrected-package re-review returned CLEAR: Critical 0, High 0,
Important 0, Medium 0, Low 0, and merge-blocking 0. It verified the accepted
ADR-0012/security-control exception, canonical uppercase replay and uniqueness
race behavior, safe XP multiplication/sum guards, and the complete correction
delta.

## Exact local matrix

- Focused AccountSession: 53/53 passed after retry correction.
- `npm run test:client`: 138 files, 1,048 tests passed.
- `npm run coverage:client`: 138 files, 1,048 tests passed; 92.58% statements,
  82.93% branches, 85.41% functions, 94.61% lines.
- `npm run check:edge`: 265 passed, 0 failed.
- `npm run check`: passed the typecheck, migration, identity, and complete
  deterministic harness chain.
- `npm run build`: passed; 1,915 modules transformed.
- `npm run audit:deps`: zero vulnerabilities.
- `npm run test:e2e`: 200 passed, 28 intentional project-conditional skips.
- Focused unrelated Splash reproduction: 4/4 passed in 1.7 seconds after one
  resource-saturated seven-lane matrix run timed out during module import; the
  subsequent isolated complete client and browser suites passed without a code
  change.
- Product diff hygiene (excluding the preserved audit anomaly): clean.
- State-free secret scan: 23 redacted heuristic matches, all synthetic test
  passwords/tokens or UI credential-field fixtures; raw credential findings: 0.
  Repository status was byte-identical before and after the read-only preview.

## Audit-log provenance and exclusions

The historical `.codearbiter/sprint-log.md` was already non-UTF-8. The required
PowerShell append operator added this slice's receipt as UTF-16LE, so Git
renders the append-only file as a whole-file binary/encoding rewrite and strict
`git diff --check` reports noise there. Rewriting or truncating the canonical
append-only audit file would be destructive governance cleanup and is outside
this slice. It remains available to the reviewer as required input but MUST NOT
be staged or committed by this slice. This UTF-8 report preserves the complete
review package without modifying historical audit bytes further.

`.codearbiter/open-tasks.md.lock` is an untracked taskwriter sidecar and MUST NOT
be staged, modified, or removed.

## Final-diff review instruction

Review every current tracked and untracked change reported by
`python <codearbiter-plugin>/hooks/preview.py diff`, excluding only the two
explicit non-delivery artifacts above: `.codearbiter/sprint-log.md` and
`.codearbiter/open-tasks.md.lock`. Inspect the complete final content of all new
files, including migration 015 and `record_hotseat_match`. Report every
Critical, High, Medium, Low, Important, and merge-blocking finding. Treat Auth
derivation, ownership/RLS/grants, idempotency races, count correctness,
client terminal-state semantics, retries, and test mutation resistance as
adversarial priorities. Do not modify files.

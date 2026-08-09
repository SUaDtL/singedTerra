# mvp2.progression.0004 sprint receipt

Date: 2026-08-08
Status: in progress

## SMARTS decision

Select an accessible XP progress meter plus exact XP-to-next-level copy over
three alternatives: expanding career statistics, introducing level-gated
rewards, or adding Google SSO. The meter is Specific to the existing account
panel, Measurable through semantic DOM and compact browser geometry, Attainable
without backend work, Relevant to the maintainer-prioritized persistent-player
direction, Time-bounded to one client view and its styles/tests, and Strong
because it derives only from the already validated server summary. Career
statistics would expand the authenticated Edge contract; rewards would create
premature entitlement semantics; Google SSO remains explicitly later.
Confidence: high.

## Scope

Client account-panel markup, embedded Lobby styles, focused DOM tests, compact
Playwright fixture, and governance artifacts only. No Supabase, Auth, Edge,
schema, migration, secret, dependency, action-log, engine, or progression-rule
change is authorized.

## Governance note

The canonical historical `.codearbiter/sprint-log.md` still fails strict UTF-8
decoding and cannot be safely changed by the required patch writer. A scoped
entry in `.codearbiter/overrides.log` authorizes this UTF-8 report as the
append-only sprint record for this slice only and preserves the canonical log
byte-for-byte.

## TDD RED

The focused AccountPanelView suite failed 4 of 12 tests before production
changes. It proved the old fourth `XP` definition pair was still present, the
native progress element was absent at ordinary and boundary values, remaining
XP copy was absent, and the two-panel oracle still observed the obsolete pair.
The RED cases use only progression V1-reachable values: 0, 200, and 400 XP
within a 500-XP level.

## Focused GREEN and causal proof

The restored focused AccountPanelView suite passes 12/12. The authenticated
panel now keeps Matches, Recorded wins, and Level as definition pairs, then
renders an id-free native progress element with exact value/max, visible XP
ratio, and exact XP-to-next-level copy. The compact pixel-touch browser oracle
passes 2/2 with readable copy, containment, and non-overlap. Replacing remaining
XP subtraction with addition caused the ordinary and nearest-boundary cases to
fail with 700 and 900 XP instead of 300 and 100; restoration returned 12/12
green.

## Integrated local verification

- `npm run test:client`: 137 files and 1,023 tests passed.
- `npm run coverage:client` on Windows: 137 files and 1,023 tests passed;
  92.55% statements, 82.65% branches, 85.44% functions, and 94.57% lines.
  This client-only slice has no platform-specific fork, so no second-host union
  contribution applies.
- `npm run test:e2e`: 195 passed and 27 intentionally skipped.
- `npm run check:edge`, `npm run check`, and `npm run build`: passed.
- `npm run audit:deps`: zero vulnerabilities.
- `git diff --check`: passed.
- State-free secret scan: exited cleanly; its two heuristic matches are existing
  redacted/test or UI-token substrings, not credentials.

## Adversarial review

The designated reviewer reported zero Critical, High, Low, or merge-blocking
findings and one non-blocking Medium: the compact browser fixture depended on
the production authenticated-layout class without a DOM-level contract test.
The focused suite now asserts `account-panel--authenticated` on the production
authenticated root. Focused DOM and compact browser gates were rerun, and the
corrected exact diff was returned for re-review.

The corrected-package re-review was CLEAR with zero Critical, High, Medium,
Low, or merge-blocking findings. It confirmed the production class, DOM test,
and compact fixture now share the same authenticated-layout contract.

## Hosted CI correction

PR #338 run 31286896081 exposed a Linux font-metric overflow that the Windows
browser run did not reproduce: three intrinsic-width progress-stat columns
exceeded the authenticated panel's middle grid track by 2.7 to 3.7 pixels in
both compact projects. A 330-pixel constrained-panel oracle reproduced the same
containment failure locally before the fix. An initial equal-track correction
contained the grid but a blocking adversarial review proved `Recorded wins`
glyphs could overflow their assigned track. The oracle now uses a valid
24-character display name and measures rendered text ranges inside each stat.
The final layout keeps intrinsic stat widths on a border-box full-width row,
allows the identity to wrap beside Sign out, and passed the strengthened focused
pixel-touch and small-window matrix 4/4.
The CI-equivalent two-worker full browser matrix then passed 195 scenarios with
27 intentional project skips; client 1,023/1,023, Edge 255/255, deterministic
checks, build, audit, and secrets gates also remained green.

The strengthened final-package adversarial re-review was CLEAR and the coverage
audit PASSed, each with zero findings at every severity and zero merge blockers.

## Exact-head authority gate

Behavior head `4b6ce25c850bcd7df2dce5cd793f25ae4ef4411b` cleared CI run
31288511360 (typecheck, deterministic harnesses, build, Edge tests, and browser
rendering), CodeQL run 31288511367 and status, CodeRabbit, the strengthened
adversarial review, and the coverage audit. PR #338 was cleanly mergeable. The
maintainer's standing improvement-goal authority is logged for the sprint
merge-to-default stop; this audit-only authority head must independently clear
hosted CI and exact-diff adversarial review before squash merge.

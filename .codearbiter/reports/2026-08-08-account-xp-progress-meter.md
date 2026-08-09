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
- `npm run coverage:client`: 137 files and 1,023 tests passed; 92.55% statements,
  82.65% branches, 85.44% functions, and 94.57% lines.
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

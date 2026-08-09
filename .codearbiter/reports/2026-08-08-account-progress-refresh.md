# mvp2.progression.0005 sprint receipt

Date: 2026-08-08
Status: in progress

## SMARTS decision

Select immediate post-match account refresh over account history, rewards, or
Google SSO. It is Specific to the missing success signal between existing match
linkage and the existing account summary, Measurable through focused lifecycle
tests, Attainable as client-only composition, Relevant to the requested
persistent-player progression loop, Time-bounded to four existing owners, and
Strong because the server remains the sole progression authority. Confidence:
high.

## Scope

AccountSession refresh semantics, Lobby delegation, NetworkClient success-only
notification, GameClient optional contract, main composition, tests, and
governance artifacts. No Supabase, Auth policy, Edge, schema, migration, secret,
dependency, engine, action-log, progression-rule, or reward change is authorized.

## Diagnosis

`finish_game` is followed by the existing bounded `claim_match` retry. Its final
success value is currently ignored. The page retains one Lobby while gameplay is
visible, but GameClient has no match-link notification and AccountSession has no
public refresh operation. Consequently the authenticated summary stays stale
until restore/sign-in/auth-event loading runs again.

## TDD evidence

The focused tests first failed because AccountSession had no `refresh`, Lobby
had no refresh delegation, and NetworkClient had no progress-change event. The
implemented contract passes 53 focused tests. Mutating the success predicate
from `linked` to `anonymous` caused both the signed-in success oracle and the
anonymous negative oracle to fail; restoring the predicate returned the focused
suite to green.

## Local verification

- The corrected bounded full client suite passed 137 files and 1,030 tests.
- Corrected `npm run coverage:client`: 137 files and 1,030 tests passed;
  92.56% statements, 82.77% branches, 85.39% functions, and 94.59% lines.
- `npm run check:edge`, `npm run check`, `npm run build`, `npm run
  audit:deps`, and `git diff --check`: passed.
- The initial 16-worker browser run had one unrelated blank-capture failure in
  the existing Foundry mobility-signature oracle. The exact failed case passed
  1/1 in isolation, and the CI-equivalent two-worker full matrix passed 195
  scenarios with 27 intentional project skips.

## Adversarial review correction

The designated reviewer found one merge-blocking High: the first refresh
implementation incremented the shared auth generation, so a refresh invoked
after sign-out or a newer auth-user load began could invalidate the newer
operation and restore the old profile. Refresh now has its own last-writer
generation, never mutates the auth generation, refuses to start while auth or
account mutation is busy, and rechecks identity plus both generations before
publishing. Two reverse-order regression tests reproduce the reviewer scenarios;
the corrected focused package passes 55/55.

The corrected exact-diff re-review returned CLEAR with zero Critical, High,
Medium, Low, or merge-blocking findings. Diff hygiene passed.

## Exact-head authority gate

Behavior head `b3d706a399ec8bfa33f8bdf2229c45f7f35a6f13` cleared CI run
31290923329, CodeQL run 31290923328 and status, CodeRabbit, designated
adversarial review, H-10b secret-handling review, and the coverage audit. PR
#340 is mergeable. The maintainer's standing improvement-goal authority is
logged for the sprint merge-to-default stop; this audit-only authority head
must independently clear hosted CI and exact-diff adversarial review.

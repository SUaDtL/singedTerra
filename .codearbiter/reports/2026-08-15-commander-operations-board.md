# Commander Operations Board local evidence

Date: 2026-08-15
Initiative: `career.initiative.0001` remains active.
Decision: `career.operations.0002`

## Player outcome

An authenticated Commander entering Local Battle sees one bounded operations
surface: the existing dossier remains immediately above a current Field Order,
one verified-deployment control lane, and an explicitly local Practice
Operations lane. Quick Operations continue through their existing local Quick
Duel route and do not acquire verified rewards or account authority.

## Test-first record

- RED: `LobbyHotSeatView` had no Commander Operations region and the
  authenticated Local Battle route had no practice callback.
- GREEN: the builder composes the career, verified, and practice lanes in that
  exact order, retains one verified primary action, and delegates each practice
  card to the existing Quick Duel callback.
- Lifecycle guard: an authenticated board retires on an anonymous account
  transition and only returns with a newly authenticated state; the restored
  practice card still emits the existing local Crosswind configuration.
- Browser RED: the board initially rendered as an unstyled block; compact
  layout initially split the verified rules down to an unusable 8px lane; and
  the compact practice launch target measured 33.34px wide.
- GREEN: the board is a contained grid; compact stacks the verified action
  beneath its readable rules; and the practice control has a causal 44px
  minimum target. Desktop cards and compact selector both launch Crosswind
  Range through the normal local path.

## Local verification

- Focused view and account tests: 66 passed.
- Full client suite: 164 files, 1,634 tests passed.
- `npm run check`: passed (typecheck and deterministic harnesses).
- `npm run check:edge`: 352 passed, 0 failed.
- Complete Playwright production-bundle matrix: 346 passed, 38
  project-inapplicable skips, 0 failures.
- `git diff --check`: passed after restoring the exact historical audit bytes
  and re-appending the UTF-8 Commander Operations audit records.
- Review correction: the existing Commander dossier is immediately above the
  board. The focused view/account suite (66 tests), typecheck, and the
  desktop, touch, and small-window board journey (3 tests) passed.

## Hosted delivery and remaining production proof

PR [#433](https://github.com/SUaDtL/singedTerra/pull/433) reviewed head
`9500308`, which passed CI `31889923419` and CodeQL `31889923473`, then
merged as `ffed005`. Exact-main CI `31890260441`, CodeQL `31890260439`, and
Pages `31890260470` passed. Pages verified current-main source, deployed
provenance, and its post-deploy live smoke. Live
`deploy-meta.json` reports that same merge SHA and Pages run ID.

The public Pages health and provenance are verified. An authenticated Battery
observation is still open: the available browser connector had no signed-in tab,
and the local Playwright fixture deliberately uses the development Supabase
storage key so it cannot establish a fake account on the production origin.

## Boundary

This slice changes only client Local Battery composition, styling, and tests.
It does not alter Auth policy, schemas, migrations, Edge Functions, action
protocol, deterministic engine, verified receipt/reward authority, dependencies,
or secrets. The authenticated production observation remains open.

The plan deliberately retains unchecked mutation, broader lifecycle, and
durable screenshot obligations. The green matrices above are local regression
evidence, not a claim that those remaining plan checks or delivery gates are
complete.

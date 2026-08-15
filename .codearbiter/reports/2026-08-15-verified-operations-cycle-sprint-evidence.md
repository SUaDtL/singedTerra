# Verified Operations Cycle sprint evidence

**Date:** 2026-08-15
**Initiative:** `career.initiative.0001`
**Status:** delivery and bounded production receipt accepted

## Browser contract

Task 4 adds production-bundle browser coverage for the authenticated cycle:
First Strike briefing, restored active controller order, terminal result,
focus-owned `Brief next order`, Battery return, receipt-rotated Fire for Effect
briefing, and a fresh descriptor with a visible `0 / 6` budget. The same matrix
also asserts Field Order absence from ordinary hot-seat, anonymous local, Quick
Duel, and a running online match.

The causal RED was a temporary mutation of the accepted-report handoff guard.
With that one guard inverted, desktop-fine, pixel-touch, and small-window all
failed at the same player-visible boundary: `#lobby` stayed hidden after
`Brief next order`. The mutation was restored, `client/src/main.ts` returned to
an empty diff, and the nine new matrix cases passed.

The first full browser run found one stale test expectation for the superseded
abbreviated First Strike HUD copy. The assertion was updated to the approved
shared Field Order wording; no production copy, geometry threshold, or
verification contract changed.

## Fresh local gates

- Focused new browser matrix: 9 passed, 0 failed.
- Complete Playwright matrix: 325 passed, 38 intentional skips, 0 failed.
- Full client suite: 163 files and 1,619 tests passed.
- `npm run check`: exit 0, including strict typecheck and the complete
  deterministic harness chain.
- `npm run check:edge`: 352 passed, 0 failed.
- Standalone `npm run typecheck`: shared and client exited 0.
- Diff/whitespace checks and the state-free secret scan passed before the Task 4
  commits.

## Hosted delivery

PR [#427](https://github.com/SUaDtL/singedTerra/pull/427) reviewed exact head
`d8ca33be7791d90492177724e286cdfd759b51df` and merged as
`main@6547079dc81e5c8cb27fb9f887d451ca32b0ee37`. Exact-head CI
`31876577759` passed typecheck, deterministic harnesses, client tests, build,
Edge tests, and rendering E2E; exact-head CodeQL `31876577763` passed. On the
merge commit, CI `31876818163`, CodeQL `31876818166`, and Pages
`31876818184` all passed. Pages built the client, verified current-main source
before and during deployment, verified deployed provenance, and completed its
post-deploy live smoke.

## Authenticated production receipt

On the deployed Pages client, an authenticated Commander started the existing
Hold the Field verified deployment, reached its six-human/six-CPU salvo cap,
and reloaded through the normal Local Battle entry. Selecting the visible
verified-deployment start action recovered the same capped transcript into the
terminal report. The immutable result was a verified loss: Hold the Field was
not achieved, while the existing verified result awarded +100 XP.

The report exposed one `Brief next order` action. Activating it returned to the
Battery with the accepted award reflected in the dossier, rotated the visible
order to First Strike, and then started a fresh verified descriptor. The new
live match showed `You 0 / 6`, `CPU 0 / 6`, a fresh 30-minute deadline, and
First Strike with three salvos remaining. This proves recovery, accepted
receipt, rotation, Battery handoff, and fresh-budget presentation without
claiming a victory or a replayed award.

## Boundary

Task 4 changes browser coverage and governed evidence only. It adds no Auth,
schema, migration, Edge Function, protocol, award, dependency, account-summary,
or runtime product change. The product implementation itself was client-only,
so Pages deployment is the complete deployable scope; no Supabase function or
migration deployment is claimed.

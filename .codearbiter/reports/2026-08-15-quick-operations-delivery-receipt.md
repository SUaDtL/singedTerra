# Quick Operations Delivery Receipt

## Outcome

Quick Duel now offers Standard Duel, Crosswind Range, Caldera Run, and Last
Light Siege before the existing local CPU duel begins. Each selected condition
uses the existing deterministic Hot Seat options and remains visible as public
context in the match ledger and After Action report.

## Reviewed change and hosted evidence

- PR [#431](https://github.com/SUaDtL/singedTerra/pull/431) reviewed head
  `0bcc100c07d0c4173aab72f8b199d56f01940113` and merged as
  `8edeefc73188e04ab7b0d2ec855d6f4f6d38e19a`.
- Exact-head PR CI run `31885803414` passed typecheck, deterministic harnesses,
  client tests, build, Edge tests, and rendering guardrails. CodeQL run
  `31885803430` passed on the same head.
- Exact-main CI run `31886104825` and CodeQL run `31886104776` passed on the
  merge commit.
- Pages run `31886104768` passed build, current-main verification, deployed
  provenance verification, and its post-deploy live smoke.

## Production observation

On the normal production page, the chooser displayed all four Operations.
Selecting Crosswind Range and launching Quick Duel versus CPU closed the lobby
and showed `Crosswind Range · Wraparound walls turn shifting wind into a ranging
test.` in the live match ledger.

## Boundary

This was a client-only Pages deployment. No Supabase function, migration,
shared-engine authority, Auth, network protocol, persistence, reward, or
dependency change was deployed. `career.initiative.0001` remains active.

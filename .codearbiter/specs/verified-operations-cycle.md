# Verified Operations Cycle

**Status:** approved under the standing continuous-improvement authority
**Date:** 2026-08-15
**Initiative:** `career.initiative.0001`

## Player outcome

An authenticated Commander receives a small rotating field order before each
Verified Deployment, sees its honest tactical progress while playing, and gets
one clear next-order handoff after an accepted verified result. A completed
deployment never silently becomes an ordinary replay.

## SMARTS decision

1. Add more weapons, worlds, or AI personalities now. Rejected: useful variety,
   but it leaves the newly proven verified career loop without a replay purpose.
2. Persist medals, streaks, unlocks, or bonus rewards. Rejected: this creates an
   entitlement/history surface and requires a separate Auth, schema, migration,
   integrity, and production-rollout decision.
3. Add a client-presented, receipt-driven Verified Operations Cycle. Selected:
   S=5, M=5, A=4, R=5, T=4, Satisfaction=5; confidence high. It composes only
   already-validated deployment and result facts, turns another verified match
   into a legible choice, and remains removable without authority changes.

## Contract

- A `FieldOrder` is a public client presentation object selected from the
  validated pre-match verified `matchesPlayed` count and frozen to its active
  deployment descriptor. The initial catalog cycles in this exact order:
  **First Strike** (damage CPU within three human salvos), **Fire for Effect**
  (damage CPU on two separate human salvos), **Hold the Field** (win the duel).
- The selection is recomputed only for a fresh descriptor or after the accepted
  immutable completion receipt has refreshed the verified summary. Resume of
  the same descriptor retains the same selected order.
- Observation reads existing replay/controller facts only. It never changes the
  transcript, action log, seed, engine, network request, summary, or award.
  A malformed/missing summary produces no order claim.
- The same order appears in the authenticated dossier/deployment brief, lower
  command-console status, and existing After Action Report. Terminal copy says
  achieved or not achieved; it never says reward, unlock, medal, streak, or
  bonus XP.
- An accepted verified result replaces the verified report primary action with
  **Brief next order**. It tears down the consumed match and returns to the
  Battery. A later start goes through the existing authenticated start path and
  must produce a fresh descriptor and fresh 0/6 budget. Failed, retryable,
  expiry, casual-continue, anonymous, local, Quick Duel, and network modes keep
  their existing action behavior.

## Acceptance criteria

1. Pure causal tests cover exact catalog selection, all achieved/missed
   boundaries, terminal precedence, resume stability, invalid summaries, and
   receipt-driven rotation.
2. Browser journeys on desktop, compact, and Pixel show one verified order in
   the briefing and console, an outcome in the report, focus-safe Brief next
   order handoff, and a fresh subsequent 0/6 deployment. Ordinary-mode absence
   remains explicit.
3. A receipt retry can neither double-advance an order nor replace the consumed
   deployment with ordinary play; account change, abandon, expiry, and casual
   continuation retire its presentation state.
4. The slice adds no Auth, schema, migration, Edge, protocol, award, or
   dependency change. Any proposal to persist order completion or grant a
   benefit is a hard gate for a separate initiative.
5. TDD, adversarial review, exact-head hosted CI/CodeQL, Pages deployment, and
   an authenticated production journey prove the outcome before acceptance.

## Boundaries

Client presentation and deterministic client observation only. Existing verified
completion remains the source of match/win/XP truth; this slice may react only
after its immutable receipt is accepted.

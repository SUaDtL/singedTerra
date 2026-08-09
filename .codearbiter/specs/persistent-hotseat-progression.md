# Signed-in Hot-seat Progression Sprint Spec

**Status:** approved under the standing improvement-goal authority
**Date:** 2026-08-09
**Task:** `mvp2.progression.0006`
**Decisions:** ADR-0011, ADR-0012

## Goal

Award the existing version-one account progression after a signed-in player completes a hot-seat match, so a real local win immediately changes Matches, Recorded wins, XP, and Level without affecting anonymous play or deterministic simulation.

## SMARTS decision

1. **Authenticated client-attested result endpoint (chosen).** Player 1 is the signed-in account seat. A fresh client UUID identifies one local match; the first real `GAME_OVER` reports `{ matchId, won }` to an Auth-validating Edge Function. The server derives the user from Supabase Auth and stores one immutable, idempotent result.
2. **Persist and replay the complete local action log on the server.** Stronger evidence, but disproportionate: it creates a second persistence protocol and still does not independently simulate the result.
3. **Award only browser-local XP.** Rejected because it does not survive devices and would split the account summary into competing authorities.

The chosen route is strongest for scope, availability, maintainability, and testability. It is weaker on competitive integrity, which is acceptable only under the existing casual-result trust ceiling.

## Player contract

- Hot-seat Player 1 is the optional signed-in account seat; the remaining local seats are guests.
- A signed-in Player 1 receives 100 XP for a completed match and another 100 XP when Player 1 is the engine-declared winner, using progression version 1 unchanged.
- A loss or draw records one match and zero wins. Anonymous matches remain playable and produce no account write.
- The account summary refreshes after a successful new or idempotent result record.
- E2E fixture modes never record progression.

## Architecture and trust boundary

- Add an owner-private `hotseat_match_results` table keyed by `(user_id, match_id)` with immutable `won` and server timestamp fields. Anonymous users have no access; authenticated users may read only their own rows and cannot write; service role may select and insert only.
- Add `record_hotseat_match`, with explicit in-handler bearer validation through Supabase Auth. It accepts exactly `{ matchId: UUID, won: boolean }`; user id is Auth-derived and XP/level/account fields are rejected.
- Exact replay is idempotent. Reusing a match id with a different outcome returns conflict. The function uses the existing named rate limiter and bounded generic errors, and never logs or stores a JWT.
- `account_summary` derives local match and win counts with exact count-only queries scoped to the Auth-derived user, adds them to the existing verified network counts, then applies the unchanged version-one formula.
- A pure client reporter latches the first real `GAME_OVER`, attributes the result to the first engine tank, and delegates to `AccountSession`. It never mutates engine state or enters the action log.

## Security ceiling

The server can authenticate the account, reject identity/XP injection, and enforce idempotency, but it cannot independently prove a local browser's match or winner without server simulation. A modified client can mint additional match ids or lie about `won`. Therefore these totals remain casual history only and MUST NOT grant gameplay power, scarce rewards, ranks, entitlements, or anti-cheat claims. This limitation must be documented and causally tested.

## Scope boundaries

In scope: one additive migration, one Edge Function, account-summary aggregation, client completion reporting, account refresh, tests, deployment, and production verification.

Out of scope: server-authoritative hot-seat simulation, action-log upload, unlocks, inventory rewards, ranked play, leaderboards, Google SSO, email delivery/recovery, dependencies, custom crypto, secrets, and destructive migration work.

## Acceptance criteria

1. A signed-in hot-seat Player 1 win adds one match, one win, and 200 XP; a loss or draw adds one match and 100 XP.
2. Anonymous completion and E2E fixture modes perform no account write.
3. Only the first observed `GAME_OVER` for a match reports; restart/rematch creates a new match id.
4. The endpoint derives user id from a validated bearer, accepts only match id and boolean outcome, and handles invalid auth, malformed input, exact replay, outcome conflict, and database failure generically.
5. Migration and harness tests prove owner-only reads, no direct client writes, service-role select/insert only, immutable result fields, and no credential/progression-total columns.
6. `account_summary` combines exact local counts with existing network counts, validates safe-integer arithmetic, and retains the version-one formula.
7. Focused tests fail before implementation and pass after it; mutations to the one-shot latch, winner comparison, Auth derivation, or local count aggregation are caught.
8. Full local gates, one adversarial final-diff review package, exact-head hosted green checks, standing-authority merge, migration/function/client deployment, and exact production verification all clear before task completion.

## Rollback

Client reporting and the Edge Function can be disabled independently. Migration 015 is additive and is never rolled back destructively; a later forward migration may revoke access or retire the read path.

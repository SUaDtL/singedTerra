# Authenticated Match Linkage Sprint Spec

**Date:** 2026-08-04
**Task:** `mvp2.progression.0001` under the broader `mvp2.identity.0001` umbrella
**Approval:** Bounded spec and plan approved by the maintainer's standing improvement-goal authority
**Decision:** ADR-0011 remains governing

## Problem

Password accounts now provide a stable Supabase user id, but completed network matches are not linked to that id. XP, levels, and aggregate progression would therefore have no trustworthy account-to-match input. The next slice must create that attribution seam without accepting a browser-supplied user id, tank id, outcome, or cumulative total and without changing anonymous or seat-token gameplay.

## SMARTS choice

1. **Separate authenticated `claim_match` endpoint (chosen).** After the existing best-effort `finish_game` attempt, a signed-in client claims only its own completed-match seat. The endpoint verifies the account JWT and seat token independently, derives both identities server-side, and writes one immutable link.
2. **Extend `finish_game`.** Rejected because the public anonymous completion path has a first-finisher race and optional JWT handling would couple account risk to match completion.
3. **Link the account at room join.** Rejected because abandoned rooms would look like completed participation and account changes before match end would require mutable ownership state.

The separate endpoint is strongest across Securable, Reliable, Maintainable, and Testable. Availability is preserved because anonymous completion remains unchanged. Scope is one table, one endpoint, one client helper, and one completion hook. Recommendation strength: strong. Confidence: high.

## In scope

- Add immutable migration 014 for owner-private `match_participants` rows.
- Add an account-aware `claim_match` Edge Function with explicit in-handler JWT validation.
- Require the existing seat token for the same `roomId + playerId` in addition to the account JWT.
- Require a finished room and existing `match_scores` row before attribution.
- Derive `user_id` only from the validated JWT and `tank_id` only from the ordered server room roster.
- Add an authenticated bearer override to the existing centralized client Edge transport while retaining the publishable key in `apikey`.
- After the existing `finish_game` attempt settles, let a signed-in `NetworkClient` claim its own seat with bounded retry. Anonymous clients skip the call.
- Add migration, Edge, transport, helper, and causal NetworkClient tests before implementation.

## Out of scope

- XP, levels, unlocks, rank, streaks, aggregate counters, leaderboards, or progression UI.
- Trusting or storing a client-reported cumulative progression total.
- Changing `finish_game`, deterministic physics, the action log, Realtime, or seat-token authorization.
- Attributing hot-seat matches, bot seats, abandoned rooms, or matches without a persisted `match_scores` row.
- Requiring an account for network play.
- Google SSO, magic link, OTP, resend, SMTP, password recovery, account deletion, or spending.
- New dependencies, custom crypto, JWT parsing, or service-role exposure.

## Security contract

- `claim_match` receives only `{ roomId, playerId, token }` in the JSON body. It rejects and never uses client-supplied `userId`, `tankId`, result, score, XP, or total fields.
- The account bearer JWT is read only from `Authorization`. Supabase Auth `getUser(token)` validates it server-side; no claim is trusted from locally decoded JWT contents.
- The endpoint keeps `verify_jwt = false` so authentication errors are handled explicitly and compatibly with the existing function gateway. The handler must return 401 for missing, malformed, expired, or rejected account JWTs.
- `verifySeatToken` must confirm the bearer seat token for the supplied room and public player id. Membership must be checked against the server-owned ordered `rooms.players` roster.
- The room must be `finished`, and `match_scores(room_id)` must exist. The server derives `tank_id` as `p{roster index + 1}`.
- JWTs and seat tokens must not enter database rows, logs, URLs, Realtime, or error text.
- `match_participants` grants anonymous users no access. Authenticated users may SELECT only rows where `user_id = auth.uid()`. All direct client writes are revoked; only the service-role function inserts.
- Unique constraints allow at most one user per room and one claimant per room seat. Repeating the exact same claim is idempotent; a different claimant returns 409.

## Data model

`match_participants` contains:

- `room_id UUID`, referencing the unique `match_scores.room_id`, cascade delete.
- `user_id UUID`, referencing `auth.users.id`, cascade delete.
- `player_id UUID`, the public room-seat id verified by its secret token.
- `tank_id TEXT`, derived from roster order and constrained to `pN`.
- `created_at TIMESTAMPTZ`, server default.
- Primary key `(room_id, user_id)` and unique `(room_id, player_id)`.

The row records attribution only. It does not duplicate the scoreboard or calculate progression.

## Endpoint behavior

- `400`: malformed UUID-shaped room/player id or missing token body value.
- `401`: missing or invalid account bearer JWT.
- `403`: player is not a room member or seat token is invalid.
- `404`: room does not exist.
- `409 match_not_ready`: room is not finished or no score record exists yet.
- `409 claim_conflict`: this account already claimed another seat in the match, or this seat was claimed by another account.
- `200 { ok: true, linked: true }`: new link.
- `200 { ok: true, linked: false }`: exact idempotent replay.
- `500`: bounded generic persistence failure; operational logs contain ids and safe error text only, never credentials.

## Client behavior

- `callFunction` may receive an optional bearer token that replaces only the `Authorization` value; the configured publishable key remains in `apikey`.
- The match-claim helper asks the existing Supabase client for the current session only at claim time. No session means a successful anonymous skip. Session lookup failure or a non-success endpoint response is retryable and emits no credential-bearing error.
- `NetworkClient` starts the bounded claim only after the `finish_game` retry sequence settles. Claim failure never changes local GAME_OVER state or match completion.
- The claim body contains the same room id, public player id, and seat token already used by `finish_game`; the account JWT exists only in the header.

## Acceptance criteria

1. Missing/invalid JWT, invalid membership, invalid seat token, active room, missing score, conflicting claim, and database failure are causally tested.
2. A valid signed-in player receives one derived link to its own `pN` seat; exact replay is idempotent.
3. Tests prove a body-supplied user id or tank id cannot control the stored identities.
4. Anonymous NetworkClient completion makes no `claim_match` request and otherwise behaves unchanged.
5. Signed-in completion sends the account JWT only in `Authorization`, keeps the publishable key in `apikey`, and never includes JWT/user id/tank id in the body.
6. Migration tests prove owner-only reads, zero anonymous access, zero authenticated writes, service-only insertion, both uniqueness constraints, and immutable migration content.
7. Focused tests fail before implementation and pass after it; `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run build`, and `npm run audit:deps` pass.
8. One adversarial subagent reviews the spec, plan, sprint log, RED/GREEN/full tests, and final diff; all Critical, High, and other merge blockers are resolved.
9. Required hosted checks pass on the exact reviewed PR head before merge. After merge, deploy migration 014, `claim_match`, and the client; verify remote migration/config/function health; then verify anonymous production gameplay remains healthy. A real account claim is optional only if it can be created and removed without a user-only hard gate.

## Rollback

Client invocation can be removed independently, leaving an unused owner-private table and endpoint. Migration 014 is additive and must not be destructively rolled back in production; a later forward migration may disable access if required.

# Hosted Verified Replay Probe Specification

**Status:** Approved under the maintainer's standing bounded-sprint authority and explicit ADR-route approval on 2026-08-10
**Governs:** supabase/functions/verified_replay_probe/**, supabase/functions/_shared/mod.ts, supabase/functions/_shared/mod.test.ts, supabase/functions/_shared/verifiedReplayProbeFixture.ts, supabase/functions/_shared/verifiedMatchReplay.workload.test.ts, supabase/config.toml, .codearbiter/security-controls.md

## Problem

The shared deterministic verifier passes locally, but rank-eligible progression cannot advance safely until the deployed Supabase Edge runtime has proven that it can authenticate an account and execute the bounded shared-engine replay contract. The caller is the maintainer operating the production verification boundary. Done means production can run known maximum-total and maximum-per-turn replay workloads and return their exact derived outcomes without accepting a player transcript or mutating player, match, verification, progression, rank, reward, or entitlement state.

## Approach

Add one explicitly authenticated `verified_replay_probe` Edge Function that accepts no request body and runs two immutable server-owned fixtures through `replayVerifiedTranscript`: the 15-action/448-total-tick lifecycle ceiling and the 198-tick single-turn ceiling. This is preferred over accepting arbitrary transcripts because it proves Supabase bundling, Auth validation, shared-engine execution, deterministic results, and both resource ceilings without creating an untrusted compute API. The strongest counter-consideration is that it does not prove future transcript upload parsing; that remains deliberately deferred to the persistent verified-session milestone.

## Scope

In scope:

- Add a request-wrapper mode that rejects and cancels any POST body before JSON parsing while preserving every existing request mode.
- Add an explicit named per-IP rate-limit bucket for the replay probe.
- Add one server-owned fixture module covering the accepted maximum total-work and maximum per-turn-work contracts.
- Add an account-authenticated Edge handler that derives identity only through Supabase Auth, invokes only those fixtures, and returns a versioned deterministic response.
- Add exact unit, workload, configuration, and security-boundary coverage plus production deployment verification.

Out of scope:

- No client-selected configuration or transcript, verification session, result row, migration, progression write, XP, rank eligibility, reward, entitlement, matchmaking, anti-cheat claim, or player-facing UI.
- No change to anonymous hot-seat or online gameplay, seat-token authorization, casual progression, account UI, or lobby identity behavior.
- The queued account-to-lobby identity continuity task is a separate slice.

## Decided parameters

- Function name and limiter bucket: `verified_replay_probe`.
- Supabase gateway posture: `verify_jwt = false`; the handler validates exactly one strict Bearer credential through `supabase.auth.getUser`, matching existing account-aware functions.
- Request contract: POST with no body; any supplied body is rejected before JSON parsing and before replay.
- Probe version: `1`; engine version: `1`; ruleset version: `3`.
- Workloads: `maximumLifecycle` returns winner `p2`, winner team `2`, turn `13`, 15 actions, 448 ticks, and a 34-tick peak turn; `maximumTurn` returns winner `p1`, no winner team, turn `3`, 4 actions, 293 ticks, and a 198-tick peak turn.
- Rate limit: 10 requests per IP per 60-second window, using the existing operational `rate_limits` counter only.
- Response contains no user id, credential, request echo, timing measurement, stack, raw exception, progression field, or persistence identifier.
- Handler replay failures return one generic `probe_unavailable` response and log only a bounded error code/stage, never a credential or user identity.

## Acceptance criteria

1. A `withCors` handler configured for no-body mode returns 400 and cancels a supplied body before its wrapped handler runs, while an absent body reaches the handler and all existing JSON/optional-body tests remain unchanged.
2. `verified_replay_probe` returns 401 for a missing, malformed, duplicated, or Supabase-rejected Bearer credential and invokes neither replay fixture.
3. With a Supabase-accepted Bearer credential and no body, the probe returns exactly probe version 1, engine version 1, ruleset version 3, and the pinned deterministic results for `maximumLifecycle` and `maximumTurn`.
4. The production fixture module reaches the accepted limits exactly: `maximumLifecycle` consumes 15 actions and 448 total ticks, while `maximumTurn` consumes 198 ticks in one turn; the existing workload test imports these fixtures so endpoint and ceiling evidence cannot drift independently.
5. The handler performs no table, RPC, or persistence operation and returns no account id, credential, timing, progression, rank, reward, entitlement, or request-controlled field; only Supabase Auth validation and the outer operational rate-limit wrapper may access the service client.
6. Any replay exception returns status 500 with `{ "error": "probe_unavailable" }`; operational logging is bounded to the probe stage and safe replay error code and does not contain the Bearer token, authenticated user id, stack, or raw exception message.
7. `supabase/config.toml`, the shared limiter tests, and `security-controls.md` explicitly register `verified_replay_probe` as an account-authenticated, no-award, 10-per-minute function with no domain-state writes.
8. After exact-head hosted CI and merge, deploying only `verified_replay_probe` requires no migration; production returns the generic 401 contract without a valid account Bearer and returns both pinned deterministic fixture results with a Supabase-accepted account Bearer.

## Open questions

None.

# Authenticated Account Progression Summary

**Task:** `mvp2.progression.0002` under `mvp2.identity.0001`

## Problem

Completed network matches can now be linked immutably to authenticated accounts, but that durable history is not visible to players. The next progression slice should turn the linkage into a small useful read model without introducing an XP economy, trusting client-owned totals, or changing anonymous gameplay.

## Decision

Add an authenticated `account_summary` Edge Function that derives `matchesPlayed` and `wins` from the caller's owner-private `match_participants` rows and their persisted `match_scores` records. The handler derives the user id only from Supabase Auth, accepts no account id or totals from the request, and returns only bounded aggregate counts. The account panel shows the summary after profile restoration or sign-in and degrades to an unavailable summary without losing sign-out or the loaded profile.

The UI labels wins as recorded wins. `finish_game` persists bounded deterministic client results under the existing lockstep architecture; these counters are durable account history, not cheat-proof ranking authority.

## In scope

- Add `account_summary` with explicit bearer validation, rate limiting, safe failures, and no request-owned identity.
- Query only the authenticated user's immutable links, then derive one match count and winner count from persisted scores.
- Fail closed on query errors or inconsistent/missing score rows; never return partial totals.
- Extend the account profile state with a validated nullable summary.
- Render accessible Matches and Recorded wins values for authenticated profiles.
- Preserve anonymous accounts, hot-seat play, network seat-token authorization, and match claiming.
- Update security controls and deterministic source-contract checks for the twelfth deployed function.

## Out of scope

- XP, levels, unlocks, rank, streaks, leaderboards, rewards, or achievement tuning.
- A new progression table, migration, database trigger, RPC, dependency, or client-write path.
- Server-side physics replay or a claim that recorded outcomes are cheat-proof.
- Google SSO, email delivery, password recovery, or account-management expansion.
- Live in-match progression UI or mid-session polling.

## Security and correctness contract

- `account_summary` accepts no authoritative body fields. Supabase Auth must validate exactly one Bearer credential and supply the user id.
- The service-role client may read `match_participants` and `match_scores` only inside the function. No service credential enters client code, logs, responses, or repository state.
- The participant query is scoped to the authenticated user id. The score query is scoped to the linked room ids. A win is counted only when a persisted score's `winner` exactly equals that link's server-derived `tank_id`.
- Empty linkage returns `{ matchesPlayed: 0, wins: 0 }` without a score query.
- Duplicate, missing, malformed, or unrequested score data fails generically rather than understating or overstating totals.
- Returned counts are finite non-negative integers and `wins <= matchesPlayed`; the client rejects malformed responses to `null`.
- Logs contain a bounded stage and safe error text only, never JWTs, passwords, seat tokens, request headers, or account ids.

## Acceptance criteria

1. Missing, malformed, duplicated, or rejected Bearer credentials return 401 before any progression query.
2. The handler ignores request-owned identity/totals and scopes participant reads only to the Auth-derived user id.
3. Zero links returns exact zero counts. Multiple links produce exact match and recorded-win counts across wins, losses, and draws.
4. Participant failures, score failures, duplicate score rows, or missing linked scores return a generic 500 with no partial totals or sensitive output.
5. The configured client invokes `account_summary` through the authenticated Supabase session, validates the exact response shape, and maps unavailable, malformed, or five-second-timeout summaries to `null` while preserving the owner profile.
6. The authenticated account panel renders labeled Matches and Recorded wins values when available and an unobtrusive unavailable state otherwise; sign-out remains usable.
7. Anonymous/unconfigured account states and all gameplay paths remain behaviorally unchanged.
8. Focused Edge/client tests, mutation proofs, full local gates, state-free secret scan, and an adversarial final-diff review pass with no Critical, High, or merge-blocking finding.
9. Exact-head hosted checks pass before merge. After merge, deploy the function/config/client, verify `account_summary` rejects missing auth in production, verify Pages provenance and assets, and exercise an authenticated live summary only if an existing safe session is available without exposing credentials.

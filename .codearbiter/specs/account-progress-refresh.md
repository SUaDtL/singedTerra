# Immediate account progression refresh

Status: approved under standing sprint authority
Date: 2026-08-08
Task: mvp2.progression.0005

## Problem

When a signed-in network player finishes a match, `claim_match` links that match
to the account, but the persistent lobby account session is never told that the
link succeeded. Matches, wins, XP, level, and the XP meter therefore remain stale
until an auth event or page reload.

## Contract

1. After the existing bounded `claim_match` retry succeeds with `linked`, the
   network client emits one account-progress-dirty notification.
2. Anonymous completion, failed claims, retries that have not yet succeeded, and
   client teardown emit no notification.
3. The lobby exposes a small refresh command that delegates to its account
   session without coupling game code to Supabase or account rendering.
4. Refresh reloads only the currently authenticated profile. It preserves the
   visible profile while loading and silently keeps the prior snapshot if the
   optional refresh fails.
5. Refresh results cannot overwrite sign-out, a newer auth event, or disposal.
6. Main composition subscribes the active network client to the lobby refresh;
   hot-seat behavior remains unchanged.

## Acceptance

- A focused network-client test starts RED and proves exactly one notification
  after a successful signed-in match link.
- Focused negative tests prove no notification for anonymous, failed, or
  post-teardown completion.
- Account-session tests prove successful refresh and stale-operation safety.
- Lobby composition delegates refresh exactly once.
- Focused tests, the full client suite, deterministic/Edge gates, build,
  browser matrix, dependency audit, and diff hygiene pass.

## Non-goals

- Auth provider, password, Google SSO, JWT, RLS, schema, migration, Edge
  Function, progression formula, match-linkage, or reward changes.
- Polling, realtime account-summary subscriptions, in-game progression UI,
  celebrations, unlocks, ranks, leaderboards, or dependencies.

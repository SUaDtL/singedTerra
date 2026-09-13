# Room cleanup repair and rollout

The owner reported 65 rooms marked active despite typically having 0–2 players.
An active row is not a connected-player count. The old handlers rejected started
room heartbeats and quits, and cleanup ran only when somebody browsed rooms.
The owner selected a ten-minute grace after all humans stop responding.

## Behavior and compatibility

- A running network client sends authenticated presence immediately and every
  30 seconds, including idle turns. Reload, lost connection and ordinary resource
  disposal stop presence without signaling a quit.
- Explicit Quit marks the human seat departed. The last human quit retires the
  room immediately; bots never keep a room open. Departed seats cannot authorize
  new actions, a first completion, or a new rematch. Existing immutable receipts
  remain available. If any peer has quit, remaining players create a fresh room
  rather than reviving departed peers through a rematch.
- Once every nondeparted human has been absent for ten minutes, the scheduled
  sweep marks the room `finished` and sets `abandoned_at`. A heartbeat arriving
  after that cutoff also enforces expiry. Heartbeat, quit, append, completion and
  expiry serialize through the room row lock.
- Retirement preserves the room, original roster, canonical action log, seat
  credentials and existing receipts. It never invents a winner or match award.
- Create/join explicitly negotiate `roomLifecycleVersion: 1`. Existing rooms and
  older clients are excluded from automatic timeout. Migration 023 does not rewrite
  their rows. Start and rematch initialize a fresh server-clock lease, independent
  of old lobby timestamps.
- A missed Realtime abandonment message is recovered from the next authenticated
  heartbeat response. Late callbacks from a disposed match cannot clear a newer
  match's resume descriptor.

## Verification

The regression obligations are active presence, explicit quit, ten-minute expiry,
human/CPU and seat-authority boundaries, immutable history, zero-request scheduled
execution, client timer ownership, and legacy preservation. Causal failing tests
preceded their fixes in the real handlers, client owners, PostgreSQL transactions,
and scheduled worker.

`npm run check:database` now includes the disposable PostgreSQL 15 lifecycle suite.
It covers successful legacy human/CPU actions before exact permission refusal,
versioned actions, first completion, immutable retry, admission, rematch leases,
expiry boundaries, grants, and concurrent terminal transitions. Existing database
and interrupted-release rehearsals remain included.

`node scripts/checks/room-lifecycle-scheduler.mjs` is an explicitly isolated local
functional test using the cached, digest-pinned Supabase PostgreSQL 17 image. It
observes actual scheduled execution, preserved history, idempotent repeats and
failed-job reporting. The one-second test interval differs from the production
one-minute schedule. The test image's pg_cron 1.6.4 is **not approved for production**;
the same test proves the production installer refuses that version before creating
a job. No host port, host mount, credentials or production data enters this test.

## Production rollout requires explicit approval

1. Merge the reviewed change after required CI passes. Automatic Pages publication
   may precede the separately approved backend release. The client handles an old
   schema by retrying only a missing `abandoned_at` projection with the original
   public columns. An old server's rooms remain legacy until new admission code
   is deployed; the client never invents timeout capability.
2. Approve the existing protected backend workflow for the merged source and its
   exact `supabase/backend-release-manifest.json` digest. Apply migration 023 and
   deploy the manifest's function set. Migration 023 revokes the old internal
   legacy action RPC, so legacy action requests fail closed during the interval
   before the matching `submit_action` function finishes deploying. Confirm both
   human and CPU-proxy legacy requests after deployment. Client wire protocols
   and versioned command receipts remain supported.
3. **Do not enable the scheduler on the currently available extension.** A read-only
   production check on 2026-09-12 found PostgreSQL 17.6 and only pg_cron versions up
   to 1.6.4, with none installed. The published Supabase 17.6.1.155 source has no
   identified backport of GHSA-j8p5-79jf-g575. Supabase must provide an upstream
   version at least 1.6.5 or independently verifiable vendor fix. A database upgrade
   and its downtime require a separate concrete approval; no safe target is yet
   established.
4. Once that prerequisite is verified and approved, execute the separately reviewed
   `supabase/ops/enable_room_cleanup.sql` by its recorded content digest. It is not
   part of automatic migrations or the schema-v1 backend manifest. It installs one
   fixed named SQL job, `singedterra-room-cleanup`, every minute. It has no HTTP
   endpoint or service-key payload. Verify `cron.job` and actual
   `cron.job_run_details` success, then a bounded synthetic room's transition with
   no client requests. A sweep locks at most 200 eligible rooms, skips held locks,
   and rechecks current presence before each retirement.

Until step 4 is proven, zero-player automatic production cleanup is **not deployed**.
Successful local tests or merging this PR do not establish that operational result.

## Legacy inventory and rollback

The existing legacy rooms are deliberately not bulk-retired by installation.
Before proposing cleanup, take a fresh bounded inventory of active room IDs,
creation/last-action times, current migration/capability, and historical receipt
counts. Old lobby-heartbeat timestamps alone do not prove disconnection. Present
the exact candidate set and an exclusion for recent activity, then obtain approval
for a locked, conditional `finished`/`abandoned_at` update that preserves all history.
No such production data update has been executed or implicitly authorized here.

To disable scheduled expiry, unschedule only `singedterra-room-cleanup`. Do not drop
pg_cron, which could remove other applications' jobs. Retain migration 023 and all
terminal/history rows; recover forward with corrected functions/client code.

Sources: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_cron security advisory](https://github.com/google/security-research/security/advisories/GHSA-j8p5-79jf-g575),
[Supabase 17.6.1.155 extension inventory](https://raw.githubusercontent.com/supabase/postgres/17.6.1.155/nix/ext/versions.json),
[supported database upgrades](https://supabase.com/docs/guides/platform/upgrading).

# Migration conventions

Postgres migrations for the singedTerra backend (the `rooms`, `room_actions`,
`match_scores`, `rate_limits`, `room_seats` tables and their RPCs). Applied in
filename order by the "Deploy backend" workflow (`supabase db push`).

## Rules

For migration 017, follow the [Verified V2 cutover and forward-recovery procedure](../../docs/VERIFIED_V2_CUTOVER.md). It records admission draining, backend-before-client ordering, compatible recovery, and immutable-result preservation.

1. **Immutable once applied.** Never edit a migration that has shipped. Fix or
   change a shipped object with a **new, higher-numbered** migration. (See `009`
   re-declaring `007`'s function rather than editing it in place.)

2. **Forward-only and non-destructive.** Migrations move the schema forward; they
   do not roll back. Prefer additive changes. A destructive change (drop/rewrite)
   must be justified in the migration header.

3. **Idempotent where practical.** Use `CREATE ... IF NOT EXISTS`,
   `CREATE OR REPLACE`, and `ON CONFLICT` so a re-run (or a partially-applied
   deploy) is safe.

4. **Header comment required.** Each migration opens with: version, date, the
   *why* (the problem it solves, linked to the review/issue), and the safety
   posture (additive vs. destructive, lock profile).

5. **RLS posture is load-bearing.** New tables keep the project posture — `anon`
   role: public `SELECT`, zero writes; all mutations via service-role RPCs with
   `REVOKE ... FROM PUBLIC` / `GRANT ... TO service_role`. Do not weaken it. (See
   `.codearbiter/security-controls.md`.)

6. **Data-classification comment** on new columns/tables that hold identity or
   secret material, per the convention `005` established.

## Routine access and overload delivery checks

Every new application RPC signature must revoke `EXECUTE` from `PUBLIC`, `anon`
and `authenticated`, and grant it explicitly to the supported `service_role`
caller. Internal helpers may remain owner-only. Changing argument types creates
an overload: an existing signature's ACL does not protect the new one.

The required `npm run check:database` lane runs `room-lifecycle-postgres.mjs`
against the complete sorted migration inventory. Its catalog guard rejects
public-schema routines owned by the role applying those migrations when `PUBLIC`,
`anon` or `authenticated` can execute them. It checks every overload and excludes
extension members through `pg_depend`, preserving extension-managed access.
There are no browser-callable application routine exceptions in this inventory.
Any future exception needs its own reviewed exact-signature contract and check;
do not silently exempt unknown names. Service-role RPC calls and owner-only
helpers keep their existing grants.

Negative controls create a fresh function and overload, demonstrate default
public execution, and require the guard to detect both. Explicit revocation plus
a service-role grant must then deny both browser roles while permitting the
service caller. A separate explicit `authenticated` grant must also be detected.
These objects exist only in the isolated test database.

This is a migration-delivery guard, not a runtime DDL policy. Its boundary is the
current migration owner's application routines in `public`; functions created
by other roles, other schemas, and extension-owned routines are outside it.
The harness verifies those exclusions. It does not change database defaults.
A schema-only `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ... FROM PUBLIC`
cannot remove PostgreSQL's built-in global grant. An owner-global revocation
would also affect that owner's future routines outside `public`, so this
maintenance uses the scoped required check instead. See the
[PostgreSQL 15 default-privilege rules](https://www.postgresql.org/docs/15/sql-alterdefaultprivileges.html).

## Current security and cursor metadata

Migration `004`'s historical `SECURITY INVOKER` rationale must not be read as RLS
protection against its service caller: `service_role` bypasses RLS. Its execution
ACL was the application access boundary. Migration `023` subsequently revoked
that old `submit_room_action` signature from all application roles; supported
legacy submissions use `submit_room_action_for_seat`. Migration `025` corrects
the live function comment without editing `004` or restoring old grants.

`rooms.active_player_index` is load-bearing current-actor gating state, not
display-only metadata. The thin referee persists the client-reported successor;
the clients' deterministic engines retain turn-order authority. The referee
does not independently validate physics, aliveness or round phase, as accepted
in [ADR-0008](../../.codearbiter/decisions/0008-referee-turn-authority.md).
`rooms.turn` also gates stale legacy submissions under the room lock. Neither is
a seat credential. Migration `025` corrects these live column comments while
preserving the historical classification migration `011`.

## Index creation on hot / high-write tables — use `CONCURRENTLY`

A plain `CREATE INDEX` takes a lock that **blocks writes** to the table for the
duration of the build. On a per-request, high-write table (`rate_limits`,
`room_actions`), that is a write stall for every concurrent request. Build such
indexes **`CREATE INDEX CONCURRENTLY`**, which does not block writes.

Caveat: `CONCURRENTLY` **cannot run inside a transaction block**, so it must be
its own migration (or the runner must be configured to not wrap it), and a failed
concurrent build leaves an `INVALID` index that a later migration must drop and
rebuild.

### Accepted trade-off: `008`'s `rate_limits_window_idx` (GH #93)

`008_rate_limits_global_cleanup.sql` created `rate_limits_window_idx` with a plain
`CREATE INDEX IF NOT EXISTS` (no `CONCURRENTLY`). This is a **recorded, accepted
one-time exception**: at the project's request volume the build was sub-second and
the index is already live, so recreating it concurrently now would churn a working
production index for no functional benefit (a fresh deploy builds it against an
empty, traffic-free table). It is documented here so future index migrations on
hot tables follow the concurrent pattern rather than copying `008`. Do not treat
`008` as the template.

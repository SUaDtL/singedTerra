# Migration conventions

Postgres migrations for the singedTerra backend (the `rooms`, `room_actions`,
`match_scores`, `rate_limits`, `room_seats` tables and their RPCs). Applied in
filename order by the "Deploy backend" workflow (`supabase db push`).

## Rules

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

# Edge Logging Context

## User value

When a networked room fails at the Edge boundary, operators need to identify the
affected room and action without exposing raw Supabase/Postgres error objects.
Sequence conflicts must be distinguishable from unexpected RPC failures.

## Scope

- Replace raw Supabase error-object arguments in `supabase/functions/` logs with
  bounded `error.message` (or a fixed fallback) fields.
- Add stable room/player context to logs where those values are already in the
  handler scope; use room code context for `join_room` and avoid logging tokens.
- Correlate `submit_action` sequence-conflict logs with room and player context.
- Preserve all HTTP response bodies/statuses, action payloads, authorization,
  database behavior, and rate-limit behavior.

Out of scope: auth or token changes, secrets, cryptography, migrations, schema,
new dependencies, response/action protocol changes, and remote logging services.

## Acceptance criteria

1. No Edge handler logs a raw Supabase/Postgres error object.
2. Error logs retain a bounded message field and available safe correlation
   context; seat tokens and service-role values are never logged.
3. `submit_action` sequence-conflict logs identify the room and player and remain
   distinguishable from unexpected RPC errors.
4. Existing response and behavior tests remain green, with focused RED tests
   proving the logging contract before implementation.

## SMARTS decision

Selected over the stale/implemented UI backlog and the hard-gated security-
controls refresh. It has high Signal and User value for diagnosing live network
failures, is Maintainable as a mechanical logging-only change, Available without
new dependencies or backend schema work, Reliable because safe responses remain
unchanged, Testable through a pure log normalization seam, and Small in scope.
Confidence: high.

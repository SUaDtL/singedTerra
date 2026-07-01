-- singedTerra — Bound rate_limits growth (global stale-window cleanup)
-- Version: 008
-- Date: 2026-07-01
--
-- migration 005's bump_rate_limit() cleaned up stale windows ONLY for the bucket
-- currently being incremented (WHERE bucket = p_bucket AND window_start < ...). So a
-- distinct attacker IP that hits the service once and never returns left its row in
-- rate_limits forever — the table grew unbounded under distinct-IP abuse with no
-- expiry path (review 2026-06-25, migration-002 / GH #65).
--
-- Fix: make the opportunistic cleanup GLOBAL (drop the per-bucket predicate) so every
-- call reaps ALL windows older than the last two, including dead distinct-IP buckets.
-- An index on window_start keeps the range-delete cheap (it can't use the composite PK
-- prefix, whose leading column is `bucket`), so the cleanup stays a bounded index scan
-- on the hot path rather than a full-table scan.
--
-- Chosen over a pg_cron scheduled job: this needs no extension enabled and cannot fall
-- silently un-scheduled; at this project's request volume the per-call reap of a handful
-- of stale rows is negligible. Forward-only + idempotent (CREATE OR REPLACE / IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);

CREATE OR REPLACE FUNCTION bump_rate_limit(
  p_bucket TEXT,
  p_window BIGINT
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (p_bucket, p_window, 1)
  ON CONFLICT (bucket, window_start)
    DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  -- GLOBAL opportunistic cleanup (was per-bucket in 005): drop EVERY bucket's windows
  -- older than the last two, so dead distinct-IP buckets can't accumulate. Index-assisted
  -- via rate_limits_window_idx; deletes nothing on the common path (already reaped).
  DELETE FROM rate_limits
   WHERE window_start < p_window - 1;

  RETURN v_count;
END;
$$;

-- Re-assert the grant posture (CREATE OR REPLACE preserves grants, but keep it explicit
-- and pinned to the exact signature — see migration 005's note).
REVOKE EXECUTE ON FUNCTION bump_rate_limit(TEXT, BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bump_rate_limit(TEXT, BIGINT) TO service_role;

-- DOWN (manual rollback): restore the per-bucket cleanup from migration 005 and
--   DROP INDEX rate_limits_window_idx;

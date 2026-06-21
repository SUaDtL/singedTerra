-- singedTerra — Per-IP rate limiting for the public Edge Functions
-- Version: 005
-- Date: 2026-06-21
--
-- All 10 Edge Functions are verify_jwt=false public POST endpoints. With the repo
-- going public the Supabase project becomes a discoverable target, so this adds a
-- per-IP fixed-window request limiter (resolves open-questions CONFIRM-04). Additive
-- and forward-only: a new table + a service-role-only counter RPC; migrations 001–004
-- are untouched.
--
-- MODEL
-- -----
-- Each (bucket, window) pair counts requests, where bucket = "<function>:<ip>" and
-- window = floor(unix_seconds / 60) (a 60s fixed window). bump_rate_limit() does one
-- atomic upsert-increment and returns the post-increment count; the Edge Function
-- compares it to the per-function limit (the limits live in the app as named
-- constants, so tuning them needs no migration). This extends the existing control
-- model (service-role-only writes) rather than introducing a new mechanism.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT   NOT NULL,   -- "<function>:<ip>", e.g. "create_room:1.2.3.4"
  window_start BIGINT NOT NULL,   -- epoch-minute: floor(unix_seconds / 60)
  count        INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- classification: internal (no PII; derived IP + counters only)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies are defined => the anon role has neither read nor write access. Only the
-- service_role client (used by the Edge Function referee), which bypasses RLS, ever
-- touches this table, and exclusively through bump_rate_limit() below.

-- Atomic check-and-increment for one (bucket, window). Returns the post-increment
-- count; the caller decides allow/deny against its limit.
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

  -- Opportunistic cleanup: drop this bucket's stale windows so the table cannot grow
  -- unbounded. Cheap, runs under the same call, scoped to the one bucket.
  DELETE FROM rate_limits
   WHERE bucket = p_bucket AND window_start < p_window - 1;

  RETURN v_count;
END;
$$;

-- SECURITY: the only caller is the service_role Edge Function client, which BYPASSES
-- RLS — so the real access control on this function is the grant below, NOT RLS.
-- Revoke the default PUBLIC EXECUTE and grant only service_role, so an anon client
-- cannot reach it via the PostgREST /rpc endpoint.
-- LOCKSTEP NOTE: these two lines name the EXACT arg-type signature. If the signature
-- ever changes, update both — otherwise Postgres re-adds the default PUBLIC EXECUTE
-- grant on the new overload and it persists.
REVOKE EXECUTE ON FUNCTION bump_rate_limit(TEXT, BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bump_rate_limit(TEXT, BIGINT) TO service_role;

-- DOWN (manual rollback):
--   DROP FUNCTION bump_rate_limit(TEXT, BIGINT);
--   DROP TABLE rate_limits;

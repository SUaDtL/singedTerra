-- singedTerra — Guard apply_room_reap against a room-active TOCTOU race
-- Version: 009
-- Date: 2026-07-02
--
-- apply_room_reap's DELETE and UPDATE (migration 007) carried no `status`
-- predicate. list_rooms computes p_dead / p_trims from a SNAPSHOT of rooms
-- fetched at the start of the call; if a room flips 'waiting' -> 'active'
-- (e.g. via ready_up) in the window between that snapshot and this RPC
-- actually running, the stale snapshot still says "reap it" — so an
-- in-progress game's room could be DELETEd (cascading to room_actions and
-- destroying the canonical action log) or have its just-started roster
-- clobbered by the UPDATE (tribunal migration-001, HIGH).
--
-- Fix: re-check status = 'waiting' AT WRITE TIME on both statements, so a
-- room that has since gone active is left alone regardless of what the
-- caller's stale snapshot believed. CREATE OR REPLACE keeps the same
-- signature as 007 (immutable migrations — 007 is not edited in place).
-- Additive + forward-only.

CREATE OR REPLACE FUNCTION apply_room_reap(
  p_dead  UUID[],
  p_trims JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_dead IS NOT NULL AND array_length(p_dead, 1) IS NOT NULL THEN
    DELETE FROM rooms WHERE id = ANY(p_dead) AND status = 'waiting';
  END IF;

  IF p_trims IS NOT NULL AND jsonb_typeof(p_trims) = 'array' AND jsonb_array_length(p_trims) > 0 THEN
    UPDATE rooms r
       SET players = t.players
      FROM jsonb_to_recordset(p_trims) AS t(id UUID, players JSONB)
     WHERE r.id = t.id AND r.status = 'waiting';
  END IF;
END;
$$;

-- SECURITY: the only caller is the service_role Edge Function client, which BYPASSES
-- RLS — so the real access control is the grant below, NOT RLS. Revoke the default
-- PUBLIC EXECUTE and grant only service_role so an anon client cannot reach it via
-- the PostgREST /rpc endpoint. (Mirrors bump_rate_limit / submit_room_action.)
-- LOCKSTEP NOTE: these two lines name the EXACT arg-type signature; if it ever
-- changes, update both or Postgres re-adds the default PUBLIC EXECUTE on the new overload.
-- Re-issued here because CREATE OR REPLACE resets grants to the function owner's default.
REVOKE EXECUTE ON FUNCTION apply_room_reap(UUID[], JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_room_reap(UUID[], JSONB) TO service_role;

-- DOWN (manual rollback): restore the unguarded 007 body (DELETE/UPDATE without the
--   status = 'waiting' predicates) via another CREATE OR REPLACE, or:
--   DROP FUNCTION apply_room_reap(UUID[], JSONB);

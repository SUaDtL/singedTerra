-- singedTerra — Batched lazy-GC reap for list_rooms
-- Version: 007
-- Date: 2026-07-01
--
-- list_rooms lazily reaps stale players from every waiting room on each poll. It
-- previously issued one DELETE (fully-dead room) or one UPDATE (trim ghosts) per
-- affected room inside a loop — an O(N) burst of sequential round-trips per call
-- on a polled endpoint (review 2026-06-25, performance-001 / GH #62).
--
-- This function applies the reap the Edge Function ALREADY computed in TS (the
-- reap() staleness logic stays single-sourced in _shared/mod.ts rather than being
-- re-implemented in SQL — see the PR discussion) in ONE round-trip: a batched
-- delete of the fully-dead ids + a batched, per-row
-- players update from a JSON array. Additive + forward-only; no existing object changes.
--
--   p_dead   : uuid[]  — ids of rooms whose roster fully aged out (delete them)
--   p_trims  : jsonb   — [{ "id": <uuid>, "players": <jsonb array> }, ...] rooms to trim

CREATE OR REPLACE FUNCTION apply_room_reap(
  p_dead  UUID[],
  p_trims JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_dead IS NOT NULL AND array_length(p_dead, 1) IS NOT NULL THEN
    DELETE FROM rooms WHERE id = ANY(p_dead);
  END IF;

  IF p_trims IS NOT NULL AND jsonb_typeof(p_trims) = 'array' AND jsonb_array_length(p_trims) > 0 THEN
    UPDATE rooms r
       SET players = t.players
      FROM jsonb_to_recordset(p_trims) AS t(id UUID, players JSONB)
     WHERE r.id = t.id;
  END IF;
END;
$$;

-- SECURITY: the only caller is the service_role Edge Function client, which BYPASSES
-- RLS — so the real access control is the grant below, NOT RLS. Revoke the default
-- PUBLIC EXECUTE and grant only service_role so an anon client cannot reach it via
-- the PostgREST /rpc endpoint. (Mirrors bump_rate_limit / submit_room_action.)
-- LOCKSTEP NOTE: these two lines name the EXACT arg-type signature; if it ever
-- changes, update both or Postgres re-adds the default PUBLIC EXECUTE on the new overload.
REVOKE EXECUTE ON FUNCTION apply_room_reap(UUID[], JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_room_reap(UUID[], JSONB) TO service_role;

-- DOWN (manual rollback):
--   DROP FUNCTION apply_room_reap(UUID[], JSONB);

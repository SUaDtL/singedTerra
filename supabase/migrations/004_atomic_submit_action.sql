-- singedTerra — Atomic submit-action plpgsql function
-- Version: 004
-- Date: 2026-06-20
--
-- Replaces the three-step TypeScript sequence (SELECT max seq → INSERT room_actions
-- → UPDATE rooms) with a single Postgres transaction that is serialised per room via
-- a FOR UPDATE lock.  This eliminates the seq-race window that existed between the
-- SELECT and the INSERT in the old Edge Function code.
--
-- ATOMICITY GUARANTEE
-- -------------------
-- All three mutations (seq allocation, action insert, optional cursor advance) run
-- inside one plpgsql function body, which Postgres wraps in a single statement-level
-- transaction.  Either all succeed or all roll back — there can be no orphaned
-- room_actions row without a matching cursor advance, nor a cursor advance without
-- its action row.
--
-- SERIALISATION GUARANTEE
-- -----------------------
-- PERFORM … FOR UPDATE on the rooms row acquires a row-level exclusive lock for the
-- duration of the function call.  Concurrent calls for the same room_id block until
-- the first one commits or rolls back.  This makes the MAX(seq)+1 allocation
-- deterministic: no two callers can observe the same maximum and derive the same
-- next seq.  The UNIQUE(room_id, seq) constraint on room_actions is retained as a
-- belt-and-suspenders guard against any future caller that bypasses this function.
--
-- SECURITY RATIONALE
-- ------------------
-- The function is SECURITY INVOKER (the default — no SECURITY DEFINER).  That means
-- it runs under the role of the caller, so Postgres RLS on rooms and room_actions
-- still applies.  Only the service_role client (used by the Edge Function referee)
-- has EXECUTE permission; anon cannot call this function directly even if it somehow
-- obtained the PostgREST /rpc endpoint.  PUBLIC EXECUTE is explicitly revoked.

CREATE OR REPLACE FUNCTION submit_room_action(
  p_room_id   UUID,
  p_player_id TEXT,
  p_action    JSONB,
  p_ends_turn BOOLEAN,
  p_next_index INT,
  p_next_turn  INT
) RETURNS INT
LANGUAGE plpgsql          -- SECURITY INVOKER (default) on purpose: RLS still governs the caller
AS $$
DECLARE v_seq INT;
BEGIN
  -- Acquire a row-level exclusive lock on the room row for the duration of this
  -- function.  All concurrent submit_room_action calls for the same room_id will
  -- block here until we commit, eliminating the seq-race entirely.
  PERFORM 1 FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    -- No such room: the FOR UPDATE matched nothing, so the per-room serialization
    -- guarantee would silently not hold. Fail loudly and roll back rather than
    -- proceeding to an INSERT that would hit the room_actions→rooms FK (23503).
    -- Defense-in-depth: the Edge Function verifies the room exists+active before
    -- calling, so this only fires in a TOCTOU window (room deleted in between).
    RAISE EXCEPTION 'room % not found', p_room_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Compute the next seq atomically under the lock.
  SELECT COALESCE(MAX(seq) + 1, 0) INTO v_seq
    FROM room_actions
   WHERE room_id = p_room_id;

  -- Insert the action row.  The UNIQUE(room_id, seq) constraint remains as a
  -- safety net; under the FOR UPDATE lock a 23505 violation should never occur
  -- via this function, but direct inserts that bypass it are still caught.
  INSERT INTO room_actions (room_id, seq, player_id, action)
    VALUES (p_room_id, v_seq, p_player_id, p_action);

  -- Advance the active-player cursor only for turn-ending actions (fire /
  -- use_shield).  Buy and next_round are cursor-neutral; in those cases the
  -- caller passes p_ends_turn = FALSE and the UPDATE is skipped.
  IF p_ends_turn THEN
    UPDATE rooms
       SET active_player_index = p_next_index,
           turn                = p_next_turn
     WHERE id = p_room_id;
  END IF;

  -- Return the allocated seq so the Edge Function can echo it to the client.
  RETURN v_seq;
END;
$$;

-- Revoke the default PUBLIC execute grant that Postgres adds to new functions,
-- then grant it only to service_role (the Edge Function referee).  The anon
-- role — used by every browser client — cannot call this function.
-- LOCKSTEP NOTE: these two lines name the EXACT arg-type signature. If the
-- function signature ever changes, update both in lockstep — otherwise Postgres
-- re-adds the default PUBLIC EXECUTE grant on the new overload and it persists.
REVOKE EXECUTE ON FUNCTION submit_room_action(UUID, TEXT, JSONB, BOOLEAN, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_room_action(UUID, TEXT, JSONB, BOOLEAN, INT, INT) TO service_role;

-- DOWN (manual rollback): DROP FUNCTION submit_room_action(UUID, TEXT, JSONB, BOOLEAN, INT, INT);

-- 025, 2026-10-29: close roster and legacy-turn races from the project checkpoint
-- (SEC-M1 / MIG-LEGACY-TURN-001). Add one service-only RPC and replace the existing
-- legacy function without changing its signature. No table rewrite or deletion;
-- each operation holds one room row lock, bounded by a three-second lock timeout.
-- Deploy this additive migration before its matching update_player Edge handler.
-- Forward recovery preserves these checks and existing data; never restore an
-- unlocked roster PATCH or the old unchecked legacy-turn implementation.
-- B048/B060: forward metadata corrections take brief catalog locks; historical
-- 004/011 remain immutable. B047 is enforced by the required SQL delivery guard,
-- without changing global defaults or existing routine grants here.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_room_player(
  p_room_id uuid, p_player_id text, p_token text, p_changes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_room public.rooms%ROWTYPE; v_players jsonb; v_now timestamptz;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_changes');
  END IF;
  IF p_changes = '{}'::jsonb OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_changes) key WHERE key NOT IN ('name','color','loadout')
  ) THEN RETURN jsonb_build_object('ok',false,'error','invalid_changes'); END IF;
  IF p_changes ? 'name' AND (jsonb_typeof(p_changes->'name') <> 'string'
      OR length(btrim(p_changes->>'name')) NOT BETWEEN 1 AND 20) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_changes');
  END IF;
  IF p_changes ? 'color' AND (jsonb_typeof(p_changes->'color') <> 'string'
      OR btrim(p_changes->>'color') !~ '^#[0-9a-fA-F]{3,8}$') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_changes');
  END IF;
  IF p_changes ? 'loadout' THEN
    IF jsonb_typeof(p_changes->'loadout') <> 'object' THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_changes');
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_changes->'loadout')) <> 4 OR
      NOT (p_changes->'loadout' ?& ARRAY['treads','hull','turret','barrel']) OR EXISTS (
        SELECT 1 FROM jsonb_each(p_changes->'loadout') part
        WHERE jsonb_typeof(part.value) <> 'string'
          OR part.value #>> '{}' NOT IN ('foundry','ranger','bulwark','jackal')
      ) THEN RETURN jsonb_build_object('ok',false,'error','invalid_changes'); END IF;
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'waiting' THEN
    RETURN jsonb_build_object('ok',false,'error','room_not_waiting');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_seats WHERE room_id=p_room_id
      AND seat_id=p_player_id AND token=p_token AND p_token<>'' AND left_at IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_seat_token');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
      WHERE player->>'id'=p_player_id AND player->>'ai' IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','player_not_in_room');
  END IF;
  IF p_changes ? 'name' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
      WHERE player->>'id'<>p_player_id AND lower(btrim(player->>'name'))=lower(btrim(p_changes->>'name'))) THEN
    RETURN jsonb_build_object('ok',false,'error','name_conflict');
  END IF;
  IF p_changes ? 'color' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
      WHERE player->>'id'<>p_player_id AND player->>'color'=p_changes->>'color') THEN
    RETURN jsonb_build_object('ok',false,'error','color_conflict');
  END IF;
  IF p_changes ? 'name' THEN p_changes:=jsonb_set(p_changes,'{name}',to_jsonb(btrim(p_changes->>'name'))); END IF;
  v_now:=clock_timestamp();
  SELECT jsonb_agg(CASE WHEN player->>'id'=p_player_id THEN
    player || p_changes || jsonb_build_object('lastSeen',floor(extract(epoch FROM v_now)*1000))
    ELSE player END ORDER BY ordinal) INTO v_players
    FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS roster(player,ordinal);
  UPDATE public.room_seats SET last_seen_at=v_now WHERE room_id=p_room_id AND seat_id=p_player_id;
  UPDATE public.rooms SET players=v_players WHERE id=p_room_id;
  RETURN jsonb_build_object('ok',true,'players',v_players);
END;
$$;
REVOKE ALL ON FUNCTION public.update_room_player(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_room_player(uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_room_action_for_seat(
  p_room_id uuid,p_submitter_id text,p_token text,p_player_id text,p_action jsonb,
  p_ends_turn boolean,p_next_index integer,p_next_turn integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_room public.rooms%ROWTYPE; v_seq integer; v_actor_index integer;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'active' OR NOT EXISTS (
    SELECT 1 FROM public.room_seats WHERE room_id=p_room_id AND seat_id=p_submitter_id
      AND token=p_token AND p_token<>'' AND left_at IS NULL
  ) OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
    WHERE player->>'id'=p_submitter_id AND player->>'ai' IS NULL)
  THEN RAISE EXCEPTION 'seat unavailable' USING ERRCODE='42501'; END IF;
  SELECT ordinal-1 INTO v_actor_index
    FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS roster(player,ordinal)
    WHERE player->>'id'=p_player_id AND (p_player_id=p_submitter_id OR player->>'ai' IN ('easy','medium','hard'));
  IF v_actor_index IS NULL THEN RAISE EXCEPTION 'actor unavailable' USING ERRCODE='42501'; END IF;
  IF p_ends_turn IS DISTINCT FROM (p_action->>'type' IN ('fire','use_shield')) THEN
    RAISE EXCEPTION 'invalid turn transition' USING ERRCODE='22023';
  END IF;
  -- Edge computes this next turn from its room snapshot, not a client field.
  -- Reconstruct that expected turn without introducing a new RPC/wire version.
  IF v_room.turn IS DISTINCT FROM (p_next_turn-CASE WHEN p_ends_turn THEN 1 ELSE 0 END) THEN
    RAISE EXCEPTION 'stale legacy turn' USING ERRCODE='40001';
  END IF;
  IF p_action->>'type'='buy' AND p_action ? 'tankId' THEN
    IF p_action->>'tankId' IS DISTINCT FROM ('p'||(v_actor_index+1)::text) THEN
      RAISE EXCEPTION 'actor unavailable' USING ERRCODE='42501';
    END IF;
  ELSIF p_action->>'type'<>'next_round' AND v_actor_index<>v_room.active_player_index THEN
    RAISE EXCEPTION 'stale legacy turn' USING ERRCODE='40001';
  END IF;
  SELECT COALESCE(max(seq)+1,0) INTO v_seq FROM public.room_actions WHERE room_id=p_room_id;
  INSERT INTO public.room_actions(room_id,seq,player_id,action) VALUES(p_room_id,v_seq,p_player_id,p_action);
  IF p_ends_turn THEN
    UPDATE public.rooms SET active_player_index=p_next_index,turn=p_next_turn WHERE id=p_room_id;
  END IF;
  RETURN v_seq;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer) TO service_role;

COMMENT ON FUNCTION public.submit_room_action(uuid,text,jsonb,boolean,integer,integer) IS
  'Historical SECURITY INVOKER routine: service_role bypasses RLS; EXECUTE ACLs, not RLS, bounded application access. Migration 023 revoked EXECUTE from PUBLIC, anon, authenticated and service_role. Live legacy submissions use submit_room_action_for_seat with seat and locked-turn checks.';
COMMENT ON COLUMN public.rooms.active_player_index IS
  'classification: PUBLIC - client-reported successor cursor persisted by the thin referee and used for current-actor gating (ADR-0008); not a seat credential. Clients retain engine turn-order authority; the referee does not validate physics, aliveness or round phase.';
COMMENT ON COLUMN public.rooms.turn IS
  'classification: PUBLIC - monotonic referee turn counter used to reject stale legacy submissions under the room lock; not a seat credential or server-authoritative engine state.';
COMMIT;

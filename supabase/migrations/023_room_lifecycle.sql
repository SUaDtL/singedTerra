-- Active room presence and retirement. Forward-only, no existing row is reaped.
-- Lifecycle v1 is explicitly negotiated at creation/admission, not inferred from
-- the engine or command version. Legacy active rooms have no start lease.
-- Scheduling is separately approved in supabase/ops/enable_room_cleanup.sql.
BEGIN;

ALTER TABLE public.rooms ADD COLUMN lifecycle_started_at timestamptz;
ALTER TABLE public.rooms ADD COLUMN abandoned_at timestamptz;
ALTER TABLE public.room_seats ADD COLUMN last_seen_at timestamptz;
ALTER TABLE public.room_seats ADD COLUMN left_at timestamptz;
COMMENT ON COLUMN public.rooms.abandoned_at IS 'classification: PUBLIC - terminal abandonment time; not a match result or award.';
COMMENT ON COLUMN public.rooms.lifecycle_started_at IS 'classification: PUBLIC - server start of explicitly negotiated active presence lease.';
COMMENT ON COLUMN public.room_seats.last_seen_at IS 'classification: INTERNAL - authenticated human presence, private with the seat credential.';
COMMENT ON COLUMN public.room_seats.left_at IS 'classification: INTERNAL - explicit human quit; later heartbeats cannot clear it.';

CREATE FUNCTION public.initialize_room_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.options->'roomLifecycleVersion' = '1'::jsonb
    AND (TG_OP = 'INSERT' OR OLD.status = 'waiting') THEN
    NEW.lifecycle_started_at := clock_timestamp();
    UPDATE public.room_seats SET last_seen_at = NEW.lifecycle_started_at
      WHERE room_id = NEW.id AND left_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rooms_initialize_lifecycle BEFORE INSERT OR UPDATE OF status ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.initialize_room_lifecycle();

CREATE FUNCTION public.initialize_seat_presence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.last_seen_at := clock_timestamp();
  NEW.left_at := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER room_seats_initialize_presence BEFORE INSERT ON public.room_seats
  FOR EACH ROW EXECUTE FUNCTION public.initialize_seat_presence();

-- Called only with the room row locked. Missing credentials conservatively get
-- the start grace, but neither missing rows nor bots can keep a game alive forever.
CREATE FUNCTION public.room_has_live_human(
  p_room_id uuid, p_players jsonb, p_started_at timestamptz, p_now timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_players) AS player
    LEFT JOIN public.room_seats seat ON seat.room_id = p_room_id AND seat.seat_id = player->>'id'
    WHERE player->>'ai' IS NULL AND seat.left_at IS NULL
      AND greatest(seat.last_seen_at, p_started_at) > p_now - interval '10 minutes'
  );
$$;

CREATE FUNCTION public.room_lifecycle(
  p_room_id uuid, p_player_id text, p_token text, p_operation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_seat public.room_seats%ROWTYPE;
  v_now timestamptz;
  v_players jsonb;
  v_started boolean;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('heartbeat','leave','ready') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_operation');
  END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','room_not_found'); END IF;
  SELECT * INTO v_seat FROM public.room_seats
    WHERE room_id = p_room_id AND seat_id = p_player_id AND token = p_token AND p_token <> '';
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
      WHERE player->>'id' = p_player_id AND player->>'ai' IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_seat_token');
  END IF;
  v_now := clock_timestamp();

  -- A repeated explicit quit succeeds without resurrecting the seat or room.
  IF p_operation = 'leave' AND (v_room.status = 'finished' OR v_seat.left_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok',true,'players',v_room.players,'roomDeleted',false);
  END IF;
  IF v_room.status = 'finished' THEN
    RETURN jsonb_build_object('ok',false,'error',CASE WHEN v_room.abandoned_at IS NOT NULL THEN 'room_abandoned' ELSE 'room_not_active' END);
  END IF;
  IF v_seat.left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','seat_left');
  END IF;

  IF v_room.status = 'active' THEN
    IF p_operation = 'ready' THEN RETURN jsonb_build_object('ok',true,'started',true,'players',v_room.players); END IF;
    IF p_operation = 'leave' THEN
      UPDATE public.room_seats SET left_at = v_now WHERE room_id = p_room_id AND seat_id = p_player_id;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_room.players) player
        LEFT JOIN public.room_seats seat ON seat.room_id = p_room_id AND seat.seat_id = player->>'id'
        WHERE player->>'ai' IS NULL AND seat.left_at IS NULL
      ) THEN
        UPDATE public.rooms SET status = 'finished', abandoned_at = v_now WHERE id = p_room_id;
      END IF;
      RETURN jsonb_build_object('ok',true,'players',v_room.players,'roomDeleted',false);
    END IF;
    -- Enforce the lease on resume as well as during the scheduled sweep.
    IF v_room.lifecycle_started_at IS NOT NULL AND v_room.options->'roomLifecycleVersion' = '1'::jsonb
      AND NOT public.room_has_live_human(p_room_id, v_room.players, v_room.lifecycle_started_at, v_now) THEN
      UPDATE public.rooms SET status = 'finished', abandoned_at = v_now WHERE id = p_room_id;
      RETURN jsonb_build_object('ok',false,'error','room_abandoned');
    END IF;
    UPDATE public.room_seats SET last_seen_at = v_now WHERE room_id = p_room_id AND seat_id = p_player_id;
    RETURN jsonb_build_object('ok',true);
  END IF;

  -- Waiting-room mutations use the same lock as starts, admission and expiry.
  IF p_operation = 'leave' THEN
    SELECT COALESCE(jsonb_agg(player ORDER BY ordinal), '[]'::jsonb) INTO v_players
      FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS roster(player,ordinal)
      WHERE player->>'id' <> p_player_id;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_players) player WHERE player->>'ai' IS NULL) THEN
      DELETE FROM public.rooms WHERE id = p_room_id AND status = 'waiting';
      RETURN jsonb_build_object('ok',true,'players','[]'::jsonb,'roomDeleted',true);
    END IF;
    UPDATE public.rooms SET players = v_players WHERE id = p_room_id AND status = 'waiting';
    DELETE FROM public.room_seats WHERE room_id = p_room_id AND seat_id = p_player_id;
    RETURN jsonb_build_object('ok',true,'players',v_players,'roomDeleted',false);
  END IF;
  SELECT jsonb_agg(CASE WHEN player->>'id' = p_player_id THEN
      player || jsonb_build_object('lastSeen',floor(extract(epoch FROM v_now)*1000)) ||
        CASE WHEN p_operation = 'ready' THEN '{"ready":true}'::jsonb ELSE '{}'::jsonb END
      ELSE player END ORDER BY ordinal) INTO v_players
    FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS roster(player,ordinal);
  v_started := p_operation = 'ready' AND jsonb_array_length(v_players) >= 2
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_players) player WHERE player->'ready' IS DISTINCT FROM 'true'::jsonb);
  UPDATE public.room_seats SET last_seen_at = v_now WHERE room_id = p_room_id AND seat_id = p_player_id;
  UPDATE public.rooms SET players = v_players, status = CASE WHEN v_started THEN 'active' ELSE 'waiting' END
    WHERE id = p_room_id AND status = 'waiting';
  RETURN jsonb_build_object('ok',true,'players',v_players,'started',v_started);
END;
$$;

CREATE FUNCTION public.admit_room_seat(
  p_room_id uuid, p_expected_players jsonb, p_players jsonb, p_player_id text, p_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'waiting' OR v_room.players IS DISTINCT FROM p_expected_players THEN
    RETURN jsonb_build_object('ok',false,'error','room_changed');
  END IF;
  IF p_token IS NULL OR p_token = '' OR p_players IS NULL OR jsonb_typeof(p_players) <> 'array'
    OR jsonb_array_length(p_players) > (v_room.options->>'maxPlayers')::integer
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_players) player
      WHERE player->>'id' = p_player_id AND player->>'ai' IS NULL)
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_admission'); END IF;
  UPDATE public.rooms SET players = p_players WHERE id = p_room_id AND status = 'waiting';
  INSERT INTO public.room_seats(room_id,seat_id,token) VALUES(p_room_id,p_player_id,p_token);
  RETURN jsonb_build_object('ok',true);
END;
$$;

-- At most 200 eligible rooms per sweep; skip occupied row locks so a slow match
-- cannot hold the scheduler hostage. Re-evaluate presence after taking each lock.
CREATE FUNCTION public.expire_abandoned_rooms() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room public.rooms%ROWTYPE; v_now timestamptz; v_count integer := 0;
BEGIN
  FOR v_room IN SELECT * FROM public.rooms
    WHERE status = 'active' AND options->'roomLifecycleVersion' = '1'::jsonb
      AND lifecycle_started_at <= clock_timestamp() - interval '10 minutes'
      AND NOT public.room_has_live_human(id,players,lifecycle_started_at,clock_timestamp())
    ORDER BY lifecycle_started_at, id LIMIT 200 FOR UPDATE SKIP LOCKED
  LOOP
    v_now := clock_timestamp();
    IF NOT public.room_has_live_human(v_room.id,v_room.players,v_room.lifecycle_started_at,v_now) THEN
      UPDATE public.rooms SET status = 'finished', abandoned_at = v_now WHERE id = v_room.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Retain the existing completion implementation and receipt retry semantics,
-- while barring abandonment from its historical finished-without-score repair.
ALTER FUNCTION public.finish_casual_match_v1(uuid,text,text,text,integer,jsonb)
  RENAME TO finish_casual_match_before_lifecycle;
REVOKE ALL ON FUNCTION public.finish_casual_match_before_lifecycle(uuid,text,text,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.finish_casual_match_v1(
  p_room_id uuid,p_player_id text,p_token text,p_winner text,p_rounds integer,p_scoreboard jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF FOUND AND v_room.abandoned_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','room_not_active');
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_seats WHERE room_id=p_room_id AND seat_id=p_player_id AND left_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.match_scores WHERE room_id=p_room_id AND completion_version=1) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_seat_token');
  END IF;
  RETURN public.finish_casual_match_before_lifecycle(p_room_id,p_player_id,p_token,p_winner,p_rounds,p_scoreboard);
END;
$$;

-- The append guard is reached only for NEW commands. Versioned immutable intent
-- retries still return their original receipt without inserting or changing data.
CREATE FUNCTION public.guard_room_action_presence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.rooms WHERE id=NEW.room_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'active' OR EXISTS (
    SELECT 1 FROM public.room_seats WHERE room_id=NEW.room_id
      AND seat_id=COALESCE(NEW.submitted_by,NEW.player_id) AND left_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'seat unavailable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER room_actions_presence_guard BEFORE INSERT ON public.room_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_room_action_presence();
REVOKE ALL ON FUNCTION public.guard_room_action_presence() FROM PUBLIC,anon,authenticated,service_role;

-- Legacy wire protocol remains supported, but the RPC must carry the HUMAN
-- submitter even when that client proxies a CPU. The old internal RPC cannot
-- express that authority, so fail closed until the matching Edge code is deployed.
REVOKE ALL ON FUNCTION public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.submit_room_action_for_seat(
  p_room_id uuid,p_submitter_id text,p_token text,p_player_id text,p_action jsonb,
  p_ends_turn boolean,p_next_index integer,p_next_turn integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room public.rooms%ROWTYPE; v_seq integer;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'active' OR NOT EXISTS (
    SELECT 1 FROM public.room_seats WHERE room_id=p_room_id AND seat_id=p_submitter_id
      AND token=p_token AND p_token<>'' AND left_at IS NULL
  ) OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
    WHERE player->>'id'=p_submitter_id AND player->>'ai' IS NULL)
  THEN RAISE EXCEPTION 'seat unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_room.players) player
    WHERE player->>'id'=p_player_id AND (p_player_id=p_submitter_id OR player->>'ai' IN ('easy','medium','hard')))
  THEN RAISE EXCEPTION 'actor unavailable' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(max(seq)+1,0) INTO v_seq FROM public.room_actions WHERE room_id=p_room_id;
  INSERT INTO public.room_actions(room_id,seq,player_id,action)
    VALUES(p_room_id,v_seq,p_player_id,p_action);
  IF p_ends_turn THEN
    UPDATE public.rooms SET active_player_index=p_next_index,turn=p_next_turn WHERE id=p_room_id;
  END IF;
  RETURN v_seq;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer) TO service_role;

ALTER FUNCTION public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb)
  RENAME TO create_room_rematch_before_lifecycle;
REVOKE ALL ON FUNCTION public.create_room_rematch_before_lifecycle(uuid,text,uuid,text,bigint,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.create_room_rematch(
  p_room_id uuid,p_player_id text,p_new_room_id uuid,p_code text,p_seed bigint,p_options jsonb,p_players jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.room_seats WHERE room_id=p_room_id AND seat_id=p_player_id)
  THEN RAISE EXCEPTION 'seat unavailable' USING ERRCODE='42501'; END IF;
  -- A published successor is an immutable idempotent result. Creating a NEW
  -- successor never silently revives a departed peer; remaining players start
  -- a fresh room with the roster they actually want.
  IF v_room.rematch_room_id IS NOT NULL THEN RETURN v_room.rematch_room_id; END IF;
  IF v_room.abandoned_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.room_seats WHERE room_id=p_room_id AND left_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'players have left; create a new room' USING ERRCODE='55000'; END IF;
  RETURN public.create_room_rematch_before_lifecycle(p_room_id,p_player_id,p_new_room_id,p_code,p_seed,p_options,p_players);
END;
$$;
REVOKE ALL ON FUNCTION public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.initialize_room_lifecycle(), public.initialize_seat_presence(),
  public.room_has_live_human(uuid,jsonb,timestamptz,timestamptz),
  public.room_lifecycle(uuid,text,text,text), public.admit_room_seat(uuid,jsonb,jsonb,text,text),
  public.expire_abandoned_rooms(), public.finish_casual_match_v1(uuid,text,text,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.room_lifecycle(uuid,text,text,text),
  public.admit_room_seat(uuid,jsonb,jsonb,text,text), public.expire_abandoned_rooms(),
  public.finish_casual_match_v1(uuid,text,text,text,integer,jsonb) TO service_role;

-- Forward rollback: disable only the named scheduler job, retain schema/history,
-- deploy a corrected RPC/client. Never delete canonical rows to reverse expiry.
COMMIT;

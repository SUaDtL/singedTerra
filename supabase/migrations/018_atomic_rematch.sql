-- singedTerra: atomically publish a prepared rematch, 2026-09-07.
-- Safety: additive service-only RPC; existing immediate FK, RLS and history stay
-- intact. A predecessor row lock serializes contenders. Any failure rolls back
-- successor creation, secret-seat copying and pointer publication together.
-- Forward recovery: keep this RPC installed; disable the failing caller and
-- deploy a corrected handler/RPC in a later migration. Never delete a published
-- successor or revert to the invalid pointer-before-insert protocol.

CREATE FUNCTION public.create_room_rematch(
  p_room_id uuid, p_player_id text, p_new_room_id uuid, p_code text,
  p_seed bigint, p_options jsonb, p_players jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR p_new_room_id IS NULL OR p_new_room_id = p_room_id
    OR p_player_id IS NULL OR p_code IS NULL OR p_code !~ '^[A-Z0-9]{4}$'
    OR p_seed IS NULL OR p_seed < 0 OR p_seed > 4294967295
    OR p_options IS NULL OR jsonb_typeof(p_options) <> 'object'
    OR p_players IS NULL OR jsonb_typeof(p_players) <> 'array'
  THEN RAISE EXCEPTION 'rematch_invalid_input'; END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_room.players) AS player
    WHERE player->>'id' = p_player_id
  ) THEN RAISE EXCEPTION 'rematch_room_unavailable'; END IF;

  IF v_room.rematch_room_id IS NOT NULL THEN RETURN v_room.rematch_room_id; END IF;

  INSERT INTO public.rooms (
    id, code, seed, status, options, players, active_player_index, turn, winner
  ) VALUES (p_new_room_id, p_code, p_seed, 'active', p_options, p_players, 0, 0, NULL);

  INSERT INTO public.room_seats (room_id, seat_id, token)
    SELECT p_new_room_id, seat_id, token FROM public.room_seats WHERE room_id = p_room_id;

  -- The FK target and all credentials exist before Realtime can publish this
  -- transaction. There is no visible half-created room and no loser cleanup.
  UPDATE public.rooms SET rematch_room_id = p_new_room_id WHERE id = p_room_id;
  RETURN p_new_room_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_room_rematch(uuid, text, uuid, text, bigint, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_rematch(uuid, text, uuid, text, bigint, jsonb, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.create_room_rematch(uuid, text, uuid, text, bigint, jsonb, jsonb)
  IS 'classification: INTERNAL - service-only atomic successor publication; copies SECRET seat credentials without returning them.';

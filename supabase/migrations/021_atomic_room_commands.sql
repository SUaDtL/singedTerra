-- singedTerra — revision-checked, idempotent room command admission
-- Version: 021
-- Date: 2026-09-10
--
-- Additive only. Historical rows and migration 004 remain unchanged. Command
-- metadata is PUBLIC/INTERNAL coordination data; secret seat tokens are compared
-- inside the transaction and are never stored in room_actions or returned.

ALTER TABLE room_actions
  ADD COLUMN command_version SMALLINT,
  ADD COLUMN intent_id TEXT,
  ADD COLUMN expected_revision INT,
  ADD COLUMN submitted_by TEXT,
  ADD COLUMN command_ends_turn BOOLEAN,
  ADD COLUMN command_next_index INT,
  ADD COLUMN command_round_over BOOLEAN,
  ADD CONSTRAINT room_actions_command_metadata_complete CHECK (
    (command_version IS NULL AND intent_id IS NULL AND expected_revision IS NULL
      AND submitted_by IS NULL AND command_ends_turn IS NULL
      AND command_next_index IS NULL AND command_round_over IS NULL)
    OR
    (command_version IS NOT NULL AND command_version = 2
      AND intent_id IS NOT NULL AND length(intent_id) BETWEEN 1 AND 200
      AND expected_revision IS NOT NULL AND expected_revision >= 0
      AND submitted_by IS NOT NULL
      AND command_ends_turn IS NOT NULL AND command_round_over IS NOT NULL)
  );

-- Logical identity belongs to the room protocol, not to whichever browser proxy
-- submitted it. CPU intent ids already include their intended actor; retaining
-- room/protocol uniqueness also makes same-id changed-actor reuse conflict.
CREATE UNIQUE INDEX room_actions_room_command_intent_unique
  ON room_actions (room_id, command_version, intent_id)
  WHERE command_version IS NOT NULL;

COMMENT ON COLUMN room_actions.command_version IS
  'PUBLIC protocol metadata. NULL identifies historical/legacy rows; 2 identifies revision-checked commands.';
COMMENT ON COLUMN room_actions.intent_id IS
  'PUBLIC bounded logical command identity. Never a credential or secret token.';
COMMENT ON COLUMN room_actions.submitted_by IS
  'PUBLIC seat id of the authenticated submitting proxy; excluded from command equality and receipts.';

CREATE OR REPLACE FUNCTION submit_room_command_v2(
  p_room_id UUID,
  p_submitter_id TEXT,
  p_token TEXT,
  p_command_version SMALLINT,
  p_intent_id TEXT,
  p_expected_revision INT,
  p_actor_id TEXT,
  p_action JSONB,
  p_next_index INT,
  p_round_over BOOLEAN,
  p_ruleset_version SMALLINT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_room rooms%ROWTYPE;
  v_existing room_actions%ROWTYPE;
  v_submitter_index INT;
  v_actor_index INT;
  v_actor_is_cpu BOOLEAN;
  v_actor_tank_id TEXT;
  v_actor_role TEXT;
  v_action JSONB;
  v_action_type TEXT;
  v_ends_turn BOOLEAN;
  v_revision INT;
  v_seq INT;
  v_next_index INT;
  v_stored_command_version SMALLINT;
  v_stored_ruleset_version SMALLINT;
BEGIN
  IF p_command_version IS NULL OR p_command_version <> 2
    OR p_intent_id IS NULL OR length(p_intent_id) NOT BETWEEN 1 AND 200
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_submitter_id IS NULL OR p_actor_id IS NULL
    OR p_action IS NULL OR jsonb_typeof(p_action) <> 'object'
    OR p_round_over IS NULL
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_command');
  END IF;

  SELECT r.* INTO v_room FROM rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  SELECT (entry.ordinality - 1)::INT INTO v_submitter_index
    FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS entry(value, ordinality)
   WHERE entry.value->>'id' = p_submitter_id
   LIMIT 1;
  IF v_submitter_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_room_member');
  END IF;
  IF p_token IS NULL OR p_token = '' OR NOT EXISTS (
    SELECT 1 FROM room_seats
     WHERE room_id = p_room_id AND seat_id = p_submitter_id AND token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_seat_token');
  END IF;

  SELECT (entry.ordinality - 1)::INT,
         COALESCE(entry.value->>'ai' IN ('easy', 'medium', 'hard'), false)
    INTO v_actor_index, v_actor_is_cpu
    FROM jsonb_array_elements(v_room.players) WITH ORDINALITY AS entry(value, ordinality)
   WHERE entry.value->>'id' = p_actor_id
   LIMIT 1;
  IF v_actor_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'actor_not_in_room');
  END IF;
  IF p_actor_id <> p_submitter_id AND NOT v_actor_is_cpu THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_proxy_human');
  END IF;

  IF jsonb_typeof(v_room.options) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'command_protocol_unavailable');
  END IF;
  IF v_room.options ? 'commandProtocolVersion' THEN
    IF v_room.options->'commandProtocolVersion' NOT IN ('1'::jsonb, '2'::jsonb) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'command_protocol_unavailable');
    END IF;
    v_stored_command_version := (v_room.options->>'commandProtocolVersion')::SMALLINT;
  ELSE
    v_stored_command_version := 1;
  END IF;
  IF v_stored_command_version <> p_command_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'command_protocol_mismatch',
      'requiredCommandProtocolVersion', v_stored_command_version);
  END IF;

  IF v_room.options ? 'rulesetVersion' THEN
    IF v_room.options->'rulesetVersion' NOT IN ('1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ruleset_unavailable');
    END IF;
    v_stored_ruleset_version := (v_room.options->>'rulesetVersion')::SMALLINT;
  ELSE
    v_stored_ruleset_version := 1;
  END IF;
  IF p_ruleset_version IS NULL OR p_ruleset_version <> v_stored_ruleset_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ruleset_mismatch',
      'requiredRulesetVersion', v_stored_ruleset_version);
  END IF;

  v_action := p_action - 'commandActor';
  v_action_type := v_action->>'type';
  IF v_action_type IS NULL
    OR v_action_type NOT IN ('fire', 'use_shield', 'buy', 'next_round', 'move')
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_command');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_action) AS field(name)
     WHERE NOT (
       (v_action_type = 'fire' AND field.name IN ('type', 'angle', 'power', 'weapon'))
       OR (v_action_type = 'use_shield' AND field.name IN ('type', 'weapon'))
       OR (v_action_type = 'buy' AND field.name IN ('type', 'weapon', 'accessory', 'tankId'))
       OR (v_action_type = 'next_round' AND field.name = 'type')
       OR (v_action_type = 'move' AND field.name IN ('type', 'delta'))
     )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_command');
  END IF;
  v_ends_turn := v_action_type IN ('fire', 'use_shield');
  v_actor_tank_id := 'p' || (v_actor_index + 1)::TEXT;
  v_actor_role := CASE
    WHEN v_action_type = 'next_round' THEN 'transition-initiator'
    WHEN v_action_type = 'buy' AND p_round_over THEN 'shop-seat'
    ELSE 'engine-seat'
  END;
  IF v_actor_role = 'shop-seat' AND v_action->>'tankId' IS DISTINCT FROM v_actor_tank_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shop_actor_mismatch');
  END IF;
  v_action := v_action || jsonb_build_object('commandActor',
    jsonb_build_object('role', v_actor_role, 'tankId', v_actor_tank_id));

  SELECT a.* INTO v_existing
    FROM room_actions a
   WHERE a.room_id = p_room_id
     AND a.command_version = p_command_version
     AND a.intent_id = p_intent_id
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.player_id IS DISTINCT FROM p_actor_id
      OR v_existing.expected_revision IS DISTINCT FROM p_expected_revision
      OR v_existing.action IS DISTINCT FROM v_action
      OR v_existing.command_ends_turn IS DISTINCT FROM v_ends_turn
      OR v_existing.command_next_index IS DISTINCT FROM p_next_index
      OR v_existing.command_round_over IS DISTINCT FROM p_round_over
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'intent_conflict');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'protocolVersion', 2, 'intentId', v_existing.intent_id,
      'seq', v_existing.seq, 'revision', v_existing.seq + 1,
      'actorPlayerId', v_existing.player_id,
      'actorTankId', v_existing.action->'commandActor'->>'tankId');
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;

  SELECT COALESCE(MAX(seq) + 1, 0) INTO v_revision
    FROM room_actions WHERE room_id = p_room_id;
  IF p_expected_revision <> v_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revision_conflict',
      'currentRevision', v_revision);
  END IF;

  -- next_round is a global transition initiated by any authenticated member.
  -- It is not proxying the active opener's combat command. ROUND_OVER buys bind
  -- their explicit tank; other commands bind the active engine seat.
  IF v_action_type <> 'next_round' AND v_actor_role <> 'shop-seat'
    AND v_actor_index <> v_room.active_player_index
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_turn');
  END IF;

  v_seq := v_revision;
  INSERT INTO room_actions (
    room_id, seq, player_id, action, command_version, intent_id,
    expected_revision, submitted_by, command_ends_turn,
    command_next_index, command_round_over
  ) VALUES (
    p_room_id, v_seq, p_actor_id, v_action, p_command_version, p_intent_id,
    p_expected_revision, p_submitter_id, v_ends_turn,
    p_next_index, p_round_over
  );

  IF v_ends_turn THEN
    v_next_index := CASE
      WHEN p_next_index IS NOT NULL
        AND p_next_index >= 0
        AND p_next_index < jsonb_array_length(v_room.players)
        AND (p_round_over OR p_next_index <> v_room.active_player_index)
      THEN p_next_index
      ELSE (v_room.active_player_index + 1) % jsonb_array_length(v_room.players)
    END;
    UPDATE rooms SET active_player_index = v_next_index, turn = v_room.turn + 1
     WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'protocolVersion', 2, 'intentId', p_intent_id,
    'seq', v_seq, 'revision', v_seq + 1,
    'actorPlayerId', p_actor_id, 'actorTankId', v_actor_tank_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_room_command_v2(
  UUID, TEXT, TEXT, SMALLINT, TEXT, INT, TEXT, JSONB, INT, BOOLEAN, SMALLINT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_room_command_v2(
  UUID, TEXT, TEXT, SMALLINT, TEXT, INT, TEXT, JSONB, INT, BOOLEAN, SMALLINT
) TO service_role;

-- Compatible rollback before v2 room activation: deploy v1-only Edge code, then
-- DROP FUNCTION and the partial index/nullable columns. After a v2 room exists,
-- retain this schema and fix forward so its command receipts remain readable.

-- singedTerra — atomic participant-reported casual completion receipts
-- Version: 022
-- Date: 2026-09-12
--
-- Additive and compatible. Historical match_scores rows are explicitly marked
-- legacy_unvalidated; they are never relabeled replay-verified. New completion
-- runs under the same rooms FOR UPDATE lock as submit_room_command_v2.

ALTER TABLE public.match_scores
  ADD COLUMN evidence_tier TEXT NOT NULL DEFAULT 'casual_participant_reported',
  ADD COLUMN completion_version SMALLINT,
  ADD COLUMN completion_status TEXT NOT NULL DEFAULT 'legacy_unvalidated',
  ADD COLUMN terminal_revision INT,
  ADD CONSTRAINT match_scores_casual_evidence CHECK (
    evidence_tier = 'casual_participant_reported'
  ),
  ADD CONSTRAINT match_scores_completion_version CHECK (
    completion_version IS NULL OR completion_version = 1
  ),
  ADD CONSTRAINT match_scores_completion_status CHECK (
    completion_status IN ('complete', 'score_absent', 'legacy_unvalidated')
  ),
  ADD CONSTRAINT match_scores_terminal_revision CHECK (
    terminal_revision IS NULL OR terminal_revision >= 0
  ),
  ADD CONSTRAINT match_scores_versioned_status CHECK (
    (completion_version IS NULL AND completion_status = 'legacy_unvalidated' AND terminal_revision IS NULL)
    OR
    (completion_version = 1 AND completion_status IN ('complete', 'score_absent') AND terminal_revision IS NOT NULL)
  ),
  ADD CONSTRAINT match_scores_absent_shape CHECK (
    completion_status <> 'score_absent' OR scoreboard = '[]'::jsonb
  );

COMMENT ON COLUMN public.match_scores.evidence_tier IS
  'PUBLIC trust label. Casual room results are participant-reported and never replay-verified.';
COMMENT ON COLUMN public.match_scores.completion_version IS
  'PUBLIC completion receipt version. NULL identifies a historical legacy row.';
COMMENT ON COLUMN public.match_scores.completion_status IS
  'PUBLIC scoreboard readiness: complete, explicitly absent, or legacy unvalidated.';
COMMENT ON COLUMN public.match_scores.terminal_revision IS
  'PUBLIC action-log revision serialized before this participant-reported completion.';

-- Migration 004 introduced the supported legacy v1 action RPC with a room row
-- lock, but its Edge caller's active-room preread could become stale while the
-- function waited for that lock. Replace the function forward, preserving its
-- signature, scalar receipt, security-invoker behavior, cursor semantics, and
-- grants while checking active status from the row locked by this statement.
CREATE OR REPLACE FUNCTION public.submit_room_action(
  p_room_id UUID,
  p_player_id TEXT,
  p_action JSONB,
  p_ends_turn BOOLEAN,
  p_next_index INT,
  p_next_turn INT
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INT;
  v_status TEXT;
BEGIN
  SELECT r.status INTO v_status
    FROM public.rooms r
   WHERE r.id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'room % not active', p_room_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT COALESCE(MAX(a.seq) + 1, 0) INTO v_seq
    FROM public.room_actions a
   WHERE a.room_id = p_room_id;

  INSERT INTO public.room_actions(room_id, seq, player_id, action)
    VALUES (p_room_id, v_seq, p_player_id, p_action);

  IF p_ends_turn THEN
    UPDATE public.rooms
       SET active_player_index = p_next_index,
           turn = p_next_turn
     WHERE id = p_room_id;
  END IF;

  RETURN v_seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_room_action(UUID, TEXT, JSONB, BOOLEAN, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_room_action(UUID, TEXT, JSONB, BOOLEAN, INT, INT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_casual_scoreboard(
  p_scoreboard JSONB,
  p_players JSONB,
  p_rounds INT,
  p_team_mode BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seat_count INT;
  v_valid_count INT;
  v_unique_count INT;
  v_board JSONB;
  v_max_wins INT;
  v_max_count INT;
  v_team_one_wins INT;
  v_team_two_wins INT;
  v_expected_winner TEXT;
BEGIN
  IF jsonb_typeof(p_players) <> 'array'
    OR jsonb_typeof(p_scoreboard) <> 'array'
    OR p_rounds IS NULL OR p_rounds < 1 OR p_rounds > 9
  THEN
    RETURN NULL;
  END IF;
  v_seat_count := jsonb_array_length(p_players);
  IF v_seat_count < 2 OR v_seat_count > 4
    OR jsonb_array_length(p_scoreboard) <> v_seat_count
  THEN
    RETURN NULL;
  END IF;

  SELECT count(*), count(DISTINCT score.value->>'tankId')
    INTO v_valid_count, v_unique_count
    FROM jsonb_array_elements(p_scoreboard) AS score(value)
   WHERE jsonb_typeof(score.value) = 'object'
     AND jsonb_typeof(score.value->'tankId') = 'string'
     AND score.value->>'tankId' ~ '^p[1-4]$'
     AND substring(score.value->>'tankId' FROM 2)::INT BETWEEN 1 AND v_seat_count
     AND jsonb_typeof(score.value->'playerName') = 'string'
     AND jsonb_typeof(score.value->'roundWins') = 'number'
     AND jsonb_typeof(score.value->'kills') = 'number'
     AND jsonb_typeof(score.value->'totalDamage') = 'number'
     AND (score.value->>'roundWins')::NUMERIC = trunc((score.value->>'roundWins')::NUMERIC)
     AND (score.value->>'roundWins')::NUMERIC BETWEEN 0 AND p_rounds
     AND (score.value->>'kills')::NUMERIC = trunc((score.value->>'kills')::NUMERIC)
     AND (score.value->>'kills')::NUMERIC BETWEEN 0 AND 36
     AND (score.value->>'totalDamage')::NUMERIC BETWEEN 0 AND 3600;
  IF v_valid_count <> v_seat_count OR v_unique_count <> v_seat_count THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'tankId', 'p' || roster.ordinality::TEXT,
      'playerName', left(roster.value->>'name', 40),
      'roundWins', (score.value->>'roundWins')::INT,
      'kills', (score.value->>'kills')::INT,
      'totalDamage', (score.value->>'totalDamage')::NUMERIC
    ) ORDER BY roster.ordinality)
    INTO v_board
    FROM jsonb_array_elements(p_players) WITH ORDINALITY AS roster(value, ordinality)
    JOIN jsonb_array_elements(p_scoreboard) AS score(value)
      ON score.value->>'tankId' = 'p' || roster.ordinality::TEXT;
  IF jsonb_array_length(v_board) <> v_seat_count THEN RETURN NULL; END IF;

  IF COALESCE(p_team_mode, false) AND v_seat_count = 4 THEN
    SELECT max((entry.value->>'roundWins')::INT) FILTER (WHERE entry.ordinality IN (1, 3)),
           max((entry.value->>'roundWins')::INT) FILTER (WHERE entry.ordinality IN (2, 4))
      INTO v_team_one_wins, v_team_two_wins
      FROM jsonb_array_elements(v_board) WITH ORDINALITY AS entry(value, ordinality);
    IF (v_board->0->>'roundWins')::INT <> (v_board->2->>'roundWins')::INT
      OR (v_board->1->>'roundWins')::INT <> (v_board->3->>'roundWins')::INT
    THEN
      RETURN NULL;
    END IF;
    v_expected_winner := CASE
      WHEN v_team_one_wins > v_team_two_wins THEN 'p1'
      WHEN v_team_two_wins > v_team_one_wins THEN 'p2'
      ELSE NULL
    END;
  ELSE
    SELECT max((entry.value->>'roundWins')::INT)
      INTO v_max_wins FROM jsonb_array_elements(v_board) AS entry(value);
    SELECT count(*) INTO v_max_count FROM jsonb_array_elements(v_board) AS entry(value)
     WHERE (entry.value->>'roundWins')::INT = v_max_wins;
    SELECT entry.value->>'tankId' INTO v_expected_winner
      FROM jsonb_array_elements(v_board) AS entry(value)
     WHERE (entry.value->>'roundWins')::INT = v_max_wins
     LIMIT 1;
    IF v_max_count <> 1 THEN v_expected_winner := NULL; END IF;
  END IF;

  RETURN jsonb_build_object('scoreboard', v_board, 'winner', v_expected_winner);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_casual_match_v1(
  p_room_id UUID,
  p_player_id TEXT,
  p_token TEXT,
  p_winner TEXT,
  p_rounds INT,
  p_scoreboard JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_existing public.match_scores%ROWTYPE;
  v_seat_count INT;
  v_roster_count INT;
  v_unique_roster_count INT;
  v_rounds INT;
  v_revision INT;
  v_normalized JSONB;
  v_existing_normalized JSONB;
  v_board JSONB;
  v_status TEXT;
  v_receipt JSONB;
  v_repaired BOOLEAN := false;
BEGIN
  IF p_room_id IS NULL OR p_player_id IS NULL OR p_player_id = ''
    OR p_token IS NULL OR p_token = ''
    OR (p_winner IS NOT NULL AND p_winner !~ '^p[1-4]$')
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_completion');
  END IF;

  SELECT r.* INTO v_room FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'room_not_found'); END IF;
  IF jsonb_typeof(v_room.players) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_roster');
  END IF;
  v_seat_count := jsonb_array_length(v_room.players);
  SELECT count(*), count(DISTINCT entry.value->>'id')
    INTO v_roster_count, v_unique_roster_count
    FROM jsonb_array_elements(v_room.players) AS entry(value)
   WHERE jsonb_typeof(entry.value) = 'object'
     AND jsonb_typeof(entry.value->'id') = 'string'
     AND entry.value->>'id' <> ''
     AND jsonb_typeof(entry.value->'name') = 'string';
  IF v_seat_count < 2 OR v_seat_count > 4
    OR v_roster_count <> v_seat_count OR v_unique_roster_count <> v_seat_count
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_roster');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_room.players) AS entry(value)
     WHERE entry.value->>'id' = p_player_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_room_member');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.room_seats
     WHERE room_id = p_room_id AND seat_id = p_player_id AND token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_seat_token');
  END IF;

  v_rounds := CASE
    WHEN jsonb_typeof(v_room.options) = 'object'
      AND jsonb_typeof(v_room.options->'rounds') = 'number'
      AND (v_room.options->>'rounds')::NUMERIC = trunc((v_room.options->>'rounds')::NUMERIC)
      AND (v_room.options->>'rounds')::NUMERIC BETWEEN 1 AND 9
    THEN (v_room.options->>'rounds')::INT
    ELSE 1
  END;
  IF p_rounds IS NOT NULL AND p_rounds <> v_rounds THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rounds_mismatch', 'requiredRounds', v_rounds);
  END IF;
  IF p_winner IS NOT NULL AND substring(p_winner FROM 2)::INT > v_seat_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'winner_mismatch');
  END IF;

  IF p_scoreboard IS NULL THEN
    v_board := '[]'::jsonb;
    v_status := 'score_absent';
  ELSE
    v_normalized := public.normalize_casual_scoreboard(
      p_scoreboard, v_room.players, v_rounds,
      COALESCE(v_room.options->'teamMode' = 'true'::jsonb, false)
    );
    IF v_normalized IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_scoreboard');
    END IF;
    IF (v_normalized->>'winner') IS DISTINCT FROM p_winner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'winner_mismatch');
    END IF;
    v_board := v_normalized->'scoreboard';
    v_status := 'complete';
  END IF;

  SELECT COALESCE(max(seq) + 1, 0) INTO v_revision
    FROM public.room_actions WHERE room_id = p_room_id;
  SELECT s.* INTO v_existing FROM public.match_scores s WHERE s.room_id = p_room_id;

  IF v_room.status = 'active' THEN
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'completion_dispute');
    END IF;
    INSERT INTO public.match_scores(
      room_id, winner, rounds, scoreboard, evidence_tier,
      completion_version, completion_status, terminal_revision
    ) VALUES (
      p_room_id, p_winner, v_rounds, v_board, 'casual_participant_reported',
      1, v_status, v_revision
    ) RETURNING * INTO v_existing;
    UPDATE public.rooms SET status = 'finished', winner = p_winner WHERE id = p_room_id;
  ELSIF v_room.status = 'finished' THEN
    IF v_room.winner IS DISTINCT FROM p_winner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'completion_conflict');
    END IF;
    IF NOT FOUND THEN
      INSERT INTO public.match_scores(
        room_id, winner, rounds, scoreboard, evidence_tier,
        completion_version, completion_status, terminal_revision
      ) VALUES (
        p_room_id, p_winner, v_rounds, v_board, 'casual_participant_reported',
        1, v_status, v_revision
      ) RETURNING * INTO v_existing;
    ELSIF v_existing.winner IS DISTINCT FROM v_room.winner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'completion_dispute');
    ELSIF v_existing.completion_version = 1 THEN
      IF v_existing.rounds IS DISTINCT FROM v_rounds
        OR v_existing.scoreboard IS DISTINCT FROM v_board
        OR v_existing.completion_status IS DISTINCT FROM v_status
        OR v_existing.evidence_tier IS DISTINCT FROM 'casual_participant_reported'
      THEN
        RETURN jsonb_build_object('ok', false, 'error', 'completion_conflict');
      END IF;
    ELSE
      v_existing_normalized := public.normalize_casual_scoreboard(
        v_existing.scoreboard, v_room.players, v_existing.rounds,
        COALESCE(v_room.options->'teamMode' = 'true'::jsonb, false)
      );
      IF v_existing_normalized IS NOT NULL
        AND (v_existing_normalized->>'winner') IS NOT DISTINCT FROM v_existing.winner
      THEN
        IF v_status <> 'complete'
          OR v_existing.rounds IS DISTINCT FROM v_rounds
          OR v_existing_normalized->'scoreboard' IS DISTINCT FROM v_board
        THEN
          RETURN jsonb_build_object('ok', false, 'error', 'completion_conflict');
        END IF;
      ELSIF v_status <> 'complete' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'legacy_score_malformed', 'retryable', true);
      ELSE
        v_repaired := true;
      END IF;
      UPDATE public.match_scores SET
        rounds = v_rounds,
        scoreboard = v_board,
        evidence_tier = 'casual_participant_reported',
        completion_version = 1,
        completion_status = v_status,
        terminal_revision = v_revision
      WHERE room_id = p_room_id
      RETURNING * INTO v_existing;
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;

  v_receipt := jsonb_build_object(
    'completionVersion', v_existing.completion_version,
    'completionStatus', v_existing.completion_status,
    'createdAt', v_existing.created_at,
    'evidence', v_existing.evidence_tier,
    'roomId', v_existing.room_id,
    'rounds', v_existing.rounds,
    'scoreboard', v_existing.scoreboard,
    'terminalRevision', v_existing.terminal_revision,
    'winnerId', v_existing.winner
  );
  IF v_repaired THEN
    RETURN jsonb_build_object(
      'ok', true,
      'evidence', 'casual_participant_reported',
      'receipt', v_receipt,
      'legacyRepaired', true
    );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'evidence', 'casual_participant_reported',
    'receipt', v_receipt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_versioned_casual_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.completion_version = 1 AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'casual_completion_receipt_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER match_scores_versioned_receipt_immutable
  BEFORE UPDATE ON public.match_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_versioned_casual_receipt();

REVOKE ALL ON FUNCTION public.normalize_casual_scoreboard(JSONB, JSONB, INT, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_casual_scoreboard(JSONB, JSONB, INT, BOOLEAN)
  TO service_role;
REVOKE ALL ON FUNCTION public.guard_versioned_casual_receipt()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_casual_match_v1(UUID, TEXT, TEXT, TEXT, INT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_casual_match_v1(UUID, TEXT, TEXT, TEXT, INT, JSONB)
  TO service_role;

-- Rollback before versioned receipts are written may deploy the prior handlers
-- and leave these additive columns in place. Once receipts exist, retain the
-- schema and fix forward so evidence labels and retry receipts remain readable.

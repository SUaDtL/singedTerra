-- singedTerra Sprint 6 — Match score persistence
-- Version: 003
-- Date: 2026-06-07
--
-- Persists the FINAL standings of a best-of-N match when it reaches GAME_OVER. The
-- live game stays seed + action log (the engine is never server-side); this table is
-- a read-only record written once by finish_game from the client-reported, replay-
-- derived scoreboard (every client agrees on it deterministically). One row per match.

CREATE TABLE match_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  -- engine tank id ('pN') of the match winner, or NULL for a draw.
  winner      TEXT,
  -- best-of-N format the match was played at.
  rounds      INT NOT NULL,
  -- final per-tank standings:
  -- [{ tankId: 'pN', playerName: string, roundWins: int, kills: int, totalDamage: number }]
  scoreboard  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one final record per match — the first finisher wins the race; later
  -- finish_game calls upsert-ignore against this constraint (idempotent).
  CONSTRAINT match_scores_room_unique UNIQUE (room_id)
);

CREATE INDEX match_scores_room_id_idx ON match_scores (room_id);

-- ============================================================
-- Row Level Security — mirror the rooms/room_actions posture:
-- public read, service-role (Edge Function) writes only.
-- ============================================================

ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_scores_select_public"
  ON match_scores FOR SELECT TO anon USING (true);

CREATE POLICY "match_scores_insert_service_only"
  ON match_scores FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "match_scores_update_service_only"
  ON match_scores FOR UPDATE TO anon USING (false);

CREATE POLICY "match_scores_delete_service_only"
  ON match_scores FOR DELETE TO anon USING (false);

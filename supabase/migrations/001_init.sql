-- singedTerra MVP2 — Initial Schema Migration
-- Version: 001
-- Date: 2026-06-06

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- rooms table
CREATE TABLE rooms (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 CHAR(4) NOT NULL,
  seed                 BIGINT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'active', 'finished')),
  -- options: GameOptions fields excluding 'players'
  -- shape: { maxPlayers: number, maxWind?: number, gravity?: number }
  options              JSONB NOT NULL DEFAULT '{}',
  -- players array: Array<{ id: string, name: string, color: string, ready: boolean }>
  players              JSONB NOT NULL DEFAULT '[]',
  -- active_player_index is advisory only. It is NOT used for turn-ownership enforcement
  -- (the engine's own turn rotation is authoritative). It is retained for diagnostic
  -- display only and may be removed in V1.
  active_player_index  INT NOT NULL DEFAULT 0,
  turn                 INT NOT NULL DEFAULT 0,
  winner               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rooms_code_unique UNIQUE (code),
  CONSTRAINT rooms_code_format CHECK (code ~ '^[A-Z0-9]{4}$')
);

-- room_actions table
CREATE TABLE room_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seq         INT NOT NULL,
  player_id   TEXT NOT NULL,
  -- action shape: { type: 'fire', angle: number, power: number, weapon: string }
  action      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT room_actions_room_seq_unique UNIQUE (room_id, seq)
);

-- Index for efficient replay fetch
CREATE INDEX room_actions_room_id_seq_idx ON room_actions (room_id, seq ASC);

-- Index for room lookup by code
CREATE INDEX rooms_code_idx ON rooms (code);
CREATE INDEX rooms_status_idx ON rooms (status);

-- Required for Supabase Realtime UPDATE/DELETE events to deliver full row payloads
-- and for filtered subscriptions to fire correctly on non-PK column changes.
-- Without REPLICA IDENTITY FULL, the waiting room lobby may never see 'players'
-- updates or the 'status' transition to 'active' via Realtime.
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_actions REPLICA IDENTITY FULL;

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable Row Level Security on both tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_actions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- rooms policies
-- ============================================================

-- Public read: anon role can SELECT rooms (needed for code lookup in join flow)
CREATE POLICY "rooms_select_public"
  ON rooms
  FOR SELECT
  TO anon
  USING (true);

-- No direct INSERT from anon: only service_role (Edge Functions) may insert
CREATE POLICY "rooms_insert_service_only"
  ON rooms
  FOR INSERT
  TO anon
  WITH CHECK (false);

-- No direct UPDATE from anon: only service_role (Edge Functions) may update
CREATE POLICY "rooms_update_service_only"
  ON rooms
  FOR UPDATE
  TO anon
  USING (false);

-- No direct DELETE from anon
CREATE POLICY "rooms_delete_service_only"
  ON rooms
  FOR DELETE
  TO anon
  USING (false);

-- ============================================================
-- room_actions policies
-- ============================================================

-- Public read: anon role can SELECT room_actions (needed for replay on reconnect)
CREATE POLICY "room_actions_select_public"
  ON room_actions
  FOR SELECT
  TO anon
  USING (true);

-- No direct INSERT from anon: only service_role (Edge Functions) may insert
CREATE POLICY "room_actions_insert_service_only"
  ON room_actions
  FOR INSERT
  TO anon
  WITH CHECK (false);

-- No direct UPDATE from anon
CREATE POLICY "room_actions_update_service_only"
  ON room_actions
  FOR UPDATE
  TO anon
  USING (false);

-- No direct DELETE from anon
CREATE POLICY "room_actions_delete_service_only"
  ON room_actions
  FOR DELETE
  TO anon
  USING (false);

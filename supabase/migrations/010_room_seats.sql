-- singedTerra — Secret seat tokens (ADR-0009, GH #83 / appsec-001)
-- Version: 010
-- Date: 2026-07-03
--
-- Splits identity into a PUBLIC seat-id (rooms.players[].id — unchanged, still the
-- deterministic action-log key and broadcast for display/turn logic) and a SECRET
-- per-seat token stored HERE. The token authenticates seat ownership at the referee;
-- it must NEVER be readable by anon (that is the whole point — the old model leaked
-- the auth token through the anon-SELECTable + Realtime-broadcast rooms.players).
--
-- classification: SECRET (per-seat auth tokens — service-role only, never anon-readable)

CREATE TABLE room_seats (
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  -- The PUBLIC seat id (matches a rooms.players[].id). Only human seats get a row;
  -- bot seats have no token (any member may proxy a bot, per ADR-0008).
  seat_id     TEXT NOT NULL,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (room_id, seat_id)
);

-- Reap tokens with their room (mirrors room_actions' ON DELETE CASCADE).
CREATE INDEX room_seats_room_idx ON room_seats (room_id);

-- ============================================================
-- Row Level Security — the load-bearing control for this table
-- ============================================================
-- Enable RLS and DEFINE NO POLICIES. With RLS on and no policy, the `anon` role
-- has ZERO access (default-deny) — no SELECT, no INSERT, nothing. Only the
-- service_role (the Edge Function referees) bypasses RLS and can read/write here.
-- This is stricter than rooms/room_actions (which grant anon public SELECT); the
-- seat token must never leave the Deno runtime, so there is deliberately no anon
-- policy to read it.
ALTER TABLE room_seats ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke the default table grants from anon so even a future
-- accidental permissive policy cannot expose tokens without an explicit re-grant.
REVOKE ALL ON TABLE room_seats FROM anon;

-- DOWN (manual rollback):
--   DROP TABLE room_seats;

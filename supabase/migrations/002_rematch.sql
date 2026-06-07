-- singedTerra — Rematch support
-- Version: 002
-- Date: 2026-06-07
--
-- Adds a pointer from a finished room to the fresh room created for a rematch.
-- The rematch protocol keeps the "seed + ordered action log = canonical game"
-- model intact by allocating a BRAND-NEW room per rematch (empty action log,
-- fresh seq space, new seed) rather than mutating/clearing the old one.
--
-- When either player clicks Restart after GAME_OVER, restart_game atomically
-- claims this column on the OLD room and creates the successor room. Both
-- clients are subscribed to the old room's UPDATE stream (rooms REPLICA
-- IDENTITY FULL, set in 001), so both observe rematch_room_id flip from NULL
-- and migrate to the successor together — a single symmetric code path.

ALTER TABLE rooms
  ADD COLUMN rematch_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

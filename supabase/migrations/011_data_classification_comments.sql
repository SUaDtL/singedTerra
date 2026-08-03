-- singedTerra â€” Legacy table data classification (GH #125)
-- Version: 011
-- Date: 2026-08-03
--
-- Adds the classification comments that predate the convention documented in
-- migration 005. This is a comments-only, forward-only migration: no rows,
-- schema objects, policies, grants, or runtime behavior are changed.
-- Lock profile: COMMENT ON statements take brief metadata locks only; no table
-- rewrite or write-blocking index/table lock is introduced.

COMMENT ON TABLE rooms IS 'classification: PUBLIC - room identity, game options, roster, and turn metadata; no secret material.';
COMMENT ON COLUMN rooms.id IS 'classification: PUBLIC - random room identifier used by the public game surface.';
COMMENT ON COLUMN rooms.code IS 'classification: PUBLIC - join code intentionally exposed to room browsing and lookup.';
COMMENT ON COLUMN rooms.seed IS 'classification: PUBLIC - deterministic game seed replayed by every participant.';
COMMENT ON COLUMN rooms.status IS 'classification: PUBLIC - room lifecycle state.';
COMMENT ON COLUMN rooms.options IS 'classification: PUBLIC - game rules and display options; no credentials.';
COMMENT ON COLUMN rooms.players IS 'classification: PUBLIC - player display names, colors, readiness, and seat metadata broadcast to room members.';
COMMENT ON COLUMN rooms.active_player_index IS 'classification: PUBLIC - advisory display cursor; not an authorization credential.';
COMMENT ON COLUMN rooms.turn IS 'classification: PUBLIC - advisory turn counter for display and diagnostics.';
COMMENT ON COLUMN rooms.winner IS 'classification: PUBLIC - completed-match winner seat identifier.';
COMMENT ON COLUMN rooms.rematch_room_id IS 'classification: PUBLIC - successor room identifier for the rematch flow.';
COMMENT ON COLUMN rooms.created_at IS 'classification: INTERNAL - operational room-creation timestamp.';

COMMENT ON TABLE room_actions IS 'classification: PUBLIC - deterministic gameplay action log intentionally readable for replay.';
COMMENT ON COLUMN room_actions.id IS 'classification: PUBLIC - random action-row identifier.';
COMMENT ON COLUMN room_actions.room_id IS 'classification: PUBLIC - parent room identifier used for replay lookup.';
COMMENT ON COLUMN room_actions.seq IS 'classification: PUBLIC - deterministic action ordering cursor.';
COMMENT ON COLUMN room_actions.player_id IS 'classification: PUBLIC - public seat identifier that authored the action.';
COMMENT ON COLUMN room_actions.action IS 'classification: PUBLIC - replayable gameplay payload; contains no seat token.';
COMMENT ON COLUMN room_actions.created_at IS 'classification: INTERNAL - operational action-commit timestamp.';

COMMENT ON TABLE match_scores IS 'classification: PUBLIC - completed-match scoreboard intended for public results display.';
COMMENT ON COLUMN match_scores.id IS 'classification: PUBLIC - random scoreboard-row identifier.';
COMMENT ON COLUMN match_scores.room_id IS 'classification: PUBLIC - parent room identifier for the completed match.';
COMMENT ON COLUMN match_scores.winner IS 'classification: PUBLIC - winner seat identifier or draw marker.';
COMMENT ON COLUMN match_scores.rounds IS 'classification: PUBLIC - completed-match round count.';
COMMENT ON COLUMN match_scores.scoreboard IS 'classification: PUBLIC - player display names and gameplay standings.';
COMMENT ON COLUMN match_scores.created_at IS 'classification: INTERNAL - operational scoreboard-creation timestamp.';

# apply_room_reap DELETE/UPDATE has no status='waiting' guard — TOCTOU race with ready_up can delete or corrupt a room that just went active

**Severity:** high  |  **Confidence:** 0.8  |  **Effort:** S

**Where:**
- supabase/migrations/007_apply_room_reap.sql:26-35
- supabase/functions/list_rooms/index.ts:10-58
- supabase/functions/ready_up/index.ts:49-87
- supabase/functions/_shared/mod.ts:350-354

**Evidence:** `007_apply_room_reap.sql` line 27: `DELETE FROM rooms WHERE id = ANY(p_dead);` and lines 31-34: `UPDATE rooms r SET players = t.players FROM jsonb_to_recordset(p_trims) AS t(id UUID, players JSONB) WHERE r.id = t.id;` — neither statement filters on `status = 'waiting'`. The caller, `list_rooms/index.ts`, fetches candidate rooms with `.eq('status', 'waiting')` (line 13), computes `deadIds`/`trims` in memory using the 30s staleness window (`STALE_MS = 30000`, `_shared/mod.ts:350`) against that snapshot, then — after an unbounded gap doing further work (map/sort/slice) — calls `apply_room_reap` (line 51). Concurrently, `ready_up/index.ts` re-fetches the SAME room fresh (line 49-54, `.eq('status','waiting')` at fetch time only) and, if this call makes every seat ready, flips `status` to `'active'` (line 76) with an `.update(updatePayload).eq('id', roomId)` that ALSO has no `status='waiting'` re-check at write time. If a player's tab was backgrounded/throttled long enough to look stale in `list_rooms`' snapshot (lastSeen > 30s old) but then sends a `ready_up` right after, the room can transition to `active` with a full ready roster in between `list_rooms`' fetch and its later `apply_room_reap` RPC call. `apply_room_reap` then either DELETEs the now-active room (if the stale snapshot showed 0 fresh players — cascades to `room_actions` via `ON DELETE CASCADE`, migration 001, destroying the just-started game's action log) or UPDATEs `players` with the stale pre-ready roster, silently reverting the just-readied player back to not-ready / removing them from the roster and rendering the room stuck.

**Impact:** A room that transitions waiting->active in the small window between `list_rooms`' fetch and its reap-apply RPC can be deleted outright (losing the room row and, via FK cascade, all `room_actions`) or have its player roster clobbered with stale data, corrupting an in-progress game for both players. `list_rooms` is a polled endpoint (lobby browse), so this window recurs on every poll cycle, and `STALE_MS=30000` gives an attacker-free, ordinary-usage window (a backgrounded/throttled tab) wide enough to hit it.

**Recommendation:** Add `AND status = 'waiting'` to both the DELETE and the UPDATE...FROM in `apply_room_reap` so a room that has moved off `waiting` since the `list_rooms` snapshot is left untouched. Symmetrically, add `.eq('status','waiting')` to `ready_up`'s final `.update(...).eq('id', roomId)` so a duplicate/racing `ready_up` call cannot resurrect a stale status flip either.

**Acceptance criteria:**
- apply_room_reap's DELETE and UPDATE both include a status='waiting' predicate
- A room that flips to 'active' between a list_rooms fetch and its apply_room_reap call is left untouched (row survives, players unchanged)
- A regression test simulates: fetch waiting-room snapshot -> concurrent ready_up flips to active -> apply_room_reap call -> room row + players + status are unaffected

<!-- dedup_key: migration:supabase/migrations/007_apply_room_reap.sql:reap-toctou-no-status-guard · finding: migration-001 -->

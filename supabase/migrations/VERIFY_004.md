# Manual Verification Recipe — Migration 004

Confirms that `submit_room_action` is atomic, serialised, and correctly permission-gated.
Run these steps against a local Supabase stack.

## Prerequisites

```bash
# Apply all migrations from scratch (requires Docker / Supabase CLI).
npx supabase db reset
```

Connect with psql (service-role credentials bypass RLS, matching the Edge Function):

```bash
psql "$(npx supabase status --output json | jq -r .DB_URL)"
```

---

## 1. Happy path — action inserted AND cursor advanced atomically

```sql
-- Seed a room and record its id.
INSERT INTO rooms (code, seed, status, options, players, active_player_index, turn)
VALUES ('VRF1', 12345, 'active', '{"maxPlayers":2,"maxWind":10,"gravity":0.15}',
        '[{"id":"player-a","name":"Alice","color":"#ff0000","ready":true},
          {"id":"player-b","name":"Bob","color":"#0000ff","ready":true}]',
        0, 0)
RETURNING id \gset room_

-- Submit a turn-ending fire action.
SELECT submit_room_action(
  :'room_id',
  'player-a',
  '{"type":"fire","angle":45,"power":80,"weapon":"standard"}',
  TRUE,   -- p_ends_turn
  1,      -- p_next_index (Bob becomes active)
  1       -- p_next_turn
);
-- Expected: returns 0  (the first seq)

-- Confirm action row exists.
SELECT seq, player_id, action
  FROM room_actions
 WHERE room_id = :'room_id';
-- Expected: one row with seq=0, player_id='player-a'

-- Confirm cursor was advanced atomically in the same transaction.
SELECT active_player_index, turn
  FROM rooms
 WHERE id = :'room_id';
-- Expected: active_player_index=1, turn=1
```

---

## 2. Rollback on failure — no orphaned action row

Force the UPDATE to fail by inserting a duplicate (room_id, seq) row first, then
triggering a constraint violation inside a manual transaction to confirm rollback.

```sql
-- Manually pre-insert seq=1 to sabotage the next insert attempt.
INSERT INTO room_actions (room_id, seq, player_id, action)
VALUES (:'room_id', 1,
        'intruder',
        '{"type":"fire","angle":0,"power":0,"weapon":"standard"}');

-- Now ask the function to insert what would also become seq=1.
-- Because the function re-computes MAX(seq)+1 = 1 and the unique constraint
-- fires, the whole function rolls back.
SELECT submit_room_action(
  :'room_id',
  'player-b',
  '{"type":"fire","angle":30,"power":50,"weapon":"standard"}',
  TRUE,
  0,
  2
);
-- Expected: ERROR 23505 (unique_violation) — the function raises and rolls back.

-- Confirm the cursor was NOT advanced (still at index=1, turn=1 from step 1).
SELECT active_player_index, turn FROM rooms WHERE id = :'room_id';
-- Expected: active_player_index=1, turn=1  (unchanged — rollback worked)

-- Confirm only the two rows from steps 1 + 2 (seq 0 and the intruder seq 1) exist.
SELECT seq FROM room_actions WHERE room_id = :'room_id' ORDER BY seq;
-- Expected: 0, 1  (no extra row from the failed call)
```

---

## 3. Concurrency — two sessions cannot get the same seq

Open **two separate psql connections** (two terminal windows).

### Session A — hold the lock

```sql
-- Session A: begin a transaction and call the function (holds FOR UPDATE lock).
BEGIN;
SELECT submit_room_action(
  :'room_id',
  'player-b',
  '{"type":"fire","angle":20,"power":60,"weapon":"standard"}',
  TRUE, 0, 3
);
-- DO NOT COMMIT YET.  Leave this session open.
```

### Session B — blocked until A commits

```sql
-- Session B (separate terminal): attempt a concurrent submit for the same room.
SELECT submit_room_action(
  :'room_id',
  'player-a',
  '{"type":"fire","angle":10,"power":40,"weapon":"standard"}',
  TRUE, 1, 4
);
-- This call BLOCKS here, waiting for Session A's FOR UPDATE lock to release.
```

### Session A — commit

```sql
-- Back in Session A:
COMMIT;
-- Session B now unblocks and receives the next seq in order.
```

### Verify no duplicate seq

```sql
SELECT seq FROM room_actions WHERE room_id = :'room_id' ORDER BY seq;
-- Expected: strictly consecutive integers (0, 1, 2, 3, ...) — no duplicates,
-- no gaps caused by the race.
```

---

## 4. Permission gate — anon cannot call the function

```sql
-- Switch to the anon role (mirrors the browser client's key).
SET ROLE anon;

SELECT submit_room_action(
  :'room_id',
  'player-a',
  '{"type":"fire","angle":45,"power":80,"weapon":"standard"}',
  FALSE, 0, 0
);
-- Expected: ERROR 42501 (insufficient_privilege) — anon has no EXECUTE grant.

-- Restore role.
RESET ROLE;
```

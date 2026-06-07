# ✅ FULLY DEPLOYED (2026-06-07)

All production deploys are complete and verified:
- ✅ `submit_action` — networked shield + buy + referee turn-enforcement LIVE.
- ✅ `restart_game` — LIVE.
- ✅ migrations `001` + `002` applied (history repaired; `rooms.rematch_room_id`
  exists). Networked **rematch** is now functional.

Nothing left to deploy. (The historical notes below are kept for reference.)

---

## Why 002 didn't apply + the one-time fix
`supabase db push` failed because the remote **migration history** records
NEITHER `001` nor `002` as applied — yet `001`'s schema already exists (it was
applied outside the migration system). So `push` tried to re-run `001` and hit
`relation "rooms" already exists`. The agent's repair step was blocked by the
deploy classifier (a history-table change beyond the "deploy that" scope).

Run ONE of these (CLI is authed + linked to `jdvxfxjpobtyasozxauh`):

```bash
# Option A — record 001 as already-applied, then push only 002:
supabase migration repair --status applied 001
supabase db push        # applies 002_rematch.sql (adds rematch_room_id)

# Option B — skip the history dance, apply 002's one line directly in the
# Supabase SQL editor (Dashboard → SQL):
ALTER TABLE rooms
  ADD COLUMN rematch_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;
# (then, to keep history tidy: supabase migration repair --status applied 001 002)
```

## What is safe RIGHT NOW without the deploy
- **HUD name-swap fix** (Bug 1) — pure client, live as soon as the client is
  rebuilt/redeployed. No DB/function dependency.
- **Hot-seat restart** — unchanged, unaffected.

## What is BROKEN until the deploy lands
- **Networked "Restart"** — the client calls `restart_game` and subscribes to
  `rooms.rematch_room_id`. Without the migration the column doesn't exist;
  without the function the POST 404s. Clicking Restart in a network game will
  just error (no crash, but no rematch).

---

# ⚠️ Pending production deploy — shield (Sprint 4 Slice 3, uncommitted local work)

The shield weapon + `use_shield` action were added this session (engine + client +
harness all green locally). **Networked** shield play needs the updated
`submit_action` edge function deployed (it now accepts `use_shield` AND enforces
turn ownership server-side):

```bash
supabase functions deploy submit_action
```

No DB migration is needed for the shield. **Hot-seat shield works with no deploy**
(pure local engine). Without the deploy, a networked shield click will be rejected
by the old `submit_action` ("action.type must be \"fire\"") — the shot is simply
refused, no crash.

NOTE: the same deploy also turns on **referee turn-enforcement** (rejects actions
submitted out of turn — exact for 2-player; see the in-file comment for the 3–4P
elimination caveat). That is a security fix worth deploying even independently.

The same `submit_action` redeploy ALSO enables the **store `buy` action** over the
network (turn-neutral logged action; the function skips the turn-cursor advance
for buys). Hot-seat store works with no deploy.

## Verification after deploy (2-browser playtest)
1. Two browsers, create+join a room, play to GAME_OVER.
2. Either player clicks Restart → both should migrate to a fresh room and be
   able to fire again (the original "couldn't fire" lockout is gone).
3. Double-click Restart / both click simultaneously → still exactly ONE
   successor room (idempotent atomic claim).

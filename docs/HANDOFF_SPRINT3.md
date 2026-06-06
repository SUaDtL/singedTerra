# singedTerra — session handoff (MVP2 done → Sprint 3)

You are continuing work on singedTerra (C:\Users\brenn\projects\singedTerra), a browser
Scorched-Earth-style artillery game. TS monorepo (client/server/shared), Canvas 2D,
deterministic engine in shared/. Read CLAUDE.md + docs/SPEC.md + docs/TASKS.md first.

## How we work (IMPORTANT)
- "ultracode +500k" mode: drive substantial work via the Workflow tool, BARRIER-FIRST.
  Worked well every sprint. Freeze contracts first, implement against them second.
- REVIEW-BEFORE-COMMIT: do NOT git commit/push unless the user explicitly asks.
- Determinism is a hard requirement: no Math.random / Date.now / wall-clock in shared/.
  Every change must keep `npm run check` green (typecheck + 6 harnesses:
  determinism, collision, timestep, turnstate, airburst, wind).
- Vite HMR is on — DON'T spawn new dev servers; reuse running one (`npm run dev:client`).
  On Windows, kill by PID not by canceling npm task.

## State: MVP0 + MVP1 + MVP2 DONE — tree clean, NOT yet committed this session
HEAD = 6152c70. All MVP2 work is uncommitted local changes:
- Supabase deterministic lockstep networking live and tested
- NetworkClient.ts (full rewrite, Supabase Realtime + Edge Functions)
- 4 Deno Edge Functions deployed to Supabase project your-project-id
- Lobby.ts: "Play Online" tab (create/join/waiting room, Realtime ready-up)
- main.ts: async createClient, network branch wires NetworkClient
- supabase/migrations/001_init.sql: rooms + room_actions, RLS, REPLICA IDENTITY FULL
- client package: socket.io-client removed, @supabase/supabase-js@2.107.0 added
- client/.env: real Supabase keys present (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)

## Confirmed working in networked play
- Room create/join/ready-up flow via Supabase Edge Functions
- Realtime action log (only fire actions committed, angle/power/weapon embedded)
- Per-client GameEngine replay — deterministic, seeded PRNG wind
- Projectile flight animation streams correctly on both clients
- Turn enforcement: sendAction() guards on activePlayerId === this player's engine tank ID
- `npm run check` green (typecheck + all 6 harnesses)

## Known issues fixed this session
- tickToCompletion() was called on live Realtime events (killed flight animation) — FIXED
  (isReplaying flag: only tick-to-completion during initialize() replay, not live play)
- SUPABASE_SECRET_KEYS (new format) didn't work with createClient — reverted to
  SUPABASE_SERVICE_ROLE_KEY (deprecated but still auto-injected, still works)
- codeArbiter statusline path fixed in ~/.claude/settings.json

## Sprint 3 scope (implement this session)
Run as ultracode +500k workflow. All changes must keep npm run check green.

### 1. MVP2 cleanup
a) Color uniqueness — prevent duplicate colors in a room:
   - join_room Edge Function: check if color already in room.players, return 409 if taken
   - Lobby.ts waiting room: mark taken colors visually in the color picker for joining players
   - create_room: no change needed (first player picks freely)

b) Game-over persistence — when engine hits GAME_OVER in network mode:
   - NetworkClient: detect phase === 'GAME_OVER' in emitState(), call a finish_game
     Edge Function (new) that sets rooms.status='finished', rooms.winner=winnerId
   - New supabase/functions/finish_game/index.ts Edge Function
   - Only call once (use a flag to prevent double-call)

c) CSS scale fix — client/src/style.css has:
   `--scale: min(100vw/800, 100vh/500, 1)`
   This mixes <length> values (100vw/800) with a unitless 1 — invalid CSS, transform:scale
   is silently dropped on viewports < 800x500. Fix:
   Use a JS-driven approach in main.ts or Renderer.ts:
   On resize, compute scale = Math.min(window.innerWidth/800, window.innerHeight/500, 1)
   and set canvas container transform directly. Remove the CSS custom property approach.

### 2. Network UX polish
d) Fire button "Sending..." state — after fire is submitted and before Realtime echo:
   - NetworkClient: expose a `isFiring: boolean` getter (true when FIRING phase OR
     between sendAction(fire) and Realtime echo applying it)
   - HUD.ts: disable fire button and show "Sending..." text during this window
   - Re-enable when engine returns to PLAYER_TURN and it's still this player's turn

e) Active player indicator in network mode — HUD should show whose turn it is:
   - Already works in hot-seat (HUD highlights active player)
   - Verify it works in network mode too; if not, fix the HUD active-player detection

### 3. New weapons (V1 backlog, data-driven)
f) Heavy Missile — pure WeaponDefinition data addition:
   { type: 'heavy_missile', name: 'Heavy Missile', implemented: true,
     detonation: { radius: 35, maxDamage: 85, style: 'blast', color: '#ff6600', durationFrames: 110 } }
   Add to WEAPONS array in WeaponSystem.ts. No new motion logic needed.

g) Dirt Bomb — check if raisesTerrain is already wired in Terrain.deform() and
   GameEngine.detonate(). If yes, add as data. If not, wire it:
   In Terrain.deform(cx, cy, r, raise=false): if raise, ADD depth instead of subtract,
   clamp to [0, CANVAS_HEIGHT]. Then add WeaponDefinition with raisesTerrain: true.

h) Napalm — horizontal spray on impact:
   On detonation, spawn 5 sub-projectiles with vy=0, vx spread left/right from impact point,
   each detonating on next terrain hit. Similar to airburst but horizontal, triggered on GROUND
   hit (not apex). Add trigger:'ground_horizontal' to BehaviorDef if needed, or handle inline.
   If too complex for this sprint, stub it as not-implemented in WeaponDefinition and skip.

## Verify after every change
`npm run check` must stay green. `npm run build` must succeed before reporting done.

## File locations for reference
- Engine: shared/src/engine/GameEngine.ts, WeaponSystem.ts, Terrain.ts, Physics.ts
- Client: client/src/client/NetworkClient.ts, client/src/ui/Lobby.ts, client/src/main.ts
- HUD: client/src/ui/HUD.ts (check exact path)
- Supabase functions: supabase/functions/*/index.ts
- Types: shared/src/types/GameState.ts, PlayerAction.ts, Events.ts

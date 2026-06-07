# Open Tasks — singedTerra

Living register of work, organized by delivery phase (**MVP0 → MVP1 → MVP2 → V1**). Check items off as completed. Full details for each item are in [`SPEC.md`](SPEC.md) §9. The active sprint plan is [`SPRINT6_MATCH_STRUCTURE.md`](SPRINT6_MATCH_STRUCTURE.md) (Sprint 5's graphical overhaul shipped and is archived under [`archive/`](archive/)). Architecture context is in [`../CLAUDE.md`](../CLAUDE.md).

**Current phase:** MVP0 + MVP1 + **MVP2 done** — networked play via **Supabase deterministic lockstep** is live and tested: room create/join/ready-up via Supabase Edge Functions, a Realtime action log (only `fire` actions committed, angle/power/weapon embedded), per-client deterministic `GameEngine` replay with seeded-PRNG wind, and flight regenerated locally from each `fire` action (no streaming). **Public/private lobbies, in-place recolor/rename, and room cleanup** shipped (`71c279c`), as did **heartbeat + lazy-GC reaping of dead rooms** (`a88e1a2`). A **pixel-bitmap terrain rewrite with gravity + tank burial** also shipped (`86f287b`). The project is now in **Sprint 4 — Combat Depth** (see [`SPRINT4_COMBAT_DEPTH.md`](SPRINT4_COMBAT_DEPTH.md)): the MVP (Slices 0+1) is implemented locally — a finite **ammo economy** (`{count, unlimited}` inventory with fire gating + decrement, no `Infinity` sentinel), **nukes live** (`baby_nuke` + `nuke` flipped to implemented), a clickable **weapon strip** in the HUD, and a **7th determinism harness (ammo)**. **Next: Sprint 4 Slice 2** — new-motion weapons `funky_bomb` / `napalm` / `bouncing_betty`; then **Slice 3** — shield (destructible particle force field) + referee turn-enforcement in `submit_action`.

---

## MVP0 — Bones
*Goal: something visually real. No game yet.* Excludes: turns, health, wind, multiple players, HUD.

- [x] Repo scaffold: npm workspaces, Vite client, Node server, shared package
- [x] Terrain generation (midpoint displacement) + rendering
- [x] Tank entity: place 2 tanks on terrain at game start
- [x] Barrel rendering: rotates with angle input (← →)
- [x] Power input (↑ ↓)
- [x] Fire: projectile launches, follows ballistic arc, hits terrain or goes OOB
- [x] Terrain deformation on impact (crater)
- [x] Basic explosion visual (expanding circles)

## MVP1 — It's a Game
*Goal: playable hot-seat game, 2–4 players.*

- [x] Turn system state machine (LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER)
- [x] Health system: tanks take damage from explosions based on proximity
- [x] Tank death: remove at health ≤ 0; terrain collapse for unsupported tanks
- [x] Wind: generated per turn, shown on HUD, affects projectile
- [x] HUD: health bars, wind, angle, power, active player indicator
- [x] Hot-seat lobby: enter player names (2–4), pick colors
- [x] Win condition: last tank alive (draw on mutual kill)
- [x] Baby Missile + Missile weapons (stubs for weapon-select key) — also Cluster Bomb (multi-bomblet) now implemented & selectable
- [x] Game over screen: winner announcement, restart button

## MVP2 — Networked (Supabase deterministic lockstep)
*Goal: same gameplay, each player on their own browser. **No dedicated game server** — Supabase deterministic lockstep (see SPEC §5). State = (seed + ordered action log); clients run the engine locally and regenerate flight from the `fire` action (no streaming).*

- [x] Supabase project + Postgres schema (`rooms`, `room_actions`) + RLS policies
- [x] `submit_action` Edge Function referee: replays `shared/` engine to validate turn/legality, inserts action, updates room cursor
- [x] NetworkClient: append committed actions; subscribe to the room action log via Supabase Realtime; apply to the LOCAL GameEngine in `seq` order
- [x] Client regenerates projectile/airburst flight locally from the `fire` action (drops the old `projectile_tick` streaming)
- [x] Room creation / join flow (4-char alphanumeric code) backed by `rooms`
- [x] Reconnect / async play: fetch room + replay the action log to current state
- [x] Network lobby UI: create/join by code, ready-up via Realtime
- [x] Disconnect/timeout policy — async turns let a player act later regardless; dead rooms reaped via heartbeat + lazy-GC

> Why the pivot: Supabase has no long-running stateful compute, so it can't host a ticking authoritative `GameEngine`; but the engine is deterministic + serializable, so lockstep needs no server. Stays on the Supabase free tier (lightest option). Deletes Node/Socket.io + pm2 + nginx-socket-proxy from the deploy. Enables async / play-by-mail turns.

## V1 — Full Feature Set
*Goal: the thing you actually show people.*

- [x] Full weapon roster (see spec §4.5) — **all 11 weapon types implemented** (`baby_missile`, `missile`, `heavy_missile`, `dirt_bomb`, `cluster_bomb`, `baby_nuke`, `nuke`, `funky_bomb`, `bouncing_betty`, `napalm`, `shield`) with a finite ammo economy (`{count, unlimited}`). Sprint 4 Slice 2 done; `bouncing_betty` reworked into a **bounding mine** (detonates a full blast at every hop, not a silent ball), and `napalm` reworked into a **spreading, lingering fire field** (downhill-flowing DOT, no crater — not a cluster carpet). Slice 3 `shield` is a **destructible particle force field** (`use_shield` action through the whole stack: engine + network log + `submit_action`). Covered by `motion` + `shield` harnesses (9 total).
- [x] Weapon shop: a deterministic in-engine credit economy — tanks start with `STARTING_CREDITS`, earn `CREDITS_PER_DAMAGE`/point of damage dealt + a flat per-shot stipend, and spend via a turn-neutral `buy` action (engine + network log + `submit_action`, which skips the turn-cursor for buys). Prices/bundles mapped from the canonical Scorched Earth 1991 catalog (`docs/reference/`). Store panel UI in the HUD (credits badge + buy buttons, affordability-gated). Covered by the `store` harness (10 total). Networked buy pending the `submit_action` redeploy (see `docs/DEPLOY_NEEDED.md`). Round-based shop (buy *between* rounds) still TODO — needs the round system.
- [x] **Computer opponents (single-player vs CPU):** a pure, deterministic shot-planner (`shared/src/engine/AI.ts`) that forward-simulates candidate trajectories with the real Physics against the live terrain/wind/gravity, scores by impact distance, and applies difficulty-scaled aim error (easy/medium/hard). `TankState.ai` marks CPU seats (set via lobby per-player Human/CPU selector); the client driver (`main.ts`) plays bot turns on a watchable timer and gates out human input. HUD badges bots with 🤖. Covered by the `ai` harness (11 total: determinism, AI-vs-AI resolution, difficulty ordering, edge cases). Works **hot-seat AND networked**: online CPU seats are client-driven — every connected client computes the identical (deterministic) bot action and submits it on the bot's behalf, with the `UNIQUE(room_id,seq)` constraint + the referee turn-cursor making it exactly-once (lowest-latency client wins; no schema change). `create_room` seeds `bots:[{name,color,ai}]` and the lobby create-room form has a CPU-opponents count + difficulty. Edge functions (`submit_action`, `create_room`) deployed.
- [ ] Fuel system: tanks move (limited by fuel), movement consumes fuel
- [x] Shields: destructible particle force field — Sprint 4 Slice 3 DONE (engine absorption + `use_shield` action through the stack + referee turn-enforcement in `submit_action` + shield harness). Networked play pending the `submit_action` redeploy (see `docs/DEPLOY_NEEDED.md`).
- [ ] Power meter visual upgrade: animated fill bar
- [ ] Tank knockback from nearby explosions
- [ ] Turn timer: 30s per turn, configurable in room settings
- [x] **Round system: best of N rounds, configurable** (Sprint 6 Slices 1+3). Deterministic auto-advance inside `resolve()`: a round end records the result (winner `roundWins++`), then ends the match (clinch at ⌈N/2⌉ wins) or regenerates the next round from a per-round derived seed, carrying credits/inventory/score and resetting health/terrain/positions. Configurable odd best-of-N via lobby Advanced settings. **Hot-seat fully covered by the `rounds` harness.** Networked best-of-N is plumbed through the synced room row (no new action — rides existing lockstep) but needs the `create_room` redeploy + a live 2-browser playtest to verify. Between-rounds shop (`ROUND_OVER` pause) still TODO.
- [x] **Scoreboard: damage dealt, kills, rounds won** (Sprint 6 Slice 2). Per-tank `kills` + `totalDamage` attributed to the shooter (overkill/self-damage excluded), accumulated across rounds; covered by the `scoreboard` harness. HUD shows a round indicator, per-player round-win pips, a round-transition banner, and a final scoreboard table in the game-over panel. Postgres persistence of match scores still TODO.
- [ ] Supabase Postgres persistence: scores per session (session-keyed, no accounts) — reuses the MVP2 Supabase project (was SQLite)
- [ ] Sound effects: fire, explosion, wind (Web Audio API synth — no files)
- [ ] Mobile-friendly HUD (touch controls for angle/power/fire)
- [~] Game options: gravity strength, wind strength, terrain type (hills/canyons/flat) — gravity + wind cap + seed exposed via lobby Advanced settings; terrain type still TODO

---

## Open Questions / Decisions to Revisit
*(spec §12 — resolve and record the decision here as they're settled)*

| Question | Default | Notes |
|---|---|---|
| Canvas resolution | 800×500 | Bump to 1200×600 if monitors allow |
| Max players per room | 4 | Original supported 10 — revisit for V1 |
| Terrain algorithm | Midpoint displacement | Now a **pixel bitmap rasterized from midpoint-displacement** (gravity + tank burial, `86f287b`); could still swap the heightmap source for Perlin noise |
| Gravity constant | 0.15 px/tick | Tune during MVP0 playtesting |
| Wind max | 10 | Tune during MVP1 playtesting |
| Audio | Web Audio synth | No files to host |
| Auth/identity | None (name on join) | No accounts |
| HTTPS | No (internal only) | Add cert if policy requires |

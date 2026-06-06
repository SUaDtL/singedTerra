# Open Tasks — singedTerra

Living register of work, organized by delivery phase (**MVP0 → MVP1 → MVP2 → V1**). Check items off as completed. Full details for each item are in [`SPEC.md`](SPEC.md) §9. Architecture context is in [`../CLAUDE.md`](../CLAUDE.md).

**Current phase:** MVP1 client complete (+ early V1 polish) — hot-seat 2–4 player game playable: turn system, health/death/collapse, per-turn **gentle-drift wind** (tunable cap), full HUD (health bars + wind + angle/power + prominent active weapon + controls legend), lobby (2–4 players + unique colors) with an **Advanced settings panel** (wind cap / gravity / seed; blank = engine default), weapon select (Baby Missile, Missile, **Cluster Bomb**), **event-driven explosion rendering** (size/color/duration/style read from each ExplosionEvent — including multi-bomblet clusters), win/draw detection, and game-over + restart. Cluster Bomb is now a real apex **airburst** (multi-projectile model + grouped WeaponDefinition with `detonation{}`/`behavior{airburst}`); explosions are event-driven filled fireballs (pop → hold → fade); craters are round bowls; damage/wind/pacing tuned during playtest. Verified green: typecheck + build + determinism + collision + timestep + turnstate + airburst + wind harnesses (`npm run check`). **Next: MVP2 — networked via Supabase deterministic lockstep** (direction decided; see §5 / MVP2 below).

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

- [ ] Supabase project + Postgres schema (`rooms`, `room_actions`) + RLS policies
- [ ] `submit_action` Edge Function referee: replays `shared/` engine to validate turn/legality, inserts action, updates room cursor
- [ ] NetworkClient: append committed actions; subscribe to the room action log via Supabase Realtime; apply to the LOCAL GameEngine in `seq` order
- [ ] Client regenerates projectile/airburst flight locally from the `fire` action (drops the old `projectile_tick` streaming)
- [ ] Room creation / join flow (4-char alphanumeric code) backed by `rooms`
- [ ] Reconnect / async play: fetch room + replay the action log to current state
- [ ] Network lobby UI: create/join by code, ready-up via Realtime Presence
- [ ] (Optional) disconnect/timeout policy — async turns let a player act later regardless

> Why the pivot: Supabase has no long-running stateful compute, so it can't host a ticking authoritative `GameEngine`; but the engine is deterministic + serializable, so lockstep needs no server. Stays on the Supabase free tier (lightest option). Deletes Node/Socket.io + pm2 + nginx-socket-proxy from the deploy. Enables async / play-by-mail turns.

## V1 — Full Feature Set
*Goal: the thing you actually show people.*

- [ ] Full weapon roster (10 weapons — see spec §4.5)
- [ ] Weapon shop: earn money per turn survived + damage dealt; buy between rounds
- [ ] Fuel system: tanks move (limited by fuel), movement consumes fuel
- [ ] Shields: purchasable, absorbs one hit
- [ ] Power meter visual upgrade: animated fill bar
- [ ] Tank knockback from nearby explosions
- [ ] Turn timer: 30s per turn, configurable in room settings
- [ ] Round system: best of N rounds, configurable
- [ ] Scoreboard: damage dealt, kills, rounds won
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
| Terrain algorithm | Midpoint displacement | Could swap for Perlin noise |
| Gravity constant | 0.15 px/tick | Tune during MVP0 playtesting |
| Wind max | 10 | Tune during MVP1 playtesting |
| Audio | Web Audio synth | No files to host |
| Auth/identity | None (name on join) | No accounts |
| HTTPS | No (internal only) | Add cert if policy requires |

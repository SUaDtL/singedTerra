# Open Tasks — singedTerra

Living register of work, organized by delivery phase (**MVP0 → MVP1 → MVP2 → V1**). Check items off as completed. Full details for each item are in [`SPEC.md`](SPEC.md) §9. Architecture context is in [`../CLAUDE.md`](../CLAUDE.md).

**Current phase:** MVP0 (scaffold done — monorepo wiring compiles; engine/render/net are stubs awaiting implementation).

---

## MVP0 — Bones
*Goal: something visually real. No game yet.* Excludes: turns, health, wind, multiple players, HUD.

- [x] Repo scaffold: npm workspaces, Vite client, Node server, shared package
- [ ] Terrain generation (midpoint displacement) + rendering
- [ ] Tank entity: place 2 tanks on terrain at game start
- [ ] Barrel rendering: rotates with angle input (← →)
- [ ] Power input (↑ ↓)
- [ ] Fire: projectile launches, follows ballistic arc, hits terrain or goes OOB
- [ ] Terrain deformation on impact (crater)
- [ ] Basic explosion visual (expanding circles)

## MVP1 — It's a Game
*Goal: playable hot-seat game, 2–4 players.*

- [ ] Turn system state machine (LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER)
- [ ] Health system: tanks take damage from explosions based on proximity
- [ ] Tank death: remove at health ≤ 0; terrain collapse for unsupported tanks
- [ ] Wind: generated per turn, shown on HUD, affects projectile
- [ ] HUD: health bars, wind, angle, power, active player indicator
- [ ] Hot-seat lobby: enter player names (2–4), pick colors
- [ ] Win condition: last tank alive
- [ ] Baby Missile + Missile weapons (stubs for weapon-select key)
- [ ] Game over screen: winner announcement, restart button

## MVP2 — Networked
*Goal: same gameplay, each player on their own browser.*

- [ ] Socket.io server wired up
- [ ] Room creation / join flow (4-char alphanumeric room code)
- [ ] NetworkClient: send PlayerAction, receive GameState
- [ ] Server-side GameEngine running authoritative physics
- [ ] Projectile position streaming during flight (~20fps delta updates)
- [ ] Player disconnect handling: skip turn, drop if no rejoin within 30s
- [ ] Reconnect: client re-requests full GameState
- [ ] Network lobby UI: create/join with code, wait for all players ready

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
- [ ] SQLite persistence: scores per session (session-keyed, no accounts)
- [ ] Sound effects: fire, explosion, wind (Web Audio API synth — no files)
- [ ] Mobile-friendly HUD (touch controls for angle/power/fire)
- [ ] Game options: gravity strength, wind strength, terrain type (hills/canyons/flat)

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

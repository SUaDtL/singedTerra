# singedTerra — Project Specification
> Heavily-inspired Scorched Earth clone · Browser-based · Self-hosted EC2 · TypeScript throughout

---

## 1. Project Goals

- Capture the core Scorched Earth loop: terrain, tanks, turn-based artillery, wind, weapon variety
- Feel slightly nicer than the 1991 original — smoother visuals, readable UI — without losing the charm
- Run comfortably on a t3.micro (no GPU, minimal RAM pressure)
- Support both hot-seat (all players, one browser tab) and networked play (each player on their own browser)
- Planned as a full feature set but delivered in four phases: MVP0 → MVP1 → MVP2 → V1

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Browser (each player)                              │
│  ┌──────────────────┐   ┌───────────────────────┐  │
│  │  Canvas renderer │   │  Input handler        │  │
│  │  (2D, 800×500px) │   │  (angle, power, fire) │  │
│  └────────┬─────────┘   └──────────┬────────────┘  │
│           │  render state           │  player action │
│           └──────────┬─────────────┘               │
│                      │ GameClient (TS)              │
└──────────────────────┼──────────────────────────────┘
                       │ WebSocket (networked mode)
                       │ direct call (hot-seat mode)
┌──────────────────────┼──────────────────────────────┐
│  EC2 / Node.js       │                              │
│           ┌──────────┴─────────┐                   │
│           │  GameServer (TS)   │                   │
│           │  - Room manager    │                   │
│           │  - Game state      │                   │
│           │  - Physics engine  │  ← authoritative  │
│           │  - Turn manager    │                   │
│           └────────────────────┘                   │
│  Socket.io  ·  Express (static serve)              │
└─────────────────────────────────────────────────────┘
```

### Key architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering | Canvas 2D | No GPU dependency; sufficient for 2D artillery |
| Terrain model | Height map (int array, 1 value per x pixel) | Fast collision, easy to serialize, natural deformation |
| Physics authority | Server-side for networked; in-browser for hot-seat | Single physics module, two execution contexts |
| Client framework | None — vanilla TS + Canvas API | Phaser is overkill; full control over game loop |
| Bundler | Vite | Fast, zero-config TS, clean static output |
| Server | Node.js + Socket.io + Express | Fits existing stack; WebSocket upgrade built in |
| Persistence | None (MVP0–MVP2) · SQLite for V1 scores | Stateless is fine for a lab game |
| Process management | pm2 | Auto-restart, survives reboots |

---

## 3. Repository Structure

```
singedTerra/
├── client/
│   ├── src/
│   │   ├── main.ts              # Entry point, mode selector (hot-seat vs network)
│   │   ├── renderer/
│   │   │   ├── Renderer.ts      # Canvas 2D draw loop
│   │   │   ├── TerrainRenderer.ts
│   │   │   ├── TankRenderer.ts
│   │   │   ├── ProjectileRenderer.ts
│   │   │   └── HUDRenderer.ts
│   │   ├── input/
│   │   │   └── InputHandler.ts  # Keyboard + mouse, emits PlayerAction events
│   │   ├── client/
│   │   │   ├── GameClient.ts    # Abstracts hot-seat vs networked behind same interface
│   │   │   ├── HotSeatClient.ts # Calls shared game engine directly
│   │   │   └── NetworkClient.ts # Socket.io client, syncs server state
│   │   └── ui/
│   │       ├── Lobby.ts         # Pre-game screen (player count, names, mode)
│   │       └── HUD.ts           # In-game overlay (health bars, wind, weapon, power)
│   ├── index.html
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── index.ts             # Express + Socket.io bootstrap
│   │   ├── RoomManager.ts       # Create/join/destroy game rooms
│   │   └── GameServer.ts        # Per-room: owns GameEngine, handles socket events
│   └── tsconfig.json
│
├── shared/
│   └── src/
│       ├── engine/
│       │   ├── GameEngine.ts    # Master game state machine
│       │   ├── Physics.ts       # Projectile ballistics, collision, explosion radius
│       │   ├── Terrain.ts       # Height map generation, deformation, collapse
│       │   ├── Tank.ts          # Tank entity: position, health, fuel, angle, power
│       │   └── WeaponSystem.ts  # Weapon definitions, shop logic (V1)
│       └── types/
│           ├── GameState.ts     # Serializable snapshot of full game state
│           ├── PlayerAction.ts  # Union type of all player inputs
│           └── Events.ts        # Socket.io event names + payload types
│
├── package.json                 # Workspace root (npm workspaces)
├── ecosystem.config.js          # pm2 config
└── nginx.conf                   # Static client + proxy /socket.io to Node
```

### Why `shared/`?

Physics, terrain, and game state types live in `shared/` so:
- Hot-seat mode runs them directly in the browser (zero server round-trips)
- Networked mode runs the same code server-side (authoritative)
- No logic duplication, no drift between client and server physics

---

## 4. Core Game Systems

### 4.1 Terrain

- **Representation**: `Uint16Array` of length `CANVAS_WIDTH` (e.g. 800). Each index is an x-column; the value is the y-height of the terrain surface at that column.
- **Generation**: Midpoint displacement (diamond-square variant) for natural-looking hills. Seed-able for reproducible games.
- **Deformation**: On explosion at `(cx, cy)` with radius `r`, for each column `x` in `[cx-r, cx+r]`, compute the chord depth at that x, subtract from `terrain[x]`, clamp to `[0, CANVAS_HEIGHT]`.
- **Collapse**: After deformation, tanks whose base is no longer supported by terrain fall until they land. Simple: check `tank.y < terrain[tank.x]`, apply gravity each tick until grounded.
- **Rendering**: Fill a polygon from the height map to the canvas bottom. One `beginPath`, iterate columns, `lineTo`, close — drawn once per frame only when terrain is dirty.

### 4.2 Physics

All physics is deterministic given the same inputs. Uses fixed timestep (16ms / 60fps equivalent) so hot-seat and networked produce identical results.

**Projectile motion:**
```
vx += 0 (no drag in base mode)
vy += GRAVITY (e.g. 0.15 px/tick)
vx += wind * WIND_FACTOR per tick
x  += vx
y  += vy
```

**Collision detection:**
- Ground: `y >= terrain[Math.floor(x)]`
- Tank: bounding box check against each tank's `{x, y, w, h}`
- Out of bounds: `x < 0 || x > CANVAS_WIDTH` → miss

**Explosion:**
- Circular damage falloff: `damage = MAX_DAMAGE * (1 - dist/radius)`
- Terrain deformation (see 4.1)
- Tank knockback: small velocity impulse proportional to proximity (V1)

### 4.3 Turn System

```
States: LOBBY → ACTIVE → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER
```

- `PLAYER_TURN`: active player adjusts angle, power, selects weapon, fires
- `FIRING`: projectile in flight — no input accepted
- `RESOLVING`: explosion applied, terrain deformed, health updated, death check
- `NEXT_TURN`: advance to next living player, generate new wind value, broadcast state
- `GAME_OVER`: last tank standing wins

Turn timeout (V1): 30s per turn, configurable.

### 4.4 Wind

- Generated fresh each turn: `wind = (Math.random() * 2 - 1) * MAX_WIND`
- Range: `[-MAX_WIND, +MAX_WIND]` where `MAX_WIND = 10` (tunable)
- Displayed on HUD as a directional arrow + numeric value
- Applied as constant horizontal acceleration to projectile during flight

### 4.5 Weapons (V1 full list, stubs from MVP1)

| Weapon | Behavior |
|---|---|
| Baby Missile | Single projectile, small radius |
| Missile | Single projectile, medium radius |
| Heavy Missile | Single projectile, large radius, high damage |
| Baby Nuke | Large explosion, significant terrain damage |
| Nuke | Very large explosion, massive terrain crater |
| Dirt Bomb | Raises terrain instead of cratering it |
| Bouncing Betty | Projectile bounces off terrain 3× before exploding |
| Funky Bomb | Splits into 5 submunitions mid-flight |
| Napalm | Horizontal spray on impact, damages wide area |
| Cluster Bomb | **Apex airburst**: flies as one shell, splits at the top of its arc into 5 bomblets that fan out and fall ballistically, each cratering where it lands |
| Shield | Places a damage-absorbing shield on your tank (defensive) |

Implemented today: Baby Missile, Missile, Cluster Bomb. The rest are stubs in
the table with rough tuning; V1 implements the full list + shop.

**`WeaponDefinition` shape (grouped).** Each weapon's blast and flight behavior
are kept in two nested groups so the library stays clean as it grows:

```typescript
interface DetonationDef {       // everything about the blast at impact
  radius: number;               // px (PER-SUBMUNITION for airburst weapons)
  maxDamage: number;            // peak damage at blast center
  raisesTerrain?: boolean;      // present (true) only on Dirt Bomb
  style: ExplosionStyle;        // 'blast' | 'cluster'
  color: string;                // CSS color
  durationFrames: number;       // burst animation length
}
interface AirburstDef { trigger: 'apex'; count: number; spread: number }
interface BehaviorDef { airburst?: AirburstDef }   // absent => plain ballistic shell
interface WeaponDefinition {
  type: WeaponType; name: string; implemented: boolean;
  detonation: DetonationDef;
  behavior?: BehaviorDef;
}
```

The engine's single `detonate()` primitive reads `weapon.detonation.*`; the
airburst split reads `weapon.behavior.airburst`.

**Apex-airburst / ballistic-fan model (Cluster Bomb).** The shell flies as one
projectile. The tick its vertical velocity transitions from rising to falling
(apex), it is removed (not detonated) and replaced by `count` submunitions
spawned at that point, each carrying a deterministic horizontal velocity offset:

```
step      = 2 * spread / (count - 1)
offset[i] = (i - (count-1)/2) * step       // symmetric, -spread .. +spread px/tick
sub[i].vx = parent.vx + offset[i]          // vy inherited (≈0 at apex)
```

No randomness — purely a function of the parent state + weapon def, preserving
determinism. Each submunition then falls under gravity + wind like any
projectile and detonates on its own impact via `detonate()`; one that exits the
field is removed with no blast. The turn resolves exactly once, after the LAST
submunition leaves flight. Cluster tuning: 5 bomblets, `spread` 4.5 px/tick
(a wide landing fan across the field), per-bomblet radius 18 / maxDamage 22.

**Damage + pacing tuning.** Implemented weapons were tuned so kills take a few
clean hits and bursts read clearly: Baby Missile maxDamage 34 / durationFrames
50 (~3 hits to kill), Missile maxDamage 60 / durationFrames 56 (~2 hits). Stub
weapons had `durationFrames` bumped to ~50–58 proportionally.

---

## 5. Multiplayer Architecture

### Hot-seat mode

```
Browser
  └─ HotSeatClient
       └─ GameEngine (runs locally, same tab)
            └─ shared/engine/*
```

- All players share one browser window
- `GameEngine` manages whose turn it is
- Input handler accepts input only from the active player
- No network at all — GameEngine ticks via `requestAnimationFrame`

### Networked mode (Supabase deterministic lockstep)

> **This supersedes the earlier Socket.io / dedicated-authoritative-server plan.** Supabase
> has no long-running stateful compute (Edge Functions are stateless), so it cannot host a
> ticking authoritative `GameEngine`. Instead we use **deterministic lockstep**, which the
> engine was already built for (fixed timestep, seeded RNG, no wall-clock, serializable state).

```
Player A browser            Player B browser
  └─ NetworkClient            └─ NetworkClient
       └─ GameEngine (local)       └─ GameEngine (local)   ← each runs shared/engine,
            │  identical state ─────────┘                     applying the same action log
            │  append ▲ / subscribe ▼
   Supabase Postgres  room_actions   (the ordered action log = source of truth)
   Supabase Realtime  broadcast of new rows (fan-out to all clients)
   Supabase Edge Fn   submit_action  (stateless REFEREE: replays shared/ engine to
                                      validate turn + legality, then inserts the row)
```

- **Source of truth is the ordered action log in Postgres** (`room_actions`), not a running
  server. Game state = *(seed + ordered action list)*. Each committed turn is one row whose
  `action` carries the final `{ angle, power, weapon }` (not every aim keystroke).
- **Every client runs `GameEngine` locally** (like hot-seat) and applies each new action in
  `seq` order ⇒ all clients reach byte-identical state.
- **Flight is regenerated, not streamed.** On receiving a `fire` action, a client ticks its
  own engine through `FIRING` and animates the projectile/airburst locally — identical on
  every client. No projectile position crosses the wire (the old `projectile_tick` stream is
  removed); per-turn traffic is a few small messages.
- **Referee = stateless Edge Function.** `submit_action` loads the room's log + seed, replays
  the `shared/` engine (Deno imports the pure TS directly) to confirm it is that player's turn
  and the shot is legal, inserts the row, and updates a denormalized room cursor (turn, active
  player, winner). Authoritative validation without a persistent loop.
- **Async-capable.** Players need not be online together: open the room, replay the log to the
  current state, take your turn. Real-time when both are present (Realtime delivers in ~ms),
  play-by-mail when not. Reconnect / spectate / replay all fall out of replaying the log.
- `GameClient` already hides hot-seat vs network; `NetworkClient` swaps Socket.io for a
  Supabase Realtime subscription + action insert. **`shared/` is unchanged.**

### Data model (Supabase Postgres)

```sql
rooms        ( id, code, seed, status, turn, active_player_id, winner, players jsonb, created_at )
room_actions ( room_id, seq, player_id, action jsonb, created_at )   -- the ordered log
```

RLS: only a room member may read a room's rows; all writes go through the `submit_action`
Edge Function (clients never insert directly). Free-tier friendly — lockstep is the lightest
option (no streaming); the main caveat is Supabase's ~7-day inactivity auto-pause.

---

## 6. GameState Shape

```typescript
// shared/src/types/GameState.ts

interface GameState {
  phase: 'LOBBY' | 'PLAYER_TURN' | 'FIRING' | 'RESOLVING' | 'GAME_OVER';
  turn: number;
  activePlayerId: string;
  wind: number;                    // current wind value
  terrain: number[];               // height map (serialized from Uint16Array)
  tanks: TankState[];
  projectiles: ProjectileState[];  // all in-flight; [] when none. FIRING iff length > 0.
                                   // A single shot may have several (airburst submunitions).
  projectile: ProjectileState | null;  // back-compat alias = projectiles[0] ?? null (derived)
  explosions: ExplosionEvent[];    // every blast of the most recent resolution (N>1 for cluster)
  lastExplosion: ExplosionEvent | null;  // mirrors the last element of explosions (back-compat)
  winner: string | null;
}

interface TankState {
  id: string;
  playerName: string;
  x: number;
  y: number;
  angle: number;                   // degrees, 0 = right, 90 = up
  power: number;                   // 0–100
  health: number;                  // 0–100
  fuel: number;                    // V1
  selectedWeapon: WeaponType;
  inventory: Record<WeaponType, number>;  // V1
  color: string;                   // CSS color string
  alive: boolean;
}

interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponType: WeaponType;
  age: number;          // ticks since spawn (0 on the spawn tick)
  hasSplit: boolean;    // true for airburst submunitions (stops re-split); false otherwise
}
```

---

## 7. Rendering Notes

- **Canvas size**: 800×500 logical pixels, CSS-scaled to fill available width. Maintain aspect ratio.
- **Layers (draw order)**:
  1. Sky gradient (static, drawn once or on resize)
  2. Terrain fill (redrawn when dirty flag set)
  3. Tanks (each frame)
  4. Projectiles (each frame during FIRING; the whole `projectiles[]` array — several at once after an airburst split)
  5. Explosion effect (expanding-ring burst; size/color/duration/style read per ExplosionEvent)
  6. HUD overlay (drawn on top, every frame)
- **Terrain dirty flag**: Only re-render terrain polygon when terrain array has changed. Saves meaningful CPU on a t3.micro.
- **Tank art**: Simple geometric: a rectangle body, a trapezoid tread, a rotatable barrel line. No sprite sheets. Colored per-player.
- **Explosion**: ~20 circles expanding outward from impact point, fading opacity over the event's `durationFrames`. Drawing is **event-driven** — each `ExplosionEvent` supplies radius, `color`, `durationFrames`, and `style` (`'blast'` = wide rings, `'cluster'` = punchier flash), so per-weapon look needs no new draw code. A `cluster` weapon emits N events (one per bomblet) animated together. Pure canvas, no external particle library.

---

## 8. HUD Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [P1: Tank Corps ██████████ 85hp]  WIND: ──►  3.2           │
│                                    WEAPON: Missile           │
│                                                              │
│  [canvas game area]                                          │
│                                                              │
│  ← Angle: 47°    Power: ████████░░  72%    [FIRE]           │
└──────────────────────────────────────────────────────────────┘
```

- Player name + health bar per player (top bar, left-aligned)
- Wind indicator: directional arrow + value (top right)
- Active weapon name (top right, below wind)
- Angle display + left/right arrow keys (bottom left)
- Power meter + up/down keys (bottom center)
- Fire button / spacebar (bottom right)
- All HUD elements are HTML/CSS overlaid on the canvas (not drawn on canvas) — easier to style, no coordinate math

---

## 9. Phase Delivery Plan

> The live, checkable version of this plan is in [`TASKS.md`](TASKS.md). This section is the canonical description of each phase's scope.

### MVP0 — Bones
**Goal**: Something visually real. No game yet.

- Repo scaffold: npm workspaces, Vite client, Node server, shared package
- Terrain generation (midpoint displacement) + rendering
- Tank entity: place 2 tanks on terrain at game start
- Barrel rendering: rotates with angle input (← →)
- Power input (↑ ↓)
- Fire: projectile launches, follows ballistic arc, hits terrain or goes OOB
- Terrain deformation on impact (crater)
- Basic explosion visual (expanding circles)

**Does not include**: turns, health, wind, multiple players, HUD

### MVP1 — It's a Game
**Goal**: Playable hot-seat game, 2–4 players.

- Turn system state machine (LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER)
- Health system: tanks take damage from explosions based on proximity
- Tank death: remove from play when health ≤ 0, terrain collapse for unsupported tanks
- Wind: per turn, gently drifts (|wind| ≤ MAX_WIND, |Δ| ≤ WIND_DRIFT_STEP), shown on HUD, affects projectile; cap tunable via lobby
- HUD: health bars, wind, angle, power, active player indicator
- Hot-seat lobby: enter player names (2–4), pick colors
- Win condition: last tank alive
- Baby Missile + Missile weapons (stubs for weapon select key)
- Game over screen: winner announcement, restart button

### MVP2 — Networked (Supabase deterministic lockstep)
**Goal**: Same gameplay, each player on their own browser. **Deterministic lockstep over
Supabase — no dedicated game server** (see §5).

- Supabase project + Postgres schema (`rooms`, `room_actions`) + RLS policies
- `submit_action` Edge Function referee: replays the `shared/` engine to validate turn +
  legality, inserts the action row, updates the room cursor (turn / active / winner)
- NetworkClient: append committed actions; subscribe to the room's action log via Supabase
  Realtime; apply each new action to the LOCAL GameEngine in `seq` order
- Client regenerates projectile/airburst flight locally from the `fire` action (no streaming)
- Room creation / join flow (4-char alphanumeric code), backed by the `rooms` table
- Reconnect / async play: fetch room + replay the action log to the current state
- Network lobby UI: create / join by code, ready-up via Supabase Realtime Presence
- (Optional) disconnect/timeout policy — async turns mean a player can act later regardless

### V1 — Full Feature Set
**Goal**: The thing you actually show people.

- Full weapon roster (10 weapons per §4.5)
- Weapon shop: earn money per turn survived + damage dealt, buy between rounds
- Fuel system: tanks can move (limited by fuel), movement consumes fuel
- Shields: purchasable, absorbs one hit
- Power meter visual upgrade: animated fill bar
- Tank knockback from nearby explosions
- Turn timer: 30s per turn, configurable in room settings
- Round system: best of N rounds, configurable
- Scoreboard: damage dealt, kills, rounds won
- Supabase Postgres persistence: scores per session (session-keyed, no accounts) — reuses the MVP2 Supabase project instead of the originally-planned SQLite
- Sound effects: fire, explosion, wind (Web Audio API, short synth sounds — no audio files needed)
- Mobile-friendly HUD (touch controls for angle/power/fire)
- Game options: gravity strength, wind strength, terrain type (hills / canyons / flat)

---

## 10. Infrastructure

> **Updated for the Supabase lockstep direction (§5).** MVP2+ uses **Supabase** (Postgres +
> Realtime + Edge Functions, free tier) as the backend — there is **no Node/Socket.io game
> server, no pm2, and no nginx socket proxy** to run. The client is a static Vite build that
> can be hosted anywhere (Supabase Storage / Vercel / Netlify, or the static-serve nginx
> below). The EC2 + pm2 + nginx-reverse-proxy setup that follows is the **superseded**
> authoritative-server plan — kept for reference / in case you ever self-host the static
> client, but the `/socket.io/` proxy and the `server/` process are no longer part of the
> target deployment.

### EC2 Setup (t3.micro, Amazon Linux 2023 or Ubuntu 24.04) — SUPERSEDED (see note above)

```bash
# Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# pm2
sudo npm install -g pm2

# Clone + build
git clone <your-git-remote>/singedTerra
cd singedTerra
npm install
npm run build          # Vite builds client to client/dist/

# Start server
pm2 start ecosystem.config.js
pm2 startup            # survive reboots
pm2 save
```

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'singedTerra',
    script: 'server/dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

### nginx.conf (reverse proxy + static serve)

```nginx
server {
  listen 80;
  server_name game.example.internal;   # or IP

  root /srv/singedTerra/client/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /socket.io/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

### Security Group

- Inbound TCP 80 from internal subnet CIDR only
- Inbound TCP 22 from your IP (SSH)
- No public internet exposure needed

---

## 11. Development Workflow

```bash
# Dev mode (client hot-reload + server watch)
npm run dev          # runs concurrently: vite dev server + nodemon server

# Separate terminals if preferred
npm run dev:client   # Vite on :5173, proxies /socket.io to :3000
npm run dev:server   # nodemon on :3000

# Build for production
npm run build        # tsc + vite build

# Typecheck all workspaces
npm run typecheck
```

Vite dev server proxies `/socket.io` to Node during development — no CORS issues, same origin in prod.

---

## 12. Open Questions / Decisions to Revisit

| Question | Default | Notes |
|---|---|---|
| Canvas resolution | 800×500 | Increase to 1200×600 if monitors are large enough |
| Max players per room | 4 | Scorched Earth supported up to 10 — revisit for V1 |
| Terrain algorithm | Midpoint displacement | Could swap for Perlin noise for smoother hills |
| Gravity constant | 0.15 px/tick | Tune during MVP0 playtesting |
| Wind max | 10 | Tune during MVP1 playtesting |
| Audio | Web Audio API synth | No files to host; revisit if you want sampled sounds |
| Auth/identity | None (name on join) | No accounts, no persistence of identity |
| HTTPS | No (internal only) | Add Let's Encrypt / internal CA cert if policy requires |

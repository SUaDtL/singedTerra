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
| Shield | Places a damage-absorbing shield on your tank (defensive) |

MVP1 stubs: Baby Missile + Missile only. V1 implements full list + shop.

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

### Networked mode

```
Player A browser          Player B browser
  └─ NetworkClient          └─ NetworkClient
       │ socket.emit              │ socket.emit
       └──────────┬───────────────┘
                  │ Socket.io
             GameServer
               └─ GameEngine (authoritative)
                    └─ shared/engine/*
```

- Server owns the single authoritative `GameEngine` per room
- Clients send `PlayerAction` events; server validates, applies, broadcasts new `GameState`
- Clients are **render-only** in networked mode — they never run physics locally
- State sync: full `GameState` snapshot broadcast after each `RESOLVING` phase; delta updates during `FIRING` (projectile position at ~20fps)

### Socket.io Events

```typescript
// Client → Server
'join_room'      { roomId: string, playerName: string }
'create_room'    { playerName: string, options: GameOptions }
'player_action'  PlayerAction  // angle change, power change, fire, weapon select

// Server → Client
'room_joined'    { roomId: string, playerId: string }
'game_start'     GameState
'state_update'   GameState       // after each turn resolves
'projectile_tick' { x: number, y: number }  // during flight
'game_over'      { winner: string }
'error'          { message: string }
```

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
  projectile: ProjectileState | null;
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
}
```

---

## 7. Rendering Notes

- **Canvas size**: 800×500 logical pixels, CSS-scaled to fill available width. Maintain aspect ratio.
- **Layers (draw order)**:
  1. Sky gradient (static, drawn once or on resize)
  2. Terrain fill (redrawn when dirty flag set)
  3. Tanks (each frame)
  4. Projectile (each frame, during FIRING phase)
  5. Explosion effect (particle burst, ~30 frames, CSS-orange palette)
  6. HUD overlay (drawn on top, every frame)
- **Terrain dirty flag**: Only re-render terrain polygon when terrain array has changed. Saves meaningful CPU on a t3.micro.
- **Tank art**: Simple geometric: a rectangle body, a trapezoid tread, a rotatable barrel line. No sprite sheets. Colored per-player.
- **Explosion**: ~20 circles expanding outward from impact point, fading opacity over ~500ms. Pure canvas, no external particle library.

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
- Wind: generated per turn, shown on HUD, affects projectile
- HUD: health bars, wind, angle, power, active player indicator
- Hot-seat lobby: enter player names (2–4), pick colors
- Win condition: last tank alive
- Baby Missile + Missile weapons (stubs for weapon select key)
- Game over screen: winner announcement, restart button

### MVP2 — Networked
**Goal**: Same gameplay, each player on their own browser.

- Socket.io server wired up
- Room creation / join flow (room code, 4-char alphanumeric)
- NetworkClient: send PlayerAction, receive GameState
- Server-side GameEngine running authoritative physics
- Projectile position streaming during flight (~20fps delta updates)
- Player disconnect handling: skip turn, drop if no rejoin within 30s
- Reconnect: client re-requests full GameState on reconnect
- Network lobby UI: create room / join with code, wait for all players ready

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
- SQLite persistence: scores per session (no accounts — session-keyed)
- Sound effects: fire, explosion, wind (Web Audio API, short synth sounds — no audio files needed)
- Mobile-friendly HUD (touch controls for angle/power/fire)
- Game options: gravity strength, wind strength, terrain type (hills / canyons / flat)

---

## 10. Infrastructure

### EC2 Setup (t3.micro, Amazon Linux 2023 or Ubuntu 24.04)

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

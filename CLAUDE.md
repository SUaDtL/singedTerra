# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**singedTerra** — a browser-based, Scorched Earth–inspired turn-based artillery game. TypeScript throughout, Canvas 2D rendering, Node + Socket.io backend, self-hosted on a t3.micro EC2 instance. Supports both **hot-seat** (all players in one browser tab) and **networked** (each player on their own browser) play.

> Named `singedTerra` (singed earth) — a play on *Scorched Earth*, the 1991 game this pays homage to.

**Status:** Greenfield. As of this writing the repo is an empty scaffold (only `.git`). Nothing in the structure below exists yet — it is the target. See `docs/TASKS.md` for the phased build plan and `docs/SPEC.md` for the full specification.

## Commands

The project is planned as an **npm workspaces** monorepo (`client`, `server`, `shared`). These are the intended scripts (per spec §11) — wire them into the root `package.json` as the scaffold is built:

```bash
npm install            # install all workspaces
npm run dev            # concurrently: Vite dev (client) + nodemon (server)
npm run dev:client     # Vite on :5173, proxies /socket.io -> :3000
npm run dev:server     # nodemon server on :3000
npm run build          # tsc + vite build -> client/dist + server/dist
npm run typecheck      # typecheck all workspaces
```

No test runner is chosen yet. When adding one, prioritize **`shared/src/engine/`** (Physics, Terrain, GameEngine) — it is deterministic and the highest-value unit-test target.

## Architecture

The central design constraint is **one physics codebase, two execution contexts**. All game logic lives in `shared/` and runs in exactly one of two places depending on mode:

- **Hot-seat:** the browser runs `shared/engine/*` directly via `HotSeatClient` — zero network, zero server round-trips. `GameEngine` ticks on `requestAnimationFrame`.
- **Networked:** the **server** owns the single authoritative `GameEngine` per room. Clients are **render-only** — they send `PlayerAction`s and receive `GameState` snapshots; they never run physics locally.

`GameClient` is the interface that hides this difference from the renderer/input layers. This is why physics/terrain/types live in `shared/` — to prevent client/server physics drift.

### Determinism is a hard requirement

Physics uses a **fixed 16ms timestep** so hot-seat and networked execution produce identical results. Keep `shared/engine/Physics.ts` free of wall-clock time, `Math.random()` mid-flight, and floating-point nondeterminism. Wind and terrain seeds are generated once per turn/game and fed in as inputs.

### Core data model

- **Terrain** is a `Uint16Array` of length `CANVAS_WIDTH` (800) — one y-height per x-column. This drives everything: O(1) collision (`y >= terrain[floor(x)]`), trivial serialization (sent as `number[]` in `GameState`), and natural deformation (subtract a chord on explosion). Re-render the terrain polygon only when a **dirty flag** is set — meaningful CPU savings on a t3.micro.
- **`GameState`** (`shared/src/types/GameState.ts`) is the single serializable snapshot — phase, turn, active player, wind, terrain, tanks, projectile, winner. The server broadcasts a full snapshot after each `RESOLVING` phase and streams lightweight `projectile_tick` deltas (~20fps) during `FIRING`.
- **Turn state machine:** `LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER`. Input is accepted only during `PLAYER_TURN`. New wind is generated on `NEXT_TURN`.

### Layering / dependency direction

```
client/ (Canvas renderer, input, UI)  ─┐
server/ (RoomManager, GameServer)     ─┼─► shared/ (engine + types)
                                       │
shared/ depends on nothing
```

`shared/` must never import from `client/` or `server/`. Both consumers depend inward on `shared/`.

### Rendering notes

- Canvas is **800×500 logical px**, CSS-scaled, aspect-ratio preserved. Draw order: sky gradient → terrain fill → tanks → projectile → explosion → HUD.
- **HUD is HTML/CSS overlaid on the canvas**, not drawn on it — avoids coordinate math and is easier to style. Don't render HUD elements into the canvas.
- Tank art is geometric (rect body, trapezoid tread, rotatable barrel line) and explosions are pure-canvas expanding circles — no sprite sheets, no particle libraries.

## Conventions specific to this project

- **Angle:** degrees, `0 = right`, `90 = up`. **Power:** 0–100. **Health:** 0–100.
- Tunable constants (gravity `0.15` px/tick, `MAX_WIND = 10`, explosion radii, damage falloff) are expected to be tuned during playtesting — keep them as named constants, not magic numbers scattered in logic. See spec §12 for open tuning questions.
- Socket.io event names and payloads are fixed contracts — see spec §5 and define them once in `shared/src/types/Events.ts`.

## Deployment

Production runs under **pm2** (`ecosystem.config.js`) behind **nginx**, which serves `client/dist` statically and reverse-proxies `/socket.io/` to Node on `:3000`. The box is internal-only (no public internet exposure); HTTPS is currently out of scope. Persistence is none until V1, which adds SQLite for session-keyed scores. Full infra details in `docs/SPEC.md` §10.

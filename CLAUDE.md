# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**singedTerra** — a browser-based, Scorched Earth–inspired turn-based artillery game. TypeScript throughout, Canvas 2D rendering, and a **Supabase backend** (Edge Functions + Postgres + Realtime) for networked play. Supports both **hot-seat** (all players in one browser tab) and **networked** (each player on their own browser) play.

> Named `singedTerra` (singed earth) — a play on *Scorched Earth*, the 1991 game this pays homage to.

**Status:** Implemented and playable (hot-seat + networked), with an ongoing review backlog in `docs/REVIEW_BACKLOG.md`. See `docs/TASKS.md` for the build history and `docs/SPEC.md` for the specification.

## Commands

An **npm workspaces** monorepo with two workspaces: `client` (Vite/Canvas app) and `shared` (the deterministic engine + types). The networked backend is **Supabase** — Edge Functions under `supabase/functions/` and migrations under `supabase/migrations/` — not a Node server in this repo.

```bash
npm install            # install all workspaces
npm run dev            # Vite dev server (client) on :5173
npm run build          # typecheck + vite build -> client/dist
npm run typecheck      # typecheck shared + client
npm run check          # typecheck + run the deterministic engine harnesses (scripts/checks/*.mjs)
```

The engine is covered by deterministic harnesses in **`scripts/checks/*.mjs`** (run via `npm run check`) — `shared/src/engine/` (Physics, Terrain, GameEngine, AI, WeaponSystem) is the highest-value test target. Supabase Edge Functions are deployed with `npx supabase functions deploy <name>`.

## Architecture

The central design constraint is **one physics codebase, two execution contexts**. All game logic lives in `shared/` and runs in exactly one of two places depending on mode:

- **Hot-seat:** the browser runs `shared/engine/*` directly via `HotSeatClient` — zero network, zero server round-trips. `GameEngine` ticks on `requestAnimationFrame`.
- **Networked: deterministic lockstep, NOT server-authoritative.** Every client runs its OWN `GameEngine`, seeded identically. The canonical game is **seed + an ordered action log** (`room_actions` in Postgres). A turn-ending/buy action is POSTed to the `submit_action` Edge Function, which acts as a thin **referee** (validates turn ownership, allocates the next `seq`) — it does NOT run physics. Supabase **Realtime** broadcasts each committed action row; every client applies it to its local engine in `seq` order, so all clients stay in sync without anyone shipping `GameState` over the wire. CPU seats are driven client-side (every client computes the same deterministic plan and submits it; the `seq`-unique constraint + referee cursor make it exactly-once).

`GameClient` is the interface that hides this difference from the renderer/input layers (`HotSeatClient` vs `NetworkClient`). This is why physics/terrain/types live in `shared/` — both the hot-seat engine and every networked client's engine are the SAME code, so they can never drift.

### Determinism is a hard requirement

Physics uses a **fixed 16ms timestep** so hot-seat and networked execution produce identical results. Keep `shared/engine/Physics.ts` free of wall-clock time, `Math.random()` mid-flight, and floating-point nondeterminism. Wind and terrain seeds are generated once per turn/game and fed in as inputs.

### Core data model

- **Terrain** is a per-pixel `Uint8Array` of length `CANVAS_WIDTH * CANVAS_HEIGHT` (800×500) — one byte of solidity per pixel (`0` = air, non-zero = solid), rasterized from a midpoint-displacement height-map silhouette (`generate()` returns the `Uint16Array` height line; `buildBitmap()` rasterizes it). This drives everything: O(1) collision (a point `(x, y)` is solid when its bitmap pixel is set, or `y >= CANVAS_HEIGHT`), and natural deformation (explosions clear a disc of pixels — a real hole; the Dirt Bomb sets them; unsupported columns collapse and bury tanks). Re-render the terrain polygon only when the **`terrainVersion` dirty flag** changes — meaningful CPU savings on a t3.micro. (`shared/src/engine/Terrain.ts`.)
- **`GameState`** (`shared/src/types/GameState.ts`) is each engine's local snapshot — phase, turn, active player, wind, terrain, tanks, projectile, winner. It is NOT shipped over the network (clients derive it by replaying the action log through their own engine); it is the renderer's input. Per-room config is `GameOptions` (`shared/src/types/GameOptions.ts`).
- **Turn state machine:** `LOBBY → PLAYER_TURN → FIRING → RESOLVING → ROUND_OVER → GAME_OVER`. Input is accepted only during `PLAYER_TURN`. New wind is generated when the engine advances to the next turn.

### Layering / dependency direction

```
client/ (Canvas renderer, input, UI, NetworkClient) ──► shared/ (engine + types)
supabase/functions/ (Edge Function referees, Deno)         shared/ depends on nothing
```

`shared/` must never import from `client/`. The Supabase Edge Functions are a separate Deno runtime and do not import `shared/` either (they are thin referees, not physics) — `submit_action` re-derives turn ownership from the action log + a client-reported next-seat index rather than running the engine.

### Rendering notes

- Canvas is **800×500 logical px**, CSS-scaled, aspect-ratio preserved. Draw order: sky gradient → terrain fill → tanks → projectile → explosion → HUD.
- **HUD is HTML/CSS overlaid on the canvas**, not drawn on it — avoids coordinate math and is easier to style. Don't render HUD elements into the canvas.
- Tank art is geometric (rect body, trapezoid tread, rotatable barrel line) and explosions are pure-canvas expanding circles — no sprite sheets, no particle libraries.

## Conventions specific to this project

- **Angle:** degrees, `0 = right`, `90 = up`. **Power:** 0–100. **Health:** 0–100.
- Tunable constants (gravity `0.15` px/tick, `MAX_WIND = 10`, explosion radii, damage falloff) are expected to be tuned during playtesting — keep them as named constants, not magic numbers scattered in logic. See spec §12 for open tuning questions.
- The networked contract is the **Supabase Edge Function** request/response shapes (`supabase/functions/*/index.ts`) plus the `NetworkAction` union in `client/src/client/NetworkClient.ts` — the action types committed to the `room_actions` log. (The old socket.io `Events.ts` event/payload contract was deleted; only `GameOptions` survived, in its own module.)

## Deployment

- **Client:** the static Vite bundle (`client/dist`) is published to **GitHub Pages** by `.github/workflows/deploy-pages.yml` on push to `main` (built with `VITE_BASE=/<repo>/` for the project-site path; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` come from Actions secrets). Any static host at the domain root also works (base defaults to `/`); `nginx.conf` is a sample. There is **no Node app server** and no socket.io proxy; the browser talks to Supabase directly.
- **Networked backend:** **Supabase** hosts the Edge Functions (`supabase/functions/`, deploy with `npx supabase functions deploy <name>`), Postgres (the `rooms` + `room_actions` tables, migrations under `supabase/migrations/`), and Realtime (the action-log broadcast). Project ref + auth are managed by the Supabase CLI.
- Persistence is the Postgres tables above (rooms + their action logs). HTTPS/auth posture is handled by Supabase for the backend; the static client can sit behind any host. (Historical note: an earlier design used pm2 + a Node socket.io server on `:3000`; that stack was removed — REVIEW_BACKLOG P2-12.)

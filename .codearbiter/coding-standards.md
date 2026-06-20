# Coding standards

Structural patterns and conventions extracted from the codebase (2026-06-20). These are
descriptive of the existing code — follow them so new work doesn't drift.

## Layering / dependency direction (HARD — grep-verified)

```
client/ (renderer, input, ui, audio, NetworkClient) ──► shared/ (engine + types)
supabase/functions/ (Deno referees) ──► supabase/functions/_shared/mod.ts only
shared/ depends on nothing.
```

- **`shared/` MUST NOT import from `client/`.** Verified: no such imports exist.
- **`supabase/functions/` MUST NOT import `shared/` or `client/`.** They are a separate Deno runtime. `_shared/mod.ts` carries an explicit comment to this effect. Consequence: the `NetworkAction` contract is **re-declared** in `submit_action/index.ts` rather than imported from `shared/src/net/replay.ts`. Keep the two copies in sync by hand — this is a known, accepted duplication, not an accident.
- `client/` imports `shared/` one-way via the `@shared/*` path alias (`../shared/src/*`).

## Determinism (HARD — the central constraint)

The whole networked design (deterministic lockstep) depends on this. When touching `shared/engine/`:

- **Fixed 16ms timestep.** One `engine.tick()` per rAF frame; never scale by wall-clock elapsed time (`HotSeatClient`). `timestep.mjs` asserts trajectory depends only on tick count.
- **No `Math.random()`, `Date.now()`, or `performance.now()`** anywhere in physics/engine paths. Use the seeded RNG (`shared/src/engine/Random.ts` `createRng`). Wind and terrain are seeded once per round from `seed` + round index and fed in as inputs.
- `terrainVersion` is render-only dirty-flag metadata — it MUST never affect physics/state.
- The log→engine translation lives **only** in `shared/src/net/replay.ts` (`replayNetworkAction`) so the live client and the harnesses can't diverge. Don't reimplement it elsewhere.

## One physics codebase, two execution contexts

All game logic is in `shared/`; it runs in exactly one of two places, hidden behind the
`GameClient` interface (`client/src/client/GameClient.ts`):

- **Hot-seat** (`HotSeatClient`) — runs `GameEngine` directly on rAF; zero network.
- **Networked** (`NetworkClient`) — each browser runs its own identically-seeded `GameEngine`; the canonical game is `seed + room_actions` (ordered log). Realtime broadcasts each committed action; clients apply in `seq` order. Out-of-order delivery is buffered (`pendingActions`/`nextExpectedSeq`).

New renderer/input code talks to `GameClient`, never to a concrete client or the engine directly.

## Module organization

- Engine: `shared/src/engine/*` — `Physics`, `Terrain`, `GameEngine`, `AI`, `WeaponSystem`, `Tank`, plus `math.ts`, `Random.ts`. Types in `shared/src/types/*` (`GameState`, `GameOptions`, `PlayerAction`). Public barrel: `shared/src/index.ts`.
- Client layers: `renderer/` (orchestrator `Renderer.ts` + per-concern renderers), `input/`, `ui/`, `audio/`, `lib/`, entry `main.ts`.
- Edge Functions: one `supabase/functions/<name>/index.ts` per function; shared util in `_shared/mod.ts`; each runs `Deno.serve(withCors(...))`.

## Action contracts (keep distinct)

- **`PlayerAction`** (`shared/src/types/PlayerAction.ts`): `set_angle | set_power | select_weapon | fire | use_shield | buy | next_round`. Aim actions are local-only.
- **`NetworkAction`** (`shared/src/net/replay.ts`): only the turn-ending/neutral subset that gets logged — `fire | use_shield | buy | next_round`. Aim-only actions are **never** logged.

## Conventions

- **Angle:** degrees, `0 = right`, `90 = up`. **Power:** 0–100. **Health:** 0–100.
- Tunable values (gravity `0.15`, `POWER_SCALE 0.165`, `MAX_WIND`, explosion radii, damage falloff, credit constants) are **named constants**, not inline magic numbers — they are tuned during playtesting.
- **HUD is HTML/CSS overlaid on the canvas**, never drawn into it.
- Tank art is geometric, explosions are canvas circles — no sprite sheets / particle libs.
- Harnesses (`scripts/checks/*.mjs`): lowercase dimension names, no `.test`/`.spec` suffix; each top comment states the contract it proves + its run line; expected values are pinned inline as assertions (no golden files).

## Doc-vs-code notes (code is authoritative)

- `GamePhase` enum is `LOBBY | PLAYER_TURN | FIRING | RESOLVING | ROUND_OVER | GAME_OVER`. CLAUDE.md/SPEC mention `NEXT_TURN`; that is an internal transient transition within a resolving `tick()`, **not** an enum member. `ROUND_OVER` (between-rounds shop) is the real phase.

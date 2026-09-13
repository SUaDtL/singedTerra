# Coding standards

Structural patterns and conventions extracted from the codebase (2026-06-20). These are
descriptive of the existing code — follow them so new work doesn't drift.

## Layering / dependency direction (HARD — grep-verified)

```
client/ (renderer, input, ui, audio, NetworkClient) ──► shared/ (engine + types)
supabase/functions/ (Deno referees) ──► supabase/functions/_shared/*
verification-only Edge functions ──► _shared/verifiedMatchReplay.ts ──► shared/
shared/ depends on nothing.
```

- **`shared/` MUST NOT import from `client/`.** Verified: no such imports exist.
- **Ordinary `supabase/functions/` referees MUST NOT import engine code or `client/`.** They remain thin Deno referees. ADR-0013's bounded verification-only path reaches the real deterministic engine through `_shared/verifiedMatchReplay.ts`. P10's retained challenge path, reconciled by ADR-0019, executes only the statically selected generated `shared/src/verified/retained/cq1.mjs` closure in its verification worker. Neither path may duplicate authored physics, enter the live turn path, or become a general game server. The separately reviewed pure `shared/src/net/verifiedCareer.ts` projection is a non-simulation dependency for account APIs; it grants no engine-import exception to ordinary referees. Ordinary gameplay contracts such as `submit_action` remain locally declared.
- `client/` imports `shared/` one-way via the `@shared/*` path alias (`../shared/src/*`).

## Determinism (HARD — the central constraint)

The whole networked design (deterministic lockstep) depends on this. When touching `shared/engine/`:

- **Fixed simulation step.** Each `engine.tick()` advances one fixed 16ms step;
  elapsed time must not scale the physics within a tick. Client scheduling may
  choose how many complete ticks to run. `timestep.mjs` asserts trajectory
  depends only on tick count. The old one-tick-per-rAF description is not a
  determinism requirement and already excludes fast-forward behavior; R12 owns
  refresh-rate pacing and RAF-stop corrections, with acceptance in the current
  recovery ledger.
- **No `Math.random()`, `Date.now()`, or `performance.now()`** anywhere in physics/engine paths. Use the seeded RNG (`shared/src/engine/Random.ts` `createRng`). Wind and terrain are seeded once per round from `seed` + round index and fed in as inputs.
- `terrainVersion` is render-only dirty-flag metadata — it MUST never affect physics/state.
- The log→engine translation lives **only** in `shared/src/net/replay.ts` (`replayNetworkAction`) so the live client and the harnesses can't diverge. Don't reimplement it elsewhere.

## One physics codebase, two live contexts plus verification

All game logic is in `shared/`; live play runs in exactly one of two places, hidden behind
the `GameClient` interface (`client/src/client/GameClient.ts`):

- **Hot-seat** (`HotSeatClient`) — runs `GameEngine` directly on rAF; zero network.
- **Networked** (`NetworkClient`) — each browser runs its own identically-seeded `GameEngine`; the canonical game is `seed + room_actions` (ordered log). Realtime broadcasts each committed action; clients apply in `seq` order. Out-of-order delivery is buffered (`pendingActions`/`nextExpectedSeq`).

New renderer/input code talks to `GameClient`, never to a concrete client or the engine directly.
Completed transcripts may additionally run through the bounded verification-only Edge adapter
defined by ADR-0013. That third execution context is outside `GameClient` and live gameplay.

### Retained challenge contract (P10 / ADR-0019)

- One authored physics source may generate immutable retained editions. The browser
  and verification worker use the same self-contained artifact; no runtime import
  may escape to current engine/constants/CPU/objective/configuration, UI, network,
  clocks or unseeded randomness. Unknown or missing artifacts fail closed. Existing
  deployment V2/V3 paths are not claimed to be immutable by this addition.
- Generate cq1 only from reviewed complete source closure using existing tooling.
  Preserve input inventory, normalized provenance hashes, generator version, bytes
  and license attribution. Normal build/check verifies without regeneration. A
  changed simulation needs a new artifact and edition, retaining the entitlement.
- Opt-in verification budgets check before each unit of dominant work and share
  counters through clones. Unbudgeted engine/CPU behavior must retain legacy and
  ST1 parity. Candidate bounds and observed maxima never substitute for the final
  exact configured caps. Artifact freezing follows the T-07 work-accounting gate.
- Descriptor, objective, artifact, CPU, reward, career projection and response
  versions are separate domains; never infer them from deployment V2/V3, ST1,
  room protocol, client build or each other. Exact parsers refuse unknown fields,
  tuples, seeds, rules and limits. User-controlled data is not reward authority.
- Challenge objective evaluation occurs only after all salvo effects settle.
  Snapshot the living CPU before accepted human fire; positive health loss wins
  before simultaneous terminal death, then engine terminal failure, then third
  unsuccessful human shot failure. CPU shots cannot clear it; do not run a CPU
  after objective terminal. Replay refuses incomplete or trailing transcripts.
- New challenge immutable golden fixture files are an explicit exception to the
  inline-only harness convention below: pin transcript, CPU actions, settled health,
  objective events and (after instrumentation) work counters. Never regenerate
  expected values during tests or weaken legacy fixtures to fit a new result.

## Module organization

- Engine: `shared/src/engine/*` — `Physics`, `Terrain`, `GameEngine`, `AI`, `WeaponSystem`, `Tank`, plus `math.ts`, `Random.ts`. Types in `shared/src/types/*` (`GameState`, `GameOptions`, `PlayerAction`). Public barrel: `shared/src/index.ts`.
- Client layers: `renderer/` (orchestrator `Renderer.ts` + per-concern renderers), `input/`, `ui/`, `audio/`, `lib/`, entry `main.ts`.
- Edge Functions: one `supabase/functions/<name>/index.ts` per function; shared util in `_shared/mod.ts`; each runs `Deno.serve(withCors(...))`.

## Action contracts (keep distinct)

- **`PlayerAction`** (`shared/src/types/PlayerAction.ts`): `set_angle | set_power | select_weapon | fire | use_shield | buy | next_round`. Aim actions are local-only.
- **`NetworkAction`** (`shared/src/net/replay.ts`): only the turn-ending/neutral subset that gets logged — `fire | use_shield | buy | next_round`. Aim-only actions are **never** logged.

## Conventions

- **Angle:** degrees, `0 = right`, `90 = up`. **Power:** the default range is
  0–100; Battery purchases raise `TankState.powerCap`, which the engine uses
  when clamping power. Controls must respect the active mode/seat limit,
  including verified-mode restrictions. R25 owns the pending human-control
  correction; this contract does not assert that every control already does so.
  **Health:** 0–100 is the base range.
- Tunable values (gravity `0.15`, `POWER_SCALE 0.165`, `MAX_WIND`, explosion radii, damage falloff, credit constants) are **named constants**, not inline magic numbers — they are tuned during playtesting.
- **Battle HUD follows ADR-0018's semantic ownership and retained ADR-0017
  visual boundary.** Canvas 2D draws the gameplay world. One Preact tree owns
  semantic rendering, portals, text, focus, accessibility, dialogs, and input.
  The controller/domain layer supplies typed presentation state and consumes
  typed intents; raw DOM nodes do not own gameplay callbacks. Lazy Pixi may
  draw non-interactive chrome and instruments. Both layers consume one typed
  socket/layout result. Do not recreate layout independently in CSS or give
  Pixi gameplay authority.
- Tank art is geometric, explosions are canvas circles — no sprite sheets / particle libs.
- Harnesses (`scripts/checks/*.mjs`): lowercase dimension names, no `.test`/`.spec` suffix; each top comment states the contract it proves + its run line; expected values are pinned inline as assertions (no golden files).

## Doc-vs-code notes (code is authoritative)

- `GamePhase` enum is `LOBBY | PLAYER_TURN | FIRING | RESOLVING | ROUND_OVER | GAME_OVER`. CLAUDE.md/SPEC mention `NEXT_TURN`; that is an internal transient transition within a resolving `tick()`, **not** an enum member. `ROUND_OVER` (between-rounds shop) is the real phase.

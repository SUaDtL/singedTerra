# Inventory + judgment overlay — run 2026-07-02-root

Scope: repository root (`aace04b`). ~25,880 LOC reviewable (ts/tsx/mjs/sql), 69 ts/tsx files,
10 Edge Functions (+12 tests), 8 SQL migrations, 3 CI workflows.

## Structural map

### `shared/` — deterministic engine (imported by client only; depends on nothing)
- `engine/GameEngine.ts` (1533 LOC, churn 22) — turn state machine, tick loop. **Core shared dependency.**
- `engine/Physics.ts` (300) — fixed 16ms timestep; determinism-critical.
- `engine/WeaponSystem.ts` (600, churn 12) — weapon catalog + effects.
- `engine/Terrain.ts` (323, churn 8) — per-pixel bitmap, deformation, collapse.
- `engine/AI.ts` (340) — deterministic forward-sim shot planner.
- `engine/Tank.ts` (221, churn 15), `engine/Random.ts`, `engine/math.ts`.
- `net/replay.ts`, `net/seqGuard.ts` — action-log replay + seq ordering (lockstep core).
- `types/GameState.ts` (265, churn 14), `types/GameOptions.ts`, `types/PlayerAction.ts`.

### `client/` — Vite/Canvas app (→ shared)
- `client/NetworkClient.ts` (1100 LOC, **churn 29 — highest in repo**) — lockstep client,
  Realtime subscription, action POST, fail-open/retry/resync.
- `client/HotSeatClient.ts`, `GameClient.ts` (iface), `fastForward.ts`, `retry.ts`.
- `ui/Lobby.ts` (2217 LOC, churn 21) — **largest file**; room create/join/browse, POSTs.
- `ui/HUD.ts` (2120 LOC, churn 25) — HUD overlay, cockpit gauges.
- `ui/Splash.ts`, `ui/theme.ts`, `ui/gaugeMath.ts`, `ui/browseLabels.ts`.
- `renderer/*` (11 files) — Renderer (1023), Terrain/Tank/Projectile/Effects/HUD renderers, fx.
- `input/InputHandler.ts` (307), `input/inputGate.ts`; `audio/AudioEngine.ts` (363).
- `lib/supabase.ts`, `lib/SupabaseTypes.ts`, `main.ts` (538, churn 28).

### `supabase/functions/` — Deno Edge Function referees (thin; do NOT run physics)
- `_shared/mod.ts` (355, churn 10) — **imported by all 10 functions**: CORS, per-IP rate limit,
  `getServiceClient()` (service_role), `withCors()`. Critical shared dependency + trust surface.
- `submit_action/{index.ts (234, churn 14), validate.ts (270)}` — the referee: membership +
  turn-ownership + exactly-once gating; validate.ts parses untrusted action payloads.
- `create_room/{index,validate}`, `join_room`, `leave_room`, `ready_up`, `restart_game`,
  `finish_game`, `heartbeat`, `list_rooms/{index,mapRoom}`, `update_player`.
- 12 `*.test.ts` (Deno std assert) — backfilled #61/#76.

### `supabase/migrations/` — 8 migrations
- 001_init, 002_rematch, 003_match_scores, 004_atomic_submit_action (RLS + atomic seq RPC),
  005_rate_limits, 006_drop_redundant_index, 007_apply_room_reap, 008_rate_limits_global_cleanup.

### CI/infra
- `.github/workflows/`: `ci.yml`, `codeql.yml`, `deploy-pages.yml` (client → GitHub Pages on push to main).
- `nginx.conf` (sample), Netlify (legacy, being retired per #82).

## External / integration surface
- `@supabase/supabase-js` (browser, `^2.45.0`); Edge Functions pin `@2.107.0` via esm.sh.
- Deno std `0.224.0` assert (tests only).
- Env/secrets: client reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public-by-design);
  Edge Functions read `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`.

## Trust boundaries
1. **Browser → Edge Function** — public POST, `verify_jwt=false` on all 10. Untrusted input =
   request bodies. Primary boundary. → appsec, secrets-supply.
2. **Edge Function → Postgres** — `service_role` client bypasses RLS. Privileged; must gate in-fn.
3. **anon key → Postgres** — RLS: public SELECT, zero writes. Read-only client path.
4. **Client ↔ Client (lockstep)** — trust-the-client (CONFIRM-01 accepted): a client submits
   actions for its own seat + bot seats; referee bounds-checks but does not simulate.

## Risk ranking (highest first)
1. `supabase/functions/submit_action/*` + `_shared/mod.ts` — untrusted input, the security
   boundary, imported everywhere. **Highest appsec/reliability priority.**
2. `client/NetworkClient.ts` — highest churn, lockstep+fail-open logic, boundary. **High-iteration prior.**
3. `shared/engine/{GameEngine,Physics,WeaponSystem,Terrain}.ts` + `net/*` — determinism is a
   hard requirement; a nondeterminism bug desyncs networked play. Core shared dependency.
4. `ui/Lobby.ts`, `ui/HUD.ts` — 2k-LOC god-ish files; architecture/typesafety/maintainability.
5. Migrations 004/005/007/008 — RLS, RPC, rate-limit growth/reap. → migration lens.
6. Renderer / audio / input — hot-loop performance, lower security risk.

## AI-authorship & iteration overlay
- 112 commits; attribution scrubbed 2026-06-21 (12 AI-trailer commits understate true ratio).
- Uniform conventional-commit messages with issue refs = heavy AI-assisted iteration.
- **1 TODO in all source** — very low debt-marker noise; bugs hide in logic, not smells.
- **High-iteration areas (severity prior +):** NetworkClient.ts (29), main.ts (28), HUD.ts (25),
  GameEngine.ts (22), Lobby.ts (21), Tank.ts (15), submit_action/index.ts (14), GameState.ts (14).
- **Prior review context:** "Deep review 2026-06-25" (#71) + fix commits citing #56–#69 already
  landed. Triage/filing MUST dedup against the tracker — this lane re-finds fixed issues.

## Lens roster (all 11 active; none scope-absent)
Wave 1: appsec, architecture, reliability · Wave 2: secrets-supply, migration, test-fidelity ·
Wave 3: coverage, infra, observability, performance, typesafety.

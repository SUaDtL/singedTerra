# Inventory — singedTerra deep review (run 2026-06-25-root)

## Stack

- **Monorepo** (npm workspaces): `client/` (Vite + Canvas 2D, browser TS) and `shared/` (deterministic engine + types, pure TS, depends on nothing).
- **Backend**: Supabase — Edge Functions (Deno) under `supabase/functions/`, Postgres migrations under `supabase/migrations/`, Realtime broadcast of the `room_actions` log. No Node app server.
- **Language**: TypeScript throughout (Deno for edge functions). SQL/plpgsql in migrations.
- **Build/test**: `npm run typecheck`, `npm run check` (typecheck + 47 deterministic `.mjs` harnesses via tsx), `deno test supabase/functions/` (referee tests). CI = `.github/workflows/ci.yml` (check + build) and `codeql.yml`. Dependabot configured.
- **Deploy**: client → Netlify/nginx static; backend → `supabase db push` + `functions deploy`.

## Size profile (TS non-test ≈ 15.6k LOC)

| Area | Notable files (LOC) |
|---|---|
| shared/engine | GameEngine 1533, WeaponSystem 591, AI 340, Terrain 323, Physics 300, Tank 265, Random 58, math 16 |
| shared/net + types | GameState 265, replay 121, PlayerAction 96, GameOptions 62, seqGuard 22 |
| supabase/functions | submit_action 214 + validate 225, _shared/mod 311, create_room 170, finish_game 128, join_room 127, update_player 111, restart_game 188, leave_room 69, ready_up 74, heartbeat 64, list_rooms 60 + mapRoom 39 |
| supabase/migrations | 001_init, 002_rematch, 003_match_scores, 004_atomic_submit_action, 005_rate_limits |
| client/client | NetworkClient 1044, GameClient 114, HotSeatClient 77, retry 41, fastForward 25 |
| client/input | InputHandler 307, inputGate 22 |
| client/renderer + ui | Renderer, TerrainRenderer, HUDRenderer, EffectsRenderer, TankRenderer, ProjectileRenderer, strata, explosionFx, ringBuffer, tankFx, audioEdges; HUD, Lobby, Splash, theme, gaugeMath, browseLabels |

## Risk / trust-boundary overlay (orchestrator judgment)

**Trust boundaries (own them, appsec):**
1. **`supabase/functions/*/index.ts` — the ONLY untrusted-input sink.** Public unauthenticated HTTP endpoints holding the **service-role key** (full DB bypass of RLS). Every request body is attacker-controlled. Validation lives in per-function `validate.ts` + `_shared/mod.ts`. CORS is `*`. **No auth**: identity is a client-generated UUID (`playerId`) that the referee trusts — see ADR 0006. This is the highest-risk surface by far.
   - `submit_action` — referee gating + the only writer of the canonical action log; `validate.ts` (authorizeAction/validateActionShape) is the authz core.
   - `create_room` / `join_room` — room + roster creation (`create_room/validate.ts`).
   - `finish_game` — writes the persisted winner/scoreboard (historically trusted client `winnerId` — verify current state).
   - `update_player` / `ready_up` / `leave_room` / `heartbeat` / `restart_game` / `list_rooms` — roster mutation + listing.
2. **`supabase/migrations/*.sql` — RLS policies are the real security boundary.** The anon key is public; whatever RLS allows, any browser can do directly (bypassing edge functions). `004_atomic_submit_action.sql` holds the `submit_room_action` plpgsql (FOR UPDATE serialization). `005_rate_limits.sql` holds `bump_rate_limit`. Schema↔code drift and destructive-op safety live here.

**Reliability-critical (determinism is a HARD requirement):**
3. **`shared/src/engine/`** — one physics codebase, two execution contexts. Any wall-clock / `Math.random` mid-flight / float nondeterminism = hot-seat vs networked desync. GameEngine (1533 LOC) is the largest unit and the turn state machine. Physics fixed 16ms timestep. Highest reliability-lens value.
4. **`client/src/client/NetworkClient.ts` (1044 LOC)** — the lockstep client: Realtime subscription, action-log replay, `seq` ordering, fastForward, retry. Races / dropped-action / resubscribe hazards live here (prior P0-2 desync was here).

**Lower risk:** renderers, UI, audio, gauge math — cosmetic/DX; bugs are visual, not safety.

## Prior-review context (do NOT re-report as new)

`docs/REVIEW_BACKLOG.md` (2026-06-07) raised 16 tasks **all marked resolved** (economy, lockstep flush, 3-4P dead-skip referee, durable cursor, shield pool, liveness UX, AI weapons, terrain version counter, finish_game winner validation, race-safe seq, lobby clarity, dead socket.io removal, OOB/spec, edge boilerplate consolidation, shared primitives, UI layering). Lenses must verify whether fixes actually landed and find **new/remaining/regressed** issues — not restate the historical backlog.

## Lens launch decision

Full roster launched (all concerns present): appsec, secrets-crypto-supply, reliability, performance, architecture, migration-data-integrity (migrations exist), observability, dx-typesafety, tests-coverage, tests-fidelity. None skipped. Mappers skipped — repo small enough to map inline (Phase 1 judgment test: inline mapping did not bloat triage context).

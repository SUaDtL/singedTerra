# Development and operations

## Requirements

- Node 24.15 or newer within the Node 24 LTS line. [`.nvmrc`](../.nvmrc) records the repository version.
- npm.
- Deno 2 for Edge Function tests.
- Supabase CLI for local backend work or an approved backend release.
- Playwright Chromium for production-browser tests.
- A running Docker engine for the isolated PostgreSQL integration harnesses.

## Install and run

```bash
npm install
npm run dev
```

Vite serves the client at `http://localhost:5173`. Hot-seat and practice modes
work without environment variables.

Online rooms and account features read these public client values from
`client/.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Copy `client/.env.example` as a starting point. The anon key is expected in the
browser bundle. Do not put a service-role key, database password, or access
token in any client environment file.

## Command reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite client |
| `npm run typecheck` | Typecheck `shared` and `client` |
| `npm run check` | Typecheck and run deterministic engine, replay, compatibility, and verified-work checks |
| `npm run test:client` | Run Vitest client and DOM tests |
| `npm run coverage:client` | Run client tests with V8 coverage |
| `npm run check:edge` | Run Deno tests for all Edge Functions |
| `npm run check:database` | Run the Docker-backed PostgreSQL integration harnesses |
| `npm run test:e2e` | Build, serve, and test the production UI in Chromium |
| `npm run build` | Create `client/dist` |
| `npm run backend:release:check` | Validate the backend manifest and release tooling without credentials |
| `npm run check:verified-challenge` | Verify the retained cq1 artifact, controller, work budget, career projection, and retention contracts |
| `npm run deploy:backend` | Run the credentialed migration, config, and exact function release sequence |

Run focused tests through the client workspace. Paths are relative to the
client package:

```bash
npm -w @singedterra/client exec -- vitest run src/ui/LobbyShellView.test.ts
```

## Evidence by change

| Change | Primary evidence |
|---|---|
| Physics, terrain, weapons, turns | Focused deterministic check plus `npm run check` |
| Replay or online command shape | Shared replay checks, client transport tests, and matching Edge tests |
| Lobby, battle console, or input | Focused Vitest plus the affected Playwright profiles |
| Canvas rendering or authored art | Renderer tests and direct production-browser review |
| Edge Function | Focused Deno tests plus `npm run check:edge` |
| Migration or RPC | Immutable migration, focused real PostgreSQL harness, then `npm run check:database` |
| Documentation | Source check, link check, secret scan, and rendered Markdown review |

Hosted CI is the final evidence for the exact pull-request head.

## Deterministic engine rules

Inside `shared/src/engine/`:

- do not read wall-clock time;
- do not use unseeded gameplay randomness;
- preserve numeric operation order unless the versioned contract changes;
- keep tunable values in named constants;
- preserve hot-seat and replay parity;
- add a meaningful deterministic regression for behavior changes.

`shared/` must not import from `client/` or Supabase code.

The root `check` script names deterministic harnesses explicitly. Adding a file
under `scripts/checks/` does not make it run automatically. Add the script to
`package.json` when it belongs in the gate.

## Extending gameplay

A data-driven weapon starts in `shared/src/engine/WeaponSystem.ts`. The weapon
must also appear in starting inventory, store projection, renderer effects, and
the exhaustive icon and action maps. `weapon_contract.mjs` checks the shared
catalog against referee input handling.

New projectile state must remain cloneable and replayable. Extend
`GameEngine.clone()` coverage and the deterministic replay checks whenever a
weapon adds flight or resolving state.

Match options begin in `shared/src/types/GameOptions.ts`. Client setup values
pass through `client/src/client/modeConfig.ts` and
`client/src/client/gameEngineOptions.ts`. Online options also require matching
room admission, referee, replay, and compatibility handling.

`OrderedActionSession` owns the contiguous online sequence cursor and pending
buffer. `NetworkClient` owns Supabase queries and Realtime channels. Keep
ordering logic in the session owner and transport effects in the client.

## UI and asset work

The battle console keeps semantic Preact controls separate from optional Pixi
decoration. Canvas owns the battlefield. Use exact named icons through
`hudIcons.ts` and `weaponIcons.ts`; do not import an entire icon registry.

Generated battle-console assets have their own deterministic builders and
tests:

```bash
npm run build:assets:battle-console
npm run test:assets:battle-console
```

Review UI changes in wide, standard, and compact Chromium profiles. DOM tests
cannot establish rendered target size, overlap, clipping, or screenshot quality.

## Supabase layout

The repository contains Postgres migrations and Deno Edge Functions. There is
no Node game server.

```text
supabase/migrations/                 immutable schema changes
supabase/functions/_shared/         shared request and database helpers
supabase/functions/<operation>/     deployed function entry points
supabase/backend-release-manifest.json
scripts/ci/backendRelease.mjs
```

`supabase/backend-release-manifest.json` binds the complete migration, config,
shared-source, verifier, and function inventory. The release checker normalizes
supported UTF-8 source files before hashing, so Windows and Linux checkouts
produce the same source identity.

Run the credential-free check during ordinary development:

```bash
npm run backend:release:check
```

`npm run deploy:backend` is a real, credentialed release command. It validates
the manifest, pushes pending migrations, pushes project config, and deploys the
exact function inventory. Production uses the protected **Deploy backend
(Supabase)** GitHub workflow with an exact current-main commit and manifest
digest. A Pages publication does not deploy Supabase.

## Crosswind Qualification rollout status

The current source includes migration 024, five challenge and career endpoints,
the fixed cq1 replay artifact, rate limits, native verifier leases, and rollout
inspection tools. Public cq1 starts remain disabled by default.

Production backend release, hosted performance and failure evidence, and a
separate admission-enablement decision are still pending. Local green tests do
not prove a live deployment or award. Do not enable starts to collect ordinary
development evidence.

Use [Crosswind Qualification backend rollout](deployment/verified-challenge-cq1.md)
for the exact disabled-first sequence, operator observations, hosted probe, and
forward-recovery rules.

## Client publication

Pushes to `main` build and publish the static client through
`.github/workflows/deploy-pages.yml`. The workflow writes `deploy-meta.json`,
checks candidate freshness, publishes the Pages artifact, verifies provenance,
and runs a live Chromium smoke check.

Client publication and backend release are independent operations. A client
that can display a verified feature must continue to report the capability as
unavailable when the required backend route or admission control is absent.

## Before review

Use the gates that match the change, then let hosted CI verify the complete
pull-request head. A broad application change normally runs:

```bash
npm run check
npm run test:client
npm run check:edge
npm run check:database
npm run test:e2e
npm run build
```

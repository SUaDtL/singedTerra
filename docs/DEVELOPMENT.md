# Development and operations

## Requirements

- Node 24.15 or newer within the Node 24 LTS line, matching [`.nvmrc`](../.nvmrc)
- npm
- Deno 2 for Edge Function tests
- Supabase CLI for local backend work or backend deployment
- Chromium installed through Playwright for browser tests

## Install and run

```bash
npm install
npm run dev
```

The Vite client runs at `http://localhost:5173`.

Hot-seat mode works without environment variables. Online mode reads
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `client/.env`.

```bash
Copy-Item client/.env.example client/.env
```

Use equivalent file-copy syntax on non-Windows systems.

## Command reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite client |
| `npm run typecheck` | Typecheck `shared` and `client` |
| `npm run check` | Typecheck and run deterministic harnesses |
| `npm run test:client` | Run Vitest client and DOM tests |
| `npm run coverage:client` | Run client tests with V8 coverage |
| `npm run check:edge` | Run Deno tests for all Edge Functions |
| `npm run test:e2e` | Build, serve, and test the production UI in Chromium |
| `npm run build` | Create `client/dist` |
| `npm run deploy:backend` | Push migrations and deploy Edge Functions |

## Test layers

### Deterministic harnesses

`scripts/checks/*.mjs` cover physics, terrain, weapons, movement, rounds,
replay, network ordering, economy, CPU planning, and other shared contracts.

The `npm run check` script names each harness explicitly. Adding a file is not
enough. Wire every new harness into the root `package.json`.

### Client tests

Vitest and jsdom cover UI state, transport seams, input, renderer helpers, and
browser-independent behavior. Coverage is reported through V8.

### Edge Function tests

Deno tests validate request parsing, authorization, rate limits, room rules,
and database-facing helper logic without requiring the production project.

### Production-browser tests

Playwright builds the Vite client and drives real Chromium profiles. These
tests own computed layout, Canvas integration, touch geometry, responsive
behavior, and the live Pages smoke path.

## Change map

| Change | Primary area | Required evidence |
|---|---|---|
| Physics, terrain, weapons, turns | `shared/src/engine/` | deterministic harness |
| Replay or online action shape | shared replay, `NetworkClient`, Edge Functions | harness plus Deno contract tests |
| HUD, lobby, input | `client/src/ui/`, `client/src/input/` | Vitest plus relevant Playwright profile |
| Canvas rendering or authored art | `client/src/renderer/`, `client/public/art/` | renderer tests plus visual browser check |
| Migration | `supabase/migrations/` | new immutable migration plus backend verification |
| Documentation | root Markdown or `docs/` | link, secret, diff, and rendered-copy review |

## Determinism rules

Inside the shared engine:

- do not use wall-clock time;
- do not use unseeded randomness;
- do not change numeric ordering casually;
- keep tunable values in named constants;
- preserve hot-seat and replay parity;
- add a regression harness before changing behavior.

`shared/` must not import from `client/`.

## Supabase

The repository contains migrations and Edge Functions, not a Node game server.

Local configuration starts from `supabase/config.toml`. Production secrets live
in the Supabase project environment. Never commit the service-role key.

Backend deployment is explicit:

```bash
npm run deploy:backend
```

This pushes pending migrations and deploys all Edge Functions. Run Edge tests
before deployment and verify the target Supabase project.

## Client deployment

Pushes to `main` build and publish the static client through
`.github/workflows/deploy-pages.yml`.

The workflow:

1. builds with the repository path as Vite's base;
2. writes `deploy-meta.json` with source provenance;
3. verifies that the candidate is still current `main`;
4. publishes through GitHub Pages;
5. verifies deployed provenance;
6. runs a live Chromium smoke test.

The live site is [suadtl.github.io/singedTerra](https://suadtl.github.io/singedTerra/).

## Pull-request gate

Before asking for review:

```bash
npm run check
npm run test:client
npm run check:edge
npm run test:e2e
npm run build
```

Match the local gate to the change. Hosted CI remains authoritative for the
exact pull-request head.

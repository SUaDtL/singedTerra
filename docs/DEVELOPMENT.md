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

### Review the CLI 3 configuration proposal

Before a backend release, check out the exact current-main candidate, install
its locked dependencies, and set `SUPABASE_PROJECT_REF` to the intended project
in your private shell. The CLI must recognize that project as the production
target. If the checkout is not already linked to it, run the following locally;
this updates the checkout's local link state:

```bash
npx --no-install supabase link --project-ref "$SUPABASE_PROJECT_REF"
```

In PowerShell, use `$env:SUPABASE_PROJECT_REF` in place of
`$SUPABASE_PROJECT_REF`. In the same effective configuration environment intended
for deployment, run:

```bash
node scripts/ci/reviewedConfigDiff.mjs preview
```

Use a clean checkout without project `.env` files or `supabase/config.json`.
The release owner pins the CLI workdir to this checkout and removes inherited
`SUPABASE_*` overrides except the access token and database password. The
project reference is passed explicitly to every mutation.

The command reads the remote configuration with the pinned CLI and displays a
proposal in the interactive terminal. Review every change and target before
using the single-line proposal. It can contain sensitive configuration or
path values: do not paste it into public issues, PRs, logs, or artifacts. The
command refuses missing API sections, masked values, unmanaged settings, or an
unverified target; a zero-change result alone does not establish complete scope.
Resolve those conditions rather than treating the output as an approved diff.

After the authorized reviewer has privately inspected the proposal, store the
exact single-line value in the `production-backend` environment secret named
`REVIEWED_CONFIG_PROPOSAL`. Update that secret for each newly reviewed
proposal before dispatching the protected GitHub workflow. For direct npm
commands, set `REVIEWED_CONFIG_PROPOSAL` alongside `SUPABASE_PROJECT_REF` in
your private shell. The value binds the proposal to the exact source, manifest,
config, CLI version, and project. The release checks it before migrations and
again immediately before config push; an intentional change is accepted when
its proposal matches the review. A changed proposal requires a fresh review.
The receipt records the preflight outcome, not the proposal values. The exact
comparison does not itself prove that a person reviewed the proposal. Proposals
over 32,000 bytes are refused rather than exceeding the protected secret limit.

Treat the full proposal as private and share it only through a protected review
channel. Never place it in a workflow dispatch input, public log, or receipt.

The functions phase uses the manifest's exact function inventory and the same
explicit project reference. It validates release inputs but does not repeat the
pre-push config comparison after config has already been pushed. The standalone
functions command is independently callable with production credentials and an
explicit project ref; it does not claim that a config proposal was reviewed.
Direct npm commands use the checked-out source; an operator must fetch and
verify current main before preparing a production proposal. The GitHub workflow
enforces current-main identity separately.

The Supabase CLI fetches remote configuration again during `config push`; it
does not offer a conditional write bound to the reviewed diff. Another actor
can therefore change the project between the final check and the push. Keep
other configuration writers quiescent during the release and inspect the
post-release observations. If a recheck fails after migrations have already run,
the release is partial: inspect the receipt and use the documented fix-forward
recovery process. This limitation also applies to direct npm use.

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

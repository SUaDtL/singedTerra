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
| `npm run backend:release:check` | Validate the checked-in backend release proposal without credentials |
| `npm run deploy:backend` | Credentialed local backend release command: validate, migrate, configure, then deploy the exact function inventory |

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

## Extending weapons and network ordering

A normal data-driven weapon starts in `shared/src/engine/WeaponSystem.ts`, but
the complete roster also appears in the tank's starting inventory, the store
catalog, and exhaustive renderer/UI maps. Run `npm run check` after changing
the roster; its `weapon_contract.mjs` harness verifies that the shared catalog and the
`submit_action` referee accept the same weapon names. New flight state also
needs coverage in `GameEngine.clone()` and deterministic replay harnesses. If
the change alters canonical outcomes, deliver it through a reviewed version
transition rather than changing active match semantics in place.

`client/src/client/OrderedActionSession.ts` owns the canonical sequence cursor,
pending action buffer, replay state, contiguous drain, and disposal boundary.
`client/src/client/NetworkClient.ts` owns Supabase queries and Realtime channels,
then passes committed rows to that owner and applies admitted actions to the
engine. Add gap and drain-order tests to `OrderedActionSession.test.ts`; add
reconnect, overlapping fetch, and post-stop transport regressions to
`NetworkClient.lockstep.test.ts`.

## Extending mode configuration

`client/src/client/modeConfig.ts` owns setup types and pure normalization.
Use `normalizeRawModeSettings` for form text: blank fields remain omitted so
engine defaults apply. Create-room requests use `normalizeCreateRoomRequest`;
the deferred fallback uses `normalizeCreateRoomFallback` with separate captured
name/rounds/economy and response-time form inputs. Preserve those observation
times when changing lobby forms.

Ready, rejoin, and rematch use `projectAuthoritativeNetworkMode`. It preserves
authoritative numbers and valid team assignments without form clamping. Keep
ready/rejoin ruleset rejection before handoff; the engine builder remains the
final compatibility check. Rematch's successor parsing retains its own legacy
numeric defaults before projection. `ClientModeSetup` provides discriminated
mode types; `ModeSetup` and UI aliases retain existing caller compatibility.

Pin option presence, deferred fallback timing, callback payloads, and exact
initial engine state in `modeConfigCharacterization.test.ts`,
`modeConfigHandoffCharacterization.test.ts`, and the team regression tests.
`gameEngineOptions.ts` remains the engine-input boundary; client construction
and lifecycle orchestration remain separate from normalization.

`client/src/client/modeConfig.extension.test.ts` is an executable extension
example using an explicit four-seat lava/wrap variation of existing settings.
It checks literal engine options, team/AI preservation, gravity, and the complete
initial state (including every terrain byte) through real `HotSeatClient` and
`NetworkClient` constructors against an independently configured `GameEngine`.
It ships no new mode and does not initialize network transport. The companion
`GameSessionComposition.extension.test.ts` sends the same typed setup through
the real composition owner and `createModeClient`, including network
initialization against a local Supabase boundary double. It replaces only
renderer, input, transport, and animation effects, then compares the complete
initial state and terrain bytes with an independently configured engine.

Run this example from the repository root:

```sh
npm exec --workspace client vitest -- run src/client/modeConfig.extension.test.ts
npm exec --workspace client vitest -- run src/client/GameSessionComposition.extension.test.ts
```

The example requires no HUD or Lobby presentation changes. `GameSessionComposition`
owns retirement, acquisition, renderer/input/subscription adoption, and client
start order through explicit ports; mode normalization remains in `modeConfig.ts`.

For a new rule, extend `shared/src/types/GameOptions.ts` and the deterministic engine
first, then the normalization and engine-option boundary. Network rules also
require matching Edge admission/referee validation, room compatibility/version
handling, and replay tests; this constructor fixture does not prove those paths.
Keep lobby selection, rematch/rejoin handoffs, persistence, and visual controls
explicit follow-up integration work rather than treating option parity as a
complete new-mode implementation.

## Supabase

The repository contains migrations and Edge Functions, not a Node game server.

Local configuration starts from `supabase/config.toml`. Production secrets live
in the Supabase project environment. Never commit the service-role key.

Backend deployment is explicit:

```bash
npm run backend:release:check
```

`supabase/backend-release-manifest.json` is the checked-in policy and complete
inventory for migrations, project config, shared runtime sources, verified
replay sources, and all 17 Edge Functions. It intentionally contains no commit
SHA: embedding its own commit would create a circular digest. A release proposal
binds the actual commit and manifest digest when the workflow is dispatched.

Manifest source identity is independent of Git checkout line endings. The
release checker accepts only UTF-8 `.json`, `.toml`, `.sql`, and `.ts` inputs,
preserves any UTF-8 byte-order mark, rejects NUL bytes and bare carriage returns,
and converts CRLF pairs to LF before hashing. Tree records frame the normalized
byte length and normalized bytes, so their length fields are portable too. An
unsupported source type or representation fails closed and must be reviewed
before it can enter the release inventory. Use the `manifestSha256` printed by
`npm run backend:release:check` as the workflow input; a checkout-dependent raw
file hash from a Windows tool is not the release source identity.

The local `npm run deploy:backend` command validates that manifest, then runs
all required release phases in compatibility order: all pending migrations,
noninteractive project config (`config push --yes`), and the exact function
inventory. It is a credentialed command; normal development and CI use
`npm run backend:release:check` instead.

Do not use this local command as a production approval path. The approved
[backend deployment](https://github.com/SUaDtL/singedTerra/actions/runs/34719526794)
completed successfully on attempt 1 for `main`
`10d6fe78409f8110cb25c2a484ae906656837f7d`, with manifest source
`43bb1cdd4f60ba5c56920631ade075a2d0c0c482bdaae23fda97466677c4f059`.
It redeployed all 17 manifest functions. Migrations 001 through 022 were
already applied, so this run applied no new migration. The [software recovery
record](SOFTWARE_RECOVERY.md#recovery-v2-delivery-evidence-2026-09-12) and
[parent-owned canonical ledger](../.codearbiter/plans/evidence-recovery-v2.md)
record the independent review, protected environment, and credential-confinement
evidence. This deployment record does not approve a future release, client
activation, or production smoke test. Future production actions still require
explicit approval; claims require matching evidence.

Production releases use the manual **Deploy backend (Supabase)** workflow. Its
two inputs identify the reviewed proposal: the exact current `main` commit and
the SHA-256 of its manifest. They do not authorize deployment. The
credential-free gate also requires that exact checkout, the newest successful
and unsuperseded push-CI attempt for the same SHA, the lock-pinned Supabase CLI,
the complete inventory and its closed local import graph, the parsed two-job
execution graph and reviewed workflow-source digest, and the configured
environment policy. Function deployment uses only each function's default
hashed `index.ts`; alternate entrypoints, import maps, static files, and unknown
per-function config fields fail validation. The config inventory parser accepts
only bare dotted table names and bare assignment keys; function tables must be
exactly `[functions.name]` with one `verify_jwt` boolean. Quoted or escaped
names, array tables, nested function tables, dotted assignments, and inline
function objects fail closed. The protected job revalidates those facts after
approval before any credentialed operation.

Configure GitHub's `production-backend` environment only through a separately
approved settings change:

- require reviewer `SUaDtL` (the currently verified GitHub login);
- explicitly choose the environment's prevent-self-review setting. For the
  current sole-maintainer setup the proposed value is disabled; enable it when
  an independent reviewer is available;
- disallow administrators from bypassing the environment protection rules;
- restrict deployments to protected branches;
- store `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as environment
  secrets and `SUPABASE_PROJECT_REF` as an environment variable;
- remove any repository-level values with those production credential names.

Until that environment policy exists, the gate fails closed. Settings approval
does not approve a deployment. A deployment still needs a separate dispatch of
an exact SHA and digest, followed by the environment approval.

The production job uses the CLI installed from the lockfile, records read-only
configuration hashes, migration inventory and function versions, and runs
`db push --dry-run` before mutation. These preflights use fail-closed Bash
execution. It then applies migrations, noninteractive config, and the exact
function list. Its attempt-bound, secret-free receipt records source,
workflow run and attempt, actor, required CI run and attempt, CLI and input
digests, compatibility tuples, before/after observations, and every phase
outcome. The manifest, migration-set, and function-set values are canonical
source-identity digests. Management snapshots retain SHA-256 hashes of the raw
API response bytes. Captured CLI observations store sanitized structured values
when they are JSON; non-JSON observations store their raw byte count and SHA-256
instead.

Deliver the backend capability separately from client activation. Start that
PR from current `main`, include the accepted backend compatibility work and this
release gate, and exclude the client activation. An owner-approved merge to
`main` automatically starts the ordinary Pages publication, but that Pages run
does not deploy the backend. After the separate environment-settings approval
and exact-SHA backend deployment, prove the deployed capability before approving
the client-bearing activation merge.

Migrations 021 and 022 are additive compatibility work. Before any versioned
state or receipt is written, recovery may redeploy the prior handlers while
leaving the schema in place. Once versioned verified state or casual receipts
exist, preserve the schema and history and fix forward. Do not call a database
rollback or Git revert a recovery of production state, and never rewrite or
delete completed receipts.

## Client deployment

Pushes to `main` build and publish the static client through
`.github/workflows/deploy-pages.yml`.

Because that publication is automatic, merging a client-bearing recovery branch
is an owner decision. It must not be used to activate a backend capability that
has not been deployed and evidenced first.

The workflow:

1. builds with the repository path as Vite's base;
2. writes `deploy-meta.json` with source provenance;
3. verifies that the candidate is still current `main`;
4. publishes through GitHub Pages;
5. verifies deployed provenance;
6. runs a live Chromium smoke test.

The live site is [suadtl.github.io/singedTerra](https://suadtl.github.io/singedTerra/).

## Main protection and Pages rollback

`main` is protected with strict, app-bound required checks. The recorded
post-application state requires these checks from GitHub Actions app `15368`:

- `typecheck · harnesses · build`
- `edge function tests (deno)`
- `e2e · rendering guardrails`

Branch protection also applies to administrators. The policy change had recorded
owner approval and was applied through a narrow required-checks update followed
by administrator enforcement. The after-state preserves zero required pull
request approvals, disabled stale-review dismissal, disabled code-owner review,
disabled last-push approval, disabled force pushes, disabled branch deletion,
and no repository rulesets.

Pages publication is automatic for qualifying pushes to `main`. A request for
approval to merge a client-bearing change must disclose that ordinary Pages
publication will follow. A Supabase backend deployment needs separate, explicit
approval.

A Pages rollback is a separate, explicitly approved production operation. Use
only the manual rollback path with `ROLLBACK`, the owner-reviewed current
`main` SHA, and the exact source SHA and run of a prior successful trusted Pages
push. For the recorded recovery publication, the accepted artifact is
`github-pages-34713382261` (artifact `10304581142`) from source
`10d6fe78409f8110cb25c2a484ae906656837f7d`; its verified payload SHA-256 is
`574b9623f00e97f8916776e86ff426213b07394835aadcd6b2744107bcba2354`.
The rollback reuploads that one unexpired artifact unchanged. It must not run a
client rebuild or substitute a newly built artifact. Record the owner approval,
selected run, artifact, source SHA, retained protections, and result. If the
artifact is expired or missing, stop and obtain a separately approved recovery
plan. Do not weaken protection to compensate.

The separately configured `production-backend` environment has reviewer
`SUaDtL`, self-review allowed for the current sole-maintainer policy,
administrator bypass disabled, protected-branch eligibility, and no wait timer.
Environment credentials must be provisioned before deployment. This environment
configuration does not approve a deployment. A deployment needs separate,
explicit approval.

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

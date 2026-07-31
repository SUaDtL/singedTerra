# Contributing to singedTerra

singedTerra is a browser artillery game built around deterministic replay.
Contributions are welcome. Start with the current
[documentation index](docs/README.md) and
[architecture guide](docs/ARCHITECTURE.md).

## Set up

Requirements:

- Node 20, matching [`.nvmrc`](.nvmrc)
- npm
- Deno 2 for Edge Function tests
- Chromium through Playwright for production-browser tests

```bash
npm install
npm run dev
```

Hot-seat play works without environment variables. Online play needs the public
Supabase values described in [Development and operations](docs/DEVELOPMENT.md).

## Determinism is the hard rule

Hot-seat and every online browser run the same engine from the same ordered
inputs. A one-pixel or one-tick divergence can desynchronize a networked match.

Inside `shared/src/engine/`:

- do not read wall-clock time;
- do not use `Math.random()` for gameplay;
- keep the fixed timestep intact;
- preserve numeric operation order unless the behavior change is deliberate;
- keep tunable values in named constants;
- add or extend a deterministic harness for changed behavior.

`shared/` must not import from `client/`. Supabase Edge Functions are stateless
referees and do not run projectile physics.

## Choose the right evidence

| Change | Evidence |
|---|---|
| Engine, physics, terrain, weapons, rounds | `npm run check` plus a focused harness |
| Client state or DOM behavior | focused Vitest plus `npm run test:client` |
| Edge Function contract | focused Deno test plus `npm run check:edge` |
| Layout, touch, Canvas, authored art | focused Playwright profile plus `npm run test:e2e` |
| Production bundle | `npm run build` |
| Documentation | rendered Markdown review, link check, secret scan, and diff review |

New harness files under `scripts/checks/` must also be added to the explicit
`npm run check` chain in `package.json`.

## Pull requests

1. Branch from current `main`.
2. Keep one coherent behavior or maintenance slice per pull request.
3. Use a Conventional Commit message.
4. Explain the player or maintainer outcome.
5. List the exact verification performed.
6. Resolve review findings.
7. Wait for required CI and CodeQL checks on the exact head.

The pull-request template asks about determinism impact. Answer it directly,
including for UI-only changes.

## Bugs, ideas, and security

Use the issue templates for bugs and enhancements. Do not fix unrelated
findings inside another change.

Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md). Do not open a public security issue.

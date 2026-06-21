# Contributing to singedTerra

Thanks for your interest! singedTerra is a browser-based, Scorched Earth–inspired turn-based artillery
game — TypeScript throughout, Canvas 2D rendering, and a Supabase backend for networked play. This
guide covers how to get set up and the one rule that matters most here: **determinism**.

## Quick start

It's an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) monorepo with two
workspaces — `client` (the Vite/Canvas app) and `shared` (the deterministic engine + types). The
networked backend is Supabase (Edge Functions + Postgres + Realtime), not a Node server.

```bash
npm install            # install all workspaces
npm run dev            # Vite dev server on http://localhost:5173 (hot-seat works with no backend)
npm run build          # typecheck + production build → client/dist
npm run check          # typecheck + the deterministic engine harnesses  ← run before every PR
npm run check:edge     # Deno tests for the Supabase Edge Functions (needs Deno installed)
```

Use the Node version in [`.nvmrc`](.nvmrc) (`nvm use`). The same `check` / `check:edge` /
`build` commands run in CI on every pull request.

## The one hard rule: determinism

The whole architecture rests on **one physics codebase, two execution contexts**. All game logic lives
in `shared/` and runs either directly in the browser (hot-seat) or as each networked client's own
engine, seeded identically. The canonical networked game is **seed + an ordered action log** — no
`GameState` is ever shipped over the wire; every client replays the log through the SAME engine code.
If two clients' engines diverge by even one pixel, networked play desyncs.

So, in `shared/src/engine/` (especially `Physics.ts`):

- **No wall-clock time** — no `Date.now()`, `performance.now()`. Physics uses a fixed 16ms timestep.
- **No `Math.random()` mid-flight** — randomness comes from the seeded PRNG (`Random.ts`); wind and
  terrain seeds are generated once and fed in as inputs.
- **No floating-point nondeterminism.** Keep numeric behavior identical across runs.
- Tunable constants (gravity, wind cap, explosion radii, damage falloff) stay **named constants**, not
  magic numbers scattered through logic.

`shared/` must never import from `client/`. The Edge Functions (Deno) are thin referees — they
validate turn ownership and allocate sequence numbers; they do **not** run physics and do not import
`shared/`.

## Tests are deterministic harnesses

The engine is covered by harnesses in **`scripts/checks/*.mjs`**, run via `npm run check`. If your
change touches `shared/src/engine/`, add or extend a harness that pins the new behavior — ideally one
that proves identical output for an identical seed.

> ⚠️ **Footgun:** `npm run check` is a hardcoded `&&`-chain in `package.json`, **not** a glob. A new
> `scripts/checks/*.mjs` file is silently never run until you append it to that chain. Always wire a
> new harness in.

Edge Function logic is tested with Deno (`npm run check:edge`) — extract pure, testable helpers
(see `supabase/functions/*/validate.ts`) rather than testing against a live Supabase.

## Pull requests

1. Branch off `main` (`feat/…`, `fix/…`, `chore/…`).
2. Make `npm run check`, `npm run check:edge`, and `npm run build` all pass locally.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for messages
   (`feat(engine): …`, `fix(client): …`, `chore: …`).
4. Open a PR and fill in the template — confirm the determinism impact and that the gates pass. CI
   re-runs them on the PR.

## Reporting bugs & ideas

Use the issue templates. The project convention is to **log** bugs and investigations as issues
(prefix `Bug:` / `Investigate:`) rather than fixing them inline during unrelated feature work.

For anything security-related, see [`SECURITY.md`](SECURITY.md) — please don't open a public issue for
a vulnerability.

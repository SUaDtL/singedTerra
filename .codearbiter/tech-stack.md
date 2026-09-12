# Tech stack

Derived from manifests, lockfiles, and npm scripts (brownfield extraction 2026-06-20).

## Languages & runtimes

- **TypeScript** 7.0.2 is installed as `@typescript/native` and drives `tsc`; the `typescript` package name aliases Microsoft’s `@typescript/typescript6` 6.0.2 compatibility package for structural harnesses until TypeScript 7 ships its replacement API. Configuration is `strict: true`, target/lib **ES2022**, `module: ESNext`, `moduleResolution: Bundler` (`tsconfig.base.json`). Workspace path aliases are project-root-relative; TypeScript 7 removed `baseUrl`.
- **Node** `24.18.0` LTS (`.nvmrc`; root `engines: >=24.15.0 <25`); `@types/node` `^24.13.3`.
- **Deno** — runtime for Supabase Edge Functions. Not version-pinned in-repo (no `deno.json`; `deno.lock` is intentionally ignored). Edge Functions import deps over HTTPS (`https://esm.sh/@supabase/supabase-js@2`, exactly pinned to `2.111.0`).
- **Postgres 15** (`supabase/config.toml` `major_version = 15`).

## Repo shape — npm workspaces monorepo

Two workspaces (`package.json` `workspaces`):

- **`@singedterra/client`** (`client/`) — Vite/Canvas 2D app: renderer, input, UI, audio, `NetworkClient`. Depends on `@singedterra/shared`.
- **`@singedterra/shared`** (`shared/`) — the deterministic engine + types. Exports `./*` → `./src/*`. **Depends on nothing.**
- `supabase/functions/` is **not** a workspace — separate Deno runtime (thin referees).

Both workspace packages are `private: true`.

## Key libraries

- **Vite** `8.2.2` (Rolldown/Oxc-powered client dev server + production build).
- **@supabase/supabase-js** `2.111.0` (browser client); Edge Functions use the same exact `2.111.0` through esm.sh.
- **lucide** `1.33.0` (client-only exact named SVG icon nodes). The package has
  no runtime transitives; importing its all-icons registry is prohibited.
- Canvas 2D — browser API for the gameplay world (sky, terrain, tanks,
  projectiles, explosions, and world-space effects).
- **Preact** is installed in the client workspace. ADR-0018 gives the in-scope
  battle console one semantic tree with typed presentation state and intents,
  portal/focus ownership, and lazy battle entry. It supersedes ADR-0017's
  imperative node/callback preservation, retaining its visual boundary.
- **Battle-HUD visual tooling (ADR-0017, retained by ADR-0018):** exact `pixi.js@8.20.0` is
  installed in the client workspace for a lazy-loaded visual compositor, and
  exact `sharp@0.35.3` is installed at the root as a development-only
  deterministic asset compiler. Both passed the 2026-08-21 dependency review,
  signature/attestation verification, high-severity audit, Windows/Node 24
  install check, and production build. Pixi is visual/non-interactive;
  Preact semantic DOM remains the input, text, focus, and accessibility owner. Sharp
  and libvips are not shipped in the browser bundle. Static Vite/GitHub Pages
  hosting is unchanged.
- Root tooling: `concurrently`, `typescript`, `@types/node`.
- **tsx** `^4.23.1` — used by the `check` script via `npx tsx` to run `.mjs` harnesses against TS engine sources directly (no build step).
- **Supabase CLI** `2.105.0` — exact development-only deployment tool pinned in `package-lock.json`; deploy scripts use the local binary so CLI defaults cannot drift between reviewed and applied configuration.

## Commands (root `package.json`)

| Purpose | Command | Definition |
|---|---|---|
| Dev server | `npm run dev` | `npm -w @singedterra/client run dev` (Vite, :5173) |
| Typecheck | `npm run typecheck` | shared `tsc --noEmit` then client `tsc --noEmit` |
| Build | `npm run build` | `typecheck && vite build` → `client/dist` |
| **Test (engine)** | `npm run check` | `typecheck` + the `npx tsx scripts/checks/*.mjs` determinism harnesses (chained `&&`) |
| **Test (edge fns)** | `npm run check:edge` | `deno test supabase/functions/` (Deno std assert) |
| **Test (client)** | `npm run test:client` | `vitest run` (jsdom env) — DOM + fetch-mock unit tests under `client/src/**/*.test.ts` |
| **Coverage (client)** | `npm run coverage:client` | `vitest run --coverage --maxWorkers=4` (v8 provider; worker bound avoids V8 coverage oversubscription); the refactor gate reads this |
| **Dependency audit** | `npm run audit:deps` | `npm audit --audit-level=high` across runtime and build/test dependencies; the primary CI job runs it after `npm ci` |
| Lint | — | **None.** No ESLint/Prettier/Biome config or script. `tsc --noEmit` (strict) is the static gate. |
| Deploy client | — | GitHub Pages via `.github/workflows/deploy-pages.yml` on push to `main` (no CLI script) |
| Secrets scan | `python "<active-codearbiter-plugin-root>/hooks/preview.py" secrets` | codeArbiter's state-free scanner over staged, unstaged, and untracked changed files; the host resolves the active plugin root before invocation. |
| Backend release proposal check | `npm run backend:release:check` | Credential-free validation of the pinned CLI, manifest, migration/config/function inventory, and release-source identity. It does not deploy. |
| Deploy backend | `npm run deploy:backend` | Validates first, then uses the lockfile-pinned CLI to run `db push --linked --yes`, `config push --yes`, and the manifest's explicit function list. It is credentialed and is not a production-approval path. |
| Deploy all | `npm run deploy` | Alias for the backend command only. Client publication is the Pages workflow after an approved merge to `main`. |

## Testing

Three test layers, by runtime:

- **Engine / pure helpers** — deterministic harnesses in `scripts/checks/*.mjs`, run via `tsx`
  (`npm run check`), asserting byte-identical replay of `(seed + ordered action log)`. Cover the
  `shared/` engine and the pure client helpers (gaugeMath, browseLabels, inputGate, ringBuffer,
  fastForward, strata, audioEdges, …).
- **Edge Functions** — Deno `*.test.ts` (`npm run check:edge` → `deno test`), covering the pure
  referee logic (validate/authorize/coerce/reap) extracted from the handlers.
- **Client (DOM + fetch)** — **Vitest** `4.1.11` with the **jsdom** environment (`npm run test:client`),
  giving the DOM- and `fetch`-heavy client code (Lobby, HUD, NetworkClient) a seam the tsx harnesses
  cannot reach. **Coverage:** `@vitest/coverage-v8` `4.1.11` via
  `npm run coverage:client` — this is the command the
  `/ca:refactor` Phase-2 gate reads. Added 2026-07-03 to unblock the client refactor backlog
  (#85/#87/#91); vitest/vite/esbuild are dev-only (not in the shipped bundle).
  Vitest 4 uses AST-aware v8 remapping, so percentages are not directly
  comparable to Vitest 2 reports; the executable test set remains the governing
  compatibility oracle until a global threshold is adopted.
- CI runs all three layers (`.github/workflows/ci.yml`).

### Battle console asset verification

Run `npm run test:assets:battle-console` for deterministic generation, source-bound geometry, responsive pixel preservation, and repaired instrument faces. Run `npx playwright test -c playwright.product-completion.config.ts` for the five-profile browser suite. CI runs this separately from the general game journeys. Local runs reuse the single preview at port 5198.

## License

**MIT (open-source).** The repository has a root `LICENSE` and all package
manifests declare MIT. Third-party notices are retained in
`THIRD_PARTY_NOTICES.md`.

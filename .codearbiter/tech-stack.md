# Tech stack

Derived from manifests, lockfiles, and npm scripts (brownfield extraction 2026-06-20).

## Languages & runtimes

- **TypeScript** `^5.5.4` (`package.json`), `strict: true`, target/lib **ES2022**, `module: ESNext`, `moduleResolution: Bundler` (`tsconfig.base.json`).
- **Node** `24` LTS (`.nvmrc`, root `engines: 24.x`); `@types/node` `^24.13.3`.
- **Deno** — runtime for Supabase Edge Functions. Not version-pinned in-repo (no `deno.json`; `deno.lock` is intentionally ignored). Edge Functions import deps over HTTPS (`https://esm.sh/@supabase/supabase-js@2`, exactly pinned to `2.110.9`).
- **Postgres 15** (`supabase/config.toml` `major_version = 15`).

## Repo shape — npm workspaces monorepo

Two workspaces (`package.json` `workspaces`):

- **`@singedterra/client`** (`client/`) — Vite/Canvas 2D app: renderer, input, UI, audio, `NetworkClient`. Depends on `@singedterra/shared`.
- **`@singedterra/shared`** (`shared/`) — the deterministic engine + types. Exports `./*` → `./src/*`. **Depends on nothing.**
- `supabase/functions/` is **not** a workspace — separate Deno runtime (thin referees).

Both workspace packages are `private: true`.

## Key libraries

- **Vite** `6.4.3` (client dev server + build).
- **@supabase/supabase-js** `2.110.9` (browser client); Edge Functions use the same exact `2.110.9` through esm.sh.
- **lucide** `1.27.0` (client-only exact named SVG icon nodes). The package has
  no runtime transitives; importing its all-icons registry is prohibited.
- Canvas 2D — pure browser API, no rendering lib.
- Root tooling: `concurrently`, `typescript`, `@types/node`.
- **tsx** `^4.23.1` — used by the `check` script via `npx tsx` to run `.mjs` harnesses against TS engine sources directly (no build step).

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
| Lint | — | **None.** No ESLint/Prettier/Biome config or script. `tsc --noEmit` (strict) is the static gate. |
| Deploy client | — | GitHub Pages via `.github/workflows/deploy-pages.yml` on push to `main` (no CLI script) |
| Secrets scan | `python "<active-codearbiter-plugin-root>/hooks/preview.py" secrets` | codeArbiter's state-free scanner over staged, unstaged, and untracked changed files; the host resolves the active plugin root before invocation. |
| Deploy backend | `npm run deploy:backend` | `npx supabase db push --yes && npx supabase functions deploy --use-api --yes` |
| Deploy all | `npm run deploy` | backend then client |

## Testing

Three test layers, by runtime:

- **Engine / pure helpers** — deterministic harnesses in `scripts/checks/*.mjs`, run via `tsx`
  (`npm run check`), asserting byte-identical replay of `(seed + ordered action log)`. Cover the
  `shared/` engine and the pure client helpers (gaugeMath, browseLabels, inputGate, ringBuffer,
  fastForward, strata, audioEdges, …).
- **Edge Functions** — Deno `*.test.ts` (`npm run check:edge` → `deno test`), covering the pure
  referee logic (validate/authorize/coerce/reap) extracted from the handlers.
- **Client (DOM + fetch)** — **Vitest** `4.1.10` with the **jsdom** environment (`npm run test:client`),
  giving the DOM- and `fetch`-heavy client code (Lobby, HUD, NetworkClient) a seam the tsx harnesses
  cannot reach. **Coverage:** `@vitest/coverage-v8` `4.1.10` via
  `npm run coverage:client` — this is the command the
  `/ca:refactor` Phase-2 gate reads. Added 2026-07-03 to unblock the client refactor backlog
  (#85/#87/#91); vitest/vite/esbuild are dev-only (not in the shipped bundle).
  Vitest 4 uses AST-aware v8 remapping, so percentages are not directly
  comparable to Vitest 2 reports; the executable test set remains the governing
  compatibility oracle until a global threshold is adopted.
- CI runs all three layers (`.github/workflows/ci.yml`).

## License

**MIT (open-source).** The repository has a root `LICENSE` and all package
manifests declare MIT. Third-party notices are retained in
`THIRD_PARTY_NOTICES.md`.

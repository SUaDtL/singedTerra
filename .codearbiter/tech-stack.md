# Tech stack

Derived from manifests, lockfiles, and npm scripts (brownfield extraction 2026-06-20).

## Languages & runtimes

- **TypeScript** `^5.5.4` (`package.json`), `strict: true`, target/lib **ES2022**, `module: ESNext`, `moduleResolution: Bundler` (`tsconfig.base.json`).
- **Node** `20` (`.nvmrc`); `@types/node` `^20.14.0`.
- **Deno** — runtime for Supabase Edge Functions. Not version-pinned in-repo (no `deno.json`; `deno.lock` schema `version: 5`). Edge Functions import deps over HTTPS (`https://esm.sh/@supabase/supabase-js@2`, locked to `2.107.0`).
- **Postgres 15** (`supabase/config.toml` `major_version = 15`).

## Repo shape — npm workspaces monorepo

Two workspaces (`package.json` `workspaces`):

- **`@singedterra/client`** (`client/`) — Vite/Canvas 2D app: renderer, input, UI, audio, `NetworkClient`. Depends on `@singedterra/shared`.
- **`@singedterra/shared`** (`shared/`) — the deterministic engine + types. Exports `./*` → `./src/*`. **Depends on nothing.**
- `supabase/functions/` is **not** a workspace — separate Deno runtime (thin referees).

Both workspace packages are `private: true`.

## Key libraries

- **Vite** `^5.4.0` (client dev server + build).
- **@supabase/supabase-js** `^2.45.0` (browser client); Edge Functions use `@2` via esm.sh → `2.107.0`.
- Canvas 2D — pure browser API, no rendering lib.
- Root tooling: `concurrently`, `typescript`, `@types/node`.
- **tsx** — used by the `check` script via `npx tsx` to run `.mjs` harnesses against TS engine sources directly (no build step). Not declared as a dep; resolved at runtime via npx.

## Commands (root `package.json`)

| Purpose | Command | Definition |
|---|---|---|
| Dev server | `npm run dev` | `npm -w @singedterra/client run dev` (Vite, :5173) |
| Typecheck | `npm run typecheck` | shared `tsc --noEmit` then client `tsc --noEmit` |
| Build | `npm run build` | `typecheck && vite build` → `client/dist` |
| **Test** | `npm run check` | `typecheck` + **19** `npx tsx scripts/checks/*.mjs` harnesses (chained `&&`) |
| Lint | — | **None.** No ESLint/Prettier/Biome config or script. `tsc --noEmit` (strict) is the static gate. |
| Deploy client | — | GitHub Pages via `.github/workflows/deploy-pages.yml` on push to `main` (no CLI script) |
| Deploy backend | `npm run deploy:backend` | `npx supabase db push --yes && npx supabase functions deploy --use-api --yes` |
| Deploy all | `npm run deploy` | backend then client |

## Testing

- **No test framework** (no vitest/jest/mocha). The engine is covered by **19 deterministic harnesses** in `scripts/checks/*.mjs`, run via `tsx`, asserting byte-identical replay of `(seed + ordered action log)`.
- **No coverage tool** (no c8/nyc/istanbul) and no coverage thresholds.
- **Edge Functions are not unit-tested** (no `*.test.ts`, no `deno.json`, no `deno test` wired into scripts). They are deployed, not tested in CI (there is no CI — see `coding-standards.md`).

## License

**Intended: MIT (open-source)** — confirmed with maintainer 2026-06-20. Not yet enacted: there is no `LICENSE` file or `license` field, and all packages are `private: true`. See `open-tasks.md` for the follow-up.

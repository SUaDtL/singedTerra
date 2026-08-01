# Client Production Unchecked Indexing Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make every indexed lookup in the browser's production TypeScript surface explicitly safe and keep that guarantee enforced by the normal client typecheck, while preserving the existing test-fixture migration as a separate bounded cell toward issue #70.

## SMARTS decision

The chosen design adds a production-only TypeScript project that enables `noUncheckedIndexedAccess`, excludes `*.test.ts`, and is invoked by the existing client typecheck before the current full-project compile. A fresh probe found 52 production findings across 11 files and 239 separate test-fixture findings across 119 test files.

Alternatives rejected:

- Enabling the flag for all client tests in the same PR would mix production safety decisions with hundreds of mostly mechanical fixture assertions and weaken adversarial review.
- Fixing the 52 production sites without an enforced config would allow the next edit to regress immediately.
- Skipping the existing full-project compile would reduce test-source coverage; the new strict production pass must be additive.

SMARTS verdict: strong, high confidence. The boundary is specific, dependency-free, reversible, and enforced in local and hosted CI. It advances issue #70 through the most valuable remaining code while leaving one honest, independently resumable test-fixture cell.

## Compiler boundary

- Add `client/tsconfig.production.json`, extending the current client config, enabling `noUncheckedIndexedAccess`, and excluding `src/**/*.test.ts`.
- Add `typecheck:production` to `client/package.json`; the existing `typecheck` script runs the production-strict project and the original complete client compile.
- Do not change `tsconfig.base.json` or relax any current strict option.
- Resolve all 52 production findings in the exact currently surfaced files: `InputHandler.ts`; `EffectsRenderer.ts`; `napalmFirelight.ts`; `ProjectileRenderer.ts`; `Renderer.ts`; `ringBuffer.ts`; `terrainEdges.ts`; `TerrainRenderer.ts`; `Lobby.ts`; `LobbyCreateView.ts`; and `theme.ts`.

## Safety contract

- Prefer explicit bounds/empty guards, total helpers, and stable visual fallbacks over broad non-null assertions or casts.
- Preserve deterministic shared state, action ordering, renderer draw order, particle counts for valid inputs, input direction semantics, lobby behavior, and visible theme values.
- Malformed or truncated presentation inputs fail soft: skip an absent draw item, return a neutral value, or preserve the last valid state instead of leaking `undefined`.
- Existing test source remains typechecked under the current policy; no test file is changed merely to satisfy this production slice.

## Explicit non-goals

- No `noUncheckedIndexedAccess` enablement for test fixtures or `tsconfig.base.json`.
- No gameplay tuning, shared-engine change, Supabase/backend/auth/migration change, dependency, lockfile, asset, or visual redesign.
- No opportunistic renderer or Lobby refactor outside exact findings.
- Do not close issue #70; record production completion and leave test-fixture enablement open.

## Acceptance evidence

- The new production-strict command is captured RED with exactly 52 findings before source changes and GREEN afterward.
- Focused tests cover any newly defined malformed/empty production behavior.
- The original full client typecheck still runs and passes, proving test source was not dropped.
- `npm run check`, `npm run test:client`, `npm run build`, and `npm run audit:deps` pass from fresh commands.
- A diff audit proves no shared engine, public network/action shape, dependency, lockfile, backend, workflow, or asset changed.
- One adversarial subagent reviews the exact final package; all Critical, High, Medium, and merge-blocking findings are corrected.
- Exact-head hosted CI precedes standing-authority merge, followed by exact deployment provenance and live smoke.

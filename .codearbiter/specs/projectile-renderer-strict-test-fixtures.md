# Projectile Renderer Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the projectile renderer's two test suites prove every indexed fixture access before use, and keep that guarantee enforced by the normal client typecheck as the first bounded test-fixture cell toward issue #70.

## SMARTS decision

A fresh full-client strict probe reports 239 test-only findings across 34 files: 199 renderer, 23 client, and 17 UI. The two projectile renderer suites account for 43 findings in a coherent unit: 29 in `ProjectileRenderer.test.ts` and 14 in `ProjectileRenderer.groundShadow.test.ts`.

The chosen design adds one reusable strict-test TypeScript project whose explicit include list starts with those two suites. The normal client typecheck runs production strictness, this growing strict-test set, and the unchanged complete compile.

Alternatives rejected:

- Fixing all 239 findings in one PR would mix 34 suites and make assertion-semantics review unnecessarily broad.
- Fixing files without an enforced strict-test project would allow immediate regression.
- Replacing the complete compile with the partial strict project would reduce coverage.

SMARTS verdict: strong, high confidence. This is a specific, dependency-free, reversible 43-finding cell with a durable enforcement seam for later fixture groups.

## Compiler boundary

- Add `client/tsconfig.tests-strict.json`, extending the production-strict project, explicitly including only the two projectile renderer test suites and clearing the inherited test exclusion.
- Add `typecheck:tests-strict` to `client/package.json`; normal `typecheck` runs production strictness, strict migrated tests, and the original complete compile.
- Resolve exactly the 43 current findings in `client/src/renderer/ProjectileRenderer.test.ts` and `client/src/renderer/ProjectileRenderer.groundShadow.test.ts`.
- Do not change production source.

## Assertion contract

- Prefer causal assertion helpers or explicit guards that fail the test with a useful message when expected fixture data is absent.
- Do not use optional chaining or fallback values that could let a missing draw call, projectile, coordinate, or command pass silently.
- Non-null assertions are allowed only immediately after an assertion that proves the same value exists and TypeScript cannot retain the narrowing.
- Preserve test names, production behavior, draw ordering, snapshot meaning, and all expected numeric values.

## Explicit non-goals

- No other test suite, production source, shared engine, dependency, lockfile, backend, workflow, asset, or gameplay change.
- No global test strictness yet; the strict-test include list grows in later bounded cells.
- Do not close issue #70 while 196 measured findings remain outside this cell.

## Acceptance evidence

- The strict-test command is captured RED with exactly 43 findings across the two named files and GREEN afterward.
- Both focused suites pass with unchanged test counts.
- The production strict pass and original complete client compile still pass.
- `npm run check`, `npm run test:client`, `npm run build`, and `npm run audit:deps` pass fresh.
- One adversarial subagent reviews the exact final package; all Critical, High, Medium, and merge-blocking findings are corrected.
- Exact-head hosted CI precedes standing-authority merge, followed by exact deployment provenance and live smoke.

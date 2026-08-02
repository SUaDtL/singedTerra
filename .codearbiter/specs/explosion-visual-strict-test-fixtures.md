# Explosion Visual Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the explosion-signature and blast-lighting test suites prove every indexed render trace before use, then add them to the enforced strict-test migration set for issue #70.

## SMARTS decision

After the projectile fixture slice, a fresh strict probe reports 196 findings across 32 test files. `Renderer.explosionSignatures.test.ts` owns 27 and `Renderer.blastLighting.test.ts` owns 20. Together they protect the same player-visible explosion identity, geometry, compositing, and light-burst contract; their baseline is 16 passing tests.

Alternatives rejected:

- Mixing all remaining renderer files would combine unrelated terrain, vehicle, wind, and impact contracts.
- Migrating only one of these two suites would split one visual behavior across two PRs for little review benefit.
- Compiler-only optional chaining or fabricated defaults would hide missing Canvas calls and weaken the contract.

SMARTS verdict: strong, high confidence. This is a specific 47-finding, two-suite extension of the already-reviewed additive enforcement seam.

## Compiler boundary

- Add the two explosion visual suites to `client/tsconfig.tests-strict.json` alongside the already-migrated projectile suites.
- Resolve exactly 47 current findings: 27 in `Renderer.explosionSignatures.test.ts` and 20 in `Renderer.blastLighting.test.ts`.
- Preserve production strictness, the existing migrated projectile suites, and the unchanged complete compile.
- Do not change production source.

## Assertion contract

- Missing expected Canvas calls, gradients, rectangles, burst samples, or coordinate tuples must fail with a causal message.
- Prefer local required-value helpers, tuple construction, assertion-backed guards, and bounded iteration.
- Do not use optional chaining or fallback values where absence should fail the test.
- Preserve test names, expected values, call ordering, mutation guards, and 16-test baseline.

## Explicit non-goals

- No other test suite, production source, dependency, lockfile, shared engine, backend, workflow, asset, or gameplay change.
- Do not close issue #70; 149 measured findings should remain after this cell.

## Acceptance evidence

- Strict-test command is captured RED with exactly 47 new findings across the two named files and GREEN afterward while prior migrated suites stay green.
- Both focused suites pass all 16 tests.
- Fresh all-client strict probe reports exactly 149 findings and zero in every migrated suite.
- Normal typecheck, `npm run check`, `npm run test:client`, `npm run build`, and dependency audit pass.
- One adversarial subagent reviews the exact package; all Critical, High, Medium, and merge blockers are corrected.
- Exact-head hosted CI precedes standing-authority merge, exact deployment provenance, and live smoke.

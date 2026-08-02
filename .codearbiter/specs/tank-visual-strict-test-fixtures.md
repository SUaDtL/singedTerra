# Tank Visual Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the tank loadout, modular art, recoil, mobility, and wreck renderer suites prove indexed visual data before use, then add them to the enforced strict-test migration set for issue #70.

## SMARTS decision

After the EffectsRenderer slice, the strict remainder is 100 findings across 24 files. Seven tank-visual suites own 31 findings: wreck ordering 8, loadout 8, renderer recoil 5, part art 4, mobility 3, wreck rendering 2, and recoil math 1. Together they protect the player-visible tank customization and lifecycle contract with a 57-test green baseline.

SMARTS verdict: strong, high confidence. This is the largest remaining visually coherent cell and directly guards the modular tank fidelity work, while keeping stateful lobby-session changes separate.

## Compiler boundary

- Add all seven tank-visual suites to `client/tsconfig.tests-strict.json` alongside every previously migrated suite.
- Resolve exactly 31 current findings with no production-source change.
- Preserve production strictness, all prior strict suites, and the unchanged complete compile.

## Assertion contract

- Missing expected tank parts, operations, recoil samples, mobility traces, or wreck-order entries must fail causally.
- Prefer required-value helpers, explicit tuples, and narrowed lookups.
- Do not use optional access, fallback values, non-null assertions, or broad casts where absence should fail.
- Preserve test names, expected values, customization distinctions, ordering, transform geometry, and the 57-test baseline.

## Explicit non-goals

- No other test suite, production source, dependency, lockfile, engine, backend, workflow, asset, or gameplay change.
- Do not close issue #70; exactly 69 findings across 17 files should remain after this cell.

## Acceptance evidence

- Strict-test RED is exactly 31 findings across the seven targets and GREEN afterward; prior migrated suites stay clean.
- All seven focused suites pass 57/57.
- Full strict probe reports exactly 69 findings across 17 remaining files with zero migrated-suite errors.
- Normal typecheck, 60 harnesses, full client tests, Edge tests, build, dependency audit, and diff checks pass.
- The single designated adversarial subagent clears all Critical, High, Medium, and merge blockers, including coverage audit.
- Exact-head hosted CI precedes standing-authority merge, deployment provenance, and live smoke.

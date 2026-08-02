# Atmosphere Visual Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the wind-gust and atmosphere-cloud renderer suites prove indexed visual trace data before use, then add them to the enforced strict-test migration set for issue #70.

## SMARTS decision

After the explosion fixture slice, the strict remainder is 149 findings across 30 files. `Renderer.windGusts.test.ts` owns 20 and `atmosphereClouds.test.ts` owns 1. Together they protect the sky's ambient motion contract, with a 19-test green baseline.

SMARTS verdict: strong, high confidence. The 21-finding two-suite cell is visually coherent, dependency-free, and smaller than mixing wind with unrelated impact or vehicle traces.

## Compiler boundary

- Add the two atmosphere suites to `client/tsconfig.tests-strict.json` alongside all previously migrated suites.
- Resolve exactly 21 current findings: 20 wind-gust and 1 atmosphere-cloud.
- Preserve production strictness, every prior strict suite, and the unchanged complete compile.
- Do not change production source.

## Assertion contract

- Missing expected strokes, coordinates, alpha samples, gradients, or color channels must fail causally.
- Prefer required-value helpers, tuple construction, and explicit guards.
- Do not use optional access or fallback values where absence should fail.
- Preserve test names, expected values, deterministic animation assertions, caller-state restoration, and the 19-test baseline.

## Explicit non-goals

- No other test suite, production source, dependency, lockfile, engine, backend, workflow, asset, or gameplay change.
- Do not close issue #70; exactly 128 findings should remain after this cell.

## Acceptance evidence

- Strict-test RED is exactly 21 new findings across the two targets and GREEN afterward; prior migrated suites stay clean.
- Both focused suites pass 19/19.
- Full strict probe reports exactly 128 findings with zero migrated-suite errors.
- Normal typecheck, 60 harnesses, full client tests, build, dependency audit, and diff checks pass.
- One adversarial subagent clears all Critical/High/Medium/merge blockers.
- Exact-head hosted CI precedes standing-authority merge, deployment provenance, and live smoke.

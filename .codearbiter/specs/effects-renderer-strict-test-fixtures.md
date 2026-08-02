# Effects Renderer Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the shield-impact, armor-hit, muzzle-signature, and terrain-effect renderer suites prove indexed visual trace data before use, then add them to the enforced strict-test migration set for issue #70.

## SMARTS decision

After the atmosphere fixture slice, the strict remainder is 128 findings across 28 files. The four `EffectsRenderer` suites own 28 findings: shield impacts 10, armor hits 9, muzzle signatures 5, and terrain effects 4. Together they protect one production component's impact, launch, and debris contracts, with a 33-test green baseline.

SMARTS verdict: strong, high confidence. This is the largest remaining component-local visual cell, remains dependency-free, and avoids mixing renderer traces with the more stateful lobby-session work.

## Compiler boundary

- Add the four `EffectsRenderer` suites to `client/tsconfig.tests-strict.json` alongside every previously migrated suite.
- Resolve exactly 28 current findings: 10 shield-impact, 9 armor-hit, 5 muzzle-signature, and 4 terrain-effect.
- Preserve production strictness, all prior strict suites, and the unchanged complete compile.
- Do not change production source.

## Assertion contract

- Missing expected effects, draw operations, gradient endpoints, particles, coordinates, or alpha samples must fail causally.
- Prefer required-value helpers, explicit tuple construction, and narrowed operation lookups.
- Do not use optional access, fallback values, non-null assertions, or broad casts where absence should fail.
- Preserve test names, expected values, deterministic visual signatures, reduced-motion behavior, caller-state restoration, and the 33-test baseline.

## Explicit non-goals

- No other test suite, production source, dependency, lockfile, engine, backend, workflow, asset, or gameplay change.
- Do not close issue #70; exactly 100 findings across 24 files should remain after this cell.

## Acceptance evidence

- Strict-test RED is exactly 28 new findings across the four targets and GREEN afterward; prior migrated suites stay clean.
- All four focused suites pass 33/33.
- Full strict probe reports exactly 100 findings across 24 remaining files with zero migrated-suite errors.
- Normal typecheck, 60 harnesses, full client tests, Edge tests, build, dependency audit, and diff checks pass.
- The single designated adversarial subagent clears all Critical, High, Medium, and merge blockers, including the required coverage audit.
- Exact-head hosted CI precedes standing-authority merge, deployment provenance, and live smoke.

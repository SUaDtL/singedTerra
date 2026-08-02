# Renderer Integration Strict Test Fixtures Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Finish strict indexed-access enforcement across the remaining renderer integration suites: impact kick, projectile shadows, napalm light, terrain bevels/edges, and shield/armor/muzzle bridges.

## SMARTS decision

The strict remainder is 69 findings across 17 files. These ten renderer suites own exactly 29 findings and pass 76 focused tests. Migrating them as one renderer-boundary cell completes the entire remaining visual surface and leaves only 40 lobby/session findings across 7 files.

SMARTS verdict: strong, high confidence. The cell is visually coherent, dependency-free, production-neutral, and more reviewable than mixing renderer traces with network lifecycle.

## Contract

- Add all ten suites to `client/tsconfig.tests-strict.json` and resolve exactly 29 findings.
- Missing operations, coordinates, gradients, light samples, or ordering evidence must fail causally through guards, tuples, or narrowing.
- No optional/fallback/non-null/broad-cast escape where absence should fail; no production-source change.
- Preserve test names, expected values, motion/lighting geometry, draw ordering, and 76/76 tests.
- Expected full remainder: exactly 40 findings across 7 files, all lobby/session related.

## Gates

Exact RED/GREEN, full local matrix, one designated adversary plus coverage NO BLOCK, exact-head hosted CI, logged PR-only merge override, deployment provenance, live smoke, and issue #70 update.

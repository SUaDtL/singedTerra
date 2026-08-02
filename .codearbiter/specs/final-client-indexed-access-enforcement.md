# Final Client Indexed-Access Enforcement Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Close issue #70 by enforcing `noUncheckedIndexedAccess` across the complete client project, including every test fixture, through one canonical compiler configuration.

## Baseline

- The deployed `main@e4414de7bb6506e0ab24fde92f8a53f5d425eb95` baseline passes all 7 target suites and 100 tests.
- A full client strict probe reports exactly 40 findings across 7 lobby/session files: 18 in `LobbySession.test.ts`, 10 in `Lobby.sessionLifecycle.test.ts`, 5 in `NetworkClient.sessionClear.test.ts`, and 7 across four focused Lobby suites.
- Production client code and every renderer fixture already pass the strict probe.

## SMARTS decision

Promote the flag into `client/tsconfig.json` after migrating the final fixtures, then remove the temporary production and enumerated-test configs. This is strongly preferred over retaining partial configs: one canonical project automatically covers future files, eliminates two redundant compiler passes, and preserves the complete test surface.

## Contract

- Extend enforcement and capture the exact 40-finding compiler RED before fixture edits.
- Resolve every target access through causal guards, typed tuples, or assertion-backed narrowing. Missing channels, mock calls, players, tanks, and emitted configs remain test-fatal.
- Do not introduce optional chaining, fallback values, non-null assertions, broad casts, skipped assertions, renamed tests, or production-source changes to clear the compiler.
- Preserve all 7 suites and 100/100 tests.
- Set `noUncheckedIndexedAccess: true` in `client/tsconfig.json`; remove `tsconfig.production.json` and `tsconfig.tests-strict.json`; reduce client `typecheck` to one complete `tsc --noEmit` pass.
- Finish with zero strict findings across the complete client project and keep all repository gates green.
- After exact-head review, CI, merge, deployment provenance, and live smoke, close issue #70.

## Gates

Exact compiler RED/GREEN, focused and full test matrices, one designated adversarial review with all Critical/High/Medium and merge blockers cleared, dependency audit, secrets scan, exact-head hosted CI, PR-only merge receipt, deployment provenance, live smoke, and issue closure.

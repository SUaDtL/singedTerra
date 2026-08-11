# Verified replay hosted bundle fix evidence

## Delivery finding

The first production deployment of merged PR #399 uploaded the function assets, then Supabase's hosted bundler rejected `shared/src/engine/GameEngine.ts` because its relative `GameOptions` import omitted `.ts`. Nothing was deployed.

## Test-first record

- RED: `node scripts/checks/profile_identity.mjs` failed with 39 extensionless relative imports in the recursively reachable probe graph.
- First GREEN attempt exposed one missed multiline `TankLoadout` import; the guard correctly remained red.
- GREEN: after correcting that import, the graph check passed.

## SMARTS decisions

- Use explicit `.ts` extensions rather than Deno `sloppy-imports`: score 10/10. It is stable, supported by the hosted bundler, localizes the repair to the deployed graph, and remains compatible with no-emit TypeScript through `allowImportingTsExtensions`.
- Limit conversion to the probe-reachable graph rather than rewriting all shared imports: score 9/10. It directly restores delivery, minimizes unrelated churn, and the recursive guard protects future additions to this deployment surface.
- Treat this as a `$ca-fix` delivery correction to the approved hosted-probe slice: score 10/10. The production failure is confirmed, the behavior target is unchanged, and no architecture decision is introduced.

## Fresh verification

- `node scripts/checks/profile_identity.mjs`: PASS.
- `deno check supabase/functions/verified_replay_probe/index.ts`: PASS.
- `npm run check`: PASS.
- `npm run check:edge`: PASS, 307 tests.
- `npm run test:client`: PASS, 153 files and 1220 tests.
- `npm run build`: PASS.
- `npm run audit:deps`: PASS, 0 vulnerabilities.
- `git diff --check`: PASS.

## Scope

No dependency, migration, auth behavior, replay behavior, persistence behavior, or client behavior changed. Production edits are explicit import suffixes plus the matching TypeScript compiler option; the remaining change is the regression guard and governance evidence.

## Adversarial correction record

- The first review blocked merge because the recursive guard covered only top-level static imports/exports, untracked governance files were absent from the claimed diff, and the parent sprint evidence still said delivery was wholly pending.
- Correction: the guard now walks the full syntax tree, recognizes static imports/exports, literal dynamic imports, and TypeScript `import()` types, and follows `.ts`, `.tsx`, `.mts`, `.cts`, and matching `index` module forms. An executable syntax probe causally requires all four import forms.
- Correction: the parent record received an append-only delivery update with exact reviewed head, hosted checks, squash merge/tree equivalence, and failed deployment outcome.
- Correction: all intended files are staged before re-review, and the reviewer receives `git diff --cached` as the exact commit candidate.
- Exact staged re-review cleared the governance snapshot and parent-ledger blockers, then found that dynamic imports with a second attributes argument or a no-substitution template literal escaped the first AST correction. The collector now accepts a literal first argument regardless of optional attributes and covers both quoted and no-substitution template literals; the executable syntax probe requires both forms.

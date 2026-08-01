# Shared Unchecked Indexing Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Make the deterministic `shared/` core prove every array and indexed-record lookup is safe instead of allowing TypeScript to silently treat a potentially missing value as present. This is the first bounded delivery toward issue #70 and must preserve all game behavior and replay determinism.

## SMARTS decision

The chosen slice enables `noUncheckedIndexedAccess` in `shared/tsconfig.json` and resolves every compiler finding under `shared/src/`. A fresh probe found 29 shared-core errors concentrated in AI selection, game setup and tournament bookkeeping, tank placement, terrain sampling, and ordered replay.

Alternatives rejected:

- Enabling the flag in `tsconfig.base.json` immediately surfaces roughly two hundred additional client and test-fixture findings, mixing deterministic engine invariants with unrelated rendering-test cleanup and making review substantially weaker.
- Suppressing the errors with broad non-null assertions would make the compiler green without improving the safety contract.
- Deferring the issue leaves unchecked indexing in the highest-value correctness boundary even though the remaining shared surface is small enough to resolve coherently.

SMARTS verdict: strong, high confidence. The shared-only compiler boundary is specific, reversible, dependency-free, and independently testable. It improves the code that both hot-seat and networked clients execute while keeping the larger client migration available as a separate later cell.

## Safety contract

- `shared/tsconfig.json` enables `noUncheckedIndexedAccess: true`; the root and client compiler settings remain unchanged in this sprint.
- Every surfaced production lookup is resolved with an explicit empty-case, bounds guard, stable fallback, or a narrowly documented invariant already enforced by adjacent code.
- Prefer control-flow guards and null-returning helpers over non-null assertions. Any assertion that remains must be local, justified by a preceding invariant, and adversarially reviewed.
- Do not alter random-number consumption, iteration order, physics constants, action ordering, terrain generation, weapon selection policy, turn rotation, scoring, or serialized state/action shapes.
- Existing deterministic harnesses and behavior tests remain unmodified unless a real missing-case regression test is required to prove a new guard.

## Explicit non-goals

- No repo-wide or client `noUncheckedIndexedAccess` enablement.
- No renderer, HUD, Lobby, Supabase, Edge Function, migration, auth, network-contract, dependency, asset, gameplay-tuning, or documentation redesign.
- No opportunistic refactor beyond the exact compiler findings.
- Do not close issue #70; record this as partial progress because the client migration remains.

## Acceptance evidence

- The pre-change command `npm -w @singedterra/shared exec tsc -- --noEmit --noUncheckedIndexedAccess` is captured RED with 29 findings.
- `npm -w @singedterra/shared run typecheck` passes with the flag owned by `shared/tsconfig.json`.
- Focused tests cover any newly reachable empty or malformed cases introduced by guards.
- `npm run check`, `npm run test:client`, `npm run build`, and `npm run audit:deps` pass from fresh commands.
- A diff audit proves no deterministic constants, public action/state shapes, dependencies, lockfile, backend, or client compiler policy changed.
- One adversarial subagent reviews the exact final package; all Critical, High, Medium, and merge-blocking findings are corrected.
- The exact PR head passes every required hosted check before standing merge authority is used; deployment provenance and live smoke are verified even though this slice is behavior-preserving.

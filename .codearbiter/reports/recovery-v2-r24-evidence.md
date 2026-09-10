# Parent integration note

Historical author receipt follows; current acceptance is maintained in ../plans/evidence-recovery-v2.md. Parent independently ran the final 53-test focused suite and the final Astra/high review, triage, and aggregation passed with no findings. Coverage evidence is retained outside this receipt as described in the ledger.

# R24 — effective trajectory-guide gravity

Base SHA: `3902cad662aea03cec913d984d17aa9573b89bd0`
Worker: `gpt-5.6-terra`, high reasoning
Scope: `client/src/main.ts`, `client/src/renderer/aimGuidePresentation.ts`,
`client/src/renderer/aimGuidePresentation.test.ts`, and
`client/src/main.hotSeatProgression.test.ts`.

## Phase 1 obligations

| ID | Source | Status | Planned evidence |
| --- | --- | --- | --- |
| R24-01 | AC-076; D09 | COVERED | `aimGuidePresentation.test.ts` drives the real seed-42, three-round, sudden-death-turn-2 engine through legal actions via `HotSeatClient`, reaches `ROUND_OVER` at round 2/global turn 6, advances the round, and observes gravity `0.15`. |
| R24-02 | AC-077; approved R24 instructions | COVERED | The presentation helper accepts a gravity number unchanged. `main.hotSeatProgression.test.ts` asserts the current client getter is called and its result reaches `Renderer.setAimGuide` for local, network, and valid verified entry paths. The operation-selected regression independently composes `last-light-siege` through the real Quick Duel settings and client-engine seam, drives opening, sudden-death, and subsequent-round guide states through legal actions, and compares its first guide physics step with the real engine projectile. These are not a live network replay. |
| R24-03 | AC-078 | COVERED | The helper test retains local/remote ownership projection. The requested focused suite and the complete client suite pass; the parent separately retains the engine/replay baseline evidence. |

## Baseline

The requested focused command initially exited 1 because this isolated worktree had no
`node_modules` directory and therefore could not resolve `vitest`. No source test ran in
that attempt. An unchanged-lockfile `npm ci --no-fund` is authorized before the red run.

## TDD and verification evidence

Phase 2 red: after dependency installation, the requested focused command exited 1 with the
three new assertions failing for the expected old behavior: the presentation helper reconstructed
`NaN` when supplied the authoritative number, and `main.ts` never called the client getter.
All 49 pre-existing focused tests passed in that red run.

Phase 3 green: the same focused command exited 0 with 52 tests passing. The final rerun after
fixture typing correction also exited 0 with 52 tests passing.

R24 continuation: the original seed-42 / sudden-death-turn-2 D09 test remains separate. The
operation regression begins from lobby settings that say `rounds: 1` and `suddenDeathTurn: 0`,
then selects `last-light-siege` through `quickOperationOptions` and `buildClientEngineOptions`.
It observes opening gravity `0.15`, escalated gravity `0.168`, then round-two gravity `0.15` at
global turn 17. It does not mutate canonical engine state: unlimited sidewall misses advance the
turn, and a legally purchased zero-power self-hit nuke ends the first round. The guide's first
post-muzzle point equals the first live `GameEngine` projectile tick at both opening and escalated
gravity, and again after the round reset.

Negative control: the prior global-turn reconstruction was run with the observed next-round tuple
`effectiveGravity(0.15, 17, 12)`. It exited 1 for the intended assertion, reporting
`0.24 !== 0.15`; the real client reports `0.15` because sudden death resets per round.

| Command | Result |
| --- | --- |
| `npm ci --no-fund` | Exit 0. Used the unchanged lockfile in this isolated worktree. npm noted pending `esbuild` install-script review; no approval-policy change was made. |
| `npm -w @singedterra/client run test -- src/renderer/aimGuidePresentation.test.ts src/main.hotSeatProgression.test.ts` | Initial dependency-missing exit 1; red exit 1 with 3 new failures/49 existing passes; final exit 0 with 52/52 tests. |
| `npm -w @singedterra/client run test -- src/renderer/aimGuidePresentation.test.ts` | Exit 0: 1 file, 3 tests. Includes the preserved D09 regression and the operation-selected opening/escalated/subsequent-round trajectory comparison. |
| `npx tsx -e "…assert.equal(effectiveGravity(0.15, 17, 12), 0.15)…"` | Expected exit 1 negative control: former global-turn reconstruction produced `0.24`, not the round-two client/engine value `0.15`. No source was changed for this probe. |
| `npm run test:client` | Exit 0: 200 files, 1,778 tests. jsdom emitted existing `HTMLCanvasElement.getContext` unsupported notices. |
| `npm run coverage:client` | Invoked after the full suite. The runner completed with the configured text-only reporters, but emitted no retained coverage artifact or final percentage in the captured output; no percentage is asserted. It was not repeated after the fixture-only typing correction. |
| `npm run typecheck` | Final exit 0 for shared and client, rerun after the operation-selected regression. |
| `npm run build` | Final exit 0; Vite built 2,739 modules. Existing chunk-size warnings remained. |

## Implementation and boundary

`main.ts` now supplies `newClient.getEffectiveGravity()` directly to the aim-guide presentation
helper. The helper keeps only the local-seat visibility projection and forwards that number. No
engine, network protocol, verified-replay logic, dependency manifest, lockfile, server state,
localhost preview, commit, staging, push, or deployment changed.

The preserved real D09 regression proves the seed-42 hot-seat engine/client round boundary. The
new real-operation regression proves that a lobby reconstruction with conflicting settings cannot
stand in for the selected setup, and that guide trajectory uses the client gravity the engine
actually integrates. The local, network, and verified main checks prove forwarding with injected
clients; they intentionally do not represent a live Supabase room or verified replay. Browser
visual acceptance and a live network replay remain outside this worker's authorized/local evidence.

## Completion receipt

- Task ID: R24
- Base/result SHA: `3902cad662aea03cec913d984d17aa9573b89bd0`; result remains uncommitted on `codex/recovery-v2-r24`.
- Worker: `gpt-5.6-terra`, high reasoning.
- Changed paths: the four assigned source/test paths listed above and this task-local report.
- Review: pending the assigned fresh-context Astra/high reviewer and parent integration gate.
- Rollback: discard or revert this isolated, uncommitted R24 diff as one unit; no external state requires recovery.

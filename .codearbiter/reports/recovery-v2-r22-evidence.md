# R22 evidence — ordinary CPU team-aware targeting

Date: 2026-09-10

Task: R22 — Make ordinary CPU target selection team-aware without changing FFA

Finding: F32 — Ordinary CPU target selection can aim at its own team

Route: `$ca-fix` / regression-first TDD

Worker: `gpt-5.6-sol`, reasoning effort `high`, session `01a089c7-3100-7a53-a23c-76e8e1413901`
Independent reviewer required by the approved plan: new-context `gpt-6-astra`, reasoning effort `high`

## Binding and scope

- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r22`
- Branch: `codex/recovery-v2-r22`
- Required and observed base/HEAD before changes: `ef137055058af4a73bf5f0933d989cf3da48d3f2`
- Merge base with the required base after changes: `ef137055058af4a73bf5f0933d989cf3da48d3f2`
- Immutable task input: `C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2-input/singedterra-deep-review/singedterra-plan-v2.json`, R22 and F32
- Canonical acceptance source: `.codearbiter/specs/evidence-recovery-v2.md`, AC-069 through AC-071
- Finding sources named by the immutable input: S32 (`shared/src/engine/AI.ts`), S16 (`shared/src/engine/GameEngine.ts`), and E05 (bounded second-pass probe D04)
- Dependency state: R00 and R21 accepted in the supplied base. R21's legal arms-tier restock and unusable-ammo recovery remain intact and are exercised by the full AI harness.
- Exclusive changed-path set:
  - `shared/src/engine/AI.ts`
  - `scripts/checks/ai.mjs`
  - `scripts/checks/teams.mjs`
  - `.codearbiter/reports/recovery-v2-r22-evidence.md`
- No package, lockfile, protocol-version, client, Edge Function, migration, workflow, ledger, sprint-log, or other governance path was changed. No server or browser was started. Nothing was staged, committed, pushed, deployed, or changed remotely.

The unchanged lock required a local toolchain in the new worktree. The authorized command `npm ci --ignore-scripts --no-fund` completed with exit 0: 178 packages added, 181 audited, 0 vulnerabilities. `node_modules` and build output remain ignored.

## Obligations

| Obligation | Source | Test mapping | Result |
|---|---|---|---|
| AC-069 | Canonical spec | `scripts/checks/teams.mjs`: D04-shaped four-seat engine state calls production `computeAiPlan`; a 12-HP nearer ally and 100-HP farther enemy make the selected target observable through existing health-scaled loadout choice. | COVERED |
| AC-070 | Canonical spec | `scripts/checks/ai.mjs`: null, undefined, and malformed same-valued team metadata remain FFA; equal-distance roster order remains stable; a dead nearer target is skipped. `scripts/checks/teams.mjs`: a living teammate with all enemies dead yields `null`. Repeated plan output is byte-identical. | COVERED |
| AC-071 | Canonical spec | Existing `scripts/checks/teams.mjs` damage assertions remain unchanged and green for direct blast, self-damage, terrain deformation, cluster, bouncing, napalm, hot napalm, and enemy damage. Product code changes only `nearestEnemy` eligibility. | COVERED |

There were no beyond-spec contract or security obligations and no `[NEEDS-TRIAGE]` residue.

## RED proof

The regression was written before product code changed. It exercises the actual `GameEngine` state and production `computeAiPlan`, not a replacement planner, source-text oracle, mock, or newly exported helper. Existing plan fields provide the observation: a conservative hard bot with one Nuke chooses `baby_missile` for a 12-HP target and `nuke` for a 100-HP target.

Command:

```text
npx tsx scripts/checks/teams.mjs
```

Result: exit 1.

```text
FAIL: D04 CPU should target the farther 100hp enemy instead of its nearer 12hp teammate, got baby_missile
FAIL: a CPU with only a living teammate and no living enemies should return null
...
TEAMS CHECK: FAILED
```

Every pre-existing team assertion printed PASS in the same RED run. Before the correction, `npx tsx scripts/checks/ai.mjs` exited 0, showing the new FFA, tie, and dead-target compatibility cases already matched the established behavior.

## Correction

`nearestEnemy` now normalizes the shooter's team once and skips a candidate only when:

1. the shooter's team is a valid existing `TeamId` (`1` or `2`), and
2. the candidate's normalized team equals that valid team.

The loop, Euclidean distance calculation, strict `<` comparison, roster iteration order, self/death checks, and returned plan shape are unchanged. Therefore equal-distance ties still select the first eligible roster entry. Null, undefined, strings, out-of-range numbers, and other malformed values normalize to no team and cannot create an alliance.

No internal target function was exported. No target metadata was added to `AiPlan`. Verified-duel CPU policy and team damage code were untouched.

## GREEN and full verification

All commands ran in the exclusive R22 worktree on Windows 11 / PowerShell 7.6, Node `v24.18.0`, npm `11.16.0`.

| Command | Exit | Exact result summary |
|---|---:|---|
| `npx tsx scripts/checks/teams.mjs` | 0 | D04 enemy selection PASS; all-enemies-eliminated null PASS; all prior assignment, team resolution, draw, direct/cluster/bouncing/napalm/hot-napalm friendly-damage, self-damage, terrain deformation, and enemy-damage assertions PASS; `TEAMS CHECK: PASSED`. |
| `npx tsx scripts/checks/ai.mjs` | 0 | Pure-plan and full-game determinism PASS; 6/6 hard games resolved; FFA null/undefined/invalid metadata, ties, and dead targets PASS; all R21 arms tiers/difficulties deterministic, purchases legal, and D01 advances via usable fallback; `AI CHECK: PASSED`. |
| `npm run check` | 0 | Complete precheck, shared/client typecheck, and deterministic harness chain PASS. Retained evidence includes verified duel `73124` exhaustive cases; benchmark 7/7; verified CPU default corpus 32 seeds with maxima `{probeCount:59, simulationTicks:5074, humanOpeningTicks:92, cpuTicks:138}`; policy-3 corpus 32 seeds with maxima `{probeCount:49, simulationTicks:5074, humanOpeningTicks:92, cpuTicks:138}`; verified CPU policy PASS; R21 arms-tier/restock check PASS. |
| `npm run typecheck` | 0 | Shared `tsc --noEmit` PASS; client `tsc --noEmit` PASS. |
| `npm run test:client` | 0 | 200 test files PASS; 1817 tests PASS. Twelve expected jsdom `HTMLCanvasElement.getContext()` not-implemented diagnostics were emitted; no test failed. |
| `npm run build` | 0 | Typecheck PASS; Vite 8.2.2 transformed 2739 modules and completed the production build. The existing chunk-size advisory was emitted; build succeeded. |
| `git diff --check` | 0 | No whitespace errors. Git printed only the repository's LF-to-CRLF working-copy notices. |

The project declares no lint command: `.codearbiter/tech-stack.md` says, `Lint | — | None. No ESLint/Prettier/Biome config or script. tsc --noEmit (strict) is the static gate.` The explicit static gate passed twice, directly and as part of the build.

### Coverage tooling boundary

The complete `.codearbiter/tech-stack.md` Testing section identifies these test/coverage surfaces:

> Three test layers, by runtime:
>
> - Engine / pure helpers — deterministic harnesses in `scripts/checks/*.mjs`, run via `tsx` (`npm run check`), asserting byte-identical replay of `(seed + ordered action log)`.
> - Edge Functions — Deno `*.test.ts` (`npm run check:edge` → `deno test`), covering the pure referee logic.
> - Client (DOM + fetch) — Vitest with the jsdom environment (`npm run test:client`). Coverage: `@vitest/coverage-v8` via `npm run coverage:client`; this is the command the refactor Phase-2 gate reads.
> - CI runs all three layers.

No line/branch coverage command is declared for the changed shared-engine or deterministic-harness surface; the only numeric coverage command is explicitly client-only. R22 therefore takes the TDD no-tooling exemption for shared engine coverage and relies on the obligation-linked production-path harnesses plus the complete engine suite. No numeric engine coverage is claimed.

## Compatibility and evidence limits

- This is local source-integration evidence on prepared deterministic engine states. It is not a browser playthrough, live network room, production database, deployed build, or measurement of player-impact prevalence.
- The D04 assertion observes the target through existing health-scaled weapon selection. It proves the selected target under this fixture without expanding `AiPlan`; it does not claim every team match previously hit the defect.
- Ordinary multiplayer promotion remains gated by the R06/R07/R19 compatibility and release work. R22 makes no protocol or behavior-version change under this lease and must not be promoted independently of that gate.
- The full verified-duel and verified CPU policy/corpus checks passed. That compatibility evidence does not authorize a policy change, and this diff makes none.
- Team damage behavior was not rewritten. Existing direct, multi-blast, delayed-burn, self-damage, terrain, and enemy-damage assertions supply the retained evidence boundary.

## Rollback

Before commit, rollback is the removal of the R22 diff from the four exclusive paths listed above, returning them to base `ef137055058af4a73bf5f0933d989cf3da48d3f2`. No database, protocol, deployment, package, lockfile, or remote rollback is required because none changed. Ignored `node_modules` and `client/dist` are local tool/build products and are outside the review payload.

## Handoff state

The writer lease is frozen and released after this receipt's final path/status audit. The complete unstaged diff is ready for the required new-context Astra/high review. The author did not stage or commit because the R22 assignment explicitly reserves those actions to the parent/reviewer workflow.

## Parent acceptance, 2026-09-10

Fresh independent reviewer `/root/r22_target_review`, session `01a089d3-5021-7ab1-a453-4141dd9a1c86`, was verified from actual session metadata as `gpt-6-astra / high`. Production behavior, coverage and architecture units all completed with no findings. Its separate finding-triage and verdict-aggregator steps returned PASS with zero missing units and AC-069 through AC-071 satisfied within review. Security/auth/dependency/migration units did not match this bounded diff.

The reviewer independently ran the full teams and AI harnesses, a 144-pair valid/malformed team metadata matrix through the actual planner with repeated deterministic plans, and whitespace checks: all exit0. It did not claim an independent historical RED run or browser/network proof.

Parent `gpt-6-astra / high` verified the frozen author source against integration byte-for-byte before acceptance:

| Path | SHA256 |
|---|---|
| shared/src/engine/AI.ts | 8b581506c03881a0b5bc6757e0e6a5d9ceB71626c57a98bfd50773e69a58b063 |
| scripts/checks/ai.mjs | 3bc302af3a1fb9409f623353575b79ddaa042e485bd95d76e4b1af954a618044 |
| scripts/checks/teams.mjs | bed2bc4e24c562ec16b59dc407037ccbC2a1be8641b5e1b6eea5a603c9675a3b |

Fresh integration at base `ef137055058af4a73bf5f0933d989cf3da48d3f2`: full `npm run check` exit0 (session92032), `npm run test:client` exit0 (session1985: 200 files/1817 tests), `npm run build` including typecheck exit0, configured state-free secrets scan exit0 with an empty result, and `git diff --check` exit0. Logs: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r22-integrated-{check,test-client,build}.log`. No numeric shared-engine coverage is invented.

R22 is locally accepted for the authorized governed recovery commit. The resulting commit containing this receipt supplies `result_sha` through Git history; it is not a published candidate. No new follow-up residue or owner decision was created. Ordinary multiplayer promotion remains blocked on the existing R06/R07/R19 compatibility work; all prior evidence limits and rollback boundaries above remain applicable.

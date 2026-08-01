# Open issue hygiene report

- **Audit date:** 2026-08-01
- **Audited source:** deployed `main` at `7d4deb845a9a40c03aa304d073d8f574c41c1997`
- **Starting inventory:** 16 open GitHub issues
- **Runtime impact:** none

## Evidence baseline

- PR #234 merged at commit `7d4deb8`; its Pages run verified current-main provenance and passed the post-deploy Playwright live smoke.
- Fresh-main `npm run check` passed the complete deterministic harness chain.
- Fresh-main `npm run coverage:client` passed 104 files and 744 tests at 89.43% statements and 91.82% lines.
- `Lobby.ts` contains no `fetch()` or Supabase `.channel()` calls. `LobbyTransport` owns the Edge requests and `LobbySession` owns waiting-room lifecycle.
- `.st-hud__gauge-nums` has no production occurrence; the current instrument test explicitly requires it to be absent.
- The Pages workflow contains both current-main SHA gates, writes deployment provenance, verifies the deployed sentinel, and runs a live browser smoke.
- #104 re-audit control: the newest pre-guard Pages run is [run 29793872670](https://github.com/SUaDtL/singedTerra/actions/runs/29793872670), created `2026-07-21T01:42:56Z` for commit `5d4dc6154a180259fbc9530ca74e178263070552`. [GitHub's current policy](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) permits reruns for up to 30 days after the initial run and retains the original SHA/ref. Re-audit no earlier than `2026-08-20T01:42:56Z`, then verify the run is no longer rerunnable before closing.

## Dispositions

| Issue | Disposition | Current evidence | Exact post-merge action |
|---|---|---|---|
| #10 Mobile-friendly investigation | Close: completed | PRs #156 and #159 established contained mobile layouts and viewport policy; #198, #223, #224, and #226 delivered named touch fire, aim, power, weapon, movement, and utility controls with signed-direction tests. Current production smoke is green. | Close as completed. Comment that the investigation has been overtaken by the shipped touch-control and responsive-HUD work, with those PR references. |
| #45 Combat-feel rebalance | Retain: partial | PR #177 and `scripts/checks/blast_reach.mjs` resolved the visual-versus-damage reach mismatch. Field scale, hit rate, and time-to-kill remain subjective playtest work. | Rename to `Playtest: combat scale and lethality`. Comment that blast reach is complete and only the playtest-gated tuning remains. |
| #47 Vote-to-kick | Retain: current | No logged eliminate-seat action or vote lifecycle exists. The deterministic/network implications in the issue still apply. | No mutation. |
| #64 Full-engine clone per turn | Close: not planned | `NetworkClient.computeNextSeat()` clones and applies the pending action; `scripts/checks/seat_reuse.mjs` pins live-clone versus scratch-replay seat parity and no live mutation; `scripts/checks/engine_clone_parity.mjs` pins full field parity plus an independent terrain buffer. Lethal outcomes require that simulation before the next living seat is knowable. No relevant merged PR exists because the correct disposition is to retain the implementation, not replace it. | Close as not planned. Comment that correctness makes the copy load-bearing and profiling has not justified a special-case optimization. |
| #67 Observability backlog | Retain: partial | Structured limiter fail-open logging, not-your-turn logging, Lobby catch logging (#131), room/player DB context (#132), and pending-action gap warnings now exist. Remaining gaps include the context-free `submit_action: seq_conflict` line and inconsistent raw error-object logging. | Rename to `[review][low] Remaining Edge logging correlation`. Comment with the resolved and remaining subsets. |
| #68 Performance nits | Retain: partial | The service client is a module singleton and the invariant sun gradient was cached. Explosion/scorch paths still allocate gradients per frame and `syncFire()` still rebuilds its projection. | Rename to `[review][low] Remaining gradient and syncFire allocation nits`. Comment with the resolved and remaining subsets. |
| #69 Security hardening | Retain: partial and hard-gated | PR #81 and the shared `isValidColor` guard completed color validation across create, join, and update paths. Winner/log verification, four-character room-code space, and Deno integrity remain security-sensitive. | No mutation. |
| #70 Type-safety/DX backlog | Retain: partial | Lobby response guards and audio teardown are complete. `tsconfig.base.json` remains `strict: true` without `noUncheckedIndexedAccess`. | Rename to `[review][low] Enable noUncheckedIndexedAccess`. Comment that this compiler option is the only remaining acceptance item. |
| #85 Lobby god module | Close: completed/superseded | PR #117 extracted pure validation, #127 extracted `LobbyTransport`, #164 added the lifecycle oracle, and #166 extracted `LobbySession`. The original transport, Realtime, polling, validation, and lifecycle concerns are now separate and directly tested. Remaining view decomposition is already isolated in #129. | Close as completed. Comment with the four PRs and direct the remaining render concern to #129. |
| #104 Stale Pages deployment | Retain: time-bound residual | PR #158 protects every post-guard run, and the current #234 deploy passed its complete provenance chain. Pre-guard workflow runs retain their historical unguarded definition while GitHub still permits reruns, so the original residual risk has not aged out yet. | No mutation. Re-audit after the newest pre-guard run is outside GitHub's 30-day rerun window, then close only if no rerunnable unguarded run remains. |
| #109 Gauge-number CSS cleanup | Close: completed | PR #195 rebuilt the Ballistic Computer and removed the `.st-hud__gauge-nums` production selector and node; `client/src/ui/HUD.instruments.test.ts` explicitly requires the obsolete node to remain absent. | Close as completed. Comment with PR #195 and the direct test oracle. |
| #110 License allowlist | Retain: hard-gated | `security-controls.md` still has no SPDX allow/deny policy. This is a security-policy decision and not an incidental cleanup. | No mutation. |
| #111 npm audit command | Retain: current | `tech-stack.md` and CI still do not declare an npm-audit command or job, even though governed dependency work runs audits manually. | No mutation. |
| #125 Classification comments | Retain: hard-gated | The older applied tables still lack forward-only classification comments. The requested remediation is a migration and remains deliberately gated. | No mutation. |
| #129 Lobby view decomposition | Retain: current | `Lobby.ts` is 3,249 lines with 18 `render*` methods. Transport/session extraction is complete, making this remaining view-only refactor better defined, not obsolete. | No mutation. |
| #134 Client Vitest depth | Retain: partial | PRs #162 and #163 added direct HotSeatClient and InputHandler coverage. Current coverage is 89.43% statements, but `retry.ts` is 58.33% and `audioEdges.ts` remains harness-only at 0% in Vitest. | Rename to `Test: cover retry.ts and audioEdges.ts directly in Vitest`. Comment with the current coverage numbers and completed slices. |

## Exact retained-issue comments

### #45

Current scope after the 2026-08-01 audit: PR #177 aligned blast damage with visual reach and `scripts/checks/blast_reach.mjs` now pins that contract. The remaining issue is the subjective playtest pass for field scale, hit rate, damage floor, and time-to-kill. No engine tuning is implied without that playtest evidence.

### #67

Current scope after the 2026-08-01 audit: structured limiter fail-open logging, the not-your-turn desync signal, Lobby network-catch logging (#131), room/player DB-error context (#132), and pending-action gap warnings are implemented. Remaining work is the smaller Edge consistency pass: correlate the `submit_action` seq-conflict log and replace remaining raw error-object logging with bounded message/context fields.

### #68

Current scope after the 2026-08-01 audit: the invariant sun gradient and per-isolate Supabase service client are already cached. The unresolved work is limited to the explosion/scorch per-frame gradient allocations and the decay-only `syncFire()` projection allocation, subject to profiling and determinism-preserving tests.

### #70

Current scope after the 2026-08-01 audit: the Lobby malformed-response guards and audio teardown/doc correction are complete. The only remaining acceptance item is enabling `noUncheckedIndexedAccess` and addressing the compiler findings it exposes.

### #134

Current scope after the 2026-08-01 audit: PR #162 directly covers HotSeatClient and PR #163 directly covers InputHandler. Fresh coverage passes 104 files / 744 tests at 89.43% statements and 91.82% lines. The remaining direct-Vitest opportunities are `retry.ts` (58.33% statements) and `audioEdges.ts` (currently covered by the deterministic root harness but 0% in Vitest).

## Closure comments

### #10

Closing as completed. The original investigation has been overtaken by shipped work: responsive/compact layout and viewport handling (#156, #159), unified touch fire (#198), signed aim/power/weapon controls (#223), touch movement (#224), and mobile utility controls (#226). Those paths are covered by production-browser guardrails, and the current deployed main smoke is green.

### #64

Closing as not planned. `client/src/client/NetworkClient.ts` deliberately clones and applies the pending action; `scripts/checks/seat_reuse.mjs` pins clone-versus-replay seat parity and `scripts/checks/engine_clone_parity.mjs` pins an independent terrain buffer. A lethal shot can change the living-seat set only after deterministic projectile, terrain, and damage simulation, so a roster-only scan would be incorrect. No merged PR implements the proposed optimization because retaining the clone is the correctness decision; the shield-only special case is not justified without profiling evidence.

### #85

Closing as completed for the concern this issue bundled. Validation moved to a pure tested module in #117, Edge request construction moved to `LobbyTransport` in #127, the lifecycle oracle landed in #164, and Realtime/timer/waiting-state ownership moved to `LobbySession` in #166. The remaining DOM/view decomposition is still tracked separately and more precisely by #129.

### #109

Closing as completed by PR #195. The Ballistic Computer rebuild removed the obsolete `.st-hud__gauge-nums` production selector and DOM node; `client/src/ui/HUD.instruments.test.ts` now explicitly requires that node to remain absent.

## Expected final inventory

After the reviewed report merges and the exact actions above are applied, 12 issues remain open: #45, #47, #67, #68, #69, #70, #104, #110, #111, #125, #129, and #134.

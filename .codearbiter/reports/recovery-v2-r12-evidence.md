# R12 frame pacing and RAF ownership evidence

- Task: R12 — AC-041, AC-042, AC-043, AC-044
- Worker: `gpt-5.6-sol`, reasoning effort `high`
- Base revision: `f7a3aa76b147e90b2ff9c4593d687431b043665e`
- Branch/worktree: `codex/recovery-v2-r12` / `C:\Users\brenn\projects\singedTerra-worktrees\recovery-v2-r12`
- Immutable plan SHA-256: `7B4CF398921FD9A324AC05215B2EE14E01729441E450FEEA2183DDC4C9E59F89`
- Approved spec SHA-256: `B64D472C0B46FBAE3DF5969061B4C7DF2F0AA7C476B35F68C0DDCE772A38A613`
- Delivery state: uncommitted working-tree changes, as required; no staging, commit, remote, database, deployment, settings, or cleanup action occurred.

## Clock contract and evidence boundary

The clients preserve the intended current pacing as an explicit `1000 / 60 ms`
logical beat. RAF timestamps decide how many complete beats are due. Each beat
runs one normal fixed engine tick group or the existing eight-tick busy-phase
fast-forward group, then emits exactly once. Elapsed time never enters the shared
engine and the fixed 16 ms engine tick is unchanged.

The injected one-second 30/60/120/144 Hz schedules require exactly 60 normal
ticks and 60 presentation emissions. The fast-forward schedules require exactly
`60 * 8` fixed ticks and 60 emissions. This is zero-tick tolerance over the
declared one-second schedule. The real `HotSeatClient` into real `Renderer`
terminal-impact test permits at most one 30 Hz display frame (`33.333333 ms`)
of wall-clock quantization across all four schedules, with fast-forward both off
and on; it also rejects a five-second timeout.

`start()` resets the clock from `performance.now()`. A normal first RAF therefore
accumulates from the actual start timestamp. Equal or backward RAF timestamps
produce zero beats and do not replace the last valid timestamp, so they cannot
manufacture either immediate ticks or extra future elapsed time. Existing fake
RAF fixtures in `HotSeatClient.test.ts`, `verifiedDeployment.test.ts`,
`NetworkClient.botRetry.test.ts`, `NetworkClient.lockstep.test.ts`,
`NetworkClient.matchClaim.test.ts`, and `NetworkClient.sessionClear.test.ts` now
share a monotonic `performance.now() = 0` origin and advance by `1000 / 60` per
pump. Their behavioral assertions are unchanged.

A physical callback may catch up at most four logical beats (`66.666667 ms`).
Older hidden-tab backlog is discarded. The combined hidden-tab/fast-forward test
therefore observes 32 fixed ticks on resume, followed by the ordinary next eight,
which keeps the four-beat catch-up bound separate from the existing 8x view-speed
control.

The real client/renderer schedule test proves that paced client emissions advance
the existing renderer-owned explosion, hit-stop, kick, and terminal-busy lifetime.
The byte-unchanged `main.hotSeatProgression.test.ts` proves that the real main
wiring withholds its terminal notification while `Renderer` reports busy and
releases it once settled. Together these cover the production handoff seam; they
are source integration evidence, not a browser FPS, physical timing, or visual
acceptance claim.

Verified expiry remains derived from its existing absolute server deadline, and
V2/V3 tuple selection and replay outcomes remain byte-unchanged. Their existing
tests passed in both the focused verified slice and full client suite.

## Regression-first gate

Before implementation:

`npm -w @singedterra/client exec -- vitest run src/client/HotSeatClient.test.ts src/client/NetworkClient.frameClock.test.ts src/renderer/Renderer.impactKick.test.ts`

- Exit 1: 2 files failed, 1 passed; 8 tests failed, 21 passed.
- Hot-seat observed 30, 120, and 144 ticks where 60 were required; hidden resume
  observed one tick where four logical beats were required; initial/frame stop
  left one callback, and stop/restart left two callbacks.
- Network 30 Hz public projectile state diverged from the 60 Hz tuple (`age 30`
  versus `age 60`, with corresponding position and velocity divergence).
- The first renderer assertion was then corrected to run the production burst
  aging path. Its isolated RED was a `2137.5 ms` cross-rate duration spread versus
  the declared `33.333333 ms` maximum.

No production implementation was written before those assertion failures.

Independent source review then rejected an intermediate production fallback that
manufactured one beat for an equal/backward timestamp. Before correcting it, this
worker added and ran the exact regression:

`npm -w @singedterra/client exec -- vitest run src/client/frameClock.test.ts -t "ignores equal/backward"`

- Exit 1: `advance(100)` returned `1`; the required result was `0`.
- The final implementation ignores equal/backward values without moving the last
  valid timestamp. The earlier 1901-test/coverage evidence produced with that
  rejected fallback is superseded by the corrected final runs below.

## Final verification

- `npm -w @singedterra/client exec -- vitest run src/client/frameClock.test.ts src/client/HotSeatClient.test.ts src/client/NetworkClient.frameClock.test.ts src/client/NetworkClient.botRetry.test.ts src/client/NetworkClient.lockstep.test.ts src/client/NetworkClient.matchClaim.test.ts src/client/NetworkClient.sessionClear.test.ts src/client/verifiedDeployment.test.ts src/client/VerifiedDeploymentSession.test.ts src/renderer/Renderer.impactKick.test.ts src/main.hotSeatProgression.test.ts`
  - Exit 0: 11 files, 217 tests passed.
- `npm run test:client`
  - Exit 0: 205 files, 1901 tests passed.
  - jsdom emitted its existing canvas `getContext()` availability notices; no test failed.
- `npm run coverage:client`
  - Exit 0 on Windows: 205 files, 1901 tests passed.
  - Lines: `93.98%` (`8560/9108`); branches: `83.90%` (`5188/6183`).
  - Both exceed the Stage 1 60% line-and-branch requirement.
- `npm run typecheck`
  - Exit 0 for shared and client strict TypeScript checks.
- `npm run build`
  - Exit 0; 2732 modules transformed and the production Vite bundle completed.
  - Vite retained its existing informational large-chunk warning.
- `git diff --check`
  - Exit 0; Git emitted only line-ending conversion notices for existing tracked files.

Per integration-owner coordination, this worker did not run `npm run check`; the
parent will run it once on the integrated final candidate, including the unchanged
deterministic benchmark.

## Obligations

- AC-041 — COVERED: exact 60-beat hot-seat and equal public network outcomes at
  30/60/120/144 Hz, with zero-tick one-second tolerance.
- AC-042 — COVERED: existing 8x helper is exercised per logical beat; actual client
  emissions drive actual renderer terminal effects within 33.333333 ms cross-rate
  tolerance; unchanged real main gate releases the handoff only after settling.
- AC-043 — COVERED: stop during initial emit, stop during frame emit, and one
  stop/restart inside a listener leave no retired-generation rearm.
- AC-044 — COVERED: resume is capped at four beats with backlog discarded; full
  verified deadline, V2/V3 replay, and tuple tests remain green and their sources
  are unchanged.

## Process and external-state receipt

- Persistent process handles started by this worker: none.
- Final temporary unified coverage command session: `83729`, exited `0` and closed.
- Localhost/browser preview handles: none; the parent-owned port 5198 preview was not touched.
- Remote/API/database/deployment actions: none.
- `[NEEDS-TRIAGE]` residue: none.

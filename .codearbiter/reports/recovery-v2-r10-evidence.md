# Recovery v2 R10 evidence

- Date: 2026-09-12
- Original worker: gpt-5.6-sol / high, session 01a095e5-5bce-7ed0-9909-d69fbffa9f87
- Correction worker: gpt-5.6-sol / high, session 01a09602-b3ee-7ad0-ae7c-e9ab9cf3b4fe
- Independent reviewer: gpt-6-astra / high, session 01a095f8-de01-7983-a2b7-aa211b98bbbf
- Worktree: C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r10
- Branch: codex/recovery-v2-r10
- Baseline HEAD: 0f708d5d60d06a3732d5e3d7b4d2adc92754f716

## Scope and immutable inputs

R10 implements AC-037 through AC-040 without changing the Canvas gameplay owner,
the Preact semantic owner, or Pixi's visual-only role. The only modified product
paths are mount.tsx, lifecycle.ts, resources.ts, and pixi/adapter.ts; the four
assigned focused test paths are also modified. No dependency, lockfile, engine,
network contract, E2E, coordinator, release, remote, database, or production
setting was changed.

Immutable input SHA-256:

- START-HERE.md: EBA738B88EADBAB203CD2DCB6CEAAF5C1941A54638C20CF20FC6FAF2327C76C0
- singedterra-plan-v2.json: 7B4CF398921FD9A324AC05215B2EE14E01729441E450FEEA2183DDC4C9E59F89
- integration spec evidence-recovery-v2.md: EB74581EF5C77E1BBA0589B470353D8D8AE0142B80A625C6833AF2FD83E0EAD3

Runtime used for correction verification: Node v24.18.0, npm 11.16.0,
pixi.js@8.20.1 from the existing lockfile.

## Implemented behavior

- mountBattleConsoleGeneration publishes the one Preact semantic tree and its
  update/intent handle before optional Pixi decoration settles. Destroy aborts
  and drains the generation waiter, so semantic cleanup no longer waits for an
  uncancellable import or Application.init operation.
- The lifecycle retains the latest state and layout while entry is pending and
  replays that request after the mounted handle is admitted. An update between
  synchronous semantic publication and lifecycle handle admission therefore
  reaches the same semantic owner before entry reports ready.
- Pixi import plus one neutral 1x1 Application.init are held by one module-scoped
  admission record. The record captures no generation host, state, layout, or
  callback. Generations attach removable abort/deadline waiters and only one
  current waiter can atomically claim the initialized application.
- Admission reservation accounting remains live after waiter resolution and
  until each async consumer claims or relinquishes. An abort after resolution
  but before the consumer continuation cannot mount a stale canvas. If nobody
  claims, the late application is destroyed only after init settles and Pixi has
  assigned its renderer.
- One deadline covers import, initialization, and texture admission together.
  The default remains 8 seconds; each later stage receives only the remaining
  time. A stalled shared admission leaves semantic controls operational and each
  generation independently enters fallback when its deadline expires.
- The Pixi adapter keeps one array-form Assets.load request for the fixed six
  URLs and exactly one fulfillment/rejection pair. Generations attach removable
  waiters. Rejected loads clear the record for retry; successful textures remain
  in Pixi's process-owned cache and are not unloaded by a match generation.
- Production still uses supported Application.init capability handling. No
  DOMAdapter fake, shader capability priming, or Batcher max override is present.
  Strict-CSP worker-backed image probing is disabled before the lazy asset load,
  and the static Pixi synchronizer import precedes dynamic renderer admission.
- BattleConsoleResourceLedger.close() blocks new acquisition while retaining
  counts for outstanding leases. Counts reach zero only when their real owners
  release them.

## Regression-first correction chronology

The original author reported a focused 10-test green run, client typecheck, a
1,818-test client suite, and build. Independent review then found the candidate
incomplete:

- LIFE01 HIGH: destroy remained pending beyond 9 seconds when Application.init
  was held; the generation retained one Pixi application and six semantic
  leases until init was externally released.
- LIFE02 MEDIUM: angle 73, compact layout, and “Target acquired” were buffered
  after semantic publication but lost before lifecycle handle admission; ready
  still showed angle 45, wide, and “Fire ready”.
- COV01 MEDIUM: meaningful prior projection, stale-intent, repeated-destroy,
  CSP configuration, and import-order assertions had been removed.

After adding correction regressions and restoring the applicable assertions,
this command was run before production correction:

`npm -w @singedterra/client run test -- src/ui/battleConsole/mount.runtime.test.ts src/ui/battleConsole/lifecycle.runtime.test.ts src/ui/battleConsole/compositor-destroy.test.tsx src/ui/battleConsole/pixi/adapter-lifecycle.test.ts`

It exited 1: 4 files, 17 tests, 7 failures and 10 passes. The direct failures
showed no lifecycle replay, mount destroy still pending, held import/init waits
still pending after abort, and the total deadline still pending after its
budget. Later admission cases were blocked by the same retained held operation;
that collateral timeout was not treated as separate product evidence.

After the minimal production correction, the same focused command exited 0:
4 files, 17 tests. It was rerun after the final transfer-boundary cleanup and
again exited 0 with 17/17 passing. Test expectations were unchanged between the
recorded red and green runs.

The final focused scenarios cover:

- delayed decoration with live angle, status, and Fire behavior;
- replay of state/layout updated after semantic publication but before handle
  admission;
- one held dynamic import across 200 sequential aborted generations, with one
  module operation, no application creation, settled generation promises, and
  zero generation resources;
- one held Application.init across 200 sequential aborted generations, with one
  application/init operation, settled generation promises, zero generation
  resources, and actual destruction after late init;
- abort after admission resolution but before consumer continuation, with no
  stale canvas and actual application destruction;
- one total init-plus-texture deadline;
- one never-settling shared texture load across 200 sequential aborted sessions,
  one request/completion pair, at most one live waiter, and zero waiters after
  every abort;
- renderer capability denial, asset rejection/retry, context loss, and partial
  application cleanup;
- unchanged projection causing no render/resize, one material render without
  resize, and one geometry render plus one resize;
- stale Fire suppression, repeated destroy idempotence, honest close/release
  accounting, strict-CSP loader configuration, and synchronizer import order.

## Final verification

- Focused R10 suite after final production edit — exit 0; 4 files, 17 tests.
- `npm -w @singedterra/client run typecheck` — exit 0 before the final
  transfer-boundary cleanup; the final build repeated client typecheck.
- `npm run coverage:client` after the final production edit — exit 0; 202 files,
  1,825 tests; 93.68% lines and 83.34% branches on Windows. Both exceed the
  Stage 1 60% line and branch threshold. jsdom emitted its existing canvas
  getContext unimplemented notices; there were no test failures.
- `npm run build` after the final production edit — exit 0; shared and client
  typechecks passed, 2,730 modules transformed, and the production bundle was
  emitted. Vite reported its existing non-failing greater-than-500-kB warning.
- `git diff --check` after candidate and receipt edits — exit 0.

No dev server, browser, benchmark, database, Edge, remote, or production process
was started by the correction worker. Real browser delayed-image, update/Fire,
quit/restart, late-completion, context-loss, denied-WebGL, and repeated-session
proof remains a parent integration obligation; unit/jsdom tests are not
represented as browser proof.

## Resource boundary and residual risk

Pixi import and Application.init provide no AbortSignal. If import never settles,
the browser tab retains one process-owned promise operation and no application.
If init never settles, it retains one process-owned operation and one neutral
application. Neither is reported as a released match resource: the tests count
that singleton explicitly while proving each generation waiter, timer, listener,
and ledger lease returns to zero. New generations attach to the same operation
and fall back independently after their remaining deadline, so the retained set
does not grow. If the operation eventually settles with no eligible claimant,
the initialized application is actually destroyed after renderer assignment.

Pixi Assets likewise exposes no per-request AbortSignal. The fixed six texture
URLs, one request, and one completion pair remain process-owned if loading never
settles. A successful texture set remains in Pixi's documented library cache for
reuse. Generation applications, scenes, canvases, context listeners, texture
leases, semantic DOM, timers, and waiters remain generation-owned and are
released on teardown.

Rollback is confined to restoring the eight modified battle-console source/test
files. There is no schema, data, dependency, lockfile, deployment, remote, or
production state to reverse.

## Candidate file hashes

- mount.tsx: A0A692C55B243CDC6D178BB7089A9F4C83E2A4B0AFE3D9D2FAB7EE3B46A5992E
- lifecycle.ts: 45FE354D980914EA3B0EB6CF98F826A0415CDDA45B1644F4AB326CAF2EDA70D7
- resources.ts: 2DF20214058050333FC3F52D22A4705766A88E526553E6771A18D480E06B7843
- pixi/adapter.ts: DCA82CA83DE4EBA9E3D5E58B10B5BE75EC9F6F4D59C958A570399BAC252C9084
- mount.runtime.test.ts: 8E5672FBE3B6F5338F9C9A3E6E456A03ECA94A3B2502A2A44800A4F50FDEBEB9
- lifecycle.runtime.test.ts: 7D7B9A28F8CF612A96334A2A089C547D644F3232971FFAC28334E870A213FF7E
- compositor-destroy.test.tsx: A9D0AE031470365FE758F7E14F994F72595C4722E0E403D9A8BE7270B3601C57
- pixi/adapter-lifecycle.test.ts: 7D87DD439F108FDBE5D8EAE3AAD7149AEFB45A6069F7F788A9FC9E86EE10AEFA

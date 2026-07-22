# Human Seq-Conflict Retry Coverage Sprint Spec

> Status: **APPROVED — user approved 2026-07-21**
> Date: 2026-07-21
> Tracks: GitHub issue #120

## Goal

Close issue #120's narrowed remaining coverage gap by exercising the real `NetworkClient` human
`seq_conflict` retry path through its public API with deterministic fake timers.

## Current state

The issue's original premise is stale: `NetworkClient` is already instantiated by lockstep,
initialize-gap, rematch, session-clear, and bot-retry Vitest suites. The remaining uncovered branch
is the human default path in `submitAction()`:

- a `seq_conflict` schedules recursive retries with bounded exponential backoff;
- five retries produce delays of 40, 80, 160, 240, and 240 milliseconds before jitter;
- exhaustion releases the local firing lock and reports `Shot kept colliding — try again.`;
- `stop()` cancels a scheduled retry so a torn-down room cannot receive another POST.

The constructor-injected `SupabaseClient`, globally mockable `fetch`, public `sendAction()`,
`onFireFailed()`, `isFiring`, and Vitest fake timers already provide every required seam.

## Approved design

Create `client/src/client/NetworkClient.humanRetry.test.ts` and instantiate the real class with a
minimal unused `SupabaseClient` stand-in. Stub `Math.random()` to `0` so jitter contributes zero and
the documented delay sequence is exact.

Cover three observable contracts:

1. **Conflict then success:** the first retry does not POST before 40ms, POSTs at 40ms, and reuses the
   byte-identical request body.
2. **Bounded exhaustion:** six total POSTs occur (initial attempt plus five retries) at the exact
   40/80/160/240/240ms schedule; the failure listener fires once, `isFiring` clears, and no seventh
   POST occurs.
3. **Teardown cancellation:** stopping after the first conflict but before 40ms removes the
   pending retry timer and prevents it from POSTing.

This is test-only unless a case exposes a real defect. Do not extract a retry helper or change
production behavior merely to make the tests easier.

## Alternatives rejected

### Extract a pure retry scheduler

This would create a production seam for already-testable behavior and would not prove the
`NetworkClient` wiring that issue #120 specifically names.

### Reuse `postOnceWithRetry`

The generic helper covers one transport retry. Human seq conflicts carry class state, recursive
attempt count, firing-lock recovery, and teardown cancellation; folding them together would broaden
behavior and obscure the referee-specific contract.

### Broaden into the deferred transport refactor

The constructor/fetch seams already suffice. Lobby transport decomposition and general dependency
injection remain independent work.

## SMARTS decision

| Lens | Public-API fake-timer tests | Extract scheduler | Transport refactor |
|---|---|---|---|
| Scalable | Strong: pins the real class contract without a new abstraction. | Adequate. | Weak for this slice. |
| Maintainable | Strong: one focused suite beside existing NetworkClient tests. | Adequate but adds indirection. | Weak: unrelated churn. |
| Available | Strong: no runtime change. | Strong. | Adequate. |
| Reliable | Strong: covers retry, exhaustion, and teardown. | Adequate: wiring can still drift. | Strong but oversized. |
| Testable | Strong: deterministic timers and jitter. | Strong. | Weak: much larger surface. |
| Securable | Neutral: no trust-boundary change. | Neutral. | Neutral. |

Recommendation: public-API fake-timer tests. Strength: **strong**. Confidence: **high**.

## Acceptance criteria

### AC-1: the real human retry path is exercised

The suite constructs `NetworkClient`, calls public `sendAction({ type: 'fire' })`, returns one
`seq_conflict`, and proves the second POST occurs at 40ms with the same request body.

### AC-2: retries are bounded and recover the UI

Persistent conflicts produce exactly six POSTs across 40/80/160/240/240ms, emit exactly one
`Shot kept colliding — try again.` failure, clear `isFiring`, and schedule no seventh attempt.

### AC-3: teardown cancels pending work

Calling `stop()` before the first retry deadline removes the pending retry timer and prevents any
post-teardown retry POST.

### AC-4: coverage is mutation-sensitive

Temporarily disabling retries must make the focused suite fail. Temporarily removing retry-timer
cancellation from `stop()` must make the teardown case fail. Every mutation is restored before
final verification.

### AC-5: repository gates stay green

Fresh verification before commit and PR:

```powershell
npm -w @singedterra/client exec vitest run src/client/NetworkClient.humanRetry.test.ts
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

The PR closes #120, remains unmerged, and is watched until every available check is green.

## Non-goals

- Changing retry counts, delays, jitter, payloads, or production error messages.
- Refactoring `NetworkClient`, `retry.ts`, Lobby transport, Supabase, or Edge Functions.
- Testing bot retry behavior already covered by `NetworkClient.botRetry.test.ts`.
- Adding a dependency or changing the lockfile, workflow, or deployment behavior.

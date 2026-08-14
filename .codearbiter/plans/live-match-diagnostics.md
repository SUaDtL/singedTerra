# Live Match Diagnostics Plan

## Goal

Give an authenticated maintainer using `?diagnostics=1` a read-only, copyable
snapshot of the battle currently running in that browser tab. The snapshot must
make live troubleshooting practical without changing a shot, transport request,
or match authority.

## SMARTS decision

Choose a bounded client-side live snapshot over a new Edge probe or another
fault injection. It is meaningful because it exposes the state that explains a
live report, safe because it neither sends an action nor changes the engine,
maintainable because one pure projector owns the public schema, reliable because
the HUD receives a current immutable projection, testable through unit and real
browser contracts, and secure because it excludes identifiers, room codes,
seeds, transcripts, and credentials. Confidence: high.

## Public contract

`LiveMatchSnapshot` is a frozen schema-v1 value containing only:

- mode (`hotseat` or `network`), execution (`casual` or `verified`), phase,
  current round and configured round count, turn number, active seat ordinal,
  current seat health/alive state, input status, and a bounded transport state.
- no player name or identifier, room identifier/code, seat token, seed,
  transcript, terrain, action payload, account data, or server response.

The diagnostics-only battle entry point opens a modal inspector and offers a
copy action only after the authenticated Lobby lifecycle establishes an account.
It is absent without the exact query gate and never pauses, mutates, submits,
fetches, or changes focus outside normal modal containment.

## Tasks

### Task 1: Pure public snapshot projector

**Files:**

- Create: `client/src/client/liveMatchDiagnostics.ts`
- Test: `client/src/client/liveMatchDiagnostics.test.ts`

- [x] Write failing unit cases for hot-seat casual, network transport states,
  verified input freeze, and hostile/secret-bearing sources. Assert exact keys,
  frozen output, safe bounds, and no projected secret or identity fields.
- [x] Run the focused file and observe RED because no public projector exists.
- [x] Implement the smallest pure projector from a narrow source shape.
- [x] Run the focused file GREEN and record the exact schema assertions.

### Task 2: Diagnostics-gated HUD inspector

**Files:**

- Modify: `client/src/ui/HUD.ts`
- Test: `client/src/ui/HUD.diagnostics.test.ts`
- Modify: `client/src/main.ts`
- Test: `client/src/main.hotSeatProgression.test.ts`

- [x] Write failing HUD tests requiring the inspector trigger only when given a
  snapshot provider, current snapshot rendering, copy routing, modal focus
  return, and no trigger in ordinary play.
- [x] Write a failing main-composition test for a `?diagnostics=1` battle that
  supplies a current snapshot without exposing the raw lobby config.
- [x] Run focused tests RED.
- [x] Wire the minimal inspector through the existing HUD and main lifecycle.
  The UI has no mutation, network, or engine control.
- [x] Run focused tests GREEN plus typecheck.

### Task 3: Rendered live-battle proof and delivery

**Files:**

- Create: `e2e/live-match-diagnostics.spec.ts`
- Modify: `.codearbiter/plans/commander-career-loop-milestone-2.md`
- Modify: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Append: `.codearbiter/sprint-log.md`

- [x] Write a browser RED that establishes an isolated authenticated session,
  starts a public local battle under the exact diagnostics query, reaches the
  HUD entry, opens the inspector, asserts the public snapshot and absence of
  sensitive strings, closes it, and proves normal Fire remains reachable.
- [x] Implement only the correction needed for GREEN.
- [ ] Run focused browser profiles, full client and deterministic checks,
  review the exact diff adversarially, clear exact-head hosted CI, merge, deploy
  the client, and record a bounded production health observation.

## Verification

`npm --workspace client exec vitest run src/client/liveMatchDiagnostics.test.ts src/ui/HUD.diagnostics.test.ts src/main.hotSeatProgression.test.ts`

`npx playwright test e2e/live-match-diagnostics.spec.ts`

`npm run typecheck`, `npm run check`, `npm run test:client`

## Out of scope

No action-log reader, room browser, room/player identifiers, transport tokens,
server-side probe, destructive simulation, or normal-player diagnostic surface.

# Lobby Session Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and
> `superpowers:subagent-driven-development`; codeArbiter owns the final commit. Steps use checkbox
> (`- [ ]`) syntax for tracking.
> **Status:** APPROVED - user approved 2026-07-22.

**Goal:** Extract Lobby's established waiting-room state and online lifecycle into an observable,
DOM-free `LobbySession` while preserving all characterized behavior.

**Architecture:** `LobbySession` composes the existing `LobbyTransport`, owns one waiting-state
snapshot plus Supabase/timer resources, and reports lifecycle events to `Lobby`. Lobby keeps form and
DOM concerns, delegates session operations, and exposes private compatibility accessors so the merged
characterization oracle remains byte-identical.

**Tech Stack:** TypeScript, Vitest, jsdom integration oracle, fake timers, Supabase Realtime types,
existing npm workspaces; no new dependency.

## Global Constraints

- Preserve all request bodies, response handling, channel names/filters, heartbeat cadence (10000
  ms), browse cadence (3000 ms), messages, render timing, and `LobbyConfig` output.
- Keep `Lobby.sessionLifecycle.test.ts`, `Lobby.network.test.ts`, `Lobby.rejoin.test.ts`, and
  `Lobby.errorLogging.test.ts` byte-identical to `origin/main`.
- Keep create/join validation, room-list data, visible busy/error state, DOM building, localStorage
  writes, and `LobbyConfig` conversion in `Lobby`.
- Move waiting state, lazy Supabase client/channel, meaningful signature, heartbeat timer, browse
  timer, and waiting-state transport operations to `client/src/client/LobbySession.ts`.
- The token remains secret under ADR-0009: never log, serialize, broadcast, place in a URL, or persist
  it anywhere new.
- Do not change Edge Functions, migrations, RLS, auth, CORS, rate limits, Supabase configuration,
  dependencies, lockfiles, workflows, or deployment state.
- Do not add public test hooks, a reducer framework, live network tests, browser waits, explicit
  `any`, or type/lint suppressions.
- codeArbiter owns commits; workers leave changes unstaged and uncommitted.

## File Map

- Create `client/src/client/LobbySession.ts`: session state, Realtime lifecycle, heartbeat/browse
  timers, and waiting-state transport operations.
- Create `client/src/client/LobbySession.test.ts`: direct DOM-free unit and mutation-sensitive tests.
- Modify `client/src/ui/Lobby.ts`: construct/observe the session, delegate transitions, and retain
  private oracle compatibility delegates.
- Append decisions and receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | DOM-free LobbySession lifecycle owner | - | focused RED/GREEN and mutation proof | ACCEPTED |
| T2 | Lobby integration with legacy parity | T1 | unchanged oracle/action suites and structural checks | ACCEPTED |
| T3 | Review closure, governed commit, PR, green CI | T2 | full matrix, review fleet, commit/PR gates | IN PROGRESS |

---

### Task 1: Build the DOM-free LobbySession owner

**Files:**

- Create: `client/src/client/LobbySession.ts`
- Create: `client/src/client/LobbySession.test.ts`

**Interfaces:**

- Consumes `LobbyTransport` methods `heartbeat`, `readyUp`, `updatePlayer`, and `leaveRoom`.
- Consumes a default lazy loader for the existing `../lib/supabase` singleton.
- Produces `LobbyWaitingState`, `LobbySessionEvent`, and `LobbySession`.

- [x] **Step 1: Write the failing state and resource tests**

Create `LobbySession.test.ts` with structural fake transport and callback-capturing fake Supabase
objects. The test must not call `document`, create DOM nodes, or instantiate `Lobby`.

Start with imports that fail because the module does not exist:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LobbySession,
  type LobbySessionEvent,
  type LobbyWaitingState,
} from './LobbySession'
```

Use this canonical state in every test:

```ts
const waiting: LobbyWaitingState = {
  roomId: 'room-1',
  roomCode: 'ABCD',
  playerId: 'p-1',
  token: 'tok-secret',
  players: [
    { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false, lastSeen: 100 },
    { id: 'p-2', name: 'CPU', color: '#4d8ce8', ready: true, ai: 'medium', lastSeen: 100 },
  ],
  seed: 42,
  options: { maxPlayers: 3, maxWind: 7, gravity: 0.2, rounds: 3 },
  thisPlayerReady: false,
}
```

Cover these exact obligations:

1. constructor state is the current empty/default state; `replaceWaiting(waiting)` replaces it;
2. subscribe wires `rooms:room-1`, exact UPDATE/DELETE filters, one channel, and one 10000 ms timer;
3. resubscribe removes the first channel and leaves one timer;
4. waiting UPDATE adopts players/seed/options, emits one `changed`, and a lastSeen-only UPDATE emits
   no second event while still adopting lastSeen;
5. active UPDATE cleans resources and emits one exact `ready` room;
6. roster removal and DELETE reset identity/players/readiness and emit exact `gone` messages once;
7. `readyUp`/`updatePlayer`/`leaveRoom` send exact `{roomId, playerId, token}` values and adopt state;
8. browse start/restart/stop owns one 3000 ms interval and invokes the supplied tick;
9. repeated waiting/browse cleanup is idempotent.

- [x] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm -w @singedterra/client exec vitest run src/client/LobbySession.test.ts
```

Expected: non-zero compile failure containing `Cannot find module './LobbySession'`.

- [x] **Step 3: Define the exact public contract**

Create `LobbySession.ts` with these exported values and no DOM import:

```ts
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import {
  LobbyTransport,
  type NetworkPlayer,
  type RoomOptions,
} from './LobbyTransport'

export interface LobbyWaitingState {
  roomId: string
  roomCode: string
  playerId: string
  token: string
  players: NetworkPlayer[]
  seed: number
  options: RoomOptions
  thisPlayerReady: boolean
}

export type LobbySessionEvent =
  | { type: 'changed' }
  | { type: 'ready'; room: { players: NetworkPlayer[]; seed: number; options: RoomOptions } }
  | { type: 'gone'; message: string }

type SessionTransport = Pick<
  LobbyTransport,
  'heartbeat' | 'readyUp' | 'updatePlayer' | 'leaveRoom'
>

type SessionSupabase = Pick<SupabaseClient, 'channel' | 'removeChannel'>
type SupabaseLoader = () => Promise<SessionSupabase>

const EMPTY_WAITING: LobbyWaitingState = {
  roomId: '',
  roomCode: '',
  playerId: '',
  token: '',
  players: [],
  seed: 0,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
  thisPlayerReady: false,
}
```

The class signature is:

```ts
export class LobbySession {
  constructor(
    transport: SessionTransport,
    onEvent: (event: LobbySessionEvent) => void,
    loadSupabase?: SupabaseLoader,
  )

  get waiting(): Readonly<LobbyWaitingState>
  replaceWaiting(next: LobbyWaitingState): void
  subscribeWaitingRoom(): Promise<void>
  cleanupWaitingChannel(): void
  startHeartbeat(): void
  stopHeartbeat(): void
  startBrowsePoll(tick: () => void): void
  stopBrowsePoll(): void
  readyUp(): ReturnType<SessionTransport['readyUp']>
  updatePlayer(fields: { name?: string; color?: string }): ReturnType<SessionTransport['updatePlayer']>
  leaveRoom(): Promise<void>
}
```

`replaceWaiting` copies the top-level value and `players` array so callers cannot replace internal
state by later mutating their input. It does not emit; Lobby's production create/join accessors use
it before subscribing, when no session event can interleave.

- [x] **Step 4: Implement subscription, state derivation, and terminal events**

Port the current Lobby code without changing literals:

```ts
async subscribeWaitingRoom(): Promise<void> {
  this.cleanupWaitingChannel()
  const roomId = this.state.roomId
  const supabase = await this.getSupabase()
  this.waitingChannel = supabase
    .channel(`rooms:${roomId}`)
    .on('postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0], {
      event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
    }, (payload) => this.applyRoomUpdate(payload.new))
    .on('postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0], {
      event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
    }, () => this.handleRoomGone('This room is no longer available.'))
    .subscribe()
  this.startHeartbeat()
}
```

`applyRoomUpdate()` must adopt players/seed/options before branching, clean and emit `ready` on
`status === 'active'`, emit the existing roster-removal message when this seat disappears, and emit
`changed` only when the signature excluding lastSeen differs. `handleRoomGone()` must be a no-op when
`state.roomId` is already empty, clean resources, clear exactly roomId/roomCode/playerId/token/
players/readiness, preserve seed/options as today, then emit `gone`.

- [x] **Step 5: Implement heartbeat, browse, and action delegation**

Use exact timer behavior:

```ts
startHeartbeat(): void {
  this.stopHeartbeat()
  this.waitingHeartbeatId = setInterval(() => {
    void this.transport.heartbeat(this.seat()).catch(() => {})
  }, 10_000)
}

startBrowsePoll(tick: () => void): void {
  this.stopBrowsePoll()
  this.browsePollId = setInterval(tick, 3_000)
}
```

`readyUp()` calls the transport with `seat()`, then on a successful non-error result adopts returned
players and sets `thisPlayerReady: true`; when `started` is true it cleans the waiting lifecycle and
emits the same exact `ready` event as an active Realtime update before returning the unchanged result. `updatePlayer(fields)` adopts returned players only on a
successful non-error result. `leaveRoom()` captures `seat()` before awaiting, delegates once, and
always calls `cleanupWaitingChannel()` in `finally`, while allowing a thrown network error to reach
Lobby's existing best-effort logger.

- [x] **Step 6: Run focused GREEN and mutation proof**

Run the focused test. Then apply and restore one invariant at a time:

1. omit cleanup at subscribe start;
2. omit heartbeat start;
3. omit `players` adoption;
4. include `lastSeen` in the signature;
5. omit active-transition cleanup;
6. omit ready-up player/readiness adoption;
7. omit browse-poll replacement.

Each mutation must fail its named assertion. Restore exact source after each, verify the production
file hash matches the pre-mutation hash, and finish with focused GREEN.

- [x] **Step 7: Run task verification and request fresh task review**

```powershell
npm -w @singedterra/client exec vitest run src/client/LobbySession.test.ts
npm -w @singedterra/client run typecheck
git diff --check
```

Task review must find no Critical/Important issue before T1 becomes ACCEPTED.

---

### Task 2: Integrate Lobby without weakening the oracle

**Files:**

- Modify: `client/src/ui/Lobby.ts`
- Create: `client/src/ui/Lobby.sessionEventOrdering.test.ts`
- Consume: `client/src/client/LobbySession.ts`
- Verify unchanged: `client/src/ui/Lobby.sessionLifecycle.test.ts`
- Verify unchanged: `client/src/ui/Lobby.network.test.ts`
- Verify unchanged: `client/src/ui/Lobby.rejoin.test.ts`
- Verify unchanged: `client/src/ui/Lobby.errorLogging.test.ts`

**Interfaces:**

- Consumes `LobbySession`, `LobbySessionEvent`, and `LobbyWaitingState` from Task 1.
- Preserves `Lobby` constructor, `show()`, `hide()`, and all external callbacks.

- [x] **Step 1: Record the parity oracle and protected-test hashes**

Run before editing Lobby:

```powershell
npm -w @singedterra/client exec vitest run src/ui/Lobby.sessionLifecycle.test.ts src/ui/Lobby.network.test.ts src/ui/Lobby.rejoin.test.ts src/ui/Lobby.errorLogging.test.ts
Get-FileHash -Algorithm SHA256 client/src/ui/Lobby.sessionLifecycle.test.ts,client/src/ui/Lobby.network.test.ts,client/src/ui/Lobby.rejoin.test.ts,client/src/ui/Lobby.errorLogging.test.ts
```

Expected: all current tests pass. Save the four hashes for post-refactor comparison.

- [x] **Step 2: Construct and observe one session**

Remove the Supabase type import and the stored waiting/channel/timer fields. Add:

```ts
import {
  LobbySession,
  type LobbySessionEvent,
  type LobbyWaitingState,
} from '../client/LobbySession'

private readonly session: LobbySession

constructor(root: HTMLElement, onReady: (config: LobbyConfig) => void) {
  this.root = root
  this.onReady = onReady
  this.players = [defaultRow(0), defaultRow(1)]
  this.session = new LobbySession(this.transport, (event) => this.handleSessionEvent(event))
}
```

Handle events without moving view policy:

```ts
private handleSessionEvent(event: LobbySessionEvent): void {
  if (event.type === 'changed') {
    this.render()
  } else if (event.type === 'ready') {
    this.emitNetworkReady(event.room)
  } else {
    this.onlineSubView = 'create'
    this.onlineError = event.message
    this.render()
  }
}
```

- [x] **Step 3: Route production waiting state through the session-backed adapter**

Keep the existing successful create/join field assignments, but make every assigned `waiting*`
member a private accessor backed by `session.replaceWaiting()`. This preserves assignment order and
the existing action oracles while moving storage to one owner. Persist `writeSeatToken()` and
`writeSession()` exactly where they are today, then render and call `session.subscribeWaitingRoom()`.

All waiting-room view reads use `this.session.waiting`. Ready and update handlers call session
methods, retain current busy/error branches, and render after successful non-terminal completion.
Leave catches the same thrown error, calls `clearSession()`, switches to create, clears visible error,
and renders after `session.leaveRoom()` settles.

- [x] **Step 4: Move browse and hide cleanup ownership**

Keep the immediate `fetchRooms()` in `enterBrowse()`, then use:

```ts
private startBrowsePoll(): void {
  this.session.startBrowsePoll(() => { void this.fetchRooms() })
}

private stopBrowsePoll(): void {
  this.session.stopBrowsePoll()
}
```

`hide()` delegates both cleanup methods. Keep `fetchRooms()` unchanged so late-response suppression
still checks `onlineSubView` in Lobby.

- [x] **Step 5: Preserve the private merged-oracle surface through delegates**

Keep these method names as private delegates because the unchanged lifecycle and network
characterization suites invoke them:

```ts
private subscribeWaitingRoom(): Promise<void> {
  return this.session.subscribeWaitingRoom()
}

private cleanupWaitingChannel(): void {
  this.session.cleanupWaitingChannel()
}

private startHeartbeat(): void {
  this.session.startHeartbeat()
}

private stopHeartbeat(): void {
  this.session.stopHeartbeat()
}
```

Provide private get/set accessors for the eight values used by production and seeded/read by
`Lobby.sessionLifecycle.test.ts`: roomId, roomCode, playerId, token, players, seed, options, and
thisPlayerReady. Each setter calls `replaceWaiting({ ...this.session.waiting, changedField })`; each
getter reads the corresponding snapshot field. Create/join writes and waiting-view reads must use
these accessors so they are not test-only production methods.

- [x] **Step 6: Prove unchanged integration behavior**

Run:

```powershell
npm -w @singedterra/client exec vitest run src/client/LobbySession.test.ts src/ui/Lobby.sessionLifecycle.test.ts src/ui/Lobby.network.test.ts src/ui/Lobby.rejoin.test.ts src/ui/Lobby.errorLogging.test.ts
npm -w @singedterra/client run typecheck
git diff --check
git diff --exit-code origin/main -- client/src/ui/Lobby.sessionLifecycle.test.ts client/src/ui/Lobby.network.test.ts client/src/ui/Lobby.rejoin.test.ts client/src/ui/Lobby.errorLogging.test.ts
rg -n "@supabase/supabase-js|\.channel\(|removeChannel|setInterval|clearInterval|waitingHeartbeatId|browsePollId" client/src/ui/Lobby.ts
```

Expected: all tests pass; protected tests have no diff; final `rg` returns no match.

- [x] **Step 7: Prove integration sensitivity**

Apply and restore separately:

1. suppress the create-path room-id accessor assignment; the create success/action oracle fails;
2. suppress the join-path player-id accessor assignment; the join success/action oracle fails;
3. suppress the `changed` event render; lifecycle de-flicker/render assertions fail;
4. suppress the `ready` event handoff; active broadcast assertion fails;
5. suppress the `gone` event view transition; dead-room assertion fails;
6. omit browse stop on navigation; timer ownership test fails.

Restore production exactly and repeat GREEN.

- [x] **Step 8: Request parity, security, and quality review**

Reviewers receive the approved spec, plan, original oracle hashes, base-to-worktree diff, focused
results, and mutation receipts. Security review must explicitly confirm ADR-0009 token handling and
lazy hot-seat boot are unchanged. Resolve every Critical/Important finding and re-review before T2
becomes ACCEPTED.

Review correction receipt: independent parity review found source-specific busy ordering, duplicate
terminal handoff, deferred-loader resurrection, and stale callback ownership races. TDD corrections
add a `direct`/`realtime` ready source, exactly-once per-room terminal emission, generation-cancelled
memoized loading, and generation-plus-room callback guards. The new focused ordering test preserves
base busy-state semantics while the four merged characterization tests remain byte-identical.

Final correction receipt: whole-diff and coverage review reopened T2 for late rejected actions,
room replacement during a deferred loader, post-leave action/subscription reopening, and a pending
action invalidated by room deletion. Generation-plus-room operation checks now convert only
invalidated success or rejection paths to stale outcomes, current-room failures still rethrow,
leave/terminal/gone close the action lifecycle, and Lobby clears abandoned busy state. Focused
review passed 102/102 with `LobbySession` at 100% statements/lines/functions; final architecture,
security, parity, and coverage reviews report no remaining finding.

---

### Task 3: Whole-branch verification, landing, and verified deployment

- [x] **Step 1: Run final whole-diff review and coverage audit**

Zero Critical/Important review findings and zero Critical/High/Medium coverage gaps may remain.
Confirm issue #128 acceptance while excluding issue #129 view decomposition.

- [x] **Step 2: Run the fresh full matrix**

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
git diff --exit-code origin/main -- client/src/ui/Lobby.sessionLifecycle.test.ts client/src/ui/Lobby.network.test.ts client/src/ui/Lobby.rejoin.test.ts client/src/ui/Lobby.errorLogging.test.ts package.json client/package.json shared/package.json package-lock.json supabase .github/workflows
```

- [ ] **Step 3: Harvest, append receipts, and run `$ca-commit`**

Harvest low-confidence decisions and `[NEEDS-TRIAGE]` findings, record SMARTS/mutation/review/matrix
receipts, stage only approved files, and run the commit gate. Classify the behavior-neutral work as
`refactor(lobby)` with `Closes #128`.

- [ ] **Step 4: Run `$ca-pr`, PR coverage audit, `$ca-watch`, merge, and deployment verification**

Open a ready PR citing the Level 1 ADR-0009 no-change constraint and Level 3 maintainability choice.
Resolve PR-level findings, push only reviewed fixes, and watch all available checks to green. The
user subsequently granted standing project-scoped authority to merge clean reviewed green PRs and
deploy verified artifacts. Merge this PR after green, confirm the automatic Pages deployment, and
promote only audited stale Supabase artifacts; security/auth/crypto, destructive data operations,
and spending remain separate gates.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current session and admission owners. Current source/oracles: `client/src/client/LobbySession.ts`, `client/src/client/LobbyRoomController.ts`.

The latest change to this historical plan reachable from `origin/main` is `a60d5fbe351e` (refactor(lobby): extract session lifecycle). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

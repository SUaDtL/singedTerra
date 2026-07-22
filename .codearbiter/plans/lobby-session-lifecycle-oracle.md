# Lobby Session Lifecycle Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and
> `superpowers:subagent-driven-development`; codeArbiter owns the final commit.
> **Status:** APPROVED — user approved 2026-07-22.

**Goal:** Pin Lobby's existing Realtime, heartbeat, broadcast-state, and teardown behavior before the `LobbySession` extraction.

**Architecture:** One focused Vitest/jsdom file uses a hoisted callback-capturing Supabase fake and
fake timers. It drives the real private legacy lifecycle through the documented characterization
cast, proves public effects and owned resources, and validates existing behavior with temporary
production mutations that are restored before landing.

**Tech stack:** TypeScript, Vitest, jsdom, fake timers, existing npm workspace; no new dependency.

## Global constraints

- Create only `client/src/ui/Lobby.sessionLifecycle.test.ts`; production files stay unchanged.
- Use a distinct fake channel per subscription and capture actual callbacks registered by Lobby.
- Mock only the Supabase transport boundary and time; do not reimplement Lobby state transitions in
  the fake.
- Assert exact channel names, filters, timer counts, stored state, cleanup calls, messages, and
  `LobbyConfig` output.
- Do not add exported test hooks, private production accessors, real network calls, or browser waits.
- Each mutation proof changes one production invariant, fails for the intended assertion, and
  restores the exact source before the next mutation.
- `Lobby.ts`, `LobbyTransport.ts`, package manifests, and `package-lock.json` finish byte-identical to
  `origin/main`.
- codeArbiter owns commits; workers leave changes uncommitted.

## File map

- Create `client/src/ui/Lobby.sessionLifecycle.test.ts`: fake Realtime channel plus lifecycle oracle.
- Append decisions and verification receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Subscription, broadcast, and teardown characterization | — | focused mutation REDs and GREEN suite | ACCEPTED |
| T2 | Review closure, governed commit, PR, and green CI | T1 | full matrix, review fleet, commit/PR gates | IN PROGRESS |

---

### Task 1: Lobby session lifecycle characterization

**Files:**

- Create: `client/src/ui/Lobby.sessionLifecycle.test.ts`

**Interfaces:**

- Consumes the existing private `subscribeWaitingRoom()`, `cleanupWaitingChannel()`, `render()`, and
  waiting-room fields through the same typed-through-`unknown` characterization technique as
  `Lobby.network.test.ts`.
- Produces a callback-driven oracle that the later `LobbySession` extraction must keep unchanged.

- [ ] **Step 1: Build the callback-capturing Supabase fixture**

Use `vi.hoisted()` so the package mock can return one stable fake Supabase client. Each call to its
`channel(name)` creates a fresh record with UPDATE/DELETE callback slots and chainable spies:

```ts
interface CapturedChannel {
  name: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  update?: (payload: { new: Record<string, unknown> }) => void;
  delete?: () => void;
}

const realtime = vi.hoisted(() => {
  const channels: CapturedChannel[] = [];
  const removeChannel = vi.fn();
  const channel = vi.fn((name: string) => {
    const captured = { name } as CapturedChannel;
    captured.on = vi.fn((_kind: string, filter: { event: string }, callback: unknown) => {
      if (filter.event === 'UPDATE') captured.update = callback as CapturedChannel['update'];
      if (filter.event === 'DELETE') captured.delete = callback as CapturedChannel['delete'];
      return captured;
    });
    captured.subscribe = vi.fn(() => captured);
    channels.push(captured);
    return captured;
  });
  return { channels, channel, removeChannel };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: realtime.channel,
    removeChannel: realtime.removeChannel,
  })),
}));
```

Reset channel records/spies, local storage, fake timers, DOM root, and Lobby per test. Cleanup the
Lobby lifecycle before restoring real timers.

- [ ] **Step 2: Characterize subscribe, resubscribe, heartbeat, and cleanup**

Seed `waitingRoomId`, `waitingPlayerId`, and `waitingToken`, then await the real private subscription.
Assert exact UPDATE/DELETE registrations for `public.rooms`, `id=eq.room-1`, one `subscribe()`, and
`vi.getTimerCount() === 1`.

Change the room id to `room-2` and subscribe again. Assert the first channel was passed once to
`removeChannel`, the second channel uses `rooms:room-2`, and only one interval remains. Call cleanup
twice; the second channel is removed once and `vi.getTimerCount() === 0`.

- [ ] **Step 3: Characterize waiting UPDATE state and signature de-flickering**

Spy on the real private `render()`. Invoke the captured UPDATE callback with:

```ts
{
  new: {
    status: 'waiting',
    seed: 42,
    options: { maxPlayers: 3, maxWind: 7, gravity: 0.2, rounds: 3 },
    players: [
      { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false, lastSeen: 100 },
      { id: 'p-2', name: 'CPU', color: '#4d8ce8', ready: true, ai: 'medium', lastSeen: 100 },
    ],
  },
}
```

Assert all three fields are adopted and render occurs once. Invoke the same meaningful row with only
`lastSeen: 200`; assert stored players update to 200 while render remains at one call.

- [ ] **Step 4: Characterize active UPDATE output and cleanup**

Seed room code/id, player id, and token. Invoke an active UPDATE containing the two players above,
seed 42, and options with `rounds`, `interestRate`, `suddenDeathTurn`, and `armsLevel`. Assert current
channel removal, zero timers, and one exact `onReady` call:

```ts
{
  mode: 'network',
  players: [
    { id: 'p-1', name: 'Alice', color: '#e84d4d' },
    { id: 'p-2', name: 'CPU', color: '#4d8ce8', ai: 'medium' },
  ],
  playerNames: ['Alice', 'CPU'],
  roomCode: 'ABCD',
  roomId: 'room-1',
  playerId: 'p-1',
  token: 'tok',
  settings: {
    seed: 42,
    maxWind: 7,
    gravity: 0.2,
    rounds: 3,
    interestRate: 0.15,
    suddenDeathTurn: 12,
    armsLevel: 3,
  },
}
```

- [ ] **Step 5: Characterize UPDATE-removal and DELETE terminal paths**

For a waiting UPDATE whose players omit `p-1`, assert channel/timer cleanup, all waiting identity and
player state cleared, `waitingThisPlayerReady === false`, `onlineSubView === 'create'`, and exact error
`You are no longer in this room.`

In a fresh Lobby subscription, invoke DELETE and assert the same reset with exact error
`This room is no longer available.` Invoke DELETE again and assert no second removal or render.

- [ ] **Step 6: Prove characterization RED against independent mutations**

Apply and restore one at a time, running only the focused file after each:

1. remove `cleanupWaitingChannel()` at the start of `subscribeWaitingRoom()`;
2. remove `startHeartbeat()` at the end of subscription;
3. remove assignment of `row.players` to `waitingPlayers`;
4. add `lastSeen` to `waitingSignature()`;
5. remove cleanup from the active-status branch;
6. remove `handleRoomGone()` from the DELETE callback.

Record the exact failing assertion for each. Restore `Lobby.ts` byte-for-byte and rerun focused GREEN.

- [ ] **Step 7: Run task verification and request fresh task review**

```powershell
npm -w @singedterra/client exec vitest run src/ui/Lobby.sessionLifecycle.test.ts
npm -w @singedterra/client run typecheck
git diff --check
```

Review must return both spec compliance and code quality approval. Resolve every Critical/Important
finding and re-review.

---

### Task 2: Whole-branch verification and landing

- [ ] **Step 1: Run final whole-diff review and coverage audit**

Provide the base-to-worktree diff to fresh reviewers. Zero Critical/Important and zero
Critical/High/Medium coverage findings may remain before landing.

- [ ] **Step 2: Run the fresh full matrix**

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
git diff --exit-code origin/main -- client/src/ui/Lobby.ts client/src/client/LobbyTransport.ts package.json client/package.json package-lock.json
```

- [ ] **Step 3: Append receipts and run `$ca-commit`**

Record SMARTS, mutation REDs, GREEN counts, reviews, and protected-file hashes. Stage exact intended
paths, run the governed commit gate, and use `Refs #128` rather than an auto-closing footer.

- [ ] **Step 4: Run `$ca-pr`, PR coverage audit, and `$ca-watch`**

Open a ready PR referencing #128, resolve PR-level coverage findings, push only reviewed fixes, and
watch all available checks to green. Do not merge or deploy.

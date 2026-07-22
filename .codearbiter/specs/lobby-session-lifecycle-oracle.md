# Lobby Session Lifecycle Oracle Sprint Spec

> Status: **APPROVED — user approved 2026-07-22**
> Date: 2026-07-22
> Tracks: GitHub issue #128

## Goal

Add a deterministic characterization oracle for Lobby's Realtime subscription, heartbeat, and
waiting-room lifecycle before those responsibilities move into a `LobbySession` seam.

## Why this is next

Issue #128 is explicitly blocked on this oracle. The existing `Lobby.network.test.ts` pins the seven
Edge Function actions and one standalone heartbeat interval, but it does not prove subscription
wiring, resubscription cleanup, broadcast-derived state, de-flickering, or terminal teardown.

This is more valuable than duplicating retry and audio-edge coverage already present in root
harnesses, and safer than starting the cross-cutting Supabase `Database` typing migration. It turns
the next Lobby refactor from a private-state rewrite into a parity-preserving extraction.

## Design decision

Create a focused `client/src/ui/Lobby.sessionLifecycle.test.ts`. A hoisted fake Supabase client will:

- return a distinct channel object for each `channel(name)` call;
- record the exact UPDATE and DELETE filters and callbacks registered through `.on()`;
- expose those captured callbacks to tests as synthetic Realtime broadcasts;
- record `subscribe()` and `removeChannel(channel)` calls.

Tests instantiate the real `Lobby`, use fake timers for interval ownership, and use the same
typed-through-`unknown` private-surface characterization technique already documented in
`Lobby.network.test.ts`. This coupling is temporary and intentional: the later extraction must keep
the file green without weakening its public effects. No production seam, exported test hook, or
network call is added.

### Alternatives rejected

**Append to `Lobby.network.test.ts`:** keeps one oracle but pushes an already large action-focused
file past a thousand lines and mixes transport requests with Realtime lifecycle ownership.

**Extract `LobbySession` now and test the new class:** tests the refactor's shape after the fact and
cannot prove parity with the legacy lifecycle that issue #128 says must be characterized first.

**Browser E2E with a live Supabase project:** exercises more infrastructure but is slower,
nondeterministic, credential-dependent, and unnecessary for channel/timer ownership.

## SMARTS decision

| Lens | Focused jsdom lifecycle oracle | Extend action test | Extract first |
|---|---|---|---|
| Scalable | One callback-driven fake covers every lifecycle transition. | One file keeps growing. | New seam is easier later, but parity is unknown. |
| Maintainable | Subscription concerns live in one focused test file. | Transport and Realtime concerns are mixed. | Clean final shape, unsafe sequence. |
| Available | No backend, credential, or network dependency. | Same. | Refactor can disrupt the working lobby. |
| Reliable | Pins cleanup and broadcast state before movement. | Reliable but harder to review. | Can preserve the wrong behavior unnoticed. |
| Testable | Captured callbacks and fake timers are exact and deterministic. | Same primitives in a crowded fixture. | New-class tests do not characterize the old owner. |
| Securable | No auth, token, dependency, or trust-boundary change. | Same. | Moves credential-bearing state before its lifecycle is pinned. |

Verdict: **focused lifecycle oracle, strong; confidence high.** Reliable, Maintainable, and Testable
dominate. The slice is test-only and directly removes issue #128's stated blocker.

## Acceptance criteria

### AC-1: subscription and resubscription ownership

- `subscribeWaitingRoom()` creates `rooms:<roomId>` and registers exactly one UPDATE plus one DELETE
  listener for `public.rooms` with filter `id=eq.<roomId>`, then subscribes.
- A subscription owns exactly one 10-second heartbeat interval.
- Resubscribing removes the prior channel, replaces it with the new room's channel, and retains only
  one heartbeat interval.
- `cleanupWaitingChannel()` is idempotent, removes the current channel once, clears it, and leaves no
  heartbeat timer.

### AC-2: UPDATE broadcast derivation and de-flickering

- A waiting-room UPDATE adopts `players`, `seed`, and `options` from the row.
- The first meaningful player/status change renders once.
- A second row differing only in player `lastSeen` still updates the stored players but does not
  render again because `lastSeen` is excluded from `waitingSignature()`.

### AC-3: active-room transition

- An UPDATE with `status: 'active'` adopts the broadcast row, removes the channel, stops heartbeat,
  and calls `onReady` exactly once with the network config derived from the row plus the stored
  room/player/token identity.
- The assertion includes AI seats and optional rounds/economy fields so later extraction cannot drop
  synchronized game options.

### AC-4: dead-room transitions

- An UPDATE roster that no longer contains this client tears down lifecycle state, clears stored
  waiting identity/players/readiness, returns to the create view, and shows
  `You are no longer in this room.`
- A DELETE broadcast performs the same teardown with `This room is no longer available.`
- Repeating a terminal callback after the room is already cleared is a no-op.

### AC-5: mutation-sensitive proof

At least these temporary one-invariant mutations make the focused suite fail before exact source
restoration: omit pre-subscribe cleanup, omit heartbeat start, omit broadcast player adoption,
include `lastSeen` in the meaningful signature, omit active-transition cleanup, and omit DELETE
room-gone handling.

### AC-6: verification and scope

Fresh verification before commit and PR:

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

`Lobby.ts`, `LobbyTransport.ts`, package manifests, and `package-lock.json` remain byte-identical to
`origin/main`. The PR references #128 without closing it, stays open until available checks are
green, and never merges or deploys.

## Non-goals

- Extracting `LobbySession` or changing Lobby production behavior in this sprint.
- Testing the seven Edge Function action contracts already covered by `Lobby.network.test.ts`.
- Adding live Supabase, browser E2E, dependency, package, lockfile, or deployment changes.
- Auto-merging or deploying the pull request.

# RAF teardown guard

## Status

Approved under the standing autonomous improvement authority on 2026-08-03.

## Problem

`NetworkClient.stop()` marks the client disposed and cancels the current RAF, but a
callback already dequeued by the browser can still run. The live lockstep regression
proved state was preserved, then exposed that the callback unconditionally scheduled
another RAF, allowing a stopped client to resurrect its animation loop.

## Goal

Make teardown scheduler-inert while preserving the existing live lockstep handoff.

## Scope

- Add public-behavior assertions for stale duplicate delivery and post-stop RAF state
  and scheduler behavior.
- Add the smallest `NetworkClient` disposal guard needed to prevent rescheduling after
  teardown.
- Run the complete local and hosted delivery gates.

## Acceptance criteria

1. A stale duplicate row leaves phase, turn, active seat, and finite ammo unchanged.
2. Invoking a queued RAF callback after `stop()` leaves state unchanged and queues no
   replacement RAF callback.
3. The guard preserves the existing contiguous live action handoff and all existing
   client, engine, Edge, build, and E2E behavior.
4. No auth, persistence, migration, secret, dependency, action-protocol, or Supabase
   backend change is introduced.

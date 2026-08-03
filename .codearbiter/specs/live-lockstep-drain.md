# Live lockstep buffered-action drain

## Status

Approved under the standing autonomous improvement authority on 2026-08-03.

## Problem

Networked clients buffer Realtime action rows because delivery order is not guaranteed. A committed fire can move the local engine into `FIRING`/`RESOLVING` while the next contiguous row is already buffered. The client must not apply that next row early, and it must not lose it when the projectile finishes. The existing implementation has the intended RAF handoff, but the current client tests stop before exercising that live boundary.

## Goal

Add a causal, public-behavior regression proving that a contiguous buffered action is applied exactly once and in sequence after a live projectile-resolution cycle completes.

## Design

- Extend the existing `NetworkClient.lockstep.test.ts` Supabase/Realtime seam with a deterministic `requestAnimationFrame` driver.
- Initialize an empty room, deliver sequence 1 first, then sequence 0. Assert that sequence 0 enters flight and sequence 1 remains pending rather than being silently dropped.
- Start the client, advance the captured RAF callback until the first flight and settle phase end, and assert that sequence 1 is then applied exactly once and the engine reflects the second committed action.
- Keep the test on the public `NetworkClient` API and observable engine state; do not access private fields or alter the action protocol.

## Acceptance criteria

1. The regression fails against a version that drains the buffer synchronously during `FIRING` or never re-enters the drain after resolution.
2. The regression passes against current behavior and proves both sequence ordering and no duplicate application.
3. Existing client, engine, Edge, build, and E2E checks remain green.
4. The slice changes no auth, persistence schema, migration, secret, dependency, or production deployment surface.

## Non-goals

- Changing projectile physics, RAF pacing, buffering policy, or Realtime transport.
- Adding a manual two-browser playtest requirement to this bounded test slice.
- Implementing persistent users or progression; `mvp2.identity.0001` remains deferred behind its hard gate.

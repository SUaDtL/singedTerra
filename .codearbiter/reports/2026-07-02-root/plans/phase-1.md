# Phase 1 plan — Wave 1 (appsec, architecture, reliability)

Kept/combined work only. `reliability-001`, `reliability-002` → `investigate` (see report appendix), not planned.

## Security (critical) — do first
- **appsec-001** (critical) — `playerId` identity token world-readable via anon SELECT on
  `rooms.players` + Realtime, defeating referee anti-impersonation. Remediation shape: stop
  exposing the secret through the public read path — split the auth token out of the
  client-readable `players` array (secret in a service-only column/table; keep only opaque seat
  id + display fields public), or expose a column-projected VIEW to anon. Design touches ADR-0006
  (ephemeral identity assumes the token is not disclosed) → resolve the identity-model shape via
  `/ca:adr` / `/ca:reconcile` alongside the fix. Effort L.
  - Acceptance: no anon-only path returns another seat's auth token; the "cannot act for another
    human" guard is backed by a secret the requester cannot read; a test asserts a public-data-only
    client cannot submit an action authorized as a seat it does not own.

## Input validation (low)
- **appsec-002** (low) — clamp `maxWind`/`gravity` in `create_room` (and the client rematch read)
  with `Number.isFinite` + range clamp, mirroring `coerceEconomyOptions`. Effort S.

## Architecture / maintainability
- **architecture-001** (medium) — extract a Lobby transport/session module (room create/join/
  browse/heartbeat/ready/leave POSTs + waiting-room Realtime) mirroring the `NetworkClient` seam;
  move validation to a pure testable module. Effort L. `depends_on`: shares remediation surface
  with architecture-004 — do 004's transport helper first, then route Lobby through it.
- **architecture-004** (low) — add one typed `callFunction(name, body)` transport in `lib/`
  (base URL + anon headers + error envelope) and route all 10 `functions/v1` POSTs through it.
  Effort M. Foundational for architecture-001.
- **hud-decomposition** (medium, combines architecture-002 + architecture-003) — split `HUD.ts`
  (2120 LOC) by concern: extract store modal, round-over/scoreboard modal, and pause modal into
  their own components HUD composes; decompose the ~590-LOC `HUD.build()` into per-widget builders.
  Effort L. Independent of the security/transport work.
- **architecture-005** (medium) — behavior-preserving decomposition of `GameEngine.tick()`
  (~230 LOC) into named per-phase methods (integrate/collide/detonate-dispatch/settle/fire-step)
  so determinism harnesses can assert per-phase. **Route via `/ca:refactor`** (parity proven by
  unmodified harnesses). Effort M.

## Reliability
- **reliability-003** (low) — track/guard the seq-conflict retry `setTimeout` and the
  `handleRematch` poll loop; add a `_closing`/disposed flag checked by `submitAction`, the retry
  callback, `handleRematch`, and `failFire`; clear/short-circuit in `stop()`. Effort S.

## Suggested sequence
1. appsec-001 (critical, security) — highest priority.
2. architecture-004 → architecture-001 (transport helper, then Lobby split).
3. appsec-002, reliability-003 (small, independent).
4. hud-decomposition, architecture-005 (larger refactors; `/ca:refactor` for 005).

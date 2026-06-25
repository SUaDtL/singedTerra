# Phase 2 — Networked resilience & determinism guards

Roadmap only. These harden the lockstep/networking layer (where the reliability lens concentrated the risk) and the determinism invariant.

## Group: fire-recovery-robustness  ·  MEDIUM  ·  effort M
**Findings:** reliability-005 (no fetch timeout), observability-005 (resync failure swallowed).
No fetch in `client/src` uses an AbortController/timeout, and `resyncLog` failure just logs+returns, so a hung or failed recovery leaves the player stuck in "Sending…" with no escape but reload.
- **Approach:** wrap supabase reads / edge POSTs in an AbortController timeout (~8–10s); in `recoverStuckFire`/`resyncLog` treat overrun-or-error as a fire failure — release `_isFiring`, notify the user, set the reconnecting state.
- **Acceptance:** a black-holed network during fire-recovery releases the input lock within a bounded time and surfaces a message.

## Group: tickcap-handling  ·  MEDIUM  ·  effort M
**Findings:** reliability-006 (engine left wedged), observability-001 (cap log has no context).
On hitting the 10k-tick cap, `tickToCompletion` only `console.error`s and returns with the engine stuck in FIRING/RESOLVING; `flushPendingActions` then never drains → silent permanent per-client freeze.
- **Approach:** on cap, force a recoverable phase (clear projectiles/fire → PLAYER_TURN) or surface a fatal-desync banner offering reload/leave; add `{roomId, turn, seq}` context to the log.
- **Acceptance:** hitting the cap produces a user-visible signal and never leaves the engine wedged such that all future actions drop.

## Group: determinism-drift-guards  ·  MEDIUM  ·  effort M
**Findings:** architecture-001 (gravity/maxWind literals across 5 sites), architecture-004 (clone() field-parity), architecture-005 (accessory allowlist in referee).
Three hand-synced couplings across the determinism boundary; each silently desyncs hot-seat vs networked when the canonical side changes and a copy is missed.
- **Approach:** (a) client uses imported `GRAVITY`/`MAX_WIND` (no literals); edge side gets `_shared` `DEFAULT_GRAVITY`/`DEFAULT_MAX_WIND` with a MUST-match comment. (b) Add a harness asserting `clone()` field-parity (serialize round-trip / `Object.keys` parity). (c) Centralize the accessory allowlist as one `_shared` set referenced by both referee sites, with a comment/CI-grep tying it to shared `AccessoryType`.
- **Acceptance:** no physics-default literal remains outside a single source; a check fails if a GameEngine field is missing from `clone()`; the referee accessory allowlist lives in one place.

## Standalone keeps
- **reliability-009** · LOW · S — add a CI/lint guard that fails the build if `Date.now`/`performance.now`/`Math.random`/`new Date` appears under `shared/src/engine`. Cheap insurance for the prime invariant (verified clean today).
- **observability-004** · MEDIUM · S — add a global `unhandledrejection`/`error` handler in `main.ts` (`startGame` is fire-and-forget `void`), surfacing a user message instead of a silent blank screen on mobile.
- **migration-002** · MEDIUM · S — `rate_limits` grows unbounded for dead distinct-IP buckets (cleanup only runs for the same bucket). Add a pg_cron/Edge-cron `DELETE` of rows older than 2 windows.

**Sequence:** determinism-drift-guards and reliability-009 are independent and can land first; fire-recovery and tickcap both touch `NetworkClient`, do them together.

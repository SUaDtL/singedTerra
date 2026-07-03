# Phase 1 — Correctness & trust-boundary (do first)

Roadmap only (group + sequence + acceptance roll-up); per-finding code steps happen at pickup under the implementation gates.

## Group: rematch-ai-flag  ·  HIGH  ·  effort S
**Findings:** migration-004 (bug), testcov-001 (missing test).
The single guaranteed defect of this run. `restart_game/index.ts` (~128-134) maps the new roster without the `ai` field, so every CPU seat in a rematch becomes a ghost human seat that no client drives → the game freezes on bot turns.
- **Approach:** spread `...(p.ai ? { ai: p.ai } : {})` into the rematch player map (all three `players.map` sites in the file); add `restart_game/restart_game.test.ts` asserting a bot roster keeps `ai` and an all-human roster does not.
- **Acceptance:** rematch of a room with a bot produces a successor whose `players` JSONB retains `ai`; bot seats drive themselves; new Deno test green.

## Decision-required: referee-cursor-trust  ·  MEDIUM  ·  ADR-grade
**Findings:** reliability-003 (primary), appsec-001 (authz framing), appsec-004 (roundOver flag).
The referee runs no physics and has no independent turn-order source of truth — it stores the submitter's client-reported `nextActiveIndex`/`roundOver` verbatim as the gate for every later turn. Latent SPOF behind the historical P0-2/P0-3 patches; bounded to a caller's own room and within the accepted no-auth posture (ADR 0006), so not a live exploit.
- **This is a design choice, not a mechanical fix.** Two options to decide in an ADR:
  1. **Authoritative referee** — replay the shared engine over the action log server-side (SPEC §5) and remove the denormalized cursor. Highest integrity; couples Deno to engine logic.
  2. **Hardened thin referee** — keep thin, but reject a reported seat that is dead / out-of-range / a non-deterministic successor, and derive round-phase from the log rather than a body flag.
- **ADR stub:** `docs/adr/` — "Thin-trusting vs authoritative-replay referee for turn ordering." Pair with the characterization tests in edge-fn-test-coverage (testcov-003/006) which pin current behavior either way.

## Standalone keeps in this phase
- **boundary-action-validation** (dx-003 + dx-002) · MEDIUM · S–M — the referee does not validate `weapon` against the known set; an unknown weapon string commits to the permanent log and crashes `getWeapon()` (`undefined.detonation`) on every replaying client → permanent room brick (malicious member, or version-skew). Fix: validate weapon against the allowlist in the referee, type `weapon` as `WeaponType`, guard `getWeapon()` to fail fast; narrow `validateActionShape`'s result so the fire-branch casts are compiler-checked. **Sequence before** any weapon-roster expansion.
- **appsec-002** · LOW · M — `finish_game` persists a client-asserted winner/scoreboard with no log cross-check. Derive/validate the winner from the log, or document the record as advisory. Do with testcov-002 (sanitizeScoreboard tests).
- **appsec-003** · LOW · S — player `color` accepted unbounded in all three write paths; cap length + format in the shared validator the name already uses.

**Dependencies:** boundary-action-validation and the referee-cursor-trust decision both touch `submit_action/validate.ts`; sequence the weapon-allowlist fix first (mechanical), then the ADR.

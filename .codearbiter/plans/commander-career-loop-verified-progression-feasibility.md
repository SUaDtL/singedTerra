# Commander Career Loop - Verified Progression Feasibility Plan

**Status:** local feasibility proven; hosted non-awarding probe remains a product gate
**Date:** 2026-08-10
**Initiative:** `career.initiative.0001`
**Governing decisions:** ADR-0013, ADR-0014

## Goal

Prove or disprove the architecture's first hard dependency before adding schema or player-facing behavior: the actual Deno toolchain must import the one existing shared engine, deterministically replay a canonical transcript, derive a terminal outcome, enforce explicit replay bounds, and produce a deployable bundle without a second physics implementation.

## Boundaries

- No migration, database write, Auth flow, endpoint deployment, client wiring, or rank eligibility change.
- No new dependency and no duplicate engine logic.
- Production code is limited to a small DOM-free replay adapter under the existing Edge shared boundary.
- The proof uses literal deterministic fixtures and the real `GameEngine` plus `replayNetworkAction`.
- The malformed canonical sprint log remains untouched; RED/GREEN and bundle evidence will be persisted in the initiative report.

## TDD sequence

1. Add a Deno test that requires a bounded replay adapter to reproduce the hand-checked two-player terminal prefix `(seed 0x7a17b00c, three missile self-shots)` as `GAME_OVER`, winner `p2`. Independent rechecking corrected the original five-row fixture: rows four and five were invalid trailing actions that the permissive first adapter silently ignored.
2. Run the focused Deno test and record RED because the adapter does not yet exist.
3. Implement the smallest adapter that imports `GameEngine` and `replayNetworkAction`, applies actions in order, ticks only while the engine is resolving, and returns server-derivable terminal facts plus resource counts.
4. Add causal RED tests for action-count overflow and total-tick exhaustion; implement fail-closed bounds one at a time.
5. Run the focused tests, full Edge suite, shared typecheck/determinism checks, and `deno bundle --platform deno --check` against the adapter. Record bundle bytes and replay timing as feasibility evidence, not as a production-SLA claim.
6. Give the exact proof package to the initiative's adversarial reviewer. Resolve every Critical, High, and merge-blocking finding before the architecture is considered feasible.

## Exit

- **Feasible:** revise the larger plan for Auth-owned verification sessions, completion replay, atomic verified progression, and rank surfaces sourced only from verified XP.
- **Not feasible:** stop the replay architecture and return to SMARTS arbitration. Do not introduce a duplicate verifier engine or silently weaken the rank trust requirement.

## Review correction

The first exact-package review blocked the initial proof. The corrected proof now requires strict runtime parsing and legality, exact terminal consumption, and a versioned server configuration limited to 2-4 seats and one or three rounds. A second review rejected broad theoretical ceilings without a maximum accepted workload. The final local proof therefore narrows immutable hard ceilings to the demonstrated terminal envelope: 15 total actions, 14 turn-ending actions, 448 total ticks, and 198 ticks per turn-ending action. The exact 15-action four-seat team transcript and exact 198-tick Bouncing Betty turn must run through the production adapter and remain deterministic below a conservative 100 ms target because current official Supabase documentation conflicts between 200 ms and 2 seconds of CPU time.

Rank presentation remains structurally inaccessible from casual progression. A non-awarding hosted probe is still required before any verified-progression schema or award write is enabled.

---
status: accepted
date: 2026-06-25
title: Referee turn-authority — keep the thin trust-client cursor, add a desync signal
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: supabase/functions/submit_action/**
---

# ADR-0008 — Referee turn-authority (thin trust-client cursor, not server-authoritative)

## Status
Accepted (2026-06-25). Resolves the 2026-06-25 deep-review decision-required finding
`referee-cursor-trust` (GitHub #55; lens findings reliability-003 / appsec-001 / appsec-004).

## Context
`submit_action` is a thin referee (ADR-0005). Its only turn gate is
`players[active_player_index].id === actingId`, where `active_player_index` was written by the
PREVIOUS turn-ending submitter from a **client-reported `nextActiveIndex`** (`nextCursor` in
`_shared/mod.ts`), and the ROUND_OVER shop regime is unlocked by a **client-reported `roundOver`**
flag. The referee runs no physics (ADR-0002/0005), so it cannot independently compute the true
successor seat, seat aliveness, or the round phase — those live only in the engine.

The review found this is a structural single-point-of-failure behind the historically-patched
P0-2/P0-3 turn-rotation bugs:
- A **diverged or tampered** client can report a successor that points at the wrong / an eliminated
  seat. The referee stores it verbatim, so the cursor that gates *every later turn* is wrong.
- ADR-0005's risk note claimed "a wrong index self-corrects." That is **too optimistic**: a wrong
  cursor does not cleanly self-heal — it can stall the room ("Not your turn" rejected for the real
  next player) or admit an out-of-rotation row that every client then replays.
- Scope is bounded to the **caller's own room**; there is no cross-room/cross-tenant reach, and it
  sits within the already-accepted no-auth, trust-client posture (ADR-0006).

The structural guards that ARE feasible without physics are already present: `nextCursor` requires an
integer, in-range index, distinct from the acting seat outside a round boundary, else it falls back to
the modulo successor; `authorizeAction` enforces membership + bot-only proxy. The residual is
*semantic* (is the reported seat the true alive successor? is it really ROUND_OVER?) and is
un-checkable without running the engine.

## Decision
**Keep the thin, trust-client referee. Do NOT make it authoritative.** The networked design's canonical
state is the replayed action log, not server state (ADR-0002); turn-order authority stays with the
clients' identical engines. We accept the residual semantic-trust risk under ADR-0006's posture, and we
make it **observable** rather than silent: `submit_action` now logs a structured desync signal on the
"Not your turn" turn-gate rejection (room id + stored vs acting seat), complementing the client-side
`console.warn` on the same condition. This refines ADR-0005's risk note with the more accurate
"does not cleanly self-correct" analysis above.

## Alternatives considered
- **Authoritative-replay referee** — port/bundle the `shared/` engine into the Deno referee and replay
  the log to compute the true cursor, aliveness, and phase. Fully closes the gap but **reverses
  ADR-0002 (not server-authoritative) and ADR-0005 (thin, never imports `shared/`)**, couples two
  runtimes, duplicates physics, and adds real per-submit cost (replay or cached-replay on every turn).
  Disproportionate for a casual, no-PII game. *Rejected now.*
- **Thin referee + engine-state-hash checkpoint** — keep the referee thin but have clients submit a
  lightweight hash of their post-action engine state so the referee can *detect* (not prevent)
  divergence early — the honest-client-divergence (P0-2/P0-3) class. Catches real desyncs without
  becoming authoritative, but needs a new confirm endpoint + client behavior + a migration. *Deferred*
  as the first escalation if desync reports recur or stakes rise.
- **Client-reported eliminated-seat set on the room row** — let the referee reject a cursor pointing at
  a known-eliminated seat. Still client-supplied aliveness (same trust class), more state/complexity for
  marginal gain. *Rejected.*

## Consequences
No architecture change; the thin-referee surface stays small and auditable. A mis-gated or desynced
room is now diagnosable from server logs (Supabase) and client console, instead of presenting only as a
silently stuck turn. The accepted residual is recorded here so it is a deliberate, analyzed decision
rather than an incidental gap.

## Revisit trigger (supersede this ADR when)
- Real desync/grief reports recur in networked play → adopt the **state-hash checkpoint** alternative.
- Stakes rise (accounts, ranked ladders, money/PII) such that ADR-0006's trust-client posture is
  superseded → adopt the **authoritative-replay referee**.

---
status: accepted
date: 2026-06-21
title: Deterministic lockstep networking (not server-authoritative)
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: supabase/functions/submit_action/**, client/src/client/**, shared/src/net/**
---

# ADR-0002 — Deterministic lockstep networking (not server-authoritative)

## Status
Accepted (retroactive formalization; recorded 2026-06-21)

## Context
Networked play needs to keep every client in sync without a server simulating the game or shipping
large state snapshots over the wire (cost and t3.micro constraints).

## Decision
The canonical networked game is **seed + an ordered action log** (`room_actions` in Postgres). Every
client runs its own engine, seeded identically, and applies committed actions in `seq` order; no
`GameState` is ever shipped over the wire. The `submit_action` Edge Function is a thin **referee** —
it validates turn ownership and allocates the next `seq` — and runs no physics. Supabase Realtime
broadcasts each committed action row.

## Alternatives considered
- **Server-authoritative simulation** — server runs physics, streams state; higher cost, duplicates
  the engine in a second runtime; rejected.
- **Snapshot sync** — ship `GameState` periodically; bandwidth-heavy and drift-prone; rejected.

## Consequences
Reconnect falls out for free (re-fetch the log, replay it); spectating and async turns are natural
extensions. Requires strict determinism (ADR-0003) — any nondeterminism desyncs clients.

## Risks
Any engine nondeterminism (wall-clock, `Math.random`, float divergence) breaks lockstep silently;
mitigated by ADR-0003 and the determinism/lockstep harnesses.

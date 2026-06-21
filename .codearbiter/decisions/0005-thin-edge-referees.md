---
status: accepted
date: 2026-06-21
title: Thin Edge Function referees — no physics on the server
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: supabase/functions/**
---

# ADR-0005 — Thin Edge Function referees (no physics on the server)

## Status
Accepted (retroactive formalization; recorded 2026-06-21)

## Context
With deterministic lockstep (ADR-0002), the server does not need to simulate the game. It only needs
to be a minimal, trustworthy arbiter of the action log.

## Decision
Supabase Edge Functions (Deno) are **thin referees**: they validate input, authorize the actor
(membership + turn ownership), and allocate sequence numbers. They never run the engine and never
import `shared/` — they are a separate runtime with their own toolchain. `submit_action` re-derives
turn ownership from the action log + a client-reported next-seat index rather than running physics.

## Alternatives considered
- **Import `shared/` into the functions to re-simulate** — couples two runtimes, duplicates physics,
  contradicts ADR-0001/0002; rejected.
- **A dedicated Node game server** — an earlier socket.io design; removed in favor of Supabase.

## Consequences
One physics codebase; a small, auditable trusted server surface. The `NetworkAction` types are
re-declared in the functions (accepted duplication) to keep the Deno runtime independent of `shared/`.

## Risks
The referee trusts a client-reported next-seat index (bounds-checked only); acceptable because the
replayed log is canonical and a wrong index self-corrects (documented in ADR-0002/security-controls).

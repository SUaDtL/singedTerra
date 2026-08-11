---
status: accepted
date: 2026-08-10
title: Add a verification-only third engine context
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0001-one-engine-two-contexts
governs: shared/**, client/src/client/**, supabase/functions/verify_match/**, supabase/functions/_shared/verified-match/**
---

# ADR-0013 - Add a verification-only third engine context

## Status
Accepted

## Context
ADR-0001 limits the shared engine to two browser execution contexts: hot-seat and deterministic-lockstep network clients. That invariant prevents the server from independently deriving a completed match result. ADR-0012 therefore limits client-attested hot-seat results to casual history and expressly forbids using them for ranks or entitlements.

The approved commander-career direction requires ranks to come only from independently verified progression. Meeting that requirement without duplicating physics needs one additional execution context for the existing shared engine.

## Decision
Keep one physics implementation in `shared/`, but permit it to run in a third, verification-only context: a bounded Supabase Edge Function that deterministically replays a completed match transcript. Live hot-seat and networked matches continue to execute in browsers; the verifier is not in the turn-by-turn gameplay path and is not a general game server.

The shared engine must remain free of DOM, browser-network, wall-clock, and unseeded-random dependencies so the same source can be bundled for both browser and Deno execution. Before product implementation proceeds, a bounded feasibility proof must demonstrate that Supabase's Deno toolchain can bundle the shared engine and replay the maximum accepted transcript within explicit time and resource limits. Failure of that proof stops this architecture rather than permitting a duplicate verifier engine.

## Alternatives considered
- **Duplicate a reduced engine inside the Edge Function** - rejected because two physics implementations would drift and invalidate the evidence.
- **Keep ranks based on casual client attestations** - rejected because ADR-0012 explicitly forbids ranks and the user selected independently verified progression.
- **Run a dedicated authoritative game server** - rejected because it adds a paid operational surface and rewrites the current architecture.
- **Make every action server-authoritative** - rejected because it adds gameplay latency and changes both hot-seat and deterministic lockstep more broadly than the verified-progression outcome requires.

## Consequences
The project retains one deterministic engine source while adding a narrowly isolated server execution target. Normal play gains no per-turn network dependency. Shared-engine compatibility with the Deno verifier becomes a tested constraint, and engine/ruleset versioning must let stored sessions select the exact replay contract they began with.

## Risks
The shared engine or its dependency graph may not bundle within Supabase Edge limits, or worst-case replay may exceed acceptable resource bounds. The feasibility proof must measure both before migrations or player-facing rank behavior are implemented. A transcript that replays validly proves only that the submitted actions produce the derived outcome; it does not prove a human played unaided.

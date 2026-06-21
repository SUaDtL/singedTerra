---
status: accepted
date: 2026-06-21
title: One physics codebase, two execution contexts
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: shared/**, client/src/client/**
---

# ADR-0001 — One physics codebase, two execution contexts

## Status
Accepted (retroactive formalization of an invariant in place since MVP; recorded 2026-06-21)

## Context
The game must run identically in hot-seat (all players in one browser) and networked (each player on
their own browser) modes. Any divergence between the two would be a correctness bug and a perpetual
maintenance burden.

## Decision
All game logic lives in `shared/` and runs in exactly one of two places: the browser runs
`shared/engine/*` directly via `HotSeatClient`, or each networked client runs its OWN `GameEngine`
(the same code) via `NetworkClient`. `GameClient` is the interface that hides the difference from the
renderer/input layers. `shared/` depends on nothing and never imports from `client/`.

## Alternatives considered
- **Separate hot-seat and networked engines** — guarantees drift between the two over time; rejected.
- **Server-side authoritative engine** — would put physics on the server; rejected (see ADR-0002/0005).

## Consequences
Physics/terrain/types can never drift between modes — there is one implementation. Forces a clean
dependency direction (`client/` → `shared/`; `shared/` → nothing) and makes deterministic lockstep
(ADR-0002) possible, since every client's engine is byte-identical code.

## Risks
A leak of a `client/`-only concern into `shared/` (DOM, wall-clock, network) would break the property;
guarded by the no-`client/`-import rule and the determinism harnesses.

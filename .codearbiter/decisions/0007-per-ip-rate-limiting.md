---
status: accepted
date: 2026-06-21
title: Per-IP rate limiting via a Postgres counter table
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: supabase/functions/_shared/mod.ts, supabase/migrations/005_rate_limits.sql
---

# ADR-0007 — Per-IP rate limiting via a Postgres counter table

## Status
Accepted (decided at the public-hardening sprint gate; recorded 2026-06-21)

## Context
Going public makes the Supabase project a discoverable target. All 10 Edge Functions are
`verify_jwt=false` public POST endpoints; RLS gates *writes* but does nothing to cap request *volume*,
so an unauthenticated client could loop them for resource exhaustion / cost amplification (the
DoS gap from the 2026-06-21 checkpoint, CONFIRM-04).

## Decision
A **per-IP fixed-window limiter** backed by a **service-role-only Postgres counter table**
(`rate_limits` + atomic `bump_rate_limit` RPC, migration 005), enforced in `withCors()` across all 10
functions. Caps: 60 req/min/IP default; `create_room` 10, `join_room` 20, `restart_game` 10 (named
constants, tunable without a migration). Over-limit returns 429. The limiter **fails open** on a
limiter/DB error so an outage cannot take the game down.

## Alternatives considered
- **In-memory per-isolate `Map`** — zero infra, but limits leak across edge instances and reset on
  cold start; weak for a public target; rejected.
- **External store (Upstash/Redis)** — adds a dependency + secret, against the stay-Supabase
  direction; rejected.
- **No limiting (accept the gap)** — unacceptable once the project ref is public; rejected.

## Consequences
Extends the existing service-role-only-writes control rather than adding a new mechanism. One extra DB
round-trip per request on the hot path. Deployed and verified in prod (429 on the 11th `create_room`).

## Risks
A distributed many-IP flood is bounded only by Supabase platform limits (accepted; revisit if abuse
appears). Fail-open means a limiter outage silently disables protection — acceptable vs downing the game.

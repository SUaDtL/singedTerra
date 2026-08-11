---
status: proposed
date: 2026-08-10
title: Stage hosted replay verification without awarding progression
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: none
governs: supabase/functions/**, shared/src/net/**, scripts/checks/**
---

# ADR-0015 - Stage hosted replay verification without awarding progression

## Status
Proposed

## Context
ADR-0014 establishes completion-time deterministic replay as the trust boundary for future rank-eligible progression. The shared replay adapter and its local Deno feasibility proof now exist, but the deployment runtime, authentication boundary, request limits, and production execution characteristics have not yet been proven together. Adding persistent verified results and progression in the same step would combine runtime validation with irreversible data-model and reward consequences.

## Decision
Make the first hosted verification milestone an authenticated, bounded, non-awarding Supabase Edge probe. The probe may accept only the canonical deterministic inputs required by the existing replay adapter, enforce the adapter's strict transcript and execution budgets, replay without database mutation, and return only the derived terminal outcome plus bounded diagnostic metadata needed to verify production behavior. It must not create verification sessions or results, write XP, affect ranks, grant entitlements, or make any reward decision.

Persistent verified-result storage, server-derived progression, and rank eligibility remain a later milestone that may begin only after the hosted probe has passed local tests, adversarial review, exact-head hosted CI, deployment, and production health verification.

## Alternatives considered
- **Implement the complete verified-award lifecycle immediately** - rejected because it couples a new hosted runtime path to migrations and player rewards before production replay feasibility is established.
- **Keep the feasibility proof local only** - rejected because local Deno execution cannot prove Supabase bundling, authentication, deployment configuration, or production resource behavior.
- **Expose an unauthenticated public replay endpoint** - rejected because deterministic replay consumes bounded but non-zero compute and should not become an anonymous abuse surface.

## Consequences
The next slice can validate the highest-risk runtime and security assumptions without changing durable player state. The endpoint remains operationally disposable and can evolve before any persistence contract is committed. This adds one authenticated production surface that requires strict input limits, rate limiting consistent with existing Edge controls, no sensitive logging, and explicit non-mutation tests. The later award milestone still requires additive schema, idempotent transactional writes, verified-session lifecycle controls, and a separate review.

## Risks
Even bounded authenticated replay can be abused for compute consumption or can accidentally expose implementation diagnostics. Authentication, existing per-account or per-IP controls, strict body and transcript caps, generic client errors, and production telemetry must keep that surface narrow. A green probe does not prove award atomicity, migration safety, anti-automation, or human play; treating it as rank evidence would violate this decision.

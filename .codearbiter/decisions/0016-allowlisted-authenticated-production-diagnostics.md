---
status: accepted
date: 2026-08-11
title: Provide an allowlisted authenticated production diagnostics console
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: none
governs: client/src/client/ProductionDiagnostics.ts, client/src/client/ProductionDiagnostics.test.ts, client/src/ui/ProductionDiagnosticsView.ts, client/src/ui/ProductionDiagnosticsView.test.ts, client/src/ui/Lobby.ts, client/src/ui/Lobby.account.test.ts
---

# ADR-0016 - Provide an allowlisted authenticated production diagnostics console

## Status
Accepted

## Context
The authenticated `verified_replay_probe` is deployed and its anonymous refusal is proven, but browser automation cannot extract or replay the Supabase bearer credential without crossing the browser credential-storage boundary. The maintainer expects future authenticated production checks and explicitly chose a lasting testing interface instead of a one-use workaround. The interface must exercise the same browser-managed Supabase session as the game while remaining outside the ordinary player journey and without becoming a generic production request console.

## Decision
Add a URL-activated production diagnostics console to the client. The console uses the existing Supabase singleton and its browser-managed Auth session, but it never reads, copies, displays, logs, or manually constructs an authorization credential. Checks are registered in a compile-time allowlist with a fixed function name, fixed request shape, strict response validator, bounded timeout, sanitized failure codes, and secret-free receipt projection. The first registered check invokes `verified_replay_probe` with no body and verifies its exact versioned fixture contract.

The console is absent from normal navigation and appears only when `diagnostics=1` is present. `autorun=1` may request one run after the account state becomes authenticated. The console cannot accept an endpoint, method, body, header, user id, or query supplied by the operator. Every future check must extend the allowlist and receive the same test, review, and security treatment.

## Alternatives considered
- **Have the maintainer paste a one-use browser-console command** - rejected because it depends on manual credential-store access, produces weak repeatability, and does not create a reusable production verification surface.
- **Expose a generic authenticated request composer** - rejected because arbitrary destinations, payloads, and headers would create an avoidable production and credential-exposure surface.
- **Add a normal player-facing diagnostics menu** - rejected because operational checks are not part of the play journey and would add permanent player-facing complexity.

## Consequences
Authenticated production verification becomes repeatable through supported application behavior and browser automation. New checks require explicit code and schema review instead of runtime configuration. The client gains a small diagnostics state machine and modal surface, plus stable receipt semantics for automation. The interface deliberately does not replace endpoint authentication, hosted CI, deployment receipts, monitoring, or player-facing error handling.

## Risks
A future contributor could widen the registry into a generic request runner, include sensitive values in a receipt, or treat URL activation as authorization. Compile-time descriptors, exact validators, redaction tests, normal endpoint Auth enforcement, and adversarial review must prevent that drift. An authenticated diagnostic success proves the exercised contract only; it does not prove unrelated account, gameplay, persistence, or reward behavior.

---
status: accepted
date: 2026-08-10
title: Verify completed matches by bounded deterministic replay
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0005-thin-edge-referees
governs: supabase/functions/**, supabase/migrations/**, shared/src/net/**, client/src/client/**, client/src/main.ts
---

# ADR-0014 - Verify completed matches by bounded deterministic replay

## Status
Accepted

## Context
Existing Edge Functions are deliberately thin referees and `finish_game` accepts client-supplied outcome data. That is sufficient for casual history but cannot support ranks under ADR-0012's trust ceiling. The user approved a connected, rank-eligible hot-seat mode while retaining ordinary offline hot-seat as casual play.

## Decision
Preserve existing live network referees as thin, latency-sensitive endpoints. Add a separate Auth-owned Verified Deployment lifecycle for rank-eligible hot-seat matches:

1. Supabase creates a verification session and owns its seed, options, ruleset version, engine version, expiry, transcript bounds, and account association.
2. The authenticated browser runs the match locally with the existing shared engine and records a canonical action transcript.
3. At terminal game state, the browser submits the transcript only. It does not submit the winner, XP, rank, cumulative totals, or reward decision.
4. An isolated Edge verifier replays the bounded transcript with the session's exact deterministic contract, derives the result, and atomically records one immutable verified result plus server-derived progression.

Ranks and future rank-dependent presentation derive only from verified XP. ADR-0012 remains in force for ordinary client-attested hot-seat history, which stays casual and separate. Verification establishes that a bounded valid transcript leads to the stored outcome; it makes no claim that the player was human or unaided.

## Alternatives considered
- **Persist and validate every hot-seat action live** - rejected because it adds writes and connectivity throughout play while still not preventing automation.
- **Make the server authoritative for every action** - rejected because it adds latency, cost, and a broad architecture rewrite.
- **Trust an end-only client result** - rejected because it cannot independently derive rank-eligible evidence.

## Consequences
Rank-eligible hot-seat requires connectivity at session creation and completion; ordinary hot-seat remains available without it. The backend gains additive session/result storage and start/complete endpoints with idempotent completion. Verification must fail closed on expiry, engine or ruleset mismatch, malformed transcripts, non-terminal replay, excessive action count, or resource-budget exhaustion.

## Risks
A player can automate production of a valid transcript, so verified progression is not an anti-bot or human-skill guarantee. Replay can be abused for resource consumption unless sessions have short TTLs, strict transcript and action caps, per-account rate limits, and at most one active verification session per account. Completion and progression writes must be transactional so retries cannot award progress twice.

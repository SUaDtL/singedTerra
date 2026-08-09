---
status: accepted
date: 2026-08-09
title: Allow client-attested hot-seat results for casual progression history
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0011-password-auth-before-google-sso
governs: supabase/migrations/*, supabase/functions/record_hotseat_match/*, supabase/functions/account_summary/*, client/src/client/*, client/src/main.ts
---

# ADR-0012 — Allow client-attested hot-seat results for casual progression history

## Status
Accepted

## Context
The user-approved persistent-player direction now needs ordinary hot-seat matches to contribute to the same durable progression summary as network matches. Hot-seat physics and outcomes exist only in one browser; independently proving them would require uploading and replaying a second complete action-log protocol or introducing a server simulation path. ADR-0011 correctly forbids trusting browser-owned progression totals, but its unconditional ban on any client-reported progress input prevents a bounded casual-history result from being recorded.

The user gave standing explicit approval to the bounded `persistent-hotseat-progression` specification and plan, including their client-attested trust ceiling. This ADR records that already-approved choice; it is not inferred from the later review finding.

## Decision
Allow an authenticated browser to submit one client-attested hot-seat match outcome as `{matchId, won}` for casual history only. Supabase Auth derives the account id, the UUID is canonicalized and idempotent per account, and the server stores only the immutable outcome before deriving XP and level with the fixed version-one formula. Request-owned user ids, XP, levels, cumulative totals, rewards, ranks, and entitlements remain forbidden.

This decision partially supersedes only ADR-0011's blanket prohibition on client-reported progress input. ADR-0011's password-Auth choice, server-verifiable user identity, RLS requirements, no-secret posture, and prohibition on browser-owned progression totals remain accepted and in force. Client-attested hot-seat results MUST NOT grant gameplay power, scarce rewards, ranks, entitlements, or anti-cheat claims.

## Alternatives considered
- **Upload and replay the complete hot-seat action log** — stronger evidence, but disproportionate because it creates a second persistence protocol and still requires a trusted simulation runtime outside the existing browser path.
- **Store XP only in the browser** — rejected because it is not durable across devices and would split account progression between competing authorities.
- **Exclude hot-seat matches from progression** — rejected because it preserves the player-visible defect that motivated the approved persistent-player slice.

## Consequences
Signed-in hot-seat Player 1 can accumulate durable matches, wins, XP, and levels without changing deterministic gameplay or anonymous play. The server continues to own identity, persistence, arithmetic, and access control, but it does not claim the local outcome is competitively verified. Review and tests must preserve exact-body validation, Auth-derived identity, canonical idempotency, immutable storage, bounded arithmetic, and the non-entitlement ceiling.

## Risks
A modified browser can mint additional UUIDs or lie about `won`, so these totals are not suitable for competitive standing or valuable unlocks. The decision is proven wrong if progression begins granting gameplay advantage, scarce value, rank, entitlement, or anti-cheat trust; that expansion requires server-verifiable evidence and a new ADR before implementation.

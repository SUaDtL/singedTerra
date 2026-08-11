# Commander Career Loop Initiative

**Status:** approved under the standing continuous-improvement goal
**Date:** 2026-08-10
**Initiative:** `career.initiative.0001`
**Decision basis:** adversarial player-experience audit findings on weak progression payoff, shallow tactical onboarding, and the absence of a concrete reason to return

## Player outcome

Turn the existing trusted XP counter into a coherent career: a signed-in player earns a recognizable artillery rank, understands exactly what identity comes next, receives a real promotion moment after the match that earns it, and is led into a concrete tactical objective for the next deployment.

The initiative remains active across mergeable slices until the full player outcome is production-verified. A slice is a safety and review boundary, not a declaration that the larger retention problem is solved.

## Problem

singedTerra now records hot-seat matches and exposes server-derived XP and levels, but the player receives little more than arithmetic. Level numbers do not currently change how the player is recognized, a level-up is formatted like any other match, and the next action is generally another unconstrained duel. The system proves persistence without yet creating aspiration, mastery, or a memorable return loop.

## SMARTS decision

Three routes were compared:

1. Lock existing tanks or weapons behind levels. This creates obvious stakes but takes choices away from established players, complicates balance, and introduces entitlement integrity requirements. Rejected.
2. Add isolated cosmetic copy to the current XP meter. This is cheap but would preserve the same shallow loop and optimize for shipment size rather than player outcome. Rejected.
3. Build an additive Commander Career Loop in milestones: derive visible rank and insignia from the existing trusted level, celebrate promotions from validated before/after summaries, then add tactical career objectives that teach mastery and make the next deployment purposeful. Selected.

Route 3 is specific to the retention findings; measurable through recognition, promotion, objective, and return-path acceptance tests; achievable through reviewable vertical slices; relevant to persistent-player value; time-bounded per milestone while retaining initiative continuity; reliable because rank derives from validated progression; maintainable through one domain model; testable at model, composition, DOM, and browser layers; available without taking existing content away; and scalable toward later server-backed objectives if a separately approved integrity design is warranted.

## Initiative milestones

### Milestone 1 — Career identity and promotion

- Define a deterministic, client-side presentation model that maps validated progression levels to named artillery ranks and insignia.
- Show current rank and the next rank milestone in the collapsed Commander Dossier and full Player Record.
- Extend the trusted hot-seat progression receipt with the validated prior and current summaries so the After Action Report can distinguish ordinary progress from a promotion.
- Give promotions authored hierarchy and language while preserving the existing modal actions, focus behavior, and server-owned XP truth.

### Milestone 2 — Tactical career objectives

- Present one concrete objective before deployment that teaches a real tactic rather than only repeating control bindings.
- Evaluate that objective from deterministic match evidence, with explicit success/failure feedback in the After Action Report.
- Make the next objective visible from the career surface so “play again” has a named purpose.

### Milestone 3 — Return-loop cohesion

- Connect dossier, deployment brief, in-match feedback, and after-action report into one continuous career narrative.
- Verify the complete loop on desktop, compact, touch, anonymous, signed-in, win, loss, promotion, and non-promotion paths.
- Decide through SMARTS and the relevant hard gate whether objective history needs server persistence. No auth, schema, or migration work is implied by approval of the client-only milestones.

## Milestone 1 acceptance criteria

1. Every valid progression level maps to one stable rank identity; malformed or unavailable summaries never produce a rank claim.
2. The collapsed Commander Dossier and open Player Record show the same current rank and next rank milestone from the same validated account summary.
3. Existing Garage kits, weapons, worlds, and game modes remain available. Rank is additive recognition, not an entitlement gate or gameplay advantage.
4. An accepted signed-in hot-seat result returns a trusted receipt containing both the prior and refreshed summaries only when the expected XP delta is exact.
5. Crossing a rank threshold produces a promotion treatment in the already-open After Action Report that names the earned rank and next rank. Ordinary progress retains concise XP and next-milestone feedback.
6. Failed, duplicate, stale, anonymous, AI-owned, network, and E2E-fixture result paths make no promotion claim.
7. Rank and promotion content is accessible, contained, and legible in desktop-fine, compact mouse, and touch layouts without adding an action to the victory focus loop.
8. Causal RED tests, adversarial mutations, full local verification, exact-package review, exact-head hosted CI, merge, deployment, and production provenance clear before the milestone ships.

## Milestone 1 boundaries

Client progression presentation, the existing trusted hot-seat summary handoff, Commander Dossier/Player Record presentation, After Action Report presentation, tests, and initiative evidence. No progression formula, backend contract, Auth behavior, database, migration, dependency, deterministic engine, network action, economy, content lock, or gameplay-balance change.

## Reopen triggers

- Persisting objective selection or completion requires result-integrity design and the relevant auth/schema/migration hard gate.
- Any gameplay reward or unlock requires a separate entitlement and balance decision; rank presentation alone does not authorize it.
- Network-match progression requires separately scoped authoritative match linkage.

## Governance note

The malformed legacy `.codearbiter/sprint-log.md` remains byte-preserved and unread. SMARTS decisions, RED/GREEN evidence, mutations, review findings, and verification are persisted in this initiative spec, its milestone plans, and exact review packages.

## Security correction - verified progression before ranks

The Milestone 1 review correctly found that ADR-0012 forbids client-attested casual history from granting ranks. The user selected independently verified progression instead of removing the career direction. ADR-0013 and ADR-0014 therefore supersede the conflicting two-context and no-Edge-physics clauses only for a bounded, completion-time verifier.

Milestone 1 rank presentation remains frozen and MUST NOT ship against casual XP. Before it can resume, the initiative must prove that the existing shared engine can be imported into the Deno Edge toolchain and can replay bounded canonical transcripts without a duplicate physics implementation. Product implementation then separates casual history from verified XP; only verified XP can produce rank identity or promotion claims.

Ordinary hot-seat remains available offline and casual. Rank-eligible Verified Deployment requires an authenticated, connected session whose seed, options, ruleset version, engine version, expiry, and transcript bounds are server-owned. The client submits actions, not outcomes. The verifier derives the terminal result and awards progression idempotently. This verifies that the transcript produces the result, not that a human played unaided.

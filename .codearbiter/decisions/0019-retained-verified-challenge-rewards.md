---
status: proposed
date: 2026-09-13
title: Retain verified challenge contracts and first-clear career rewards
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0013-verification-only-third-engine-context
governs: shared/src/verified/**, shared/src/net/verifiedChallenge*, shared/src/engine/**, supabase/functions/*verified*, supabase/functions/_shared/verification*, supabase/migrations/*verified_challenge*, client/src/client/VerifiedChallenge*
---

# ADR-0019 - Retain verified challenge contracts and first-clear career rewards

## Status
Proposed

The owner selected a Crosswind Qualification medal plus 200 first-clear verified-career XP and instructed continued campaign implementation. This record captures the independently reviewed implementation design. It does not claim an accepted ADR lifecycle binding or authorize backend deployment.

## Context
Public Quick Operations and ST1 links remain practice. Rewarded qualification requires a separately admitted fixed trial, reproducible server verification and a permanent entitlement across technical editions. Existing verified-deployment receipts and replay-only progression remain valid.

## Decision
Keep one authored deterministic physics implementation. Generate and retain a self-contained immutable cq1 artifact from its complete reviewed runtime closure, including CPU policy, objective, configuration and work meter. Browser challenge play and verification use that same artifact. Normal builds verify without regenerating it. This refines only ADR-0013's source/version binding; its verification-only third context, browser gameplay ownership and prohibition on separately authored physics remain in force.

Use the reviewed P10 descriptor and objective: seed 42, one wraparound round, Baby Missile only, at most three accepted human salvos, and a clear only when a fully settled human salvo damages the CPU. Success precedes simultaneous terminal death; CPU-caused terminal outcomes cannot qualify. Descriptor, objective, artifact, CPU, reward, entitlement, session and career projection have distinct identities.

Atomically retain an immutable receipt and one medal plus 200 XP for the first clear per account and stable entitlement. Repeats award zero. A separate versioned Verified Career projection adds challenge awards to existing verified-replay XP under consistent account serialization. Preserve casual totals, old APIs, match counts, formulas and historical receipts.

Meter dominant computation before work, including clones, probes, collision and terrain loops. Derive and validate exact caps before freezing cq1; preserve unmetered simulation semantics and legacy/ST1 parity. The owner selected Supabase-native synchronous execution: one account fence covers challenge completion, deployment completion and the authenticated replay probe; results taking1000ms or more cannot finalize. The write fence lasts ten seconds, while an uncertain unreturned invocation blocks new account computation for410seconds. Exact cleanup after synchronous return/throw can release that cooldown. At most three challenge computations are persistent. This is result acceptance and operational cooldown, not forced termination or strict CPU exclusion. Probe mutations remain non-awarding. New challenge transport limits fail closed at30/IP/minute and10/account/minute.

Use built-in SHA-256 for build/source provenance within existing security controls only. Add schema and handlers with challenge admission disabled. Enable only after separately approved exact backend rollout proves hosted deadline refusal, cooldown/fencing, capacity and legacy compatibility. Disable/drain preserves admitted descriptors, retained artifacts, receipts and awards.

## Alternatives considered
- Practice-only rewards do not meet the selected server-verified career outcome.
- Mutable current-source aliases cannot preserve old admitted contracts after semantic changes.
- Separately authored verifier physics would drift from gameplay.
- Timeout races without termination and fencing cannot bound active computation or stale writes.

## Consequences
Retained generated artifacts, append-only reward storage, a versioned career projection and coordinated workload ownership become required. Independent compatibility review and real local transaction/browser evidence precede delivery. Hosted enablement remains a distinct gate.

## Risks
Edge isolation or capacity may be insufficient. Instrumentation or closure generation may alter legacy determinism. Resolve these failures before enablement; do not relax caps or rewrite evidence. Valid replay proves a deterministic result, not human effort or resistance to account farming.

# Decision log

Append-only SMARTS decision log (`${CLAUDE_PLUGIN_ROOT}/includes/smarts/decision-log-format.md`).
Never edit a prior entry; supersede by appending a new one whose `Supersedes:` names it.

---

## DECISION-0001 — ADR-0001 — One physics codebase, two execution contexts

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (retroactive formalization under standing full-auto-approval)
**Decision category:** architecture / determinism
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** invariant lived only in CLAUDE.md / CONTEXT.md, not as a tracked ADR.
- **Scaffold position:** scaffold-silent (no decisions/ directory existed).
- **Status type:** artifact-silent

### Decision
All game logic lives in `shared/` and runs either in-browser (HotSeatClient) or as each networked
client's own engine (NetworkClient) — same code — with `GameClient` hiding the difference. Recorded as ADR-0001.

### SMARTS rationale
Single-source-of-truth (no drift) and clean dependency direction outweigh the convenience of separate
engines; this is the precondition for deterministic lockstep.

### Implementation implication
Governs `shared/**` and `client/src/client/**`; no `shared/` → `client/` imports.

---

## DECISION-0002 — ADR-0002 — Deterministic lockstep networking

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (retroactive formalization)
**Decision category:** architecture / netcode
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** documented in CLAUDE.md; not a tracked ADR.
- **Scaffold position:** scaffold-silent.
- **Status type:** artifact-silent

### Decision
Networked canonical state is seed + the ordered action log; clients replay it; GameState is never
shipped; Edge Functions are thin referees. Recorded as ADR-0002.

### SMARTS rationale
Cost and simplicity (no server simulation, no snapshots), free reconnect/spectating, at the price of a
hard determinism requirement (ADR-0003).

### Implementation implication
Governs `supabase/functions/submit_action/**`, `client/src/client/**`, `shared/src/net/**`.

---

## DECISION-0003 — ADR-0003 — Seeded PRNG and fixed timestep for determinism

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (retroactive formalization)
**Decision category:** architecture / determinism
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** documented in CLAUDE.md "Determinism is a hard requirement"; not a tracked ADR.
- **Scaffold position:** scaffold-silent.
- **Status type:** artifact-silent

### Decision
Fixed 16ms timestep + seeded mulberry32 PRNG; no wall-clock/Math.random in the engine; seeds fed as
inputs. Recorded as ADR-0003.

### SMARTS rationale
The only way to make ADR-0002 sound; verified by the determinism harnesses.

### Implementation implication
Governs `shared/src/engine/Physics.ts`, `Random.ts`, `Terrain.ts`.

---

## DECISION-0004 — ADR-0004 — HUD as HTML/CSS overlay

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (retroactive formalization)
**Decision category:** architecture / rendering
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** documented in CLAUDE.md rendering notes; not a tracked ADR.
- **Scaffold position:** scaffold-silent.
- **Status type:** artifact-silent

### Decision
HUD is DOM overlaid on the canvas (HUDRenderer is a no-op; ui/HUD.ts is DOM). Recorded as ADR-0004.

### SMARTS rationale
Avoids canvas coordinate math and gets CSS styling for free; canvas stays purely the game world.

### Implementation implication
Governs `client/src/ui/HUD.ts`, `client/src/renderer/HUDRenderer.ts`.

---

## DECISION-0005 — ADR-0005 — Thin Edge Function referees

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (retroactive formalization)
**Decision category:** architecture / netcode
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** documented in CLAUDE.md layering; not a tracked ADR.
- **Scaffold position:** scaffold-silent.
- **Status type:** artifact-silent

### Decision
Edge Functions validate/authorize/allocate seq, never run physics, never import `shared/`. Recorded as ADR-0005.

### SMARTS rationale
Keeps one physics codebase and a minimal trusted server surface; accepted NetworkAction type
duplication to keep the Deno runtime independent.

### Implementation implication
Governs `supabase/functions/**`.

---

## DECISION-0006 — ADR-0006 — No end-user auth, ephemeral identity, trust-client

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (formalizes the strategic-direction decision)
**Decision category:** security / identity
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** strategic-direction ladder in CONTEXT.md (ephemeral-identity-now); not a tracked ADR.
- **Scaffold position:** scaffold-silent.
- **Status type:** artifact-silent

### Decision
No auth/JWT; identity is a server-minted random UUID in the request body; RLS + service-role referees
are the load-bearing write control. Recorded as ADR-0006.

### SMARTS rationale
Zero-friction casual game with no PII; accepted Spoofing consequence is bounded by the turn-gate +
seq-unique + bot-only-proxy (see the public threat model).

### Implementation implication
Governs `supabase/functions/**`, `supabase/migrations/**`. Revisit (supersede) if stakes rise.

---

## DECISION-0007 — ADR-0007 — Per-IP rate limiting via a Postgres counter table

**Date:** 2026-06-21
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <brennonhuff@gmail.com> (chosen at the public-hardening sprint gate)
**Decision category:** security / availability
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** open fork CONFIRM-04 (rate-limiting posture unaccounted).
- **Scaffold position:** security-controls.md was silent on abuse-volume controls.
- **Status type:** open-decision-closure

### Decision
A per-IP fixed-window limiter backed by a service-role-only `rate_limits` table + `bump_rate_limit`
RPC (migration 005), enforced in `withCors()` across all 10 functions; fails open. Recorded as ADR-0007.

### SMARTS rationale
Postgres counter beats in-memory per-isolate (which leaks across edge instances) and an external store
(extra dependency/secret, against stay-Supabase); extends the existing service-role-only-writes model.

### Implementation implication
Governs `supabase/functions/_shared/mod.ts`, `supabase/migrations/005_rate_limits.sql`. Resolves CONFIRM-04.

---

## DECISION-0008 — ADR-0008 — Referee turn-authority (thin trust-client cursor)

**Date:** 2026-06-25
**Status:** accepted
**Supersedes:** none (refines the risk note of ADR-0005; elaborates ADR-0006's trust-client posture)
**Decided by:** SUaDtL <brennonhuff@gmail.com> (chosen at the 2026-06-25 deep-review decision gate)
**Decision category:** architecture / netcode / security
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** the residual was an incidental, only-bounds-checked trust noted in passing in ADR-0005's Risks; surfaced as decision-required by the 2026-06-25 review (finding `referee-cursor-trust`, GH #55).
- **Scaffold position:** no ADR analyzed the turn-authority gap explicitly.
- **Status type:** open-decision-closure

### Decision
Keep the thin, trust-client referee (do NOT make it server-authoritative); turn-order authority stays
with the clients' identical engines per ADR-0002. Accept the residual semantic-trust under ADR-0006,
and make it observable via a structured "Not your turn" desync log in `submit_action` (server) +
`NetworkClient` (client). Recorded as ADR-0008.

### SMARTS rationale
An authoritative-replay referee would reverse ADR-0002/0005 and couple two runtimes for a casual,
no-PII game; the residual is bounded to the caller's own room within ADR-0006's accepted posture.
Observability now > silent stalls; escalation paths (state-hash checkpoint, then authoritative replay)
are recorded with explicit revisit triggers.

### Implementation implication
Governs `supabase/functions/submit_action/**`. Resolves GH #55. Revisit (supersede) on recurring desync
reports (→ state-hash checkpoint) or rising stakes (→ authoritative replay).

---

## DECISION-0009 — Guard determinism-duplication points with mirrored constants + CI parity checks

**Date:** 2026-07-01
**Status:** accepted
**Supersedes:** none (operationalizes ADR-0001/0002/0005 — single physics codebase, thin referee that can't import shared/)
**Decided by:** SUaDtL <brennonhuff@gmail.com> (chosen while implementing the 2026-06-25 review fixes, GH #60)
**Decision category:** architecture / determinism
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** determinism-critical values (GRAVITY 0.15, MAX_WIND 10, the `AccessoryType` set) were hand-copied as bare literals across the client + edge functions, and `GameEngine.clone()` hand-enumerated 24 fields — drift hazards flagged by the review (architecture-001/004/005).
- **Scaffold position:** no guard existed against a copy silently diverging from its shared/ source.
- **Status type:** open-decision-closure

### Decision
Because the Deno referee must not import `shared/` (ADR-0005), determinism-relevant values it needs are
**mirrored once** in `supabase/functions/_shared/mod.ts` (`DEFAULT_GRAVITY`, `DEFAULT_MAX_WIND`,
`ACCESSORY_TYPES`) with MUST-match comments, and every functional site references the single mirror
instead of a bare literal; the client references the canonical `GRAVITY`/`MAX_WIND` imports directly
(no literals). The residual "did a mirror/clone drift?" risk is caught in CI rather than by discipline:
`engine_clone_parity.mjs` fails the build if `clone()` drops a field, and the referee weapon/accessory
allowlists are exercised by the deno tests. Chosen over (a) importing `shared/` into Deno — forbidden by
ADR-0005 — and (b) leaving the literals with only review discipline — the status quo that drifted.

### SMARTS rationale
Single-source-where-possible + a mechanical CI tripwire where a boundary forces duplication beats relying
on reviewers to spot a literal that silently desyncs hot-seat vs networked play; the mirror stays small and
its divergence now fails the build instead of a match.

### Implementation implication
Governs `supabase/functions/_shared/mod.ts`, `supabase/functions/{create_room,restart_game,submit_action}/**`,
`client/src/client/NetworkClient.ts`, `shared/src/engine/GameEngine.ts`, `scripts/checks/engine_clone_parity.mjs`.
Resolves GH #60.

---

## DECISION-0010 — ADR-0009 — Split public seat-id from secret seat-token (authenticated actions)

**Date:** 2026-07-03
**Status:** accepted
**Supersedes:** DECISION-0008
**Decided by:** SUaDtL <brennonhuff@gmail.com>
**Decision category:** security / identity
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0006 accepted turn-action spoofing as a conscious trade-off (playerId public).
- **Scaffold position:** tribunal finding appsec-001 (#83) surfaced a broader exposure than 0006 weighed (non-turn-gated functions authorized by the same readable id).
- **Status type:** open-decision-closure

### Decision
Move up the seriousness ladder now: split identity into a public seat-id (unchanged, deterministic log key) and a secret per-seat token stored in a service-role-only `room_seats` table, verified by every mutating referee. Client persists the token in localStorage (also unblocks #46). Supersedes ADR-0006's accepted-spoofing stance; 0006's no-accounts posture otherwise stands.

### SMARTS rationale
Correctness/security (the documented anti-impersonation control did not hold) and the broader-than-accepted blast radius (rename/eject/record-winner as any player, no turn gate) outweigh the friction of threading a token; a VIEW is ruled out because Realtime broadcasts the base row. The seat-token is the minimal authenticated-actions step ADR-0006 itself named as its successor.

### Implementation implication
New migration (`room_seats` + RLS), shared `verifySeatToken()`, token threaded through the 6 mutating Edge Functions + create/join minting, client transport + localStorage. Recorded as ADR-0009 (proposed). GH #83.
---

## DECISION-0011 — ADR-0010 — Move waiting-room seat-token lifecycle into LobbySession

**Date:** 2026-07-25
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly approved issue #128 spec and plan on 2026-07-22)
**Decision category:** architecture / security / client lifecycle
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0009 defined the seat-token boundary but its governed client paths did not include the new lifecycle owner.
- **Scaffold position:** The approved issue #128 spec moves in-memory credential and asynchronous resource ownership from `Lobby` to `LobbySession`.
- **Status type:** artifact-silent

### Decision
`LobbySession` owns the in-memory waiting snapshot, seat token, waiting-room resources, and exact credential-bearing action delegation. `Lobby` retains UI policy and existing persistence; `LobbyTransport` retains the wire contract. The token model, storage key, request bodies, and exposure rules remain unchanged.

### SMARTS rationale
+ Maintainable and Testable dominate: one DOM-free owner isolates credential/resource lifetime and supports deterministic race tests.
+ Reliable improves through generation-bound operations and callbacks; Securable preserves ADR-0009 with no new secret channel.
+ Scalable and Available are indifferent at the current single-client-session scope.
+
+Recommendation strength: strong.

### Implementation implication
ADR-0010 governs `LobbySession.ts`, `LobbyTransport.ts`, and `Lobby.ts`; reviews must enforce token non-exposure, lazy loading, exact request bodies, and stale-operation isolation.

---

## DECISION-0012 — ADR-0010 — Canonical LobbySession seat-token lifecycle record

**Date:** 2026-07-25
**Status:** accepted
**Supersedes:** DECISION-0011
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly approved issue #128 spec and plan on 2026-07-22)
**Decision category:** architecture / security / client lifecycle
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0009 defined the seat-token boundary but its governed client paths did not include the new lifecycle owner.
- **Scaffold position:** The approved issue #128 spec moves in-memory credential and asynchronous resource ownership from `Lobby` to `LobbySession`.
- **Status type:** artifact-silent

### Decision
`LobbySession` owns the in-memory waiting snapshot, seat token, waiting-room resources, and exact credential-bearing action delegation. `Lobby` retains UI policy and existing persistence; `LobbyTransport` retains the wire contract. The token model, storage key, request bodies, and exposure rules remain unchanged.

### SMARTS rationale
Maintainable and Testable dominate because one DOM-free owner isolates credential and resource lifetime and supports deterministic race tests. Reliable improves through generation-bound operations and callbacks. Securable preserves ADR-0009 with no new secret channel. Scalable and Available are indifferent at the current single-client-session scope. Recommendation strength: strong.

### Implementation implication
ADR-0010 governs `LobbySession.ts`, `LobbyTransport.ts`, and `Lobby.ts`; reviews must enforce token non-exposure, lazy loading, exact request bodies, and stale-operation isolation.
---

## DECISION-0013 — ADR-0010 — Correct the persisted seat-token key to public playerId

**Date:** 2026-07-25
**Status:** accepted
**Supersedes:** DECISION-0012
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly approved issue #128 spec and plan on 2026-07-22)
**Decision category:** architecture / security / client lifecycle
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0009's prose says the seat token is persisted under a room-id key.
- **Scaffold position:** The accepted implementation and approved issue #128 spec persist the token under a public-playerId key so rematches retain the credential.
- **Status type:** same-level-conflict-resolution

### Decision
`LobbySession` owns the in-memory waiting snapshot and seat-token lifecycle while `Lobby` retains the existing persistence boundary. The persisted token key is the public `playerId`, not the room id; this corrects ADR-0009's documentation without changing runtime behavior. Request bodies, authorization, and secret-exposure rules remain unchanged.

### SMARTS rationale
Reliable and Securable require the governing record to match the implemented credential lifetime across rematches. Maintainable and Testable favor one explicit correction in the new forward-only ADR rather than editing ADR-0009 or leaving contradictory authority. The choice was already explicit in the user-approved issue #128 spec, so no new security policy is inferred. Recommendation strength: strong.

### Implementation implication
ADR-0010 explicitly corrects ADR-0009's storage-key sentence and governs the new `LobbySession` owner. Reviews enforce `playerId`-keyed localStorage, exact seat credentials, generation-bound async work, and no token exposure through Realtime, URLs, or logs.
## DECISION-0014 � ADR-0011 � Use password-based Supabase Auth before adding Google SSO

**Date:** 2026-08-04
**Status:** accepted
**Supersedes:** DECISION-0006
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly agreed to password auth now and Google SSO later)
**Decision category:** security / identity / persistence
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0006 and security-controls.md define a no-account, ephemeral-identity product posture.
- **Scaffold position:** The user has raised the product's stakes and explicitly prioritized persistent players and progression without paid email delivery.
- **Status type:** divergent

### Decision
Use Supabase Auth email/password accounts as the first durable identity foundation, with signups enabled and email confirmation disabled initially. Keep per-room seat tokens for room and action authorization, protect durable profile/progression records with authenticated server boundaries and RLS, and defer Google SSO plus password-reset email delivery to later slices.

### SMARTS rationale
Securable and Reliable require a stable server-verifiable user id before progression can be trusted. Maintainable and Testable favor Supabase Auth's existing JWT/session boundary over custom credentials, while Available and Scalable favor retaining the existing seat-token room flow during migration. Email/password without confirmation is the only current option that meets the explicit zero-email-delivery and zero-spend constraints; Google SSO remains the preferred later onboarding extension. Recommendation strength: strong.

### Implementation implication
ADR-0011 governs Supabase auth configuration, identity migrations/functions, and client account/session integration. The next bounded slice establishes account identity and profile ownership only; progression rules and Google OAuth remain separate follow-on slices.

---

## DECISION-0015 - ADR-0012 - Allow client-attested hot-seat results for casual progression history

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** DECISION-0014
**Decided by:** SUaDtL (standing explicit approval of the bounded persistent-hotseat-progression spec and plan)
**Decision category:** architecture / security / progression
**Artifact-section-hash:** 423c5c26ec3b6292ab42ca1fcf3db4fcbd4d845a22cbdb7fcd9dd3968ee24903

### Variance summary
- **Artifact position:** ADR-0011 forbids trusting any client-reported progress as an account write.
- **Scaffold position:** The user-approved persistent-hotseat-progression spec permits one Auth-owned, client-attested local outcome under a strict casual-history trust ceiling.
- **Status type:** same-level-conflict-resolution

### Decision
Allow an authenticated browser to submit one immutable and idempotent `{matchId, won}` hot-seat result for casual progression history. The server still derives user identity, exact counts, XP, and level; client-supplied totals and every gameplay, reward, rank, entitlement, or anti-cheat consequence remain forbidden. This supersedes only ADR-0011's blanket client-input prohibition and leaves its Auth, RLS, secret, and server-owned-total controls in force.

### SMARTS rationale
Reliable and Available favor durable credit for ordinary local matches instead of silently excluding the primary offline mode. Securable bounds the weaker evidence to a validated account, immutable result shape, canonical idempotency, owner-private storage, fixed arithmetic, and a non-entitlement ceiling. Maintainable and Testable favor one additive table and thin referee over a second action-log upload/replay architecture, while Scalable remains bounded by count-only queries and rate limiting. Recommendation strength: strong.

### Implementation implication
ADR-0012 governs migration 015, `record_hotseat_match`, hot-seat aggregation in `account_summary`, and the client terminal reporter. Security controls and mutation-resistant tests must state and enforce the narrow exception without weakening the ban on browser-owned identity, totals, benefits, or secrets.

---

## DECISION-0016 — ADR-0013 — Add a verification-only third engine context

**Date:** 2026-08-10
**Status:** accepted
**Supersedes:** DECISION-0001
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly accepted the recommended completion-time deterministic replay design)
**Decision category:** architecture / security / determinism
**Artifact-section-hash:** c0cd1e71ad75b8563bfbc615036777a69aff8e08b33520789a12d49013bc91ac

### Variance summary
- **Artifact position:** ADR-0001 requires the shared engine to run in exactly two browser contexts.
- **Scaffold position:** Independently verified progression requires one bounded server replay context while preserving one physics source.
- **Status type:** divergent

### Decision
Permit the existing shared engine to run in a third, verification-only Supabase Edge context for bounded post-match replay. Live hot-seat and deterministic-lockstep network play remain browser-executed. A feasibility proof must establish Deno bundling and worst-case replay bounds before product implementation proceeds; failure must not be worked around with a duplicate engine.

### SMARTS rationale
Reliable and Testable require the server to reproduce the result from canonical inputs. Securable requires evidence stronger than the client-attested ceiling in ADR-0012. Maintainable favors one engine source over a second verifier implementation. Available avoids adding a per-turn network dependency, and Scalable is protected by bounded completion-time replay. Recommendation strength: strong.

### Implementation implication
ADR-0013 governs Deno compatibility of `shared/`, the isolated verifier import boundary, engine-version selection, and the mandatory feasibility proof. It resolves the conflict between ADR-0001's exact two-context invariant and the approved verified-progression outcome.

---

## DECISION-0017 — ADR-0014 — Verify completed matches by bounded deterministic replay

**Date:** 2026-08-10
**Status:** accepted
**Supersedes:** DECISION-0005
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly accepted the recommended completion-time deterministic replay design)
**Decision category:** architecture / security / progression
**Artifact-section-hash:** 732d4a165aee2e8d77b6339922a90d80dddc6ec2fe7d2bb27899c76c39261b97

### Variance summary
- **Artifact position:** ADR-0005 prohibits Edge Functions from importing or running the shared engine.
- **Scaffold position:** Rank-eligible hot-seat needs an isolated server verifier that derives outcomes rather than trusting them.
- **Status type:** divergent

### Decision
Keep live network referees thin, but add an Auth-owned Verified Deployment lifecycle whose completion endpoint replays a bounded canonical transcript with the session's server-owned deterministic contract. The server derives the result and atomically records verified progression. Only verified XP may drive ranks; ordinary offline hot-seat remains casual under ADR-0012.

### SMARTS rationale
Securable and Reliable dominate because rank evidence must be independently derived and idempotently awarded. Available preserves offline casual play and avoids per-action round trips. Maintainable and Testable favor a start/transcript/complete boundary with explicit versions and failure modes. Scalable requires TTLs, action caps, rate limits, and one active session per account. Recommendation strength: strong.

### Implementation implication
ADR-0014 governs additive verification sessions, start and complete endpoints, transcript validation, transactional progression writes, and the separation of verified XP from casual history. Verification proves a valid transcript's outcome, not human or unaided play.

---

## DECISION-0018 - ADR-0015 - Stage hosted replay verification without awarding progression

**Date:** 2026-08-10
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly approved the ADR route for the hosted non-awarding replay probe)
**Decision category:** architecture / security / progression
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** ADR-0014 defines the complete hosted verification and award lifecycle but does not require runtime feasibility and durable rewards to ship in one milestone.
- **Scaffold position:** The approved next slice first proves authenticated replay in the hosted Supabase runtime without writes, awards, ranks, or entitlements.
- **Status type:** open-decision-closure

### Decision
Stage the hosted replay capability as an authenticated, bounded, non-awarding Edge probe. It may derive and return a terminal outcome with bounded diagnostics, but it cannot mutate durable state or influence progression. Verified result storage and server-derived awards remain a later milestone after this probe is reviewed and proven in production.

### SMARTS rationale
Securable and Reliable favor proving the production runtime, authentication boundary, and resource limits before introducing durable rewards. Testable and Maintainable favor reusing the strict shared replay adapter behind a narrow endpoint with explicit non-mutation tests. Available and Scalable favor a bounded completion-time request with existing abuse controls rather than per-turn server execution. Recommendation strength: strong.

### Implementation implication
ADR-0015 governs the hosted probe function, replay import boundary, request limits, tests, deployment verification, and its explicit no-write contract. A later bounded decision and slice will own verification sessions, immutable results, transactional progression, and rank eligibility.

---

---

## CORRECTION-0018 - ADR-0015 lifecycle status

**Date:** 2026-08-10
**Type:** audit correction
**Corrects:** DECISION-0018 status metadata only

DECISION-0018 incorrectly recorded ADR-0015 as accepted. SUaDtL explicitly approved the sanctioned ADR route and this bounded non-awarding implementation, but did not explicitly advance the ADR lifecycle. The canonical ADR frontmatter and Status section remain proposed. This correction does not withdraw the authorized feasibility slice or alter its no-write boundary; it removes the contradictory acceptance claim from the effective audit record.
## DECISION-0019 - ADR-0016 - Provide an allowlisted authenticated production diagnostics console

**Date:** 2026-08-11
**Status:** accepted
**Supersedes:** none
**Decided by:** SUaDtL <SUaDtL@users.noreply.github.com> (explicitly chose the durable testing interface over a one-use console command)
**Decision category:** architecture / security / production verification
**Artifact-section-hash:** n/a

### Variance summary
- **Artifact position:** The hosted replay probe required authenticated production proof but deliberately added no player-facing client surface.
- **Scaffold position:** The maintainer requires repeatable authenticated production checks without credential extraction and expects more checks later.
- **Status type:** open-decision-closure

### Decision
Add a URL-activated client diagnostics console that uses the existing browser-managed Supabase session. Checks are compile-time allowlisted, body and header shapes are fixed, responses are strictly validated, and receipts are secret-free. The console is not ordinary player navigation and cannot become a generic request runner.

### SMARTS rationale
Securable rejects browser-storage extraction and arbitrary request composition. Reliable and Testable favor one repeatable application path with exact schemas, timeouts, stale-run isolation, and browser automation. Maintainable and Scalable favor a small registry that can add reviewed checks without redesign. Available improves because production verification no longer depends on the maintainer manually handling a credential.

### Implementation implication
ADR-0016 governs the diagnostics runner, modal view, lobby activation seam, Auth-state handoff, security documentation, and browser production proof. Future checks must extend the allowlist and clear the same security and review gates.

---

## CORRECTION-0019 - DECISION-0019 append formatting

**Date:** 2026-08-11
**Type:** audit formatting correction
**Corrects:** DECISION-0019 record separation only

DECISION-0019 was appended without a separating blank line or terminal newline. Its text and semantics remain authoritative and unchanged; this append-only correction records the formatting defect without rewriting audit history.

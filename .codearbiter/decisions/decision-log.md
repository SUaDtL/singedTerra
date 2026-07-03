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

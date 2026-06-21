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

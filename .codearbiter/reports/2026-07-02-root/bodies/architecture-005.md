# Decompose GameEngine.tick() — a ~230-LOC method in the determinism-critical core

**Severity:** medium  |  **Confidence:** 0.7  |  **Effort:** M

**Where:**
- shared/src/engine/GameEngine.ts:712-942

**Evidence:** GameEngine.tick() runs ~230 LOC (L712 to the next method splitAirburst at L943), branching across every phase of the fixed-timestep loop: projectile integration, terrain/tank collision, airburst splitting, detonation dispatch, settle animation, fire spread, resolve, and turn advance. It sits in the file the coding-standards flag as the hard-determinism core (high churn).

**Impact:** The single method is the highest-consequence code in the repo (a divergence here desyncs all networked clients) yet is the hardest to reason about branch-by-branch; every added weapon/phase interaction grows the same function, and per-branch determinism cannot be asserted in isolation by the harnesses.

**Recommendation:** Extract the per-phase sub-steps (integrate, collide, detonate-dispatch, settle-step, fire-step) into named private methods that tick() sequences, so each is independently harness-testable for tick-count determinism. Behavior-preserving refactor only — no logic change.

**Acceptance criteria:**
- tick() delegates to named per-phase methods and drops well below god-method size
- determinism harnesses still pass unchanged after the extraction

<!-- dedup_key: architecture:shared/src/engine/GameEngine.ts:tick-monolithic-method · finding: architecture-005 -->

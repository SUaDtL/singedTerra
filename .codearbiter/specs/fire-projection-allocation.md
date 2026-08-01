# Sprint spec: Fire Projection Allocation

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Issue #68 reports that `GameEngine.syncFire()` rebuilds and sorts a new public `state.fire` array on every burning tick even when the fire topology is unchanged and only cell life decrements. A deterministic napalm shot currently contains 55 such decay-only ticks, creating avoidable garbage in the fixed-step engine and renderer path.

The issue's remaining explosion/scorch gradient-caching premise is obsolete. Current explosion radius and gradient alpha change during a burst, scorch gradient alpha changes during fade, and both render inside changing world transforms. Reusing their coordinate-bound `CanvasGradient` objects would not be behavior-preserving.

## SMARTS decision

Optimize only the evidenced fire projection. Reuse the existing sorted projection when it still represents the same column set; update its scalar `life` values in place. Rebuild and sort when ignition, spread, expiry, or another topology change alters that set.

| Lens | Projection reuse | Gradient caching | Leave issue unchanged |
|---|---|---|---|
| Scalable | Strong: removes repeated array/sort work as fire width grows. | Weak: cached coordinate-bound gradients do not track current transforms safely. | Weak: preserves known per-tick garbage. |
| Maintainable | Strong: contained in the existing projection seam. | Weak: adds cache invalidation across dynamic visual state. | Adequate. |
| Available | Strong: pure local engine change with no backend or dependency. | Adequate, but visual regressions are possible. | Strong. |
| Reliable | Strong: exact pre-fix trace is pinned. | Weak: current visuals are not equivalent to the issue's old premise. | Strong but leaves waste. |
| Testable | Strong: array identity, topology replacement, and trace parity are observable. | Weak: renderer coverage policy requires broader visual proof. | Weak: no improvement. |
| Securable | Strong: no trust, auth, secret, migration, or dependency surface. | Strong. | Strong. |

**Recommendation:** projection reuse only. Strength: **strong** across Scalable, Maintainable, Reliable, and Testable.

## Acceptance criteria

1. A failing regression harness first proves decay-only fire ticks rebuild the public projection on current main.
2. Every decay-only tick preserves the `state.fire` array identity and updates each surviving cell's life to the authoritative Map value.
3. Every observed ignition, spread, or expiry topology change replaces the projection, which remains sorted by column.
4. The complete deterministic phase/fire/health trace remains byte-identical to the pre-fix trace.
5. The focused harness is part of `npm run check`; the full deterministic suite, client and Edge tests, build, dependency audit, and applicable coverage gates remain green.
6. One adversarial reviewer clears the exact package; all hosted checks pass on that exact head before PR-only merge and Pages production verification.
7. Issue #68 is closed with evidence that its valid remainder shipped and its gradient premise no longer applies to current rendering behavior.

## Non-goals

- Caching explosion or scorch gradients, changing rendering output, or altering effect timing.
- Changing napalm spread, damage, duration, ordering, serialization, terrain, or turn behavior.
- Adding dependencies, backend work, migrations, telemetry, auth, crypto, or secret handling.

# Sprint spec: Decisive Starter-Weapon Falloff

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Issue #45's original range premise has been overtaken by the 1200x600 field and current spawn geometry: the historical 49-degree / 70-power reference shot damages the opponent on only 29 of 100 deterministic terrain seeds. Its remaining lethality concern is real. When that shot lands with the unlimited Baby Missile, it averages 17.9 damage with an 18.9 median, making a typical landed shot roughly a six-hit kill.

The current linear blast curve preserves the weapon peak only at the exact epicenter and discards damage quickly across the rest of the visible blast. The common starter weapons need a more decisive interior curve without increasing direct-hit peaks, widening craters, changing reach, or strengthening multi-hit premium weapons.

## SMARTS decision

Choose a per-weapon deterministic falloff exponent and give only hot-seat Baby Missile and Missile a quadratic interior curve. Keep the engine default and networked rooms linear until the Edge referee can enforce one ruleset version for every participant.

| Lens | Per-weapon quadratic falloff | Raise weapon peaks | Global falloff change |
|---|---|---|---|
| Scalable | Strong. One optional detonation parameter supports later evidence-based tuning without branching engine logic. | Adequate. Each future tuning requires editing unrelated peak values. | Strong mechanically, but applies too broadly. |
| Maintainable | Strong. The curve remains centralized in `Physics` and selected declaratively in `WeaponSystem`. | Strong but conflates direct-hit and glancing-hit balance. | Strong but obscures weapon-class intent. |
| Available | Strong. Pure deterministic math plus one local execution-context option; no backend or persistence change. | Strong. | Strong. |
| Reliable | Strong. Center and edge invariants remain fixed; network clients preserve their legacy curve across mixed deployed versions. | Weak. Direct-hit time-to-kill changes too. | Weak. Cluster, Betty, MIRV, and premium balance all move together. |
| Testable | Strong. Unit/harness checks can pin center, midpoint, edge, default-linear, and actual engine detonation behavior. | Strong. | Strong, but regression surface is much larger. |
| Securable | Strong. No auth, secret, dependency, migration, or external-data surface. | Strong. | Strong. |

**Recommendation:** Per-weapon quadratic falloff. Strength: **strong** across Maintainable, Reliable, and Testable.

## Design

- Add an optional positive `falloffExponent` to `DetonationDef`; omitted weapons retain linear falloff (`1`).
- Extend the pure damage helper to compute `MAX_DAMAGE * (1 - normalizedDistance ** exponent)` for points strictly inside the blast radius.
- Set `falloffExponent: 2` only on `baby_missile` and `missile`.
- Add a `GameOptions.starterWeaponFalloff` execution-context input whose fail-closed default is `linear`.
- Route both modes through one pure `LobbyConfig`-to-engine-options builder: pin hot-seat to `decisive` and network to explicit `linear` so old and new deployed tabs replay identical action logs.
- Thread the selected exponent through `GameEngine.detonate()` into the shared physics helper only when the engine was explicitly opted in.
- Preserve exact invariants: center damage equals the weapon's existing `maxDamage`; damage at and beyond the shared visible edge is zero; crater radius, visual reach, price, ammo, and peak damage do not change.
- Leave cluster, Betty, MIRV, nukes, napalm, terrain, aim, power, wind, and spawn geometry unchanged.

## Acceptance criteria

1. A failing regression test first proves starter weapons still use the current linear interior curve.
2. Baby Missile and Missile declare exponent `2`; weapons without the field retain exponent `1` behavior.
3. At half the damage radius, the decisive curve deals 75% of peak while the default curve remains at 50%.
4. Center and edge behavior remain unchanged for every curve.
5. Actual `GameEngine.detonate()` behavior proves default/network-compatible starter damage remains linear, explicit hot-seat opt-in uses the selected curve, and a non-starter control is unchanged.
6. A production-wiring unit test proves the exact options builder used by `main.ts` maps network to `linear` and hot-seat to `decisive`.
7. The 100-seed 49-degree / 70-power calibration keeps its 29% hit rate while materially improving landed-shot damage; accuracy is not made easier.
8. `npm run check`, client tests/coverage, build, focused production browser checks, and determinism/lockstep harnesses remain green.
9. One adversarial reviewer clears the exact diff; all hosted checks pass on that exact head before PR-only merge and deployment verification.

## Non-goals

- Changing field dimensions, tank placement, launch velocity, gravity, wind, aiming assistance, trajectory previews, or direct-hit peak damage.
- Tuning cluster, multi-hit, premium, terrain, or fire weapons.
- Adding dependencies, backend work, migrations, telemetry, or the Edge-enforced network ruleset boundary required before network mode can adopt this balance change.
- Declaring all subjective combat balance permanently solved; this slice resolves the evidenced starter-weapon damage-floor remainder of issue #45.

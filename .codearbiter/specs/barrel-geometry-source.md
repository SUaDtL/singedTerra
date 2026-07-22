# Shared Barrel Geometry Sprint Spec

> Status: **APPROVED — user approved 2026-07-21**
> Date: 2026-07-21
> Tracks: GitHub issue #153

## Goal

Make the shared engine geometry the only source for barrel length, pivot height, and muzzle position,
so renderer-only edits cannot silently separate the drawn barrel, muzzle effects, aim guide, and
projectile spawn again.

## Current defect

The physics contract is correct at a 20px pivot height and 22px barrel length, but the client mirrors
those values independently:

- `TankRenderer.ts` declares its own `BARREL_LENGTH` and derives the pivot from body art dimensions.
- `Renderer.ts` declares `BARREL_VISUAL_LEN` and `TANK_BARREL_PIVOT_OFFSET` for muzzle effects and the
  aim guide.
- `Tank.ts` owns the engine constants and `barrelTip()`, while comments still tell maintainers to keep
  the copies synchronized manually.

The existing numerical muzzle harness pins the approved 20/22 geometry, but it does not prove that
either renderer consumes the shared source. A one-sided client edit can therefore recreate the bug.

## Approved design candidate

Keep `BARREL_LENGTH`, `BARREL_PIVOT_HEIGHT`, and `barrelTip()` in
`shared/src/engine/Tank.ts`. Make both renderer files import and consume them:

- `TankRenderer.draw()` uses `tank.y - BARREL_PIVOT_HEIGHT` for the pivot and
  `barrelTip(tank, BARREL_LENGTH)` for the drawn endpoint.
- `Renderer.spawnMuzzleFlash()` and `Renderer.drawAimGuide()` use
  `barrelTip(tank, BARREL_LENGTH)` instead of mirrored arithmetic.
- Remove every client-owned mirror constant and update stale comments to describe shared ownership.

Extend the existing `scripts/checks/muzzle.mjs` harness with a TypeScript-AST structural guard. It
must verify the required shared imports and calls and reject reintroduced top-level mirror constants.
The harness keeps its independent 20px/22px numerical oracle, so an intentional geometry change must
update both the approved visual contract and the shared implementation explicitly.

No new dependency is needed; the repository already uses TypeScript in the root toolchain.

## Alternatives rejected

### Static literal comparison only

Comparing renderer literals with shared values would preserve the duplication and merely detect it
afterward. Shared imports remove the synchronization burden.

### Mock Canvas draw calls

A full fake `CanvasRenderingContext2D` would couple the test to unrelated body, tread, shading, and
particle draw order. The risk is source ownership, so an AST guard plus the existing numerical
physics oracle is narrower and more stable.

### Move tank art dimensions into shared

Tread, body, and turret dimensions are presentation concerns. Moving them into the deterministic
engine would reverse the intended dependency boundary and over-centralize unrelated art choices.

## SMARTS decision

| Lens | Shared imports plus AST guard | Literal comparison | Canvas mock |
|---|---|---|---|
| Scalable | Strong: new consumers reuse one geometry API. | Weak: each consumer keeps a copy. | Adequate: extensible but verbose. |
| Maintainable | Strong: removes three mirror constants. | Weak: synchronization remains manual. | Weak: test follows drawing internals. |
| Available | Strong: no runtime or dependency change. | Strong. | Adequate: larger test fixture. |
| Reliable | Strong: numerical behavior and source ownership are both guarded. | Adequate: detects value drift only. | Adequate: endpoint can be observed, but through a broad mock. |
| Testable | Strong: existing harness gains mutation-sensitive AST checks. | Strong but preserves the defect shape. | Weak: high incidental assertion surface. |
| Securable | Neutral: no trust boundary or data flow. | Neutral. | Neutral. |

Recommendation: shared imports plus an AST guard. Strength: **strong**. Confidence: **high**.

## Acceptance criteria

### AC-1: renderer barrel consumes shared geometry

`TankRenderer.ts` imports `BARREL_LENGTH`, `BARREL_PIVOT_HEIGHT`, and `barrelTip` from
`@shared/engine/Tank`, uses them for the pivot and endpoint, and declares no barrel-length mirror.

### AC-2: muzzle effects and aim guide consume shared geometry

`Renderer.ts` imports `BARREL_LENGTH` and `barrelTip`, uses the shared function at both call sites,
and removes `BARREL_VISUAL_LEN` and `TANK_BARREL_PIVOT_OFFSET`.

### AC-3: behavior stays byte-for-byte equivalent at the geometry boundary

The approved numerical contract remains a 20px pivot and 22px barrel. Existing projectile-spawn,
AI, collision, and muzzle assertions pass without changing their expected coordinates.

### AC-4: drift is executable and mutation-sensitive

The muzzle harness fails if a renderer drops the required shared import/call or reintroduces a
top-level mirror constant. It passes only when both renderer consumers use the shared source.

### AC-5: repository gates stay green

Fresh verification before commit and PR:

```powershell
npx tsx scripts/checks/muzzle.mjs
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

The PR references #153, remains unmerged, and is watched until all available checks are green.

## Non-goals

- Changing the approved 20px/22px geometry or any visible tank art.
- Moving body, tread, or turret art dimensions into `shared/`.
- Changing projectile physics, aim-guide duration, effects, or collision behavior.
- Adding a dependency, changing the lockfile, or changing CI/workflows.

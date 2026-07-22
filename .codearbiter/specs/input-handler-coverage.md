# InputHandler Behavioral Coverage Sprint Spec

> Status: **APPROVED — user approved 2026-07-22**
> Date: 2026-07-22
> Tracks: GitHub issue #134

## Goal

Add mutation-sensitive Vitest coverage for `client/src/input/InputHandler.ts` so keyboard, touch,
weapon-selection, and mouse-drag behavior can be changed safely without relying on manual play.

## Why this is next

`InputHandler.ts` is a 307-line player-input boundary with 0% client coverage on current `main`.
The issue's retry and audio-edge modules already have deterministic root harnesses, while the
HotSeatClient slice is covered by the preceding open PR. InputHandler therefore offers the largest
bounded confidence gain remaining in issue #134 without touching gameplay production code.

## Design

Create `client/src/input/InputHandler.test.ts` using the real handler, a real jsdom element,
cancelable synthetic DOM events, and a controlled `getBoundingClientRect()` result. Assert only
publicly observable actions and event cancellation; do not expose private state or add test-only
production seams.

The suite covers:

1. idempotent attach/detach, keyboard direction, configured steps, handled-key cancellation, and
   ignored keys;
2. clamped public aim controls, redundant-emission suppression, stable implemented-weapon cycling,
   wrapping, and fire-versus-shield dispatch;
3. CSS-to-logical canvas scaling for mouse drag angle/power, ignored invalid starts, mouseup cleanup,
   detach-during-drag cleanup, and zero-sized bounds;
4. mutation proofs for duplicate attachment, key direction, bound suppression, drag teardown, and
   logical-coordinate scaling.

This is characterization work. Tests for existing behavior are proven meaningful by temporarily
mutating one production invariant at a time, observing the focused suite fail for the intended
reason, and restoring the exact production source before landing.

## SMARTS decision

| Lens | InputHandler coverage | Retry/audio-edge coverage | Supabase typing cleanup |
|---|---|---|---|
| Scalable | One event contract protects every local player action path. | Narrow utilities already have root harnesses. | Broad Edge Function migration. |
| Maintainable | Documents the public input contract beside the source. | Smaller marginal confidence gain. | Valuable, but cross-cutting. |
| Available | No runtime or dependency change. | No runtime or dependency change. | Tooling and generated-type coordination risk. |
| Reliable | Directly protects aim, fire, weapon, and drag behavior. | Existing harnesses already catch core regressions. | Improves static confidence, not immediate player behavior. |
| Testable | jsdom can drive every selected boundary deterministically. | Straightforward but partly duplicate coverage. | Requires a larger multi-runtime proof. |
| Securable | No trust-boundary or dependency change. | Same. | Touches backend contracts and deserves its own sprint. |

Verdict: **InputHandler coverage, strong; confidence high.** Reliable, Testable, and Maintainable
dominate, with a single test file and no production or dependency change.

## Acceptance criteria

### AC-1: keyboard lifecycle and actions

- Calling `attach()` twice does not duplicate emissions.
- Arrow keys emit the correct absolute angle/power actions, including configured step sizes.
- Space, legacy `Spacebar`, Enter, Tab, `q`, and `Q` follow the documented fire/weapon behavior.
- Every handled key prevents its browser default; an unknown key does neither.
- Calling `detach()` twice is safe and detached handlers emit nothing.

### AC-2: public controls and weapons

- Constructor seeds and `setAim()` clamp to angle 0–180 and power 0–100.
- Steps at a bound do not emit a redundant action; inward steps emit the clamped absolute value.
- Weapon cycling follows the implemented `WEAPONS` order, can be reseeded, and wraps from shield.
- `triggerFire()` emits `use_shield` for shield and `fire` otherwise.

### AC-3: mouse drag geometry and cleanup

- Non-left clicks and clicks before a tank position is known are ignored.
- A controlled CSS rectangle maps to the 1200×600 logical canvas: a 280-logical-pixel horizontal
  drag yields angle 0 and power 100; an upward drag yields angle 90.
- Mouseup stops window-level movement; detach during a drag removes the in-flight listeners.
- A zero-width or zero-height target emits nothing.

### AC-4: mutation-sensitive proof

At least these independent temporary mutations make the focused suite fail before exact restoration:
attached-state assignment removed, ArrowLeft direction changed, angle-bound no-op removed, detach
drag cleanup removed, and CSS-to-logical width scaling removed. Deleting only the duplicate-attach
guard is documented as an equivalent mutant because the DOM deduplicates the same listener callback.

### AC-5: verification and scope

Fresh verification before commit and PR:

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

`InputHandler.ts`, package manifests, and the lockfile remain byte-identical to `origin/main`.
The PR references #134 without closing it, stays open until available checks are green, and never
merges or deploys.

## Non-goals

- Changing input mappings, steps, aim geometry, weapon order, gameplay behavior, or production code.
- Covering retry, audio edges, HotSeatClient, renderer internals, or DOM bootstrap in this slice.
- Adding dependencies, approving install scripts, or changing package/lock state.
- Auto-merging or deploying the pull request.

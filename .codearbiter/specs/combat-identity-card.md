# Combat Identity Card Spec

**Type:** player-facing visual feature
**Approval:** maintainer standing passion-project sprint authority, logged per sprint

## Goal

Make every active custom vehicle immediately legible during combat by turning the existing compact tank thumbnail into a larger, high-resolution tactical identity card inside the command HUD, without changing battlefield geometry or the single-page fit.

## Behavior contract

- The active-turn HUD paints the exact active tank color and four-part loadout through a dedicated `tactical` preview profile.
- The tactical canvas is 144x80 logical pixels and paints direct scale-two authored variants, retaining the existing high-quality smoothing and retry lifecycle.
- Desktop/fine-pointer presentation uses the full tactical card. Compact and coarse-pointer layouts shrink the same canvas to bounded proportions so controls remain usable and the page never scrolls.
- The card keeps the existing active-tank accessible name, identity-change caching, turn handoff behavior, shot-progress behavior, and stale/dead-tank clearing semantics.
- Thumbnail and spotlight preview modes remain unchanged for lobby lineups and the Vehicle Bay.
- Do not change battlefield tank rendering, muzzle/trajectory geometry, deterministic engine state, collision, input behavior, dependencies, assets, backend, auth, crypto, migrations, or workflows.

## Approved surface

| File | Purpose |
| --- | --- |
| `.codearbiter/overrides.log` | Append sprint-specific standing approval and later merge receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, TDD, verification, review, and hosted receipts. |
| `.codearbiter/specs/combat-identity-card.md` | This approved contract. |
| `.codearbiter/plans/combat-identity-card.md` | Governed implementation plan. |
| `client/src/renderer/TankLoadoutPreview.ts` | Add the direct-scale tactical preview profile. |
| `client/src/renderer/TankLoadoutPreview.test.ts` | Prove exact profile dimensions, scaling, and mode-bound retry behavior. |
| `client/src/ui/HUD.ts` | Select tactical mode and style its responsive identity frame. |
| `client/src/ui/HUD.tankPortrait.test.ts` | Prove the HUD requests the tactical profile across identity changes. |
| `e2e/hud-layout.spec.ts` | Prove visible desktop emphasis, compact/coarse bounds, and zero overflow. |

## Acceptance

1. Focused preview, portrait, HUD layout, and existing tank-part tests pass before production edits.
2. Causal unit RED proves the tactical profile is absent, then GREEN proves 144x80 direct scale-two rendering and exact HUD mode selection.
3. Real Chromium proves the card is materially larger on desktop, bounded on compact/coarse projects, fully visible, and introduces no page or HUD clipping.
4. Existing thumbnail/spotlight behavior, accessibility, identity caching, retry clearing, and active-turn lifecycle remain green.
5. Full deterministic, client, Edge, Playwright, coverage, build, dependency-audit, secret, Pages-base, and diff gates pass.
6. One adversarial reviewer returns CLEAN / READY after every Critical, High, Medium, and merge blocker is corrected.
7. Delivery uses a PR, exact-head hosted CI, separately logged merge receipt, governance-only review, fresh final-head CI, squash merge, Pages provenance, and live smoke.

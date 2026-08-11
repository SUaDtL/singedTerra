# Weapon Intel Panel sprint spec

Status: approved under the user's standing continuous-improvement authority
Date: 2026-08-10
Task: `ux.hud.0002`
Source: `.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md`

## Outcome

A player can inspect every implemented arsenal weapon with mouse, keyboard, or touch and understand its tactical role before committing ammunition. Guidance remains inside the arsenal drawer, never covers the battlefield, and never adds a modal or changes deterministic gameplay.

## Player contract

- Opening the arsenal immediately shows intel for the currently selected weapon.
- Focusing or pointing at another visible weapon previews that weapon's intel without selecting or firing it.
- Activating a weapon selects it through the existing callback and leaves its intel visible.
- Moving the pointer away restores intel for the selected weapon; keyboard focus remains authoritative while it is inside a weapon button.
- Intel includes the weapon name, a short tactical role, terrain interaction, damage or blast character, live ammunition, and one concise use case.
- All implemented `WeaponType` values have authored intel. The TypeScript mapping is exhaustive so a future weapon cannot compile without guidance.
- The panel is readable and contained inside the existing fitted arsenal drawer on desktop-fine, pixel-touch, and small-window Playwright projects.
- Existing collapse preference, Escape-to-close behavior, owned-only visibility, weapon selection, firing, store, engine, network, and replay behavior remain unchanged.

## Design

Create a focused `weaponIntel.ts` presentation catalog keyed by `WeaponType`. Keep player-facing tactical language separate from engine tuning so exact balance changes do not turn the panel into misleading pseudo-precision. The catalog exposes role, terrain, damage, and use-case strings and is imported only by the HUD.

The arsenal builds one persistent intel region beneath its weapon grid. It defaults to the selected weapon during `syncStrip`. Button `focus` and pointer entry preview another weapon. Button pointer exit restores the selected weapon unless keyboard focus is still on that button. Click continues to use the existing selection callback and updates the preview immediately. The region uses an accessible heading and polite status semantics; weapon buttons reference it with `aria-describedby`.

The panel is part of the drawer's existing layer and scroll containment. It is hidden whenever the drawer is collapsed. Compact CSS reduces spacing and type size while preserving the current 44-pixel touch-target floor.

## Considered approaches and SMARTS decision

1. **Inline drawer dossier - chosen.** Strong: best safety, maintenance, accessibility, reversibility, testability, and player comprehension. It is persistently readable on touch and inherits the drawer's established layering.
2. **Hover tooltip.** Rejected: weak on touch and keyboard, easy to clip, and transient while the player compares choices.
3. **Battlefield modal or popover.** Rejected: obscures the exact battlefield context needed to judge a weapon and repeats the overlay-composition failure class already repaired.

SMARTS verdict: inline dossier, strong confidence. Intent: current adversarial audit plus the user's standing priority on polished player experience.

## Authored content boundaries

Guidance may use stable qualitative bands such as precision, broad, massive, terrain-building, tunneling, lingering fire, or defense. It must not expose brittle internal frame counts, velocity constants, or formulas. Shield capacities may be described qualitatively rather than as engine HP. Ammunition is live HUD state, not duplicated catalog data.

## Test obligations

1. A catalog unit test proves every implemented weapon has non-empty, bounded role, terrain, damage, and use-case text.
2. HUD unit tests fail before implementation and prove selected default, focus preview, pointer preview/restore, click persistence, live ammo, `aria-describedby`, and collapse behavior.
3. A real-browser test runs in all three viewport projects and proves the panel is visible, changes via each applicable input mode, remains inside the drawer and viewport, does not overlap the canvas, and does not increase `#hud` scroll height.
4. Mutation-oriented assertions must fail if any one intel field is omitted, preview events are removed, selected fallback is removed, or compact containment is broken.

## Out of scope

No weapon balance, inventory, store, engine, action schema, network, Supabase, auth, progression, dependency, asset, or migration changes. No tutorial sequence and no new modal.

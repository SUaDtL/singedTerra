# UI system

singedTerra combines an authored Canvas battlefield with an HTML control
surface. Both layers must feel like one retro-futurist artillery instrument.

## Design read

The interface is a dense field console beside a large, expressive battlefield.
It is technical, tactile, and readable. It should never look like a generic
dashboard placed over unrelated game art.

Current design dials:

- **Structure 6/10:** one strong stage, one tactical rail, and clear internal
  regions.
- **Density 8/10:** cockpit-like information without page or panel scrolling.
- **Register 8/10:** direct, dramatic, and game-specific.
- **Motion 4/10:** event feedback only. No decorative idle loops.

The authored dusk palette, detailed tanks, scorched terrain, gold instruments,
and ember actions form one locked visual family.

## Composition

```text
┌──────────────────────── fitted game stage ────────────────────────┐
│ command deck or touch dock │ Canvas battlefield │ tactical rail  │
└───────────────────────────────────────────────────────────────────┘
```

- The Canvas remains 1200×600 logical pixels and preserves its aspect ratio.
- The tactical rail owns player state, ballistic instruments, turn context,
  fuel, economy, Fire, and the Arsenal drawer.
- Fine pointers receive the keyboard Command Deck over the sky.
- Coarse pointers receive named touch controls over the sky.
- Store, pause, round, and game-over surfaces live above the fitted stage.
- The document and HUD remain scroll-free at supported viewports.
- Portrait phones receive a rotate-device gate instead of a crushed game.

## Visual hierarchy

The battlefield is the hero. UI chrome supports it.

1. Active turn and Fire are the strongest interactive signals.
2. Ballistic elevation, power, and wind are the primary instruments.
3. Weapon, ammo, fuel, credits, and player health provide tactical context.
4. Menu, Arsenal disclosure, and passive labels stay quiet until needed.

Gold marks current state, focus, and precision. Ember marks commitment and
destructive action. Cyan carries information. Team colors identify players and
must not be reused as generic status colors.

## Semantic tokens

Shared UI tokens live in `client/src/style.css`.

### Surface and line

- `--ui-rail`
- `--ui-surface`
- `--ui-surface-raised`
- `--ui-surface-active`
- `--ui-line`
- `--ui-line-strong`

### Copy and action

- `--ui-copy`
- `--ui-muted`
- `--ui-action`
- `--ui-action-hot`
- `--ui-focus`

### Rhythm and shape

- `--ui-space-1` through `--ui-space-4`
- `--ui-radius-sm`
- `--ui-radius-md`
- `--ui-radius-lg`

### Type

- `--ui-type-micro`
- `--ui-type-label`
- `--ui-type-body`
- `--ui-type-title`

Use semantic roles instead of visually similar raw values. A new token needs a
new semantic role, not a one-off preference.

## Component vocabulary

- `.st-ui-shell`: a complete application or combat shell.
- `.st-ui-section`: a top-level region separated by rhythm and lines.
- `.st-ui-action`: an explicit player action.
- `.st-ui-action--quiet`: a lower-priority action.
- `.st-ui-icon-action`: an icon-sized control with an accessible name.
- `.st-ui-glyph`: an authored combat or command glyph.
- `.st-weapon-icon`: a weapon-family silhouette.

Top-level regions use separators and shared surfaces. Avoid a pile of
independent cards with unrelated borders, shadows, and corner radii.

## Ballistic computer

The ballistic computer is the focal instrument and may use deeper bezels than
the rest of the rail.

- Elevation and power use matched analog geometry.
- Wind spans the width beneath them.
- Direction reflects the shared angle convention: `0° = right`, `90° = up`,
  `180° = left`.
- Values remain readable during compact scaling.
- Needles and markers update directly from state without decorative easing.

## Command surfaces

Keyboard and touch present aligned vocabulary:

- Aim
- Power
- Move / Drive (movement)
- Weapon
- Fire

Visible direction controls must match the physical result. Touch targets remain
at least 44×44 rendered pixels. Disabled state comes from the same local turn,
phase, life, burial, firing, and fuel rules as keyboard input.

Arsenal is a transient in-rail drawer. It starts closed unless the player saved
it open. Opening it must not create an inner scrollbar or cover active controls
without making them inert.

## Asset policy

The project has three visual asset classes.

### Authored raster art

The splash hero, battlefield backdrop, terrain material, tank chassis, and
modular tank parts establish the game's fidelity. New major artwork should
match their dusk lighting, hard silhouettes, warm highlights, and readable
gameplay scale.

Current sources:

```text
docs/assets/splash-hero.png
client/public/art/battlefield-backdrop.webp
client/public/art/terrain-material.webp
client/public/art/tank-chassis.webp
client/public/art/tank-parts.webp
```

### Game-specific graphics

Gauges, projectile signatures, explosions, aim guidance, and tank composition
remain bespoke. Weapon marks use a deliberately bounded Lucide vocabulary with
game-specific family, tier, color, and state treatment. Do not replace either
class with an uncurated generic icon set.

### Interface icons

`client/src/ui/hudIcons.ts` owns command and interface icons.
`client/src/ui/weaponIcons.ts` owns the exhaustive weapon-to-glyph map. These
are the only combat-shell Lucide seams. Import exact named icons and never
import the complete icon registry.

Interface icons reinforce visible text. Decorative SVG nodes use
`aria-hidden="true"` and `focusable="false"`.

## Motion and effects

Motion communicates events:

- turn handoff;
- projectile launch and flight;
- impact, blast reach, and screen kick;
- terrain collapse;
- damage, death, and round transition;
- connection or action status.

Respect `prefers-reduced-motion`. Reduced motion may remove camera shake,
flashes, and transitional emphasis without hiding state.

## Accessibility

- Every button has an accessible name.
- Icon-only controls keep a visible tooltip or adjacent label when space
  permits.
- Native `disabled` and `aria-disabled` states agree.
- Keyboard focus uses `--ui-focus`.
- Team color is never the only carrier of information.
- Touch hit areas are measured after the fitted stage scale is applied.
- Modals and drawers make covered command surfaces inert.

## Review checklist

Before shipping player-facing UI:

1. Use existing tokens and component roles.
2. Check desktop-fine, coarse-pointer landscape, and small-window profiles.
3. Measure rendered target size, text containment, and page overflow in real
   Chromium.
4. Test collapsed, expanded, modal, disabled, and restoration states.
5. Confirm direction controls against the actual game result.
6. Inspect at gameplay scale, not only in a large design preview.
7. Preserve a clear battlefield silhouette and a single visual family.
8. Run the production build and report asset or dependency cost.

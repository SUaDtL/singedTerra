# Sprint spec: Active tank identity portrait

## Problem

The Garage exposes four authored mobility, hull, turret, and barrel families,
but the battlefield renders tanks at gameplay scale. Players cannot reliably
read their customized vehicle during a turn, so the customization investment
loses identity once combat begins.

## Scope

- Add an authored active-tank portrait to the turn command console.
- Paint the portrait through the same modular atlas and exact `TankLoadout`
  used by the lobby and battlefield.
- Keep the portrait current across player handoffs, colors, and mixed loadouts.
- Name the assembled parts for assistive technology without adding noise to
  the existing live turn announcement.
- Integrate the portrait into the existing dusk, gold, cyan, and player-color
  HUD language across desktop and coarse-pointer layouts.

## Acceptance

1. The active turn row contains exactly one canvas portrait with a stable
   `role="img"` identity.
2. The portrait paints the active tank color and exact four-slot loadout through
   `paintTankLoadoutPreview`; unchanged animation frames do not repaint it.
3. A handoff repaints the portrait for the new tank and updates its accessible
   label to name Mobility, Hull, Turret, and Barrel selections.
4. Terminal, round-over, dead-active, and missing-active states clear the
   portrait identity with the rest of the active row.
5. At 1440x900, 915x412 coarse-pointer, and the supported small-window profile,
   the portrait remains recognizable, contained, and does not introduce page or
   HUD scrolling.
6. Existing weapon, fuel, movement, Arsenal, Store, Fire, pause, and touch-dock
   behavior remains unchanged.

## Out of scope

- Engine geometry, collision, physics, damage, balance, or determinism.
- New tank parts, paid assets, dependencies, backend, schema, or network action
  changes.
- Enlarging battlefield tanks beyond their authoritative gameplay footprint.

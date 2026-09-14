# UI system

singedTerra combines an authored Canvas battlefield with a semantic HTML
control surface. Both layers use the same scorched-metal visual language: dark
instrument panels, bronze frames, warm status light, and direct military copy.

## Current composition

The interface has three connected stages.

1. **Deployment console:** an introductory First Salvo route for a new browser, or the returning-player Quick Duel route, alongside Local Battle and Play Online.
2. **Preparation console:** route context, setup controls, Vehicle Bay preview, and commander record.
3. **Battle stage:** Canvas world, responsive battle console, Match ledger, and focused dialogs.

Current reference captures are indexed in [the documentation README](README.md#current-screenshots).
The historical images under `docs/design/` record earlier design targets, not
the current rendered contract.

## Visual hierarchy

The battlefield is the hero. Console chrome supports the current decision.

1. Active commander and Fire state carry the strongest emphasis.
2. Elevation, power, and wind are the main instruments.
3. Weapon, ammunition, fuel, credits, and health supply tactical context.
4. Menu, Settings, and Armory remain quiet until opened.

Gold marks selection and precision. Ember marks commitment and destructive
action. Cyan carries information. Team colors identify players and do not act
as generic status colors.

## Lobby and preparation

The deployment chooser gives a new browser one prominent First Salvo action,
with alternative Quick Duel operations in a bounded disclosure. After that
introduction has been seen, operation selection appears directly beside the
Quick Duel action. Local Battle and Play Online remain distinct entries in
both layouts.

Preparation keeps a stable hierarchy:

- **Back to deployment choices** is a bronze button with the shared left-arrow icon and a physical 44px target.
- The mission brief names the selected route.
- Setup content owns scrolling when the fitted stage is short.
- The battlefield preview and commander record remain visible without covering form controls.

Hot Seat uses Local Battle, Practice vs CPU, and Verified Deployment tabs. Only
the selected tab mounts its body. Garage editing makes unrelated controls inert
until the player finishes or closes the Vehicle Bay.

## Battle console

`client/src/ui/battleConsole/` renders one typed Preact tree for current state
and player intent. Optional Pixi decoration sits beneath it and cannot own
gameplay input. Canvas remains responsible for terrain, tanks, projectiles,
effects, and the authored battlefield.

Semantic component code, Preact, and scoped CSS are available at startup; the
battle lifecycle alone mounts the controls and their effects. This keeps command
availability independent of deferred decoration chunks that a later deployment
may remove. The HUD's idle lifecycle coordinator already exists at startup;
the zero-resource boundary concerns mounted console roots/effects and the
generation-owned ledger resources, including intent bridges and controller
adapters. Pixi, its CSP-support module, and compositor textures stay lazy.
Optional decoration failure preserves the same semantic owner and typed intent
path. The recovery report records measured startup cost and the remaining lazy
boundary; earlier zero-Preact evidence does not cover this recovery change.
The [console entry recovery report](reports/recovered-console-entry-2026-09-13.md)
records the implementation variance and its evidence limits.

The console projects to three layout modes:

- **Wide:** full ornate frame with separate live instruments and command areas.
- **Standard:** the same semantic controls in a tighter desktop arrangement.
- **Compact:** a simplified HTML console with touch-sized aim, power, movement, weapon, and Fire controls.

Responsive changes preserve semantic control identity and keyboard focus. The
compact capture uses browser device emulation; physical-device validation is a
separate evidence boundary.

## Command surfaces

The battle console and retained match surfaces share these actions:

- Aim left and right.
- Increase and decrease power.
- Move left and right while fuel permits.
- Select or cycle a weapon.
- Fire the selected weapon or activate a shield.
- Open Armory, Settings, Match ledger, or Command Menu.

Armory and Settings are focused dialogs. Covered game controls become inert.
Closing a dialog returns focus to its invoking control when that control still
exists. Command Menu owns Resume, First Salvo help when eligible, and Return to
Lobby. It does not pause deterministic simulation or online updates.

## Shared tokens

Core tokens live in `client/src/style.css`.

| Group | Tokens |
|---|---|
| Surfaces | `--ui-rail`, `--ui-surface`, `--ui-surface-raised`, `--ui-surface-active` |
| Lines | `--ui-line`, `--ui-line-strong` |
| Copy | `--ui-copy`, `--ui-muted` |
| Action | `--ui-action`, `--ui-action-hot`, `--ui-focus` |
| Rhythm | `--ui-space-1` through `--ui-space-4` |
| Shape | `--ui-radius-sm`, `--ui-radius-md`, `--ui-radius-lg` |
| Type | `--ui-type-micro`, `--ui-type-label`, `--ui-type-body`, `--ui-type-title` |

Use a semantic role before adding a one-off visual value. Lobby-specific bronze
console values live in `LobbyConsole.css`; the battle console's generated and
module-scoped styles remain inside its own directory.

## Icons and assets

`client/src/ui/hudIcons.ts` owns a bounded set of command icons.
`client/src/ui/weaponIcons.ts` owns the exhaustive weapon-to-glyph map. Import
exact named Lucide icons through those seams. Never import the complete icon
registry.

Decorative SVG nodes use `aria-hidden="true"` and `focusable="false"`. Visible
text or an explicit accessible label carries the action name.

Authored raster assets establish the world:

```text
client/public/art/battlefield-backdrop.webp
client/public/art/battlefield-obsidian-caldera.webp
client/public/art/battlefield-glassstorm-expanse.webp
client/public/art/terrain-material.webp
client/public/art/terrain-material-obsidian-caldera.webp
client/public/art/terrain-material-glassstorm-expanse.webp
client/public/art/tank-chassis.webp
client/public/art/tank-parts.webp
```

Each `BattlefieldWorld` keeps panorama, terrain material, and atmosphere paired.
Material loading can add texture, but a readable palette-only fallback remains
required.

## Accessibility

- Every control has a stable accessible name.
- Keyboard focus remains visible and returns after transient surfaces close.
- Native `disabled` and `aria-disabled` states agree.
- Team color is never the only carrier of player identity.
- Touch targets are measured after fitted-stage scaling.
- Dialogs and editors make covered controls inert.
- Native selects retain platform keyboard behavior and readable dark options.
- Reduced motion removes transient effects without hiding state.

## Review checklist

1. Check chooser, preparation, match, dialogs, and return paths.
2. Exercise wide, standard, and compact Chromium profiles.
3. Measure physical target size, overlap, clipping, and document overflow.
4. Test keyboard traversal, focus restoration, and modal isolation.
5. Confirm visible directions against the actual gameplay result.
6. Inspect screenshots at gameplay scale.
7. Run focused DOM tests, the production build, and affected browser checks.

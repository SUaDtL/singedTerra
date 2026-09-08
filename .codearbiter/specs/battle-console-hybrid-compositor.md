# Battle Console Hybrid Compositor

**Status:** architecture accepted by SUaDtL on 2026-08-21; implementation plan pending fresh-session review
**Initiative:** battle-console reference fidelity
**Decision:** ADR-0017
**Supersedes:** the implementation architecture and CSS/SVG-only constraints in `battle-console-finish-pass.md`
**Retains:** its visual reference, one-owner semantics, accessibility, gameplay authority, modal isolation, and maintainer acceptance gate

## Outcome

Deliver the supplied physical-console reference as a cohesive game HUD across
ordinary desktop, ultrawide, small-window, and Pixel landscape views. The result
must look like one manufactured object whose live controls sit inside authored
recesses. It must not look like HTML controls placed over a screenshot, and it
must not require resolution-specific manual tuning by the maintainer.

The implementation uses a hybrid architecture:

1. the existing Canvas 2D renderer draws the battlefield;
2. a non-interactive PixiJS scene draws the battle-console hardware and live
   visual effects;
3. semantic DOM controls and text remain above the Pixi surface and retain all
   focus, keyboard, touch, accessible-name, dialog, and callback behavior; and
4. a shared layout manifest supplies the exact sockets used by both layers.

## Approved dependencies

- Runtime dependency: exact `pixi.js@8.20.0`, installed in the client workspace
  after `$ca-add-dep` clearance on 2026-08-21.
- Build dependency: exact `sharp@0.35.3`, installed as a root development
  dependency after `$ca-add-dep` clearance on 2026-08-21.
- No full game engine, React tree, CSS-in-JS framework, animation framework, or
  hosted runtime is introduced.
- GitHub Pages remains the client host. The output remains a static Vite bundle.

## Layer boundaries

### Existing world canvas

- Continues to own sky, terrain, tanks, projectile, explosion, camera shake,
  and other world-space rendering.
- Receives no PixiJS dependency and no UI-layout knowledge.
- Keeps the existing deterministic game state and callback seams unchanged.

### Pixi visual HUD scene

- Owns chassis chrome, nine-slice frames, recesses, screws, material texture,
  gauges, ticks, illumination, hover/focus halos, and phase-dependent visual
  treatment.
- Is `pointer-events: none` and never decides gameplay input.
- Renders on state/layout invalidation rather than introducing an independent
  high-frequency game loop when the HUD is static.
- Has an explicit destroy/context-loss/failure path. DOM remains readable if
  Pixi initialization or an asset bundle fails.

### Semantic DOM layer

- Owns all player-facing text and values, native buttons, switch roles, dialog
  roles, focus traps, live regions, keyboard shortcuts, touch targets, and the
  existing gameplay callbacks.
- Uses transparent or minimally painted hit areas aligned to named Pixi sockets.
- Never duplicates a visible value already owned elsewhere.
- Disables text selection on game chrome and labels while preserving selection
  in text-entry fields and any future copyable diagnostics surface.

### Shared layout contract

- A typed layout module is the only source of socket names, logical bounds,
  anchors, safe-area insets, and mode selection.
- Pixi and DOM consume the same computed layout result. CSS does not independently
  recreate the compositor grid.
- Runtime values are measured in one logical reference coordinate system and
  uniformly scaled into the available battle-stage rectangle.
- Device-pixel ratio affects render resolution, not logical layout.

## Responsive model

Author three modes, not a separate design for every resolution:

1. **Wide fine-pointer** - the complete reference console and floating Match
   panel, optimized for ultrawide and large desktop.
2. **Standard fine-pointer** - the same hierarchy and materials with bounded
   socket compression/reflow for normal laptop and small-window views.
3. **Compact touch** - a purpose-authored two-row control topology with at least
   44 physical-pixel targets and no horizontal scrolling.

Mode selection is based on available logical stage width, height, safe-area
insets, and coarse/fine input. Within a mode, a single scale and anchor model is
used. New media-query exceptions are not an acceptable primary layout tool.

## Asset pipeline

- Source art lives separately from generated runtime assets.
- A deterministic Sharp script crops, trims, resizes, composites, and emits
  optimized PNG/WebP assets plus nine-slice metadata.
- Every generated runtime asset records its source path, source SHA-256, output
  SHA-256, dimensions, slice insets, and generation command/version.
- Text, numbers, icons that convey state, gauge values, and controls are never
  baked into generated raster assets.
- The Pixi asset manifest uses explicit bundles. Battle HUD assets are loaded
  before the first battle surface becomes interactive; non-battle routes do not
  eagerly initialize Pixi.

## Migration sequence

### Slice 0 - compositor scaffold

- Dependency review and exact-pin installation.
- Lazy-loaded Pixi application and non-interactive canvas layer.
- Typed layout mode selector and shared socket projection.
- Deterministic Sharp asset-build command and provenance manifest.
- Fail-soft DOM-only state and lifecycle cleanup test.

### Slice 1 - Commander and Fuel proof

- Implement only Commander identity/health and the three-part fuel rocker.
- Match the supplied Commander and Fuel crops before migrating another surface.
- Prove wide, standard, and touch layouts from the same layout contract.
- Prove DOM/Pixi socket alignment, long-name fit, focus styling, disabled state,
  fuel fill/value updates, and movement callbacks.
- Remove only the superseded Commander/Fuel CSS and assets after proof.

### Slice 2 - Weapon and Armory trigger

- Migrate the persistent weapon summary and Armory entry hardware.
- Preserve the existing equip/buy callback boundary and one weapon/ammo owner.

### Slice 3 - Angle, Power, and Wind

- Render the live instruments in Pixi from existing pure gauge mappings.
- Retain DOM values and step controls in shared sockets.
- Prove pointer, keyboard, touch, reduced-motion, and real-state updates.

### Slice 4 - Fire Control and Match

- Migrate Fire Ready, Settings, Fire, phase/outcome, and Match chrome.
- Preserve exactly one Fire action and one outcome owner.
- Preserve modal input suppression, focus trap, and focus restoration.

### Slice 5 - dialogs and remaining overlays

- Migrate Armory, Battle Settings, Command Menu, First Salvo, round shop,
  victory, and other battle overlays one at a time.
- A surface is not complete until its normal, long-copy, loading/error, focus,
  and compact states match the reference language.

### Slice 6 - retirement and broad proof

- Delete superseded CSS branches, dead selectors, and replaced generated assets.
- Verify no competing visual owners remain.
- Run the full deterministic, client, Edge, browser, accessibility, bundle, and
  visual-review gates on the exact final worktree.

## Component lock method

Work on one component until it is genuinely reference-matched:

1. capture the real component at each required layout mode;
2. compare it with the supplied crop at matched scale;
3. select one visible mismatch;
4. add a causal failing assertion where the property is machine-testable;
5. implement the correction in the shared compositor/layout model;
6. inspect fresh screenshots, including interaction and state variants;
7. pin geometry, ownership, long-copy, input, and accessibility behavior; and
8. record the accepted receipt before moving to the next component.

Automated containment is necessary but does not establish visual acceptance.
Only the maintainer may accept the finished visual surface.

## Acceptance contract

### Architecture

- The world renderer has no Pixi import.
- The Pixi HUD is non-interactive and has no gameplay authority.
- Every interactive control has one live DOM owner aligned to one named socket.
- Pixi is absent from the initial lobby route chunk and loads on the battle path.
- A forced Pixi initialization/asset failure leaves usable, readable DOM controls.

### Responsive behavior

- Required captures: 2048x864, 1600x900, 900x520, and the existing Pixel
  landscape profile, plus one intermediate resize sweep with no reload.
- No document scroll, horizontal HUD scroll, clipping, socket drift, or orphaned
  chrome at any supported viewport in the sweep.
- Standard and touch layouts are intentional authored modes, not uniformly
  shrunken desktop controls.
- Compact touch targets are at least 44 physical pixels and critical text is at
  least 11 physical pixels.

### Visual fidelity

- One authored outer chassis and consistent material/lighting language.
- Commander, Fuel, Weapon, Armory, Angle, Power, Wind, Fire Control, Match, and
  modal surfaces visually match their supplied references as closely as
  practical.
- Controls are seated in their recesses; labels do not collide with title bars;
  instrument ink is centered and proportionate; illumination conveys state.
- Exactly one visible owner exists for health, fuel, weapon/ammo, angle, power,
  wind, phase/outcome, and Fire.
- Text cannot be accidentally selected on game UI chrome.

### Interaction and accessibility

- Existing keyboard, pointer, and touch callbacks fire exactly once.
- Legal 20-character player names and longest weapon names fit or wrap without
  clipping or hiding the actionable control.
- Focus, hover, active, disabled, loading, error, success, and outcome states are
  visible and do not move their owning sockets.
- Armory, Settings, Match/Menu, round shop, First Salvo, expiry, and victory
  remain mutually exclusive where required; gameplay input is suppressed behind
  modals; Escape/backdrop restore focus.

### Quality and delivery

- Sharp output is deterministic for unchanged inputs.
- Bundle analysis records the lazy Pixi chunk and initial-route delta.
- Unit, typecheck, deterministic engine, Edge, and focused browser gates pass.
- Screenshot review contains decision, flight/handoff, long-name, Armory,
  Settings, Match/Menu, touch, and ultrawide states.
- No commit, PR, deployment, or completion claim occurs before maintainer visual
  approval and the sanctioned delivery gate.

## Explicitly out of scope

- Replacing `GameEngine`, Physics, Terrain, deterministic replay, or Canvas 2D
  world rendering.
- Changing network rulesets, action-log semantics, Supabase functions, Auth,
  schema, rewards, monetization, or hosting.
- Requiring the maintainer to configure exact browser dimensions for review.
- Treating the old CSS implementation as a visual baseline. It is migration
  input and behavioral evidence only.

## Failure and rollback

- The first Commander/Fuel slice is the architecture proof gate. If shared
  socket alignment, fail-soft behavior, or bundle isolation cannot be made
  reliable, stop before migrating additional components and reassess.
- During migration, each not-yet-migrated component retains its current DOM/CSS
  owner. No component has two interactive owners.
- Asset or WebGL failure falls back to readable DOM rather than blocking play.
- The old implementation is removed incrementally only after each replacement
  clears its acceptance contract.

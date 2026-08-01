# Sprint spec: Garage Spotlight

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and its plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

The Garage already supports four coherent presets and independent mobility, hull, turret, and barrel choices, but the lobby presents those authored parts at thumbnail scale near the bottom of a mostly empty roster panel. Players can change the text labels without getting a clear, high-fidelity read of the vehicle they are assembling. Enlarging battlefield tanks would improve recurrence but would also create visual hitbox and muzzle-perception risk. Replacing the atlas would be a larger art and alignment project.

## SMARTS decision

Choose a large live Garage spotlight rendered from the existing authored WebP atlas.

- **Securability:** client-only presentation; no input trust, storage, auth, or backend change.
- **Maintainability:** one scale-aware atlas painter remains the source for battlefield, thumbnail, and spotlight art.
- **Availability:** the existing geometric fallback remains available while the atlas loads or fails.
- **Reliability:** no deterministic engine, tank geometry, action, or network contract changes.
- **Testability:** scale geometry, selection state, visible part labels, and responsive fit have stable unit and browser oracles.
- **Scalability:** the spotlight represents one editable vehicle while existing thumbnails preserve 2-4 player roster context.

Alternatives rejected:

1. Scale battlefield tanks. More visible every turn, but rendered silhouettes would diverge from collision and muzzle expectations.
2. Generate a replacement atlas. Potentially higher art fidelity, but it expands asset provenance, crop calibration, and fallback scope before the existing art is being presented effectively.

## Chosen experience

Turn the existing right-side roster preview into a vehicle bay:

- One large, crisp spotlight tank represents the currently edited player.
- The spotlight shows the player's name/color identity and the four selected part names.
- Selecting a preset or cycling any part makes that Garage owner the spotlight and updates the assembled vehicle immediately.
- Color changes update the spotlight immediately. Name edits update its visible identity without stealing input focus.
- Existing animated roster thumbnails remain below the spotlight for multiplayer context.
- Online create/join modes spotlight the local editable vehicle. Waiting rooms spotlight the local seat when present, otherwise the first roster entry.

## Scope

In scope:

- Scale-aware authored part rendering that samples directly from the high-resolution atlas instead of magnifying a small cached thumbnail.
- One spotlight mode in `TankLoadoutPreview` with explicit dimensions and geometry.
- Vehicle-bay DOM, part-name metadata, and deterministic spotlight-owner selection in `Lobby`.
- Desktop, compact, reduced-motion, keyboard, and touch-safe presentation.
- Unit, DOM, and production-browser coverage.
- A concise player-guide note.

Out of scope:

- New or regenerated art assets.
- Battlefield tank scale, engine collision dimensions, shared barrel geometry, or trajectory changes.
- New gameplay stats or mechanical differences between cosmetic parts.
- Persistence or network schema changes; existing loadout serialization remains unchanged.
- A general canvas scene graph or Lobby decomposition refactor.
- Interactive 3D rotation, drag-to-spin, particle effects, or audio.

## Behavioral contract

1. Battlefield and existing thumbnail rendering remain pixel-compatible at scale `1` and thumbnail mode respectively.
2. Spotlight art uses the same atlas crops, tinting, layering order, and barrel angle as the selected loadout, but requests larger cached variants directly from the source atlas.
3. Scale is finite, positive, included in the cache key, and applied to destination dimensions and offsets. Invalid scale falls back to `1`.
4. Hot-seat defaults to Player 1. A preset or part activation changes the spotlight owner to that player before the lobby re-renders.
5. A color activation changes the spotlight owner and vehicle color in the same render. Name editing updates the spotlight name and matching roster thumbnail without rebuilding the focused input.
6. Online create and join spotlight the local editable tank. Waiting-room selection prefers the local seat and never exposes another player's controls.
7. The spotlight includes visible and semantic labels for Mobility, Hull, Turret, and Barrel using the shared authored vocabulary.
8. Existing roster thumbnails remain present for up to four players and retain reduced-motion behavior.
9. The vehicle bay stays within the fixed stage, introduces no document scroll, and does not cover Start Game or Garage controls at supported desktop and phone-landscape profiles.
10. Loading or failed atlas states show the geometric fallback and do not leave a blank bay.

## Visual direction

- Read as an equipment bay inside the existing dusk/fire-control system, not a separate card theme.
- Give the tank the visual priority. Metadata stays compact and aligned beneath or beside it.
- Reuse gold hairlines, muted telemetry labels, current type tokens, and one player-color identity accent.
- Keep roster thumbnails quiet so they provide context without competing with the spotlight.
- Reduced motion removes convoy bobbing; the spotlight itself stays static in every mode.

## Acceptance criteria

1. On a two-player hot-seat lobby, Player 1 appears as a large spotlight at first render while both roster thumbnails remain visible.
2. Activating Player 2's Ranger preset changes the spotlight owner, large assembled silhouette, and all four visible part labels to Ranger values.
3. Cycling one Player 2 slot updates only that slot label and the assembled spotlight while preserving the other three selections.
4. Changing Player 2's color updates the spotlight tint and owner identity; typing a new name updates both large and thumbnail labels without losing input focus.
5. The spotlight canvas is materially larger than a thumbnail and draws source-scaled authored variants rather than CSS magnification of the 84x48 bitmap.
6. Online create, join, and waiting modes select the correct local vehicle and preserve existing submitted loadouts.
7. Atlas loading/failure fallback, reduced motion, keyboard focus, and 2-4 player roster behavior remain covered.
8. Desktop-fine, small-window, and pixel-touch production-browser checks prove visible spotlight metadata, usable Garage controls, and no horizontal or vertical document scroll.
9. Existing lobby, tank-art, serialization, full client, deterministic, and production build gates stay green.
10. No dependency, new asset, backend deployment, migration, or deterministic gameplay change is introduced.

## Verification

- `TankPartArt` unit tests for scale normalization, cache isolation, source-to-destination sizing, and scale-1 compatibility.
- `TankLoadoutPreview` unit tests for thumbnail/spotlight dimensions, fallback, and retry invalidation.
- Lobby DOM tests for default owner, preset/slot/color/name changes, shared labels, online modes, and unchanged emitted loadouts.
- Focused Playwright coverage across desktop-fine, small-window, and pixel-touch.
- `npm run typecheck`, focused Vitest, `npm run check`, `npm run test:client`, `npm run build`, state-free secret scan, adversarial review, and exact-head hosted CI.

## Open questions

None. The slice is deliberately presentation-only and bounded to making existing customization legible.

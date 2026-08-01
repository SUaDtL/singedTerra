# Garage Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing modular tank customization immediately legible through one crisp, live, selected-player Garage spotlight while preserving roster context and gameplay contracts.

**Architecture:** Extend the current `TankPartArt` painter with an optional normalized render scale so large previews sample directly from the authored atlas and use scale-keyed caches. Add a spotlight mode to `TankLoadoutPreview`, then compose it in `Lobby` with a small owner-selection state and shared part labels. Keep all changes in the client presentation layer.

**Tech Stack:** TypeScript 7 native compiler, Canvas 2D, DOM/CSS, Vitest + jsdom, Playwright, existing WebP tank-part atlas.

## Global Constraints

- No new dependency or product asset.
- No engine, deterministic state, collision, shared barrel geometry, action-log, Supabase, or migration change.
- Existing thumbnail and battlefield scale-1 rendering remain compatible.
- Spotlight remains static; reduced motion disables existing roster motion.
- Fixed-stage desktop and phone-landscape layouts must not scroll or cover Start Game/Garage controls.
- TDD RED evidence precedes each production change.

---

## File map

- `client/src/renderer/TankPartArt.ts`: scale-normalized authored atlas painting and scale-keyed variant cache.
- `client/src/renderer/TankPartArt.test.ts`: direct scale, cache, offset, and compatibility proof.
- `client/src/renderer/TankLoadoutPreview.ts`: thumbnail and spotlight render profiles plus fallback layout.
- `client/src/renderer/TankLoadoutPreview.test.ts`: profile dimensions, rendering arguments, and lifecycle proof.
- `client/src/ui/Lobby.ts`: vehicle-bay markup, owner selection, identity synchronization, and responsive styles.
- `client/src/ui/Lobby.garage.test.ts`: Garage spotlight DOM and interaction contract.
- `e2e/garage-spotlight.spec.ts`: production-bundle visibility, interaction, focus, and no-scroll proof.
- `docs/PLAYING.md`: concise Garage spotlight player note.

### Task 1: Crisp scale-aware atlas painter

**Files:**

- Modify: `client/src/renderer/TankPartArt.ts`
- Modify: `client/src/renderer/TankPartArt.test.ts`

**Interfaces:**

- Extend `TankPartPainter.drawStatic(ctx, tank, scale?)` and `drawBarrel(ctx, tank, scale?)` with an optional numeric scale defaulting to `1`.
- Add an internal `normalizeRenderScale(value: number | undefined): number` that returns `1` for non-finite or non-positive values.
- Scale destination canvas dimensions and draw offsets, and include normalized scale in each variant cache key.

- [x] Add failing tests proving scale `4` produces four-times destination width/height and offsets, repeated scale `4` reuses its cache, scale `1` remains unchanged, and invalid scales normalize to `1`.
- [x] Run `npm run test:client -- --run src/renderer/TankPartArt.test.ts` and record the expected RED assertions.
- [x] Implement scale normalization, scale-keyed variants, and scaled destination geometry without changing source crops or tint composition.
- [x] Run the focused test and `npm run typecheck`; require green before task review.
- [x] Review the task diff for battlefield scale-1 compatibility and no shared/engine change.

### Task 2: Spotlight preview profile

**Files:**

- Modify: `client/src/renderer/TankLoadoutPreview.ts`
- Modify: `client/src/renderer/TankLoadoutPreview.test.ts`

**Interfaces:**

- Export `type TankLoadoutPreviewMode = 'thumbnail' | 'spotlight'`.
- Extend `paintTankLoadoutPreview(canvas, color, loadout, mode = 'thumbnail')`.
- Thumbnail profile remains `84x48`; spotlight profile uses a larger fixed canvas and passes a larger direct-render scale into `TankPartArt`.
- Include mode in the retry signature so a stale thumbnail retry cannot repaint a spotlight canvas.

- [x] Add failing tests for exact thumbnail compatibility, materially larger spotlight canvas dimensions, mode-bound retry signatures, direct scaled painter arguments, and a non-blank scaled fallback path.
- [x] Run `npm run test:client -- --run src/renderer/TankLoadoutPreview.test.ts` and capture RED.
- [x] Implement the two explicit profiles and profile-aware fallback/retry logic with no CSS-only bitmap magnification.
- [x] Run the focused preview tests and `npm run typecheck`; require green before task review.
- [x] Review the task diff for one atlas source, bounded cache growth, and deterministic presentation-only behavior.

### Task 3: Vehicle-bay spotlight and owner selection

**Files:**

- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.garage.test.ts`

**Interfaces:**

- Add private `spotlightOwner: string | null` state.
- Add `interface PreviewVehicle { owner: string; name: string; color: string; loadout: TankLoadout }` and `private previewRoster(): PreviewVehicle[]` for hot-seat, create, join, and waiting modes.
- Add `private spotlightVehicle(roster: readonly PreviewVehicle[]): PreviewVehicle | undefined` with local-seat/default fallback rules.
- Add `private syncPreviewName(owner: string, name: string): void` for focus-preserving identity updates.
- `renderVehiclePreview()` composes one `.lobby-preview__spotlight` plus the existing `.lobby-preview__convoy`.
- `renderGarage()` records its owner before preset or slot callbacks.
- Name inputs update the matching spotlight and thumbnail text in place; color activations record owner before the existing re-render.

- [x] Add failing DOM tests proving default Player 1 spotlight, Player 2 preset selection, independent slot change, shared four-part labels, Player 2 color ownership, focus-preserving name sync, online create/join local selection, waiting-room local-seat preference, and unchanged submitted loadouts.
- [x] Run `npm run test:client -- --run src/ui/Lobby.garage.test.ts` and capture RED.
- [x] Implement roster projection, owner selection, spotlight markup, semantic labels, and targeted identity synchronization.
- [x] Add vehicle-bay CSS that gives the spotlight visual priority, keeps thumbnails quiet, uses existing tokens, and preserves reduced-motion behavior.
- [x] Run focused Lobby/preview tests and `npm run typecheck`; require green before task review.
- [x] Review for keyboard focus preservation, no interactive control inside the pointer-transparent preview, and no online ownership leak.

### Task 4: Responsive production-browser proof and docs

**Files:**

- Create: `e2e/garage-spotlight.spec.ts`
- Modify: `docs/PLAYING.md`

**Interfaces:**

- Browser spec enters the real lobby, selects Player 2 customization through visible controls, and observes `.lobby-preview__spotlight` plus its canvas/metadata.
- The same assertions run in desktop-fine, small-window, and pixel-touch projects.

- [x] Add the Playwright acceptance oracle for initial spotlight, visible part labels, Player 2 preset/slot/color/name updates, canvas-to-thumbnail size ratio, retained input focus, usable Start Game, and horizontal/vertical document fit.
- [x] Run `npx playwright test e2e/garage-spotlight.spec.ts` against the production bundle and record the first-run result; apply bounded presentation corrections only if it exposes a failure.
- [x] Apply only responsive/presentation corrections required by the browser oracle.
- [x] Add a concise Garage spotlight note to `docs/PLAYING.md`.
- [x] Run focused browser checks, `npm run check`, `npm run test:client`, `npm run build`, and the state-free secret scan.
- [x] Send the spec, plan, sprint log, tests, and exact final diff to one adversarial reviewer; correct every Critical, High, and other merge-blocking finding.

### Task 5: Commit, PR, hosted gate, merge, and deployment

**Files:**

- Modify append-only receipts only as required under `.codearbiter/`.

**Interfaces:**

- Final branch: `codex/garage-spotlight` based on current `origin/main`.
- Delivery follows the standing exact-reviewed-head rule.

- [x] Run the codeArbiter commit gate and commit the atomic slice with a `CHANGELOG:` footer.
- [x] Sync with current `origin/main`; resolve conflicts without force-push and repeat affected verification/review if the head changes.
- [x] Push and open a ready PR with spec/plan links and exact verification evidence.
- [x] Wait for every required hosted check on the exact reviewed head.
- [ ] Merge through the PR under the maintainer's standing authority only after exact-head review is clean and CI is green.
- [ ] Verify the GitHub Pages provenance gate and post-deploy live browser smoke before choosing the next sprint slice.

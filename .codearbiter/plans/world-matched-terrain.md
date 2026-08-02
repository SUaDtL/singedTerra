# World-Matched Terrain Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authored battlefield world a matching terrain material and
palette without changing gameplay or deterministic state.

**Architecture:** The existing pure pristine-terrain selector returns a richer
`BattlefieldWorld` profile containing panorama, material, and immutable palette
metadata. `Renderer` routes that single profile to `BattlefieldBackdrop` and
`TerrainRenderer`; `TerrainMaterial` lazily decodes only the selected texture and
uses a generation token to reject retired callbacks. `TerrainRenderer` converts
the selected palette once, preserves its dirty cache, and falls back to the same
world palette with zero material modulation until loading settles.

**Tech stack:** TypeScript, Canvas 2D, Vite public assets, Vitest, Playwright,
built-in image generation, local WebP encoding.

## Global constraints

- Client presentation only; `shared/`, Supabase, action logs, physics, terrain
  generation, and gameplay coordinates are immutable.
- Three opaque 256x256 WebPs, each at most 100,000 bytes.
- No dependency or lockfile change and no paid asset or service usage.
- No runtime randomness; one complete world selection and one material image
  allocation per game.
- Palette-only rendering is the complete loading/error fallback.

---

### Task 1: Pin complete-world routing in RED

**Files:**
- Modify: `client/src/renderer/BattlefieldBackdrop.test.ts`
- Modify: `client/src/renderer/Renderer.battlefieldBackdrop.test.ts`
- Modify: `client/src/renderer/selectClientBattlefield.test.ts`

**Interfaces:**
- Consumes: `selectBattlefieldWorld(terrain: Uint8Array): BattlefieldWorld` and
  `GameClient.getInitialTerrain(): Uint8Array`.
- Produces: `BattlefieldWorld.terrainMaterialAsset`,
  `BattlefieldWorld.terrainPalette`, and
  `Renderer.selectBattlefieldWorld(terrain: Uint8Array): void`.

- [x] **Step 1: Add the catalog-profile failing contract**

  Require every world to expose a unique project-relative material asset and a
  complete immutable palette with rim, mid, deep, three strata bands, and bevel
  shadow. Mutating the source terrain after selection must not alter the profile.

- [x] **Step 2: Add the atomic renderer-routing failing contract**

  Require one `selectBattlefieldWorld` call to pass the same selected profile to
  backdrop and terrain exactly once. Replacing pristine terrain with current
  cratered state must fail the client-orchestration test.

- [x] **Step 3: Run focused RED**

  Run `npm -w @singedterra/client exec vitest -- run
  src/renderer/BattlefieldBackdrop.test.ts
  src/renderer/Renderer.battlefieldBackdrop.test.ts
  src/renderer/selectClientBattlefield.test.ts`. Confirm failures name the absent
  profile metadata and complete-world routing.

### Task 2: Pin lazy material lifecycle and palette rendering in RED

**Files:**
- Modify: `client/src/renderer/TerrainMaterial.test.ts`
- Modify: `client/src/renderer/TerrainRenderer.material.test.ts`

**Interfaces:**
- Consumes: base-relative material asset paths from `BattlefieldWorld`.
- Produces: `TerrainMaterial.select(asset: string): void`,
  `TerrainMaterial.reset(): void`, `TerrainRenderer.selectWorld(world): void`,
  and `TerrainRenderer.reset(): void`.

- [x] **Step 1: Add selected-only loading lifecycle tests**

  Require no image allocation before selection, idempotent same-asset selection,
  exactly one selected URL, one fresh allocation after reset, and rejection of
  stale load/error/timeout callbacks from the retired generation.

- [x] **Step 2: Add palette and cache tests**

  Require identical terrain bytes to produce materially distinct literal RGB
  samples for Ember, Obsidian, and Glassstorm profiles while preserving alpha,
  bevel order, and the terrain bitmap. Require selection and first-ready material
  application to rebuild once each, then return to version-based caching.

- [x] **Step 3: Run focused RED**

  Run `npm -w @singedterra/client exec vitest -- run
  src/renderer/TerrainMaterial.test.ts
  src/renderer/TerrainRenderer.material.test.ts`. Confirm failure is caused by
  absent lazy selection and palette behavior.

### Task 3: Generate and validate the world materials

**Files:**
- Create: `client/public/art/terrain-material-obsidian-caldera.webp`
- Create: `client/public/art/terrain-material-glassstorm-expanse.webp`
- Modify: `e2e/terrain-material.spec.ts`
- Modify: `docs/ART_PROVENANCE.md`

**Interfaces:**
- Produces: two base-relative opaque 256x256 material assets named by the catalog.

- [x] **Step 1: Generate one source per world**

  Use the built-in image-generation tool with the existing material as a
  style/scale reference. Obsidian requests black glass/basalt with restrained
  ember seams; Glassstorm requests pale salt/crystal crust with cool mineral
  fractures. Prohibit objects, scenery, text, symbols, logos, UI, and watermark.

- [x] **Step 2: Encode and inspect the production tiles**

  Center-crop square, downsample to 256x256, make opposite edges continuous,
  encode opaque WebP, and inspect at original and tiled scale.

- [x] **Step 3: Extend production asset RED/GREEN contracts**

  Table-drive all three assets through MIME, dimensions, opacity, byte size,
  luminance deviation, and edge-continuity checks. Use deterministic seeds 4, 8,
  and 1 to prove only the matching selected material is requested and the three
  rendered ground signatures differ.

### Task 4: Implement the minimal complete-world profile

**Files:**
- Modify: `client/src/renderer/BattlefieldBackdrop.ts`
- Modify: `client/src/renderer/TerrainMaterial.ts`
- Modify: `client/src/renderer/TerrainRenderer.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Modify: `client/src/renderer/selectClientBattlefield.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- `BattlefieldWorld` remains the selected immutable profile.
- `TerrainMaterial.select(asset)` begins one fail-soft load; `reset()` retires it.
- `TerrainRenderer.selectWorld(world)` converts palette values once, selects the
  material, and dirties the cache; `reset()` retires the material and cache.
- `Renderer.selectBattlefieldWorld(terrain)` selects once and routes one profile.

- [x] **Step 1: Enrich the immutable world catalog**

  Add the three literal palettes and material asset paths. Preserve the selector
  algorithm and catalog order so existing seed-to-world fixtures do not drift.

- [x] **Step 2: Make material decoding lazy and generation-safe**

  Move image creation, handler registration, timeout, decode, and URL assignment
  into `select`. Reset must clear timeout/state and increment a generation token;
  every callback must verify generation and image identity before mutation.

- [x] **Step 3: Apply palette and material through terrain caching**

  Replace module-global terrain RGB arrays with one per-instance selected palette.
  Keep existing depth ramp, strata interpolation, material modulation, bevel order,
  alpha, and bitmap immutability. Selection and ready material each force one
  rebuild; stable frames remain cached.

- [x] **Step 4: Route the pristine complete-world selection**

  Rename the orchestration seam to complete-world terminology, have Renderer pass
  the exact profile returned by backdrop selection to terrain, and preserve the
  pristine-only `GameClient` capability boundary in `main.ts`.

- [x] **Step 5: Run focused GREEN and mutation checks**

  Run all five focused unit files plus typecheck. Mutate the material field,
  pristine getter, reset generation, palette branch, and cache invalidation in
  turn; each must be killed by a named test.

### Task 5: Visual review, documentation, and governed delivery

**Files:**
- Modify: `docs/PLAYING.md`
- Modify: `docs/UI_SYSTEM.md`
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

- [x] **Step 1: Inspect all assets and live worlds**

  Review each source/production tile and desktop/Pixel landscape captures for
  Ember, Obsidian, and Glassstorm. Confirm distinct identity, tank/trajectory
  contrast, crater/bevel readability, fitted layout, and no obvious tiling.

- [x] **Step 2: Run complete local gates**

  Run client coverage, `npm run check`, Edge tests, production build, full E2E,
  dependency audit, diff hygiene, state-free secret scan, and localhost hygiene.

- [x] **Step 3: Clear one designated adversarial review**

  Supply the exact spec, plan, sprint log, tests, asset metadata/captures, and final
  diff. Resolve every Critical, High, Important, Medium, visual, lifecycle,
  determinism, performance, accessibility, governance, and merge-blocking finding.

- [ ] **Step 4: Commit, PR, exact-head CI, merge, and deploy**

  Mark `art.feature.0003` done after local review, route through `$ca-commit` and
  `$ca-pr`, preserve the branch/worktree, log the PR-specific merge override only
  after the behavior head is green, require the final receipt head to re-clear CI
  and review, squash merge, and prove Pages provenance plus live smoke.

# Authored Battlefield Worlds Implementation Plan

> **For agentic workers:** use the repository's test-first and verification gates
> for each task. Every non-hard decision is SMARTS-scored in the sprint log.

**Goal:** Turn the single live backdrop into three coherent authored worlds without
changing deterministic gameplay or network contracts.

**Architecture:** A pure client selector hashes the initial terrain into a typed
world catalog. `BattlefieldBackdrop` freezes that selection until renderer reset,
loads only the chosen bitmap, rejects stale callbacks, and paints an
aspect-preserving center crop behind the unchanged live battlefield layers.

**Tech stack:** TypeScript, Canvas 2D, Vite public assets, Vitest, Playwright,
built-in image generation, local image encoding.

## Global constraints

- Client presentation only; `shared/`, Supabase, action logs, physics, terrain
  generation, and gameplay coordinates are immutable.
- Three opaque 2:1 WebPs, each at least 1536px wide and at most 500,000 bytes.
- No dependency or lockfile change and no paid asset/service usage.
- No runtime randomness; one selection and one image allocation per game.
- Procedural atmosphere remains the complete unselected/loading/error fallback.

---

### Task 1: Pin the world system in RED

**Files:**
- Modify: `client/src/renderer/BattlefieldBackdrop.test.ts`
- Modify: `client/src/renderer/Renderer.battlefieldBackdrop.test.ts`
- Modify: `e2e/battlefield-backdrop.spec.ts`

- [x] **Step 1: Add failing catalog and selector contracts**

  Require three unique typed entries, deterministic same-terrain selection,
  reachability across fixtures, one frozen choice per game, reset reselection,
  and stale callback isolation.

- [x] **Step 2: Add failing crop and asset contracts**

  Require aspect-preserving full-source mapping on the current 2:1 canvas,
  center-cover fallback geometry, and all three bounded opaque 2:1 WebPs through
  production URLs.

- [x] **Step 3: Record causal RED**

  Run focused Vitest and Playwright. Failures must identify the absent catalog,
  lifecycle, crop, and asset behavior rather than unrelated setup.

### Task 2: Generate and integrate the worlds

**Files:**
- Create: `client/public/art/battlefield-obsidian-caldera.webp`
- Create: `client/public/art/battlefield-glassstorm-expanse.webp`
- Modify: `client/src/renderer/BattlefieldBackdrop.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Modify: `docs/PLAYING.md`
- Create: `docs/ART_PROVENANCE.md`

- [x] **Step 1: Generate and inspect two source panoramas**

  Use one production prompt per world, matching the established illustrated
  realism while enforcing center-safe 2:1 composition and every prohibited
  foreground/baked-game element. Inspect each source before conversion.

- [x] **Step 2: Optimize and validate project assets**

  Convert to opaque WebP without distortion; verify exact ratio, dimensions,
  byte cap, alpha, composition, and visual distinction.

- [x] **Step 3: Implement the minimal catalog and lifecycle**

  Add the pure selector, lazy selected-image load, frozen match choice, generation
  token for stale callbacks, reset, base-aware URL, and fail-soft state.

- [x] **Step 4: Preserve panorama geometry**

  Compute one source rectangle that preserves the matching 2:1 panorama in full,
  with a centered cover crop only for a future ratio mismatch; keep all live
  sky/game layers unchanged.

- [x] **Step 5: Document and observe focused GREEN**

  Record generated-art prompt/tool provenance and player behavior, then run the
  focused unit, type, asset, and browser suites.

### Task 3: Visual review and governed delivery

**Files:**
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

- [x] **Step 1: Inspect every authored asset and live composition**

  Review raw panoramas and production desktop/Pixel landscape captures. Confirm
  distinct identity, center crop, foreground readability, fit, and no scrolling.

- [x] **Step 2: Run complete local gates**

  Run client coverage, `npm run check`, Edge tests, build, full E2E, audit, diff
  hygiene, state-free secret scan, and localhost hygiene.

- [x] **Step 3: Clear one designated adversarial review**

  Supply exact spec/plan/diff, RED/GREEN evidence, asset metadata, and captures.
  Resolve every Critical, High, Important/Medium, visual, lifecycle, determinism,
  performance, accessibility, governance, and merge-blocking finding.

- [ ] **Step 4: Commit, PR, exact-head CI, merge, and deploy**

  Mark `art.feature.0002` done after local review, route through `$ca-commit` and
  `$ca-pr`, preserve the branch/worktree, log the PR-specific merge override only
  after the behavior head is green, require the final receipt head to re-clear CI
  and review, squash merge, and prove Pages provenance plus live smoke.

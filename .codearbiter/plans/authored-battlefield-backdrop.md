# Authored Battlefield Backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weakest live-world procedural art with one cached,
high-quality authored raster panorama without changing gameplay.

**Architecture:** A presentation-only `BattlefieldBackdrop` owns one browser
image and exposes a three-state load contract plus a fitted Canvas draw. The
existing renderer keeps its gradient as a base, uses the current procedural
clouds/ridges until the image is ready, then substitutes the authored panorama
while retaining dynamic sky cues and every live gameplay layer.

**Tech Stack:** TypeScript, Canvas 2D, Vite public assets, Vitest, Playwright,
built-in image generation, local ffmpeg WebP encoding.

## Global Constraints

- Client presentation only; do not change `shared/`, Supabase, action logs,
  physics, gameplay coordinates, or layout.
- Final project asset: `client/public/art/battlefield-backdrop.webp`, exactly
  2:1, at most 500,000 bytes, and visually opaque.
- No baked tanks, projectiles, explosions, text, UI, sun, or foreground terrain.
- Existing procedural atmosphere remains the complete loading/error fallback.
- No repository dependency or lockfile change; no merge or deployment.

---

### Task 1: Generate and bound the authored asset

**Files:**
- Create: `client/public/art/battlefield-backdrop.webp`
- Create: `e2e/battlefield-backdrop.spec.ts`

**Interfaces:**
- Produces: public URL `/art/battlefield-backdrop.webp`, decoded at a 2:1 ratio.
- Consumes: no production code.

- [x] **Step 1: Write the failing asset contract**

  Add a Playwright test that requests the public URL, expects HTTP 200, expects
  a WebP body no larger than 500,000 bytes, loads it through `new Image()`, and
  asserts `naturalWidth / naturalHeight === 2`.

- [x] **Step 2: Run the asset contract RED**

  Run:
  `npx playwright test e2e/battlefield-backdrop.spec.ts --project=desktop-fine`

  Expected: FAIL because the public asset returns 404.

- [x] **Step 3: Generate the source panorama**

  Use the built-in image tool with one production prompt: a wide cel-painted
  scorched-world dusk panorama in singedTerra's indigo/violet/magenta/ember
  palette, distant mesas in the lower third, open readable central sky, no
  tanks, shells, explosions, text, UI, sun, or foreground terrain.

- [x] **Step 4: Inspect and optimize**

  Inspect the generated source, preserve its native 1774x887 2:1 composition,
  encode opaque WebP with local ffmpeg, and save it at the exact public path.
  Verify dimensions, opacity, and byte length locally.

- [x] **Step 5: Run the asset contract GREEN**

  Re-run the focused Playwright command. Expected: PASS.

---

### Task 2: Add the cached fail-safe Canvas layer

**Files:**
- Create: `client/src/renderer/BattlefieldBackdrop.ts`
- Create: `client/src/renderer/BattlefieldBackdrop.test.ts`

**Interfaces:**
- Produces:
  - `type BattlefieldBackdropState = 'loading' | 'ready' | 'failed'`
  - `class BattlefieldBackdrop`
  - `get state(): BattlefieldBackdropState`
  - `get isSettled(): boolean`
  - `draw(ctx: CanvasRenderingContext2D): boolean`
- Consumes: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, Vite `BASE_URL`, and one injected
  image factory for deterministic tests.

- [x] **Step 1: Write loader lifecycle tests**

  Write tests against a controllable fake image proving: exactly one image is
  allocated; the base-aware URL is assigned; loading returns `false` without a
  draw; a valid 2:1 load becomes `ready`; ready draws once to
  `(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)`; load error and invalid aspect become
  `failed`; failed state never draws.

- [x] **Step 2: Run loader tests RED**

  Run:
  `npm -w @singedterra/client exec vitest run src/renderer/BattlefieldBackdrop.test.ts`

  Expected: FAIL because `BattlefieldBackdrop.ts` does not exist.

- [x] **Step 3: Implement the minimal loader**

  Allocate one image in the constructor, attach `onload`/`onerror` before
  assigning `src`, accept only finite positive 2:1 decoded dimensions, expose
  state without timers, and make `draw()` a no-op unless ready.

- [x] **Step 4: Run loader tests GREEN**

  Re-run the focused Vitest command. Expected: PASS.

---

### Task 3: Substitute only the procedural far-art seam

**Files:**
- Modify: `client/src/renderer/Renderer.ts`
- Create: `client/src/renderer/Renderer.battlefieldBackdrop.test.ts`

**Interfaces:**
- Consumes: `BattlefieldBackdrop.draw()` and `BattlefieldBackdrop.isSettled`.
- Produces: renderer behavior that keeps procedural clouds/ridges during
  loading/failure, replaces those two layers when ready, and keeps redraws alive
  only while loading.

- [x] **Step 1: Write renderer seam tests**

  Use a prototype-backed renderer seam with controlled backdrop/cloud/ridge
  spies. Assert: loading calls clouds+ridges and `isAnimating()` returns true;
  ready calls the bitmap draw and skips clouds+ridges; failed calls
  clouds+ridges and does not keep `isAnimating()` true.

- [x] **Step 2: Run renderer seam tests RED**

  Run:
  `npm -w @singedterra/client exec vitest run src/renderer/Renderer.battlefieldBackdrop.test.ts`

  Expected: FAIL because the renderer has no backdrop seam.

- [x] **Step 3: Integrate the backdrop**

  Add one renderer-owned `BattlefieldBackdrop`, draw it after the cached
  gradient inside the far transform, retain stars/sun/haze above it, call
  procedural clouds and middle ridges only when the bitmap did not draw, and
  treat only `loading` as live animation.

- [x] **Step 4: Run focused GREEN**

  Run both new Vitest files plus the focused Playwright asset contract. Expected:
  all pass with no warnings.

---

### Task 4: Visual QA, review, and governed delivery

**Files:**
- Modify: `.codearbiter/sprint-log.md`
- Modify: `.codearbiter/plans/authored-battlefield-backdrop.md`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: one reviewed, exact-head-green stacked PR.

- [x] **Step 1: Browser visual QA**

  Open hot-seat play at desktop, touch, and small-window profiles. Verify the
  panorama is visibly loaded, foreground terrain/tanks/HUD remain legible, and
  document dimensions equal viewport dimensions.

- [x] **Step 2: Run adversarial review**

  Review asset quality, contrast, transfer size, caching, failure fallback,
  base-path behavior, idle-render behavior, accessibility, and scope. Resolve
  every actionable blocker test-first.

- [x] **Step 3: Run the complete local gate**

  Run `npm run check`, `npm run coverage:client`, `npm run check:edge`,
  `npm run build`, `npm run test:e2e`,
  `npm audit --audit-level=moderate`, `git diff --check`, conflict-marker scan,
  and changed-line secret scan.

- [x] **Step 4: Governed commit and PR**

  Stage the exact reviewed manifest, commit through the codeArbiter gate, push,
  and open a ready PR against `codex/reflective-sidewalls`.

- [ ] **Step 5: Exact-head hosted proof**

  Require CI, Edge, rendering E2E, CodeQL workflow, and repository CodeQL to
  succeed on the exact final governance receipt head. Supabase Preview may be
  skipped because this slice has no backend change. Do not merge or deploy.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `client/src/renderer/BattlefieldBackdrop.ts`, `client/src/renderer/Renderer.battlefieldBackdrop.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `49f9f0854aa4` (docs(governance): record authored backdrop PR). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.

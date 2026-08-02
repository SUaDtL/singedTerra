# Impact Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one fail-soft screen-space impact monitor that magnifies every live detonation without changing battlefield coordinates or game state.

**Architecture:** Pure helpers select a burst and calculate a clamped 144 by 88 source crop. A focused painter owns one reusable 220 by 136 offscreen composite, scales the crop proportionally into its 198 by 121 content viewport, completes all chrome offscreen, and then touches the game canvas once after the world transform is restored. Renderer provides only existing presentation bursts and current recoil offset.

**Tech Stack:** TypeScript, Canvas 2D, Vitest 4, Playwright, existing renderer palette and deterministic harnesses. No new dependency.

## Global Constraints

- Keep the main battlefield, aim coordinates, damage reach, duration, turn state, shared engine, replay, network, and backend unchanged.
- Suppress the duplicated monitor for reduced motion while retaining the normal explosion.
- Allocate the scratch canvas once and fail soft on every unavailable canvas path.
- Keep the exact 220 by 136 outer frame and proportional 144 by 88 source to 198 by 121 content mapping inside the 1200 by 600 canvas.

---

### Task 1: Pure focus and geometry contract

**Files:**
- Create: `client/src/renderer/impactMonitor.ts`
- Create: `client/src/renderer/impactMonitorGeometry.test.ts`

**Interfaces:**
- Produces: `selectImpactMonitorFocus(bursts): ImpactMonitorFocus | null`.
- Produces: `getImpactMonitorGeometry(focus, worldOffset): ImpactMonitorGeometry | null`.
- `ImpactMonitorFocus` carries finite `cx`, `cy`, `reachRadius`, `age`, and `lifeFrames`.
- `ImpactMonitorGeometry` carries exact source and destination rectangles plus the shifted focus point.

- [x] **Step 1: Write failing pure tests** for empty input, malformed values,
  largest-radius selection, newest equal-radius selection, recoil translation,
  center geometry, and all four clamped world edges.
- [x] **Step 2: Run RED** with
  `npm exec --workspace client vitest run src/renderer/impactMonitorGeometry.test.ts` and
  require failure because the module does not exist.
- [x] **Step 3: Implement the minimal helpers** with finite-number guards,
  deterministic selection, `CANVAS_WIDTH`/`CANVAS_HEIGHT` bounds, source size
  `144x88`, content size `198x121`, outer-frame size `220x136`, and top margin `18`.
- [x] **Step 4: Run the focused file GREEN** and inspect exact returned rectangles.

### Task 2: Reusable fail-soft painter

**Files:**
- Create: `client/src/renderer/ImpactMonitorPainter.ts`
- Create: `client/src/renderer/ImpactMonitorPainter.test.ts`

**Interfaces:**
- Consumes: `ImpactMonitorGeometry` from Task 1.
- Produces: `ImpactMonitor.draw(ctx, geometry, reduceMotion): boolean`.
- Constructor accepts an injectable `ImpactMonitorCanvasFactory` for deterministic tests.

- [x] **Step 1: Write failing painter tests** proving one constructor allocation,
  no draw for reduced motion or null geometry, source canvas copied to the
  scratch buffer before the scratch buffer is painted to the game context,
  proportional clip geometry, palette frame/label, and balanced restore on
  source-copy or final-paint failure.
- [x] **Step 2: Run RED** with
  `npm exec --workspace client vitest run src/renderer/ImpactMonitorPainter.test.ts` and
  require failure because the painter does not exist.
- [x] **Step 3: Implement the minimal painter** using one `220x136` offscreen
  composite, one cached 2D context, `clearRect`, bounded `drawImage`, rounded
  clip, double-line dusk/gold frame, and `IMPACT MONITOR` label. Only the final
  complete composite may touch the game canvas.
- [x] **Step 4: Run Tasks 1 and 2 GREEN** and require balanced context state on
  every return path.

### Task 3: Renderer integration and real route

**Files:**
- Modify: `client/src/renderer/Renderer.ts`
- Create: `client/src/renderer/Renderer.impactMonitor.test.ts`
- Create: `e2e/impact-monitor.spec.ts`

**Interfaces:**
- Consumes: existing renderer `Burst[]`, `REST_DEPTH_PARALLAX`, and the current
  `depth.world` recoil offset.
- Produces: one screen-space monitor draw after the world `ctx.restore()` and
  before `hud.draw()`.

- [x] **Step 1: Write failing renderer tests** proving no monitor without a
  burst, largest/newest focus selection, current world-recoil translation, and
  reduced-motion suppression.
- [x] **Step 2: Write the browser validation contract after renderer RED** that starts a real hot-seat
  game, fires Baby Missile, and observes a scratch-canvas composite into `#game`
  with exact source and destination geometry in all three Playwright projects.
- [x] **Step 3: Run focused RED** at the renderer boundary before production integration.
- [x] **Step 4: Integrate the painter minimally**, reset no gameplay state, and
  keep it outside every world transform so input coordinates remain unchanged.
- [x] **Step 5: Run focused GREEN** for pure, painter, renderer, existing
  explosion/reach/hit-stop tests, and the three-project browser route.

### Task 4: Review, verify, and land

**Files:**
- Modify only governed task, plan, sprint, and override artifacts required by the lane.

- [x] **Step 1: Send the spec, plan, sprint log, tests, and complete diff to the
  designated adversary; resolve every Critical, High, Medium, Important,
  coverage, and merge-blocking finding.**
  - [x] Initial adversary found one Medium partial-overlay failure path.
  - [x] Remediation RED proved the complete-frame/atomic-target contract.
  - [x] Adversary follow-up clears the remediated exact diff.
- [x] **Step 2: Run full verification:** client coverage, `npm run check`,
  `npm run check:edge`, `npm run build`, `npm run test:e2e`,
  `npm run audit:deps`, `git diff --check`, state-free secret scan, and watched
  localhost-port proof.
- [x] **Step 3: Commit through `$ca-commit` and open a ready PR through `$ca-pr`.**
- [ ] **Step 4: Require exact-head hosted CI and CodeQL, log the PR-specific
  merge override, obtain final exact-head adversarial clearance, squash merge,
  and prove exact-SHA Pages provenance plus live smoke.**

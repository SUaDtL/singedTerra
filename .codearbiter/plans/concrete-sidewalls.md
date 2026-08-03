# Concrete Sidewalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic concrete sidewall impacts as an opt-in room rule
with parity across live play, AI prediction, room lifecycle, and presentation.

**Architecture:** Extend the existing `WallMode` and shared swept wall contact.
`GameEngine` converts only concrete contacts into the existing ground-impact
path at the wall coordinate; `AiShotSearch` returns the same endpoint. Existing
wall-impact presentation is made mode-aware without changing the action log.

**Tech Stack:** TypeScript, deterministic fixed-step shared engine, Canvas 2D,
Web Audio, Vitest/jsdom, Deno tests, and Playwright.

## Global Constraints

- `Open` remains the default; invalid values normalize to `open`.
- Concrete consumes no second movement segment and detonates at exact contact.
- Live and AI paths share the existing wall-contact primitive.
- No dependencies, migrations, auth, service-boundary, or action-log changes.
- Existing open, reflective, and wrap behavior must remain green.

---

### Task 1: Deterministic concrete impact

**Files:**
- Modify: `scripts/checks/walls.mjs`
- Modify: `shared/src/types/GameOptions.ts`
- Modify: `shared/src/engine/Physics.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `shared/src/engine/AiShotSearch.ts`
- Modify: `client/src/renderer/aimGuide.ts`
- Modify: `client/src/renderer/aimGuide.test.ts`

- [x] Write failing harness cases for left/right concrete contact, same-tick
  detonation, and live/AI endpoint parity.
- [x] Run `npx tsx scripts/checks/walls.mjs` and record the expected RED caused
  by concrete normalizing to open or being treated as an unhandled wall.
- [x] Extend normalization and collision branching so concrete reports the
  existing exact wall contact without changing other modes.
- [x] Convert only the concrete wall result to the existing ground-impact path
  at `{ x: hit.x, y: hit.y }`; preserve wall impact recording and explosion
  semantics.
- [x] Add the AI concrete endpoint branch and aim-guide first-contact stop.
- [x] Run the focused wall harness, aim-guide tests, and shared/client typecheck.

### Task 2: Room-option lifecycle

**Files:**
- Modify: `client/src/ui/lobbyValidation.ts`
- Modify: `client/src/ui/lobbyValidation.test.ts`
- Modify: `client/src/client/LobbyTransport.ts`
- Modify: `client/src/client/NetworkClient.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.network.test.ts`
- Modify: `client/src/ui/Lobby.rejoin.test.ts`
- Modify: `supabase/functions/create_room/validate.ts`
- Modify: `supabase/functions/create_room/validate.test.ts`
- Modify: `supabase/functions/restart_game/index.ts`
- Modify: `supabase/functions/restart_game/restart_game.test.ts`

- [x] Add RED assertions that concrete survives hot-seat parsing, online
  creation, rejoin, rematch, and Edge normalization while invalid values become
  open.
- [x] Run focused client and Edge tests and verify the intended RED.
- [x] Add concrete to the existing exhaustive wall-mode predicates and lobby
  selector while preserving blank/open omission behavior.
- [x] Run focused client and Edge tests, then typecheck.

### Task 3: Concrete presentation and browser proof

**Files:**
- Modify: `client/src/renderer/sidewallVisuals.ts`
- Modify: `client/src/renderer/sidewallVisuals.test.ts`
- Modify: `client/src/audio/AudioEngine.ts`
- Modify: `client/src/audio/AudioEngine.wallReflect.test.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Modify: `client/src/main.ts`
- Modify: `e2e/wrap-sidewalls.spec.ts`

- [x] Add RED assertions for amber concrete rails, one contacted-edge accent,
  reduced-motion suppression, and a distinct audio profile.
- [x] Implement mode-aware concrete styling and bounded audio using existing
  Canvas/Web Audio seams; retain reflective and wrap visuals byte-for-byte in
  behavior.
- [x] Extend the production browser oracle to select Concrete, verify both
  rails and no-scroll behavior on desktop and coarse-pointer landscape.
- [x] Run focused presentation tests and the production browser oracle.

### Task 4: Full verification and review package

**Files:**
- Modify: `.codearbiter/plans/concrete-sidewalls.md`
- Append: `.codearbiter/sprint-log.md`

- [x] Run `npm run check`, `npm run test:client`, `npm run coverage:client`,
  `npm run check:edge`, `npm run test:e2e`, `npm run build`,
  `npm audit --audit-level=high`, `git diff --check`, conflict-marker scan,
  and state-free secret scan.
- [x] Package the spec, plan, sprint log, tests, and exact final diff for one
  adversarial reviewer; resolve every Critical, High, Important, and other
  merge-blocking finding and obtain a clean re-review.
- [ ] Complete commit/PR gates, exact-head hosted CI, and deployment only if
  this slice changes a deployed surface; merge remains governed by standing
  authority after all gates are green.

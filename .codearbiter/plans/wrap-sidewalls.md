# Wrap Sidewalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic cross-edge projectile transfer as an opt-in room
rule with complete engine, AI, lobby, visual, audio, and browser coverage.

**Architecture:** Extend the existing `WallMode` seam with `wrap`. A shared
physics helper owns endpoint mapping and the entry-side swept collision so live
execution and CPU prediction cannot drift. Existing wall-contact events drive
mode-aware Canvas and procedural-audio feedback.

**Tech Stack:** TypeScript, deterministic fixed-step shared engine, Canvas 2D,
Web Audio, Vitest/jsdom, Deno tests, Playwright, Supabase room-options JSON.

## Global Constraints

- `Open` remains the default; missing and invalid wall values normalize to
  `open`.
- Wrapping preserves all projectile state except horizontal position.
- Entry-side remainder collision resolves in the same fixed tick.
- Live and AI paths use one shared transit primitive.
- The aim guide stops at the first portal contact.
- No dependencies, migrations, auth changes, merge, or deployment.

## Status Ledger

| Task | Status |
|---|---|
| 1. Deterministic transit contract | ACCEPTED |
| 2. Room-option plumbing | ACCEPTED |
| 3. Portal presentation and audio | ACCEPTED |
| 4. Production-browser acceptance and delivery gates | IN PROGRESS |

---

### Task 1: Deterministic transit contract

**Files:**
- Modify: `scripts/checks/walls.mjs`
- Modify: `shared/src/types/GameOptions.ts`
- Modify: `shared/src/engine/Physics.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `shared/src/engine/AiShotSearch.ts`
- Modify: `client/src/renderer/aimGuide.ts`
- Modify: `client/src/renderer/aimGuide.test.ts`
- Modify: `client/src/renderer/ProjectileRenderer.test.ts`

**Interfaces:**
- Produces: `WallMode = 'open' | 'reflective' | 'wrap'`
- Produces: wall collisions with deterministic `remainingX` / `remainingY`
- Produces: `wrapSideWall(projectile, hit, terrain, tanks):
  CollisionResult`
- Consumes: existing `sweepCollide`, `WallImpactEvent`, and
  `MAX_FLIGHT_TICKS`

- [x] **Step 1: Write the failing wrap harness**

Extend `walls.mjs` with left/right transfer, preserved velocity/age, and an
entry-side collision:

```js
const shot = projectile({ x: 1, y: 80, vx: -4, vy: 1 });
const { engine, state } = engineWith('wrap', shot);
engine.tick();
check(state.projectiles.length === 1, 'wrap keeps the shot in flight');
check(shot.x > CANVAS_WIDTH - 10, 'left exit enters at the right rail');
check(shot.vx === -4, 'wrap preserves horizontal velocity');
```

- [x] **Step 2: Run the harness and verify RED**

Run: `npx tsx scripts/checks/walls.mjs`

Expected: FAIL because `wrap` normalizes to `open` and removes the projectile.

- [x] **Step 3: Add the shared wrap primitive**

Implement one helper in `Physics.ts`:

```ts
export function wrapSideWall(
  p: ProjectileState,
  hit: Extract<CollisionResult, { type: 'wall' }>,
  terrain: Uint8Array,
  tanks: readonly TankState[],
): CollisionResult {
  const entryX = hit.side === 'left' ? CANVAS_WIDTH - WALL_INSET : WALL_INSET;
  p.x = entryX + (hit.remainingX ?? 0);
  p.y = hit.y + (hit.remainingY ?? 0);
  return sweepCollide(p, entryX, hit.y, terrain, tanks, 'open');
}
```

Make `collide` return a wall contact for both `reflective` and `wrap`.
When `sweepCollide` finds that contact, attach the exact unconsumed
post-contact segment before snapping the projectile to the hit point.

- [x] **Step 4: Thread live and AI execution through the helper**

In `GameEngine`, record the wall contact, then reflect or wrap based on
`state.walls`. If the wrap entry sweep returns ground/tank, feed that result
through the existing impact path in the same tick.

In `AiShotSearch`, use the same helper and score the same entry collision/live
flight-cap endpoint.

- [x] **Step 5: Pin guide and trail behavior**

Add an aim-guide assertion that the last point is the first wrap rail and that
no adjacent points span more than the guide cap. Extend the projectile-history
test so a right-to-left wrap clears prior samples instead of painting a
cross-map streak.

- [x] **Step 6: Verify Task 1 GREEN**

Run:

```text
npx tsx scripts/checks/walls.mjs
npm -w @singedterra/client run test -- src/renderer/aimGuide.test.ts src/renderer/ProjectileRenderer.test.ts
npm run typecheck
```

Expected: all pass with open and reflective assertions unchanged.

### Task 2: Room-option plumbing

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

**Interfaces:**
- Consumes: `WallMode`
- Produces: normalized `wrap` in hot-seat `GameOptions`, online room JSON,
  `NetworkClient` initialization, rejoin, and rematch

- [x] **Step 1: Write failing normalization and transport tests**

Add exact assertions:

```ts
expect(coerceSettings(blankRaw({ walls: 'wrap' }))).toEqual({ walls: 'wrap' });
expect(coerceSettings(blankRaw({ walls: 'lava' }))).toBeUndefined();
```

Assert online create sends `options.walls === 'wrap'`, rejoin emits
`GameOptions.walls === 'wrap'`, and rematch preserves `wrap`.

- [x] **Step 2: Run focused option tests and verify RED**

Run:

```text
npm -w @singedterra/client run test -- src/ui/lobbyValidation.test.ts src/ui/Lobby.network.test.ts src/ui/Lobby.rejoin.test.ts
deno test --allow-env supabase/functions/create_room/validate.test.ts supabase/functions/restart_game/restart_game.test.ts
```

Expected: wrap assertions fail because every current boundary only admits
`reflective`.

- [x] **Step 3: Implement exhaustive wall normalization**

Use one explicit predicate per runtime:

```ts
const isWallMode = (value: unknown): value is WallMode =>
  value === 'open' || value === 'reflective' || value === 'wrap';
```

Preserve the existing omission behavior where blank hot-seat settings mean
engine default `open`.

- [x] **Step 4: Add the selectable lobby option**

Both setup flows expose:

```ts
[
  { value: '', label: 'Open — shots exit' },
  { value: 'reflective', label: 'Reflective — bank shots' },
  { value: 'wrap', label: 'Wrap — cross the arena' },
]
```

Keep the field inside the existing advanced section and retain native label,
focus, and keyboard behavior.

- [x] **Step 5: Verify Task 2 GREEN**

Run the focused client and Deno commands from Step 2. Expected: all pass.

### Task 3: Portal presentation and audio

**Files:**
- Modify: `client/src/renderer/sidewallVisuals.ts`
- Modify: `client/src/renderer/sidewallVisuals.test.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Modify: `client/src/audio/AudioEngine.ts`
- Modify: `client/src/audio/AudioEngine.test.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Produces: `drawSidewalls(ctx, walls, contacts, reduceMotion)`
- Produces: `RendererEvents.onWallImpact(side, walls)`
- Produces: `AudioEngine.wallContact(walls, side)`

- [x] **Step 1: Write failing visual and audio tests**

Assert wrap draws two static rails, contact accents appear at both paired edges,
reduced motion keeps rails but removes accents, and wrap uses a lower,
two-stage procedural tone than reflective mode.

```ts
drawSidewalls(ctx, 'wrap', [{ ...event(1), age: 0 }], false);
expect(ops.filter((op) => op === 'stroke')).toHaveLength(2);
expect(ops.filter((op) => op === 'fillRect').length).toBeGreaterThanOrEqual(2);
```

- [x] **Step 2: Run focused presentation tests and verify RED**

Run:

```text
npm -w @singedterra/client run test -- src/renderer/sidewallVisuals.test.ts src/audio/AudioEngine.test.ts
```

Expected: FAIL because only reflective rails and `wallReflect` exist.

- [x] **Step 3: Implement mode-aware portal rails and contact accents**

Rename the renderer helper to `drawSidewalls`. Preserve reflective styling
byte-for-byte. Add violet paired rails for wrap and draw each accepted contact
at both the exit and entry edge. Keep all effects bounded to the existing
18-frame contact lifetime.

- [x] **Step 4: Implement the procedural wrap cue**

Pass the immutable wall mode through the renderer event sink. Retain the
reflective ricochet profile and add a short wrap profile using existing Web
Audio nodes only. Invalid/open contacts produce no cue.

- [x] **Step 5: Verify Task 3 GREEN**

Run the focused presentation tests plus `npm run typecheck`. Expected: all
pass with no warning output.

### Task 4: Production-browser acceptance and delivery gates

**Files:**
- Create: `e2e/wrap-sidewalls.spec.ts`
- Modify: `.codearbiter/plans/wrap-sidewalls.md`
- Append: `.codearbiter/sprint-log.md`

**Interfaces:**
- Consumes: production Vite build, hot-seat setup, Canvas pixel inspection
- Produces: exact browser evidence for desktop and coarse-pointer landscape

- [x] **Step 1: Write the browser acceptance before final styling**

The test selects `Wrap — cross the arena`, starts hot-seat play, and asserts:

```ts
expect(await page.locator('body').evaluate((body) =>
  body.scrollHeight <= window.innerHeight + 1
)).toBe(true);
expect(await countPortalPixels(page.locator('#game-canvas'))).toBeGreaterThan(500);
```

Run the test before final styling and record the expected RED pixel failure.

- [x] **Step 2: Make the browser oracle GREEN**

Adjust only portal styling and responsive containment required by the browser
evidence. Do not change projectile or room semantics during this step.

- [x] **Step 3: Run the complete verification matrix**

Run:

```text
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run test:e2e
npm run build
npm audit --audit-level=high
git diff --check
```

Also scan the diff for secrets and unresolved conflict markers.

- [x] **Step 4: Run adversarial review and correct findings**

Dispatch one adversarial reviewer against the exact branch diff. Correct every
Critical/High finding and rerun affected tests. Re-review the corrected exact
head.

- [ ] **Step 5: Commit, open the PR, and prove hosted green**

Complete the codeArbiter commit gate, push `codex/wrap-sidewalls`, open a ready
PR against `main`, and watch required CI/CodeQL on the exact reviewed head.
Leave the PR unmerged and do not deploy.

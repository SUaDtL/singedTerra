# Deterministic Terrain Hazards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic opt-in lava terrain mode with lethal contact and distinct rendering while preserving legacy replay parity.

**Architecture:** Extend the shared terrain bitmap contract with `AIR=0`, `SOLID=1`, and `LAVA=2`. A pure seeded placement helper marks bounded exposed pools after normal bitmap generation. Collision returns a typed ground material so the engine can apply the existing resolution path with a one-shot lava hazard effect; deformation clears lava and Dirt Bomb writes only ordinary solid. `GameOptions` and every existing client/Edge normalization seam carry only the `hazards` enum, while the renderer maps value 2 to a lava palette.

**Tech Stack:** TypeScript shared engine, Supabase option JSONB/Edge validation, Canvas 2D, deterministic `.mjs` harnesses, Vitest/jsdom.

## Global Constraints

- `hazards` accepts only `none` or `lava`; malformed and omitted values normalize to `none`.
- Lava network rooms negotiate ruleset v3; no-hazard rooms remain compatible with v1/v2.
- Existing `0`/`1` terrain and action logs remain replay-compatible and byte-identical when hazards are `none`.
- Lava placement uses only the existing seed and round seed. No `Math.random()`, wall clock, new action, auth, persistence, migration, secret, or dependency.
- Lava contact is resolved through the existing deterministic engine path; no server-authoritative physics is introduced.

---

### Task 1: Terrain pixel contract and lava placement

**Files:**
- Modify: `shared/src/engine/Terrain.ts`
- Test: `scripts/checks/terrain_hazards.mjs`

**Interfaces:**
- Export `AIR_PIXEL = 0`, `SOLID_PIXEL = 1`, `LAVA_PIXEL = 2`, `TerrainHazardMode = 'none' | 'lava'`, `normalizeTerrainHazardMode(value: unknown)`, and `applyTerrainHazards(bitmap, seed, mode)`.
- `applyTerrainHazards` mutates only valid ordinary solid pixels, returns the number of lava pixels written, and is byte-identical for `none`.

- [x] Write failing harness assertions for constants, normalization, same-seed byte parity, no-spawn-corridor placement, and bounded lava output.
- [x] Run `npx tsx scripts/checks/terrain_hazards.mjs` and observe the missing exports/failure.
- [x] Implement deterministic placement from a local seed mixer, with two to four contiguous pools in columns 280 through 920 and exposed top pixels.
- [x] Re-run the harness and verify all placement and legacy assertions pass.

### Task 2: Engine collision, deformation, and state parity

**Files:**
- Modify: `shared/src/types/GameOptions.ts`
- Modify: `shared/src/types/GameState.ts`
- Modify: `shared/src/engine/Physics.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `shared/src/net/replay.ts` only if the existing state clone/option seam requires it
- Test: `scripts/checks/terrain_hazards.mjs`
- Test: `scripts/checks/determinism.mjs` if clone digest coverage needs extension

**Interfaces:**
- `CollisionResult` returns `material: 'ground' | 'lava'` on terrain hits while retaining `type: 'ground'` for replay compatibility.
- `GameEngine` applies one deterministic lethal lava contact per tank-resolution pass, preserves lava through settle, clears it through ordinary deform, and regenerates it from `options.hazards` for every round.

- [x] Add RED assertions for lava projectile impact, lethal tank contact, Dirt Bomb ordinary fill, blast clearing, collapse support, and clone/replay parity.
- [x] Run the focused harness and confirm the old engine does not distinguish lava.
- [x] Implement the minimal material-aware collision and hazard-resolution path, replacing hard-coded `=== 1` checks with the named pixel constants where needed.
- [x] Run the focused harness and `npm run check`; confirm legacy and lava modes are both deterministic.

### Task 3: Option transport and renderer

**Files:**
- Modify: `client/src/client/gameEngineOptions.ts`
- Modify: `client/src/client/LobbyTransport.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/client/NetworkClient.ts`
- Modify: `supabase/functions/_shared/ruleset.ts` or existing option validator seam
- Modify: `supabase/functions/create_room/index.ts` and `restart_game/index.ts` only if their existing stored-option normalization requires it
- Modify: `client/src/renderer/TerrainRenderer.ts`
- Test: focused client/Edge/renderer tests plus `scripts/checks/terrain_hazards.mjs`

- [x] Write RED tests for lobby selection, stored/rejoin/rematch normalization, and a lava-pixel renderer color distinct from ordinary terrain.
- [x] Run the focused client and Edge tests and observe missing transport/render behavior.
- [x] Implement an opt-in lobby toggle, carry the normalized enum through existing option JSON, and paint value 2 with the lava palette without changing ordinary terrain.
- [x] Re-run focused tests and verify hot-seat, network, rejoin, and rematch parity.

### Task 4: Full verification and governed delivery

**Files:**
- Modify: `.codearbiter/sprint-log.md`
- Modify: `.codearbiter/open-tasks.md`

- [x] Run `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `git diff --check`, and the state-free secrets scan.
- [x] Send Euler the spec, plan, sprint log, tests, and final diff; resolve every Critical, High, Medium merge blocker, and other blocking finding.
- [x] Use the commit gate, open a PR, require exact-head hosted green checks, merge under standing authority, deploy no backend changes unless the existing option code actually changes, verify production health, and close the task through a governance PR.

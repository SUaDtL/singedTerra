# Plan — Stabilize & Juice

> Status: **DRAFT — awaiting user approval** (Phase 1 gate). Spec: `specs/stabilize-and-juice.md`.
> Branch: `sprint/stabilize-and-juice`. Each task is test-first via `tdd`; `status` column is the ledger.

## Legend

- **Status:** `PENDING` → `IN_PROGRESS` → `ACCEPTED`. (subagent-driven-development updates this.)
- **Dep:** task IDs that must land first (file contention or logical order).
- **Verify:** the concrete command/obligation proving the task (maps to a spec AC).

## MVP slice

Track 1 in full (T1–T4) is the MVP — it's the foundation hardening and is fully
headless-verifiable. Track 2 (T5–T9) is the juice layer, sequenced after to avoid
`Renderer.ts` contention. The sprint ships both, but if a hard gate ever forced a cut,
Track 1 is the keep.

---

## Track 1 — Netcode hardening & test coverage

| ID | Task | Files | Dep | Verify | Status |
|----|------|-------|-----|--------|--------|
| **T1** | **Extract referee validation to a pure, DB-free, exported function** (action-shape + `endsTurn` + the three authorization regimes), behavior-preserving; the live `import.meta.main` handler calls it. | `supabase/functions/submit_action/index.ts`, `supabase/functions/_shared/mod.ts` (or a new `submit_action/validate.ts`) | — | `npm run check:edge` green incl. existing tests; `deno check` exit 0 | PENDING |
| **T2** | **Deno tests for the extracted validator** — every 400 action-shape branch; `endsTurn` true/false; "Not your turn" 403; bot-proxy 403 + `ai` bypass; per-seat-buy 403. (Red first: write against the T1 seam.) | `supabase/functions/submit_action/index.test.ts` (extend) or new `validate.test.ts` | T1 | new Deno cases red→green; `npm run check:edge` exit 0 → **AC-1** | PENDING |
| **T3** | **Extract `shouldBufferSeq` guard + apply at both buffer sites** (Realtime INSERT `~:237`, resyncLog `~:519`); drop `seq < nextExpectedSeq`. | `client/src/client/NetworkClient.ts` (+ small pure helper, e.g. `shared/src/net/` or a local export) | — | new harness `scripts/checks/resync_guard.mjs` red→green; `npm run typecheck` | PENDING |
| **T4** | **Harness: `resync_guard.mjs`** — assert buffer-when-`>=`, drop-when-`<`, and that an in-order contiguous row is never dropped. Wire into `npm run check`. | `scripts/checks/resync_guard.mjs`, `package.json` | T3 | `npm run check` includes + passes → **AC-2** | PENDING |
| **T5** | **Harness: `flightticks.mjs`** — sweep seeds × aims × heavy weapons through real flights; assert worst-case rest-tick count `< 5_000` (well under the 10k cap) and print the max observed. Wire into `npm run check`. | `scripts/checks/flightticks.mjs`, `package.json` | — | `npm run check` includes + passes; prints margin → **AC-3** | PENDING |
| **T6** | **Harness: `ai_determinism.mjs`** — two independently-seeded engines in the same state ⇒ byte-identical `computeAiPlan` across difficulties × several states. Wire into `npm run check`. | `scripts/checks/ai_determinism.mjs`, `package.json` | — | `npm run check` includes + passes → **AC-4** | PENDING |

> T1→T2 ordered (test needs the seam). T3→T4 ordered (harness tests the helper). T5, T6 are
> independent pure harnesses — fully parallel. T1, T3, T5, T6 can start concurrently (disjoint files).

---

## Track 2 — Visual & audio juice (render/audio-only)

> **`Renderer.ts` contention:** T8, T9, T10, T11 all touch `client/src/renderer/Renderer.ts`.
> They run **sequentially in that order** (NOT parallel worktrees) so edits don't collide.
> T7 (TerrainRenderer) and the `theme.ts` token adds are disjoint and can run alongside.

| ID | Task | Files | Dep | Verify | Status |
|----|------|-------|-----|--------|--------|
| **T7** | **Terrain strata coloring** — 2–3 world-y bands under the depth-ramp in `rebuild`; new band tokens in `theme.ts`; extract pure `bandForY(y)` helper. | `client/src/renderer/TerrainRenderer.ts`, `client/src/ui/theme.ts`, `scripts/checks/strata.mjs` (helper unit test) | — | `strata.mjs` red→green (band boundaries); `npm run typecheck`; visual note → **AC-5** | PENDING |
| **T8** | **Projectile smoke trail** — renderer-side ring buffer in `ProjectileRenderer` (+ `clear()`); call `projectile.clear()` from `Renderer.reset()`; index/proximity keying for splits. Extract pure `RingBuffer`. | `client/src/renderer/ProjectileRenderer.ts`, `client/src/renderer/Renderer.ts` (reset only), `scripts/checks/ringbuffer.mjs` | — | `ringbuffer.mjs` red→green; `npm run typecheck`; visual note → **AC-6** | PENDING |
| **T9** | **Explosion flash + scorch rim** — additive `'lighter'` flash scaled to radius + client-side scorch decal list on `Renderer`; `reduceMotion`-gated; reuse `parseColor`/`lighten`. Extract pure `flashIntensity(age, life, radius)`. | `client/src/renderer/Renderer.ts` (`drawExplosions`, `consumeExplosion`), `scripts/checks/flash.mjs` | T8 | `flash.mjs` red→green; `npm run typecheck`; visual note → **AC-7** | PENDING |
| **T10** | **Tank damage states + death sequence** — scorch/smoke `<33%` HP; turret-pop + wreck on alive→dead at the `trackDamage` edge; new `EffectsRenderer` spawn methods. Extract pure `damageTier(health)`. | `client/src/renderer/TankRenderer.ts`, `client/src/renderer/EffectsRenderer.ts`, `client/src/renderer/Renderer.ts` (`trackDamage`), `scripts/checks/damagetier.mjs` | T9 | `damagetier.mjs` red→green; `npm run typecheck`; visual note → **AC-8** | PENDING |
| **T11** | **Render-side audio gaps** — betty-hop tick (from `bounces` decrement), sustained napalm crackle (held source, edge-detected on `state.fire.length`), OOB fizzle (client-side projectile-vanished inference). New `RenderEventSink` hooks + `main.ts` adapter + `AudioEngine` methods. Extract pure edge-detect helpers. | `client/src/audio/AudioEngine.ts`, `client/src/renderer/Renderer.ts` (sink + emit sites), `client/src/main.ts` (adapter), `scripts/checks/audio_edges.mjs` | T10 | `audio_edges.mjs` red→green; `npm run typecheck`; manual-audio note → **AC-9** | PENDING |

---

## Coverage check (every AC has a task)

AC-1→T1+T2 · AC-2→T3+T4 · AC-3→T5 · AC-4→T6 · AC-5→T7 · AC-6→T8 · AC-7→T9 · AC-8→T10 · AC-9→T11. ✔

## Execution order (autonomous)

1. **Wave A (parallel, disjoint files):** T1, T3, T5, T6, T7.
2. **Wave B:** T2 (after T1), T4 (after T3), T8 (after — disjoint).
3. **Wave C (serial on `Renderer.ts`):** T9 → T10 → T11.
4. **Land:** `commit-gate` → `finishing-a-development-branch` (auto open-PR).

## Hard-gate watch (expected: none)

Nothing here touches auth/crypto/secrets, irreversible ops, or the trust boundary. T1 is a
*behavior-preserving extraction* (refactor), not a referee-logic change — if a subagent's
diff classifies as `feat` on the referee path, that's a signal to stop and surface, not
auto-proceed. The determinism harnesses (`npm run check`) are the standing safety net for
every Track-2 "render-only" claim.

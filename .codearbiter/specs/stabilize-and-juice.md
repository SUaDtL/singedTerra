# Sprint spec — Stabilize & Juice

> Status: **DRAFT — awaiting user approval** (Phase 1 gate, `/ca:sprint`)
> Slug: `stabilize-and-juice` · Drafted 2026-06-20
> Theme: user-selected **B (Stabilization & correctness)** + **D (Physics & visual juice)**, "safe cut".

## Goal

Two parallel, low-risk tracks that share almost no files:

1. **Track 1 — Netcode hardening & test coverage.** Close the highest-value gaps the
   "Start here" sprint left in the lockstep foundation: the Edge-Function referee has
   near-zero unit coverage, the resync buffer leaks already-applied seqs, and two
   determinism invariants (flight-tick budget, AI-plan reproducibility) have no harness
   guarding them.
2. **Track 2 — Visual & audio juice.** Pure-presentation polish that makes the game *feel*
   better without touching the deterministic engine: terrain strata, projectile smoke,
   explosion flash/scorch, tank damage/death states, and the cleanly render-side audio gaps.

## Hard scope rule (the "safe cut")

**Every change is test-only or render/audio-only.** No change alters the deterministic
`shared/` engine's *timing*, physics, or the action-log/`seq` contract. The existing
`scripts/checks/*.mjs` determinism harnesses (21 today) must stay green for the whole sprint
— they are the safety net. Two heavyweight items the user explicitly **held out** of this
sprint (animated terrain collapse; referee re-derive-the-seat) are out of scope.

### Explicit deferrals (decided at spec time, faithful to the safe cut)

- **Audio: terrain-thud vs tank-clang** — needs the engine to tag the hit surface on
  `ExplosionEvent` (the engine knows `hit.type==='ground'|'tank'` but doesn't surface it).
  That's a `shared/` change; deferred to the later "engine-signal" effort.
- **Animated terrain collapse** and **referee re-derive seat** — held out per the user's
  scope choice.

## Acceptance criteria

Each criterion becomes one `tdd` Phase-1 obligation. "Harness" = a new/extended
`scripts/checks/*.mjs` (Node/tsx, engine-only) run by `npm run check`. "Edge test" = a
`*.test.ts` under `supabase/functions/` run by `npm run check:edge` (Deno). Canvas drawing
that no headless test can assert is verified by **extracting a pure helper and unit-testing
that**, plus a manual-visual note in the receipt.

### Track 1 — Netcode hardening & test coverage

- **AC-1 Referee validation is unit-tested.** The referee's request-validation logic
  (action-shape checks, `endsTurn`, and the authorization decision for the three regimes —
  turn-gate, bot-proxy, per-seat ROUND_OVER buy) is extracted into a **pure, exported,
  DB-free** function (or small set) in a testable module, and covered by new Deno tests.
  - Extraction is behavior-preserving: the live handler calls the extracted function; the
    request/response shapes and every 400/403 path are byte-identical to today's inline logic.
  - New Deno tests assert: each malformed-action 400 branch; `endsTurn('fire')` /
    `endsTurn('use_shield')` true and others false; "Not your turn" 403; bot-proxy
    "Cannot act for another human player" 403 (and the `ai` bypass); per-seat buy
    "Can only buy for your own tank" 403.
  - `npm run check:edge` (Deno) passes; the existing `mod.test.ts` / `index.test.ts` cases
    still pass.

- **AC-2 Resync buffer drops already-applied seqs.** Incoming Realtime/echo/resync rows with
  `seq < nextExpectedSeq` are dropped instead of stored in `pendingActions` (closing the
  slow memory leak over a long match), at both insertion sites.
  - A pure guard helper (e.g. `shouldBufferSeq(incomingSeq, nextExpectedSeq)`) is extracted
    and exercised by a new harness (red→green): buffer when `seq >= next`, drop when `<`.
  - `flushPendingActions` behavior is unchanged for in-order play; no contiguous gap that
    *should* fill is ever dropped (only strictly-below-floor rows are).

- **AC-3 Flight-tick budget harness.** A new harness asserts that real ballistic flights,
  swept across a representative grid of seeds × launch aims (and the heavier weapons), reach
  rest in **well under** the `10_000`-tick `tickToCompletion` cap — with explicit headroom
  (e.g. max observed < 5_000), so the cap can never be silently hit (which would leave the
  engine in `FIRING` and desync clients).
  - Deterministic: fixed seeds, no `Math.random`/`Date`; wired into `npm run check`.
  - Reports the worst-case tick count it observed so the margin is visible.

- **AC-4 AI-plan determinism harness.** A new harness builds two independently-seeded engines
  in the *same* state and asserts `computeAiPlan` returns **byte-identical** plans (weapon,
  angle, power, buy) across difficulties and several states — locking in the
  `Object.keys`+stable-sort tie-break that CPU-seat exactly-once depends on.
  - Deterministic; wired into `npm run check`.

### Track 2 — Visual & audio juice (render/audio-only)

- **AC-5 Terrain strata coloring.** `TerrainRenderer.rebuild` renders 2–3 horizontal
  earth/rock bands keyed on world-y *underneath* the existing depth-ramp shading, so fresh
  craters expose layered cross-sections. Band colors are new `theme.ts` tokens (single source
  of truth preserved). Work stays inside `rebuild` (off the per-frame budget; only runs on
  deform). A pure band-selection helper is extracted and unit-tested (which band for a given
  world-y). `npm run typecheck` passes; manual-visual note recorded.

- **AC-6 Projectile smoke trail.** `ProjectileRenderer` keeps a **renderer-side** ring buffer
  of recent positions (never in `GameState`, never in `shared/`) and traces the true arc as
  fading smoke. Cleared on game reset via a new `clear()` called from `Renderer.reset()`.
  Handles the no-stable-id projectile case (index/proximity keying) and multi-projectile
  airburst splits without cross-contaminating trails. Pure ring-buffer logic is unit-tested;
  typecheck passes; manual-visual note recorded.

- **AC-7 Explosion light-flash + scorch rim.** A brief additive (`'lighter'`) flash scaled to
  blast radius on detonation, and a darkened crater scorch decal at the impact — both
  **render-only** (a client-side decal list on `Renderer`, not baked into the deterministic
  terrain), both gated by the existing `reduceMotion` flag. Reuses `parseColor`/`lighten`.
  Pure intensity/decay helper unit-tested; typecheck passes; manual-visual note recorded.

- **AC-8 Tank damage states + death sequence.** Driven only by authoritative `tank.health` /
  `tank.alive`: scorch/smoke when a tank is below ~33% HP, and a turret-pop + wreck/debris on
  the alive→dead transition (hooked at the existing `trackDamage` death edge). Render-only;
  no engine read beyond the already-authoritative health/alive fields. Pure damage-state
  selection helper (e.g. health→visual-tier) unit-tested; typecheck passes; manual-visual note.

- **AC-9 Render-side audio gaps.** Add the cleanly render-side sounds with **zero engine
  change**: a per-hop **bouncing-betty tick** (from `ProjectileState.bounces` decrements), a
  **sustained napalm crackle** while `state.fire` is non-empty (new looping/held audio source,
  edge-detected on `fire.length` 0↔>0), and an **OOB "fizzle"** inferred client-side
  (projectile present last frame, absent this frame, no new explosion id). New `RenderEventSink`
  hooks + `main.ts` adapter wiring; new `AudioEngine` methods. (Thud/clang deferred — see
  Deferrals.) Pure edge-detection helpers unit-tested where extractable; typecheck passes;
  manual-audio note recorded.

## Out of scope / anti-goals

- No change to physics, timestep, the action-log/`seq` contract, or `ExplosionEvent`'s shape.
- No new client test *framework* (no vitest/jest) — verification stays `tsc --noEmit` +
  extracted-helper harnesses + manual visual/audio playtest. (Adding a framework is its own
  governance decision.)
- No prod deploy as part of the sprint (Edge code lands on the branch / open-PR; no
  `supabase functions deploy`).
- No tuning of gameplay constants (damage, gravity, prices) — feel-tuning is a separate
  playtest effort.

## Verification summary

- `npm run check` — typecheck + 21 (→ +2 new) determinism harnesses, exit 0.
- `npm run check:edge` — Deno Edge-Function tests, exit 0.
- `npm run typecheck` — client+shared, exit 0.
- Manual visual/audio playtest items (AC-5..AC-9 canvas/sound) listed in the sprint receipt
  for the user's eyes — they cannot be asserted headless and are NOT claimed as auto-verified.

## Landing

Per `/ca:sprint`: `commit-gate` → `finishing-a-development-branch` auto-selects **open-PR**.
The sprint never merges to `main` and never deploys. Branch: `sprint/stabilize-and-juice`.

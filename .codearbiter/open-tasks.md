# Open tasks

In-flight and queued work. One `- ` bullet per task (the statusline and
SessionStart hook count these). Tags: [impact/effort] H/M/L · S/M/L. Items marked
(corroborated) were independently surfaced by more than one review agent.

Source: sweeping project review 2026-06-20 (5 parallel reviewers: performance,
physics/visual, backend, stabilization, feature/homage). Architectural forks from
that review live in `open-questions.md`.

## Start here (highest impact-per-effort)

- Fix `computeNextSeat` quadratic replay: it builds a fresh `GameEngine` and replays the ENTIRE action log on every fire/shield — O(turns²) full ballistic re-sims on the main thread, hitching worse as a match grows. Reuse the live engine's post-resolution seat instead of re-deriving. `client/src/client/NetworkClient.ts:711-731`. [H/M] (corroborated: perf + stabilization)
- Verify canvas sizing coherence: terrain offscreen + sky fill use 1200×600 but renderer docs still say 800×500 — if the main canvas backing store is still 800×500 the terrain blit clips/misaligns every frame AND wastes a 720k-px rebuild. Verify end-to-end first; may be a live prod bug. `shared/src/engine/Terrain.ts:21-22`, `client/src/renderer/TerrainRenderer.ts`, canvas element creation. [H/S]
- Make `seq` allocation atomic: replace read-MAX-then-insert (2 round-trips, 409-retry path) with one Postgres RPC (`INSERT ... SELECT COALESCE(MAX(seq)+1,0)`). Removes the race window and a round-trip; the `UNIQUE(room_id,seq)` stays the guard. `supabase/functions/submit_action/index.ts:217-250` + new migration. [H/M] (corroborated: perf + stabilization + backend)
- Make action-insert + cursor-advance transactional: today the action commits, then a separate cursor write can permanently fail (500) while the action is already logged → next player frozen out forever (clients don't retry "Not your turn"). Wrap both in one transaction/RPC. `supabase/functions/submit_action/index.ts:234-303`. [H/M]
- Delete the stray `TEMPcheck.log` at repo root and add a `.gitignore` entry so it can't recur. [L/S] (corroborated)
- Fix Edge Function env-var mismatch: `supabase/functions/.env.example` documents `SUPABASE_SECRET_KEYS`, but the loader (`supabase/functions/_shared/mod.ts:99`) reads `SUPABASE_SERVICE_ROLE_KEY` — a fresh deploy following the example 500s on every call. One-line doc fix. [M/S] (corroborated: security scout + stabilization)

## Stabilization & correctness

- Add Deno tests for the Edge Functions (currently ZERO coverage). The referee owns the whole lockstep contract; highest-value cases: `endsTurn` cursor math, `roundOver`/`reportedValid` branch, bot-proxy auth branches, seq-conflict 409. `supabase/functions/submit_action/index.ts`. [H/M]
- Harden referee turn-gate trust: `actingPlayerId`/`nextActiveIndex`/`roundOver` are client-reported and only weakly bounds-checked, yet they set the authoritative cursor — a buggy/malicious client can stall a room. Re-derive the next seat from the roster + log instead of trusting the wire (referee can't run physics but can skip eliminated seats). `submit_action/index.ts:137-181, 261-273`. [M/S]
- Drop already-applied seqs in the resync/Realtime buffer: rows with `seq < nextExpectedSeq` that arrive via a late echo are stored in `pendingActions` and never pruned (slow memory leak over a long match). Guard on incoming seq. `client/src/client/NetworkClient.ts:507-522, 775-789`. [M/S]
- Bound action-log replay on join/reconnect: `initialize()` fetches the full log and replays every shot synchronously (up to 10k ticks each), freezing the tab for late joiners / long matches. Add periodic state checkpoints/snapshots, or at least chunk-and-yield. `client/src/client/NetworkClient.ts:200-218`. [M/M]
- Add a harness asserting max real-flight tick count (across seeds × aims) stays well under the 10k `tickToCompletion` cap; exceeding it silently leaves the engine in FIRING and desyncs clients. POWER_SCALE was retuned for the larger field, so margins shrank. `client/src/client/NetworkClient.ts:742-755`, `shared/src/engine/AI.ts`. [M/S]
- Add a lockstep-style harness cross-checking that two independently-seeded engines compute byte-identical AI plans (locks in the `Object.keys`+stable-sort tie-break that CPU-seat determinism implicitly depends on). `shared/src/engine/AI.ts:219-259`. [L/S]
- Add one retry to best-effort `finish_game` POST: a transient failure means match standings are never persisted; the `UNIQUE(room_id)` on `match_scores` already makes it idempotent. `client/src/client/NetworkClient.ts:918-948`. [L/S]
- Improve rematch successor recovery: the non-initiating peer polls 8×150ms then gives up silently if replication lags >1.2s, stranding the player on the finished room. Increase budget or add a manual "rejoin rematch" affordance; also add a reaper for dangling `rematch_room_id` from partial `restart_game` failure. `client/src/client/NetworkClient.ts:565-590`, `supabase/functions/restart_game/index.ts:85-173`. [L/M]

## Performance & scaling

- Cache a per-column surface array (invalidated by `terrainVersion`) or binary-search `surfaceAt` (currently an O(H)=600-deep top-down scan called per burning column per tick AND per fire cell per render frame). Cheapest slice: compute surfaces once per frame in `drawFire`. `shared/src/engine/Terrain.ts:175-181`, `GameEngine.ts:990-1004`, `client/src/renderer/Renderer.ts:523-572`. [M/M]
- Start `applyGravity`'s column passes at the crater's `yStart` (already returned by `deform`) instead of y=0 — halves+ the per-detonation pixel work; cluster/MIRV detonate many times per shot. `shared/src/engine/Terrain.ts:244-261`. [M/S]
- Parse explosion color ONCE at burst spawn (store `[r,g,b]`) instead of regex-parsing `b.color` every frame for every live burst (7+ simultaneous on cluster/MIRV). `client/src/renderer/Renderer.ts:325-362, 467-510`. [M/S]
- Skip the full redraw when nothing is animating (idle PLAYER_TURN redraws sky+sun-gradient+tanks 60×/sec for a static scene — dominant idle cost on low-end/mobile, drains battery). Gate `render()` on phase===FIRING || bursts || effects || shake || fire || input change. `client/src/main.ts:203-217`, `client/src/renderer/Renderer.ts:222-316`. [M/M]
- Coarse-then-refine the AI shot search: `hard` sweeps ~6800 candidates × up to 1600 ticks each, run synchronously on EVERY client in networked mode → frame stalls in bot rooms. Coarse grid then fine-search around the best; early-out on near-target. Keep search order deterministic. `shared/src/engine/AI.ts:269-340`. [M/M]
- Code-split `@supabase/supabase-js` behind a dynamic `import()` taken only when entering networked mode, so hot-seat (the common path) ships a smaller initial bundle. Run `vite build` first to confirm chunk sizes. `client/vite.config.ts`, NetworkClient import site. [M/M]
- Remove the dead `socket.io` proxy block (`/socket.io` → localhost:3000) — the socket.io stack was deleted; this is stale config that can trip dev startup. `client/vite.config.ts:13-20`. [L/S]
- Trim napalm per-tick allocations: `syncFire` spreads+maps+sorts a fresh array every burning tick, and `processFire` copies all fire keys every tick — keep `state.fire` sorted incrementally / collect only expired keys. `shared/src/engine/GameEngine.ts:1006-1044`. [L/S]

- Swap Realtime transport from Postgres Changes to Realtime **Broadcast**: have the referee broadcast the committed action row directly instead of relying on the WAL/replication listener — cuts broadcast latency and per-room replication cost at scale. Decided direction (CONFIRM-03 = stay Supabase, optimize in place). `client/src/client/NetworkClient.ts` channel setup, `supabase/functions/submit_action/index.ts`. [M/M]
- Document Cloudflare Durable Objects / PartyKit as the DESIGNATED transport successor with an explicit trigger condition (Realtime connection-limit pressure OR move toward a serious/mobile release). Capture the migration sketch (DO = per-room coordinator: in-memory seq, WebSocket fan-out, action-log in DO storage; engine + `shared/net/replay.ts` unchanged). Governance note, not code. [L/S]

## Physics & visual (deterministic-safe unless flagged)

- Animate terrain collapse instead of instant teleport: `applyGravity` snaps unsupported columns to the bottom in one tick; make it a fixed-step multi-tick settle during RESOLVING so dirt cascades and tanks bury progressively. `shared/src/engine/Terrain.ts:244-261`, `GameEngine.ts` RESOLVING loop. [H/M]
- Add wall/boundary modes (wrap / bounce / concrete) via `GameOptions.walls`; OOB is currently always a flat miss. Bank shots are a signature SE mechanic. `shared/src/engine/Physics.ts` collide/stepProjectile, `GameOptions.ts`. [H/M] (corroborated: physics + feature)
- Add tunneling/digger weapons (Sandhog/Tunneler): detonate then bore a tunnel of discs along a deterministic path before a final blast — counters burial/walls, reuses `deform()`. `shared/src/engine/WeaponSystem.ts`, `GameEngine.ts`. [M/M] (corroborated: physics + feature)
- Add a small deterministic projectile drag term so wind asymptotes to a terminal drift (currently wind accelerates a shell without bound; arcs are perfectly parabolic). Retune + re-pin affected harness seeds. `shared/src/engine/Physics.ts` stepProjectile. [M/S]
- Terrain strata coloring: render 2-3 horizontal earth/rock bands keyed on world-y so craters expose layered cross-sections (render-only). `client/src/renderer/TerrainRenderer.ts`. [M/S]
- Client-side projectile smoke trail: a renderer ring buffer of recent positions traces the true arc (kept out of GameState; identical across clients since they replay the same path). `client/src/renderer/ProjectileRenderer.ts`. [M/S]
- Tank damage states + death sequence: scorch/smoke below ~33% HP, turret-pop + debris + wreck/crater on death (driven by authoritative health, render-only). `client/src/renderer/TankRenderer.ts`, `EffectsRenderer.ts`. [M/M]
- Falling debris that settles on the terrain surface (pairs with animated collapse) instead of flying through hills. `client/src/renderer/EffectsRenderer.ts`. [M/M]
- Explosion light flash + crater scorch rim: brief additive full-canvas flash scaled to radius + darkened rim on fresh craters; sells big nukes cheaply. `client/src/renderer/Renderer.ts` drawExplosions. [M/S]
- Audio gaps: distinct terrain-thud vs tank-clang impacts, a tick per `bouncing_betty` hop, a sustained napalm crackle while `state.fire` is alive, and an OOB "fizzle" (off-screen shots are currently a silent dead beat). `client/src/audio/AudioEngine.ts`, `RenderEventSink`. [M/M]
- Heavier juice on big detonations: brief hit-stop + directional screen-kick (already reduced-motion gated). `client/src/renderer/Renderer.ts`. [L/S]
- Anti-alias destruction edges in the render only (keep collision on the crisp bitmap): soften boundary-pixel alpha in `rebuild`. `client/src/renderer/TerrainRenderer.ts`. [L/M]
- (Larger) Water/lava terrain hazard: a second bitmap value for indestructible+lethal pools; touches collision, collapse, and serialization. `shared/src/engine/Terrain.ts`, `Physics.ts`, `GameState` serialization. [M/L]

## Feature expansion (Scorched Earth homage)

- Tank movement on fuel — the single biggest missing SE pillar: add a `move` action (logged, so lockstep replays it) consuming `fuel`; integer px steps against existing bitmap collision; buy fuel via the catalog Fuel Tank. `shared/src/types/PlayerAction.ts`, `shared/src/net/replay.ts`, `GameEngine.ts`, `Tank.ts`. [H/M]
- Parachutes: purchasable accessory that limits fall damage when a crater drops your tank (pure threshold in the post-terrain tank-resolution loop). Counters undermining. `GameEngine.ts` detonate(), `WeaponSystem.ts`. [H/S]
- Room browser UI over the existing `list_rooms` Edge Function: surface open public rooms (players, rounds, status) so players don't have to share a code out-of-band. Lobby/UI only. `client/src/ui/Lobby.ts`. [H/M]
- Teams mode (2v2): add `team` to `GameOptions.players`; win condition → last team standing, optional friendly fire. Roster already supports 4; win-check is centralized. `GameEngine.ts` endRoundIfDecided/computeMatchWinner. [H/M]
- Batteries accessory: per-tank power cap above 100 (catalog +10/unit) — non-weapon economy investment, extends range on the bigger field. `GameEngine.ts`, `Tank.ts`. [M/S]
- Credit interest at ROUND_OVER: integer `floor(credits * rate)` (keep integer to avoid replay float drift) — adds save-vs-spend tension. `GameEngine.ts` round-over path. [M/S]
- Tracer / ranging shot: cheap zero-damage preview shell reusing the AI's `simulateImpact` forward-sim to show the arc; strong onboarding + skill tool (log it like any fire if it ends the turn). `shared/src/engine/WeaponSystem.ts`, `AI.ts`, `Renderer.ts`. [M/M]
- Arms-level room setting: every weapon already carries an unused `armsLevel` (0-4); add `GameOptions.armsLevel` and gate the store engine-side ("basic" vs "everything" matches). `GameOptions.ts`, `GameEngine.ts` applyBuy. [M/S]
- Multiple shield classes: add Heavy Shield (bigger pool) and Mag Deflector (reflects shots off a deterministic shield-circle normal via `reflectVelocity`, no RNG). `shared/src/engine/WeaponSystem.ts`, `GameEngine.ts`. [M/M]
- Spectator mode: join-as-observer that read-only replays the `room_actions` log (RLS already allows member SELECT) — nearly free under lockstep; lets eliminated players keep watching. `client/src/client/NetworkClient.ts`, RLS tweak. [M/M]
- Sudden death: deterministically escalate gravity/wind or rain dirt after turn N (pure function of `state.turn`) to break long-round stalemates. `GameEngine.ts`. [M/S]
- Emotes / quick-chat over a SEPARATE Realtime broadcast channel (ephemeral, NEVER on the action log so it stays out of the deterministic seq). `client/src/client/NetworkClient.ts`, `Lobby.ts`. [M/S]
- Interactive tutorial / onboarding: guided first shot (aim → power → read wind → fire) + aim-assist tier reusing the forward-sim; controls are currently undiscoverable (REVIEW_BACKLOG P3-13). Client UI. [M/M]
- AI personalities: 2-3 flavors (aggressive nuke, conservative dirt-builder, area-denial napalm) by varying weapon-preference weights in the deterministic `chooseLoadout` ranking. `shared/src/engine/AI.ts`. [L/S]
- (Larger) Guidance systems: bake a target coord into the `fire` action and apply a fixed-formula per-tick course correction (NOT live steering — that would need new mid-flight network actions). `shared/src/net/replay.ts`, `Physics.ts`. [H/L] — determinism caveat
- (Larger) Persistent profiles / ranked-ish W/L: session-token-keyed rating to give online play retention; needs auth/persistence design (see open-questions on identity). [M/L]

## Housekeeping / governance

- Enact the intended MIT license: add a `LICENSE` file + `license: "MIT"` to the package.json files and decide whether to drop `private: true`.
- (Optional) Add a linter (ESLint/Biome) or formally decide to stay `tsc --noEmit`-only (current state). Surfaced during context extraction.
- (Optional) Wire `deno check`/`deno lint` for the Edge Functions into a committed script (Deno is installed locally but not in any committed check). Overlaps with the Edge Function test task above.
- Carried: Issue #16 — Hot Napalm ignition flash reuses regular Napalm's visual def; cosmetic. Plus the queued feel-tuning playtest of audio/juice/aim/weapon-balance (needs the user's eyes).
- Reconcile doc-vs-code drift: CLAUDE.md/SPEC say `NEXT_TURN`; the real `GamePhase` enum is `ROUND_OVER` (NEXT_TURN is an internal transient). Update the docs to match code.

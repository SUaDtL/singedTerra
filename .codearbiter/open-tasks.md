# Open tasks

In-flight and queued work. One `- ` bullet per task (the statusline and
SessionStart hook count these). Tags: [impact/effort] H/M/L · S/M/L. Items marked
(corroborated) were independently surfaced by more than one review agent.

Source: sweeping project review 2026-06-20 (5 parallel reviewers: performance,
physics/visual, backend, stabilization, feature/homage). Architectural forks from
that review live in `open-questions.md`.

## Start here (highest impact-per-effort)

✅ **All 6 completed in PR #19 (`start-here-sweep` sprint), 2026-06-20.** computeNextSeat
quadratic replay → `GameEngine.clone()` O(1) seat derivation; `seq` allocation + cursor
advance → atomic `submit_room_action` RPC (`FOR UPDATE` serialization, migration 004);
env-var doc mismatch fixed + drift guard; canvas sizing verified coherent (stale comments
fixed); `TEMPcheck.log` confirmed already gone + `*.log`-ignored. See
`.codearbiter/specs/start-here-sweep.md` + `sprint-log.md`. (Backend migration deploy still
pending — see deploy note.)

## Stabilization & correctness

✅ **4 completed in PR #21 (`stabilize-and-juice` sprint), 2026-06-20.** Edge-Function
referee tests (13→46 Deno cases via a pure `validate.ts` extraction — `endsTurn`,
action-shape, turn-gate/bot-proxy/per-seat-buy auth); resync buffer drops already-applied
`seq < nextExpectedSeq` rows (`shouldBufferSeq` guard + `resync_guard.mjs`); flight-tick
budget harness (`flightticks.mjs`, worst 700 vs 10k cap); AI-plan determinism harness
(`ai_determinism.mjs`). See `.codearbiter/specs/stabilize-and-juice.md`.

- Harden referee turn-gate trust: `actingPlayerId`/`nextActiveIndex`/`roundOver` are client-reported and only weakly bounds-checked, yet they set the authoritative cursor — a buggy/malicious client can stall a room. Re-derive the next seat from the roster + log instead of trusting the wire (referee can't run physics but can skip eliminated seats). `submit_action/index.ts:137-181, 261-273`. [M/S]
- Bound action-log replay on join/reconnect: `initialize()` fetches the full log and replays every shot synchronously (up to 10k ticks each), freezing the tab for late joiners / long matches. Add periodic state checkpoints/snapshots, or at least chunk-and-yield. `client/src/client/NetworkClient.ts:200-218`. [M/M]
- Add one retry to best-effort `finish_game` POST: a transient failure means match standings are never persisted; the `UNIQUE(room_id)` on `match_scores` already makes it idempotent. `client/src/client/NetworkClient.ts:918-948`. [L/S]
- Improve rematch successor recovery: the non-initiating peer polls 8×150ms then gives up silently if replication lags >1.2s, stranding the player on the finished room. Increase budget or add a manual "rejoin rematch" affordance; also add a reaper for dangling `rematch_room_id` from partial `restart_game` failure. `client/src/client/NetworkClient.ts:565-590`, `supabase/functions/restart_game/index.ts:85-173`. [L/M]

## Performance & scaling

✅ **6 completed in PR #25 (`perf-housekeeping-batch`), 2026-06-21.** Per-column `surfaceAt`
cache invalidated by `terrainVersion` (replaces the O(H) per-tick scan) + per-frame `drawFire`
surface memo; parse explosion color once at burst spawn; idle-redraw skip (gates `render()` on
FIRING/RESOLVING / live bursts / fire / shake / effects / input-change); code-split
`@supabase/supabase-js` into its own ~211 kB (~55 kB gzip) chunk, lazy-imported and out of the
hot-seat initial bundle; remove the dead `/socket.io` dev proxy; trim napalm
`syncFire`/`processFire` per-tick allocations. All engine changes byte-identical under the
determinism harnesses. See `sprint-log.md`.

- **Deferred (attempted in PR #25, found NOT equivalent):** start `applyGravity`'s column passes at the crater's `yStart` instead of y=0. The crater top (`deform`'s `yMin`, the topmost CLEARED pixel) does NOT bound the topmost SOLID pixel that must fall — a hillside leaves a floating overhang above `yStart`, so raising the scan's lower bound strands those solids and changes the compacted bitmap (a determinism break). Needs a per-column topmost-solid bound, not `yStart`. `shared/src/engine/Terrain.ts` settleStep. [M/M]
- Coarse-then-refine the AI shot search: `hard` sweeps ~6800 candidates × up to 1600 ticks each, run synchronously on EVERY client in networked mode → frame stalls in bot rooms. Coarse grid then fine-search around the best; early-out on near-target. Keep search order deterministic. `shared/src/engine/AI.ts:269-340`. [M/M]

- Swap Realtime transport from Postgres Changes to Realtime **Broadcast**: have the referee broadcast the committed action row directly instead of relying on the WAL/replication listener — cuts broadcast latency and per-room replication cost at scale. Decided direction (CONFIRM-03 = stay Supabase, optimize in place). `client/src/client/NetworkClient.ts` channel setup, `supabase/functions/submit_action/index.ts`. [M/M]
- Document Cloudflare Durable Objects / PartyKit as the DESIGNATED transport successor with an explicit trigger condition (Realtime connection-limit pressure OR move toward a serious/mobile release). Capture the migration sketch (DO = per-room coordinator: in-memory seq, WebSocket fan-out, action-log in DO storage; engine + `shared/net/replay.ts` unchanged). Governance note, not code. [L/S]

## Physics & visual (deterministic-safe unless flagged)

- Animate terrain collapse instead of instant teleport: `applyGravity` snaps unsupported columns to the bottom in one tick; make it a fixed-step multi-tick settle during RESOLVING so dirt cascades and tanks bury progressively. `shared/src/engine/Terrain.ts:244-261`, `GameEngine.ts` RESOLVING loop. [H/M]
- Add wall/boundary modes (wrap / bounce / concrete) via `GameOptions.walls`; OOB is currently always a flat miss. Bank shots are a signature SE mechanic. `shared/src/engine/Physics.ts` collide/stepProjectile, `GameOptions.ts`. [H/M] (corroborated: physics + feature)
- Add tunneling/digger weapons (Sandhog/Tunneler): detonate then bore a tunnel of discs along a deterministic path before a final blast — counters burial/walls, reuses `deform()`. `shared/src/engine/WeaponSystem.ts`, `GameEngine.ts`. [M/M] (corroborated: physics + feature)
- Add a small deterministic projectile drag term so wind asymptotes to a terminal drift (currently wind accelerates a shell without bound; arcs are perfectly parabolic). Retune + re-pin affected harness seeds. `shared/src/engine/Physics.ts` stepProjectile. [M/S]
✅ **4½ completed in PR #21 (`stabilize-and-juice` sprint), 2026-06-20** (all render/audio-only):
terrain strata coloring; client-side projectile smoke trail (ring buffer); tank damage states
(<33% HP scorch/smoke) + turret-pop/wreck on death; explosion light-flash (reduce-motion gated)
+ crater scorch decals; render-side audio — betty hop tick, sustained napalm crackle, OOB fizzle.
**Deferred (the ½):** terrain-thud vs tank-clang impacts — needs an engine signal on
`ExplosionEvent` (hit surface), out of that sprint's "render-only" safe cut. See below.

- Audio: distinct terrain-thud vs tank-clang impacts (deferred from PR #21) — surface `hit.type==='ground'|'tank'` on `ExplosionEvent` and split the impact sound. Small additive engine field, guarded by the determinism harnesses. `shared/src/engine/GameEngine.ts`, `shared/src/types/GameState.ts`, `client/src/audio/AudioEngine.ts`. [M/S]
- Falling debris that settles on the terrain surface (pairs with animated collapse) instead of flying through hills. `client/src/renderer/EffectsRenderer.ts`. [M/M]
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

✅ **2 completed in PR #25, 2026-06-21:** enacted the MIT license (`LICENSE` + `license: "MIT"` on all three manifests; `private: true` retained, since dropping it to publish is a separate decision); reconciled the `NEXT_TURN` → `ROUND_OVER` doc drift in CLAUDE.md / SPEC.md / TASKS.md.

- (Optional) Add a linter (ESLint/Biome) or formally decide to stay `tsc --noEmit`-only (current state). Surfaced during context extraction.
- (Optional) Wire `deno check`/`deno lint` for the Edge Functions into a committed script (Deno is installed locally but not in any committed check). Overlaps with the Edge Function test task above.
- Carried: Issue #16 — Hot Napalm ignition flash reuses regular Napalm's visual def; cosmetic. Plus the queued feel-tuning playtest of audio/juice/aim/weapon-balance (needs the user's eyes).

## Sprint stabilize-and-juice-2 follow-ups (from PR Phase-4 review)

✅ **2 completed in PR #25, 2026-06-21:** `collapse_flush.mjs` now directly asserts the
in-flight-flush paths A (projectile-in-flight → instant flush), B (game-ending → GAME_OVER), and
D (fire-burning); `postOnceWithRetry` gained an inter-attempt backoff + `attempts<1` clamp,
covered by three new `netretry.mjs` cases.
- KNOWN DEVIATION (accepted, documented): same-tick multi-detonation now collides blast #2 against blast #1's un-compacted overhang (deferred-settle trade-off — deterministic, NOT a desync). If pre-animated-collapse gameplay parity is ever wanted, the only clean route is compact-immediately + replay-the-collapse-delta-as-overlay (a larger redesign). Revisit only if playtest shows it matters. `shared/src/engine/GameEngine.ts` path-A comment. [M/L]
- Manual 2-browser networked playtest owed: confirm (a) animated collapse renders + a tank visibly sinks during RESOLVING; (b) join/reconnect mid-RESOLVING replays cleanly (NetworkClient `FIRING||RESOLVING` fix); (c) buffered back-to-back shots flush correctly after the settle (rAF `wasBusy` fix). Tuning: `COLLAPSE_PX_PER_TICK=4` feel.

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
✅ **Completed in PR #180:** falling debris now uses swept render-only collision against the live
terrain bitmap, rests and fades on the surface, and resumes falling when support is deformed away.
`client/src/renderer/EffectsRenderer.ts`, `debrisMotion.ts`.
- Heavier juice on big detonations: brief hit-stop + directional screen-kick (already reduced-motion gated). `client/src/renderer/Renderer.ts`. [L/S]
- Anti-alias destruction edges in the render only (keep collision on the crisp bitmap): soften boundary-pixel alpha in `rebuild`. `client/src/renderer/TerrainRenderer.ts`. [L/M]
- (Larger) Water/lava terrain hazard: a second bitmap value for indestructible+lethal pools; touches collision, collapse, and serialization. `shared/src/engine/Terrain.ts`, `Physics.ts`, `GameState` serialization. [M/L]

## Feature expansion (Scorched Earth homage)

✅ **4 completed in the `se-parity-economy` sprint, 2026-06-21** (engine + network-contract level,
all determinism-harness-validated): **Credit interest at ROUND_OVER** (`GameOptions.interestRate`,
`floor(credits*rate)` integer interest — `interest.mjs`); **Sudden-death gravity escalation**
(`GameOptions.suddenDeathTurn`, gravity ramps as a pure function of `state.turn` — `suddendeath.mjs`);
**Arms-level room setting** (`GameOptions.armsLevel`, `applyBuy` gate — `armslevel.mjs`); **Batteries
accessory** (`TankState.powerCap`, `buy.accessory='battery'` extended through `replay.ts` + the Deno
referee — `batteries.mjs` + 3 new referee Deno cases). Spec: `.codearbiter/specs/se-parity-economy.md`.
**Follow-ups owed:** (a) UI exposure — lobby toggles for interest/sudden-death/arms-level + a Store
button for Batteries (`HUD.ts` store is `WeaponType`-keyed; accessory rows need a small generalization);
(b) backend redeploy (`npm run deploy:backend`) for the battery referee shape (additive/back-compat).

- Tank movement on fuel — the single biggest missing SE pillar: add a `move` action (logged, so lockstep replays it) consuming `fuel`; integer px steps against existing bitmap collision; buy fuel via the catalog Fuel Tank. `shared/src/types/PlayerAction.ts`, `shared/src/net/replay.ts`, `GameEngine.ts`, `Tank.ts`. [H/M]
- Parachutes: purchasable accessory that limits fall damage when a crater drops your tank (pure threshold in the post-terrain tank-resolution loop). Counters undermining. `GameEngine.ts` detonate(), `WeaponSystem.ts`. [H/S] — **NOTE (se-parity-economy scoping, 2026-06-21): the `[H/S]` undercounts this.** There is currently NO fall damage at all (`resolveTanksToTerrain` drops a tank onto the new floor harmlessly), so a faithful parachute first needs a NEW fall-damage gameplay mechanic (drop-distance threshold → damage) + retuning of the burial/collapse harness seeds. Treat as `[H/M]`, its own physics sprint with a playtest gate. The Battery accessory path (`buy.accessory`) is now in place to hang it on.
- Room browser UI over the existing `list_rooms` Edge Function: surface open public rooms (players, rounds, status) so players don't have to share a code out-of-band. Lobby/UI only. `client/src/ui/Lobby.ts`. [H/M]
- Teams mode (2v2): add `team` to `GameOptions.players`; win condition → last team standing, optional friendly fire. Roster already supports 4; win-check is centralized. `GameEngine.ts` endRoundIfDecided/computeMatchWinner. [H/M]
- Tracer / ranging shot: cheap zero-damage preview shell reusing the AI's `simulateImpact` forward-sim to show the arc; strong onboarding + skill tool (log it like any fire if it ends the turn). `shared/src/engine/WeaponSystem.ts`, `AI.ts`, `Renderer.ts`. [M/M]
- Multiple shield classes: add Heavy Shield (bigger pool) and Mag Deflector (reflects shots off a deterministic shield-circle normal via `reflectVelocity`, no RNG). `shared/src/engine/WeaponSystem.ts`, `GameEngine.ts`. [M/M]
- Spectator mode: join-as-observer that read-only replays the `room_actions` log (RLS already allows member SELECT) — nearly free under lockstep; lets eliminated players keep watching. `client/src/client/NetworkClient.ts`, RLS tweak. [M/M]
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

## Checkpoint 2026-06-21 findings (6-reviewer sweep → `.codearbiter/checkpoints/2026-06-21.md`)

Severity counts: 0 CRITICAL · 5 HIGH · 13 MEDIUM · 11 LOW · 11 NEEDS-TRIAGE (40 total).
0 overrides, 0 drift (6/6 invariants confirmed), 38 harnesses + 57 Deno cases green.
Items tagged **(quick-kill → sprint)** are batched into the `checkpoint-quick-kills` sprint.
Decision forks split to `open-questions.md` (CONFIRM-04 rate-limiting, CONFIRM-05 ADRs).

### Security & client
- **Stored XSS** — `buildScoreboard` interpolates peer-controlled `playerName` into `innerHTML`; a `<svg/onload=…>` name (≤20 chars, the server limit) broadcasts via the roster, replays, and executes as live HTML in every opponent's GAME_OVER/ROUND_OVER scoreboard. Build rows via `createElement` + `.textContent` (or HTML-escape); optionally strip `<>` in the server name validators. `client/src/ui/HUD.ts:1024` (src `client/src/client/NetworkClient.ts:962`). [H/S] **(quick-kill → sprint)**
- `console.error` logs the full ephemeral `playerId` (the de-facto identity token); truncate or drop it. `client/src/client/NetworkClient.ts:370`. [L/S] **(quick-kill → sprint)**
- `[auth] enabled=true` + `enable_signup=true` in committed `supabase/config.toml` contradicts the no-auth design (local-dev scaffold; no evidence deployed); set `enabled=false` / comment as local-only. `supabase/config.toml:29-38`. [L/S] **(quick-kill → sprint)**
- Untrusted `p.color` → `dot.style.background`, validated only non-empty/unique; safe today (DOM setter discards invalid) but unvalidated — add a hex/`rgb()` allowlist in the server validators. `client/src/ui/Lobby.ts:1243,1668`. [L/S]
- Room code: 4-char/36-symbol via `b%36` (slight modulo bias); accepted non-security CSPRNG tradeoff (controls §41) — no action unless room confidentiality ever matters. `supabase/functions/_shared/mod.ts:147-153`. [—] accepted

### Tooling & dependencies
- `tsx` is undeclared/unversioned yet runs all 38 `npm run check` harnesses via `npx tsx` (no lockfile integrity) — the sole pre-deploy gate. Add `tsx` to root `devDependencies` (^4.19.0) to pin it. `package.json`. [H/S] **(quick-kill → sprint)**
- Pin the floating Deno import `@supabase/supabase-js@2` → `@2.107.0` (re-resolves on any `deno cache --reload`, affects all 10 functions). `supabase/functions/_shared/mod.ts:13`. [L/S] **(quick-kill → sprint)**
- Bump `http-proxy-middleware` past 3.0.6 (dev-only, transitive via `netlify-cli`): GHSA-gcq2-9pq2-cxqm CRLF (CVSS 7.5, fixed 3.0.7); `npm update http-proxy-middleware --depth 10` or await a netlify-cli bump. [M/S]
- Remove the phantom `iceberg-js@0.8.1` entry from `deno.lock` (imported nowhere) — find+remove the originating import then `deno cache --reload`, or drop manually. [L/S]
- Remove the extraneous `server` workspace from `package-lock.json:17827-17840` (references deleted socket.io/express/tsx); regenerate via `npm install`. [L/S]
- Resolve the `node-forge` 1.4.0 license note (dev-only transitive): it carries `(BSD-3-Clause OR GPL-2.0)` — acknowledge the copyleft disjunct vs MIT intent, or pursue removal via netlify-cli. [L/S]
- LOW deprecations, dev-only transitive: `postcss-values-parser@6.0.2` (MPL-2.0), `glob@10.5.0`, `node-domexception@1.0.0` — acknowledge / monitor netlify-cli updates. [L/—]

### Migrations (committed migrations are IMMUTABLE — fixes ship as a NEW migration 005 + backend deploy)
- Add `SET LOCAL lock_timeout='3s'` to `submit_room_action`: the per-room `FOR UPDATE` lock has no timeout, so a wedged caller head-of-line-stalls all submits + rematch/finish for that room (the seq race itself IS closed correctly). `supabase/migrations/004_atomic_submit_action.sql:50-58`. [M/S]
- Guard the `CREATE OR REPLACE FUNCTION` signature footgun: a future arg-signature change spawns a new overload that re-acquires default `PUBLIC EXECUTE` → anon-callable. Add schema-level `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC` or single-source the signature. `004…:35`. [M/S]
- Reword the `submit_room_action` SECURITY RATIONALE comment: it claims RLS still applies, but the sole caller is service_role (bypasses RLS) — the real control is `REVOKE PUBLIC` / `GRANT service_role`. `004…:43`. [L/S]
- (Optional) Add one-line data-classification comments per table (no-PII / random-ids by design). `001_init.sql`, `003_match_scores.sql`. [L/S]

### Test coverage
- finish_game `sanitizeScoreboard` bounds-checking untested (malformed array / invalid tankId / OOB seat / non-finite damage clamp). `supabase/functions/finish_game/index.ts`. [M/M]
- join_room authz + roster mutation untested (success / 404 / finished-rejected / duplicate / maxPlayers). `supabase/functions/join_room/index.ts`. [M/M]
- ready_up / leave_room / restart_game flows untested — consolidate one Deno test file. [M/M]
- create_room handler (DB-mutating; `validate.test.ts` covers only option coercion), heartbeat, list_rooms, update_player (incl. self-only 403) untested. [M/M]
- `Random.ts` has no dedicated harness (only indirect via `wind.mjs`) — add `scripts/checks/random.mjs` (same-seed-identical / independent-streams / edge-seeds). [L/S] **(quick-kill → sprint)**
- `seqGuard.ts` `resync_guard.mjs` lacks boundary cases (`seq==nextExpected`, `seq-1`, `Infinity`). [L/S] **(quick-kill → sprint)**
- `math.ts` `clamp()` NaN-preservation has no explicit test (a maintainer could "fix" the intentional NaN passthrough) — add `scripts/checks/math.mjs`. [L/S] **(quick-kill → sprint)**
- `replay.ts` edge cases untested (OOB angle, buy with both weapon+accessory, empty payload). [L/S]
- (NEEDS-TRIAGE — integration/manual, no unit harness practical) NetworkClient buffering/seq/reconnect; canvas renderers; AudioEngine; InputHandler — hard to test without Supabase/Canvas/DOM mocks. NOTE: all `scripts/checks/*.mjs` verified wired into the `npm run check` &&-chain (no silently-skipped harness).

### Doc consistency / informational
- The `.env.example` var-name mismatch is ALREADY fixed (now `SUPABASE_SERVICE_ROLE_KEY`) — the `security-controls.md:36` text describing it is now stale; update the text and close the prior open-task. [L/S]
- `active_player_index` is commented "advisory only / may be removed in V1" (`001_init.sql:20-23`) but migration 004 writes it as the authoritative turn cursor — reconcile the comment; the column is load-bearing. [L/S]
- (informational, no action) `submit_action` lets any room member proxy any bot/ai seat — within documented design (controls §26), exactly-once via the seq cursor; threat-model awareness only.
- (informational, no action) `REPLICA IDENTITY FULL` on rooms/room_actions = WAL write-amplification, justified for Realtime; revisit only if WAL cost grows.

- (Possible-later, from room-browser-enrichment spec 2026-06-22) Surface `interestRate` / `suddenDeathTurn` on the public browse row too, now that `StoredOptions` declares them. Pure read-path addition mirroring the rounds/armsLevel/botCount work. [L/S]
## In-flight
- [ ] Carry authenticated identity coherently into online lobby flows: suppress the incorrect 'sign in to record future matches' CTA when a valid session exists, and prefill or eliminate redundant host/join name entry from the account display name while preserving an explicit override only if product policy requires it. [H/S]  (from user steering 2026-08-10)
  - Boundaries: authentication, display-identity
- [~] career.initiative.0001 - Deliver the Commander Career Loop as a sustained initiative: earned rank identity, trusted promotion payoff, tactical objectives, and a coherent reason to return.  (from standing improvement goal)  (started 2026-08-10)
- [x] ux.hud.0002 - Show battlefield-safe tactical intel for every arsenal weapon on focus or selection across mouse, keyboard, and touch  (from post-remediation-adversarial-player-audit-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, hud, weapon-presentation
- [x] ux.pregame.0006 - Keep the full persistent commander identity, level, and next XP milestone legible in the pre-game command header across desktop and compact layouts without changing authentication or progression rules.  (from live-production-commander-dossier-audit-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, pregame-ux, account-presentation
- [x] ux.pregame.0005 - Present Quick Duel, Local Battle, and Play Online as a focused deployment chooser before revealing either setup flow.  (from adversarial-player-experience-followup-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, pre-game-ux
- [x] ux.pregame.0004 - Make the compact pre-game command shell legible and remove duplicate preview-plane ghosting without changing global stage scaling.  (from live-production-command-shell-audit-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, pre-game-ux
- [x] ux.pregame.0003 - Make Hot Seat defaults immediately deployable while progressively disclosing crew and battlefield customization behind one accessible preparation control.  (from continuous-improvement-smarts-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, pregame-ux
- [x] ux.hud.0001 - Make the in-match HUD state-responsive: foreground aim, power, weapon, and fire during the player decision, then demote inactive controls and foreground shot progress and impact learning while the shot sends, flies, and resolves.  (from adversarial-player-experience-audit-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, hud, visual-state
- [x] mvp2.progression.0009 - Guide anonymous local-match players from the After Action Report to sign in for future progression without claiming retroactive credit.  (from adversarial-player-retention-audit-2026-08-10)  (done 2026-08-10)
  - Boundaries: client, post-match-ux
- [x] ux.pregame.0002 - Repair Account and Operations Settings as opaque stage-owned overlays with no ghosted or reflowed pregame composition and real-browser desktop/touch proof.  (from user-overlay-containment-regression)  (done 2026-08-10)
  - Boundaries: client, pregame-ux
- [x] mvp2.progression.0008 - Show earned post-match XP and the next visible level milestone  (from adversarial-player-experience-audit-2026-08-10)  (done 2026-08-10)
- [ ] ux.pregame.0001 - Redesign the entire pre-game player journey as one coherent polished game experience: landing, identity, mode selection, room/lobby, loadout, store, and transitions into a match; replace cheerful generic UI language with a deliberate visual system that belongs to the battlefield.  (from user-menu-overhaul-scope-correction)
  - Boundaries: client, pre-game-ux
- [x] ux.impact.0001 - Restore the cinematic impact-window camera feedback on mobile without weakening reduced-motion or battlefield input behavior.  (from user-mobile-impact-window)  (done 2026-08-09)
  - Desc: Recover the player's favorite shot-impact framing across compact touch layouts.
  - Boundaries: client, renderer
- [x] ux.menu.0006 - Make persistent player identity and earned progression a first-class, coherent part of every pre-game route.  (from user-menu-overhaul-clarification)  (done 2026-08-09)
  - Desc: Unify player state, progression context, and account actions with the tactical pre-game shell without changing auth or persistence.
  - Boundaries: client, ui
- [x] ux.menu.0005 - Overhaul the complete pre-game menu system into a cohesive polished game experience across entry, account, mode, room, loadout, and store flows.  (from user-menu-overhaul-clarification)  (done 2026-08-09)
  - Boundaries: client, ui
- [x] ux.menu.0004 - Give Play Online a primary room-start route and clearly grouped alternatives without changing room behavior  (from user-menu-overhaul)  (done 2026-08-09)
  - Boundaries: client, ui
- [x] ux.menu.0003 - Clarify the selected lobby play mode and its immediate next action without changing room, match, or account behavior.  (from user-menu-overhaul)  (done 2026-08-09)
  - Boundaries: client, ui
- [x] mvp2.progression.0007 - Acknowledge a server-confirmed hot-seat progression record in the After Action Report without inventing client-owned XP.  (from user-persistent-progression-and-ux-roadmap)  (done 2026-08-09)
  - Boundaries: client, account-ui
- [~] ux.menu.0002 - Carry the menu-system overhaul through ranked player-facing slices after Command Menu foundation.  (from user-steering-2026-08-09)  (started 2026-08-09)
  - Boundaries: client, ui
- [x] impact.mobile.0001 - Restore the tactile Impact Monitor on landscape touch play and prove its magnified post-shot view remains visible, reachable, and non-obscuring.  (from user-mobile-impact-window)  (done 2026-08-09)
  - Boundaries: client, rendering
- [x] ux.menu.0001 - Overhaul the menu system into a coherent, planned player UX: audit navigation, information hierarchy, responsive states, and visual language; produce and ship in bounded, player-validated slices after world-atmosphere-signatures.  (from user-steering-2026-08-09)  (done 2026-08-09)
- [x] reliability.store.0001 - Prevent Store accessory cards from collapsing and overlapping their purchase control at compact scales  (from production-screenshot-2026-08-09)  (done 2026-08-09)
  - Boundaries: Store card DOM, Store CSS, compact browser geometry
- [x] mvp2.progression.0006 - Award bounded progression for signed-in hot-seat match completion  (from user-hot-seat-progression-2026-08-08)  (done 2026-08-09)
  - Boundaries: authenticated local outcome attribution, anti-forgery trust ceiling, account summary/progression
- [x] reliability.account.0001 - Keep authenticated progression details from covering the lobby  (from production-screenshot-2026-08-08)  (done 2026-08-09)
  - Boundaries: account panel DOM, lobby CSS, compact browser geometry
- [x] mvp2.progression.0005 - Refresh authenticated progression immediately after a completed match is linked  (from mvp2.identity.0001)  (done 2026-08-08)
  - Boundaries: client match-completion signal, authenticated account-summary refresh, lobby composition
- [x] mvp2.progression.0004 - Show authenticated players an accessible XP progress meter and exact XP remaining to the next level  (from mvp2.identity.0001)  (done 2026-08-08)
  - Boundaries: client account UI
- [x] deps.audit.0002 - Upgrade transitive nanoid to a reviewed patched 3.3.x release and restore the zero-High dependency audit gate  (from npm-audit-2026-08-08)  (done 2026-08-08)
  - Boundaries: dependency, build-toolchain
- [x] mvp2.progression.0003 - Show server-derived XP and level progress for authenticated accounts  (from mvp2.identity.0001)  (done 2026-08-04)
  - Boundaries: Supabase Auth JWT, derived progression rules, persisted match attribution, account UI
- [ ] Add an injectable limiter seam and causal 429/fail-open tests for shared Edge request handling.  (from review:account-progression-summary)
  - Boundaries: rate-limiting, service-role
- [x] mvp2.progression.0002 - Show server-derived matches played and wins for authenticated accounts  (from mvp2.identity.0001)  (done 2026-08-04)
  - Boundaries: Supabase Auth JWT, match attribution, owner-private progression read, account UI
- [x] mvp2.progression.0001 - Link authenticated accounts to completed matches without trusting client-owned progression totals  (from mvp2.identity.0001)  (done 2026-08-04)
  - Boundaries: Supabase Auth JWT, match attribution, finish_game, RLS, seat-token authorization
- [x] reliability.impact.0001 - Keep the tactical impact monitor visible for reduced-motion mobile profiles with a causal renderer regression.  (done 2026-08-03)
  - Boundaries: client
- [x] reliability.teardown.0001 - Prevent a stopped NetworkClient RAF callback from resurrecting the animation loop, with a causal regression.  (done 2026-08-03)
  - Desc: Prevent a stopped NetworkClient RAF callback from resurrecting the animation loop, with a causal regression.
  - Boundaries: client NetworkClient runtime and regression tests only; no auth, persistence, migrations, secrets, dependencies, protocol, or Supabase changes
- [x] reliability.lockstep.0001 - Prove live lockstep drains buffered actions after projectile resolution  (done 2026-08-03)
  - Desc: Add a causal client regression for the RAF handoff that prevents a buffered next action from being dropped while the prior shot resolves.
  - Boundaries: client NetworkClient regression coverage only unless RED exposes a minimal fix; no auth, persistence schema, migrations, secrets, dependencies, or action protocol
- [x] reliability.matchscore.0001 - Retry transient finish_game standings writes without changing the existing idempotent persistence contract  (done 2026-08-03)
  - Desc: Retry a transient finish_game POST failure so completed match standings are not silently lost.
  - Boundaries: client NetworkClient retry seam and deterministic/client tests only; no auth, persistence schema, migrations, secrets, dependencies, or action protocol
- [x] mvp2.hazard.0001 - Deterministic terrain hazards  (done 2026-08-03)
  - Desc: Add an opt-in deterministic lava/water terrain hazard mode that preserves the existing seed-plus-action replay contract.
  - Boundaries: Shared terrain bitmap hazard value, GameOptions transport, collision and tank damage rules, renderer material, deterministic/client/Edge tests; no auth, persistence, migrations, secrets, dependencies, or new action kinds
- [x] mvp2.social.0001 - Networked quick chat emotes  (done 2026-08-03)
  - Desc: Add a bounded ephemeral quick-chat palette for networked rooms without writing messages to the deterministic action log.
  - Boundaries: Client NetworkClient Realtime broadcast channel, fixed message catalog, accessible HUD affordance, receive/send tests; no free text, auth, persistence, migrations, secrets, dependencies, or deterministic action changes
- [x] mvp2.teams.0001 - Deterministic 2v2 team mode  (done 2026-08-03)
  - Desc: Add an opt-in deterministic 2v2 team mode with alternating seat assignment, team-based round and match victory, and friendly-fire suppression.
  - Boundaries: shared GameOptions/TankState/GameEngine rules; hot-seat and network lobby settings; Edge option validation and transport; deterministic harnesses and client/Edge tests; no auth, persistence, migrations, secrets, dependencies, or new action kinds
- [x] mvp1.ai2.0001 - Deterministic AI weapon personalities  (done 2026-08-03)
  - Desc: Give CPU opponents deterministic aggressive, conservative, and area-denial weapon preferences without changing the action protocol or human controls.
  - Boundaries: shared AI loadout ranking, deterministic personality input, existing AI harnesses and focused tests; no auth, persistence, migrations, secrets, dependencies, or new network action kinds
- [x] mvp1.drag.0001 - Deterministic projectile drag  (done 2026-08-03)
  - Desc: Add a bounded per-tick aerodynamic drag term to shared projectile physics without weakening deterministic lockstep or changing auth, persistence, migrations, or dependencies.
  - Boundaries: shared Physics stepProjectile, deterministic harnesses, affected AI forward-sim parity tests, player-facing docs if controls or tuning change; no auth, persistence, migrations, dependencies, or network action changes
- [x] mvp1.heavyshield.0001 - Heavy Shield tactical defense  (done 2026-08-03)
  - Desc: Add a stronger finite shield through the existing use_shield action/replay family without changing auth, persistence, or migrations.
  - Boundaries: shared shield weapon/inventory/activation, existing replay payload extension, client HUD/store/icons, minimal Edge allowlist/test, and deterministic/client tests; no auth, secrets, migrations, new action kinds, dependencies, or progression
- [x] mvp1.tracer.0001 - Deterministic tracer ranging shot  (done 2026-08-03)
  - Desc: Give players a zero-damage ranging shot that previews the current aim arc through the existing deterministic projectile simulation and consumes an explicit tracer action.
  - Boundaries: shared deterministic tracer weapon, client HUD/input/renderer affordance, existing fire-row replay, minimal submit_action weapon allowlist/test, and tests; no auth, secrets, migrations, new action kinds, dependencies, or persistence
- [x] mvp1.tutorial.0001 - Interactive first-shot tutorial and onboarding  (done 2026-08-03)
  - Desc: Guide a new player through one safe first shot using the existing aim, wind, power, and fire paths without blocking the normal start flow.
  - Boundaries: client tutorial overlay, aim/power/wind guidance, existing input callbacks and tests; no engine, action protocol, network, backend, migration, dependency, auth, secrets, or persistence
- [x] mvp2.identity.0001 - Persistent users and progression  (done 2026-08-08)
  - Desc: Provide persistent users and progression without trusting client-owned progress or weakening the current seat-token/network security boundary.
  - Boundaries: authenticated user identity, secure persistence, progression schema and rules; no implementation until auth/security controls and data-integrity design are cleared
- [x] mvp1.world.0001 - Let lobby players choose an authored battlefield world and carry it through hot-seat and network setup  (done 2026-08-03)
  - Desc: Let players choose among the existing authored worlds in hot-seat and network setup; keep the choice presentation-only and fail closed to the existing deterministic selection.
  - Boundaries: shared presentation identifier, lobby UI, client option transport, deterministic renderer selection; no auth, migration, dependency, or secret changes
- [x] mvp1.ai.0001 - Teach hard AI deterministic Parachute counterplay  (done 2026-08-03)
  - Desc: Let hard AI buy Parachutes through the existing accessory contract when collapse risk justifies it
  - Boundaries: shared deterministic AI planning, hot-seat AI driver, and AI harness tests only
- [x] mvp1.input.0001 - Restore Space fire through focus-changing HUD interactions  (done 2026-08-03)
  - Desc: Preserve Space fire when focused HUD descendants stop bubbling keydown events
  - Boundaries: client input handling and focused-control regression tests only
- [x] mvp1.fall.0001 - Deterministic collapse fall damage and one-use Parachute accessory  (done 2026-08-03)
  - Boundaries: none
- [~] governance.classification.0001 - Add data-classification comments to legacy rooms, room_actions, and match_scores tables via a new forward-only migration  (started 2026-08-03)
  - Desc: GH #125; preserve immutable applied migrations and make the existing classification convention explicit for legacy tables.
  - Boundaries: New SQL comments only; no schema, data, RLS, grants, or runtime behavior changes
- [x] reliability.rematch.0001 - Extend bounded rematch successor recovery  (from sprint:rematch-recovery)  (done 2026-08-03)
  - Desc: Keep polling for a successor room through a bounded three-second replication window so delayed room visibility does not strand the non-initiating peer.
  - Boundaries: client NetworkClient and tests only; no auth, secrets, crypto, database, migrations, action protocol, or Edge Function changes
- [x] reliability.input.0001 - Restore Space fire after non-text UI focus  (from sprint:keyboard-focus-recovery)  (done 2026-08-03)
  - Desc: Treat Space as the game fire key after focus moves to non-text UI controls, while preserving text-entry editing and dedicated Fire-button native activation.
  - Boundaries: client InputHandler and tests only; no auth, secrets, crypto, database, migrations, or action protocol changes
- [x] obs.edge.0001 - Normalize Edge error logging and correlate submit-action sequence conflicts  (from sprint:edge-log-context)  (done 2026-08-03)
  - Desc: Replace raw Supabase error-object logging with bounded messages and add room/player context where available, while preserving safe client responses and action behavior.
  - Boundaries: supabase/functions logging only; no auth, secrets, crypto, database, migration, or response/action protocol changes
- [x] lobby.feature.0001 - Show interest-rate and sudden-death settings in public room-browser rows  (from sprint:room-browser-enrichment)  (done 2026-08-03)
  - Desc: Existing StoredOptions already carries both values; expose them in the public browse projection so players can choose a room with full rules context.
  - Boundaries: client lobby browse labels, list_rooms mapper, tests; no auth, secrets, database, migration, or action protocol
- [x] art.feature.0003 - Ship World-Matched Terrain Materials  (from SMARTS World-Matched Terrain sprint)  (done 2026-08-02)
  - Desc: Give each authored battlefield world a distinct terrain palette and material while preserving deterministic presentation and fail-soft rendering.
  - Boundaries: client terrain renderer, generated raster assets, tests, player/art docs; no engine, network, backend, dependencies, auth, schema, or migrations
- [x] art.feature.0002 - Ship Authored Battlefield Worlds  (from SMARTS Authored Battlefield Worlds sprint)  (done 2026-08-02)
  - Boundaries: client renderer, generated raster assets, tests, player docs, no engine, network, backend, dependencies, auth, schema, migrations
- [x] hud.feature.0003 - Ship the Victory After-Action Report  (from SMARTS Victory After-Action Report sprint)  (done 2026-08-02)
  - Desc: Replace the generic terminal dialog with a cinematic, accessible final report led by the winning custom tank and exact standings.
  - Boundaries: Client GAME_OVER HUD, local E2E fixture, player docs, and tests only; no engine, scoring, replay, network, backend, dependency, asset, auth, schema, or migration change.
- [x] mobile.feature.0001 - Ship the Mobile Landscape Launch  (from SMARTS Mobile Landscape Launch sprint)  (done 2026-08-02)
  - Desc: Replace the generic phone-portrait dead end with authored launch art and a failure-safe fullscreen/landscape shortcut.
  - Boundaries: Client portrait launch UI, helper, docs, and tests only; no engine, network, backend, dependency, asset, auth, schema, or migration change.
- [x] garage.feature.0001 - Give each hot-seat seat a distinct authored tank preset by default while preserving free per-part Garage customization.  (from sprint:distinct-seat-presets)  (done 2026-08-02)
  - Boundaries: client lobby defaults and tests only; no engine, network, backend, dependencies, assets, auth, schema, or migrations
- [x] input.feature.0001 - Let coarse-pointer players set and refine angle and power directly on the battlefield through the existing deterministic aim input path.  (from sprint:direct-touch-aim)  (done 2026-08-02)
  - Desc: Unify the existing desktop drag-aim gesture onto primary Pointer Events so mouse, pen, and one finger share identical absolute aim semantics without firing.
  - Boundaries: Client input, canvas CSS, docs, and tests only; no engine, action schema, network, backend, dependencies, assets, auth, schema, or migrations
- [x] hud.feature.0002 - Make the desktop Command Deck a causal mouse-and-keyboard command surface by routing its visible keycaps through existing HUD callbacks and state gates.  (from sprint:interactive-command-deck)  (done 2026-08-02)
  - Boundaries: client HUD and tests only; no engine, network, backend, dependencies, assets, auth, schema, or migrations
- [x] hud.feature.0001 - Make the desktop Command Deck legible and production-coherent through a bounded CSS-first hierarchy pass without changing input or gameplay behavior.  (from sprint:command-deck-legibility)  (done 2026-08-02)
  - Boundaries: client UI only; no engine, input semantics, dependencies, backend, auth, schema, or migrations
- [x] impact.feature.0002 - Add a reduced-motion-safe top-center Impact Monitor that magnifies the strongest live detonation without changing battlefield coordinates or gameplay state.  (from sprint:impact-monitor)  (done 2026-08-02)
- [x] art.feature.0001 - Replace conventional blast code art with one authored, fail-soft nine-frame explosion sheet while preserving deterministic state, weapon reach, reduced motion, and procedural fallback.  (from sprint:authored-explosion-art)  (done 2026-08-02)
- [x] impact.feature.0001 - Add a two-render-frame reduced-motion-safe pre-impact hold for large detonations.  (from sprint:heavy-impact-hit-stop)  (done 2026-08-02)
- [x] wall.concrete.0001 - Add an opt-in concrete sidewall mode with deterministic impact semantics, live/AI parity, room lifecycle coverage, and distinct player feedback.  (from sprint:wrap-sidewalls)  (done 2026-08-03)
- [ ] Refresh .codearbiter/security-controls.md against ADR-0007, ADR-0008, ADR-0009 and migrations 005/010: document seat-token authorization, service-role-only rate_limits/room_seats, authoritative next-seat cursor, token CSPRNG use, and the accepted rate-limit ADR.  (from sprint:supabase-service-boundary-types)
  - Boundaries: auth, secrets, database
- [x] deps.audit.0001 - Triage the 8 existing npm audit advisories and two blocked install scripts by source, exploitability, and safe remediation; do not approve scripts or upgrade dependencies without a separate dependency review.  (from sprint:pages-stale-deploy-guard)  (done 2026-07-28)

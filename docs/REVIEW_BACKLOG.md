# singedTerra — Review Backlog

> Generated 2026-06-07 by an adversarial multi-agent review (6 dimensions × skeptic verification × triage). **44** findings raised, **40** survived verification, consolidated into **16** tasks. Raw verified findings: [REVIEW_FINDINGS.md](./REVIEW_FINDINGS.md).

> **Status (2026-06-07): all 16 tasks resolved.** PR #5 landed P0-1/2/3, P1-4/5,
> P2-8/9/10/11/12, and the P3-13 OOB part + P3-15. A follow-up branch landed P3-14
> (`_shared/` extraction, all 10 functions redeployed), P3-16 (modal layering +
> theme tokens), P3-13b (barrel-relative aim readout + lobby controls legend),
> P1-7b (AI buy-to-restock + idempotent CPU-seat buy), and P1-6b (opponent-turn
> watchdog + dead-room handling). The networked UX items (P1-6b) and the in-game UI
> items (P3-16, P3-13b) still want a live 2-browser playtest to confirm visually.

## Executive summary

singedTerra's deterministic shared/ engine is the healthiest part of the codebase, but the Supabase networking layer has two correctness defects that break 3-4P and out-of-order play: the referee's pure-modulo turn cursor never skips eliminated players (deadlocks/corrupts every 3-4P game on first death), and buffered Realtime fire actions can be silently dropped while the engine is mid-flight (permanent per-client desync). Networked UX has no liveness or connection-state feedback at all — disconnects, dropped submits, and reaped rooms leave players frozen with no error or exit. The recent store/economy, shield, and AI sprints shipped but are gameplay-dead: every tank spawns with 9 of every weapon and 15000 unspendable credits, the shield no-sells 12 full nukes, and the AI never buys, shields, or uses any special weapon. A large amount of orphaned socket.io code (the entire server/ workspace, the shared Events.ts contract, dead deploy config) and stale CLAUDE.md docs describe an architecture that was replaced by Supabase lockstep, plus pervasive copy-paste across the 10 edge functions.

## At a glance

| Priority | Count |
|---|---|
| P0 | 3 |
| P1 | 4 |
| P2 | 5 |
| P3 | 4 |

| # | Priority | Effort | Task |
|---|---|---|---|
| 1 | P0 | S | Make the economy matter: stop spawning every tank with full premium ammo |
| 2 | P0 | M | Never advance nextExpectedSeq past an action the engine refused; tick to completion between buffered actions |
| 3 | P0 | L | Make the Supabase referee skip eliminated players when gating turns (fix 3-4P desync) |
| 4 | P1 | S | Make the active-player cursor durable (await it or compute the gate from the log) |
| 5 | P1 | M | Make the shield a damage pool instead of one-particle-per-hit |
| 6 | P1 | L | Surface networked liveness and connection state — disconnects, dropped submits, frozen turns, dead rooms |
| 7 | P1 | L | Teach the AI to use special weapons, shields, and the shop |
| 8 | P2 | S | Replace per-frame full-array terrain hash with a version counter |
| 9 | P2 | M | Validate finish_game's winner authoritatively |
| 10 | P2 | M | Make seq allocation race-safe (server-side atomic or bounded client retry) |
| 11 | P2 | M | Improve online lobby clarity: CPU/bot seats, color-clash, and waiting copy |
| 12 | P2 | M | Delete the dead socket.io stack and update CLAUDE.md to the Supabase architecture |
| 13 | P3 | S | Reconcile angle readout/controls discoverability and OOB boundary with spec |
| 14 | P3 | M | Consolidate edge-function boilerplate and shared row-shape types |
| 15 | P3 | M | Consolidate shared primitives: clamp, FNV-1a, color helpers, and hand-synced constants |
| 16 | P3 | M | Fix in-game UI layering and theming polish |

---

## 1. Make the economy matter: stop spawning every tank with full premium ammo

**P0** · effort **S** · _gameplay_

**User story**  
As a player, I want the store, credits, and per-damage earnings to actually change my decisions, so that the recent economy sprint is a real game system instead of decorative.

**Definition of success**
- Default loadout no longer grants 9 rounds of every premium weapon; premium tiers (nuke, baby_nuke, napalm, cluster, etc.) start at 0 (or a small deliberate amount) and must be acquired through the shop, with only baby_missile (and chosen starters) unlimited.
- STARTING_CREDITS and weapon prices are reconciled so a typical match requires meaningful buy decisions; a harness asserts a fresh tank cannot fire a nuke without first buying one (under the chosen design).
- Either the economy is wired to matter as above, OR the store/buy/credit code is deleted — the two systems no longer cancel out.

**Anti-patterns (avoid)**
- Tuning one constant in isolation so the AI (which never buys) becomes unable to function — coordinate with the AI-weapon task.
- Leaving DEFAULT_AMMO=9 and just lowering credits (still nothing to spend on).
- Changing loadout without re-checking the deterministic harnesses that assert starting inventory.

**Files**: `shared/src/engine/Tank.ts`, `shared/src/engine/WeaponSystem.ts`, `shared/src/engine/GameEngine.ts`  
**Why this priority/effort**: Headline feature of a whole sprint changes zero decisions; tiny constant-level fix, high gameplay impact.

---

## 2. Never advance nextExpectedSeq past an action the engine refused; tick to completion between buffered actions

**P0** · effort **M** · _code-quality_

**User story**  
As a player in an online match, I want every logged action to be applied to my local engine exactly once, so that back-to-back or out-of-order fire actions never get silently dropped and desync me from the canonical game.

**Definition of success**
- flushPendingActions never increments nextExpectedSeq for an action that GameEngine.applyAction refused (phase !== PLAYER_TURN).
- When action N puts the engine into FIRING, action N+1 is held until the engine returns to PLAYER_TURN (either by ticking N to completion synchronously before applying N+1, or by queueing N+1).
- A harness feeds two contiguous fire actions where the second arrives before the first finishes flight and asserts both are applied and final state matches a single-threaded replay of the same log.

**Anti-patterns (avoid)**
- Ticking to completion only when isReplaying (the current bug).
- Applying N+1's sub-actions unconditionally and relying on the RAF loop that cannot interleave inside the synchronous while-loop.
- Masking the drop by re-fetching the whole log on every flush instead of fixing the ordering invariant.

**Files**: `client/src/client/NetworkClient.ts`, `shared/src/engine/GameEngine.ts`  
**Why this priority/effort**: Latent but unrecoverable per-client desync on the normal turn-alternation path; verified critical.

---

## 3. Make the Supabase referee skip eliminated players when gating turns (fix 3-4P desync)

**P0** · effort **L** · _code-quality, gameplay_

**User story**  
As a player in a 3-4 player online match, I want the server to track turn order the same way my game engine does, so that the game keeps working after the first tank is eliminated instead of deadlocking or rejecting my legitimate fire.

**Definition of success**
- After any elimination in a 3-4P networked game, the referee's active seat matches every client engine's activePlayerId; the legitimate active player's fire is accepted and dead seats are never authorized.
- submit_action determines the active seat by skipping dead players — either by replaying the shared/ engine over the action log (SPEC §5 design) or by tracking per-seat alive state in the room row and advancing with the same dead-skipping loop as GameEngine.advanceTurn.
- A harness or integration test simulates a 3P game where seat 1 dies and asserts the referee accepts seat 2's next fire and rejects an action for the dead seat.

**Anti-patterns (avoid)**
- Leaving the pure-modulo cursor and only patching the comment.
- Duplicating the dead-skip logic in TypeScript-on-Deno in a way that can drift from GameEngine.advanceTurn (prefer reusing shared/ engine code).
- Storing alive state but updating it via the same fire-and-forget un-awaited write (see the cursor-durability task).

**Files**: `supabase/functions/submit_action/index.ts`, `shared/src/engine/GameEngine.ts`, `supabase/migrations/001_init.sql`  
**Why this priority/effort**: Guaranteed core event (elimination) breaks all 3-4P networked games; verified critical.

---

## 4. Make the active-player cursor durable (await it or compute the gate from the log)

**P1** · effort **S** · _code-quality_

**User story**  
As a player, I want the turn cursor to advance reliably after each turn-ending action, so that a dropped write or Edge Function teardown can't leave the next player permanently rejected as 'Not your turn'.

**Definition of success**
- The cursor advance is awaited and the request fails if it errors, OR the referee gate is computed from the action log on every call so no denormalized cursor can go stale.
- If the replay-based referee (P0 task) is adopted, the denormalized cursor is removed entirely and this concern disappears.
- An integration test simulates a failed cursor UPDATE and asserts the next player's turn is not permanently deadlocked.

**Anti-patterns (avoid)**
- Keeping the fire-and-forget .then() now that the cursor is the authoritative gate.
- Awaiting the update but still trusting a stale-comment claim that it is 'non-fatal'.
- Solving this independently of the 3-4P referee fix when both want the same log-derived source of truth.

**Files**: `supabase/functions/submit_action/index.ts`  
**Why this priority/effort**: Permanent deadlock on a dropped write, but probabilistic; folds naturally into the P0 referee redesign.

---

## 5. Make the shield a damage pool instead of one-particle-per-hit

**P1** · effort **M** · _gameplay_

**User story**  
As a player, I want shields to absorb a sensible amount of damage proportional to hits' magnitude, so that a shield is neither invulnerability to 12 nukes nor near-useless against napalm.

**Definition of success**
- applyBlastDamage decrements shield capacity by actual damage (a fixed HP pool) rather than negating any single hit regardless of magnitude, OR napalm is made to bypass/not consume particles — with the chosen rule documented.
- A harness asserts a shielded tank does NOT fully no-sell 12 direct nukes and that napalm and direct fire deplete the shield commensurate with damage dealt.
- The change preserves determinism (no wall-clock, no Math.random in the damage path).

**Anti-patterns (avoid)**
- Introducing floating-point nondeterminism in the absorption math that diverges hot-seat vs networked replay.
- Special-casing napalm in a way that double-counts the dotPerTick path at GameEngine.ts:744.
- Tuning particle count without changing the magnitude-blind early return (the actual defect).

**Files**: `shared/src/engine/GameEngine.ts`, `shared/src/engine/WeaponSystem.ts`  
**Why this priority/effort**: Degenerate, documented-but-broken balance (buy shield = unkillable by direct fire); tunable, determinism-sensitive.

---

## 6. Surface networked liveness and connection state — disconnects, dropped submits, frozen turns, dead rooms

**P1** · effort **L** · _ux_

**User story**  
As a networked player, I want clear feedback when the connection drops, the opponent stalls, my shot fails, or the room disappears, so that I am never stuck on a silently frozen board with no error and no way out.

**Definition of success**
- Every supabase.channel().subscribe() passes the status callback; on CHANNEL_ERROR/TIMED_OUT/CLOSED the client shows a 'Connection lost — reconnecting…' overlay and re-fetches+replays the action log on recovery (anon SELECT already supports this).
- A per-turn watchdog shows a non-blocking 'Waiting for {playerName}…' banner after an idle threshold and an 'opponent may have disconnected — leave to lobby' option after a longer timeout.
- On a failed submit_action or a never-arriving echo, _isFiring is cleared, the weapon strip is restored, and a 'Shot failed — try again' message appears (with a timeout fallback so the player is never permanently locked in 'Sending…').
- The waiting room handles room DELETE / the player's own removal from row.players and returns to the create view with 'This room is no longer available.'

**Anti-patterns (avoid)**
- Auto-resubmitting a fire on reconnect in a way that double-applies it to the deterministic log.
- Clearing _isFiring on a timer without reconciling whether the action actually committed.
- Blocking modal overlays that trap the player instead of non-blocking banners with an explicit exit.

**Files**: `client/src/client/NetworkClient.ts`, `client/src/main.ts`, `client/src/ui/Lobby.ts`, `client/src/ui/HUD.ts`  
**Why this priority/effort**: Bundles four verified no-feedback failures (frozen turn, dead channel, stuck Sending, dead room) into one networked-resilience effort.

---

## 7. Teach the AI to use special weapons, shields, and the shop

**P1** · effort **L** · _gameplay_

**User story**  
As a single-player, I want the computer opponent to use shields, area weapons, and the economy, so that it showcases the recent sprint content and can't be trivially out-traded by shielding or napalm.

**Definition of success**
- Hard bots raise a shield defensively when low on health and shield is in stock (closing the unbreakable-shield exploit), and the weapon ladder includes at least some special weapons (betty/cluster/napalm/funky) where appropriate.
- Weapon choice scales to expected damage needed (does not nuke a near-dead tank) and the bot can buy to restock when its premium ladder is exhausted (it has unspent credits).
- All AI decisions remain pure forward-sim and deterministic; a harness asserts identical bot plans across repeated runs of the same state, and that a low-HP hard bot with a shield in stock chooses use_shield.

**Anti-patterns (avoid)**
- Adding Math.random() or wall-clock into the planner (breaks determinism and the all-clients-submit-the-bot model).
- Making simulateImpact mutate engine state or grow an 'AI probe mode' flag in GameEngine.tick.
- Coupling the bot's buy logic to credits before the economy task lands — coordinate ordering.

**Files**: `shared/src/engine/AI.ts`, `client/src/main.ts`, `client/src/client/NetworkClient.ts`  
**Why this priority/effort**: Half the sprint content is invisible in single-player and a trivial exploit exists; bundles the AI weapon/shield/buy and ammo-conservation findings.

---

## 8. Replace per-frame full-array terrain hash with a version counter

**P2** · effort **S** · _ui_

**User story**  
As a player, I want terrain rendering to skip work when nothing changed, so that the dirty-flag architecture isn't defeated by a 400k-element scan every frame.

**Definition of success**
- The engine bumps a terrain-version integer on deformation and threads it through GameState; the renderer compares the integer instead of re-hashing all 400,000 bytes each draw().
- Terrain still re-renders correctly on every deformation (explosion/dirt) and not otherwise.
- No determinism change to the engine's terrain data; the version is render-only metadata.

**Anti-patterns (avoid)**
- Sampling a sparse subset that can miss a small deformation.
- Computing the hash and then comparing the version (leaving the scan in the hot path).
- Putting render-cache concerns into the deterministic physics path.

**Files**: `client/src/renderer/TerrainRenderer.ts`, `client/src/renderer/Renderer.ts`, `shared/src/engine/Terrain.ts`, `shared/src/types/GameState.ts`  
**Why this priority/effort**: Real avoidable per-frame cost that undermines the documented dirty-flag design; small fix.

---

## 9. Validate finish_game's winner authoritatively

**P2** · effort **M** · _code-quality_

**User story**  
As a player, I want the recorded game winner to be the real winner, so that no client (malicious or merely desynced) can finish a room with an arbitrary winner string.

**Definition of success**
- finish_game derives or validates the winner — at minimum requiring the caller be a room member and that winnerId is a roster id and the log actually terminates the game (ideally replay the shared/ engine).
- An unauthenticated POST with an arbitrary winnerId to an active room is rejected.
- CORS/auth posture for finish_game is reviewed alongside the validation.

**Anti-patterns (avoid)**
- Trusting the client-supplied winnerId with only an .eq('status','active') guard (current behavior).
- Adding membership check but still skipping roster/log validation.
- Coupling Deno replay to browser code instead of reusing shared/.

**Files**: `supabase/functions/finish_game/index.ts`, `client/src/client/NetworkClient.ts`  
**Why this priority/effort**: Real missing-authorization defect but bounded to the persisted scoreboard record; no in-game state impact.

---

## 10. Make seq allocation race-safe (server-side atomic or bounded client retry)

**P2** · effort **M** · _code-quality_

**User story**  
As a player firing near-simultaneously with another, I want my action to commit reliably, so that a seq collision doesn't silently drop my shot after a single 50ms retry.

**Definition of success**
- Seq is allocated atomically server-side (a Postgres function/RPC computing MAX(seq)+1 in one statement, or a per-room counter incremented in UPDATE...RETURNING), OR the client does bounded exponential retries on 409 instead of one 50ms one-shot.
- A concurrent-submit test shows no action is permanently lost; the loser either commits on retry or is correctly a no-op (idempotent bot case).
- UNIQUE(room_id,seq) remains as the final guard.

**Anti-patterns (avoid)**
- Adding retries that re-submit an action the referee already rejected.
- Treating the benign idempotent-bot loser as needing a retry.
- Leaving the single 50ms one-shot for the two-human case.

**Files**: `supabase/functions/submit_action/index.ts`, `client/src/client/NetworkClient.ts`  
**Why this priority/effort**: Narrow collision window and UNIQUE prevents corruption, but a dropped human action is a real robustness smell.

---

## 11. Improve online lobby clarity: CPU/bot seats, color-clash, and waiting copy

**P2** · effort **M** · _ux_

**User story**  
As a host setting up an online room, I want the waiting room to reflect bot seats, accessible clash signals, and accurate copy, so that a mostly-CPU room doesn't read as perpetually waiting and clashes are understandable by everyone.

**Definition of success**
- Waiting-room rows badge bot seats (🤖/Ready) and the header/sub-copy reflects human readiness (e.g. '1/2 humans ready') instead of counting bots toward an apparently-unfilled 'Waiting for players...'.
- Color/name clashes carry a non-color cue (text/icon) visible to all players, not just a red ring shown only to the clashing client.
- Copy no longer implies a 1-human+3-CPU room is waiting on humans who will never come.

**Anti-patterns (avoid)**
- Relying on color alone for the clash signal (colorblind regression).
- Showing the actionable warning only to the clashing player.
- Hardcoding bot detection in the UI when emitNetworkReady already forwards the ai flag.

**Files**: `client/src/ui/Lobby.ts`, `client/src/ui/HUD.ts`  
**Why this priority/effort**: Bundles two verified medium/low UX clarity+accessibility gaps in the same lobby code.

---

## 12. Delete the dead socket.io stack and update CLAUDE.md to the Supabase architecture

**P2** · effort **M** · _orphan-code_

**User story**  
As a developer, I want the repo and its top-authority docs to reflect the real Supabase-lockstep architecture, so that no one builds against or deploys the abandoned socket.io server.

**Definition of success**
- The server/ workspace is removed from package.json workspaces and the dev:server/build/typecheck scripts (and the lockfile), or at minimum dropped from the default build/dev path.
- ecosystem.config.cjs and the nginx /socket.io location block are deleted (static try_files block kept).
- The dead socket.io contract in shared/src/types/Events.ts (SocketEvents + 9 payloads + 2 event maps) is removed, GameOptions preserved (e.g. moved to its own module), with index.ts updated.
- CLAUDE.md's networked-mode and Deployment sections describe Supabase lockstep + edge functions + Postgres (no pm2/nginx/SQLite/:3000), matching TASKS.md/SPEC.md.

**Anti-patterns (avoid)**
- Deleting Events.ts wholesale and breaking the live GameOptions import.
- Removing server/ from build but leaving stale CLAUDE.md claims that mislead future work.
- Deleting the nginx static-serving block along with the socket proxy.

**Files**: `server/src/index.ts`, `server/src/GameServer.ts`, `server/src/RoomManager.ts`, `package.json`, `ecosystem.config.cjs`, `nginx.conf`, `shared/src/types/Events.ts`, `shared/src/index.ts`, `CLAUDE.md`  
**Why this priority/effort**: Bundles four verified orphan/stale-doc findings (server stub, deploy config, Events contract, CLAUDE.md) into one cleanup; no runtime impact but high misleading-surface cost.

---

## 13. Reconcile angle readout/controls discoverability and OOB boundary with spec

**P3** · effort **S** · _ux, code-quality_

**User story**  
As a new keyboard player, I want the angle number to move the way the barrel moves and the controls to be discoverable, and as a developer I want the OOB boundary to match SPEC, so that aiming reads correctly and the right wall behaves as documented.

**Definition of success**
- The controls legend is visible before the canvas is uncovered (in the lobby or a one-time how-to), and the angle readout is relabeled or presented barrel-relative so Left/Right move the number intuitively.
- Physics.collide() OOB boundary and SPEC.md:173 are made to agree, with the chosen convention documented; a harness asserts a shot landing at the right edge hits column 799 rather than being dropped as OOB.
- No determinism change — all clients still agree on the boundary.

**Anti-patterns (avoid)**
- Inverting the input mapping in a way that breaks deterministic replay of logged angles.
- Changing the OOB guard without updating SPEC (perpetuating the drift).
- Adding a controls tutorial that blocks the start flow.

**Files**: `client/src/input/InputHandler.ts`, `client/src/ui/HUD.ts`, `shared/src/engine/Physics.ts`, `docs/SPEC.md`  
**Why this priority/effort**: Bundles the low-severity angle-readout/discoverability and OOB spec-drift findings; small, safe polish.

---

## 14. Consolidate edge-function boilerplate and shared row-shape types

**P3** · effort **M** · _consolidation_

**User story**  
As a developer, I want one canonical place for CORS, request preamble, the room-row types, and the reaper, so that a policy or schema change is a one-file edit and the StoredOptions/error-string drift stops.

**Definition of success**
- A supabase/functions/_shared/ module exports corsHeaders(), a withCors(handler) wrapper (OPTIONS+405+JSON parse), getServiceClient(), and canonical StoredPlayer/StoredOptions plus reap()+STALE_MS.
- All 10 functions consume the shared module; the divergent finish_game env-error string and the visibility-less join_room StoredOptions are reconciled.
- Server-only change with no determinism or client-coupling risk; functions still pass their existing behavior.

**Anti-patterns (avoid)**
- Importing shared/ browser types into Deno or vice versa (keep this within supabase/functions/_shared).
- Two STALE_MS literals remaining after consolidation.
- Silently changing behavior while deduping (e.g. altering a 500 body other code asserts on).

**Files**: `supabase/functions/create_room/index.ts`, `supabase/functions/join_room/index.ts`, `supabase/functions/list_rooms/index.ts`, `supabase/functions/submit_action/index.ts`, `supabase/functions/finish_game/index.ts`, `supabase/functions/restart_game/index.ts`  
**Why this priority/effort**: Pure maintainability/DRY across 10 functions with one realized drift; bundles the CORS, StoredPlayer/Options, and reaper findings.

---

## 15. Consolidate shared primitives: clamp, FNV-1a, color helpers, and hand-synced constants

**P3** · effort **M** · _consolidation, code-quality_

**User story**  
As a developer, I want determinism-relevant primitives and tuning constants defined once, so that a fix to one copy can't silently desync hot-seat vs networked replay.

**Definition of success**
- clamp is exported once from shared (e.g. shared/src/engine/math.ts) and imported by GameEngine, AI, Terrain, InputHandler, and Lobby.
- WeaponSystem's bouncing_betty bounce constants reference Physics.MAX_BOUNCES/BOUNCE_RESTITUTION, and BARREL_LENGTH is exported once and imported by both AI and GameEngine — removing the 'MUST match' hand-sync comments.
- Renderer.parseColor delegates to theme.hexToRgb; FNV-1a is unified only if kept readability-only (AI seed stays seed-stable; do NOT couple TerrainRenderer's render-cache hash into shared).

**Anti-patterns (avoid)**
- Changing clamp's NaN/edge behavior while consolidating (silent determinism drift across the engine).
- Merging AI.simulateImpact into GameEngine.tick (the reduced first-impact probe must stay separate).
- Pulling the renderer's throwaway hash into shared just to save lines.

**Files**: `shared/src/engine/GameEngine.ts`, `shared/src/engine/AI.ts`, `shared/src/engine/Terrain.ts`, `shared/src/engine/WeaponSystem.ts`, `shared/src/engine/Physics.ts`, `client/src/input/InputHandler.ts`, `client/src/renderer/Renderer.ts`, `client/src/ui/theme.ts`  
**Why this priority/effort**: Bundles clamp, betty-constants, BARREL_LENGTH, FNV, and color-helper findings; determinism-drift risk justifies grouping despite low individual severity.

---

## 16. Fix in-game UI layering and theming polish

**P3** · effort **M** · _ui_

**User story**  
As a player, I want in-game modals to render cleanly above the CRT chrome and near their triggers, with consistent theme tokens, so that the store and game-over panels are legible and coherent.

**Definition of success**
- The store/game-over modal layer renders above the CRT ::before/::after chrome (z-index above 31, like #lobby), or the CRT chrome is scoped to #stage so it never overlaps interactive panels.
- The store modal is mounted/positioned so it relates to its trigger (full-#app overlay or panel-anchored popover) rather than centering over the canvas on the far left.
- theme.ts vignetteAlpha and --crt-vignette-alpha are reconciled (ideally generated from theme.ts), and lobby inline #9aa3b2/#6ff09a colors use theme tokens.

**Anti-patterns (avoid)**
- Raising the modal z-index without also fixing the pointer/legibility so chrome still dims it.
- Mounting an inset:0 modal into the canvas-only #game-overlay region.
- Leaving the 'single source of truth' theme contract silently broken.

**Files**: `client/src/style.css`, `client/src/ui/HUD.ts`, `client/src/ui/theme.ts`, `client/src/ui/Lobby.ts`  
**Why this priority/effort**: Bundles CRT z-index, store placement, theme-token drift, and lobby hardcoded-color findings — all cosmetic/legibility, no functional break.

---


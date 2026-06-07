# singedTerra — Verified Review Findings

> Generated 2026-06-07. 40 findings that survived independent adversarial verification (of 44 raised). Triaged into tasks in [REVIEW_BACKLOG.md](./REVIEW_BACKLOG.md).

## 1. [CRITICAL] Referee turn-cursor desyncs from engine on any 3-4P elimination (raw modulo never skips dead players)

_dimension: code-quality · verifier confidence: 5/5_

**Location**: supabase/functions/submit_action/index.ts:209,299; shared/src/engine/GameEngine.ts:528-540; supabase/migrations/001_init.sql:20-23

**Problem**: The Supabase referee enforces turn ownership using a raw modulo cursor: activeIndex = active_player_index % players.length, advanced by (idx+1)%players.length on every turn-ending action. This NEVER skips eliminated players. The authoritative engine's advanceTurn() DOES skip dead tanks (loops until cand.alive). The instant any player dies in a 3-4P game, the referee's notion of the active seat diverges from every client's engine. The referee will then reject the legitimate active player's fire ('Not your turn') and/or authorize a dead seat, deadlocking or corrupting the game.

**Evidence**: submit_action:209 `const activeIndex = ((room.active_player_index ?? 0) % players.length + players.length) % players.length` and :299 `const newActivePlayerIndex = (room.active_player_index + 1) % players.length` — pure modulo, no alive check, no access to which tanks are dead (it never replays the engine). GameEngine.advanceTurn (528-540) skips with `if (cand.alive)`. The migration comment (001_init.sql:20-23) flatly states 'active_player_index is advisory only. It is NOT used for turn-ownership enforcement' — directly contradicted by submit_action which calls the same field 'REFEREE TURN-ENFORCEMENT ... NON-OPTIONAL' (199-216). The code's own comment at :201 admits 'exact for 2P; see the 3-4P elimination caveat'.

**Suggested fix**: The stateless referee must determine the active seat the same way the engine does. Either (a) replay the shared/ engine over the action log inside submit_action (the documented design in SPEC §5 — 'replays the shared/ engine to confirm it is that player's turn') and read its activePlayerId, or (b) track per-seat alive state in the room row and advance the cursor with the same dead-skipping loop. Pure modulo is only correct for 2 players.

**Verifier verdict**: REAL and correctly characterized. submit_action/index.ts:209 computes the active seat with pure modulo `((room.active_player_index ?? 0) % players.length + players.length) % players.length` and :299 advances it with `(room.active_player_index + 1) % players.length` — neither has any alive/dead check, and the referee never replays the engine. The room.players JSONB (migration 001_init.sql:18) carries only {id,name,color,ready} — no alive state — so the referee cannot skip dead seats. GameEngine.advanceTurn (GameEngine.ts:528-540) DOES skip dead tanks (loops to the next `cand.alive`). Therefore the moment any player is eliminated in a 3-4P game, the referee's modulo cursor lands on a dead/wrong seat while every client engine has advanced past it, so the referee rejects the real active player's fire ('Not your turn', :211-215) and/or authorizes a dead seat — deadlock/corruption. The code's own comments confirm the gap: :200-202 'exact for 2P; see the 3-4P elimination caveat', while migration :20-23 calls active_player_index 'advisory only... NOT used for turn-ownership enforcement' — flatly contradicted by the NON-OPTIONAL referee gate at :199-216. 2P is unaffected (game ends on first death). Critical severity is justified because elimination is a guaranteed core event and it breaks all 3-4P networked games.

---

## 2. [CRITICAL] Buffered Realtime fire actions silently dropped during live flight → permanent client desync

_dimension: code-quality · verifier confidence: 4/5_

**Location**: client/src/client/NetworkClient.ts:534-546, 490-503; shared/src/engine/GameEngine.ts:219-220

**Problem**: flushPendingActions() drains ALL contiguous buffered actions in a tight while-loop WITHOUT ticking to completion between them during live play (tickToCompletion is gated behind isReplaying). applyNetworkAction synthesizes a fire as set_angle/set_power/select_weapon/fire and applies them immediately. But GameEngine.applyAction returns early when phase !== 'PLAYER_TURN' (line 220). If action N puts the engine into FIRING (its flight animates over the RAF loop across many frames) and action N+1 is already buffered (or arrives before N's flight finishes), the loop applies N+1 while the engine is still FIRING — all four of N+1's sub-actions are silently dropped. nextExpectedSeq has already advanced past N+1, so the action is lost forever and this client diverges from the canonical log irrecoverably.

**Evidence**: flushPendingActions:535 `while (this.pendingActions.has(this.nextExpectedSeq))` increments nextExpectedSeq (:538) and calls applyNetworkAction (:540) every iteration, but :543 `if (this.isReplaying) this.tickToCompletion();` only ticks during replay — live play relies on the RAF loop which has not run between loop iterations. applyNetworkAction:499-502 issues the fire sub-actions unconditionally. GameEngine.applyAction:219-220 `if (this.state.phase !== 'PLAYER_TURN') return;` drops them when the engine is mid-flight (FIRING).

**Suggested fix**: Tick to completion after each applied action in flushPendingActions regardless of isReplaying (resolve outcome synchronously, then let the RAF loop replay/animate the just-applied flight from a stored marker), OR queue subsequent actions and only flush the next once the engine returns to PLAYER_TURN. Never advance nextExpectedSeq past an action the engine refused to apply.

**Verifier verdict**: CONFIRMED. All cited code matches. flushPendingActions (NetworkClient.ts:534-546) drains contiguous buffered actions in a synchronous while-loop; line 543 `if (this.isReplaying) this.tickToCompletion();` only ticks to completion during initialize() replay — during live play it relies on the RAF loop (start(), line 247-252), which is single-threaded JS and CANNOT interleave inside the synchronous while-loop. applyNetworkAction (490-503) synthesizes a fire as set_angle/set_power/select_weapon/fire applied unconditionally. GameEngine.applyAction (219-220) `if (this.state.phase !== 'PLAYER_TURN') return;` — and on a `fire` the engine transitions to FIRING (line 234-258, projectiles populated). So once action N's fire flips the engine to FIRING, action N+1's four sub-actions all hit line 220 and are silently dropped, while nextExpectedSeq has already advanced (line 538) — the action is lost forever and the client diverges from the canonical log. The trigger is real and the code anticipates it: the buffering comment (200-204) explicitly states Realtime does NOT guarantee delivery order ('seq=6 may arrive before seq=5'), which is exactly the condition (N+1 buffered before N arrives) that makes the loop apply N+1 in the same synchronous pass while the engine is still FIRING. Back-to-back fire actions are the normal turn-alternation case, so the only thing preventing the bug is in-order delivery — which is not guaranteed. Severity critical is apt: in deterministic lockstep, a dropped action is unrecoverable per-client desync. Confidence 4 not 5 because it requires out-of-order delivery of two contiguous actions (first being a fire) to manifest — latent, not deterministic on every shot.

---

## 3. [HIGH] Cursor update is fire-and-forget; a dropped UPDATE mis-gates the referee for the rest of the game

_dimension: code-quality · verifier confidence: 5/5_

**Location**: supabase/functions/submit_action/index.ts:298-314

**Problem**: After a successful turn-ending insert, the active-player cursor is advanced with an un-awaited, fire-and-forget supabase.update().then(...). The Edge Function returns 200 before that write is confirmed. Because the same cursor is now the authoritative referee gate (finding #1), if that update fails or the function instance is torn down before it completes (Edge Functions can be killed after the response is sent), active_player_index is never advanced. The next player's legitimate fire is then rejected as 'Not your turn' forever — the game deadlocks. The code comment claims this is 'non-fatal to game correctness' which was true when the cursor was advisory but is now false.

**Evidence**: submit_action:305-313 `supabase.from('rooms').update({...}).eq('id', roomId).then(({error}) => {...})` — not awaited; the function proceeds to return at :316. Comment at :302-304 'Fire-and-forget — a failed cursor update is non-fatal to game correctness (the canonical state is the action log), but it would mis-gate the referee' acknowledges the mis-gate but still does not await it. The response is sent (:316-319) independent of the update resolving.

**Suggested fix**: await the cursor update and fail the request (or compute the gate from the action log on every call instead of from the denormalized cursor) so the referee gate can never be left stale. With finding #1's replay-based approach this denormalized cursor disappears entirely.

**Verifier verdict**: REAL and correctly characterized. submit_action/index.ts:305-313 advances active_player_index with an un-awaited supabase.update().then(...), and the function returns 200 at :316-319 independent of that write resolving — exactly as cited. The premise that this cursor is now the authoritative referee gate is verified at :199-216 ("REFEREE TURN-ENFORCEMENT ... NON-OPTIONAL"), where activeIndex is derived from room.active_player_index (:209) and a mismatch returns 403 "Not your turn" (:211-214). I grepped active_player_index across the repo: it is written only in create_room (init 0), restart_game (reset 0), and this fire-and-forget update — there is NO client-side repair and NO log-based recomputation, so a lost UPDATE leaves the cursor permanently stale and deadlocks the next player's turn until a game restart. The stale comment at :302-304 (and migration 001_init.sql:20 "advisory only ... NOT used for turn-ownership enforcement") confirms the doc/code drift the finding flags. Severity "high" is appropriate: permanent unrecoverable deadlock, but only triggered by a dropped write / Edge Function teardown after response flush, so probabilistic rather than guaranteed — not critical. Suggested fix (await the update and fail, or compute the gate from the action log) is sound.

---

## 4. [HIGH] The store/economy is dead on arrival: every tank starts with 9 rounds of every weapon AND 15000 credits

_dimension: gameplay · verifier confidence: 5/5_

**Location**: shared/src/engine/Tank.ts:18-19,45-60,94; shared/src/engine/WeaponSystem.ts:208

**Problem**: The 'generous sandbox' default loadout (DEFAULT_AMMO = 9) gives every tank 9 rounds of EVERY weapon — including nuke, baby_nuke, napalm, shield, cluster — at game start, while STARTING_CREDITS is also 15000. There is nothing meaningful to spend credits on: you already own 9 nukes before firing a shot. The entire store/buy economy, the per-damage credit earnings, and the price/bundle/arms-level tuning are decorative. A player never needs the shop; the AI never uses it either. The economy is the headline of the recent store sprint yet it changes zero decisions.

**Evidence**: Tank.ts:19 `const DEFAULT_AMMO = 9;` then defaultInventory() at :45-60 sets every non-unlimited weapon to `limited(9)` (missile, heavy_missile, baby_nuke, nuke, dirt_bomb, bouncing_betty, funky_bomb, napalm, cluster_bomb, shield all = 9). createTank :94 sets `credits: STARTING_CREDITS` (15000). With 9 nukes (radius 90, maxDamage 100) in hand, the buy action at GameEngine.ts:281-292 is never economically necessary.

**Suggested fix**: Pick ONE source of weapons. For a real economy, set DEFAULT_AMMO to 0 for premium tiers (keep only baby_missile unlimited + maybe a couple of missiles) and force everything else through the shop. Otherwise delete the store. As written they cancel each other out.

**Verifier verdict**: Confirmed in the actual code. Tank.ts:19 `const DEFAULT_AMMO = 9`; defaultInventory() (Tank.ts:45-60) assigns `limited(9)` to every non-unlimited weapon — missile, heavy_missile, baby_nuke, nuke, dirt_bomb, bouncing_betty, funky_bomb, napalm, cluster_bomb, shield — with only baby_missile unlimited. createTank (Tank.ts:94) and Tank.create (Tank.ts:195) both set `credits: STARTING_CREDITS`, and WeaponSystem.ts:208 `STARTING_CREDITS = 15000`. The buy action exists and works (GameEngine.ts:281-292), and weapon prices are real (nuke 12000, napalm 10000, cluster_bomb 20000 — WeaponSystem grep). So the economy IS functionally dead on arrival: every tank already owns 9 of every premium weapon at spawn, so the 15000 credits + per-damage earnings buy nothing a player needs. I also confirmed AI.ts contains zero references to buy/credits, so computer opponents never use the shop either. The characterization is accurate. Severity adjusted from critical to high: this is a game-balance/dead-feature problem, not a correctness/crash/determinism defect — the code runs correctly, it's just that two systems (generous sandbox loadout vs. credit economy) cancel each other out, fixable by tuning one constant.

---

## 5. [HIGH] Shield particle absorbs an ENTIRE blast regardless of magnitude — a Nuke and a 0.7 napalm tick both cost exactly one particle

_dimension: gameplay · verifier confidence: 5/5_

**Location**: shared/src/engine/GameEngine.ts:562-573,595,744; shared/src/engine/WeaponSystem.ts:198

**Problem**: applyBlastDamage negates the full damage of any single hit per particle with no notion of magnitude. With SHIELD_PARTICLES = 12, a shielded tank fully no-sells TWELVE direct Nukes (12 x 100 = 1200 damage absorbed) — it is functionally invulnerable to direct fire for the rest of a normal game. Conversely against napalm (dotPerTick 0.7, routed through the same function at :744) each particle eats a 0.7-damage tick, so the same 12-particle shield blocks only ~8.4 total napalm damage. The shield is absurdly strong vs every direct weapon and near-worthless vs napalm — the worst possible balance split, and it is a degenerate strategy: buy shield, become unkillable by missiles/nukes.

**Evidence**: GameEngine.ts:564-566 `if (tank.shieldParticles > 0) { tank.shieldParticles--; return; }` returns BEFORE any damage scaling — the amount (whether 100 or 0.7) is discarded entirely. WeaponSystem.ts:198 `SHIELD_PARTICLES = 12`. processFire routes each burn tick through the same path at :744 `if (inFire) this.applyBlastDamage(tank, def.dotPerTick);`, so napalm strips a particle for 0.7 dmg.

**Suggested fix**: Make the shield a damage POOL (e.g. absorb a fixed HP, like particles*N hit-points decremented by actual damage), or have napalm bypass/not consume the shield. A binary 'one hit = one particle' is unbalanced across a roster with 100x damage variance.

**Verifier verdict**: Confirmed in code. shared/src/engine/GameEngine.ts:562-567 applyBlastDamage does `if (tank.shieldParticles > 0) { tank.shieldParticles--; return; }` BEFORE any damage scaling — the `amount` (whether a 100-dmg Nuke or a 0.7 napalm tick) is discarded entirely, so each particle absorbs exactly one hit regardless of magnitude. SHIELD_PARTICLES = 12 (WeaponSystem.ts:198), applied via use_shield (GameEngine.ts:302). Detonation routes scaled blast damage through applyBlastDamage at :595; napalm routes def.dotPerTick (NAPALM_DOT = 0.7, WeaponSystem.ts:189,371) through the same function at :744. So 12 particles no-sell 12 full direct hits (~1200 dmg) but only ~8.4 napalm damage — the exact degenerate split the finding describes. The magnitude-blind absorption and the napalm-vs-direct imbalance are accurately characterized. Two tempering facts: (1) the comments at :554-560 show this is DELIBERATE, documented design, not an accidental bug; (2) the shield is not free — use_shield consumes ammo (GameEngine.ts:299,303), costs the entire turn, and is gated on inventory/credits, so one charge = 12 hits then it's spent. "Functionally invulnerable for the rest of a normal game" is somewhat overstated (depends on shield stock). Real balance defect, but tunable and turn/ammo-gated, so high rather than critical.

---

## 6. [HIGH] Networked game silently freezes forever when an opponent disconnects mid-game — no feedback, no recovery

_dimension: ux · verifier confidence: 5/5_

**Location**: client/src/client/NetworkClient.ts:188-233 (both `.subscribe()` calls), 246-253 (start loop), 283-340 (sendAction); client/src/main.ts:115-137

**Problem**: In a networked match the engine only advances when the active player's turn-ending action lands in the action log. If the player whose turn it is closes their tab, loses connection, or just walks away, no action is ever submitted and every other client sits on a frozen board with the active-player pulse animating indefinitely. There is no turn timer, no skip, no 'waiting for X' / 'opponent disconnected' message, and no way out except the Menu button. The frustrated player has no idea whether the game is broken, lagging, or waiting on someone.

**Evidence**: NetworkClient.start() (246-253) just ticks the engine, which is a no-op in PLAYER_TURN until a logged action arrives via flushPendingActions (534-546). Nothing detects a stalled turn. docs/TASKS.md:44 even concedes 'async turns let a player act later regardless' — i.e. the design has NO liveness guarantee, but the UI never communicates that 'later' to the waiting human. GameServer.ts:55 carries a literal 'TODO: skip turn / handle reconnect window (MVP2)'.

**Suggested fix**: Add a per-turn watchdog in the networked client: if the active turn has been idle past a threshold, surface a non-blocking 'Waiting for {playerName}…' banner, and after a longer timeout an 'Opponent may have disconnected' state with an option to leave to the lobby. Longer term, implement the turn-skip/timeout the TODO already flags.

**Verifier verdict**: Confirmed in code. NetworkClient.start() (NetworkClient.ts:246-253) only calls engine.tick()+emitState() each frame; tick() is a no-op during PLAYER_TURN until a logged turn-ending action arrives via flushPendingActions (534-546). No turn timer, watchdog, idle detector, "waiting for X" or "opponent disconnected" UI exists anywhere in the in-game client path — a grep over client/src for timer|timeout|watchdog|disconnect|reconnect|idle|waiting|stall|skip-turn returns only lobby waiting-room text (Lobby.ts) and AI-think / rematch-retry setTimeouts (main.ts:162-167, NetworkClient.ts:417,472). The in-game active-player pulse in main.ts:115-134 is driven solely by state.activePlayerId and never times out. Corroborating evidence checks out: docs/TASKS.md:44 states "async turns let a player act later regardless" (no liveness guarantee), and server/src/GameServer.ts:55 carries the literal "TODO: skip turn / handle reconnect window (MVP2)". So if the active player closes their tab or walks away, every other client sits on a frozen board with no feedback and no exit except Menu. Real and correctly characterized. Severity adjusted from critical to high: it is a genuine, material UX gap in a core mode, but the engine/state is not corrupted and the design intentionally supports async "act later" turns (a returning player resumes correctly) — the defect is the failure to COMMUNICATE that waiting state, not a broken game, which fits high rather than critical for a UX-dimension finding.

---

## 7. [HIGH] Realtime subscription status is completely ignored — connection drops produce a silently dead game with no error UI

_dimension: ux · verifier confidence: 5/5_

**Location**: client/src/client/NetworkClient.ts:188-208 and 214-232 (room_actions + rooms channels); client/src/ui/Lobby.ts:1194-1234 (waiting-room channel)

**Problem**: Every `supabase.channel(...).subscribe()` call discards the subscription status callback. Supabase emits SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED, and on WebSocket loss the client stops receiving action inserts and room updates entirely. In-game this means fired shots from opponents never arrive and the board freezes with zero indication that the socket died; in the waiting room a Ready-Up by another player is never seen. A new player on flaky wifi experiences a 'broken game' with no error, no reconnect prompt, and no retry.

**Evidence**: `.subscribe()` is called with no callback at NetworkClient.ts:208 and 232, and at Lobby.ts:1234. A repo-wide grep for CHANNEL_ERROR / TIMED_OUT / reconnect / navigator.onLine returns only docs and the unused server/; there is no client-side connection-state handling anywhere.

**Suggested fix**: Pass the status callback to every `.subscribe((status) => …)`, surface a 'Connection lost — reconnecting…' overlay on CHANNEL_ERROR/TIMED_OUT/CLOSED, and re-fetch+replay the action log (the data already supports it; migrations/001 line 103 notes anon SELECT exists 'for replay on reconnect') once the channel recovers.

**Verifier verdict**: Confirmed in code. All three cited .subscribe() calls discard the status callback: NetworkClient.ts:208 (room_actions channel), NetworkClient.ts:232 (rooms rematch channel), and Lobby.ts:1234 (waiting-room channel) — each ends in a bare `.subscribe()` with no `(status) => ...` handler. A client-wide grep for CHANNEL_ERROR / TIMED_OUT / SUBSCRIBED / CLOSED / reconnect / navigator.onLine / disconnect / offline / onError returns zero matches in client/src; the only `.subscribe(` calls in the whole client are exactly these three. The many 'overlay' hits are unrelated (game-over modal, lobby, splash, controls legend) — there is no connection-lost or error UI. The fix premise also checks out: supabase/migrations/001_init.sql:103 comments that anon SELECT on room_actions exists 'for replay on reconnect', so the action-log replay path the suggested fix relies on does exist. So the mechanism (dropped channel = no more action INSERTs/room UPDATEs = silently frozen board/waiting room with no feedback) and the evidence are accurate. Severity adjusted from critical to high: it is a UX/no-feedback failure that only manifests on network loss (an expected but not constant condition), not a defect under normal play; Supabase Realtime also auto-reconnects the socket by default, though the seq-buffer never backfills actions missed during downtime so a permanent stall is still possible. Real and serious, but conditional on a failure mode rather than always-on.

---

## 8. [HIGH] Fire is fire-and-forget with no failure feedback — a dropped submit_action leaves the player locked in 'Sending…' indefinitely

_dimension: ux · verifier confidence: 5/5_

**Location**: client/src/client/NetworkClient.ts:338-339 and 445-483 (submitAction), 310-311 (use_shield); client/src/ui/HUD.ts:416-418 ('Sending...')

**Problem**: When the player fires, `_isFiring` is set true (locking all input) and the action is POSTed fire-and-forget. `_isFiring` is only ever cleared in flushPendingActions when the Realtime echo of the action arrives (NetworkClient.ts:539). If the POST fails on a network error, or the Realtime echo never arrives (the exact connection-drop case above), the catch at 480-482 only console.errors — `_isFiring` stays true forever, the HUD shows 'Sending...' (HUD.ts:417), and every weapon button stays disabled (syncStrip disables on isFiring, HUD.ts:445). The player is permanently stuck mid-turn with no error and no retry.

**Evidence**: `this._isFiring = true` at 338; the only reset is in flushPendingActions at 539 on a successful echo. submitAction's `.catch` (480-482) and its non-conflict rejection branch (473-477) merely console.error — neither clears _isFiring nor notifies the UI. HUD.ts:416-418 renders the indefinite 'Sending...' and 445 disables the strip while isFiring.

**Suggested fix**: On submit_action failure (network error, or a non-conflict server rejection), clear _isFiring, restore the strip, and surface a 'Shot failed — try again' message; add a timeout that clears the lock if no echo arrives within a few seconds.

**Verifier verdict**: Confirmed in actual code. NetworkClient.ts:310 and :338 set `_isFiring = true` (use_shield and fire). The ONLY reset is at NetworkClient.ts:539 inside flushPendingActions, gated on the Realtime echo of the action arriving in seq order. submitAction (NetworkClient.ts:445-483) is fire-and-forget: its non-conflict rejection branch (473-477) and its `.catch` (480-482) only console.error — neither clears _isFiring nor signals the UI. Grep confirms _isFiring is only ever assigned at 94/310/338/539; there is no timeout or any other reset. HUD.ts:416-418 renders `Sending...` while isFiring, and HUD.ts:445 disables every weapon cell (`cell.el.disabled = isFiring || ...`). main.ts:117 feeds newClient.isFiring into hud.update on each state change, so the stuck true value keeps the player locked. Code comment at NetworkClient.ts:443 even acknowledges 'errors are logged but not retried in MVP2'. On a failed POST or a never-arriving echo (connection drop), the player is permanently stuck mid-turn with no error and no retry — exactly as described. Severity high is apt: an unrecoverable soft-lock, though gated behind a network-failure condition rather than the common path.

---

## 9. [MEDIUM] submit_action computes next seq with read-then-insert; relies solely on a UNIQUE constraint that the comments admit they couldn't implement atomically

_dimension: code-quality · verifier confidence: 4/5_

**Location**: supabase/functions/submit_action/index.ts:237-292

**Problem**: nextSeq is computed by reading MAX(seq) (steps 1) and then inserting (step 2). The in-code comment block describes the intended atomic 'subquery inside VALUES computes MAX(seq)+1 at insert time' but then admits it could not be done ('the /rpc endpoint is not available for raw SQL') and falls back to read-then-insert. Under concurrent submitters (two humans, or N clients all proxying the same bot — which the design explicitly does, every connected client submits the bot's action) this is a classic check-then-act race. The UNIQUE(room_id,seq) constraint does prevent duplicate rows, but the loser gets a 23505/409. For bots, retryOnConflict is false so the loser silently no-ops (fine), but for two humans firing near-simultaneously the retry is a single setTimeout(50ms) one-shot (NetworkClient:469-472) that can itself re-lose the race and then permanently drop the action with no further retry.

**Evidence**: submit_action:251-267 reads seq then :270-277 inserts with that seq; :281 catches '23505' → 409. NetworkClient:469-472 retries exactly once after 50ms with retryOnConflict=false, so a second collision is unrecoverable. The comment at :241-248 explicitly states the atomic insert 'is not available' and they fell back to read-then-insert.

**Suggested fix**: Move seq allocation server-side and atomic: a Postgres function/RPC doing INSERT ... seq = (SELECT COALESCE(MAX(seq),-1)+1 FROM room_actions WHERE room_id=$1) in one statement, or a per-room sequence/counter column incremented in the same UPDATE...RETURNING. Failing that, give the client bounded exponential retries on 409 instead of a single 50ms shot.

**Verifier verdict**: CONFIRMED in code, but severity overstated (high -> medium). Server: submit_action/index.ts:237-292 is exactly as described — the comment block at :241-248 explicitly states the atomic raw-SQL insert "is not available" and falls back to read-then-insert: :251-257 reads MAX(seq) via order desc/limit 1, :267 computes nextSeq, :270-277 inserts, :281-285 catches Postgres 23505 and returns 409 {error:'seq_conflict',retry:true}. UNIQUE(room_id,seq) is the only race guard. Client: NetworkClient.ts:466-477 (cited :469-472 core is accurate) does a single setTimeout(...,50) one-shot retry passing retryOnConflict=false, so a second collision is unrecoverable and the action is silently dropped (the .then no-ops on a conflict with retry disabled). Both halves of the mechanism are real and correctly located. However the severity is inflated: (1) the bot/proxy case the finding leads with is benign by design — losers intentionally don't retry because the winning row is the identical action (idempotent), as the finding itself concedes; (2) for two humans, the referee gate at submit_action:209-216 rejects any non-active actor with 403 "Not your turn", so two DISTINCT valid actors cannot both hold the active-player cursor and collide on the same seq under normal turn flow — input is only accepted during PLAYER_TURN for the single active seat. The realistic collision window is narrow (duplicate submits from the same active player, or replication lag), UNIQUE prevents any data corruption, and the worst observed outcome is one dropped action needing a manual re-fire — not a high-severity correctness/availability defect. Real code-quality/robustness smell worth the suggested fix (server-side atomic seq via RPC/sequence, or bounded exponential client retry), but medium, not high.

---

## 10. [MEDIUM] finish_game trusts a client-supplied winnerId with no validation of who actually won

_dimension: code-quality · verifier confidence: 5/5_

**Location**: client/src/client/NetworkClient.ts:597-608; supabase/functions/finish_game/index.ts:28-50

**Problem**: The game outcome written to the rooms row comes from whichever client's engine first reaches GAME_OVER and POSTs finish_game with its locally-computed winner. finish_game does ZERO validation: it does not check membership, does not replay the log, does not verify the caller, and writes whatever winnerId string is in the body straight into rooms.winner. Any actor who can reach the function (it uses the anon key and '*' CORS) can finish any active room with an arbitrary winner. Even absent malice, if two clients momentarily disagree on the winner (e.g. the desync from findings #1/#2), the first POST wins and is never reconciled.

**Evidence**: finish_game:28 `const { roomId, winnerId } = body` then :43-50 updates rooms.winner = `typeof winnerId === 'string' ? winnerId : null` with only `.eq('status','active')` — no membership check, no roster check that winnerId is even a player in the room, no replay. CORS is '*' (:5) and the client calls it with the anon key (NetworkClient:600-605). winnerId is taken directly from the local engine state (:552 callFinishGame(state.winner)).

**Suggested fix**: finish_game should derive the winner authoritatively (replay the action log through shared/, or at minimum require the caller be a room member and validate winnerId is a roster id and that the log actually terminates the game). Don't accept an unauthenticated arbitrary winner string.

**Verifier verdict**: REAL. finish_game/index.ts:28-50 validates only that roomId is a non-empty string; winnerId is written straight into rooms.winner at line 47 with no membership check, no roster check, no log replay — guarded only by .eq('status','active') (line 50). CORS is '*' (line 5). The client (NetworkClient.ts:597-608) calls it with the anon key, and winnerId is taken directly from local engine state (NetworkClient.ts:552, callFinishGame(state.winner)). So any actor who can reach the function can finish any active room with an arbitrary winner string. One inaccuracy in the finding's evidence: the function itself uses the SERVICE_ROLE_KEY (line 35), not the anon key — only the client uses the anon key; this actually reinforces the concern (privileged unvalidated write on behalf of an unauthenticated caller). Severity medium is appropriate: real missing-authorization/validation defect, but impact is bounded to the persisted rooms.winner/status record (cosmetic/scoreboard), with no effect on deterministic in-game state and no privilege escalation.

---

## 11. [MEDIUM] RematchInfo room-row projection duplicated verbatim across the client/server boundary (with identical magic defaults)

_dimension: consolidation · verifier confidence: 5/5_

**Location**: supabase/functions/restart_game/index.ts:49-69 (fetchRematchInfo) and :222-232; client/src/client/NetworkClient.ts:426-438 (handleRematch); shape declared a third time at client/src/client/GameClient.ts:9-14

**Problem**: The exact same 'rooms' row -> RematchInfo projection is written three times: once server-side in fetchRematchInfo, once again inline in restart_game's success path, and once client-side in NetworkClient.handleRematch. All three select the same columns (id, code, seed, options, players), Number()-coerce seed, default maxPlayers to players.length, and hardcode the SAME fallback constants maxWind=10 and gravity=0.15. If the room schema or a default ever changes, four sites (incl. the type) must change in lockstep or the rematch room silently diverges from the original.

**Evidence**: restart_game fetchRematchInfo lines 58-68: `maxWind: typeof opts.maxWind === 'number' ? opts.maxWind : 10, gravity: typeof opts.gravity === 'number' ? opts.gravity : 0.15`. NetworkClient.ts lines 434-435 are byte-identical: `maxWind: typeof opts.maxWind === 'number' ? opts.maxWind : 10, gravity: typeof opts.gravity === 'number' ? opts.gravity : 0.15`. Both also `players.map(p => ({ id: p.id, name: p.name, color: p.color }))` and `maxPlayers: opts.maxPlayers ?? players.length`.

**Suggested fix**: The wire SHAPE (RematchInfo) already lives in shared-ish GameClient.ts. Lift the projection logic + the default constants (DEFAULT_MAX_WIND=10, DEFAULT_GRAVITY=0.15) into one place. The cleanest unifying move without coupling Deno<->browser: make restart_game ALWAYS return the full RematchInfo (it already does on the success path) and have NetworkClient.handleRematch consume that payload instead of re-projecting the row itself — deleting the client-side projection entirely. Within the edge functions, collapse restart_game's two projections (49-69 and 222-232) into the single fetchRematchInfo call.

**Verifier verdict**: CONFIRMED but severity overstated. The room-row -> RematchInfo projection is genuinely duplicated across three runtime sites with byte-identical magic defaults, plus the type a fourth time:
- supabase/functions/restart_game/index.ts:58-68 (fetchRematchInfo): selects id/code/seed/options/players, Number(data.seed), maxPlayers ?? players.length, maxWind default 10, gravity default 0.15, players.map(p => {id,name,color}).
- restart_game/index.ts:222-232 (success path): same projection over the locally-built seed/code/newPlayers with identical maxWind=10 / gravity=0.15 defaults.
- client/src/client/NetworkClient.ts:426-438 (handleRematch): byte-identical lines 434-435 `maxWind: typeof opts.maxWind === 'number' ? opts.maxWind : 10` and `gravity: ... : 0.15`, same maxPlayers ?? players.length and players.map.
- Type RematchInfo declared at restart_game/index.ts:40-46 AND client/src/client/GameClient.ts:9-14.
So the evidence quotes are accurate to the code. One caveat that lowers severity and partially undercuts the suggested fix: NetworkClient.handleRematch is NOT a consumer of the restart_game HTTP response. Per its docstring (lines 388-397), it runs on a Realtime broadcast of the OLD room's pointer UPDATE for the *peer* player, which carries only rematch_room_id; it must independently re-fetch and re-project the successor row. That peer never sees the restart_game payload, so the proposed "have handleRematch consume the payload and delete the projection" is not directly applicable to the broadcast path. The duplication is real and worth consolidating (extract DEFAULT_MAX_WIND/DEFAULT_GRAVITY constants and a shared projector), but this is a pure maintainability/DRY issue with no correctness, security, or runtime impact — defaults are identical today, so nothing silently diverges now. That is medium, not high.

---

## 12. [MEDIUM] corsHeaders() + the OPTIONS/method/JSON/env-var preamble is copy-pasted into all 10 edge functions

_dimension: consolidation · verifier confidence: 5/5_

**Location**: supabase/functions/{create_room,join_room,leave_room,ready_up,heartbeat,update_player,submit_action,list_rooms,finish_game,restart_game}/index.ts — corsHeaders at lines 3-10 of each; the request preamble immediately after Deno.serve

**Problem**: Every one of the 10 functions defines an identical corsHeaders() and then repeats the same boilerplate: OPTIONS short-circuit, 405 method guard, try/catch JSON parse returning 'Invalid JSON body', and the SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env-var check returning a 500. 'Invalid JSON body' alone appears in 8 files; the env-var guard in nearly all. A CORS policy change (e.g. locking Access-Control-Allow-Origin from '*' to a real origin) currently requires editing 10 files, and finish_game has already drifted (its env error string is 'Server misconfiguration' vs everyone else's 'Server misconfiguration: missing env vars').

**Evidence**: Grep: `function corsHeaders` matches in all 10 function files; `Invalid JSON body` and `missing env vars` together = 38 occurrences across 10 files. finish_game/index.ts:38 returns `{ error: 'Server misconfiguration' }` whereas create_room/index.ts:108 returns `{ error: 'Server misconfiguration: missing env vars' }` — the drift the duplication invites.

**Suggested fix**: Add a supabase/functions/_shared/http.ts exporting corsHeaders(), a withCors(handler) wrapper that handles OPTIONS+405+JSON-parse, and a getServiceClient() that reads the env vars once and returns the client or a typed 500. Each function shrinks to its actual validation+DB logic. This is a server-only dedup — no determinism or client coupling risk.

**Verifier verdict**: Confirmed in the actual code. All 10 edge functions define an identical corsHeaders() (Grep: 10/10 files, e.g. create_room/index.ts:3-10 and finish_game/index.ts:3-10 are byte-identical). The OPTIONS short-circuit, 405 method guard, and try/catch 'Invalid JSON body' (400) preamble is repeated immediately after Deno.serve (create_room:19-39, finish_game:12-26). The SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env guard returning 500 appears in all 10. The cited drift is real and exact: finish_game/index.ts:38 returns 'Server misconfiguration' while the other 9 (create_room:108, join_room:98, update_player:106, submit_action:153, restart_game:99, heartbeat:70, ready_up:70, list_rooms:66, leave_room:69) return 'Server misconfiguration: missing env vars'. Minor inaccuracy that does not undermine the claim: 'Invalid JSON body' appears in 9 files, not 8 as stated (an undercount, strengthening the dedup case). The suggested _shared/http.ts extraction is sound and server-only with no determinism/client risk. Severity adjusted down: this is pure maintainability/DRY — the one realized 'drift' is a cosmetic 500 error-body string, no security/correctness/determinism impact — so high is overstated; medium is accurate.

---

## 13. [MEDIUM] StoredPlayer / StoredOptions / reap()+STALE_MS redefined independently in many edge functions

_dimension: consolidation · verifier confidence: 5/5_

**Location**: StoredPlayer in update_player:14, submit_action:36, leave_room:14, join_room:18, restart_game:24, heartbeat:14, ready_up:14, list_rooms:19 (8 copies); StoredOptions in join_room:12, restart_game:32, list_rooms:12 (3+ copies); STALE_MS=30000 + reap() in join_room:26-31 and list_rooms:35-38

**Problem**: The persisted room row's player/options TypeScript shapes are re-declared in 8 functions, and the stale-player garbage-collection (STALE_MS=30000 + identical reap() filter) is duplicated in at least join_room and list_rooms. These shapes are the de-facto DB contract; divergence is silent (e.g. join_room's StoredOptions omits visibility while create_room writes it). The 30s reap window living in two literals means a tuning change can be applied to one path and not the other, producing inconsistent capacity decisions between 'list rooms' and 'join room'.

**Evidence**: Grep: `interface StoredPlayer` = 8 hits, `interface StoredOptions` = 4 hits (incl. divergent fields: join_room:12-16 has {maxPlayers,maxWind,gravity} only; restart_game:32-37 adds visibility?). `const STALE_MS = 30000` + `function reap` appear identically at join_room:26-31 and list_rooms:35-38.

**Suggested fix**: Put StoredPlayer/StoredOptions and the reap()+STALE_MS pair in the same supabase/functions/_shared/ module created for the CORS dedup. One canonical row-shape stops the silent field drift.

**Verifier verdict**: Confirmed against the actual code. interface StoredPlayer appears in 8 functions at the exact cited lines (update_player:14, submit_action:36, join_room:18, restart_game:24, heartbeat:14, ready_up:14, list_rooms:19, leave_room:14). interface StoredOptions appears 3x and the shapes DO diverge: join_room:12-16 has only {maxPlayers,maxWind,gravity}; list_rooms:12-16 and restart_game:32-36 both add visibility?. create_room actually persists visibility into the options row (create_room/index.ts:204), and join_room casts room.options as its visibility-less StoredOptions (join_room:128) — so the divergence is real and silent. STALE_MS=30000 + an identical reap() filter are duplicated byte-for-byte in join_room:26-31 and list_rooms:35-39, and join_room uses reap() for capacity decisions (join_room:133-134) while list_rooms reaps for its own listing — two independent 30s literals that can drift apart under tuning. All evidence in the finding is accurate. It is a maintainability/contract-drift issue, not a live bug (both reap windows are currently equal; join_room does not yet read visibility, so the omission is latent), which keeps it at medium rather than higher.

---

## 14. [MEDIUM] clamp(v,lo,hi) reimplemented in 5 separate files

_dimension: consolidation · verifier confidence: 5/5_

**Location**: shared/src/engine/GameEngine.ts:82-84, shared/src/engine/AI.ts:69-71, shared/src/engine/Terrain.ts:42, client/src/input/InputHandler.ts:41-43, client/src/ui/Lobby.ts:1885

**Problem**: An identical three-line numeric clamp is hand-rolled in five files spanning all three layers. The three shared/ copies are the notable ones: clamp is a determinism-relevant primitive used in wind drift, aim clamping, and the AI's seeded aim-error — having three textual copies invites one being 'fixed' (e.g. NaN handling) without the others, which would desync hot-seat vs networked replay.

**Evidence**: Grep for `function clamp`: GameEngine.ts:82 `return v < lo ? lo : v > hi ? hi : v;`, AI.ts:69 `return v < lo ? lo : v > hi ? hi : v;`, InputHandler.ts:41 `return value < lo ? lo : value > hi ? hi : value;`, Terrain.ts:42, Lobby.ts:1885 — all the same ternary.

**Suggested fix**: Export a single clamp from shared (e.g. shared/src/engine/math.ts, re-exported via shared/src/index.ts:90 alongside createRng) and import it in all three engine files plus the client. Safe: it is a pure function, no layer-direction violation (client already depends inward on shared).

**Verifier verdict**: Confirmed by reading all 5 cited files. `function clamp` exists at GameEngine.ts:82-84, AI.ts:69-71, Terrain.ts:42-44, InputHandler.ts:41-43 (all identical ternary `v < lo ? lo : v > hi ? hi : v`) and Lobby.ts:1885-1887. The three shared/ copies are genuinely determinism-relevant: GameEngine.ts:190 (wind drift), GameEngine.ts:226/229 (aim/power clamp on player action), and AI.ts:116/117 (seeded aim/power error via rng()) — so divergent edits could desync hot-seat vs networked replay, as claimed. index.ts:90 already re-exports createRng, confirming the suggested consolidation point is valid and a client->shared import is no layer violation. One minor inaccuracy: the evidence says 'all the same ternary' but Lobby.ts:1885 uses Math.max(lo, Math.min(hi, n)) — equivalent behavior, different text. This does not undermine the core finding. Medium severity is appropriate: a real consolidation/maintainability issue with a plausible determinism-drift risk, not an active bug.

---

## 15. [MEDIUM] AI never buys, never shields, and never uses any special weapon — it only direct-fires the strongest blast it already owns

_dimension: gameplay · verifier confidence: 5/5_

**Location**: shared/src/engine/AI.ts:142-162; client/src/main.ts:157-169

**Problem**: chooseWeapon restricts the bot to baby_missile/missile/heavy_missile/baby_nuke/nuke only. It never selects bouncing_betty, funky_bomb, napalm, cluster_bomb, dirt_bomb, and explicitly never shields or buys. Half the recently-built content (betty, napalm, funky, cluster, shield, store) is invisible to single-player. Worse, because the bot only fires direct blasts and never raises a shield, a human can trivially out-trade it by shielding (which the bot can't break) or by using napalm/area weapons it has no model for. The 'computer opponents' feature showcases none of the sprint's content.

**Evidence**: AI.ts:148 `if (difficulty === 'easy') return 'baby_missile';`, :151 ladder = ['missile','heavy_missile','baby_nuke','nuke'] only, comment :140 'Never picks the shield ... or a no-damage utility weapon.' simulateImpact (AI.ts:228-230) hardcodes `weaponType:'missile', hasSplit:true, bounces:0` so the planner is blind to bounce/airburst/napalm. main.ts:168 only ever sends fire or (for weapon==='shield', which AI never chooses) use_shield — and there is no buy call in maybeDriveAi.

**Suggested fix**: At minimum let hard bots use shield defensively when low on health, and consider area weapons. Even a heuristic (shield if health<30 and shield in stock) would close the unbreakable-shield exploit.

**Verifier verdict**: Confirmed in code. AI.ts:148 returns baby_missile for easy; AI.ts:151 ladder is exactly ['missile','heavy_missile','baby_nuke','nuke']; medium (AI.ts:153-155) uses only missile/baby_missile — so chooseWeapon never returns bouncing_betty, funky_bomb, napalm, cluster_bomb, dirt_bomb, or shield (comment AI.ts:140 explicitly says it never picks shield/utility). simulateImpact (AI.ts:226-229) hardcodes weaponType:'missile', hasSplit:true, bounces:0, so the planner is blind to bounce/airburst/napalm. main.ts:163-168 maybeDriveAi only emits select_weapon/set_angle/set_power then fire — use_shield is gated on plan.weapon==='shield' which never occurs, and there is no buy action in the driver. All six omitted weapons exist as real WeaponTypes (WeaponSystem.ts:17-22). The unbreakable-shield exploit and invisible sprint content are accurately described. Downgrading severity to medium: it's a real single-player content/completeness gap with a trivial exploit, but an opt-in mode design limitation rather than a crash/correctness defect; determinism (the hard rule) is intact.

---

## 16. [MEDIUM] Easy AI uses unlimited free Baby Missile forever; medium/hard burn finite premium ammo with no restocking model — difficulty inverts over a long game

_dimension: gameplay · verifier confidence: 5/5_

**Location**: shared/src/engine/AI.ts:142-162; shared/src/engine/Tank.ts:19,48

**Problem**: The easy bot fires baby_missile (unlimited) every turn, so it never runs dry. The hard bot grabs the 'strongest stocked blast' first (nuke, then baby_nuke...), so it spends its 9 nukes, 9 baby_nukes, etc., then falls back down the ladder. The bot has no concept of credits/buying to restock. In a drawn-out match the 'hard' bot eventually degrades to baby_missile too — but having wasted its nukes on whatever the nearest enemy was. There is no ammo-conservation or value logic; a hard bot will nuke a 5-HP tank.

**Evidence**: AI.ts:158-161 loops the ladder high→low picking the strongest `has()` weapon with no regard to target health or remaining stock value; chooseWeapon never considers buying. Tank.ts:19 DEFAULT_AMMO=9 is the only premium supply; nothing in AI.ts replenishes it.

**Suggested fix**: Scale weapon choice to expected damage needed (don't nuke a near-dead tank), and/or let the bot buy when its ladder is exhausted, since it has 15000 credits it never spends.

**Verifier verdict**: Confirmed in the actual code. AI.ts:148 — easy always returns the unlimited 'baby_missile' (Tank.ts:48: baby_missile {count:0, unlimited:true}), so it never runs dry. AI.ts:151,158-160 — hard iterates the ladder ['missile','heavy_missile','baby_nuke','nuke'] high→low and returns the strongest has()=true weapon with NO regard to target health or remaining-stock value; it will nuke a 5-HP tank. chooseWeapon(me, difficulty) (AI.ts:142) doesn't even receive the target, so target-aware scaling is structurally impossible. No credits/buy logic exists anywhere in AI.ts — the bot never restocks; Tank.ts:19 DEFAULT_AMMO=9 is the only premium supply (9 each of missile/heavy_missile/baby_nuke/nuke). Over a long match the hard bot burns its 9 nukes, then baby_nukes, etc., and falls through to baby_missile (AI.ts:161) — degrading to the same weapon easy uses, having wasted premium ammo. STARTING_CREDITS=15000 (WeaponSystem.ts:208) confirms the unspent-credits detail. All cited line ranges (AI.ts:142-162; Tank.ts:19,48) are accurate; characterization is precise, not overstated.

---

## 17. [MEDIUM] AI is statically exploitable: always targets nearest enemy, always aims at first-impact, biases angle to the target's side

_dimension: gameplay · verifier confidence: 4/5_

**Location**: shared/src/engine/AI.ts:97,122-134,170-202,212-241

**Problem**: The planner picks the nearest living enemy (nearestEnemy) and sweeps only angles on the half-plane toward that target (searchShot biases angleLo/angleHi by side). It scores purely on landing nearest the target's body center and aims at FIRST impact, ignoring bounce/airburst/napalm trajectories. This is highly exploitable in multi-tank games: a human can sit behind a wall/another tank to soak fire, or position so the 'nearest' target is a decoy. Because the bot never lobs over obstacles deliberately (it only finds whatever angle lands closest), a walled-in player is safe — the code even has a fallback that just lobs angle 60/120 power 70 when no shot reaches the column (AI.ts:106-108), a guaranteed whiff.

**Evidence**: AI.ts:97 `nearestEnemy(state, me)` is the sole target selector; searchShot:180-182 `const rightward = target.x >= me.x; angleLo = rightward?5:90; angleHi = rightward?90:175;` restricts the arc to the target's side; scoring at :194 is pure landing-distance. Fallback AI.ts:106-108 returns a fixed `{angle: toward, power:70}` lob.

**Suggested fix**: Score by predicted damage (not just proximity), consider all enemies weighted by kill potential, and widen the angle sweep so the bot can find high-arc shots over cover.

**Verifier verdict**: Confirmed against shared/src/engine/AI.ts. Every cited line matches: AI.ts:97 `nearestEnemy(state, me)` is the sole target selector (impl at 123-134, nearest living enemy by Euclidean body-center distance). searchShot restricts the angle sweep to the target's half-plane — AI.ts:180-182 `const rightward = target.x >= me.x; const angleLo = rightward ? 5 : 90; const angleHi = rightward ? 90 : 175;`. Scoring is pure landing-distance — AI.ts:194 `const score = Math.hypot(impact.x - tx, impact.y - ty)`. The probe deliberately suppresses bounce/airburst — AI.ts:229-230 `hasSplit: true, bounces: 0` — and aims at first impact (AI.ts:237), ignoring bounce/airburst/napalm trajectories (stated explicitly in the 204-211 docstring). The walled-in fallback is real — AI.ts:106-108 returns a fixed `{ weapon, angle: 60|120, power: 70 }` lob. So the AI is statically exploitable: single nearest-target focus, proximity-only scoring, no damage weighting, and a fixed fallback shot. Two mild overstatements in the finding: (1) the half-plane sweep DOES include high-arc angles (up to 90 deg) on the target's side, so the bot CAN lob over cover that is on the target's side — the true gap is exclusion of the opposite half-plane and the lack of damage-based/multi-enemy scoring, not a total inability to arc; (2) this is by-design 'beatable' per the file docstring. Core technical claims all hold; medium severity is appropriate for a gameplay-dimension strategic-weakness finding.

---

## 18. [MEDIUM] The entire server/ workspace is dead — a socket.io stub that nothing reaches, contradicting the live Supabase architecture

_dimension: orphan-code · verifier confidence: 5/5_

**Location**: server/src/index.ts, server/src/GameServer.ts (esp. lines 34-44), server/src/RoomManager.ts:50-53; wired in package.json:14-16

**Problem**: server/ is a non-functional socket.io stub. GameServer.onPlayerAction() is a no-op (lines 38-44: `void playerId; void action;` then broadcasts an empty engine state — it never calls engine.applyAction), addPlayer never starts a game (TODO line 34), and RoomManager.generateRoomCode() hard-returns the constant 'AAAA' so every room collides (line 52). Networking is actually done by Supabase lockstep (client/src/client/NetworkClient.ts) — main.ts only ever instantiates HotSeatClient or NetworkClient. Nothing in client/ or shared/ imports GameServer/RoomManager. Yet the root build/typecheck/dev scripts still compile and run this dead process.

**Evidence**: grep for GameServer/RoomManager shows consumers only inside server/ itself. main.ts:236 dynamically imports NetworkClient (Supabase), never a socket client. GameServer.ts:40 literally voids its inputs. RoomManager.ts:52 returns 'AAAA'. docs/TASKS.md:46 states the pivot 'Deletes Node/Socket.io + pm2 + nginx-socket-proxy from the deploy'; docs/SPEC.md:512-516 says 'no server, no pm2, and no nginx socket proxy to run' — but server/ is still built by package.json:15.

**Suggested fix**: Delete the server/ workspace, remove it from package.json workspaces + the dev:server/build/typecheck scripts, and drop @singedterra/server from package-lock. If kept as a future placeholder, at minimum remove it from the default build/dev path so a half-implemented socket server isn't compiled and launched on every `npm run dev`.

**Verifier verdict**: Confirmed in actual code. server/src/GameServer.ts:38-44 — onPlayerAction() does `void playerId; void action;` then broadcastState(); it never calls engine.applyAction (TODO line 42). addPlayer has no game-start (TODO line 34). RoomManager.ts:50-53 generateRoomCode() hard-returns 'AAAA', so every room collides. index.ts:21-26 is a plain socket.io/express stub. Grep for GameServer|RoomManager shows consumers only inside server/ itself (plus docs/SPEC.md + CLAUDE.md mentions) — nothing in client/ or shared/ imports them. main.ts:7,236,264 uses only HotSeatClient and a dynamically-imported NetworkClient (Supabase), never a socket client. docs/TASKS.md:46 states the pivot 'Deletes Node/Socket.io + pm2 + nginx-socket-proxy from the deploy'; docs/SPEC.md:510-517 says there is 'no Node/Socket.io game server' and server/ is 'superseded'. Yet package.json:15-16 still compiles and typechecks @singedterra/server in build + typecheck (and dev:server launches it). Finding is accurate. Severity adjusted from high to medium: this is genuinely dead/orphan code that bloats build and misleads, but it is unreachable at runtime — no security, data-loss, or user-facing correctness impact — so 'high' overstates it for an orphan-code dimension.

---

## 19. [MEDIUM] CLAUDE.md still documents the abandoned socket.io / server-authoritative / pm2 / nginx / SQLite architecture

_dimension: orphan-code · verifier confidence: 5/5_

**Location**: CLAUDE.md:20, CLAUDE.md:72 (Deployment section); also CLAUDE.md Architecture section describing 'server owns the single authoritative GameEngine per room'

**Problem**: CLAUDE.md — the file the system prompt says OVERRIDES default behavior and must be followed exactly — describes an architecture that no longer exists. It claims networked play is 'server owns the authoritative GameEngine; clients send PlayerActions and receive GameState snapshots', that production 'runs under pm2 (ecosystem.config.js) behind nginx, which... reverse-proxies /socket.io/ to Node on :3000', and that V1 'adds SQLite'. Reality (per the very prompt and TASKS.md:46): networking is Supabase deterministic lockstep where clients replay an action log through a LOCAL GameEngine, persistence is Postgres via Supabase, and there is no Node server / pm2 / nginx socket proxy. This is the single most authoritative doc in the repo and it actively misleads.

**Evidence**: CLAUDE.md:72 verbatim mentions pm2/nginx/SQLite/:3000 socket proxy. NetworkClient.ts:60-69 documents 'Supabase deterministic lockstep... each player's browser runs an independent local GameEngine'. docs/TASKS.md:46 records the pivot away from Socket.io. supabase/ directory (10 edge functions + migrations) is the real backend.

**Suggested fix**: Rewrite CLAUDE.md's networked-mode and Deployment sections to describe Supabase lockstep + edge functions + Postgres, matching docs/TASKS.md and the updated docs/SPEC.md §10. Remove the /socket.io proxy line (CLAUDE.md:20) and the pm2/nginx/SQLite claims.

**Verifier verdict**: REAL and correctly characterized in substance. CLAUDE.md:20 verbatim says `proxies /socket.io -> :3000`; CLAUDE.md:33 says "the server owns the single authoritative GameEngine per room. Clients are render-only — they send PlayerActions and receive GameState snapshots"; CLAUDE.md:44 describes server-broadcast snapshots + `projectile_tick` deltas; CLAUDE.md:51 lists `server/ (RoomManager, GameServer)`; CLAUDE.md:72 documents pm2 / ecosystem.config.js / nginx / /socket.io/ proxy to :3000 / SQLite for V1. This architecture is abandoned: client/src/client/NetworkClient.ts:59-66 documents "Supabase deterministic lockstep (MVP2). Each player's browser runs an independent local GameEngine... canonical state is seed + ordered action log"; supabase/functions/ holds 10 real edge functions (submit_action, create_room, etc.); docs/TASKS.md:46 explicitly records the pivot "Deletes Node/Socket.io + pm2 + nginx-socket-proxy from the deploy" and uses Postgres not SQLite. No ecosystem.config.js exists (Glob found none). CLAUDE.md:11 even still claims "Greenfield... only .git... Nothing exists yet." The most-authoritative doc actively misleads. Minor citation slips in the finding (NetworkClient path/line numbers slightly off; doc comment is at 59-66 not 60-69) do not affect the substance. Severity adjusted down: this is a docs/orphan-stale issue with zero runtime/correctness/security impact — medium, not high.

---

## 20. [MEDIUM] shared exports the entire dead socket.io event contract (SocketEvents + 9 payload types + 2 typed event maps) with zero non-server consumers

_dimension: orphan-code · verifier confidence: 5/5_

**Location**: shared/src/types/Events.ts:28-98; re-exported shared/src/index.ts:20-35

**Problem**: Events.ts defines the socket.io contract: SocketEvents const, SocketEventName, JoinRoomPayload, CreateRoomPayload, PlayerActionPayload, RoomJoinedPayload, GameStartPayload, StateUpdatePayload, ProjectileTickPayload, GameOverPayload, ErrorPayload, ClientToServerEvents, ServerToClientEvents. Every one of these is dead — the socket server that consumed them is the dead stub, and NetworkClient uses Supabase row shapes (NetworkAction etc.) defined locally instead. Only GameOptions (Events.ts:10) survives, because NetworkClient.ts:5 imports it. The rest is a public API surface for a transport that was removed.

**Evidence**: Per-symbol grep across client/shared/server/scripts: JoinRoomPayload, CreateRoomPayload, PlayerActionPayload, RoomJoinedPayload, GameStartPayload, StateUpdatePayload, ProjectileTickPayload, GameOverPayload, ErrorPayload, SocketEventName each have 0 consumers outside Events.ts/index.ts. ClientToServerEvents/ServerToClientEvents grep only hits index.ts re-export. NetworkClient defines its own NetworkFireAction/NetworkShieldAction/NetworkBuyAction (NetworkClient.ts:15-30) instead.

**Suggested fix**: Move GameOptions to its own module (e.g. types/GameOptions.ts) and delete the rest of Events.ts plus its block in shared/src/index.ts:20-35. Keeps the one live type; drops a stale 'fixed contract' that CLAUDE.md still tells future work to honor.

**Verifier verdict**: Confirmed against the actual code. shared/src/types/Events.ts:28-98 defines SocketEvents, SocketEventName, JoinRoomPayload, CreateRoomPayload, PlayerActionPayload, RoomJoinedPayload, GameStartPayload, StateUpdatePayload, ProjectileTickPayload, GameOverPayload, ErrorPayload, ClientToServerEvents, ServerToClientEvents exactly as cited; shared/src/index.ts:20-35 re-exports all of them. A per-symbol grep across client/, server/, scripts/, supabase/ shows every one of those symbols appears ONLY in Events.ts and index.ts — zero real consumers. The finding is if anything understated: even server/src (the supposed socket.io consumer) never imports Events.ts at all. Only GameOptions (Events.ts:10) is live, consumed by Tank.ts:2, GameEngine.ts:8, and NetworkClient.ts:5. NetworkClient.ts:15-30 defines its own NetworkFireAction/NetworkShieldAction/NetworkBuyAction Supabase row shapes instead. So this is a genuine dead socket.io contract sitting in shared/'s public API, while CLAUDE.md still tells future work to honor it. Orphan-code, medium severity is appropriate (misleading public surface, not a correctness bug).

---

## 21. [MEDIUM] CRT scanline + vignette overlay paints OVER the store modal and game-over panel (z-index inversion)

_dimension: ui · verifier confidence: 5/5_

**Location**: client/src/style.css:97-113 (#app::after z-index:31), :138-143 (#game-overlay z-index:5); client/src/ui/HUD.ts:767-776 (.st-hud__store z-index:6), :696-704 (.st-hud__overlay)

**Problem**: The store modal and the GAME_OVER panel are children of #game-overlay (z-index:5; the store bumps to z-index:6 inside it). The global CRT chrome #app::before (z-index:30) and #app::after (z-index:31) cover the WHOLE stage and sit far above them. So the scanline grid + corner vignette darkening render ON TOP of the store and the win/draw modal, dimming and striping the very surfaces a player reads and clicks. The lobby was explicitly lifted above the CRT (#lobby z-index:40) — proving the author knew the chrome occludes content — but the in-game modals were not given the same treatment.

**Evidence**: style.css: '#app::after { ... z-index: 31; ... repeating-linear-gradient(...scanline...), radial-gradient(...vignetteAlpha...) }' covers inset:0 of #app. #game-overlay is 'z-index: 5'. HUD.ts store is '.st-hud__store { position:absolute; inset:0; ... z-index: 6; }' and the game-over '.st-hud__overlay { position:absolute; inset:0; ... }' carries no z-index at all. Only #lobby got 'z-index: 40' to clear the chrome.

**Suggested fix**: Give the in-game modal layer (#game-overlay or specifically .st-hud__store / .st-hud__overlay when shown) a z-index above 31, OR scope the CRT ::before/::after to only the play field (#stage) instead of the whole #app so it never overlaps interactive panels.

**Verifier verdict**: Confirmed in the actual code. DOM nesting (client/index.html:9-18): #app > #stage > #game-overlay, plus #hud and #lobby, all inside #app. The CRT chrome is #app::before (style.css:90 z-index:30) and #app::after (style.css:102 z-index:31), both position:absolute inset:0 over the whole #app, painting scanlines + corner vignette (style.css:104-112). The store modal (.st-hud__store) and game-over panel (.st-hud__overlay) are appended to #game-overlay at HUD.ts:284 (this.overlayRoot.append(controls, this.storeEl, this.overlayEl)); overlayRoot is resolved from 'game-overlay' in main.ts:30. #game-overlay is z-index:5 (style.css:141), .st-hud__store is z-index:6 (HUD.ts:775), and .st-hud__overlay carries no z-index at all (HUD.ts:696-704). All sit far below the chrome's 30/31, so the scanline grid + vignette render over both modals. The lobby was explicitly lifted with #lobby z-index:40 (style.css:176) and a comment 'Sits above the CRT chrome' (style.css:171), proving the author knew the chrome occludes content but did not apply the same to in-game modals. Every cited file:line, z-index value, and the DOM parentage are accurate. Severity adjusted to medium rather than high: the chrome is pointer-events:none so clicks still land, and the modal panels have near-opaque backgrounds (rgba ...0.92/0.98) with bright gold borders; the effect is faint dimming/striping of readable surfaces, a cosmetic legibility regression, not a functional blocker.

---

## 22. [MEDIUM] Store modal opens centered over the 800x500 canvas, nowhere near its trigger button in the right-side panel

_dimension: ui · verifier confidence: 5/5_

**Location**: client/src/ui/HUD.ts:190-247 (build), :283-284 (mount targets), :767-790 (.st-hud__store CSS); client/src/style.css:118-163 (#stage vs #hud layout)

**Problem**: The 'Store' toggle button (storeBtnEl) is appended to this.root = #hud, the right-side panel (width 264px). But the store modal itself (this.storeEl) is appended to this.overlayRoot = #game-overlay, which is position:absolute inset:0 over ONLY the 800x500 play field to the LEFT of the panel. The modal uses inset:0 + flex centering, so clicking Store in the right panel pops a dialog centered over the tanks on the far left — a jarring disconnect from the control that summoned it, and it visually buries the play field it was deliberately kept off of for the HUD.

**Evidence**: HUD.ts:283 'this.root.append(menu, this.playersEl, wind, weapon, this.aimEl, this.storeBtnEl, this.stripEl);' then :284 'this.overlayRoot.append(controls, this.storeEl, this.overlayEl);'. style.css:138 '#game-overlay { position:absolute; inset:0; ... }' lives inside #stage (the canvas region), while #hud is a sibling flex column to its right (style.css:148-163).

**Suggested fix**: Either mount the store modal as a full-#app overlay (like the lobby) so it centers over the whole window, or render it as a panel-anchored popover beneath the Store button. Mounting an inset:0 modal into the canvas-only region is the wrong target.

**Verifier verdict**: Confirmed in code. HUD.ts:283 appends storeBtnEl to this.root (#hud, the right side panel, width --panel-w) while HUD.ts:284 appends storeEl (the modal) to this.overlayRoot (#game-overlay). main.ts:29-34 binds root=#hud, overlayRoot=#game-overlay. style.css:119-143 shows #game-overlay is position:absolute inset:0 INSIDE #stage, whose width is var(--canvas-w) (the 800-wide canvas region, left of the #hud panel). The modal CSS .st-hud__store (HUD.ts:767-776) is position:absolute inset:0 with flex align/justify center, so it centers over the canvas play field, not over the panel holding the trigger button. Every quoted line matches. So the structural/visual claim is accurate: the Store button lives in the right panel but its modal centers over the play field on the left. However severity is overstated as high — this is a purely cosmetic placement disconnect (the modal also paints a dimming backdrop over the field), with no loss of function: it opens, closes, and buys correctly, and the store is only used during the idle PLAYER_TURN phase. Adjusting to medium.

---

## 23. [MEDIUM] Terrain change-detection hashes all 400,000 pixels every single frame on a t3.micro

_dimension: ui · verifier confidence: 5/5_

**Location**: client/src/renderer/TerrainRenderer.ts:67-82 (draw), :172-180 (hash); shared/src/engine/Terrain.ts:19-20 (800x500)

**Problem**: Renderer.render() runs every rAF (~60fps) and unconditionally calls terrain.draw(), which calls hash() over the ENTIRE Uint8Array. Terrain is CANVAS_WIDTH*CANVAS_HEIGHT = 800*500 = 400,000 bytes, so the FNV loop does ~400k XOR + Math.imul + shift operations PER FRAME — ~24 million ops/second — purely to decide 'did the terrain change?', which is false on the vast majority of frames. The whole dirty-flag offscreen architecture (rebuild only on change) is undermined by a change-detector that is itself a full-array scan every frame. On the explicitly-called-out t3.micro budget this is the single largest avoidable per-frame cost.

**Evidence**: TerrainRenderer.ts:70 'const hash = this.hash(terrain);' is computed on every draw() before the dirty check. hash() (:173-179) loops 'for (let i = 0; i < terrain.length; i++)' doing 'h ^= terrain[i]; h = Math.imul(h, 0x01000193) >>> 0;'. Renderer.ts:145 calls 'this.terrain.draw(ctx, state.terrain)' from render() which runs each frame. Terrain.ts:19-20 confirm 800x500.

**Suggested fix**: Have the engine bump a terrain-version counter on deformation and pass it through GameState; the renderer compares the integer version instead of re-hashing. Or sample a sparse subset / track a dirty rect. A 400k-element full scan does not belong in the hot path.

**Verifier verdict**: Confirmed in code. TerrainRenderer.ts:70 computes `this.hash(terrain)` unconditionally at the top of draw(), before the dirty check; hash() at :172-180 loops `for (i=0; i<terrain.length; i++)` doing `h ^= terrain[i]; h = Math.imul(h, 0x01000193) >>> 0` over every byte. Terrain.ts:19-20 set 800x500 and BITMAP_LEN = 400,000, so this is a full 400k-element scan per draw(). Renderer.ts:145 calls terrain.draw() inside render(), and render() runs every rAF frame: main.ts:116 invokes renderer.render(state) from onStateChange, which HotSeatClient.ts:25-33 (and NetworkClient) fire every requestAnimationFrame tick. So the full-array hash runs ~60x/sec purely as a change-detector, defeating the documented dirty-flag/offscreen architecture (described in the file's own header comment, :33-39, and CLAUDE.md). The mechanism, file:line citations, and root cause are all accurate. Severity adjusted from high to medium: the cost lands on the CLIENT browser CPU (hot-seat/networked render is client-side; the t3.micro only serves static files + Supabase networking, so the problem's 't3.micro budget' framing is imprecise), and 400k simple integer ops is only low-single-digit ms per frame on a modern JS engine — a real, avoidable inefficiency that undermines the dirty-flag design, but not a high-severity hot-path killer.

---

## 24. [MEDIUM] Waiting room never detects room deletion or being kicked — joiner can wait forever on a dead room

_dimension: ux · verifier confidence: 4/5_

**Location**: client/src/ui/Lobby.ts:1194-1234 (subscribeWaitingRoom), 1074-1080 ('Waiting for players...')

**Problem**: The waiting-room Realtime subscription only listens for rooms UPDATE. If the host leaves and the room is reaped, or this player is removed from the players array by the server's lazy-GC reaper, no UPDATE that the joiner can interpret as 'room gone' is handled — there is no DELETE handler and no 'you were removed' branch. The joiner stares at 'Waiting for players...' and a Ready Up button against a room that no longer exists; clicking Ready Up will just produce a generic error.

**Evidence**: The subscription registers only `event: 'UPDATE'` (Lobby.ts:1199) and branches solely on `row.status === 'active'` (1216). A grep for `event: 'DELETE'` across client/src returns nothing. The reaper is real — heartbeat/lazy-GC is documented at Lobby.ts:1255-1257 and docs/TASKS.md:44 — so a player's row genuinely can vanish underneath them.

**Suggested fix**: Subscribe to DELETE on the room (or status==='finished'/closed) and to the player's own removal from row.players; on either, tear down the channel and return to the create view with a clear 'This room is no longer available' message.

**Verifier verdict**: Confirmed in code. Lobby.ts:1194-1234 subscribeWaitingRoom registers ONLY event:'UPDATE' (line 1199) filtered to this room, and the only terminal branch is row.status==='active' (line 1216). There is no DELETE handler (grep for event:'DELETE' across client/src returns nothing) and no branch checking whether this.waitingPlayerId is still present in row.players. The reaper is real and genuinely DELETEs room rows: supabase/functions/join_room/index.ts:137-138 and list_rooms/index.ts:100-101 both call supabase.from('rooms').delete() when a room is fully dead, and leave_room/index.ts:104-120 deletes the room when the last player leaves. So a joiner watching 'Waiting for players...' (Lobby.ts:1079) on a room that gets reaped/host-left receives a DELETE its UPDATE-only subscription cannot observe, and a players-array trim that drops their own id is silently absorbed (waitingPlayers reassigned at 1206-1208 with no self-presence check; myColorClashes/myNameClashes at 1384/1396/1410 just find self and return without complaint). Characterization is accurate. I downgrade severity from high to medium: (1) the dead-room DELETE only fires via leave_room or a lazy reap triggered by another caller of join/list — it is not a guaranteed/continuous condition; (2) the Leave button (1178-1182) still works to escape, so the user is not hard-locked, only shown a stale/misleading view whose Ready Up yields a generic error. Real missing-handler UX gap, but not a true 'wait forever with no exit'.

---

## 25. [MEDIUM] Online CPU-opponent and visibility choices are silently lost / mismatched against what the UI implies

_dimension: ux · verifier confidence: 4/5_

**Location**: client/src/ui/Lobby.ts:539-682 (create form: bots, visibility), 1102 (player count header), 1288-1303 (emitNetworkReady); client/src/client/NetworkClient.ts:144-148

**Problem**: The create-room form lets the host pick CPU opponents and a difficulty, but the waiting room implies the human still needs to fill all seats: the header reads 'Players (N/maxPlayers)' counting bot seats toward the total (Lobby.ts:1102) while the copy above says 'Waiting for players...' (1079) and 'Create a new online room and invite friends' (544) — a host who picks 1 human + 3 CPUs is told to keep waiting for players who will never come, with no explanation that the room can start once the humans are ready. Nothing in the waiting UI labels which rows are bots either (the bot 🤖 marker only appears in-game, HUD.ts:471).

**Evidence**: Create form builds bots client-side (Lobby.ts:700-707) and the waiting header counts `this.waitingPlayers.length` against maxPlayers (1102) with the static 'Waiting for players...' sub (1079). The waiting player rows (1112-1129) render name + ready badge but no CPU indicator, unlike the in-game label at HUD.ts:470-471. emitNetworkReady forwards ai per player (1291) so bots ARE distinguishable in the data — the waiting UI just doesn't show it.

**Suggested fix**: In the waiting room, badge bot seats as 🤖/Ready, and adjust the sub-copy + count to reflect 'waiting for the human seats' (e.g. '1/2 humans ready') so a mostly-CPU room doesn't read as perpetually waiting.

**Verifier verdict**: Confirmed in code. Lobby.ts:1102 builds the header as `Players (${this.waitingPlayers.length}/${this.waitingOptions.maxPlayers})`, counting bot seats toward the total. The waiting sub-copy is the static 'Waiting for players...' (Lobby.ts:1079) and the create-form copy is 'Create a new online room and invite friends.' (Lobby.ts:544). Waiting rows (Lobby.ts:1112-1129) render only a color dot, p.name, and a ready/waiting badge — no CPU/bot indicator, even though NetworkPlayer carries an `ai?` field (Lobby.ts:94-95) and emitNetworkReady forwards it (Lobby.ts:1291), so the data IS available. Bots are seeded client-side as 'CPU N' seats (Lobby.ts:700-707) and the comment at Lobby.ts:579 confirms they 'occupy seats immediately (always ready).' The only 🤖 marker lives in-game at HUD.ts:470-471. So a 1-human + 3-CPU room shows 'Players (4/4)' with three unlabeled, always-ready bot rows under a 'Waiting for players...' header — a real, confusing UX mismatch. Medium severity is appropriate: it's misleading copy, not a functional/start-blocking defect (the room can still proceed once humans ready). All cited line numbers verified accurate.

---

## 26. [LOW] AI seeds its PRNG off a floating-point wind value via lossy float arithmetic — fragile determinism

_dimension: code-quality · verifier confidence: 4/5_

**Location**: shared/src/engine/AI.ts:113-115

**Problem**: The aim-error seed mixes Math.floor((state.wind + 32) * 1031). state.wind is a float produced by nextWind (clamp of accumulated (rng()*2-1)*2.5 deltas). Determinism here depends on every client computing byte-identical IEEE-754 wind, then byte-identical (wind+32)*1031 before floor. This holds today because all clients replay the same action log through the same JS engine, but it is needlessly brittle: any change to wind representation, any cross-runtime float discrepancy (the referee is Deno, clients are browser V8), or a future rounding of wind for display that leaks back, would make two clients seed different PRNGs and compute DIFFERENT bot shots — and since EVERY client submits the bot's action (NetworkClient.maybeDriveBot), they would submit conflicting fires, with the 'winning' one desyncing the others.

**Evidence**: AI.ts:113-115 `const seed = (state.turn * 0x9e3779b1) ^ hashId(aiTankId) ^ Math.floor((state.wind + 32) * 1031);` — wind is a float (GameEngine.nextWind:188-191 returns clamp(current + delta,...) with no quantization). computeAiPlan is invoked identically on every client (NetworkClient:582) and the result is submitted on the bot's behalf (:594), so divergent plans = conflicting submissions.

**Suggested fix**: Seed the bot RNG only from integer-exact quantities (turn, hashId(tank), and a fixed-point/integer-quantized wind such as Math.round(state.wind*1000)). Better: thread the engine's own seeded wind-stream state or a per-turn integer nonce so the bot seed never depends on float bit-exactness across runtimes.

**Verifier verdict**: The cited code is accurate. AI.ts:113-115 seeds the bot RNG with `Math.floor((state.wind + 32) * 1031)`, and GameEngine.nextWind (188-191) returns an unquantized clamped float, so the seed does depend on IEEE-754 float bit-exactness. NetworkClient computeAiPlan invocation (582) and on-behalf submission (594) are as described. So the code-quality observation — a determinism-critical seed derived from lossy float arithmetic — is genuinely present and is an odd smell given the hard determinism rule; quantizing the wind would be cleaner. HOWEVER the finding's characterized IMPACT and thus its medium severity are overstated/wrong. The claimed failure mode ("they would submit conflicting fires, with the 'winning' one desyncing the others") is structurally prevented by the architecture I verified: (1) submit_action/index.ts is a pure seq-allocator (UNIQUE(room_id, seq), no GameEngine/wind/AI on the referee — it never recomputes the plan); the persisted action row carries CONCRETE angle/power (NetworkClient:588-590); (2) every client replays the SINGLE persisted row via flushPendingActions->applyNetworkAction (534-545), NOT its own locally-computed plan; (3) losing submitters get seq_conflict with no retry (579/594). So even if two clients computed different bot plans from divergent float seeds, exactly one row persists and ALL clients replay that one identically — no state desync. The seq race already nondeterministically picks the winner by latency (comment 560-567 admits "lowest-latency client wins"), so there is no canonical-plan invariant to violate. Net: real, correctly located code-quality nit, but not a medium determinism hazard — the consequence is at most "bot uses the fastest client's plan," which is already the design. Downgrading to low.

---

## 27. [LOW] OOB collision boundary contradicts SPEC and makes column 799 unreachable terrain

_dimension: code-quality · verifier confidence: 4/5_

**Location**: shared/src/engine/Physics.ts:178-181; docs/SPEC.md:173

**Problem**: collide() treats x >= CANVAS_WIDTH (800) as out-of-bounds, but SPEC §4.2 specifies OOB as 'x < 0 || x > CANVAS_WIDTH'. More importantly the comment at Physics:166 claims 'x===CANVAS_WIDTH-1 ok' yet a projectile arriving with x in [799,800) is fine, while x exactly 800 (a common endpoint after a step) is a miss. This is internally consistent enough for determinism (all clients agree), so it is not a desync, but it is an off-by-one against the spec and silently turns the rightmost wind-blown shots into harmless misses rather than edge hits, which affects gameplay fairness near the right wall.

**Evidence**: Physics.ts:179 `if (p.x < 0 || p.x >= CANVAS_WIDTH) return { type: 'oob' };` vs SPEC.md:173 'Out of bounds: x < 0 || x > CANVAS_WIDTH → miss'. The bitmap is indexed [0,800) so column 799 IS valid terrain, but any shot whose swept point lands at x>=800 is dropped as OOB before terrain is tested.

**Suggested fix**: Decide the intended boundary and make spec + code agree. If column 799 should be hittable, OOB should be x < 0 || x >= CANVAS_WIDTH only AFTER allowing the clamp to floor(x)=799; or follow the spec literally (x > CANVAS_WIDTH). Document the chosen convention to avoid future spec drift.

**Verifier verdict**: The spec/code discrepancy is REAL: Physics.ts:179 uses `p.x < 0 || p.x >= CANVAS_WIDTH`, while SPEC.md:173 specifies `x < 0 || x > CANVAS_WIDTH`. The code comment at Physics.ts:166 is internally consistent with the code (`x===CANVAS_WIDTH-1 ok`). So a genuine doc/spec-vs-code off-by-one exists, severity low is fair for that.

However the finding is mischaracterized/inflated on impact: its title claim that this "makes column 799 unreachable terrain" is FALSE. Terrain is indexed via Math.floor(p.x) at Physics.ts:199, so any projectile with x in [799,800) passes the OOB guard (799.x < 800) and correctly hits terrain[799]. Column 799 is fully reachable. Only x exactly >= 800 is OOB — and the finding's own evidence concedes this, contradicting its own title. The "rightmost wind-blown shots become harmless misses / gameplay fairness" framing is overstated, since edge shots almost always land sub-800 and hit col 799 normally. Determinism is correctly noted as unaffected. Arguably the code (`>= CANVAS_WIDTH`, the correct guard for a [0,800)-indexed Uint8Array) is more correct than the spec text. Net: a legitimate low-severity spec-drift/doc inconsistency, but with a false headline claim about unreachable terrain.

---

## 28. [LOW] handleRematch resets _rematchHandled to false on failure, allowing duplicate successor-room migrations

_dimension: code-quality · verifier confidence: 4/5_

**Location**: client/src/client/NetworkClient.ts:399-424, 226-229

**Problem**: _rematchHandled is the one-shot guard so a single rematch broadcast triggers exactly one migration. On the failure path (successor row never resolved after 8 polls) handleRematch sets this._rematchHandled = false 'to let a manual re-click re-drive the migration'. But the rooms UPDATE subscription is still live and the rematch_room_id on the row is still non-null; any subsequent UPDATE to that row (e.g. a late replication, a status change, or another field write) will re-fire the handler with next still set, and because the guard was reset, it migrates again — potentially after the user already manually navigated, racing two startGame() calls into different/duplicate rooms.

**Evidence**: NetworkClient:226-229 the UPDATE handler fires handleRematch whenever `next && !this._rematchHandled`. handleRematch:422 `this._rematchHandled = false;` on the never-resolved path re-arms that handler while rematch_room_id remains set, so the next UPDATE on the row re-enters. There is no separate 'in-flight' flag distinguishing 'failed, awaiting manual retry' from 'never attempted'.

**Suggested fix**: Keep _rematchHandled true once a pointer has been observed; drive manual retry through an explicit user-initiated path (requestRematch) rather than re-arming the passive UPDATE listener. Or track the handled newRoomId and ignore repeat UPDATEs carrying the same pointer.

**Verifier verdict**: Confirmed in the actual code. NetworkClient.ts:225-229 fires handleRematch whenever `next && !this._rematchHandled`, setting the guard true at line 227. On the never-resolved path, handleRematch (line 420-423) sets `this._rematchHandled = false` at line 422 while the row's rematch_room_id stays non-null. The rooms table is REPLICA IDENTITY FULL (supabase/migrations/002_rematch.sql:13), so any later UPDATE to that row rebroadcasts the full row carrying the still-set pointer, and with the guard re-armed the handler re-enters handleRematch — exactly as described. There is no separate in-flight vs awaiting-manual-retry flag, and no tracking of an already-handled newRoomId. The mechanism, file:line cites, and code-quality framing are all accurate. Severity 'low' is correct: triggering requires a narrow conjunction — a genuine replication lag exceeding 8x150ms with the pointer still set (the edge function rolls the pointer back to null on its own failures at restart_game/index.ts:197,218, so the abandoned-but-pointed state is itself rare), PLUS a subsequent UPDATE to the abandoned room, PLUS the user having manually navigated. Real but unlikely, bounded impact.

---

## 29. [LOW] FNV-1a hash implemented twice (AI seed vs terrain dirty-check), and color hex-parse/lighten duplicated (Renderer vs theme)

_dimension: consolidation · verifier confidence: 5/5_

**Location**: FNV-1a: shared/src/engine/AI.ts:74-81 (hashId, consts 2166136261/16777619) and client/src/renderer/TerrainRenderer.ts:172-180 (hash, consts 0x811c9dc5/0x01000193). Color helpers: client/src/renderer/Renderer.ts:44-66 (parseColor + lighten) vs client/src/ui/theme.ts:104-122 (hexToRgb + lightenHex/darkenHex)

**Problem**: Two unrelated dedup pairs. (1) The same FNV-1a 32-bit hash is written twice — AI.ts using decimal offset/prime, TerrainRenderer using the hex equivalents (0x811c9dc5 == 2166136261, 0x01000193 == 16777619) — so it isn't even obvious they're the same algorithm. (2) Renderer.parseColor + lighten duplicate theme.hexToRgb + lightenHex: identical `#rgb`->`#rrggbb` expansion, identical parseInt(h,16) channel split, identical `c + (255-c)*t` mix. Renderer's only real delta is returning an [r,g,b] tuple vs theme's `rgb(...)` string and an rgb() fallback branch.

**Evidence**: AI.ts:75-78 `let h = 2166136261; ... h = Math.imul(h, 16777619)`. TerrainRenderer.ts:173-177 `let h = 0x811c9dc5; ... h = Math.imul(h, 0x01000193) >>> 0`. theme.ts:107-109 `if (h.length === 3) h = h[0]+h[0]+...; const n = parseInt(h,16); return [(n>>16)&0xff,(n>>8)&0xff,n&0xff]` vs Renderer.ts:48-51 the same expansion+split. theme.ts:115 `(r + (255-r)*t)` vs Renderer.ts:65 `r + (255 - r) * t`.

**Suggested fix**: Color: have Renderer.parseColor delegate to theme.hexToRgb (theme already exports it) and keep only Renderer's rgb()-fallback branch; or add theme.hexToRgbTuple and a lighten-on-tuple. FNV: only worth unifying if you want one named fnv1a32 in shared — but note the AI hash is a determinism input and TerrainRenderer's is a throwaway render-cache key, so they are NOT semantically the same concern; if you unify, do it for readability only and keep AI's usage seed-stable. Do not couple the renderer's hash into shared just to save lines.

**Verifier verdict**: Confirmed both duplicate pairs in actual code. FNV-1a: AI.ts:75-78 (`h = 2166136261; h = Math.imul(h, 16777619)`) and TerrainRenderer.ts:173-177 (`h = 0x811c9dc5; h = Math.imul(h, 0x01000193) >>> 0`) — 0x811c9dc5==2166136261 and 0x01000193==16777619, so it is the same FNV-1a algorithm written in decimal vs hex. Color: Renderer.ts:44-61 parseColor does the identical `#rgb`->`#rrggbb` expansion (line 48) and `parseInt(h,16)` split (49-51) as theme.ts:105-110 hexToRgb; Renderer.ts:65 lighten `r + (255 - r) * t` matches theme.ts:115 lightenHex. Renderer's only deltas are the [r,g,b] tuple return and the rgb() fallback branch (54-58). All file:line citations are accurate. This is a pure DRY/consolidation finding with no behavioral bug; the finding itself correctly flags that AI's hash is a determinism seed while TerrainRenderer's is a throwaway cache key (not the same concern), making FNV unification readability-only. Real, but the proper severity is low (a no-bug maintainability cleanup), not medium.

---

## 30. [LOW] bouncing_betty bounce constants duplicate Physics.MAX_BOUNCES / BOUNCE_RESTITUTION (admitted in a comment)

_dimension: consolidation · verifier confidence: 5/5_

**Location**: shared/src/engine/WeaponSystem.ts:320 (bounce:{maxBounces:3,restitution:0.7,...}) vs shared/src/engine/Physics.ts:209-210 (MAX_BOUNCES=3, BOUNCE_RESTITUTION=0.7)

**Problem**: The bouncing-betty weapon def hardcodes maxBounces:3 and restitution:0.7, which MUST equal Physics.MAX_BOUNCES (3) and BOUNCE_RESTITUTION (0.7). The code comment itself states they 'MUST match the canonical Physics constants ... (asserted in the motion harness); kept inline so WeaponSystem stays dependency-free of Physics.' This is duplication kept alive only to avoid a shared/ internal import, leaning on a test harness to catch drift instead of the type system. reflectVelocity (Physics.ts:250) already DEFAULTS restitution to BOUNCE_RESTITUTION, so when betty passes its own 0.7 the two values must stay in sync by hand.

**Evidence**: WeaponSystem.ts:318-320 comment 'maxBounces/restitution MUST match the canonical Physics constants MAX_BOUNCES / BOUNCE_RESTITUTION (asserted in the motion harness); kept inline so WeaponSystem stays dependency-free of Physics.' then `bounce: { maxBounces: 3, restitution: 0.7, ... }`. Physics.ts:209 `export const MAX_BOUNCES = 3;` :210 `export const BOUNCE_RESTITUTION = 0.7;`.

**Suggested fix**: WeaponSystem and Physics are siblings in shared/ — importing Physics constants into WeaponSystem does NOT violate the layer rule (shared depends on nothing external) and does NOT affect determinism (compile-time constants). Replace the literals with `maxBounces: MAX_BOUNCES, restitution: BOUNCE_RESTITUTION`, deleting the 'must match' comment and the harness's need to police it. The 'dependency-free' justification is a self-imposed constraint, not an architectural one.

**Verifier verdict**: Confirmed in the actual code. WeaponSystem.ts:320 hardcodes `bounce: { maxBounces: 3, restitution: 0.7, ... }`, and Physics.ts:209-210 declares `export const MAX_BOUNCES = 3;` / `export const BOUNCE_RESTITUTION = 0.7;` — identical values, duplicated. The comment at WeaponSystem.ts:317-319 explicitly admits they "MUST match the canonical Physics constants ... kept inline so WeaponSystem stays dependency-free of Physics." The duplication is load-bearing: GameEngine.ts:268 drives the bounce loop with the def's `maxBounces`, and GameEngine.ts:407 passes `bounce?.restitution` into `reflectVelocity`, which otherwise defaults to `BOUNCE_RESTITUTION` (Physics.ts:250) — so the two copies must be synced by hand. The "dependency-free" justification is self-imposed, not architectural: sibling files AI.ts:29 and GameEngine.ts:38 both `import ... from './Physics'`, and WeaponSystem currently imports nothing from Physics. The suggested fix (import MAX_BOUNCES/BOUNCE_RESTITUTION, compile-time constants, no determinism or layering impact) is valid. However, severity "medium" overstates it: these are stable tuning constants, it's a pure consolidation/maintainability nit with no correctness risk, and a motion harness already polices the drift. Downgrading to low.

---

## 31. [LOW] BARREL_LENGTH=18 redefined in AI.ts and GameEngine.ts; the AI flight loop re-derives the engine's projectile step

_dimension: consolidation · verifier confidence: 5/5_

**Location**: shared/src/engine/AI.ts:48 (BARREL_LENGTH=18) and GameEngine.ts:70 (BARREL_LENGTH=18); AI.simulateImpact loop AI.ts:232-240 vs GameEngine.tick FIRING loop GameEngine.ts:356-432

**Problem**: BARREL_LENGTH is a private constant in both files and the AI comment (AI.ts:46-47) explicitly says it 'MUST match GameEngine's BARREL_LENGTH so the bot simulates from the same muzzle point' — another match-by-hand constant. Separately, AI.simulateImpact reimplements the engine's per-tick inner loop (capture prevX/prevY, stepProjectile, sweepCollide, branch on hit.type). The constant is a genuine dedup target; the LOOP is intentionally a reduced copy (no detonate/airburst/bounce — it aims at first impact) and reuses the SAME Physics primitives, so the bodies legitimately differ.

**Evidence**: AI.ts:46-48 comment '...MUST match GameEngine's BARREL_LENGTH...' then `const BARREL_LENGTH = 18;`; GameEngine.ts:69-70 `const BARREL_LENGTH = 18;`. AI.ts:233-238 `stepProjectile(p, state.wind, gravity); const hit = sweepCollide(p, prevX, prevY, state.terrain, state.tanks); if (hit.type === 'ground' || hit.type === 'tank') return ...` mirrors GameEngine.ts:356/380.

**Suggested fix**: Export BARREL_LENGTH from one shared module (or from Physics/Tank, which AI and GameEngine both already import) and import it in both — removing the hand-sync comment. Do NOT try to merge simulateImpact into GameEngine.tick: the AI loop is deliberately a read-only first-impact probe that omits detonation/airburst/bounce, and forcing them through one body would either pollute the engine with an AI 'probe mode' flag or make the AI mutate engine state — both worse than the current small, honest re-use of the shared Physics primitives. Dedup the constant only.

**Verifier verdict**: Confirmed in actual code. AI.ts:46-48 has the comment "...MUST match GameEngine's BARREL_LENGTH so the bot simulates from the same muzzle point" immediately followed by `const BARREL_LENGTH = 18;`. GameEngine.ts:69-70 independently declares `const BARREL_LENGTH = 18;` as another private module constant. Both are file-private (not exported), so this is a genuine hand-synced duplicate constant — a real consolidation target. The accompanying claim about the loops is also accurate: AI.simulateImpact (AI.ts:232-240) reuses the same Physics primitives (stepProjectile, sweepCollide, prevX/prevY sweep) but is a reduced first-impact probe that deliberately suppresses airburst/bounce (hasSplit:true/bounces:0 at AI.ts:228-229), whereas GameEngine.tick (GameEngine.ts:354-432) adds split, bounce/reflect, napalm and detonation. So the bodies legitimately differ and should NOT be merged; only the constant is a valid dedup. Severity low is correct — both constants currently equal 18, so there is no live correctness or determinism defect, only a maintainability/drift risk.

---

## 32. [LOW] Napalm is a strictly worse heavy weapon: ~55 max total damage delivered slowly, easily walked out of, and self-cancels via terrain pooling

_dimension: gameplay · verifier confidence: 4/5_

**Location**: shared/src/engine/WeaponSystem.ts:181-189,344-374; shared/src/engine/GameEngine.ts:728-745

**Problem**: Napalm costs 10000 (same as Baby Nuke / Cluster), yet its entire payload is DOT capped at ~NAPALM_DOT*NAPALM_BURN_TICKS = 0.7*78 ≈ 55 damage — and only if a tank stands dead-center in the flames for the full burn. The burn check requires the fire to be within TANK_HEIGHT*2 of the tank's feet (GameEngine.ts:739), so a tank that simply isn't standing on the impacted surface takes nothing. Compared to a 10000-credit Baby Nuke (90 burst damage, instant, guaranteed on a direct hit), napalm is a worse buy in almost every situation, and against any mobile/elevated target it does near-zero. Its only edge (area denial) is undercut because tanks don't move between turns in this game (DEFAULT_FUEL=0).

**Evidence**: WeaponSystem.ts:189 `NAPALM_DOT = 0.7`, :184 `NAPALM_BURN_TICKS = 78`; comment :186-187 itself states 'peak total ≈ DOT*burnTicks ≈ 55'. detonation.maxDamage=0 (:355) so there is zero impact damage. GameEngine.ts:739 gates burn on `Math.abs(surfaceAt(...) - tank.y) <= TANK_HEIGHT*2`. Tank.ts:15 `DEFAULT_FUEL = 0` — tanks can't be forced to move, so 'area denial' denies nothing.

**Suggested fix**: Either raise NAPALM_DOT/burn, drop its price, or give tanks fuel so positioning/area-denial matters. As tuned it is a trap purchase.

**Verifier verdict**: All cited facts verified in-code. WeaponSystem.ts:181-189 confirms NAPALM_BURN_TICKS=78, NAPALM_DOT=0.7, and the comment (:186) itself states peak total ≈55. napalm.detonation.maxDamage=0 (:355) — pure DOT, no impact damage. GameEngine.ts:739 gates burn on Math.abs(surfaceAt(terrain,x) - tank.y) <= TANK_HEIGHT*2, so an elevated/off-surface tank takes nothing. Tank.ts:15 DEFAULT_FUEL=0, and a grep for any movement code shows tank.fuel is only ever set to 0 and never read to move a tank (GameState.ts:139 calls it 'V1 movement fuel' — unimplemented), so area-denial denies nothing. baby_nuke (WeaponSystem.ts:262-269) is price 10000, maxDamage 90 instant. The gameplay analysis is correct. TWO caveats lower confidence/severity: (1) the 'strictly worse / same cost as Baby Nuke' framing is overstated — napalm bundleSize=10 (:348) vs baby_nuke bundleSize=3 (:262) at the same 10000 price, so napalm is ~1000/round vs ~3333/round, i.e. cheaper per shot; (2) napalm strips one shield particle per burn tick (:744 comment, SHIELD_PARTICLES=12) so a sustained burn can exhaust a shield where one nuke is fully absorbed — a real situational edge. This is a documented, deliberate tuning tradeoff ('Tunable in playtesting'), not a bug, and the constants are named per project convention. Real observation but low severity, not medium.

---

## 33. [LOW] Dead deploy config: ecosystem.config.cjs and the nginx /socket.io proxy target the deleted Node server

_dimension: orphan-code · verifier confidence: 5/5_

**Location**: ecosystem.config.cjs:5, nginx.conf:12-18

**Problem**: ecosystem.config.cjs launches `server/dist/index.js` under pm2 — i.e. the dead stub server. nginx.conf still reverse-proxies /socket.io/ to localhost:3000, a port nothing listens on anymore. docs/SPEC.md:512-516 explicitly says these are 'superseded' / 'no longer part of the deploy', so they are confirmed-stale config kept in the tree where an operator could copy them and stand up a broken/no-op process.

**Evidence**: ecosystem.config.cjs:5 `script: 'server/dist/index.js'`. nginx.conf:12-13 `location /socket.io/ { proxy_pass http://localhost:3000; }`. SPEC.md:132 comment '(the /socket.io proxy is superseded)' and SPEC.md:516 'the /socket.io/ proxy and the server/ process are no longer part of the [deploy]'.

**Suggested fix**: Delete ecosystem.config.cjs and remove the /socket.io location block from nginx.conf (the static-serving + try_files block is the only part still valid). If a pm2 file is wanted later it should not point at the stub server.

**Verifier verdict**: REAL. Confirmed in the actual files. ecosystem.config.cjs:5 has `script: 'server/dist/index.js'` (the pm2 app points at the superseded Node server). nginx.conf:12-13 reverse-proxies `location /socket.io/ { proxy_pass http://localhost:3000; }`. SPEC.md:132 calls the proxy 'superseded' and SPEC.md:510-517 states there is 'no Node/Socket.io game server, no pm2, and no nginx socket proxy' and that 'the /socket.io/ proxy and the server/ process are no longer part of the target deployment.' Verified the networking is fully Supabase: client/src/client/NetworkClient.ts:1 imports @supabase/supabase-js and uses Realtime channels (this.supabase.channel), never socket.io or localhost:3000; client deps confirm Supabase, no socket.io-client. So the pm2 script and the /socket.io proxy target dead infra — genuine orphan/dead config an operator could copy. One imprecision: the title says 'deleted Node server', but server/src/{index.ts,RoomManager.ts,GameServer.ts} still exist — superseded/unused, not deleted (the body's 'stub server' is closer). Severity downgraded to low: it is non-runtime deploy config, causes no defect in shipping code, and SPEC.md already documents it as superseded — real hygiene debt, but below medium.

---

## 34. [LOW] generateBitmap is a public export used only by a check script; placeTwoTanks is the legacy two-tank layout used by one check + an engine fallback

_dimension: orphan-code · verifier confidence: 5/5_

**Location**: shared/src/index.ts:64 (generateBitmap), shared/src/engine/Terrain.ts:158; shared/src/index.ts:75 (placeTwoTanks), shared/src/engine/Tank.ts:105

**Problem**: generateBitmap() (Terrain.ts:158) has no consumer in shipped client/server code — its only call site is scripts/checks/timestep.mjs:225. It exists purely as a convenience wrapper (generate -> buildBitmap) that production never calls. placeTwoTanks() is a near-orphan: the engine only reaches it as a fallback when options.players is absent (GameEngine.ts:158), but the live client ALWAYS supplies players (main.ts:241 hot-seat, NetworkClient builds players), so the two-tank path is effectively unreachable in production and exists mainly for collision.mjs:336.

**Evidence**: grep generateBitmap: only shared/src/index.ts, Terrain.ts def, and scripts/checks/timestep.mjs:225. grep placeTwoTanks: GameEngine.ts:158 (the `: placeTwoTanks(...)` fallback branch), Tank.ts def, collision.mjs:336. main.ts always passes config.players to the engine, so the placeTwoTanks fallback branch is dead for real users.

**Suggested fix**: Either demote generateBitmap/placeTwoTanks to test-only helpers (move out of the public index.ts), or confirm and document the fallback as a deliberate test seam. If the no-players engine path is truly unreachable from both clients, remove the placeTwoTanks fallback branch in GameEngine.ts:158 to delete an untested code path.

**Verifier verdict**: Confirmed in actual code. generateBitmap is defined at shared/src/engine/Terrain.ts:158, exported publicly at shared/src/index.ts:64, and its ONLY consumer is the check script scripts/checks/timestep.mjs:225 (grep returns exactly: index.ts:64, Terrain.ts:158 def, timestep.mjs:17 import + :225 call). No shipped client/ or server/ consumer exists — it is a pure generate->buildBitmap convenience wrapper production never calls. placeTwoTanks is defined at Tank.ts:105, exported at index.ts:75, and reached in the engine only as the fallback branch `: placeTwoTanks(terrainArr, options)` at GameEngine.ts:158, taken when options.players is absent or not 2-4. Both client construction paths always supply players: hot-seat at client/src/main.ts:258 (players: config.players) and network at main.ts:241 (players: config.players.map...), so the fallback is unreachable for real users; its only other caller is scripts/checks/collision.mjs:336. Characterization is accurate, including the 'near-orphan' framing (the branch is technically live, just unreachable from both shipped clients). Severity low is appropriate: dead/unused public surface and an untested code path, no correctness or security impact.

---

## 35. [LOW] Theme tokens drift between the declared single source of truth (theme.ts) and the CSS mirror

_dimension: ui · verifier confidence: 4/5_

**Location**: client/src/ui/theme.ts:82-86 (CRT.vignetteAlpha 0.35); client/src/style.css:36-38 (--crt-vignette-alpha 0.45)

**Problem**: theme.ts is documented as 'the SINGLE SOURCE OF TRUTH' and says the CSS :root vars mirror it 'in lockstep'. They do not: CRT.vignetteAlpha is 0.35 in theme.ts but --crt-vignette-alpha is 0.45 in style.css. The canvas/DOM CRT vignette intensities are therefore literally different values, and the lockstep contract the codebase relies on for token consistency is already broken — meaning future edits 'in theme.ts' silently fail to affect the DOM.

**Evidence**: theme.ts:83-86 'export const CRT = { scanlineAlpha: 0.1, vignetteAlpha: 0.35 } as const;' vs style.css:37-38 '--crt-scanline-alpha: 0.10; --crt-vignette-alpha: 0.45;'. The scanline matches (0.1) but the vignette does not (0.35 vs 0.45).

**Suggested fix**: Reconcile the value, and ideally generate the :root custom properties from theme.ts at build/boot (write them onto document.documentElement.style) so the mirror can never drift again.

**Verifier verdict**: The numeric drift is real and correctly cited: theme.ts:85 has vignetteAlpha:0.35 while style.css:38 has --crt-vignette-alpha:0.45 (scanline matches at 0.1/0.10). theme.ts:2 does declare itself "the SINGLE SOURCE OF TRUTH" and theme.ts:9-10/:82 claim the CSS vars mirror it "in lockstep", so the documented contract IS violated. HOWEVER the finding's core impact claim is wrong: I grepped all of client/ and CRT.vignetteAlpha (and CRT.scanlineAlpha) are NEVER read by any canvas renderer — the only live vignette is CSS-only at style.css:112 using --crt-vignette-alpha. So there is no "canvas vs DOM intensities are literally different" divergence; the TS constant is effectively dead. This is a cosmetic dead-token / doc-drift hygiene issue with zero functional, gameplay, or determinism impact — low severity, not medium, and its stated user-visible effect does not actually occur.

---

## 36. [LOW] Lobby copy and inline styles hardcode off-palette grays instead of theme tokens

_dimension: ui · verifier confidence: 5/5_

**Location**: client/src/ui/Lobby.ts:1021,1084,1101,1414 (#9aa3b2), :380 (#6ff09a); compare client/src/ui/theme.ts:59-64 (--text-dim #9a86b8)

**Problem**: Multiple lobby text elements set color via inline style.cssText to '#9aa3b2' (a cool blue-gray) rather than the project's --text-dim token (#9a86b8, a warmer lavender-gray that matches the dusk palette). The Ready badge also hardcodes '#6ff09a' instead of deriving from the green palette entry. These bypass the token system, so they (a) don't match the rest of the dusk-themed copy and (b) won't follow any future theme change. The values are scattered as magic strings, exactly what CLAUDE.md says to avoid.

**Evidence**: Lobby.ts:1021 'empty.style.cssText = \'color:#9aa3b2;\';', :1084 'codeLabel.style.cssText = \'color:#9aa3b2;...\'', :1101, :1414 same; :380 '.online-badge.ready { ... color: #6ff09a; }'. theme.ts:62 'dim: \'#9a86b8\'' is the intended dim-text token (CSS var --text-dim).

**Suggested fix**: Replace the inline '#9aa3b2' with var(--text-dim) (or a .lobby-muted class) and the badge green with a palette-derived token. Avoid inline style.cssText for color throughout.

**Verifier verdict**: Confirmed in actual code. Lobby.ts:1021 (empty.style.cssText='color:#9aa3b2;'), :1084, :1101, :1414 all hardcode the cool blue-gray #9aa3b2 via inline style.cssText, while the project's dim-text token is --text-dim:#9a86b8 (theme.ts:62 + style.css:30), a warmer lavender-gray used everywhere else in the same file (e.g. .lobby-sub/.lobby-field labels via var(--text-dim) at Lobby.ts:257,259,382). Lobby.ts:380 hardcodes color:#6ff09a for .online-badge.ready, which is not the Green palette value #4de87a (Lobby.ts:54); the badge's own background even uses rgba(77,232,122,...) = #4de87a, so the text green is a separate non-derived magic string. All claims and locations match verbatim; off-palette/bypasses-token assessment is correct. Purely cosmetic/maintainability with no runtime impact, so low severity is appropriate (borderline nit).

---

## 37. [LOW] Whole-app transform:scale with overflow:hidden silently clips the UI on short/narrow viewports (no min scale floor for content)

_dimension: ui · verifier confidence: 4/5_

**Location**: client/src/main.ts:217-227 (updateScale); client/src/style.css:47-57 (body overflow:hidden), :65-77 (#app fixed 1064x500)

**Problem**: #app is a fixed 1064x500 stage scaled by s = min(innerW/1064, innerH/500, 1) from center, on a body with overflow:hidden. There is no lower bound on s and no fallback layout: on a phone (e.g. 360px wide) s drops to ~0.34, rendering the entire game + all HUD text at roughly one-third size — tank labels, ammo counts, and the 24px swatches become illegibly tiny and untappable, with no responsive reflow. Because body is overflow:hidden and the scale origin is center, any rounding or chrome that pushes past the viewport is simply clipped rather than scrolled to. The HUD panel's own overflow-y:auto is inside the scaled element, so its scrollbar also shrinks with s.

**Evidence**: main.ts:222 'const s = Math.min(window.innerWidth / 1064, window.innerHeight / 500, 1);' then ':223 appEl.style.transform = `scale(${s})`' with ':224 transformOrigin = center center'. style.css:56 'overflow: hidden;' on body, '#app { width: var(--stage-w)=1064px; height: 500px; ... overflow: hidden; }' (:69-76). #hud '.overflow-y: auto' (style.css:161) lives inside the scaled #app.

**Suggested fix**: Either set a minimum scale and allow the page to scroll below it, provide a stacked/responsive layout for narrow viewports (panel below the canvas), or at minimum detect very small s and warn. A center-origin scale with overflow:hidden and no floor is not a substitute for responsive design.

**Verifier verdict**: Confirmed in code. main.ts:222 computes s = Math.min(innerW/1064, innerH/500, 1) with no lower floor; main.ts:223-224 applies transform: scale(s) with transformOrigin center. style.css:56 sets overflow:hidden on body; --stage-w:1064px (style.css:14) and #app is a fixed 1064x500 unit with overflow:hidden (style.css:69-76). #hud has overflow-y:auto (style.css:161) inside the scaled #app, so its scrollbar shrinks with s. So on a 360px viewport s ~= 0.34 and the whole UI (HUD text, swatches) renders ~1/3 size with no responsive reflow, center-origin clipping any overflow — all as described. Downgraded to low: this is a deliberate, documented aspect-ratio-preserving scale-to-fit (comments at style.css:59-64, main.ts:217-218) on an internal-only (CLAUDE.md), non-networked desktop-oriented artillery game; the impact is 'tiny/illegible on a phone' UX degradation, not a functional break, data loss, or security issue. medium overstates it.

---

## 38. [LOW] Shield ring and napalm flames draw unbounded per-tank/per-cell loops with no cap, scaling cost with board state on the constrained box

_dimension: ui · verifier confidence: 4/5_

**Location**: client/src/renderer/Renderer.ts:339-380 (drawShields), :277-330 (drawFire)

**Problem**: drawFire iterates every burning FireCell TWICE per frame (Pass 1 ember glow, Pass 2 two filled triangles each) with a fresh Math.random() per cell, and drawShields iterates every shielded tank drawing a stroked circle, a radial-gradient fill (createRadialGradient allocates a gradient object per tank per frame), and a per-slot arc loop (capacity ~12 dots). A wide napalm field (a spreading fire across many of the 800 columns) means hundreds of cells * (1 fillRect + 2 fill paths) every frame, plus per-tank gradient allocation, with no upper bound or culling. On the explicitly-called-out t3.micro this is the kind of per-frame canvas cost that scales badly exactly when the screen is busiest (big fire + multiple shields = worst case).

**Evidence**: Renderer.ts:290-296 'for (const cell of fire) { ... ctx.fillRect(...) }' then :301-326 a second 'for (const cell of fire)' doing two ctx.fill() paths with 'Math.random()' at :305-306. drawShields:344-379 'for (const tank of state.tanks) { ... ctx.createRadialGradient(...) ... for (let i=0;i<slots;i++){ ctx.arc(...) } }' — a gradient allocated per tank per frame.

**Suggested fix**: Cache/pre-build the shield radial gradient (it is geometry-relative, not state-relative), and consider rendering the napalm field to an offscreen canvas updated at a lower cadence (e.g. the ~20fps tick rate already used for projectile deltas) rather than full per-cell repaint every rAF.

**Verifier verdict**: Confirmed in client/src/renderer/Renderer.ts. drawFire (277-330) iterates state.fire TWICE per frame: Pass 1 (290-296) one fillRect per cell, Pass 2 (301-326) two ctx.fill() triangle paths per cell, with Math.random() at 305-306 for flicker. drawShields (339-380) iterates state.tanks, allocating a fresh createRadialGradient per tank per frame (358) plus a stroked arc, a filled gradient arc, and a per-slot arc loop (368-377, capacity ~12). No culling/cap is present. The characterization is accurate. Severity "low" is appropriate: fire cells are naturally bounded by CANVAS_WIDTH (800), and tank count is small (~8 max), so worst case is a few thousand cheap canvas ops + a handful of gradient allocs per frame — a modest per-frame cost on the t3.micro, a legitimate optimization opportunity but not a correctness or determinism issue (the Math.random() is purely visual; authoritative state is state.fire per the doc comment at 269-270, and the finding does not claim a determinism violation).

---

## 39. [LOW] Keyboard aiming is undiscoverable in online play and the legend contradicts the on-screen angle

_dimension: ux · verifier confidence: 4/5_

**Location**: client/src/ui/HUD.ts:154-161 (controls legend on #game-overlay) + index.html:14-16; client/src/input/InputHandler.ts:136-145; client/src/ui/HUD.ts:422-425 (angle readout)

**Problem**: Two compounding problems for a keyboard-only new player. (1) The only controls hint is a tiny semi-transparent legend rendered onto the canvas overlay, but the lobby is a full-field overlay covering that canvas right up until the game starts, and nothing in the lobby or a tutorial explains the controls — the player must discover arrow-key aiming by accident. (2) The HUD shows the raw engine angle 0–180 where 0=right/180=left, and ArrowLeft INCREASES that number while ArrowRight DECREASES it. So pressing Left makes 'Angle' count UP and pressing Right makes it count DOWN — the displayed number moves opposite to the intuitive direction, which reads as broken to a newcomer.

**Evidence**: HUD controls legend is built once into overlayRoot (HUD.ts:156-161) and the lobby overlay (#lobby) sits in the same #app stack covering #stage (index.html). InputHandler maps ArrowLeft → adjustAngle(+step) with the comment 'swinging the barrel LEFT INCREASES the angle' (InputHandler.ts:136-140) and ArrowRight → -step (141-145); the HUD prints that same raw angle as `Angle ${Math.round(tank.angle)}°` (HUD.ts:423-424).

**Suggested fix**: Show the controls legend in the lobby (or a one-time how-to) so it is visible before the canvas is uncovered, and either display a barrel-relative aim indication or invert/relabel the angle readout so Left/Right move the number the way the barrel visibly moves.

**Verifier verdict**: Both cited code facts are real and accurately described, but severity is inflated. CLAIM 2 (angle reads backwards) is fully confirmed: InputHandler.ts:136-145 maps ArrowLeft -> adjustAngle(+step) and ArrowRight -> adjustAngle(-step), with ANGLE_MIN=0/ANGLE_MAX=180 (lines 22-23) and the comment confirming 0=right..180=left; HUD.ts:422-424 prints the raw angle as `Angle ${Math.round(tank.angle)}°`. So pressing Left makes the number count UP and Right makes it count DOWN — the readout moves opposite to the arrow pressed. Accurate. CLAIM 1 (legend undiscoverable) is partly overstated: the controls legend IS built into overlayRoot/#game-overlay (HUD.ts:156-161, appended at 284) which sits over the canvas inside #stage, and the lobby #lobby is a separate full-app overlay (client/index.html:18). But the lobby is hidden once the game starts (Lobby.ts:211-215, `this.root.hidden = true`), so during actual play the canvas is uncovered and the legend (which does say '←/→ Aim') is visible — the player does NOT have to discover aiming 'by accident,' they just don't see the legend while still in the lobby. So the only true gap is no controls hint inside the lobby/tutorial. These are cosmetic/discoverability UX nits in a genre (Scorched Earth) where 0-180 left-to-right angle is conventional; not blocking, no data/functional impact. Real but low, not high.

---

## 40. [LOW] Color/name clash is signalled by color alone for colorblind users and the waiting-room error is confined to the clashing player

_dimension: ux · verifier confidence: 4/5_

**Location**: client/src/ui/Lobby.ts:1108-1130 (clash dot), 372-375 (.online-player-dot.clash CSS), 1139-1151 (clash warning); client/src/ui/HUD.ts:528-533 (in-game swatch)

**Problem**: The whole player-identity model is color-first and the only clash signal for OTHER players is a red ring on a colored dot — a color-only cue. A colorblind player can't tell two same-colored tanks apart in the waiting list OR in-game (tanks are differentiated purely by palette color, HUD swatches at 528-533), and the actionable 'change your color' warning is only shown to the player who clashes (1139-1151), so a host watching a joiner clash sees only a subtle ring with no text and no way to understand why the game won't start.

**Evidence**: The clash indicator is `dot.classList ... ' clash'` styling a colored dot with a red box-shadow/outline (Lobby.ts:1117 + CSS 372-375) — no text label or icon. The textual warning (1142-1151) is gated on `myColorClashes()/myNameClashes()` (1139), i.e. only rendered for the clashing client. Palette is 5 fixed colors (Lobby.ts:51-57) and identity in-game is color swatch only (HUD.ts:348-351, 528-533).

**Suggested fix**: Add a non-color cue to clashing rows (e.g. a '⚠ duplicate color' text tag visible to everyone) and consider a per-tank shape/initial in-game so same-color tanks remain distinguishable; show a room-level 'two players share a color' notice, not just the per-self warning.

**Verifier verdict**: Code claims largely check out but severity is inflated. CONFIRMED: the OTHER-player clash signal is color-only — Lobby.ts:1117 adds ' clash' to a colored dot, and the .clash CSS (Lobby.ts:373-375) is only a red box-shadow/outline ring with no text or icon. The actionable warning text (Lobby.ts:1142-1151) is gated on myColorClashes()/myNameClashes() (1139-1141), so it renders only for the clashing client; a host watching a joiner clash sees only the subtle ring. Palette is 5 fixed colors (Lobby.ts:51-57). In-canvas tanks are color-only — TankRenderer.ts has no fillText/name label. So the accessibility gap (color-only cue for spectators) is REAL. HOWEVER the finding overstates two things: (1) it claims in-game tanks are 'color swatch only', but the HUD player rows show tank.playerName (HUD.ts:354 + playerLabel 470-471) and the aim line shows the name (HUD.ts:417,423) — names ARE present in the HUD, only the canvas lacks labels; (2) the 'two same-colored tanks in-game' scenario is effectively prevented — a clashing player is hard-blocked from readying up (button disabled at Lobby.ts:1166-1169, defense-in-depth at 1308-1313, plus duplicateColors gate), so a clash cannot normally reach gameplay. The genuine defect is a minor lobby-spectator accessibility/clarity gap, not the medium-severity in-game indistinguishability the finding frames. Real but low.

---


# Sprint spec — "Scorched Earth parity: economy & match-flow"

> Source: `.codearbiter/open-tasks.md` → `## Feature expansion (Scorched Earth homage)` and
> `## Physics & visual`, filtered to the **gameplay-parity-first** roadmap (`CONTEXT.md` CONFIRM-04).
> Scope chosen for an ultracode pass: the cluster of SE economy/match-flow mechanics that are
> additive and **determinism-harness-validated**, deliberately excluding the network-action and
> new-physics features (movement, parachutes) that need a wider blast radius + a playtest gate.

## Problem

The match economy and round flow are thin against the Scorched Earth homage the project is chasing.
Four catalog-faithful mechanics are missing, each cheap and each on the decided "gameplay parity
first" track:

- **No save-vs-spend tension between rounds** — credits sit idle in the ROUND_OVER shop; the original
  pays *interest* on a held balance, making banking a real decision.
- **No stalemate-breaker** — two entrenched, well-shielded tanks can trade misses for an unbounded
  number of turns; the original escalates ("sudden death") to force resolution.
- **No match tiering** — every weapon is buyable in every room. SE gates the store by *Arms Level*
  ("basic" vs "everything") so a room can be a missiles-only duel or a full arsenal brawl.
- **No power investment** — power is hard-capped at 100, so there is no economy sink that *extends
  range* on the 1200px field. SE's *Battery* accessory raises the cap (+10/unit).

## Scope

**In scope** — four features, three engine-only and one that extends the buy contract:

1. **Credit interest at ROUND_OVER** `[M/S]` — `GameOptions.interestRate`; at each round boundary every
   tank earns `floor(credits * rate)` (integer, to avoid replay float drift). Engine-only.
2. **Sudden-death gravity escalation** `[M/S]` — `GameOptions.suddenDeathTurn`; past the threshold turn,
   effective gravity ramps up as a **pure function of `state.turn`**, shrinking max range each turn so
   entrenched duels must resolve. Engine-only, physics-input only (no terrain mutation).
3. **Arms-level room setting** `[M/S]` — `GameOptions.armsLevel` (0–4); the engine's `applyBuy` rejects a
   purchase whose weapon `armsLevel` exceeds the room's. Default preserves "everything". Engine-only.
4. **Batteries accessory** `[M/S]` — a purchasable accessory (catalog: $5000 / bundle of 10, +10 power per
   unit, arms-level 2) that raises a tank's per-tank `powerCap` above 100. Extends the `buy` action with an
   optional `accessory` field (backward-compatible), wired through `replay.ts` + the Deno referee so it
   works in networked lockstep too; carries across rounds like inventory.

**Out of scope (explicit boundary):**

- **Tank movement / fuel** — the headline pillar, but it adds a NEW networked `move` action (referee +
  replay + client + Edge-Function redeploy + a 2-browser playtest). Its own sprint.
- **Parachutes** — the open-tasks `[H/S]` undercounts it: there is currently **no fall damage at all**
  (a crater-drop is harmless in `resolveTanksToTerrain`), so a faithful parachute needs a new
  fall-damage gameplay mechanic + retuning first. Defer to a physics sprint.
- Any change to the **trust-client posture** (CONFIRM-01) or the transport (CONFIRM-03). The battery
  referee change is an additive *shape* relaxation, not a new trust boundary.
- Client store/shop **UI** beyond the minimal wiring needed to issue a battery buy; visual polish is a
  follow-up. The determinism-critical surface is the engine + contract, which the harnesses cover.

## Acceptance criteria

Each criterion is one `tdd` Phase-1 obligation. Harnesses live in `scripts/checks/*.mjs`, are appended
to the `npm run check` chain, and pin expected values inline (house style).

### Feature 1 — Credit interest (`scripts/checks/interest.mjs`)

1. **Back-compat:** with `interestRate` unset (or `0`), credits carry between rounds exactly as today —
   byte-identical to the current `rounds.mjs` carry behavior (no interest applied).
2. **Earns interest:** with `interestRate: r`, when a round resolves and stages the next, every tank's
   carried credits become `c + floor(c * r)` (interest computed on the post-payout balance, applied to
   ALL tanks, visible in the ROUND_OVER shop).
3. **Integer-only:** the credited interest is always an integer (`floor`); credits never become
   fractional after any number of rounds.
4. **No interest without a round boundary:** a single-round match (`rounds: 1`, default) never applies
   interest (there is no ROUND_OVER), and interest is applied exactly once per round transition.
5. **Determinism:** two same-seed engines driven identically land on byte-identical credits after N
   round transitions.

### Feature 2 — Sudden-death gravity escalation (`scripts/checks/suddendeath.mjs`)

6. **Back-compat / off by default:** with `suddenDeathTurn` unset, effective gravity equals the base
   gravity on every turn (trajectories byte-identical to today).
7. **Pure function of turn:** with `suddenDeathTurn: T`, effective gravity equals base for `turn <= T`
   and `base * (1 + (turn - T) * RAMP)` for `turn > T` — strictly increasing per turn, computed with no
   clock/random (same turn ⇒ same gravity).
8. **Observable consequence:** the SAME aim (angle/power/weapon) fired on a turn past the threshold
   travels a STRICTLY SHORTER horizontal range than fired on a turn at/under the threshold.
9. **Determinism:** two same-seed engines driven identically (advancing past the threshold) land on
   byte-identical state (terrain + tanks + wind).

### Feature 3 — Arms-level room setting (`scripts/checks/armslevel.mjs`)

10. **Back-compat / everything by default:** with `armsLevel` unset, every affordable buy succeeds as
    today (e.g. a `funky_bomb`, arms-level 4, with sufficient credits).
11. **Gate rejects above-level:** with `armsLevel: 0`, buying an above-level weapon (e.g. `nuke` lvl 1,
    `cluster_bomb` lvl 2) is rejected with NO credit/ammo change; a level-0 weapon (`missile`) succeeds.
12. **Boundary:** with `armsLevel: 2`, level-≤2 buys succeed (`napalm` lvl 2) and level-≥3 buys are
    rejected (`shield` lvl 3, `deaths_head` lvl 4).
13. **Both shop paths:** the gate applies in BOTH a PLAYER_TURN buy and a ROUND_OVER between-rounds buy
    (the gate lives in the shared `applyBuy`).
14. **Determinism:** same seed + driver ⇒ byte-identical credits/inventory.

### Feature 4 — Batteries accessory (`scripts/checks/batteries.mjs` + Deno referee tests)

15. **Default cap:** a fresh tank has `powerCap === 100`; `set_power` clamps to `[0, 100]` exactly as
    today when no battery is owned.
16. **Buy raises the cap:** a `buy` with `accessory: 'battery'` spends `BATTERY_PRICE`, raises the
    tank's `powerCap` by `BATTERY_POWER_PER_UNIT * BATTERY_BUNDLE_SIZE`, and does NOT end the turn;
    unaffordable/owned-cap-edge cases reject cleanly (no spend).
17. **Cap takes effect:** after buying a battery, `set_power` accepts a power above 100 (clamped to the
    new cap), and a shot fired at that power travels STRICTLY FARTHER than the same shot at power 100.
18. **Carries across rounds:** `powerCap` carries into the next round (like credits/inventory), not
    reset to 100.
19. **Contract + referee:** `BuyAction`/`NetworkBuyAction` carry an optional `accessory`;
    `replayNetworkAction` passes it through; the Deno `validateActionShape` accepts a battery buy
    (`accessory: 'battery'` with no `weapon`) and still rejects a buy that has neither; `endsTurn('buy')`
    stays `false`. **Test:** Deno unit cases in `submit_action/validate.test.ts`.
20. **Determinism:** same seed + driver (buy battery, then a high-power fire) ⇒ byte-identical state.

## Determinism & risk notes

- **HARD determinism (the central constraint):** every engine change is integer/pure-arithmetic and a
  function only of `(seed, action log, tick count)`. Interest uses `floor`. Sudden-death gravity is a
  pure function of `state.turn`. No `Math.random`/`Date.now`/`performance.now` is introduced. The
  per-feature determinism AC (5/9/14/20) is the guard.
- **`clone()` parity:** `interestRate`, `suddenDeathTurn`, `armsLevel` are new engine fields and MUST be
  copied in `clone()` (used for the networked next-seat derivation), or a clone would diverge. A
  dedicated assertion in each harness clones mid-match and checks parity.
- **Network contract (Feature 4 only):** the `accessory` field is **additive + optional** — existing
  `buy` rows (weapon-only) are byte-identical on the wire. The referee duplication in
  `supabase/functions/` is updated by hand per `coding-standards.md` (the two `NetworkAction` copies are
  intentionally separate). Backend redeploy (`npm run deploy:backend`) is the deploy step, noted for the
  maintainer — the hot-seat path works immediately and the harness validates the engine.
- **`GameState` serialization:** `powerCap` is a new `TankState` field; harnesses that serialize tanks
  already spread the whole tank, so it round-trips. No migration (terrain/log only persist seed + actions).

## Open questions

_None._ All four map to decided directions in `CONTEXT.md` (CONFIRM-04 gameplay-parity-first). No new
`[CONFIRM-NN]` raised. Tuning constants (`INTEREST` default 0, `SUDDEN_DEATH_GRAVITY_RAMP`,
`BATTERY_*`) are named constants, playtest-tunable.

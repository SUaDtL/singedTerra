# Sprint Plan — Combat Depth (Full Weapon Roster + Ammo Economy)

> The sprint after the pixel-terrain rewrite + online public/private lobbies + lazy-GC
> work (all on `main` as of `a88e1a2`). Theme chosen from the next-sprint planning
> workflow; this plan folds in the adversarial red-team's corrections.

## Goal

Turn the engine's latent capability into *felt* gameplay: a real arsenal players pick
from a visible, ammo-counted weapon strip instead of blind Tab/Q cycling — every shot a
tactical choice. Five weapons already work (`baby_missile`, `missile`, `heavy_missile`,
`dirt_bomb`, `cluster_bomb`); five are pure `implemented:false` data stubs; inventory
exists on `TankState` but is cosmetic (never checked or decremented).

## How we work (carried over — non-negotiable)

- **ultracode + barrier-first workflows:** freeze contracts, then implement. One slice
  per workflow so each verification gate tests one new class of risk.
- **REVIEW-BEFORE-COMMIT:** no commit/push without explicit ask.
- **Determinism is a hard rule.** `shared/` has NO global RNG / clock / wall-clock reads.
  `npm run check` (typecheck + 6 harnesses: determinism, collision, timestep, turnstate,
  airburst, wind) must stay green; `npm run build` must pass before "done."
- **Lockstep replay:** networked clients replay `seed + ordered fire-action log` and
  re-run the engine (`NetworkClient.applyNetworkFireAction` synthesizes
  `set_angle → set_power → select_weapon → fire`). Any new gameplay must produce
  bit-identical state on replay or clients diverge silently.
- Edge Functions deploy freely via the linked CLI; **schema migrations are blocked**
  (DB password not on disk) — keep new persisted fields in `rooms.options`/`players` JSONB.

---

## Slice 0 — Prerequisite: kill the `Infinity` inventory landmine (S)

`Tank.defaultInventory()` (`shared/src/engine/Tank.ts:40-56`) sets
`baby_missile: Infinity` and `cluster_bomb: Infinity`. `JSON.stringify(Infinity) === "null"`,
so the moment inventory is ever persisted to / transmitted via JSONB (which the shop goal
activates), ammo silently reads as `null`/`NaN`. Today it's latent (only the fire-action
log crosses the wire), but it is a **hard prerequisite** for ammo meaning anything.

- **Task 0.1 (S) — DECIDED: explicit `unlimited` flag.** Change the inventory entry shape
  from a bare number to `{ count: number; unlimited: boolean }` (e.g. `baby_missile =
  { count: 0, unlimited: true }`). Removes the `Infinity` value entirely (no
  `Infinity->null` serialization hole) and gives gating a clean predicate
  (`if (!e.unlimited && e.count <= 0) reject; else if (!e.unlimited) e.count--`). Files:
  `shared/src/types/GameState.ts` (`TankState.inventory` type),
  `shared/src/engine/Tank.ts` (`defaultInventory`), and any harness/consumer that currently
  reads `inventory[...]` as a number.
- **Verify:** `npm run check` green; add a one-line assertion that a serialized →
  parsed inventory round-trips without `null`/`NaN`.

---

## Slice 1 — MVP: ammo gating + nukes live + weapon strip (M)

No new flight behavior. Converts shipped plumbing into a discoverable, finite arsenal.

- **Task 1.1 (M) Ammo gating.** In `applyAction('fire')` (`GameEngine.ts:~187-211`):
  reject/clamp a fire when the selected weapon's count is 0; decrement the count on a
  successful fire. `select_weapon` (`:~184`) may optionally refuse a 0-count weapon.
  Files: `shared/src/engine/GameEngine.ts`, `shared/src/engine/Tank.ts`.
  - **Replay determinism:** decrement must be deterministic and the *initial* inventory
    identical on every client (it is — `defaultInventory`). A shot that fired live must
    NOT get rejected on replay. Decrement order + clamp semantics are part of the contract.
- **Task 1.2 (S) Nukes live.** Flip `baby_nuke` + `nuke` to `implemented:true` and tune
  radius/damage. Behavior is free — `detonate()` already handles arbitrary radius/maxDamage.
  File: `shared/src/engine/WeaponSystem.ts:124-147`.
- **Task 1.3 (M) Weapon strip UI.** Render `implemented` `WEAPONS` as a clickable strip in
  the HUD: active highlight + live ammo counts; clicking emits `select_weapon`. Keep Tab/Q
  as an accelerator. Files: `client/src/ui/HUD.ts`, `client/src/input/InputHandler.ts (~cycleWeapon)`.
- **Task 1.4 (M) Ammo-replay-determinism harness (NEW).** A 7th harness: drive a scripted
  game that fires gated weapons to exhaustion, then assert a same-seed replay of the
  action log produces byte-identical final state (esp. inventory + winner). Keep all 6
  existing harnesses green (note: `turnstate`/`airburst` currently rely on
  `cluster_bomb`/`baby_missile` being effectively unlimited — Slice 0's sentinel must keep
  them selectable across a full game). Files: `scripts/checks/ammo.mjs` (new), wire into
  `package.json` `check` script.

**MVP definition of done:** Slices 0+1 green on `npm run check` + `npm run build`; the
existing 5-weapon roster is finite, discoverable, and replay-safe.

---

## Slice 2 — New deterministic motion weapons (L)

Each introduces new tick-loop motion — the highest-risk determinism surface. Build/verify
one at a time. NO `Math.random` anywhere; any "scatter" is seeded/derived.

- **Task 2.1 (M) `funky_bomb` — mid-flight 5-way split.** Reuse the `splitAirburst` fan
  math, but the *trigger* is NOT apex (`tick()` apex gate `vyBefore<0 && p.vy>=0`,
  `GameEngine.ts:~261`). Add a distinct trigger (e.g. age-based) via a new `BehaviorDef`
  shape. Deterministic fan only. Files: `WeaponSystem.ts:173`, `GameEngine.ts (tick,
  splitAirburst ~307-327)`. SPEC §4.5.
- **Task 2.2 (L) `napalm` — wide multi-cell impact.** Model as N offset `detonate()` calls
  (or a new wide-damage primitive). **Cost the red-team flagged:** each `detonate` runs
  `deform → applyGravity` on the pixel bitmap and re-resolves *every* tank (burial/crater
  loop, `GameEngine.ts:416-425`) — N overlapping detonations = N gravity passes + N burial
  checks per shot (t3.micro CPU). Each pushes a separate `ExplosionEvent` id — verify the
  client's id-based dedupe handles N-in-one-tick. Files: `WeaponSystem.ts:185`,
  `GameEngine.ts (detonate ~384-442)`.
- **Task 2.3 (L) `bouncing_betty` — 3 terrain bounces.** **Re-sized M→L by the red-team.**
  `sweepCollide` returns an impact *point*, not a normal, and terrain is now a pixel bitmap
  — the reflection normal must be derived from neighboring column surface heights (new
  physics in `Physics.ts`). Add a `bounces`/`bounceCount` field to `ProjectileState`
  (threaded through serialization like `hasSplit`) and a new collision outcome that
  reflects velocity instead of detonating, until the count is spent. Files: `WeaponSystem.ts:161`,
  `Physics.ts (collide/sweepCollide ~171-205)`, `GameEngine.ts (tick)`,
  `shared/src/types/GameState.ts (ProjectileState)`. SPEC §4.5.
- **Task 2.4 (M) Motion harnesses (NEW).** Determinism + behavior coverage for the bounce
  and funky-split (reflection count, deterministic fan, same-seed reproducibility).

---

## Slice 3 — Shield (L) — establishes the new-action-into-the-log pattern

The riskiest item: a **non-fire action in the replayed log**, which the netcode does not
support today.

- `submit_action` (`supabase/functions/submit_action/index.ts:~78-83`) **hard-rejects any
  action whose `type !== 'fire'`** and treats `active_player_index` as **advisory only**
  (`:~221`, comment: "diagnostic only — not used for turn enforcement").
- **Task 3.1 (M) Shield state + absorption — DESTRUCTIBLE PARTICLE FORCE FIELD.** Activating
  the shield surrounds the tank with `SHIELD_PARTICLES` (default 12) particles. Each blast
  that would damage the tank instead destroys ONE particle and is fully negated while >=1
  remains; at 0 the field is gone and damage applies normally. Multi-blast weapons (cluster
  bomblets, napalm cells) each strip a particle, so area weapons shred the field faster —
  thematic AND deterministic (integer count, decrement per damaging blast, no RNG). Store
  `shieldParticles: number` on `TankState` (`GameState.ts:~99-118`); intercept in the
  `detonate` damage loop BEFORE `Tank.applyDamage` (`Tank.ts:~190-193`). Client renders a
  depleting ring of dots around the tank (visual derived purely from the count). Stretch
  (still deterministic): directional depletion — remove the particle whose bearing is nearest
  the blast, computed from impact angle; cosmetic only, since all particles are equivalent.
- **Task 3.2 (L) `use_shield` action through the whole stack.** Extend the engine
  `PlayerAction` union (`shared/src/types/PlayerAction.ts:8-18`), the network action type
  (misnamed `NetworkFireAction`, `NetworkClient.ts:9-14`), and `submit_action` validation
  to accept it.
- **Task 3.3 (M) Referee turn-enforcement in `submit_action` — NON-OPTIONAL.** Today any
  client can submit an action on another player's turn. Adding a non-fire action without
  server-side turn validation ships an exploit. Enforce whose turn it is server-side as
  part of this slice.
- **Task 3.4 (S) Shield harness (NEW):** absorption + replay determinism of the new action.

---

## Cross-cutting (promote from "buried risks" per the red-team)

These touch Combat Depth's surface and should be handled in the relevant slice (or as
quick wins), NOT left implicit:

1. **`Infinity` ammo bug** — Slice 0 (prerequisite, above).
2. **`submit_action` has no turn enforcement** — a standing cheating hole *today*; fixed
   as Slice 3.3 (and worth doing even if Shield slips).
3. **Status-blind fetch in `NetworkClient`** (`submitAction` does `.then(res=>res.json())`
   with no `res.ok` check, `~:281`) — a non-JSON 5xx becomes a generic "network error" and
   the shot is silently lost. Add status handling when touching the fire path.
4. **Dead seq-conflict retry** (`NetworkClient.ts:~284` checks `'Seq conflict, retry'`;
   `submit_action` returns `'seq_conflict'` + `retry:true`) — one-line fix, **key off the
   machine field**, not the human string. Do it opportunistically.
5. **Doc reconciliation:** `SPEC §4.5` / `TASKS.md` claim only baby/missile/cluster are
   implemented (`heavy_missile`+`dirt_bomb` ship `implemented:true`); `TASKS.md` "current
   phase" still says MVP1. Update as weapons go live.

## Out of scope (deferred)

- **Shop / credits economy / score persistence.** Needs a `scores` table → DB migration →
  DB password (blocked). Inventory can ship with **fixed per-game loadouts** first;
  the shop is a downstream consumer once persistence is unblocked.
- The networking-resilience theme (turn-timeout, reconnect) — separate sprint; note it
  would have built the same `use_shield`-style action plumbing, so Slice 3 partly front-runs it.

## Sequencing & verification gates

```
Slice 0 (Infinity)  ──►  Slice 1 (ammo + nukes + strip + harness)   ◄── MVP
                              │
                              ├─►  Slice 2 (funky → napalm → bouncing_betty, one at a time)
                              │
                              └─►  Slice 3 (shield + referee turn-enforcement)
```

Each slice ships as its own barrier-first workflow ending in a green `npm run check`
(including its new harness) + `npm run build`, then a commit. Game-Feel (trajectory
preview, audio, touch) is client-only and may run in parallel on a second track without
touching any of these surfaces.

## Decisions (locked 2026-06-06)

1. **Ammo model:** explicit `unlimited` flag — inventory entry = `{ count, unlimited }`.
   Removes `Infinity` entirely. (Slice 0.)
2. **Starting loadout:** generous / sandbox — `baby_missile` unlimited, every other weapon
   `count: 9`. Lean on this to *feel* each weapon, then dial toward a balanced set later
   (keep counts as named tunable constants, not magic numbers scattered in logic).
3. **Bouncing Betty:** build it IN Slice 2 alongside `funky_bomb` + `napalm` — all three
   new-motion weapons land together; betty carries the surface-normal reflection physics.
4. **Shield:** a destructible particle force field — each particle blocks one blast
   (see Slice 3.1). Params tunable during build:
   - particle count (default `SHIELD_PARTICLES = 12`),
   - persists across turns until depleted (default: yes),
   - one blast strips one particle; multi-blast weapons strip several (default: yes),
   - directional depletion = cosmetic stretch.

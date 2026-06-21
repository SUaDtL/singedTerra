# Sprint spec — "SE-parity economy: UI exposure"

> Source: `.codearbiter/open-tasks.md` → `## Feature expansion` follow-ups owed from the
> `se-parity-economy` sprint (lines 80–82). The engine + network contract for interest,
> sudden-death, arms-level, and batteries already shipped (PR — commit 7552170) and are
> determinism-harness-validated. This sprint makes those four mechanics **reachable by a player**.
> Decided directions: CONTEXT.md CONFIRM-04 (gameplay-parity-first). Two scope forks resolved with
> the user at the spec gate (2026-06-21): **arms-level visual store gate = IN**; **scope = full
> hot-seat + networked**.

## Problem

Four SE-parity mechanics exist in the engine but have **no UI**: a player cannot set `interestRate`,
`suddenDeathTurn`, or `armsLevel` on a room, and cannot buy a Battery. They are dead features until
exposed. Additionally the networked transport has a **latent bug**: `NetworkClient` rebuilds the buy
action with `weapon` only, silently dropping `accessory` on the wire (`NetworkClient.ts:386, 410`),
so even a future battery UI would not work online.

## Scope

**In scope — three layers, hot-seat AND networked:**

### Layer 1 — Lobby room-creation controls (3 options)
Surface `interestRate`, `suddenDeathTurn`, `armsLevel` in BOTH duplicated option forms
(hot-seat `renderAdvanced` + networked `renderCreateForm`) and thread them end-to-end:
- Hot-seat: form state (`this.settings`/`SettingsState`) → `parseSettings` → `LobbySettings` →
  `main.ts createClient` GameEngine literal.
- Networked: form state → `RoomOptions` + create-room request body → **`create_room` Edge Function
  whitelist (additive)** → `emitNetworkReady` distribution → `LobbyConfig.settings` → `main.ts
  createClient` networked GameOptions literal. The host→all-clients distribution MUST carry identical
  values so every client builds an identical engine (determinism).
- Controls: `armsLevel` = a 0–4 `<select>` (matches the Max-players select pattern). `interestRate`
  + `suddenDeathTurn` = numeric fields (match the `onlineNumberField`/`numberField` pattern). Sensible
  bounds + defaults that preserve current behavior (interest 0, suddenDeath off, armsLevel 4).

### Layer 2 — Store generalization + Battery row
- **Generalize the buy callback** from `(weapon: WeaponType, tankId?) => void` to a structured
  descriptor `(purchase: { weapon?: WeaponType; accessory?: AccessoryType }, tankId?) => void`,
  mirroring `BuyAction`'s "exactly one of weapon/accessory" invariant. `main.ts` forwards it verbatim
  into `sendAction({ type: 'buy', ...purchase, tankId? })`.
- **Minimal accessory catalog:** add an `ACCESSORIES` record to `WeaponSystem.ts` alongside the
  existing battery constants — one entry `{ key:'battery', name, price, bundleSize, armsLevel, blurb }`
  sourced FROM `BATTERY_PRICE/BATTERY_BUNDLE_SIZE/BATTERY_POWER_PER_UNIT/BATTERY_ARMS_LEVEL` (single
  source of truth, no HUD-side duplication). The `AccessoryType` comment already declares this an
  extension point.
- **Render a Battery row** (price, +power-cap effect, owned/cap readout) in BOTH the PLAYER_TURN store
  and the ROUND_OVER between-rounds shop (engine supports `tankId`-targeted accessory buys).

### Layer 3 — NetworkClient accessory pass-through (bug fix)
Fix both buy-rebuild sites (`NetworkClient.ts` ROUND_OVER path ~386, PLAYER_TURN path ~410) to carry
`accessory` through to the `NetworkBuyAction`. Ships regardless of scope (latent correctness bug).

### Arms-level visual store gate (UI-only)
`HUD.setArmsLevel(n)` setter, called once from `main.ts` at game creation from the resolved
GameOptions (NO GameState/determinism change). Above-`armsLevel` weapon rows (and the Battery row when
`armsLevel < BATTERY_ARMS_LEVEL`) render disabled with a brief "Arms level N" reason in BOTH stores.
Default `armsLevel 4` ⇒ nothing disabled (full back-compat).

**Out of scope (explicit boundary):**
- Any engine/physics change, any change to the determinism contract, or new `GameState` fields. The
  arms-level gate is fed via a UI-only setter, NOT through `GameState`.
- Backend **redeploy** (`npm run deploy:backend`) for the additive `create_room` + battery referee
  shapes — code lands in-sprint; the deploy is an OPS step flagged in the Receipt (per user steer).
- New accessories beyond Battery (parachute/fuel) — the `ACCESSORIES` record leaves the seam.
- Visual polish / theming beyond matching the shipped `theme.ts` look of existing controls/rows.

## Acceptance criteria

DOM wiring is verified by `npm run typecheck` + `npm run check` + a flagged manual playtest; the
testable *logic* seams below each map to a `tdd` obligation. Harnesses are appended to the
`npm run check` chain (house style: inline-pinned expected values).

### AC1 — create_room additive option coercion (Deno test)
1. With `interestRate`/`suddenDeathTurn`/`armsLevel` present + valid, `storedOptions` carries them
   (coerced/clamped: armsLevel integer 0–4; interestRate finite ≥0; suddenDeathTurn integer ≥0).
2. Back-compat: with all three absent, `storedOptions` is byte-identical to today (no new keys).
3. Invalid values (out-of-range armsLevel, negative/NaN) are coerced to a safe default or omitted —
   never stored raw, never a 500.

### AC2 — accessory catalog ↔ constants parity (`scripts/checks/accessories.mjs`)
4. The `ACCESSORIES.battery` entry's `price`/`bundleSize`/`armsLevel` equal `BATTERY_PRICE`/
   `BATTERY_BUNDLE_SIZE`/`BATTERY_ARMS_LEVEL` exactly (drift guard — a future constant edit can't
   desync the store label).
5. `AccessoryType` ⊇ every `ACCESSORIES` key (the catalog can't name an unknown accessory).

### AC3 — buy descriptor + network pass-through (extend existing coverage)
6. A `BuyAction` built from the new descriptor with `accessory:'battery'` (no weapon) applies the
   battery in the engine (reuse the `batteries.mjs` engine assertions — do not duplicate).
7. The `NetworkBuyAction` for a battery survives `replayNetworkAction` and raises `powerCap`
   (`batteries.mjs` check 5 already covers replay; add a focused assertion that an accessory-only
   network buy is NOT reduced to a no-op when rebuilt — guards the Layer-3 fix).
8. Determinism: a same-seed engine driven `[buy battery → high-power fire]` via the descriptor path is
   byte-identical to the direct-action path.

### AC4 — options reach the engine (round-trip)
9. A GameOptions object carrying the three fields, built the way `createClient` builds it, produces an
   engine whose `interestRate`/`suddenDeathTurn`/`armsLevel` match (and survive `clone()` — already
   asserted in the engine harnesses; add a build-path assertion if not covered).

### AC5 — typecheck + manual playtest gate (flagged, not automatable here)
10. `npm run typecheck` + `npm run build` + `npm run check` all green.
11. Manual playtest owed (Receipt): (a) hot-seat — set armsLevel low, confirm above-level weapon rows
    disabled in both stores + a battery is buyable and extends range; (b) networked 2-browser — host
    sets the 3 options, both clients build identical engines (no desync) + a battery buy applies on
    both; (c) interest visibly accrues in the ROUND_OVER shop.

## Determinism & risk notes

- **The central constraint is untouched:** no engine/physics edits. The only determinism-sensitive
  surface is *distribution* — the networked path MUST deliver identical option values to every client
  (host included) via `emitNetworkReady`/`LobbyConfig`. A client building from a different source than
  the rest = desync. The plan threads ALL paths through the single `config.settings` carrier.
- **Edge Function change is additive + back-compat:** `create_room` gains three optional coerced
  fields; existing rooms/payloads are byte-identical. Redeploy is the flagged ops step.
- **Duplicated forms are a maintenance trap:** hot-seat and networked option forms are separate
  (different state, parsing, controls). Each new control is added twice; the plan has explicit tasks
  for both so neither is missed.
- **No new secrets/auth/crypto/migration** — no hard-gate surface anticipated. The only ops gate is
  the (non-autonomous) redeploy, deferred to the Receipt.

## Open questions

_None._ Both scope forks resolved at the spec gate (arms-level visual gate IN; full hot-seat +
networked). Tuning bounds/defaults for the new controls are named constants, playtest-tunable.

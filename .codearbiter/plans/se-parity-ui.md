# Plan — "SE-parity economy: UI exposure"

Spec: `.codearbiter/specs/se-parity-ui.md`. Status ledger (the column is the source of truth on
resume): `TODO` → `IN-PROGRESS` → `ACCEPTED`. Tasks are ordered; dependencies flagged. MVP slice =
**A + B + D** (hot-seat: all 3 toggles + battery buyable). C/E add networked; F adds the arms gate.

| # | Task | Files | Verify (→ AC) | Status |
|---|------|-------|---------------|--------|
| **Slice A — shared foundation** |||||
| A1 | Add an `ACCESSORIES` record (one `battery` entry) sourced FROM the existing `BATTERY_*` constants — single source of truth for store label/price/bundle/armsLevel. | `shared/src/engine/WeaponSystem.ts` | typecheck → AC2 | TODO |
| A2 | New harness `accessories.mjs`: assert `ACCESSORIES.battery` price/bundle/armsLevel == `BATTERY_*` consts, and every `ACCESSORIES` key ∈ `AccessoryType`. Append to `npm run check` chain in `package.json` (chain is hardcoded, not a glob). | `scripts/checks/accessories.mjs`, `package.json` | `npm run check` → AC2 (4,5) | TODO |
| **Slice B — store generalization + battery row (hot-seat works end-to-end)** |||||
| B1 | Generalize `buyCb` type + `onBuy` to a structured descriptor `(purchase:{weapon?:WeaponType;accessory?:AccessoryType}, tankId?)`. Update existing weapon-row click handlers to pass `{weapon:type}`. | `client/src/ui/HUD.ts` | typecheck | TODO |
| B2 | Render a Battery row from `ACCESSORIES` in BOTH the PLAYER_TURN store grid and the ROUND_OVER shop grid; owned/cap readout (`powerCap`) + affordability sync in `syncStore`/`syncRoundOver`; click → `buyCb({accessory:'battery'}, tankId?)`. | `client/src/ui/HUD.ts` | typecheck + manual → AC5 | TODO |
| B3 | Update the `hud.onBuy` registration to forward the descriptor: `sendAction({type:'buy', ...purchase, ...(tankId?{tankId}:{})})`. | `client/src/main.ts` | typecheck; hot-seat engine path → AC3 (6,8) | TODO |
| **Slice C — networked accessory pass-through (latent bug fix)** |||||
| C1 | Fix both `NetworkClient` buy-rebuild sites to carry `accessory` into the `NetworkBuyAction` (ROUND_OVER ~386, PLAYER_TURN ~410). | `client/src/client/NetworkClient.ts` | typecheck | TODO |
| C2 | Add a focused assertion (in `batteries.mjs`) that an accessory-only network buy is NOT reduced to a no-op when rebuilt + replayed (guards C1). Reuse existing replay coverage; don't duplicate. | `scripts/checks/batteries.mjs` | `npm run check` → AC3 (7) | TODO |
| **Slice D — lobby toggles, hot-seat** |||||
| D1 | Add 3 controls to the hot-seat advanced form: `armsLevel` 0–4 `<select>`; `interestRate` + `suddenDeathTurn` numeric fields (reuse `numberField`). Extend `SettingsState` + bounds consts + `parseSettings`. | `client/src/ui/Lobby.ts` | typecheck | TODO |
| D2 | Extend the `LobbySettings` carrier with the 3 fields; thread them into the hot-seat `createClient` GameEngine literal. | `client/src/ui/Lobby.ts`, `client/src/main.ts` | typecheck + round-trip → AC4 (9) | TODO |
| **Slice E — lobby toggles, networked + Edge Function** |||||
| E1 | Add the same 3 controls to the networked `renderCreateForm` (reuse `onlineNumberField` + a select); add state fields; include them in `RoomOptions` + the create-room request `options` body (back-compat spreads). | `client/src/ui/Lobby.ts` | typecheck | TODO |
| E2 | **Additive** coercion in `create_room`: destructure + validate/clamp the 3 fields (armsLevel int 0–4; interestRate finite ≥0; suddenDeathTurn int ≥0) into `storedOptions`. Back-compat byte-identical when absent. | `supabase/functions/create_room/index.ts` | Deno test → AC1 | TODO |
| E3 | Deno test cases for E2 (present→stored, absent→identical, invalid→safe). Co-locate with the function's test pattern (mirror `submit_action/validate.test.ts` if present; else add minimal). | `supabase/functions/create_room/*.test.ts` (+ `_shared` as needed) | `deno test` → AC1 | TODO |
| E4 | Thread the 3 fields through the networked distribution so every client builds an identical engine: `emitNetworkReady` → `LobbyConfig.settings` → networked `createClient` GameOptions literal; also `waitingOptions` + the realtime payload type. | `client/src/ui/Lobby.ts`, `client/src/main.ts` | typecheck + round-trip → AC4 (9) | TODO |
| **Slice F — arms-level visual store gate (UI-only)** |||||
| F1 | `HUD.setArmsLevel(n)`: store it; in `syncStore`/`syncRoundOver` disable above-`armsLevel` weapon rows + the Battery row when `armsLevel < BATTERY_ARMS_LEVEL`, with a brief "Arms level N" reason. Default 4 ⇒ nothing disabled. Needs each weapon's `armsLevel` (from `WEAPONS`). | `client/src/ui/HUD.ts` | typecheck + manual → AC5 | TODO |
| F2 | Call `hud.setArmsLevel(...)` once at game creation from the resolved GameOptions, both hot-seat + networked paths. | `client/src/main.ts` | typecheck + manual | TODO |
| **Final** |||||
| Z1 | Full green: `npm run typecheck` + `npm run build` + `npm run check` (+ `deno test` for E3). Assemble Receipt; flag the OPS redeploy (`npm run deploy:backend` for create_room + battery referee) + the 2-browser manual playtest. | — | AC5 (10,11) | TODO |

## Notes
- **Dependency order:** A → B → (C, D) → E → F → Z. B3 makes hot-seat batteries live (HotSeatClient
  passes actions straight to the engine). C is independent of B but needed for networked batteries.
- **MVP slice (A+B+D):** a player can, in hot-seat, set all three options and buy a Battery. Smallest
  coherent shippable; E (networked) + F (arms gate) are increments under the same autonomy.
- **No hard-gate surface anticipated.** Only ops gate = the redeploy, deferred to Z1's Receipt (not
  auto-run). If E2/E3 surface an auth/validation trust-boundary question, that halts per sprint rules.
- `package.json` check chain is a hardcoded `&&` list — A2's harness MUST be appended or it never runs.

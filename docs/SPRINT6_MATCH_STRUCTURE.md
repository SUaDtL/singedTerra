# Sprint Plan — V1 Match Structure (rounds, scoreboard, persistence)

> Started 2026-06-07. Follows the completed Sprint 5 art overhaul (archived). Turns the
> game from a single one-off skirmish into a **best-of-N match** with a scoreboard. This
> is the highest-value V1 gameplay cluster (see `docs/TASKS.md`): it unblocks the
> between-rounds shop and a persistent scoreboard.

> **Status (2026-06-07):** Slices 1 (round core), 2 (scoreboard + hot-seat rounds
> control), and 4 (between-rounds shop via the `ROUND_OVER` phase) are DONE and
> committed. Slice 3 (networked best-of-N) and Postgres score persistence are
> **CODED, harness-green, and DEPLOYED to production (2026-06-07)** — the client is on
> Netlify (`inspiring-rolypoly-eaaf1e`, `npm run deploy`) and all edge functions + the
> `003_match_scores` migration are on Supabase (`jdvxfxjpobtyasozxauh`). 16 engine
> harnesses + typecheck + build all green; both edge fns `deno check`/`lint` clean.
> **The only remaining Sprint 6 item is a live 2-browser networked playtest.** (The
> working tree is still UNCOMMITTED — git is behind what's live.) Hot-seat best-of-N
> with a between-rounds shop is fully playable, and networked best-of-N + score
> persistence are now live end-to-end.
>
> **What changed for the bundle (uncommitted, ready to deploy):**
> - `shared/src/net/replay.ts` (NEW): the canonical `NetworkAction` union + pure
>   `replayNetworkAction()` — one source of truth for log→engine replay, now shared by
>   `NetworkClient` and the new harness (no more client-only copy).
> - `scripts/checks/netrounds.mjs` (NEW, 16th harness): proves the round boundary
>   (fire→next_round) and per-tank ROUND_OVER buys replay in lockstep through the
>   shared path, and that `next_round` re-seats the opener even when the opener fired
>   the killing blow.
> - `NetworkClient.ts`: `next_round` + per-tank ROUND_OVER buys now LOGGED through the
>   referee (was a no-op); `flushPendingActions` drains in `ROUND_OVER`; a `roundOver`
>   flag + `computeNextSeat` (reports the round-end + opener seat) are sent to the
>   referee; `finish_game` now carries the final scoreboard.
> - `supabase/functions/submit_action`: accepts `next_round`, carries `tankId` on a
>   buy, and uses `roundOver` to (a) relax the turn gate for shop actions and (b) honor
>   the reported opener seat unconditionally at a round boundary.
> - `supabase/functions/finish_game` + `supabase/migrations/003_match_scores.sql`:
>   persist final standings (one row per match, public-read / service-write RLS).
>
> Both edge functions pass `deno check` + `deno lint` clean (deno 2.8.2 at
> `C:\Users\brenn\.deno\bin\deno.exe`, not on PATH — call by full path). They are NOT
> unit-tested (handlers wrap `Deno.serve`/`getServiceClient`; testing the gating logic
> would need extracting it into a pure function — a reasonable follow-up). The genuine
> remaining risk is the cross-client lockstep, which only the 2-browser playtest covers.
>
> **The deploy bundle (run all three, then 2-browser playtest):**
> `npx supabase db push` (003 migration) · `npx supabase functions deploy submit_action`
> · `npx supabase functions deploy finish_game`. `create_room` already stores `rounds`
> (Slice 3 earlier), so it only needs redeploy if not already live.

## Goal

A match is **best-of-N rounds**. Each round is a full skirmish on fresh terrain; the first
tank to clinch ⌈N/2⌉ round wins takes the match. Credits and purchased inventory **carry
between rounds** (so the economy compounds and the between-rounds shop has teeth), while
health, shield, fuel, and positions reset each round.

**Guiding star:** the round transition must be a *pure deterministic function of (seed, round
number, action log)* — so networked lockstep replays it identically on every client with NO
new action type and NO edge-function change. Determinism is the hard constraint (CLAUDE.md).

## Decisions (defaulted — confirm on review, per the Sprint 5 convention)

- **D1 — `GameOptions.rounds`.** Default **1** → single round = today's exact behavior
  (full back-compat; every existing harness stays green). Configurable odd N (3, 5, …).
- **D2 — Match win.** First to clinch **⌈N/2⌉** round wins ends the match early. If all N
  rounds are played without a clinch (only reachable via mutual-kill draws), match winner =
  most round wins; an exact tie → draw (`winner = null`).
- **D3 — Carry between rounds.** Credits **carry**, purchased inventory **carries**, round
  wins accumulate. Health → 100, shieldHp → 0, fuel → default, position → re-placed on the
  new terrain, angle/power/selectedWeapon → defaults, all tanks `alive` again.
- **D4 — Per-round terrain.** Regenerated from a seed **derived** from the base seed + round
  index (`roundSeed = (seed + round*0x9E3779B1) >>> 0`), so it differs each round yet every
  client computes the identical terrain. Wind RNG re-seeded from the same derived seed.
- **D5 — No new phase in Slice 1.** Round advance is automatic inside `resolve()` (like the
  existing turn advance). The client shows a round-transition banner by detecting the
  `round` counter / `lastRoundWinnerId` change (same dedup trick as `lastExplosion`). A
  `ROUND_OVER` pause + between-rounds shop is Slice 3.

## Slice 1 — Round-system core (engine + harness)  ◄ this slice

- **Types.** `GameOptions.rounds?`. `GameState`: `round` (1-based), `totalRounds`,
  `lastRoundWinnerId: string|null`. `TankState`: `roundWins`. `createTank`/`Tank.create`
  seed `roundWins: 0`.
- **Engine.** Store base `seed` + `totalRounds`. Rewrite the `alive<=1` branch of
  `resolve()`: record the round result (winner's `roundWins++`, set `lastRoundWinnerId`),
  then either end the match (`GAME_OVER`, compute match winner) or `startNextRound()`.
  `startNextRound()` regenerates terrain from the derived seed, re-places tanks carrying
  credits/inventory/roundWins, resets combat state, re-seeds + draws wind, bumps
  `terrainVersion`, sets `PLAYER_TURN`.
- **Harness `scripts/checks/rounds.mjs`** (14th) asserts: back-compat single round;
  best-of-3 advances instead of ending; credits carry + health resets + terrain changes;
  full multi-round determinism (two engines, same log → identical state); match clinch at 2
  wins; fresh-engine replay reproduces `round`/`roundWins`/`activePlayerId` (networked
  agreement).
- **Verify.** `npm run check` green (14 harnesses); `npm run build` green.

## Slice 2 — Scoreboard (engine data + HUD)

- Per-tank `kills` + `totalDamage` accumulated in the blast path; surfaced in `GameState`.
- HUD: round indicator ("Round 2 of 3"), per-player round-win pips, an end-of-round and
  end-of-match scoreboard panel — themed to `client/src/ui/theme.ts` (Sprint 5 baseline).

## Slice 3 / follow-on — Between-rounds shop + persistence

- A `ROUND_OVER` phase + `next_round` action giving a deliberate shopping pause between
  rounds (this DOES touch `submit_action` — needs a redeploy; coordinate via the Supabase
  CLI, see the `supabase-cli-deploy` note).
- Supabase Postgres: session-keyed match scores persisted at `GAME_OVER`.
- A live 2-browser networked playtest to confirm multi-round lockstep sync end-to-end (also
  retires the standing P1-6b/P3-16/P3-13b visual-verification debt).

## Non-negotiables (carried from prior sprints)

- **Determinism is a hard requirement.** No wall-clock, no `Math.random()` in the round
  transition; per-round seed is derived arithmetically. `npm run check` must stay green.
- **REVIEW-BEFORE-COMMIT:** no commit/push without an explicit ask.
- Test-first: the `rounds.mjs` harness is written before the engine change and must fail
  for the right reason before it passes.

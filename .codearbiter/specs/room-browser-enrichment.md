# Spec: Room-browser row enrichment (match-shape metadata)

**Status:** drafted 2026-06-22 · awaiting approval · route → `tdd`
**Slug:** `room-browser-enrichment` · **Type:** `feat` · **Stage:** 1

## Problem

A player browsing public rooms (the existing Lobby `browse` sub-view) sees only the
host name and `playerCount/maxPlayers`. They cannot tell a single-round basic duel from a
best-of-7 full-arsenal brawl, nor whether the open seats are real (human-joinable) or the
lobby is mostly CPU. They pick a room blind and discover the match shape only after joining.

**Caller:** a human in the Lobby `browse` view, choosing which public room to join.
**Done looks like:** each browse row shows the match length (best-of-N), the arms tier, and
how many seats are bots — enough to choose a room without joining it first.

## Scope

**In:**
- Surface on each `list_rooms` room object and each browse row: `rounds` (best-of-N),
  `armsLevel` (arms tier), and `botCount` (count of live roster seats with `ai` set).
- Declare the already-persisted economy fields on the `StoredOptions` type so the read path
  compiles (`armsLevel`, `interestRate`, `suddenDeathTurn` are written by
  `coerceEconomyOptions` today but undeclared).
- Add the first `list_rooms` output-shape Deno test (the 2026-06-21 checkpoint flagged
  `list_rooms` as untested).

**Out of scope (explicit boundary):**
- No change to `create_room` logic or the client create-form — `armsLevel` is **already**
  persisted and sent today; this feature only *reads it back*.
- No new SQL migration — `options` is a JSONB column; the fields already live in it.
- Do **not** surface `status` — `list_rooms` only ever returns `status='waiting'`, so it
  would be a constant column (the original backlog wording asked for it; dropping it is
  correct, not a cut).
- Do not surface `interestRate` / `suddenDeathTurn` in the UI this pass (declared on the
  type for honesty; surfacing them is a possible later polish — see Open questions).
- No determinism-engine change; `shared/` is untouched. Does not contradict the
  CONTEXT.md NOT-building list (no accounts, ranking, native app, or monetization).

## Display decisions (baked in, not deferred)

- **Back-compat default** for a pre-feature room whose `options` omits a field:
  `rounds` → `1`, `armsLevel` → `4` (the `GameOptions` defaults — single round, full
  arsenal). A missing field never renders blank or `NaN`.
- **Arms-level label** mapping (pure function `armsLabel(n)`): `0 → "Basic"`,
  `4 → "Full arsenal"`, otherwise `"Arms Lv {n}"`. Out-of-range clamps into 0–4 first.
- **Rounds label** (`roundsLabel(n)`): `1 → "Single"`, else `"Best of {n}"`.
- **Bot label** (`botLabel(c)`): `0 → ""` (omitted), else `"{c} CPU"`.

## Acceptance criteria

Each is one `tdd` Phase-1 obligation; each is verifiable by a single test.

1. **`rounds` in output** — `list_rooms` maps a room with stored `options.rounds = 5` to a
   response room object with `rounds: 5`. *(Deno test)*
2. **`armsLevel` in output** — a room with stored `options.armsLevel = 2` maps to a response
   object with `armsLevel: 2`. *(Deno test)*
3. **`botCount` in output** — a room whose live (post-reap) roster has exactly 2 seats with
   `ai` set and 1 without maps to `botCount: 2`. *(Deno test)*
4. **Back-compat defaults** — a room whose `options` omits `rounds` and `armsLevel` maps to
   `rounds: 1` and `armsLevel: 4`. *(Deno test)*
5. **`StoredOptions` declares the fields** — `StoredOptions` carries `armsLevel?`,
   `interestRate?`, `suddenDeathTurn?` (all `number`), so `list_rooms` reads
   `row.options.armsLevel` with no type error; `deno check` / `npm run typecheck` is green.
   *(typecheck gate)*
6. **`armsLabel(n)`** pure mapper — `armsLabel(0)==="Basic"`, `armsLabel(4)==="Full arsenal"`,
   `armsLabel(2)==="Arms Lv 2"`, and out-of-range inputs clamp into 0–4 before labeling.
   *(tsx harness, wired into `npm run check`)*
7. **`roundsLabel(n)` / `botLabel(c)`** pure mappers — `roundsLabel(1)==="Single"`,
   `roundsLabel(5)==="Best of 5"`, `botLabel(0)===""`, `botLabel(2)==="2 CPU"`.
   *(tsx harness, wired into `npm run check`)*
8. **`BrowseRoom` carries the fields** — the client `BrowseRoom` interface includes
   `rounds`, `armsLevel`, `botCount`, and `fetchRooms` reads them off the response; client
   `typecheck` is green. *(typecheck gate)*

**Manual verification (no DOM unit harness exists — flagged, not a unit AC):** in a running
client, a browse row visibly shows the rounds label, arms label, and CPU count (when > 0),
with a legacy room rendering "Single" / "Full arsenal" and no blank fields. The *label logic*
behind this is fully covered by AC 6–7; only the DOM insertion is manual.

## Files in play

- `supabase/functions/_shared/mod.ts` — extend `StoredOptions` (AC5).
- `supabase/functions/list_rooms/index.ts` — output mapping + defaults (AC1–4).
- `supabase/functions/list_rooms/list_rooms.test.ts` *(new)* — output-shape Deno test (AC1–4).
- `client/src/ui/browseLabels.ts` *(new, pure, no DOM import)* — `armsLabel`/`roundsLabel`/
  `botLabel` (AC6–7), so a `.mjs` harness can import it.
- `scripts/checks/browselabels.mjs` *(new)* — harness for AC6–7; **must be appended to the
  `npm run check` `&&`-chain in `package.json`** (the check script is a hardcoded chain, not
  a glob — an unwired harness silently never runs).
- `client/src/ui/Lobby.ts` — `BrowseRoom` interface (AC8) + `renderBrowse` row (manual AC).

## Deploy / ops note (owed to the USER, not this branch)

`list_rooms` must be redeployed (`npm run deploy:backend` or
`npx supabase functions deploy list_rooms`) for the enriched output to reach clients. The
write path (`create_room`) is unchanged, so no migration and no `create_room` redeploy.

## Open questions

None blocking. One possible-later (`[NEEDS-TRIAGE]`, not a `CONFIRM`): surfacing
`interestRate` / `suddenDeathTurn` on the browse row too, now that the type declares them.

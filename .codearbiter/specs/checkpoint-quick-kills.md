# Sprint spec — checkpoint-quick-kills

**Created:** 2026-06-21
**Source:** the 6-reviewer checkpoint sweep `.codearbiter/checkpoints/2026-06-21.md`; the 8 findings
tagged **(quick-kill → sprint)** in `.codearbiter/open-tasks.md`.
**Mode:** `/ca:sprint` (autonomous). Premium subagent path.

## Goal

Clear the unambiguous, deterministic-safe, no-backend-deploy, no-new-migration subset of the
checkpoint findings in one autonomous pass: one real security fix (stored XSS), two
supply-chain/tooling pins, two low-risk hardening edits, and three engine test-coverage additions.

## Scope (8 tasks)

1. **[SECURITY HIGH] Stored XSS in the networked scoreboard.** `client/src/ui/HUD.ts`
   `buildScoreboard` sets `el.innerHTML = head + rows` where the per-row `name`
   (`${t.ai ? '🤖 ' : ''}${t.playerName}`) embeds a peer-controlled `playerName` (server-validated
   only for non-empty / len ≤ 20 / unique). HTML-escape `playerName` before interpolation (or build
   the name cell via `document.createElement` + `.textContent`). **Also audit the sibling render
   `HUD.playerLabel()` (line ~1029) and any other `playerName` sink** — confirm each lands in
   `textContent`, not `innerHTML`; fix any that don't. The numeric/header cells are not user data and
   need no change.

2. **[HIGH tooling] Pin `tsx`.** Add `tsx` (`^4.19.0`) to root `package.json` `devDependencies` so
   the `npm run check` harnesses (which invoke `npx tsx`) resolve a lockfile-pinned version instead of
   an ad-hoc network resolution. Run `npm install` to update the lockfile.

3. **[MEDIUM] Pin the Deno Supabase import.** `supabase/functions/_shared/mod.ts:13` —
   `@supabase/supabase-js@2` → `@2.107.0` (the currently-resolved version). Source-only edit; no
   deploy in this sprint.

4. **[LOW] Disable the stray local-dev auth scaffold.** `supabase/config.toml` (`[auth]` block,
   ~lines 29-38) — set `enabled = false` (and/or `enable_signup = false`) to match the documented
   no-auth design. Local-config only; not applied to prod by this sprint.

5. **[LOW] Stop logging the identity token.** `client/src/client/NetworkClient.ts:370` — drop or
   truncate `this.playerId` in the `console.error` argument (keep the diagnostic, lose the full token).

6. **[MEDIUM coverage] `clamp()` NaN-preservation harness.** Add `scripts/checks/math.mjs` asserting
   `clamp` over: in-range passthrough, below-lo → lo, above-hi → hi, the two inclusive boundaries, and
   the intentional `NaN → NaN` passthrough plus `±Infinity` clamping. Wire it into the `package.json`
   `check` `&&`-chain.

7. **[MEDIUM coverage] `shouldBufferSeq` extreme-value boundary.** Extend the EXISTING
   `scripts/checks/resync_guard.mjs` with the case it lacks — `Infinity` / very-large seq gaps (and
   negative-seq safety). Do NOT duplicate the already-present `seq==nextExpected` (Check B/D) or
   one-behind (Check D) assertions; add one new check block. Already wired into the chain.

8. **[MEDIUM coverage] `createRng` determinism harness.** Add `scripts/checks/random.mjs` asserting:
   same seed → byte-identical sequence (call twice); two distinct finite seeds diverge; every draw is
   in `[0, 1)`; edge seeds (`NaN`, `±Infinity`, `> 2^32`, negative, fractional) produce a stable,
   reproducible sequence (the documented `hashSeed` non-finite → `0x9e3779b9` fold means `NaN` and
   `Infinity` legitimately coincide — assert reproducibility/range, not distinctness, for those). Wire
   it into the `check` chain.

## Acceptance criteria

- AC1: A `playerName` containing HTML metacharacters (e.g. `<svg/onload=alert(1)>`) renders as inert
  literal text in the scoreboard — no element is created from it; no `playerName` reaches an
  `innerHTML` sink anywhere in `HUD.ts`.
- AC2: `tsx` appears in root `devDependencies` and in the lockfile; `npm run check` still runs green.
- AC3: `_shared/mod.ts` imports `@supabase/supabase-js@2.107.0` (exact pin); typecheck clean.
- AC4: `supabase/config.toml` `[auth] enabled = false`.
- AC5: `NetworkClient.ts:370` no longer logs the full `playerId`.
- AC6: `scripts/checks/math.mjs` exists, passes, and is in the `check` chain.
- AC7: `scripts/checks/resync_guard.mjs` has a new extreme-value block and passes.
- AC8: `scripts/checks/random.mjs` exists, passes, and is in the `check` chain.
- AC9 (regression): all pre-existing harnesses + the 57 Deno cases (`npm run check:edge`) stay green —
  determinism unbroken; `npm run typecheck` clean; no secrets introduced.

## Explicitly EXCLUDED (remain as tasks in open-tasks.md)

- All migration-005 items (lock_timeout, PUBLIC-grant guard, RLS-comment reword, data-classification)
  — committed migrations are immutable; these need a new migration + backend deploy.
- The Edge Function unit-test suites (finish_game / join_room / ready_up / leave_room / restart_game /
  create_room / heartbeat / list_rooms / update_player) — Deno test infrastructure, larger effort.
- `http-proxy-middleware` bump, `iceberg-js` phantom removal, extraneous `server` workspace cleanup —
  lockfile surgery with uncertain transitive outcomes.
- Lobby `p.color` server-side validation — requires an Edge Function deploy.
- `replay.ts` edge-case harness — deferred (not in the quick-kill 8).
- Both decision forks: CONFIRM-04 (rate-limiting posture), CONFIRM-05 (ADR adoption).

## Risk / autonomy notes

- The XSS fix is a trust-boundary security change → **hard-gate-adjacent**. It does not bypass any
  control (it ADDS escaping), so it proceeds, but the commit-gate secrets/security pass must confirm
  it and the change is called out in the receipt.
- Tasks are mutually independent (different files) — order is by value: XSS first, then pins, then
  harnesses. No task depends on another's output except the two `check`-chain appends.
- Deterministic-safe by construction: no engine logic changes; `math.mjs`/`random.mjs` only OBSERVE
  existing functions. The determinism harnesses are the regression backstop.

# Plan — checkpoint-quick-kills

Spec: `.codearbiter/specs/checkpoint-quick-kills.md`. Each task is 2–5 min, carries its file path(s)
and a concrete verification mapped to an acceptance criterion. `status`: PENDING → ACCEPTED (the
ledger; an interrupted sprint re-enters on the first non-ACCEPTED row).

MVP slice = T1 (the security fix). T2–T8 are independent hardening/coverage.

| # | Task | File(s) | Verification | AC | status |
|---|------|---------|--------------|----|--------|
| T1 | Escape `playerName` in `buildScoreboard` (escape-before-interpolate or `textContent` name cell); audit `playerLabel()` + any other `playerName` sink, fix non-`textContent` ones | `client/src/ui/HUD.ts` | typecheck clean; manual reason-through: a `<svg/onload>` name renders inert; grep confirms no `playerName` in an `innerHTML` string | AC1 | ACCEPTED |
| T2 | Add `tsx@^4.19.0` to root `devDependencies`; `npm install` | `package.json`, `package-lock.json` | `tsx` present in both; `npm run check` green | AC2 | ACCEPTED |
| T3 | Pin `@supabase/supabase-js@2` → `@2.107.0` | `supabase/functions/_shared/mod.ts:13` | grep shows exact pin; `npm run typecheck` clean | AC3 | ACCEPTED |
| T4 | `[auth] enabled = false` (and `enable_signup = false`) | `supabase/config.toml` | grep shows `enabled = false` in `[auth]` | AC4 | ACCEPTED |
| T5 | Drop/truncate `this.playerId` in the `console.error` arg | `client/src/client/NetworkClient.ts:370` | line no longer passes the full `playerId`; typecheck clean | AC5 | ACCEPTED |
| T6 | New harness `math.mjs` (clamp: in-range, lo, hi, both boundaries, NaN→NaN, ±Inf); append to `check` chain | `scripts/checks/math.mjs`, `package.json` | `npx tsx scripts/checks/math.mjs` exits 0; present in `check` | AC6 | ACCEPTED |
| T7 | Extend `resync_guard.mjs` with an extreme-value block (Infinity, large gap, negative-seq safety) — no duplicate of B/D | `scripts/checks/resync_guard.mjs` | `npx tsx scripts/checks/resync_guard.mjs` exits 0 with the new block | AC7 | ACCEPTED |
| T8 | New harness `random.mjs` (same-seed-identical, distinct-seeds-diverge, range `[0,1)`, edge seeds reproducible); append to `check` chain | `scripts/checks/random.mjs`, `package.json` | `npx tsx scripts/checks/random.mjs` exits 0; present in `check` | AC8 | ACCEPTED |
| V | Full regression | — | `npm run check` green (all harnesses incl. 3 new), `npm run check:edge` green, `npm run typecheck` clean | AC9 | ACCEPTED |

## Dependencies / ordering

- T1 first (MVP, security).
- T2 should land before V so the new harnesses run under the pinned `tsx`.
- T6 and T8 each touch `package.json`'s `check` string AND T2 touches `package.json`'s
  `devDependencies` — same file, different keys. Sequence the `package.json` edits (T2 → T6 → T8) to
  avoid a stale-edit collision; or apply all three `package.json` changes in one coordinated edit.
- T3/T4/T5/T7 are fully independent.

## Test-first note (tdd)

T6/T8 ARE the tests (new harnesses) — they are written to pass against the existing, already-correct
`clamp`/`createRng`, so they are characterization tests, not red-first feature tests. T7 adds
assertions to an existing harness. T1/T3/T4/T5 are small corrective edits whose verification is
typecheck + targeted grep + the regression suite; T1 additionally carries the AC1 inert-render check.

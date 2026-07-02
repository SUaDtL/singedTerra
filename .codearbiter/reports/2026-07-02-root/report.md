# Tribunal report — 2026-07-02-root

Projection of the run logs. Regenerated from `findings/*/*.json` + `triage.jsonl`, not hand-authored.

- **Scope:** repository root, commit `aace04b`
- **Models:** orchestrator + Wave 1 (appsec, architecture, reliability) on Opus 4.8; Waves 2 to 3 on Sonnet 5
- **Tokens:** Phase 0 estimate band 2.3M to 9.0M; lens actual sum ~853k (excludes orchestrator overhead). The crude estimate over-predicted: small repo, three lenses filed 0 after real inspection.
- **Lenses:** 11 launched, 0 skipped. `test-fidelity`, `performance` clean (0 findings). Determinism core verified clean by reliability.

Findings written: 23. Fileable (keep/combine): 14 issues (after 2 combines). Investigate (not filed): 7.

## Blocking-severity note

Critical and high findings are blocking-severity: work that should block shipping the affected code. This lane is not itself a gate and blocks nothing. Nothing is filed until you select and authorize it in Phase 5.

## Findings (calibrated severity)

### CRITICAL

- **appsec-001** · `supabase/migrations/001_init.sql:56-76`, `supabase/functions/submit_action/validate.ts:236-269`, `client/src/client/NetworkClient.ts:682-712` · The secret `playerId` identity token is world-readable through the `anon USING(true)` SELECT on `rooms.players` plus Realtime, so any anon-key holder reads every seat's token and impersonates other humans, defeating the referee's anti-impersonation gate (the documented load-bearing control). · **Fix shape:** split the auth token out of the client-readable `players` array (secret in a service-only column/table, or expose a column-projected VIEW to anon); touches ADR-0006, resolve identity model via `/ca:adr`. · decision: keep · [plan](plans/phase-1.md)

### HIGH

- **migration-001** · `supabase/migrations/007_apply_room_reap.sql:26-35`, `supabase/functions/ready_up/index.ts:79-82` · `apply_room_reap`'s DELETE and UPDATE lack a `status='waiting'` guard; a room that flips to active in the list_rooms snapshot-to-RPC window can be deleted (cascading to `room_actions`, destroying the canonical action log) or have its roster clobbered. · **Fix shape:** add `AND status='waiting'` to both statements (new migration, not an in-place edit) and `.eq('status','waiting')` to the ready_up write. Effort S. · decision: keep · [plan](plans/phase-2.md)

### MEDIUM

- **architecture-001** · `client/src/ui/Lobby.ts:169-2201` · God module (2217 LOC) fuses view, 7 raw edge-fn fetches, Realtime lifecycle, polling, and validation. · Extract a lobby transport/session module mirroring the NetworkClient seam; move validation to a pure module. · decision: keep · [plan](plans/phase-1.md)
- **architecture-005** · `shared/src/engine/GameEngine.ts:712-942` · `tick()` is a ~230-LOC method in the hard-determinism core; per-phase determinism cannot be harness-asserted in isolation. · Behavior-preserving decomposition into named per-phase methods via `/ca:refactor`. · decision: keep · [plan](plans/phase-1.md)
- **hud-decomposition** (architecture-002 + architecture-003) · `client/src/ui/HUD.ts:73-2105` · 2120-LOC god module with a single ~590-LOC `build()`; owns gauges, store modal, scoreboard, pause, banner, touch. · Split store/scoreboard/pause modals into their own components; decompose `build()` into per-widget builders. · decision: combine · [plan](plans/phase-1.md)
- **typesafety-001** · `supabase/functions/_shared/mod.ts:167-189` · `ServiceClient = any` erases `tsc` checking on the read path across all 10 Edge Functions (the untrusted boundary; `tsc --noEmit` is the sole static gate). Casts assert unchecked shapes; a column typo or schema drift compiles clean and fails only in production. · Generate schema types and parametrize `createClient<Database>()`, or route every `.select()` through a per-table runtime parse helper. · decision: keep · [plan](plans/phase-3.md)
- **infra-001** · `.github/workflows/{ci,codeql,deploy-pages}.yml` · All third-party Actions pinned to floating `@vN` tags, not commit SHAs; `deploy-pages.yml` injects `VITE_SUPABASE_*` secrets and holds `pages:write`/`id-token:write`. Tag-move/upstream-compromise risk, heightened as the repo goes public. · Pin every `uses:` to a 40-char SHA, or enable Renovate/Dependabot SHA-pinning. · decision: keep · [plan](plans/phase-3.md)
- **edge-fn-test-backfill** (coverage-001 + coverage-002) · `supabase/functions/_shared/mod.ts:83-151, 350-355` · `withCors` (the preamble for all 10 functions: OPTIONS/405/400/429/fail-open) and `reap()` (seat reuse / occupancy, boundary + missing-lastSeen) have zero tests. · Add Deno tests to `mod.test.ts` for each branch; the rate-limit fail-open path is the most dangerous to regress silently. Effort S. · decision: combine · [plan](plans/phase-3.md)

### LOW

- **appsec-002** · `supabase/functions/create_room/index.ts:137-145` · `maxWind`/`gravity` accepted with only a `typeof` check (NaN/Infinity/negative reach the deterministic engine); sibling economy opts are clamped. · Clamp with `Number.isFinite` + range, mirroring `coerceEconomyOptions`. · decision: keep · [plan](plans/phase-1.md)
- **architecture-004** · `client/src/ui/Lobby.ts:839-842`, `client/src/client/NetworkClient.ts:720-810` · 10 hand-rolled `functions/v1` fetch sites re-derive URL/headers/error handling; no shared transport. · Add one typed `callFunction(name, body)` in `lib/`. · decision: keep · [plan](plans/phase-1.md)
- **reliability-003** · `client/src/client/NetworkClient.ts:370-389, 766-776, 672-714` · `stop()` leaves the seq-conflict retry timer and the rematch poll loop uncancelled; callbacks/listener notifications can fire after teardown. · Track/guard the timers with a disposed flag checked in `stop()`. · decision: keep · [plan](plans/phase-1.md)
- **migration-003** · `supabase/migrations/008_rate_limits_global_cleanup.sql:21` · `CREATE INDEX` on the write-hot `rate_limits` table without `CONCURRENTLY`. Sub-second today; establishes a locking-DDL pattern on a per-request table. · Use `CREATE INDEX CONCURRENTLY` (outside the migration txn) or document the accepted trade-off. · decision: keep · [plan](plans/phase-2.md)
- **secrets-supply-001** · `supabase/functions/*/index.ts` (~9 sites) · Most `console.error` calls log the full Postgrest error object (schema/constraint details) rather than `.message`; two sites already use the safer pattern. · Standardize to `error?.message ?? error?.code ?? error`. · decision: keep · [plan](plans/phase-2.md)
- **infra-002** · `.github/workflows/ci.yml:1-44` · No `permissions:` block; `GITHUB_TOKEN` runs at repo/org default scope (contrast deploy-pages/codeql, which scope down). More relevant as the repo goes public and accepts fork PRs. · Add `permissions: contents: read`. · decision: keep · [plan](plans/phase-3.md)

## Decisions needed

None. appsec-001 has a design dimension (identity model / ADR-0006) but a clear engineering fix, so it is filed as a fix, not a `decision-required`.

## Investigate appendix (below confidence gate; preserved, not filed)

- **reliability-001** (medium) · `client/src/client/NetworkClient.ts:208-295` · `initialize()` fetches the log then subscribes; an action committed in the gap can be lost and wedge the client on the seq hole. Coherent mechanism but recovery paths (reconnect resync) make "permanent stall" uncertain.
- **reliability-002** (medium) · `client/src/client/NetworkClient.ts:1009-1048` · A failed fire-and-forget bot submit can permanently stall a single-driver networked room (lastBotKey latched pre-POST, no retry, bot turns excluded from watchdog). Narrow config.
- **migration-002** (low) · `supabase/migrations/001_init.sql`, `003_match_scores.sql` · `rooms`/`room_actions`/`match_scores` lack the data-classification comment convention 005 set. Doc nicety.
- **coverage-003** (medium) · `client/src/client/NetworkClient.ts:554-629, 720-808` · The stateful resync/retry orchestration is never instantiated by a test; `lockstep.mjs` tests a parallel re-implementation, so the algorithm is covered but not the class wiring. Needs a DI refactor.
- **coverage-004** (medium) · `supabase/functions/submit_action/index.ts:78-233` · The live handler body (isMember gate, actingId defaulting, validatedAction assembly) behind `import.meta.main` is untested; pure helpers are tested. Needs extraction/DI.
- **observability-001** (medium) · `supabase/functions/*/index.ts` · DB-error logs omit in-scope roomId/playerId on 9/10 functions, inconsistent with the #67/#79 context convention.
- **observability-002** (medium) · `client/src/ui/Lobby.ts` (6 sites) · Network-error catches discard the caught error with zero console signal; the browser console is the only diagnostic surface (no APM).

## Lens summary

| Lens | Model | Surface | Findings | Note |
|---|---|---|---|---|
| appsec | opus | 18 | 2 | 1 critical (impersonation) |
| architecture | opus | 30 | 5 | invariants verified intact; no orphans |
| reliability | opus | 42 | 3 | determinism core clean |
| secrets-supply | sonnet | 28 | 1 | no secrets in source; supply chain clean |
| migration | sonnet | 9 | 3 | 1 high (reap TOCTOU); immutability holds |
| test-fidelity | sonnet | 22 | 0 | pure-function extraction, no mock drift |
| coverage | sonnet | 8 | 4 | gaps on imperative glue; core well-tested |
| infra | sonnet | 5 | 2 | no service-role key in client build |
| observability | sonnet | 20 | 2 | critical-path signals already present |
| performance | sonnet | 14 | 0 | dirty-flag + memoization honored |
| typesafety | sonnet | 25 | 1 | boundary casts backed by validation |

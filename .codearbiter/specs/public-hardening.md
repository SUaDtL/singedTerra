# Sprint spec — public-hardening

**Created:** 2026-06-21
**Mode:** `/ca:sprint` (autonomous). Premium subagent path.
**Part 2 of 2** of "going public" (after `public-ready`, PR #32). This is the SECURITY-SENSITIVE half:
the rate limiter (resolves CONFIRM-04), a STRIDE threat-model pass on the public surface, and the ADRs
(resolves CONFIRM-05). Should land BEFORE the user flips the repo public.

## Goal

Harden the now-discoverable public attack surface: cap abuse/cost on the public Edge Functions, write
down the security reasoning (threat model), and formalize the architectural invariants as ADRs for
public contributors.

## ✅ DECISION LOCKED (user-approved at the spec gate, 2026-06-21)

- **Storage: Postgres counter table** (`rate_limits` + atomic service-role RPC). Default caps:
  **60 req/min/IP global; create_room 10, join_room 20, restart_game 10 per min/IP** (tunable named
  constants).
- **Execution: after PR #32 (`public-ready`) merges**, so this sprint's branch is off a CI-enabled
  `main` and its PR is gated by the new CI.
- **Deploy + repo flip remain the user's** — not autonomous.

## The load-bearing decision (surfaced, not auto-decided — trust-boundary change)

**Rate-limiter storage.** Recommended: **a Postgres counter table** (`rate_limits`), incremented
atomically by the service role via an RPC — durable, correct across all edge instances, and an
extension of the existing "service-role-only writes" control (mirrors migration 004's
REVOKE-PUBLIC/GRANT-service_role pattern). Alternative: in-memory per-isolate `Map` — zero infra but
leaks across edge instances (weak). **This spec assumes the Postgres approach; confirm or override at
the gate.**

Thresholds (tunable named constants, not magic numbers): a **global default of 60 requests/min per
IP** on every function, with tighter per-function caps on the expensive writers
(`create_room` 10/min, `join_room` 20/min, `restart_game` 10/min per IP). Confirm the posture
(these defaults vs more/less strict) at the gate.

## Context that constrains the work

- `withCors()` in `supabase/functions/_shared/mod.ts` is the single wrapper every function uses and
  already receives `req` — the rate-limit check hooks in there, with per-function config via an opts
  arg. One seam, not 10 edits.
- Migrations are **immutable + forward-only** (`supabase db push`). The limiter ships as a NEW
  migration **005** (additive: a new table + RPC), never an edit to 001–004.
- `verify_jwt=false` on all 10 functions; client IP comes from `x-forwarded-for` / `x-real-ip`.
- Deno tests live beside the functions; extract a **pure** `checkRateLimit()` decision helper
  (mirrors the `validate.ts` pattern) so the logic is unit-tested without a live DB.
- No `.codearbiter/decisions/` directory exists yet — this sprint creates it.

## Scope (3 slices)

### Slice 1 — Threat model (analysis; informs the rest)
1. STRIDE pass over the public surface (the 10 Edge Functions, RLS, the trust-client model, the
   now-public Supabase ref/anon key/schema). Output `.codearbiter/checkpoints/threat-model-public-2026-06-21.md`:
   threats, existing mitigations, and any unmitigated gap. **A genuinely CRITICAL unmitigated threat
   is a hard-gate stop — surface it, do not grind past.**

### Slice 2 — Rate limiter (resolves CONFIRM-04; needs a backend deploy)
2. Migration `005_rate_limits.sql`: a `rate_limits(bucket, window_start, count)` table + an atomic
   `bump_rate_limit` RPC returning whether the request is allowed; `REVOKE … FROM PUBLIC` /
   `GRANT … TO service_role` (the 004 pattern). Include a lazy cleanup of stale windows.
3. Pure `checkRateLimit()` + `clientIp()` helpers in `_shared/mod.ts` + Deno unit tests
   (boundary: at-limit allowed, over-limit 429, IP parsing incl. `x-forwarded-for` lists, missing IP).
4. Wire a `rateLimit` opt into `withCors()`: compute the window, call `bump_rate_limit` via the
   service client, return **429** when over; apply the global default + per-function overrides across
   all 10 functions.
5. Document the new control in `security-controls.md` (a "Rate limiting" section) — this is what
   resolves CONFIRM-04 from "unaccounted" to "controlled".

### Slice 3 — ADRs (resolves CONFIRM-05)
6. Create `.codearbiter/decisions/` and author ADR-001..006 for the confirmed invariants
   (two-context physics, deterministic lockstep, seeded PRNG, HUD-as-DOM, thin referees,
   no-auth/ephemeral-identity) + ADR-007 for the rate-limiter decision taken at this gate. Numbered,
   dated, user-attributed.

## Acceptance criteria

- AC1: threat-model doc exists; every threat has a mitigation or an explicit gap; no CRITICAL left
  silent.
- AC2: migration `005_rate_limits.sql` is additive, immutable-safe, service-role-locked, and passes a
  Deno/SQL sanity read.
- AC3: `checkRateLimit()` + `clientIp()` are pure and covered by new Deno cases (`npm run check:edge`
  stays green; new cases included).
- AC4: every Edge Function enforces a limit via `withCors`; an over-limit request gets **429** (proven
  by the pure-helper tests + a documented manual curl check, since live DB isn't in CI).
- AC5: `security-controls.md` documents the rate-limiting control; CONFIRM-04 is marked resolved in
  `open-questions.md`.
- AC6: `.codearbiter/decisions/ADR-00{1..7}.md` exist, dated + user-attributed; CONFIRM-05 marked
  resolved.
- AC7 (regression): `npm run check` + `npm run check:edge` + `npm run build` green; determinism
  unbroken; RLS policies on the existing tables unchanged; no secret introduced.

## Hard gates / not autonomous

- **The limiter is a trust-boundary change** — its design is approved at THIS gate; the commit-gate
  security pass and the Slice-1 threat model double-check the implementation.
- **Backend deploy is NOT autonomous.** Migration 005 + the function changes take effect only on
  `npm run deploy:backend`, run by the user (or with explicit go) AFTER merge — never silently.
- **A CRITICAL threat-model finding halts the sprint** and surfaces.
- **The repo flip to public stays the user's action.**

## Sequencing

Run AFTER `public-ready` (PR #32) merges, so this sprint's branch is off a CI-enabled `main` and its
PR is gated by the new CI. (If run before, the PR simply won't show CI until #32 merges.)

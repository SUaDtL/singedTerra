# Plan — public-hardening

Spec: `.codearbiter/specs/public-hardening.md`. `status`: PENDING → ACCEPTED. MVP slice = the rate
limiter (Slice 2); the threat model (Slice 1) runs first to inform it; ADRs (Slice 3) are docs.

| # | Task | File(s) | Verification | AC | status |
|---|------|---------|--------------|----|--------|
| T1 | STRIDE threat-model pass on the public surface | `.codearbiter/checkpoints/threat-model-public-2026-06-21.md` | every threat has a mitigation/gap; no silent CRITICAL | AC1 | ACCEPTED |
| T2 | Migration 005: `rate_limits` table + atomic `bump_rate_limit` RPC, service-role-locked, lazy stale-window cleanup | `supabase/migrations/005_rate_limits.sql` | additive only; REVOKE PUBLIC/GRANT service_role; SQL reads clean | AC2 | ACCEPTED |
| T3 | Pure `checkRateLimit()` + `clientIp()` helpers + Deno unit tests | `supabase/functions/_shared/mod.ts`, `_shared/*.test.ts` | new Deno cases pass (at-limit/over-limit/IP-parse/missing-IP); `check:edge` green | AC3 | ACCEPTED |
| T4 | Wire `rateLimit` opt into `withCors`; apply global default + per-function overrides to all 10 functions | `supabase/functions/_shared/mod.ts`, each `*/index.ts` | every function passes a limit; over-limit → 429 | AC4 | ACCEPTED |
| T5 | Document the rate-limiting control | `.codearbiter/security-controls.md` | a "Rate limiting" section describing bucket/limits/storage | AC5 | ACCEPTED |
| T6 | Mark CONFIRM-04 resolved | `.codearbiter/open-questions.md` | CONFIRM-04 struck with the chosen posture | AC5 | ACCEPTED |
| T7 | Create `decisions/` + ADR-001..006 (invariants) + ADR-007 (rate limiter) | `.codearbiter/decisions/ADR-00{1..7}.md` | 7 files, dated, user-attributed | AC6 | DEFERRED — hard rule H-11: ADRs author only via `/ca:adr` (user-attributed) |
| T8 | Mark CONFIRM-05 resolved | `.codearbiter/open-questions.md` | CONFIRM-05 struck (ADRs authored) | AC6 | PARTIAL — decision recorded; ADR authoring pending `/ca:adr` |
| V | Regression | — | `npm run check` + `check:edge` + `build` green; existing RLS unchanged; no secret | AC7 | ACCEPTED |

## Dependencies / ordering

- T1 first (informs T2–T4; a CRITICAL finding halts).
- T2 → T3 → T4 in order (RPC exists before the helper calls it; helper exists before withCors wires it).
- T5/T6 after the limiter is built; T7/T8 independent (docs) — can run alongside.
- T6 and T8 both edit `open-questions.md` — sequence them (T6 → T8) to avoid a stale-edit collision.

## Owed at close (not autonomous)

- **OPS deploy:** `npm run deploy:backend` (migration 005 + the 10 functions) — USER-run after merge.
  The limiter does nothing until deployed.
- **Manual 429 check:** a `curl` loop against a function past its limit, post-deploy (live DB not in CI).
- **The repo flip to public** — user action, after this merges.

## Test-first note (tdd)

T3 is genuinely test-first: write the `checkRateLimit`/`clientIp` Deno cases (red), then the helpers
(green). T2 (SQL) and T4 (wiring) are verified by the helper tests + a documented manual curl, since a
live Postgres isn't available in CI. T1/T5/T6/T7/T8 are analysis/docs.

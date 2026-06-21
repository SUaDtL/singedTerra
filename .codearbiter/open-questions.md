# Open questions

Unresolved `[CONFIRM-NN]` items. Each blocks dependent work until resolved.
The SessionStart hook and statusline count `CONFIRM-NN` occurrences here.

## Resolved 2026-06-21 (the two checkpoint decision forks)

Both forks surfaced by the 2026-06-21 checkpoint were resolved in the `public-hardening` sprint:

- **Edge Function rate-limiting posture** → chose (a) **implement a limiter** (RESOLVED). Per-IP
  fixed-window limiter on all 10 functions (migration `005_rate_limits.sql` + `withCors`); documented
  in `security-controls.md` → "Rate limiting".
- **ADR adoption** → chose (a) **formalize now** (RESOLVED). The seven ADRs were authored via `/ca:adr`
  (user-attributed) on 2026-06-21: `.codearbiter/decisions/0001..0007` + `decision-log.md`
  (ADR-0001..0005 invariants, ADR-0006 no-auth/ephemeral-identity, ADR-0007 the rate limiter).

---

The five architectural forks from the 2026-06-20 review were all resolved that day.
The decisions live in `CONTEXT.md` → "Strategic direction" (the staged-seriousness
ladder): trust-client now / tens-of-rooms / stay-Supabase-with-DO-as-successor /
gameplay-parity-first / ephemeral-identity-now. Re-open here only if a decision needs
revisiting.

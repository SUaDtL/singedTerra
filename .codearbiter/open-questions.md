# Open questions

Unresolved `[CONFIRM-NN]` items. Each blocks dependent work until resolved.
The SessionStart hook and statusline count `CONFIRM-NN` occurrences here.

## Resolved 2026-06-21 (the two checkpoint decision forks)

Both forks surfaced by the 2026-06-21 checkpoint were resolved in the `public-hardening` sprint:

- **Edge Function rate-limiting posture** → chose (a) **implement a limiter** (RESOLVED). Per-IP
  fixed-window limiter on all 10 functions (migration `005_rate_limits.sql` + `withCors`); documented
  in `security-controls.md` → "Rate limiting".
- **ADR adoption** → chose (a) **formalize now** (decision made; authoring PENDING). ADRs must be
  authored through `/ca:adr` (user-attributed — a hard rule blocks batch-writing them), so the seven
  ADRs (six invariants + the rate-limiter decision) are a `/ca:adr` follow-up, not part of the
  autonomous sprint. Until authored, the invariants remain documented in CLAUDE.md / CONTEXT.md /
  coding-standards.md and the rate-limiter rationale in `security-controls.md` + the threat model.

---

The five architectural forks from the 2026-06-20 review were all resolved that day.
The decisions live in `CONTEXT.md` → "Strategic direction" (the staged-seriousness
ladder): trust-client now / tens-of-rooms / stay-Supabase-with-DO-as-successor /
gameplay-parity-first / ephemeral-identity-now. Re-open here only if a decision needs
revisiting.

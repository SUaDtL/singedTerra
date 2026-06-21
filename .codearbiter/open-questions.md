# Open questions

Unresolved `[CONFIRM-NN]` items. Each blocks dependent work until resolved.
The SessionStart hook and statusline count `CONFIRM-NN` occurrences here.

## Checkpoint 2026-06-21 decision forks

- [CONFIRM-04] **Edge Function rate-limiting posture.** All 10 functions are
  `verify_jwt=false` public POST endpoints reachable with the anon key and have NO
  application-level rate limiting (`supabase/functions/_shared/mod.ts:51`); a client can
  loop create_room/join_room/heartbeat/list_rooms/submit_action for resource-exhaustion.
  RLS blocks unauthorized *writes* but does nothing to cap request *volume*, and
  `security-controls.md` is silent on abuse-volume controls. Options: (a) add a
  per-IP/per-room limiter on the write-side functions; (b) formally record "no application
  rate limiting — accepted (casual game; RLS blocks writes; Supabase platform limits cap
  cost)" in `security-controls.md`. Surfaced by security-reviewer (MEDIUM).
- [CONFIRM-05] **ADR adoption.** No `.codearbiter/decisions/` directory exists; the 6 core
  invariants are confirmed in code (0 drift) but live only in CLAUDE.md / CONTEXT.md /
  coding-standards.md. Options: (a) stand up `decisions/` and formalize ADR-001..006
  (two-context physics, deterministic lockstep, seeded PRNG, HUD-as-DOM, thin referees,
  no-auth/ephemeral-identity) now via `/ca:adr`; (b) defer until the project leaves Stage 1
  and record the deferral. Surfaced by architecture-drift-reviewer.

---

The five architectural forks from the 2026-06-20 review were all resolved that day.
The decisions live in `CONTEXT.md` → "Strategic direction" (the staged-seriousness
ladder): trust-client now / tens-of-rooms / stay-Supabase-with-DO-as-successor /
gameplay-parity-first / ephemeral-identity-now. Re-open here only if a decision needs
revisiting.

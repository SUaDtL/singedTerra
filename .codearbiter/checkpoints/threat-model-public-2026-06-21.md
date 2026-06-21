# Threat model — public attack surface (STRIDE) — 2026-06-21

Pre-public STRIDE pass over singedTerra's externally-reachable surface, produced by the
`public-hardening` sprint (Slice 1). Scope: the 10 Supabase Edge Functions (`verify_jwt=false`, public
POST), the Postgres tables under RLS, the deterministic-lockstep trust-client model, and what becomes
world-readable once the repo + Supabase project ref are public.

**Verdict: no CRITICAL unmitigated threat.** The one previously-unaccounted gap (DoS / cost abuse) is
mitigated by this sprint's rate limiter. The remaining items are accepted consequences of the
documented no-auth / trust-client design; recorded here so the acceptance is explicit.

## Surface summary

- Anyone can call any of the 10 functions with the public anon key. Writes are denied to `anon` by RLS;
  every mutation goes through a `service_role` Edge Function referee. The service-role key is server-only.
- Anyone can `SELECT` `rooms` / `room_actions` / `match_scores` (RLS `USING (true)`). No PII by design
  (random UUIDs, user-chosen display names, gameplay only).

## STRIDE

### S — Spoofing  ·  severity: MEDIUM (ACCEPTED — trust-client / no-auth by design)
Identity is a server-minted `playerId` (UUID) passed in the request body; there is **no auth**. Because
`room_actions` is publicly `SELECT`-able and carries the acting `playerId`, a player's id is **not
secret** to others in the room. An attacker who reads a victim's `playerId` could submit an action *as*
that victim.
- **Existing limiters on blast radius:** the referee enforces membership + turn-ownership (an action is
  only accepted for the *active* seat, and a member may proxy only **bot** seats, never another human),
  and `UNIQUE(room_id, seq)` makes each action exactly-once. So the worst case is griefing one action on
  the seat whose turn it already is, in a casual room — it cannot read secrets, escalate, or corrupt
  other rooms.
- **Disposition:** accepted under the ephemeral-identity strategic decision (`CONTEXT.md`). If stakes
  ever rise (ranked play, accounts), the mitigation is signed actions / per-player tokens — captured as
  a future ADR, not this sprint.

### T — Tampering  ·  severity: LOW (mitigated)
Anon has zero write access (RLS `INSERT/UPDATE/DELETE = false` on all three tables); `room_actions` is
effectively append-only via the referee. No client can tamper with another player's rows or the action
log except through the gated referee path. The `submit_room_action` RPC is `REVOKE … FROM PUBLIC` /
`GRANT … TO service_role`, so anon cannot call it directly. No SQL-injection surface (parameterized
RPC + Supabase client, no string-built SQL). **Mitigated.**

### R — Repudiation  ·  severity: LOW (accepted)
No per-user audit trail beyond the action log. Acceptable for a casual, no-account game; the action log
itself is an immutable record of play.

### I — Information disclosure  ·  severity: LOW (accepted)
Public `SELECT` exposes room state, action logs, and `playerId`s (see Spoofing). **No secrets, keys, or
PII by design** — display names are user-supplied (a user could type PII into their own name, which is
their choice). The service-role key is never client-side. Going public additionally exposes the project
ref, table schema, and Edge Function source — all expected for an open-source client/server game and
none of which is a credential. **Accepted.**

### D — Denial of service / cost abuse  ·  severity: was MEDIUM (unaccounted) → MITIGATED this sprint
The previously-unaccounted gap: no application rate limiting on the public functions; a client could
loop `create_room` (row inserts + lookups), `join_room`, `submit_action` (per-room `FOR UPDATE` lock),
`heartbeat`/`list_rooms` to exhaust DB connections / inflate cost.
- **Mitigation (this sprint):** a per-IP fixed-window rate limiter in `withCors()` backed by a
  service-role-only `rate_limits` counter table — 60 req/min/IP global, with tighter caps on the
  expensive writers (`create_room` 10, `join_room` 20, `restart_game` 10). The limiter **fails open** on
  a backend hiccup (a limiter outage must not take the game down). Residual: a distributed/many-IP flood
  is bounded only by Supabase platform limits — acceptable for the project's stage; revisit if abuse
  appears. Resolves CONFIRM-04.

### E — Elevation of privilege  ·  severity: LOW (mitigated)
No path from `anon` to `service_role`: the key is server-only, RLS denies anon writes, and the
privileged RPCs are REVOKE-PUBLIC. The only "privilege" a client holds is acting on its own turn,
covered under Spoofing. **Mitigated.**

## Outcome

| Threat | Severity | Status |
|---|---|---|
| Spoofing (act-as-another on their turn) | MEDIUM | ACCEPTED (trust-client; blast radius bounded) |
| Tampering | LOW | Mitigated (RLS + referee + REVOKE-PUBLIC) |
| Repudiation | LOW | Accepted (action log) |
| Information disclosure | LOW | Accepted (no PII/secrets) |
| **DoS / cost abuse** | **was MEDIUM** | **Mitigated this sprint (rate limiter)** |
| Elevation of privilege | LOW | Mitigated |

No sprint-halting CRITICAL. The accepted items trace to the documented no-auth / trust-client / ephemeral
-identity decisions (to be formalized as ADRs in Slice 3). Recommended future work if stakes rise:
signed/authenticated actions (kills the Spoofing vector) and a distributed-flood defense (edge gateway).

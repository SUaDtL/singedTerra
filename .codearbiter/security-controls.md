# Security controls

Thin, boundary-focused. Anonymous hot-seat and online play remain supported, while ADR-0011 adds
optional durable Supabase Auth accounts for profiles and future progression. Gameplay authorization
continues to use the existing per-seat credential; account identity is a separate boundary.
Originally extracted from code 2026-06-20; account transition accepted 2026-08-04.

## Auth / identity

- **Optional account auth (ADR-0011)** — Supabase Auth email/password supplies a durable user id and browser-managed JWT session for owner-only profile access. Signup begins with email confirmation disabled: no magic link, OTP, resend, SMTP, password-recovery delivery, or paid provider. Google SSO is deferred. Passwords and session tokens are handled only by Supabase Auth and MUST NOT enter repo source, logs, URLs, public tables, Realtime, or application-owned persistence.
- **Gameplay identity remains split** — each human seat has two server-minted values: a public `playerId`, which is safe to put in room rows and action logs, and a secret 128-bit CSPRNG UUID seat token, which remains the bearer credential for that seat. `create_room` and `join_room` mint and return the token once with the new seat. An account JWT does not replace or imply ownership of a seat.
- The client persists that secret only in its existing best-effort `localStorage` entry keyed by the public `playerId`, so it can follow the same seat through a rematch. The token is never a Realtime value, URL value, log value, or identity/display field.
- The public gameplay referees retain `verify_jwt = false`; they remain public POST endpoints gated by seat token and database controls. The separately authenticated account-aware `claim_match`, `account_summary`, `record_hotseat_match`, and `verified_replay_probe` functions also retain `verify_jwt = false` so each handler explicitly validates exactly one account bearer with Supabase Auth. `claim_match` binds that account to the independently verified seat token for the same public room/player id and derives stored user and tank identities server-side. `record_hotseat_match` accepts exactly one client-generated match UUID plus a boolean Player 1 outcome and derives the stored user only from Auth. `account_summary` ignores request-owned identity and totals, scopes both private linkage/result reads to the Auth-derived user id, and combines bounded network and local counts. `verified_replay_probe` accepts no body or client-owned identity. No account-aware function may accept a client-supplied user id as authority.
- **Hot-seat progression trust ceiling** - local outcomes are explicitly client-attested and forgeable by a modified browser. The server authenticates the account, validates the bounded shape, and makes a match UUID idempotent; it does not independently simulate local play. XP and levels remain casual history and MUST NOT attach gameplay advantages, scarce rewards, entitlements, ranks, or anti-cheat claims.
- **Versioned progression is server-derived** - `account_summary` version 1 computes XP only after its Auth-scoped persisted-result reads validate: 100 XP per completed match plus 100 XP per recorded win; level 1 begins at 0 cumulative XP and each 500 XP advances one level. The handler returns `progressionVersion`, `totalXp`, `level`, `levelXp`, and `nextLevelXp` alongside the derived counts. Network result bodies MUST NOT supply or influence match outcomes. ADR-0012 permits only one client-attested hot-seat match outcome shaped as `{matchId, won}` under the casual-history ceiling; even there request bodies MUST NOT supply XP, level, cumulative totals, rewards, or entitlements, and the server remains the sole progression-arithmetic authority.
- **Casual-result trust ceiling remains** â€” progression reflects accepted persisted lockstep results, but `finish_game` does not independently simulate or competitively verify every outcome. XP and levels are casual account history only: this slice MUST NOT attach gameplay advantages, scarce rewards, entitlements, ranks, or anti-cheat claims to them.
- **Hosted replay probe is non-awarding** - `verified_replay_probe` accepts no request body, validates exactly one account Bearer through Supabase Auth, and runs only two immutable server-owned workloads through the bounded shared replay adapter. It returns versioned derived outcomes only and MUST NOT read or write player, match, verification, progression, rank, reward, or entitlement state. The only database mutation on its request path is the existing operational per-IP limiter counter. A successful probe is runtime feasibility evidence, never rank evidence.
- `profiles` contains only the Supabase user id, display name, and timestamps. It MUST NOT contain email, password material, access/refresh tokens, seat tokens, or client-reported progression. RLS default-denies anonymous access and limits authenticated reads to `id = auth.uid()`; profile insertion is server-trigger-owned in the identity-foundation slice.

## Authenticated production diagnostics console

- The **authenticated production diagnostics console** is a maintainer/test interface, activated only by the exact `diagnostics=1` query parameter and absent from normal player navigation. Its fixed compile-time allowlist currently contains only `verified-replay-runtime` mapped to `verified_replay_probe`; it has no body, headers, arbitrary endpoint, method, or request-composition inputs and MUST NOT evolve into a generic request runner.
- The console lazily reuses the existing Supabase singleton and browser-managed session. It MUST NOT inspect Auth storage, call `auth.getSession`, extract tokens, accept credentials, or construct an `Authorization` header. URL activation and client account state are usability gates only; the Edge Function remains authoritative for authorization.
- Diagnostics state, DOM, logs, URL values, and clipboard receipts use a schema-v1 sanitized projection. They exclude identity, tokens, raw responses, raw errors, request or response headers, and timing data. Only the already-sanitized receipt may be copied.
- The console is non-awarding and non-mutating except for the pre-existing operational limiter counter on the probe request path. It makes no rank, reward, progression, entitlement, or gameplay claim.
- Adding a check requires governance, a compile-time descriptor, exact response validation, bounded timeout and lifecycle handling, tests, and adversarial review. An authenticated production PASS is operational runtime evidence only, not proof of unrelated account, gameplay, persistence, progression, or reward behavior.

## Database access — the real control (RLS)

The public game tables (`rooms`, `room_actions`, `match_scores`) have **RLS enabled** with a uniform posture:

- **`anon` role: public SELECT (`USING (true)`), zero writes** (`INSERT/UPDATE/DELETE` all `false`). The shipped anon/publishable key can only read.
- **`authenticated` role: the same public SELECT visibility, zero direct writes.** Migration 013 adds explicit SELECT grants and read-only policies, and explicitly revokes INSERT/UPDATE/DELETE so restoring an account session cannot break room/replay/Realtime reads or bypass the Edge Function referees.
- **All mutations go through the Edge Functions**, which use a `service_role` client (`getServiceClient()`, `_shared/mod.ts`) that bypasses RLS. The service key remains Deno-runtime-only and must never enter client code, logs, or the bundle.

The credential and limiter tables are deliberately stricter:

- `room_seats` stores the secret token and has RLS with no anon policies plus revoked anon table grants: default-deny, service-role-only access.
- `rate_limits` likewise has RLS with no anon policies: default-deny, service-role-only access through the `bump_rate_limit` RPC, whose `PUBLIC` execution grant is revoked.
- `match_participants` is the immutable owner-private linkage table for `claim_match` and the source of account-scoped links for `account_summary`: anonymous users receive no grants or policies; authenticated users receive owner-only SELECT where `auth.uid() = user_id` and no direct writes; only the service-role claim referee may insert. The service-role summary function reads only the Auth-derived user's links, requires the exact participant count to equal the returned row count so any PostgREST truncation fails closed, then reads scores only for those linked room ids in sequential batches of at most 200 UUIDs so each Database REST URL stays conservatively below the hosted 16 KB limit. Missing, duplicate, malformed, or unrequested score data and every batch query error fail generically without partial counts. Its room, player, and tank ids remain public gameplay identifiers, while the account link is private and its timestamp internal.
- `hotseat_match_results` stores immutable account-local match UUIDs, client-attested win booleans, and server timestamps. Anonymous users have no access; authenticated users receive owner-only SELECT and no direct writes; service role receives SELECT/INSERT only. `record_hotseat_match` derives `user_id` from Auth and exact replay is idempotent, while `account_summary` reads only exact head-counts scoped to that same Auth-derived user.

This is the load-bearing control: even with JWT off and CORS open, no client can write a row except via a referee function. Do not weaken these RLS policies, and do not add a client-side path that uses the service-role key.

## Edge Function referee gating (`submit_action`)

Authorization is enforced in-function (it does NOT run physics):

1. **Seat credential** — mutations for an existing human seat first verify that the presented token matches that room and public `playerId` in `room_seats` (else 403). Creating or joining a seat is the minting exception.
2. **Membership** — submitter's `playerId` must be in `room.players` (else 403).
3. **Turn ownership** — for turn-ending actions, acting seat must equal `room.active_player_index`. A client may proxy a seat only if that seat is a **bot**; it cannot impersonate another human.
4. **Exactly-once** — `UNIQUE(room_id, seq)`; a duplicate insert returns 409 `seq_conflict`.

Known trust observation (accepted under the replayed-log design): the next-turn seat (`nextActiveIndex`) is computed client-side and trusted by the referee (bounds-checked only). The canonical state is the replayed action log, so a wrong index self-corrects; do not turn this into an authorization decision.

## Secrets

- **Approved source: runtime env only.** Edge Functions read `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (`_shared/mod.ts`). Client reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time.
- The `VITE_SUPABASE_ANON_KEY` is **public-by-design** (publishable key, ships in the bundle). The **service-role key must never** appear in client code, committed source, logs, or the bundle.
- `.env` files are gitignored (`.env`, `client/.env`, `supabase/.env`) and confirmed untracked. No hardcoded secret exists in committed source.
- **Ops mismatch to fix:** `supabase/functions/.env.example` names the var `SUPABASE_SECRET_KEYS`, but the loader reads `SUPABASE_SERVICE_ROLE_KEY` — a fresh deploy following the example would fail to load the key. Tracked in `open-tasks.md`.

## Crypto

- **No application crypto** — no signing/hashing/encryption libraries, no Vault/KMS. Banned by default: do not home-roll crypto or introduce a crypto dependency without an ADR.
- Platform CSPRNG supplies the security-sensitive seat tokens via `crypto.randomUUID()`, as well as public player IDs, game seeds, and the 4-char room code; Postgres `pgcrypto` is used only for `gen_random_uuid()`.

## CORS

`Access-Control-Allow-Origin: *` on all functions (`_shared/mod.ts`). Acceptable: there is no cookie-based auth and all writes are gated server-side.

## Rate limiting (resolves CONFIRM-04)

Every deployed Edge Function enforces a **per-IP fixed-window** limit via `withCors()` (`_shared/mod.ts`),
backed by a **service-role-only** `rate_limits` counter table + the `bump_rate_limit` RPC (migration
`005_rate_limits.sql`; `REVOKE … FROM PUBLIC` / `GRANT … TO service_role`, mirroring 004). The cap is
60 requests/min/IP by default, tightened on the expensive writers (`create_room` 10, `join_room` 20,
`restart_game` 10); `claim_match` and `account_summary` each have an explicit 60-request bucket, `record_hotseat_match` is capped at 20, and the fixed-work `verified_replay_probe` is capped at 10. These named constants live in
`_shared/mod.ts` and are tunable without a migration. Over-limit
returns **429**. Client IP is read from `x-forwarded-for` (first hop) / `x-real-ip`. (A formal ADR for
this decision is owed via `/ca:adr`.)

- **Fails open by design:** a limiter/DB error is logged and the request is allowed — a limiter outage
  must never take the game down. The decision helper `checkRateLimit()` and window math `rateWindow()`
  are pure and unit-tested (Deno).
- **Residual (accepted):** a distributed many-IP flood is bounded only by Supabase platform limits;
  acceptable at this stage, revisit if abuse appears (see the public threat model,
  `.codearbiter/checkpoints/threat-model-public-2026-06-21.md`).

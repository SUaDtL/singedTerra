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
- **Hosted replay probe is non-awarding** - `verified_replay_probe` accepts no request body, validates exactly one account Bearer through Supabase Auth, and runs only its server-owned bounded workloads. It MUST NOT read or write player, match, verification-receipt, progression, rank, reward, or entitlement state. Operational mutations are per-IP/account limiter counters and shared account computation-lease acquisition/release, including that lease admission's same-account lazy expiry/exhaustion reconciliation of existing challenge sessions. This exception permits status reconciliation only: no session allocation, transcript changes, attempt changes, receipts or awards. Those lease records are operational coordination, never award evidence. The default legacy mode uses the shared replay adapter; the exact cq1 query selects one of 21 fixed retained fixtures, with no client-supplied shots or configuration. Its declared retained identity is static-registry provenance, not measured hosted source bytes. Existing V2/V3 transitive source imports are not immutable retained artifacts. A successful probe is runtime feasibility evidence, never rank evidence.
- `profiles` contains only the Supabase user id, display name, and timestamps. It MUST NOT contain email, password material, access/refresh tokens, seat tokens, or client-reported progression. RLS default-denies anonymous access and limits authenticated reads to `id = auth.uid()`; profile insertion is server-trigger-owned in the identity-foundation slice.

## Authenticated production diagnostics console

- The **authenticated production diagnostics console** is a maintainer/test interface, activated only by the exact `diagnostics=1` query parameter and absent from normal player navigation. Its fixed compile-time allowlist currently contains only `verified-replay-runtime` mapped to `verified_replay_probe`; it has no body, headers, arbitrary endpoint, method, or request-composition inputs and MUST NOT evolve into a generic request runner.
- The console lazily reuses the existing Supabase singleton and browser-managed session. It MUST NOT inspect Auth storage, call `auth.getSession`, extract tokens, accept credentials, or construct an `Authorization` header. URL activation and client account state are usability gates only; the Edge Function remains authoritative for authorization.
- Diagnostics state, DOM, logs, URL values, and clipboard receipts use a schema-v1 sanitized projection. They exclude identity, tokens, raw responses, raw errors, request or response headers, and timing data. Only the already-sanitized receipt may be copied.
- The console is non-awarding. Its default probe request uses operational limiter counters and the shared account computation lease, including the bounded same-account status reconciliation above; it does not expose cq1 query selection. It makes no rank, reward, progression, entitlement, or gameplay claim.
- Adding a check requires governance, a compile-time descriptor, exact response validation, bounded timeout and lifecycle handling, tests, and adversarial review. An authenticated production PASS is operational runtime evidence only, not proof of unrelated account, gameplay, persistence, progression, or reward behavior.

## Database access — the real control (RLS)

The public game tables (`rooms`, `room_actions`, `match_scores`) have **RLS enabled** with a uniform posture:

- **`anon` role: public SELECT (`USING (true)`), zero writes** (`INSERT/UPDATE/DELETE` all `false`). The shipped anon/publishable key can only read.
- **`authenticated` role: the same public SELECT visibility, zero direct writes.** Migration 013 adds explicit SELECT grants and read-only policies, and explicitly revokes INSERT/UPDATE/DELETE so restoring an account session cannot break room/replay/Realtime reads or bypass the Edge Function referees.
- **Player mutations go through the Edge Functions**, which use a `service_role` client (`getServiceClient()`, `_shared/mod.ts`) that bypasses RLS. The service key remains Deno-runtime-only and must never enter client code, logs, or the bundle. The separately approved room-cleanup scheduler may run only the fixed `SELECT public.expire_abandoned_rooms();` command directly in Postgres. Its restricted function locks rooms, requires explicit lifecycle capability, preserves canonical history, and creates no awards; browsers receive neither execution nor scheduling authority.

The credential and limiter tables are deliberately stricter:

- `room_seats` stores the secret token and has RLS with no anon policies plus revoked anon table grants: default-deny, service-role-only access.
- `rate_limits` likewise has RLS with no anon policies: default-deny, service-role-only access through the `bump_rate_limit` RPC, whose `PUBLIC` execution grant is revoked.
- `match_participants` is the immutable owner-private linkage table for `claim_match` and the source of account-scoped links for `account_summary`: anonymous users receive no grants or policies; authenticated users receive owner-only SELECT where `auth.uid() = user_id` and no direct writes; only the service-role claim referee may insert. The service-role summary function reads only the Auth-derived user's links, requires the exact participant count to equal the returned row count so any PostgREST truncation fails closed, then reads scores only for those linked room ids in sequential batches of at most 200 UUIDs so each Database REST URL stays conservatively below the hosted 16 KB limit. Missing, duplicate, malformed, or unrequested score data and every batch query error fail generically without partial counts. Its room, player, and tank ids remain public gameplay identifiers, while the account link is private and its timestamp internal.
- `hotseat_match_results` stores immutable account-local match UUIDs, client-attested win booleans, and server timestamps. Anonymous users have no access; authenticated users receive owner-only SELECT and no direct writes; service role receives SELECT/INSERT only. `record_hotseat_match` derives `user_id` from Auth and exact replay is idempotent, while `account_summary` reads only exact head-counts scoped to that same Auth-derived user.
- `verified_deployment_contracts` is INTERNAL service-only admission and drain state. `verified_deployments` stores the Auth-derived owner, immutable server-owned deterministic config, exact contract/engine/ruleset versions, status, and hard expiry. `verified_match_results` stores one immutable PRIVATE canonical human-fire transcript and replay-derived outcome per owner/session. All three tables enable RLS and grant no direct anonymous or authenticated access. The service role receives only the exact table operations and RPC execution needed by start, abandon, completion, summary, and drain tooling. Direct result mutation is rejected, deployment identity/config/version fields are immutable, and owner deletion cascades without weakening operational mutation guards.
- Verified progression uses immutable `verified_match_results` evidence. The
  current protected-floor contract emits `verified_replay_v2`; historic V1
  rows remain aggregate evidence and completed receipts, never inputs to V2
  replay. The client may submit at most six accepted human `{ angle, power }`
  commitments. It cannot submit CPU actions, identity, seed, config, outcome,
  XP, level, rank, totals, or rewards. Completion regenerates every CPU turn
  through the shared bounded 60-probe policy, independently replays the
  canonical transcript, and atomically stores one idempotent result plus its
  result-specific prior/current progression snapshots under a per-account
  transaction lock. Same-evidence retries return that immutable result and
  snapshot without replay or a mutable aggregate read; conflicting evidence
  fails closed.

This is the load-bearing control: even with JWT off and CORS open, no client can write a row except via a referee function. Do not weaken these RLS policies, and do not add a client-side path that uses the service-role key.

## Verified Deployment request and rollout boundary

- `start_verified_deployment`, `abandon_verified_deployment`, and `complete_verified_deployment` authenticate exactly one browser-managed Supabase account bearer and derive the owner only from Auth. They retain the coarse pre-Auth IP limiter, then apply a fail-closed 10 requests/minute Auth-account bucket before reading a body or running replay. The same account across different IPs shares that account bucket. Account-limiter storage failure refuses work; coarse IP limiter failure retains the existing availability-first policy.
- Start accepts either an absent body for legacy V2-only capability or exact optional JSON `{capabilities: [{contractVersion, engineVersion, rulesetVersion}]}` within 256 UTF-8 bytes. Capabilities must be a non-empty, unique subset of the canonical `(2,2,4)` and `(3,3,4)` tuples; mixed-field, duplicate, unknown, widened, or unadvertised selected tuples fail closed. The service selects the highest enabled advertised contract while resuming only an existing exact advertised tuple. Abandon accepts exactly `{ sessionId }` within 128 UTF-8 bytes. Completion accepts exactly `{ sessionId, transcript }` within 1,024 UTF-8 bytes. The streamed body is authoritative: reads have a 2-second deadline and separately bounded 250 ms cancellation attempt, while `Content-Length` is only an early rejection. Oversized, stalled, invalid-Unicode, malformed, extra-key, ownership, expiry, version, and policy failures return generic responses without raw errors, identifiers, credentials, or partial awards.
- Verified eligibility lasts 30 minutes from the authoritative server start. The HUD warns at five minutes and one minute. Expiry freezes verified input and requires an explicit choice to continue casually or return to the Battery; expired evidence cannot earn verified progression.
- Contract version 1 starts disabled in migration 016. V2 and V3 retain independent admission controls and exact replay implementations; migration 020 introduces V3 disabled, and V3 remains disabled while its backward-compatible Edge functions and dual-capability client are deployed and proven. A disabled V3 never reinterprets an active V3 session as V2, and disabling V3 may allow a new V2 start only when V2 admission remains enabled. Operators use the version-specific SQL functions `set_verified_deployment_starts` and `verified_deployment_drain_status` to control admission and inspect `disabled_at`, `last_started_at`, `safe_after`, and unexpired sessions. The historical V1/V2 drain script remains limited to its fixed legacy contract. V2 never dynamically selects V1 replay code; active V1 rows are refused before replay/award while completed historical rows remain immutable receipts. Existing abandonment remains available during a drain.

## Verified Challenge contract (P10 / ADR-0019; rollout remains disabled)

- Auth supplies the account; the server's allowlisted catalog supplies the entire
  immutable descriptor. Only Crosswind Qualification cq1, seed 42, exact fixed rules
  and limits, objective 1, CPU `cq1-hard-v3`, reward 1 and descriptor 1 are admitted.
  ST1/practice receipts cannot be promoted. Explicit Start is required. Capability
  parsing must fail closed on unknown versions/fields and incompatible active
  sessions; disabling starts still permits compatible admitted-session resume.
- Start accepts only `{trialId,supportedDescriptorVersions:[1]}` within 256 UTF-8
  bytes; complete only `{sessionId,transcript}` within 2,048 bytes. The transcript is
  one to three exact integer angle/power pairs. Reject malformed UTF-8, unknown
  fields, fractional/nonfinite/out-of-range values, incomplete replay and trailing
  shots. Canonical transcripts are compared by ordered value, not a security hash.
  Never trust client CPU actions, seed, health, outcome, medal or XP.
- Independently execute the statically selected retained closure. Only positive
  CPU health loss after a fully settled human salvo clears the objective. It takes
  precedence over simultaneous death; otherwise terminal engine state then third
  miss fails. CPU self-kill or CPU-caused draw fails. Technical/infrastructure
  failure is not an objective miss and cannot award.
- Dedicated sessions, append-only receipts and append-only awards have owner-only
  reads and service-only mutations with explicit grants/RLS. Descriptor fields
  cannot change. Account/session transaction locking atomically inserts receipt,
  unique `(accountId,entitlementId)` first-clear medal/+200 XP and historical career
  snapshots. `awarded`, `already_owned` and `not_awarded` remain distinct. Matching
  receipt lookup precedes replay and survives expiry; conflicting evidence fails.
  Abandon/expiry cannot overwrite a completed receipt. No client direct writes.
- Verified Career projection 1 sums verified replay XP and unique challenge awards
  using the frozen existing level/rank curve. It excludes casual/broad XP, preserves
  old API shapes and receipts and cannot invent match/win counts. Existing replay
  completion and challenge finalization share account transaction serialization so
  before/after snapshots are consistent under races. Missing projection is shown
  as unavailable, not guessed.
- One account-wide database lease covers challenge completion, deployment
  completion and replay probe. An increasing fence and opaque worker binding guard
  every finalization/release against stale workers. Receipt fast paths need no
  computation. Busy consumes zero attempts. Challenge admission persistently binds
  its first canonical transcript and increments at most three compute attempts;
  crash/timeout consumes its attempt, while exhausted infrastructure retries close
  as `verification_unavailable`. Lazy reads/start/acquire reconcile expired workers.
- The write fence lasts 10 seconds. Native synchronous results taking 1000ms or
  longer cannot finalize. An uncertain unreturned invocation blocks new account
  computation for 410 seconds; exact release after synchronous return or throw
  can clear that cooldown. These controls do not forcibly terminate replay or
  prove strict CPU exclusion. A Promise.race cannot stop synchronous CPU work.
  Work limits check before dominant operations, including cloned probes and
  wrap/terrain operations. Exhaustion is terminal `work_limit`, never awardable.
- Challenge IP (30/minute) and account (10/minute) rate limits, lease and database
  admission fail closed before expensive work; generic errors do not echo malformed
  input, tokens or internal errors. This explicit exception does not silently change
  ordinary gameplay's existing availability-first coarse limiter policy.
- Retain old RPC signatures during additive migration, but do not enable challenge
  starts until every deployed costly route participates in the lease. New client
  capability and catalog start disabled pending separately approved backend rollout,
  exact-artifact hosted deadline refusal, cooldown/fencing, capacity and real
  transactional race evidence.
  Rollback disables starts and drains, preserving descriptors, verifiers and awards.
  Local tests/merge do not establish hosted proof or authorize backend rollout.
- ADR-0017 SHA-256 remains build/source provenance only. It is not a credential,
  signature, entitlement identity or replay correctness proof. No new cryptographic
  dependency is introduced. Replay establishes action/outcome consistency, not
  human effort, unique-person identity or resistance to known-solution farming.

## Edge Function referee gating (`submit_action`)

Authorization is enforced in-function (it does NOT run physics):

1. **Seat credential** — mutations for an existing human seat first verify that the presented token matches that room and public `playerId` in `room_seats` (else 403). Creating or joining a seat is the minting exception.
2. **Membership** — submitter's `playerId` must be in `room.players` (else 403).
3. **Turn ownership** — for turn-ending actions, acting seat must equal `room.active_player_index`. A client may proxy a seat only if that seat is a **bot**; it cannot impersonate another human.
4. **Sequence uniqueness**: `UNIQUE(room_id, seq)` prevents duplicate sequence
   rows; a conflicting insert returns 409 `seq_conflict`. This does not establish
   exactly-once logical intent across competing CPU proxies or uncertain
   retries. R06/R07 own the authorized transaction and retry corrections; their
   implementation and acceptance remain recorded in the current recovery ledger.

Known trust boundary (ADR-0008): the next-turn seat (`nextActiveIndex`) is
computed client-side and structurally checked by the thin referee. A wrong
reported successor does not reliably self-correct: it can stall the room or
admit an out-of-rotation action. ADR-0008 retains this residual semantic-trust
risk and desync observability; the referee does not independently derive the
true alive successor or round phase through physics. Sequence/intent controls
must not be represented as server-authoritative gameplay verification.

## Secrets

- **Approved source: runtime env only.** Edge Functions read `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (`_shared/mod.ts`). Client reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time.
- The `VITE_SUPABASE_ANON_KEY` is **public-by-design** (publishable key, ships in the bundle). The **service-role key must never** appear in client code, committed source, logs, or the bundle.
- `.env` files are gitignored (`.env`, `client/.env`, `supabase/.env`) and confirmed untracked. No hardcoded secret exists in committed source.
- **Ops mismatch to fix:** `supabase/functions/.env.example` names the var `SUPABASE_SECRET_KEYS`, but the loader reads `SUPABASE_SERVICE_ROLE_KEY` — a fresh deploy following the example would fail to load the key. Tracked in `open-tasks.md`.

## Crypto

- **No application crypto** — no signing/hashing/encryption libraries, no Vault/KMS. Banned by default: do not home-roll crypto or introduce a crypto dependency without an ADR.
- **Build integrity (ADR-0017):** Node's built-in createHash('sha256') is approved only for deterministic asset checksums and build/source provenance. These unkeyed hashes verify generated bytes; they are not credentials, signatures, authentication, password storage or gameplay authority. No additional crypto library or runtime security primitive is introduced.
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

Verified Deployment adds a second, stricter boundary after Auth. Each of its three endpoints shares the Auth-derived account identity with a fail-closed 10/minute bucket before body consumption or deterministic replay. This account limit supplements rather than replaces the coarse per-IP shield.

- **Fails open by design:** a limiter/DB error is logged and the request is allowed — a limiter outage
  must never take the game down. The decision helper `checkRateLimit()` and window math `rateWindow()`
  are pure and unit-tested (Deno).
- **Residual (accepted):** a distributed many-IP flood is bounded only by Supabase platform limits;
  acceptable at this stage, revisit if abuse appears (see the public threat model,
  `.codearbiter/checkpoints/threat-model-public-2026-06-21.md`).

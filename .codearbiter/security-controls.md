# Security controls

Thin, boundary-focused. This is a casual browser game with **no end-user authentication by
design**; the controls that matter are database write-access and the Edge Function referee.
Extracted from code 2026-06-20.

## Auth / identity

- **No end-user auth** — no login, no sessions, no Supabase Auth (GoTrue), no JWT verification. Identity is a server-minted `crypto.randomUUID()` `playerId` issued at `create_room`/`join_room`, passed in the request body.
- `verify_jwt = false` on **all 10 Edge Functions** (`supabase/config.toml`). They are public POST endpoints. This is acceptable **only because** writes are locked at the database layer (below) and gated in-function.

## Database access — the real control (RLS)

All three tables (`rooms`, `room_actions`, `match_scores`) have **RLS enabled** with a uniform posture:

- **`anon` role: public SELECT (`USING (true)`), zero writes** (`INSERT/UPDATE/DELETE` all `false`). The shipped anon/publishable key can only read.
- **All mutations go through the Edge Functions**, which use a `service_role` client (`getServiceClient()`, `_shared/mod.ts`) that bypasses RLS. The service key never leaves the Deno runtime.

This is the load-bearing control: even with JWT off and CORS open, no client can write a row except via a referee function. Do not weaken these RLS policies, and do not add a client-side path that uses the service-role key.

## Edge Function referee gating (`submit_action`)

Authorization is enforced in-function (it does NOT run physics):

1. **Membership** — submitter's `playerId` must be in `room.players` (else 403).
2. **Turn ownership** — for turn-ending actions, acting seat must equal `room.active_player_index`. A client may proxy a seat only if that seat is a **bot**; it cannot impersonate another human.
3. **Exactly-once** — `UNIQUE(room_id, seq)`; a duplicate insert returns 409 `seq_conflict`.

Known trust observation (accepted under the replayed-log design): the next-turn seat (`nextActiveIndex`) is computed client-side and trusted by the referee (bounds-checked only). The canonical state is the replayed action log, so a wrong index self-corrects; do not turn this into an authorization decision.

## Secrets

- **Approved source: runtime env only.** Edge Functions read `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (`_shared/mod.ts`). Client reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time.
- The `VITE_SUPABASE_ANON_KEY` is **public-by-design** (publishable key, ships in the bundle). The **service-role key must never** appear in client code, committed source, logs, or the bundle.
- `.env` files are gitignored (`.env`, `client/.env`, `supabase/.env`) and confirmed untracked. No hardcoded secret exists in committed source.
- **Ops mismatch to fix:** `supabase/functions/.env.example` names the var `SUPABASE_SECRET_KEYS`, but the loader reads `SUPABASE_SERVICE_ROLE_KEY` — a fresh deploy following the example would fail to load the key. Tracked in `open-tasks.md`.

## Crypto

- **No application crypto** — no signing/hashing/encryption libraries, no Vault/KMS. Banned by default: do not home-roll crypto or introduce a crypto dependency without an ADR.
- Platform CSPRNG is used for **non-security** values only: `crypto.randomUUID()` / `crypto.getRandomValues()` for player IDs, game seeds, and the 4-char room code; Postgres `pgcrypto` only for `gen_random_uuid()`.

## CORS

`Access-Control-Allow-Origin: *` on all functions (`_shared/mod.ts`). Acceptable: there is no cookie-based auth and all writes are gated server-side.

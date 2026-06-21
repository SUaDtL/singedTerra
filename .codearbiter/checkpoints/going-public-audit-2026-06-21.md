# Pre-public exposure audit — 2026-06-21

Evidence that `singedTerra` is safe to flip from private to public. Produced by the `public-ready`
sprint (part 1 of "going public"). This records posture; it changes nothing.

## 1. Secret history scan — CLEAN

Scanned the FULL git history across all branches (`git log -p --all`):

- **JWT-shaped tokens (`eyJ…`):** none.
- **Service-role key assignments (`service_role = "…"`):** none. The key is read only via
  `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` in `supabase/functions/_shared/mod.ts`.
- **`.env` files ever committed:** none. Only `*.env.example` (placeholders) are tracked; real `.env`
  files are gitignored and untracked.

Corroborated by the 2026-06-21 checkpoint sweep (security-reviewer + auth-crypto-reviewer): no secrets
in source or client bundle.

## 2. What is intentionally world-readable (by design)

Making the repo public exposes these — all expected, none a secret:

- **The Supabase project ref and anon key.** The anon key is public by design (it ships in the client
  bundle). Security rests on **Row-Level Security**: all anon writes are denied; every mutation goes
  through a service-role Edge Function. Confirmed: RLS enabled on all three tables (`rooms`,
  `room_actions`, `match_scores`) — anon `SELECT`-only, all writes `false` (migration `001`/`003`).
- **The table schema and Edge Function logic.** Visible, but the referee functions validate turn
  ownership + allocate sequence numbers and never trust client-reported authority for writes
  (`submit_room_action` is `REVOKE … FROM PUBLIC` / `GRANT … TO service_role`).
- **The deterministic engine + game seeds approach.** Public by nature of a client-side game.

## 3. `private: true` is intentionally KEPT

`package.json` has `"private": true`. This is **not** removed for going public — it is unrelated to
GitHub repo visibility. It prevents an accidental `npm publish` of the monorepo. Leave it.

## 4. License & community readiness (this sprint)

- License: **MIT** (`LICENSE` + all three manifests). Public-friendly.
- Added: CI gate (`.github/workflows/ci.yml`), CodeQL (visibility-guarded), Dependabot,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates.

## 5. Residual items — DEFERRED to Sprint B `public-hardening` (do BEFORE the flip)

Going public turns the Supabase project into a discoverable target. Resolve before flipping:

- **Rate limiting (CONFIRM-04).** No application-level rate limiting on the public Edge Functions yet.
  Sprint B implements a limiter (recommended: Postgres counter table, migration 005). Until then the
  only abuse caps are Supabase platform limits.
- **STRIDE threat model** of the public attack surface — `/ca:threat-model`, in Sprint B.
- **ADRs (CONFIRM-05).** Formalize the core invariants for public contributors.

## 6. User actions at flip time (NOT automated — outward-facing / irreversible)

- Flip the repo to public (irreversible: history is cloneable/cacheable instantly). Do this AFTER
  Sprint B's hardening lands.
- Enable branch protection on `main` requiring the `check` + `edge` CI jobs (and CodeQL once public).
  One-liner available on request via `gh api`.
- Set the repo description + topics.
- Confirm/add the canonical "play it live" URL to the README (none is currently linked — left blank
  rather than guessed).

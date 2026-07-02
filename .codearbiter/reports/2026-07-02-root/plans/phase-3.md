# Phase 3 plan — Wave 3 (coverage, infra, observability, performance, typesafety)

Kept/combined work only. Investigate (not filed): coverage-003, coverage-004,
observability-001, observability-002. performance filed 0 (clean).

## Testing
- **edge-fn-test-backfill** (medium, combines coverage-001 + coverage-002) — add Deno tests to
  `supabase/functions/_shared/mod.test.ts`:
  - `withCors` branch coverage — OPTIONS→200, non-POST→405, invalid JSON→400, `optionalBody`
    bypass, `MissingEnvError`→500, and rate-limit allow/deny/**fail-open** (inject the
    `supabase.rpc` call). The fail-open branch is the one most dangerous to regress silently.
  - `reap()` table-driven — within-window kept, exactly-at-`STALE_MS` kept (inclusive),
    just-past dropped, missing-`lastSeen` legacy row dropped, empty array.
  - Effort S. No live Supabase connection required.

## CI / supply chain
- **infra-001** (medium) — pin every `uses:` in the 3 workflows to a 40-char commit SHA
  (trailing `# vX.Y.Z` comment), or enable Dependabot/Renovate SHA-pinning mode. Prioritize
  `deploy-pages.yml` (it injects `VITE_SUPABASE_*` and holds `pages:write`/`id-token:write`).
  Effort S. More urgent as the repo goes public.
- **infra-002** (low) — add `permissions: contents: read` at the top of `ci.yml`. Effort S.
  Naturally batched with infra-001 as one "harden CI workflows" change.

## Type safety
- **typesafety-001** (medium) — remove the `ServiceClient = any` boundary blind spot: either
  (a) `supabase gen types typescript` and parametrize `createClient<Database>()` so
  `.from('rooms').select(...)` returns real row shapes, or (b) route every `.select()` result
  through a per-table runtime parse/validate helper before the `as StoredPlayer[]`/`as StoredOptions`
  cast — mirroring the request-body discipline in `validate.ts`. Effort M. Highest-leverage place
  `tsc` could catch a boundary bug.

## Sequence
1. infra-001 + infra-002 (batch, pre-public hardening, effort S).
2. edge-fn-test-backfill (effort S, isolated test file).
3. typesafety-001 (effort M; enables catching schema drift the tests above would otherwise have to).

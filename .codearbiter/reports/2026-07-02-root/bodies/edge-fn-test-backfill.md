# Backfill Edge Function test coverage: withCors preamble and reap() staleness filter are untested

**Severity:** medium  |  **Confidence:** 0.75  |  **Effort:** S

**Where:**
- supabase/functions/_shared/mod.ts:83-151 (withCors)
- supabase/functions/_shared/mod.ts:350-355 (reap)

**Evidence:**

*withCors untested (coverage-001):* withCors() (mod.ts:122-151) is the shared request preamble imported by all 10 Deno Edge Functions (submit_action, create_room, join_room, leave_room, ready_up, restart_game, finish_game, heartbeat, list_rooms, update_player — confirmed via grep for `withCors(async`). It gates: OPTIONS preflight, non-POST method (405), JSON body parse failure (400), the rate-limit call via `enforceRateLimit` (429 on deny, fail-open on RPC error), and `MissingEnvError` -> 500 mapping. `supabase/functions/_shared/mod.test.ts` (23 Deno.test cases) tests `nextCursor`, `checkRateLimit`, `clientIp`, `rateWindow`, `rateLimitFor`, `isValidColor` — but grep for `withCors(` and `enforceRateLimit` across `supabase/functions/**/*.test.ts` returns zero matches. No test exercises the 405/400/429/500-fail-open/OPTIONS branches of this shared authz-and-shape gate that fronts every mutating endpoint including submit_action.

*reap() untested (coverage-002):* `reap(players, nowMs)` (mod.ts:353) filters out players whose `lastSeen` is older than `STALE_MS` (30000ms); it is used by `join_room/index.ts:80` to decide which stored seats are still occupied (i.e. whether a joining player can claim a freed seat / whether the room is full) and by `list_rooms/index.ts:31` to compute displayed room occupancy. Grep of `mod.test.ts` shows no case named 'reap' and no reference to `reap(` anywhere under `supabase/functions/**/*.test.ts`. The boundary condition (`lastSeen` exactly at `nowMs - STALE_MS`, i.e. `>=` inclusive) and the `lastSeen` undefined/legacy-row default-to-0 branch are both unexercised.

**Impact:** A regression in withCors (e.g. the MissingEnvError catch swallowing an unrelated error, or the rate-limit fail-open silently becoming fail-closed under refactor) would degrade or lock out every Edge Function at once, and nothing in the test suite would catch it before deploy (there is no CI running these tests either per tech-stack.md, so this is the only safety net available). A sign/boundary regression in reap (e.g. flipping `>=` to `>`, or mishandling the `?? 0` default for legacy rows) would silently change whether a disconnected player's seat can be reclaimed — either seats never free up (join blocked) or freeing too eagerly (an active player gets evicted mid-game) — and is data-mutation adjacent (drives room.players writes in join_room).

**Recommendation:** Add a withCors.test.ts that drives the wrapped-handler function directly with a fake Request for each branch: OPTIONS->200, GET->405, malformed-JSON body->400 (and optionalBody:true bypass), a stub handler that throws MissingEnvError->500, and (with enforceRateLimit's supabase.rpc call injectable/mockable) the 429-over-limit and fail-open-on-rpc-error paths. Add table-driven Deno.test cases for reap(): player within window kept, player exactly at the STALE_MS boundary kept (inclusive), player just past the boundary dropped, player with no lastSeen (legacy row) treated as stale/dropped, and an empty players array returns empty.

**Acceptance criteria:**
- A test file exercises each of: OPTIONS 200, non-POST 405, invalid JSON 400, optionalBody bypass, MissingEnvError->500 mapping, and the rate-limit allow/deny/fail-open branches of withCors
- reap() has direct unit tests covering the inclusive boundary and the missing-lastSeen default
- All tests run under the existing `deno test` invocation with no live Supabase connection or DB dependency required

<!-- dedup_key: coverage:supabase/functions/_shared/mod.ts:withCors-untested · finding: coverage-001 -->
<!-- dedup_key: coverage:supabase/functions/_shared/mod.ts:reap-untested · finding: coverage-002 -->

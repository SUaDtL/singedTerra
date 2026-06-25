# Phase 3 — Typing, performance, tests, observability, cleanup

Roadmap only. Broad medium/low quality work; mostly independent, parallelizable.

## Typing the Supabase boundary
- **Group: supabase-typing** · MEDIUM · M — dx-001 (`ServiceClient = any`) + migration-005 (`RoomRow` omits half the columns) + migration-003 (`SupabaseTypes.RoomAction.action` typed fire-only; dx-004 is its duplicate). Generate a `Database` type (`supabase gen types`), use `SupabaseClient<Database>`, complete `RoomRow`, and type `RoomAction.action` as the full `NetworkAction` union. Acceptance: accessing an undeclared column is a TS error; no new `any`.
- **dx-005** · LOW · M — enable `noUncheckedIndexedAccess` in `tsconfig.base.json`; address surfaced sites (notably the `WEAPONS[type]` lookup behind the weapon-brick). Pairs with boundary-action-validation.
- **dx-007** · LOW · S — replace Lobby response non-null assertions with a shape guard surfacing "Unexpected server response".

## Performance
- **performance-001** · MEDIUM · M — `list_rooms` N+1 reap loop → batch into one `DELETE … WHERE id = ANY(...)` + one `UPDATE` (or a `reap_stale_rooms()` plpgsql); pre-filter by `created_at`.
- **performance-002** · MEDIUM · M — AI forward-sim sweep (~13.9k probes hard) → Web Worker and/or coarser grid + early-exit; keep deterministic (re-run harnesses).
- **performance-007** · MEDIUM · M — `computeNextSeat` clones the full engine (720k-byte terrain copy) per turn → derive the next alive seat via a cheap `state.tanks` scan. (Intersects referee-cursor-trust; perf fix is independent.)
- **Group: gradient-caching** · LOW · S — perf-003/004/006: cache fixed-geometry CanvasGradients (explosion/scorch/sun) instead of rebuilding per frame.
- **Group: edge-fn-perf** · LOW · S — perf-009 (narrow `submit_action` `select('*')`) + perf-010 (module-singleton service client).
- **performance-005** · LOW · S — `syncFire` rebuild+sort every burning tick → in-place decrement + rebuild only on ignite/expire (preserve sort order; re-run determinism harnesses).

## Tests
- **Group: edge-fn-test-coverage** · MEDIUM · M — testcov-002/003/004/005/006 + testfid-004: extract pure validators and add hermetic Deno tests for the 6 untested mutating functions; prioritize `ready_up`, `restart_game`, `join_room`; include the ghost-seat gate + nextCursor dead-seat characterization (referee-cursor-trust) and the rpc array-form case.
- **Group: determinism-snapshot** · MEDIUM · S — testfid-001/002/003: expand `determinism.mjs` `serialize()` to include `fire`, the Sprint-4/5/6 tank fields, and round fields; add a napalm-shot determinism variant. Closes blind spots in the flagship determinism guard.
- **testfid-006** · LOW · S — add `lastSeen` to the `list_rooms.test` fixture + a `reap → mapListedRoom` pipeline test.

## Observability & logging
- **Group: rate-limit-observability** · LOW · S — reliability-002 + observability-002: structured `rate_limit: fail-open` log with `{bucket, ip, error}` so a degraded limiter is detectable.
- **Group: edge-logging-context** · LOW · S — observability-003 (log the 409 seq-conflict at info) + observability-007 (thread `roomId` into edge error logs). Do alongside **secrets-001** (log `error.message`, not the full Supabase error object) — same lines.
- **Group: desync-diagnostics** · LOW · S — observability-006 (`console.warn` the "Not your turn" rejection) + observability-008 (warn on a pendingActions seq-gap stall).

## Security/supply-chain hardening (all LOW, effort S unless noted)
- **secrets-002** — larger room-code space (6 chars) or per-room failed-join lockout.
- **secrets-003** — explicit `supabase/functions/.env[.local]` entries in `.gitignore`.
- **secrets-004** — HTTP security headers in `nginx.conf` + `netlify.toml`.
- **secrets-006** · M — commit a `deno.lock` with integrity hashes (or vendor supabase-js).

## Cleanup
- **migration-001** · S — drop the redundant `room_actions(room_id,seq)` index.
- **architecture-002** · S — delete the dead `shared/src/index.ts` barrel (or wire it up + lint-forbid deep imports).
- **architecture-003** · S — delete dead `Tank.create`/`Tank.bounds`.
- **reliability-001** · S — `AudioEngine.dispose()` (tear down napalm nodes + listeners) and fix the stale `reset()` doc reference.

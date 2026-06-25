# Resolutions — run 2026-06-25-root

Disposition of every triaged finding after the post-review action pass on branch
`claude/signed-terra-review-9v2xmp`. Source of truth remains `findings/*.jsonl` +
`triage.jsonl`; this maps them to outcomes.

## ✅ Fixed in branch (commit `e38464b`) — gated by `npm run check` (typecheck + 48 harnesses + new engine-purity guard)

| Finding(s) | Fix |
|---|---|
| migration-004, testcov-001 | **HIGH**: `restart_game` preserves the `ai` flag on rematch (`buildRematchPlayers` + `import.meta.main` guard + `restart_game.test.ts`) |
| migration-003, dx-004 | `SupabaseTypes.RoomAction.action` → full `NetworkAction` union |
| testfid-001/002/003 | `determinism.mjs serialize()` now covers `fire`, round fields, and all Sprint-4/5/6 tank fields |
| reliability-009 | `engine_purity.mjs` CI guard (fails build on wall-clock/`Math.random` in `shared/engine`); wired into `npm run check` |
| performance-009 | `submit_action` narrows `select('*')` → 4 columns |
| secrets-004 | security headers + CSP in `nginx.conf` + `netlify.toml` |
| secrets-003 | explicit `supabase/functions/.env[.local]` in `.gitignore` |
| migration-001 | migration `006` drops the redundant `room_actions(room_id,seq)` index |
| architecture-002 | deleted dead `shared/src/index.ts` barrel |
| architecture-003 | deleted dead `Tank.create` / `Tank.bounds` |

## ✅ Quick-kills also fixed in branch (commit `09e3203`) — from the filed issues

| Finding | Fix | Issue |
|---|---|---|
| observability-004 | global `unhandledrejection`/`error` handler in `main.ts` | #66 (closed) |
| dx-007 | Lobby guards a malformed 200 instead of `!`-asserting undefined room IDs | #70 (partial) |
| reliability-001 | release napalm nodes on teardown (`audio.napalmStop`) + drop stale `reset()` doc | #70 (partial) |
| observability-006 | warn on "Not your turn" with roomId + local active seat | #67 (partial) |
| performance-006 | cache the invariant sun `CanvasGradient` | #68 (partial) |
| performance-010 | lazy per-isolate service-client singleton | #68 (partial) |

Remaining in those issues (left as effort-M / higher-risk): `noUncheckedIndexedAccess` (#70), the rest of the edge logging + secrets-001 (#67), explosion/scorch gradient caching + `syncFire` (#68).

## 📋 Filed as GitHub issues (for future investigation)

| Issue | Title | Findings |
|---|---|---|
| #55 | [ADR] Referee turn-order authority | reliability-003, appsec-001, appsec-004 |
| #56 | Referee weapon validation (room-brick) | dx-003, dx-002 |
| #57 | Fire-recovery robustness (stuck "Sending…") | reliability-005, observability-005 |
| #58 | Tick-cap silent wedge | reliability-006, observability-001 |
| #59 | Type the Supabase boundary | dx-001, migration-005 |
| #60 | Determinism-duplication guards | architecture-001/004/005 |
| #61 | Edge-function test coverage | testcov-002/003/004/005/006, testfid-004/006 |
| #62 | list_rooms N+1 reap | performance-001 |
| #63 | AI forward-sim main-thread cost | performance-002 |
| #64 | computeNextSeat full-engine clone | performance-007 |
| #65 | rate_limits unbounded growth | migration-002 |
| #66 | Global error handler | observability-004 |
| #67 | Observability & logging backlog | reliability-002, observability-002/003/006/007/008, secrets-001 |
| #68 | Performance nits backlog | performance-003/004/005/006/010 |
| #69 | Security & supply-chain hardening | appsec-002/003, secrets-002/006 |
| #70 | Type-safety / DX backlog | dx-005/007, reliability-001 |

## 🚫 Not filed (per triage)

- **Investigate** (below the bar after calibration): reliability-007, reliability-008, secrets-005
- **Defer** (real, trivial): performance-008, dx-006, testfid-005
- **Positive controls** (no defect — evidence the invariants hold): reliability-004, performance-011, migration-006, migration-007

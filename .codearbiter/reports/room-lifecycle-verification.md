# Room lifecycle verification

This repair addresses the owner's report of stale active rooms and selected
ten-minute absence grace. It is separate from the completed finite recovery
scope. The original plan's P-series product improvements remain subsequent work.

Base: `3a2f7eda7fd0738e58a716d43054d377e238e3f7` (PR #476).
Branch: `codex/room-abandonment-lifecycle`. Parent: GPT-6 Astra.
The original dirty checkout and other worktrees are preserved.

## Behavior and causal evidence

| Obligation | Regression and passing evidence |
| --- | --- |
| Active presence | Real Edge handlers originally rejected active heartbeat; the new handler and match-owned client timer tests pass. |
| Explicit quit | Original active leave returned 404. Authenticated leave now marks departure, and the last human retires the room while preserving history. |
| Ten-minute expiry | Disposable PostgreSQL checks the exact cutoff, fresh start/rematch lease, multiple humans, bots, bounded sweep and locked concurrent transitions. |
| Seat authority | Regression reproduced departed legacy/versioned actions, first completion and rematch. Guards now refuse new authority while retaining immutable retries. Positive legacy human and CPU-proxy controls pass. |
| Atomic admission/history | Stale waiting heartbeat/quit and join snapshots could overwrite or delete started games. Locked RPCs and roster CAS protect the transition; actions, credentials and receipts survive retirement. |
| Zero-request scheduler | An actual isolated cron worker demonstrated that the old reaper leaves an active room open. The new worker retires it, repeats harmlessly and exposes a failed job. Production scheduling remains blocked below. |
| Client ownership | Timer disposal, explicit quit versus reload, stale callbacks, missed abandonment broadcast and successor descriptor preservation are covered by client tests. |
| Legacy compatibility | Existing rows are untouched. Capability is negotiated explicitly. Old-schema public projection fallback occurs only for missing `abandoned_at`, never for authorization or unrelated errors. |

The scheduler test uses a cached digest-pinned PostgreSQL 17 image with pg_cron
1.6.4 only inside a disposable container with no network, exposed ports, host
mounts or credentials. It is functional evidence, not approval of that vulnerable
extension for production. The production installer refuses it before scheduling.

## Executed checks

All commands run from this worktree on Windows. Raw logs are retained under
`C:/Users/brenn/AppData/Local/Temp/` with the filenames below.

- `npm run check`: exit 0, including 44 release-contract tests, strict typecheck
  and the deterministic engine harnesses. `room-lifecycle-check.log`.
- `npm run check:edge`: exit 0, 414 passed. `room-lifecycle-edge.log`.
- `npm run coverage:client`: exit 0, 208 files and 1,929 tests; 94.06% lines and
  84.11% branches. `room-lifecycle-coverage.log`.
- `npm run check:database`: exit 0, existing core and interrupted-release suites
  plus lifecycle PostgreSQL checks. `room-lifecycle-database.log`. The lifecycle
  author subsequently added successful legacy human/CPU controls and reran that
  suite with exit 0 (tool receipt `9084a2`).
- `node scripts/checks/room-lifecycle-scheduler.mjs`: exit 0, actual scheduled
  expiry, history preservation, idempotence, observable failure and production
  installer version refusal. `room-lifecycle-scheduler.log`.
- Final `node scripts/checks/room-lifecycle-postgres.mjs`: exit 0 against the
  complete staged lifecycle tests (`befd21`). `room-lifecycle-final-postgres.log`.
- Final `npm run build`: exit 0 with strict typecheck (`642ac5`).
- Browser lifecycle, HUD layout and command-console journeys: 35 passed and
  four existing profile skips (`89d1b5`, exit 0). The original six lifecycle
  assertions first reproduced three failures: Quick chat intercepted Match
  clicks at two layouts, and the touch notice exceeded the viewport. Minimal
  CSS placement/wrapping corrections passed the unchanged assertions.
- Parent repeated all six lifecycle browser cases: 6 passed, zero skips,
  exit 0 (`cd8efe`). `room-lifecycle-final-browser.log`. Desktop and compact
  screenshots were inspected directly. These use intercepted backend replies
  and a prepared rejoin descriptor, not a live multiplayer or newcomer study.
- Final release manifest validation: exit 0 (`10ea8b`). Stateless secret scan
  returned 14 candidates, independently classified as synthetic fixtures and
  redaction assertions. No actual credential was identified.

The project's tech-stack defines client coverage only; it describes engine
verification as "deterministic harnesses in `scripts/checks/*.mjs`" and Edge
verification as "Deno `*.test.ts`". PostgreSQL and scheduler acceptance use the
specific behavior checks above, without an invented coverage percentage.

## Deployment boundary

See [the rollout](../../docs/ROOM_LIFECYCLE_ROLLOUT.md). Migration and functions are
bound by `supabase/backend-release-manifest.json`. The manual scheduler installer
is deliberately separate from that schema-v1 manifest and must be approved by
its own SHA-256:

`2ba7e4865199462c83443a3e11c5c6c1322bceb315c026c575130ee507a6f828`

A read-only production inventory found no installed pg_cron and only versions
through 1.6.4 available. No verified patched upgrade target is established.
Production zero-player scheduling is therefore **not deployed**. Merge, backend
release, scheduler enablement and any retirement of legacy rows each retain their
stated approval and verification boundaries. No production data was changed.

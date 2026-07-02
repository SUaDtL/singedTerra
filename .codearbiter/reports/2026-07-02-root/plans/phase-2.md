# Phase 2 plan — Wave 2 (secrets-supply, migration, test-fidelity)

Kept work only. `migration-002` → `investigate` (see report appendix). test-fidelity filed 0 (clean).

## Data integrity (high) — do first in this wave
- **migration-001** (high) — reap TOCTOU. Add `AND status = 'waiting'` to both the `DELETE` and
  the `UPDATE ... FROM jsonb_to_recordset` in `apply_room_reap` (new migration; do NOT edit 007
  in place — immutability), and add `.eq('status','waiting')` to `ready_up`'s final
  `.update(...).eq('id', roomId)` write. Effort S. Prevents deleting/clobbering a room that flipped
  active in the list_rooms snapshot→RPC window (DELETE cascades to `room_actions`).
  - Acceptance: reap's DELETE + UPDATE both carry `status='waiting'`; a room that flips to active
    between snapshot and reap survives untouched; regression test simulates the interleaving.

## Low-severity hardening (batch)
- **secrets-supply-001** (low) — standardize all `console.error` in `supabase/functions/*/index.ts`
  to log `error?.message ?? error?.code ?? error` (matching submit_action:39 / _shared/mod.ts:95),
  removing raw Postgrest error objects from Edge logs. Effort S. Mechanical sweep across ~9 sites.
- **migration-003** (low) — for `rate_limits_window_idx`: either recreate via
  `CREATE INDEX CONCURRENTLY` in a non-transactional migration step, or add a one-line comment to
  008 explicitly accepting the brief write-lock at current scale. Effort S.

## Sequence
1. migration-001 (data-loss guard) — highest in wave.
2. secrets-supply-001, migration-003 — independent low-effort hardening, can batch.

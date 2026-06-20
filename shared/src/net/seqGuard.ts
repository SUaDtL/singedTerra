/**
 * shouldBufferSeq — pure guard that determines whether an incoming action row
 * should be buffered in the pending-actions map.
 *
 * Returns `true` when `incomingSeq >= nextExpectedSeq`, meaning the row is
 * at or ahead of the next action the engine needs — safe to buffer.
 * Returns `false` for already-applied rows (`incomingSeq < nextExpectedSeq`),
 * which must be DROPPED to prevent the pending-actions map from leaking stale
 * keys that `flushPendingActions` will never consume.
 *
 * This helper lives in `shared/src/net/` so it can be imported by:
 *  - `client/src/client/NetworkClient.ts` (two insertion sites)
 *  - `scripts/checks/*.mjs` harnesses via a relative `.ts` path under `npx tsx`
 *
 * It has ZERO dependencies and MUST stay free of any import (particularly
 * `@supabase/supabase-js`) so harnesses can import it without a Supabase client.
 *
 * Contract proven by: scripts/checks/resync_guard.mjs
 */
export function shouldBufferSeq(incomingSeq: number, nextExpectedSeq: number): boolean {
  return incomingSeq >= nextExpectedSeq;
}

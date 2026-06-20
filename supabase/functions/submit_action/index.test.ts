// submit_action/index.test.ts
//
// Hermetic unit tests for the rpcResultToResponse seam introduced in index.ts.
// No external imports, no live database — all dependencies are mocked inline.
//
// Contract under test (T-08, AC4):
//   rpcResultToResponse({ data, error }) → Response with correct status + body
//
//   (a) data: 7,  error: null            → 200  { seq: 7, ok: true }
//   (b) data: null, error: { code: '23505' } → 409  { ok: false, error: 'seq_conflict', retry: true }
//   (c) data: null, error: { code: 'PGRST116' } → 500  { ok: false, error: 'Failed to submit action' }
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/submit_action/index.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { rpcResultToResponse } from './index.ts'

// ---------------------------------------------------------------------------
// (a) Success path — RPC returns a scalar seq
// ---------------------------------------------------------------------------

Deno.test('rpcResultToResponse: success with scalar data returns 200 { seq, ok: true }', async () => {
  const res = rpcResultToResponse({ data: 7, error: null })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body, { seq: 7, ok: true })
})

// ---------------------------------------------------------------------------
// (b) Postgres unique violation — seq conflict → 409
// ---------------------------------------------------------------------------

Deno.test('rpcResultToResponse: 23505 unique violation returns 409 seq_conflict', async () => {
  const res = rpcResultToResponse({ data: null, error: { code: '23505' } })
  assertEquals(res.status, 409)
  const body = await res.json()
  assertEquals(body, { ok: false, error: 'seq_conflict', retry: true })
})

// ---------------------------------------------------------------------------
// (c) Generic database error → 500
// ---------------------------------------------------------------------------

Deno.test('rpcResultToResponse: generic error returns 500', async () => {
  const res = rpcResultToResponse({ data: null, error: { code: 'PGRST116', message: 'something went wrong' } })
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.ok, false)
  // Must not leak internal details — just confirm the error field is present
  assertEquals(typeof body.error, 'string')
})

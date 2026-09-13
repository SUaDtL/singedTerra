import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { acquireVerificationComputeLease, confirmVerificationComputeLease, releaseEndedVerificationComputeLease,
  type VerificationLeaseRequest, type VerificationComputeLease, type VerificationLeaseRpc } from './verificationComputeLease.ts'

const now = Date.parse('2026-09-13T12:00:00Z')
const request: VerificationLeaseRequest = { accountId: '12345678-1234-4234-8234-123456789abc',
  endpoint: 'complete_verified_challenge', sessionId: '87654321-1234-4234-8234-123456789abc',
  descriptorBinding: 'cq1', transcript: [{ angle: 45, power: 70 }] }
const row = { ok: true, workerId: '11111111-1111-4111-8111-111111111111', fence: 7,
  endpoint: request.endpoint, sessionId: request.sessionId, descriptorBinding: 'cq1',
  expiresAt: '2026-09-13T12:00:10.123456Z', uncertainUntil: '2026-09-13T12:06:50.123456Z' }
const lease: VerificationComputeLease = { ...request, workerId: row.workerId, fence: row.fence,
  expiresAt: row.expiresAt, uncertainUntil: row.uncertainUntil }

Deno.test('native lease admits exact owner/request/fence with separate write expiry and crash cooldown', async () => {
  const calls: unknown[] = []
  const rpc: VerificationLeaseRpc = async (name, args) => { calls.push([name, args]); return { data: row, error: null } }
  assertEquals<unknown>(await acquireVerificationComputeLease(request, rpc, () => now), { kind: 'lease', lease })
  assertEquals(calls, [['acquire_verification_compute_lease', { p_account_id: request.accountId, p_endpoint: request.endpoint,
    p_session_id: request.sessionId, p_descriptor_binding: 'cq1', p_transcript: request.transcript }]])
  const mutable = { ...request, transcript: [{ angle: 45, power: 70 }] }
  const detached = await acquireVerificationComputeLease(mutable, async () => {
    mutable.transcript[0].angle = 180
    return { data: row, error: null }
  }, () => now)
  assertEquals(detached.kind, 'lease')
  if (detached.kind === 'lease') {
    assertEquals(detached.lease.transcript, [{ angle: 45, power: 70 }])
    assert(Object.isFrozen(detached.lease) && Object.isFrozen(detached.lease.transcript))
  }
  for (const candidate of [
    { ...request, endpoint: 'complete_verified_deployment', descriptorBinding: 'deployment-v2' },
    { ...request, endpoint: 'complete_verified_deployment', descriptorBinding: 'deployment-v3' },
    { ...request, endpoint: 'verified_replay_probe', descriptorBinding: 'probe-v1', sessionId: null, transcript: null },
  ] as VerificationLeaseRequest[]) {
    const admitted = await acquireVerificationComputeLease(candidate, async () => ({ data: { ...row,
      endpoint: candidate.endpoint, descriptorBinding: candidate.descriptorBinding, sessionId: candidate.sessionId }, error: null }), () => now)
    assertEquals(admitted.kind, 'lease')
    if (admitted.kind === 'lease') assertEquals(admitted.lease.endpoint, candidate.endpoint)
  }
})

Deno.test('native lease committed challenge receipt fast path survives expiry and binds original account/transcript', async () => {
  const before = { verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 0, totalXp: 0, medals: [] }
  const completedAt = '2026-09-13T11:00:00Z'
  const receipt = { sessionId: request.sessionId, accountId: request.accountId, editionId: 'cq1', transcript: request.transcript,
    outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200, completedAt, careerBeforeLedger: before,
    careerAfterLedger: { ...before, challengeXp: 200, totalXp: 200, medals: [{ entitlementId: 'crosswind-qualification',
      medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1, awardedAt: completedAt, sessionId: request.sessionId }] } }
  const found = await acquireVerificationComputeLease(request, async () => ({ data: { ok: true, receipt }, error: null }),
    () => { throw new Error('receipt must bypass expiry clock') })
  assertEquals(found.kind, 'receipt')
  for (const tampered of [{ ...receipt, accountId: row.workerId }, { ...receipt, transcript: [{ angle: 46, power: 70 }] }])
    assertEquals<unknown>(await acquireVerificationComputeLease(request, async () => ({ data: { ok: true, receipt: tampered }, error: null }), () => now),
      { kind: 'unavailable', reason: 'lease_unavailable' })
})

Deno.test('native lease rejects malformed binding, clocks, unsafe fence and uncertain database responses', async () => {
  for (const invalid of [null, [], {}, { ...row, extra: true }, { ...row, fence: 0 }, { ...row, fence: '7' },
    { ...row, fence: Number.MAX_SAFE_INTEGER + 1 }, { ...row, workerId: 'bad' },
    { ...row, endpoint: 'verified_replay_probe' }, { ...row, sessionId: row.workerId }, { ...row, descriptorBinding: 'deployment-v2' },
    { ...row, expiresAt: '2026-09-13T11:59:59Z' }, { ...row, uncertainUntil: '2026-09-13T12:06:50.123455Z' },
    { ...row, uncertainUntil: '2026-09-13T12:06:50+01:00' }, { ...row, expiresAt: '2026-02-30T12:00:10Z' },
    { ok: false, error: 'secret-database-detail' }, { ok: false, error: 'verification_busy', retryAfter: 0 }]) {
    assertEquals<unknown>(await acquireVerificationComputeLease(request, async () => ({ data: invalid, error: null }), () => now),
      { kind: 'unavailable', reason: 'lease_unavailable' })
  }
  for (const rpc of [async () => ({ data: row, error: 'failure' }), async () => { throw new Error('secret') }])
    assertEquals<unknown>(await acquireVerificationComputeLease(request, rpc, () => now), { kind: 'unavailable', reason: 'lease_unavailable' })
  for (const time of [NaN, Infinity, now + 11000])
    assertEquals<unknown>(await acquireVerificationComputeLease(request, async () => ({ data: row, error: null }), () => time), { kind: 'unavailable', reason: 'lease_unavailable' })
})

Deno.test('native lease preserves bounded busy/domain refusal and denies invalid admission before RPC', async () => {
  assertEquals<unknown>(await acquireVerificationComputeLease(request, async () => ({ data: { ok: false, error: 'verification_busy', retryAfter: 410 }, error: null }), () => now),
    { kind: 'busy', retryAfter: 410 })
  assertEquals<unknown>(await acquireVerificationComputeLease(request, async () => ({ data: { ok: false, error: 'challenge_transcript_conflict' }, error: null }), () => now),
    { kind: 'rejected', code: 'challenge_transcript_conflict' })
  let calls = 0
  for (const invalid of [{ ...request, accountId: 'bad' }, { ...request, transcript: [] },
    { ...request, transcript: [{ angle: 1.5, power: 20 }] }, { ...request, descriptorBinding: 'probe-v1' },
    { ...request, transcript: [{ angle: 1, power: 2, xp: 200 }] }]) {
    assertEquals<unknown>(await acquireVerificationComputeLease(invalid as VerificationLeaseRequest, async () => { calls++; return { data: row, error: null } }, () => now),
      { kind: 'rejected', code: 'invalid_verification_request' })
  }
  assertEquals(calls, 0)
})

Deno.test('native current check and ended-call release send exact identity and fail closed', async () => {
  const calls: unknown[] = []
  const rpc: VerificationLeaseRpc = async (name, args) => { calls.push([name, args]); return { data: true, error: null } }
  assertEquals<unknown>(await confirmVerificationComputeLease(lease, rpc), 'current')
  assertEquals<unknown>(await releaseEndedVerificationComputeLease(lease, rpc), 'released')
  assertEquals(calls, [
    ['verification_compute_lease_is_current', { p_account_id: request.accountId, p_endpoint: request.endpoint, p_session_id: request.sessionId,
      p_descriptor_binding: 'cq1', p_worker_id: row.workerId, p_fence: 7 }],
    ['release_verification_compute_lease', { p_account_id: request.accountId, p_worker_id: row.workerId, p_fence: 7 }],
  ])
  assertEquals<unknown>(await confirmVerificationComputeLease(lease, async () => ({ data: false, error: null })), 'lost')
  assertEquals<unknown>(await releaseEndedVerificationComputeLease(lease, async () => ({ data: false, error: null })), 'not_current')
  for (const response of [{ data: null, error: null }, { data: true, error: 'failure' }, { data: 'true', error: null }]) {
    assertEquals<unknown>(await confirmVerificationComputeLease(lease, async () => response), 'unavailable')
    assertEquals<unknown>(await releaseEndedVerificationComputeLease(lease, async () => response), 'unavailable')
  }
  assert(Object.isFrozen((await acquireVerificationComputeLease(request, rpc, () => now))))
})

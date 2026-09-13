import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleCompleteVerifiedChallenge, type Dependencies } from './index.ts'
import { getVerifiedChallengeArtifact } from '../../../shared/src/verified/challengeArtifacts.ts'
import workload from '../../../scripts/checks/fixtures/verified_challenge_workload.json' with { type: 'json' }
const artifact = getVerifiedChallengeArtifact('cq1')
const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const workerId = '33333333-3333-4333-8333-333333333333'
const transcript = [{ angle: 32, power: 100 }]
const descriptor = { ...artifact.catalog, accountId, sessionId, admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }
const ledger = { verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 0, totalXp: 0, medals: [] }
const completedAt = '2026-09-13T12:01:00.000000Z'
const receipt = { sessionId, accountId, editionId: 'cq1', transcript, outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200,
  completedAt, careerBeforeLedger: ledger, careerAfterLedger: { ...ledger, challengeXp: 200, totalXp: 200,
    medals: [{ entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1, sessionId, awardedAt: completedAt }] } }
const fresh = { ok: true, descriptor, status: 'active', computeAttempts: 0, boundTranscript: null, receipt: null }
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const dependencies: Dependencies = {
    wallNow: () => Date.parse('2026-09-13T12:00:00Z'), now: () => 0,
    rpc: (name, args) => {
      calls.push({ name, args })
      const data = Object.hasOwn(overrides, name) ? overrides[name]
        : name === 'get_verified_challenge' ? fresh
        : name === 'acquire_verification_compute_lease' ? { ok: true, workerId, fence: 7, endpoint: 'complete_verified_challenge', sessionId,
          descriptorBinding: 'cq1', expiresAt: '2026-09-13T12:00:10Z', uncertainUntil: '2026-09-13T12:06:50Z' }
        : name === 'finalize_verified_challenge' ? { ok: true, receipt }
        : name === 'reject_verified_challenge' ? { ...fresh, status: 'invalid', computeAttempts: 1, boundTranscript: args.p_transcript ?? transcript }
        : true
      return Promise.resolve({ data, error: null })
    },
  }
  return { calls, dependencies }
}
const req = new Request('https://example.test')
const invoke = (dependencies: Dependencies, evidence: unknown = transcript) => handleCompleteVerifiedChallenge({ sessionId, transcript: evidence }, req, accountId, dependencies)

Deno.test('challenge completion replays retainedcq1 and dispatches only fenced canonical reward evidence', async () => {
  const f = fixture()
  const response = await invoke(f.dependencies)
  assertEquals(response.status, 200)
  const output = await response.json()
  assertEquals(output.responseVersion, 1)
  assertEquals(output.receipt.xpGranted, 200)
  assertEquals(output.receipt.careerAfter.totalXp, 200)
  assertEquals(f.calls.map(({ name }) => name), ['get_verified_challenge', 'acquire_verification_compute_lease',
    'verification_compute_lease_is_current', 'finalize_verified_challenge', 'release_verification_compute_lease'])
  assertEquals(f.calls[3]?.args, { p_account_id: accountId, p_session_id: sessionId, p_edition_id: 'cq1',
    p_transcript: transcript, p_outcome: 'objective_cleared', p_worker_id: workerId, p_fence: 7 })
})
Deno.test('completed receipt bypasses artifact, replay and lease even after expiry; conflicting transcript refuses', async () => {
  const f = fixture({ get_verified_challenge: { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt } })
  f.dependencies.artifact = () => { throw new Error('artifact must not load') }
  f.dependencies.replay = () => { throw new Error('must not replay') }
  f.dependencies.wallNow = () => Date.parse('2027-01-01T00:00:00Z')
  assertEquals((await invoke(f.dependencies)).status, 200)
  assertEquals(f.calls.map(({ name }) => name), ['get_verified_challenge'])
  assertEquals((await invoke(f.dependencies, [{ angle: 0, power: 0 }])).status, 409)
})
Deno.test('challenge completion refuses busy, lost fence, missing artifact and foreign session without replay', async () => {
  for (const overrides of [
    { acquire_verification_compute_lease: { ok: false, error: 'verification_busy', retryAfter: 410 } },
    { verification_compute_lease_is_current: false },
    { get_verified_challenge: { ...fresh, descriptor: { ...descriptor, accountId: sessionId } } },
  ]) {
    const f = fixture(overrides); let replayed = 0
    f.dependencies.replay = () => { replayed++; return artifact.replayWithWork(transcript) }
    assertEquals((await invoke(f.dependencies)).status, 503); assertEquals(replayed, 0)
    assert(!f.calls.some(({ name }) => name === 'finalize_verified_challenge'))
  }
  const f = fixture(); f.dependencies.artifact = () => { throw new Error('missing') }
  assertEquals((await invoke(f.dependencies)).status, 503)
  assertEquals(f.calls.length, 1)
})
Deno.test('late completed replay cannot finalize, while ended cleanup remains exact', async () => {
  const f = fixture(); let time = 0
  f.dependencies.now = () => time
  f.dependencies.replay = () => { time = 1000; return artifact.replayWithWork(transcript) }
  assertEquals((await invoke(f.dependencies)).status, 503)
  assert(!f.calls.some(({ name }) => name === 'finalize_verified_challenge'))
  assertEquals(f.calls.at(-1)?.name, 'release_verification_compute_lease')
})
Deno.test('incomplete deterministic transcript is persisted invalid, never awarded or freely retried', async () => {
  const invalid = [{ angle: 45, power: 70 }]
  const f = fixture({ reject_verified_challenge: { ...fresh, status: 'invalid', computeAttempts: 1, boundTranscript: invalid } })
  assertEquals((await invoke(f.dependencies, invalid)).status, 409)
  assert(f.calls.some(({ name }) => name === 'reject_verified_challenge'))
  assert(!f.calls.some(({ name }) => name === 'finalize_verified_challenge'))
})

Deno.test('completion refuses body authority, unknown output and malformed persistence without granting a receipt', async () => {
  const malformed = fixture()
  assertEquals((await handleCompleteVerifiedChallenge({ sessionId, transcript, xp: 200 }, req, accountId, malformed.dependencies)).status, 400)
  assertEquals(malformed.calls.length, 0)
  for (const output of [null, {}, { result: {}, work: {} }, { ...artifact.replayWithWork(transcript), work: {} }]) {
    const f = fixture(); f.dependencies.replay = () => output
    assertEquals((await invoke(f.dependencies)).status, 503)
    assert(!f.calls.some(({ name }) => ['finalize_verified_challenge', 'reject_verified_challenge'].includes(name)))
  }
  for (const stored of [null, { ok: true, receipt: { ...receipt, xpGranted: 400 } },
    { ok: true, receipt: { ...receipt, accountId: sessionId } }, { ok: false, error: 'verification_fence_lost' }]) {
    const f = fixture({ finalize_verified_challenge: stored })
    assertEquals((await invoke(f.dependencies)).status, 503)
  }
})

Deno.test('non-awarding work refusal binds full submitted transcript, including unconsumed shots', async () => {
  const full = [{ angle: 32, power: 100 }, { angle: 0, power: 0 }]
  const f = fixture({ finalize_verified_challenge: { ok: true, receipt: { ...receipt, transcript: full,
    outcome: 'work_limit', disposition: 'not_awarded', xpGranted: 0, careerAfterLedger: ledger } } })
  const replayed = artifact.replayWithWork(transcript)
  // Exhaustion during the first human salvo: committed shot, no settlement,
  // discarded health, and charged partial work before the outer engine stopped.
  f.dependencies.replay = () => ({ ...replayed, result: { ...replayed.result, terminal: 'work_limit',
    humanHealth: 0, cpuHealth: 0, events: [{ type: 'terminal', terminal: 'work_limit' }] } })
  const response = await invoke(f.dependencies, full)
  assertEquals(response.status, 200)
  assertEquals((await response.json()).receipt.xpGranted, 0)
  assertEquals(f.calls.find(({ name }) => name === 'finalize_verified_challenge')?.args.p_transcript, full)
})

Deno.test('malformed retained event, objective and work evidence cannot dispatch an award', async () => {
  const original = artifact.replayWithWork(transcript)
  const mutations: ((raw: { result: Record<string, unknown>; work: Record<string, number> }) => void)[] = [
    (raw) => { raw.result.events = [{ type: 'terminal', terminal: 'objective_cleared' }] },
    (raw) => { (raw.result.events as unknown[]).unshift({ type: 'unknown_event' }) },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].extra = true },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].damageToCpu = 0 },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].actor = 'cpu' },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].salvo = 2 },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].ticks = -1 },
    (raw) => { (raw.result.events as Record<string, unknown>[])[0].phase = 'FIRING' },
    (raw) => { raw.result.humanHealth = 0 },
    (raw) => { raw.result.cpuSimulationTicks = 1 },
    (raw) => { raw.result.maximumProbeCount = 1 },
    (raw) => { raw.result.terminal = 'objective_not_cleared'; (raw.result.events as Record<string, unknown>[])[1].terminal = 'objective_not_cleared' },
    (raw) => { for (const key of Object.keys(raw.work)) raw.work[key] = 0 },
    (raw) => { raw.work.engineTicks--; raw.work.totalUnits-- },
    (raw) => { const terminal = { toString: () => 'objective_cleared' }; raw.result.terminal = terminal; (raw.result.events as Record<string, unknown>[])[1].terminal = terminal },
  ]
  for (const mutate of mutations) {
    const raw = structuredClone(original) as unknown as { result: Record<string, unknown>; work: Record<string, number> }
    mutate(raw)
    const f = fixture(); f.dependencies.replay = () => raw
    assertEquals((await invoke(f.dependencies)).status, 503)
    assert(!f.calls.some(({ name }) => ['finalize_verified_challenge', 'reject_verified_challenge'].includes(name)))
  }
})

Deno.test('coordinated zero settlement ticks or CPU probes cannot dispatch an award', async (t) => {
  const zeroTicks = structuredClone(artifact.replayWithWork(transcript))
  const settled = zeroTicks.result.events[0] as unknown as Record<string, unknown>
  settled.ticks = 0
  Object.assign(zeroTicks.result, { liveTicks: 0 })
  for (const key of Object.keys(zeroTicks.work)) (zeroTicks.work as Record<string, number>)[key] = 0

  const scenario = workload.scenarios.find(({ id }) => id === 'third-clear')!
  const zeroProbes = structuredClone({ result: scenario.result, work: scenario.work })
  for (const event of zeroProbes.result.events) if (event.type === 'cpu_selected') event.probeCount = 0
  zeroProbes.result.maximumProbeCount = 0
  zeroProbes.work.totalUnits -= zeroProbes.work.cpuProbes
  zeroProbes.work.cpuProbes = 0
  for (const [name, raw] of [['zero settlement ticks and work', zeroTicks], ['zero CPU probes', zeroProbes]] as const) await t.step(name, async () => {
    const f = fixture(); f.dependencies.replay = () => raw
    assertEquals((await invoke(f.dependencies, raw.result.transcript)).status, 503)
    assert(!f.calls.some(({ name }) => ['finalize_verified_challenge', 'reject_verified_challenge'].includes(name)))
  })
})

Deno.test('all21 retained workload outcomes pass evidence validation with their original transcript and counters', async () => {
  assertEquals(workload.scenarios.length, 21)
  for (const scenario of workload.scenarios) {
    const outcome = scenario.result.terminal
    const cleared = outcome === 'objective_cleared'
    const stored = { ...receipt, transcript: scenario.result.transcript, outcome,
      disposition: cleared ? 'awarded' : 'not_awarded', xpGranted: cleared ? 200 : 0,
      careerAfterLedger: cleared ? receipt.careerAfterLedger : ledger }
    const f = fixture({ finalize_verified_challenge: { ok: true, receipt: stored } })
    // These are retained artifact fixture outputs, not new timing samples.
    f.dependencies.replay = () => ({ result: scenario.result, work: scenario.work })
    assertEquals((await invoke(f.dependencies, scenario.result.transcript)).status, 200, scenario.id)
    assertEquals(f.calls.find(({ name }) => name === 'finalize_verified_challenge')?.args.p_outcome, outcome)
  }
})

Deno.test('CPU event corruption is rejected and partial work refusals preserve unfinished charged plans', async () => {
  const scenario = workload.scenarios.find(({ id }) => id === 'third-clear')!
  for (const key of ['extra', 'angle', 'salvo', 'probeCount', 'coarseBest', 'simulationTicks']) {
    const raw = structuredClone({ result: scenario.result, work: scenario.work })
    const selected = raw.result.events[1] as unknown as Record<string, unknown>
    selected[key] = key === 'coarseBest' ? { angle: 0, power: 0, extra: true } : -1
    const f = fixture(); f.dependencies.replay = () => raw
    assertEquals((await invoke(f.dependencies, scenario.result.transcript)).status, 503, key)
    assert(!f.calls.some(({ name }) => name === 'finalize_verified_challenge'))
  }
  const selected = scenario.result.events[1]
  for (const stage of ['construction', 'plan_before_cpu_fire', 'cpu_in_flight']) {
    const zero = stage === 'construction'
    const inFlight = stage === 'cpu_in_flight'
    const raw = { result: { ...scenario.result, terminal: 'work_limit', humanHealth: 0, cpuHealth: 0,
      humanSalvos: zero ? 0 : 1, cpuSalvos: inFlight ? 1 : 0,
      transcript: zero ? [] : scenario.result.transcript.slice(0, 1),
      liveTicks: zero ? 0 : scenario.result.events[0].ticks! + (inFlight ? 10 : 0),
      cpuSimulationTicks: zero ? 0 : selected.simulationTicks!,
      maximumProbeCount: zero ? 0 : selected.probeCount!,
      events: [...(zero ? [] : scenario.result.events.slice(0, inFlight ? 2 : 1)), { type: 'terminal', terminal: 'work_limit' }],
    }, work: scenario.work }
    const f = fixture({ finalize_verified_challenge: { ok: true, receipt: { ...receipt,
      transcript: scenario.result.transcript, outcome: 'work_limit', disposition: 'not_awarded',
      xpGranted: 0, careerAfterLedger: ledger } } })
    f.dependencies.replay = () => raw
    assertEquals((await invoke(f.dependencies, scenario.result.transcript)).status, 200, stage)
    assertEquals(f.calls.find(({ name }) => name === 'finalize_verified_challenge')?.args.p_transcript, scenario.result.transcript)
  }
})

Deno.test('admission race returns immutable receipt without replay; successful receipt survives cleanup failure', async () => {
  const race = fixture({ acquire_verification_compute_lease: { ok: true, receipt } })
  race.dependencies.replay = () => { throw new Error('must not replay') }
  assertEquals((await invoke(race.dependencies)).status, 200)
  assertEquals(race.calls.length, 2)
  const cleanup = fixture(); const rpc = cleanup.dependencies.rpc!
  cleanup.dependencies.rpc = (name, args) => name === 'release_verification_compute_lease'
    ? Promise.reject(new Error('offline')) : rpc(name, args)
  assertEquals((await invoke(cleanup.dependencies)).status, 200)
})

Deno.test('busy response exposes bounded retry delay, while uncertain async replay retains cooldown', async () => {
  const busy = fixture({ acquire_verification_compute_lease: { ok: false, error: 'verification_busy', retryAfter: 410 } })
  const response = await invoke(busy.dependencies)
  assertEquals(response.status, 503); assertEquals(response.headers.get('Retry-After'), '410')
  assertEquals(response.headers.get('Access-Control-Expose-Headers'), 'Retry-After')
  const uncertain = fixture(); uncertain.dependencies.replay = () => Promise.resolve({})
  assertEquals((await invoke(uncertain.dependencies)).status, 503)
  assert(!uncertain.calls.some(({ name }) => name === 'release_verification_compute_lease'))
})

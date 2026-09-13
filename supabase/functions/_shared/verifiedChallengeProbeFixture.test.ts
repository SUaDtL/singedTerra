import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import corpus from '../../../scripts/checks/fixtures/verified_challenge_workload.json' with { type: 'json' }
import { challengeProbeTranscript, parseChallengeProbeMode, serializeChallengeProbeSample,
  VERIFIED_CHALLENGE_PROBE_FIXTURE_IDS } from './verifiedChallengeProbeFixture.ts'

Deno.test('deployed cq1 probe corpus exactly retains all reviewed fixture inputs, results, events and work', () => {
  assertEquals(VERIFIED_CHALLENGE_PROBE_FIXTURE_IDS, corpus.scenarios.map(({ id }) => id))
  for (const fixture of corpus.scenarios) {
    assertEquals(challengeProbeTranscript(fixture.id), fixture.requestedShots)
    const expected = JSON.stringify({ result: fixture.result, work: fixture.work })
    assertEquals(serializeChallengeProbeSample(fixture.id, JSON.parse(expected)), expected)
    assertEquals(serializeChallengeProbeSample(fixture.id, { result: fixture.result }), null)
    assertEquals(serializeChallengeProbeSample(fixture.id, { result: fixture.result, work: fixture.work, extra: true }), null)
  }
})

Deno.test('cq1 probe inputs are detached and unknown fixtures cannot select work', () => {
  const original = challengeProbeTranscript('first-clear')
  original[0].angle = 180
  original.push({ angle: 90, power: 100 })
  assertEquals(challengeProbeTranscript('first-clear'), [{ angle: 32, power: 100 }])
  assertThrows(() => challengeProbeTranscript('unknown'))
  assertEquals(serializeChallengeProbeSample('unknown', {}), null)
  assertEquals(parseChallengeProbeMode('https://example.test/'), { kind: 'legacy' })
  assertEquals(parseChallengeProbeMode('https://example.test/?legacy=1'), { kind: 'legacy' })
  assertEquals(parseChallengeProbeMode('https://example.test/?mode=cq1&fixture=first-clear'), { kind: 'cq1', fixtureId: 'first-clear' })
})

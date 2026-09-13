// AC01/02/04: exact cq1 admission/descriptor/transcript grammar, not award authority.
// Run: node --import tsx scripts/checks/verified_challenge_contract.mjs
import assert from 'node:assert/strict'
import {
  parseVerifiedChallengeDescriptor, parseVerifiedChallengeCatalog,
  parseVerifiedChallengeStart, parseVerifiedChallengeCompletion,
  parseVerifiedChallengeTranscript, decodeVerifiedChallengeJson as decodeJson,
  parseVerifiedChallengeReceipt,
} from '../../shared/src/net/verifiedChallenge.ts'
import { projectVerifiedCareer } from '../../shared/src/net/verifiedCareer.ts'

// Transport owns the platform UTF-8 dependency; the shared parser owns bounds
// and exact JSON grammar. Fatal decoding is required by this boundary contract.
const decodeVerifiedChallengeJson = (value, maximumBytes) => decodeJson(value, maximumBytes,
  (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes))

const rules = { maxPlayers: 2, humanSeat: 0, rounds: 1, walls: 'wrap', hazards: 'none',
  gravity: 0.15, maxWind: 6, interestRate: 0, suddenDeathTurn: 0, teamMode: false,
  armsLevel: 0, starterWeaponFalloff: 'decisive', weapon: 'baby_missile' }
const limits = { humanSalvos: 3, cpuSalvos: 3, angle: { min: 0, max: 180 },
  power: { min: 0, max: 100 }, sessionSeconds: 1800, computeAttempts: 3 }
const catalog = { descriptorVersion: 1, trialId: 'crosswind-qualification', editionId: 'cq1',
  entitlementId: 'crosswind-qualification', objectiveVersion: 1, verifierArtifactId: 'cq1',
  cpuPolicyId: 'cq1-hard-v3', rewardVersion: 1,
  reward: { medalId: 'crosswind-qualification', xp: 200 }, seed: 42, rules, limits }
const descriptor = { ...catalog, sessionId: '12345678-1234-4234-8234-123456789abc',
  accountId: '87654321-1234-4234-8234-123456789abc', admittedAt: '2026-09-13T12:00:00.000Z',
  expiresAt: '2026-09-13T12:30:00.000Z' }
const start = { trialId: 'crosswind-qualification', supportedDescriptorVersions: [1] }
const transcript = [{ angle: 0, power: 0 }, { angle: 180, power: 100 }, { angle: 90, power: 50 }]
const complete = { sessionId: descriptor.sessionId, transcript }

// Refusal assertions precede positive checks so the permissive scaffold must fail.
assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, seed: 17 }), null, 'AC01 refuses non-cq1 seed')
for (const [parse, valid] of [[parseVerifiedChallengeDescriptor, descriptor],
  [parseVerifiedChallengeCatalog, catalog], [parseVerifiedChallengeStart, start],
  [parseVerifiedChallengeCompletion, complete]]) {
  assert.deepEqual(parse(valid), valid)
  assert.deepEqual(parse(JSON.parse(JSON.stringify(valid))), valid)
  for (const invalid of [null, false, [], 'cq1', { ...valid, surprise: 1 }]) assert.equal(parse(invalid), null)
  for (const key of Object.keys(valid)) {
    const missing = { ...valid }; delete missing[key]
    assert.equal(parse(missing), null, `missing ${key}`)
  }
  assert.ok(Object.isFrozen(parse(valid)))
}
for (const [key, values] of Object.entries({ descriptorVersion: [0, 2, '1'],
  trialId: ['crosswind-range', ''], editionId: ['cq2', 'v3'], entitlementId: ['new-award'],
  objectiveVersion: [2], verifierArtifactId: ['current', 'cq2'], cpuPolicyId: ['v3'],
  rewardVersion: [2], seed: [0, 17, 42.1, NaN, Infinity, '42'] })) {
  for (const value of values) assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, [key]: value }), null)
}
for (const section of ['rules', 'limits', 'reward']) {
  for (const key of Object.keys(descriptor[section])) {
    const altered = structuredClone(descriptor); altered[section][key] = null
    assert.equal(parseVerifiedChallengeDescriptor(altered), null, `${section}.${key}`)
  }
  const extra = structuredClone(descriptor); extra[section].extra = 1
  assert.equal(parseVerifiedChallengeDescriptor(extra), null)
}
for (const range of ['angle', 'power']) {
  const bad = structuredClone(descriptor); bad.limits[range].extra = 1
  assert.equal(parseVerifiedChallengeDescriptor(bad), null)
}
assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, limits: { ...limits, work: { ticks: 45546 } } }), null)
for (const key of ['sessionId', 'accountId']) {
  for (const value of ['', 'not-a-uuid', descriptor[key].toUpperCase(), 4])
    assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, [key]: value }), null)
}
for (const key of ['admittedAt', 'expiresAt']) {
  for (const value of ['', '2026-02-30T12:00:00Z', '2026-09-13T25:00:00Z',
    '2026-09-13', '2026-09-13T12:00:00+01:00', 100])
    assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, [key]: value }), null)
}
for (const expiresAt of ['2026-09-13T12:00:00.000Z', '2026-09-13T11:59:59.999Z', '2026-09-13T12:30:00.001Z'])
  assert.equal(parseVerifiedChallengeDescriptor({ ...descriptor, expiresAt }), null)
assert.ok(parseVerifiedChallengeDescriptor({ ...descriptor, expiresAt: '2026-09-13T12:00:00.001Z' }))
for (const value of [[], [2], [1, 1], [1, 2], ['1'], null])
  assert.equal(parseVerifiedChallengeStart({ ...start, supportedDescriptorVersions: value }), null)
for (const key of ['reward', 'seed', 'entitlementId', 'rules', 'accountId'])
  assert.equal(parseVerifiedChallengeStart({ ...start, [key]: descriptor[key] }), null)
assert.deepEqual(parseVerifiedChallengeTranscript(transcript), transcript)
assert.deepEqual(parseVerifiedChallengeTranscript([{ power: 100, angle: 180 }]), [{ angle: 180, power: 100 }])
for (const invalid of [[], null, {}, [null], Array(4).fill(transcript[0]),
  [{ angle: 1, power: 1, weapon: 'baby_missile' }], [{ angle: 1 }], [{ power: 1 }]])
  assert.equal(parseVerifiedChallengeTranscript(invalid), null)
for (const [key, values] of [['angle', [-1, 181, 0.5, NaN, Infinity, '1']], ['power', [-1, 101, 1.5, NaN, Infinity, '1']]])
  for (const value of values) assert.equal(parseVerifiedChallengeTranscript([{ angle: 1, power: 1, [key]: value }]), null)
const parsed = parseVerifiedChallengeTranscript(transcript)
assert.ok(Object.isFrozen(parsed) && parsed.every(Object.isFrozen))
assert.notEqual(parsed, transcript)
const encode = (value) => new TextEncoder().encode(value)
assert.deepEqual(decodeVerifiedChallengeJson(encode(JSON.stringify(start)), 256), start)
assert.equal(decodeVerifiedChallengeJson(new Uint8Array([0xc3, 0x28]), 256), null)
assert.equal(decodeVerifiedChallengeJson(encode('{'), 256), null)
assert.equal(decodeVerifiedChallengeJson(encode(' '.repeat(257)), 256), null)
assert.equal(decodeVerifiedChallengeJson(encode('"\\ud800"'), 256), null)
assert.equal(decodeVerifiedChallengeJson(encode('{"trialId":"x","trialId":"crosswind-qualification"}'), 256), null)
assert.deepEqual(decodeVerifiedChallengeJson(encode(' '.repeat(254) + '{}'), 256), {})
const completeJson = JSON.stringify(complete)
const completeAtLimit = encode(' '.repeat(2048 - encode(completeJson).length) + completeJson)
assert.equal(completeAtLimit.length, 2048)
assert.deepEqual(parseVerifiedChallengeCompletion(decodeVerifiedChallengeJson(completeAtLimit, 2048)), complete)
assert.equal(decodeVerifiedChallengeJson(encode(' ' + new TextDecoder().decode(completeAtLimit)), 2048), null,
  'otherwise-valid 2049-byte completion is rejected before JSON parsing')
assert.equal(decodeVerifiedChallengeJson(encode('{}'), 999999), null, 'caller cannot widen transport limits')
// T18/T02 / AC04,07: complete receipt shape and ledger transition consistency.
const completedAt = '2026-09-13T12:01:00.123456Z'
const medal = { entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification',
  xp: 200, rewardVersion: 1, awardedAt: completedAt, sessionId: descriptor.sessionId }
const before = projectVerifiedCareer({ verifiedMatches: 3, verifiedWins: 1, replayXp: 400,
  challengeXp: 0, totalXp: 400, medals: [] })
const after = projectVerifiedCareer({ verifiedMatches: 3, verifiedWins: 1, replayXp: 400,
  challengeXp: 200, totalXp: 600, medals: [medal] })
const awarded = { evidence: 'verified_challenge_cq1', sessionId: descriptor.sessionId,
  accountId: descriptor.accountId, editionId: 'cq1', transcript: [{ angle: 45, power: 70 }],
  outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200, completedAt,
  careerBefore: before, careerAfter: after }
const repeat = { ...awarded, sessionId: '11111111-1111-4111-8111-111111111111',
  disposition: 'already_owned', xpGranted: 0, completedAt: '2026-09-13T12:02:00.000000Z',
  careerBefore: after, careerAfter: after }
const failure = { ...awarded, outcome: 'terminal_without_clear', disposition: 'not_awarded',
  xpGranted: 0, careerBefore: before, careerAfter: before }
assert.deepEqual(parseVerifiedChallengeReceipt(awarded), awarded, 'first-clear receipt includes coherent full immutable career snapshots')
for (const valid of [awarded, repeat, failure, { ...failure, outcome: 'objective_not_cleared', transcript },
  { ...failure, outcome: 'work_limit' }, { ...repeat, outcome: 'work_limit', disposition: 'not_awarded' }]) {
  assert.deepEqual(parseVerifiedChallengeReceipt(valid), valid)
  const input = structuredClone(valid)
  const parsedReceipt = parseVerifiedChallengeReceipt(input)
  input.transcript[0].angle = 180
  input.careerAfter.rank.current.title = 'forged'
  input.careerBefore.replay.verifiedMatches = 99
  assert.deepEqual(parsedReceipt, valid, 'detached receipt survives mutation of caller objects')
  const checkFrozen = (value) => {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value))
      Object.values(value).forEach(checkFrozen)
    }
  }
  checkFrozen(parsedReceipt)
  for (const key of Object.keys(valid)) {
    const missing = { ...valid }; delete missing[key]
    assert.equal(parseVerifiedChallengeReceipt(missing), null, `receipt requires ${key}`)
  }
}
for (const invalid of [null, [], {}, { ...awarded, responseVersion: 1 }, { ...awarded, extra: true },
  { ...awarded, evidence: 'verified_replay_v2' }, { ...awarded, editionId: 'cq2' },
  { ...awarded, sessionId: 'bad' }, { ...awarded, accountId: 'bad' },
  { ...awarded, completedAt: '2026-02-30T12:00:00Z' }, { ...awarded, completedAt: '2026-09-13T12:01:00+01:00' },
  { ...awarded, transcript: [] }, { ...awarded, transcript: [{ angle: 45, power: 70, reward: 200 }] },
  { ...awarded, transcript: [{ angle: 0.5, power: 70 }] }, { ...awarded, transcript: Array(4).fill({ angle: 45, power: 70 }) },
  { ...awarded, outcome: 'verification_unavailable' }, { ...awarded, outcome: 'work_limit' },
  { ...failure, outcome: 'objective_not_cleared' },
  { ...awarded, disposition: 'already_owned' }, { ...awarded, xpGranted: 0 },
  { ...awarded, careerBefore: after }, { ...awarded, careerAfter: before },
  { ...repeat, disposition: 'awarded', xpGranted: 200 }, { ...repeat, careerBefore: before },
  { ...repeat, sessionId: descriptor.sessionId }, { ...repeat, completedAt: '2026-09-13T11:00:00Z' },
  { ...failure, xpGranted: 200 }, { ...failure, disposition: 'already_owned' }, { ...failure, careerAfter: after }])
  assert.equal(parseVerifiedChallengeReceipt(invalid), null, 'inconsistent receipt is refused')
for (const transform of [
  (r) => { r.careerAfter.challenge.medals[0].sessionId = repeat.sessionId },
  (r) => { r.careerAfter.challenge.medals[0].awardedAt = '2026-09-13T12:01:00.123455Z' },
  (r) => { r.careerAfter.challenge.medals[0].rewardVersion = 2 },
  (r) => { r.careerAfter.totalXp++ },
  (r) => { r.careerAfter.level = 50 },
  (r) => { r.careerAfter.rank.current.title = 'Scorched Legend' },
  (r) => { r.careerBefore.replay.casualXp = 100 },
  (r) => { r.careerBefore.careerProjectionVersion = 2 },
  (r) => { r.careerAfter = projectVerifiedCareer({ verifiedMatches: 4, verifiedWins: 1, replayXp: 500,
    challengeXp: 200, totalXp: 700, medals: [medal] }) },
]) {
  const tampered = structuredClone(awarded); transform(tampered)
  assert.equal(parseVerifiedChallengeReceipt(tampered), null, 'career and medal tampering refused')
}
const historical = structuredClone(awarded)
projectVerifiedCareer({ verifiedMatches: 30, verifiedWins: 20, replayXp: 5000, challengeXp: 200, totalXp: 5200, medals: [medal] })
assert.deepEqual(parseVerifiedChallengeReceipt(historical), awarded, 'receipt keeps historical facts instead of a current aggregate')
console.log('verified-challenge-contract: PASS (AC01/02/04 grammar and complete immutable career receipt consistency)')

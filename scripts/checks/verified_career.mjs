// AC07: the new career combines only verified ledgers and freezes the legacy curve.
import assert from 'node:assert/strict'
import { projectVerifiedCareer, parseVerifiedCareer } from '../../shared/src/net/verifiedCareer.ts'
import { commanderCareerForVerifiedProgression } from '../../client/src/client/commanderCareer.ts'

const medal = { entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification',
  xp: 200, rewardVersion: 1, awardedAt: '2026-09-13T12:00:00.123456+00:00',
  sessionId: 'b530e4bd-a510-4d2f-8323-47c1b311a2df' }
const ledger = (matches = 0, wins = 0, awarded = false) => ({
  verifiedMatches: matches, verifiedWins: wins, replayXp: 100 * (matches + wins),
  challengeXp: awarded ? 200 : 0, totalXp: 100 * (matches + wins) + (awarded ? 200 : 0),
  medals: awarded ? [{ ...medal }] : [],
})
const first = projectVerifiedCareer(ledger(2, 1, true))
assert.ok(first, 'valid first-clear ledger must produce the selected verified career')
assert.deepEqual(first, {
  careerProjectionVersion: 1, evidence: 'verified_career_v1',
  replay: { verifiedMatches: 2, verifiedWins: 1, xp: 300 },
  challenge: { xp: 200, medals: [medal] }, totalXp: 500,
  level: 2, levelXp: 0, nextLevelXp: 500,
  rank: { current: { code: 'R-02', title: 'Gunner', level: 2,
    insignia: { mark: '◆', label: 'single diamond' } },
  next: { code: 'R-03', title: 'Bombardier', level: 3,
    insignia: { mark: '◆◆', label: 'double diamond' } } },
})
for (const awarded of [false, true]) {
  for (let matches = 0; matches <= 300; matches++) {
    const input = ledger(matches, Math.floor(matches / 2), awarded)
    const result = projectVerifiedCareer(input)
    assert.ok(result)
    assert.equal(result.level, Math.floor(input.totalXp / 500) + 1)
    assert.equal(result.levelXp, input.totalXp % 500)
    assert.equal(result.nextLevelXp, 500)
    assert.deepEqual(result.rank, commanderCareerForVerifiedProgression({
      evidence: 'verified_replay_v2', progressionVersion: 1, level: result.level,
    }))
    assert.deepEqual(parseVerifiedCareer(JSON.parse(JSON.stringify(result))), result)
  }
}
const invalid = [null, [], {}, { ...ledger(), casualXp: 100 },
  { ...ledger(), verifiedMatches: -1 }, { ...ledger(), verifiedWins: 1 },
  { ...ledger(), replayXp: 100 }, { ...ledger(), totalXp: 200 },
  { ...ledger(), challengeXp: 200 }, { ...ledger(0, 0, true), challengeXp: 0 },
  { ...ledger(), verifiedMatches: 0.5 }, { ...ledger(), verifiedWins: NaN },
  ledger(Number.MAX_SAFE_INTEGER), { ...ledger(), medals: [medal, medal] },
]
for (const key of Object.keys(medal)) {
  const missing = { ...medal }; delete missing[key]
  invalid.push({ ...ledger(0, 0, true), medals: [missing] })
}
for (const [key, value] of [['xp', 201], ['rewardVersion', 2], ['entitlementId', 'cq2'],
  ['medalId', 'other'], ['sessionId', 'bad'], ['awardedAt', '2026-02-30T12:00:00Z']]) {
  invalid.push({ ...ledger(0, 0, true), medals: [{ ...medal, [key]: value }] })
}
for (const input of invalid) assert.equal(projectVerifiedCareer(input), null)
for (const [key, value] of [['careerProjectionVersion', 2], ['evidence', 'verified_replay_v2'],
  ['level', 3], ['levelXp', 1], ['totalXp', 501], ['nextLevelXp', 1000],
  ['rank', { current: { code: 'R-10' }, next: null }], ['casualXp', 999]]) {
  assert.equal(parseVerifiedCareer({ ...first, [key]: value }), null)
}
assert.equal(parseVerifiedCareer({ ...first, challenge: { ...first.challenge, xp: 400 } }), null)
assert.equal(parseVerifiedCareer({ ...first, replay: { ...first.replay, xp: 500 } }), null)
const input = ledger(2, 1, true)
const frozen = projectVerifiedCareer(input)
input.medals[0].xp = 999
assert.equal(frozen.challenge.medals[0].xp, 200)
for (const value of [frozen, frozen.replay, frozen.challenge, frozen.challenge.medals,
  frozen.challenge.medals[0], frozen.rank, frozen.rank.current, frozen.rank.current.insignia]) {
  assert.ok(Object.isFrozen(value))
}
assert.throws(() => { frozen.rank.current.title = 'tampered' }, TypeError)
console.log('verified career: exact first-clear projection, 602 legacy rank comparisons, refusal and immutability PASS')

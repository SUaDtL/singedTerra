import { describe, expect, it } from 'vitest'
import { projectVerifiedCareer } from '@shared/net/verifiedCareer'
import { parseVerifiedCareerSummaryResponse } from './verifiedCareer'

const sessionId = '00000000-0000-4000-8000-000000000061'

function career(challengeAwarded = true) {
  return projectVerifiedCareer({
    verifiedMatches: 3,
    verifiedWins: 2,
    replayXp: 500,
    challengeXp: challengeAwarded ? 200 : 0,
    totalXp: challengeAwarded ? 700 : 500,
    medals: challengeAwarded
      ? [{
          entitlementId: 'crosswind-qualification',
          medalId: 'crosswind-qualification',
          xp: 200,
          rewardVersion: 1,
          awardedAt: '2026-09-13T12:30:00.000Z',
          sessionId,
        }]
      : [],
  })!
}

describe('parseVerifiedCareerSummaryResponse', () => {
  it('accepts only the exact version-one wrapper and preserves the frozen replay plus challenge projection', () => {
    const wireCareer = career()
    const parsed = parseVerifiedCareerSummaryResponse({ responseVersion: 1, career: wireCareer })

    expect(parsed).toEqual({ responseVersion: 1, career: wireCareer })
    expect(parsed && Object.isFrozen(parsed)).toBe(true)
    expect(parsed && Object.isFrozen(parsed.career)).toBe(true)
    expect(parsed && Object.isFrozen(parsed.career.replay)).toBe(true)
    expect(parsed && Object.isFrozen(parsed.career.challenge.medals)).toBe(true)
    expect(parsed?.career).not.toBe(wireCareer)
  })

  it.each([
    ['unknown response version', { responseVersion: 2, career: career() }],
    ['missing response version', { career: career() }],
    ['extra broad total', { responseVersion: 1, career: career(), matchesPlayed: 99 }],
    ['casual XP mixed into total', {
      responseVersion: 1,
      career: { ...career(), totalXp: 10_700, level: 22, levelXp: 200 },
    }],
    ['invented challenge match count', {
      responseVersion: 1,
      career: { ...career(), challenge: { ...career().challenge, verifiedMatches: 1 } },
    }],
  ])('rejects %s', (_label, value) => {
    expect(parseVerifiedCareerSummaryResponse(value)).toBeNull()
  })

  it('returns an independent immutable snapshot when the same wire value is parsed again', () => {
    const wire = { responseVersion: 1, career: career(false) }
    const historical = parseVerifiedCareerSummaryResponse(wire)!
    const current = parseVerifiedCareerSummaryResponse(wire)!

    expect(current).toEqual(historical)
    expect(current).not.toBe(historical)
    expect(current.career).not.toBe(historical.career)
    expect(historical.career.challenge.medals).toEqual([])
  })
})

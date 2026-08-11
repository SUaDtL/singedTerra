import { describe, expect, it } from 'vitest'
import {
  commanderCareerForVerifiedProgression,
  commanderPromotionBetweenVerified,
} from './commanderCareer'

const verified = (level: number) => ({
  evidence: 'verified_replay_v1' as const,
  progressionVersion: 1 as const,
  level,
})

describe('commanderCareerForVerifiedProgression', () => {
  it.each([
    [1, 'R-01', 'Cadet', '◇', 'single hollow diamond', 2, 'Gunner'],
    [2, 'R-02', 'Gunner', '◆', 'single diamond', 3, 'Bombardier'],
    [3, 'R-03', 'Bombardier', '◆◆', 'double diamond', 5, 'Artillerist'],
    [4, 'R-03', 'Bombardier', '◆◆', 'double diamond', 5, 'Artillerist'],
    [5, 'R-04', 'Artillerist', '▲', 'single chevron', 7, 'Battery Captain'],
    [7, 'R-05', 'Battery Captain', '▲◆', 'chevron and diamond', 10, 'Siege Major'],
    [10, 'R-06', 'Siege Major', '▲▲', 'double chevron', 14, 'Field Colonel'],
    [14, 'R-07', 'Field Colonel', '★', 'single star', 20, 'War Commander'],
    [20, 'R-08', 'War Commander', '★◆', 'star and diamond', 30, 'Terra Marshal'],
    [30, 'R-09', 'Terra Marshal', '★▲', 'star and chevron', 50, 'Scorched Legend'],
  ])(
    'maps Level %i to %s %s with a stable insignia and next milestone',
    (level, code, title, mark, label, nextLevel, nextTitle) => {
      expect(commanderCareerForVerifiedProgression(verified(level))).toEqual({
        current: { code, title, level: expect.any(Number), insignia: { mark, label } },
        next: {
          code: expect.any(String),
          title: nextTitle,
          level: nextLevel,
          insignia: { mark: expect.any(String), label: expect.any(String) },
        },
      })
    },
  )

  it('keeps the highest authored identity at and beyond its threshold', () => {
    expect(commanderCareerForVerifiedProgression(verified(50))).toEqual({
      current: {
        code: 'R-10',
        title: 'Scorched Legend',
        level: 50,
        insignia: { mark: '★★', label: 'double star' },
      },
      next: null,
    })
    expect(commanderCareerForVerifiedProgression(verified(347))).toEqual({
      current: {
        code: 'R-10',
        title: 'Scorched Legend',
        level: 50,
        insignia: { mark: '★★', label: 'double star' },
      },
      next: null,
    })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed for invalid level %s',
    (level) => {
      expect(commanderCareerForVerifiedProgression(verified(level))).toBeNull()
    },
  )

  it('makes no rank claim from a casual level or casual account summary', () => {
    expect(commanderCareerForVerifiedProgression(5)).toBeNull()
    expect(commanderCareerForVerifiedProgression({
      progressionVersion: 1,
      totalXp: 2_000,
      level: 5,
      levelXp: 0,
      nextLevelXp: 500,
    })).toBeNull()
  })
})

describe('commanderPromotionBetweenVerified', () => {
  it('returns the newly earned identity only when a rank threshold was crossed', () => {
    expect(commanderPromotionBetweenVerified(verified(4), verified(5))).toEqual({
      code: 'R-04',
      title: 'Artillerist',
      level: 5,
      insignia: { mark: '▲', label: 'single chevron' },
    })
    expect(commanderPromotionBetweenVerified(verified(5), verified(6))).toBeNull()
  })

  it('reports the highest earned identity when multiple thresholds are crossed', () => {
    expect(commanderPromotionBetweenVerified(verified(2), verified(10))).toEqual({
      code: 'R-06',
      title: 'Siege Major',
      level: 10,
      insignia: { mark: '▲▲', label: 'double chevron' },
    })
  })

  it.each([
    [0, 1],
    [1, 0],
    [2, 2],
    [3, 2],
    [1.5, 2],
  ])('makes no promotion claim from invalid or non-advancing levels %s → %s', (prior, current) => {
    expect(commanderPromotionBetweenVerified(verified(prior), verified(current))).toBeNull()
  })

  it('makes no promotion claim when either side lacks verified replay evidence', () => {
    expect(commanderPromotionBetweenVerified(verified(4), { level: 5 })).toBeNull()
    expect(commanderPromotionBetweenVerified({ level: 4 }, verified(5))).toBeNull()
  })
})

export interface CommanderInsignia {
  readonly mark: string
  readonly label: string
}

export interface CommanderRank {
  readonly code: string
  readonly title: string
  readonly level: number
  readonly insignia: CommanderInsignia
}

export interface CommanderCareer {
  current: CommanderRank
  next: CommanderRank | null
}

export interface VerifiedCommanderProgression {
  readonly evidence: 'verified_replay_v1'
  readonly progressionVersion: 1
  readonly level: number
}

const COMMANDER_RANKS = [
  { code: 'R-01', title: 'Cadet', level: 1, insignia: { mark: '◇', label: 'single hollow diamond' } },
  { code: 'R-02', title: 'Gunner', level: 2, insignia: { mark: '◆', label: 'single diamond' } },
  { code: 'R-03', title: 'Bombardier', level: 3, insignia: { mark: '◆◆', label: 'double diamond' } },
  { code: 'R-04', title: 'Artillerist', level: 5, insignia: { mark: '▲', label: 'single chevron' } },
  { code: 'R-05', title: 'Battery Captain', level: 7, insignia: { mark: '▲◆', label: 'chevron and diamond' } },
  { code: 'R-06', title: 'Siege Major', level: 10, insignia: { mark: '▲▲', label: 'double chevron' } },
  { code: 'R-07', title: 'Field Colonel', level: 14, insignia: { mark: '★', label: 'single star' } },
  { code: 'R-08', title: 'War Commander', level: 20, insignia: { mark: '★◆', label: 'star and diamond' } },
  { code: 'R-09', title: 'Terra Marshal', level: 30, insignia: { mark: '★▲', label: 'star and chevron' } },
  { code: 'R-10', title: 'Scorched Legend', level: 50, insignia: { mark: '★★', label: 'double star' } },
] as const satisfies readonly CommanderRank[]

function isValidLevel(level: number): boolean {
  return Number.isSafeInteger(level) && level >= 1
}

function isVerifiedProgression(value: unknown): value is VerifiedCommanderProgression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return keys.length === 3
    && keys[0] === 'evidence'
    && keys[1] === 'level'
    && keys[2] === 'progressionVersion'
    && record.evidence === 'verified_replay_v1'
    && record.progressionVersion === 1
    && typeof record.level === 'number'
    && isValidLevel(record.level)
}

function careerForLevel(level: number): CommanderCareer | null {
  if (!isValidLevel(level)) return null

  let currentIndex = 0
  for (let index = 1; index < COMMANDER_RANKS.length; index += 1) {
    const rank = COMMANDER_RANKS[index]
    if (!rank || rank.level > level) break
    currentIndex = index
  }

  const current = COMMANDER_RANKS[currentIndex]
  if (!current) return null
  const next: CommanderRank | undefined = COMMANDER_RANKS[currentIndex + 1]
  return {
    current: { ...current, insignia: { ...current.insignia } },
    next: next ? { ...next, insignia: { ...next.insignia } } : null,
  }
}

export function commanderCareerForVerifiedProgression(
  progression: unknown,
): CommanderCareer | null {
  return isVerifiedProgression(progression) ? careerForLevel(progression.level) : null
}

export function commanderPromotionBetweenVerified(
  priorProgression: unknown,
  currentProgression: unknown,
): CommanderRank | null {
  if (!isVerifiedProgression(priorProgression) || !isVerifiedProgression(currentProgression)) {
    return null
  }
  const priorLevel = priorProgression.level
  const currentLevel = currentProgression.level
  if (!isValidLevel(priorLevel) || !isValidLevel(currentLevel) || currentLevel <= priorLevel) {
    return null
  }
  const prior = careerForLevel(priorLevel)
  const current = careerForLevel(currentLevel)
  if (!prior || !current || prior.current.code === current.current.code) return null
  return current.current
}

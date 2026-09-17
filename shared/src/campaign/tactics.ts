import { computeAiPlan, type AiPlan } from '../engine/AI.ts'
import type { GameEngine } from '../engine/GameEngine.ts'
import type { AiDifficulty, GameState } from '../types/GameState.ts'
import type { PlayerAction } from '../types/PlayerAction.ts'
import type { WeaponType } from '../engine/WeaponSystem.ts'
import { clamp } from '../engine/math.ts'

export const CAMPAIGN_TACTIC_LIMITS = Object.freeze({
  coarseCandidates: 24,
  refinementCandidates: 12,
  maxCandidates: 36,
  maxTicksPerCandidate: 1_200,
} as const)

export interface CampaignTacticMetrics {
  readonly candidatesStarted: number
  readonly candidatesCompleted: number
  readonly candidatesRejectedIncomplete: number
  readonly ticks: number
  readonly clones: number
}

export type CampaignTacticSearchResult = Readonly<{
  status: 'planned' | 'canceled' | 'no-complete-candidate'
  generation: number
  plan: Readonly<AiPlan> | null
  metrics: CampaignTacticMetrics
}>

interface Candidate extends AiPlan { readonly ordinal: number }

function metrics(input: CampaignTacticMetrics): CampaignTacticMetrics {
  return Object.freeze({ ...input })
}

function candidateWeapons(state: GameState, actorId: string, preferred: WeaponType): WeaponType[] {
  const tank = state.tanks.find(({ id }) => id === actorId)
  if (!tank) return []
  const available = Object.entries(tank.inventory)
    .filter(([, ammo]) => ammo && (ammo.unlimited || ammo.count > 0))
    .map(([weapon]) => weapon as WeaponType)
    .filter((weapon) => weapon !== 'shield' && weapon !== 'heavy_shield')
  return [preferred, ...available.filter((weapon) => weapon !== preferred)].slice(0, 3)
}

const COARSE_OFFSETS = Object.freeze([
  [0, 0], [-10, 0], [10, 0], [0, -10], [0, 10], [-6, -6], [6, 6], [-6, 6],
] as const)
const REFINE_OFFSETS = Object.freeze([
  [-4, 0], [4, 0], [0, -4], [0, 4], [-2, -2], [-2, 2], [2, -2], [2, 2],
  [-1, 0], [1, 0], [0, -1], [0, 1],
] as const)

function candidateFrom(base: AiPlan, weapon: WeaponType, offset: readonly [number, number], ordinal: number): Candidate {
  return Object.freeze({
    weapon,
    angle: clamp(base.angle + offset[0], 0, 180),
    power: clamp(base.power + offset[1], 1, 100),
    ordinal,
  })
}

function applyCandidate(engine: GameEngine, candidate: Candidate): boolean {
  const actions: readonly PlayerAction[] = candidate.weapon === 'shield'
    ? [{ type: 'select_weapon', weapon: candidate.weapon }, { type: 'use_shield' }]
    : [
        { type: 'select_weapon', weapon: candidate.weapon },
        { type: 'set_angle', angle: candidate.angle },
        { type: 'set_power', power: candidate.power },
        { type: 'fire' },
      ]
  return actions.every((action) => engine.applyAction(action))
}

export function scoreCampaignTacticOutcome(
  before: GameState,
  after: GameState,
  actorId: string,
): number {
  const humanBefore = before.tanks.find(({ ai }) => !ai)
  const humanAfter = humanBefore && after.tanks.find(({ id }) => id === humanBefore.id)
  const actorBefore = before.tanks.find(({ id }) => id === actorId)
  const actorAfter = after.tanks.find(({ id }) => id === actorId)
  let score = 0
  // The first defender opportunity must remain a response, not an unseen
  // one-turn campaign execution. Later turns value a genuine player/object win.
  if (after.campaign?.result?.outcome === 'failure') {
    const preserveHighRoadObjective = before.campaign?.encounterId === 'high-road'
      && after.campaign.result.reason === 'protected-object'
    score += preserveHighRoadObjective || before.turn <= 1 ? -500_000 : 1_000_000
  }
  if (after.campaign?.result?.outcome === 'success') score -= 1_000_000
  if (after.campaign?.result?.outcome === 'technical-failure') score -= 2_000_000
  if (humanBefore && humanAfter) score += (humanBefore.health - humanAfter.health) * 1_000
  if (actorBefore && actorAfter) score -= (actorBefore.health - actorAfter.health) * 800
  const beforeObjects = new Map((before.campaign?.objects ?? []).map((object) => [object.id, object]))
  for (const object of after.campaign?.objects ?? []) {
    const prior = beforeObjects.get(object.id)
    if (!prior) continue
    const damage = prior.health - object.health
    if (object.kind === 'protected') {
      score += damage * (before.campaign?.encounterId === 'high-road' ? 50 : 5_000)
    }
    else if (object.kind === 'relay') score -= damage * 700
    else score += damage * 10
  }
  return score
}

function settleCandidate(
  engine: GameEngine,
  maxTicks: number,
): Readonly<{ complete: boolean; ticks: number }> {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks >= maxTicks) return Object.freeze({ complete: false, ticks })
    engine.tick()
    ticks += 1
  }
  return Object.freeze({ complete: true, ticks })
}

/** Deterministic, bounded objective-aware campaign search over real engine clones. */
export function computeCampaignTactic(input: Readonly<{
  engine: GameEngine
  actorId: string
  difficulty: AiDifficulty
  generation: number
  isGenerationCurrent: (generation: number) => boolean
  maxTicksPerCandidate?: number
}>): CampaignTacticSearchResult {
  let work: CampaignTacticMetrics = {
    candidatesStarted: 0, candidatesCompleted: 0,
    candidatesRejectedIncomplete: 0, ticks: 0, clones: 0,
  }
  const finish = (
    status: CampaignTacticSearchResult['status'],
    plan: Readonly<AiPlan> | null,
  ): CampaignTacticSearchResult => Object.freeze({
    status, generation: input.generation, plan, metrics: metrics(work),
  })
  if (!input.isGenerationCurrent(input.generation)) return finish('canceled', null)
  const state = input.engine.getState()
  const base = computeAiPlan(
    state,
    input.actorId,
    input.difficulty,
    input.engine.getEffectiveGravity(),
    4,
  )
  if (!base) return finish('no-complete-candidate', null)
  const maxTicks = Math.max(0, Math.min(
    CAMPAIGN_TACTIC_LIMITS.maxTicksPerCandidate,
    Math.floor(input.maxTicksPerCandidate ?? CAMPAIGN_TACTIC_LIMITS.maxTicksPerCandidate),
  ))
  const weapons = base.weapon === 'shield'
    ? [base.weapon]
    : candidateWeapons(state, input.actorId, base.weapon)
  const coarse = weapons.flatMap((weapon, weaponIndex) => COARSE_OFFSETS.map(
    (offset, index) => candidateFrom(base, weapon, offset, weaponIndex * COARSE_OFFSETS.length + index),
  )).slice(0, CAMPAIGN_TACTIC_LIMITS.coarseCandidates)

  const selection: { best: Readonly<{ candidate: Candidate; score: number }> | null } = { best: null }
  const evaluate = (candidate: Candidate): boolean => {
    if (!input.isGenerationCurrent(input.generation)) return false
    const clone = input.engine.clone()
    work = { ...work, candidatesStarted: work.candidatesStarted + 1, clones: work.clones + 1 }
    if (!applyCandidate(clone, candidate)) return true
    const settled = settleCandidate(clone, maxTicks)
    work = { ...work, ticks: work.ticks + settled.ticks }
    if (!settled.complete) {
      work = { ...work, candidatesRejectedIncomplete: work.candidatesRejectedIncomplete + 1 }
      return true
    }
    work = { ...work, candidatesCompleted: work.candidatesCompleted + 1 }
    const changedFromStableFallback = candidate.weapon !== base.weapon
      || candidate.angle !== base.angle || candidate.power !== base.power
    const preserveAuthoredOpening = state.campaign?.encounterId === 'fuel-stop'
      && state.turn <= 1
    const score = scoreCampaignTacticOutcome(state, clone.getState(), input.actorId)
      - (changedFromStableFallback ? (preserveAuthoredOpening ? 2_000_000 : 150_000) : 0)
    if (!selection.best || score > selection.best.score
      || (score === selection.best.score && candidate.ordinal < selection.best.candidate.ordinal)) {
      selection.best = { candidate, score }
    }
    return true
  }
  for (const candidate of coarse) if (!evaluate(candidate)) return finish('canceled', null)
  if (selection.best) {
    const selected = selection.best
    const refined = REFINE_OFFSETS.map((offset, index) => candidateFrom(
      selected.candidate,
      selected.candidate.weapon,
      offset,
      CAMPAIGN_TACTIC_LIMITS.coarseCandidates + index,
    ))
    for (const candidate of refined) if (!evaluate(candidate)) return finish('canceled', null)
  }
  if (!input.isGenerationCurrent(input.generation)) return finish('canceled', null)
  return selection.best
    ? finish('planned', Object.freeze({
        weapon: selection.best.candidate.weapon,
        angle: selection.best.candidate.angle,
        power: selection.best.candidate.power,
      }))
    : finish('no-complete-candidate', null)
}

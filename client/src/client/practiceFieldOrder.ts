import type { GamePhase, TankState } from '@shared/types/GameState'
import type { PlayerAction } from '@shared/types/PlayerAction'
import type { FieldOrderObservation } from './fieldOrder'

type PracticeTank = Pick<TankState, 'id' | 'ai' | 'x' | 'totalDamage'>

/** Minimal local snapshot required to attribute one accepted human shot. */
export interface PracticeFieldOrderSnapshot {
  readonly phase: GamePhase
  readonly activePlayerId: string
  readonly winner: string | null
  readonly tanks: readonly PracticeTank[]
}

export interface PracticeFieldOrderEvidence {
  readonly humanId: string
  readonly startingX: number
  readonly humanSalvos: number
  readonly settledHumanDamage: readonly number[]
  readonly openingPositionDelta: number
  readonly pendingHumanFire: { readonly totalDamageBefore: number; readonly openingPositionDelta: number } | null
}

/** Captures only the primitive facts needed before an in-place engine action mutates state. */
export function snapshotPracticeFieldOrder(snapshot: PracticeFieldOrderSnapshot): PracticeFieldOrderSnapshot {
  return Object.freeze({
    phase: snapshot.phase,
    activePlayerId: snapshot.activePlayerId,
    winner: snapshot.winner,
    tanks: Object.freeze(snapshot.tanks.map((tank) => Object.freeze({
      id: tank.id,
      ai: tank.ai,
      x: tank.x,
      totalDamage: tank.totalDamage,
    }))),
  })
}

function humanFor(snapshot: PracticeFieldOrderSnapshot, humanId: string): PracticeTank | null {
  return snapshot.tanks.find((tank) => tank.id === humanId && !tank.ai) ?? null
}

function activeHuman(snapshot: PracticeFieldOrderSnapshot, humanId: string): PracticeTank | null {
  return snapshot.activePlayerId === humanId ? humanFor(snapshot, humanId) : null
}

/** Starts one local-only practice evidence record from the actual opening snapshot. */
export function createPracticeFieldOrderEvidence(snapshot: PracticeFieldOrderSnapshot): PracticeFieldOrderEvidence | null {
  const human = snapshot.tanks.find((tank) => !tank.ai)
  return human ? Object.freeze({
    humanId: human.id,
    startingX: human.x,
    humanSalvos: 0,
    settledHumanDamage: Object.freeze([]),
    openingPositionDelta: 0,
    pendingHumanFire: null,
  }) : null
}

/**
 * Observes only an action already forwarded to the local client. A fire is
 * accepted only when the before/after engine snapshots show its normal FIRING
 * transition; no predicted action or renderer impact can create a salvo.
 */
export function observePracticeFieldOrderAction(
  evidence: PracticeFieldOrderEvidence,
  action: PlayerAction,
  before: PracticeFieldOrderSnapshot | null,
  after: PracticeFieldOrderSnapshot | null,
): PracticeFieldOrderEvidence {
  if (!before || !after || evidence.pendingHumanFire !== null) return evidence
  const humanBefore = activeHuman(before, evidence.humanId)
  const humanAfter = humanFor(after, evidence.humanId)
  if (!humanBefore || !humanAfter || before.phase !== 'PLAYER_TURN') return evidence
  if (action.type !== 'fire' || after.phase !== 'FIRING') return evidence
  return Object.freeze({
    ...evidence,
    humanSalvos: evidence.humanSalvos + 1,
    openingPositionDelta: evidence.humanSalvos === 0
      ? Math.abs(humanAfter.x - evidence.startingX)
      : evidence.openingPositionDelta,
    pendingHumanFire: Object.freeze({
      totalDamageBefore: humanBefore.totalDamage,
      openingPositionDelta: Math.abs(humanAfter.x - evidence.startingX),
    }),
  })
}

/** Records a single settled human-shot damage delta before later actors can contaminate it. */
export function settlePracticeFieldOrderEvidence(
  evidence: PracticeFieldOrderEvidence,
  snapshot: PracticeFieldOrderSnapshot,
): PracticeFieldOrderEvidence {
  const pending = evidence.pendingHumanFire
  if (!pending || snapshot.phase === 'FIRING' || snapshot.phase === 'RESOLVING') return evidence
  const human = humanFor(snapshot, evidence.humanId)
  const damage = human ? Math.max(0, human.totalDamage - pending.totalDamageBefore) : 0
  return Object.freeze({
    ...evidence,
    settledHumanDamage: Object.freeze([...evidence.settledHumanDamage, damage]),
    openingPositionDelta: evidence.humanSalvos === 1 ? pending.openingPositionDelta : evidence.openingPositionDelta,
    pendingHumanFire: null,
  })
}

/** Projects only public practice facts into the existing Field Order reducer. */
export function practiceFieldOrderObservationFromEvidence(
  evidence: PracticeFieldOrderEvidence,
  snapshot: PracticeFieldOrderSnapshot,
): FieldOrderObservation | null {
  const active = snapshot.tanks.find((tank) => tank.id === snapshot.activePlayerId)
  if (!active) return null
  const winner = snapshot.winner === null ? null : snapshot.tanks.find((tank) => tank.id === snapshot.winner)
  return Object.freeze({
    humanSalvos: evidence.humanSalvos,
    settledHumanDamage: evidence.settledHumanDamage,
    openingPositionDelta: evidence.openingPositionDelta,
    phase: snapshot.phase,
    activeSeat: active.ai ? 'cpu' : 'human',
    winner: winner ? (winner.ai ? 'cpu' : 'human') : null,
  })
}

import type { GameEngine } from '../engine/GameEngine.ts'
import { MAX_FLIGHT_TICKS } from '../engine/Physics.ts'
import type { GameState, TankState } from '../types/GameState.ts'
import type { VerifiedCpuFire, VerifiedHumanFire } from './verifiedDuel.ts'

interface ProbeResult {
  readonly completed: boolean
  readonly opponentDamage: number
  readonly selfDamage: number
  readonly closestDistance: number
  readonly ticks: number
}

export const VERIFIED_DUEL_CPU_MAX_PROBES = 60

function settled(state: GameState): boolean {
  return state.phase !== 'FIRING' && state.phase !== 'RESOLVING'
}

function targetFor(state: GameState, shooter: TankState): TankState | undefined {
  return state.tanks.find((tank) => tank.id !== shooter.id)
}

function simulateProbe(engine: GameEngine, shot: VerifiedHumanFire): ProbeResult | null {
  const clone = engine.clone()
  const before = clone.getState()
  const shooter = before.tanks.find((tank) => tank.id === before.activePlayerId)
  if (!shooter) return null
  const target = targetFor(before, shooter)
  if (!target) return null
  const priorTargetHealth = target.health
  const priorShooterHealth = shooter.health
  clone.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
  clone.applyAction({ type: 'set_angle', angle: shot.angle })
  clone.applyAction({ type: 'set_power', power: shot.power })
  if (!clone.applyAction({ type: 'fire' })) return null
  let ticks = 0
  let closestDistance = Number.POSITIVE_INFINITY
  while (!settled(clone.getState()) && ticks < MAX_FLIGHT_TICKS) {
    const projectile = clone.getState().projectile
    if (projectile) {
      closestDistance = Math.min(closestDistance, Math.hypot(projectile.x - target.x, projectile.y - target.y))
    }
    clone.tick()
    ticks += 1
  }
  if (!settled(clone.getState())) {
    return { completed: false, opponentDamage: 0, selfDamage: 0, closestDistance, ticks }
  }
  const after = clone.getState()
  const afterTarget = after.tanks.find((tank) => tank.id === target.id)
  const afterShooter = after.tanks.find((tank) => tank.id === shooter.id)
  return {
    completed: true,
    opponentDamage: Math.max(0, priorTargetHealth - (afterTarget?.health ?? 0)),
    selfDamage: Math.max(0, priorShooterHealth - (afterShooter?.health ?? 0)),
    closestDistance,
    ticks,
  }
}

function isBetter(candidate: ProbeResult, best: ProbeResult | null): boolean {
  if (!best) return true
  if (candidate.completed !== best.completed) return candidate.completed
  if (!candidate.completed) return false
  const candidateHits = candidate.opponentDamage > 0
  const bestHits = best.opponentDamage > 0
  if (candidateHits !== bestHits) return candidateHits
  if (candidate.opponentDamage !== best.opponentDamage) return candidate.opponentDamage > best.opponentDamage
  if (candidate.selfDamage !== best.selfDamage) return candidate.selfDamage < best.selfDamage
  return candidate.closestDistance < best.closestDistance
}

function uniqueShots(shots: readonly VerifiedHumanFire[]): VerifiedHumanFire[] {
  const seen = new Set<string>()
  return shots.filter((shot) => {
    const key = `${shot.angle}:${shot.power}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function selectVerifiedCpuFireV3(engine: GameEngine): VerifiedCpuFire {
  const state = engine.getState()
  const cpu = state.tanks.find((tank) => tank.id === state.activePlayerId)
  const target = cpu ? targetFor(state, cpu) : undefined
  if (!cpu || !target) return Object.freeze({
    angle: 90, power: 20, weapon: 'baby_missile', probeCount: 0, simulationTicks: 0,
    probes: Object.freeze([]), coarseBest: Object.freeze({ angle: 90, power: 20 }),
  })
  const angles = target.x < cpu.x
    ? [90, 105, 120, 135, 150, 165, 175]
    : [5, 20, 35, 50, 65, 80, 90]
  const coarse = angles.flatMap((angle) => [20, 40, 60, 80, 100].map((power) => ({ angle, power })))
  let simulationTicks = 0
  let best = coarse[0] ?? { angle: 90, power: 20 }
  let bestResult: ProbeResult | null = null
  for (const shot of coarse) {
    const result = simulateProbe(engine, shot)
    simulationTicks += result?.ticks ?? 0
    if (result && isBetter(result, bestResult)) { best = shot; bestResult = result }
  }
  const coarseBest = Object.freeze({ ...best })
  const refinement = [-6, -3, 0, 3, 6].flatMap((angleOffset) =>
    [-8, -4, 0, 4, 8].map((powerOffset) => ({
      angle: Math.max(0, Math.min(180, best.angle + angleOffset)),
      power: Math.max(0, Math.min(100, best.power + powerOffset)),
    })))
  const probes = uniqueShots([...coarse, ...refinement]).slice(0, VERIFIED_DUEL_CPU_MAX_PROBES)
  for (const shot of probes.slice(coarse.length)) {
    const result = simulateProbe(engine, shot)
    simulationTicks += result?.ticks ?? 0
    if (result && isBetter(result, bestResult)) { best = shot; bestResult = result }
  }
  return Object.freeze({
    ...best, weapon: 'baby_missile', probeCount: probes.length, simulationTicks,
    probes: Object.freeze(probes.map((probe) => Object.freeze({ ...probe }))), coarseBest,
  })
}

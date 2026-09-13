// T05: incremental optional work limits, shared clone ownership, and no-budget parity.
// Run: node --import tsx scripts/checks/verification_work_budget.mjs
import assert from 'node:assert/strict'
import { VerificationWorkBudget, VerificationWorkLimitError, VERIFICATION_WORK_KINDS } from '../../shared/src/engine/VerificationWorkBudget.ts'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { buildBitmap, surfaceAt, deform, settleStep, BITMAP_LEN } from '../../shared/src/engine/Terrain.ts'
import { sweepCollide, wrapSideWall } from '../../shared/src/engine/Physics.ts'
import { createVerifiedChallengeOptions } from '../../shared/src/net/verifiedChallengeController.ts'
import { selectVerifiedChallengeCpuFire } from '../../shared/src/net/verifiedCpuPolicyV3.ts'

const limits = (overrides = {}) => ({ ...Object.fromEntries(VERIFICATION_WORK_KINDS.map((kind) => [kind, 1000000000])),
  totalUnits: Number.MAX_SAFE_INTEGER, ...overrides })
for (const invalid of [null, undefined, [], {}, { ...limits(), unexpected: 1 }, limits({ engineTicks: Infinity }),
  limits({ engineTicks: -1 }), limits({ totalUnits: 0.5 })]) {
  assert.throws(() => new VerificationWorkBudget(invalid), /invalid_verification_work_limits/)
}
const source = limits({ engineTicks: 2 })
const budget = new VerificationWorkBudget(source)
source.engineTicks = 100
budget.charge('engineTicks')
budget.charge('engineTicks')
assert.equal(budget.snapshot().engineTicks, 2, 'exactly at the admitted limit succeeds')
assert.throws(() => budget.charge('engineTicks'), VerificationWorkLimitError)
assert.equal(budget.snapshot().engineTicks, 2, 'rejected work is not counted as performed')
assert.throws(() => budget.charge('terrainCells'), VerificationWorkLimitError, 'exhaustion is latched')
assert.ok(Object.isFrozen(budget.snapshot()))
for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
  assert.throws(() => new VerificationWorkBudget(limits()).charge('engineTicks', invalid), /invalid_verification_work_charge/)
assert.throws(() => new VerificationWorkBudget(limits()).charge('unknown'), /invalid_verification_work_charge/)
const total = new VerificationWorkBudget(limits({ totalUnits: 2 }))
total.charge('terrainCells', 2)
assert.throws(() => total.charge('engineTicks'), VerificationWorkLimitError)
const allocation = new VerificationWorkBudget(limits({ allocatedBytes: BITMAP_LEN - 1 }))
assert.throws(() => buildBitmap(new Uint16Array(1200), allocation), VerificationWorkLimitError,
  'bitmap allocation is checked before allocating')
assert.equal(allocation.snapshot().allocatedBytes, 0)
const exactAllocation = new VerificationWorkBudget(limits({ allocatedBytes: BITMAP_LEN }))
assert.equal(buildBitmap(new Uint16Array(1200), exactAllocation).length, BITMAP_LEN)
assert.throws(() => buildBitmap(new Uint16Array(1200), exactAllocation), VerificationWorkLimitError)
const cells = new VerificationWorkBudget(limits({ terrainCells: 3 }))
assert.throws(() => surfaceAt(new Uint8Array(BITMAP_LEN), 0, cells), VerificationWorkLimitError)
assert.equal(cells.snapshot().terrainCells, 3, 'surface scan stops at next pixel, not at result()')
for (const run of [
  (terrain, budget) => deform(terrain, 20, 20, 5, true, budget),
  (terrain, budget) => settleStep(terrain, 0, 0, 4, budget),
]) {
  const terrain = new Uint8Array(BITMAP_LEN)
  const stopped = new VerificationWorkBudget(limits({ terrainCells: 0 }))
  assert.throws(() => run(terrain, stopped), VerificationWorkLimitError)
  assert.equal(terrain.some(Boolean), false, 'no first pixel work after exhausted terrain budget')
}
const sweepBudget = new VerificationWorkBudget(limits())
const terrain = new Uint8Array(BITMAP_LEN)
const projectile = { x: 1205, y: 20, vx: 10, vy: 0, weaponType: 'baby_missile', age: 1 }
const hit = sweepCollide(projectile, 1195, 20, terrain, [], 'wrap', sweepBudget)
assert.equal(hit.type, 'wall')
wrapSideWall(projectile, hit, terrain, [], sweepBudget)
const swept = sweepBudget.snapshot()
assert.equal(swept.sweepSegments, 2, 'both sides of the seam are separately metered')
assert.equal(swept.sweepSamples, 10, 'wrap jump is not swept across the arena')
assert.equal(swept.collisionChecks, 11, 'paired-rail endpoint check is included')
for (const side of [-1, 1]) {
  const previousX = side < 0 ? 0.01 : 1199.99
  const shot = { ...projectile, x: previousX + side * 16.5, y: 36.5, vx: side * 16.5, vy: 16.5 }
  const exactSweep = new VerificationWorkBudget(limits({ sweepSamples: 25 }))
  const contact = sweepCollide(shot, previousX, 20, terrain, [], 'wrap', exactSweep)
  assert.equal(contact.type, 'wall')
  assert.equal(wrapSideWall(shot, contact, terrain, [], exactSweep).type, 'none')
  assert.equal(exactSweep.snapshot().sweepSamples, 25, 'near-seam split can exceed the old 24-sample candidate')
  assert.equal(exactSweep.snapshot().collisionChecks, 26)
  const stopped = new VerificationWorkBudget(limits({ sweepSamples: 24 }))
  const denied = { ...shot, x: previousX + side * 16.5, y: 36.5 }
  const deniedContact = sweepCollide(denied, previousX, 20, terrain, [], 'wrap', stopped)
  assert.throws(() => wrapSideWall(denied, deniedContact, terrain, [], stopped), VerificationWorkLimitError)
  assert.equal(stopped.snapshot().sweepSamples, 24)
}
const options = createVerifiedChallengeOptions()
const engineBudget = new VerificationWorkBudget(limits({ engineTicks: 1 }))
const engine = new GameEngine(options, engineBudget)
const clone = engine.clone()
assert.equal(clone.verificationWorkBudget, engineBudget, 'clones share the exact budget owner')
assert.equal(engineBudget.snapshot().copiedBytes, BITMAP_LEN)
clone.tick()
const beforeRejectedTick = structuredClone(engine.getState())
assert.throws(() => engine.tick(), VerificationWorkLimitError)
assert.deepEqual(engine.getState(), beforeRejectedTick)
assert.throws(() => engine.applyAction({ type: 'set_angle', angle: 1 }), VerificationWorkLimitError)
assert.deepEqual(engine.getState(), beforeRejectedTick, 'latched exhaustion also refuses later action mutation')
const probesBudget = new VerificationWorkBudget(limits({ cpuProbes: 0 }))
const probing = new GameEngine(options, probesBudget)
assert.throws(() => selectVerifiedChallengeCpuFire(probing), VerificationWorkLimitError)
assert.equal(probesBudget.snapshot().copiedBytes, 0, 'probe budget rejects before clone allocation')
const plain = new GameEngine(options)
const metered = new GameEngine(options, new VerificationWorkBudget(limits()))
for (const instance of [plain, metered]) {
  instance.applyAction({ type: 'set_angle', angle: 90 })
  instance.applyAction({ type: 'set_power', power: 0 })
  instance.applyAction({ type: 'fire' })
}
for (let i = 0; i < 391; i++) {
  plain.tick(); metered.tick()
  assert.deepEqual(metered.getState(), plain.getState(), `metered/no-budget tick ${i}`)
  if (plain.getState().phase !== 'FIRING' && plain.getState().phase !== 'RESOLVING') break
}
const beforeCpu = metered.verificationWorkBudget.snapshot()
const cpuPlan = selectVerifiedChallengeCpuFire(metered)
assert.deepEqual(cpuPlan, selectVerifiedChallengeCpuFire(plain), 'metered CPU selection preserves every policy detail')
const afterCpu = metered.verificationWorkBudget.snapshot()
assert.equal(afterCpu.cpuProbes - beforeCpu.cpuProbes, cpuPlan.probeCount)
assert.equal(afterCpu.engineTicks - beforeCpu.engineTicks, cpuPlan.simulationTicks)
assert.equal(afterCpu.copiedBytes - beforeCpu.copiedBytes, BITMAP_LEN * cpuPlan.probeCount)
assert.equal(afterCpu.cpuCandidates - beforeCpu.cpuCandidates, 120 + 2 * cpuPlan.probeCount)
assert.deepEqual(metered.getState(), plain.getState(), 'CPU probes leave the live simulation unchanged')
console.log(JSON.stringify({ kind: 'verification-work-budget-sample', scope: 'one metered human zero-power salvo plus CPU selection, not configured caps', counters: afterCpu }))
console.log('verification-work-budget: PASS (incremental units, clone/probe ownership, seam and terrain accounting, no-budget parity)')

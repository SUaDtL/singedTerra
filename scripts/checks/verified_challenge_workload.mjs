// T07 / AC03,06: trusted work caps, complete finite corpus and terminal refusal.
// Run with node --import tsx. --record explicitly freezes the workload fixture;
// ordinary checks never rewrite fixtures or configure caller-supplied budgets.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import * as challenge from '../../shared/src/net/verifiedChallengeController.ts'
import { VerificationWorkBudget, VerificationWorkLimitError, VERIFICATION_WORK_KINDS }
  from '../../shared/src/engine/VerificationWorkBudget.ts'
import { deform, settleStep, BITMAP_LEN } from '../../shared/src/engine/Terrain.ts'

assert.ok(challenge.VerifiedChallengeController.create().engine.verificationWorkBudget,
  'cq1 controller must meter construction and every replay with its trusted budget')

const { VERIFIED_CHALLENGE_WORK_LIMITS } = await import('../../shared/src/net/verifiedChallengeWorkLimits.ts')
const root = new URL('./', import.meta.url)
const golden = JSON.parse(await readFile(new URL('fixtures/verified_challenge_cq1.json', root), 'utf8'))
const fixtureUrl = new URL('fixtures/verified_challenge_workload.json', root)
const cases = [
  ...golden.scenarios.map(({ id, transcript }) => ({ id, requestedShots: transcript })),
  ...[1, 89, 91, 179].flatMap((angle) => [1, 99, 100].map((power) => ({
    id: `adversarial-${angle}-${power}`, requestedShots: Array.from({ length: 3 }, () => ({ angle, power })),
  }))),
]

function play(requestedShots) {
  const controller = challenge.VerifiedChallengeController.create()
  for (const shot of requestedShots) {
    if (controller.complete) break
    assert.equal(controller.applyHumanAction({ type: 'set_angle', angle: shot.angle }), true)
    assert.equal(controller.applyHumanAction({ type: 'set_power', power: shot.power }), true)
    assert.equal(controller.applyHumanAction({ type: 'fire' }), true)
    while (!controller.complete && !controller.awaitingHuman) controller.tick()
  }
  return { result: controller.result(), work: controller.work }
}

if (process.argv.includes('--record')) {
  const scenarios = cases.map(({ id, requestedShots }) => ({ id, requestedShots, ...play(requestedShots) }))
  await writeFile(fixtureUrl, JSON.stringify({ schema: 'verified-challenge-workload-v1',
    scope: 'Finite adversarial deterministic corpus; observed counts are not configured caps or timing evidence',
    limits: VERIFIED_CHALLENGE_WORK_LIMITS, scenarios }, null, 2) + '\n')
  console.log(`Explicit workload fixture recorded: ${scenarios.length} complete trajectories; no timing claim`)
  process.exit(0)
}

const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'))
assert.equal(fixture.schema, 'verified-challenge-workload-v1')
assert.deepEqual(fixture.limits, VERIFIED_CHALLENGE_WORK_LIMITS)
assert.deepEqual(fixture.scenarios.map(({ id, requestedShots }) => ({ id, requestedShots })), cases)
assert.ok(Object.isFrozen(VERIFIED_CHALLENGE_WORK_LIMITS))
assert.equal(VERIFIED_CHALLENGE_WORK_LIMITS.totalUnits,
  VERIFICATION_WORK_KINDS.reduce((total, kind) => total + VERIFIED_CHALLENGE_WORK_LIMITS[kind], 0))

// Independently exercise the analytical worst crater-depth invariant on a
// contiguous column band. This is a source primitive fixture, not a claimed
// reachable seed-42 gameplay result or an additional benchmark corpus sample.
const columnTerrain = new Uint8Array(BITMAP_LEN)
for (let x = 582; x <= 618; x++) for (let y = 220; y < 600; y++) columnTerrain[y * 1200 + x] = 1
const craterBudget = new VerificationWorkBudget(VERIFIED_CHALLENGE_WORK_LIMITS)
const crater = deform(columnTerrain, 600, 300, 18, false, craterBudget)
assert.deepEqual(crater, { xStart: 582, xEnd: 618, yStart: 282, yEnd: 318 })
let settleCalls = 0
do { settleCalls++ } while (settleStep(columnTerrain, crater.xStart, crater.xEnd, 4, craterBudget))
assert.equal(settleCalls, 11, '37-pixel gap needs ten moving calls plus stationary confirmation')
assert.ok(craterBudget.snapshot().terrainCells <= 37 * 37 + 37 * 48 * 399)
assert.ok(craterBudget.snapshot().terrainSteps <= 37 + 37 * (11 + 48))
for (let x = crater.xStart; x <= crater.xEnd; x++) {
  let sawSolid = false
  for (let y = 0; y < 600; y++) {
    if (columnTerrain[y * 1200 + x]) sawSolid = true
    else assert.equal(sawSolid, false, 'settled terrain restores the contiguous-column induction invariant')
  }
}

for (const scenario of fixture.scenarios) {
  const measured = challenge.replayVerifiedChallengeWithWork(scenario.result.transcript)
  assert.deepEqual(measured, { result: scenario.result, work: scenario.work }, `${scenario.id}: complete replay and counters`)
  assert.notEqual(measured.result.terminal, 'work_limit', `${scenario.id}: analytical caps admit legal path`)
  assert.equal(measured.work.engineTicks, measured.result.liveTicks + measured.result.cpuSimulationTicks)
  assert.equal(measured.work.copiedBytes, measured.work.cpuProbes * 720000)
  for (const [kind, used] of Object.entries(measured.work))
    assert.ok(used <= VERIFIED_CHALLENGE_WORK_LIMITS[kind], `${scenario.id}: ${kind}`)
  const prior = golden.scenarios.find(({ id }) => id === scenario.id)
  if (prior) assert.deepEqual(measured.result, prior.result, `${scenario.id}: T04 golden remains unchanged`)
}

// Test-only fault injection: force the real typed meter refusal at three layers,
// without adding a production constructor accepting arbitrary work overrides.
for (const kind of ['allocatedBytes', 'engineTicks', 'cpuProbes']) {
  const charge = VerificationWorkBudget.prototype.charge
  let discardedEngine
  let controller
  try {
    VerificationWorkBudget.prototype.charge = function (charged, units = 1) {
      if (charged === kind) return charge.call(this, charged, VERIFIED_CHALLENGE_WORK_LIMITS[charged] + 1)
      return charge.call(this, charged, units)
    }
    controller = challenge.VerifiedChallengeController.create()
    if (!controller.complete) {
      discardedEngine = controller.engine
      controller.applyHumanAction({ type: 'set_angle', angle: 90 })
      controller.applyHumanAction({ type: 'set_power', power: 0 })
      controller.applyHumanAction({ type: 'fire' })
      while (!controller.complete && !controller.awaitingHuman) controller.tick()
    }
    assert.equal(controller.result().terminal, 'work_limit', `${kind}: exhaustion never becomes a clear`)
    assert.throws(() => controller.engine, /discarded_verified_challenge_engine/)
    assert.equal(controller.applyHumanAction({ type: 'fire' }), false)
    const stopped = controller.work
    controller.tick()
    assert.deepEqual(controller.work, stopped, 'cannot resume discarded computation')
    if (discardedEngine) assert.throws(() => discardedEngine.tick(), VerificationWorkLimitError, 'latched budget rejects escaped engine')
  } finally { VerificationWorkBudget.prototype.charge = charge }
}
// Infrastructure or programming errors must not be misreported as work limits.
const charge = VerificationWorkBudget.prototype.charge
try {
  VerificationWorkBudget.prototype.charge = function () { throw new Error('unexpected-test-failure') }
  assert.throws(() => challenge.VerifiedChallengeController.create(), /unexpected-test-failure/)
} finally { VerificationWorkBudget.prototype.charge = charge }

console.log(`verified-challenge-workload: PASS (${fixture.scenarios.length} finite complete trajectories, unchanged T04 goldens, trusted caps and discarded exhaustion)`)

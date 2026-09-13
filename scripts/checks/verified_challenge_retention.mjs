// T08/T09: artifact integrity, retained golden/counter parity and mutable-source isolation.
// node --import tsx scripts/checks/verified_challenge_retention.mjs
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { getVerifiedChallengeArtifact } from '../../shared/src/verified/challengeArtifacts.ts'
import { verifyRetained, sha256 } from '../assets/build-verified-challenge.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const manifest = await verifyRetained({ root })
const artifact = getVerifiedChallengeArtifact('cq1')
assert.equal(artifact.sha256, manifest.artifact.sha256)
assert.equal(artifact.editionId, 'cq1')
assert.equal(artifact.artifactApiVersion, 1)
assert.ok(Object.isFrozen(artifact) && Object.isFrozen(artifact.workLimits) && Object.isFrozen(artifact.catalog))
for (const unknown of [undefined, null, '', 'cq2', 'CQ1', {}, { editionId: 'cq1' }])
  assert.throws(() => getVerifiedChallengeArtifact(unknown), /unsupported_verified_challenge_artifact/)
const golden = JSON.parse(await readFile(new URL('./fixtures/verified_challenge_cq1.json', import.meta.url), 'utf8'))
const workload = JSON.parse(await readFile(new URL('./fixtures/verified_challenge_workload.json', import.meta.url), 'utf8'))
assert.deepEqual(artifact.workLimits, workload.limits)

function assertFixtures(module) {
  for (const scenario of golden.scenarios)
    assert.deepEqual(module.replayWithWork(scenario.transcript).result, scenario.result, `${scenario.id}: retained golden`)
  for (const scenario of workload.scenarios)
    assert.deepEqual(module.replayWithWork(scenario.result.transcript), { result: scenario.result, work: scenario.work }, `${scenario.id}: retained work`)
}
assertFixtures(artifact)
const controller = artifact.createController()
assert.ok(Object.isFrozen(controller))
assert.equal('engine' in controller, false)
assert.equal('applyAction' in controller, false)
const snapshot = controller.getState()
assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.tanks) && Object.isFrozen(snapshot.tanks[0]))
snapshot.terrain.fill(0)
assert.notDeepEqual(controller.getState().terrain, snapshot.terrain, 'snapshot buffer cannot mutate engine terrain')
for (const invalid of [{ type: 'move', direction: 1 }, { type: 'select_weapon', weapon: 'missile' },
  { type: 'fire', seed: 9 }, { type: 'set_angle', angle: 90, extra: true }, null])
  assert.equal(controller.applyHumanAction(invalid), false)
for (const batch of [1, 2, 4, 16]) {
  for (const scenario of golden.scenarios) {
    const replay = artifact.createController()
    for (const shot of scenario.transcript) {
      assert.equal(replay.applyHumanAction({ type: 'set_angle', angle: shot.angle }), true)
      assert.equal(replay.applyHumanAction({ type: 'set_power', power: shot.power }), true)
      assert.equal(replay.applyHumanAction({ type: 'fire' }), true)
      let ticks = 0
      while (!replay.complete && !replay.awaitingHuman) {
        for (let i = 0; i < batch; i++) replay.tick()
        assert.ok((ticks += batch) <= 800)
      }
    }
    assert.deepEqual(replay.result(), scenario.result, `${scenario.id}: retained facade batch ${batch}`)
  }
}
for (const malformed of [[], [{ angle: 32, power: 100, seed: 42 }], [{ angle: 32, power: 100 }, { angle: 32, power: 100 }]])
  assert.throws(() => artifact.replayWithWork(malformed))

// Mutate a disposable source copy only. Runtime bytes still loaded from that
// copy's retained file must not follow changed current physics/policy/objective.
const isolated = await mkdtemp(join(tmpdir(), 'singedterra-cq1-retention-'))
try {
  const paths = ['shared/src/verified/retained/cq1.mjs', 'shared/src/verified/retained/cq1.d.mts',
    'shared/src/verified/retained/cq1.manifest.json', 'shared/src/verified/challengeArtifacts.ts']
  for (const path of paths) {
    await mkdir(dirname(resolve(isolated, path)), { recursive: true })
    await copyFile(resolve(root, path), resolve(isolated, path))
  }
  // Deliberately incompatible future source must not affect old cq1. Replacing
  // these modules outright avoids depending on any mutable source's future
  // exports, constants, objective text, or even continued existence.
  for (const path of ['shared/src/engine/Physics.ts', 'shared/src/net/verifiedCpuPolicyV3.ts',
    'shared/src/net/verifiedChallengeController.ts']) {
    await mkdir(dirname(resolve(isolated, path)), { recursive: true })
    await writeFile(resolve(isolated, path), 'throw new Error("changed_mutable_source_executed"); export {};\n')
    await assert.rejects(import(pathToFileURL(resolve(isolated, path)).href), /changed_mutable_source_executed/)
  }
  await verifyRetained({ root: isolated })
  const retainedCopy = await import(pathToFileURL(resolve(isolated, 'shared/src/verified/retained/cq1.mjs')).href)
  assertFixtures(retainedCopy)
  assert.equal(sha256(await readFile(resolve(isolated, 'shared/src/verified/retained/cq1.mjs'))), manifest.artifact.sha256)
} finally { await rm(isolated, { recursive: true, force: true }) }
console.log(`verified-challenge-retention: PASS (${golden.scenarios.length} goldens, ${workload.scenarios.length} work fixtures, four tick batches, detached snapshots, mutable-copy independence)`)

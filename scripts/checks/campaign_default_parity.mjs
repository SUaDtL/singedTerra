// Ash Road T-02 ordinary-mode compatibility oracle (AC-02 / AC-21).
//
// Replays representative non-campaign histories through the production log adapter,
// compares settled snapshots and clone futures with reviewed fixtures, and pins the
// verified deployment tuples plus the retained cq1 artifact bytes.
//
// Run: npx tsx scripts/checks/campaign_default_parity.mjs
// Print reviewed fixture candidates: npx tsx scripts/checks/campaign_default_parity.mjs --print-actual

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { replayNetworkAction } from '../../shared/src/net/replay.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/campaign-default/', import.meta.url))
const fixtureArgument = process.argv.find((value) => value.startsWith('--fixture-dir='))
const FIXTURE_DIR = fixtureArgument
  ? path.resolve(process.cwd(), fixtureArgument.slice('--fixture-dir='.length))
  : DEFAULT_FIXTURE_DIR
const PRINT_ACTUAL = process.argv.includes('--print-actual')
const NEGATIVE_CONTROLS = process.argv.includes('--negative-controls')
const MAX_SETTLE_TICKS = 100_000
const CAMPAIGN_ONLY_KEYS = new Set([
  'campaign',
  'campaignState',
  'commitments',
  'encounterObjects',
  'encounterZones',
  'objectives',
  'warnings',
])

const hashBytes = (value) => createHash('sha256').update(value).digest('hex')
const stableJson = (value) => JSON.stringify(value, (_key, nested) => {
  if (!nested || Array.isArray(nested) || typeof nested !== 'object') return nested
  return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)))
})
const hashJson = (value) => hashBytes(stableJson(value))

function tickToRest(engine, label) {
  let ticks = 0
  while (['FIRING', 'RESOLVING'].includes(engine.getState().phase) && ticks < MAX_SETTLE_TICKS) {
    engine.tick()
    ticks += 1
  }
  assert.ok(ticks < MAX_SETTLE_TICKS, `${label}: engine did not settle`)
  return ticks
}

function applyStep(engine, step, label) {
  if (step.kind === 'action') {
    replayNetworkAction(engine, step.action)
    return tickToRest(engine, label)
  }
  if (step.kind === 'set-tank') {
    const tank = engine.getState().tanks.find((candidate) => candidate.id === step.tankId)
    assert.ok(tank, `${label}: unknown setup tank ${step.tankId}`)
    for (const [key, value] of Object.entries(step.values)) {
      assert.ok(key in tank, `${label}: unknown setup tank field ${key}`)
      tank[key] = structuredClone(value)
    }
    return 0
  }
  throw new Error(`${label}: unknown fixture step ${String(step.kind)}`)
}

function applySteps(engine, steps, label) {
  return steps.reduce((ticks, step, index) => ticks + applyStep(engine, step, `${label}[${index}]`), 0)
}

function canonicalTank(tank) {
  const { inventory, accessories, loadout, ...scalars } = tank
  return {
    ...scalars,
    inventorySha256: hashJson(inventory),
    accessoriesSha256: hashJson(accessories),
    loadoutSha256: hashJson(loadout),
  }
}

function canonicalSnapshot(state) {
  const keys = Object.keys(state).sort()
  const forbidden = keys.filter((key) => CAMPAIGN_ONLY_KEYS.has(key) || key.toLowerCase().startsWith('campaign'))
  assert.deepEqual(forbidden, [], `ordinary snapshot exposed campaign-only keys: ${forbidden.join(', ')}`)
  const materialCounts = [...state.terrain].reduce((counts, pixel) => {
    counts[pixel] = (counts[pixel] ?? 0) + 1
    return counts
  }, {})
  return {
    keys,
    phase: state.phase,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    round: state.round,
    totalRounds: state.totalRounds,
    lastRoundWinnerId: state.lastRoundWinnerId,
    lastRoundWinnerTeam: state.lastRoundWinnerTeam ?? null,
    wind: state.wind,
    walls: state.walls,
    terrain: {
      byteLength: state.terrain.byteLength,
      sha256: hashBytes(state.terrain),
      materialCounts,
      version: state.terrainVersion,
    },
    tankKeys: Object.keys(state.tanks[0] ?? {}).sort(),
    tanks: state.tanks.map(canonicalTank),
    projectiles: state.projectiles,
    projectile: state.projectile,
    lastExplosion: state.lastExplosion,
    explosions: state.explosions,
    wallImpacts: state.wallImpacts,
    fire: state.fire,
    winner: state.winner,
    winnerTeam: state.winnerTeam ?? null,
  }
}

function fixtureSnapshot(state) {
  const canonical = canonicalSnapshot(state)
  return {
    sha256: hashJson(canonical),
    probe: {
      keys: canonical.keys,
      phase: canonical.phase,
      turn: canonical.turn,
      activePlayerId: canonical.activePlayerId,
      round: canonical.round,
      totalRounds: canonical.totalRounds,
      health: canonical.tanks.map((tank) => tank.health),
      shieldHp: canonical.tanks.map((tank) => tank.shieldHp),
      teams: canonical.tanks.map((tank) => tank.team),
      roundWins: canonical.tanks.map((tank) => tank.roundWins),
      credits: canonical.tanks.map((tank) => tank.credits),
      terrainSha256: canonical.terrain.sha256,
      terrainMaterialCounts: canonical.terrain.materialCounts,
    },
  }
}

function replayScenario(scenario) {
  const original = new GameEngine(structuredClone(scenario.options))
  const prefixTicks = applySteps(original, scenario.prefix, `${scenario.id}:prefix`)
  const prefixCanonical = canonicalSnapshot(original.getState())
  const prefix = fixtureSnapshot(original.getState())
  const clone = original.clone()
  assert.deepEqual(canonicalSnapshot(clone.getState()), prefixCanonical, `${scenario.id}: clone checkpoint parity`)

  const originalTicks = applySteps(original, scenario.future, `${scenario.id}:original-future`)
  const cloneTicks = applySteps(clone, scenario.future, `${scenario.id}:clone-future`)
  const futureCanonical = canonicalSnapshot(original.getState())
  const future = fixtureSnapshot(original.getState())
  assert.deepEqual(canonicalSnapshot(clone.getState()), futureCanonical, `${scenario.id}: clone future parity`)
  assert.equal(cloneTicks, originalTicks, `${scenario.id}: clone future settle ticks`)

  return { id: scenario.id, prefixTicks, futureTicks: originalTicks, prefix, future }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(FIXTURE_DIR, relativePath), 'utf8'))
}

async function verifyProvenance(expected) {
  const backendManifest = JSON.parse(await readFile(path.join(ROOT, 'supabase/backend-release-manifest.json'), 'utf8'))
  assert.deepEqual(backendManifest.compatibility.historicalVerifiedTuples, expected.historicalVerifiedTuples,
    'historical verified tuples drifted')
  assert.deepEqual(backendManifest.compatibility.verifiedTuples, expected.verifiedTuples,
    'current verified tuples drifted')
  assert.deepEqual(backendManifest.compatibility.verifiedChallengeEditions, expected.verifiedChallengeEditions,
    'retained challenge edition inventory drifted')

  const retainedManifestPath = path.join(ROOT, 'shared/src/verified/retained/cq1.manifest.json')
  const retainedManifest = JSON.parse(await readFile(retainedManifestPath, 'utf8'))
  const artifactPath = path.join(ROOT, retainedManifest.artifact.path)
  const artifactBytes = await readFile(artifactPath)
  assert.equal((await stat(artifactPath)).size, expected.cq1.bytes, 'retained cq1 byte length drifted')
  assert.equal(hashBytes(artifactBytes), expected.cq1.sha256, 'retained cq1 bytes drifted')
  assert.deepEqual({
    editionId: retainedManifest.editionId,
    artifactApiVersion: retainedManifest.artifactApiVersion,
    bytes: retainedManifest.artifact.bytes,
    sha256: retainedManifest.artifact.sha256,
    integrity: retainedManifest.integrity,
  }, expected.cq1, 'retained cq1 manifest identity drifted')
}

async function runNegativeControls() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'singedterra-campaign-default-negative-'))
  const script = fileURLToPath(import.meta.url)
  const cases = [
    ['damage', (fixture) => { fixture.scenarios[0].expected.prefix.probe.shieldHp[0] += 1 }],
    ['turn', (fixture) => { fixture.scenarios[0].expected.prefix.probe.turn = 999 }],
    ['seed', (fixture) => { fixture.scenarios[0].options.seed += 1 }],
    ['extra-key', (fixture) => { fixture.scenarios[0].expected.prefix.probe.campaignOnlyLeak = true }],
  ]
  try {
    for (const [name, mutate] of cases) {
      const copiedFixtureDir = path.join(scratch, name)
      await cp(DEFAULT_FIXTURE_DIR, copiedFixtureDir, { recursive: true })
      const transcriptPath = path.join(copiedFixtureDir, 'ordinary-transcripts.json')
      const fixture = JSON.parse(await readFile(transcriptPath, 'utf8'))
      mutate(fixture)
      await writeFile(transcriptPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', script, `--fixture-dir=${copiedFixtureDir}`,
      ], { cwd: ROOT, encoding: 'utf8' })
      assert.notEqual(result.status, 0, `${name}: corrupted copied fixture unexpectedly passed`)
      const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/)
      const diagnostic = lines.find((line) => /ordinary compatibility snapshot drifted|AssertionError/.test(line))
        ?? lines.find((line) => line.trim())
        ?? 'non-zero'
      console.log(`negative-control ${name}: rejected (${diagnostic.trim()})`)
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  console.log(`campaign-default-parity negative controls: PASS (${cases.length} copied fixture corruptions rejected)`)
}

if (NEGATIVE_CONTROLS) {
  await runNegativeControls()
  process.exit(0)
}

const transcriptFixture = await readJson('ordinary-transcripts.json')
assert.equal(transcriptFixture.schemaVersion, 1, 'ordinary transcript fixture version')
assert.ok(Array.isArray(transcriptFixture.scenarios) && transcriptFixture.scenarios.length >= 2,
  'ordinary transcript fixture must include both representative scenarios')

const actualScenarios = transcriptFixture.scenarios.map(replayScenario)
if (PRINT_ACTUAL) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, scenarios: transcriptFixture.scenarios.map((scenario, index) => ({
    id: scenario.id,
    options: scenario.options,
    prefix: scenario.prefix,
    future: scenario.future,
    expected: actualScenarios[index],
  })) }, null, 2)}\n`)
  process.exit(0)
}

for (const [index, scenario] of transcriptFixture.scenarios.entries()) {
  assert.deepEqual(actualScenarios[index], scenario.expected, `${scenario.id}: ordinary compatibility snapshot drifted`)
}
await verifyProvenance(await readJson('protected-provenance.json'))

console.log(`campaign-default-parity: PASS (${actualScenarios.length} ordinary transcripts, settled snapshots and clone futures, verified tuples, retained cq1, no campaign keys)`)

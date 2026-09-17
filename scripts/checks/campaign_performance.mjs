import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus, platform, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { CAMPAIGN_CONTRACT_LIMITS } from '../../shared/src/campaign/definitions.ts'
import { CAMPAIGN_EFFECT_LIMITS } from '../../shared/src/campaign/effects.ts'
import { CAMPAIGN_TACTIC_LIMITS, computeCampaignTactic } from '../../shared/src/campaign/tactics.ts'
import { ASH_ROAD_EPISODE } from '../../client/src/campaign/content/episode.ts'
import { FUEL_STOP_TRANSCRIPTS } from '../../client/src/campaign/content/fuel-stop.ts'
import { HIGH_ROAD_TRANSCRIPTS } from '../../client/src/campaign/content/high-road.ts'
import { SALVAGE_PIT_TRANSCRIPTS } from '../../client/src/campaign/content/salvage-pit.ts'
import { RELAY_RIDGE_TRANSCRIPTS } from '../../client/src/campaign/content/relay-ridge.ts'
import {
  CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT,
  parseCampaignReplayCommands,
} from '../../client/src/campaign/runReducer.ts'

const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function round(value) {
  return Math.round(value * 100) / 100
}

function aiFixture() {
  const engine = createCampaignGameEngine({
    encounter: {
      kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
      encounterId: 'performance-ai', combatProfileId: profile.profileId,
      combatProfileVersion: 1, contentDigest: 'd'.repeat(64), seed: 7401,
      terrain: { kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600,
        floorY: 400, points: [{ x: 0, y: 300 }, { x: 1199, y: 300 }] },
      spawns: [
        { id: 'p1', role: 'human', x: 200, hull: 100,
          equipment: ['baby_missile', 'missile', 'shield'] },
        { id: 'p2', role: 'defender', x: 900, hull: 100,
          equipment: ['baby_missile', 'missile', 'cluster_bomb'] },
      ],
      objects: [
        { id: 'refinery', kind: 'protected', x: 300, width: 44, height: 36, health: 100 },
        { id: 'relay', kind: 'relay', x: 700, width: 44, height: 36, health: 100 },
      ],
      objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] }, warning: null,
    },
    combatProfile: profile,
  })
  assert.equal(engine.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
  return engine
}

function measureAi() {
  const durations = []
  const metrics = []
  const engine = aiFixture()
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const started = performance.now()
    const result = computeCampaignTactic({
      engine, actorId: 'p2', difficulty: 'hard', generation: 1,
      isGenerationCurrent: (generation) => generation === 1,
    })
    const duration = performance.now() - started
    assert.equal(result.status, 'planned')
    if (iteration >= 2) {
      durations.push(duration)
      metrics.push(result.metrics)
    }
  }
  return {
    samples: durations.length,
    milliseconds: {
      min: round(Math.min(...durations)),
      p50: round(percentile(durations, 0.5)),
      p95: round(percentile(durations, 0.95)),
      max: round(Math.max(...durations)),
    },
    workMaxima: {
      candidatesStarted: Math.max(...metrics.map(({ candidatesStarted }) => candidatesStarted)),
      candidatesCompleted: Math.max(...metrics.map(({ candidatesCompleted }) => candidatesCompleted)),
      rejectedIncomplete: Math.max(...metrics.map(({ candidatesRejectedIncomplete }) => candidatesRejectedIncomplete)),
      simulationTicks: Math.max(...metrics.map(({ ticks }) => ticks)),
      clones: Math.max(...metrics.map(({ clones }) => clones)),
    },
  }
}

function measureEntry() {
  const durations = []
  for (let pass = 0; pass < 10; pass += 1) {
    for (const encounter of ASH_ROAD_EPISODE.encounters) {
      const started = performance.now()
      const engine = createCampaignGameEngine({ encounter, combatProfile: profile })
      assert.equal(engine.getState().phase, 'PLAYER_TURN')
      durations.push(performance.now() - started)
    }
  }
  return {
    definitionCount: ASH_ROAD_EPISODE.encounters.length,
    samples: durations.length,
    boundary: 'source construction through first controllable PLAYER_TURN; excludes browser/network/cache',
    milliseconds: {
      p50: round(percentile(durations, 0.5)),
      p95: round(percentile(durations, 0.95)),
      max: round(Math.max(...durations)),
    },
  }
}

const transcriptSets = [
  ['fuel-stop', Object.values(FUEL_STOP_TRANSCRIPTS)],
  ['high-road', Object.values(HIGH_ROAD_TRANSCRIPTS)],
  ['salvage-pit', Object.values(SALVAGE_PIT_TRANSCRIPTS)],
  ['relay-ridge', Object.values(RELAY_RIDGE_TRANSCRIPTS)],
]

function measureReplays() {
  const maxima = {
    objects: 0, liveZones: 0, pendingEffects: 0, resolvedEffects: 0,
    projectiles: 0, settlementTicksPerAction: 0, commandsPerTranscript: 0,
  }
  let transcriptCount = 0
  const observe = (state) => {
    maxima.objects = Math.max(maxima.objects, state.campaign?.objects?.length ?? 0)
    maxima.liveZones = Math.max(maxima.liveZones, state.campaign?.zones?.length ?? 0)
    maxima.pendingEffects = Math.max(maxima.pendingEffects, state.campaign?.effects?.pending.length ?? 0)
    maxima.resolvedEffects = Math.max(maxima.resolvedEffects, state.campaign?.effects?.resolved.length ?? 0)
    maxima.projectiles = Math.max(maxima.projectiles, state.projectiles.length)
  }
  for (const [encounterId, transcripts] of transcriptSets) {
    const encounter = ASH_ROAD_EPISODE.encounters.find((value) => value.encounterId === encounterId)
    assert.ok(encounter)
    for (const transcript of transcripts) {
      transcriptCount += 1
      const engine = createCampaignGameEngine({ encounter, combatProfile: profile })
      const commands = []
      observe(engine.getState())
      for (const turn of transcript.turns) {
        for (const action of turn.actions) {
          assert.equal(engine.applyAction(action), true)
          commands.push(action)
          observe(engine.getState())
        }
        let ticks = 0
        while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
          assert.ok(ticks++ < CAMPAIGN_TACTIC_LIMITS.maxTicksPerCandidate)
          engine.tick()
          observe(engine.getState())
        }
        maxima.settlementTicksPerAction = Math.max(maxima.settlementTicksPerAction, ticks)
      }
      const canonicalCommands = parseCampaignReplayCommands(commands)
      assert.ok(canonicalCommands, `${encounterId}: transcript must fit the canonical receipt parser`)
      maxima.commandsPerTranscript = Math.max(maxima.commandsPerTranscript, canonicalCommands.length)
    }
  }
  assert.equal(CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT, 256,
    'performance report and canonical receipt parser must agree on the reviewed cap')
  assert.equal(parseCampaignReplayCommands(Array.from(
    { length: CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT + 1 },
    () => ({ type: 'set_angle', angle: 45 }),
  )), null, 'canonical receipt parser refuses over-limit journals')
  assert.ok(maxima.objects <= CAMPAIGN_CONTRACT_LIMITS.objectsPerEncounter)
  assert.ok(maxima.liveZones <= 4)
  assert.ok(maxima.pendingEffects <= CAMPAIGN_EFFECT_LIMITS.maxQueuedEffects)
  return {
    transcriptCount,
    receiptReplayCommandLimit: CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT,
    maxima,
  }
}

async function artifactManifest(directory, root = directory) {
  const files = []
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await artifactManifest(path, root)).files)
    } else if (entry.isFile()) {
      const bytes = await readFile(path)
      files.push(Object.freeze({
        path: relative(root, path).replaceAll('\\', '/'),
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }))
    } else {
      throw new Error(`unsupported artifact entry: ${path}`)
    }
  }
  const canonical = JSON.stringify(files)
  return Object.freeze({
    fileCount: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    sha256: createHash('sha256').update(canonical).digest('hex'),
    files: Object.freeze(files),
  })
}

const SHA256 = /^[0-9a-f]{64}$/
const REVISION = /^[0-9a-f]{40}$/
const BUILD_COMMAND = 'npm run build --workspace client'
const BUILD_INPUT_PATHS = Object.freeze(['package.json', 'package-lock.json', 'client', 'shared'])

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
}

function gitRaw(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function gitBytes(...args) {
  return execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 })
}

function normalizeLfBytes(bytes) {
  return Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1')
}

function matchesGitBlobBytes(bytes, expectedBytes) {
  return bytes.equals(expectedBytes)
    || normalizeLfBytes(bytes).equals(normalizeLfBytes(expectedBytes))
}

assert.equal(
  matchesGitBlobBytes(Buffer.from('line\r\n'), Buffer.from('line\n')),
  true,
  'source verification permits only LF normalization',
)
assert.equal(
  matchesGitBlobBytes(Buffer.from('changed\n'), Buffer.from('expected\n')),
  false,
  'source verification rejects different Git blob bytes',
)

async function sourceEntry(sourceRoot, path, expectedBlob = null) {
  let bytes
  try {
    bytes = await readFile(resolve(sourceRoot, path))
  } catch (error) {
    if (expectedBlob !== null) throw new Error(`baseline source is missing revision file: ${path}`)
    if (error?.code === 'ENOENT') return Object.freeze({ path, state: 'deleted' })
    throw error
  }
  if (expectedBlob !== null) {
    const expectedBytes = gitBytes('cat-file', 'blob', expectedBlob)
    if (!matchesGitBlobBytes(bytes, expectedBytes)) {
      throw new Error(`baseline source does not match its revision: ${path}`)
    }
  }
  return Object.freeze({
    path,
    state: 'present',
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

function sourceIdentity(baseRevision, entries) {
  const canonical = JSON.stringify({ baseRevision, entries })
  return Object.freeze({
    baseRevision,
    fileCount: entries.length,
    sha256: createHash('sha256').update(canonical).digest('hex'),
  })
}

async function currentSourceIdentity(baseRevision) {
  const paths = [...new Set(gitRaw(
    'ls-files', '-co', '--exclude-standard', '-z', '--', ...BUILD_INPUT_PATHS,
  ).split('\0').filter(Boolean))].sort()
  const entries = []
  for (const path of paths) entries.push(await sourceEntry(resolve('.'), path))
  return sourceIdentity(baseRevision, entries)
}

async function revisionSourceIdentity(sourceRoot, revision) {
  const rows = gitRaw('ls-tree', '-r', '-z', revision, '--', ...BUILD_INPUT_PATHS)
    .split('\0').filter(Boolean)
  const expected = rows.map((row) => {
    const match = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(row)
    if (!match || match[2] !== 'blob') throw new Error(`unsupported revision build input: ${row}`)
    return { path: match[4], blob: match[3] }
  }).sort((left, right) => left.path.localeCompare(right.path))
  const entries = []
  for (const { path, blob } of expected) entries.push(await sourceEntry(sourceRoot, path, blob))
  return sourceIdentity(revision, entries)
}

function parsePerformanceOptions(args) {
  const allowed = new Set([
    'baseline-dist',
    'baseline-source',
    'baseline-revision',
    'baseline-artifact-sha256',
    'baseline-source-sha256',
    'current-revision',
    'current-artifact-sha256',
    'current-source-sha256',
    'build-command',
  ])
  const options = {}
  for (const argument of args) {
    const match = /^--([a-z0-9-]+)=(.+)$/.exec(argument)
    if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) {
      throw new Error(`invalid or duplicate performance option: ${argument}`)
    }
    options[match[1]] = match[2]
  }
  const keys = Object.keys(options)
  if (keys.length === 0) return Object.freeze({ baselineDist: null })
  if (keys.length !== allowed.size || [...allowed].some((key) => !Object.hasOwn(options, key))) {
    throw new Error('baseline comparisons require exact revision, artifact, and build identities')
  }
  if (!REVISION.test(options['baseline-revision']) || !REVISION.test(options['current-revision'])
    || !SHA256.test(options['baseline-artifact-sha256'])
    || !SHA256.test(options['baseline-source-sha256'])
    || !SHA256.test(options['current-artifact-sha256'])
    || !SHA256.test(options['current-source-sha256'])
    || options['build-command'] !== BUILD_COMMAND) {
    throw new Error('invalid performance comparison identity')
  }
  return Object.freeze({
    baselineDist: resolve(options['baseline-dist']),
    baselineSource: resolve(options['baseline-source']),
    baselineRevision: options['baseline-revision'],
    baselineArtifactSha256: options['baseline-artifact-sha256'],
    baselineSourceSha256: options['baseline-source-sha256'],
    currentRevision: options['current-revision'],
    currentArtifactSha256: options['current-artifact-sha256'],
    currentSourceSha256: options['current-source-sha256'],
    buildCommand: options['build-command'],
  })
}

function verifyArtifactIdentity(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label} artifact identity mismatch: ${actual}`)
}

assert.throws(
  () => parsePerformanceOptions(['--baseline-dist=client/dist']),
  /require exact revision, artifact, and build identities/,
  'partial comparison identities fail closed',
)
assert.throws(
  () => parsePerformanceOptions(['--unknown=value']),
  /invalid or duplicate performance option/,
  'unknown comparison options fail closed',
)

const performanceOptions = parsePerformanceOptions(process.argv.slice(2))

function artifactIdentity({ revision, source, manifest, buildCommand, verified }) {
  const binding = JSON.stringify({
    revision,
    sourceSha256: source.sha256,
    buildCommand,
    artifactSha256: manifest.sha256,
  })
  return {
    revision,
    sourceFileCount: source.fileCount,
    sourceSha256: source.sha256,
    buildCommand,
    fileCount: manifest.fileCount,
    bytes: manifest.bytes,
    sha256: manifest.sha256,
    bindingSha256: createHash('sha256').update(binding).digest('hex'),
    verified,
  }
}

async function bundleMeasurement() {
  const currentDist = resolve('client/dist')
  const artDir = resolve('client/public/art/campaign')
  const currentManifest = await artifactManifest(currentDist)
  const artManifest = await artifactManifest(artDir)
  const currentRevision = git('rev-parse', 'HEAD')
  const currentSource = await currentSourceIdentity(currentRevision)
  assert.deepEqual(await currentSourceIdentity(currentRevision), currentSource,
    'current build-input identity must be stable across repeated reads')
  const currentDirty = git('status', '--porcelain=v1', '--untracked-files=all').length > 0
  if (!performanceOptions.baselineDist) {
    return {
      currentProductionDistBytes: currentManifest.bytes,
      campaignArtBytes: artManifest.bytes,
      baselineProductionDistBytes: null,
      productionDistDeltaBytes: null,
      currentArtifact: artifactIdentity({
        revision: currentRevision,
        source: currentSource,
        manifest: currentManifest,
        buildCommand: BUILD_COMMAND,
        verified: false,
      }),
      baselineArtifact: null,
      currentWorkingTreeDirty: currentDirty,
      comparison: 'baseline not supplied; exact comparison requires all identity flags reported by --help documentation in this source',
    }
  }
  const baselineRevision = git('rev-parse', 'origin/main')
  assert.equal(performanceOptions.baselineRevision, baselineRevision,
    'baseline revision must resolve to current origin/main')
  assert.equal(performanceOptions.currentRevision, currentRevision,
    'current revision must resolve to HEAD')
  assert.equal(performanceOptions.baselineDist, resolve(performanceOptions.baselineSource, 'client/dist'),
    'baseline artifact must be the dist owned by the verified baseline source')
  const baselineSource = await revisionSourceIdentity(
    performanceOptions.baselineSource,
    baselineRevision,
  )
  const baselineManifest = await artifactManifest(performanceOptions.baselineDist)
  verifyArtifactIdentity('baseline source', baselineSource.sha256,
    performanceOptions.baselineSourceSha256)
  verifyArtifactIdentity('current source', currentSource.sha256,
    performanceOptions.currentSourceSha256)
  verifyArtifactIdentity('baseline', baselineManifest.sha256,
    performanceOptions.baselineArtifactSha256)
  verifyArtifactIdentity('current', currentManifest.sha256,
    performanceOptions.currentArtifactSha256)
  assert.throws(
    () => verifyArtifactIdentity('negative-control', currentManifest.sha256, '0'.repeat(64)),
    /artifact identity mismatch/,
    'artifact mismatch negative control fails closed',
  )
  return {
    currentProductionDistBytes: currentManifest.bytes,
    campaignArtBytes: artManifest.bytes,
    baselineProductionDistBytes: baselineManifest.bytes,
    productionDistDeltaBytes: currentManifest.bytes - baselineManifest.bytes,
    currentArtifact: artifactIdentity({
      revision: currentRevision,
      source: currentSource,
      manifest: currentManifest,
      buildCommand: performanceOptions.buildCommand,
      verified: true,
    }),
    baselineArtifact: artifactIdentity({
      revision: baselineRevision,
      source: baselineSource,
      manifest: baselineManifest,
      buildCommand: performanceOptions.buildCommand,
      verified: true,
    }),
    currentWorkingTreeDirty: currentDirty,
    comparison: 'current build-input tree identity repeated and verified; baseline source verified file-by-file against revision Git blobs; complete sorted dist manifests and identical build command verified',
  }
}

const report = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  desktop: {
    platform: platform(), release: release(), node: process.version,
    cpu: cpus()[0]?.model ?? 'unknown', logicalCpuCount: cpus().length,
  },
  targets: {
    desktopAiP95Milliseconds: 50,
    phoneAiP95Milliseconds: 120,
    maxLiveZones: 4,
    maxObjects: 8,
    maxQueuedEffects: 32,
    note: 'provisional engineering targets, not pre-existing measurements',
  },
  measurements: {
    ai: measureAi(),
    entry: measureEntry(),
    replay: measureReplays(),
    bundle: await bundleMeasurement(),
  },
  pending: [
    'physical-phone p95 planning and frame-stall measurement',
    'browser time-to-first-controllable-frame comparison on named cache condition',
  ],
}

assert.equal(report.measurements.replay.receiptReplayCommandLimit, 256,
  'performance evidence must exercise the canonical campaign receipt command cap')
assert.ok(report.measurements.bundle.currentArtifact?.sha256,
  'performance evidence must identify the exact current artifact')

console.log(JSON.stringify(report, null, 2))

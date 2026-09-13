// T07: every recorded warmed sample must be strictly <100 ms. Run exclusively
// on the named validation host. --retained measures the frozen artifact. Neither
// mode establishes Edge capacity or independent worker termination proof.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hostname, cpus, platform, release, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'
import { replayVerifiedChallengeWithWork } from '../../shared/src/net/verifiedChallengeController.ts'
import { VERIFIED_CHALLENGE_WORK_LIMITS } from '../../shared/src/net/verifiedChallengeWorkLimits.ts'
import { getVerifiedChallengeArtifact } from '../../shared/src/verified/challengeArtifacts.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/verified_challenge_workload.json', import.meta.url), 'utf8'))
const exploratory = process.argv.includes('--explore')
const retained = process.argv.includes('--retained')
if (process.argv.some((arg) => arg.startsWith('--') && !['--explore', '--retained'].includes(arg))) throw new Error('unsupported_benchmark_option')
const artifact = retained ? getVerifiedChallengeArtifact('cq1') : null
const replay = artifact?.replayWithWork ?? replayVerifiedChallengeWithWork
const scenarios = exploratory ? fixture.scenarios.filter(({ id }) => ['first-clear', 'third-miss'].includes(id)) : fixture.scenarios
const repetitions = exploratory ? 3 : 5
const thresholdMs = 100
console.log(JSON.stringify({ kind: 'verified-challenge-benchmark-host', scope: exploratory ? 'exploratory subset, not T07 gate' : 'full finite corpus gate',
  startedAt: new Date().toISOString(), host: hostname(), platform: platform(), release: release(), arch: process.arch,
  node: process.version, cpuModel: cpus()[0]?.model, logicalCpus: cpus().length, hostMemoryBytes: totalmem(),
  thresholdMs, repetitions, scenarios: scenarios.length, limits: artifact?.workLimits ?? VERIFIED_CHALLENGE_WORK_LIMITS,
  implementation: retained ? 'retained-cq1' : 'current-source', artifactSha256: artifact?.sha256 ?? null,
  memoryBoundary: 'RSS and maximum RSS describe this Node process, not per-replay allocation or hosted isolate limits' }))
const failures = []
for (const scenario of scenarios) {
  // Retain the first call too. It is not labelled a cold process measurement:
  // imports/JIT and earlier scenarios may already have warmed this process.
  for (let sample = 0; sample <= repetitions; sample++) {
    const cpuBefore = process.cpuUsage()
    const begin = performance.now()
    const actual = replay(scenario.result.transcript)
    const elapsedMs = performance.now() - begin
    const cpu = process.cpuUsage(cpuBefore)
    const record = { kind: 'verified-challenge-benchmark-sample', id: scenario.id,
      phase: sample === 0 ? 'initial-scenario-call' : 'warmed', sample, elapsedMs,
      cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system, rssBytes: process.memoryUsage().rss,
      processMaxRssKiB: process.resourceUsage().maxRSS, work: actual.work,
      terminal: actual.result.terminal, underThreshold: elapsedMs < thresholdMs }
    // Emit before any assertion so failed samples are never lost or selected out.
    console.log(JSON.stringify(record))
    assert.deepEqual(actual, { result: scenario.result, work: scenario.work }, `${scenario.id}: benchmark executes frozen complete fixture`)
    if (sample > 0 && elapsedMs >= thresholdMs) failures.push({ id: scenario.id, sample, elapsedMs })
  }
}
console.log(JSON.stringify({ kind: 'verified-challenge-benchmark-summary', exploratory,
  warmedSamples: scenarios.length * repetitions, failureCount: failures.length, failures,
  verdict: exploratory ? 'EXPLORATORY_ONLY' : failures.length ? 'FAIL' : 'PASS' }))
if (!exploratory && failures.length) process.exitCode = 1

import assert from 'node:assert/strict'
import { cpus, platform, arch } from 'node:os'
import { pathToFileURL } from 'node:url'

const CORPUS = [[17, 0, 5], [42, 45, 20], [73, 90, 20], [109, 180, 20]]
const WARMUP_ROUNDS = 2
const MEASURED_ROUNDS = 3
const LOCAL_LIMIT_MS = 100
const HOSTED_RELATIVE_LIMIT = 1.5

// Local runs enforce the spec's absolute target. GitHub-hosted runners instead
// compare each case with the same run's cohort so machine speed cannot decide
// the gate. Per-case medians keep one scheduler pause from deciding either gate.
export function runVerifiedDuelBenchmark(replay, {
  mode = process.env.GITHUB_ACTIONS === 'true' ? 'hosted-ci' : 'local',
  now = () => performance.now(),
  report = (value) => console.log(JSON.stringify(value)),
} = {}) {
  assert.ok(mode === 'local' || mode === 'hosted-ci', `unsupported benchmark mode ${mode}`)
  const replayCase = ([seed, angle, power]) => {
    const result = replay(seed, Array.from({ length: 6 }, () => ({ angle, power })))
    assert.equal(result.cpuSalvos, 6)
    assert.ok(result.maximumProbeCount >= 59)
  }
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    for (const entry of CORPUS) replayCase(entry)
  }
  const samples = []
  for (let round = 0; round < MEASURED_ROUNDS; round += 1) {
    for (const entry of CORPUS) {
      const started = now()
      replayCase(entry)
      samples.push({ round, seed: entry[0], angle: entry[1], power: entry[2], ms: now() - started })
    }
  }
  let caseMedians = CORPUS.map(([seed, angle, power]) => {
    const timings = samples.filter(sample => sample.seed === seed).map(sample => sample.ms).sort((a, b) => a - b)
    return { seed, angle, power, ms: timings[Math.floor(timings.length / 2)] }
  })
  const sortedMedians = caseMedians.map(sample => sample.ms).sort((a, b) => a - b)
  const cohortMedianMs = (sortedMedians[1] + sortedMedians[2]) / 2
  caseMedians = caseMedians.map(sample => ({
    ...sample,
    relativeToCohort: cohortMedianMs === 0 ? (sample.ms === 0 ? 1 : Number.POSITIVE_INFINITY) : sample.ms / cohortMedianMs,
  }))
  const result = {
    kind: 'verified-duel-benchmark',
    metric: 'wall-clock-case-median',
    mode,
    node: process.version, platform: platform(), arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown', logicalCpus: cpus().length,
    warmupRounds: WARMUP_ROUNDS, measuredRounds: MEASURED_ROUNDS,
    limitMs: LOCAL_LIMIT_MS, localLimitMs: LOCAL_LIMIT_MS,
    relativeLimit: HOSTED_RELATIVE_LIMIT, cohortMedianMs,
    samples, caseMedians,
  }
  // Preserve all raw timings even when the gate fails. Never select best-of samples.
  report(result)
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample.ms) && sample.ms >= 0,
      `verified duel corpus seed ${sample.seed} round ${sample.round} produced invalid timing ${sample.ms}`)
  }
  for (const sample of caseMedians) {
    if (mode === 'local') {
      assert.ok(sample.ms < LOCAL_LIMIT_MS,
        `verified duel corpus seed ${sample.seed} median ${sample.ms}ms must be <${LOCAL_LIMIT_MS}ms`)
    } else {
      assert.ok(sample.relativeToCohort <= HOSTED_RELATIVE_LIMIT,
        `verified duel corpus seed ${sample.seed} relative median ${sample.relativeToCohort}x must be <=${HOSTED_RELATIVE_LIMIT}x the ${cohortMedianMs}ms cohort median`)
    }
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { replayVerifiedDuel } = await import('../../shared/src/net/verifiedDuel.ts')
  runVerifiedDuelBenchmark(replayVerifiedDuel)
}

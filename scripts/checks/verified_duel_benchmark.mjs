import assert from 'node:assert/strict'
import { cpus, platform, arch } from 'node:os'
import { pathToFileURL } from 'node:url'

const CORPUS = [[17, 0, 5], [42, 45, 20], [73, 90, 20], [109, 180, 20]]
const WARMUP_ROUNDS = 2
const MEASURED_ROUNDS = 3

// A warmed replay budget, independent of the exhaustive correctness sweep's heap.
// Each corpus case's three-round median must satisfy the strict 100ms ceiling,
// so one scheduler pause cannot decide the gate.
export function runVerifiedDuelBenchmark(replay, {
  now = () => performance.now(),
  report = (value) => console.log(JSON.stringify(value)),
} = {}) {
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
  const caseMedians = CORPUS.map(([seed, angle, power]) => {
    const timings = samples.filter(sample => sample.seed === seed).map(sample => sample.ms).sort((a, b) => a - b)
    return { seed, angle, power, ms: timings[Math.floor(timings.length / 2)] }
  })
  const result = {
    kind: 'verified-duel-benchmark',
    metric: 'wall-clock-case-median',
    node: process.version, platform: platform(), arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown', logicalCpus: cpus().length,
    warmupRounds: WARMUP_ROUNDS, measuredRounds: MEASURED_ROUNDS,
    limitMs: 100, samples, caseMedians,
  }
  // Preserve all raw timings even when the gate fails. Never select best-of samples.
  report(result)
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample.ms) && sample.ms >= 0,
      `verified duel corpus seed ${sample.seed} round ${sample.round} produced invalid timing ${sample.ms}`)
  }
  for (const sample of caseMedians) {
    assert.ok(sample.ms < 100,
      `verified duel corpus seed ${sample.seed} median ${sample.ms}ms must be <100ms`)
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { replayVerifiedDuel } = await import('../../shared/src/net/verifiedDuel.ts')
  runVerifiedDuelBenchmark(replayVerifiedDuel)
}

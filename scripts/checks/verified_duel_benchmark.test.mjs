import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { runVerifiedDuelBenchmark } from './verified_duel_benchmark.mjs'

const validReplay = () => ({ cpuSalvos: 6, maximumProbeCount: 59 })
function clockFor(durations) {
  let index = 0
  return () => index++ % 2 === 0 ? 0 : durations[Math.floor((index - 1) / 2)]
}

for (const duration of [99, 100, 101]) {
  test(`strict replay ceiling ${duration}ms`, () => {
    let reported
    const run = () => runVerifiedDuelBenchmark(validReplay, {
      now: clockFor(Array(12).fill(duration)), report: value => { reported = value },
    })
    if (duration < 100) assert.doesNotThrow(run)
    else assert.throws(run, /must be <100ms/)
    assert.equal(reported.samples.length, 12)
    assert.ok(reported.samples.every(sample => sample.ms === duration))
  })
}

test('one slow sample fails even when every other sample is fast', () => {
  assert.throws(() => runVerifiedDuelBenchmark(validReplay, {
    now: clockFor([1, 1, 1, 1, 1, 101, 1, 1, 1, 1, 1, 1]), report() {},
  }), /101ms must be <100ms/)
})

test('fixed warmup and samples replay all four complete six-shot cases', () => {
  const calls = []
  const result = runVerifiedDuelBenchmark((seed, transcript) => {
    calls.push([seed, transcript])
    return validReplay()
  }, { now: clockFor(Array(12).fill(1)), report() {} })
  const expected = [[17, 0, 5], [42, 45, 20], [73, 90, 20], [109, 180, 20]]
  assert.equal(calls.length, 20)
  calls.forEach(([seed, transcript], index) => {
    const [expectedSeed, angle, power] = expected[index % 4]
    assert.equal(seed, expectedSeed)
    assert.deepEqual(transcript, Array.from({ length: 6 }, () => ({ angle, power })))
  })
  assert.equal(result.warmupRounds, 2)
  assert.equal(result.samples.length, 12)
})

test('fast replay cannot bypass deterministic assertions', () => {
  for (const invalid of [{ cpuSalvos: 5, maximumProbeCount: 59 }, { cpuSalvos: 6, maximumProbeCount: 58 }]) {
    assert.throws(() => runVerifiedDuelBenchmark(() => invalid, { now: () => 0, report() {} }))
  }
})

test('benchmark assertion exits its process unsuccessfully and preserves timing report', () => {
  const moduleUrl = new URL('./verified_duel_benchmark.mjs', import.meta.url).href
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { runVerifiedDuelBenchmark } from ${JSON.stringify(moduleUrl)};
    let tick = 0;
    runVerifiedDuelBenchmark(() => ({ cpuSalvos: 6, maximumProbeCount: 59 }), {
      now: () => tick++ % 2 === 0 ? 0 : 100,
    });
  `], { encoding: 'utf8' })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 1)
  assert.equal(JSON.parse(child.stdout).samples.length, 12)
  assert.match(child.stderr, /100ms must be <100ms/)
})

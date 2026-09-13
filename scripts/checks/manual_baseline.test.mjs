// Contract: the P01 offline evidence schema rejects unsafe/ambiguous rows and reports raw denominators.
// Run: node --test scripts/checks/manual_baseline.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyCorrection,
  aggregateManualBaseline,
  nextManualSessionId,
  validateManualRecord,
} from '../product-evidence/manualBaseline.mjs'

const record = (overrides = {}) => ({
  schemaVersion: 'p01-manual-v1',
  sessionId: 'session-0001',
  observedOn: '2026-09-12',
  consent: true,
  initiatingPlayerHistory: 'new',
  socialContext: 'solo',
  participants: 1,
  guestEntry: 'yes',
  firstShot: 'yes',
  completedMatch: 'yes',
  voluntaryReplay: 'no',
  status: 'complete',
  ...overrides,
})

test('P01-AC1 validates the strict schema and rejects unsafe content and causal contradictions', () => {
  assert.deepEqual(validateManualRecord(record()), record())
  assert.throws(() => validateManualRecord(record({ extra: 'freeform notes are forbidden' })), /unknown key/i)
  for (const prohibitedKey of ['notes', 'name', 'email', 'accountId', 'roomCode', 'url', 'token', 'connectionDetails']) {
    assert.throws(() => validateManualRecord(record({ [prohibitedKey]: 'not accepted' })), /unknown key/i)
  }
  assert.throws(() => validateManualRecord(record({ sessionId: 'alice@example.com' })), /sessionId/i)
  assert.throws(() => validateManualRecord(record({ observedOn: '2026-02-30' })), /observedOn/i)
  assert.throws(() => validateManualRecord(record({ consent: false })), /consent/i)
  assert.throws(() => validateManualRecord(record({ initiatingPlayerHistory: 'mixed group' })), /initiatingPlayerHistory/i)
  assert.throws(() => validateManualRecord(record({ guestEntry: 'maybe' })), /guestEntry/i)
  assert.throws(() => validateManualRecord(record({ socialContext: 'friends', participants: 1 })), /participants/i)
  assert.throws(() => validateManualRecord(record({ firstShot: 'yes', guestEntry: 'no' })), /firstShot/i)
  assert.throws(() => validateManualRecord(record({ completedMatch: 'yes', firstShot: 'not_observed' })), /completedMatch/i)
  assert.throws(() => validateManualRecord(record({ voluntaryReplay: 'yes', completedMatch: 'no' })), /voluntaryReplay/i)
})

test('P01-AC1 rejects IDs below the generated session-0001 range', () => {
  assert.throws(() => validateManualRecord(record({ sessionId: 'session-0000' })), /sessionId/i)
})

test('P01-AC1 rejects unsafe participant counts', () => {
  assert.throws(() => validateManualRecord(record({ socialContext: 'friends', participants: Number.MAX_SAFE_INTEGER + 1 })), /participants/i)
})

test('P01-AC2 keeps downstream stages known-ineligible after a prior known no', () => {
  const report = aggregateManualBaseline([
    record({ guestEntry: 'no', firstShot: 'not_observed', completedMatch: 'not_observed', voluntaryReplay: 'not_observed', status: 'ended_early' }),
  ])
  for (const stage of ['firstShot', 'completedMatch', 'voluntaryReplay']) {
    assert.deepEqual(report.stages[stage], { eligible: 0, knownYes: 0, knownNo: 0, unknownOutcome: 0, unknownEligibility: 0 })
  }
})

test('P01-AC1 rejects duplicates and makes correction an explicit same-ID replacement', () => {
  const first = record()
  assert.throws(() => aggregateManualBaseline([first, first]), /duplicate/i)
  assert.throws(() => applyCorrection([first], record({ sessionId: 'session-0002' })), /same sessionId/i)
  assert.throws(() => applyCorrection([], first), /existing session/i)
  const corrected = applyCorrection([first], record({ status: 'ended_early', completedMatch: 'no', voluntaryReplay: 'not_observed' }))
  assert.equal(corrected.length, 1)
  assert.equal(corrected[0].status, 'ended_early')
})

test('P01-AC1 generates only the documented opaque sequential session IDs', () => {
  assert.equal(nextManualSessionId([]), 'session-0001')
  assert.equal(nextManualSessionId([record()]), 'session-0002')
  assert.throws(() => nextManualSessionId([record({ sessionId: 'session-9999' })]), /exhausted/i)
})

test('P01-AC2 counts raw stage denominators across history and social segments without inference', () => {
  const report = aggregateManualBaseline([
    record(),
    record({ sessionId: 'session-0002', initiatingPlayerHistory: 'returning', socialContext: 'friends', participants: 2, guestEntry: 'yes', firstShot: 'not_observed', completedMatch: 'not_observed', voluntaryReplay: 'not_observed', status: 'unknown' }),
    record({ sessionId: 'session-0003', initiatingPlayerHistory: 'unknown', guestEntry: 'not_observed', firstShot: 'not_observed', completedMatch: 'not_observed', voluntaryReplay: 'not_observed', status: 'unknown' }),
  ])
  assert.equal(report.recordedSessions, 3)
  assert.deepEqual(report.stages.guestEntry, { eligible: 3, knownYes: 2, knownNo: 0, unknownOutcome: 1, unknownEligibility: 0 })
  assert.deepEqual(report.stages.firstShot, { eligible: 2, knownYes: 1, knownNo: 0, unknownOutcome: 1, unknownEligibility: 1 })
  assert.equal(report.byInitiatingPlayerHistory.new.recordedSessions, 1)
  assert.equal(report.byInitiatingPlayerHistory.returning.stages.firstShot.unknownOutcome, 1)
  assert.equal(report.byInitiatingPlayerHistory.unknown.stages.firstShot.unknownEligibility, 1)
  assert.equal(report.bySocialContext.solo.recordedSessions, 2)
  assert.equal(report.bySocialContext.friends.recordedSessions, 1)
})

test('P01-AC4 reports an empty dataset as raw zeroes rather than invented observations or NaN', () => {
  const report = aggregateManualBaseline([])
  assert.equal(report.recordedSessions, 0)
  for (const stage of Object.values(report.stages)) {
    assert.deepEqual(stage, { eligible: 0, knownYes: 0, knownNo: 0, unknownOutcome: 0, unknownEligibility: 0 })
    assert.equal(Number.isNaN(stage.eligible), false)
  }
})

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => entry.isDirectory()
    ? filesUnder(join(directory, entry.name))
    : [join(directory, entry.name)]))
  return nested.flat()
}

test('P01-AC3 keeps the offline evidence module outside all application execution paths', async () => {
  for (const directory of ['client', 'shared', 'supabase']) {
    const files = await filesUnder(fileURLToPath(new URL(`../../${directory}/`, import.meta.url)))
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.js') && !file.endsWith('.mjs')) continue
      assert.doesNotMatch(await readFile(file, 'utf8'), /manualBaseline/)
    }
  }
})

const schemaVersion = 'p01-manual-v1'
const outcomes = new Set(['yes', 'no', 'not_observed'])
const histories = new Set(['new', 'returning', 'unknown'])
const contexts = new Set(['solo', 'friends'])
const statuses = new Set(['complete', 'ended_early', 'unknown'])
const keys = [
  'schemaVersion',
  'sessionId',
  'observedOn',
  'consent',
  'initiatingPlayerHistory',
  'socialContext',
  'participants',
  'guestEntry',
  'firstShot',
  'completedMatch',
  'voluntaryReplay',
  'status',
]
const stages = ['guestEntry', 'firstShot', 'completedMatch', 'voluntaryReplay']

function fail(message) {
  throw new TypeError(`P01 manual baseline: ${message}`)
}

function exactKeys(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('record must be an object')
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail('unknown key or missing required key')
}

function exactDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function requireValue(name, value, permitted) {
  if (!permitted.has(value)) fail(`${name} has an invalid value`)
}

function priorIsObserved(record, stage) {
  const index = stages.indexOf(stage)
  return stages.slice(0, index).every(previous => record[previous] === 'yes')
}

function validateProgression(record) {
  for (const stage of stages.slice(1)) {
    if (record[stage] === 'yes' && !priorIsObserved(record, stage)) fail(`${stage} cannot be yes before its required prior stage is yes`)
  }
}

export function validateManualRecord(record) {
  exactKeys(record)
  if (record.schemaVersion !== schemaVersion) fail('schemaVersion is invalid')
  if (typeof record.sessionId !== 'string' || !/^session-(?!0000)\d{4}$/.test(record.sessionId)) fail('sessionId must be an opaque session-0001 style value')
  if (!exactDate(record.observedOn)) fail('observedOn must be a real calendar date')
  if (record.consent !== true) fail('consent must be true before a record is accepted')
  requireValue('initiatingPlayerHistory', record.initiatingPlayerHistory, histories)
  requireValue('socialContext', record.socialContext, contexts)
  if (!Number.isSafeInteger(record.participants) || record.participants < 1) fail('participants must be a positive safe integer')
  if ((record.socialContext === 'solo' && record.participants !== 1) || (record.socialContext === 'friends' && record.participants < 2)) fail('participants must agree with socialContext')
  for (const stage of stages) requireValue(stage, record[stage], outcomes)
  requireValue('status', record.status, statuses)
  validateProgression(record)
  return { ...record }
}

function validatedRecords(records) {
  if (!Array.isArray(records)) fail('records must be an array')
  const seen = new Set()
  return records.map(record => {
    const validated = validateManualRecord(record)
    if (seen.has(validated.sessionId)) fail(`duplicate sessionId ${validated.sessionId}`)
    seen.add(validated.sessionId)
    return validated
  })
}

export function applyCorrection(records, correction) {
  const validated = validatedRecords(records)
  const replacement = validateManualRecord(correction)
  const index = validated.findIndex(record => record.sessionId === replacement.sessionId)
  if (index === -1) fail('correction must replace an existing session with the same sessionId')
  return validated.map((record, current) => current === index ? replacement : record)
}

export function nextManualSessionId(records) {
  const maximum = validatedRecords(records).reduce((current, record) => Math.max(current, Number(record.sessionId.slice('session-'.length))), 0)
  if (maximum >= 9999) fail('session ID space is exhausted')
  return `session-${String(maximum + 1).padStart(4, '0')}`
}

function emptyStage() {
  return { eligible: 0, knownYes: 0, knownNo: 0, unknownOutcome: 0, unknownEligibility: 0 }
}

function emptyReport() {
  return {
    recordedSessions: 0,
    stages: Object.fromEntries(stages.map(stage => [stage, emptyStage()])),
  }
}

function addStage(stageReport, record, stage) {
  const index = stages.indexOf(stage)
  const previous = stages.slice(0, index)
  if (previous.some(previousStage => record[previousStage] === 'no')) return
  if (previous.some(previousStage => record[previousStage] === 'not_observed')) {
    stageReport.unknownEligibility += 1
    return
  }
  stageReport.eligible += 1
  if (record[stage] === 'yes') stageReport.knownYes += 1
  else if (record[stage] === 'no') stageReport.knownNo += 1
  else stageReport.unknownOutcome += 1
}

function summarize(records) {
  const report = emptyReport()
  report.recordedSessions = records.length
  for (const record of records) for (const stage of stages) addStage(report.stages[stage], record, stage)
  return report
}

export function aggregateManualBaseline(records) {
  const validated = validatedRecords(records)
  const report = summarize(validated)
  report.byInitiatingPlayerHistory = Object.fromEntries([...histories].map(history => [history, summarize(validated.filter(record => record.initiatingPlayerHistory === history))]))
  report.bySocialContext = Object.fromEntries([...contexts].map(context => [context, summarize(validated.filter(record => record.socialContext === context))]))
  return report
}

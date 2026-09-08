// Cross-runtime weapon contract guard.
//
// The shared engine is the live weapon roster. The submit_action referee keeps
// a local allowlist because the Deno deployment boundary must not import the
// browser/shared engine. This check compares the live shared module keys with
// that Deno source declaration and proves both drift directions fail clearly.
// Run: npx tsx scripts/checks/weapon_contract.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts'

const validatorPath = resolve('supabase/functions/submit_action/validate.ts')
const validatorSource = readFileSync(validatorPath, 'utf8').replace(/\r\n/g, '\n')

function parseValidatorWeapons(source) {
  const match = source.match(
    /export const WEAPON_TYPES:[\s\S]*?new Set\(\[\n([\s\S]*?)\n\]\)/,
  )
  if (!match) throw new Error('submit_action validator WEAPON_TYPES declaration is missing')
  const body = match[1]
  const values = [...body.matchAll(/^\s*'([^']+)',?\s*$/gm)].map((entry) => entry[1])
  if (values.length === 0) throw new Error('submit_action validator WEAPON_TYPES declaration is empty')
  return values
}

function assertWeaponContract(source, label) {
  assert.doesNotMatch(
    source,
    /from\s+['"](?:\.\.\/)*shared\//,
    `${label}: submit_action validator must not import shared engine code`,
  )
  const expected = new Set(Object.keys(WEAPONS))
  const actualValues = parseValidatorWeapons(source)
  const actual = new Set(actualValues)
  const missing = [...expected].filter((weapon) => !actual.has(weapon)).sort()
  const extra = [...actual].filter((weapon) => !expected.has(weapon)).sort()
  const duplicateCount = actualValues.length - actual.size
  assert.equal(
    duplicateCount,
    0,
    `${label}: duplicate referee weapon identifiers: ${actualValues.filter((weapon, index) => actualValues.indexOf(weapon) !== index).join(', ')}`,
  )
  assert.equal(
    missing.length,
    0,
    `${label}: missing referee weapon identifiers: ${missing.join(', ')}`,
  )
  assert.equal(
    extra.length,
    0,
    `${label}: extra referee weapon identifiers: ${extra.join(', ')}`,
  )
  assert.equal(actual.size, expected.size, `${label}: referee/shared weapon counts differ`)
  return actual
}

const sharedKeys = Object.keys(WEAPONS).sort()
const actual = assertWeaponContract(validatorSource, 'live contract')
assert.deepEqual([...actual].sort(), sharedKeys)
console.log(`PASS: submit_action WEAPON_TYPES matches shared WEAPONS (${sharedKeys.length} identifiers)`)

// Mutation proof: adding or removing one identifier must fail with the drift
// direction in the error, so this guard cannot silently regress to a count-only
// or one-sided check.
const missingSource = validatorSource.replace("  'tracer',\n", '')
assert.throws(
  () => assertWeaponContract(missingSource, 'missing mutation'),
  /missing referee weapon identifiers: tracer/,
)
console.log('PASS: missing-identifier mutation is rejected with a useful error')

const extraSource = validatorSource.replace("  'tracer',\n", "  'tracer',\n  'contract_probe_extra',\n")
assert.throws(
  () => assertWeaponContract(extraSource, 'extra mutation'),
  /extra referee weapon identifiers: contract_probe_extra/,
)
console.log('PASS: extra-identifier mutation is rejected with a useful error')

console.log('WEAPON CONTRACT CHECK: PASSED (live + missing + extra cases)')

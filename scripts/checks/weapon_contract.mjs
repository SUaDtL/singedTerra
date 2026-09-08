// Cross-runtime weapon contract guard.
//
// The shared engine is the live weapon roster. The submit_action referee keeps
// a pure local allowlist because the Deno deployment boundary must not import
// the browser/shared engine. This check compares the two runtime values and
// proves both drift directions fail clearly.

import assert from 'node:assert/strict'
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts'
import { WEAPON_TYPES } from '../../supabase/functions/submit_action/weaponTypes.ts'

function assertWeaponContract(actualValues, label) {
  const expected = new Set(Object.keys(WEAPONS))
  const actual = new Set(actualValues)
  const missing = [...expected].filter((weapon) => !actual.has(weapon)).sort()
  const extra = [...actual].filter((weapon) => !expected.has(weapon)).sort()

  assert.equal(missing.length, 0, `${label}: missing referee weapon identifiers: ${missing.join(', ')}`)
  assert.equal(extra.length, 0, `${label}: extra referee weapon identifiers: ${extra.join(', ')}`)
  assert.equal(actual.size, expected.size, `${label}: referee/shared weapon counts differ`)
}

assertWeaponContract(WEAPON_TYPES, 'live contract')
console.log(`PASS: submit_action WEAPON_TYPES matches shared WEAPONS (${Object.keys(WEAPONS).length} identifiers)`)

// Mutation proof: adding or removing one identifier must fail with the drift
// direction in the error, so this guard cannot silently become count-only.
const missingMutation = new Set(WEAPON_TYPES)
missingMutation.delete('tracer')
assert.throws(
  () => assertWeaponContract(missingMutation, 'missing mutation'),
  /missing referee weapon identifiers: tracer/,
)
console.log('PASS: missing-identifier mutation is rejected with a useful error')

const extraMutation = new Set(WEAPON_TYPES)
extraMutation.add('contract_probe_extra')
assert.throws(
  () => assertWeaponContract(extraMutation, 'extra mutation'),
  /extra referee weapon identifiers: contract_probe_extra/,
)
console.log('PASS: extra-identifier mutation is rejected with a useful error')

console.log('WEAPON CONTRACT CHECK: PASSED (live + missing + extra cases)')

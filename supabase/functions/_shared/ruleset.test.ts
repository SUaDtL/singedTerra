import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  resolveCreatableRulesetVersion,
  LEGACY_NETWORK_RULESET_VERSION,
  resolveRequestedRulesetVersion,
  resolveStoredRulesetVersion,
  rulesetCompatibility,
} from './ruleset.ts'

Deno.test('ruleset: omitted request and stored values resolve to legacy version 1', () => {
  assertEquals(LEGACY_NETWORK_RULESET_VERSION, 1)
  assertEquals(resolveRequestedRulesetVersion(undefined), { ok: true, version: 1 })
  assertEquals(resolveStoredRulesetVersion({ maxPlayers: 2 }), { ok: true, version: 1 })
})

Deno.test('ruleset: explicit supported versions 1 and 2 are preserved', () => {
  assertEquals(resolveRequestedRulesetVersion(1), { ok: true, version: 1 })
  assertEquals(resolveRequestedRulesetVersion(2), { ok: true, version: 2 })
  assertEquals(resolveStoredRulesetVersion({ rulesetVersion: 2 }), { ok: true, version: 2 })
})

Deno.test('ruleset: room creation preserves every supported requested version', () => {
  assertEquals(resolveCreatableRulesetVersion(undefined), { ok: true, version: 1 })
  assertEquals(resolveCreatableRulesetVersion(1), { ok: true, version: 1 })
  assertEquals(resolveCreatableRulesetVersion(2), { ok: true, version: 2 })
  assertEquals(resolveCreatableRulesetVersion(99), { ok: false, error: 'invalid_request' })
})

Deno.test('ruleset: unsupported, fractional, and non-numeric values fail closed', () => {
  for (const value of [0, 3, 1.5, '1', null, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertEquals(resolveRequestedRulesetVersion(value), { ok: false, error: 'invalid_request' })
    assertEquals(resolveCreatableRulesetVersion(value), { ok: false, error: 'invalid_request' })
  }
  assertEquals(resolveStoredRulesetVersion({ rulesetVersion: 99 }), {
    ok: false,
    error: 'invalid_stored',
  })
  for (const options of [null, 7, 'options', [], true]) {
    assertEquals(resolveStoredRulesetVersion(options), {
      ok: false,
      error: 'invalid_stored',
    })
  }
})

Deno.test('ruleset: compatibility reports the room version on a mismatch', () => {
  assertEquals(rulesetCompatibility(1, 1), { ok: true })
  assertEquals(rulesetCompatibility(2, 2), { ok: true })
  assertEquals(rulesetCompatibility(1, 2), {
    ok: false,
    error: 'ruleset_mismatch',
    requiredRulesetVersion: 2,
  })
})

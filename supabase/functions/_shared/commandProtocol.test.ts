import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  commandVersionCompatibility,
  resolveRequestedCommandVersion,
  resolveStoredCommandVersion,
} from './commandProtocol.ts'

Deno.test('command protocol omission remains legacy v1', () => {
  assertEquals(resolveRequestedCommandVersion(undefined), { ok: true, version: 1 })
  assertEquals(resolveStoredCommandVersion({}), { ok: true, version: 1 })
})

Deno.test('command protocol v2 is explicit and independent', () => {
  assertEquals(resolveRequestedCommandVersion(2), { ok: true, version: 2 })
  assertEquals(resolveStoredCommandVersion({ rulesetVersion: 4, commandProtocolVersion: 2 }), { ok: true, version: 2 })
  assertEquals(commandVersionCompatibility(1, 2), { ok: false, requiredCommandProtocolVersion: 2 })
})

Deno.test('malformed command protocol values fail closed', () => {
  for (const value of [0, 3, '2', null]) assertEquals(resolveRequestedCommandVersion(value), { ok: false })
  assertEquals(resolveStoredCommandVersion(null), { ok: false })
})

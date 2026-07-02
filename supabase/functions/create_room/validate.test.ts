// create_room/validate.test.ts
//
// Pure unit tests for coerceEconomyOptions — the additive SE-parity economy coercion (AC1).
// No IO, no DB, no live handler.
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/create_room/validate.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { coerceEconomyOptions, coerceGravity, coerceMaxWind } from './validate.ts'

// AC1.1 — present + valid => carried (clamped where applicable).
Deno.test('coerceEconomyOptions: valid values are carried', () => {
  assertEquals(
    coerceEconomyOptions({ interestRate: 0.1, suddenDeathTurn: 12, armsLevel: 2 }),
    { interestRate: 0.1, suddenDeathTurn: 12, armsLevel: 2 },
  )
})

// AC1.2 — all absent => empty object (back-compat: no new keys on the stored row).
Deno.test('coerceEconomyOptions: absent fields are omitted', () => {
  assertEquals(coerceEconomyOptions({ maxPlayers: 2 }), {})
  assertEquals(coerceEconomyOptions({}), {})
  assertEquals(coerceEconomyOptions(undefined), {})
  assertEquals(coerceEconomyOptions(null), {})
})

// AC1.3 — invalid values are coerced to a safe value or omitted, never stored raw.
Deno.test('coerceEconomyOptions: invalid values are omitted', () => {
  // Non-numeric / NaN / Infinity => omitted.
  assertEquals(coerceEconomyOptions({ interestRate: 'lots', suddenDeathTurn: NaN, armsLevel: Infinity }), {})
})

Deno.test('coerceEconomyOptions: out-of-range values are clamped', () => {
  // armsLevel clamps to 0..4; interestRate to 0..0.5; suddenDeathTurn to 0..50 + truncated.
  assertEquals(
    coerceEconomyOptions({ interestRate: 5, suddenDeathTurn: 999, armsLevel: 9 }),
    { interestRate: 0.5, suddenDeathTurn: 50, armsLevel: 4 },
  )
  assertEquals(
    coerceEconomyOptions({ interestRate: -1, suddenDeathTurn: -3, armsLevel: -1 }),
    { interestRate: 0, suddenDeathTurn: 0, armsLevel: 0 },
  )
})

Deno.test('coerceEconomyOptions: integer fields are truncated', () => {
  assertEquals(
    coerceEconomyOptions({ suddenDeathTurn: 7.9, armsLevel: 2.6 }),
    { suddenDeathTurn: 7, armsLevel: 2 },
  )
})

// A partial payload carries only what was set.
Deno.test('coerceEconomyOptions: partial payload carries only set fields', () => {
  assertEquals(coerceEconomyOptions({ armsLevel: 1 }), { armsLevel: 1 })
  assertEquals(coerceEconomyOptions({ interestRate: 0.2 }), { interestRate: 0.2 })
})

// appsec-002 — typeof NaN === 'number' and typeof Infinity === 'number', so a bare typeof
// check let non-finite / negative / huge values through into the determinism-critical
// engine. coerceMaxWind / coerceGravity must fall back to the default instead.
Deno.test('coerceMaxWind: NaN/Infinity/negative/huge fall back to the default', () => {
  assertEquals(coerceMaxWind(NaN, 10), 10)
  assertEquals(coerceMaxWind(Infinity, 10), 10)
  assertEquals(coerceMaxWind(-Infinity, 10), 10)
  assertEquals(coerceMaxWind(-5, 10), 10)
  assertEquals(coerceMaxWind(1e9, 10), 10)
  assertEquals(coerceMaxWind('lots', 10), 10)
  assertEquals(coerceMaxWind(undefined, 10), 10)
})

Deno.test('coerceMaxWind: a valid in-range value is carried', () => {
  assertEquals(coerceMaxWind(15, 10), 15)
  assertEquals(coerceMaxWind(0, 10), 0)
  assertEquals(coerceMaxWind(100, 10), 100)
})

Deno.test('coerceGravity: NaN/Infinity/negative/zero fall back to the default', () => {
  assertEquals(coerceGravity(NaN, 0.15), 0.15)
  assertEquals(coerceGravity(Infinity, 0.15), 0.15)
  assertEquals(coerceGravity(-Infinity, 0.15), 0.15)
  assertEquals(coerceGravity(-1, 0.15), 0.15)
  assertEquals(coerceGravity(0, 0.15), 0.15)
  assertEquals(coerceGravity(1e9, 0.15), 0.15)
  assertEquals(coerceGravity('heavy', 0.15), 0.15)
  assertEquals(coerceGravity(undefined, 0.15), 0.15)
})

Deno.test('coerceGravity: a valid in-range value is carried', () => {
  assertEquals(coerceGravity(0.3, 0.15), 0.3)
})

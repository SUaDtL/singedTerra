// finish_game/finish_game.test.ts
//
// Unit tests for sanitizeScoreboard — the client-reported final-standings
// validator persisted to match_scores. Closes the coverage gap flagged by the
// 2026-06-25 review (testcov-002 / #61): the sanitizer has non-trivial branchy
// logic (tankId regex, seat-count bounds, numeric coercion, name truncation) and
// finish_game had no test at all. Hermetic — no DB, no live handler (import.meta.main
// guards Deno.serve so importing the module here starts no listener).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { sanitizeScoreboard } from './index.ts'

Deno.test('sanitizeScoreboard: a valid 2-seat board passes and is cleaned', () => {
  const out = sanitizeScoreboard(
    [
      { tankId: 'p1', playerName: 'Ana', roundWins: 2, kills: 3, totalDamage: 145.5 },
      { tankId: 'p2', playerName: 'Bo', roundWins: 1, kills: 1, totalDamage: 60 },
    ],
    2,
  )
  assertEquals(out, [
    { tankId: 'p1', playerName: 'Ana', roundWins: 2, kills: 3, totalDamage: 145.5 },
    { tankId: 'p2', playerName: 'Bo', roundWins: 1, kills: 1, totalDamage: 60 },
  ])
})

Deno.test('sanitizeScoreboard: absent / empty / non-array payload -> null', () => {
  assertEquals(sanitizeScoreboard(undefined, 2), null)
  assertEquals(sanitizeScoreboard(null, 2), null)
  assertEquals(sanitizeScoreboard([], 2), null)
  assertEquals(sanitizeScoreboard('nope', 2), null)
})

Deno.test('sanitizeScoreboard: tankId "p0" is rejected (regex) -> null', () => {
  assertEquals(sanitizeScoreboard([{ tankId: 'p0', playerName: 'X', roundWins: 0, kills: 0, totalDamage: 0 }], 2), null)
})

Deno.test('sanitizeScoreboard: a tankId seat beyond seatCount -> null', () => {
  // seat 3 in a 2-seat room
  assertEquals(sanitizeScoreboard([{ tankId: 'p3', playerName: 'X', roundWins: 0, kills: 0, totalDamage: 0 }], 2), null)
})

Deno.test('sanitizeScoreboard: a non-p tankId -> null', () => {
  assertEquals(sanitizeScoreboard([{ tankId: 'x1', playerName: 'X', roundWins: 0, kills: 0, totalDamage: 0 }], 2), null)
})

Deno.test('sanitizeScoreboard: negative / non-finite numerics coerce to 0', () => {
  const out = sanitizeScoreboard(
    [{ tankId: 'p1', playerName: 'X', roundWins: -5, kills: Number.NaN, totalDamage: -1 }],
    1,
  )
  assertEquals(out, [{ tankId: 'p1', playerName: 'X', roundWins: 0, kills: 0, totalDamage: 0 }])
})

Deno.test('sanitizeScoreboard: fractional counts truncate; totalDamage stays fractional', () => {
  const out = sanitizeScoreboard(
    [{ tankId: 'p1', playerName: 'X', roundWins: 2.9, kills: 1.4, totalDamage: 12.75 }],
    1,
  )
  assertEquals(out, [{ tankId: 'p1', playerName: 'X', roundWins: 2, kills: 1, totalDamage: 12.75 }])
})

Deno.test('sanitizeScoreboard: playerName over 40 chars is truncated to 40', () => {
  const long = 'a'.repeat(60)
  const out = sanitizeScoreboard([{ tankId: 'p1', playerName: long, roundWins: 0, kills: 0, totalDamage: 0 }], 1)
  assertEquals(out?.[0].playerName.length, 40)
})

Deno.test('sanitizeScoreboard: a non-string playerName becomes ""', () => {
  const out = sanitizeScoreboard([{ tankId: 'p1', playerName: 123, roundWins: 0, kills: 0, totalDamage: 0 }], 1)
  assertEquals(out?.[0].playerName, '')
})

Deno.test('sanitizeScoreboard: one malformed entry rejects the whole board -> null', () => {
  const out = sanitizeScoreboard(
    [
      { tankId: 'p1', playerName: 'Ana', roundWins: 0, kills: 0, totalDamage: 0 },
      null,
    ],
    2,
  )
  assertEquals(out, null)
})

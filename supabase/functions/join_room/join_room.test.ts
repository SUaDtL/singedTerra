// join_room/join_room.test.ts
//
// Unit tests for checkJoinEligibility — the post-reap capacity / color / name gate.
// Closes part of the #61 coverage gap (join_room had no test though this gate is
// branchy and player-facing). Hermetic — Deno.serve is guarded by import.meta.main.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkJoinEligibility } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const P = (name: string, color: string): StoredPlayer => ({ id: name, name, color, ready: false })

Deno.test('checkJoinEligibility: room with a free seat and no clash -> ok', () => {
  assertEquals(checkJoinEligibility([P('Ana', '#f00')], 4, 'Bo', '#0f0'), { ok: true })
})

Deno.test('checkJoinEligibility: full room -> 409 Room is full', () => {
  const players = [P('Ana', '#f00'), P('Bo', '#0f0')]
  assertEquals(checkJoinEligibility(players, 2, 'Cy', '#00f'), {
    ok: false,
    status: 409,
    error: 'Room is full',
  })
})

Deno.test('checkJoinEligibility: capacity is checked BEFORE color/name (full + clash -> full)', () => {
  const players = [P('Ana', '#f00'), P('Bo', '#0f0')]
  // color clashes too, but capacity wins
  assertEquals(checkJoinEligibility(players, 2, 'Cy', '#f00'), {
    ok: false,
    status: 409,
    error: 'Room is full',
  })
})

Deno.test('checkJoinEligibility: color clash -> 409', () => {
  assertEquals(checkJoinEligibility([P('Ana', '#f00')], 4, 'Bo', '  #f00  '), {
    ok: false,
    status: 409,
    error: 'That color is already taken. Choose a different color.',
  })
})

Deno.test('checkJoinEligibility: name clash is trimmed + case-insensitive -> 409', () => {
  assertEquals(checkJoinEligibility([P('Ana', '#f00')], 4, '  aNa  ', '#0f0'), {
    ok: false,
    status: 409,
    error: 'That name is already taken. Choose a different name.',
  })
})

Deno.test('checkJoinEligibility: color takes precedence over name when both clash', () => {
  // both the color and the name clash; color is checked first
  assertEquals(checkJoinEligibility([P('Ana', '#f00')], 4, 'ana', '#f00'), {
    ok: false,
    status: 409,
    error: 'That color is already taken. Choose a different color.',
  })
})

// submit_action/validate.test.ts
//
// Pure unit tests for the three exported functions in validate.ts.
// No IO, no DB, no live handler — all cases are table-driven in-process.
//
// Contract under test (T2):
//   endsTurn(type)            — boolean, 'fire'/'use_shield' => true, rest => false
//   validateActionShape(body) — 400 or {ok:true} over raw body shape
//   authorizeAction(args)     — 403 or {ok:true} over already-fetched room state
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/submit_action/validate.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { endsTurn, validateActionShape, authorizeAction } from './validate.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function human(id: string, name = 'Player'): StoredPlayer {
  return { id, name, color: '#ff0000', ready: true }
}

function bot(id: string): StoredPlayer {
  return { id, name: 'CPU', color: '#00ff00', ready: true, ai: 'medium' }
}

// ---------------------------------------------------------------------------
// endsTurn — 4 cases
// ---------------------------------------------------------------------------

Deno.test("endsTurn: 'fire' returns true", () => {
  assertEquals(endsTurn('fire'), true)
})

Deno.test("endsTurn: 'use_shield' returns true", () => {
  assertEquals(endsTurn('use_shield'), true)
})

Deno.test("endsTurn: 'buy' returns false", () => {
  assertEquals(endsTurn('buy'), false)
})

Deno.test("endsTurn: 'next_round' returns false", () => {
  assertEquals(endsTurn('next_round'), false)
})

// ---------------------------------------------------------------------------
// validateActionShape — happy path + every 400 branch
// ---------------------------------------------------------------------------

Deno.test('validateActionShape: valid fire passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: 80, weapon: 'missile' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: valid use_shield passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'use_shield' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: valid buy passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy', weapon: 'missile' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: valid next_round passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'next_round' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: missing roomId returns 400', () => {
  const result = validateActionShape({
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: roomId' })
})

Deno.test('validateActionShape: empty roomId returns 400', () => {
  const result = validateActionShape({
    roomId: '   ',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: roomId' })
})

Deno.test('validateActionShape: missing playerId returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    action: { type: 'fire', angle: 45, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: playerId' })
})

Deno.test('validateActionShape: empty playerId returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: '',
    action: { type: 'fire', angle: 45, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: playerId' })
})

Deno.test('validateActionShape: non-object action returns 400', () => {
  // action is deliberately typed as the union; cast through unknown to pass a non-object
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: null as unknown as { type: unknown },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action' })
})

Deno.test('validateActionShape: bad action.type returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'nuke' },
  })
  assertEquals(result, {
    ok: false,
    status: 400,
    error: 'Invalid input: action.type must be "fire", "use_shield", "buy", or "next_round"',
  })
})

Deno.test('validateActionShape: buy without weapon or accessory returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: buy action requires a weapon or accessory' })
})

Deno.test('validateActionShape: buy with empty weapon and no accessory returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy', weapon: '  ' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: buy action requires a weapon or accessory' })
})

Deno.test('validateActionShape: buy with battery accessory (no weapon) passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy', accessory: 'battery' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: buy with an unrecognized accessory and no weapon returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy', accessory: 'jetpack' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: buy action requires a weapon or accessory' })
})

Deno.test('validateActionShape: fire with NaN angle returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: NaN, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.angle must be a finite number' })
})

Deno.test('validateActionShape: fire with Infinity angle returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: Infinity, power: 50, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.angle must be a finite number' })
})

// Battery-boosted shots dial power ABOVE 100 (powerCap raised by a Battery). The referee
// has no powerCap knowledge and the engine clamps to powerCap on replay, so a >100 power
// MUST pass the referee — a hard 100 ceiling would reject battery shots over the network
// while hot-seat accepts them (a context drift). This pins the relaxed bound.
Deno.test('validateActionShape: fire with battery-boosted power 150 passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: 150, weapon: 'missile' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: fire with negative power returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: -1, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.power must be a finite number >= 0' })
})

Deno.test('validateActionShape: fire with NaN power returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: NaN, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.power must be a finite number >= 0' })
})

Deno.test('validateActionShape: fire with Infinity power returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: Infinity, weapon: 'missile' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.power must be a finite number >= 0' })
})

Deno.test('validateActionShape: buy with BOTH weapon and accessory returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'buy', weapon: 'missile', accessory: 'battery' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: buy action must set exactly one of weapon/accessory' })
})

Deno.test('validateActionShape: fire with empty weapon returns 400', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 45, power: 50, weapon: '' },
  })
  assertEquals(result, { ok: false, status: 400, error: 'Invalid input: action.weapon' })
})

// Boundary: power exactly 0 and 100 are valid
Deno.test('validateActionShape: fire with power 0 passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 0, power: 0, weapon: 'missile' },
  })
  assertEquals(result, { ok: true })
})

Deno.test('validateActionShape: fire with power 100 passes', () => {
  const result = validateActionShape({
    roomId: 'room-1',
    playerId: 'player-1',
    action: { type: 'fire', angle: 0, power: 100, weapon: 'missile' },
  })
  assertEquals(result, { ok: true })
})

// ---------------------------------------------------------------------------
// authorizeAction — happy path + every 403 branch
// ---------------------------------------------------------------------------

const PLAYER_A = human('uid-a', 'Alpha')
const PLAYER_B = human('uid-b', 'Bravo')
const BOT_C = bot('uid-c')

// (1) Active human fires their own shot — passes
Deno.test('authorizeAction: active human firing own shot passes', () => {
  const result = authorizeAction({
    action: { type: 'fire' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-a',
    isRoundOver: false,
    activeIndex: 0,
  })
  assertEquals(result, { ok: true })
})

// (2) next_round always passes (no turn gate)
Deno.test('authorizeAction: next_round always passes regardless of turn', () => {
  const result = authorizeAction({
    action: { type: 'next_round' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-a',
    isRoundOver: true,
    activeIndex: 1, // not their turn
  })
  assertEquals(result, { ok: true })
})

// (3) "Not your turn" — active player is B, but A submits for themselves
Deno.test('authorizeAction: wrong actingId returns 403 Not your turn', () => {
  const result = authorizeAction({
    action: { type: 'fire' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-b',
    actingId: 'uid-b',
    isRoundOver: false,
    activeIndex: 0, // PLAYER_A is active
  })
  assertEquals(result, { ok: false, status: 403, error: 'Not your turn' })
})

// (4) Bot-proxy BLOCKED — actingId !== playerId, active seat is human
Deno.test('authorizeAction: proxy for human returns 403 Cannot act for another human player', () => {
  const result = authorizeAction({
    action: { type: 'fire' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',   // submitter is A
    actingId: 'uid-b',   // acting as B (human) — blocked
    isRoundOver: false,
    activeIndex: 1,      // PLAYER_B is active
  })
  assertEquals(result, { ok: false, status: 403, error: 'Cannot act for another human player' })
})

// (5) Bot-proxy ALLOWED — actingId !== playerId, active seat IS a bot
Deno.test('authorizeAction: proxy for bot seat passes', () => {
  const result = authorizeAction({
    action: { type: 'fire' },
    players: [PLAYER_A, BOT_C],
    playerId: 'uid-a',  // submitter is the human
    actingId: 'uid-c',  // acting as the bot
    isRoundOver: false,
    activeIndex: 1,     // BOT_C is active
  })
  assertEquals(result, { ok: true })
})

// (6) ROUND_OVER buy — acting seat not in room returns 403
Deno.test('authorizeAction: round-over buy with acting seat not in room returns 403', () => {
  const result = authorizeAction({
    action: { type: 'buy', tankId: 'p1' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-z',  // not in room
    isRoundOver: true,
    activeIndex: 0,
  })
  assertEquals(result, { ok: false, status: 403, error: 'Acting seat not in room' })
})

// (7) ROUND_OVER buy — wrong tankId for own seat returns 403
Deno.test('authorizeAction: round-over buy with wrong tankId returns 403', () => {
  const result = authorizeAction({
    action: { type: 'buy', tankId: 'p2' }, // uid-a is seat 0 => must use 'p1'
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-a',
    isRoundOver: true,
    activeIndex: 0,
  })
  assertEquals(result, {
    ok: false,
    status: 403,
    error: 'Can only buy for your own tank in the between-rounds shop',
  })
})

// (8) ROUND_OVER buy — correct tankId passes (uid-a is index 0 => 'p1')
Deno.test('authorizeAction: round-over buy with correct tankId passes', () => {
  const result = authorizeAction({
    action: { type: 'buy', tankId: 'p1' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-a',
    isRoundOver: true,
    activeIndex: 0,
  })
  assertEquals(result, { ok: true })
})

// (9) ROUND_OVER buy — human proxying another human blocked even in round-over
Deno.test('authorizeAction: round-over buy proxy for another human returns 403', () => {
  const result = authorizeAction({
    action: { type: 'buy', tankId: 'p2' },
    players: [PLAYER_A, PLAYER_B],
    playerId: 'uid-a',
    actingId: 'uid-b',  // uid-a trying to act for uid-b (human)
    isRoundOver: true,
    activeIndex: 0,
  })
  assertEquals(result, { ok: false, status: 403, error: 'Cannot act for another human player' })
})

// (10) ROUND_OVER buy — human proxying a bot passes (correct tankId, bot seat 1 => 'p2')
Deno.test('authorizeAction: round-over buy proxy for bot passes', () => {
  const result = authorizeAction({
    action: { type: 'buy', tankId: 'p2' },
    players: [PLAYER_A, BOT_C],
    playerId: 'uid-a',
    actingId: 'uid-c',
    isRoundOver: true,
    activeIndex: 0,
  })
  assertEquals(result, { ok: true })
})

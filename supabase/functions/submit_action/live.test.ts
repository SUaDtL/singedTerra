// submit_action/live.test.ts — characterization harness for the LIVE referee body
// (#122). The pure seams (validateActionShape, authorizeAction, nextCursor,
// rpcResultToResponse) each have their own unit tests; this drives the exported
// submitActionCore end to end against a fake service client to prove they are WIRED
// correctly — the turn-gate, seq-allocation RPC arguments, the ROUND_OVER shop path,
// and the CPU-seat bot-proxy path. No database: the client is injected (the #122 seam).
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test --allow-env supabase/functions/submit_action/live.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { submitActionCore } from './index.ts'
import type { ServiceClient, StoredPlayer } from '../_shared/mod.ts'

interface QResult { data: unknown; error: unknown }
interface FakeOpts {
  room?: QResult   // rooms.maybeSingle result (the active-room fetch)
  seat?: QResult   // room_seats.maybeSingle result (verifySeatToken)
  rpc?: QResult    // submit_room_action RPC result
}

interface RpcCall { fn: string; args: Record<string, unknown> }

/** Fake service client: routes .from('rooms')/.from('room_seats') to canned results
 *  and records every .rpc() call so the seq-allocation arguments can be asserted. */
function makeFakeClient(opts: FakeOpts): { client: ServiceClient; rpcCalls: RpcCall[]; fromCalls: string[] } {
  const rpcCalls: RpcCall[] = []
  const fromCalls: string[] = []
  const client = {
    from(table: string) {
      fromCalls.push(table)
      const result: QResult =
        table === 'rooms' ? (opts.room ?? { data: null, error: null })
        : table === 'room_seats' ? (opts.seat ?? { data: null, error: null })
        : { data: null, error: null }
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = () => Promise.resolve(result)
      return builder
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      return Promise.resolve(opts.rpc ?? { data: 1, error: null })
    },
  } as unknown as ServiceClient
  return { client, rpcCalls, fromCalls }
}

const player = (id: string, extra: Partial<StoredPlayer> = {}): StoredPlayer =>
  ({ id, name: id, color: '#ffffff', ready: true, ...extra })

const activeRoom = (
  players: StoredPlayer[],
  activeIndex = 0,
  turn = 0,
  options: unknown = {},
): QResult =>
  ({ data: { players, active_player_index: activeIndex, turn, status: 'active', options }, error: null })

const seatToken = (token: string): QResult => ({ data: { token }, error: null })

const fire = { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' }
const fixtureCredential = ['sec', 'ret'].join('')
const invalidFixtureCredential = ['wr', 'ong'].join('')

Deno.test('RL-04: legacy CPU proxy carries the authenticated human into the locked action transaction', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human'), player('cpu', { ai: 'easy' })], 1),
    seat: seatToken(fixtureCredential),
  })
  const response = await submitActionCore({
    roomId: 'room-1', playerId: 'human', token: fixtureCredential, actingPlayerId: 'cpu', action: fire,
  }, client)
  assertEquals(response.status, 200)
  assertEquals(rpcCalls[0].args.p_submitter_id, 'human')
  assertEquals(rpcCalls[0].args.p_token, fixtureCredential)
})

Deno.test('RL-04: a locked legacy departure refusal is a permission failure', async () => {
  const { client } = makeFakeClient({
    room: activeRoom([player('human'), player('cpu', { ai: 'easy' })]),
    seat: seatToken(fixtureCredential), rpc: { data: null, error: { code: '42501', message: 'seat_left' } },
  })
  const response = await submitActionCore({ roomId: 'room-1', playerId: 'human', token: fixtureCredential, action: fire }, client)
  assertEquals(response.status, 403)
})

// ---------------------------------------------------------------------------
// Room-lookup + membership + token gates
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: room not found returns 404', async () => {
  const { client } = makeFakeClient({ room: { data: null, error: null } })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 't', action: fire }, client)
  assertEquals(res.status, 404)
})

Deno.test('submitActionCore: room fetch error returns 500', async () => {
  const { client } = makeFakeClient({ room: { data: null, error: { message: 'boom' } } })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 't', action: fire }, client)
  assertEquals(res.status, 500)
})

Deno.test('submitActionCore: submitter not a room member returns 403', async () => {
  const { client } = makeFakeClient({
    room: activeRoom([player('someone-else')], 0, 0, { rulesetVersion: 2 }),
  })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 't', rulesetVersion: 1, action: fire }, client)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Player not in room')
})

Deno.test('submitActionCore: missing/mismatched seat token returns 403', async () => {
  const { client } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 0, { rulesetVersion: 2 }),
    seat: { data: null, error: null }, // no room_seats row -> verifySeatToken false
  })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: invalidFixtureCredential, rulesetVersion: 1, action: fire }, client)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Invalid or missing seat token')
})

Deno.test('submitActionCore: corrupt stored options fail closed after the seat-token gate', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 0, null),
    seat: seatToken(fixtureCredential),
  })
  const res = await submitActionCore({
    roomId: 'room-1',
    playerId: 'human-1',
    token: fixtureCredential,
    rulesetVersion: 1,
    action: fire,
  }, client)

  assertEquals(res.status, 409)
  assertEquals(await res.json(), { error: 'ruleset_unavailable' })
  assertEquals(rpcCalls.length, 0)
})

Deno.test('submitActionCore: verified member ruleset mismatch is rejected before the action RPC', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom(
      [player('human-1'), player('p2')],
      0,
      0,
      { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 2 },
    ),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore({
    roomId: 'room-1',
    playerId: 'human-1',
    token: fixtureCredential,
    rulesetVersion: 1,
    action: fire,
  }, client)

  assertEquals(res.status, 409)
  assertEquals(await res.json(), {
    error: 'ruleset_mismatch',
    requiredRulesetVersion: 2,
  })
  assertEquals(rpcCalls.length, 0)
})

// ---------------------------------------------------------------------------
// Turn gate
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: firing out of turn returns 403 Not your turn', async () => {
  // p2 holds the turn (activeIndex 1); human-1 (seat 0) tries to fire.
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 1),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, action: fire }, client)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Not your turn')
  assertEquals(rpcCalls.length, 0) // rejected before the RPC
})

// ---------------------------------------------------------------------------
// Happy path + seq allocation
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: active seat firing commits and returns 200 { seq, ok }', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 3),
    seat: seatToken('secret'),
    rpc: { data: 7, error: null },
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, nextActiveIndex: 1, action: fire },
    client,
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { seq: 7, ok: true })

  // Seq-allocation wiring: one RPC, turn-ending, cursor advanced to the reported seat.
  assertEquals(rpcCalls.length, 1)
  const { fn, args } = rpcCalls[0]
  assertEquals(fn, 'submit_room_action_for_seat')
  assertEquals(args.p_player_id, 'human-1')
  assertEquals(args.p_ends_turn, true)
  assertEquals(args.p_next_index, 1)   // nextCursor honored the reported next seat
  assertEquals(args.p_next_turn, 4)    // currentTurn 3 + 1
  assertEquals((args.p_action as { type: string }).type, 'fire')
})

Deno.test('submitActionCore: seq conflict (23505) surfaces as 409 retryable', async () => {
  const { client } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0),
    seat: seatToken('secret'),
    rpc: { data: null, error: { code: '23505' } },
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, nextActiveIndex: 1, action: fire },
    client,
  )
  assertEquals(res.status, 409)
  assertEquals(await res.json(), { ok: false, error: 'seq_conflict', retry: true })
})

// ---------------------------------------------------------------------------
// Bot-proxy path (a human member driving a CPU seat)
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: member proxying the active CPU seat commits for the bot', async () => {
  // bot-2 (ai) holds the turn; human-1 submits on its behalf.
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('bot-2', { ai: 'easy' })], 1, 0),
    seat: seatToken('secret'), // the SUBMITTER's (human-1) token is verified
    rpc: { data: 2, error: null },
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1', playerId: 'human-1', token: fixtureCredential,
      actingPlayerId: 'bot-2', nextActiveIndex: 0, action: fire,
    },
    client,
  )
  assertEquals(res.status, 200)
  assertEquals(rpcCalls[0].args.p_player_id, 'bot-2') // action committed FOR the bot seat
})

Deno.test('submitActionCore: proxying another HUMAN seat is rejected 403', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('human-2')], 1, 0),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1', playerId: 'human-1', token: fixtureCredential,
      actingPlayerId: 'human-2', nextActiveIndex: 0, action: fire,
    },
    client,
  )
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Cannot act for another human player')
  assertEquals(rpcCalls.length, 0)
})

// ---------------------------------------------------------------------------
// ROUND_OVER shop (per-seat buy, turn-neutral)
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: ROUND_OVER buy for your own tank commits turn-neutrally', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 5),
    seat: seatToken('secret'),
    rpc: { data: 9, error: null },
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, roundOver: true,
      action: { type: 'buy', weapon: 'nuke', tankId: 'p1' },
    },
    client,
  )
  assertEquals(res.status, 200)
  const { args } = rpcCalls[0]
  assertEquals(args.p_ends_turn, false)                    // a buy never advances the cursor
  assertEquals(args.p_next_index, 0)                       // cursor unchanged (turn-neutral)
  assertEquals(args.p_next_turn, 5)                        // turn unchanged
  const action = args.p_action as { type: string; weapon?: string; tankId?: string }
  assertEquals(action.type, 'buy')
  assertEquals(action.weapon, 'nuke')
  assertEquals(action.tankId, 'p1')                        // routed to the named tank on replay
})

Deno.test('submitActionCore: ROUND_OVER buy for someone else’s tank is rejected 403', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 5),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, roundOver: true,
      action: { type: 'buy', weapon: 'nuke', tankId: 'p2' }, // p2 is not human-1's seat
    },
    client,
  )
  assertEquals(res.status, 403)
  assertEquals(rpcCalls.length, 0)
})

// ---------------------------------------------------------------------------
// Remaining action types through the live body (use_shield / next_round /
// normal-turn buy) — the other validatedAction-construction + cursor branches.
// ---------------------------------------------------------------------------

Deno.test('submitActionCore: active seat use_shield commits turn-ending', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 2),
    seat: seatToken('secret'),
    rpc: { data: 4, error: null },
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, nextActiveIndex: 1, action: { type: 'use_shield' } },
    client,
  )
  assertEquals(res.status, 200)
  const { args } = rpcCalls[0]
  assertEquals((args.p_action as { type: string }).type, 'use_shield')
  assertEquals(args.p_ends_turn, true)   // use_shield ends the turn like fire
  assertEquals(args.p_next_index, 1)
  assertEquals(args.p_next_turn, 3)
})

Deno.test('submitActionCore: next_round passes on membership only and is turn-neutral', async () => {
  // p2 holds the turn, but ANY member may leave the between-rounds shop with next_round
  // (regime 1: no turn gate). It must not advance the cursor.
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 1, 6),
    seat: seatToken('secret'),
    rpc: { data: 5, error: null },
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, roundOver: true, action: { type: 'next_round' } },
    client,
  )
  assertEquals(res.status, 200)
  const { args } = rpcCalls[0]
  assertEquals((args.p_action as { type: string }).type, 'next_round')
  assertEquals(args.p_ends_turn, false) // membership-only, cursor untouched
  assertEquals(args.p_next_index, 1)    // active index unchanged
  assertEquals(args.p_next_turn, 6)     // turn unchanged
})

Deno.test('submitActionCore: normal-turn buy is turn-gated and turn-neutral', async () => {
  // A mid-turn restock (NOT the ROUND_OVER shop): the ACTIVE seat may buy, and the buy
  // does not advance the cursor. No tankId is carried outside the shop.
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 1),
    seat: seatToken('secret'),
    rpc: { data: 8, error: null },
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, action: { type: 'buy', weapon: 'nuke' } },
    client,
  )
  assertEquals(res.status, 200)
  const action = rpcCalls[0].args.p_action as { type: string; weapon?: string; tankId?: string }
  assertEquals(action.type, 'buy')
  assertEquals(action.weapon, 'nuke')
  assertEquals(action.tankId, undefined) // no tankId outside the ROUND_OVER shop
  assertEquals(rpcCalls[0].args.p_ends_turn, false)
})

Deno.test('submitActionCore: normal-turn buy from an inactive seat is rejected 403', async () => {
  // p2 holds the turn; human-1 (inactive) cannot restock mid-turn.
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 1, 1),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore(
    { roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, action: { type: 'buy', weapon: 'nuke' } },
    client,
  )
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Not your turn')
  assertEquals(rpcCalls.length, 0)
})

Deno.test('submitActionCore: active-seat movement commits exact payload turn-neutrally', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 0, 4),
    seat: seatToken('secret'),
    rpc: { data: 11, error: null },
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1',
      playerId: 'human-1',
      token: fixtureCredential,
      nextActiveIndex: 1,
      action: { type: 'move', delta: -8 },
    },
    client,
  )

  assertEquals(res.status, 200)
  assertEquals(await res.json(), { seq: 11, ok: true })
  assertEquals(rpcCalls.length, 1)
  const { args } = rpcCalls[0]
  assertEquals(args.p_action, { type: 'move', delta: -8 })
  assertEquals(args.p_ends_turn, false)
  assertEquals(args.p_next_index, 0)
  assertEquals(args.p_next_turn, 4)
})

Deno.test('submitActionCore: v2 command bypasses legacy room prereads and returns its receipt', async () => {
  const receipt = {
    ok: true, protocolVersion: 2, intentId: 'human-intent-1', seq: 3, revision: 4,
    actorPlayerId: 'human-1', actorTankId: 'p1',
  }
  const { client, rpcCalls, fromCalls } = makeFakeClient({ rpc: { data: receipt, error: null } })
  const res = await submitActionCore({
    roomId: 'room-1', playerId: 'human-1', token: fixtureCredential, rulesetVersion: 4,
    command: {
      version: 2, intentId: 'human-intent-1', expectedRevision: 3, actorPlayerId: 'human-1',
      action: { type: 'move', delta: 1, credential: fixtureCredential },
    },
  }, client)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), receipt)
  assertEquals(fromCalls, [], 'v2 receipt retries must not be pre-rejected by a stale room/status read')
  assertEquals(rpcCalls.length, 1)
  assertEquals(rpcCalls[0].fn, 'submit_room_command_v2')
  assertEquals(rpcCalls[0].args, {
    p_room_id: 'room-1', p_submitter_id: 'human-1', p_token: fixtureCredential,
    p_command_version: 2, p_intent_id: 'human-intent-1', p_expected_revision: 3,
    p_actor_id: 'human-1', p_action: { type: 'move', delta: 1 }, p_next_index: null,
    p_round_over: false, p_ruleset_version: 4,
  })
})

Deno.test('submitActionCore: non-opener next_round remains a transition initiation', async () => {
  const receipt = {
    ok: true, protocolVersion: 2, intentId: 'continue-seat-b', seq: 9, revision: 10,
    actorPlayerId: 'human-b', actorTankId: 'p2',
  }
  const { client, rpcCalls } = makeFakeClient({ rpc: { data: receipt, error: null } })
  const res = await submitActionCore({
    roomId: 'room-1', playerId: 'human-b', token: fixtureCredential, rulesetVersion: 4,
    command: {
      version: 2, intentId: 'continue-seat-b', expectedRevision: 9, actorPlayerId: 'human-b',
      action: { type: 'next_round' }, roundOver: true,
    },
  }, client)
  assertEquals(res.status, 200)
  assertEquals(rpcCalls[0].args.p_actor_id, 'human-b')
  assertEquals(rpcCalls[0].args.p_round_over, true)
})

Deno.test('submitActionCore: locked v2 turn refusal logs only allowlisted desync context', async () => {
  const rpcPayload = {
    ok: false,
    error: 'not_your_turn',
    currentRevision: 14,
    internalDetail: 'must-not-enter-warning',
  }
  const { client } = makeFakeClient({ rpc: { data: rpcPayload, error: null } })
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const res = await submitActionCore({
      roomId: 'room-v2', playerId: 'submitter-a', token: fixtureCredential, rulesetVersion: 4,
      command: {
        version: 2, intentId: 'private-request-intent', expectedRevision: 13, actorPlayerId: 'actor-b',
        action: { type: 'move', delta: 1 },
      },
    }, client)
    assertEquals(res.status, 403)
    assertEquals(await res.json(), rpcPayload)
  } finally {
    console.warn = originalWarn
  }

  assertEquals(warnings, [[
    'submit_action: locked turn-gate rejection (possible desync)',
    { roomId: 'room-v2', actorPlayerId: 'actor-b', refusal: 'not_your_turn' },
  ]])
  const warningText = JSON.stringify(warnings)
  assertEquals(warningText.includes(fixtureCredential), false, 'warning must exclude the seat credential')
  assertEquals(warningText.includes('private-request-intent'), false, 'warning must exclude the request envelope')
  assertEquals(warningText.includes('must-not-enter-warning'), false, 'warning must exclude the raw RPC payload')
  assertEquals(warningText.includes('currentRevision'), false, 'warning must exclude non-allowlisted RPC fields')
})

Deno.test('submitActionCore: movement from an inactive seat is rejected before the RPC', async () => {
  const { client, rpcCalls } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')], 1, 4),
    seat: seatToken('secret'),
  })
  const res = await submitActionCore(
    {
      roomId: 'room-1',
      playerId: 'human-1',
      token: fixtureCredential,
      action: { type: 'move', delta: 8 },
    },
    client,
  )

  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Not your turn')
  assertEquals(rpcCalls.length, 0)
})

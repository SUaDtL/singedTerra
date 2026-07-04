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
function makeFakeClient(opts: FakeOpts): { client: ServiceClient; rpcCalls: RpcCall[] } {
  const rpcCalls: RpcCall[] = []
  const client = {
    from(table: string) {
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
  return { client, rpcCalls }
}

const player = (id: string, extra: Partial<StoredPlayer> = {}): StoredPlayer =>
  ({ id, name: id, color: '#ffffff', ready: true, ...extra })

const activeRoom = (players: StoredPlayer[], activeIndex = 0, turn = 0): QResult =>
  ({ data: { players, active_player_index: activeIndex, turn, status: 'active' }, error: null })

const seatToken = (token: string): QResult => ({ data: { token }, error: null })

const fire = { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' }

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
  const { client } = makeFakeClient({ room: activeRoom([player('someone-else')]) })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 't', action: fire }, client)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Player not in room')
})

Deno.test('submitActionCore: missing/mismatched seat token returns 403', async () => {
  const { client } = makeFakeClient({
    room: activeRoom([player('human-1'), player('p2')]),
    seat: { data: null, error: null }, // no room_seats row -> verifySeatToken false
  })
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 'wrong', action: fire }, client)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Invalid or missing seat token')
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
  const res = await submitActionCore({ roomId: 'room-1', playerId: 'human-1', token: 'secret', action: fire }, client)
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', nextActiveIndex: 1, action: fire },
    client,
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { seq: 7, ok: true })

  // Seq-allocation wiring: one RPC, turn-ending, cursor advanced to the reported seat.
  assertEquals(rpcCalls.length, 1)
  const { fn, args } = rpcCalls[0]
  assertEquals(fn, 'submit_room_action')
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', nextActiveIndex: 1, action: fire },
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
      roomId: 'room-1', playerId: 'human-1', token: 'secret',
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
      roomId: 'room-1', playerId: 'human-1', token: 'secret',
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
      roomId: 'room-1', playerId: 'human-1', token: 'secret', roundOver: true,
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
      roomId: 'room-1', playerId: 'human-1', token: 'secret', roundOver: true,
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', nextActiveIndex: 1, action: { type: 'use_shield' } },
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', roundOver: true, action: { type: 'next_round' } },
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', action: { type: 'buy', weapon: 'nuke' } },
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
    { roomId: 'room-1', playerId: 'human-1', token: 'secret', action: { type: 'buy', weapon: 'nuke' } },
    client,
  )
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Not your turn')
  assertEquals(rpcCalls.length, 0)
})

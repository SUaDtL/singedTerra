import {
  replayVerifiedTranscript,
  VERIFIED_REPLAY_MAX_ACTIONS,
  VERIFIED_REPLAY_MAX_TICKS,
  VERIFIED_REPLAY_MAX_TICKS_PER_TURN,
  VERIFIED_REPLAY_MAX_TURN_ACTIONS,
} from './verifiedMatchReplay.ts'

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const CONFIG = {
  engineVersion: 1,
  rulesetVersion: 3,
  options: {
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 0x7a17b00c,
    maxWind: 10,
    gravity: 0.15,
    walls: 'open',
    hazards: 'none',
    rounds: 1,
    interestRate: 0,
    suddenDeathTurn: 0,
    armsLevel: 4,
    teamMode: false,
    starterWeaponFalloff: 'decisive',
  },
}

const TERMINAL_TRANSCRIPT = Array.from({ length: 3 }, () => ({
  type: 'fire' as const,
  angle: 90,
  power: 8,
  weapon: 'missile',
}))

function assertReplayError(expectedCode: string, run: () => unknown): void {
  let code = ''
  try {
    run()
  } catch (error) {
    code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  }
  assertEqual(code, expectedCode, 'replay error code')
}

Deno.test('verified replay derives the terminal winner from the real shared engine', () => {
  const result = replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT)

  assertEqual(result.phase, 'GAME_OVER', 'terminal phase')
  assertEqual(result.winner, 'p2', 'winner derived from transcript')
  assertEqual(result.turn, 2, 'resolved turn index')
  assertEqual(result.actionCount, 3, 'validated action count')
  if (result.tickCount <= 0) throw new Error('real engine replay must consume physics ticks')
  if (result.maxTurnTickCount <= 0) throw new Error('replay must expose its peak per-turn tick cost')
})

Deno.test('verified replay rejects a transcript beyond the accepted action bound before replay', () => {
  const oversized = Array.from(
    { length: VERIFIED_REPLAY_MAX_ACTIONS + 1 },
    () => ({ type: 'move' as const, delta: 1 }),
  )
  assertReplayError('action_limit', () => replayVerifiedTranscript(CONFIG, oversized))
})

Deno.test('verified replay caps turn-ending work before replay begins', () => {
  const oversized = Array.from(
    { length: VERIFIED_REPLAY_MAX_TURN_ACTIONS + 1 },
    () => ({ type: 'fire' as const, angle: 90, power: 8, weapon: 'missile' }),
  )
  assertReplayError('turn_action_limit', () => replayVerifiedTranscript(CONFIG, oversized))
})

Deno.test('verified replay fails closed on total and per-turn physics budgets', () => {
  assertReplayError('tick_limit', () => replayVerifiedTranscript(
    CONFIG,
    TERMINAL_TRANSCRIPT,
    { maxTicks: 1 },
  ))
  assertReplayError('turn_tick_limit', () => replayVerifiedTranscript(
    CONFIG,
    TERMINAL_TRANSCRIPT,
    { maxTicksPerTurn: 1 },
  ))
})

Deno.test('verified replay requires one exact terminal transcript with no trailing actions', () => {
  assertReplayError('empty_transcript', () => replayVerifiedTranscript(CONFIG, []))
  assertReplayError('non_terminal', () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT.slice(0, 2)))
  assertReplayError('trailing_action', () => replayVerifiedTranscript(CONFIG, [
    ...TERMINAL_TRANSCRIPT,
    ...Array.from({ length: 2 }, () => ({
      type: 'fire' as const,
      angle: 90,
      power: 8,
      weapon: 'missile',
    })),
  ]))
})

Deno.test('verified replay rejects malformed runtime actions and actions the engine would ignore', () => {
  assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'teleport', x: 10 },
  ]))
  assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'fire', angle: 90, power: 8, weapon: 'missile', winner: 'p1' },
  ]))
  for (const inheritedName of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [
      { type: 'fire', angle: 90, power: 8, weapon: inheritedName },
    ]))
    assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [
      { type: 'buy', weapon: inheritedName },
    ]))
    assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [
      { type: 'buy', accessory: inheritedName },
    ]))
  }
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'fire', angle: 45, power: 100, weapon: 'nuke' },
  ]))
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'next_round' },
  ]))
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'buy', weapon: 'nuke' },
  ]))
})

Deno.test('verified replay accepts every canonical action variant only when it changes engine state', () => {
  for (const action of [
    { type: 'buy', weapon: 'dirt_bomb' },
    { type: 'move', delta: 1 },
    { type: 'use_shield', weapon: 'shield' },
  ]) {
    assertReplayError('non_terminal', () => replayVerifiedTranscript(CONFIG, [action]))
  }
})

Deno.test('verified replay accepts only a finite versioned server configuration', () => {
  for (const config of [
    { ...CONFIG, engineVersion: 2 },
    { ...CONFIG, rulesetVersion: 99 },
    { ...CONFIG, options: { ...CONFIG.options, rounds: Number.POSITIVE_INFINITY } },
    { ...CONFIG, options: { ...CONFIG.options, rounds: 5 } },
    { ...CONFIG, options: { ...CONFIG.options, maxPlayers: 3 } },
    { ...CONFIG, options: { ...CONFIG.options, gravity: 0.05 } },
    { ...CONFIG, options: { ...CONFIG.options, gravity: Number.NaN } },
    { ...CONFIG, options: { ...CONFIG.options, suddenDeathTurn: 51 } },
    { ...CONFIG, options: { ...CONFIG.options, debug: true } },
    {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', admin: true },
          CONFIG.options.players[1],
        ],
      },
    },
    {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', team: 1 },
          { name: 'P2', color: '#4d8ce8', team: 2 },
        ],
      },
    },
    {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        maxPlayers: 4,
        players: [
          { name: 'P1', color: '#e84d4d', team: 1 },
          { name: 'P2', color: '#4d8ce8', team: 1 },
          { name: 'P3', color: '#4de884', team: 1 },
          { name: 'P4', color: '#e8c44d', team: 2 },
        ],
        teamMode: true,
      },
    },
    {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', ai: 'hard' },
          { name: 'P2', color: '#4d8ce8', ai: 'hard' },
        ],
      },
    },
  ]) {
    assertReplayError('invalid_config', () => replayVerifiedTranscript(config, TERMINAL_TRANSCRIPT))
  }

  assertReplayError('empty_transcript', () => replayVerifiedTranscript({
    ...CONFIG,
    options: {
      ...CONFIG.options,
      maxPlayers: 4,
      players: [
        { ...CONFIG.options.players[0], team: 1 },
        { ...CONFIG.options.players[1], team: 2 },
        { name: 'P3', color: '#4de884', team: 1 },
        { name: 'P4', color: '#e8c44d', team: 2 },
      ],
      gravity: 0.4,
      rounds: 3,
      interestRate: 0.5,
      suddenDeathTurn: 50,
      teamMode: true,
    },
  }, []))
})

Deno.test('verified replay limits can tighten but never disable or expand hard ceilings', () => {
  for (const maxActions of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, VERIFIED_REPLAY_MAX_ACTIONS + 1]) {
    assertReplayError('invalid_limits', () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT, { maxActions }))
  }
  for (const maxTurnActions of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, VERIFIED_REPLAY_MAX_TURN_ACTIONS + 1]) {
    assertReplayError('invalid_limits', () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT, { maxTurnActions }))
  }
  for (const maxTicks of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, VERIFIED_REPLAY_MAX_TICKS + 1]) {
    assertReplayError('invalid_limits', () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT, { maxTicks }))
  }
  for (const maxTicksPerTurn of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, VERIFIED_REPLAY_MAX_TICKS_PER_TURN + 1]) {
    assertReplayError('invalid_limits', () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT, { maxTicksPerTurn }))
  }
})

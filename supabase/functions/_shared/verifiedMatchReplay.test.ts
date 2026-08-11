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

function assertReplayError(expectedCode: string, run: () => unknown, label = 'replay error code'): void {
  let code = ''
  try {
    run()
  } catch (error) {
    code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  }
  assertEqual(code, expectedCode, label)
}

function assertAcceptedAction(action: unknown, label: string): void {
  assertReplayError('non_terminal', () => replayVerifiedTranscript(CONFIG, [action]), label)
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

Deno.test('verified replay strictly parses every shield, move, and buy payload shape', () => {
  const accepted = [
    ['standard shield', { type: 'use_shield', weapon: 'shield' }],
    ['heavy shield', { type: 'use_shield', weapon: 'heavy_shield' }],
    ['move left', { type: 'move', delta: -1 }],
    ['move right', { type: 'move', delta: 1 }],
    ['weapon buy', { type: 'buy', weapon: 'dirt_bomb' }],
    ['accessory buy', { type: 'buy', accessory: 'battery' }],
    ['parachute buy', { type: 'buy', accessory: 'parachute' }],
  ] as const
  for (const [name, action] of accepted) {
    assertAcceptedAction(action, `${name} must reach the engine`)
  }

  const malformed = [
    ['fire without angle', { type: 'fire', power: 8, weapon: 'missile' }],
    ['fire below angle bound', { type: 'fire', angle: -1, power: 8, weapon: 'missile' }],
    ['fire above angle bound', { type: 'fire', angle: 181, power: 8, weapon: 'missile' }],
    ['fire with non-finite power', { type: 'fire', angle: 90, power: Number.POSITIVE_INFINITY, weapon: 'missile' }],
    ['fire with negative power', { type: 'fire', angle: 90, power: -1, weapon: 'missile' }],
    ['fire with shield inventory', { type: 'fire', angle: 90, power: 8, weapon: 'shield' }],
    ['shield without provenance', { type: 'use_shield' }],
    ['unknown shield', { type: 'use_shield', weapon: 'force_field' }],
    ['shield with an extra field', { type: 'use_shield', weapon: 'shield', tankId: 'p1' }],
    ['move without delta', { type: 'move' }],
    ['zero move', { type: 'move', delta: 0 }],
    ['fractional move', { type: 'move', delta: 1.5 }],
    ['move below bound', { type: 'move', delta: -9 }],
    ['move above bound', { type: 'move', delta: 9 }],
    ['move with an extra field', { type: 'move', delta: 1, fuel: 1 }],
    ['buy without an item', { type: 'buy' }],
    ['buy with both item kinds', { type: 'buy', weapon: 'dirt_bomb', accessory: 'battery' }],
    ['buy with an unknown weapon', { type: 'buy', weapon: 'railgun' }],
    ['buy with an unknown accessory', { type: 'buy', accessory: 'jetpack' }],
    ['buy with a non-string tank', { type: 'buy', weapon: 'dirt_bomb', tankId: 1 }],
    ['buy with an out-of-range tank', { type: 'buy', weapon: 'dirt_bomb', tankId: 'p5' }],
    ['buy with an extra field', { type: 'buy', weapon: 'dirt_bomb', quantity: 1 }],
  ] as const
  for (const [name, action] of malformed) {
    assertReplayError('invalid_action', () => replayVerifiedTranscript(CONFIG, [action]), name)
  }
})

Deno.test('verified replay enforces inventory, movement, and purchase context legality', () => {
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'use_shield', weapon: 'shield' },
    { type: 'use_shield', weapon: 'shield' },
    { type: 'use_shield', weapon: 'shield' },
  ]), 'exhausted shield inventory')
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'fire', angle: 90, power: 8, weapon: 'heavy_missile' },
    { type: 'fire', angle: 90, power: 8, weapon: 'heavy_missile' },
    { type: 'fire', angle: 90, power: 8, weapon: 'heavy_missile' },
  ]), 'exhausted weapon inventory')
  assertReplayError('illegal_action', () => replayVerifiedTranscript(
    CONFIG,
    Array.from({ length: 14 }, () => ({ type: 'move' as const, delta: -8 })),
  ), 'terrain-blocked movement must not count as a committed action')
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'buy', accessory: 'fuel_tank' },
  ]), 'unaffordable accessory')
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'buy', weapon: 'baby_missile' },
  ]), 'unlimited inventory cannot be purchased')
  assertReplayError('illegal_action', () => replayVerifiedTranscript(CONFIG, [
    { type: 'buy', weapon: 'dirt_bomb', tankId: 'p1' },
  ]), 'tank-scoped buy during player turn')
})

Deno.test('verified replay accepts legal actions in player-turn and round-over contexts', () => {
  const terminal = replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT)
  assertEqual(terminal.phase, 'GAME_OVER', 'fire action context')

  const roundOverConfig = {
    ...CONFIG,
    options: { ...CONFIG.options, rounds: 3 },
  }
  for (const [name, purchase] of [
    ['round-over weapon buy', { type: 'buy' as const, weapon: 'dirt_bomb', tankId: 'p1' }],
    ['round-over accessory buy', { type: 'buy' as const, accessory: 'battery', tankId: 'p2' }],
  ] as const) {
    assertReplayError('non_terminal', () => replayVerifiedTranscript(roundOverConfig, [
      ...TERMINAL_TRANSCRIPT,
      purchase,
    ]), name)
  }
  assertReplayError('illegal_action', () => replayVerifiedTranscript(roundOverConfig, [
    ...TERMINAL_TRANSCRIPT,
    { type: 'buy', weapon: 'dirt_bomb' },
  ]), 'round-over buy requires a tank target')
  assertReplayError('non_terminal', () => replayVerifiedTranscript(roundOverConfig, [
    ...TERMINAL_TRANSCRIPT,
    { type: 'next_round' },
  ]), 'next-round action context')
})

Deno.test('verified replay accepts only a finite versioned server configuration', () => {
  const invalidConfigs = [
    ['extra root field', { ...CONFIG, auditMode: true }],
    ['second extra root field', { ...CONFIG, requestId: 'fixture-request' }],
    ['engine version', { ...CONFIG, engineVersion: 2 }],
    ['ruleset version', { ...CONFIG, rulesetVersion: 99 }],
    ['infinite rounds', { ...CONFIG, options: { ...CONFIG.options, rounds: Number.POSITIVE_INFINITY } }],
    ['unsupported rounds', { ...CONFIG, options: { ...CONFIG.options, rounds: 5 } }],
    ['player count mismatch', { ...CONFIG, options: { ...CONFIG.options, maxPlayers: 3 } }],
    ['gravity below bound', { ...CONFIG, options: { ...CONFIG.options, gravity: 0.05 } }],
    ['gravity above bound', { ...CONFIG, options: { ...CONFIG.options, gravity: 0.400_001 } }],
    ['non-finite gravity', { ...CONFIG, options: { ...CONFIG.options, gravity: Number.NaN } }],
    ['invalid walls', { ...CONFIG, options: { ...CONFIG.options, walls: 'portal' } }],
    ['invalid hazards', { ...CONFIG, options: { ...CONFIG.options, hazards: 'acid' } }],
    ['interest below bound', { ...CONFIG, options: { ...CONFIG.options, interestRate: -0.001 } }],
    ['interest above bound', { ...CONFIG, options: { ...CONFIG.options, interestRate: 0.501 } }],
    ['non-finite interest', { ...CONFIG, options: { ...CONFIG.options, interestRate: Number.NaN } }],
    ['arms level below bound', { ...CONFIG, options: { ...CONFIG.options, armsLevel: -1 } }],
    ['arms level above bound', { ...CONFIG, options: { ...CONFIG.options, armsLevel: 5 } }],
    ['fractional arms level', { ...CONFIG, options: { ...CONFIG.options, armsLevel: 1.5 } }],
    ['non-boolean team mode', { ...CONFIG, options: { ...CONFIG.options, teamMode: 1 } }],
    ['team mode with three seats', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        maxPlayers: 3,
        players: [
          CONFIG.options.players[0],
          CONFIG.options.players[1],
          { name: 'P3', color: '#4de884' },
        ],
        teamMode: true,
      },
    }],
    ['unsupported starter falloff', { ...CONFIG, options: { ...CONFIG.options, starterWeaponFalloff: 'legacy' } }],
    ['sudden-death below bound', { ...CONFIG, options: { ...CONFIG.options, suddenDeathTurn: -1 } }],
    ['fractional sudden-death turn', { ...CONFIG, options: { ...CONFIG.options, suddenDeathTurn: 0.5 } }],
    ['sudden-death above bound', { ...CONFIG, options: { ...CONFIG.options, suddenDeathTurn: 51 } }],
    ['extra option', { ...CONFIG, options: { ...CONFIG.options, debug: true } }],
    ['duplicate player name ignoring case', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [CONFIG.options.players[0], { name: 'p1', color: '#4d8ce8' }],
      },
    }],
    ['duplicate player color ignoring case', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [CONFIG.options.players[0], { name: 'P2', color: '#E84D4D' }],
      },
    }],
    ...[-1, 0x1_0000_0000, 1.5, Number.NaN].map((seed) => [
      `seed ${String(seed)}`,
      { ...CONFIG, options: { ...CONFIG.options, seed } },
    ] as const),
    ...[-0.1, 10.1, Number.POSITIVE_INFINITY].map((maxWind) => [
      `wind ${String(maxWind)}`,
      { ...CONFIG, options: { ...CONFIG.options, maxWind } },
    ] as const),
    ['player is not an object', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [null, CONFIG.options.players[1]] },
    }],
    ['player name is blank', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: '', color: '#e84d4d' }, CONFIG.options.players[1]] },
    }],
    ['player name is not trimmed', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: ' P1', color: '#e84d4d' }, CONFIG.options.players[1]] },
    }],
    ['player name exceeds 40 characters', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: 'x'.repeat(41), color: '#e84d4d' }, CONFIG.options.players[1]] },
    }],
    ['player color is malformed', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: 'P1', color: 'red' }, CONFIG.options.players[1]] },
    }],
    ['player AI is malformed', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: 'P1', color: '#e84d4d', ai: 'expert' }, CONFIG.options.players[1]] },
    }],
    ['player team is malformed', {
      ...CONFIG,
      options: { ...CONFIG.options, players: [{ name: 'P1', color: '#e84d4d', team: 3 }, CONFIG.options.players[1]] },
    }],
    ['player has an extra field', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', admin: true },
          CONFIG.options.players[1],
        ],
      },
    }],
    ['team metadata in free-for-all', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', team: 1 },
          { name: 'P2', color: '#4d8ce8', team: 2 },
        ],
      },
    }],
    ['unbalanced team metadata', {
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
    }],
    ['all players are CPU controlled', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        players: [
          { name: 'P1', color: '#e84d4d', ai: 'hard' },
          { name: 'P2', color: '#4d8ce8', ai: 'hard' },
        ],
      },
    }],
  ] as const
  for (const [name, config] of invalidConfigs) {
    assertReplayError('invalid_config', () => replayVerifiedTranscript(config, TERMINAL_TRANSCRIPT), name)
  }

  for (const [name, config] of [
    ['minimum config bounds', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        seed: 0,
        maxWind: 0,
        gravity: 0.15,
        interestRate: 0,
        suddenDeathTurn: 0,
        armsLevel: 0,
      },
    }],
    ['valid three-seat free-for-all', {
      ...CONFIG,
      options: {
        ...CONFIG.options,
        maxPlayers: 3,
        players: [
          CONFIG.options.players[0],
          CONFIG.options.players[1],
          { name: 'P3', color: '#4de884' },
        ],
      },
    }],
    ['maximum config bounds and balanced teams', {
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
        seed: 0xffff_ffff,
        maxWind: 10,
        gravity: 0.4,
        rounds: 3,
        interestRate: 0.5,
        suddenDeathTurn: 50,
        teamMode: true,
      },
    }],
  ] as const) {
    assertReplayError('empty_transcript', () => replayVerifiedTranscript(config, []), name)
  }
})

Deno.test('verified replay limits can tighten but never disable or expand hard ceilings', () => {
  for (const [name, limits] of [
    ['single extra limit field', { maxTicks: VERIFIED_REPLAY_MAX_TICKS, auditMode: true }],
    ['extra field beside every limit', {
      maxActions: VERIFIED_REPLAY_MAX_ACTIONS,
      maxTurnActions: VERIFIED_REPLAY_MAX_TURN_ACTIONS,
      maxTicks: VERIFIED_REPLAY_MAX_TICKS,
      maxTicksPerTurn: VERIFIED_REPLAY_MAX_TICKS_PER_TURN,
      requestId: 'fixture-request',
    }],
  ] as const) {
    assertReplayError(
      'invalid_limits',
      () => replayVerifiedTranscript(CONFIG, TERMINAL_TRANSCRIPT, limits as never),
      name,
    )
  }
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

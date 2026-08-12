import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/types/GameState'
import type { HotSeatProgressionReceipt } from './client/hotSeatProgression'

const seams = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  verifiedControllers: [] as Array<Record<string, unknown>>,
  verifiedControllerSeeds: [] as number[],
  hotSeatConstructorArgs: [] as unknown[],
  onLobbyReady: null as null | ((config: Record<string, unknown>) => void),
  onQuit: null as null | (() => void),
  onVerifiedRetry: null as null | (() => void),
  onVerifiedContinueCasual: null as null | (() => void),
  onVerifiedReturnToBattery: null as null | (() => void),
  inputAction: null as null | ((action: Record<string, unknown>) => void),
  rendererEvents: null as null | { onExplosion?: (radius: number, impact: unknown) => void },
  rendererAnimating: false,
  terminalImpactNotifies: 0,
  recorded: [] as Array<{ matchId: string; won: boolean }>,
  recordedVerifiedFires: [] as Array<{ angle: number; power: number }>,
  completedVerified: 0,
  retriedVerified: 0,
  continuedVerified: 0,
  returnedVerified: 0,
  verifiedDeployment: { status: 'idle' } as Record<string, unknown>,
  progressionReceipts: [] as Array<Record<string, unknown>>,
  verifiedProgressionReceipts: [] as Array<Record<string, unknown>>,
  verifiedHudStates: [] as Array<Record<string, unknown> | null>,
  anonymousHandoffs: 0,
  accountSignInShows: 0,
  lobbyShows: 0,
  accountAnonymous: false,
  onProgressionSignIn: null as null | (() => void),
  record: (_result: { matchId: string; won: boolean }): Promise<HotSeatProgressionReceipt | null> => Promise.resolve({
    prior: { progressionVersion: 1 as const, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
    current: { progressionVersion: 1 as const, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
  }),
  completeVerified: (): Promise<Record<string, unknown> | null> => Promise.resolve(null),
}))

vi.mock('@shared/engine/GameEngine', () => ({ GameEngine: class {} }))
vi.mock('@shared/engine/AI', () => ({ computeAiPlan: () => null }))
vi.mock('@shared/net/verifiedDuel', () => ({
  VerifiedDuelController: class VerifiedDuelController {
    static create(seed: number) {
      seams.verifiedControllerSeeds.push(seed)
      const controller = seams.verifiedControllers.shift()
      if (!controller) throw new Error('Missing verified controller fixture')
      return controller
    }
  },
}))
vi.mock('./client/gameEngineOptions', () => ({ buildClientEngineOptions: (config: unknown) => config }))
vi.mock('./client/HotSeatClient', () => ({
  HotSeatClient: function HotSeatClient(controller: unknown) {
    seams.hotSeatConstructorArgs.push(controller)
    const client = seams.clients.shift()
    if (client) client.controller = controller
    return client
  },
}))
vi.mock('./client/NetworkClient', () => ({
  NetworkClient: function NetworkClient() {
    return seams.clients.shift()
  },
}))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
vi.mock('./renderer/selectClientBattlefield', () => ({ selectClientBattlefieldWorld: () => undefined }))
vi.mock('./renderer/aimGuidePresentation', () => ({
  resolveAimGuidePresentation: () => ({ visible: true, gravity: 0.15 }),
}))
vi.mock('./input/inputGate', () => ({
  resolveActivePlayerOwnership: () => true,
  shouldAcceptLocalInput: () => true,
}))
vi.mock('./ui/OrientationGate', () => ({ mountOrientationGate: () => undefined }))
vi.mock('./ui/theme', () => ({ crtCssVars: () => ({}) }))
vi.mock('./ui/firstSalvoController', () => ({
  FirstSalvoController: class {
    replay() {}
    skip() {}
    startNewGame() {}
    stepFor() { return null }
  },
  canCommitFirstSalvoAction: () => true,
  isFirstSalvoForced: () => false,
  observeAndForwardFirstSalvoAction: (
    _controller: unknown,
    action: Record<string, unknown>,
    _eligibility: unknown,
    accepted: boolean,
    forward: (action: Record<string, unknown>) => void,
  ) => { if (accepted) forward(action) },
}))
vi.mock('./renderer/Renderer', () => ({
  Renderer: class {
    isAnimating() { return seams.rendererAnimating }
    isTerminalImpactAnimating() { return seams.rendererAnimating }
    render() {}
    reset() {}
    setAimGuide() {}
    setEvents(events: { onExplosion?: (radius: number, impact: unknown) => void }) {
      seams.rendererEvents = events
    }
    toggleAimGuide() { return true }
  },
}))
vi.mock('./audio/AudioEngine', () => ({
  AudioEngine: class {
    aimTick() {}
    explosion() {}
    fizzle() {}
    hopTick() {}
    impact() {}
    launch() {}
    napalmStart() {}
    napalmStop() {}
    shieldUp() {}
    toggleMute() { return false }
    unlockOnGesture() {}
    wallContact() {}
    weaponCycle() {}
  },
}))
vi.mock('./input/InputHandler', () => ({
  InputHandler: class {
    constructor(_canvas: HTMLCanvasElement, onAction: (action: Record<string, unknown>) => void) {
      seams.inputAction = onAction
    }
    attach() {}
    detach() {}
    nextWeapon() {}
    setActiveTankScreenPos() {}
    setAim() {}
    setDirectAimEnabled() {}
    setWeapon() {}
    stepAngle() {}
    stepMove() {}
    stepPower() {}
    triggerFire() {}
  },
}))
vi.mock('./ui/HUD', () => ({
  HUD: class {
    flashMessage() {}
    hideEndScreens() {}
    isPaused() { return false }
    onBuy() {}
    onFirstSalvoReplay() {}
    onFirstSalvoSkip() {}
    onMove() {}
    onNextRound() {}
    onPauseChange() {}
    onProgressionSignIn(callback: () => void) { seams.onProgressionSignIn = callback }
    onPrimaryAction() {}
    onQuickChat() {}
    onQuit(callback: () => void) { seams.onQuit = callback }
    onRestart() {}
    onVerifiedRetry(callback: () => void) { seams.onVerifiedRetry = callback }
    onVerifiedContinueCasual(callback: () => void) { seams.onVerifiedContinueCasual = callback }
    onVerifiedReturnToBattery(callback: () => void) { seams.onVerifiedReturnToBattery = callback }
    onTouchAngle() {}
    onTouchPower() {}
    onTouchWeapon() {}
    onWeaponSelect() {}
    setProgressionReceipt(receipt: Record<string, unknown>) {
      seams.progressionReceipts.push(receipt)
    }
    setVerifiedProgressionReceipt(receipt: Record<string, unknown>) {
      seams.verifiedProgressionReceipts.push(receipt)
    }
    setVerifiedDeployment(state: Record<string, unknown> | null) {
      seams.verifiedHudStates.push(state)
    }
    notifyTerminalImpactComplete() { seams.terminalImpactNotifies += 1 }
    setAnonymousProgressionHandoff() { seams.anonymousHandoffs += 1 }
    setArmsLevel() {}
    setConnection() {}
    setFirstSalvoStep() {}
    setQuickChatEnabled() {}
    setTurnWatch() {}
    showQuickChat() {}
    update() {}
  },
}))
vi.mock('./ui/Lobby', () => ({
  Lobby: class {
    constructor(_root: HTMLElement, onReady: (config: Record<string, unknown>) => void) {
      seams.onLobbyReady = onReady
    }
    hide() {}
    show() { seams.lobbyShows += 1 }
    isAccountAnonymous() { return seams.accountAnonymous }
    get verifiedDeployment() { return seams.verifiedDeployment }
    refreshVerifiedDeploymentDeadline() { return seams.verifiedDeployment }
    recordVerifiedDeploymentFire(fire: { angle: number; power: number }) {
      seams.recordedVerifiedFires.push(fire)
      return true
    }
    completeVerifiedDeployment() {
      seams.completedVerified += 1
      return seams.completeVerified()
    }
    retryVerifiedDeploymentCompletion() {
      seams.retriedVerified += 1
      return Promise.resolve(null)
    }
    continueVerifiedDeploymentCasually() {
      seams.continuedVerified += 1
      seams.verifiedDeployment = { status: 'casual' }
      return true
    }
    returnVerifiedDeploymentToBattery() {
      seams.returnedVerified += 1
      seams.verifiedDeployment = { status: 'idle' }
      return true
    }
    showAccountSignIn() { seams.accountSignInShows += 1 }
    refreshAccount() { return Promise.resolve() }
    recordHotSeatMatch(result: { matchId: string; won: boolean }) {
      seams.recorded.push(result)
      return seams.record(result)
    }
  },
}))

function gameState(options: { firstAi?: boolean; winner?: string | null } = {}): GameState {
  return {
    phase: 'GAME_OVER',
    winner: options.winner ?? 'p1',
    activePlayerId: 'p1',
    turn: 4,
    projectiles: [],
    explosions: [],
    terrain: new Uint8Array(800 * 500),
    terrainVersion: 1,
    tanks: [
      {
        id: 'p1',
        ai: options.firstAi ? 'medium' : undefined,
        angle: 45,
        power: 50,
        selectedWeapon: 'baby_missile',
        x: 100,
        y: 300,
        alive: true,
      },
      {
        id: 'p2',
        angle: 135,
        power: 50,
        selectedWeapon: 'baby_missile',
        x: 700,
        y: 300,
        alive: false,
      },
    ],
  } as unknown as GameState
}

const verifiedDescriptor = {
  sessionId: '00000000-0000-4000-8000-000000000061',
  expiresAt: '2026-08-12T13:30:00.000Z',
  contractVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  limits: {
    humanSalvos: 6,
    cpuSalvos: 6,
    angle: { min: 0, max: 180 },
    power: { min: 0, max: 100 },
  },
  config: {
    seed: 17,
    options: {
      maxPlayers: 2,
      maxWind: 6,
      gravity: 0.15,
      walls: 'open',
      hazards: 'none',
      rounds: 1,
      interestRate: 0,
      suddenDeathTurn: 0,
      armsLevel: 0,
      starterWeaponFalloff: 'decisive',
      teamMode: false,
      players: [
        { name: 'Ranger', color: '#e8554d' },
        { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
      ],
    },
  },
} as const

const verifiedReceipt = {
  result: {
    sessionId: verifiedDescriptor.sessionId,
    won: true,
    outcome: 'win',
    verifiedXp: 200,
  },
  progression: {
    evidence: 'verified_replay_v1',
    prior: {
      evidence: 'verified_replay_v1', progressionVersion: 1,
      matchesPlayed: 0, wins: 0, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500,
    },
    current: {
      evidence: 'verified_replay_v1', progressionVersion: 1,
      matchesPlayed: 1, wins: 1, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500,
    },
  },
} as const

function verifiedConfig(transcript: ReadonlyArray<{ angle: number; power: number }> = []) {
  return {
    mode: 'hotseat',
    players: verifiedDescriptor.config.options.players,
    playerNames: ['Ranger', 'CPU 1'],
    settings: {
      seed: 17,
      maxWind: 6,
      gravity: 0.15,
      walls: 'open',
      hazards: 'none',
      rounds: 1,
      interestRate: 0,
      suddenDeathTurn: 0,
      armsLevel: 0,
      teamMode: false,
      rulesetVersion: 3,
    },
    verifiedDeployment: { descriptor: verifiedDescriptor, transcript },
  }
}

function liveVerifiedState(): GameState {
  const state = gameState()
  state.phase = 'PLAYER_TURN'
  state.winner = null
  state.tanks[1]!.alive = true
  state.tanks[1]!.ai = 'hard'
  return state
}

function fakeVerifiedController(state: GameState) {
  const commitments: Array<{ angle: number; power: number }> = []
  const applyCasualAction = vi.fn(() => true)
  const applyHumanAction = vi.fn((action: Record<string, unknown>): boolean => {
    const human = state.tanks[0]!
    if (action.type === 'set_angle' && Number.isInteger(action.angle)) {
      human.angle = action.angle as number
      return true
    }
    if (action.type === 'set_power' && Number.isInteger(action.power)) {
      human.power = action.power as number
      return true
    }
    if (action.type !== 'fire' || state.phase !== 'PLAYER_TURN') return false
    commitments.push({ angle: human.angle, power: human.power })
    state.phase = 'FIRING'
    return true
  })
  const controller = {
    engine: { getState: () => state, applyAction: applyCasualAction },
    complete: false,
    get transcript() { return commitments.map((entry) => ({ ...entry })) },
    applyHumanAction,
    tick: vi.fn(() => { state.phase = 'PLAYER_TURN' }),
    result: vi.fn(() => ({
      outcome: 'human_win', winnerId: 'p1', reason: 'terminal',
      humanSalvos: commitments.length, cpuSalvos: commitments.length,
    })),
  }
  return controller
}

function fakeClient(initial: GameState) {
  let listener: ((state: GameState) => void) | null = null
  return {
    controller: null as null | { applyHumanAction?: (action: Record<string, unknown>) => boolean },
    emit(state: GameState) { listener?.(state) },
    getState: () => initial,
    initialize: async () => undefined,
    onStateChange(next: (state: GameState) => void) {
      listener = next
      return () => { listener = null }
    },
    sendAction(action: Record<string, unknown>) {
      if (this.controller?.applyHumanAction) this.controller.applyHumanAction(action)
      else (this.controller as { applyAction?: (value: Record<string, unknown>) => boolean } | null)
        ?.applyAction?.(action)
    },
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function mountDom(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="stage"><canvas id="game"></canvas></div>
      <div id="hud"></div><div id="game-overlay"></div>
      <div id="modal-layer"></div><div id="lobby"></div>
    </div>`
}

describe('production hot-seat progression composition', () => {
  beforeEach(() => {
    vi.resetModules()
    seams.clients.length = 0
    seams.verifiedControllers.length = 0
    seams.verifiedControllerSeeds.length = 0
    seams.hotSeatConstructorArgs.length = 0
    seams.onLobbyReady = null
    seams.onQuit = null
    seams.onVerifiedRetry = null
    seams.onVerifiedContinueCasual = null
    seams.onVerifiedReturnToBattery = null
    seams.inputAction = null
    seams.rendererEvents = null
    seams.rendererAnimating = false
    seams.terminalImpactNotifies = 0
    seams.recorded.length = 0
    seams.recordedVerifiedFires.length = 0
    seams.completedVerified = 0
    seams.retriedVerified = 0
    seams.continuedVerified = 0
    seams.returnedVerified = 0
    seams.verifiedDeployment = { status: 'idle' }
    seams.progressionReceipts.length = 0
    seams.verifiedProgressionReceipts.length = 0
    seams.verifiedHudStates.length = 0
    seams.anonymousHandoffs = 0
    seams.accountSignInShows = 0
    seams.lobbyShows = 0
    seams.accountAnonymous = false
    seams.onProgressionSignIn = null
    seams.record = () => Promise.resolve({
      prior: { progressionVersion: 1 as const, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
      current: { progressionVersion: 1 as const, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
    })
    seams.completeVerified = () => Promise.resolve(verifiedReceipt)
    window.history.replaceState({}, '', '/')
    mountDom()
  })

  it('replays recovery through the shared controller, persists only accepted human fire, and submits one verified terminal result', async () => {
    const state = liveVerifiedState()
    const controller = fakeVerifiedController(state)
    const verifiedClient = fakeClient(state)
    seams.verifiedControllers.push(controller)
    seams.clients.push(verifiedClient)
    seams.verifiedDeployment = {
      status: 'active',
      descriptor: verifiedDescriptor,
      transcript: [{ angle: 31, power: 62 }],
      deadline: { remainingMs: 600_000, warning: 'none', acceptsInput: true, canComplete: true },
    }
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Expected verified lobby wiring')

    seams.onLobbyReady(verifiedConfig([{ angle: 31, power: 62 }]))
    await vi.waitFor(() => expect(verifiedClient.start).toHaveBeenCalledOnce())
    if (!seams.inputAction) throw new Error('Expected verified input wiring')
    expect(seams.verifiedControllerSeeds).toEqual([17])
    expect(seams.hotSeatConstructorArgs).toEqual([controller])
    expect(controller.applyHumanAction.mock.calls.slice(0, 3).map(([action]) => action)).toEqual([
      { type: 'set_angle', angle: 31 },
      { type: 'set_power', power: 62 },
      { type: 'fire' },
    ])
    expect(controller.tick).toHaveBeenCalled()

    state.tanks[0]!.angle = 47
    state.tanks[0]!.power = 73
    state.phase = 'PLAYER_TURN'
    seams.inputAction({ type: 'select_weapon', weapon: 'heavy_shield' })
    expect(seams.recordedVerifiedFires).toEqual([])
    expect(controller.engine.applyAction).not.toHaveBeenCalled()
    seams.inputAction({ type: 'fire' })
    expect(seams.recordedVerifiedFires).toEqual([{ angle: 47, power: 73 }])

    controller.complete = true
    state.phase = 'GAME_OVER'
    state.winner = 'p1'
    verifiedClient.emit(state)
    verifiedClient.emit(state)
    await vi.waitFor(() => expect(seams.completedVerified).toBe(1))
    await vi.waitFor(() => expect(seams.verifiedProgressionReceipts).toEqual([verifiedReceipt]))
    expect(seams.recorded).toEqual([])
    expect(seams.progressionReceipts).toEqual([])
  })

  it('maps retry and expiry freeze, then resumes input only after explicit casual conversion', async () => {
    const state = liveVerifiedState()
    const controller = fakeVerifiedController(state)
    const verifiedClient = fakeClient(state)
    const casualClient = fakeClient(state)
    seams.verifiedControllers.push(controller)
    seams.clients.push(verifiedClient, casualClient)
    seams.verifiedDeployment = {
      status: 'active', descriptor: verifiedDescriptor, transcript: [],
      deadline: { remainingMs: 120_000, warning: 'five-minutes', acceptsInput: true, canComplete: true },
    }
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Expected lobby wiring')
    seams.onLobbyReady(verifiedConfig())
    await vi.waitFor(() => expect(verifiedClient.start).toHaveBeenCalledOnce())
    if (!seams.inputAction || !seams.onVerifiedRetry || !seams.onVerifiedContinueCasual
      || !seams.onVerifiedReturnToBattery) throw new Error('Expected verified controls')

    seams.verifiedDeployment = {
      status: 'retryable', descriptor: verifiedDescriptor, transcript: [{ angle: 45, power: 50 }],
      deadline: { remainingMs: 60_000, warning: 'one-minute', acceptsInput: false, canComplete: true },
    }
    verifiedClient.emit(state)
    seams.onVerifiedRetry()
    expect(seams.retriedVerified).toBe(1)

    seams.verifiedDeployment = {
      status: 'expired', descriptor: verifiedDescriptor, transcript: [{ angle: 45, power: 50 }],
      deadline: { remainingMs: 0, warning: 'expired', acceptsInput: false, canComplete: false },
      choices: ['continue-casual', 'return-to-battery'],
    }
    verifiedClient.emit(state)
    const acceptedBeforeExpiryChoice = controller.applyHumanAction.mock.calls.length
    seams.inputAction({ type: 'fire' })
    expect(controller.applyHumanAction).toHaveBeenCalledTimes(acceptedBeforeExpiryChoice)

    seams.onVerifiedContinueCasual()
    expect(seams.continuedVerified).toBe(1)
    seams.inputAction({ type: 'fire' })
    expect(controller.applyHumanAction).toHaveBeenCalledTimes(acceptedBeforeExpiryChoice)
    expect(controller.engine.applyAction).toHaveBeenCalledWith({ type: 'fire' })
    expect(casualClient.start).toHaveBeenCalledOnce()
    seams.onVerifiedReturnToBattery()
    expect(seams.returnedVerified).toBe(0)
  })

  it('drops a verified completion receipt after account/game generation replacement', async () => {
    let resolveCompletion!: (receipt: Record<string, unknown>) => void
    seams.completeVerified = () => new Promise((resolve) => { resolveCompletion = resolve })
    const verifiedState = liveVerifiedState()
    const controller = fakeVerifiedController(verifiedState)
    const verifiedClient = fakeClient(verifiedState)
    seams.verifiedControllers.push(controller)
    seams.clients.push(verifiedClient)
    seams.verifiedDeployment = {
      status: 'active', descriptor: verifiedDescriptor, transcript: [{ angle: 45, power: 50 }],
      deadline: { remainingMs: 60_000, warning: 'one-minute', acceptsInput: true, canComplete: true },
    }
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Expected lobby wiring')
    seams.onLobbyReady(verifiedConfig([{ angle: 45, power: 50 }]))
    await vi.waitFor(() => expect(verifiedClient.start).toHaveBeenCalledOnce())
    controller.complete = true
    verifiedState.phase = 'GAME_OVER'
    verifiedClient.emit(verifiedState)
    await vi.waitFor(() => expect(seams.completedVerified).toBe(1))

    const replacement = fakeClient(gameState())
    seams.clients.push(replacement)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(replacement.start).toHaveBeenCalledOnce())
    resolveCompletion(verifiedReceipt)
    await Promise.resolve()
    expect(seams.verifiedProgressionReceipts).toEqual([])
  })

  it('signals terminal presentation only after the renderer reports the impact payoff complete', async () => {
    seams.rendererAnimating = true
    const terminal = fakeClient(gameState())
    seams.clients.push(terminal)
    await import('./main')
    if (!seams.onLobbyReady || !seams.rendererEvents) throw new Error('Expected renderer wiring')
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(terminal.start).toHaveBeenCalledOnce())

    seams.rendererEvents.onExplosion?.(40, null)
    terminal.emit(gameState())
    expect(seams.terminalImpactNotifies).toBe(0)
    seams.rendererAnimating = false
    terminal.emit(gameState())
    terminal.emit(gameState())
    expect(seams.terminalImpactNotifies).toBe(1)
  })

  it('reports human Player 1 once per match, uses fresh ids, and excludes AI and network games', async () => {
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Lobby start callback was not registered')

    const first = fakeClient(gameState())
    seams.clients.push(first)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(first.start).toHaveBeenCalledOnce())
    first.emit(gameState())
    first.emit(gameState())
    await vi.waitFor(() => expect(seams.progressionReceipts).toEqual([{
      won: true,
      receipt: {
        prior: { progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
        current: { progressionVersion: 1, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
      },
    }]))

    const second = fakeClient(gameState({ winner: 'p2' }))
    seams.clients.push(second)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce())
    second.emit(gameState({ winner: 'p2' }))
    await vi.waitFor(() => expect(seams.progressionReceipts[1]).toEqual({
      won: false,
      receipt: {
        prior: { progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
        current: { progressionVersion: 1, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
      },
    }))

    const ai = fakeClient(gameState({ firstAi: true }))
    seams.clients.push(ai)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(ai.start).toHaveBeenCalledOnce())
    ai.emit(gameState({ firstAi: true }))

    const network = fakeClient(gameState())
    seams.clients.push(network)
    seams.onLobbyReady({ mode: 'network', roomId: 'room-1', playerId: 'p1', players: [] })
    await vi.waitFor(() => expect(network.start).toHaveBeenCalledOnce())
    network.emit(gameState())

    expect(seams.recorded).toHaveLength(2)
    expect(seams.recorded.map(({ won }) => won)).toEqual([true, false])
    expect(seams.recorded[0]?.matchId).toMatch(/^[0-9a-f-]{36}$/)
    expect(seams.recorded[1]?.matchId).toMatch(/^[0-9a-f-]{36}$/)
    expect(seams.recorded[0]?.matchId).not.toBe(seams.recorded[1]?.matchId)
    expect(seams.anonymousHandoffs).toBe(0)
  })

  it('does not show an unrecorded handoff for a signed-in local-human result', async () => {
    seams.record = () => Promise.resolve(null)
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Lobby start callback was not registered')

    const client = fakeClient(gameState())
    seams.clients.push(client)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledOnce())
    client.emit(gameState())

    await vi.waitFor(() => expect(seams.recorded).toHaveLength(1))
    expect(seams.anonymousHandoffs).toBe(0)
  })

  it('does not surface a resolved receipt after its game has been replaced', async () => {
    type Summary = Awaited<ReturnType<typeof seams.record>>
    let resolveRecord!: (recorded: Summary) => void
    seams.record = () => new Promise<Summary>((resolve) => { resolveRecord = resolve })
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Lobby start callback was not registered')

    const first = fakeClient(gameState())
    seams.clients.push(first)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(first.start).toHaveBeenCalledOnce())
    first.emit(gameState())
    await vi.waitFor(() => expect(seams.recorded).toHaveLength(1))

    const second = fakeClient(gameState())
    seams.clients.push(second)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce())
    resolveRecord({
      prior: { progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
      current: { progressionVersion: 1, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
    })
    await Promise.resolve()

    expect(seams.progressionReceipts).toHaveLength(0)
  })

  it('does not surface a resolved receipt after returning to the lobby', async () => {
    type Summary = Awaited<ReturnType<typeof seams.record>>
    let resolveRecord!: (recorded: Summary) => void
    seams.record = () => new Promise<Summary>((resolve) => { resolveRecord = resolve })
    await import('./main')
    if (!seams.onLobbyReady || !seams.onQuit) throw new Error('Expected lobby wiring')

    const client = fakeClient(gameState())
    seams.clients.push(client)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledOnce())
    client.emit(gameState())
    await vi.waitFor(() => expect(seams.recorded).toHaveLength(1))

    seams.onQuit()
    resolveRecord({
      prior: { progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 },
      current: { progressionVersion: 1, totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500 },
    })
    await Promise.resolve()

    expect(seams.progressionReceipts).toHaveLength(0)
  })

  it('shows one anonymous local-human handoff without recording the completed match', async () => {
    seams.accountAnonymous = true
    seams.record = () => Promise.resolve(null)
    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Lobby start callback was not registered')

    const client = fakeClient(gameState())
    seams.clients.push(client)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledOnce())
    client.emit(gameState())
    client.emit(gameState())

    await vi.waitFor(() => expect(seams.anonymousHandoffs).toBe(1))
    expect(seams.progressionReceipts).toEqual([])
    expect(seams.recorded).toHaveLength(1)
  })

  it('does not surface an anonymous handoff after replacement or quit', async () => {
    type Summary = Awaited<ReturnType<typeof seams.record>>
    let resolveRecord!: (recorded: Summary) => void
    seams.accountAnonymous = true
    seams.record = () => new Promise<Summary>((resolve) => { resolveRecord = resolve })
    await import('./main')
    if (!seams.onLobbyReady || !seams.onQuit) throw new Error('Expected lobby wiring')

    const first = fakeClient(gameState())
    seams.clients.push(first)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(first.start).toHaveBeenCalledOnce())
    first.emit(gameState())

    const replacement = fakeClient(gameState())
    seams.clients.push(replacement)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(replacement.start).toHaveBeenCalledOnce())
    resolveRecord(null)
    await Promise.resolve()
    expect(seams.anonymousHandoffs).toBe(0)

    let resolveQuitRecord!: (recorded: Summary) => void
    seams.record = () => new Promise<Summary>((resolve) => { resolveQuitRecord = resolve })
    replacement.emit(gameState())
    await vi.waitFor(() => expect(seams.recorded).toHaveLength(2))
    seams.onQuit()
    resolveQuitRecord(null)
    await Promise.resolve()
    expect(seams.anonymousHandoffs).toBe(0)
  })

  it('tears down the completed game and opens the existing sign-in overlay on handoff activation', async () => {
    await import('./main')
    if (!seams.onLobbyReady || !seams.onProgressionSignIn) throw new Error('Expected sign-in wiring')

    const client = fakeClient(gameState())
    seams.clients.push(client)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledOnce())
    seams.onProgressionSignIn()

    expect(client.stop).toHaveBeenCalledOnce()
    expect(seams.accountSignInShows).toBe(1)
    expect(seams.lobbyShows).toBe(2)
  })

  it('ignores duplicate sign-in activations after the completed game is retired', async () => {
    await import('./main')
    if (!seams.onLobbyReady || !seams.onProgressionSignIn) throw new Error('Expected sign-in wiring')

    const client = fakeClient(gameState())
    seams.clients.push(client)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(client.start).toHaveBeenCalledOnce())
    seams.onProgressionSignIn()
    seams.onProgressionSignIn()

    expect(client.stop).toHaveBeenCalledOnce()
    expect(seams.accountSignInShows).toBe(1)
    expect(seams.lobbyShows).toBe(2)
  })

  it('allows one sign-in transition again after a fresh anonymous game completes', async () => {
    seams.accountAnonymous = true
    seams.record = () => Promise.resolve(null)
    await import('./main')
    if (!seams.onLobbyReady || !seams.onProgressionSignIn) throw new Error('Expected sign-in wiring')

    const first = fakeClient(gameState())
    seams.clients.push(first)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(first.start).toHaveBeenCalledOnce())
    first.emit(gameState())
    await vi.waitFor(() => expect(seams.anonymousHandoffs).toBe(1))
    seams.onProgressionSignIn()
    seams.onProgressionSignIn()
    expect(seams.accountSignInShows).toBe(1)

    const second = fakeClient(gameState())
    seams.clients.push(second)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce())
    second.emit(gameState())
    await vi.waitFor(() => expect(seams.anonymousHandoffs).toBe(2))
    seams.onProgressionSignIn()

    expect(seams.recorded).toHaveLength(2)
    expect(second.stop).toHaveBeenCalledOnce()
    expect(seams.accountSignInShows).toBe(2)
  })

  it('routes the anonymous victory fixture through the reporter and anonymous-account guard', async () => {
    window.history.replaceState({}, '', '/?e2e=victory-anonymous')
    seams.accountAnonymous = true
    seams.record = () => Promise.resolve(null)
    const fixture = fakeClient(gameState())
    seams.clients.push(fixture)

    await import('./main')
    await vi.waitFor(() => expect(fixture.start).toHaveBeenCalledOnce())
    fixture.emit(gameState())

    await vi.waitFor(() => expect(seams.recorded).toHaveLength(1))
    expect(seams.anonymousHandoffs).toBe(1)
  })

  it('keeps the deterministic browser fixture out of progression reporting', async () => {
    window.history.replaceState({}, '', '/?e2e=hotseat')
    const fixture = fakeClient(gameState())
    seams.clients.push(fixture)
    await import('./main')
    await vi.waitFor(() => expect(fixture.start).toHaveBeenCalledOnce())
    fixture.emit(gameState())
    expect(seams.recorded).toEqual([])
    expect(seams.anonymousHandoffs).toBe(0)
  })
})

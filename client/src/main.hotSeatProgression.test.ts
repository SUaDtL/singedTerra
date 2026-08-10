import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/types/GameState'
import type { HotSeatProgressionSummary } from './client/hotSeatProgression'

const seams = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  onLobbyReady: null as null | ((config: Record<string, unknown>) => void),
  onQuit: null as null | (() => void),
  recorded: [] as Array<{ matchId: string; won: boolean }>,
  progressionReceipts: [] as Array<Record<string, unknown>>,
  anonymousHandoffs: 0,
  accountSignInShows: 0,
  lobbyShows: 0,
  accountAnonymous: false,
  onProgressionSignIn: null as null | (() => void),
  record: (_result: { matchId: string; won: boolean }): Promise<HotSeatProgressionSummary | null> => Promise.resolve({
    progressionVersion: 1 as const,
    totalXp: 200,
    level: 1,
    levelXp: 200,
    nextLevelXp: 500,
  }),
}))

vi.mock('@shared/engine/GameEngine', () => ({ GameEngine: class {} }))
vi.mock('@shared/engine/AI', () => ({ computeAiPlan: () => null }))
vi.mock('./client/gameEngineOptions', () => ({ buildClientEngineOptions: (config: unknown) => config }))
vi.mock('./client/HotSeatClient', () => ({
  HotSeatClient: function HotSeatClient() {
    return seams.clients.shift()
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
  observeAndForwardFirstSalvoAction: () => undefined,
}))
vi.mock('./renderer/Renderer', () => ({
  Renderer: class {
    isAnimating() { return false }
    render() {}
    reset() {}
    setAimGuide() {}
    setEvents() {}
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
    onTouchAngle() {}
    onTouchPower() {}
    onTouchWeapon() {}
    onWeaponSelect() {}
    setProgressionReceipt(receipt: Record<string, unknown>) {
      seams.progressionReceipts.push(receipt)
    }
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

function fakeClient(initial: GameState) {
  let listener: ((state: GameState) => void) | null = null
  return {
    emit(state: GameState) { listener?.(state) },
    getState: () => initial,
    initialize: async () => undefined,
    onStateChange(next: (state: GameState) => void) {
      listener = next
      return () => { listener = null }
    },
    sendAction() {},
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
    seams.onLobbyReady = null
    seams.onQuit = null
    seams.recorded.length = 0
    seams.progressionReceipts.length = 0
    seams.anonymousHandoffs = 0
    seams.accountSignInShows = 0
    seams.lobbyShows = 0
    seams.accountAnonymous = false
    seams.onProgressionSignIn = null
    seams.record = () => Promise.resolve({
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    })
    window.history.replaceState({}, '', '/')
    mountDom()
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
      summary: {
        progressionVersion: 1,
        totalXp: 200,
        level: 1,
        levelXp: 200,
        nextLevelXp: 500,
      },
    }]))

    const second = fakeClient(gameState({ winner: 'p2' }))
    seams.clients.push(second)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce())
    second.emit(gameState({ winner: 'p2' }))
    await vi.waitFor(() => expect(seams.progressionReceipts[1]).toEqual({
      won: false,
      summary: {
        progressionVersion: 1,
        totalXp: 200,
        level: 1,
        levelXp: 200,
        nextLevelXp: 500,
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
      progressionVersion: 1,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
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
      progressionVersion: 1,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
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

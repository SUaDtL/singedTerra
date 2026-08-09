import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/types/GameState'

const seams = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  onLobbyReady: null as null | ((config: Record<string, unknown>) => void),
  recorded: [] as Array<{ matchId: string; won: boolean }>,
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
    onPrimaryAction() {}
    onQuickChat() {}
    onQuit() {}
    onRestart() {}
    onTouchAngle() {}
    onTouchPower() {}
    onTouchWeapon() {}
    onWeaponSelect() {}
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
    show() {}
    refreshAccount() { return Promise.resolve() }
    recordHotSeatMatch(result: { matchId: string; won: boolean }) {
      seams.recorded.push(result)
      return Promise.resolve(true)
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
    stop() {},
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
    seams.recorded.length = 0
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

    const second = fakeClient(gameState({ winner: 'p2' }))
    seams.clients.push(second)
    seams.onLobbyReady({ mode: 'hotseat', players: [] })
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce())
    second.emit(gameState({ winner: 'p2' }))

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
  })

  it('keeps the deterministic browser fixture out of progression reporting', async () => {
    window.history.replaceState({}, '', '/?e2e=hotseat')
    const fixture = fakeClient(gameState())
    seams.clients.push(fixture)
    await import('./main')
    await vi.waitFor(() => expect(fixture.start).toHaveBeenCalledOnce())
    fixture.emit(gameState())
    expect(seams.recorded).toEqual([])
  })
})

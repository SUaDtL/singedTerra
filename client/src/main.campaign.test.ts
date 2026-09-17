import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '@shared/campaign/combatProfiles'
import { parseCampaignRun } from '@shared/campaign/definitions'
import type { WeaponType } from '@shared/engine/WeaponSystem'
import type { GameState } from '@shared/types/GameState'
import type { PlayerAction } from '@shared/types/PlayerAction'
import { createCampaignCheckpoint } from './campaign/checkpoint'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './campaign/content/episode'
import { createCampaignReplayPayload, type CampaignReplayPayload } from './campaign/replay'
import { createCampaignRunState } from './campaign/runReducer'

const seams = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  setups: [] as Array<Record<string, unknown>>,
  onLobbyReady: null as null | ((config: Record<string, unknown>) => Promise<void>),
  onRestart: null as null | (() => void),
  onCampaignRetry: null as null | (() => void),
  onCampaignRouteChoice: null as null | ((routeId: string) => void),
  onCampaignCheckpointChoice: null as null | ((choice: Readonly<{ kind: 'retain' }>) => void),
  onCampaignContinue: null as null | (() => void),
  onQuit: null as null | (() => void),
  onWeaponSelect: null as null | ((weapon: WeaponType) => void),
  progressionReporters: 0,
  rewardWrites: 0,
  verifiedCompletions: 0,
  networkClients: 0,
  genericAiPlans: 0,
  rendererConstructions: 0,
  inputConstructions: 0,
  inputEmit: null as null | ((action: PlayerAction) => boolean | void),
  inputSetWeapons: [] as WeaponType[],
  campaignPresentations: [] as Array<Readonly<{ supplies: number; retryable: boolean }> | null>,
  campaignCues: [] as string[],
  campaignSaves: [] as CampaignReplayPayload[],
  campaignStorageRaw: null as unknown | null,
  campaignStorageTransactions: Promise.resolve() as Promise<void>,
  restoredCampaignClients: 0,
}))

vi.mock('./campaign/runReducer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./campaign/runReducer')>()
  return {
    ...actual,
    applyCampaignResult: (
      state: import('./campaign/runReducer').CampaignRunState,
      receipt: import('./campaign/runReducer').CampaignResultReceipt,
    ) => {
      const success = receipt.result.outcome === 'success'
      const suppliesAwarded = success ? 2 + receipt.intactSupplyDrumIds.length : 0
      return Object.freeze({
        ...state,
        supplies: state.supplies + suppliesAwarded,
        missionLoadout: state.loadout,
        pendingCheckpointDecision: success
          ? Object.freeze({ resultAttempt: state.attempt })
          : null,
        appliedResults: Object.freeze([
          ...state.appliedResults,
          Object.freeze({ ...receipt, suppliesAwarded }),
        ]),
      })
    },
  }
})

vi.mock('./campaign/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./campaign/storage')>()
  return {
    ...actual,
    createIndexedDbCampaignStorage: () => actual.createCampaignStorage({
      async read() {
        await seams.campaignStorageTransactions
        return seams.campaignStorageRaw
      },
      async transact<Result>(
        _slotId: string,
        operation: (current: unknown | null) => Readonly<{ next: unknown; result: Result }>,
      ): Promise<Result> {
        const transaction = seams.campaignStorageTransactions.then(() => {
          const transition = operation(seams.campaignStorageRaw)
          seams.campaignStorageRaw = transition.next
          seams.campaignSaves.push(
            (transition.next as { payload: CampaignReplayPayload }).payload,
          )
          return transition.result
        })
        seams.campaignStorageTransactions = transaction.then(
          () => undefined,
          () => undefined,
        )
        return transaction
      },
    }),
  }
})

vi.mock('./campaign/CampaignClient', () => ({
  CampaignClient: vi.fn(function CampaignClientRestoreFixture() {
    seams.restoredCampaignClients += 1
    const client = seams.clients.shift()
    if (!client) throw new Error('No restored campaign client fixture available')
    return client
  }),
}))

vi.mock('./client/createModeClient', () => ({
  createModeClient: vi.fn(async (setup: Record<string, unknown>) => {
    seams.setups.push(setup)
    const client = seams.clients.shift()
    if (!client) throw new Error('No campaign client fixture available')
    return client
  }),
}))

vi.mock('./client/hotSeatProgression', () => ({
  createHotSeatProgressionReporter: (options: {
    report(result: { matchId: string; won: boolean }): Promise<unknown>
  }) => {
    seams.progressionReporters += 1
    let reported = false
    return {
      observe(state: GameState) {
        if (reported || state.phase !== 'GAME_OVER') return
        reported = true
        void options.report({ matchId: 'campaign-must-not-claim', won: state.winner === 'p1' })
      },
    }
  },
}))

vi.mock('@shared/engine/AI', () => ({
  computeAiPlan: () => {
    seams.genericAiPlans += 1
    return null
  },
}))

vi.mock('./client/NetworkClient', () => ({
  NetworkClient: class {
    constructor() { seams.networkClients += 1 }
  },
}))

vi.mock('./lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => { throw new Error('campaign attempted a network subscription') }),
    from: vi.fn(() => { throw new Error('campaign attempted a backend write') }),
    rpc: vi.fn(() => { throw new Error('campaign attempted a backend RPC') }),
  },
}))

vi.mock('./renderer/selectClientBattlefield', () => ({ selectClientBattlefieldWorld: () => undefined }))
vi.mock('./renderer/aimGuidePresentation', () => ({
  resolveAimGuidePresentation: (_ownership: unknown, gravity: number) => ({ visible: true, gravity }),
}))
vi.mock('./renderer/TankLoadoutPreview', () => ({ releaseTankLoadoutPreviewResources: () => undefined }))
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
    action: unknown,
    _eligibility: unknown,
    accepted: boolean,
    forward: (action: unknown) => void,
  ) => { if (accepted) forward(action) },
}))

vi.mock('./audio/AudioEngine', () => ({
  AudioEngine: class {
    get isMuted() { return false }
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
    campaignCue(cue: string) { seams.campaignCues.push(cue) }
  },
}))

vi.mock('./renderer/Renderer', () => ({
  Renderer: class {
    readonly isAimGuideEnabled = true
    constructor() { seams.rendererConstructions += 1 }
    currentImpactLearningCue() { return null }
    isAnimating() { return false }
    isTerminalImpactAnimating() { return false }
    primeHistoricalImpactEvents() {}
    render() {}
    reset() {}
    setAimGuide() {}
    setEvents() {}
    toggleAimGuide() { return true }
  },
}))

vi.mock('./input/InputHandler', () => ({
  InputHandler: class {
    constructor(
      _target: HTMLElement,
      emit: (action: PlayerAction) => boolean | void,
    ) {
      seams.inputConstructions += 1
      seams.inputEmit = emit
    }
    attach() {}
    detach() {}
    nextWeapon() {}
    setActiveTankScreenPos() {}
    setAim() {}
    setDirectAimEnabled() {}
    setPowerCap() {}
    setWeapon(weapon: WeaponType) { seams.inputSetWeapons.push(weapon) }
    stepAngle() {}
    stepMove() {}
    stepPower() {}
    triggerFire() {}
  },
}))

vi.mock('./ui/HUD', () => ({
  HUD: class {
    destroy() { return Promise.resolve() }
    flashMessage() {}
    hideEndScreens() {}
    isFirstSalvoBriefingOpen() { return false }
    isGameplayInputBlocked() { return false }
    isPaused() { return false }
    leaveBattleConsole() { return Promise.resolve() }
    notifyTerminalImpactComplete() {}
    onAimGuide() {}
    onBuy() {}
    onFirstSalvoReplay() {}
    onFirstSalvoSkip() {}
    onCampaignRetry(callback: () => void) { seams.onCampaignRetry = callback }
    onCampaignRouteChoice(callback: (routeId: string) => void) {
      seams.onCampaignRouteChoice = callback
    }
    onCampaignCheckpointChoice(callback: (choice: Readonly<{ kind: 'retain' }>) => void) {
      seams.onCampaignCheckpointChoice = callback
    }
    onCampaignContinue(callback: () => void) { seams.onCampaignContinue = callback }
    onMove() {}
    onNextRound() {}
    onPauseChange() {}
    onPrimaryAction() {}
    onProgressionSignIn() {}
    onQuickChat() {}
    onQuit(callback: () => void) { seams.onQuit = callback }
    onRestart(callback: () => void) { seams.onRestart = callback }
    onToggleSound() {}
    onTouchAngle() {}
    onTouchPower() {}
    onTouchWeapon() {}
    onVerifiedChallengeRetry() {}
    onVerifiedChallengeReturn() {}
    onVerifiedContinueCasual() {}
    onVerifiedNextOrder() {}
    onVerifiedRetry() {}
    onVerifiedReturnToBattery() {}
    onWeaponSelect(callback: (weapon: WeaponType) => void) { seams.onWeaponSelect = callback }
    setAnonymousProgressionHandoff() {}
    setArmsLevel() {}
    setBattleSettingsState() {}
    setConnection() {}
    setCampaignRunPresentation(presentation: Readonly<{ supplies: number; retryable: boolean }> | null) {
      seams.campaignPresentations.push(presentation)
    }
    setFieldOrder() {}
    setFirstSalvoStep() {}
    setImpactLearningCue() {}
    setInputCapabilities() {}
    setLiveMatchDiagnostics() {}
    setPageRecovery() {}
    setPracticeFieldOrder() {}
    setProgressionReceipt() {}
    setPublicSeedChallenge() {}
    setQuickChatEnabled() {}
    setQuickOperation() {}
    setTerminalReplayMode() {}
    setTurnWatch() {}
    setVerifiedChallenge() {}
    setVerifiedDeployment() {}
    setVerifiedProgressionReceipt() {}
    showQuickChat() {}
    update() {}
  },
}))

vi.mock('./ui/Lobby', () => ({
  Lobby: class {
    constructor(_root: HTMLElement, onReady: (config: Record<string, unknown>) => Promise<void>) {
      seams.onLobbyReady = onReady
    }
    get verifiedChallenge() { return { status: 'idle' } }
    get verifiedDeployment() { return { status: 'idle' } }
    completeVerifiedChallenge() { seams.verifiedCompletions += 1; return Promise.resolve(null) }
    completeVerifiedDeployment() { seams.verifiedCompletions += 1; return Promise.resolve(null) }
    continueVerifiedDeploymentCasually() { return false }
    hide() {}
    isAccountAnonymous() { return false }
    isAccountAuthenticated() { return true }
    onAccountAuthenticationChange() {}
    recordHotSeatMatch() { seams.rewardWrites += 1; return Promise.resolve(null) }
    recordVerifiedChallengeFire() { seams.rewardWrites += 1; return false }
    recordVerifiedDeploymentFire() { seams.rewardWrites += 1; return false }
    refreshAccount() { return Promise.resolve() }
    refreshVerifiedDeploymentDeadline() { return { status: 'idle' } }
    revalidateAccountIdentity() { return Promise.resolve(true) }
    retryVerifiedChallengeCompletion() { seams.verifiedCompletions += 1; return Promise.resolve(null) }
    retryVerifiedDeploymentCompletion() { seams.verifiedCompletions += 1; return Promise.resolve(null) }
    returnVerifiedDeploymentToBattery() { return false }
    show() {}
    showAccountSignIn() {}
    showNetworkRecovery() {}
  },
}))

function campaignState(): GameState {
  return {
    phase: 'PLAYER_TURN',
    turn: 1,
    activePlayerId: 'p2',
    round: 1,
    totalRounds: 1,
    lastRoundWinnerId: null,
    wind: 0,
    walls: 'open',
    terrain: new Uint8Array(1200 * 600),
    terrainVersion: 0,
    tanks: [
      { id: 'p1', playerName: 'Ranger', ai: null, alive: true, health: 100, angle: 45,
        power: 50, powerCap: 100, selectedWeapon: 'baby_missile', x: 280, y: 305 },
      { id: 'p2', playerName: 'Defender', ai: 'hard', alive: true, health: 100, angle: 135,
        power: 50, powerCap: 100, selectedWeapon: 'baby_missile', x: 800, y: 285 },
    ],
    projectiles: [],
    projectile: null,
    lastExplosion: null,
    explosions: [],
    wallImpacts: [],
    fire: [],
    winner: null,
  } as unknown as GameState
}

function fakeCampaignClient(state: GameState) {
  let listener: ((next: GameState) => void) | null = null
  const unsubscribe = vi.fn(() => { listener = null })
  return {
    ownsCpuExecution: true as const,
    emit(next: GameState) { listener?.(next) },
    getEffectiveGravity: () => 0.15,
    getInitialTerrain: () => state.terrain.slice(),
    getState: () => state,
    onStateChange(next: (value: GameState) => void) { listener = next; return unsubscribe },
    recoverAfterPageRestore: vi.fn(async () => true),
    inputCapabilities: Object.freeze({
      angle: Object.freeze({ min: 0, max: 180 }),
      power: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
      primaryAction: 'selected_weapon' as const,
      weaponRoster: campaignDescriptor.combatProfile.choices,
      movement: true,
      weaponCycling: true,
      weaponSelection: true,
      buying: false,
    }),
    sendAction: vi.fn((action: PlayerAction) => {
      if (action.type !== 'select_weapon' || action.weapon === 'missile') return
      const active = state.tanks.find((tank) => tank.id === state.activePlayerId)
      if (active) active.selectedWeapon = action.weapon
    }),
    setFastForward: vi.fn(),
    createResultReceipt: vi.fn(),
    getCommittedReplayJournal: vi.fn(() => Object.freeze([])),
    createReplayPayload: vi.fn(async (runState: typeof campaignRunState) =>
      createCampaignReplayPayload({ runState, acceptedCommands: [] })),
    start: vi.fn(),
    stop: vi.fn(),
    suspendForPageCache: vi.fn(),
    unsubscribe,
  }
}

function mountDom(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="stage"><canvas id="game"></canvas><div id="game-overlay"></div><div id="battle-rail"></div></div>
      <div id="hud"></div><div id="modal-layer"></div><div id="lobby"></div>
    </div>`
}

const campaignDescriptor = Object.freeze({
  encounter: ASH_ROAD_EPISODE.encounters[0]!,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

const campaignRun = parseCampaignRun({
  kind: 'campaign-run',
  runVersion: 1,
  runId: 'ash-road-local-run',
  episodeId: ASH_ROAD_EPISODE.episodeId,
  episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
  episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
  combatProfileId: campaignDescriptor.combatProfile.profileId,
  combatProfileVersion: campaignDescriptor.combatProfile.profileVersion,
  combatProfileContentDigest: campaignDescriptor.combatProfile.contentDigest,
  routeId: ASH_ROAD_EPISODE.routes[0]!.id,
  encounterIds: ASH_ROAD_EPISODE.routes[0]!.encounterIds,
  currentEncounterIndex: 0,
})!
const campaignCheckpoint = createCampaignCheckpoint({
  run: campaignRun,
  encounter: campaignDescriptor.encounter,
  combatProfile: campaignDescriptor.combatProfile,
  attempt: 1,
  supplies: 2,
})
const campaignRunState = createCampaignRunState(campaignCheckpoint)

function campaignResultReceipt(outcome: 'success' | 'failure') {
  return Object.freeze({
    kind: 'campaign-result-receipt' as const,
    receiptVersion: 1 as const,
    result: Object.freeze({
      kind: 'campaign-result' as const,
      resultVersion: 1 as const,
      runId: campaignRun.runId,
      encounterId: campaignDescriptor.encounter.encounterId,
      encounterVersion: campaignDescriptor.encounter.encounterVersion,
      encounterContentDigest: campaignDescriptor.encounter.contentDigest,
      attempt: 1,
      outcome,
      commitments: 3,
    }),
    intactSupplyDrumIds: Object.freeze(outcome === 'success' ? ['drum-a', 'drum-b'] : []),
  })
}

const initialCampaignReplay = createCampaignReplayPayload({
  runState: campaignRunState,
  acceptedCommands: [],
})

const campaignConfig = Object.freeze({
  mode: 'hotseat',
  experience: 'campaign',
  campaign: campaignDescriptor,
  players: [
    { name: 'Ranger', color: '#e84d4d' },
    { name: 'Defender', color: '#4d8ce8', ai: 'hard' },
  ],
  playerNames: ['Ranger', 'Defender'],
})

describe('main campaign acquisition boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    seams.clients.length = 0
    seams.setups.length = 0
    seams.onLobbyReady = null
    seams.onRestart = null
    seams.onCampaignRetry = null
    seams.onCampaignRouteChoice = null
    seams.onCampaignCheckpointChoice = null
    seams.onCampaignContinue = null
    seams.onQuit = null
    seams.onWeaponSelect = null
    seams.progressionReporters = 0
    seams.rewardWrites = 0
    seams.verifiedCompletions = 0
    seams.networkClients = 0
    seams.genericAiPlans = 0
    seams.rendererConstructions = 0
    seams.inputConstructions = 0
    seams.inputEmit = null
    seams.inputSetWeapons.length = 0
    seams.campaignPresentations.length = 0
    seams.campaignCues.length = 0
    seams.campaignSaves.length = 0
    seams.campaignStorageRaw = null
    seams.campaignStorageTransactions = Promise.resolve()
    seams.restoredCampaignClients = 0
    window.history.replaceState({}, '', '/')
    mountDom()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps one campaign owner through restore/retry/quit and excludes every remote reward path', async () => {
    const firstState = campaignState()
    const retryState = campaignState()
    const first = fakeCampaignClient(firstState)
    const retry = fakeCampaignClient(retryState)
    const accidentalInvalid = fakeCampaignClient(campaignState())
    seams.clients.push(first, retry, accidentalInvalid)

    await import('./main')
    if (!seams.onLobbyReady || !seams.onRestart || !seams.onQuit) {
      throw new Error('Campaign lifecycle callbacks were not registered')
    }

    await seams.onLobbyReady(campaignConfig)
    first.emit(firstState)
    firstState.phase = 'GAME_OVER'
    firstState.activePlayerId = 'p1'
    firstState.winner = 'p1'
    first.emit(firstState)

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await vi.waitFor(() => expect(first.recoverAfterPageRestore).toHaveBeenCalledOnce())

    seams.onRestart()
    await vi.waitFor(() => expect(retry.start).toHaveBeenCalledOnce())
    seams.onQuit()
    await vi.waitFor(() => expect(retry.stop).toHaveBeenCalledOnce())

    let invalidError: unknown = null
    try {
      await seams.onLobbyReady({ ...campaignConfig, campaign: undefined })
    } catch (error) {
      invalidError = error
    }

    expect({
      validSetup: seams.setups[0],
      acquiredClients: seams.setups.length,
      invalidFailedClosed: invalidError instanceof Error && /campaign/i.test(invalidError.message),
      progressionReporters: seams.progressionReporters,
      rewardWrites: seams.rewardWrites,
      verifiedCompletions: seams.verifiedCompletions,
      networkClients: seams.networkClients,
      genericAiPlans: seams.genericAiPlans,
      first: {
        starts: first.start.mock.calls.length,
        stops: first.stop.mock.calls.length,
        subscriptionsRetired: first.unsubscribe.mock.calls.length,
        suspends: first.suspendForPageCache.mock.calls.length,
        restores: first.recoverAfterPageRestore.mock.calls.length,
      },
      retry: {
        starts: retry.start.mock.calls.length,
        stops: retry.stop.mock.calls.length,
        subscriptionsRetired: retry.unsubscribe.mock.calls.length,
      },
      rendererConstructions: seams.rendererConstructions,
      inputConstructions: seams.inputConstructions,
    }).toEqual({
      validSetup: campaignConfig,
      acquiredClients: 2,
      invalidFailedClosed: true,
      progressionReporters: 0,
      rewardWrites: 0,
      verifiedCompletions: 0,
      networkClients: 0,
      genericAiPlans: 0,
      first: { starts: 1, stops: 1, subscriptionsRetired: 1, suspends: 1, restores: 1 },
      retry: { starts: 1, stops: 1, subscriptionsRetired: 1 },
      rendererConstructions: 2,
      inputConstructions: 2,
    })
  })

  it('applies one terminal receipt and retries from the exact failed campaign attempt', async () => {
    const firstState = campaignState()
    const retryState = campaignState()
    const first = fakeCampaignClient(firstState)
    const retry = fakeCampaignClient(retryState)
    first.createResultReceipt.mockReturnValue(Object.freeze({
      kind: 'campaign-result-receipt',
      receiptVersion: 1,
      result: Object.freeze({
        kind: 'campaign-result',
        resultVersion: 1,
        runId: campaignRun.runId,
        encounterId: campaignDescriptor.encounter.encounterId,
        encounterVersion: campaignDescriptor.encounter.encounterVersion,
        encounterContentDigest: campaignDescriptor.encounter.contentDigest,
        attempt: 1,
        outcome: 'failure',
        commitments: 3,
      }),
      intactSupplyDrumIds: Object.freeze(['drum-a', 'drum-b']),
    }))
    seams.clients.push(first, retry)

    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Campaign lifecycle callback was not registered')
    await seams.onLobbyReady({ ...campaignConfig, campaignRunState })
    firstState.phase = 'GAME_OVER'
    firstState.campaign = {
      commitmentCount: 3,
      activeCommitment: null,
      objects: [],
      result: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
      effects: { technicalFailure: null },
      settledOutcome: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
    } as unknown as GameState['campaign']
    first.emit(firstState)
    first.emit(firstState)

    expect(first.createResultReceipt).toHaveBeenCalledOnce()
    expect(seams.campaignCues).toEqual(['mission-concluded'])
    expect(seams.campaignPresentations.at(-1)).toEqual({ supplies: 2, retryable: true })
    if (!seams.onCampaignRetry) throw new Error('Campaign retry callback was not registered')
    seams.onCampaignRetry()

    await vi.waitFor(() => expect(retry.start).toHaveBeenCalledOnce())
    expect(first.stop).toHaveBeenCalledOnce()
    expect((seams.setups[1]?.campaignRunState as { attempt?: number })?.attempt).toBe(2)
    expect((seams.setups[1]?.campaignRunState as { supplies?: number })?.supplies).toBe(2)
    expect((seams.setups[1]?.campaign as {
      humanLoadout?: { hull?: number; ammunition?: unknown[] }
    })?.humanLoadout).toMatchObject({ hull: 100 })
    expect((seams.setups[1]?.campaign as {
      humanLoadout?: { ammunition?: Array<{ weaponId?: string; quantity?: number | null }> }
    })?.humanLoadout?.ammunition).toContainEqual({ weaponId: 'missile', quantity: 3 })
  })

  it('drops a restored attempt replay before retrying its next canonical attempt', async () => {
    const firstState = campaignState()
    const retryState = campaignState()
    const first = fakeCampaignClient(firstState)
    const retry = fakeCampaignClient(retryState)
    first.createResultReceipt.mockReturnValue(campaignResultReceipt('failure'))
    let releaseOutgoingSave!: () => void
    let outgoingSaveStarted!: () => void
    const outgoingSaveGate = new Promise<void>((resolve) => { releaseOutgoingSave = resolve })
    const outgoingSavePending = new Promise<void>((resolve) => { outgoingSaveStarted = resolve })
    first.createReplayPayload.mockImplementationOnce(async (runState: typeof campaignRunState) => {
      outgoingSaveStarted()
      await outgoingSaveGate
      return createCampaignReplayPayload({ runState, acceptedCommands: [] })
    })
    seams.clients.push(first, retry)

    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Campaign lifecycle callback was not registered')
    await seams.onLobbyReady({
      ...campaignConfig,
      campaignRunState,
      campaignReplayPayload: initialCampaignReplay,
    })
    expect(seams.restoredCampaignClients).toBe(1)
    expect(seams.setups).toHaveLength(0)

    firstState.phase = 'GAME_OVER'
    firstState.campaign = {
      commitmentCount: 3,
      activeCommitment: null,
      objects: [],
      result: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
      effects: { technicalFailure: null },
      settledOutcome: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
    } as unknown as GameState['campaign']
    first.emit(firstState)
    await outgoingSavePending
    if (!seams.onCampaignRetry) throw new Error('Campaign retry callback was not registered')
    seams.onCampaignRetry()

    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(retry.start).not.toHaveBeenCalled()
    releaseOutgoingSave()

    await vi.waitFor(() => expect(retry.start).toHaveBeenCalledOnce())
    expect(seams.restoredCampaignClients).toBe(1)
    expect(seams.setups).toHaveLength(1)
    expect((seams.setups[0]?.campaignRunState as { attempt?: number })?.attempt).toBe(2)
    expect(seams.setups[0]).not.toHaveProperty('campaignReplayPayload')
    retry.emit(retryState)
    await vi.waitFor(() => expect(seams.campaignSaves.at(-1)?.runState.attempt).toBe(2))
    expect((seams.campaignStorageRaw as { revision?: number })?.revision).toBe(2)
  })

  it('does not reopen a drained retry after quit retires its originating generation', async () => {
    const firstState = campaignState()
    const retryState = campaignState()
    const first = fakeCampaignClient(firstState)
    const retry = fakeCampaignClient(retryState)
    first.createResultReceipt.mockReturnValue(campaignResultReceipt('failure'))
    let releaseOutgoingSave!: () => void
    let outgoingSaveStarted!: () => void
    const outgoingSaveGate = new Promise<void>((resolve) => { releaseOutgoingSave = resolve })
    const outgoingSavePending = new Promise<void>((resolve) => { outgoingSaveStarted = resolve })
    first.createReplayPayload.mockImplementationOnce(async (runState: typeof campaignRunState) => {
      outgoingSaveStarted()
      await outgoingSaveGate
      return createCampaignReplayPayload({ runState, acceptedCommands: [] })
    })
    seams.clients.push(first, retry)

    await import('./main')
    if (!seams.onLobbyReady || !seams.onCampaignRetry || !seams.onQuit) {
      throw new Error('Campaign lifecycle callbacks were not registered')
    }
    await seams.onLobbyReady({ ...campaignConfig, campaignRunState })
    firstState.phase = 'GAME_OVER'
    firstState.campaign = {
      commitmentCount: 3,
      activeCommitment: null,
      objects: [],
      result: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
      effects: { technicalFailure: null },
      settledOutcome: { outcome: 'failure', reason: 'limit', commitmentId: 3 },
    } as unknown as GameState['campaign']
    first.emit(firstState)
    await outgoingSavePending

    seams.onCampaignRetry()
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(retry.start).not.toHaveBeenCalled()
    seams.onQuit()
    await vi.waitFor(() => expect(first.stop).toHaveBeenCalledOnce())

    releaseOutgoingSave()
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(retry.start).not.toHaveBeenCalled()
    expect(seams.setups).toHaveLength(1)
    expect(seams.campaignSaves.at(-1)?.runState.attempt).toBe(1)
  })

  it('persists accepted route/checkpoint choices immediately and advances without stale replay', async () => {
    const firstState = campaignState()
    const nextState = campaignState()
    const first = fakeCampaignClient(firstState)
    const next = fakeCampaignClient(nextState)
    first.createResultReceipt.mockReturnValue(campaignResultReceipt('success'))
    seams.clients.push(first, next)

    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Campaign lifecycle callback was not registered')
    await seams.onLobbyReady({
      ...campaignConfig,
      campaignRunState,
      campaignReplayPayload: initialCampaignReplay,
    })

    firstState.phase = 'GAME_OVER'
    firstState.winner = 'p1'
    firstState.campaign = {
      commitmentCount: 3,
      activeCommitment: null,
      objects: [],
      result: { outcome: 'success', reason: 'objective', commitmentId: 3 },
      effects: { technicalFailure: null },
      settledOutcome: { outcome: 'success', reason: 'objective', commitmentId: 3 },
    } as unknown as GameState['campaign']
    first.emit(firstState)
    await vi.waitFor(() => expect(seams.campaignSaves).toHaveLength(1))
    seams.campaignSaves.length = 0

    if (!seams.onCampaignRouteChoice || !seams.onCampaignCheckpointChoice
      || !seams.onCampaignContinue) {
      throw new Error('Campaign checkpoint callbacks were not registered')
    }
    seams.onCampaignRouteChoice(ASH_ROAD_ROUTE_IDS.highRoad)
    await vi.waitFor(() => expect(seams.campaignSaves.at(-1)?.runState.selectedRouteId)
      .toBe(ASH_ROAD_ROUTE_IDS.highRoad))

    let releaseOutgoingSave!: () => void
    let outgoingSaveStarted!: () => void
    const outgoingSaveGate = new Promise<void>((resolve) => { releaseOutgoingSave = resolve })
    const outgoingSavePending = new Promise<void>((resolve) => { outgoingSaveStarted = resolve })
    first.createReplayPayload.mockImplementationOnce(async (runState: typeof campaignRunState) => {
      outgoingSaveStarted()
      await outgoingSaveGate
      return createCampaignReplayPayload({ runState, acceptedCommands: [] })
    })
    seams.onCampaignCheckpointChoice({ kind: 'retain' })
    await outgoingSavePending

    seams.onCampaignContinue()
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(next.start).not.toHaveBeenCalled()
    releaseOutgoingSave()
    await vi.waitFor(() => expect(next.start).toHaveBeenCalledOnce())
    expect(seams.restoredCampaignClients).toBe(1)
    expect(seams.setups).toHaveLength(1)
    expect((seams.setups[0]?.campaignRunState as {
      checkpoint?: { encounter?: { encounterId?: string } }
    })?.checkpoint?.encounter?.encounterId).toBe('high-road')
    expect(seams.setups[0]).not.toHaveProperty('campaignReplayPayload')
    next.emit(nextState)
    await vi.waitFor(() => expect(
      seams.campaignSaves.at(-1)?.runState.checkpoint.encounter.encounterId,
    ).toBe('high-road'))
    expect((seams.campaignStorageRaw as { revision?: number })?.revision).toBe(4)
  })

  it('synchronizes the local weapon cursor only after authoritative selection acceptance', async () => {
    const state = campaignState()
    state.activePlayerId = 'p1'
    state.tanks[0]!.selectedWeapon = 'shield'
    const client = fakeCampaignClient(state)
    seams.clients.push(client)

    await import('./main')
    if (!seams.onLobbyReady || !seams.onWeaponSelect) {
      throw new Error('Campaign weapon-selection callbacks were not registered')
    }
    await seams.onLobbyReady(campaignConfig)
    seams.inputSetWeapons.length = 0

    seams.onWeaponSelect('missile')
    expect(client.sendAction).toHaveBeenLastCalledWith({ type: 'select_weapon', weapon: 'missile' })
    expect(state.tanks[0]!.selectedWeapon).toBe('shield')
    expect(seams.inputSetWeapons).toEqual([])

    seams.onWeaponSelect('napalm')
    expect(client.sendAction).toHaveBeenLastCalledWith({ type: 'select_weapon', weapon: 'napalm' })
    expect(state.tanks[0]!.selectedWeapon).toBe('napalm')
    expect(seams.inputSetWeapons).toEqual(['napalm'])
  })

  it('reports authoritative selection rejection and acceptance through the InputHandler callback', async () => {
    const state = campaignState()
    state.activePlayerId = 'p1'
    state.tanks[0]!.selectedWeapon = 'shield'
    const client = fakeCampaignClient(state)
    seams.clients.push(client)

    await import('./main')
    if (!seams.onLobbyReady) throw new Error('Campaign lifecycle callback was not registered')
    await seams.onLobbyReady(campaignConfig)
    if (!seams.inputEmit) throw new Error('InputHandler emit callback was not captured')

    const rejected = seams.inputEmit({ type: 'select_weapon', weapon: 'missile' })
    expect(rejected).toBe(false)
    expect(client.sendAction).toHaveBeenLastCalledWith({ type: 'select_weapon', weapon: 'missile' })
    expect(state.tanks[0]!.selectedWeapon).toBe('shield')

    const accepted = seams.inputEmit({ type: 'select_weapon', weapon: 'napalm' })
    expect(accepted).toBe(true)
    expect(client.sendAction).toHaveBeenLastCalledWith({ type: 'select_weapon', weapon: 'napalm' })
    expect(state.tanks[0]!.selectedWeapon).toBe('napalm')
  })
})

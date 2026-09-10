import './style.css';
import { GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { GRAVITY } from '@shared/engine/Physics';
import { ARENA_FLOOR_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';
import { maximumTankRecoilDownPx } from './renderer/tankRecoil';
import type { GameState } from '@shared/types/GameState';
import { VerifiedDuelController, verifiedCpuPolicyForTuple } from '@shared/net/verifiedDuel';
import type { ConnectionState, GameClient } from './client/GameClient';
import { HotSeatClient } from './client/HotSeatClient';
import { createHotSeatProgressionReporter } from './client/hotSeatProgression';
import { buildClientEngineOptions } from './client/gameEngineOptions';
import { quickOperationById } from './client/quickOperations';
import { rematchToConfig } from './client/rematchConfig';
import { MatchSessionLifecycle } from './client/MatchSessionLifecycle';
import { writeSession } from './lib/sessionDescriptor';
import { GameSessionComposition } from './client/GameSessionComposition';
import { createModeClient, type ClientConstructionSetup } from './client/createModeClient';
import { InputHandler } from './input/InputHandler';
import {
  resolveActivePlayerOwnership,
  shouldAcceptLocalInput,
} from './input/inputGate';
import { Renderer } from './renderer/Renderer';
import { selectClientBattlefieldWorld } from './renderer/selectClientBattlefield';
import { resolveAimGuidePresentation } from './renderer/aimGuidePresentation';
import { releaseTankLoadoutPreviewResources } from './renderer/TankLoadoutPreview';
import { AudioEngine } from './audio/AudioEngine';
import { HUD } from './ui/HUD';
import { Lobby, type LobbyConfig } from './ui/Lobby';
import { mountOrientationGate } from './ui/OrientationGate';
import { crtCssVars } from './ui/theme';
import {
  FirstSalvoController,
  canCommitFirstSalvoAction,
  isFirstSalvoForced,
  observeAndForwardFirstSalvoAction,
} from './ui/firstSalvoController';
import type { FirstSalvoEligibility, FirstSalvoStorage } from './ui/firstSalvoCoach';
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel';
import { projectLiveMatchSnapshot } from './client/liveMatchDiagnostics';
import { observeFieldOrder, type FieldOrder } from './client/fieldOrder';

const E2E_PARAMS = new URLSearchParams(window.location.search);
const E2E_MODE = E2E_PARAMS.get('e2e');
const E2E_BATTLE_CONSOLE_REFERENCE = E2E_PARAMS.get('battle-console-reference') === '1';
const E2E_VICTORY_LONG_NAME = E2E_MODE === 'victory'
  && E2E_PARAMS.get('winner-name') === 'long';
const E2E_VICTORY_VERIFIED_FOUR = E2E_MODE === 'victory-verified-four';
const E2E_QUICK_OPERATION = E2E_MODE === 'victory' && E2E_PARAMS.has('quick-operation')
  ? quickOperationById(E2E_PARAMS.get('quick-operation'))
  : null;
const LIVE_MATCH_DIAGNOSTICS_ENABLED = E2E_PARAMS.get('diagnostics') === '1';
const e2eSeedParam = E2E_PARAMS.get('seed');
const e2eSeedCandidate = e2eSeedParam !== null && e2eSeedParam.trim() !== ''
  ? Number(e2eSeedParam)
  : Number.NaN;
const E2E_HOT_SEAT_SEED = (
  E2E_MODE === 'hotseat'
  && Number.isSafeInteger(e2eSeedCandidate)
)
  ? e2eSeedCandidate
  : 1337;
const ENABLE_DETERMINISTIC_HOT_SEAT_PROBE = E2E_MODE === 'hotseat'
  || E2E_MODE === 'verified-lifecycle';

interface TerminalPayoffE2EReceipt {
  readonly terminalExplosionCount?: number;
  readonly terminalExplosionObservedAt?: number;
  readonly impactCompletedAt?: number;
}

function publishTerminalPayoffE2EReceipt(
  patch: TerminalPayoffE2EReceipt,
): void {
  if (E2E_MODE !== 'victory-payoff') return;
  const target = window as typeof window & {
    __SINGED_TERRA_T8__?: Readonly<TerminalPayoffE2EReceipt>;
  };
  target.__SINGED_TERRA_T8__ = Object.freeze({
    ...target.__SINGED_TERRA_T8__,
    ...patch,
  });
}

interface E2EForwardedActionCounts {
  setAngle: number;
  setPower: number;
  fire: number;
}

let e2eForwardedActionCounts: E2EForwardedActionCounts = {
  setAngle: 0,
  setPower: 0,
  fire: 0,
};

interface SwitchableVerifiedClient extends GameClient {
  continueCasually(): void;
}

/**
 * Keep state/listeners stable while swapping the verified controller loop for an
 * ordinary engine loop after the player's explicit expiry choice.
 */
function createSwitchableVerifiedClient(
  controller: VerifiedDuelController,
): SwitchableVerifiedClient {
  let activeClient = new HotSeatClient(controller);
  let activeUnsubscribe: (() => void) | null = null;
  let started = false;
  const listeners = new Set<(state: GameState) => void>();
  const relay = (state: GameState): void => {
    for (const listener of listeners) listener(state);
  };
  const bind = (): void => { activeUnsubscribe = activeClient.onStateChange(relay); };
  bind();

  return {
    start: () => {
      if (started) return;
      started = true;
      activeClient.start();
    },
    stop: () => {
      started = false;
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      activeClient.stop();
    },
    setFastForward: (on) => activeClient.setFastForward(on),
    sendAction: (action) => activeClient.sendAction(action),
    getState: () => activeClient.getState(),
    getInitialTerrain: () => activeClient.getInitialTerrain(),
    getEffectiveGravity: () => activeClient.getEffectiveGravity(),
    onStateChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    continueCasually: () => {
      const wasStarted = started;
      activeClient.stop();
      activeUnsubscribe?.();
      activeClient = new HotSeatClient(controller.engine);
      bind();
      if (wasStarted) activeClient.start();
    },
  };
}

function fieldOrderObservationFor(controller: VerifiedDuelController) {
  const state = controller.engine.getState();
  const activeTank = state.tanks.find((tank) => tank.id === state.activePlayerId);
  if (!activeTank) return null;
  const outcome = controller.complete ? controller.result().outcome : null;
  return {
    humanSalvos: controller.transcript.length,
    settledHumanDamage: controller.settledHumanDamage,
    phase: state.phase,
    activeSeat: activeTank.ai ? 'cpu' as const : 'human' as const,
    winner: outcome === 'human_win' ? 'human' as const : outcome === 'cpu_win' ? 'cpu' as const : null,
  };
}

function restoreVerifiedController(
  seed: number,
  transcript: readonly VerifiedHumanFire[],
  initialFieldOrder: FieldOrder | null,
  versions: { readonly contractVersion: number; readonly engineVersion: number; readonly rulesetVersion: number },
): { controller: VerifiedDuelController; fieldOrder: FieldOrder | null } {
  const policy = verifiedCpuPolicyForTuple({
    contractVersion: versions.contractVersion,
    engineVersion: versions.engineVersion,
    rulesetVersion: versions.rulesetVersion,
  });
  const controller = VerifiedDuelController.createForPolicy(seed, policy);
  let fieldOrder = initialFieldOrder;
  for (const [index, shot] of transcript.entries()) {
    if (controller.complete
      || !controller.applyHumanAction({ type: 'set_angle', angle: shot.angle })
      || !controller.applyHumanAction({ type: 'set_power', power: shot.power })
      || !controller.applyHumanAction({ type: 'fire' })) {
      throw new Error('verified_recovery_refused');
    }
    while (!controller.complete && controller.engine.getState().phase !== 'PLAYER_TURN') {
      controller.tick();
    }
    if (controller.complete && index + 1 < transcript.length) {
      throw new Error('verified_recovery_trailing_action');
    }
    const observation = fieldOrderObservationFor(controller);
    if (fieldOrder && observation) fieldOrder = observeFieldOrder(fieldOrder, observation);
  }
  return { controller, fieldOrder };
}

/**
 * Entry point. Grabs the canvas + overlay containers, shows the Lobby, and on
 * "ready" instantiates the appropriate GameClient (hot-seat vs network), then
 * wires input -> client.sendAction and client state -> Renderer + HUD.
 *
 * The Renderer and HUD are persistent (created once); only the engine, client,
 * and input handler are rebuilt — on Restart we tear those down and rebuild
 * with the SAME players.
 */
function bootstrap(): void {
  mountOrientationGate();

  const canvasEl = document.getElementById('game');
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game canvas element');
  }
  // Bind the narrowed type to a const so it survives into nested closures.
  const canvas: HTMLCanvasElement = canvasEl;
  const hudRoot = requireElement('hud');
  const overlayRoot = requireElement('game-overlay');
  const battleRailRoot = requireElement('battle-rail');
  const modalRoot = requireElement('modal-layer');
  const lobbyRoot = requireElement('lobby');

  // Project the canonical CRT intensities (theme.ts) onto the DOM chrome's CSS
  // custom properties so the canvas tokens and the --crt-* vars share one source. (P3-16)
  const rootStyle = document.documentElement.style;
  const battleRailTop = Math.ceil(ARENA_FLOOR_Y + maximumTankRecoilDownPx());
  rootStyle.setProperty('--arena-height', `${CANVAS_HEIGHT}px`);
  rootStyle.setProperty('--arena-floor-y', `${ARENA_FLOOR_Y}px`);
  rootStyle.setProperty('--battle-rail-top-y', `${battleRailTop}px`);
  for (const [prop, value] of Object.entries(crtCssVars())) rootStyle.setProperty(prop, value);

  // Renderer-owned images and offscreen canvases belong to one game generation.
  // Keep no idle-lobby instance: dropping the generation after teardown lets the
  // browser collect those non-DOM presentation resources before the next match.
  const matchSession = new MatchSessionLifecycle<GameClient, InputHandler, Renderer>();
  const gameSession = new GameSessionComposition<
    GameClient, InputHandler, Renderer, GameState, ClientConstructionSetup
  >(matchSession);
  const hud = new HUD(hudRoot, overlayRoot, modalRoot, battleRailRoot);
  if (E2E_MODE === 'hotseat') {
    (
      window as typeof window & {
        __SINGED_TERRA_E2E_HUD__?: Readonly<{
          setTurnWatch: (state: 'waiting' | 'stalled', playerName: string) => void;
        }>;
      }
    ).__SINGED_TERRA_E2E_HUD__ = Object.freeze({
      setTurnWatch: (state, playerName) => hud.setTurnWatch({ state, playerName }),
    });
  }
  const firstSalvoStorage: FirstSalvoStorage = {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
  const firstSalvo = new FirstSalvoController({
    storage: firstSalvoStorage,
    force: isFirstSalvoForced(window.location.search),
  });

  // Synthesized SFX (Web Audio, no files). Pure presentation — wired to the
  // renderer's event sink so detonations/launches sound off the same authoritative
  // state the renderer draws, never touching the deterministic engine.
  const audio = new AudioEngine();
  audio.unlockOnGesture();
  const syncBattleSettings = (): void => {
    hud.setBattleSettingsState?.({
      aimGuideEnabled: matchSession.renderer?.isAimGuideEnabled ?? true,
      soundEnabled: !audio.isMuted,
    });
  };
  let terminalImpactObserved = false;
  let terminalImpactNotified = false;

  // Global safety net (observability-004): startGame() is fire-and-forget
  // (`void startGame`), so an unhandled rejection (failed network init, a thrown
  // initialize()) otherwise leaves a silently frozen blank screen — invisible on
  // mobile. Surface a reload prompt + log the reason.
  window.addEventListener('unhandledrejection', (e) => {
    console.error('unhandledrejection:', e.reason);
    hud.flashMessage('Unexpected error — please reload.');
  });
  window.addEventListener('error', (e) => {
    console.error('uncaught error:', e.error ?? e.message);
    hud.flashMessage('Unexpected error — please reload.');
  });

  // Render idle-skip (perf): the rAF render loop (onStateChange) fires ~60fps even
  // when a PLAYER_TURN scene is fully static (sky + sun-gradient + tanks redrawn for
  // nothing — the dominant idle cost on low-end/mobile). `renderDirty` forces a redraw
  // on the next frame after any input/aim/weapon change (or a fresh game / phase
  // change) so HUD/aim feedback stays instant; otherwise the loop skips the canvas
  // redraw whenever renderer.isAnimating() is false. Conservative: when in doubt we
  // redraw. Declared up here so the keydown handlers below can mark dirty too.
  let renderDirty = true;
  const markDirty = (): void => { renderDirty = true; };
  // Last phase seen by the render loop; a phase change always forces one redraw so the
  // settling frame of a transition (e.g. into a static PLAYER_TURN, ROUND_OVER, or
  // GAME_OVER) is painted even when isAnimating() has already gone false.
  let lastPhase: GameState['phase'] | null = null;

  // Detonation bloom: a brief warm light-bleed over the play field, paired with
  // the boom + screen-shake. Reduced-motion users get audio but no flash.
  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const boomFlash = document.createElement('div');
  boomFlash.className = 'boom-flash';
  document.getElementById('stage')?.appendChild(boomFlash);
  function flashBloom(radius: number): void {
    if (prefersReducedMotion || radius <= 0) return;
    const alpha = Math.min(0.5, (radius / 60) * 0.5);
    // Instant ON (no transition), then transition the fade OUT to 0 next frame.
    boomFlash.style.transition = 'none';
    boomFlash.style.opacity = String(alpha);
    void boomFlash.offsetWidth; // force reflow so the OFF below actually animates
    boomFlash.style.transition = 'opacity 240ms ease-out';
    boomFlash.style.opacity = '0';
  }

  const configureRendererEvents = (next: Renderer): void => {
    next.setEvents({
      onLaunch: () => audio.launch(),
      onExplosion: (radius, impact) => {
        terminalImpactObserved = true;
        const receipt = (window as typeof window & {
          __SINGED_TERRA_T8__?: Readonly<TerminalPayoffE2EReceipt>;
        }).__SINGED_TERRA_T8__;
        publishTerminalPayoffE2EReceipt({
          terminalExplosionCount: (receipt?.terminalExplosionCount ?? 0) + 1,
          terminalExplosionObservedAt: performance.now(),
        });
        audio.explosion(radius);
        if (impact) audio.impact(impact.impactType, impact.radius);
        flashBloom(radius);
      },
      onWallImpact: (side, walls) => audio.wallContact(walls, side),
      onHop: () => audio.hopTick(),
      onFireActive: (active) => {
        if (active) audio.napalmStart();
        else audio.napalmStop();
      },
      onMiss: () => audio.fizzle(),
    });
    syncBattleSettings();
  };
  const toggleAimGuide = (): void => {
    if (!matchSession.renderer) return;
    const on = matchSession.renderer.toggleAimGuide();
    syncBattleSettings();
    markDirty(); // reflect it on a static decision frame as well as in flight
    hud.flashMessage(on ? '🎯 Aim guide on' : '🎯 Aim guide off');
  };
  const toggleSound = (): void => {
    const muted = audio.toggleMute();
    syncBattleSettings();
    hud.flashMessage(muted ? '🔇 Sound off' : '🔊 Sound on');
  };
  // Production HUD owns every modal surface. Narrow composition tests may use
  // an older HUD-shaped seam, so retain their First Salvo fallback while the
  // live app consumes the complete modal-ownership contract.
  const gameplayInputBlocked = (): boolean =>
    hud.isGameplayInputBlocked?.() ?? hud.isFirstSalvoBriefingOpen();

  // Mute toggle (M). Document-level so it works on any screen; 'M' is unused by
  // InputHandler (which owns arrows/space/Q), so there's no key conflict.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) {
      toggleSound();
    } else if (e.code === 'KeyG' && !e.repeat) {
      toggleAimGuide();
    } else if (e.code === 'KeyF' && !gameplayInputBlocked()) {
      // Hold F to fast-forward the shot animation (review #7). Local view pacing only;
      // never a logged action. Repeats while held (idempotent); released on keyup.
      matchSession.client?.setFastForward?.(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyF') matchSession.client?.setFastForward?.(false);
  });

  // Per-game wiring that gets torn down and rebuilt on restart.
  let lastActiveId: string | null = null;
  let lastInputAimRound: number | null = null;
  // The players the current game was built from (for restart with same roster).
  let currentConfig: LobbyConfig | null = null;
  let progressionSignInHandled = false;
  let verifiedController: VerifiedDuelController | null = null;
  let verifiedClient: SwitchableVerifiedClient | null = null;
  let verifiedCasual = false;
  let verifiedCompletionStarted = false;
  let fieldOrder: FieldOrder | null = null;
  let liveMatchTransport: 'not-applicable' | ConnectionState = 'not-applicable';
  // One-shot, local-only fixture for the production-bundle victory-report guardrail.
  // A Play again action consumes the fixture and restarts into an ordinary match.
  let e2eVictoryPending = E2E_MODE === 'victory'
    || E2E_MODE === 'victory-anonymous'
    || E2E_MODE === 'victory-payoff'
    || E2E_VICTORY_VERIFIED_FOUR;
  // Deterministic presentation fixture for the real between-round HUD lifecycle.
  // It mutates the local hot-seat engine's opening snapshot once, mirroring the
  // existing victory fixture while leaving every production entry path unchanged.
  let e2eRoundShopPending = E2E_MODE === 'round-shop';

  function firstSalvoEligibility(): FirstSalvoEligibility | null {
    const state = matchSession.client?.getState();
    const activeTank = state?.tanks.find((tank) => tank.id === state.activePlayerId);
    if (!state || !activeTank) return null;
    return {
      phase: state.phase,
      activeIsAi: !!activeTank.ai,
      activeIsLocal,
      activeTankAlive: activeTank.alive,
    };
  }

  function syncFirstSalvo(): void {
    const eligibility = firstSalvoEligibility();
    hud.setFirstSalvoStep(eligibility ? firstSalvo.stepFor(eligibility) : null);
  }

  function directAimAllowed(): boolean {
    const state = matchSession.client?.getState();
    const activeTank = state?.tanks.find((tank) => tank.id === state.activePlayerId);
    return !!state
      && state.phase === 'PLAYER_TURN'
      && shouldAcceptLocalInput({
        activeIsAi: !!activeTank?.ai,
        activeIsLocal,
        paused: hud.isPaused(),
      })
      && !gameplayInputBlocked()
      && verifiedInputAllowed();
  }

  function activeInputPowerCap(powerCap: number | undefined): number {
    const liveCap = powerCap !== undefined && Number.isFinite(powerCap)
      ? Math.max(0, powerCap)
      : DEFAULT_POWER_CAP;
    const verifiedMaximum = currentConfig?.verifiedDeployment && !verifiedCasual
      ? currentConfig.verifiedDeployment.descriptor.limits.power.max
      : null;
    return verifiedMaximum === null ? liveCap : Math.min(liveCap, verifiedMaximum);
  }

  function syncActiveInputPowerCap(): void {
    const state = matchSession.client?.getState();
    const tank = state?.tanks.find((candidate) => candidate.id === state.activePlayerId);
    matchSession.input?.setPowerCap(activeInputPowerCap(tank?.powerCap));
  }

  function currentLiveMatchSnapshot() {
    const activeClient = matchSession.client;
    const state = activeClient?.getState();
    const config = currentConfig;
    const activeTank = state?.tanks.find((tank) => tank.id === state.activePlayerId);
    if (!activeClient || !state || !config || !activeTank) return undefined;
    const activeSeatOrdinal = state.tanks.findIndex((tank) => tank.id === state.activePlayerId) + 1;
    const execution = config.verifiedDeployment && !verifiedCasual ? 'verified' : 'casual';
    const input = execution === 'verified' && lobby.verifiedDeployment.status !== 'active'
      ? 'frozen'
      : shouldAcceptLocalInput({
        activeIsAi: !!activeTank.ai,
        activeIsLocal: resolveActivePlayerOwnership(config.mode, activeClient, state.activePlayerId),
        paused: hud.isPaused(),
      })
        ? 'ready'
        : 'locked';
    return projectLiveMatchSnapshot({
      mode: config.mode,
      execution,
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      turn: state.turn,
      activeSeatOrdinal,
      activeSeatAlive: activeTank.alive,
      activeSeatHealth: activeTank.health,
      input,
      transport: config.mode === 'network' ? liveMatchTransport : 'not-applicable',
    });
  }

  function verifiedInputAllowed(): boolean {
    if (!verifiedController || verifiedCasual) return true;
    const deployment = lobby.refreshVerifiedDeploymentDeadline();
    return deployment.status === 'active' && deployment.deadline.acceptsInput;
  }

  function syncVerifiedHud(): void {
    const context = currentConfig?.verifiedDeployment;
    if (!context || !verifiedController || verifiedCasual) {
      hud.setVerifiedDeployment(null);
      hud.setFieldOrder(null);
      return;
    }
    const deployment = lobby.refreshVerifiedDeploymentDeadline();
    if (deployment.status === 'idle' || deployment.status === 'casual') {
      hud.setVerifiedDeployment(null);
      fieldOrder = null;
      hud.setFieldOrder(null);
      return;
    }
    if (deployment.status === 'failed') {
      hud.setVerifiedDeployment({ status: 'failed' });
      fieldOrder = null;
      hud.setFieldOrder(null);
      return;
    }
    if (deployment.status === 'frozen') {
      hud.setVerifiedDeployment({ status: 'policy-refused' });
      fieldOrder = null;
      hud.setFieldOrder(null);
      return;
    }
    if (deployment.status === 'verified') {
      hud.setVerifiedDeployment(null);
      hud.setFieldOrder(fieldOrder);
      return;
    }
    if (deployment.status === 'expired') {
      const state = verifiedController.engine.getState();
      const humanSalvos = verifiedController.transcript.length;
      const activeTank = state.tanks.find((tank) => tank.id === state.activePlayerId);
      const cpuSalvos = Math.max(
        0,
        humanSalvos - ((state.phase === 'FIRING' || state.phase === 'RESOLVING') && !activeTank?.ai ? 1 : 0),
      );
      hud.setVerifiedDeployment({
        status: 'expired',
        humanSalvos,
        cpuSalvos,
        humanLimit: context.descriptor.limits.humanSalvos,
        cpuLimit: context.descriptor.limits.cpuSalvos,
        deadline: deployment.deadline,
      });
      fieldOrder = null;
      hud.setFieldOrder(null);
      return;
    }
    const state = verifiedController.engine.getState();
    const humanSalvos = verifiedController.transcript.length;
    const activeTank = state.tanks.find((tank) => tank.id === state.activePlayerId);
    const result = verifiedController.complete ? verifiedController.result() : null;
    const cpuSalvos = result?.cpuSalvos ?? Math.max(
      0,
      humanSalvos - (
        (state.phase === 'FIRING' || state.phase === 'RESOLVING') && !activeTank?.ai ? 1 : 0
      ),
    );
    const details = {
      humanSalvos,
      cpuSalvos,
      humanLimit: context.descriptor.limits.humanSalvos,
      cpuLimit: context.descriptor.limits.cpuSalvos,
      deadline: deployment.deadline,
    };
    const status = deployment.status === 'completion-pending'
      ? 'completion-pending'
      : deployment.status === 'retryable'
        ? 'retryable'
        : verifiedController.complete && state.phase !== 'GAME_OVER'
          ? 'cap-adjudicating'
          : 'active';
    hud.setVerifiedDeployment({ status, ...details });
    const observation = fieldOrderObservationFor(verifiedController);
    if (!fieldOrder || !observation) {
      hud.setFieldOrder(null);
      return;
    }
    fieldOrder = observeFieldOrder(fieldOrder, observation);
    hud.setFieldOrder(fieldOrder);
  }

  // --- Computer-opponent (AI) driver state ---
  // Whether the active tank is CPU-controlled (gates out human input for that turn).
  let activeIsAi = false;
  // Whether this browser owns the active seat. Hot-seat humans always do;
  // networked opponents and CPU seats do not.
  let activeIsLocal = false;
  // Guards against re-driving the same bot turn: onStateChange fires every frame,
  // so we act ONCE per (turn, tank) and skip until the turn changes.
  let aiActedKey: string | null = null;
  // Pending bot "think" timers, cleared on teardown so a torn-down game never fires.

  /** ms the bot waits before swinging its barrel, then before firing — so the
   *  human sees it aim and shoot rather than an instant teleport-kill. */
  const AI_AIM_DELAY = 600;
  const AI_FIRE_DELAY = 550;

  function clearAiTimers(): void {
    matchSession.clearTimers();
  }

  /** Tear down the current game's client/input/subscription (idempotent). */
  async function resetMatchPresentation(): Promise<void> {
    audio.napalmStop();
    lastActiveId = null;
    lastInputAimRound = null;
    renderDirty = true;
    lastPhase = null;
    activeIsAi = false;
    activeIsLocal = false;
    liveMatchTransport = 'not-applicable';
    aiActedKey = null;
    verifiedController = null;
    verifiedClient = null;
    verifiedCasual = false;
    verifiedCompletionStarted = false;
    fieldOrder = null;
    terminalImpactObserved = false;
    terminalImpactNotified = false;
    hud.setTurnWatch({ state: 'clear' });
    hud.hideEndScreens();
    hud.setVerifiedDeployment(null);
    hud.setFieldOrder(null);
    hud.setFirstSalvoStep(null);
    await hud.leaveBattleConsole?.();
  }

  async function teardown(): Promise<number> {
    const generation = await gameSession.retire(resetMatchPresentation);
    releaseTankLoadoutPreviewResources();
    return generation;
  }

  /** Build a fresh engine/client/input from the given config and start it. */
  async function startGame(config: LobbyConfig): Promise<void> {
    let hotSeatProgression: ReturnType<typeof createHotSeatProgressionReporter> | null = null;
    await gameSession.start({
      retirePresentation: resetMatchPresentation,
      afterRetire: releaseTankLoadoutPreviewResources,
      prepareAcquisition: () => {
        progressionSignInHandled = false;
        lobby.hide();
        currentConfig = config;
        return clientModeSetupFor(config);
      },
      acquireClient: async (setup) => {
        if (!config.verifiedDeployment) {
          return { status: 'acquired', client: await createModeClient(setup), verifiedComplete: false };
        }
        try {
          const restored = restoreVerifiedController(
            config.verifiedDeployment.descriptor.config.seed,
            config.verifiedDeployment.transcript,
            config.verifiedDeployment.fieldOrder,
            config.verifiedDeployment.descriptor,
          );
          verifiedController = restored.controller;
          fieldOrder = restored.fieldOrder;
          verifiedClient = createSwitchableVerifiedClient(verifiedController);
          return { status: 'acquired', client: verifiedClient, verifiedComplete: verifiedController.complete };
        } catch {
          hud.setVerifiedDeployment({ status: 'failed' });
          lobby.show();
          return { status: 'unavailable' };
        }
      },
      constructRenderer: () => new Renderer(canvas),
      configureRendererEvents,
      primeTerminalHistory: (renderer, state) => renderer.primeHistoricalImpactEvents(state),
      configureInitialPresentation: ({
        generation: currentGameGeneration,
        client: newClient,
        renderer: gameRenderer,
        initial,
      }) => {
        const selectedBattlefield = selectClientBattlefieldWorld(
          newClient,
          gameRenderer,
          currentConfig?.settings?.battlefieldWorld,
        );
        if (selectedBattlefield) {
          document.documentElement.style.setProperty(
            '--st-current-battlefield',
            `url(${import.meta.env.BASE_URL}${selectedBattlefield.asset})`,
          );
          document.documentElement.style.setProperty(
            '--st-theater-backdrop',
            `url(${import.meta.env.BASE_URL}art/battlefield-theater-${selectedBattlefield.id}-v3.webp)`,
          );
        }
        firstSalvo.startNewGame();
        e2eForwardedActionCounts = { setAngle: 0, setPower: 0, fire: 0 };

        // Tell the store which weapons/accessories are buyable in this room (UI gate only; the engine
        // enforces it independently). Default 4 => everything buyable, matching the engine default.
        hud.setArmsLevel(config.settings?.armsLevel ?? 4);
        // Older focused test doubles intentionally model only the HUD methods relevant
        // to their lifecycle assertion; the real HUD always owns this presentation seam.
        (hud as HUD & { setQuickOperation?: (operation: LobbyConfig['quickOperation'] | null) => void })
          .setQuickOperation?.(config.quickOperation ?? null);

        // Seed the input handler's locally-tracked aim from the active tank so the
        // arrow keys step from that tank's real angle/power (set_angle/set_power
        // carry ABSOLUTE values). getState() may be null before the first snapshot.
        if (e2eRoundShopPending && initial) {
          e2eRoundShopPending = false;
          const winner = initial.tanks[0]!;
          const runnerUp = initial.tanks[1]!;
          winner.playerName = 'Player 1';
          winner.roundWins = 1;
          winner.kills = 1;
          winner.totalDamage = 86;
          winner.credits = 8_000;
          runnerUp.playerName = 'LongRangeCommander20';
          runnerUp.kills = 0;
          runnerUp.totalDamage = 54;
          runnerUp.credits = 6_250;
          initial.phase = 'ROUND_OVER';
          initial.round = 2;
          initial.totalRounds = 3;
          initial.lastRoundWinnerId = winner.id;
        }
        if (e2eVictoryPending && initial) {
          e2eVictoryPending = false;
          initial.phase = 'GAME_OVER';
          initial.winner = initial.tanks[0]!.id;
          if (E2E_VICTORY_LONG_NAME) {
            initial.tanks[0]!.playerName = 'LongRangeCommander20';
          }
          initial.tanks[0]!.alive = true;
          initial.tanks[0]!.health = 72;
          initial.tanks[0]!.kills = 2;
          initial.tanks[0]!.totalDamage = 134;
          initial.tanks[0]!.loadout = {
            treads: 'ranger',
            hull: 'bulwark',
            turret: 'jackal',
            barrel: 'foundry',
          };
          initial.tanks[1]!.alive = false;
          initial.tanks[1]!.health = 0;
          initial.tanks[1]!.kills = 0;
          initial.tanks[1]!.totalDamage = 52;
          if (E2E_VICTORY_VERIFIED_FOUR) {
            initial.totalRounds = 3;
            const fixtureRows = [
              { name: 'Ranger Actualname', wins: 3, kills: 9, damage: 2460 },
              { name: 'CPU 1 Ridgebreaker', wins: 2, kills: 7, damage: 2110 },
              { name: 'CPU 2 Longshot', wins: 1, kills: 5, damage: 1720 },
              { name: 'CPU 3 Undertow', wins: 0, kills: 3, damage: 1080 },
            ];
            for (const [index, tank] of initial.tanks.entries()) {
              const row = fixtureRows[index];
              if (!row) continue;
              tank.playerName = row.name;
              tank.roundWins = row.wins;
              tank.kills = row.kills;
              tank.totalDamage = row.damage;
            }
            hud.setVerifiedProgressionReceipt({
              result: { sessionId: '123e4567-e89b-42d3-a456-426614174000', won: true, outcome: 'win', verifiedXp: 200 },
              progression: {
                evidence: 'verified_replay_v2',
                prior: { evidence: 'verified_replay_v2', matchesPlayed: 10, wins: 8, totalXp: 1950, progressionVersion: 1, level: 4, levelXp: 450, nextLevelXp: 500 },
                current: { evidence: 'verified_replay_v2', matchesPlayed: 11, wins: 9, totalXp: 2150, progressionVersion: 1, level: 5, levelXp: 150, nextLevelXp: 500 },
              },
            });
          }
          if (E2E_MODE === 'victory-payoff') {
            const defeated = initial.tanks[1]!;
            const terminalExplosion = {
              id: 1,
              weaponType: 'baby_missile' as const,
              cx: defeated.x,
              cy: defeated.y,
              radius: 34,
              impactType: 'tank' as const,
              style: 'blast' as const,
              color: '#ffb347',
              durationFrames: 85,
            };
            initial.lastExplosion = terminalExplosion;
            initial.explosions = [terminalExplosion];
          }
        }
        const accountTank = initial?.tanks[0];
        hotSeatProgression = config.verifiedDeployment ? null : createHotSeatProgressionReporter({
          mode: config.mode,
          // The anonymous fixture deliberately traverses the real null-result path.
          // Ordinary deterministic fixtures remain excluded from progression reporting.
          e2eMode: E2E_MODE === 'victory-anonymous' ? null : E2E_MODE,
          accountTankId: accountTank && !accountTank.ai ? accountTank.id : null,
          report: (result) => lobby.recordHotSeatMatch(result),
          onRecorded: (result, receipt) => {
            if (
              !matchSession.isCurrent(currentGameGeneration, newClient)
              || newClient.getState()?.phase !== 'GAME_OVER'
            ) return;
            hud.setProgressionReceipt({ won: result.won, receipt });
          },
          onUnrecorded: () => {
            if (
              !matchSession.isCurrent(currentGameGeneration, newClient)
              || newClient.getState()?.phase !== 'GAME_OVER'
              || !lobby.isAccountAnonymous()
            ) return;
            hud.setAnonymousProgressionHandoff();
          },
        });
        lastActiveId = initial?.activePlayerId ?? null;
        lastInputAimRound = initial?.round ?? null;
      },
      constructInput: ({ client: newClient, initial }) => {
        const activeTank = initial?.tanks.find((tank) => tank.id === initial.activePlayerId);
        // Human input is dropped while a CPU tank holds the turn (its keys would
        // drive the bot) OR while the in-game Pause overlay is open — a reflex
        // arrow/space must not change aim or fire a shot while paused (#52). The
        // rAF loop keeps running underneath either way (networked lockstep stays
        // in sync); only this LOCAL emit is suppressed.
        return new InputHandler(canvas, (action) => {
          if (gameplayInputBlocked()
            || !shouldAcceptLocalInput({ activeIsAi, activeIsLocal, paused: hud.isPaused() })
            || !verifiedInputAllowed()) return;
          // Any input mutates aim/weapon/turn state, so force a redraw next frame so the
          // aim guide / HUD update instantly even when the idle-skip gate would skip.
          markDirty();
          // UI feedback ticks (presentation only). The launch boom comes from the
          // renderer's FIRING transition, so 'fire' needs nothing here.
          if (action.type === 'set_angle' || action.type === 'set_power') audio.aimTick();
          else if (action.type === 'select_weapon') audio.weaponCycle();
          else if (action.type === 'use_shield') audio.shieldUp();
          observeAndForwardFirstSalvoAction(
            firstSalvo,
            action,
            firstSalvoEligibility(),
            (() => {
              const state = newClient.getState();
              const tank = state?.tanks.find((candidate) => candidate.id === state.activePlayerId);
              return tank ? canCommitFirstSalvoAction(tank, action) : false;
            })(),
            (forwardedAction) => {
              if (ENABLE_DETERMINISTIC_HOT_SEAT_PROBE) {
                if (forwardedAction.type === 'set_angle') e2eForwardedActionCounts.setAngle += 1;
                else if (forwardedAction.type === 'set_power') e2eForwardedActionCounts.setPower += 1;
                else if (forwardedAction.type === 'fire') e2eForwardedActionCounts.fire += 1;
              }
              const transcriptLength = verifiedController?.transcript.length ?? 0;
              newClient.sendAction(forwardedAction);
              if (
                !verifiedCasual
                && verifiedController
                && forwardedAction.type === 'fire'
                && verifiedController.transcript.length === transcriptLength + 1
              ) {
                const accepted = verifiedController.transcript[transcriptLength];
                if (accepted) lobby.recordVerifiedDeploymentFire(accepted);
                syncVerifiedHud();
              }
            },
          );
          syncFirstSalvo();
        }, {
          initialAngle: activeTank?.angle,
          initialPower: activeTank?.power,
          powerCap: activeInputPowerCap(activeTank?.powerCap),
          canDirectAim: directAimAllowed,
          canHandleCommand: () => !gameplayInputBlocked(),
        });
      },
      attachInput: (input) => input.attach(),
      configureClient: ({
        client: newClient,
        input: newInput,
        initial,
        generation: currentGameGeneration,
      }) => {
        const activeTank = initial?.tanks.find((tank) => tank.id === initial.activePlayerId);
        // Seed the weapon cursor from the opening active tank too (mirrors aim).
        if (activeTank) newInput.setWeapon(activeTank.selectedWeapon);

        // Network rematch: when a successor room is allocated (by either player),
        // migrate into it with the SAME roster + THIS client's preserved playerId.
        // Both clients receive this independently, so the rematch is symmetric.
        newClient.onRematch?.((info) => {
          if (!matchSession.isCurrent(currentGameGeneration, newClient)) return;
          const myId = config.playerId;
          if (!myId) return;
          const successor = rematchToConfig(info, myId);
          if (!matchSession.isCurrent(currentGameGeneration, newClient)) return;
          // NetworkClient clears the completed room's descriptor before it notifies
          // this callback. Keep the admitted successor available for a reload even
          // if its initialization later fails and the Lobby must offer retry.
          writeSession({
            roomId: successor.roomId,
            roomCode: successor.roomCode,
            playerId: successor.playerId,
          });
          void startGame(successor);
        });

        // Networked liveness (P1-6): surface Realtime connection state as a banner and
        // failed/timed-out shots as a toast, so a dropped socket or lost submit never
        // leaves the player on a silently frozen board. Reset first so a stale banner
        // from a prior network game can't linger into a hot-seat game (whose client has
        // no onConnectionChange); the network client immediately re-primes its state.
        liveMatchTransport = config.mode === 'network' ? 'connecting' : 'not-applicable';
        hud.setConnection('connected');
        newClient.onConnectionChange?.((connState) => {
          liveMatchTransport = connState;
          hud.setConnection(connState);
        });
        newClient.onFireFailed?.((message) => hud.flashMessage(message));
        newClient.onTurnWatch?.((watch) => hud.setTurnWatch(watch));
        newClient.onAccountProgressChanged?.(() => { void lobby.refreshAccount(); });
        const quickChatAvailable = typeof newClient.sendQuickChat === 'function'
          && typeof newClient.onQuickChat === 'function';
        hud.setQuickChatEnabled(quickChatAvailable);
        if (quickChatAvailable) {
          hud.onQuickChat((key) => { newClient.sendQuickChat?.(key); });
          newClient.onQuickChat?.((message) => hud.showQuickChat(message));
        }
      },
      createStateListener: ({
        generation: currentGameGeneration,
        client: newClient,
        renderer: gameRenderer,
        input: newInput,
        terminalHistoryPrimed,
      }) => {
        const submitVerifiedCompletion = (): void => {
          if (!verifiedController?.complete || verifiedCasual || verifiedCompletionStarted) return;
          const deployment = lobby.refreshVerifiedDeploymentDeadline();
          if ((deployment.status !== 'active' && deployment.status !== 'retryable')
            || !deployment.deadline.canComplete) return;
          verifiedCompletionStarted = true;
          const request = lobby.completeVerifiedDeployment();
          syncVerifiedHud();
          void request.then((receipt) => {
            if (
              !receipt
              || !matchSession.isCurrent(currentGameGeneration, newClient)
              || verifiedCasual
            ) {
              if (matchSession.isCurrent(currentGameGeneration, newClient)) syncVerifiedHud();
              return;
            }
            hud.setVerifiedProgressionReceipt(receipt);
            hud.setVerifiedDeployment(null);
            void lobby.refreshAccount();
          }).catch(() => {
            if (matchSession.isCurrent(currentGameGeneration, newClient)) syncVerifiedHud();
          });
        };

        return (state: GameState) => {
          hotSeatProgression?.observe(state);
          if (verifiedController?.complete && !verifiedCasual && state.phase !== 'GAME_OVER') {
            const result = verifiedController.result();
            state.phase = 'GAME_OVER';
            state.winner = result.winnerId;
          }
          syncVerifiedHud();
          submitVerifiedCompletion();
          if (ENABLE_DETERMINISTIC_HOT_SEAT_PROBE) exposeDeterministicHotSeatProbe(state);
          // Aim guide is shown only when the LOCAL human controls the active tank: a
          // human turn in hot-seat, or (networked) the active tank is THIS client's id.
          // Never for a CPU seat or a remote opponent's turn.
          const activeTank = state.tanks.find((t) => t.id === state.activePlayerId);
          newInput.setPowerCap(activeInputPowerCap(activeTank?.powerCap));
          const aimGuide = resolveAimGuidePresentation({
            mode: config.mode,
            activePlayerOwned: resolveActivePlayerOwnership(
              config.mode,
              newClient,
              state.activePlayerId,
            ),
            activeIsAi: !!activeTank?.ai,
          }, newClient.getEffectiveGravity());
          activeIsLocal = aimGuide.visible;
          newInput.setDirectAimEnabled(directAimAllowed());
          gameRenderer.setAimGuide(aimGuide.visible, aimGuide.gravity);
          syncFirstSalvo();
          // Feed the active tank's barrel-origin (logical px) so mouse drag-aim can
          // derive angle/power from the drag vector (pivot = body top, y − 16).
          if (activeTank) {
            newInput.setActiveTankScreenPos(
              activeTank.x,
              activeTank.y - 20,
              state.activePlayerId,
            );
          }

          // A phase change always warrants one redraw (e.g. the settling frame into a
          // static PLAYER_TURN / ROUND_OVER / GAME_OVER, which isAnimating() may already
          // report as idle).
          if (state.phase !== lastPhase) {
            lastPhase = state.phase;
            markDirty();
          }

          // Idle-skip: only repaint the canvas when something can visibly change this
          // frame (anything animating) OR an input/aim/weapon change marked us dirty. A
          // static PLAYER_TURN scene is otherwise redrawn at 60fps for nothing. The HUD
          // (cheap DOM diff) still updates every frame so turn/score/wind stay live.
          if (renderDirty || gameRenderer.isAnimating(state)) {
            gameRenderer.render(state);
            renderDirty = false;
          }
          const verifiedControlsAllowed = verifiedInputAllowed();
          hud.setImpactLearningCue(gameRenderer.currentImpactLearningCue());
          hud.update(
            state,
            newClient.isFiring ?? false,
            shouldAcceptLocalInput({
              activeIsAi: !!activeTank?.ai,
              activeIsLocal,
              paused: hud.isPaused(),
            }) && verifiedControlsAllowed,
            activeIsLocal,
            verifiedControlsAllowed,
          );
          const terminalEffectsSettled = terminalImpactObserved
            || terminalHistoryPrimed
            || (state.projectiles.length === 0 && state.explosions.length === 0);
          if (
            state.phase === 'GAME_OVER'
            && terminalEffectsSettled
            && !gameRenderer.isTerminalImpactAnimating(state)
            && !terminalImpactNotified
          ) {
            terminalImpactNotified = true;
            publishTerminalPayoffE2EReceipt({ impactCompletedAt: performance.now() });
            hud.notifyTerminalImpactComplete();
          }
          // Re-seed when either the active seat or round changes. A new round can
          // retain the prior opener while the engine resets that tank's aim, so
          // player ID alone is not enough to identify the mirrored input state.
          const inputAimRound = state.round ?? null;
          if (state.activePlayerId !== lastActiveId || inputAimRound !== lastInputAimRound) {
            lastActiveId = state.activePlayerId;
            lastInputAimRound = inputAimRound;
            // Seat or round baseline changed: refresh presentation even if the
            // new scene is otherwise static.
            markDirty();
            const next = state.tanks.find((t) => t.id === state.activePlayerId);
            if (next) {
              newInput.setAim(next.angle, next.power);
              newInput.setWeapon(next.selectedWeapon);
            }
          }

          // Computer-opponent driver: if a CPU tank holds the turn, plan + play it.
          maybeDriveAi(state);
        };
      },
      subscribe: (client, listener) => client.onStateChange(listener),
      start: (client) => client.start(),
    });
  }

  /**
   * Drive the active tank when it is CPU-controlled: gate out human input, and —
   * once per turn — plan a shot and play it as ordinary actions on a short timer
   * so the human watches the bot aim and fire. Hot-seat / single-player only
   * (networked rooms have no AI seats). The (turn, tank) key makes it fire exactly
   * once even though onStateChange runs every frame.
   */
  function maybeDriveAi(state: GameState): void {
    const active = state.tanks.find((t) => t.id === state.activePlayerId);
    const isAi = !!active?.ai && currentConfig?.mode !== 'network';
    activeIsAi = isAi && state.phase === 'PLAYER_TURN';
    if (!isAi || state.phase !== 'PLAYER_TURN' || !active) return;

    const key = `${state.turn}:${active.id}`;
    if (key === aiActedKey) return; // already acting on this turn
    aiActedKey = key;

    // Plan with the engine's EFFECTIVE gravity (sudden death ramps it past the threshold)
    // so the bot aims for the arc the engine will actually fly; falls back to the configured
    // base gravity if the client can't report it.
    const gravity = matchSession.client?.getEffectiveGravity() ?? currentConfig?.settings?.gravity ?? GRAVITY;
    const plan = computeAiPlan(
      state,
      active.id,
      active.ai!,
      gravity,
      currentConfig?.settings?.armsLevel ?? 0,
    );
    if (!plan) return; // no target (game effectively over) — nothing to do

    clearAiTimers();
    // Swing the barrel to the planned aim first (visible), then fire after a beat.
    // A buy-to-restock plan (P1-7b) commits the turn-neutral purchase first — the
    // HotSeatClient applies it synchronously, so the select_weapon + fire below use
    // the just-restocked ammo. (aiActedKey already gates this to once per turn.)
    matchSession.schedule(() => {
      if (plan.buy) matchSession.client?.sendAction({ type: 'buy', weapon: plan.buy });
      if (plan.buyAccessory) matchSession.client?.sendAction({ type: 'buy', accessory: plan.buyAccessory });
      matchSession.client?.sendAction({ type: 'select_weapon', weapon: plan.weapon });
      matchSession.client?.sendAction({ type: 'set_angle', angle: plan.angle });
      matchSession.client?.sendAction({ type: 'set_power', power: plan.power });
      // The bot's barrel swing happens during the static PLAYER_TURN phase, so force
      // a redraw to show it (no human input marked us dirty for the CPU's turn).
      markDirty();
    }, AI_AIM_DELAY);
    matchSession.schedule(() => {
      matchSession.client?.sendAction(plan.weapon === 'shield' ? { type: 'use_shield' } : { type: 'fire' });
    }, AI_AIM_DELAY + AI_FIRE_DELAY);
  }

  // Register restart ONCE on the persistent HUD. Hot-seat rebuilds a fresh local
  // engine with the same roster. Network can't restart in place — the room's
  // action log replays the finished game — so it asks the server for a fresh
  // successor room; both clients then migrate via onRematch (above).
  hud.onRestart(() => {
    if (!currentConfig) return;
    if (currentConfig.mode === 'network') {
      void matchSession.client?.requestRematch?.();
    } else {
      void startGame(currentConfig);
    }
  });

  const localTurnAllowsActions = (): boolean => shouldAcceptLocalInput({
    activeIsAi,
    activeIsLocal,
    paused: hud.isPaused(),
  }) && verifiedInputAllowed();
  const localInputAllowed = (): boolean =>
    localTurnAllowsActions() && !gameplayInputBlocked();

  hud.onFirstSalvoSkip(() => {
    firstSalvo.skip();
    syncFirstSalvo();
  });
  hud.onFirstSalvoReplay(() => {
    firstSalvo.replay();
    syncFirstSalvo();
  });

  // Register the weapon-strip select callback ONCE on the persistent HUD. A
  // strip click both emits select_weapon AND re-seeds the InputHandler cursor so
  // Q cycling stays in sync with the mouse pick. client/input are the
  // mutable per-game closure vars (null between teardown and startGame).
  hud.onWeaponSelect((weapon) => {
    // This callback is the Armory owner's explicit trusted Equip action. It is
    // allowed while that dialog owns focus, unlike background keyboard/touch
    // gameplay input, but still obeys turn ownership and verified-play gates.
    if (!localTurnAllowsActions()) return;
    markDirty(); // weapon pick can change aim-guide/HUD context — repaint next frame
    matchSession.client?.sendAction({ type: 'select_weapon', weapon });
    matchSession.input?.setWeapon(weapon);
  });

  // Register the store Buy callback ONCE on the persistent HUD. A buy is a
  // turn-neutral action: hot-seat applies it locally; network commits it to the
  // log (and the engine re-gates affordability + whose turn it is).
  hud.onBuy((purchase, tankId) => {
    markDirty(); // a buy changes ammo/credits surfaced in the scene — repaint next frame
    // `purchase` carries exactly one of weapon/accessory; forward it verbatim (the engine + referee
    // re-validate the "exactly one" invariant, affordability, the arms gate, and whose turn it is).
    matchSession.client?.sendAction({ type: 'buy', ...purchase, ...(tankId ? { tankId } : {}) });
    // Auto-select a bought WEAPON so the active weapon becomes the one just bought
    // (review #9). select_weapon is local-only (never logged) — pure client convenience.
    // Accessory buys (battery, …) must NOT hijack the weapon slot, hence the narrow.
    if ('weapon' in purchase && purchase.weapon) {
      matchSession.client?.sendAction({ type: 'select_weapon', weapon: purchase.weapon });
    }
    // Hot-seat applies purchases synchronously, so the newly raised Battery cap
    // is usable before the next render frame. Networked clients refresh again
    // when the committed action snapshot arrives.
    syncActiveInputPowerCap();
  });

  // Start the next round from the ROUND_OVER between-rounds shop. Like a turn
  // action: hot-seat applies it locally; networked commits it to the log so every
  // client leaves the shop in lockstep.
  hud.onNextRound(() => {
    matchSession.client?.sendAction({ type: 'next_round' });
    syncActiveInputPowerCap();
  });

  const lobby = new Lobby(lobbyRoot, (config: LobbyConfig) => {
    // startGame() now hides the lobby itself (see its body), so the start callback no
    // longer needs to — keeping lobby-visibility owned by a single place (#13).
    return startGame(config);
  });
  const syncAccountOwnedPresentation = (identityChanged: boolean): void => {
    if (identityChanged) {
      fieldOrder = null;
      hud.setFieldOrder(null);
    }
    if (LIVE_MATCH_DIAGNOSTICS_ENABLED) {
      hud.setLiveMatchDiagnostics(
        lobby.isAccountAuthenticated() ? currentLiveMatchSnapshot : null,
      );
    }
  };
  lobby.onAccountAuthenticationChange(syncAccountOwnedPresentation);
  syncAccountOwnedPresentation(false);

  hud.onVerifiedRetry(() => {
    if (!verifiedController || verifiedCasual || !currentConfig?.verifiedDeployment) return;
    const deployment = lobby.refreshVerifiedDeploymentDeadline();
    if (deployment.status !== 'retryable' || !deployment.deadline.canComplete) return;
    const retryGeneration = matchSession.currentGeneration;
    const retryClient = matchSession.client;
    const request = lobby.retryVerifiedDeploymentCompletion();
    syncVerifiedHud();
    void request.then((receipt) => {
      if (!receipt || !matchSession.isCurrent(retryGeneration, retryClient)) {
        if (matchSession.isCurrent(retryGeneration, retryClient)) syncVerifiedHud();
        return;
      }
      hud.setVerifiedProgressionReceipt(receipt);
      hud.setVerifiedDeployment(null);
      void lobby.refreshAccount();
    }).catch(() => {
      if (matchSession.isCurrent(retryGeneration, retryClient)) syncVerifiedHud();
    });
  });

  hud.onVerifiedContinueCasual(() => {
    const deployment = lobby.refreshVerifiedDeploymentDeadline();
    if (deployment.status !== 'expired' || !verifiedClient) return;
    if (!lobby.continueVerifiedDeploymentCasually()) return;
    verifiedCasual = true;
    fieldOrder = null;
    verifiedClient.continueCasually();
    hud.setVerifiedDeployment(null);
    hud.setFieldOrder(null);
    matchSession.input?.setDirectAimEnabled(directAimAllowed());
  });

  hud.onVerifiedReturnToBattery(() => {
    const deployment = lobby.refreshVerifiedDeploymentDeadline();
    if (deployment.status !== 'expired') return;
    if (!lobby.returnVerifiedDeploymentToBattery()) return;
    void teardown().then(() => lobby.show());
  });

  hud.onVerifiedNextOrder(() => {
    const descriptor = currentConfig?.verifiedDeployment?.descriptor;
    const deployment = lobby.verifiedDeployment;
    if (
      !descriptor
      || !verifiedController
      || verifiedCasual
      || deployment.status !== 'verified'
      || deployment.receipt.result.sessionId !== descriptor.sessionId
      || !lobby.returnVerifiedDeploymentToBattery()
    ) return;
    void teardown().then(() => lobby.show({ focusVerifiedDeployment: true }));
  });

  // Quit the current game back to the lobby (in-game Menu / game-over Main Menu).
  // Tears down the engine/client/input and re-shows the full-field lobby overlay
  // (which covers the now-frozen canvas). For networked games this stops the
  // client; the room is reaped server-side by the heartbeat/lazy-GC.
  hud.onQuit(() => {
    void teardown().then(() => lobby.show());
  });

  hud.onProgressionSignIn(() => {
    if (progressionSignInHandled) return;
    progressionSignInHandled = true;
    void teardown().then(() => {
      lobby.show();
      lobby.showAccountSignIn();
    });
  });

  hud.onPauseChange((paused) => {
    if (paused) matchSession.input?.setDirectAimEnabled(false);
    else matchSession.input?.setDirectAimEnabled(directAimAllowed());
  });

  // Touch-aim strip callbacks (M2 mobile). Registered once on the persistent HUD;
  // `input` is the mutable per-game closure var so these always drive the live handler.
  // Same gate as the keyboard path (startGame): dropped on a CPU turn or while paused (#52).
  hud.onTouchAngle((delta) => { if (localInputAllowed()) matchSession.input?.stepAngle(delta); });
  hud.onTouchPower((delta) => { if (localInputAllowed()) matchSession.input?.stepPower(delta); });
  hud.onTouchWeapon(()     => { if (localInputAllowed()) matchSession.input?.nextWeapon(); });
  // Narrow presentation harnesses may provide an older HUD-shaped seam. The
  // production HUD always exposes both Settings callbacks; keep those fixtures
  // from becoming an unrelated integration dependency.
  hud.onAimGuide?.(()        => toggleAimGuide());
  hud.onToggleSound?.(()     => toggleSound());
  hud.onMove((delta)        => { if (localInputAllowed()) matchSession.input?.stepMove(delta); });
  hud.onPrimaryAction(()   => { if (localInputAllowed()) matchSession.input?.triggerFire(); });

  window.addEventListener('pagehide', () => {
    void hud.destroy();
  }, { once: true });

  // Deterministic E2E entrypoint (rendering-guardrail suite). When the page is
  // loaded with `?e2e=hotseat`, skip the splash/lobby and immediately start a
  // fixed 2-player hot-seat game through the SAME startGame() path the lobby
  // uses — so the Playwright layout tests reliably reach a running game without
  // brittle lobby-clicking. It ships in the bundle intentionally (the post-deploy
  // smoke drives the LIVE url with it), and is benign: it only starts a LOCAL
  // hot-seat game (fixed seed, two human seats) — no backend, no secrets, no auth.
  if (
    E2E_MODE === 'hotseat'
    || E2E_MODE === 'round-shop'
    || E2E_MODE === 'victory'
    || E2E_MODE === 'victory-anonymous'
    || E2E_MODE === 'victory-payoff'
    || E2E_VICTORY_VERIFIED_FOUR
  ) {
    if (E2E_MODE === 'victory-anonymous') lobby.show();
    const e2ePlayerNames = E2E_VICTORY_VERIFIED_FOUR
      ? ['Ranger Actualname', 'CPU 1 Ridgebreaker', 'CPU 2 Longshot', 'CPU 3 Undertow']
      : E2E_BATTLE_CONSOLE_REFERENCE
      ? ['Player 1', 'Player 2']
      : ['P1', 'P2'];
    const e2eColors = ['#e84d4d', '#4d8ce8', '#70ad47', '#d58a32'];
    void startGame({
      mode: 'hotseat',
      players: e2ePlayerNames.map((name, index) => ({
        name,
        color: e2eColors[index]!,
        ...(E2E_VICTORY_VERIFIED_FOUR && index > 0 ? { ai: 'hard' as const } : {}),
      })),
      playerNames: e2ePlayerNames,
      settings: { seed: E2E_HOT_SEAT_SEED },
      quickOperation: E2E_QUICK_OPERATION === null ? undefined : {
        id: E2E_QUICK_OPERATION.id,
        title: E2E_QUICK_OPERATION.title,
        briefing: E2E_QUICK_OPERATION.briefing,
      },
    });
  } else {
    lobby.show();
  }

  // JS-driven scale via CSS zoom (NOT transform: scale).
  //
  // zoom is used because it affects layout: a 1200×600 #app at zoom s takes up
  // 1200s×600s in document flow, so the body can center it without overflow.
  // transform:scale() leaves the layout box at 1200×600 regardless of the visual
  // size — body overflow:hidden then clips visible content.
  //
  // The 1200×600 divisor MUST mirror --stage-w / --stage-h in style.css. Match
  // is a content-fit overlay and never changes the stage scale denominator.
  //
  // Cap at 2× so 4K monitors don't get an absurdly large stage.
  const appEl = document.getElementById('app');
  // Continue the authored battlefield palette through ultrawide gutters. The
  // panorama is presentation-only; the fixed logical stage and every gameplay
  // coordinate remain unchanged. Resolve it through Vite's base so Pages and
  // root-hosted previews share the same asset contract.
  document.documentElement.style.setProperty(
    '--st-theater-backdrop',
    `url(${import.meta.env.BASE_URL}art/battlefield-theater-ultrawide-v2.webp)`,
  );
  // Below this scale the console strengthens its analog strokes and labels so
  // telemetry stays legible after whole-stage zoom. Key it from the ACTUAL scale,
  // not pointer type: a small or remote fine-pointer window is equally reduced.
  const COMPACT_SCALE = 0.8;
  function updateScale(): void {
    if (!appEl) return;
    const stageWidth = 1200;
    const s = Math.min(window.innerWidth / stageWidth, window.innerHeight / 600, 2);
    appEl.style.zoom = String(s);
    appEl.style.setProperty('--battle-ui-scale', String(s));
    // Keep the persistent Match ledger wholly outside gameplay. Smaller gutters
    // use the existing deliberate drawer instead of obscuring terrain or tanks.
    const sideGutter = (window.innerWidth - stageWidth * s) / 2;
    appEl.dataset['matchDocked'] = String(sideGutter >= (184 + 24) * s);
    // The console is grounded on the viewport floor. Continue the selected
    // panorama through any aspect-ratio remainder above the stage so ordinary
    // desktop windows read as one theater, not a second unrelated sky strip.
    const stageTop = Math.max(0, window.innerHeight - 600 * s);
    document.documentElement.style.setProperty('--st-stage-top', `${stageTop}px`);
    document.documentElement.style.setProperty('--st-stage-visual-width', `${stageWidth * s}px`);
    document.documentElement.style.setProperty('--st-stage-visual-height', `${600 * s}px`);
    // Renderer overscans the world by 18 logical pixels and begins the image
    // nine pixels above the canvas. Sample that same row at the canopy seam.
    document.documentElement.style.setProperty('--st-backdrop-seam-offset', `${9 * s}px`);
    document.documentElement.style.setProperty('--st-canopy-blend-alpha', stageTop > 1 ? '.48' : '0');
    // Store buy controls need a 44px physical touch target even when the entire
    // stage is zoomed below the compact design scale. Round upward so browser
    // subpixel layout cannot undercut that presentation-only floor.
    const storeBuyTarget = Math.ceil(44 / Math.max(s, Number.EPSILON));
    appEl.style.setProperty('--st-store-buy-target', `${storeBuyTarget}px`);
    const commandChoiceTarget = Math.ceil(24 / Math.max(s, Number.EPSILON));
    appEl.style.setProperty('--st-command-choice-target', `${commandChoiceTarget}px`);
    const deploymentChoiceTarget = Math.ceil(44 / Math.max(s, Number.EPSILON));
    appEl.style.setProperty('--st-deployment-choice-target', `${deploymentChoiceTarget}px`);
    // CSS zoom can snap a nominal 2px outline down to a single physical pixel.
    // Compensate in logical stage space so the authored brass focus keyline
    // remains at least two physical pixels at every supported viewport.
    const focusRingSize = Math.ceil(2 / Math.max(s, Number.EPSILON));
    appEl.style.setProperty('--st-focus-ring-size', `${focusRingSize}px`);
    // The whole stage is zoomed. Give the persistent command rail a logical
    // type size that still resolves to at least 11 physical pixels.
    const commandReadabilitySize = Math.max(11, Math.ceil(11 / Math.max(s, Number.EPSILON)));
    appEl.style.setProperty('--st-command-readability-size', `${commandReadabilitySize}px`);
    // The arsenal dossier lives inside the zoomed stage. Keep its tactical copy
    // above physical readability floors instead of shrinking it to 3-6px on phones.
    appEl.style.setProperty('--st-weapon-intel-name-size', `${Math.max(12, Math.ceil(12 / s))}px`);
    appEl.style.setProperty('--st-weapon-intel-ammo-size', `${Math.max(9, Math.ceil(10 / s))}px`);
    appEl.style.setProperty('--st-weapon-intel-label-size', `${Math.max(7, Math.ceil(9 / s))}px`);
    appEl.style.setProperty('--st-weapon-intel-value-size', `${Math.max(9, Math.ceil(11 / s))}px`);
    appEl.classList.toggle('is-compact', s < COMPACT_SCALE);
  }
  window.addEventListener('resize', updateScale);
  // visualViewport fires separately on mobile when the address bar animates —
  // window.resize does not always fire for those micro-height changes.
  window.visualViewport?.addEventListener('resize', updateScale);
  updateScale();
}

interface SandhogE2EProbe {
  phase: GameState['phase'];
  turn: number;
  activePlayerId: string;
  projectileCount: number;
  forwardedActions: Readonly<E2EForwardedActionCounts>;
  terrainVersion: number;
  sandhog: Readonly<{
    x: number;
    y: number;
    burrowTicksRemaining: number | null;
    centerSolid: boolean | null;
  }> | null;
  corridorWitness: Readonly<{
    x: number;
    y: number;
    centerSolid: boolean;
    adjacentX: number;
    adjacentY: number;
    adjacentSolid: boolean;
  }> | null;
  sandhogExplosionCount: number;
}

/**
 * Narrow, snapshot-only evidence channel for production-bundle browser tests.
 * It exists solely on the deterministic `?e2e=hotseat` entrypoint and copies
 * presentation-relevant facts rather than exposing the mutable GameState.
 */
function exposeDeterministicHotSeatProbe(state: GameState): void {
  const projectile = state.projectiles.find((candidate) => candidate.weaponType === 'sandhog');
  const burrowTicksRemaining = projectile?.burrowTicksRemaining ?? null;
  let centerSolid: boolean | null = null;
  let corridorWitness: SandhogE2EProbe['corridorWitness'] = null;
  if (projectile && burrowTicksRemaining !== null) {
    const x = Math.max(0, Math.min(CANVAS_WIDTH - 1, Math.round(projectile.x)));
    const y = Math.max(0, Math.min(CANVAS_HEIGHT - 1, Math.round(projectile.y)));
    centerSolid = state.terrain[y * CANVAS_WIDTH + x] !== 0;

    // Five drill steps behind the live head is 20px away for Sandhog's 3-4-5
    // vector: beyond its 13px presentation halo. Pair that cleared center with
    // a perpendicular pixel 15px away, beyond the 7px tunnel radius.
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const witnessX = projectile.x - projectile.vx * 5;
    const witnessY = projectile.y - projectile.vy * 5;
    const adjacentX = witnessX - (projectile.vy / speed) * 15;
    const adjacentY = witnessY + (projectile.vx / speed) * 15;
    const inBounds = (sampleX: number, sampleY: number): boolean =>
      sampleX >= 0
      && sampleX < CANVAS_WIDTH
      && sampleY >= 0
      && sampleY < CANVAS_HEIGHT;
    const solidAt = (sampleX: number, sampleY: number): boolean =>
      state.terrain[
        Math.round(sampleY) * CANVAS_WIDTH + Math.round(sampleX)
      ] !== 0;
    if (
      speed > 0
      && inBounds(witnessX, witnessY)
      && inBounds(adjacentX, adjacentY)
    ) {
      corridorWitness = Object.freeze({
        x: witnessX,
        y: witnessY,
        centerSolid: solidAt(witnessX, witnessY),
        adjacentX,
        adjacentY,
        adjacentSolid: solidAt(adjacentX, adjacentY),
      });
    }
  }

  const probe = Object.freeze<SandhogE2EProbe>({
    phase: state.phase,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    projectileCount: state.projectiles.length,
    forwardedActions: Object.freeze({ ...e2eForwardedActionCounts }),
    terrainVersion: state.terrainVersion,
    sandhog: projectile
      ? Object.freeze({
          x: projectile.x,
          y: projectile.y,
          burrowTicksRemaining,
          centerSolid,
        })
      : null,
    corridorWitness,
    sandhogExplosionCount: state.explosions.filter(
      (explosion) => explosion.weaponType === 'sandhog',
    ).length,
  });
  (
    window as typeof window & { __SINGED_TERRA_E2E__?: Readonly<SandhogE2EProbe> }
  ).__SINGED_TERRA_E2E__ = probe;
}

/** Build the GameClient for the selected mode (SPEC §5). */
export async function createClient(config: LobbyConfig): Promise<GameClient> {
  return createModeClient(clientModeSetupFor(config));
}

function clientModeSetupFor(config: LobbyConfig): ClientConstructionSetup {
  if (config.mode === 'hotseat') return { ...config, mode: 'hotseat' };
  if (!config.roomId) throw new Error('createClient: missing roomId for network mode');
  if (!config.playerId) throw new Error('createClient: missing playerId for network mode');
  return {
    ...config,
    mode: 'network',
    roomId: config.roomId,
    playerId: config.playerId,
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

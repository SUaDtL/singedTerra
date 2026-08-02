import './style.css';
import { GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { GRAVITY } from '@shared/engine/Physics';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import type { GameState } from '@shared/types/GameState';
import type { GameClient } from './client/GameClient';
import { HotSeatClient } from './client/HotSeatClient';
import { buildClientEngineOptions } from './client/gameEngineOptions';
import { rematchToConfig } from './client/rematchConfig';
import { InputHandler } from './input/InputHandler';
import {
  resolveActivePlayerOwnership,
  shouldAcceptLocalInput,
} from './input/inputGate';
import { Renderer } from './renderer/Renderer';
import { selectClientBattlefieldBackdrop } from './renderer/selectClientBattlefield';
import { resolveAimGuidePresentation } from './renderer/aimGuidePresentation';
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

const E2E_PARAMS = new URLSearchParams(window.location.search);
const E2E_MODE = E2E_PARAMS.get('e2e');
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
const ENABLE_DETERMINISTIC_HOT_SEAT_PROBE = E2E_MODE === 'hotseat';

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
  const modalRoot = requireElement('modal-layer');
  const lobbyRoot = requireElement('lobby');

  // Project the canonical CRT intensities (theme.ts) onto the DOM chrome's CSS
  // custom properties so the canvas tokens and the --crt-* vars share one source. (P3-16)
  const rootStyle = document.documentElement.style;
  for (const [prop, value] of Object.entries(crtCssVars())) rootStyle.setProperty(prop, value);

  const renderer = new Renderer(canvas);
  const hud = new HUD(hudRoot, overlayRoot, modalRoot);
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

  renderer.setEvents({
    onLaunch: () => audio.launch(),
    onExplosion: (radius, impact) => {
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
  // Mute toggle (M). Document-level so it works on any screen; 'M' is unused by
  // InputHandler (which owns arrows/space/Q), so there's no key conflict.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) {
      const muted = audio.toggleMute();
      hud.flashMessage(muted ? '🔇 Sound off' : '🔊 Sound on');
    } else if (e.code === 'KeyG' && !e.repeat) {
      const on = renderer.toggleAimGuide();
      markDirty(); // show/hide the aim guide on the next frame even on a static turn
      hud.flashMessage(on ? '🎯 Aim guide on' : '🎯 Aim guide off');
    } else if (e.code === 'KeyF') {
      // Hold F to fast-forward the shot animation (review #7). Local view pacing only;
      // never a logged action. Repeats while held (idempotent); released on keyup.
      client?.setFastForward?.(true);
      if (!e.repeat) hud.flashMessage('⏩ Fast-forward');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyF') client?.setFastForward?.(false);
  });

  // Per-game wiring that gets torn down and rebuilt on restart.
  let client: GameClient | null = null;
  let input: InputHandler | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastActiveId: string | null = null;
  // The players the current game was built from (for restart with same roster).
  let currentConfig: LobbyConfig | null = null;
  // One-shot, local-only fixture for the production-bundle victory-report guardrail.
  // A Play again action consumes the fixture and restarts into an ordinary match.
  let e2eVictoryPending = E2E_MODE === 'victory';

  function firstSalvoEligibility(): FirstSalvoEligibility | null {
    const state = client?.getState();
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
    const state = client?.getState();
    const activeTank = state?.tanks.find((tank) => tank.id === state.activePlayerId);
    return !!state
      && state.phase === 'PLAYER_TURN'
      && shouldAcceptLocalInput({
        activeIsAi: !!activeTank?.ai,
        activeIsLocal,
        paused: hud.isPaused(),
      });
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
  let aiTimers: ReturnType<typeof setTimeout>[] = [];

  /** ms the bot waits before swinging its barrel, then before firing — so the
   *  human sees it aim and shoot rather than an instant teleport-kill. */
  const AI_AIM_DELAY = 600;
  const AI_FIRE_DELAY = 550;

  function clearAiTimers(): void {
    for (const t of aiTimers) clearTimeout(t);
    aiTimers = [];
  }

  /** Tear down the current game's client/input/subscription (idempotent). */
  function teardown(): void {
    clearAiTimers();
    unsubscribe?.();
    unsubscribe = null;
    input?.detach();
    input = null;
    client?.stop();
    client = null;
    // Release any sustained napalm loop so its source/gain nodes don't leak when a
    // game is quit mid-burn — napalmStop is otherwise only called on the audio
    // edge when a burn ends naturally (reliability-001).
    audio.napalmStop();
    lastActiveId = null;
    // Force a full redraw on the next game's first frame, and clear the phase latch so
    // its opening phase counts as a change (otherwise the fresh static PLAYER_TURN
    // could be skipped because isAnimating() is false and nothing marked us dirty).
    renderDirty = true;
    lastPhase = null;
    activeIsAi = false;
    activeIsLocal = false;
    aiActedKey = null;
    // Clear any opponent-turn banner so it can't leak across games (P1-6b) — e.g.
    // a networked "Waiting for…" surviving into a later hot-seat game (which has no
    // turn-watch to reset it).
    hud.setTurnWatch({ state: 'clear' });
    // Explicitly tear down the end-of-game overlays. syncOverlay/syncRoundOver only
    // hide them while the render loop runs; once we unsubscribe above, nothing would
    // otherwise clear a lingering "{winner} wins!" banner when quitting to the menu
    // (it would sit on top of the lobby) — #13.
    hud.hideEndScreens();
    hud.setFirstSalvoStep(null);
    // Reset the page-singleton renderer's per-game visual state. Otherwise game #2+ in
    // the same tab drops all its juice: lastSeenExplosionId keeps game #1's high-water
    // mark while the fresh engine restarts explosion ids at 1, so early explosions fail
    // the dedupe (no boom/shake/debris/damage-numbers/bloom) — plus a stale last-shot
    // crosshair leaks across games. (Branch-review finding.)
    renderer.reset();
  }

  /** Build a fresh engine/client/input from the given config and start it. */
  async function startGame(config: LobbyConfig): Promise<void> {
    teardown();
    // Hide the lobby on EVERY entry into a game — not only via the lobby's own start
    // callback. Restart (restartCb) and network rematch (onRematch) call startGame()
    // directly, so without this a Restart issued while the lobby is showing (i.e. after
    // a quit to menu) would run the fresh game behind the still-visible lobby (#13).
    lobby.hide();
    currentConfig = config;

    const newClient = await createClient(config);
    client = newClient;
    selectClientBattlefieldBackdrop(newClient, renderer);
    firstSalvo.startNewGame();
    e2eForwardedActionCounts = { setAngle: 0, setPower: 0, fire: 0 };

    // Tell the store which weapons/accessories are buyable in this room (UI gate only; the engine
    // enforces it independently). Default 4 => everything buyable, matching the engine default.
    hud.setArmsLevel(config.settings?.armsLevel ?? 4);

    // Seed the input handler's locally-tracked aim from the active tank so the
    // arrow keys step from that tank's real angle/power (set_angle/set_power
    // carry ABSOLUTE values). getState() may be null before the first snapshot.
    const initial = newClient.getState();
    if (e2eVictoryPending && initial) {
      e2eVictoryPending = false;
      initial.phase = 'GAME_OVER';
      initial.winner = initial.tanks[0]!.id;
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
    }
    const activeTank = initial?.tanks.find((t) => t.id === initial.activePlayerId);
    lastActiveId = initial?.activePlayerId ?? null;

    // Human input is dropped while a CPU tank holds the turn (its keys would
    // drive the bot) OR while the in-game Pause overlay is open — a reflex
    // arrow/space must not change aim or fire a shot while paused (#52). The
    // rAF loop keeps running underneath either way (networked lockstep stays
    // in sync); only this LOCAL emit is suppressed.
    const newInput = new InputHandler(canvas, (action) => {
      if (!shouldAcceptLocalInput({ activeIsAi, activeIsLocal, paused: hud.isPaused() })) return;
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
          newClient.sendAction(forwardedAction);
        },
      );
      syncFirstSalvo();
    }, {
      initialAngle: activeTank?.angle,
      initialPower: activeTank?.power,
      canDirectAim: directAimAllowed,
    });
    input = newInput;
    newInput.attach();
    // Seed the weapon cursor from the opening active tank too (mirrors aim).
    if (activeTank) newInput.setWeapon(activeTank.selectedWeapon);

    // Network rematch: when a successor room is allocated (by either player),
    // migrate into it with the SAME roster + THIS client's preserved playerId.
    // Both clients receive this independently, so the rematch is symmetric.
    newClient.onRematch?.((info) => {
      const myId = currentConfig?.playerId;
      if (!myId) return;
      void startGame(rematchToConfig(info, myId));
    });

    // Networked liveness (P1-6): surface Realtime connection state as a banner and
    // failed/timed-out shots as a toast, so a dropped socket or lost submit never
    // leaves the player on a silently frozen board. Reset first so a stale banner
    // from a prior network game can't linger into a hot-seat game (whose client has
    // no onConnectionChange); the network client immediately re-primes its state.
    hud.setConnection('connected');
    newClient.onConnectionChange?.((connState) => hud.setConnection(connState));
    newClient.onFireFailed?.((message) => hud.flashMessage(message));
    newClient.onTurnWatch?.((watch) => hud.setTurnWatch(watch));

    unsubscribe = newClient.onStateChange((state) => {
      if (ENABLE_DETERMINISTIC_HOT_SEAT_PROBE) exposeDeterministicHotSeatProbe(state);
      // Aim guide is shown only when the LOCAL human controls the active tank: a
      // human turn in hot-seat, or (networked) the active tank is THIS client's id.
      // Never for a CPU seat or a remote opponent's turn.
      const activeTank = state.tanks.find((t) => t.id === state.activePlayerId);
      const aimGuide = resolveAimGuidePresentation({
        mode: config.mode,
        activePlayerOwned: resolveActivePlayerOwnership(
          config.mode,
          newClient,
          state.activePlayerId,
        ),
        activeIsAi: !!activeTank?.ai,
      }, {
        baseGravity: config.settings?.gravity ?? GRAVITY,
        turn: state.turn,
        suddenDeathTurn: config.settings?.suddenDeathTurn ?? 0,
      });
      activeIsLocal = aimGuide.visible;
      newInput.setDirectAimEnabled(directAimAllowed());
      renderer.setAimGuide(aimGuide.visible, aimGuide.gravity);
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
      if (renderDirty || renderer.isAnimating(state)) {
        renderer.render(state);
        renderDirty = false;
      }
      hud.update(
        state,
        newClient.isFiring ?? false,
        shouldAcceptLocalInput({
          activeIsAi: !!activeTank?.ai,
          activeIsLocal,
          paused: hud.isPaused(),
        }),
      );

      // When the active player changes, re-seed the input handler's aim AND
      // weapon cursor from the new active tank so each player's arrows start
      // from their own tank's current angle/power and their Q cycles from
      // their own selected weapon. Neither setter emits an action.
      if (state.activePlayerId !== lastActiveId) {
        lastActiveId = state.activePlayerId;
        // Active tank changed (turn handoff): the emphasis + aim-guide ownership
        // shift, so force at least one redraw even if the new scene is static.
        markDirty();
        const next = state.tanks.find((t) => t.id === state.activePlayerId);
        if (next) {
          newInput.setAim(next.angle, next.power);
          newInput.setWeapon(next.selectedWeapon);
        }
      }

      // Computer-opponent driver: if a CPU tank holds the turn, plan + play it.
      maybeDriveAi(state);
    });

    newClient.start();
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
    const gravity = client?.getEffectiveGravity() ?? currentConfig?.settings?.gravity ?? GRAVITY;
    const plan = computeAiPlan(state, active.id, active.ai!, gravity);
    if (!plan) return; // no target (game effectively over) — nothing to do

    clearAiTimers();
    // Swing the barrel to the planned aim first (visible), then fire after a beat.
    // A buy-to-restock plan (P1-7b) commits the turn-neutral purchase first — the
    // HotSeatClient applies it synchronously, so the select_weapon + fire below use
    // the just-restocked ammo. (aiActedKey already gates this to once per turn.)
    aiTimers.push(setTimeout(() => {
      if (plan.buy) client?.sendAction({ type: 'buy', weapon: plan.buy });
      client?.sendAction({ type: 'select_weapon', weapon: plan.weapon });
      client?.sendAction({ type: 'set_angle', angle: plan.angle });
      client?.sendAction({ type: 'set_power', power: plan.power });
      // The bot's barrel swing happens during the static PLAYER_TURN phase, so force
      // a redraw to show it (no human input marked us dirty for the CPU's turn).
      markDirty();
    }, AI_AIM_DELAY));
    aiTimers.push(setTimeout(() => {
      client?.sendAction(plan.weapon === 'shield' ? { type: 'use_shield' } : { type: 'fire' });
    }, AI_AIM_DELAY + AI_FIRE_DELAY));
  }

  // Register restart ONCE on the persistent HUD. Hot-seat rebuilds a fresh local
  // engine with the same roster. Network can't restart in place — the room's
  // action log replays the finished game — so it asks the server for a fresh
  // successor room; both clients then migrate via onRematch (above).
  hud.onRestart(() => {
    if (!currentConfig) return;
    if (currentConfig.mode === 'network') {
      void client?.requestRematch?.();
    } else {
      void startGame(currentConfig);
    }
  });

  const localInputAllowed = (): boolean => shouldAcceptLocalInput({
    activeIsAi,
    activeIsLocal,
    paused: hud.isPaused(),
  });

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
    if (!localInputAllowed()) return;
    markDirty(); // weapon pick can change aim-guide/HUD context — repaint next frame
    client?.sendAction({ type: 'select_weapon', weapon });
    input?.setWeapon(weapon);
  });

  // Register the store Buy callback ONCE on the persistent HUD. A buy is a
  // turn-neutral action: hot-seat applies it locally; network commits it to the
  // log (and the engine re-gates affordability + whose turn it is).
  hud.onBuy((purchase, tankId) => {
    markDirty(); // a buy changes ammo/credits surfaced in the scene — repaint next frame
    // `purchase` carries exactly one of weapon/accessory; forward it verbatim (the engine + referee
    // re-validate the "exactly one" invariant, affordability, the arms gate, and whose turn it is).
    client?.sendAction({ type: 'buy', ...purchase, ...(tankId ? { tankId } : {}) });
    // Auto-select a bought WEAPON so the active weapon becomes the one just bought
    // (review #9). select_weapon is local-only (never logged) — pure client convenience.
    // Accessory buys (battery, …) must NOT hijack the weapon slot, hence the narrow.
    if ('weapon' in purchase && purchase.weapon) {
      client?.sendAction({ type: 'select_weapon', weapon: purchase.weapon });
    }
  });

  // Start the next round from the ROUND_OVER between-rounds shop. Like a turn
  // action: hot-seat applies it locally; networked commits it to the log so every
  // client leaves the shop in lockstep.
  hud.onNextRound(() => {
    client?.sendAction({ type: 'next_round' });
  });

  const lobby = new Lobby(lobbyRoot, (config: LobbyConfig) => {
    // startGame() now hides the lobby itself (see its body), so the start callback no
    // longer needs to — keeping lobby-visibility owned by a single place (#13).
    void startGame(config);
  });

  // Quit the current game back to the lobby (in-game Menu / game-over Main Menu).
  // Tears down the engine/client/input and re-shows the full-field lobby overlay
  // (which covers the now-frozen canvas). For networked games this stops the
  // client; the room is reaped server-side by the heartbeat/lazy-GC.
  hud.onQuit(() => {
    teardown();
    lobby.show();
  });

  hud.onPauseChange((paused) => {
    if (paused) input?.setDirectAimEnabled(false);
    else input?.setDirectAimEnabled(directAimAllowed());
  });

  // Touch-aim strip callbacks (M2 mobile). Registered once on the persistent HUD;
  // `input` is the mutable per-game closure var so these always drive the live handler.
  // Same gate as the keyboard path (startGame): dropped on a CPU turn or while paused (#52).
  hud.onTouchAngle((delta) => { if (localInputAllowed()) input?.stepAngle(delta); });
  hud.onTouchPower((delta) => { if (localInputAllowed()) input?.stepPower(delta); });
  hud.onTouchWeapon(()     => { if (localInputAllowed()) input?.nextWeapon(); });
  hud.onMove((delta)        => { if (localInputAllowed()) input?.stepMove(delta); });
  hud.onPrimaryAction(()   => { if (localInputAllowed()) input?.triggerFire(); });

  // Deterministic E2E entrypoint (rendering-guardrail suite). When the page is
  // loaded with `?e2e=hotseat`, skip the splash/lobby and immediately start a
  // fixed 2-player hot-seat game through the SAME startGame() path the lobby
  // uses — so the Playwright layout tests reliably reach a running game without
  // brittle lobby-clicking. It ships in the bundle intentionally (the post-deploy
  // smoke drives the LIVE url with it), and is benign: it only starts a LOCAL
  // hot-seat game (fixed seed, two human seats) — no backend, no secrets, no auth.
  if (E2E_MODE === 'hotseat' || E2E_MODE === 'victory') {
    void startGame({
      mode: 'hotseat',
      players: [
        { name: 'P1', color: '#e84d4d' },
        { name: 'P2', color: '#4d8ce8' },
      ],
      playerNames: ['P1', 'P2'],
      settings: { seed: E2E_HOT_SEAT_SEED },
    });
  } else {
    lobby.show();
  }

  // JS-driven scale via CSS zoom (NOT transform: scale).
  //
  // zoom is used because it affects layout: a 1464×600 #app at zoom s takes up
  // 1464s×600s in document flow, so the body can center it without overflow.
  // transform:scale() leaves the layout box at 1464×600 regardless of the visual
  // size — body overflow:hidden then clips visible content.
  //
  // The 1464×600 divisor MUST mirror --stage-w / --stage-h in style.css (the full
  // stage = 1200×600 canvas + 264px HUD panel); keep them in sync.
  //
  // Cap at 2× so 4K monitors don't get an absurdly large stage.
  const appEl = document.getElementById('app');
  // Below this scale the console strengthens its analog strokes and labels so
  // telemetry stays legible after whole-stage zoom. Key it from the ACTUAL scale,
  // not pointer type: a small or remote fine-pointer window is equally reduced.
  const COMPACT_SCALE = 0.8;
  function updateScale(): void {
    if (!appEl) return;
    const s = Math.min(window.innerWidth / 1464, window.innerHeight / 600, 2);
    appEl.style.zoom = String(s);
    // Store buy controls need a 44px physical touch target even when the entire
    // stage is zoomed below the compact design scale. Round upward so browser
    // subpixel layout cannot undercut that presentation-only floor.
    const storeBuyTarget = Math.ceil(44 / Math.max(s, Number.EPSILON));
    appEl.style.setProperty('--st-store-buy-target', `${storeBuyTarget}px`);
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
async function createClient(config: LobbyConfig): Promise<GameClient> {
  if (config.mode === 'network') {
    if (!config.roomId)   throw new Error('createClient: missing roomId for network mode');
    if (!config.playerId) throw new Error('createClient: missing playerId for network mode');

    const { NetworkClient } = await import('./client/NetworkClient');
    const { supabase } = await import('./lib/supabase');

    // Best-of-N/economy values come from the synced room row. The builder also
    // pins the network execution rule to the mixed-version-compatible curve.
    const gameOptions = buildClientEngineOptions({ ...config, mode: 'network' });

    const nc = new NetworkClient(supabase, config.roomId, config.playerId, gameOptions, config.token);
    await nc.initialize();
    return nc;
  }

  // Hot-seat: browser runs the shared GameEngine directly, built from the
  // lobby's chosen players (2-4, unique colors) plus any advanced settings the
  // user set. Each settings field is forwarded only when present so the engine
  // defaults hold for untouched fields (e.g. omitted seed => DEFAULT_SEED).
  const engine = new GameEngine(buildClientEngineOptions({ ...config, mode: 'hotseat' }));
  return new HotSeatClient(engine);
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

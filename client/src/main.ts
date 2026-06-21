import './style.css';
import { GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { GRAVITY } from '@shared/engine/Physics';
import type { GameState } from '@shared/types/GameState';
import type { GameClient, RematchInfo } from './client/GameClient';
import { HotSeatClient } from './client/HotSeatClient';
import { InputHandler } from './input/InputHandler';
import { Renderer } from './renderer/Renderer';
import { AudioEngine } from './audio/AudioEngine';
import { HUD } from './ui/HUD';
import { Lobby, type LobbyConfig } from './ui/Lobby';
import { crtCssVars } from './ui/theme';

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

  // Synthesized SFX (Web Audio, no files). Pure presentation — wired to the
  // renderer's event sink so detonations/launches sound off the same authoritative
  // state the renderer draws, never touching the deterministic engine.
  const audio = new AudioEngine();
  audio.unlockOnGesture();

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
    onExplosion: (radius) => {
      audio.explosion(radius);
      flashBloom(radius);
    },
    onHop: () => audio.hopTick(),
    onFireActive: (active) => {
      if (active) audio.napalmStart();
      else audio.napalmStop();
    },
    onMiss: () => audio.fizzle(),
  });
  // Mute toggle (M). Document-level so it works on any screen; 'M' is unused by
  // InputHandler (which owns arrows/space/Tab/Q), so there's no key conflict.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) {
      const muted = audio.toggleMute();
      hud.flashMessage(muted ? '🔇 Sound off' : '🔊 Sound on');
    } else if (e.code === 'KeyG' && !e.repeat) {
      const on = renderer.toggleAimGuide();
      markDirty(); // show/hide the aim guide on the next frame even on a static turn
      hud.flashMessage(on ? '🎯 Aim guide on' : '🎯 Aim guide off');
    }
  });

  // Per-game wiring that gets torn down and rebuilt on restart.
  let client: GameClient | null = null;
  let input: InputHandler | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastActiveId: string | null = null;
  // The players the current game was built from (for restart with same roster).
  let currentConfig: LobbyConfig | null = null;

  // --- Computer-opponent (AI) driver state ---
  // Whether the active tank is CPU-controlled (gates out human input for that turn).
  let activeIsAi = false;
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
    lastActiveId = null;
    // Force a full redraw on the next game's first frame, and clear the phase latch so
    // its opening phase counts as a change (otherwise the fresh static PLAYER_TURN
    // could be skipped because isAnimating() is false and nothing marked us dirty).
    renderDirty = true;
    lastPhase = null;
    activeIsAi = false;
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

    // Tell the store which weapons/accessories are buyable in this room (UI gate only; the engine
    // enforces it independently). Default 4 => everything buyable, matching the engine default.
    hud.setArmsLevel(config.settings?.armsLevel ?? 4);

    // Seed the input handler's locally-tracked aim from the active tank so the
    // arrow keys step from that tank's real angle/power (set_angle/set_power
    // carry ABSOLUTE values). getState() may be null before the first snapshot.
    const initial = newClient.getState();
    const activeTank = initial?.tanks.find((t) => t.id === initial.activePlayerId);
    lastActiveId = initial?.activePlayerId ?? null;

    // Human input is dropped while a CPU tank holds the turn — otherwise the
    // player's keys would drive the bot's tank.
    const newInput = new InputHandler(canvas, (action) => {
      if (activeIsAi) return;
      // Any input mutates aim/weapon/turn state, so force a redraw next frame so the
      // aim guide / HUD update instantly even when the idle-skip gate would skip.
      markDirty();
      // UI feedback ticks (presentation only). The launch boom comes from the
      // renderer's FIRING transition, so 'fire' needs nothing here.
      if (action.type === 'set_angle' || action.type === 'set_power') audio.aimTick();
      else if (action.type === 'select_weapon') audio.weaponCycle();
      else if (action.type === 'use_shield') audio.shieldUp();
      newClient.sendAction(action);
    }, {
      initialAngle: activeTank?.angle,
      initialPower: activeTank?.power,
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
      // Aim guide is shown only when the LOCAL human controls the active tank: a
      // human turn in hot-seat, or (networked) the active tank is THIS client's id.
      // Never for a CPU seat or a remote opponent's turn.
      const activeTank = state.tanks.find((t) => t.id === state.activePlayerId);
      const localControls =
        !activeTank?.ai &&
        (config.mode !== 'network' || state.activePlayerId === config.playerId);
      renderer.setAimGuide(localControls);
      // Feed the active tank's barrel-origin (logical px) so mouse drag-aim can
      // derive angle/power from the drag vector (pivot = body top, y − 16).
      if (activeTank) newInput.setActiveTankScreenPos(activeTank.x, activeTank.y - 16);

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
      hud.update(state, newClient.isFiring ?? false);

      // When the active player changes, re-seed the input handler's aim AND
      // weapon cursor from the new active tank so each player's arrows start
      // from their own tank's current angle/power and their Tab/Q cycles from
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

  // Register the weapon-strip select callback ONCE on the persistent HUD. A
  // strip click both emits select_weapon AND re-seeds the InputHandler cursor so
  // Tab/Q cycling stays in sync with the mouse pick. client/input are the
  // mutable per-game closure vars (null between teardown and startGame).
  hud.onWeaponSelect((weapon) => {
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

  // Touch-aim strip callbacks (M2 mobile). Registered once on the persistent HUD;
  // `input` is the mutable per-game closure var so these always drive the live handler.
  // The AI guard (activeIsAi) matches what the keyboard path does in startGame().
  hud.onTouchAngle((delta) => { if (!activeIsAi) input?.stepAngle(delta); });
  hud.onTouchPower((delta) => { if (!activeIsAi) input?.stepPower(delta); });
  hud.onTouchFire(()       => { if (!activeIsAi) input?.triggerFire(); });
  hud.onTouchWeapon(()     => { if (!activeIsAi) input?.nextWeapon(); });

  lobby.show();

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
  function updateScale(): void {
    if (!appEl) return;
    const s = Math.min(window.innerWidth / 1464, window.innerHeight / 600, 2);
    appEl.style.zoom = String(s);
  }
  window.addEventListener('resize', updateScale);
  // visualViewport fires separately on mobile when the address bar animates —
  // window.resize does not always fire for those micro-height changes.
  window.visualViewport?.addEventListener('resize', updateScale);
  updateScale();
}

/** Build the GameClient for the selected mode (SPEC §5). */
async function createClient(config: LobbyConfig): Promise<GameClient> {
  if (config.mode === 'network') {
    if (!config.roomId)   throw new Error('createClient: missing roomId for network mode');
    if (!config.playerId) throw new Error('createClient: missing playerId for network mode');

    const { NetworkClient } = await import('./client/NetworkClient');
    const { supabase } = await import('./lib/supabase');

    const gameOptions = {
      maxPlayers: config.players.length,
      players:    config.players.map(p => ({ ...p, id: p.id! })),
      seed:       config.settings?.seed,
      maxWind:    config.settings?.maxWind,
      gravity:    config.settings?.gravity,
      // Best-of-N is sourced from the synced room row (see Lobby.emitNetworkReady),
      // so every client builds an identical engine — required for deterministic
      // lockstep across round boundaries. Undefined => single round.
      rounds:     config.settings?.rounds,
      // SE-parity economy options — same sourcing as `rounds`: synced via the room row so
      // every client's engine agrees (else interest/sudden-death/arms-gate would diverge).
      interestRate:    config.settings?.interestRate,
      suddenDeathTurn: config.settings?.suddenDeathTurn,
      armsLevel:       config.settings?.armsLevel,
    };

    const nc = new NetworkClient(supabase, config.roomId, config.playerId, gameOptions);
    await nc.initialize();
    return nc;
  }

  // Hot-seat: browser runs the shared GameEngine directly, built from the
  // lobby's chosen players (2-4, unique colors) plus any advanced settings the
  // user set. Each settings field is forwarded only when present so the engine
  // defaults hold for untouched fields (e.g. omitted seed => DEFAULT_SEED).
  const settings = config.settings;
  const engine = new GameEngine({
    players: config.players,
    maxPlayers: config.players.length,
    ...(settings?.seed != null ? { seed: settings.seed } : {}),
    ...(settings?.maxWind != null ? { maxWind: settings.maxWind } : {}),
    ...(settings?.gravity != null ? { gravity: settings.gravity } : {}),
    // Best-of-N is hot-seat-only for now: in networked lockstep `rounds` must come
    // from the synced room row so every client's engine agrees (Slice 3), otherwise
    // engines would diverge on when a round ends. Networked play stays single-round.
    ...(settings?.rounds != null ? { rounds: settings.rounds } : {}),
    // SE-parity economy options (hot-seat) — forwarded only when set, so engine defaults hold.
    ...(settings?.interestRate != null ? { interestRate: settings.interestRate } : {}),
    ...(settings?.suddenDeathTurn != null ? { suddenDeathTurn: settings.suddenDeathTurn } : {}),
    ...(settings?.armsLevel != null ? { armsLevel: settings.armsLevel } : {}),
  });
  return new HotSeatClient(engine);
}

/** Map a rematch successor-room payload into a network LobbyConfig. The local
 *  player's id is preserved across the rematch (restart_game copies the roster
 *  verbatim), so this client keeps owning the same engine tank. */
function rematchToConfig(info: RematchInfo, myPlayerId: string): LobbyConfig {
  return {
    mode: 'network',
    players: info.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    playerNames: info.players.map((p) => p.name),
    roomCode: info.code,
    roomId: info.roomId,
    playerId: myPlayerId,
    settings: {
      seed: info.seed,
      maxWind: info.options.maxWind,
      gravity: info.options.gravity,
      ...(info.options.rounds !== undefined ? { rounds: info.options.rounds } : {}),
    },
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

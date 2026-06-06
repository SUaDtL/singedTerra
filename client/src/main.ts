import './style.css';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameClient } from './client/GameClient';
import { HotSeatClient } from './client/HotSeatClient';
import { NetworkClient } from './client/NetworkClient';
import { InputHandler } from './input/InputHandler';
import { Renderer } from './renderer/Renderer';
import { HUD } from './ui/HUD';
import { Lobby, type LobbyConfig } from './ui/Lobby';

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
  const lobbyRoot = requireElement('lobby');

  const renderer = new Renderer(canvas);
  const hud = new HUD(hudRoot);

  // Per-game wiring that gets torn down and rebuilt on restart.
  let client: GameClient | null = null;
  let input: InputHandler | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastActiveId: string | null = null;
  // The players the current game was built from (for restart with same roster).
  let currentConfig: LobbyConfig | null = null;

  /** Tear down the current game's client/input/subscription (idempotent). */
  function teardown(): void {
    unsubscribe?.();
    unsubscribe = null;
    input?.detach();
    input = null;
    client?.stop();
    client = null;
    lastActiveId = null;
  }

  /** Build a fresh engine/client/input from the given config and start it. */
  function startGame(config: LobbyConfig): void {
    teardown();
    currentConfig = config;

    const newClient = createClient(config);
    client = newClient;

    // Seed the input handler's locally-tracked aim from the active tank so the
    // arrow keys step from that tank's real angle/power (set_angle/set_power
    // carry ABSOLUTE values). getState() may be null before the first snapshot.
    const initial = newClient.getState();
    const activeTank = initial?.tanks.find((t) => t.id === initial.activePlayerId);
    lastActiveId = initial?.activePlayerId ?? null;

    const newInput = new InputHandler(canvas, (action) => newClient.sendAction(action), {
      initialAngle: activeTank?.angle,
      initialPower: activeTank?.power,
    });
    input = newInput;
    newInput.attach();
    // Seed the weapon cursor from the opening active tank too (mirrors aim).
    if (activeTank) newInput.setWeapon(activeTank.selectedWeapon);

    unsubscribe = newClient.onStateChange((state) => {
      renderer.render(state);
      hud.update(state);

      // When the active player changes, re-seed the input handler's aim AND
      // weapon cursor from the new active tank so each player's arrows start
      // from their own tank's current angle/power and their Tab/Q cycles from
      // their own selected weapon. Neither setter emits an action.
      if (state.activePlayerId !== lastActiveId) {
        lastActiveId = state.activePlayerId;
        const next = state.tanks.find((t) => t.id === state.activePlayerId);
        if (next) {
          newInput.setAim(next.angle, next.power);
          newInput.setWeapon(next.selectedWeapon);
        }
      }
    });

    newClient.start();
  }

  // Register restart ONCE on the persistent HUD: rebuild with the same roster.
  hud.onRestart(() => {
    if (currentConfig) startGame(currentConfig);
  });

  const lobby = new Lobby(lobbyRoot, (config: LobbyConfig) => {
    startGame(config);
    lobby.hide();
  });

  lobby.show();
}

/** Build the GameClient for the selected mode (SPEC §5). */
function createClient(config: LobbyConfig): GameClient {
  if (config.mode === 'network') {
    return new NetworkClient();
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
  });
  return new HotSeatClient(engine);
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

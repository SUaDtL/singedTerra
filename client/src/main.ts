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
 */
function bootstrap(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game canvas element');
  }
  const hudRoot = requireElement('hud');
  const lobbyRoot = requireElement('lobby');

  const renderer = new Renderer(canvas);
  const hud = new HUD(hudRoot);

  const lobby = new Lobby(lobbyRoot, (config: LobbyConfig) => {
    const client = createClient(config);

    // Seed the input handler's locally-tracked aim from the active tank so the
    // arrow keys step from that tank's real angle/power (set_angle/set_power
    // carry ABSOLUTE values). getState() may be null before the first snapshot.
    const initial = client.getState();
    const activeTank = initial?.tanks.find((t) => t.id === initial.activePlayerId);

    const input = new InputHandler(canvas, (action) => client.sendAction(action), {
      initialAngle: activeTank?.angle,
      initialPower: activeTank?.power,
    });
    input.attach();

    client.onStateChange((state) => {
      renderer.render(state);
      hud.update(state);
    });

    lobby.hide();
    client.start();
  });

  lobby.show();
}

/** Build the GameClient for the selected mode (SPEC §5). */
function createClient(config: LobbyConfig): GameClient {
  if (config.mode === 'network') {
    return new NetworkClient();
  }
  // Hot-seat: browser runs the shared GameEngine directly. Omit seed for the
  // fixed reproducible default terrain (DEFAULT_SEED in GameEngine).
  const engine = new GameEngine({ maxPlayers: 2 });
  return new HotSeatClient(engine);
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

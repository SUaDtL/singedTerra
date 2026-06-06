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

    const input = new InputHandler(canvas, (action) => client.sendAction(action));
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
  // Hot-seat: browser runs the shared GameEngine directly.
  const engine = new GameEngine();
  return new HotSeatClient(engine);
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

bootstrap();

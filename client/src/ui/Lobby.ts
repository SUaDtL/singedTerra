/** Play mode chosen in the lobby. */
export type GameMode = 'hotseat' | 'network';

/** Configuration produced by the lobby once the player(s) are ready. */
export interface LobbyConfig {
  mode: GameMode;
  playerNames: string[];
  /** Room code for network mode (4-char alphanumeric), if applicable. */
  roomCode?: string;
}

/**
 * Lobby is the pre-game DOM overlay (SPEC §3): pick mode, enter player
 * names/colors, or create/join a network room. Calls onReady with the
 * resulting config when the player starts the game.
 */
export class Lobby {
  private readonly root: HTMLElement;
  private readonly onReady: (config: LobbyConfig) => void;

  constructor(root: HTMLElement, onReady: (config: LobbyConfig) => void) {
    this.root = root;
    this.onReady = onReady;
  }

  /**
   * Render the lobby overlay. MVP0 is hot-seat only with no name entry, so this
   * is a single "Start Game" control; clicking it produces a default hot-seat
   * config and hands off to onReady (which constructs the engine/client).
   */
  show(): void {
    this.root.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = 'singedTerra';

    const start = document.createElement('button');
    start.type = 'button';
    start.textContent = 'Start Game';
    start.addEventListener('click', () => {
      this.onReady({
        mode: 'hotseat',
        playerNames: ['Player 1', 'Player 2'],
      });
    });

    this.root.append(title, start);
    this.root.hidden = false;
  }

  /** Hide the lobby overlay (e.g. once the game starts). */
  hide(): void {
    this.root.replaceChildren();
    this.root.hidden = true;
  }
}

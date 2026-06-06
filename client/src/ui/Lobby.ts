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

  /** Render the lobby overlay. */
  show(): void {
    throw new Error('Lobby.show not implemented');
  }

  /** Hide the lobby overlay (e.g. once the game starts). */
  hide(): void {
    throw new Error('Lobby.hide not implemented');
  }
}

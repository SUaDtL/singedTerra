import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { GameEngine } from '@shared/engine/GameEngine';

/**
 * One authoritative game instance per room. Owns the shared GameEngine, applies
 * validated PlayerActions, and broadcasts GameState to all sockets in the room.
 */
export class GameServer {
  private readonly engine = new GameEngine();
  private readonly players = new Set<string>();

  constructor(
    private readonly roomId: string,
    private readonly io: SocketIOServer,
  ) {}

  /** Attach a connecting socket to this room and wire its event handlers. */
  addPlayer(socket: Socket, playerName: string): void {
    socket.join(this.roomId);
    this.players.add(socket.id);

    socket.emit('room_joined', { roomId: this.roomId, playerId: socket.id });

    socket.on('player_action', (action: PlayerAction) => {
      this.onPlayerAction(socket.id, action);
    });

    socket.on('disconnect', () => {
      this.removePlayer(socket.id);
    });

    // TODO: when enough players have joined, start the game and emit 'game_start'.
  }

  /** Validate + apply an action, then broadcast the resulting state. */
  private onPlayerAction(playerId: string, action: PlayerAction): void {
    // TODO: validate it is this player's turn and the phase accepts input.
    void playerId;
    void action;
    // TODO: this.engine.applyAction(action); then broadcast.
    this.broadcastState();
  }

  /** Broadcast the full authoritative GameState to the room. */
  private broadcastState(): void {
    const state: GameState = this.engine.getState();
    this.io.to(this.roomId).emit('state_update', state);
  }

  /** Drop a player; tear the room down if it becomes empty. */
  private removePlayer(playerId: string): void {
    this.players.delete(playerId);
    // TODO: skip turn / handle reconnect window (MVP2).
  }

  /** Tear down the room. */
  destroy(): void {
    this.io.in(this.roomId).disconnectSockets(true);
    this.players.clear();
  }
}

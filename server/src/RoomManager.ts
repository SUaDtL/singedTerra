import type { Server as SocketIOServer, Socket } from 'socket.io';
import { GameServer } from './GameServer';

/**
 * Owns the set of active game rooms and routes incoming socket connections to
 * the right room. One GameServer per room.
 */
export class RoomManager {
  private readonly rooms = new Map<string, GameServer>();

  constructor(private readonly io: SocketIOServer) {}

  /** Wire per-socket lobby handlers (create_room, join_room). */
  handleConnection(socket: Socket): void {
    socket.on('create_room', (payload: { playerName: string }) => {
      const room = this.createRoom();
      room.addPlayer(socket, payload.playerName);
    });

    socket.on('join_room', (payload: { roomId: string; playerName: string }) => {
      const room = this.rooms.get(payload.roomId);
      if (!room) {
        socket.emit('error', { message: `Room ${payload.roomId} not found` });
        return;
      }
      room.addPlayer(socket, payload.playerName);
    });
  }

  /** Create a new room with a fresh code and register it. */
  createRoom(): GameServer {
    const roomId = this.generateRoomCode();
    const room = new GameServer(roomId, this.io);
    this.rooms.set(roomId, room);
    return room;
  }

  /** Remove and tear down a room. */
  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.destroy();
    this.rooms.delete(roomId);
  }

  /**
   * Generate a 4-char alphanumeric room code.
   * TODO: implement collision-free random code generation (MVP2).
   */
  private generateRoomCode(): string {
    // TODO: replace stub with real random 4-char code (avoid existing codes).
    return 'AAAA';
  }
}

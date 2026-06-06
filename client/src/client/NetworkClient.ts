import { io, type Socket } from 'socket.io-client';
import type { GameClient } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';

/**
 * NetworkClient is render-only: it never runs physics locally. It sends
 * PlayerActions to the server and renders GameState snapshots it receives.
 */
export class NetworkClient implements GameClient {
  private readonly socket: Socket;
  private readonly listeners = new Set<(state: GameState) => void>();
  private state: GameState | null = null;

  constructor(url = '/') {
    this.socket = io(url, { autoConnect: false });
  }

  start(): void {
    throw new Error('NetworkClient.start not implemented');
  }

  stop(): void {
    this.socket.disconnect();
  }

  sendAction(_action: PlayerAction): void {
    throw new Error('NetworkClient.sendAction not implemented');
  }

  getState(): GameState | null {
    return this.state;
  }

  onStateChange(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

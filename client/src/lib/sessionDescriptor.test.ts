import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeSession, readSession, clearSession, type SessionDescriptor } from './sessionDescriptor';

const SESSION_KEY = 'singedterra:session';

const descriptor: SessionDescriptor = {
  roomId: 'room-1',
  roomCode: 'ABCD',
  playerId: 'player-1',
};

describe('sessionDescriptor persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a written descriptor through readSession', () => {
    writeSession(descriptor);
    expect(readSession()).toEqual(descriptor);
  });

  it('returns null from readSession after clearSession', () => {
    writeSession(descriptor);
    clearSession();
    expect(readSession()).toBeNull();
  });

  it('returns null for malformed JSON in the key', () => {
    localStorage.setItem(SESSION_KEY, '{not json');
    expect(readSession()).toBeNull();
  });

  it('returns null when the stored object is missing a field', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId: 'r', roomCode: 'ABCD' }));
    expect(readSession()).toBeNull();
  });

  it('returns null when the key is absent', () => {
    expect(readSession()).toBeNull();
  });

  describe('when localStorage throws', () => {
    let originalSetItem: typeof Storage.prototype.setItem;
    let originalGetItem: typeof Storage.prototype.getItem;

    beforeEach(() => {
      originalSetItem = Storage.prototype.setItem;
      originalGetItem = Storage.prototype.getItem;
      Storage.prototype.setItem = () => {
        throw new Error('storage disabled');
      };
      Storage.prototype.getItem = () => {
        throw new Error('storage disabled');
      };
    });

    afterEach(() => {
      Storage.prototype.setItem = originalSetItem;
      Storage.prototype.getItem = originalGetItem;
    });

    it('does not throw from writeSession and readSession returns null', () => {
      expect(() => writeSession(descriptor)).not.toThrow();
      expect(readSession()).toBeNull();
    });
  });
});

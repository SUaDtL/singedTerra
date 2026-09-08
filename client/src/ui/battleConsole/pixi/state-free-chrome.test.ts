import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { stateFreeChromeDescriptor } from './scene';

const contract = readBattleConsoleContract('topology/chrome-sockets.json') as any;

describe('AC-10 state-free static chrome', () => {
  it('keeps every live-state socket dynamic and leaves no semantic ink in static chrome', () => {
    const descriptor = stateFreeChromeDescriptor();
    expect(descriptor.socketKeys).toEqual(contract.sockets.map((socket: { key: string }) => socket.key));
    expect(descriptor.liveInkKeys).toEqual([]);
    expect(descriptor.semanticAuthority).toBe(false);
    expect(descriptor.inputAuthority).toBe(false);
  });
});

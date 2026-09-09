import { describe, expect, it, vi } from 'vitest';
import { MatchSessionLifecycle } from './MatchSessionLifecycle';
import { GameSessionComposition, type GameSessionCompositionPorts } from './GameSessionComposition';
import type { ClientModeSetup } from './modeConfig';

const setup: ClientModeSetup = {
  mode: 'hotseat', players: [], playerNames: [],
};
type FixtureState = { phase: string };

function fixture(initial: FixtureState | null, verifiedComplete = false) {
  const calls: string[] = [];
  const client = { getState: vi.fn(() => initial), stop: vi.fn(() => calls.push('stop')) };
  const renderer = { reset: vi.fn(() => calls.push('reset')) };
  const input = { detach: vi.fn(() => calls.push('detach')) };
  const unsubscribe = vi.fn(() => calls.push('unsubscribe'));
  const lifecycle = new MatchSessionLifecycle<typeof client, typeof input, typeof renderer>();
  const ports: GameSessionCompositionPorts<typeof client, typeof input, typeof renderer, FixtureState> = {
    retirePresentation: vi.fn(() => { calls.push('retire-presentation'); }),
    afterRetire: vi.fn(() => { calls.push('after-retire'); }),
    prepareAcquisition: vi.fn(() => { calls.push('prepare'); return setup; }),
    acquireClient: vi.fn(async () => {
      calls.push('acquire');
      return { status: 'acquired' as const, client, verifiedComplete };
    }),
    constructRenderer: vi.fn(() => { calls.push('construct-renderer'); return renderer; }),
    configureRendererEvents: vi.fn(() => calls.push('configure-events')),
    primeTerminalHistory: vi.fn(() => calls.push('prime-history')),
    configureInitialPresentation: vi.fn(() => calls.push('configure-initial')),
    constructInput: vi.fn(() => { calls.push('construct-input'); return input; }),
    attachInput: vi.fn(() => calls.push('attach-input')),
    configureClient: vi.fn(() => calls.push('configure-client')),
    createStateListener: vi.fn(() => { calls.push('create-listener'); return () => calls.push('state'); }),
    subscribe: vi.fn((_client, listener) => { calls.push('subscribe'); listener({ phase: 'PLAYER_TURN' }); return unsubscribe; }),
    start: vi.fn(() => calls.push('start')),
  };
  return { calls, client, renderer, input, unsubscribe, lifecycle, ports };
}

function compositionFor(f: ReturnType<typeof fixture>) {
  return new GameSessionComposition<
    typeof f.client, typeof f.input, typeof f.renderer, FixtureState
  >(f.lifecycle);
}

describe('GameSessionComposition', () => {
  it.each([
    [{ phase: 'PLAYER_TURN' }, true, true],
    [{ phase: 'GAME_OVER' }, true, true],
    [null, true, false],
    [{ phase: 'PLAYER_TURN' }, false, false],
  ] as const)('owns resources in setup order and primes only eligible history', async (initial, complete, primed) => {
    const f = fixture(initial, complete);
    const result = await compositionFor(f).start(f.ports);

    expect(result?.initial).toBe(initial);
    expect(f.client.getState).toHaveBeenCalledOnce();
    expect(f.ports.primeTerminalHistory).toHaveBeenCalledTimes(primed ? 1 : 0);
    expect(f.calls).toEqual([
      'retire-presentation', 'after-retire', 'prepare', 'acquire', 'construct-renderer', 'configure-events',
      ...(primed ? ['prime-history'] : []),
      'configure-initial', 'construct-input', 'attach-input', 'configure-client',
      'create-listener', 'subscribe', 'state', 'start',
    ]);
  });

  it('returns an unavailable acquisition without constructing resources', async () => {
    const f = fixture(null);
    f.ports.acquireClient = vi.fn(async () => ({ status: 'unavailable' as const }));

    await expect(compositionFor(f).start(f.ports)).resolves.toBeNull();
    expect(f.ports.constructRenderer).not.toHaveBeenCalled();
  });

  it('runs post-retirement cleanup before rejecting a superseded generation', async () => {
    const f = fixture(null);
    const composition = compositionFor(f);
    let release!: () => void;
    f.ports.retirePresentation = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));

    const stale = composition.start(f.ports);
    await vi.waitFor(() => expect(f.ports.retirePresentation).toHaveBeenCalledOnce());
    await composition.retire(() => undefined);
    release();

    await expect(stale).resolves.toBeNull();
    expect(f.ports.afterRetire).toHaveBeenCalledOnce();
    expect(f.ports.prepareAcquisition).not.toHaveBeenCalled();
  });

  it('stops setup when renderer configuration retires the generation', async () => {
    const f = fixture({ phase: 'PLAYER_TURN' });
    const composition = compositionFor(f);
    let retirement: Promise<number> | null = null;
    f.ports.configureRendererEvents = vi.fn(() => {
      f.calls.push('configure-events');
      retirement = composition.retire(() => { f.calls.push('reentrant-retire'); });
    });

    await expect(composition.start(f.ports)).resolves.toBeNull();
    await retirement;
    expect(f.ports.constructInput).not.toHaveBeenCalled();
    expect(f.ports.subscribe).not.toHaveBeenCalled();
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.renderer.reset).toHaveBeenCalledOnce();
  });

  it.each(['constructRenderer', 'getState', 'primeTerminalHistory', 'createStateListener'] as const)(
    'does not publish later resources after %s retires the generation',
    async (stage) => {
      const f = fixture({ phase: 'PLAYER_TURN' }, true);
      const composition = compositionFor(f);
      let retirement: Promise<number> | null = null;
      const retire = (): void => {
        retirement = composition.retire(() => { f.calls.push('reentrant-retire'); });
      };
      if (stage === 'constructRenderer') {
        f.ports.constructRenderer = vi.fn(() => { retire(); return f.renderer; });
      } else if (stage === 'getState') {
        f.client.getState.mockImplementationOnce(() => { retire(); return { phase: 'PLAYER_TURN' }; });
      } else if (stage === 'primeTerminalHistory') {
        f.ports.primeTerminalHistory = vi.fn(retire);
      } else {
        f.ports.createStateListener = vi.fn(() => { retire(); return () => undefined; });
      }

      await expect(composition.start(f.ports)).resolves.toBeNull();
      await retirement;
      expect(f.ports.start).not.toHaveBeenCalled();
      if (stage !== 'createStateListener') expect(f.ports.constructInput).not.toHaveBeenCalled();
      expect(f.renderer.reset).toHaveBeenCalledOnce();
    },
  );

  it.each(['configureRendererEvents', 'configureInitialPresentation', 'attachInput', 'subscribe', 'start'] as const)(
    'rolls back every acquired resource and preserves a %s failure',
    async (stage) => {
      const f = fixture({ phase: 'PLAYER_TURN' });
      const error = new Error(stage);
      (f.ports[stage] as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw error; });

      await expect(compositionFor(f).start(f.ports)).rejects.toBe(error);
      expect(f.client.stop).toHaveBeenCalledOnce();
      expect(f.renderer.reset).toHaveBeenCalledOnce();
      if (stage === 'subscribe' || stage === 'start') expect(f.input.detach).toHaveBeenCalledOnce();
      if (stage === 'start') expect(f.unsubscribe).toHaveBeenCalledOnce();
    },
  );
});

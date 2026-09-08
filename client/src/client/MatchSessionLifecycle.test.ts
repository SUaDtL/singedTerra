import { describe, expect, it, vi } from 'vitest';
import { MatchSessionLifecycle } from './MatchSessionLifecycle';

type Client = { stop(): void };
type Input = { detach(): void };
type Renderer = { reset(): void };

describe('MatchSessionLifecycle', () => {
  it('retires timers and resources once around asynchronous presentation cleanup', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    lifecycle.ownClient({ stop: () => events.push('client') });
    lifecycle.ownInput({ detach: () => events.push('input') });
    lifecycle.ownSubscription(() => events.push('subscription'));
    lifecycle.ownRenderer({ reset: () => events.push('renderer') });
    lifecycle.schedule(() => events.push('timer'), 100);

    await lifecycle.retire(async () => { events.push('presentation'); });
    await lifecycle.retire(() => undefined);
    vi.runAllTimers();

    expect(events).toEqual(['subscription', 'input', 'client', 'presentation', 'renderer']);
    vi.useRealTimers();
  });

  it('invalidates the previous generation before asynchronous teardown completes', async () => {
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const previous = lifecycle.currentGeneration;
    let finishPresentation!: () => void;
    const retired = lifecycle.retire(() => new Promise<void>((resolve) => {
      finishPresentation = resolve;
    }));

    expect(lifecycle.isCurrent(previous)).toBe(false);
    expect(lifecycle.currentGeneration).toBe(previous + 1);
    finishPresentation();
    await expect(retired).resolves.toBe(previous + 1);
  });

  it('treats explicit null as a precise client identity', () => {
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const generation = lifecycle.currentGeneration;

    expect(lifecycle.isCurrent(generation, null)).toBe(true);
    lifecycle.ownClient({ stop: vi.fn() });
    expect(lifecycle.isCurrent(generation, null)).toBe(false);
    expect(lifecycle.isCurrent(generation)).toBe(true);
  });

  it('resets only the renderer captured by each overlapping teardown', async () => {
    const events: string[] = [];
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    lifecycle.ownRenderer({ reset: () => events.push('first-renderer') });
    let finishFirst!: () => void;
    const firstRetire = lifecycle.retire(() => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));
    lifecycle.ownRenderer({ reset: () => events.push('second-renderer') });

    await lifecycle.retire(() => undefined);
    finishFirst();
    await firstRetire;

    expect(events).toEqual(['second-renderer', 'first-renderer']);
    expect(lifecycle.renderer).toBeNull();
  });
});

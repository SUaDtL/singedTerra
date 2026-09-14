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
    lifecycle.ownClient(lifecycle.currentGeneration, { stop: () => events.push('client') });
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
    lifecycle.ownClient(generation, { stop: vi.fn() });
    expect(lifecycle.isCurrent(generation, null)).toBe(false);
    expect(lifecycle.isCurrent(generation)).toBe(true);
  });

  it('stops a client created after its start generation was replaced', async () => {
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const staleGeneration = await lifecycle.retire(() => undefined);
    await lifecycle.retire(() => undefined);
    const staleClient = { stop: vi.fn() };

    expect(lifecycle.ownClient(staleGeneration, staleClient)).toBe(false);
    expect(staleClient.stop).toHaveBeenCalledOnce();
    expect(lifecycle.client).toBeNull();
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

  it('rolls back one matching partial setup and ignores stale or duplicate rollback', () => {
    const events: string[] = [];
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const generation = lifecycle.currentGeneration;
    const client = { stop: () => events.push('client') };
    lifecycle.ownClient(generation, client);
    lifecycle.ownRenderer({ reset: () => events.push('renderer') });
    lifecycle.ownInput({ detach: () => events.push('input') });
    lifecycle.ownSubscription(() => events.push('subscription'));

    expect(lifecycle.rollbackIfCurrent(generation, client)).toBe(true);
    expect(lifecycle.rollbackIfCurrent(generation, client)).toBe(false);
    expect(events).toEqual(['subscription', 'input', 'client', 'renderer']);
    expect(lifecycle.client).toBeNull();
    expect(lifecycle.input).toBeNull();
    expect(lifecycle.renderer).toBeNull();
  });

  it('continues rollback after a disposer throws and keeps a duplicate call inert', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const generation = lifecycle.currentGeneration;
    const client = { stop: () => events.push('client') };
    lifecycle.ownClient(generation, client);
    lifecycle.ownRenderer({ reset: () => events.push('renderer') });
    lifecycle.ownInput({ detach: () => events.push('input') });
    lifecycle.ownSubscription(() => {
      events.push('subscription');
      throw new Error('unsubscribe failed');
    });
    lifecycle.schedule(() => events.push('timer'), 10);

    expect(lifecycle.rollbackIfCurrent(generation, client)).toBe(true);
    expect(lifecycle.rollbackIfCurrent(generation, client)).toBe(false);
    vi.runAllTimers();

    expect(events).toEqual(['subscription', 'input', 'client', 'renderer']);
    vi.useRealTimers();
  });

  it('suspends page authority without retiring the owned match and restores that same owner', () => {
    const events: string[] = [];
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    const client = { stop: () => events.push('client') };
    const input = { detach: () => events.push('input') };
    const renderer = { reset: () => events.push('renderer') };
    lifecycle.ownClient(lifecycle.currentGeneration, client);
    lifecycle.ownInput(input);
    lifecycle.ownSubscription(() => events.push('subscription'));
    lifecycle.ownRenderer(renderer);

    lifecycle.suspendForPageCache();
    const restore = lifecycle.beginPageRestore();

    expect(lifecycle.pageAuthorityReady).toBe(false);
    expect(lifecycle.client).toBe(client);
    expect(lifecycle.input).toBe(input);
    expect(lifecycle.renderer).toBe(renderer);
    expect(events).toEqual([]);
    expect(restore).not.toBeNull();
    expect(lifecycle.completePageRestore(restore!)).toBe(true);
    expect(lifecycle.pageAuthorityReady).toBe(true);
    expect(events).toEqual([]);
  });

  it('cannot reopen page authority from a stale restore after the match is retired', async () => {
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    lifecycle.ownClient(lifecycle.currentGeneration, { stop: vi.fn() });
    lifecycle.suspendForPageCache();
    const stale = lifecycle.beginPageRestore();

    await lifecycle.retire(() => undefined);

    expect(stale).not.toBeNull();
    expect(lifecycle.completePageRestore(stale!)).toBe(false);
    expect(lifecycle.pageAuthorityReady).toBe(false);
  });

  it('requires each persisted-page cycle to finish its own restore generation', () => {
    const lifecycle = new MatchSessionLifecycle<Client, Input, Renderer>();
    lifecycle.ownClient(lifecycle.currentGeneration, { stop: vi.fn() });
    lifecycle.suspendForPageCache();
    const first = lifecycle.beginPageRestore()!;
    lifecycle.suspendForPageCache();
    const second = lifecycle.beginPageRestore()!;

    expect(lifecycle.completePageRestore(first)).toBe(false);
    expect(lifecycle.pageAuthorityReady).toBe(false);
    expect(lifecycle.completePageRestore(second)).toBe(true);
    expect(lifecycle.pageAuthorityReady).toBe(true);
  });
});

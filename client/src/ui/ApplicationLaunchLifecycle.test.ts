import { afterEach, describe, expect, it, vi } from 'vitest';
import * as applicationSurfaceModule from './ApplicationSurface';
import { ApplicationSurfaceController } from './ApplicationSurface';

interface LaunchFocusSnapshot {
  readonly categoryId: string;
  readonly itemId: string;
  readonly focusKey: string;
}

interface LaunchLifecycleContract {
  launch<Result>(options: {
    readonly captureFocus: () => LaunchFocusSnapshot;
    readonly acquire: () => Result | null | Promise<Result | null>;
    readonly commit: (result: Result) => void;
    readonly restore: (snapshot: LaunchFocusSnapshot, error: unknown) => void;
  }): Promise<Result | null>;
  returnToPregame(show: () => void): void;
  returnToPregameAfter(retire: Promise<void>, show: () => void): Promise<void>;
}

type LaunchLifecycleConstructor = new (
  surfaces: ApplicationSurfaceController,
) => LaunchLifecycleContract;

function launchLifecycleConstructor(): LaunchLifecycleConstructor {
  const candidate = (
    applicationSurfaceModule as typeof applicationSurfaceModule & {
      readonly ApplicationLaunchLifecycle?: LaunchLifecycleConstructor;
    }
  ).ApplicationLaunchLifecycle;
  expect(candidate, 'ApplicationSurface must expose the generation-bound launch lifecycle')
    .toBeTypeOf('function');
  return candidate!;
}

function mount(): {
  readonly battle: HTMLElement;
  readonly pregame: HTMLElement;
  readonly surfaces: ApplicationSurfaceController;
} {
  document.body.innerHTML = `
    <main id="app"><button type="button">Battle control</button></main>
    <section id="lobby"><button type="button">Resume Ash Road</button></section>
  `;
  const battle = document.querySelector<HTMLElement>('#app')!;
  const pregame = document.querySelector<HTMLElement>('#lobby')!;
  return {
    battle,
    pregame,
    surfaces: new ApplicationSurfaceController({ battle, pregame }, 'pregame'),
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ApplicationLaunchLifecycle', () => {
  it('keeps preparation visible, inert, and busy while deferred acquisition owns the launch', async () => {
    const roots = mount();
    const acquisition = deferred<{ readonly session: string } | null>();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);
    const launch = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'campaigns', itemId: 'ash-road', focusKey: 'resume' }),
      acquire: () => acquisition.promise,
      commit: vi.fn(),
      restore: vi.fn(),
    });

    expect(roots.surfaces.state).toBe('launching');
    expect(roots.pregame.hidden).toBe(false);
    expect(roots.pregame.inert).toBe(true);
    expect(roots.pregame.getAttribute('aria-busy')).toBe('true');
    expect(roots.battle.hidden).toBe(true);
    expect(roots.battle.inert).toBe(true);

    acquisition.resolve(null);
    await launch;
  });

  it('commits a fully acquired session before revealing battle exactly once', async () => {
    const roots = mount();
    const setState = vi.spyOn(roots.surfaces, 'setState');
    const commit = vi.fn(() => { roots.pregame.replaceChildren(); });
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);

    await expect(lifecycle.launch({
      captureFocus: () => ({ categoryId: 'campaigns', itemId: 'ash-road', focusKey: 'resume' }),
      acquire: async () => ({ session: 'ready' }),
      commit,
      restore: vi.fn(),
    })).resolves.toEqual({ session: 'ready' });

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ session: 'ready' });
    expect(setState.mock.calls.map(([state]) => state)).toEqual(['launching', 'battle']);
    expect(roots.surfaces.state).toBe('battle');
    expect(roots.pregame.hidden).toBe(true);
    expect(roots.battle.hidden).toBe(false);
    expect(roots.battle.inert).toBe(false);
  });

  it.each([
    ['synchronous', () => { throw new Error('invalid launch'); }],
    ['asynchronous', async () => { throw new Error('initialization failed'); }],
  ] as const)('restores the exact initiating selection and focus after %s failure', async (_kind, acquire) => {
    const roots = mount();
    const snapshot = Object.freeze({
      categoryId: 'skirmishes',
      itemId: 'standard',
      focusKey: 'operation:first-salvo',
    });
    const restore = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);

    await expect(lifecycle.launch({
      captureFocus: () => snapshot,
      acquire,
      commit: vi.fn(),
      restore,
    })).resolves.toBeNull();

    expect(restore).toHaveBeenCalledOnce();
    expect(restore.mock.calls[0]?.[0]).toBe(snapshot);
    expect(restore.mock.calls[0]?.[1]).toBeInstanceOf(Error);
    expect(roots.surfaces.state).toBe('pregame');
    expect(roots.pregame.inert).toBe(false);
    expect(roots.pregame.hasAttribute('aria-busy')).toBe(false);
    expect(roots.battle.hidden).toBe(true);
  });

  it('restores unavailable acquisition without inventing an error', async () => {
    const roots = mount();
    const snapshot = Object.freeze({
      categoryId: 'multiplayer', itemId: 'local-battle', focusKey: 'start-local',
    });
    const restore = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);

    await lifecycle.launch({
      captureFocus: () => snapshot,
      acquire: async () => null,
      commit: vi.fn(),
      restore,
    });

    expect(restore).toHaveBeenCalledWith(snapshot, undefined);
    expect(roots.surfaces.state).toBe('pregame');
  });

  it('rejects stale completion after a newer launch wins', async () => {
    const roots = mount();
    const staleAcquisition = deferred<{ readonly session: string }>();
    const staleCommit = vi.fn();
    const staleRestore = vi.fn();
    const currentCommit = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);

    const stale = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'campaigns', itemId: 'ash-road', focusKey: 'start' }),
      acquire: () => staleAcquisition.promise,
      commit: staleCommit,
      restore: staleRestore,
    });
    const current = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'skirmishes', itemId: 'standard', focusKey: 'launch' }),
      acquire: async () => ({ session: 'current' }),
      commit: currentCommit,
      restore: vi.fn(),
    });
    await current;
    staleAcquisition.resolve({ session: 'stale' });
    await stale;

    expect(currentCommit).toHaveBeenCalledOnce();
    expect(staleCommit).not.toHaveBeenCalled();
    expect(staleRestore).not.toHaveBeenCalled();
    expect(roots.surfaces.state).toBe('battle');
  });

  it('rejects stale failure after a newer launch wins', async () => {
    const roots = mount();
    const staleAcquisition = deferred<{ readonly session: string }>();
    const staleRestore = vi.fn();
    const currentCommit = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);

    const stale = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'multiplayer', itemId: 'online', focusKey: 'join' }),
      acquire: () => staleAcquisition.promise,
      commit: vi.fn(),
      restore: staleRestore,
    });
    await lifecycle.launch({
      captureFocus: () => ({ categoryId: 'skirmishes', itemId: 'standard', focusKey: 'launch' }),
      acquire: async () => ({ session: 'current' }),
      commit: currentCommit,
      restore: vi.fn(),
    });
    staleAcquisition.reject(new Error('stale acquisition failed'));
    await stale;

    expect(currentCommit).toHaveBeenCalledOnce();
    expect(staleRestore).not.toHaveBeenCalled();
    expect(roots.surfaces.state).toBe('battle');
  });

  it('invalidates an in-flight launch and restores preparation on match return', async () => {
    const roots = mount();
    const acquisition = deferred<{ readonly session: string }>();
    const commit = vi.fn();
    const restore = vi.fn();
    const show = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);
    const launch = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'multiplayer', itemId: 'online', focusKey: 'retry' }),
      acquire: () => acquisition.promise,
      commit,
      restore,
    });

    lifecycle.returnToPregame(show);
    acquisition.resolve({ session: 'stale' });
    await launch;

    expect(show).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(roots.surfaces.state).toBe('pregame');
    expect(roots.pregame.inert).toBe(false);
    expect(roots.battle.hidden).toBe(true);
  });

  it('invalidates immediately but reveals preparation only after return teardown settles', async () => {
    const roots = mount();
    const acquisition = deferred<{ readonly session: string }>();
    const retirement = deferred<void>();
    const commit = vi.fn();
    const show = vi.fn();
    const Lifecycle = launchLifecycleConstructor();
    const lifecycle = new Lifecycle(roots.surfaces);
    const launch = lifecycle.launch({
      captureFocus: () => ({ categoryId: 'multiplayer', itemId: 'online', focusKey: 'retry' }),
      acquire: () => acquisition.promise,
      commit,
      restore: vi.fn(),
    });

    const returned = lifecycle.returnToPregameAfter(retirement.promise, show);
    acquisition.resolve({ session: 'stale' });
    await launch;
    expect(commit).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    expect(roots.surfaces.state).toBe('launching');

    retirement.resolve(undefined);
    await returned;
    expect(show).toHaveBeenCalledOnce();
    expect(roots.surfaces.state).toBe('pregame');
  });
});

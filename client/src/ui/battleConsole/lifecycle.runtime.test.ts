// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { BattleConsoleResourceLedger, battleConsoleResourceClasses, resourcesAreZero } from './resources';
import {
  createBattleConsoleLifecycle,
  type BattleConsoleLifecycleEnterRequest,
} from './lifecycle';
import type {
  BattleConsoleMountModule,
  BattleConsoleMountedGeneration,
} from './mount';
import type { BattleConsolePresentationState } from './types';
import { projectResponsiveLayout } from './projection';

const state: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};

function request(semanticHost: HTMLElement, pixiHost: HTMLElement): BattleConsoleLifecycleEnterRequest {
  return {
    semanticHost,
    pixiHost,
    initialState: state,
    dispatch: () => {},
    layout: projectResponsiveLayout('wide', 1),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('P-06 generation-owned lifecycle', () => {
  it('lets restart commit while a stale mount is still pending, then destroys its late result', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const pendingMount = deferred<BattleConsoleMountedGeneration>();
    let mounts = 0;
    const events: string[] = [];
    const lifecycle = createBattleConsoleLifecycle({ loadMount: async () => ({
      async mountBattleConsoleGeneration(options) {
        mounts++;
        if (mounts === 1) return pendingMount.promise;
        events.push('mount-winner');
        return {
          generation: options.generationToken.generation,
          status: 'ready', snapshot: () => options.generationToken.resources.snapshot(),
          update() {}, async destroy() { return options.generationToken.resources.close(); },
        };
      },
    }) });
    const first = lifecycle.enter(request(semanticHost, pixiHost));
    await Promise.resolve();
    await Promise.resolve();
    expect(mounts).toBe(1);
    const second = lifecycle.restart(request(semanticHost, pixiHost));
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(mounts).toBe(2);
    await expect(second).resolves.toMatchObject({ committed: true, generation: 2 });
    pendingMount.resolve({
      generation: 1, status: 'ready', snapshot: () => new BattleConsoleResourceLedger().snapshot(),
      update() {}, async destroy() {
        if (!events.includes('destroy-predecessor')) events.push('destroy-predecessor');
        return new BattleConsoleResourceLedger().close();
      },
    });
    const oldEntry = await first;
    expect(oldEntry.committed).toBe(false);
    expect(events).toEqual(['mount-winner', 'destroy-predecessor']);
    await lifecycle.destroy();
  });

  it('mounts the latest state and layout received while the lazy module is loading', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const moduleLoad = deferred<BattleConsoleMountModule>();
    const observed: Array<{ state: BattleConsolePresentationState; mode: string }> = [];
    const lifecycle = createBattleConsoleLifecycle({ loadMount: () => moduleLoad.promise });
    const entering = lifecycle.enter(request(semanticHost, pixiHost));
    const latestState: BattleConsolePresentationState = {
      ...state,
      ballistics: { ...state.ballistics, angle: 73 },
      fireControl: { ...state.fireControl, status: 'Target acquired' },
    };

    lifecycle.update(latestState, projectResponsiveLayout('compact', 2));
    moduleLoad.resolve({
      async mountBattleConsoleGeneration(options) {
        observed.push({ state: options.initialState, mode: options.layout.mode });
        return {
          generation: options.generationToken.generation,
          status: 'ready',
          snapshot: () => options.generationToken.resources.snapshot(),
          update() {},
          async destroy() { return options.generationToken.resources.close(); },
        };
      },
    });

    await expect(entering).resolves.toMatchObject({ committed: true, status: 'ready' });
    expect(observed).toEqual([{ state: latestState, mode: 'compact' }]);
    await lifecycle.destroy();
  });

  it('replays the latest state and layout received after semantic publication but before handle admission', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const updates: Array<{ state: BattleConsolePresentationState; mode: string }> = [];
    const lifecycle = createBattleConsoleLifecycle({ loadMount: async () => ({
      mountBattleConsoleGeneration(options) {
        options.semanticHost.textContent = `${options.initialState.ballistics.angle}/${options.layout.mode}/${options.initialState.fireControl.status}`;
        const mounted: BattleConsoleMountedGeneration = {
          generation: options.generationToken.generation,
          status: 'ready',
          snapshot: () => options.generationToken.resources.snapshot(),
          update(nextState, nextLayout) {
            updates.push({ state: nextState, mode: nextLayout.mode });
            options.semanticHost.textContent = `${nextState.ballistics.angle}/${nextLayout.mode}/${nextState.fireControl.status}`;
          },
          async destroy() {
            options.semanticHost.replaceChildren();
            return options.generationToken.resources.close();
          },
        };
        return Promise.resolve(mounted);
      },
    }) });
    const entering = lifecycle.enter(request(semanticHost, pixiHost));
    for (let index = 0; index < 10 && semanticHost.textContent === ''; index++) {
      await Promise.resolve();
    }
    expect(semanticHost.textContent).toBe('45/wide/Fire ready');
    expect(lifecycle.snapshot().status).toBe('loading');

    const latestState: BattleConsolePresentationState = {
      ...state,
      ballistics: { ...state.ballistics, angle: 73 },
      fireControl: { ...state.fireControl, status: 'Target acquired' },
    };
    lifecycle.update(latestState, projectResponsiveLayout('compact', 2));

    await expect(entering).resolves.toMatchObject({ committed: true, status: 'ready' });
    expect(updates).toEqual([{ state: latestState, mode: 'compact' }]);
    expect(semanticHost.textContent).toBe('73/compact/Target acquired');
    await lifecycle.destroy();
  });

  it('does not invoke a mount module that resolves after its generation was destroyed', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    semanticHost.textContent = 'legacy console remains available';
    const moduleLoad = deferred<BattleConsoleMountModule>();
    let mountCount = 0;
    const lifecycle = createBattleConsoleLifecycle({ loadMount: () => moduleLoad.promise });

    const entering = lifecycle.enter(request(semanticHost, pixiHost));
    await Promise.resolve();
    const destroyed = lifecycle.destroy();
    moduleLoad.resolve({
      async mountBattleConsoleGeneration() {
        mountCount += 1;
        throw new Error('a stale generation reached the mount boundary');
      },
    });

    const [entry, resources] = await Promise.all([entering, destroyed]);
    expect(entry).toMatchObject({ committed: false, status: 'destroyed' });
    expect(mountCount).toBe(0);
    expect(semanticHost.textContent).toBe('legacy console remains available');
    expect(resourcesAreZero(resources)).toBe(true);
    expect(lifecycle.snapshot()).toMatchObject({ activeGeneration: null, status: 'destroyed' });
  });

  it('destroys the predecessor to an all-zero vector before committing one restart winner', async () => {
    const semanticHost = document.createElement('div');
    const pixiHost = document.createElement('div');
    const zeroSnapshots: boolean[] = [];
    const module: BattleConsoleMountModule = {
      async mountBattleConsoleGeneration(options) {
        const rootLease = options.generationToken.resources.acquire('preactRoots');
        const marker = document.createElement('div');
        marker.dataset.generation = String(options.generationToken.generation);
        options.semanticHost.replaceChildren(marker);
        let destroyed = false;
        const mounted: BattleConsoleMountedGeneration = {
          generation: options.generationToken.generation,
          status: 'ready',
          snapshot: () => options.generationToken.resources.snapshot(),
          update() {},
          async destroy() {
            if (!destroyed) {
              destroyed = true;
              options.semanticHost.replaceChildren();
              rootLease.release();
            }
            const resources = options.generationToken.resources.close();
            zeroSnapshots.push(resourcesAreZero(resources));
            return resources;
          },
        };
        return mounted;
      },
    };
    const lifecycle = createBattleConsoleLifecycle({ loadMount: async () => module });

    const first = await lifecycle.enter(request(semanticHost, pixiHost));
    const second = await lifecycle.restart(request(semanticHost, pixiHost));

    expect(first).toMatchObject({ committed: true, status: 'ready', generation: 1 });
    expect(second).toMatchObject({ committed: true, status: 'ready', generation: 2 });
    expect(zeroSnapshots).toEqual([true]);
    expect(semanticHost.querySelectorAll('[data-generation]')).toHaveLength(1);
    expect(semanticHost.firstElementChild?.getAttribute('data-generation')).toBe('2');
    expect(lifecycle.snapshot().resources.preactRoots).toBe(1);

    const finalResources = await lifecycle.destroy();
    expect(resourcesAreZero(finalResources)).toBe(true);
    expect(Object.keys(finalResources)).toEqual([...battleConsoleResourceClasses]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountOrientationGate,
  requestLandscapeMode,
  type OrientationLaunchPorts,
} from './OrientationGate';

function deferredPorts(
  fullscreen: () => Promise<void>,
  landscape: () => Promise<void>,
): OrientationLaunchPorts {
  return { requestFullscreen: fullscreen, lockLandscape: landscape };
}

function mountMarkup(): void {
  document.body.innerHTML = `
    <main id="app"><button type="button">Hot Seat</button></main>
    <div id="portrait-warn">
      <button id="portrait-launch" type="button">Enter fullscreen landscape</button>
      <p id="portrait-warn-status" role="status" aria-live="polite">
        Or rotate your device manually.
      </p>
    </div>
  `;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('mobile landscape launch request', () => {
  it('requests fullscreen before landscape and reports the strongest success', async () => {
    const order: string[] = [];
    const result = await requestLandscapeMode(deferredPorts(
      async () => { order.push('fullscreen'); },
      async () => { order.push('landscape'); },
    ));

    expect(result).toBe('locked');
    expect(order).toEqual(['fullscreen', 'landscape']);
  });

  it('reports fullscreen when orientation locking is unavailable', async () => {
    await expect(requestLandscapeMode({ requestFullscreen: async () => undefined }))
      .resolves.toBe('fullscreen');
  });

  it('still attempts landscape when fullscreen is rejected', async () => {
    const lockLandscape = vi.fn(async () => undefined);
    const result = await requestLandscapeMode(deferredPorts(
      async () => { throw new Error('denied'); },
      lockLandscape,
    ));

    expect(result).toBe('locked');
    expect(lockLandscape).toHaveBeenCalledOnce();
  });

  it('absorbs missing and rejecting APIs into an honest manual result', async () => {
    await expect(requestLandscapeMode({})).resolves.toBe('manual');
    await expect(requestLandscapeMode(deferredPorts(
      async () => { throw new Error('fullscreen denied'); },
      async () => { throw new Error('orientation denied'); },
    ))).resolves.toBe('manual');
  });
});

describe('mobile landscape launch DOM', () => {
  it('binds once, exposes busy state, and announces a locked request', async () => {
    mountMarkup();
    let releaseFullscreen!: () => void;
    const fullscreen = new Promise<void>((resolve) => { releaseFullscreen = resolve; });
    const ports = deferredPorts(() => fullscreen, async () => undefined);

    mountOrientationGate(document, ports);
    mountOrientationGate(document, ports);

    const button = document.querySelector<HTMLButtonElement>('#portrait-launch')!;
    const status = document.querySelector<HTMLElement>('#portrait-warn-status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');

    button.click();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toContain('Preparing');

    releaseFullscreen();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(status.textContent).toContain('Landscape requested');
  });

  it('announces fullscreen-only and manual fallbacks without duplicate listeners', async () => {
    mountMarkup();
    const fullscreen = vi.fn(async () => undefined);
    mountOrientationGate(document, { requestFullscreen: fullscreen });
    mountOrientationGate(document, { requestFullscreen: fullscreen });

    document.querySelector<HTMLButtonElement>('#portrait-launch')!.click();
    await vi.waitFor(() => expect(fullscreen).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('#portrait-warn-status')?.textContent)
      .toContain('Fullscreen is ready'));

    mountMarkup();
    mountOrientationGate(document, {});
    document.querySelector<HTMLButtonElement>('#portrait-launch')!.click();
    await vi.waitFor(() => expect(document.querySelector('#portrait-warn-status')?.textContent)
      .toContain('keeps orientation manual'));
  });
});

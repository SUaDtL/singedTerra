import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountOrientationGate,
  requestLandscapeMode,
  type OrientationLaunchPorts,
} from './OrientationGate';
import {
  ApplicationSurfaceController,
  type ApplicationSurfaceState,
} from './ApplicationSurface';

const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 480px)';

function deferredPorts(
  fullscreen: () => Promise<void>,
  landscape: () => Promise<void>,
): OrientationLaunchPorts {
  return { requestFullscreen: fullscreen, lockLandscape: landscape };
}

function mountMarkup(
  surface: ApplicationSurfaceState = 'battle',
): ApplicationSurfaceController {
  document.body.innerHTML = `
    <style>#portrait-warn { display: flex; }</style>
    <main id="app"><button type="button">Hot Seat</button></main>
    <section id="lobby">
      <button id="prepare-battle" type="button">Prepare battle</button>
      <button id="exact-prepare-target" type="button">Resume preparation</button>
    </section>
    <div id="portrait-warn">
      <button id="portrait-launch" type="button">Enter fullscreen landscape</button>
      <p id="portrait-warn-status" role="status" aria-live="polite">
        Or rotate your device manually.
      </p>
    </div>
  `;
  return new ApplicationSurfaceController({
    battle: document.querySelector<HTMLElement>('#app')!,
    pregame: document.querySelector<HTMLElement>('#lobby')!,
  }, surface);
}

function mockPhonePortrait(): ReturnType<typeof vi.fn> {
  const matchMedia = vi.fn((query: string) => ({
    matches: query === PHONE_PORTRAIT_QUERY,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return matchMedia;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  it('keeps portrait preparation usable while preserving the inclusive phone query', () => {
    mountMarkup('pregame');
    const matchMedia = mockPhonePortrait();
    const prepare = document.querySelector<HTMLButtonElement>('#prepare-battle')!;
    const prepared = vi.fn();
    prepare.addEventListener('click', prepared);

    mountOrientationGate(document, {});

    const gate = document.querySelector<HTMLElement>('#portrait-warn')!;
    const lobby = document.querySelector<HTMLElement>('#lobby')!;
    expect(matchMedia).toHaveBeenCalledWith(PHONE_PORTRAIT_QUERY);
    expect(gate.hidden).toBe(true);
    expect(getComputedStyle(gate).display).toBe('none');
    expect(gate.inert).toBe(true);
    expect(gate.getAttribute('aria-hidden')).toBe('true');
    expect(lobby.inert).toBe(false);
    expect(lobby.hasAttribute('aria-hidden')).toBe(false);

    prepare.click();
    expect(prepared).toHaveBeenCalledOnce();
  });

  it('activates the portrait gate for launching and battle surface states', async () => {
    const surfaces = mountMarkup('pregame');
    mockPhonePortrait();
    mountOrientationGate(document, {});

    const app = document.querySelector<HTMLElement>('#app')!;
    const gate = document.querySelector<HTMLElement>('#portrait-warn')!;

    surfaces.setState('launching');
    await vi.waitFor(() => expect(gate.hidden).toBe(false));
    expect(gate.inert).toBe(false);
    expect(gate.getAttribute('aria-hidden')).toBe('false');
    expect(app.inert).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');

    surfaces.setState('battle');
    await vi.waitFor(() => expect(gate.hidden).toBe(false));
    expect(gate.inert).toBe(false);
    expect(gate.getAttribute('aria-hidden')).toBe('false');
    expect(app.inert).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');

    surfaces.setState('pregame');
    await vi.waitFor(() => expect(gate.hidden).toBe(true));
    expect(gate.inert).toBe(true);
    expect(gate.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not replace exact pregame focus when a gated battle returns to preparation', async () => {
    const surfaces = mountMarkup('battle');
    mockPhonePortrait();
    mountOrientationGate(document, {});

    const exactTarget = document.querySelector<HTMLButtonElement>('#exact-prepare-target')!;
    surfaces.setState('pregame');
    exactTarget.focus();

    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('#portrait-warn')!.hidden)
      .toBe(true));
    expect(document.activeElement).toBe(exactTarget);
  });

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

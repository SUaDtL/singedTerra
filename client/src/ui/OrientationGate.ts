export type OrientationLaunchResult = 'locked' | 'fullscreen' | 'manual';

export interface OrientationLaunchPorts {
  requestFullscreen?: () => Promise<void>;
  lockLandscape?: () => Promise<void>;
}

const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 480px)';
const APP_FOCUSABLE = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export async function requestLandscapeMode(
  ports: OrientationLaunchPorts,
): Promise<OrientationLaunchResult> {
  let fullscreen = false;
  let locked = false;

  if (ports.requestFullscreen) {
    try {
      await ports.requestFullscreen();
      fullscreen = true;
    } catch {
      // Fullscreen is optional. Some browsers still permit orientation lock.
    }
  }

  if (ports.lockLandscape) {
    try {
      await ports.lockLandscape();
      locked = true;
    } catch {
      // Exposed orientation APIs may reject outside installed/PWA mode.
    }
  }

  if (locked) return 'locked';
  if (fullscreen) return 'fullscreen';
  return 'manual';
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

function browserPorts(root: Document): OrientationLaunchPorts {
  const rootElement = root.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
  };
  const requestFullscreen = typeof rootElement.requestFullscreen === 'function'
    ? () => rootElement.requestFullscreen!()
    : undefined;
  const orientation = root.defaultView?.screen.orientation as LockableOrientation | undefined;
  const lockLandscape = typeof orientation?.lock === 'function'
    ? () => orientation.lock!('landscape')
    : undefined;

  return {
    ...(requestFullscreen ? { requestFullscreen } : {}),
    ...(lockLandscape ? { lockLandscape } : {}),
  };
}

const RESULT_COPY: Readonly<Record<OrientationLaunchResult, string>> = {
  locked: 'Landscape requested. Rotate if your browser needs a nudge.',
  fullscreen: 'Fullscreen is ready — rotate your device to continue.',
  manual: 'Your browser keeps orientation manual — rotate your device to continue.',
};

export function mountOrientationGate(
  root: Document = document,
  ports: OrientationLaunchPorts = browserPorts(root),
): void {
  const app = root.querySelector<HTMLElement>('#app');
  const gate = root.querySelector<HTMLElement>('#portrait-warn');
  const button = root.querySelector<HTMLButtonElement>('#portrait-launch');
  const status = root.querySelector<HTMLElement>('#portrait-warn-status');
  if (!app || !gate || !button || !status || button.dataset['orientationGateBound'] === 'true') return;

  button.dataset['orientationGateBound'] = 'true';
  const view = root.defaultView;
  const media = view?.matchMedia?.(PHONE_PORTRAIT_QUERY);
  let gateReady = false;
  let previousAppFocus: HTMLElement | null = null;
  let splashObserver: MutationObserver | null = null;

  const restoreAppFocus = (): void => {
    const target = previousAppFocus?.isConnected && app.contains(previousAppFocus)
      ? previousAppFocus
      : app.querySelector<HTMLElement>(APP_FOCUSABLE);
    previousAppFocus = null;
    target?.focus({ preventScroll: true });
  };

  const syncGate = (): void => {
    const active = media?.matches ?? false;
    const splashPresent = Boolean(root.getElementById('st-splash'));
    const ready = active && !splashPresent;

    if (active) {
      const focused = root.activeElement;
      if (!previousAppFocus && focused instanceof HTMLElement && app.contains(focused)) {
        previousAppFocus = focused;
      }
      app.inert = true;
      app.setAttribute('aria-hidden', 'true');
    } else {
      splashObserver?.disconnect();
      splashObserver = null;
      app.inert = false;
      app.removeAttribute('aria-hidden');
    }

    gate.inert = !ready;
    gate.setAttribute('aria-hidden', ready ? 'false' : 'true');

    if (active && splashPresent && !splashObserver && view?.MutationObserver) {
      splashObserver = new view.MutationObserver(() => {
        if (root.getElementById('st-splash')) return;
        splashObserver?.disconnect();
        splashObserver = null;
        syncGate();
      });
      splashObserver.observe(root.body, { childList: true });
    }

    if (ready && !gateReady) {
      button.focus({ preventScroll: true });
    } else if (!active && gateReady) {
      restoreAppFocus();
    }
    gateReady = ready;
  };

  gate.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !gateReady) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
  });

  button.addEventListener('click', async () => {
    if (button.disabled || (media && !media.matches)) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'Preparing the landscape battlefield…';

    const result = await requestLandscapeMode(ports);
    status.textContent = RESULT_COPY[result];
    button.disabled = false;
    button.removeAttribute('aria-busy');
  });

  media?.addEventListener('change', syncGate);
  syncGate();
}

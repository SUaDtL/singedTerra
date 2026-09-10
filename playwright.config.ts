import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser rendering-guardrail suite.
 *
 * These tests exist because a HUD layout regression (the instrument cluster
 * flex-crushed to ~10.6px tall, clipping its contents) shipped to production and
 * survived jsdom unit tests, isolated CSS harnesses, and grepping the bundle —
 * because none of those observe COMPUTED LAYOUT in a real browser. Every
 * assertion here reads geometry from a live Chromium (boundingBox / getComputedStyle),
 * never mere DOM presence.
 *
 * Two modes, selected by env:
 *   - Local / CI (default): build the PRODUCTION bundle and serve `client/dist`
 *     via `vite preview`, then run the layout specs against it across the viewport
 *     matrix. Dev-mode CSS can differ from prod, so we deliberately test the built
 *     artifact.
 *   - External artifact (E2E_LIVE_URL set): point baseURL at an already-served
 *     candidate or deployed site, with no build or local webServer.
 */
const liveURL = process.env['E2E_LIVE_URL'];
const denyExternalNetwork = process.env['E2E_DENY_EXTERNAL_NETWORK'] === '1';
const PORT = 4173;
const requestedBase = process.env['VITE_BASE'] ?? '/';
const trimmedBase = requestedBase.replace(/^\/+|\/+$/g, '');
const localBasePath = trimmedBase === '' ? '/' : `/${trimmedBase}/`;
const localOrigin = `http://localhost:${PORT}`;
const localBaseURL = `${localOrigin}${localBasePath}`;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/product-completion/**', '**/battle-console-integrated/**'],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',

  use: {
    baseURL: liveURL ?? localBaseURL,
    trace: 'on-first-retry',
    // Candidate verification serves the release payload on loopback while its
    // compiled public Supabase origin remains real. Unmocked traffic must fail
    // closed instead of reaching that backend; Playwright route fixtures still
    // fulfill their matching requests before the proxy is consulted.
    proxy: denyExternalNetwork
      ? { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' }
      : undefined,
  },

  // Local runs skip the @live smoke (it targets the deployed URL); the live smoke
  // run selects it explicitly (workflow passes `--grep @live --project=pixel-touch`).
  grepInvert: liveURL ? undefined : /@live/,

  // Build + serve the PRODUCTION bundle so tests observe prod CSS, not dev mode.
  // Omitted for the live-smoke run (it drives the already-deployed site).
  webServer: liveURL
    ? undefined
    : {
        command: `npm run build && npm -w @singedterra/client run preview -- --port ${PORT} --strictPort`,
        url: localBaseURL,
        env: {
          VITE_SUPABASE_URL: localOrigin,
          VITE_SUPABASE_ANON_KEY: 'e2e-public-anon-key',
        },
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },

  projects: [
    // Roomy desktop window: not compact; the transient arsenal drawer still
    // starts closed so the fitted combat rail presents one stable hierarchy.
    {
      name: 'desktop-fine',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
      },
    },
    // Phone in LANDSCAPE (the game blocks portrait via #portrait-warn). Coarse
    // pointer + touch + small viewport => #app.is-compact with strengthened gauges.
    // This is the viewport where the flex-crush regression actually reproduces
    // (the touch strip pushes #hud content past the panel height).
    {
      name: 'pixel-touch',
      use: {
        ...devices['Pixel 5 landscape'],
      },
    },
    // Small FINE-pointer desktop window — also below the compact threshold.
    // The drawer starts closed and must stay in-bounds when opened.
    {
      name: 'small-window',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 520 },
      },
    },
  ],
});

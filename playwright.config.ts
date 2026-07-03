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
 *   - Live smoke (E2E_LIVE_URL set): point baseURL at the deployed site and run
 *     ONLY the @live-tagged subset (post-deploy guard, no local server).
 */
const liveURL = process.env['E2E_LIVE_URL'];
const PORT = 4173;
const localBaseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',

  use: {
    baseURL: liveURL ?? localBaseURL,
    trace: 'on-first-retry',
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
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },

  projects: [
    // Roomy desktop window: not compact — expects the analog dials (gauge-row).
    {
      name: 'desktop-fine',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
      },
    },
    // Phone in LANDSCAPE (the game blocks portrait via #portrait-warn). Coarse
    // pointer + touch + small viewport => #app.is-compact => numeric readouts.
    // This is the viewport where the flex-crush regression actually reproduces
    // (the touch strip pushes #hud content past the panel height).
    {
      name: 'pixel-touch',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 915, height: 412 },
        hasTouch: true,
        isMobile: true,
      },
    },
    // Small FINE-pointer desktop window — also below the compact threshold, so it
    // exercises the numeric-readout path without touch. Guards the "small remote
    // window" case the compact swap was built for.
    {
      name: 'small-window',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 520 },
      },
    },
  ],
});

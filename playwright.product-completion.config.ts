import { defineConfig } from '@playwright/test';

// Local checks reuse the sole preview; CI owns a production preview for this suite.
const externalURL = process.env['E2E_LIVE_URL'];
const denyExternalNetwork = process.env['E2E_DENY_EXTERNAL_NETWORK'] === '1';

export default defineConfig({
  testDir: 'e2e/product-completion',
  forbidOnly: !!process.env['CI'],
  outputDir: 'test-results/product-completion',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: externalURL ?? (process.env['CI'] ? 'http://127.0.0.1:4173/' : 'http://127.0.0.1:5198/'),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    proxy: denyExternalNetwork
      ? { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' }
      : undefined,
  },
  webServer: externalURL ? undefined : process.env['CI'] ? {
    command: 'npm run build && npm -w @singedterra/client run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    timeout: 180_000,
  } : undefined,
  projects: [
    { name: 'ultrawide', use: { viewport: { width: 3436, height: 1215 } } },
    { name: 'wide', use: { viewport: { width: 2048, height: 864 } } },
    { name: 'standard', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'narrow', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'compact', use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
});

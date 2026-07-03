/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Public base path. Defaults to '/' (local dev + root-hosted static). GitHub Pages
// serves a PROJECT site under /<repo>/, so the deploy workflow sets VITE_BASE to
// "/<repo>/" — Vite then prefixes every emitted asset URL with it. Any static host
// at the domain root works with the '/' default.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  // Vitest config (client unit tests). jsdom gives Lobby/HUD DOM code + fetch-using
  // network code a test seam the tsx `.mjs` harnesses can't reach (those cover the
  // pure engine + pure client helpers). Coverage is v8; thresholds are enforced
  // per-refactor-surface by /ca:refactor, not globally here.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});

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
      // The coverage DENOMINATOR is testable logic only. The excludes below are code a
      // unit test cannot assert on without turning into draw-call theater (asserting on a
      // mocked CanvasRenderingContext2D / AudioContext) or that carries no logic at all:
      //   - Canvas rendering (renderer/*Renderer.ts, renderer/*Fx.ts): pure 2D drawing,
      //     verified by eye + Playwright, not by unit tests.
      //   - audio/AudioEngine.ts: WebAudio side-effects; jsdom has no AudioContext.
      //   - main.ts: DOM bootstrap / wiring (integration glue, not a unit).
      //   - lib/SupabaseTypes.ts, client/GameClient.ts: type-only (interfaces, no runtime).
      // Pure logic that happens to live under renderer/ (strata, ringBuffer, audioEdges)
      // and theme.ts's color math STAY in the denominator — they are genuinely testable.
      // Rationale/decision: .codearbiter/CONTEXT.md (stage-1 coverage note, 2026-07-03).
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/main.ts',
        'src/lib/SupabaseTypes.ts',
        'src/client/GameClient.ts',
        'src/audio/AudioEngine.ts',
        'src/renderer/Renderer.ts',
        'src/renderer/EffectsRenderer.ts',
        'src/renderer/TerrainRenderer.ts',
        'src/renderer/TankRenderer.ts',
        'src/renderer/ProjectileRenderer.ts',
        'src/renderer/HUDRenderer.ts',
        'src/renderer/explosionFx.ts',
        'src/renderer/tankFx.ts',
      ],
    },
  },
});

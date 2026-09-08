/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Public base path. Defaults to '/' (local dev + root-hosted static). GitHub Pages
// serves a PROJECT site under /<repo>/, so the deploy workflow sets VITE_BASE to
// "/<repo>/" — Vite then prefixes every emitted asset URL with it. Any static host
// at the domain root works with the '/' default.
const base = process.env.VITE_BASE || '/';
const projectRoot = resolve(__dirname, '..');

function canonicalModuleId(id: string): string {
  const normalized = id.replaceAll('\\', '/').replace(/^\0/u, 'virtual:');
  const queryIndex = normalized.indexOf('?');
  const clean = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  const nodeModulesMarker = '/node_modules/';
  const nodeModulesIndex = clean.lastIndexOf(nodeModulesMarker);
  if (nodeModulesIndex >= 0) {
    return `node_modules/${clean.slice(nodeModulesIndex + nodeModulesMarker.length)}`;
  }

  const projectRelative = relative(projectRoot, clean).replaceAll('\\', '/');
  return projectRelative.startsWith('../') ? clean : projectRelative;
}

function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex').toUpperCase();
}

function browserBundleGraph(): Plugin {
  let resolvedBase = base;
  return {
    name: 'singedterra-browser-bundle-graph',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      resolvedBase = config.base;
    },
    writeBundle: {
      order: 'post',
      async handler(options, bundle) {
        if (!options.dir) throw new Error('browser bundle graph requires a directory output');
        const emittedSha256 = async (fileName: string) => sha256(await readFile(join(options.dir!, ...fileName.split('/'))));
        const chunks = await Promise.all(Object.values(bundle)
          .filter((output): output is Extract<typeof output, { type: 'chunk' }> => output.type === 'chunk')
          .map(async (chunk) => {
            const metadata = chunk.viteMetadata as
              | { importedAssets?: Set<string>; importedCss?: Set<string> }
              | undefined;
            return {
              fileName: chunk.fileName,
              sha256: await emittedSha256(chunk.fileName),
              isEntry: chunk.isEntry,
              isDynamicEntry: chunk.isDynamicEntry,
              facadeModuleId: chunk.facadeModuleId ? canonicalModuleId(chunk.facadeModuleId) : null,
              imports: [...chunk.imports].sort(),
              dynamicImports: [...chunk.dynamicImports].sort(),
              importedCss: [...(metadata?.importedCss ?? [])].sort(),
              importedAssets: [...(metadata?.importedAssets ?? [])].sort(),
              modules: Object.keys(chunk.modules).map(canonicalModuleId).sort(),
            };
          }));
        chunks.sort((left, right) => left.fileName.localeCompare(right.fileName));

        const assets = await Promise.all(Object.values(bundle)
          .filter((output): output is Extract<typeof output, { type: 'asset' }> => output.type === 'asset')
          .map(async (asset) => ({
            fileName: asset.fileName,
            sha256: await emittedSha256(asset.fileName),
          })));
        assets.sort((left, right) => left.fileName.localeCompare(right.fileName));

        await writeFile(join(options.dir, 'battle-console-bundle-graph.json'), `${JSON.stringify({
          schema: 'singedterra-browser-bundle-graph/v1',
          base: resolvedBase,
          chunks,
          assets,
        }, null, 2)}\n`);
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [browserBundleGraph()],
  // Vite 8's Oxc dev transform defaults TSX to react/jsx-dev-runtime and does
  // not inherit TypeScript's jsxImportSource at this boundary. Pin both serve
  // and build transforms to the Preact automatic runtime explicitly.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'preact',
    },
  },
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
    include: ['src/**/*.test.{ts,tsx}'],
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
        'src/**/*.test.{ts,tsx}',
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

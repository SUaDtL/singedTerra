import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const BUILD_EMITTED_CSS = String.raw`
  import { build } from 'vite';
  import { resolve } from 'node:path';
  const result = await build({
    configFile: false,
    root: process.cwd(),
    logLevel: 'silent',
    build: {
      write: false,
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      rollupOptions: {
        input: resolve(process.cwd(), 'src/ui/battleConsole/mount.tsx'),
        external: ['pixi.js'],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output ?? []);
  const asset = outputs.find((output) =>
    output.type === 'asset' && output.fileName.endsWith('.css'));
  if (!asset) throw new Error('Vite did not emit a CSS asset');
  process.stdout.write(typeof asset.source === 'string'
    ? asset.source
    : new TextDecoder().decode(asset.source));
`;

describe('P-07 emitted CSS contract', () => {
  it('keeps semantic selectors under generated module scope and preserves compact hit clearance', async () => {
    // Running Vite in Vitest's worker can deadlock its shared transform pipeline.
    // A child process preserves the emitted-bundle assertion without sharing that state.
    const css = execFileSync(process.execPath, ['--input-type=module', '-e', BUILD_EMITTED_CSS], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const semanticSelectors = [...css.matchAll(/([^{}]+\[data-semantic-key[^{}]+)\{/g)]
      .map((match) => match[1]?.trim())
      .filter((selector): selector is string => Boolean(selector));

    expect(semanticSelectors.length).toBeGreaterThan(0);
    expect(semanticSelectors.every((selector) => /\._root_[\w-]+/.test(selector))).toBe(true);
    expect(semanticSelectors.every((selector) => /\._semanticNode_[\w-]+/.test(selector))).toBe(true);
    expect(css).not.toContain(':global');
    expect(css).not.toContain('st-hud__');
    expect(css).toContain('font-family:var(--font-display)');

    const semanticBaseRule = css.match(/\._semanticNode_[\w-]+\{([^}]*)\}/)?.[1] ?? '';
    expect(semanticBaseRule).toMatch(/color:(?:transparent|#0000)/);

    const rootRule = css.match(/\._root_[\w-]+\{([^}]*)\}/)?.[1] ?? '';
    expect(rootRule).toContain('pointer-events:auto');

    const inlineSemanticRule = css.match(
      /\._root_[\w-]+ \._semanticNode_[\w-]+:is\(span,output,img,kbd,strong\)\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(inlineSemanticRule).toContain('overflow:visible');

    const shortcutRule = css.match(
      /button\._semanticNode_[\w-]+>kbd\._semanticNode_[\w-]+\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(shortcutRule).toContain('clip-path:inset(50%)');

    const hiddenRule = css.match(
      /\._root_[\w-]+ \._semanticNode_[\w-]+\[hidden\]\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(hiddenRule).toContain('display:none!important');

    const readyPortraitRule = css.match(
      /data-battle-console-state=ready[^{}]+data-battle-console-portrait[^{}]*\{([^}]*)\}/,
    )?.[1] ?? '';
    // The live commander canvas must remain visible after the inert atlas loads.
    expect(readyPortraitRule).not.toContain('display:none');

    const readyStaticIconRule = css.match(
      /data-battle-console-state=ready[^{}]+data-semantic-key="command-console-host::settings-trigger"[^{}]*\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(readyStaticIconRule).toMatch(/color:(?:transparent|#0000)/);

    const healthTextRule = css.match(
      /data-semantic-key="node:span:100 health remaining:11"\]\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(healthTextRule).toContain('display:flex');
    expect(healthTextRule).toContain('align-items:center');
    expect(healthTextRule).toContain('justify-content:center');
    expect(healthTextRule).toContain('line-height:20px');

    const targetRule = css.match(/\._root_[\w-]+ button\._semanticNode_[\w-]+\{([^}]*)\}/)?.[1] ?? '';
    const logicalMinimum = Number(targetRule.match(/min-width:(\d+)px/)?.[1]);
    expect(logicalMinimum).toBeGreaterThan(0);
    expect(targetRule).toContain(`min-height:${logicalMinimum}px`);
    expect(logicalMinimum * (240 / 347)).toBeGreaterThanOrEqual(44);
  });
});

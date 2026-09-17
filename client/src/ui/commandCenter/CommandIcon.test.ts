import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCommandIcon } from './CommandIcon';

const EXPECTED_COMMAND_CENTER_ASSET_SHA256 = Object.freeze({
  'chrome/button-disabled-frame.png': 'a652aee4f74e879c8d8969082edd71d4fe75f410c0d201ae5fdb91936245a230',
  'chrome/button-frame.png': '924c3501f1ee670b1d33587ec01e84db692c5e964a254ccb81b530b5278cfb3d',
  'chrome/button-gold-frame.png': '9346bfb1e797d856b78c1dee04ace82a0b0a041c1f50717257951c48afb34155',
  'chrome/button-hover-frame.png': '74b71491459d38651cb317994bfc36f3dc8fcc793a34c1f869f8753982baf2f0',
  'chrome/button-pressed-frame.png': '8705ced5066fc4d385f3f0fdcdc34e2418c183e05c3cc37dd02ef6c8616e3f78',
  'chrome/button-selected-frame.png': '264aeeed9f5b806e806fde877e33368702cbc379e8ec2bbd68c8e0e26bb8a038',
  'chrome/gold-tile.png': '4df02beb2e87c021df11094c565461f807c4f6042de022d7bf620a66429ee7d4',
  'chrome/iron-tile.png': '038e6a3799f64531a017438ed9e2d186895ffe9a16c8efced3042c64e16548ab',
  'chrome/map-tile.png': '338911943a925577b37d09f684655b3b8509a634b5294c719255454f8355da04',
  'chrome/panel-frame.png': '12a044bff266245dd7890c350a0bde31362d4219762c49db6d98ab6dc41094e8',
  'icons/sprite.svg': 'b286fc85c285c01da5c0b7e9e6e4b1945508afa5d892e0ac9b341bdca21e044c',
});

function assetPath(relativePath: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'assets', relativePath);
}

describe('command center admitted assets', () => {
  it('preserves the exact manifest bytes for only the approved chrome and sprite subset', async () => {
    const assetRoot = assetPath('');
    const installedPaths = (await readdir(assetRoot, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => relative(assetRoot, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
      .sort();
    const actual = await Promise.all(Object.entries(EXPECTED_COMMAND_CENTER_ASSET_SHA256)
      .map(async ([relativePath, expected]) => {
        const bytes = await readFile(assetPath(relativePath));
        return [relativePath, createHash('sha256').update(bytes).digest('hex'), expected] as const;
      }));

    expect(installedPaths).toEqual(Object.keys(EXPECTED_COMMAND_CENTER_ASSET_SHA256).sort());
    expect(actual.map(([relativePath, digest]) => [relativePath, digest])).toEqual(
      actual.map(([relativePath, , expected]) => [relativePath, expected]),
    );
  });

  it('keeps the admitted sprite free of executable, embedded, textual, and external content', async () => {
    const source = await readFile(assetPath('icons/sprite.svg'), 'utf8');

    expect(source).not.toMatch(/<script\b|<foreignObject\b|<image\b|<text\b/iu);
    expect(source).not.toMatch(/\son[a-z]+\s*=/iu);
    expect(source).not.toMatch(/(?:\b(?:xlink:)?href|\bsrc)\s*=|\burl\s*\(|@import\b/iu);
    expect([...source.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      'stc-campaign',
      'stc-duel',
      'stc-local',
      'stc-online',
      'stc-settings',
      'stc-dossier',
      'stc-shell',
      'stc-cluster',
      'stc-flame',
      'stc-drill',
      'stc-shield',
      'stc-supplies',
      'stc-lock',
      'stc-check',
      'stc-back',
      'stc-arrow',
      'stc-menu',
      'stc-close',
      'stc-repair',
      'stc-info',
    ]);
  });
});

describe('CommandIcon', () => {
  it('renders a decorative sprite glyph while missing sprite or symbol data emits no glyph', () => {
    const icon = createCommandIcon('campaigns', { spriteHref: '/command-icons.svg' });
    const missingSprite = createCommandIcon('campaigns', { spriteHref: null });
    const missingSymbol = createCommandIcon('unknown', { spriteHref: '/command-icons.svg' });

    expect(icon).toBeInstanceOf(SVGSVGElement);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('focusable')).toBe('false');
    expect(icon?.hasAttribute('aria-label')).toBe(false);
    expect(icon?.querySelector('title')).toBeNull();
    expect(icon?.querySelector('use')?.getAttribute('href')).toBe('/command-icons.svg#stc-campaign');
    expect(missingSprite).toBeNull();
    expect(missingSymbol).toBeNull();
  });
});

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

interface RetirementSourceRecord {
  readonly file?: string;
  readonly text?: string;
}

interface RetirementRecord {
  readonly category: string;
  readonly disposition: 'retain' | 'retire' | 'replace';
  readonly sourceName?: string | null;
  readonly sourceRecord?: RetirementSourceRecord | null;
}

interface RetirementContract {
  readonly records: readonly RetirementRecord[];
}

const invocationRoot = process.cwd();
const repositoryRoot = existsSync(resolve(invocationRoot, '.codearbiter'))
  ? invocationRoot
  : resolve(invocationRoot, '..');

const contract = readBattleConsoleContract('ownership/retirement.json') as RetirementContract;
const hudPath = 'client/src/ui/HUD.ts';
const hudSource = readFileSync(resolve(repositoryRoot, hudPath), 'utf8');
const hudFile = ts.createSourceFile(hudPath, hudSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const hudClass = hudFile.statements.find(ts.isClassDeclaration);
const hudMembers = new Set(
  hudClass?.members.flatMap((member) => {
    const name = member.name;
    return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? [name.text] : [];
  }) ?? [],
);
const retiredMemberNames = new Set(
  contract.records
    .filter((record) => record.disposition !== 'retain')
    .map((record) => record.sourceName)
    .filter((name): name is string => Boolean(name)),
);

const exactSourceCategories = new Set([
  'behaviorSelectorPaths',
  'eventRegistrations',
  'legacyAssets',
  'legacyClassKeyedRoutes',
  'rawDomCaches',
]);

function legacyClassTokens(source: string, selectorOnly = false): Set<string> {
  const searchable = selectorOnly ? source.replace(/\/\*[\s\S]*?\*\//g, '') : source;
  const pattern = selectorOnly
    ? /\.((?:st-hud|st-ui|st-weapon)[A-Za-z0-9_-]*)/g
    : /\b((?:st-hud|st-ui|st-weapon)[A-Za-z0-9_-]*)/g;
  return new Set([...searchable.matchAll(pattern)].map((match) => match[1]!));
}

const cssMember = hudClass?.members.find((member) => {
  const name = member.name;
  return name && ts.isIdentifier(name) && name.text === 'CSS';
});
const cssInitializer = cssMember && ts.isPropertyDeclaration(cssMember)
  ? cssMember.initializer
  : undefined;
const embeddedCss = cssInitializer && ts.isNoSubstitutionTemplateLiteral(cssInitializer)
  ? cssInitializer.text
  : '';
const hudWithoutEmbeddedCss = cssMember
  ? `${hudSource.slice(0, cssMember.getFullStart())}${hudSource.slice(cssMember.end)}`
  : hudSource;
const helperSources = ['client/src/ui/hudIcons.ts', 'client/src/ui/weaponIcons.ts']
  .map((path) => readFileSync(resolve(repositoryRoot, path), 'utf8'))
  .join('\n');
const liveLegacyClasses = legacyClassTokens(`${hudWithoutEmbeddedCss}\n${helperSources}`);
const retiredProductAssets = [
  'battle-armory-frame-v2.webp',
  'battle-armory-frame-ultrawide-v3.webp',
  'battle-command-menu-frame-v2.webp',
  'battle-console-chassis-v2.webp',
  'battle-console-compact-v3.png',
  'battle-console-plate.webp',
  'battle-console-ultrawide-underlay-v8.png',
  'battle-first-salvo-frame-v2.webp',
  'battle-match-frame-v2.webp',
  'battle-settings-frame-v2.webp',
  'battle-victory-frame-v2.webp',
] as const;

describe('P-09 physical retirement closure', () => {
  it('removes every terminal legacy HUD member named by the locked manifest', () => {
    const remaining = contract.records
      .filter((record) => record.disposition !== 'retain')
      .filter((record) => record.sourceRecord?.file === hudPath)
      .map((record) => record.sourceName)
      .filter((name): name is string => Boolean(name))
      .filter((name) => hudMembers.has(name));

    expect([...new Set(remaining)].sort()).toEqual([]);
  });

  it('removes exact retired fields, caches, listeners, routes, and legacy assets', () => {
    const remaining = contract.records
      .filter((record) => record.disposition !== 'retain')
      .filter((record) => record.sourceRecord?.file === hudPath)
      .filter((record) => exactSourceCategories.has(record.category))
      // Raw fields and generic listener lines also back the explicitly retained
      // match ledger, liveness, round shop, and after-action owners. Close only
      // records attached to a terminal in-scope member, plus legacy asset paths.
      .filter((record) => record.category === 'legacyAssets'
        || (record.sourceName !== null
          && record.sourceName !== undefined
          && retiredMemberNames.has(record.sourceName)))
      .map((record) => record.sourceRecord?.text?.trim())
      .filter((text): text is string => Boolean(text))
      .filter((text) => hudSource.includes(text));

    expect([...new Set(remaining)].sort()).toEqual([]);
  });

  it('removes the predecessor battleHud compositor instead of leaving a second mountable owner', () => {
    const predecessorRoot = resolve(repositoryRoot, 'client/src/ui/battleHud');
    expect(existsSync(predecessorRoot) ? readdirSync(predecessorRoot) : []).toEqual([]);
    expect(hudSource).not.toContain("from './battleHud'");
  });

  it('removes embedded and global selectors that target no retained HUD node', () => {
    const globalCss = readFileSync(resolve(repositoryRoot, 'client/src/style.css'), 'utf8');
    const deadEmbedded = [...legacyClassTokens(embeddedCss, true)]
      .filter((className) => !liveLegacyClasses.has(className));
    const deadGlobal = [...legacyClassTokens(globalCss, true)]
      .filter((className) => !liveLegacyClasses.has(className));

    expect(deadEmbedded.sort()).toEqual([]);
    expect(deadGlobal.sort()).toEqual([]);
    expect(embeddedCss).not.toContain('#battle-rail');
    expect(globalCss).not.toMatch(/#battle-rail\s+(?:[.#\[]|[a-z])/i);
  });

  it('keeps retired public asset routes absent from the shipping product', () => {
    const indexSource = readFileSync(resolve(repositoryRoot, 'client/index.html'), 'utf8');
    for (const asset of retiredProductAssets) {
      expect(existsSync(resolve(repositoryRoot, 'client/public', asset))).toBe(false);
      expect(indexSource).not.toContain(asset);
      expect(hudSource).not.toContain(asset);
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandCenterCss = readFileSync(
  join(process.cwd(), 'src/ui/commandCenter/CommandCenter.css'),
  'utf8',
);
const lobbySource = readFileSync(join(process.cwd(), 'src/ui/Lobby.ts'), 'utf8');
const lobbyShellSource = readFileSync(join(process.cwd(), 'src/ui/LobbyShellView.ts'), 'utf8');
const lobbyHotSeatSource = readFileSync(join(process.cwd(), 'src/ui/LobbyHotSeatView.ts'), 'utf8');
const lobbyCss = readFileSync(join(process.cwd(), 'src/ui/Lobby.css'), 'utf8');
const lobbyConsoleCss = readFileSync(join(process.cwd(), 'src/ui/LobbyConsole.css'), 'utf8');
const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
const e2eSupportSource = readFileSync(join(process.cwd(), '../e2e/support.ts'), 'utf8');
const verifiedDeploymentE2eSource = readFileSync(
  join(process.cwd(), '../e2e/verified-deployment.spec.ts'),
  'utf8',
);

describe('command center visual contract', () => {
  it('owns one framed shell with admitted chrome assets and no battle-console selectors', () => {
    expect(commandCenterCss).toMatch(/\.command-center\s*\{/);
    expect(commandCenterCss).toContain('panel-frame.png');
    expect(commandCenterCss).toContain('iron-tile.png');
    expect(commandCenterCss).toContain('gold-tile.png');
    expect(commandCenterCss).toContain('button-frame.png');
    expect(commandCenterCss).toContain('button-selected-frame.png');
    expect(commandCenterCss).not.toMatch(/#(?:app|hud|battle-rail)\b|\.st-battle/);
  });

  it('nine-slices ornamental frames instead of stretching whole raster borders', () => {
    expect(commandCenterCss).toContain('border-image-slice: 16 fill');
    expect(commandCenterCss).toContain('border-image-slice: 22 fill');
    expect(commandCenterCss).toContain('border-image-width: 12px');
    expect(commandCenterCss).toContain('border-image-width: 10px');
    expect(commandCenterCss).not.toMatch(
      /background-image:\s*(?:\r?\n\s*)?var\(--command-(?:panel|button)[^;]+background-size:\s*100%\s+100%/s,
    );
  });

  it('binds every admitted material asset through the runtime style seam', () => {
    const bindings = [
      ['commandPanelFrameUrl', '--command-panel-frame'],
      ['commandIronTileUrl', '--command-iron-tile'],
      ['commandGoldTileUrl', '--command-gold-tile'],
      ['commandMapTileUrl', '--command-map-tile'],
      ['commandButtonFrameUrl', '--command-button-frame'],
      ['commandButtonSelectedFrameUrl', '--command-button-selected-frame'],
      ['commandButtonHoverFrameUrl', '--command-button-hover-frame'],
      ['commandButtonPressedFrameUrl', '--command-button-pressed-frame'],
      ['commandButtonGoldFrameUrl', '--command-button-gold-frame'],
      ['commandButtonDisabledFrameUrl', '--command-button-disabled-frame'],
    ] as const;

    for (const [importName, propertyName] of bindings) {
      expect(lobbySource).toContain(`${propertyName}: url("\${${importName}}")`);
    }
    expect(lobbySource).toContain('style.textContent += `\\n${COMMAND_CENTER_ASSET_CSS}`;');
  });

  it('keeps every command target at least 44px and gives the primary action extra weight', () => {
    expect(commandCenterCss).toMatch(
      /\.command-center\s+(?:button|select|summary)[^{]*\{[^}]*min-height:\s*44px/s,
    );
    expect(commandCenterCss).toMatch(
      /\.command-center__primary-action\s*\{[^}]*min-height:\s*(?:5[6-9]|[6-9]\d)px/s,
    );
    expect(commandCenterCss).not.toMatch(/account-panel__account-trigger\s*\{[^}]*min-height:\s*(?:[0-3]?\d|4[0-3])px/s);
  });

  it('places the masthead and console explicitly instead of inheriting the retired named grid', () => {
    expect(commandCenterCss).toMatch(
      /\.lobby-card:has\(\.command-center\) \.lobby-deployment__masthead\s*\{[^}]*grid-area:\s*auto[^}]*grid-row:\s*1/s,
    );
    expect(commandCenterCss).toMatch(
      /\.command-center\s*\{[^}]*grid-area:\s*auto[^}]*grid-row:\s*2/s,
    );
  });

  it('frames the launcher masthead as one rail with three linked bays', () => {
    expect(commandCenterCss).toMatch(
      /\.lobby-card:has\(\.command-center\) \.lobby-deployment__masthead\s*\{[^}]*border-image-source:\s*var\(--command-panel-frame[^}]*grid-template-columns:/s,
    );
    expect(commandCenterCss).toMatch(
      /\.lobby-command-rail__brand\s*\{[^}]*display:\s*flex[^}]*border-right:/s,
    );
    expect(commandCenterCss).toMatch(
      /\.lobby-command-rail__context\s*\{[^}]*border:\s*0[^}]*border-right:/s,
    );
    expect(commandCenterCss).toMatch(
      /\.lobby-command-rail__dossier\s+\.account-panel__record\s*\{[^}]*border:\s*0[^}]*box-shadow:\s*none/s,
    );
    expect(commandCenterCss).toMatch(
      /\.lobby-command-rail__dossier\s+\.account-panel__career-next\s*\{[^}]*display:\s*none/s,
    );
    expect(commandCenterCss).toMatch(
      /\.lobby-command-rail__dossier\s*>\s*\.account-panel__summary,[\s\S]*?\{[^}]*border:\s*0[^}]*box-shadow:\s*none/s,
    );
  });

  it('keeps all three header roles inside the compact rail instead of hiding the command context', () => {
    expect(commandCenterCss).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.lobby-command-rail__context\s*\{[^}]*display:\s*flex[^}]*grid-column:\s*1\s*\/\s*-1/s,
    );
    expect(commandCenterCss).not.toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.lobby-command-header\s*\{[^}]*display:\s*none/s,
    );
  });

  it('owns bounded scrolling, resilient labels, visible focus, and semantic state colours', () => {
    expect(commandCenterCss).toMatch(
      /\.command-center__workspace-host\s*\{[^}]*overflow-y:\s*auto/s,
    );
    expect(commandCenterCss).toMatch(
      /\.command-center__library-items\s*\{[^}]*overflow-y:\s*auto/s,
    );
    expect(commandCenterCss).toContain('overflow-wrap: anywhere');
    expect(commandCenterCss).toMatch(/:focus-visible\s*\{/);
    expect(commandCenterCss).toContain('--command-success:');
    expect(commandCenterCss).toContain('--command-danger:');
  });

  it('switches rail to the Modes sheet on narrow or portrait screens', () => {
    expect(commandCenterCss).toMatch(
      /@media\s*\([^)]*max-width:[^)]*\)[\s\S]*?\.command-center__category-rail\s*\{[^}]*display:\s*none/s,
    );
    expect(commandCenterCss).toMatch(
      /@media\s*\([^)]*max-width:[^)]*\)[\s\S]*?\.command-center__modes-trigger\s*\{[^}]*display:\s*inline-flex/s,
    );
    expect(commandCenterCss).toMatch(
      /@media\s*\(orientation:\s*portrait\)[\s\S]*?\.command-center__category-rail\s*\{[^}]*display:\s*none/s,
    );
  });

  it('keeps the workspace as the portrait scroll owner and compacts secondary commander facts', () => {
    expect(commandCenterCss).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*?\.lobby-card:has\(\.command-center\)\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(commandCenterCss).toMatch(
      /@media\s*\(max-width:\s*400px\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*?\.account-panel__commander-rank-row[\s\S]*?display:\s*none/s,
    );
  });

  it('provides reduced-motion and forced-colour fallbacks without hiding semantics', () => {
    expect(commandCenterCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(commandCenterCss).toMatch(/@media\s*\(forced-colors:\s*active\)/);
    expect(commandCenterCss).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?forced-color-adjust:\s*auto/s,
    );
  });

  it('is injected after the base lobby materials as the only command-center layer', () => {
    expect(lobbySource).toContain("import commandCenterCss from './commandCenter/CommandCenter.css?raw';");
    expect(lobbySource).toContain('`${lobbyCss}\\n${lobbyConsoleCss}\\n${commandCenterCss}`');
  });

  it('has no superseded chooser, bridge, or positional preparation layer', () => {
    const retiredSelectors = [
      '.lobby-deployment-chooser',
      '.command-center__legacy-skirmish',
      '.command-center__bridge',
      '.lobby-deployment-console',
      '.lobby-quick-operation',
      '.lobby-operation-preview',
      '.lobby-deployment-rail',
      '.lobby-campaign-kit',
      '.lobby-first-salvo',
      '.lobby-seed-challenge',
      '.lobby-deployment__back',
      '.lobby-deployment__mission-brief',
      '.lobby-mode-panel',
      '.lobby-mode-context',
      '.lobby-controls',
      '.lobby-rejoin-banner',
    ];
    for (const selector of retiredSelectors) {
      expect(lobbyShellSource, selector).not.toContain(selector);
      expect(lobbyCss, selector).not.toContain(selector);
      expect(lobbyConsoleCss, selector).not.toContain(selector);
    }
    expect(commandCenterCss).not.toContain('.command-center__legacy-skirmish');
    expect(commandCenterCss).not.toContain('.command-center__bridge');
    expect(lobbySource).not.toContain('createLegacySkirmishCommandView');
    expect(lobbySource).not.toContain("private surface: 'chooser' | 'preparation'");
    expect(lobbySource).not.toContain('.lobby-deployment-chooser');
    expect(lobbyCss).not.toContain('.lobby-deployment-chooser');
    expect(lobbyCss).not.toContain('.lobby-campaign-kit');
  });

  it('has no compatibility preparation router or route-specific shell wrapper', () => {
    for (const retiredSource of [
      'createPreparationBridgeView',
      "private surface: 'chooser' | 'preparation'",
      'private hotSeatSurface',
      'LobbyHotSeatSurface',
      'localWorkspace',
      'verifiedWorkspace',
      'ownedWorkspace',
      'data-hotseat-surface',
      'Hot Seat modes',
      'buildPracticeLane',
      'onSurfaceChange',
    ]) {
      expect(`${lobbySource}\n${lobbyHotSeatSource}`, retiredSource).not.toContain(retiredSource);
    }
    expect(lobbyShellSource).not.toContain('buildLobbyOnlineView');
    expect(lobbySource).not.toContain('buildLobbyOnlineView');
    expect(lobbySource).not.toMatch(/['"]chooser['"]\s*\|\s*['"]preparation['"]/u);
    expect(lobbySource).not.toMatch(/\b(?:private\s+)?hotSeatSurface\s*[:=]/u);
  });

  it('keeps browser journeys on owned command workspaces instead of retired mode routes', () => {
    expect(e2eSupportSource).not.toContain('selectHotSeatTab');
    expect(verifiedDeploymentE2eSource).not.toContain('openLocalBattery');
    expect(verifiedDeploymentE2eSource).not.toContain("mode === 'Practice vs CPU'");
    expect(verifiedDeploymentE2eSource).not.toContain("mode = 'Verified Deployment'");
  });

  it('does not let retired Hot Seat selectors reposition the command shell or header', () => {
    for (const retiredSelector of [
      '.lobby-deployment:has(.lobby-hotseat)',
      '.lobby-tabs',
      '.lobby-tab',
      '.lobby-hotseat-tabs',
      '.lobby-hotseat-tab',
    ]) {
      expect(`${lobbyCss}\n${lobbyConsoleCss}`, retiredSelector).not.toContain(retiredSelector);
    }
    expect(`${lobbyCss}\n${lobbyConsoleCss}`).not.toMatch(
      /\.lobby-deployment:has\(\.lobby-hotseat/u,
    );
  });

  it('keeps outer deployment geometry in the command-center layer only', () => {
    const retiredOuterCss = `${lobbyCss}\n${lobbyConsoleCss}`;
    expect(retiredOuterCss).not.toMatch(
      /#lobby(?:\.is-compact)?\s+\.lobby-deployment(?:\s*\{|::before|__masthead|:has\(|\s*>\s*\.lobby-preview)/u,
    );
    expect(retiredOuterCss).not.toContain('#lobby .lobby-card > .lobby-deployment');
    expect(retiredOuterCss).not.toMatch(
      /#lobby(?:\.is-compact)?\s+\.lobby-command-header(?:\s|__|\{)/u,
    );
    expect(commandCenterCss).toContain(
      '#lobby .lobby-card:has(.command-center) > .lobby-deployment',
    );
    expect(commandCenterCss).toContain(
      '#lobby .lobby-card:has(.command-center) .lobby-deployment__masthead',
    );
  });

  it('projects compact layout ownership onto the unscaled pregame sibling', () => {
    expect(mainSource).toContain("lobbyRoot.classList.toggle('is-compact', s < COMPACT_SCALE)");
    expect(lobbyCss).not.toContain('#app.is-compact #lobby');
    expect(lobbyCss).not.toContain('#app:not(.is-compact) #lobby');
    expect(lobbyConsoleCss).not.toContain('#app.is-compact #lobby');
    expect(lobbyConsoleCss).not.toContain('#app:not(.is-compact) #lobby');
    expect(lobbyCss).not.toMatch(/var\(--st-store-buy-target\)\s*\*/u);
  });
});

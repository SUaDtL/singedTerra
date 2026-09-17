import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandCenterCss = readFileSync(
  join(process.cwd(), 'src/ui/commandCenter/CommandCenter.css'),
  'utf8',
);
const lobbySource = readFileSync(join(process.cwd(), 'src/ui/Lobby.ts'), 'utf8');
const lobbyCss = readFileSync(join(process.cwd(), 'src/ui/Lobby.css'), 'utf8');
const lobbyConsoleCss = readFileSync(join(process.cwd(), 'src/ui/LobbyConsole.css'), 'utf8');
const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

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

  it('is injected after the legacy preparation styles as the only command-center layer', () => {
    expect(lobbySource).toContain("import commandCenterCss from './commandCenter/CommandCenter.css?raw';");
    expect(lobbySource).toContain('`${lobbyCss}\\n${lobbyConsoleCss}\\n${commandCenterCss}`');
  });

  it('fences the temporary Quick Operations bridge and removes retired launcher campaign rules', () => {
    expect(lobbyConsoleCss).toContain('.command-center__legacy-skirmish');
    expect(lobbyCss).not.toContain('.lobby-deployment-chooser');
    expect(lobbyCss).not.toContain('.lobby-campaign-kit');
    expect(lobbyConsoleCss).not.toContain('.lobby-deployment-chooser');
    expect(lobbyConsoleCss).not.toContain('.lobby-campaign-kit');
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

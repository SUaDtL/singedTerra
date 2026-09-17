import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(join(process.cwd(), 'src/ui/HUD.css'), 'utf8');
const hudSource = readFileSync(join(process.cwd(), 'src/ui/HUD.ts'), 'utf8');

describe('Command Menu visual contract', () => {
  it('reuses the admitted command-center material seam instead of a stretched modal bitmap', () => {
    expect(hudSource).toContain("import commandPanelFrameUrl from './commandCenter/assets/chrome/panel-frame.png';");
    expect(hudSource).toContain("import commandIronTileUrl from './commandCenter/assets/chrome/iron-tile.png';");
    expect(hudSource).toContain("import commandButtonFrameUrl from './commandCenter/assets/chrome/button-frame.png';");
    expect(hudSource).toContain("import commandButtonGoldFrameUrl from './commandCenter/assets/chrome/button-gold-frame.png';");
    expect(hudSource).toContain('style.textContent = `${hudCss}\\n${HUD_COMMAND_MENU_ASSET_CSS}`;');
    expect(hudCss).toMatch(
      /\.st-hud__command-menu-panel\s*\{[^}]*border-image-source:\s*var\(--st-command-panel-frame[^}]*border-image-slice:\s*16\s+fill/s,
    );
    expect(hudCss).not.toContain('--st-command-menu-frame');
  });

  it('uses one linked header, one dominant action, subordinate utilities, and a separate exit', () => {
    expect(hudCss).toMatch(
      /\.st-hud__command-menu-header\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\([^}]*minmax\([^}]*minmax\(/s,
    );
    expect(hudCss).toMatch(
      /\.st-hud__command-menu-action--primary\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*min-height:\s*(?:6[4-9]|[7-9]\d)px/s,
    );
    expect(hudCss).toMatch(
      /\.st-hud__command-menu-action--utility\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px/s,
    );
    expect(hudCss).toMatch(
      /\.st-hud__command-menu-exit\s*\{[^}]*border-top:/s,
    );
  });

  it('retains compact-touch targets, short-landscape fitting, reduced motion, and forced colours', () => {
    expect(hudCss).toMatch(
      /@media\s*\(pointer:\s*coarse\)[\s\S]*?\.st-hud__command-menu-panel\s+\.st-hud__command-menu-action[^}]*min-height:\s*var\(--st-store-buy-target,\s*91px\)/s,
    );
    expect(hudCss).toMatch(
      /@media\s*\(pointer:\s*fine\)\s*and\s*\(max-height:\s*600px\)[\s\S]*?\.st-hud__command-menu-panel/s,
    );
    expect(hudCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(hudCss).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.st-hud__command-menu-panel/s,
    );
  });
});

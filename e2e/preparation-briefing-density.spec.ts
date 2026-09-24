import { expect, test } from '@playwright/test';
import { gotoLobby, selectCommandWorkspace, type CommandCategoryName, type CommandItemName } from './support';

const VIEWPORTS = [
  { width: 3440, height: 1440 }, { width: 1920, height: 1080 },
  { width: 1440, height: 900 }, { width: 1220, height: 1050 },
  { width: 1180, height: 860 }, { width: 1100, height: 720 },
  { width: 900, height: 720 }, { width: 844, height: 390 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
  { width: 802, height: 293 },
] as const;
const WORKSPACES: ReadonlyArray<readonly [CommandCategoryName, CommandItemName]> = [
  ['Skirmishes', 'standard'], ['Skirmishes', 'crosswind-range'],
  ['Multiplayer', 'local-battle'], ['Multiplayer', 'online'],
];

test.describe('preparation readable content and live resizing', () => {
  for (const [category, item] of WORKSPACES) {
    test(`${item} preserves task scale, edits and dock boundaries across the same widths`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoLobby(page);
      await selectCommandWorkspace(page, category, item);
      const frame = page.locator('#lobby .preparation-frame');
      const name = frame.locator('input[type="text"]').first();
      const hasName = await name.count() > 0;
      if (hasName) await name.fill('Viewport Commander');
      const focus = hasName ? name : frame.locator('[data-preparation-primary]');
      await focus.focus();

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await expect(focus).toBeFocused();
        if (hasName) await expect(name).toHaveValue('Viewport Commander');
        const layout = await frame.evaluate((root) => {
          const body = root.querySelector<HTMLElement>('.preparation-frame__body')!;
          const inner = root.querySelector<HTMLElement>('.preparation-frame__body-inner')!;
          const dock = root.querySelector<HTMLElement>('.preparation-frame__dock')!;
          const bodyRect = body.getBoundingClientRect();
          const dockRect = dock.getBoundingClientRect();
          const fields = [...body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type="hidden"]), select')]
            .filter((node) => node.getBoundingClientRect().height > 0);
          return {
            overflow: Math.max(body.scrollWidth - body.clientWidth, inner.scrollWidth - inner.clientWidth),
            bodyHeight: bodyRect.height,
            overlap: bodyRect.bottom - dockRect.top,
            fields: fields.map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                font: parseFloat(getComputedStyle(node).fontSize),
                height: rect.height,
                contained: rect.left >= bodyRect.left - 1 && rect.right <= bodyRect.right + 1,
              };
            }),
            copy: [...root.querySelectorAll('.skirmish-command__note p, .skirmish-command__facts dd')]
              .map((node) => parseFloat(getComputedStyle(node).fontSize)),
          };
        });
        expect(layout.overflow, `${item} ${JSON.stringify(viewport)} horizontal overflow`).toBeLessThanOrEqual(1);
        expect(layout.overlap, 'dock must reserve its own layout row').toBeLessThanOrEqual(1);
        expect(layout.bodyHeight, 'body must retain an operable slice, not just a visible launch').toBeGreaterThanOrEqual(44);
        for (const field of layout.fields) {
          expect(field.contained, 'fields must not be clipped into a narrow subgrid').toBe(true);
          expect(field.font, 'editable values need readable scale').toBeGreaterThanOrEqual(16);
          expect(field.height).toBeGreaterThanOrEqual(44);
        }
        for (const size of layout.copy) expect(size).toBeGreaterThanOrEqual(16);
        // Readable labels must fit the actual inspection bay at short heights.
        // Checking only the outer panel misses its old absolute-positioned parts.
        const preview = frame.locator('.lobby-preview');
        if (await preview.count() && await preview.isVisible()) {
          const parts = await preview.evaluate((bay) => {
            const bounds = bay.getBoundingClientRect();
            return [...bay.querySelectorAll<HTMLElement>(
              '.lobby-preview__spotlight-identity, .lobby-preview__spotlight-canvas, .lobby-preview__parts, .lobby-preview__part',
            )].map((part) => {
              const rect = part.getBoundingClientRect();
              return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
                && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
            });
          });
          expect(parts.length).toBeGreaterThan(0);
          expect(parts.every(Boolean), 'tank identity, illustration and parts must stay inside their bay').toBe(true);
        }
        const primary = frame.locator('[data-preparation-primary]');
        await expect(primary).toHaveCount(1);
        const bounds = await primary.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }

      // A visible footer is not enough: an edited field must also be reachable
      // and actually hit-testable after stacking, without an overlay masking it.
      await page.setViewportSize({ width: 1220, height: 1050 });
      const fields = frame.locator('input:not([type="hidden"]), select');
      for (const field of await fields.all()) {
        if (!await field.isVisible()) continue;
        await field.scrollIntoViewIfNeeded();
        expect(await field.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit === node || node.contains(hit);
        }), 'another region must not intercept the field').toBe(true);
      }
    });
  }

  test('missing backdrop does not remove scenario meaning or the authored field order', async ({ page }) => {
    await page.route('**/art/battlefield-theater-*', (route) => route.abort());
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoLobby(page);
    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    const root = page.locator('[data-skirmish-command-view]');
    await expect(root.locator('.skirmish-command__briefing')).toContainText('The edge is another route');
    await expect(root.locator('[data-ui="quick-operation-objective"]')).toContainText('First Strike');
    await expect(root.locator('[data-skirmish-fact="Seed"]')).toContainText('42');
    await expect(root.locator('.skirmish-command__backdrop-note')).toContainText('visual only');
    await expect(root.locator('[data-preparation-primary]')).toBeEnabled();
  });
});

// Outer button containment alone missed labels painting over the right bevel.
// Measure the text glyph rectangles against the button's inner content box.
test('category labels fit the rail and Modes sheet without clipping or truncation', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoLobby(page);
  await selectCommandWorkspace(page, 'Skirmishes', 'standard');
  const navigationSizes = [
    ...VIEWPORTS, { width: 2048, height: 720 }, { width: 1700, height: 900 },
    { width: 1560, height: 900 }, { width: 1540, height: 900 },
  ];
  for (const viewport of navigationSizes) {
    await page.setViewportSize(viewport);
    const rail = page.locator('#lobby .command-center__category-rail');
    const inSheet = !await rail.isVisible();
    if (inSheet) await page.getByRole('button', { name: 'Modes', exact: true }).click();
    const buttons = page.locator(inSheet
      ? '#lobby .command-center__sheet-categories [data-command-category]'
      : '#lobby .command-center__category-rail [data-command-category]');
    await expect(buttons).toHaveCount(3);
    for (const [index, label] of ['Campaigns', 'Skirmishes', 'Multiplayer'].entries()) {
      const button = buttons.nth(index);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toHaveAccessibleName(label);
      await expect(button.locator('.command-center__control-label')).toHaveText(label);
      const measured = await button.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const text = node.querySelector('.command-center__control-label')!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const glyphs = [...range.getClientRects()];
        const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
        const bottom = box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          fullNameOnOneLine: glyphs.length === 1,
          inside: glyphs.every((r) => r.left >= left - 1 && r.right <= right + 1
            && r.top >= top - 1 && r.bottom <= bottom + 1),
          operable: hit === node || node.contains(hit),
          width: box.width, height: box.height,
        };
      });
      expect(measured.inside, `${label} ${JSON.stringify(viewport)} crosses the inner bevel`).toBe(true);
      expect(measured.fullNameOnOneLine, 'ordinary category names must not fragment').toBe(true);
      expect(measured.operable, 'the visible label must belong to a reachable control').toBe(true);
      expect(measured.width).toBeGreaterThanOrEqual(44);
      expect(measured.height).toBeGreaterThanOrEqual(44);
    }
    if (inSheet) await page.getByRole('button', { name: 'Close Modes', exact: true }).click();
  }
});

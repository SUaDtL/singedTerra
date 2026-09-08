import { expect, test } from '@playwright/test';

async function gotoVictory(
  page: import('@playwright/test').Page,
  mode: 'victory' | 'victory-anonymous' = 'victory',
): Promise<void> {
  await page.goto(`?e2e=${mode}`);
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
}

test.describe('Victory After-Action Report', () => {
  test('fits the full legal winner identity in the authored report', async ({ page }, testInfo) => {
    await page.goto('?e2e=victory&winner-name=long');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());

    const report = page.locator('.st-hud__overlay--victory');
    const panel = report.locator('.st-hud__overlay-panel--victory');
    const title = report.getByRole('heading', { name: 'LongRangeCommander20 wins' });
    await expect(report).toBeVisible();
    await expect(title).toBeVisible();

    const fit = await title.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.parentElement?.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const ink = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        box: box.toJSON(),
        parent: parent?.toJSON() ?? null,
        ink: ink.toJSON(),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
      };
    });
    expect(fit.parent).not.toBeNull();
    expect(fit.clientWidth).toBeGreaterThanOrEqual(fit.scrollWidth);
    expect(fit.clientHeight).toBeGreaterThanOrEqual(fit.scrollHeight);
    expect(fit.ink.left).toBeGreaterThanOrEqual(fit.box.left - 1);
    expect(fit.ink.right).toBeLessThanOrEqual(fit.box.right + 1);
    expect(fit.ink.top).toBeGreaterThanOrEqual(fit.box.top - 1);
    expect(fit.ink.bottom).toBeLessThanOrEqual(fit.box.bottom + 1);
    expect(fit.box.left).toBeGreaterThanOrEqual(fit.parent!.left - 1);
    expect(fit.box.right).toBeLessThanOrEqual(fit.parent!.right + 1);
    expect(fit.box.top).toBeGreaterThanOrEqual(fit.parent!.top - 1);
    expect(fit.box.bottom).toBeLessThanOrEqual(fit.parent!.bottom + 1);

    await panel.screenshot({
      path: testInfo.outputPath(`victory-long-name-reference-lock-${testInfo.project.name}.png`),
    });
  });

  test('keeps the anonymous future-match handoff contained and directs it to sign-in', async ({ page }, testInfo) => {
    await gotoVictory(page, 'victory-anonymous');

    const report = page.locator('.st-hud__overlay--victory');
    const panel = report.locator('.st-hud__overlay-panel--victory');
    const prompt = report.getByText('Sign in to record future matches.');
    const signIn = report.getByRole('button', { name: 'Sign in' });
    const playAgain = report.getByRole('button', { name: 'Play again' });
    const mainMenu = report.getByRole('button', { name: 'Main Menu' });

    await expect(prompt).toBeVisible();
    await expect(report.locator('.st-hud__victory-progression-handoff'))
      .toHaveAttribute('role', 'status');
    await expect(report.locator('.st-hud__victory-progression-handoff'))
      .toHaveAttribute('aria-live', 'polite');
    await expect(signIn).toBeVisible();
    await expect(playAgain).toBeVisible();
    await expect(mainMenu).toBeVisible();
    if (testInfo.project.name === 'pixel-touch') {
      const signInBox = await signIn.boundingBox();
      expect(signInBox).not.toBeNull();
      expect(signInBox!.width, 'anonymous handoff keeps a physical touch target').toBeGreaterThanOrEqual(44);
      expect(signInBox!.height, 'anonymous handoff keeps a physical touch target').toBeGreaterThanOrEqual(44);
    }
    await playAgain.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(signIn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(signIn).toBeFocused();

    await panel.screenshot({
      path: testInfo.outputPath(`victory-anonymous-reference-lock-${testInfo.project.name}.png`),
    });

    const escaped = await panel.evaluate((element) => {
      const panelBox = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>(
        '.st-hud__victory-progression-handoff, .st-hud__victory-progression-sign-in, .st-hud__victory-primary, .st-hud__restart--ghost',
      )].flatMap((child) => {
        const box = child.getBoundingClientRect();
        const contained = box.left >= panelBox.left - 1 && box.right <= panelBox.right + 1
          && box.top >= panelBox.top - 1 && box.bottom <= panelBox.bottom + 1;
        return contained ? [] : [{
          className: child.className,
          text: child.textContent?.trim() ?? '',
          box: box.toJSON(),
          panel: panelBox.toJSON(),
        }];
      });
    });
    expect(escaped).toEqual([]);

    const orderedLayout = await panel.evaluate((element) => {
      const bounds = (selector: string) => {
        const target = element.querySelector<HTMLElement>(selector);
        if (!target) throw new Error(`Missing ${selector}`);
        return target.getBoundingClientRect();
      };
      const promptBox = bounds('.st-hud__victory-progression-handoff p');
      const signInBox = bounds('.st-hud__victory-progression-sign-in');
      const handoffBox = bounds('.st-hud__victory-progression-handoff');
      const titleBox = bounds('.st-hud__victory-title');
      const scoreLabelBox = bounds('.st-hud__victory-score-label');
      const scoreBox = bounds('.st-hud__score');
      const actionBox = bounds('.st-hud__overlay-btns');
      const ordered = [handoffBox, titleBox, scoreLabelBox, scoreBox, actionBox];
      const overlaps = (left: DOMRect, right: DOMRect) =>
        left.left < right.right && left.right > right.left
        && left.top < right.bottom && left.bottom > right.top;
      return {
        verticalOrder: ordered.slice(1).every((box, index) => ordered[index]!.bottom <= box.top),
        handoffControlsDistinct: !overlaps(promptBox, signInBox),
        handoffDoesNotOverlapVictoryContent: [titleBox, scoreLabelBox, scoreBox, actionBox]
          .every((box) => !overlaps(promptBox, box) && !overlaps(signInBox, box)),
      };
    });
    expect(orderedLayout.verticalOrder).toBe(true);
    expect(orderedLayout.handoffControlsDistinct).toBe(true);
    expect(orderedLayout.handoffDoesNotOverlapVictoryContent).toBe(true);

    const geometry = await panel.evaluate((element) => {
      const panelBox = element.getBoundingClientRect();
      const overlay = element.closest<HTMLElement>('.st-hud__overlay--victory');
      if (!overlay) throw new Error('Missing victory overlay');
      const overlayBox = overlay.getBoundingClientRect();
      return {
        panel: panelBox.toJSON(),
        overlay: overlayBox.toJSON(),
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.overlay.left - 1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.overlay.top - 1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.overlay.right + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.overlay.bottom + 1);
    expect(geometry.panel.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.document.width).toBe(geometry.viewport.width);
    expect(geometry.document.height).toBe(geometry.viewport.height);

    await signIn.click();
    const account = page.getByRole('dialog', { name: 'Player account' });
    await expect(account).toBeVisible();
    await expect(account.locator('input[type="email"]')).toBeFocused();
  });

  test('is an authored, fitted, keyboard-causal production modal', async ({ page }, testInfo) => {
    await gotoVictory(page);

    const report = page.locator('.st-hud__overlay--victory');
    const panel = report.locator('.st-hud__overlay-panel--victory');
    const tank = report.locator('.st-hud__victory-tank');
    const anonymousHandoff = report.locator('.st-hud__victory-progression-handoff');
    const playAgain = report.getByRole('button', { name: 'Play again' });
    const mainMenu = report.getByRole('button', { name: 'Main Menu' });

    await expect(report).toHaveAttribute('role', 'dialog');
    await expect(report).toHaveAttribute('aria-modal', 'true');
    // The report now uses the shared semantic chassis; containment below is the visual contract.
    await expect(report.getByText('After action report')).toBeVisible();
    await expect(report.getByRole('heading', { name: 'P1 wins' })).toBeVisible();
    await expect(report.getByText('Match winner')).toBeVisible();
    await expect(report.getByText('Sign in to record future matches.')).toBeHidden();
    await expect(anonymousHandoff).toBeHidden();
    expect(await anonymousHandoff.evaluate((element) => getComputedStyle(element).display)).toBe('none');
    await expect(tank).toHaveAttribute(
      'data-tank-preview-signature',
      'spotlight|#e84d4d|ranger|bulwark|jackal|foundry',
    );
    await expect(report.locator('.st-hud__score-cell--winner')).toHaveCount(3);
    await expect(page.locator('#stage')).toHaveAttribute('inert', '');
    await expect(page.locator('#hud')).toHaveAttribute('inert', '');
    await expect(page.locator('#lobby')).toHaveAttribute('inert', '');
    await expect(playAgain).toBeFocused();
    await expect(playAgain.locator('.st-ui-glyph[data-glyph="weapon"]')).toHaveCount(1);
    await expect(mainMenu.locator('.st-ui-glyph[data-glyph="menu"]')).toHaveCount(1);

    await page.keyboard.press('Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(playAgain).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(playAgain).toBeFocused();

    const geometry = await report.evaluate((element) => {
      const overlay = element.getBoundingClientRect();
      const panelBox = element.querySelector('.st-hud__overlay-panel')!.getBoundingClientRect();
      const eyebrow = element.querySelector<HTMLElement>('.st-hud__victory-eyebrow')!
        .getBoundingClientRect();
      const hero = element.querySelector<HTMLElement>('.st-hud__victory-hero')!.getBoundingClientRect();
      const tank = element.querySelector<HTMLCanvasElement>('.st-hud__victory-tank')!.getBoundingClientRect();
      const stageScale = document.getElementById('stage')!.getBoundingClientRect().height / 600;
      const readableSelectors = [
        '.st-hud__victory-eyebrow',
        '.st-hud__victory-status',
        '.st-hud__victory-title',
        '.st-hud__victory-score-label',
        '.st-hud__score > *',
        '.st-hud__overlay-btns button',
      ];
      const readable = readableSelectors.flatMap((selector) =>
        [...element.querySelectorAll<HTMLElement>(selector)]
          .filter((target) => {
            const style = getComputedStyle(target);
            const box = target.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
              && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
          })
          .map((target) => {
            const style = getComputedStyle(target);
            const box = target.getBoundingClientRect();
            return {
              selector,
              text: target.textContent?.trim() ?? '',
              physicalFontSize: Number.parseFloat(style.fontSize) * stageScale,
              box: box.toJSON(),
              clientWidth: target.clientWidth,
              scrollWidth: target.scrollWidth,
              clientHeight: target.clientHeight,
              scrollHeight: target.scrollHeight,
            };
          }),
      );
      return {
        overlay: overlay.toJSON(),
        panel: panelBox.toJSON(),
        eyebrowCenterRatio: ((eyebrow.top + eyebrow.bottom) / 2 - panelBox.top) / panelBox.height,
        tankWidthRatio: tank.width / hero.width,
        readable,
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.overlay.left - 1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.overlay.top - 1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.overlay.right + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.overlay.bottom + 1);
    expect(geometry.eyebrowCenterRatio, 'After Action Report registers in the engraved header plate')
      .toBeLessThanOrEqual(0.13);
    expect(geometry.tankWidthRatio, 'winner vehicle earns the authored showcase bay instead of floating in vacancy')
      .toBeGreaterThanOrEqual(0.92);
    for (const item of geometry.readable) {
      expect(item.text, `${item.selector} owns meaningful visible copy`).not.toBe('');
      expect(item.physicalFontSize, `${item.selector} (${item.text}) remains physically readable`)
        .toBeGreaterThanOrEqual(10.5);
      expect(item.box.left, `${item.selector} (${item.text}) stays inside the authored panel`)
        .toBeGreaterThanOrEqual(geometry.panel.left - 1);
      expect(item.box.right, `${item.selector} (${item.text}) stays inside the authored panel`)
        .toBeLessThanOrEqual(geometry.panel.right + 1);
      expect(item.box.top, `${item.selector} (${item.text}) stays inside the authored panel`)
        .toBeGreaterThanOrEqual(geometry.panel.top - 1);
      expect(item.box.bottom, `${item.selector} (${item.text}) stays inside the authored panel`)
        .toBeLessThanOrEqual(geometry.panel.bottom + 1);
      expect(item.scrollWidth, `${item.selector} (${item.text}) does not clip horizontally`)
        .toBeLessThanOrEqual(item.clientWidth + 1);
      expect(item.scrollHeight, `${item.selector} (${item.text}) does not clip vertically`)
        .toBeLessThanOrEqual(item.clientHeight + 1);
    }
    expect(geometry.document.width).toBe(geometry.viewport.width);
    expect(geometry.document.height).toBe(geometry.viewport.height);

    await panel.screenshot({ path: testInfo.outputPath(`victory-reference-lock-${testInfo.project.name}.png`) });

    await playAgain.press('Enter');
    await expect(report).toBeHidden();
    const firstSalvo = page.getByRole('dialog', { name: 'First salvo briefing' });
    if (await firstSalvo.isVisible()) {
      await expect(page.locator('[data-console-owner="preact"]')).toHaveAttribute('inert', '');
      await expect(firstSalvo.getByRole('button', { name: 'Enter battle' })).toBeFocused();
    } else {
      await expect(page.locator('#stage')).not.toHaveAttribute('inert', '');
      await expect(page.locator('#hud')).not.toHaveAttribute('inert', '');
      await expect(page.locator('#lobby')).not.toHaveAttribute('inert', '');
    }
    await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
  });

});

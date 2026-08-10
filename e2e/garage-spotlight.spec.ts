import { expect, test, type Locator, type Page } from '@playwright/test';

interface LayoutBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const LAYOUT_TOLERANCE = 1;

async function visibleLayoutBox(locator: Locator): Promise<LayoutBox> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(LAYOUT_TOLERANCE);
  expect(box!.height).toBeGreaterThan(LAYOUT_TOLERANCE);
  return {
    left: box!.x,
    top: box!.y,
    right: box!.x + box!.width,
    bottom: box!.y + box!.height,
    width: box!.width,
    height: box!.height,
  };
}

function expectContained(inner: LayoutBox, outer: LayoutBox): void {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - LAYOUT_TOLERANCE);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - LAYOUT_TOLERANCE);
  expect(inner.right).toBeLessThanOrEqual(outer.right + LAYOUT_TOLERANCE);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + LAYOUT_TOLERANCE);
}

function expectSeparated(first: LayoutBox, second: LayoutBox): void {
  const overlapWidth = Math.min(first.right, second.right)
    - Math.max(first.left, second.left);
  const overlapHeight = Math.min(first.bottom, second.bottom)
    - Math.max(first.top, second.top);
  expect(
    overlapWidth <= LAYOUT_TOLERANCE
      || overlapHeight <= LAYOUT_TOLERANCE,
  ).toBe(true);
}

async function expectInViewport(page: Page, box: LayoutBox): Promise<void> {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expectContained(box, {
    left: 0,
    top: 0,
    right: viewport.width,
    bottom: viewport.height,
    width: viewport.width,
    height: viewport.height,
  });
}

async function expectControlInViewport(
  page: Page,
  control: Locator,
): Promise<LayoutBox> {
  const box = await visibleLayoutBox(control);
  await expectInViewport(page, box);
  return box;
}

async function garageEntryControl(
  page: Page,
  player: 1 | 2,
): Promise<Locator> {
  const compactTrigger = page.getByRole('button', {
    name: `Customize Player ${player} tank`,
  });
  if (await compactTrigger.isVisible()) return compactTrigger;
  return page.getByRole('button', {
    name: `Apply Foundry preset to Player ${player}`,
  });
}

async function expectGarageLayout(page: Page): Promise<void> {
  const bay = await visibleLayoutBox(page.locator('.lobby-preview'));
  await expectInViewport(page, bay);

  const spotlightSelectors = [
    '.lobby-preview__spotlight',
    '.lobby-preview__spotlight-identity',
    '.lobby-preview__spotlight-name',
    '.lobby-preview__spotlight-canvas',
    '.lobby-preview__parts',
  ];
  for (const selector of spotlightSelectors) {
    const box = await visibleLayoutBox(page.locator(selector));
    expectContained(box, bay);
  }

  const convoy = await visibleLayoutBox(page.locator('.lobby-preview__convoy'));
  const controls = await visibleLayoutBox(page.locator('.lobby-controls'));
  expectContained(convoy, bay);
  expectContained(controls, bay);

  const partBoxes: LayoutBox[] = [];
  const parts = page.locator('.lobby-preview__part');
  await expect(parts).toHaveCount(4);
  for (let index = 0; index < await parts.count(); index++) {
    const box = await visibleLayoutBox(parts.nth(index));
    expectContained(box, bay);
    expectSeparated(box, convoy);
    expectSeparated(box, controls);
    for (const earlier of partBoxes) expectSeparated(box, earlier);
    partBoxes.push(box);
  }

  const start = await expectControlInViewport(
    page,
    page.getByRole('button', { name: 'Deploy local battle' }),
  );
  expectSeparated(bay, start);

  const garages = page.locator('.lobby-garage:visible');
  await expect(garages).toHaveCount(2);
  for (let index = 0; index < await garages.count(); index++) {
    const garage = await visibleLayoutBox(garages.nth(index));
    await expectInViewport(page, garage);
    expectSeparated(bay, garage);
  }

  await expectControlInViewport(page, await garageEntryControl(page, 1));
  await expectControlInViewport(page, await garageEntryControl(page, 2));
}

async function openLobby(page: Page): Promise<void> {
  await page.goto('.');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.lobby-garage')).toHaveCount(2);
}

async function openPlayerGarage(page: Page, player: 1 | 2): Promise<void> {
  const app = page.locator('#app');
  if (await app.evaluate((element) => element.classList.contains('is-compact'))) {
    await page.getByRole('button', {
      name: `Customize Player ${player} tank`,
    }).click();
    await expect(page.getByRole('dialog', {
      name: `Vehicle Bay: Player ${player}`,
    })).toBeVisible();
  }
}

async function closePlayerGarage(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done customizing tank' });
  if (await done.isVisible()) await done.click();
}

async function expectDocumentFit(page: Page): Promise<void> {
  const fit = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(fit.documentWidth).toBeLessThanOrEqual(fit.viewportWidth + 1);
  expect(fit.documentHeight).toBeLessThanOrEqual(fit.viewportHeight + 1);
}

async function spotlightParts(page: Page): Promise<Array<[string, string]>> {
  return page.locator('.lobby-preview__spotlight .lobby-preview__part')
    .evaluateAll((parts) => parts.map((part) => [
      part.querySelector('span')?.textContent?.trim() ?? '',
      part.querySelector('strong')?.textContent?.trim() ?? '',
    ] as [string, string]));
}

async function spotlightPixelHash(page: Page): Promise<string | null> {
  return page.locator('.lobby-preview__spotlight-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return null;
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let visiblePixels = 0;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3]!;
        if (alpha <= 8) continue;
        visiblePixels++;
        hash = Math.imul(hash ^ (index >>> 2), 16777619);
        hash = Math.imul(hash ^ pixels[index]!, 16777619);
        hash = Math.imul(hash ^ pixels[index + 1]!, 16777619);
        hash = Math.imul(hash ^ pixels[index + 2]!, 16777619);
        hash = Math.imul(hash ^ alpha, 16777619);
      }
      return visiblePixels === 0 ? null : `${visiblePixels}:${hash >>> 0}`;
    });
}

async function expectSettledSpotlightHash(
  page: Page,
  previousHash?: string,
): Promise<string> {
  let candidate: string | null = null;
  let stableSamples = 0;
  let settled: string | null = null;
  await expect.poll(async () => {
    const next = await spotlightPixelHash(page);
    if (next === null || next === previousHash) {
      candidate = null;
      stableSamples = 0;
      return false;
    }
    if (next === candidate) {
      stableSamples++;
    } else {
      candidate = next;
      stableSamples = 1;
    }
    if (stableSamples >= 2) settled = next;
    return settled !== null;
  }, {
    timeout: 5_000,
    intervals: [50, 100, 150, 250],
  }).toBe(true);
  return settled!;
}

test.describe('Garage spotlight', () => {
  test('carries untouched Foundry and Ranger defaults into consecutive live turns', async ({
    page,
  }) => {
    await openLobby(page);

    await expect(page.locator(
      '.lobby-preview__tank[data-owner="player-1"] canvas',
    )).toHaveAttribute(
      'data-tank-preview-signature',
      'thumbnail|#e84d4d|foundry|foundry|foundry|foundry',
    );
    await expect(page.locator(
      '.lobby-preview__tank[data-owner="player-2"] canvas',
    )).toHaveAttribute(
      'data-tank-preview-signature',
      'thumbnail|#4d8ce8|ranger|ranger|ranger|ranger',
    );

    await page.getByRole('button', { name: 'Deploy local battle' }).click();
    const portrait = page.locator('.st-hud__tank-portrait');
    await expect(portrait).toHaveAttribute(
      'aria-label',
      "Player 1's tank. Mobility: Tracks. Hull: Armor Hull. "
      + 'Turret: Cupola. Barrel: Cannon.',
    );

    for (let index = 0; index < 16; index++) await page.keyboard.press('KeyQ');
    await expect(page.locator('.st-hud__weapon-value')).toHaveText('Shield');
    await page.keyboard.press('Space');
    await expect(portrait).toHaveAttribute(
      'aria-label',
      "Player 2's tank. Mobility: Spider Legs. Hull: Scout Hull. "
      + 'Turret: Sensor Pod. Barrel: Railgun.',
    );
  });

  test('keeps customization legible, interactive, focused, and fitted', async ({
    page,
  }) => {
    await openLobby(page);

    const spotlight = page.locator('.lobby-preview__spotlight');
    await expect(spotlight).toHaveAttribute('data-owner', 'player-1');
    await expect(spotlight.locator('.lobby-preview__spotlight-name'))
      .toHaveText('Player 1');
    expect((await spotlightParts(page)).map(([label]) => label)).toEqual([
      'Mobility',
      'Hull',
      'Turret',
      'Barrel',
    ]);
    await expect(page.locator(
      '.lobby-preview__convoy .lobby-preview__tank',
    )).toHaveCount(2);
    const untouchedSignatures = await page.locator(
      '.lobby-preview__convoy .lobby-preview__tank canvas',
    ).evaluateAll((canvases) => canvases.map((canvas) => (
      (canvas as HTMLCanvasElement).dataset.tankPreviewSignature ?? ''
    )));
    expect(untouchedSignatures).toEqual([
      'thumbnail|#e84d4d|foundry|foundry|foundry|foundry',
      'thumbnail|#4d8ce8|ranger|ranger|ranger|ranger',
    ]);
    await expect(page.locator(
      '.lobby-garage[data-owner="player-1"] [data-preset="foundry"]',
    )).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(
      '.lobby-garage[data-owner="player-2"] [data-preset="ranger"]',
    )).toHaveAttribute('aria-pressed', 'true');
    await expectGarageLayout(page);

    const canvasSizes = await page.evaluate(() => {
      const featured = document.querySelector<HTMLCanvasElement>(
        '.lobby-preview__spotlight-canvas',
      );
      const thumbnail = document.querySelector<HTMLCanvasElement>(
        '.lobby-preview__canvas',
      );
      if (!featured || !thumbnail) return null;
      const featuredBox = featured.getBoundingClientRect();
      const thumbnailBox = thumbnail.getBoundingClientRect();
      return {
        featuredIntrinsicArea: featured.width * featured.height,
        thumbnailIntrinsicArea: thumbnail.width * thumbnail.height,
        featuredRenderedWidth: featuredBox.width,
        thumbnailRenderedWidth: thumbnailBox.width,
      };
    });
    expect(canvasSizes).not.toBeNull();
    expect(canvasSizes!.featuredIntrinsicArea)
      .toBeGreaterThan(canvasSizes!.thumbnailIntrinsicArea * 4);
    expect(canvasSizes!.featuredRenderedWidth)
      .toBeGreaterThan(canvasSizes!.thumbnailRenderedWidth * 2);
    await page.waitForLoadState('networkidle');
    const foundryHash = await expectSettledSpotlightHash(page);

    await openPlayerGarage(page, 2);
    const rangerPreset = page.getByRole('button', {
      name: 'Apply Ranger preset to Player 2',
    });
    await expectControlInViewport(page, rangerPreset);
    await rangerPreset.click();
    await expect(spotlight).toHaveAttribute('data-owner', 'player-2');
    expect(await spotlightParts(page)).toEqual([
      ['Mobility', 'Spider Legs'],
      ['Hull', 'Scout Hull'],
      ['Turret', 'Sensor Pod'],
      ['Barrel', 'Railgun'],
    ]);
    const rangerHash = await expectSettledSpotlightHash(page, foundryHash);

    const turret = page.getByRole('button', {
      name: /Change Player 2 turret/,
    });
    await expectControlInViewport(page, turret);
    await turret.click();
    await expect(turret).toBeFocused();
    expect(await spotlightParts(page)).toEqual([
      ['Mobility', 'Spider Legs'],
      ['Hull', 'Scout Hull'],
      ['Turret', 'Bunker'],
      ['Barrel', 'Railgun'],
    ]);
    const turretHash = await expectSettledSpotlightHash(page, rangerHash);
    await closePlayerGarage(page);

    const playerTwoRow = page.locator('.lobby-row').nth(1);
    await playerTwoRow.locator('.lobby-swatch[title="Green"]').click();
    const greenHash = await expectSettledSpotlightHash(page, turretHash);
    expect(greenHash).not.toBe(turretHash);
    await expect(spotlight).toHaveAttribute('data-owner', 'player-2');
    await expect.poll(() => spotlight.evaluate((element) => (
      element.style.getPropertyValue('--tank-color').trim()
    ))).toBe('#4de87a');

    const playerTwoName = playerTwoRow.locator('input.lobby-name');
    await playerTwoName.fill('Trailblazer');
    await expect(playerTwoName).toBeFocused();
    await expect(spotlight.locator('.lobby-preview__spotlight-name'))
      .toHaveText('Trailblazer');
    await expect(page.locator(
      '.lobby-preview__tank[data-owner="player-2"] .lobby-preview__name',
    )).toHaveText('Trailblazer');

    await expectGarageLayout(page);
    await expectDocumentFit(page);
    const start = page.getByRole('button', { name: 'Deploy local battle' });
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('.st-hud__tank-portrait')).toHaveAttribute(
      'aria-label',
      "Player 1's tank. Mobility: Tracks. Hull: Armor Hull. "
      + 'Turret: Cupola. Barrel: Cannon.',
    );
  });
});

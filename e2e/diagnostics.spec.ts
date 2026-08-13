import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoLobby } from './support';

const EPSILON = 1;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface DiagnosticsGeometry {
  lobby: Box;
  card: Box;
  overlay: Box;
  surface: Box;
  viewport: { width: number; height: number };
  document: { width: number; height: number };
}

type LobbyGeometrySnapshot = Record<string, Box[]>;

const STABLE_LOBBY_GEOMETRY_SELECTORS = [
  '#lobby .lobby-card > .lobby-deployment',
  '#lobby .lobby-deployment__masthead',
  '#lobby .lobby-command-header',
  '#lobby .lobby-deployment-chooser',
  '#lobby .lobby-deployment-chooser button',
] as const;

function assertContained(inner: Box, outer: Box, label: string): void {
  expect(inner.left, `${label} left`).toBeGreaterThanOrEqual(outer.left - EPSILON);
  expect(inner.top, `${label} top`).toBeGreaterThanOrEqual(outer.top - EPSILON);
  expect(inner.right, `${label} right`).toBeLessThanOrEqual(outer.right + EPSILON);
  expect(inner.bottom, `${label} bottom`).toBeLessThanOrEqual(outer.bottom + EPSILON);
}

async function openLobbyVariant(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby .lobby-card')).toHaveCount(1);
}

async function readStableLobbyGeometry(page: Page): Promise<LobbyGeometrySnapshot> {
  return page.evaluate((selectors) => {
    const toBox = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return Object.fromEntries(selectors.map((selector) => [
      selector,
      [...document.querySelectorAll(selector)].map(toBox),
    ]));
  }, STABLE_LOBBY_GEOMETRY_SELECTORS);
}

function assertStableLobbyGeometry(
  before: LobbyGeometrySnapshot,
  after: LobbyGeometrySnapshot,
): void {
  for (const selector of STABLE_LOBBY_GEOMETRY_SELECTORS) {
    expect(after[selector], `${selector} count after activation`).toHaveLength(before[selector]!.length);
    before[selector]!.forEach((beforeBox, index) => {
      const afterBox = after[selector]![index]!;
      expect(afterBox.left, `${selector}[${index}] left`).toBeCloseTo(beforeBox.left, 0);
      expect(afterBox.top, `${selector}[${index}] top`).toBeCloseTo(beforeBox.top, 0);
      expect(afterBox.right, `${selector}[${index}] right`).toBeCloseTo(beforeBox.right, 0);
      expect(afterBox.bottom, `${selector}[${index}] bottom`).toBeCloseTo(beforeBox.bottom, 0);
      expect(afterBox.width, `${selector}[${index}] width`).toBeCloseTo(beforeBox.width, 0);
      expect(afterBox.height, `${selector}[${index}] height`).toBeCloseTo(beforeBox.height, 0);
    });
  }
}

async function assertNoDiagnosticsNavigation(page: Page): Promise<void> {
  const diagnosticsName = /diagnostic|verified replay|production probe/i;
  await expect(page.getByRole('button', { name: diagnosticsName })).toHaveCount(0);
  await expect(page.getByRole('link', { name: diagnosticsName })).toHaveCount(0);
  const labeledControls = await page.locator('#lobby button, #lobby a[href]').evaluateAll((elements) => (
    elements
      .map((element) => [
        element.textContent ?? '',
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('title') ?? '',
      ].join(' '))
      .filter((label) => /diagnostic|verified replay|production probe/i.test(label))
  ));
  expect(labeledControls, 'ordinary lobby controls must not expose diagnostics navigation').toEqual([]);
}

async function diagnosticsDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Production diagnostics', exact: true });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readDiagnosticsGeometry(page: Page): Promise<DiagnosticsGeometry> {
  return page.evaluate(() => {
    const toBox = (element: Element | null): Box => {
      if (!element) throw new Error('Expected a rendered diagnostics element');
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const lobby = document.querySelector('#lobby');
    const card = document.querySelector('#lobby .lobby-card');
    const overlay = document.querySelector('#lobby > .lobby-overlay');
    const surface = document.querySelector('#lobby > .lobby-overlay .lobby-overlay__surface');
    return {
      lobby: toBox(lobby),
      card: toBox(card),
      overlay: toBox(overlay),
      surface: toBox(surface),
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
    };
  });
}

async function assertReachableControl(page: Page, control: Locator, surface: Locator): Promise<void> {
  await expect(control).toHaveCount(1);
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();

  const box = await control.boundingBox();
  const surfaceBox = await surface.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box, 'diagnostics control should have a rendered box').not.toBeNull();
  expect(surfaceBox, 'diagnostics surface should have a rendered box').not.toBeNull();

  expect(box!.width, 'diagnostics control width').toBeGreaterThan(EPSILON);
  expect(box!.height, 'diagnostics control height').toBeGreaterThan(EPSILON);
  expect(box!.x).toBeGreaterThanOrEqual(-EPSILON);
  expect(box!.y).toBeGreaterThanOrEqual(-EPSILON);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + EPSILON);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + EPSILON);
  expect(box!.x).toBeGreaterThanOrEqual(surfaceBox!.x - EPSILON);
  expect(box!.y).toBeGreaterThanOrEqual(surfaceBox!.y - EPSILON);
  expect(box!.x + box!.width).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width + EPSILON);
  expect(box!.y + box!.height).toBeLessThanOrEqual(surfaceBox!.y + surfaceBox!.height + EPSILON);
}

async function assertDiagnosticsLayout(page: Page, dialog: Locator): Promise<void> {
  const geometry = await readDiagnosticsGeometry(page);
  const viewportBox: Box = {
    left: 0,
    top: 0,
    right: geometry.viewport.width,
    bottom: geometry.viewport.height,
    width: geometry.viewport.width,
    height: geometry.viewport.height,
  };
  assertContained(geometry.card, geometry.lobby, 'base lobby card');
  assertContained(geometry.overlay, geometry.lobby, 'diagnostics overlay');
  assertContained(geometry.surface, geometry.overlay, 'diagnostics surface');
  assertContained(geometry.surface, viewportBox, 'diagnostics surface viewport');

  expect(geometry.document.width, 'document horizontal overflow').toBeLessThanOrEqual(
    geometry.viewport.width + EPSILON,
  );
  expect(geometry.document.height, 'document vertical overflow').toBeLessThanOrEqual(
    geometry.viewport.height + EPSILON,
  );

  const layout = await page.evaluate(() => {
    const epsilon = 1;
    const root = document.querySelector<HTMLElement>('.production-diagnostics');
    const overlay = document.querySelector<HTMLElement>('#lobby > .lobby-overlay');
    const surface = overlay?.querySelector<HTMLElement>('.lobby-overlay__surface');
    if (!root || !overlay || !surface) throw new Error('Missing diagnostics layout roots');

    const regionSelectors = [
      '.production-diagnostics__intro',
      '.production-diagnostics__status',
      '.production-diagnostics__check',
      '.production-diagnostics__provenance',
      '.production-diagnostics__fault',
      '.production-diagnostics__actions',
      '.production-diagnostics__receipt-heading',
      '.production-diagnostics__receipt',
      '.production-diagnostics__copy-status',
    ];
    const regions = regionSelectors.flatMap((selector) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [{
        selector,
        text: (element.textContent ?? '').trim(),
        box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        clipped: (style.overflowY === 'hidden' || style.overflowY === 'clip' || style.overflow === 'hidden')
          && element.scrollHeight > element.clientHeight + epsilon,
      }];
    });
    const regionBoxes = regions
      .filter((region) => region.text.length > 0)
      .map((region) => ({ selector: region.selector, box: region.box }));
    const overlaps: string[] = [];
    for (let leftIndex = 0; leftIndex < regionBoxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < regionBoxes.length; rightIndex += 1) {
        const left = regionBoxes[leftIndex]!;
        const right = regionBoxes[rightIndex]!;
        const overlapsPair = left.box.left < right.box.right - epsilon
          && left.box.right > right.box.left + epsilon
          && left.box.top < right.box.bottom - epsilon
          && left.box.bottom > right.box.top + epsilon;
        if (overlapsPair) overlaps.push(`${left.selector} <> ${right.selector}`);
      }
    }

    const receiptData = root.querySelector<HTMLElement>('.production-diagnostics__receipt-data');
    const verticalScrollOwners = [surface, ...surface.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element !== receiptData)
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      })
      .map((element) => element.className || element.tagName.toLowerCase());

    return {
      regions,
      overlaps,
      verticalScrollOwners,
      rootHorizontalOverflow: root.scrollWidth - root.clientWidth,
      overlayHorizontalOverflow: overlay.scrollWidth - overlay.clientWidth,
      surfaceHorizontalOverflow: surface.scrollWidth - surface.clientWidth,
      receiptDataHorizontalOverflow: receiptData
        ? receiptData.scrollWidth - receiptData.clientWidth
        : 0,
      surfaceStyle: {
        overflowY: getComputedStyle(surface).overflowY,
        overflowX: getComputedStyle(surface).overflowX,
      },
    };
  });

  const clipped = layout.regions
    .filter((region) => region.text.length > 0 && (region.box.width <= EPSILON || region.box.height <= EPSILON || region.clipped))
    .map((region) => region.selector);
  expect(clipped, 'visible diagnostics text regions must not be crushed or clipped').toEqual([]);
  expect(layout.overlaps, 'diagnostics regions must retain their authored separation').toEqual([]);
  expect(layout.rootHorizontalOverflow, 'diagnostics content must not overflow horizontally').toBeLessThanOrEqual(EPSILON);
  expect(layout.overlayHorizontalOverflow, 'overlay must not overflow horizontally').toBeLessThanOrEqual(EPSILON);
  expect(layout.surfaceHorizontalOverflow, 'modal surface must not overflow horizontally').toBeLessThanOrEqual(EPSILON);
  expect(layout.surfaceStyle.overflowY).toMatch(/auto|scroll/);
  expect(layout.verticalScrollOwners, 'modal must have one vertical scroll owner').toEqual(['lobby-overlay__surface']);
  expect(layout.receiptDataHorizontalOverflow, 'receipt may own only its bounded horizontal scroll').toBeGreaterThanOrEqual(0);

  await assertReachableControl(page, dialog.getByRole('button', { name: 'Close', exact: true }), dialog);
  await assertReachableControl(page, dialog.getByRole('button', { name: 'Check deployed build', exact: true }), dialog);
  await assertReachableControl(page, dialog.getByRole('button', { name: 'Arm response loss', exact: true }), dialog);
  await assertReachableControl(page, dialog.getByRole('button', { name: 'Run checks', exact: true }), dialog);
  await assertReachableControl(page, dialog.getByRole('button', { name: 'Copy receipt', exact: true }), dialog);

  const layering = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('#lobby > .lobby-overlay');
    const surface = overlay?.querySelector<HTMLElement>('.lobby-overlay__surface');
    const control = surface?.querySelector<HTMLElement>('.lobby-overlay__close');
    if (!overlay || !surface || !control) throw new Error('Missing diagnostics layering nodes');
    const controlBox = control.getBoundingClientRect();
    const surfaceBox = surface.getBoundingClientRect();
    const controlHit = document.elementFromPoint(
      controlBox.left + controlBox.width / 2,
      controlBox.top + controlBox.height / 2,
    );
    const centerHit = document.elementFromPoint(
      surfaceBox.left + surfaceBox.width / 2,
      surfaceBox.top + surfaceBox.height / 2,
    );
    return {
      controlInsideDialog: !!controlHit && surface.contains(controlHit),
      centerInsideDialog: !!centerHit && surface.contains(centerHit),
      controlIsHit: controlHit === control || control.contains(controlHit),
      overlayZ: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
      surfaceZ: Number.parseInt(getComputedStyle(surface).zIndex, 10),
    };
  });
  expect(layering.controlInsideDialog, 'modal control hit must remain inside the dialog').toBe(true);
  expect(layering.centerInsideDialog, 'modal center must be owned by the dialog').toBe(true);
  expect(layering.controlIsHit, 'modal control must be the effective hit target').toBe(true);
  expect(layering.overlayZ, 'modal layer must establish stacking context').toBeGreaterThan(0);
  expect(layering.surfaceZ, 'modal surface must establish stacking order').toBeGreaterThan(0);
}

test.describe('production diagnostics browser proof', () => {
  test('keeps ordinary and malformed activation params out of the lobby', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await gotoLobby(page);
    await expect(page.getByRole('dialog', { name: 'Production diagnostics', exact: true })).toHaveCount(0);
    await expect(page.locator('.production-diagnostics')).toHaveCount(0);
    await expect(page.locator('.production-diagnostics__run')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-card')).toHaveCount(1);
    await assertNoDiagnosticsNavigation(page);

    for (const query of ['?diagnostics=0&autorun=1', '?diagnostics=true', '?autorun=1', '?diagnostics=']) {
      await openLobbyVariant(page, query);
      await expect(page.getByRole('dialog', { name: 'Production diagnostics', exact: true })).toHaveCount(0);
      await expect(page.locator('.production-diagnostics')).toHaveCount(0);
      await expect(page.locator('#lobby .lobby-card')).toHaveCount(1);
      await assertNoDiagnosticsNavigation(page);
    }

    expect(requests.some((url) => url.includes('/verified_replay_probe'))).toBe(false);
  });

  test('layers diagnostics over an unchanged lobby card with fitted, reachable layout', async ({ page }) => {
    await openLobbyVariant(page);
    const baseGeometry = await readStableLobbyGeometry(page);

    await openLobbyVariant(page, '?diagnostics=1');
    const dialog = await diagnosticsDialog(page);
    await expect(page.locator('#lobby .lobby-card')).toHaveCount(1);
    await expect(page.locator('#lobby > .lobby-overlay')).toHaveCount(1);
    await expect(page.locator('#lobby .lobby-card')).toHaveAttribute('inert', '');

    const geometry = await readDiagnosticsGeometry(page);
    assertStableLobbyGeometry(baseGeometry, await readStableLobbyGeometry(page));
    assertContained(geometry.card, geometry.lobby, 'base lobby card');
    await assertDiagnosticsLayout(page, dialog);
  });

  test('hands anonymous or auth-error readiness through the account modal and back', async ({ page }) => {
    await openLobbyVariant(page, '?diagnostics=1');
    const diagnostics = await diagnosticsDialog(page);
    const accountAction = diagnostics.locator('.production-diagnostics__account');
    await expect(accountAction).toHaveCount(1, {
      timeout: 15_000,
      message: 'account readiness should expose an authenticated recovery action',
    });
    const readiness = await diagnostics.locator('.production-diagnostics').getAttribute('data-diagnostics-state');
    expect(['anonymous', 'authenticated-error', 'signed-out']).toContain(readiness);

    await accountAction.click();

    const account = page.getByRole('dialog', { name: 'Player account', exact: true });
    await expect(account).toHaveCount(1);
    await expect(account).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Production diagnostics', exact: true })).toHaveCount(0);
    await expect(page.locator('#lobby > .lobby-overlay')).toHaveCount(1);
    await expect(page.locator('#lobby .lobby-card')).toHaveCount(1);
    await expect(page.locator('#lobby .lobby-card')).toHaveAttribute('inert', '');

    await account.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Production diagnostics', exact: true })).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toHaveCount(0);
    await expect(page.locator('#lobby > .lobby-overlay')).toHaveCount(1);
  });

  test('Escape closes diagnostics in place, preserves unrelated URL state, and restores focus', async ({ page }) => {
    await page.addInitScript(() => {
      const view = window as typeof window & { __diagnosticsPageMarker?: number };
      view.__diagnosticsPageMarker = (view.__diagnosticsPageMarker ?? 0) + 1;
    });

    await openLobbyVariant(page, '?keep=alpha&diagnostics=1&autorun=1#retain');
    await diagnosticsDialog(page);
    const marker = await page.evaluate(() => (window as typeof window & { __diagnosticsPageMarker?: number }).__diagnosticsPageMarker);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Production diagnostics', exact: true })).toHaveCount(0);
    await expect(page.locator('#lobby > .lobby-overlay')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-card')).not.toHaveAttribute('inert', '');

    const url = new URL(page.url());
    expect(url.searchParams.get('keep')).toBe('alpha');
    expect(url.searchParams.has('diagnostics')).toBe(false);
    expect(url.searchParams.has('autorun')).toBe(false);
    expect(url.hash).toBe('#retain');
    expect(await page.evaluate(() => (window as typeof window & { __diagnosticsPageMarker?: number }).__diagnosticsPageMarker)).toBe(marker);

    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        connected: element instanceof HTMLElement && element.isConnected,
        insideLobby: element instanceof HTMLElement && !!element.closest('#lobby'),
        usable: element instanceof HTMLButtonElement && !element.disabled,
        text: element instanceof HTMLButtonElement ? element.textContent?.trim() : null,
      };
    });
    expect(focus).toEqual({ connected: true, insideLobby: true, usable: true, text: 'Local Battle' });
    await expect(page.getByRole('button', { name: 'Local Battle', exact: true })).toBeFocused();
  });
});

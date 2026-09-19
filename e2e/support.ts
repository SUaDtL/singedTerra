import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the rendering-guardrail specs. Kept separate from the specs
 * so the local layout suite and the post-deploy live smoke assert the SAME
 * geometry invariants against whichever bundle they point at.
 */

/**
 * Navigate to the deterministic hot-seat E2E entrypoint and wait until a game is
 * actually running (the HUD is built and numerical Fire Control is on screen).
 * Dismisses the splash overlay so it can't intercept anything.
 */
export async function enterBattleIfBriefed(page: Page): Promise<void> {
  const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
  await briefing.waitFor({ state: 'visible', timeout: 300 }).catch(() => undefined);
  if (await briefing.isVisible()) {
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await expect(briefing).toBeHidden();
  }
}

export async function gotoRunningGame(
  page: Page,
  search = '?e2e=hotseat',
): Promise<void> {
  // Shared layout/combat fixtures start after onboarding. Seed the same durable
  // preference the public Skip control writes before navigation so tests do not
  // race a coach card (or an already-open Arsenal drawer) for pointer ownership.
  // Dedicated First Salvo and command-console journey specs exercise the real
  // briefing and coach controls without this helper.
  await page.addInitScript(() => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  // Relative query (no leading '/') so it resolves against baseURL correctly for
  // BOTH the local root-served preview ('/') and the live project site served under
  // a sub-path ('/singedTerra/') — a leading-slash path would drop the sub-path.
  await page.goto(search);
  // The splash mounts on load and covers everything until dismissed; remove it so
  // it never sits over the widgets we measure. (Its own dismiss path just fades +
  // removes this node, so removing it directly is equivalent.)
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  // The HUD builds lazily on the first engine tick; waiting for the instrument
  // live firing-solution values prove the game loop is running, not just the DOM.
  // At ordinary aspect ratios Match is deliberately a closed drawer; its DOM
  // proves the HUD has built without permanently reserving canvas width.
  await expect(page.locator('#hud.st-hud')).toHaveCount(1);
  await expect(page.locator('[data-semantic-key="node:output:Angle:43"]')).toBeVisible();
  // A forced tutorial query intentionally overrides the stored preference; cross
  // that public entry control if a caller explicitly requests the forced path.
  await enterBattleIfBriefed(page);
  const skipCoach = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skipCoach.isVisible()) await skipCoach.click();
}

/**
 * Open the ordinary pre-game Lobby in the production bundle. This deliberately
 * uses the public entry path instead of an E2E query fixture so navigation,
 * DOM construction, and bundled Lobby CSS are all under test.
 */
export async function gotoLobby(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#lobby .lobby-card')).toBeVisible();
}

export type CommandCategoryName = 'Campaigns' | 'Skirmishes' | 'Multiplayer';
export type CommandItemName = 'ash-road' | 'local-battle'
  | 'verified-operations' | 'online' | 'first-salvo' | 'standard' | 'crosswind-range'
  | 'caldera-run' | 'last-light-siege' | 'lean-arsenal' | 'imported-challenge';

/** Select one owned workspace through the public two-level command center. */
export async function selectCommandWorkspace(
  page: Page,
  category: CommandCategoryName,
  item: CommandItemName,
): Promise<void> {
  const categoryId: Record<CommandCategoryName, string> = {
    Campaigns: 'campaigns',
    Skirmishes: 'skirmishes',
    Multiplayer: 'multiplayer',
  };
  const center = page.locator('#lobby .command-center');
  await expect(center).toBeVisible();
  const rail = center.locator('.command-center__category-rail');
  // Role locators intentionally exclude the display:none desktop rail at
  // compact widths. Keep this journey helper on the persistent registered
  // control while the separate sheet tests cover its public interaction.
  const railCategory = rail.locator(
    `button[data-command-category="${categoryId[category]}"]`,
  );
  const commandItem = center.locator(
    `.command-center__library-items button[data-command-item="${item}"]`,
  );
  await expect.poll(async () => {
    if (await commandItem.isVisible()) return true;
    await railCategory.waitFor({ state: 'attached' });
    if (await railCategory.isVisible()) await railCategory.click();
    else {
      // The compact sheet is exercised by dedicated public-interaction tests.
      // Route helpers activate the same registered callback through the retained
      // rail button. Polling also survives the intentional shell replacement
      // when an asynchronous account refresh changes item availability.
      await railCategory.evaluate((button: HTMLButtonElement) => button.click());
    }
    return commandItem.isVisible();
  }, { timeout: 8_000 }).toBe(true);
  if (await commandItem.getAttribute('aria-current') !== 'true') await commandItem.click();
  await expect(commandItem).toHaveAttribute('aria-current', 'true');
}

export async function openAshRoadWorkspace(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Campaigns', 'ash-road');
  await expect(page.locator('[data-campaign-command-view]')).toBeVisible();
  await expect(page.locator('[data-campaign-save-status]')).not.toContainText('Checking');
}

export async function openStandardSkirmishWorkspace(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Skirmishes', 'standard');
  await expect(page.locator('[data-skirmish-command-view]')).toBeVisible();
}

export async function openFirstSalvoWorkspace(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Skirmishes', 'first-salvo');
  await expect(page.locator('[data-skirmish-command-view]')).toBeVisible();
}

export async function openLocalPreparation(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Multiplayer', 'local-battle');
  const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole('tablist', { name: 'Hot Seat modes', exact: true }))
    .toHaveCount(0);
  await expect(workspace.locator('[data-operation-lane="practice"]')).toHaveCount(0);
  await expect(workspace.locator('.lobby-verified-deployment, .lobby-verified-challenge'))
    .toHaveCount(0);
}

export async function openVerifiedOperations(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Multiplayer', 'verified-operations');
  const workspace = page.locator('[data-multiplayer-command-view="verified-operations"]');
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole('tablist', { name: 'Hot Seat modes', exact: true }))
    .toHaveCount(0);
  await expect(workspace.getByRole('tablist', { name: 'Verified operation', exact: true }))
    .toBeVisible();
}

export async function openOnlinePreparation(page: Page): Promise<void> {
  await selectCommandWorkspace(page, 'Multiplayer', 'online');
  const workspace = page.locator('[data-multiplayer-command-view="online"]');
  await expect(workspace).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Play Online preparation', exact: true }))
    .toHaveCount(0);
}

/** Open the campaign's mode-aware Match/Mission ledger when it is drawer-owned. */
export async function openMissionLedger(page: Page): Promise<boolean> {
  const mission = page.getByRole('region', { name: 'Campaign mission', exact: true });
  if (await mission.isVisible()) return false;
  const trigger = page.getByRole('button', { name: 'Open mission ledger', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(mission).toBeVisible();
  return true;
}

export async function closeMissionLedger(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Close mission ledger', exact: true });
  if (await close.isVisible()) await close.click();
}

/**
 * Start Fuel Stop through the ordinary guest-facing campaign entry. This helper
 * intentionally has no query fixture, storage seed, DOM removal after entry, or
 * engine hook: a missing public campaign control is a product failure.
 */
export async function gotoFuelStopFromPublicEntry(page: Page): Promise<void> {
  await gotoLobby(page);

  await openAshRoadWorkspace(page);

  const start = page.getByRole('button', { name: 'Start Ash Road', exact: true });
  await expect(start).toBeVisible({ timeout: 5_000 });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeEnabled();
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#lobby')).toBeHidden();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('[data-campaign-mission]')).toHaveAttribute(
    'data-campaign-result', 'active',
  );
  await expect(page.locator('[data-battle-console-surface]'))
    .toHaveAttribute('data-active-commander', 'p1');
  await enterBattleIfBriefed(page);
  const skipCoach = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skipCoach.isVisible()) await skipCoach.click();
}

/**
 * Enter the optional Hot Seat preparation surface for journeys that explicitly
 * exercise crew, Garage, or battlefield controls. The ordinary lobby helper
 * intentionally leaves it closed so first-contact tests observe production.
 */
export async function openHotSeatCustomization(page: Page): Promise<void> {
  await openLocalPreparation(page);
  await expect(page.locator('#lobby .lobby-name').first()).toBeVisible();
}

/**
 * Guard the broad frame invariants shared by every Lobby view. Internal
 * vertical scrolling is allowed for long setup forms, but the document itself
 * must stay single-screen and the card must never overflow horizontally.
 */
export async function assertLobbyFrame(page: Page): Promise<void> {
  const lobbyBox = await page.locator('#lobby').boundingBox();
  const cardBox = await page.locator('#lobby .lobby-card').boundingBox();
  expect(lobbyBox, 'Lobby overlay should have a rendered box').not.toBeNull();
  expect(cardBox, 'Lobby card should have a rendered box').not.toBeNull();

  expect(cardBox!.x).toBeGreaterThanOrEqual(lobbyBox!.x - 1);
  expect(cardBox!.y).toBeGreaterThanOrEqual(lobbyBox!.y - 1);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(lobbyBox!.x + lobbyBox!.width + 1);
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(lobbyBox!.y + lobbyBox!.height + 1);

  const overflow = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('#lobby .lobby-card');
    return {
      documentX: document.documentElement.scrollWidth - window.innerWidth,
      documentY: document.documentElement.scrollHeight - window.innerHeight,
      cardX: card ? card.scrollWidth - card.clientWidth : Number.POSITIVE_INFINITY,
    };
  });
  expect(overflow.documentX, 'Lobby must not create horizontal page scroll').toBeLessThanOrEqual(1);
  expect(overflow.documentY, 'Lobby must not create vertical page scroll').toBeLessThanOrEqual(1);
  expect(overflow.cardX, 'Lobby card must not overflow horizontally').toBeLessThanOrEqual(1);
}

/**
 * Guard the shared preparation contract rather than any mode's former page
 * geometry. The heading, scroll viewport, and decision dock must be direct
 * peers; the dock therefore consumes layout space instead of covering the
 * mode-owned controls beneath it.
 */
export async function assertPreparationFrameGeometry(
  page: Page,
  ownerSelector: string,
): Promise<void> {
  const owner = page.locator(ownerSelector);
  const frame = page.locator(
    `${ownerSelector}[data-preparation-frame], ${ownerSelector} [data-preparation-frame]`,
  );
  await expect(frame).toHaveCount(1);
  await expect(frame).toBeVisible();

  const geometry = await frame.evaluate((element) => {
    const direct = (selector: string) => element.querySelector<HTMLElement>(`:scope > ${selector}`);
    const heading = direct('.preparation-frame__heading');
    const body = direct('.preparation-frame__body');
    const dock = direct('.preparation-frame__dock');
    if (!heading || !body || !dock) {
      throw new Error('Expected direct heading, body viewport, and action dock peers');
    }
    const rect = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const primaryActions = Array.from(
      element.querySelectorAll<HTMLElement>('[data-preparation-primary]'),
    ).filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && box.width > 0 && box.height > 0;
    });
    return {
      frame: rect(element),
      heading: rect(heading),
      body: rect(body),
      dock: rect(dock),
      primaryCount: primaryActions.length,
      primaryInDock: primaryActions.every((node) => dock.contains(node)),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });

  expect(geometry.heading.bottom, 'preparation heading must precede the body')
    .toBeLessThanOrEqual(geometry.body.top + 1);
  expect(geometry.body.bottom, 'preparation body must end before the in-flow dock')
    .toBeLessThanOrEqual(geometry.dock.top + 1);
  expect(geometry.dock.bottom, 'preparation dock must stay inside its frame')
    .toBeLessThanOrEqual(geometry.frame.bottom + 1);
  expect(geometry.primaryCount, 'the active preparation route must expose one primary action')
    .toBe(1);
  expect(geometry.primaryInDock, 'the primary action must be owned by the shared dock').toBe(true);
  expect(geometry.scrollWidth, 'the preparation frame must not overflow horizontally')
    .toBeLessThanOrEqual(geometry.clientWidth + 1);
}

/** Scroll a required mode field through the shared body and prove the dock does
 * not mask it. This is the regression oracle for the former Online Visibility
 * collision at windowed heights. */
export async function assertPreparationFieldReachable(
  page: Page,
  ownerSelector: string,
  fieldSelector: string,
): Promise<void> {
  const owner = page.locator(ownerSelector);
  const field = owner.locator(fieldSelector);
  await field.scrollIntoViewIfNeeded();
  // Chromium may align the requested control a few pixels above a nested
  // scroller's visible edge. Normalize that native scroll result inside the
  // shared body before measuring it against the reserved dock.
  await owner.evaluate((element, selector) => {
    const field = element.querySelector<HTMLElement>(selector);
    const body = element.querySelector<HTMLElement>('.preparation-frame__body');
    if (!field || !body) throw new Error(`Missing required preparation field: ${selector}`);
    const fieldBox = field.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    if (fieldBox.top < bodyBox.top + 8) {
      body.scrollTop += fieldBox.top - bodyBox.top - 8;
    } else if (fieldBox.bottom > bodyBox.bottom - 8) {
      body.scrollTop += fieldBox.bottom - bodyBox.bottom + 8;
    }
  }, fieldSelector);
  await expect(field).toBeVisible();
  const geometry = await owner.evaluate((element, selector) => {
    const field = element.querySelector<HTMLElement>(selector);
    const body = element.querySelector<HTMLElement>('.preparation-frame__body');
    const dock = element.querySelector<HTMLElement>('.preparation-frame__dock');
    if (!field || !body || !dock) throw new Error(`Missing required preparation field: ${selector}`);
    const fieldBox = field.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    const dockBox = dock.getBoundingClientRect();
    return {
      fieldTop: fieldBox.top,
      fieldBottom: fieldBox.bottom,
      bodyTop: bodyBox.top,
      bodyBottom: bodyBox.bottom,
      dockTop: dockBox.top,
    };
  }, fieldSelector);
  expect(geometry.fieldTop, `${fieldSelector} must be reachable inside the body viewport`)
    .toBeGreaterThanOrEqual(geometry.bodyTop - 1);
  expect(geometry.fieldBottom, `${fieldSelector} must clear the action dock`)
    .toBeLessThanOrEqual(Math.min(geometry.bodyBottom, geometry.dockTop) + 1);
}

/** Prove owned workspaces cannot collapse or hide the accepted three-bay command rail. */
export async function assertCommandHeaderAssembly(page: Page): Promise<void> {
  const header = page.locator('#lobby .lobby-command-rail');
  const brand = header.locator('.lobby-command-rail__brand');
  const context = header.locator('.lobby-command-rail__context');
  const dossier = header.locator('.lobby-command-rail__dossier');
  for (const region of [header, brand, context, dossier]) await expect(region).toBeVisible();

  const geometry = await header.evaluate((element) => {
    const bounds = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) throw new Error(`Missing command-header region: ${selector}`);
      return target.getBoundingClientRect().toJSON();
    };
    return {
      header: element.getBoundingClientRect().toJSON(),
      brand: bounds('.lobby-command-rail__brand'),
      context: bounds('.lobby-command-rail__context'),
      dossier: bounds('.lobby-command-rail__dossier'),
    };
  });
  for (const [name, region] of Object.entries({
    brand: geometry.brand,
    context: geometry.context,
    dossier: geometry.dossier,
  })) {
    expect(region.width, `${name} header bay width`).toBeGreaterThan(0);
    expect(region.height, `${name} header bay height`).toBeGreaterThan(0);
    expect(region.left, `${name} header bay left containment`)
      .toBeGreaterThanOrEqual(geometry.header.left - 1);
    expect(region.right, `${name} header bay right containment`)
      .toBeLessThanOrEqual(geometry.header.right + 1);
    expect(region.top, `${name} header bay top containment`)
      .toBeGreaterThanOrEqual(geometry.header.top - 1);
    expect(region.bottom, `${name} header bay bottom containment`)
      .toBeLessThanOrEqual(geometry.header.bottom + 1);
  }
}

/**
 * Prove a primary control is reachable inside the Lobby's own scroll region.
 * Scrolling is intentional: long forms may use internal vertical overflow,
 * but their actions must remain renderable and accessible.
 */
export async function assertLobbyControlReachable(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toHaveCount(1);
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();

  const cardBox = await page.locator('#lobby .lobby-card').boundingBox();
  const controlBox = await control.boundingBox();
  expect(cardBox, 'Lobby card should have a rendered box').not.toBeNull();
  expect(controlBox, `${selector} should have a rendered box`).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThan(0);
  expect(controlBox!.height).toBeGreaterThan(4);
  expect(controlBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
  expect(controlBox!.y).toBeGreaterThanOrEqual(cardBox!.y - 1);
  expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
}

type ActionSemantic = 'safe' | 'danger';

async function assertSemanticActionFill(
  page: Page,
  selector: string,
  semantic: ActionSemantic,
): Promise<{
  border: number[];
  background: string;
  backgroundColor: number[];
  fillStops: number[][];
  intent: string;
  expectedTop: string;
  expectedBottom: string;
}> {
  const action = page.locator(selector).filter({ visible: true });
  await expect(action).toHaveCount(1);
  const palette = await action.evaluate((element, expectedSemantic) => {
    const style = getComputedStyle(element);
    const channels = (value: string): number[] => (
      value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? []
    );
    const fillStops = style.backgroundImage.match(/rgba?\([^)]*\)/g)
      ?.map(channels) ?? [];
    const lobby = element.closest<HTMLElement>('#lobby');
    if (!lobby) throw new Error('Semantic action must remain inside #lobby');
    const lobbyStyle = getComputedStyle(lobby);
    const prefix = expectedSemantic === 'safe'
      ? '--console-safe-action-fill-'
      : '--console-danger-action-fill-';
    const normalizeColor = (value: string): string => {
      const probe = document.createElement('span');
      probe.style.color = value.trim();
      lobby.append(probe);
      const normalized = getComputedStyle(probe).color;
      probe.remove();
      return normalized;
    };
    return {
      border: channels(style.borderTopColor),
      background: style.backgroundImage,
      backgroundColor: channels(style.backgroundColor),
      fillStops,
      intent: style.getPropertyValue('--console-action-semantic').trim(),
      expectedTop: normalizeColor(lobbyStyle.getPropertyValue(`${prefix}top`)),
      expectedBottom: normalizeColor(lobbyStyle.getPropertyValue(`${prefix}bottom`)),
    };
  }, semantic);
  expect(palette.intent, `${selector} must retain its authoritative semantic marker`)
    .toBe(semantic);
  expect(palette.expectedTop, `${selector} must resolve its ${semantic} top fill token`)
    .toMatch(/^rgba?\(/);
  expect(palette.expectedBottom, `${selector} must resolve its ${semantic} bottom fill token`)
    .toMatch(/^rgba?\(/);
  expect(palette.fillStops.length, `${selector} must render at least two gradient fill stops`)
    .toBeGreaterThanOrEqual(2);
  if (semantic === 'safe') {
    const [top, bottom] = palette.fillStops;
    expect(top![0], `${selector} gold top red channel`).toBeGreaterThanOrEqual(230);
    expect(top![1], `${selector} gold top green channel`).toBeGreaterThanOrEqual(160);
    expect(top![2], `${selector} gold top blue channel`).toBeGreaterThanOrEqual(70);
    expect(bottom![0], `${selector} gold bottom red channel`).toBeGreaterThanOrEqual(190);
    expect(bottom![1], `${selector} gold bottom green channel`).toBeGreaterThanOrEqual(110);
    expect(bottom![2], `${selector} gold bottom blue channel`).toBeLessThanOrEqual(100);
  } else {
    expect(palette.background, `${selector} must render the danger top fill token`)
      .toContain(palette.expectedTop);
    expect(palette.background, `${selector} must render the danger bottom fill token`)
      .toContain(palette.expectedBottom);
  }
  return palette;
}

/** Safe launch/deployment actions render the command deck's gold fill, never a bordered fallback. */
export async function assertGoldSafeAction(page: Page, selector: string): Promise<void> {
  const palette = await assertSemanticActionFill(page, selector, 'safe');
  expect(palette.border.length, `${selector} must expose a computed border colour`).toBe(3);
  expect(palette.border[0], `${selector} gold border red channel`).toBeGreaterThanOrEqual(180);
  expect(palette.border[1], `${selector} gold border green channel`).toBeGreaterThanOrEqual(150);
  expect(palette.border[2], `${selector} gold border blue channel`).toBeGreaterThanOrEqual(70);
}

/** Explicit destructive confirmation renders the red danger fill, never the safe gold semantic. */
export async function assertDangerAction(page: Page, selector: string): Promise<void> {
  const palette = await assertSemanticActionFill(page, selector, 'danger');
  expect(palette.border.length, `${selector} must expose a computed border colour`).toBe(3);
  expect(palette.border[0], `${selector} danger border red channel`).toBeGreaterThanOrEqual(180);
  expect(palette.border[1], `${selector} danger border green channel`).toBeLessThan(150);
  expect(palette.border[2], `${selector} danger border blue channel`).toBeLessThan(130);
}

/** Whether the fixed stage is rendered below its compact-scale threshold. */
export async function isCompact(page: Page): Promise<boolean> {
  return page.evaluate(() => !!document.getElementById('app')?.classList.contains('is-compact'));
}

export interface LayoutViolation {
  index: number;
  className: string;
  kind: 'crushed' | 'clipped';
  detail: string;
}

/**
 * The core durable guard. Walk every DIRECT visible child of #hud and flag any
 * that is either:
 *   (a) CRUSHED — box height < 4px while it carries non-empty text content, or
 *   (b) CONTENT-CLIPPED — overflow(-y) is hidden AND scrollHeight exceeds
 *       clientHeight (content taller than the visible box, silently cut off).
 * This catches the whole class of flex-crush / clip bugs, not just the one row
 * that regressed. Returns the offending children (empty array = healthy).
 */
export async function findHudLayoutViolations(page: Page): Promise<LayoutViolation[]> {
  return page.evaluate(() => {
    const hud = document.getElementById('hud');
    if (!hud) return [{ index: -1, className: '(no #hud)', kind: 'crushed', detail: 'missing' } as const];
    const out: {
      index: number;
      className: string;
      kind: 'crushed' | 'clipped';
      detail: string;
    }[] = [];
    const children = Array.from(hud.children);
    children.forEach((el, index) => {
      const cs = getComputedStyle(el);
      // Skip elements that are not laid out at all (display:none / hidden rows).
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // not rendered
      const text = (el.textContent ?? '').trim();
      const className = el.className || el.tagName.toLowerCase();

      if (text.length > 0 && rect.height < 4) {
        out.push({
          index,
          className,
          kind: 'crushed',
          detail: `height=${rect.height.toFixed(2)}px with text "${text.slice(0, 32)}"`,
        });
      }

      const clips = cs.overflowY === 'hidden' || cs.overflow === 'hidden';
      if (clips && el.scrollHeight > el.clientHeight + 1) {
        out.push({
          index,
          className,
          kind: 'clipped',
          detail: `scrollHeight=${el.scrollHeight} > clientHeight=${el.clientHeight} (overflow hidden)`,
        });
      }
    });
    return out;
  });
}

/**
 * Assert numerical Fire Control is not crushed: its rendered box height clears a
 * sane floor. A 10.6px flex-crush (the shipped regression) must fail this. The
 * floor is lower in compact/zoomed layouts (the whole #app is CSS-zoomed down, so
 * boundingBox heights shrink with it) but still far above a clipped console.
 */
export async function assertFireControlHeight(page: Page, compact: boolean): Promise<void> {
  const fire = page.locator('#battle-rail button[data-battle-console-action="fire"]');
  await expect(fire).toBeVisible();
  const box = await fire.boundingBox();
  expect(box, 'Fire Control should have a rendered box').not.toBeNull();
  const floor = compact ? 24 : 40;
  expect(
    box!.height,
    `Fire Control height ${box!.height.toFixed(1)}px should clear ${floor}px (crush guard)`,
  ).toBeGreaterThan(floor);
  // The replacement console has one semantic Fire button and three live DOM
  // instruments. Test their actual rendered ink and bounds, not retired art bays.
  const geometry = await page.locator('[data-battle-console-surface]').evaluate((surface) => {
    const owner = surface.getBoundingClientRect();
    const rail = document.getElementById('battle-rail')!.getBoundingClientRect();
    const selectors = [
      'button[data-battle-console-action="fire"]',
      '[data-battle-console-text-key="commander.health"]',
      '[data-semantic-key="node:span:100 fuel remaining:19"]',
      '[data-semantic-key="node:output:Angle:43"]',
      '[data-semantic-key="node:output:Power:52"]',
      '[data-semantic-key="node:output:Wind:58"]',
    ];
    const fits = (inner: DOMRect, outer: DOMRect) => inner.left >= outer.left - 1
      && inner.top >= outer.top - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;
    return {
      inRail: fits(owner, rail),
      inViewport: owner.left >= -1 && owner.top >= -1 && owner.right <= innerWidth + 1 && owner.bottom <= innerHeight + 1,
      coarse: matchMedia('(pointer: coarse)').matches,
      statusFont: (() => {
        const status = surface.querySelector<HTMLElement>('[data-battle-console-action="fire"] small');
        if (!status) return null;
        return Number.parseFloat(getComputedStyle(status).fontSize)
          * status.getBoundingClientRect().width / status.offsetWidth;
      })(),
      controls: selectors.map(selector => {
        const element = surface.querySelector<HTMLElement>(selector)!;
        const bounds = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const ink = range.getBoundingClientRect();
        return {
          selector, width: bounds.width, height: bounds.height, bounds: bounds.toJSON(), ink: ink.toJSON(),
          contained: fits(bounds, owner),
          // Range includes a font's ascent/descent beyond a tight output line
          // box. Guard horizontal ink and real scroll clipping for readouts;
          // the full Fire label must fit its actual button on both axes.
          inkContained: selector.startsWith('button') ? fits(ink, bounds)
            : ink.left >= bounds.left - 1 && ink.right <= bounds.right + 1 && fits(ink, owner),
          unclipped: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
        };
      }),
    };
  });
  expect(geometry.inRail, 'Console stays inside the battle rail').toBe(true);
  expect(geometry.inViewport, 'Console stays inside the viewport').toBe(true);
  for (const control of geometry.controls) {
    expect(control.width, control.selector).toBeGreaterThan(4);
    expect(control.height, control.selector).toBeGreaterThan(4);
    expect(control.contained, `${control.selector} stays in its console`).toBe(true);
    expect(control.inkContained, `${control.selector} ink stays in its cell: ${JSON.stringify(control)}`).toBe(true);
    expect(control.unclipped, `${control.selector} content is not clipped`).toBe(true);
  }
  if (geometry.coarse) {
    expect(box!.width, 'Fire physical touch width').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'Fire physical touch height').toBeGreaterThanOrEqual(44);
    if (geometry.statusFont !== null) expect(geometry.statusFont, 'Fire status physical font').toBeGreaterThanOrEqual(12);
  }
}

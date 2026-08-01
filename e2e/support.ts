import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the rendering-guardrail specs. Kept separate from the specs
 * so the local layout suite and the post-deploy live smoke assert the SAME
 * geometry invariants against whichever bundle they point at.
 */

/**
 * Navigate to the deterministic hot-seat E2E entrypoint and wait until a game is
 * actually running (the HUD is built and the instrument cluster is on screen).
 * Dismisses the splash overlay so it can't intercept anything.
 */
export async function gotoRunningGame(page: Page): Promise<void> {
  // Relative query (no leading '/') so it resolves against baseURL correctly for
  // BOTH the local root-served preview ('/') and the live project site served under
  // a sub-path ('/singedTerra/') — a leading-slash path would drop the sub-path.
  await page.goto('?e2e=hotseat');
  // The splash mounts on load and covers everything until dismissed; remove it so
  // it never sits over the widgets we measure. (Its own dismiss path just fades +
  // removes this node, so removing it directly is equivalent.)
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  // The HUD builds lazily on the first engine tick; waiting for the instrument
  // cluster to be visible proves the game loop is running, not just the DOM.
  await expect(page.locator('#hud.st-hud')).toBeVisible();
  await expect(page.locator('.st-hud__instruments')).toBeVisible();
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
 * Assert the instrument cluster is not crushed: its rendered box height clears a
 * sane floor. A 10.6px flex-crush (the shipped regression) must fail this. The
 * floor is lower in compact/zoomed layouts (the whole #app is CSS-zoomed down, so
 * boundingBox heights shrink with it) but still far above a clipped console.
 */
export async function assertInstrumentsHeight(page: Page, compact: boolean): Promise<void> {
  const box = await page.locator('.st-hud__instruments').boundingBox();
  expect(box, 'instrument cluster should have a rendered box').not.toBeNull();
  const floor = compact ? 24 : 40;
  expect(
    box!.height,
    `instrument cluster height ${box!.height.toFixed(1)}px should clear ${floor}px (crush guard)`,
  ).toBeGreaterThan(floor);
}

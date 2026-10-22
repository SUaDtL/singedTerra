import { expect, test } from '@playwright/test';
import {
  assertPreparationFrameGeometry,
  gotoLobby,
  openLastStandWorkspace,
  openStandardSkirmishWorkspace,
  selectCommandWorkspace,
} from './support';

const PREPARATION_TRANSITIONS = [
  { width: 1800, height: 900 },
  { width: 1220, height: 900 },
  { width: 900, height: 720 },
  { width: 820, height: 720 },
] as const;

test.describe('preparation body layout ownership', () => {
  test('Last Stand keeps its briefing and deployment dock composed through resize', async ({ page }) => {
    await gotoLobby(page);
    await openLastStandWorkspace(page);
    const root = page.locator('[data-last-stand-command-view]');
    const launch = root.locator('[data-command-action="launch-last-stand"]');
    await launch.focus();
    for (const geometry of [...PREPARATION_TRANSITIONS, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(geometry);
      await expect(launch).toBeFocused();
      await expect(launch).toHaveAttribute('href', /\/last-stand\/$/);
      await expect(page.locator('[data-command-item="ash-road"]')).toHaveCount(0);
      await assertPreparationFrameGeometry(page, '[data-last-stand-command-view]');
      const layout = await root.evaluate((element) => {
        const body = element.querySelector<HTMLElement>('.preparation-frame__body')!;
        const board = body.querySelector<HTMLElement>('.last-stand-command__board')!;
        const heading = element.querySelector<HTMLElement>('.preparation-frame__heading')!;
        const dock = element.querySelector<HTMLElement>('.preparation-frame__dock')!;
        const disclosure = dock.querySelector<HTMLElement>('[data-last-stand-loss-disclosure]')!;
        return {
          overflow: body.scrollWidth - body.clientWidth,
          ordered: heading.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + 1
            && body.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 1,
          boardContained: board.getBoundingClientRect().left >= body.getBoundingClientRect().left - 1
            && board.getBoundingClientRect().right <= body.getBoundingClientRect().right + 1,
          disclosureOwnedByDock: !!disclosure,
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.ordered).toBe(true);
      expect(layout.boardContained).toBe(true);
      expect(layout.disclosureOwnedByDock).toBe(true);
    }
  });

  test('Skirmish facts are attached to the briefing board instead of an implicit body track', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLobby(page);
    await openStandardSkirmishWorkspace(page);

    const layout = await page.locator('[data-skirmish-command-view]').evaluate((root) => {
      const board = root.querySelector<HTMLElement>('.campaign-command__decision');
      const scene = board?.querySelector<HTMLElement>('.campaign-command__scene');
      const facts = root.querySelector<HTMLElement>('.campaign-command__loadout');
      const body = root.querySelector<HTMLElement>('.preparation-frame__body-inner');
      const bodyViewport = root.querySelector<HTMLElement>('.preparation-frame__body');
      if (!board || !scene || !facts || !body || !bodyViewport) {
        throw new Error('Skirmish layout is incomplete');
      }

      const boardRect = board.getBoundingClientRect();
      const bodyRect = bodyViewport.getBoundingClientRect();
      const summaryRect = root.querySelector<HTMLElement>('.skirmish-command__briefing')!.getBoundingClientRect();
      const sceneRect = scene.getBoundingClientRect();
      const factsRect = facts.getBoundingClientRect();
      const factsStyle = getComputedStyle(facts);

      return {
        boardOwnsFacts: board.contains(facts),
        factsRow: factsStyle.gridRowStart,
        factsColumn: factsStyle.gridColumnStart,
        factsWithinBoard: factsRect.left >= boardRect.left - 1
          && factsRect.right <= boardRect.right + 1,
        factsFollowBriefing: factsRect.top >= summaryRect.bottom - 1,
        sceneAttached: sceneRect.bottom <= factsRect.top + 1 || sceneRect.top >= factsRect.bottom - 1,
        bodyAboveDock: bodyRect.bottom <= root.querySelector<HTMLElement>('.preparation-frame__dock')!.getBoundingClientRect().top + 1,
        horizontalOverflow: body.scrollWidth - body.clientWidth,
      };
    });

    expect(layout.boardOwnsFacts, 'facts must belong to the composed Skirmish briefing board')
      .toBe(true);
    expect(layout.factsRow, 'facts must not retain the old named loadout row').toBe('2');
    expect(layout.factsColumn, 'facts must share the briefing board column').toBe('1');
    expect(layout.factsWithinBoard).toBe(true);
    expect(layout.factsFollowBriefing).toBe(true);
    expect(layout.sceneAttached).toBe(true);
    expect(layout.bodyAboveDock).toBe(true);
    const facts = page.locator('.skirmish-command__facts');
    await facts.scrollIntoViewIfNeeded();
    await expect(facts).toBeInViewport();
    expect(layout.horizontalOverflow, 'skirmish body must not clip at the transition width')
      .toBeLessThanOrEqual(1);
  });

  test('Skirmish briefing board stays composed through the same live resize path', async ({ page }) => {
    await page.setViewportSize(PREPARATION_TRANSITIONS[0]);
    await gotoLobby(page);
    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    const launch = page.locator('[data-skirmish-command-view] [data-preparation-primary]');
    await launch.focus();

    for (const geometry of PREPARATION_TRANSITIONS) {
      await page.setViewportSize(geometry);
      await expect(launch).toBeFocused();
      await expect(page.locator('[data-skirmish-command-view]'))
        .toHaveAttribute('data-operation-id', 'crosswind-range');
      const layout = await page.locator('[data-skirmish-command-view]').evaluate((root) => {
        const body = root.querySelector<HTMLElement>('.preparation-frame__body-inner');
        const board = root.querySelector<HTMLElement>('.campaign-command__decision');
        const scene = root.querySelector<HTMLElement>('.campaign-command__scene');
        const facts = root.querySelector<HTMLElement>('.skirmish-command__facts');
        if (!body || !board || !scene || !facts) throw new Error('Skirmish resize layout is incomplete');
        const sceneRect = scene.getBoundingClientRect();
        const factsRect = facts.getBoundingClientRect();
        return {
          horizontalOverflow: body.scrollWidth - body.clientWidth,
          boardOwnsFacts: board.contains(facts),
          factsFollowBriefing: factsRect.top >= root.querySelector<HTMLElement>('.skirmish-command__briefing')!.getBoundingClientRect().bottom - 1,
          sceneAttached: sceneRect.bottom <= factsRect.top + 1 || sceneRect.top >= factsRect.bottom - 1,
          factsWithinBoard: factsRect.left >= board.getBoundingClientRect().left - 1
            && factsRect.right <= board.getBoundingClientRect().right + 1,
        };
      });
      expect(layout.horizontalOverflow, `Skirmish clips at ${geometry.width}px`)
        .toBeLessThanOrEqual(1);
      expect(layout.boardOwnsFacts).toBe(true);
      expect(layout.factsFollowBriefing).toBe(true);
      expect(layout.sceneAttached).toBe(true);
      expect(layout.factsWithinBoard).toBe(true);
    }
  });
});

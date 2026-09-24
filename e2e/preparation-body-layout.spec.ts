import { expect, test } from '@playwright/test';
import {
  gotoLobby,
  openAshRoadWorkspace,
  openStandardSkirmishWorkspace,
  selectCommandWorkspace,
} from './support';

const TRANSITION_VIEWPORT = { width: 1180, height: 860 } as const;
const CAMPAIGN_TRANSITIONS = [
  { width: 1220, height: 900, splitSupport: true, splitMission: true },
  { width: 1180, height: 900, splitSupport: false, splitMission: true },
  { width: 900, height: 720, splitSupport: false, splitMission: true },
  { width: 820, height: 720, splitSupport: false, splitMission: false },
] as const;

test.describe('preparation body layout ownership', () => {
  test('Campaign owns one full-width support stack without inherited grid placement', async ({ page }) => {
    await page.setViewportSize(TRANSITION_VIEWPORT);
    await gotoLobby(page);
    await openAshRoadWorkspace(page);

    const layout = await page.locator('[data-campaign-command-view]').evaluate((root) => {
      const support = root.querySelector<HTMLElement>('.campaign-command__supporting');
      const loadout = support?.querySelector<HTMLElement>(':scope > .campaign-command__loadout');
      const briefing = support?.querySelector<HTMLElement>(':scope > .campaign-command__disclosure');
      const body = root.querySelector<HTMLElement>('.preparation-frame__body-inner');
      if (!support || !loadout || !briefing || !body) throw new Error('Campaign layout is incomplete');

      const supportRect = support.getBoundingClientRect();
      const loadoutRect = loadout.getBoundingClientRect();
      const briefingRect = briefing.getBoundingClientRect();
      const loadoutStyle = getComputedStyle(loadout);
      const briefingStyle = getComputedStyle(briefing);

      return {
        loadoutRow: loadoutStyle.gridRowStart,
        loadoutColumn: loadoutStyle.gridColumnStart,
        briefingRow: briefingStyle.gridRowStart,
        briefingColumn: briefingStyle.gridColumnStart,
        loadoutLeftDelta: Math.abs(loadoutRect.left - supportRect.left),
        loadoutRightDelta: Math.abs(loadoutRect.right - supportRect.right),
        briefingLeftDelta: Math.abs(briefingRect.left - supportRect.left),
        briefingRightDelta: Math.abs(briefingRect.right - supportRect.right),
        ordered: briefingRect.top >= loadoutRect.bottom,
        horizontalOverflow: body.scrollWidth - body.clientWidth,
      };
    });

    expect(layout.loadoutRow, 'loadout must not target a named row from its former parent')
      .toBe('auto');
    expect(layout.loadoutColumn, 'loadout must use the support stack column')
      .toBe('1');
    expect(layout.briefingRow, 'briefing must not target a named row from its former parent')
      .toBe('auto');
    expect(layout.briefingColumn, 'briefing must use the support stack column')
      .toBe('1');
    expect(layout.loadoutLeftDelta).toBeLessThanOrEqual(1);
    expect(layout.loadoutRightDelta).toBeLessThanOrEqual(1);
    expect(layout.briefingLeftDelta).toBeLessThanOrEqual(1);
    expect(layout.briefingRightDelta).toBeLessThanOrEqual(1);
    expect(layout.ordered, 'briefing must follow loadout in the same support stack').toBe(true);
    expect(layout.horizontalOverflow, 'campaign body must not clip at the transition width')
      .toBeLessThanOrEqual(1);
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

  test('Campaign heading content keeps its authored sequence in portrait preparation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLobby(page);
    await openAshRoadWorkspace(page);

    const heading = await page.locator('[data-campaign-command-view]').evaluate((root) => {
      const chapter = root.querySelector<HTMLElement>('.campaign-command__chapter');
      const assignment = root.querySelector<HTMLElement>(
        '.preparation-frame__heading .campaign-command__fact-label',
      );
      const mission = root.querySelector<HTMLElement>('.campaign-command__mission');
      if (!chapter || !assignment || !mission) throw new Error('Campaign heading is incomplete');
      const chapterRect = chapter.getBoundingClientRect();
      const assignmentRect = assignment.getBoundingClientRect();
      const missionRect = mission.getBoundingClientRect();
      return {
        assignmentAfterChapter: assignmentRect.top >= chapterRect.bottom - 1,
        missionAfterAssignment: missionRect.top >= assignmentRect.bottom - 1,
      };
    });

    expect(heading.assignmentAfterChapter, 'assignment label must follow the campaign kicker')
      .toBe(true);
    expect(heading.missionAfterAssignment, 'mission title must follow the assignment label')
      .toBe(true);
  });

  test('Campaign crosses only viable outer and nested grid transitions without losing edits or focus', async ({ page }) => {
    await page.setViewportSize(CAMPAIGN_TRANSITIONS[0]);
    await gotoLobby(page);
    await openAshRoadWorkspace(page);
    const kit = page.locator('.campaign-command__kit-select');
    await kit.selectOption({ index: 1 });
    await kit.focus();

    for (const geometry of CAMPAIGN_TRANSITIONS) {
      await page.setViewportSize(geometry);
      await expect(kit).toHaveValue('assault');
      await expect(kit).toBeFocused();

      const layout = await page.locator('[data-campaign-command-view]').evaluate((root) => {
        const body = root.querySelector<HTMLElement>('.preparation-frame__body-inner');
        const decision = root.querySelector<HTMLElement>('.campaign-command__decision');
        const support = root.querySelector<HTMLElement>('.campaign-command__supporting');
        const equipment = root.querySelector<HTMLElement>('.campaign-command__equipment dd');
        if (!body || !decision || !support || !equipment) {
          throw new Error('Campaign transition layout is incomplete');
        }
        const decisionRect = decision.getBoundingClientRect();
        const supportRect = support.getBoundingClientRect();
        const text = equipment.firstChild;
        const brokenWords: string[] = [];
        if (text?.nodeType === Node.TEXT_NODE && text.textContent) {
          for (const match of text.textContent.matchAll(/[A-Za-z]+/g)) {
            const range = document.createRange();
            range.setStart(text, match.index!);
            range.setEnd(text, match.index! + match[0].length);
            if (range.getClientRects().length > 1) brokenWords.push(match[0]);
          }
        }
        return {
          containerWidth: root.getBoundingClientRect().width,
          horizontalOverflow: body.scrollWidth - body.clientWidth,
          supportBesideMission: supportRect.left >= decisionRect.right - 1,
          missionColumnCount: getComputedStyle(decision).gridTemplateColumns.split(' ').length,
          brokenWords,
        };
      });

      expect(layout.horizontalOverflow, `Campaign clips at ${geometry.width}px`)
        .toBeLessThanOrEqual(1);
      expect(
        layout.supportBesideMission,
        `Campaign support transition at ${geometry.width}px viewport / ${layout.containerWidth}px workspace`,
      )
        .toBe(geometry.splitSupport);
      expect(
        layout.missionColumnCount,
        `Campaign mission transition at ${geometry.width}px viewport / ${layout.containerWidth}px workspace`,
      )
        .toBe(geometry.splitMission ? 2 : 1);
      expect(layout.brokenWords, `Campaign fragments loadout words at ${geometry.width}px`)
        .toEqual([]);
    }
  });

  test('Skirmish briefing board stays composed through the same live resize path', async ({ page }) => {
    await page.setViewportSize(CAMPAIGN_TRANSITIONS[0]);
    await gotoLobby(page);
    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    const launch = page.locator('[data-skirmish-command-view] [data-preparation-primary]');
    await launch.focus();

    for (const geometry of CAMPAIGN_TRANSITIONS) {
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

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { enterBattleIfBriefed, openVerifiedOperations, selectCommandWorkspace } from './support';
import {
  QUALIFYING_FIRE,
  VERIFIED_SESSION_ID,
  gotoVerifiedFixtureLobby,
  installVerifiedNetworkFixture,
  type ReceiptDisposition,
} from './verified-challenge-fixture';

test.use({ storageState: { cookies: [], origins: [] } });

const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';

async function expectContained(child: Locator, parent: Locator, label: string): Promise<void> {
  const [childBox, parentBox] = await Promise.all([child.boundingBox(), parent.boundingBox()]);
  expect(childBox, `${label} should have a rendered box`).not.toBeNull();
  expect(parentBox, `${label} parent should have a rendered box`).not.toBeNull();
  expect(childBox!.x, `${label} left edge`).toBeGreaterThanOrEqual(parentBox!.x - 1);
  expect(childBox!.y, `${label} top edge`).toBeGreaterThanOrEqual(parentBox!.y - 1);
  expect(childBox!.x + childBox!.width, `${label} right edge`)
    .toBeLessThanOrEqual(parentBox!.x + parentBox!.width + 1);
  expect(childBox!.y + childBox!.height, `${label} bottom edge`)
    .toBeLessThanOrEqual(parentBox!.y + parentBox!.height + 1);
}

async function expectModalContained(page: Page, report: Locator): Promise<void> {
  const panel = report.locator('.st-hud__verified-challenge-panel');
  await expect(report).toBeVisible();
  await expect(panel).toBeVisible();
  await expectContained(panel, report, 'verified challenge modal');
  const geometry = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.documentWidth).toBe(geometry.viewportWidth);
}

async function openVerifiedPreparation(page: Page, testInfo: TestInfo): Promise<void> {
  await gotoVerifiedFixtureLobby(page);
  await openVerifiedOperations(page);
  const operationSelector = page.getByRole('tablist', { name: 'Verified operation', exact: true });
  const challengeChoice = operationSelector.getByRole('tab', { name: 'Crosswind Qualification', exact: true });
  await challengeChoice.click();
  await expect(challengeChoice).toHaveAttribute('aria-selected', 'true');
  await expect(operationSelector.getByRole('tab', { name: 'Deployment orders', exact: true }))
    .toHaveAttribute('aria-selected', 'false');
  const trial = page.getByRole('region', { name: 'Crosswind Qualification verified trial' });
  const primary = trial.getByRole('button', { name: 'Check availability and start', exact: true });
  await expect(trial).toBeVisible();
  await expect(page.locator('.lobby-verified-deployment')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start verified deployment', exact: true })).toHaveCount(0);
  await operationSelector.scrollIntoViewIfNeeded();
  await expectContained(operationSelector, page.locator('.lobby-hotseat-scroll'), 'verified operation selector');
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-selection.png') });
  await primary.scrollIntoViewIfNeeded();
  await expect(primary).toBeInViewport({ ratio: 1 });
  await expectContained(primary, trial, 'qualification primary action');
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-preparation.png') });
}

async function launchQualification(page: Page, testInfo: TestInfo): Promise<void> {
  await openVerifiedPreparation(page, testInfo);
  await page.getByRole('button', { name: 'Check availability and start', exact: true }).click();
  await expect(page.locator('#lobby')).toBeHidden();
  await enterBattleIfBriefed(page);
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
}

async function setQualifyingSolutionAndFire(page: Page): Promise<void> {
  const angle = page.locator(ANGLE);
  const power = page.locator(POWER);
  await expect(angle).toHaveText('45°');
  await expect(power).toHaveText('50');
  const aimLeft = page.getByRole('button', { name: 'Aim barrel left', exact: true });
  const powerUp = page.getByRole('button', { name: 'Increase power', exact: true });
  for (let click = 0; click < 13; click += 1) await aimLeft.click();
  for (let click = 0; click < 50; click += 1) await powerUp.click();
  await expect(angle).toHaveText('32°');
  await expect(power).toHaveText('100');
  const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(fire).toBeDisabled();
}

test('[mocked network fixture] CQ1 exposes only accepted battle commands and still fires after rejected-cycle keys', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const fixture = await installVerifiedNetworkFixture(page);
  await launchQualification(page, testInfo);

  for (const targetKey of ['move-left', 'move-right', 'weapon-next', 'armory']) {
    await expect.soft(page.locator(`[data-battle-console-target-key="${targetKey}"]`).first()).toBeDisabled();
  }
  for (const targetKey of ['angle-decrease', 'angle-increase', 'power-decrease', 'power-increase']) {
    await expect.soft(page.locator(`[data-battle-console-target-key="${targetKey}"]`).first()).toBeEnabled();
  }

  // The former input cursor reached Shield after sixteen Q presses even though
  // CQ1 rejected every select_weapon action. Those rejected keys must not change
  // the action emitted by the primary Fire control.
  for (let press = 0; press < 16; press += 1) await page.keyboard.press('q');
  await setQualifyingSolutionAndFire(page);

  await expect.poll(() => fixture.requests.complete.length, { timeout: 30_000 }).toBe(1);
  expect(fixture.requests.complete).toEqual([{
    sessionId: VERIFIED_SESSION_ID,
    transcript: [QUALIFYING_FIRE],
  }]);

  const report = page.locator('[data-ui="verified-challenge-report"]');
  await expect(report.getByRole('heading', { name: 'Crosswind Qualification verified', exact: true })).toBeVisible();
  await report.getByRole('button', { name: 'Return to preparation', exact: true }).click();
  await expect(page.locator('#lobby')).toBeVisible();
});

for (const scenario of [
  { disposition: 'awarded', reward: '+200 verified career XP', medal: 'Crosswind Qualification medal' },
  { disposition: 'already_owned', reward: '+0 XP', medal: 'Medal already owned' },
] as const satisfies readonly { disposition: ReceiptDisposition; reward: string; medal: string }[]) {
  test(`[mocked network fixture] native qualification clear presents the ${scenario.disposition} receipt`, async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    const fixture = await installVerifiedNetworkFixture(page, { disposition: scenario.disposition });
    await launchQualification(page, testInfo);
    await setQualifyingSolutionAndFire(page);
    const report = page.locator('[data-ui="verified-challenge-report"]');
    await expect(report).toBeVisible({ timeout: 30_000 });
    await expect(report.getByRole('heading', { name: 'Crosswind Qualification verified', exact: true })).toBeVisible();
    await expect(report).toContainText(scenario.reward);
    await expect(report).toContainText(scenario.medal);
    await expect(report.getByRole('button', { name: 'Retry verification', exact: true })).toBeHidden();
    await expect(page.locator('.st-hud__overlay--victory')).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'First salvo briefing', exact: true })).toBeHidden();
    await expectModalContained(page, report);

    const returnToPreparation = report.getByRole('button', { name: 'Return to preparation', exact: true });
    await expect(returnToPreparation).toBeEnabled();
    await expect(returnToPreparation).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(returnToPreparation).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`verified-challenge-${scenario.disposition}.png`) });
    expect(fixture.requests.start).toEqual([{
      trialId: 'crosswind-qualification',
      supportedDescriptorVersions: [1],
    }]);
    expect(fixture.requests.complete).toEqual([{
      sessionId: VERIFIED_SESSION_ID,
      transcript: [QUALIFYING_FIRE],
    }]);
    await returnToPreparation.click();
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Crosswind Qualification verified trial' }).locator('button:focus'))
      .toHaveCount(1);
  });
}

test('[mocked network fixture] pending completion becomes a bounded retry and recovers the committed receipt', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const fixture = await installVerifiedNetworkFixture(page, { holdCompletion: true, busyCompletionOnce: true });
  await launchQualification(page, testInfo);
  await setQualifyingSolutionAndFire(page);
  await expect.poll(() => fixture.requests.complete.length, { timeout: 30_000 }).toBe(1);
  const report = page.locator('[data-ui="verified-challenge-report"]');
  await expect(report.getByRole('heading', { name: 'Objective cleared locally', exact: true })).toBeVisible();
  await expect(report).toContainText('Awaiting a verified receipt');
  await expect(report).toContainText('Reward status unconfirmed');
  await expect(page.locator('.st-hud__overlay--victory')).toBeHidden();
  await expectModalContained(page, report);
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-pending.png') });

  fixture.releaseCompletion();
  await expect(report.getByRole('heading', { name: 'Verification needs another attempt', exact: true })).toBeVisible();
  await expect(report).toContainText('Reward status is unconfirmed until the server receipt is recovered');
  const retry = report.getByRole('button', { name: 'Retry verification', exact: true });
  await expect(retry).toBeDisabled();
  await expect(report).toContainText(/Retry available in 00:0[01]|Retry available now/);
  await expect(retry).toBeEnabled({ timeout: 3_000 });
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-retryable.png') });
  await retry.click();
  await expect(report.getByRole('heading', { name: 'Crosswind Qualification verified', exact: true })).toBeVisible();
  await expect(report).toContainText('+200 verified career XP');
  expect(fixture.requests.complete).toHaveLength(1);
  expect(fixture.requests.get).toEqual([{ sessionId: VERIFIED_SESSION_ID }]);
});

test('[mocked network fixture] disabled allocation stays in preparation without a hidden session', async ({ page }, testInfo) => {
  const fixture = await installVerifiedNetworkFixture(page, { startDisabled: true });
  await openVerifiedPreparation(page, testInfo);
  await page.getByRole('button', { name: 'Check availability and start', exact: true }).click();
  const challenge = page.getByRole('region', { name: 'Crosswind Qualification verified trial' });
  await expect(challenge).toContainText('Trial starts are currently disabled by the verified backend');
  await expect(challenge.getByRole('button', { name: 'Check availability again', exact: true })).toBeEnabled();
  await expect(page.locator('#lobby')).toBeVisible();
  expect(fixture.requests.start).toHaveLength(1);
  expect(fixture.requests.get).toHaveLength(0);
  expect(fixture.requests.complete).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-disabled.png') });
});

test('[mocked network fixture] persisted accepted fire resumes exactly and submits without another allocation', async ({ page }, testInfo) => {
  test.setTimeout(30_000);
  const fixture = await installVerifiedNetworkFixture(page, { resumedTranscript: [QUALIFYING_FIRE] });
  await openVerifiedPreparation(page, testInfo);
  await page.getByRole('button', { name: 'Check availability and start', exact: true }).click();
  const report = page.locator('[data-ui="verified-challenge-report"]');
  await expect(report.getByRole('heading', { name: 'Crosswind Qualification verified', exact: true }))
    .toBeVisible({ timeout: 15_000 });
  await expect(report).toContainText('+200 verified career XP');
  await expectModalContained(page, report);
  await page.screenshot({ path: testInfo.outputPath('verified-challenge-resumed.png') });
  expect(fixture.requests.start).toHaveLength(0);
  expect(fixture.requests.get).toEqual([{ sessionId: VERIFIED_SESSION_ID }]);
  expect(fixture.requests.complete).toEqual([{
    sessionId: VERIFIED_SESSION_ID,
    transcript: [QUALIFYING_FIRE],
  }]);
});

test('[mocked network fixture] public ST1 and ordinary practice never allocate a verified challenge', async ({ page }) => {
  const fixture = await installVerifiedNetworkFixture(page);
  await gotoVerifiedFixtureLobby(page, './#challenge=ST1-LL-115');
  await page.getByRole('button', { name: 'Start challenge vs CPU', exact: true }).click();
  await expect(page.locator('#lobby')).toBeHidden();
  expect(fixture.requests.start).toHaveLength(0);
  await gotoVerifiedFixtureLobby(page);
  await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
  await page.getByRole('button', { name: 'Start Crosswind Range', exact: true }).click();
  await expect(page.locator('#lobby')).toBeHidden();
  expect(fixture.requests.start).toHaveLength(0);
});

import { expect, test, type Page } from '@playwright/test';
import { openLocalPreparation } from './support';

test.use({ storageState: { cookies: [], origins: [] } });

const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';
const MAX_REAL_SHOTS = 40;

type RoundObservation = {
  readonly stage: string;
  readonly round: string;
  readonly report: string;
};

async function chooseFoundryPreset(page: Page, player: 1 | 2): Promise<void> {
  const compactTrigger = page.getByRole('button', { name: `Customize Player ${player} tank`, exact: true });
  if (await compactTrigger.isVisible()) await compactTrigger.click();
  await page.getByRole('button', { name: `Apply Foundry preset to Player ${player}`, exact: true }).click();
  const done = page.getByRole('button', { name: 'Done customizing tank', exact: true });
  if (await done.isVisible()) await done.click();
}

async function fillSetting(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByRole('dialog', { name: 'Operations Settings', exact: true }).locator('.lobby-field').filter({ hasText: label });
  await field.locator('input').fill(value);
}

async function numberReading(locator: ReturnType<Page['locator']>): Promise<number> {
  const text = await locator.innerText();
  const value = Number.parseInt(text.replace(/[^0-9-]/g, ''), 10);
  expect(Number.isFinite(value), `Expected numeric instrument reading from ${text}`).toBe(true);
  return value;
}

async function prepareSelfShot(page: Page): Promise<void> {
  const angle = page.locator(ANGLE);
  const power = page.locator(POWER);
  const currentAngle = await numberReading(angle);
  const currentPower = await numberReading(power);
  const targetAngle = 90;

  expect(currentAngle).toBeGreaterThanOrEqual(0);
  expect(currentAngle).toBeLessThanOrEqual(180);
  expect(currentPower).toBeGreaterThanOrEqual(0);
  expect(currentPower).toBeLessThanOrEqual(100);

  if (currentAngle !== targetAngle) {
    const aimControl = currentAngle < targetAngle ? 'Aim barrel right' : 'Aim barrel left';
    for (let step = 0; step < Math.abs(targetAngle - currentAngle); step += 1) {
      await page.getByRole('button', { name: aimControl, exact: true }).click();
    }
  }
  for (let step = 0; step < currentPower; step += 1) {
    await page.getByRole('button', { name: 'Decrease power', exact: true }).click();
  }
  await expect(angle).toHaveText('90°');
  await expect(power).toHaveText('0');
}

type Settlement = 'next-turn' | 'round-over' | 'terminal';

async function fireAndWaitForSettlement(page: Page): Promise<Settlement> {
  const surface = page.locator('[data-battle-console-surface]');
  const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
  const roundShop = page.locator('.st-hud__overlay-panel--round-shop');
  const terminal = page.locator('.st-hud__overlay--victory');
  const activeCommander = await surface.getAttribute('data-active-commander');
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(fire).toBeDisabled();
  let settlement: Settlement | null = null;
  await expect.poll(async () => {
    if (await terminal.isVisible()) settlement = 'terminal';
    else if (await roundShop.isVisible()) settlement = 'round-over';
    else if (await surface.getAttribute('data-active-commander') !== activeCommander) settlement = 'next-turn';
    return settlement;
  }, { timeout: 30_000 }).not.toBeNull();
  if (settlement === 'next-turn') await expect(fire).toBeEnabled();
  return settlement!;
}

test.describe('P11 after-action same-scenario experiment', () => {
  test('reports an actual local best-of-three clinch and replays the configured scenario', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'small-window',
      'P11 public-path proof runs on desktop and pixel-touch; compact layout has dedicated coverage.',
    );
    test.setTimeout(240_000);

    const observedRounds: RoundObservation[] = [];
    try {
      await page.goto('./');
      const splash = page.locator('#st-splash');
      await expect(splash).toBeVisible();
      await splash.click();
      await expect(splash).toBeHidden({ timeout: 5_000 });

      await openLocalPreparation(page);
      await expect(page.locator('button[data-command-item="local-battle"]'))
        .toHaveAttribute('aria-current', 'true');
      await expect(page.locator('[data-multiplayer-command-view="local-battle"]')).toBeVisible();
      await expect(page.locator('.lobby-name').first()).toBeVisible();
      await chooseFoundryPreset(page, 1);
      await chooseFoundryPreset(page, 2);

      await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
      await fillSetting(page, 'Wind cap', '0');
      await fillSetting(page, 'Seed', '1337');
      await fillSetting(page, 'Rounds', '3');
      await fillSetting(page, 'Arms level', '4');
      await page.getByRole('dialog', { name: 'Operations Settings', exact: true })
        .getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();

      const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
      await expect(briefing).toBeVisible();
      await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
      await expect(briefing).toBeHidden();
      await expect(page.locator('.st-hud__round')).toHaveText('Round 1 of 3');

      const terminal = page.locator('.st-hud__overlay--victory');
      const roundShop = page.locator('.st-hud__overlay-panel--round-shop');
      let shots = 0;
      while (!(await terminal.isVisible()) && shots < MAX_REAL_SHOTS) {
        shots += 1;
        await prepareSelfShot(page);
        const settlement = await fireAndWaitForSettlement(page);
        if (settlement === 'terminal') break;
        if (settlement !== 'round-over') continue;

        const roundOverHeading = roundShop.locator('#st-round-over-title');
        await expect(roundOverHeading).toBeVisible();
        observedRounds.push({
          stage: 'between-rounds',
          round: await page.locator('.st-hud__round').innerText(),
          report: await roundOverHeading.getAttribute('aria-label') ?? await roundOverHeading.innerText(),
        });
        await roundShop.getByRole('button', { name: 'Start Next Round', exact: true }).click();
        await expect(roundShop).toBeHidden();
      }

      expect(shots, 'P11 public-path proof stays within its real-shot bound').toBeLessThanOrEqual(MAX_REAL_SHOTS);
      const title = terminal.getByRole('heading');
      const turningPoint = terminal.locator('[data-ui="terminal-turning-point"]');
      const experiment = terminal.locator('[data-ui="terminal-next-experiment"]');
      const replay = terminal.getByRole('button', { name: 'Replay same scenario', exact: true });
      const mainMenu = terminal.getByRole('button', { name: 'Main Menu', exact: true });

      await expect(terminal).toBeVisible({ timeout: 30_000 });
      const terminalRound = await page.locator('.st-hud__round').innerText();
      const roundMatch = /^Round ([23]) of 3$/.exec(terminalRound);
      expect(roundMatch, `Expected a terminal round fact, received ${terminalRound}`).not.toBeNull();
      const winnerMatch = /^(.+) wins$/.exec(await title.innerText());
      expect(winnerMatch, 'Expected the terminal title to identify a winner').not.toBeNull();
      const clinchingRound = roundMatch![1]!;
      const winner = winnerMatch![1]!;
      await expect(turningPoint).toHaveText(`Turning point · Round ${clinchingRound}: ${winner} clinched the match.`);
      await expect(experiment).toHaveText(
        'Experiment · Keep power fixed, change your opening angle, and compare where the first shot lands.',
      );
      expect(await experiment.evaluate((element) => ({
        tabIndex: (element as HTMLElement).tabIndex,
        hasTabIndexAttribute: element.hasAttribute('tabindex'),
      }))).toEqual({ tabIndex: -1, hasTabIndexAttribute: false });
      observedRounds.push({
        stage: 'terminal',
        round: terminalRound,
        report: `${await title.innerText()} | ${await turningPoint.innerText()}`,
      });
      expect(observedRounds.length, 'An actual best-of-three clinch completes at least two rounds').toBeGreaterThanOrEqual(2);
      const escaped = await terminal.evaluate((element) => {
        const panel = element.querySelector<HTMLElement>('.st-hud__overlay-panel');
        if (!panel) throw new Error('Missing terminal panel');
        const bounds = panel.getBoundingClientRect();
        return [...panel.querySelectorAll<HTMLElement>(
          '[data-ui="terminal-turning-point"], [data-ui="terminal-next-experiment"], .st-hud__victory-progression-handoff, .st-hud__victory-primary, .st-hud__restart--ghost',
        )].filter((child) => !child.hidden && child.getBoundingClientRect().height > 0)
          .flatMap((child) => {
            const box = child.getBoundingClientRect();
            const contained = box.left >= bounds.left - 1 && box.right <= bounds.right + 1
              && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
            return contained ? [] : [{ text: child.textContent, box: box.toJSON(), panel: bounds.toJSON() }];
          });
      });
      await terminal.screenshot({ path: testInfo.outputPath('p11-after-action-terminal.png') });
      await testInfo.attach('p11-terminal-layout.json', {
        body: JSON.stringify(await terminal.evaluate((element) =>
          [...element.querySelectorAll<HTMLElement>('.st-hud__overlay-panel, .st-hud__victory-hero, .st-hud__victory-hero > *, .st-hud__victory-report, .st-hud__victory-report > *')]
            .map((item) => {
              const style = getComputedStyle(item);
              return { className: item.className, box: item.getBoundingClientRect().toJSON(),
                display: style.display, rows: style.gridTemplateRows, gap: style.gap,
                padding: style.padding, minHeight: style.minHeight, height: style.height,
                boxSizing: style.boxSizing, overflow: style.overflow };
            })), null, 2),
        contentType: 'application/json',
      });
      expect(escaped, 'Both explanations and every action remain inside the real clinch report').toEqual([]);
      for (const explanation of [turningPoint, experiment]) {
        const physicalFontSize = await explanation.evaluate((element) => {
          const stageScale = document.getElementById('stage')!.getBoundingClientRect().height / 600;
          return Number.parseFloat(getComputedStyle(element).fontSize) * stageScale;
        });
        expect(physicalFontSize, 'P11 explanation meets the existing report readability floor')
          .toBeGreaterThanOrEqual(10.5);
      }

      await expect(replay).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(mainMenu).toBeFocused();
      await page.keyboard.press('Tab');
      const signIn = terminal.getByRole('button', { name: 'Sign in', exact: true });
      await expect(signIn).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(replay).toBeFocused();

      if (testInfo.project.name === 'pixel-touch') await replay.tap();
      else await replay.click();
      await expect(terminal).toBeHidden();
      const surface = page.locator('[data-battle-console-surface]');
      await expect(surface).toHaveAttribute('data-active-commander', 'p1');
      await expect(surface.locator('[data-battle-console-text-key="commander.health"]')).toHaveText('100 HP');
      await expect(page.locator(ANGLE)).toHaveText('45°');
      await expect(page.locator(POWER)).toHaveText('50');
      await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath('p11-after-action-replay.png') });
    } finally {
      await testInfo.attach('p11-observable-round-progress.json', {
        body: JSON.stringify(observedRounds, null, 2),
        contentType: 'application/json',
      });
    }
  });
});

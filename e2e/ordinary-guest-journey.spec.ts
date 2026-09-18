import { expect, test, type Locator, type Page } from '@playwright/test';
import { openLocalPreparation } from './support';

// Deliberately explicit: this test must represent an untouched guest, while the
// configured fixture continues to inherit the project's base URL, device, and
// deny-external-network proxy settings.
test.use({ storageState: { cookies: [], origins: [] } });

const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';
const MAX_NATURAL_HUMAN_SALVOS = 20;

async function chooseFoundryPreset(page: Page, player: 1 | 2): Promise<void> {
  await page.getByRole('button', { name: `Customize Player ${player} tank`, exact: true }).click();
  await page.getByRole('button', { name: `Apply Foundry preset to Player ${player}`, exact: true }).click();
  await page.getByRole('button', { name: 'Done customizing tank', exact: true }).click();
}

async function fillSetting(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByRole('dialog', { name: 'Operations Settings', exact: true }).locator('.lobby-field').filter({ hasText: label });
  await field.locator('input').fill(value);
}

async function stepVisibleValue(
  control: Locator,
  output: Locator,
  target: string,
  limit: number,
): Promise<void> {
  let current = (await output.innerText()).trim();
  for (let step = 0; current !== target && step < limit; step += 1) {
    await control.click();
    await expect.poll(async () => (await output.innerText()).trim(), {
      message: `${await control.getAttribute('aria-label')} changes the visible value`,
    }).not.toBe(current);
    current = (await output.innerText()).trim();
  }
  await expect(output).toHaveText(target);
}

async function setInitialSolution(
  page: Page,
  aimControl: string,
  expectedStartingAngle: string,
): Promise<void> {
  const angle = page.locator(ANGLE);
  const power = page.locator(POWER);
  await expect(angle).toHaveText(expectedStartingAngle);
  await expect(power).toHaveText('50');

  const aim = page.getByRole('button', { name: aimControl, exact: true });
  const decreasePower = page.getByRole('button', { name: 'Decrease power', exact: true });
  for (let click = 0; click < 45; click += 1) await aim.click();
  await expect(angle).toHaveText('90°');
  for (let click = 0; click < 50; click += 1) await decreasePower.click();
  await expect(power).toHaveText('0');
}

async function fireAndWaitForSettlement(page: Page, finalShot = false): Promise<void> {
  const surface = page.locator('[data-battle-console-surface]');
  const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
  const owner = await surface.getAttribute('data-active-commander');
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(fire).toBeDisabled();
  await expect(surface).toHaveAttribute('data-battle-console-phase', /firing|resolving/);

  if (finalShot) return;
  await expect.poll(() => surface.getAttribute('data-active-commander'), { timeout: 30_000 })
    .not.toBe(owner);
  await expect(fire).toBeEnabled({ timeout: 30_000 });
}

test.describe('ordinary guest journey', () => {
  test('starts First Salvo from the untouched guest entry and reaches one real shot', async ({ page }, testInfo) => {
    test.setTimeout(45_000);

    await page.goto('./');
    const splash = page.locator('#st-splash');
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).toBeHidden({ timeout: 5_000 });

    await page.screenshot({ path: testInfo.outputPath('first-salvo-entry.png') });
    await page.getByRole('button', { name: 'Start First Salvo', exact: true }).click();
    const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
    await expect(briefing).toBeVisible();
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await expect(page.locator('.st-hud__round')).toHaveText('Single round');
    await expect(page.locator('#hud [data-ui="quick-operation"]'))
      .toHaveText('First Salvo · A one-round duel that starts with the essentials.');
    await page.screenshot({ path: testInfo.outputPath('first-salvo-battle.png') });

    await page.getByRole('button', { name: 'Fire Baby Missile', exact: true }).click();
    await expect(page.locator('[data-battle-console-surface]'))
      .toHaveAttribute('data-battle-console-phase', /firing|resolving/);
  });

  test('keeps every initial terminal action visible after a natural First Salvo match', async ({ page }, testInfo) => {
    test.setTimeout(150_000);

    await page.goto('./');
    const splash = page.locator('#st-splash');
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).toBeHidden({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Start First Salvo', exact: true }).click();
    const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
    await expect(briefing).toBeVisible();
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();

    const angle = page.locator(ANGLE);
    const power = page.locator(POWER);
    const aimRight = page.getByRole('button', { name: 'Aim barrel right', exact: true });
    const powerDown = page.getByRole('button', { name: 'Decrease power', exact: true });
    await stepVisibleValue(aimRight, angle, '90°', 45);
    await stepVisibleValue(powerDown, power, '1', 50);

    const surface = page.locator('[data-battle-console-surface]');
    const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
    const terminal = page.locator('.st-hud__overlay--victory');
    let acceptedShotCount = 0;
    const observedShots: Array<{
      shot: number;
      acceptedPhase: string | null;
      acceptedCommander: string | null;
      settledPhase?: string | null;
      settledCommander?: string | null;
      terminalVisible?: boolean;
    }> = [];
    try {
      while (!(await terminal.isVisible()) && acceptedShotCount < MAX_NATURAL_HUMAN_SALVOS) {
        await expect(fire).toBeEnabled({ timeout: 30_000 });
        await fire.click();
        await expect(fire, `human salvo ${acceptedShotCount + 1} enters the visible firing state`)
          .toBeDisabled({ timeout: 5_000 });
        acceptedShotCount += 1;
        const observedShot = {
          shot: acceptedShotCount,
          acceptedPhase: await surface.getAttribute('data-battle-console-phase'),
          acceptedCommander: await surface.getAttribute('data-active-commander'),
        } as (typeof observedShots)[number];
        observedShots.push(observedShot);
        await expect.poll(async () => {
          if (await terminal.isVisible()) return 'terminal';
          if (await surface.getAttribute('data-battle-console-phase') === 'game-over') return 'terminal-pending';
          const active = await surface.getAttribute('data-active-commander');
          return active === 'p1' && await fire.isEnabled() ? 'human-turn' : 'settling';
        }, { timeout: 30_000 }).not.toBe('settling');
        observedShot.settledPhase = await surface.getAttribute('data-battle-console-phase');
        observedShot.settledCommander = await surface.getAttribute('data-active-commander');
        observedShot.terminalVisible = await terminal.isVisible();
        if (observedShot.terminalVisible || observedShot.settledPhase === 'game-over') break;
      }
      await expect(terminal, `First Salvo reaches a natural terminal state within ${MAX_NATURAL_HUMAN_SALVOS} accepted human salvos`)
        .toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const receipt = {
        acceptedShotCount,
        phase: await surface.getAttribute('data-battle-console-phase'),
        commander: await surface.getAttribute('data-active-commander'),
        terminalVisible: await terminal.isVisible(),
        payoffStatus: await page.locator('.st-hud__terminal-payoff-status').textContent().catch(() => null),
        observedShots,
      };
      await testInfo.attach('natural-first-salvo-receipt.json', {
        body: JSON.stringify(receipt, null, 2),
        contentType: 'application/json',
      });
      throw new Error(`Natural First Salvo did not settle: ${JSON.stringify(receipt)}`, { cause: error });
    }

    await expect(terminal.locator('[data-ui="quick-operation-report"]'))
      .toHaveText('Operation · First Salvo — A one-round duel that starts with the essentials.');
    await expect(terminal.locator('[data-ui="terminal-next-experiment"]')).toBeVisible();
    await expect(terminal.locator('.st-hud__victory-progression-handoff')).toBeVisible();
    const panel = terminal.locator('.st-hud__overlay-panel--victory');
    await panel.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    await panel.screenshot({
      path: testInfo.outputPath(`natural-first-salvo-terminal-${testInfo.project.name}.png`),
    });

    const initial = await panel.evaluate((element) => {
      const panelBox = element.getBoundingClientRect();
      const bounds = (selector: string) => {
        const target = element.querySelector<HTMLElement>(selector);
        if (!target) throw new Error(`Missing ${selector}`);
        return target.getBoundingClientRect().toJSON();
      };
      return {
        panel: panelBox.toJSON(),
        primary: bounds('[data-terminal-primary]'),
        menu: bounds('[data-terminal-menu]'),
      };
    });
    for (const [name, bounds] of Object.entries({ primary: initial.primary, menu: initial.menu })) {
      expect(bounds.top, `${name} starts inside the untouched terminal panel`)
        .toBeGreaterThanOrEqual(initial.panel.top - 1);
      expect(bounds.bottom, `${name} is completely visible in the untouched terminal panel`)
        .toBeLessThanOrEqual(initial.panel.bottom + 1);
    }
  });

  test('reaches a terminal local match and retry through public controls', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-fine',
      'One Chromium guest critical path; touch and small-window remain covered by their layout journeys.',
    );
    test.setTimeout(150_000);

    // This is intentionally the ordinary root URL: no E2E query, DOM removal,
    // engine hook, or storage mutation may replace a guest-facing action.
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
    await fillSetting(page, 'Rounds', '1');
    await fillSetting(page, 'Arms level', '4');
    await page.getByRole('dialog', { name: 'Operations Settings', exact: true })
      .getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();

    const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
    await expect(briefing).toBeVisible();
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await expect(briefing).toBeHidden();
    await expect(page.locator(ANGLE)).toHaveText('45°');

    await setInitialSolution(page, 'Aim barrel right', '45°');
    await fireAndWaitForSettlement(page);
    await setInitialSolution(page, 'Aim barrel left', '135°');
    await fireAndWaitForSettlement(page);
    for (let shot = 0; shot < 4; shot += 1) await fireAndWaitForSettlement(page);
    await fireAndWaitForSettlement(page, true);

    const terminal = page.locator('.st-hud__overlay--victory');
    await expect(terminal).toBeVisible({ timeout: 30_000 });
    await expect(terminal.getByRole('heading', { name: 'Player 2 wins', exact: true })).toBeVisible();
    await expect(terminal.locator('[data-ui="terminal-turning-point"]')).toBeHidden();
    await expect(terminal.locator('[data-ui="terminal-next-experiment"]')).toHaveText(
      'Experiment · Keep power fixed, change your opening angle, and compare where the first shot lands.',
    );
    await terminal.screenshot({ path: testInfo.outputPath('ordinary-guest-terminal.png') });

    await terminal.getByRole('button', { name: 'Replay same scenario', exact: true }).click();
    await expect(terminal).toBeHidden();
    const surface = page.locator('[data-battle-console-surface]');
    await expect(surface).toHaveAttribute('data-active-commander', 'p1');
    await expect(surface.locator('[data-battle-console-text-key="commander.health"]')).toHaveText('100 HP');
    await expect(page.locator(ANGLE)).toHaveText('45°');
    await expect(page.locator(POWER)).toHaveText('50');
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('ordinary-guest-retry.png') });
  });
});

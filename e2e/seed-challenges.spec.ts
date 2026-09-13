import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

async function openChallenge(page: Page, suffix: string): Promise<void> {
  await page.goto(`./${suffix}`);
  const splash = page.locator('#st-splash');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toBeHidden();
}

async function enterChallenge(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start challenge vs CPU', exact: true }).click();
  const briefing = page.getByRole('dialog', { name: 'First salvo briefing' });
  await expect(briefing).toBeVisible();
  await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
  await expect(briefing).toBeHidden();
  await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
}

for (const [code, title, seed] of [
  ['ST1-LL-115', 'Last Light Siege', '1337'],
  ['ST1-CW-16', 'Crosswind Range', '42'],
] as const) {
  test(`public ${title} link requires explicit launch and retains operation identity`, async ({ page }, testInfo) => {
    await openChallenge(page, `#challenge=${code}`);
    const callout = page.locator('[data-ui="seed-challenge"]');
    const challengeTitle = callout.getByRole('heading', { name: title });
    const challengeObjective = callout.locator('[data-ui="seed-challenge-objective"]');
    const challengeSeed = callout.locator('[data-ui="seed-challenge-seed"]');
    await expect(challengeTitle).toBeVisible();
    await expect(challengeObjective).toBeVisible();
    await expect(challengeSeed).toHaveText(`Seed · ${seed}`);
    await expect(page.locator('[data-console-owner="preact"]')).toBeHidden();
    const start = callout.getByRole('button', { name: 'Start challenge vs CPU' });
    await expect(start).toBeInViewport();
    const geometry = await start.boundingBox();
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      expect(geometry!.height).toBeGreaterThanOrEqual(44);
    }
    const receiverGeometry = await page.locator('.lobby-deployment').evaluate((deployment) => {
      const masthead = deployment.querySelector<HTMLElement>('.lobby-deployment__masthead');
      const chooser = deployment.querySelector<HTMLElement>('.lobby-deployment-chooser');
      const challenge = deployment.querySelector<HTMLElement>('[data-ui="seed-challenge"]');
      if (!masthead || !chooser || !challenge) throw new Error('Missing challenge receiver structure');
      const bounds = (element: HTMLElement) => element.getBoundingClientRect().toJSON();
      return {
        deployment: bounds(deployment),
        masthead: bounds(masthead),
        chooser: bounds(chooser),
        challenge: bounds(challenge),
        overflowY: getComputedStyle(chooser).overflowY,
        clientHeight: chooser.clientHeight,
        scrollHeight: chooser.scrollHeight,
      };
    });
    expect(receiverGeometry.chooser.top, 'challenge lane begins below the command masthead')
      .toBeGreaterThanOrEqual(receiverGeometry.masthead.bottom - 1);
    expect(receiverGeometry.chooser.bottom, 'challenge lane stays inside deployment preparation')
      .toBeLessThanOrEqual(receiverGeometry.deployment.bottom + 1);
    expect(receiverGeometry.challenge.top, 'challenge callout begins inside its scroll lane')
      .toBeGreaterThanOrEqual(receiverGeometry.chooser.top - 1);
    expect(receiverGeometry.overflowY).toBe('auto');
    expect(receiverGeometry.scrollHeight).toBeGreaterThanOrEqual(receiverGeometry.clientHeight);
    for (const content of [challengeTitle, challengeObjective, challengeSeed, start]) {
      await expect(content).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath('seed-challenge-receiver.png') });
    const receiverContent = await callout.evaluate((element) => {
      const stage = element.closest('.lobby-card')!.getBoundingClientRect();
      const header = document.querySelector('.lobby-deployment__masthead')!.getBoundingClientRect();
      const scale = stage.height / 600;
      return { stage: stage.toJSON(), header: header.toJSON(), children: [...element.children].map((child) => {
        const target = child as HTMLElement;
        return { text: target.textContent, box: target.getBoundingClientRect().toJSON(),
          font: Number.parseFloat(getComputedStyle(target).fontSize) * scale,
          clientWidth: target.clientWidth, scrollWidth: target.scrollWidth };
      }) };
    });
    for (const item of receiverContent.children) {
      expect(item.box.top, `${item.text} starts below the lobby header`).toBeGreaterThanOrEqual(receiverContent.header.bottom - 1);
      expect(item.box.bottom, `${item.text} stays inside the stage`).toBeLessThanOrEqual(receiverContent.stage.bottom + 1);
      expect(item.box.left).toBeGreaterThanOrEqual(receiverContent.stage.left - 1);
      expect(item.box.right).toBeLessThanOrEqual(receiverContent.stage.right + 1);
      expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 1);
      expect(item.font, `${item.text} remains readable`).toBeGreaterThanOrEqual(10.5);
    }
    await enterChallenge(page);
    await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
    await expect(page.locator('#hud [data-ui="quick-operation"]')).toContainText(title);
    await expect(page.locator('#hud [data-ui="field-order"]')).toContainText(
      title === 'Last Light Siege' ? 'Hold the Field' : 'First Strike',
    );
    await expect(page.locator('.st-hud__round')).toHaveText('Round 1 of 3');
  });
}

for (const suffix of [
  '#challenge=ST1-CW-17',
  '#challenge=ST2-LL-16',
  '#challenge=ST1-LL-016',
  '?join=ABCD#challenge=ST1-LL-16',
]) {
  test(`invalid or colliding challenge stays inert: ${suffix}`, async ({ page }) => {
    const joinRequests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/join_room')) joinRequests.push(request.url()); });
    await openChallenge(page, suffix);
    await expect(page.getByRole('button', { name: 'Start challenge vs CPU' })).toHaveCount(0);
    await expect(page.locator('[data-console-owner="preact"]')).toBeHidden();
    // A room invite owns its route; otherwise the chooser explains rejection.
    if (suffix.startsWith('?join=')) {
      await expect(page.getByRole('tabpanel', { name: 'Play Online preparation' })).toBeVisible();
      await expect(page.locator('.lobby-code-input')).toHaveValue('ABCD');
      await expect(page.getByRole('button', { name: 'Join Room', exact: true })).toBeVisible();
      expect(joinRequests).toEqual([]);
    } else {
      await expect(page.locator('[data-ui="seed-challenge-error"]'))
        .toHaveText('This seed challenge is invalid or no longer supported.');
    }
  });
}

test('a real imported duel shares its canonical link and restarts without progression handoff', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => {
        document.documentElement.dataset['copiedChallenge'] = value;
      },
    } });
  });
  await openChallenge(page, '#challenge=ST1-LL-115');
  await enterChallenge(page);
  const terminal = page.locator('.st-hud__overlay--victory');
  const shop = page.locator('.st-hud__overlay-panel--round-shop');
  const surface = page.locator('[data-battle-console-surface]');
  const humanCommander = await surface.getAttribute('data-active-commander');
  expect(humanCommander).not.toBeNull();
  const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
  let shots = 0;
  while (!(await terminal.isVisible()) && shots < 30) {
    if (await shop.isVisible()) {
      await shop.getByRole('button', { name: 'Start Next Round', exact: true }).click();
      await expect(shop).toBeHidden();
    }
    await expect.poll(async () => {
      if (await terminal.isVisible()) return 'terminal';
      if (await shop.isVisible()) return 'round';
      return (await surface.getAttribute('data-active-commander')) === humanCommander
        && await fire.isEnabled({ timeout: 100 }).catch(() => false) ? 'human' : 'waiting';
    }, { timeout: 30_000 }).not.toBe('waiting').catch(async (error: unknown) => {
      await page.screenshot({ path: testInfo.outputPath('seed-challenge-settlement-failure.png') });
      await testInfo.attach('seed-challenge-settlement.json', { body: JSON.stringify(await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.st-hud__overlay--victory,.st-hud__overlay-panel--victory,.st-hud__victory-report,.st-hud__victory-report > *')]
          .map((element) => ({ className: element.className, rect: element.getBoundingClientRect().toJSON(),
            display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility,
            hidden: element.hidden, text: element.textContent?.slice(0,150) })))), contentType: 'application/json' });
      throw error;
    });
    if (await terminal.isVisible()) break;
    if (await shop.isVisible()) continue;
    const angle = page.locator('[data-semantic-key="node:output:Angle:43"]');
    const power = page.locator('[data-semantic-key="node:output:Power:52"]');
    const currentAngle = Number.parseInt(await angle.innerText(), 10);
    const currentPower = Number.parseInt(await power.innerText(), 10);
    for (let step = 0; step < Math.abs(90 - currentAngle); step += 1) {
      await page.getByRole('button', { name: currentAngle < 90 ? 'Aim barrel right' : 'Aim barrel left', exact: true }).click();
    }
    for (let step = 0; step < currentPower; step += 1) {
      await page.getByRole('button', { name: 'Decrease power', exact: true }).click();
    }
    await expect(angle).toHaveText('90°');
    await expect(power).toHaveText('0');
    await fire.click();
    await expect(fire).toBeDisabled();
    shots += 1;
  }
  await expect(terminal).toBeVisible();
  await expect(terminal.locator('[data-ui="quick-operation-report"]')).toContainText('Last Light Siege');
  await expect(terminal.locator('.st-hud__victory-progression-handoff')).toBeHidden();
  const copy = terminal.getByRole('button', { name: 'Copy challenge link', exact: true });
  await expect(copy).toBeInViewport();
  await copy.click();
  const canonical = new URL('./#challenge=ST1-LL-115', testInfo.project.use.baseURL).href;
  await expect(page.locator('html')).toHaveAttribute('data-copied-challenge', canonical);
  await expect(terminal.locator('[data-ui="seed-challenge-copy-status"]')).toHaveText('Challenge link copied');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await copy.click();
  const fallback = terminal.getByRole('textbox', { name: 'Challenge link', exact: true });
  await expect(fallback).toBeFocused();
  await expect(fallback).toHaveValue(canonical);
  expect(await fallback.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]))
    .toEqual([0, canonical.length]);
  await page.screenshot({ path: testInfo.outputPath('seed-challenge-terminal-fallback.png') });
  const shareGeometry = await terminal.locator('[data-ui="seed-challenge-share"]').evaluate((element) => {
    const scale = document.getElementById('stage')!.getBoundingClientRect().height / 600;
    return [...element.querySelectorAll<HTMLElement>('button,input,[role="status"]')].map((target) => ({
      tag: target.tagName, text: target.textContent, font: Number.parseFloat(getComputedStyle(target).fontSize) * scale,
      height: target.getBoundingClientRect().height, coarse: matchMedia('(pointer: coarse)').matches,
    }));
  });
  for (const item of shareGeometry) {
    expect(item.font, `${item.tag} challenge sharing text remains readable`).toBeGreaterThanOrEqual(10.5);
    if (item.coarse && item.tag !== 'DIV') expect(item.height).toBeGreaterThanOrEqual(44);
  }
  const escaped = await terminal.evaluate((element) => {
    const panel = element.querySelector('.st-hud__overlay-panel')!.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>('button,input')]
      .filter((target) => target.getBoundingClientRect().height > 0)
      .filter((target) => {
        const box = target.getBoundingClientRect();
        return box.left < panel.left - 1 || box.right > panel.right + 1
          || box.top < panel.top - 1 || box.bottom > panel.bottom + 1;
      }).map((target) => target.outerHTML);
  });
  expect(escaped).toEqual([]);
  await terminal.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(terminal).toBeHidden();
  await expect(fire).toBeEnabled();
  await expect(page.locator('.st-hud__round')).toHaveText('Round 1 of 3');
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(page.locator('#hud [data-ui="quick-operation"]')).toContainText('Last Light Siege');
});

import { expect, test, type Page } from '@playwright/test';
import { gotoRunningGame } from './support';

interface HotSeatProbe {
  phase: string;
  turn: number;
  activePlayerId: string;
  projectileCount: number;
  forwardedActions: { setAngle: number; setPower: number; fire: number };
}

interface CanonicalActionRow {
  id: string;
  room_id: string;
  seq: number;
  player_id: string;
  action: Record<string, unknown>;
  created_at: string;
}

async function readHotSeatProbe(page: Page): Promise<HotSeatProbe> {
  return page.evaluate(() => (
    window as typeof window & { __SINGED_TERRA_E2E__: HotSeatProbe }
  ).__SINGED_TERRA_E2E__);
}

async function acknowledgeBriefing(page: Page): Promise<void> {
  const briefing = page.locator('[data-ui="first-salvo-briefing"]');
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText('Aim');
  await expect(briefing).toContainText('Wind');
  await expect(briefing).toContainText('Commit');
  const enter = briefing.getByRole('button', { name: 'Enter battle', exact: true });
  await expect(enter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(briefing).toBeHidden();
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await skip.click();
}

async function chooseMissileAndRestoreArsenalFocus(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Open Armory — equip or buy weapons', exact: true });
  await trigger.click();
  const drawer = page.locator('[data-ui="arsenal-drawer"]');
  await expect(drawer).toHaveClass(/st-hud__strip--open/);
  await expect(drawer.getByRole('button', { name: 'Close Armory', exact: true })).toBeFocused();
  await drawer.locator('button[data-weapon="missile"]').click();
  await expect(page.locator('#battle-rail .st-hud__weapon-value')).toHaveText('Missile');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveClass(/st-hud__strip--collapsed/);
  await expect(trigger).toBeFocused();
}

async function adjustSolutionAndMove(page: Page): Promise<void> {
  const fuel = page.getByRole('progressbar', { name: 'Movement fuel' });
  const fuelBefore = Number(await fuel.getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
  await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
  await expect.poll(async () => Number(await fuel.getAttribute('aria-valuenow')))
    .toBeLessThan(fuelBefore);
}

async function exerciseExistingAimGuide(page: Page): Promise<void> {
  const guide = page.locator('[data-ui="deterministic-aim-guide"]');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Guide');
  await expect(guide.locator('kbd')).toHaveText('G');
  const before = await readHotSeatProbe(page);
  await page.keyboard.press('g');
  await expect(page.locator('.st-hud__toast')).toHaveText('🎯 Aim guide off');
  await page.keyboard.press('g');
  await expect(page.locator('.st-hud__toast')).toHaveText('🎯 Aim guide on');
  expect((await readHotSeatProbe(page)).forwardedActions).toEqual(before.forwardedActions);
}

async function installOnlineCpuFixture(page: Page): Promise<{
  rows: CanonicalActionRow[];
  submissions: Array<Record<string, unknown>>;
}> {
  const roomId = 'room-command-console';
  const humanId = 'player-command-console';
  const cpuId = 'cpu-command-console';
  const players = [
    { id: humanId, name: 'Ranger', color: '#e84d4d', ready: false },
    { id: cpuId, name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'easy' },
  ];
  const options = {
    maxPlayers: 2,
    maxWind: 6,
    gravity: 0.15,
    rulesetVersion: 2,
    walls: 'open',
    rounds: 1,
    armsLevel: 0,
  };
  const rows: CanonicalActionRow[] = [];
  const submissions: Array<Record<string, unknown>> = [];

  await page.route('**/functions/v1/create_room', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roomId,
      code: 'RAIL',
      playerId: humanId,
      token: ['e2e', 'seat', 'command-console'].join('-'),
      options,
      players,
    }),
  }));
  await page.route('**/functions/v1/ready_up', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      started: true,
      players: players.map((player) => ({ ...player, ready: true })),
    }),
  }));
  await page.route('**/functions/v1/submit_action', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submissions.push(body);
    const action = body['action'] as Record<string, unknown>;
    const playerId = typeof body['actingPlayerId'] === 'string'
      ? body['actingPlayerId']
      : humanId;
    rows.push({
      id: `action-${rows.length}`,
      room_id: roomId,
      seq: rows.length,
      player_id: playerId,
      action,
      created_at: '2026-08-15T00:00:00.000Z',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, seq: rows.length - 1 }),
    });
  });
  await page.route('**/rest/v1/room_actions**', async (route) => {
    const url = new URL(route.request().url());
    const seqFilter = url.searchParams.get('seq');
    const minimumSeq = seqFilter?.startsWith('gte.') ? Number(seqFilter.slice(4)) : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      body: JSON.stringify(rows.filter((row) => row.seq >= minimumSeq)),
    });
  });

  return { rows, submissions };
}

test.describe('adaptive command console causal journeys', () => {
  test('hot-seat commander completes one real decision loop through impact and handoff', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'one causal journey; viewport contracts run separately');
    test.setTimeout(45_000);
    await page.goto('?e2e=hotseat&tutorial=first-salvo&seed=1337');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await expect(page.locator('#hud.st-hud')).toHaveCount(1);
    await expect(page.locator('[data-value-owner="angle"]')).toBeVisible();
    await acknowledgeBriefing(page);
    await chooseMissileAndRestoreArsenalFocus(page);
    await adjustSolutionAndMove(page);
    await exerciseExistingAimGuide(page);

    const before = await readHotSeatProbe(page);
    const fire = page.locator('#battle-rail .st-hud__primary-action');
    await expect(fire).toHaveCount(1);
    await fire.click();
    await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
      .toHaveAttribute('data-command-mode', /tracking|resolving/);
    await expect(page.locator('#battle-rail .st-hud__primary-action')).toHaveCount(0);
    const lastSalvo = page.locator('[data-ui="last-salvo-cue"]');
    await expect(lastSalvo).not.toHaveAttribute('hidden', '', { timeout: 30_000 });
    await expect(lastSalvo).toBeVisible();
    const lastSalvoReceipt = await lastSalvo.textContent() ?? '';
    expect(lastSalvoReceipt).toMatch(/PX|DIRECT HIT|ON LINE/);
    expect(lastSalvoReceipt).toMatch(/SHIFT IMPACT|HOLD COURSE/);
    await page.keyboard.down('f');
    await expect.poll(() => readHotSeatProbe(page), { timeout: 20_000 }).toMatchObject({
      phase: 'PLAYER_TURN',
      turn: before.turn + 1,
      activePlayerId: 'p2',
      projectileCount: 0,
      forwardedActions: { fire: before.forwardedActions.fire + 1 },
    });
    await page.keyboard.up('f');
    await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
      .toHaveAttribute('data-command-mode', 'decision');
    await expect(page.locator('#battle-rail .st-hud__primary-action')).toHaveCount(1);
    expect((await readHotSeatProbe(page)).forwardedActions.fire).toBe(before.forwardedActions.fire + 1);
  });

  test('online CPU commander recovers one canonical Fire after a withheld realtime echo', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'one causal network journey; viewport contracts run separately');
    test.setTimeout(45_000);
    const fixture = await installOnlineCpuFixture(page);
    await page.goto('?tutorial=first-salvo');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await page.getByRole('button', { name: 'Play Online', exact: true }).click();
    await page.locator('#lobby .lobby-name').fill('Ranger');
    await page.locator('.lobby-field').filter({ hasText: 'CPU opponents' })
      .locator('select').first().selectOption('1');
    await page.getByRole('button', { name: 'Create operation', exact: true }).click();
    await page.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await expect(page.locator('[data-value-owner="angle"]')).toBeVisible();
    await acknowledgeBriefing(page);
    await chooseMissileAndRestoreArsenalFocus(page);

    await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
    await page.getByRole('button', { name: 'Increase power', exact: true }).click();
    await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
    const fire = page.locator('#battle-rail .st-hud__primary-action');
    await expect(fire).toHaveCount(1);
    await fire.click();
    await page.keyboard.down('f');
    await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
      .toHaveAttribute('data-command-mode', 'submitting');
    await expect.poll(() => fixture.rows.map((row) => row.action['type']))
      .toEqual(['move', 'fire']);
    await expect.poll(() => fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && body['actingPlayerId'] === undefined).length).toBe(1);

    await expect(page.locator('#battle-rail .st-hud__fire-terminal'), 'watchdog log resync must recover the accepted canonical shot')
      .toHaveAttribute('data-command-mode', /tracking|resolving|handoff/, { timeout: 15_000 });
    await expect.poll(() => fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && typeof body['actingPlayerId'] === 'string').length, { timeout: 20_000 })
      .toBe(1);
    await page.keyboard.up('f');
    await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
      .toHaveAttribute('data-command-mode', 'handoff');
    await expect(page.locator('#battle-rail .st-hud__console-state')).toContainText('CPU');
    await expect(page.locator('#battle-rail .st-hud__primary-action')).toHaveCount(0);
    expect(fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && body['actingPlayerId'] === undefined)).toHaveLength(1);
  });
});

test('command console retains its visual contract through the decision phase', async ({ page }) => {
  await gotoRunningGame(page);
  const contract = await page.locator('#battle-rail').evaluate((rail) => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
        && box.width > 0 && box.height > 0;
    };
    const physicalFont = (element: HTMLElement): number => {
      const logical = Number.parseFloat(getComputedStyle(element).fontSize);
      const app = document.getElementById('app')!;
      const zoomScale = app.offsetWidth > 0
        ? app.getBoundingClientRect().width / app.offsetWidth
        : 1;
      return logical * zoomScale;
    };
    const meaningful = [...rail.querySelectorAll<HTMLElement>(
      '.st-hud__turn-owner, .st-hud__fuel-label, .st-hud__fuel-value, .st-hud__weapon-label, .st-hud__weapon-value, .st-hud__weapon-ammo, .st-hud__solution-adjustment-label, .st-hud__console-state, .st-hud__primary-action-label, .st-hud__trajectory-guide, .st-hud__move-btn kbd, .st-hud__solution-control kbd',
    )].filter(visible);
    const critical = [...rail.querySelectorAll<HTMLElement>(
      '.st-hud__turn-owner, .st-hud__fuel-value, .st-hud__weapon-value, .st-hud__console-state, .st-hud__primary-action-label',
    )].filter(visible);
    const smallest = (elements: HTMLElement[]) => elements
      .map((element) => ({
        value: physicalFont(element),
        className: element.className,
        text: element.textContent?.trim(),
      }))
      .sort((left, right) => left.value - right.value)[0]!;
    const zones = [...rail.querySelectorAll<HTMLElement>(
      ':scope > .st-hud__console-context, :scope > .st-hud__console-solution',
    )].map((element) => element.getBoundingClientRect().toJSON());
    const overlaps = zones.flatMap((left, index) => zones.slice(index + 1).map((right) => (
      left.left < right.right - 1 && left.right > right.left + 1
      && left.top < right.bottom - 1 && left.bottom > right.top + 1
    ))).filter(Boolean).length;
    const ledger = document.getElementById('hud')!;
    return {
      windVisible: visible(rail.querySelector('[data-value-owner="wind"]')!),
      minimumMeaningfulFont: smallest(meaningful),
      minimumCriticalFont: smallest(critical),
      overlaps,
      activeCommits: [...rail.querySelectorAll<HTMLButtonElement>('.st-hud__primary-action')]
        .filter((button) => visible(button) && !button.disabled).length,
      ledgerCombat: ledger.querySelectorAll(
        '[data-ui="weapon-bay"], [data-control="angle"], [data-control="power"], [data-ui="arsenal-drawer"], .st-hud__primary-action',
      ).length,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      overflowY: document.documentElement.scrollHeight - window.innerHeight,
      alternateDecks: document.querySelectorAll('.st-hud__touch-strip').length,
    };
  });
  expect(contract.windVisible).toBe(true);
  expect(
    contract.minimumMeaningfulFont.value,
    `smallest meaningful command text: ${JSON.stringify(contract.minimumMeaningfulFont)}`,
  ).toBeGreaterThanOrEqual(11);
  expect(
    contract.minimumCriticalFont.value,
    `smallest critical command text: ${JSON.stringify(contract.minimumCriticalFont)}`,
  ).toBeGreaterThanOrEqual(12);
  expect(contract.overlaps).toBe(0);
  expect(contract.activeCommits).toBe(1);
  expect(contract.ledgerCombat).toBe(0);
  expect(contract.overflowX).toBeLessThanOrEqual(1);
  expect(contract.overflowY).toBeLessThanOrEqual(1);
  expect(contract.alternateDecks).toBe(0);
});

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
  const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
  await expect(briefing).toBeVisible();
  await expect(briefing.getByRole('heading', { name: 'Field briefing' })).toBeVisible();
  const enter = briefing.getByRole('button', { name: 'Enter battle', exact: true });
  await expect(enter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(briefing).toBeHidden();
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await skip.click();
}

async function chooseMissileAndRestoreArsenalFocus(page: Page, purchase = true): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Open Armory', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Armory', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close Armory', exact: true })).toBeFocused();
  const missile = drawer.locator('[data-battle-console-armory-item]').filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) });
  await expect(missile.locator('[data-battle-console-owned]')).toHaveText('4 ammo');
  await missile.getByRole('button', { name: 'Equip', exact: true }).click();
  if (purchase) {
    await missile.getByRole('button', { name: /^Buy/ }).click();
    await expect(missile.locator('[data-battle-console-owned]')).toHaveText('9 ammo');
    await expect(drawer.locator('[data-battle-console-credits]')).toHaveText('$6,125');
  }
  await expect(missile.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
  await expect(page.locator('[data-battle-console-target-key="weapon-next"]')).toHaveAccessibleName('Select next weapon, current Missile');
  await expect(page.getByRole('dialog', { name: 'Store' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function adjustSolutionAndMove(page: Page): Promise<void> {
  const fuel = page.locator('[data-semantic-key="node:span:100 fuel remaining:19"]');
  const fuelBefore = Number(await fuel.textContent());
  await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
  await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
  await expect.poll(async () => Number(await fuel.textContent()))
    .toBeLessThan(fuelBefore);
}

async function exerciseBattleSettings(page: Page): Promise<void> {
  await expect(page.locator('[data-ui="deterministic-aim-guide"]')).toHaveCount(0);
  const settingsTrigger = page.getByRole('button', { name: 'Battle settings', exact: true });
  await expect(settingsTrigger).toHaveCount(1);
  const before = await readHotSeatProbe(page);
  await settingsTrigger.click();
  const settings = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  const guide = settings.getByRole('switch', { name: 'Trajectory guide', exact: true });
  const sound = settings.getByRole('switch', { name: 'Sound', exact: true });
  await expect(guide).toHaveAttribute('aria-checked', 'true');
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await guide.click();
  await expect(page.locator('.st-hud__toast')).toContainText('Aim guide off');
  await expect(guide).toHaveAttribute('aria-checked', 'false');
  await sound.click();
  await expect(page.locator('.st-hud__toast')).toContainText('Sound off');
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('g');
  await expect(page.locator('.st-hud__toast')).toContainText('Aim guide on');
  await expect(guide).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('m');
  await expect(page.locator('.st-hud__toast')).toContainText('Sound on');
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
  expect((await readHotSeatProbe(page)).forwardedActions).toEqual(before.forwardedActions);
}

async function readRosterCoordinates(page: Page): Promise<Array<Record<string, number>>> {
  return page.locator('#hud .st-hud__player-row').evaluateAll((rows) => rows.map((row) => {
    const coordinate = (selector: string): number =>
      row.querySelector<HTMLElement>(selector)!.getBoundingClientRect().x;
    return {
      name: coordinate('[data-roster-field="name"]'),
      ammo: coordinate('[data-roster-field="ammo"]'),
      health: coordinate('[data-roster-field="health"]'),
      swatch: coordinate('[data-roster-field="health-swatch"]'),
    };
  }));
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
    rulesetVersion: 4,
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
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    });
    await page.goto('?e2e=hotseat&tutorial=first-salvo&seed=1337');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await expect(page.locator('#hud.st-hud')).toHaveCount(1);
    const angle = page.locator('[data-semantic-key="node:output:Angle:43"]');
    const power = page.locator('[data-semantic-key="node:output:Power:52"]');
    const wind = page.locator('[data-semantic-key="node:output:Wind:58"]');
    await expect(angle).toHaveCount(1);
    await expect(power).toHaveCount(1);
    await expect(wind).toHaveCount(1);
    await expect(angle).toBeVisible();
    await expect(power).toBeVisible();
    await expect(wind).toBeVisible();
    const initialSolution = {
      angle: await angle.textContent(),
      power: await power.textContent(),
      wind: await wind.textContent(),
    };
    expect(initialSolution.wind).toMatch(/\d|CALM/);
    await acknowledgeBriefing(page);
    await chooseMissileAndRestoreArsenalFocus(page);
    await adjustSolutionAndMove(page);
    await expect(angle).not.toHaveText(initialSolution.angle ?? '');
    await expect(power).not.toHaveText(initialSolution.power ?? '');
    await expect(wind).toHaveText(initialSolution.wind ?? '');
    await exerciseBattleSettings(page);

    const rosterBefore = await readRosterCoordinates(page);

    const before = await readHotSeatProbe(page);
    const fire = page.locator('[data-battle-console-action="fire"]');
    await expect(fire).toHaveCount(1);
    await fire.click();
    await expect(fire).toBeDisabled();
    // Legacy Last Salvo receipt was explicitly retired with its HUD owner.
    // Real impact/handoff and held-key suppression remain proven by the engine probe.
    await expect.poll(async () => (await readHotSeatProbe(page)).phase).toMatch(/FIRING|RESOLVING/);
    await page.keyboard.down('f');
    await expect.poll(() => readHotSeatProbe(page), { timeout: 20_000 }).toMatchObject({
      phase: 'PLAYER_TURN',
      turn: before.turn + 1,
      activePlayerId: 'p2',
      projectileCount: 0,
      forwardedActions: { fire: before.forwardedActions.fire + 1 },
    });
    await page.keyboard.up('f');
    await expect(fire).toBeEnabled();
    expect(await readRosterCoordinates(page)).toEqual(rosterBefore);
    expect((await readHotSeatProbe(page)).forwardedActions.fire).toBe(before.forwardedActions.fire + 1);
    expect(browserErrors).toEqual([]);
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
    await expect(page.getByRole('button', { name: 'Ready Up', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await expect(page.locator('[data-battle-console-target-key="weapon-next"]')).toHaveAccessibleName('Select next weapon, current Baby Missile');
    await expect(page.locator('[data-semantic-key="node:output:Angle:43"]')).toBeVisible();
    await acknowledgeBriefing(page);
    await chooseMissileAndRestoreArsenalFocus(page, false);

    await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
    await page.getByRole('button', { name: 'Increase power', exact: true }).click();
    await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
    const fire = page.locator('[data-battle-console-action="fire"]');
    await expect(fire).toHaveCount(1);
    await fire.click();
    await page.keyboard.down('f');
    await expect(fire).toBeDisabled();
    await expect.poll(() => fixture.rows.map((row) => row.action['type']))
      .toEqual(['move', 'fire']);
    await expect.poll(() => fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && body['actingPlayerId'] === undefined).length).toBe(1);

    // Canonical CPU submission below proves watchdog replay recovered the human shot.

    await expect.poll(() => fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && typeof body['actingPlayerId'] === 'string').length, { timeout: 20_000 })
      .toBe(1);
    await page.keyboard.up('f');
    await expect(fire).toBeDisabled();
    expect(fixture.submissions.filter((body) => (
      body['action'] as Record<string, unknown>
    )['type'] === 'fire' && body['actingPlayerId'] === undefined)).toHaveLength(1);
  });
});

test('Armory and Battle Settings own keyboard input instead of firing behind their dialogs', async ({
  page,
}) => {
  await gotoRunningGame(page);

  const assertNoCombatMutation = async (surface: 'Armory' | 'Battle Settings'): Promise<void> => {
    if (surface === 'Armory') await page.locator('[data-battle-console-armory-scroll]').focus();
    const before = await readHotSeatProbe(page);
    const weaponBefore = await page.locator('[data-battle-console-target-key="weapon-next"]').textContent();

    // Check on keydown, before Space can activate the focused modal control on
    // keyup. The gameplay InputHandler also consumes keydown, so this is the
    // causal boundary that previously launched an unseen shot behind the dialog.
    await page.keyboard.down('Space');
    await expect.poll(async () => (await readHotSeatProbe(page)).forwardedActions.fire,
      `${surface} suppresses the gameplay Fire hotkey`).toBe(before.forwardedActions.fire);
    await page.keyboard.up('Space');

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('q');
    expect((await readHotSeatProbe(page)).forwardedActions).toEqual(before.forwardedActions);
    await expect(page.locator('[data-battle-console-target-key="weapon-next"]')).toHaveText(weaponBefore ?? '');
  };

  const armoryTrigger = page.getByRole('button', { name: 'Open Armory', exact: true });
  await armoryTrigger.click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  await expect(armory).toBeVisible();
  await assertNoCombatMutation('Armory');
  if (await armory.isVisible()) await page.keyboard.press('Escape');

  // Re-open independently because Space may activate the focused Close control
  // on keyup. The dialog's own trusted Equip action must remain live even while
  // background gameplay hotkeys are suppressed.
  await armoryTrigger.click();
  await armory.locator('[data-battle-console-armory-item]').filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) }).getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(page.locator('[data-battle-console-target-key="weapon-next"]')).toHaveAccessibleName('Select next weapon, current Missile');
  await expect(armory).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  await expect(settings).toBeVisible();
  await assertNoCombatMutation('Battle Settings');
  await expect(settings).toBeVisible();
});

test('command console retains its visual contract through the decision phase', async ({ page }) => {
  await gotoRunningGame(page);
  const console = page.locator('[data-battle-console-surface]');
  const field = (await page.locator('#game').boundingBox())!;
  const box = (await console.boundingBox())!;
  expect(Math.abs(box.x - field.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.width - field.width)).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-semantic-key="node:output:Wind:58"]')).toBeVisible();
  await expect(console.locator('[data-battle-console-action="fire"]:enabled')).toHaveCount(1);
  for (const key of ['node:output:Angle:43', 'node:output:Power:52', 'node:output:Wind:58', 'node:span:100 fuel remaining:19']) {
    const reading = console.locator(`[data-semantic-key="${key}"]`);
    const geometry = await reading.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const copy = range.getBoundingClientRect();
      const cell = element.getBoundingClientRect();
      return { copy: copy.toJSON(), cell: cell.toJSON(), physicalFont: Number.parseFloat(getComputedStyle(element).fontSize) * cell.height / (element as HTMLElement).offsetHeight };
    });
    expect(geometry.copy.left, key).toBeGreaterThanOrEqual(geometry.cell.left - 1);
    expect(geometry.copy.right, key).toBeLessThanOrEqual(geometry.cell.right + 1);
    // Font ascent/descent boxes can exceed a tight line box without painted ink overflow.
    // Preserve the original readability floor and contain the instrument in its console.
    expect(geometry.physicalFont, key).toBeGreaterThanOrEqual(12);
    expect(geometry.cell.top, key).toBeGreaterThanOrEqual(box.y);
    expect(geometry.cell.bottom, key).toBeLessThanOrEqual(box.y + box.height);
  }
  await expect(page.locator('#hud [data-battle-console-action="fire"], #hud [data-battle-console-target-key="armory"]')).toHaveCount(0);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
  await expect(page.locator('.st-hud__touch-strip')).toHaveCount(0);
});

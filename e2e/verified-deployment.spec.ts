import { expect, test, type Page } from '@playwright/test';
import { assertLobbyFrame } from './support';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';

function verifiedDescriptor(expiresAt = '2099-12-31T23:59:59.000Z') {
  return {
    sessionId: SESSION_ID,
    expiresAt,
    contractVersion: 1,
    engineVersion: 1,
    rulesetVersion: 3,
    limits: {
      humanSalvos: 6,
      cpuSalvos: 6,
      angle: { min: 0, max: 180 },
      power: { min: 0, max: 100 },
    },
    config: {
      seed: 17,
      options: {
        maxPlayers: 2,
        maxWind: 6,
        gravity: 0.15,
        walls: 'open',
        hazards: 'none',
        rounds: 1,
        interestRate: 0,
        suddenDeathTurn: 0,
        armsLevel: 0,
        starterWeaponFalloff: 'decisive',
        teamMode: false,
        players: [
          { name: 'Ranger', color: '#e8554d' },
          { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
        ],
      },
    },
  };
}

function verifiedStart(resumed = false, expiresAt?: string) {
  return { ...verifiedDescriptor(expiresAt), resumed };
}

async function installAuthenticatedFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: 'e2e-public-session-token',
      refresh_token: 'e2e-public-refresh-token',
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: 'e2e-commander',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'commander@example.test',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-08-10T00:00:00.000Z',
      },
    }));
  });
  await page.route('**/rest/v1/profiles**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'e2e-commander', display_name: 'Ranger' }),
  }));
  await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      matchesPlayed: 0,
      wins: 0,
      progressionVersion: 1,
      totalXp: 0,
      level: 1,
      levelXp: 0,
      nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
      },
    }),
  }));
}

async function openLocalBattery(page: Page, search = './'): Promise<void> {
  await page.goto(search);
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby')).toBeVisible();
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Verified deployment' })).toBeVisible();
}

test.describe('verified deployment production-browser journey', () => {
  test.beforeEach(async ({ page }) => installAuthenticatedFixture(page));

  test('contains fixed rules, loading, and the verified HUD at every input profile', async ({ page }) => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    await page.route('**/functions/v1/start_verified_deployment', async (route) => {
      await startGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(verifiedStart()),
      });
    });

    await openLocalBattery(page);
    const verified = page.getByRole('region', { name: 'Verified deployment' });
    await expect(verified.getByText('Baby Missile only')).toBeVisible();
    await expect(verified.getByText('6 human / 6 CPU salvos maximum')).toBeVisible();
    await expect(verified.getByText('Fixed battlefield rules')).toBeVisible();
    await expect(verified.getByText('30-minute deadline')).toBeVisible();
    const launchComposition = await verified.evaluate((node) => {
      const rules = node.querySelector<HTMLElement>('.lobby-verified-deployment__rules');
      const actions = node.querySelector<HTMLElement>('.lobby-verified-deployment__actions');
      if (!rules || !actions) throw new Error('Missing verified launch composition');
      return {
        rules: rules.getBoundingClientRect().toJSON(),
        actions: actions.getBoundingClientRect().toJSON(),
      };
    });
    expect(launchComposition.actions.left).toBeGreaterThanOrEqual(launchComposition.rules.right - 1);
    await assertLobbyFrame(page);

    const launch = verified.getByRole('button', { name: 'Start verified deployment' });
    await launch.click();
    await expect(verified.getByRole('button', { name: 'Verified deployment busy' })).toBeDisabled();
    await assertLobbyFrame(page);
    releaseStart();

    const hud = page.getByRole('status').filter({ hasText: 'Verified deployment' });
    await expect(hud).toBeVisible();
    await expect(hud.getByText('Salvos · You 0 / 6 · CPU 0 / 6')).toBeVisible();
    await expect(hud.getByText('Deployment active')).toBeVisible();
    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('.st-hud__instruments')).toBeVisible();

    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    expect(geometry.documentHeight).toBe(geometry.viewportHeight);
  });

  test('returns a live deployment to the Battery and abandons it only after confirmation', async ({ page }) => {
    let abandonBody: unknown = null;
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart()),
    }));
    await page.route('**/functions/v1/abandon_verified_deployment', async (route) => {
      abandonBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, sessionId: SESSION_ID, status: 'abandoned' }),
      });
    });

    await openLocalBattery(page);
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    await expect(page.locator('.st-hud__instruments')).toBeVisible();
    await page.locator('#hud .st-hud__menu, [data-command="menu"]').filter({ visible: true }).first().click();
    const menu = page.getByRole('dialog', { name: 'Command Menu' });
    await menu.getByRole('button', { name: 'Return to Lobby' }).click();
    await expect(page.locator('#lobby')).toBeVisible();

    const verified = page.getByRole('region', { name: 'Verified deployment' });
    await expect(verified.getByRole('button', { name: 'Resume verified deployment' })).toBeVisible();
    await expect(verified.getByText('Recovered 0 of 6 human salvos.')).toBeVisible();
    await verified.getByRole('button', { name: 'Abandon verified deployment' }).click();
    const confirmation = verified.locator('.lobby-verified-deployment__confirm');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText('Abandon this recoverable deployment')).toBeVisible();
    expect(abandonBody).toBeNull();
    await confirmation.getByRole('button', { name: 'Keep deployment' }).click();
    await expect(confirmation).toBeHidden();
    expect(abandonBody).toBeNull();

    await verified.getByRole('button', { name: 'Abandon verified deployment' }).click();
    await confirmation.getByRole('button', { name: 'Confirm abandon' }).click();
    await expect(verified.getByRole('button', { name: 'Start verified deployment' })).toBeVisible();
    expect(abandonBody).toEqual({ sessionId: SESSION_ID });
    expect(await page.evaluate(() => localStorage.getItem('singedterra:verified-deployment'))).toBeNull();
    await assertLobbyFrame(page);
  });

  test('recovers the exact persisted transcript after a browser refresh', async ({ page }) => {
    const descriptor = verifiedDescriptor();
    await page.addInitScript(({ stored }) => {
      localStorage.setItem('singedterra:verified-deployment', JSON.stringify(stored));
    }, {
      stored: {
        storageVersion: 2,
        deployments: [{
          descriptor,
          transcript: [{ angle: 0, power: 5 }],
          terminal: false,
        }],
      },
    });
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(true)),
    }));

    await openLocalBattery(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const hud = page.getByRole('status').filter({ hasText: 'Verified deployment' });
    await expect(hud.getByText('Salvos · You 1 / 6 · CPU 1 / 6')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(
      localStorage.getItem('singedterra:verified-deployment') ?? 'null',
    )?.deployments?.[0]?.transcript)).toEqual([{ angle: 0, power: 5 }]);
  });

  test('warns at both thresholds, freezes expired input, and exposes both expiry choices', async ({ page }) => {
    const initialNow = Date.parse('2026-08-12T12:00:00.000Z');
    const expiresAt = new Date(initialNow + 30 * 60_000).toISOString();
    await page.addInitScript((start) => {
      let now = start;
      Date.now = () => now;
      (window as typeof window & { __setVerifiedNow?: (value: number) => void })
        .__setVerifiedNow = (value) => { now = value; };
    }, initialNow);
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(false, expiresAt)),
    }));

    await openLocalBattery(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const hud = page.getByRole('status').filter({ hasText: 'Verified deployment' });
    const setNow = (value: number) => page.evaluate((next) => {
      const setter = (window as typeof window & { __setVerifiedNow?: (time: number) => void })
        .__setVerifiedNow;
      if (!setter) throw new Error('Missing verified clock control');
      setter(next);
    }, value);

    await setNow(initialNow + 25 * 60_000);
    await expect(hud.getByText('Five minutes remain')).toBeVisible();
    await expect(hud.getByText('05:00 remaining')).toBeVisible();
    await setNow(initialNow + 29 * 60_000);
    await expect(hud.getByText('One minute remains')).toBeVisible();
    await expect(hud.getByText('01:00 remaining')).toBeVisible();

    const beforeFire = await page.evaluate(() => (
      window as typeof window & {
        __SINGED_TERRA_E2E__?: { forwardedActions: { fire: number } };
      }
    ).__SINGED_TERRA_E2E__?.forwardedActions.fire ?? 0);
    await setNow(initialNow + 31 * 60_000);
    const expiry = page.getByRole('dialog', { name: 'Verification expired' });
    const casual = expiry.getByRole('button', { name: 'Continue casually' });
    const battery = expiry.getByRole('button', { name: 'Return to Battery' });
    await expect(expiry).toBeVisible();
    await expect(casual).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(battery).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(casual).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(expiry).toBeVisible();
    const afterFire = await page.evaluate(() => (
      window as typeof window & {
        __SINGED_TERRA_E2E__?: { forwardedActions: { fire: number } };
      }
    ).__SINGED_TERRA_E2E__?.forwardedActions.fire ?? 0);
    expect(afterFire).toBe(beforeFire);

    await casual.click();
    await expect(expiry).toBeHidden();
    await expect(hud).toBeHidden();
    await expect(page.locator('#stage')).not.toHaveAttribute('inert', '');
  });

  test('contains a failed launch without raw backend disclosure', async ({ page }) => {
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'database exploded with private detail' }),
    }));
    await openLocalBattery(page);
    const verified = page.getByRole('region', { name: 'Verified deployment' });
    await verified.getByRole('button', { name: 'Start verified deployment' }).click();
    await expect(verified.getByRole('status')).toHaveText(
      'Verified deployment is unavailable. Try again.',
    );
    await expect(verified).not.toContainText('database exploded');
    await expect(verified.getByRole('button', { name: 'Start verified deployment' })).toBeEnabled();
    await assertLobbyFrame(page);
  });

  test('retries terminal evidence and renders only the server-confirmed verified promotion', async ({ page }) => {
    const transcript = Array.from({ length: 6 }, () => ({ angle: 0, power: 5 }));
    const prior = {
      evidence: 'verified_replay_v1',
      matchesPlayed: 10,
      wins: 8,
      progressionVersion: 1,
      totalXp: 1_800,
      level: 4,
      levelXp: 300,
      nextLevelXp: 500,
    } as const;
    const current = {
      evidence: 'verified_replay_v1',
      matchesPlayed: 11,
      wins: 9,
      progressionVersion: 1,
      totalXp: 2_000,
      level: 5,
      levelXp: 0,
      nextLevelXp: 500,
    } as const;
    let completionCalls = 0;
    let completionBody: unknown = null;
    let completionAccepted = false;

    await page.addInitScript(({ descriptor, storedTranscript }) => {
      localStorage.setItem('singedterra:verified-deployment', JSON.stringify({
        storageVersion: 2,
        deployments: [{
          descriptor,
          transcript: storedTranscript,
          terminal: true,
        }],
      }));
    }, { descriptor: verifiedDescriptor(), storedTranscript: transcript });
    await page.unroute('**/functions/v1/account_summary');
    await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matchesPlayed: completionAccepted ? current.matchesPlayed : prior.matchesPlayed,
        wins: completionAccepted ? current.wins : prior.wins,
        progressionVersion: 1,
        totalXp: completionAccepted ? current.totalXp : prior.totalXp,
        level: completionAccepted ? current.level : prior.level,
        levelXp: completionAccepted ? current.levelXp : prior.levelXp,
        nextLevelXp: 500,
        verifiedProgression: completionAccepted ? current : prior,
      }),
    }));
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(true)),
    }));
    await page.route('**/functions/v1/complete_verified_deployment', async (route) => {
      completionCalls += 1;
      completionBody = route.request().postDataJSON();
      if (completionCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'temporary verification outage' }),
        });
        return;
      }
      completionAccepted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { sessionId: SESSION_ID, won: true, outcome: 'win', verifiedXp: 200 },
          progression: {
            evidence: 'verified_replay_v1',
            prior: { matchesPlayed: 10, wins: 8, totalXp: 1_800 },
            current: { matchesPlayed: 11, wins: 9, totalXp: 2_000 },
          },
        }),
      });
    });

    await openLocalBattery(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const firstReport = page.locator('.st-hud__overlay--victory');
    await expect(firstReport).toBeVisible({ timeout: 10_000 });
    await expect(firstReport.locator('.st-hud__victory-progression-receipt')).toBeHidden();
    await expect.poll(() => completionCalls).toBe(1);
    await firstReport.getByRole('button', { name: 'Main Menu' }).click();

    const verified = page.getByRole('region', { name: 'Verified deployment' });
    await expect(verified.getByText('Recovered terminal evidence. Resume to retry verification.'))
      .toBeVisible();
    await verified.getByRole('button', { name: 'Resume verified deployment' }).click();

    const acceptedReport = page.locator('.st-hud__overlay--victory');
    await expect(acceptedReport).toBeVisible({ timeout: 10_000 });
    const receipt = acceptedReport.locator('.st-hud__victory-progression-receipt');
    await expect(receipt.locator('.st-hud__victory-progression-summary'))
      .toHaveText('Verified victory · +200 XP · Level 5 · 0 / 500 XP');
    await expect(receipt.locator('.st-hud__victory-promotion-kicker'))
      .toHaveText('Commander promoted');
    await expect(receipt.locator('.st-hud__victory-promotion-code')).toHaveText('R-04');
    await expect(receipt.locator('.st-hud__victory-promotion-title')).toHaveText('Artillerist');
    await expect(receipt.locator('.st-hud__victory-career-next'))
      .toHaveText('1,000 XP to R-05 Battery Captain at Level 7');
    expect(completionCalls).toBe(2);
    expect(completionBody).toEqual({ sessionId: SESSION_ID, transcript });
    expect(await page.evaluate(() => localStorage.getItem('singedterra:verified-deployment')))
      .toBeNull();
  });
});

test('Quick Duel publishes a bounded query-gated seed receipt on every redeployment', async ({ page }) => {
  const readSeed = async (): Promise<number> => {
    await page.goto('?e2e=quick-duel-seed');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();
    await expect(page.locator('.st-hud__instruments')).toBeVisible();
    return page.evaluate(() => {
      const probe = (window as typeof window & { __singedTerraE2E?: { quickDuelSeed?: number } })
        .__singedTerraE2E;
      if (!probe || !Number.isInteger(probe.quickDuelSeed)) throw new Error('Missing Quick Duel seed receipt');
      return probe.quickDuelSeed!;
    });
  };

  const first = await readSeed();
  const second = await readSeed();
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThanOrEqual(0xffff_ffff);
  expect(second).toBeGreaterThanOrEqual(0);
  expect(second).toBeLessThanOrEqual(0xffff_ffff);
});

test('terminal impact owns a nonzero inert payoff beat before the report', async ({ page }) => {
  await page.goto('?e2e=victory-payoff');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  const report = page.locator('.st-hud__overlay--victory');
  const payoff = page.locator('.st-hud__terminal-payoff-status');
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & {
      __SINGED_TERRA_T8__?: { terminalExplosionCount?: number };
    }
  ).__SINGED_TERRA_T8__?.terminalExplosionCount ?? 0)).toBe(1);
  await expect(payoff).toHaveText('Terminal impact resolving. After action report incoming.');
  expect(await page.evaluate(() => ({
    reportHidden: document.querySelector('.st-hud__overlay--victory')
      ?.classList.contains('st-hud__overlay--hidden'),
    hudInert: document.getElementById('hud')?.inert,
    stageInert: document.getElementById('stage')?.inert,
  }))).toEqual({ reportHidden: true, hudInert: true, stageInert: true });
  await expect(report).toBeVisible();
  await expect(payoff).toHaveText('After action report ready.');
  const elapsed = await payoff.evaluate((node: HTMLElement) =>
    Number(node.dataset['payoffReadyAt']) - Number(node.dataset['impactCompletedAt']));
  expect(elapsed).toBeGreaterThanOrEqual(400);
  const sequence = await page.evaluate(() => {
    const receipt = (window as typeof window & {
      __SINGED_TERRA_T8__?: {
        terminalExplosionObservedAt?: number;
        impactCompletedAt?: number;
      };
    }).__SINGED_TERRA_T8__;
    const status = document.querySelector<HTMLElement>('.st-hud__terminal-payoff-status');
    return {
      explosion: receipt?.terminalExplosionObservedAt ?? Number.NaN,
      impactComplete: receipt?.impactCompletedAt ?? Number.NaN,
      reportReady: Number(status?.dataset['payoffReadyAt']),
    };
  });
  expect(sequence.explosion).toBeLessThan(sequence.impactComplete);
  expect(sequence.impactComplete).toBeLessThan(sequence.reportReady);
});

test('reduced motion preserves a readable nonzero post-impact beat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?e2e=victory-payoff');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  const payoff = page.locator('.st-hud__terminal-payoff-status');
  const report = page.locator('.st-hud__overlay--victory');
  await expect(report).toBeVisible();
  const elapsed = await payoff.evaluate((node: HTMLElement) =>
    Number(node.dataset['payoffReadyAt']) - Number(node.dataset['impactCompletedAt']));
  expect(elapsed).toBeGreaterThanOrEqual(100);
});

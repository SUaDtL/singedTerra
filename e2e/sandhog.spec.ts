import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

interface SandhogProbe {
  phase: string;
  terrainVersion: number;
  sandhog: {
    x: number;
    y: number;
    burrowTicksRemaining: number | null;
    centerSolid: boolean | null;
  } | null;
  corridorWitness: {
    x: number;
    y: number;
    centerSolid: boolean;
    adjacentX: number;
    adjacentY: number;
    adjacentSolid: boolean;
  } | null;
  sandhogExplosionCount: number;
}

async function readProbe(page: import('@playwright/test').Page): Promise<SandhogProbe | null> {
  return page.evaluate(() => (
    window as unknown as { __SINGED_TERRA_E2E__?: SandhogProbe }
  ).__SINGED_TERRA_E2E__ ?? null);
}

test.describe('Sandhog causal browser contract', () => {
  test('fires, visibly bores a progressive corridor, and detonates at its endpoint', async ({
    page,
  }) => {
    // Suppress the decorative burrow wake before Renderer construction. The
    // corridor assertion below must observe cleared terrain, not a trail puff.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoRunningGame(page);
    await page.getByRole('button', { name: 'Expand arsenal' }).click();
    await page.locator('.st-hud__weapon-btn[data-weapon="sandhog"]').click();
    await page.getByRole('button', { name: 'Collapse arsenal' }).click();
    const fire = page.locator('.st-hud__primary-action');
    await expect(fire).toHaveAttribute('aria-label', 'Fire Sandhog');
    await expect(fire).toBeVisible();

    const before = await readProbe(page);
    expect(before, 'the deterministic hot-seat entrypoint exposes a narrow read-only probe')
      .not.toBeNull();
    await fire.click();

    await expect.poll(async () => {
      const probe = await readProbe(page);
      const remaining = probe?.sandhog?.burrowTicksRemaining;
      return remaining !== null && remaining !== undefined && remaining <= 14
        ? probe
        : null;
    }, {
      timeout: 15_000,
      intervals: [10, 10, 16, 16, 16],
      message: 'the real shot should enter its underground drill phase',
    }).not.toBeNull();

    const deep = (await readProbe(page))!;
    expect(deep.sandhog).not.toBeNull();
    expect(deep.sandhog!.centerSolid).toBe(false);
    expect(deep.terrainVersion).toBeGreaterThan(before!.terrainVersion);
    const remaining = deep.sandhog!.burrowTicksRemaining!;

    await expect.poll(async () => {
      const probe = await readProbe(page);
      if (
        !probe?.sandhog
        || probe.sandhog.burrowTicksRemaining === null
        || !probe.corridorWitness
      ) return null;
      return (
        probe.sandhog.burrowTicksRemaining < remaining
        && probe.corridorWitness.centerSolid === false
        && probe.corridorWitness.adjacentSolid === true
      ) ? probe : null;
    }, {
      timeout: 2_000,
      intervals: [10, 10, 16, 16],
      message: 'the drill should expose an unobscured cleared center beside solid earth',
    }).not.toBeNull();

    const advancedProbe = (await readProbe(page))!;
    const advanced = advancedProbe.sandhog!;
    const witness = advancedProbe.corridorWitness!;
    expect(Math.hypot(advanced.x - witness.x, advanced.y - witness.y))
      .toBeGreaterThan(18);

    // The probe proves the two authoritative terrain values. The matching
    // production-Canvas pixels must visibly differ after the drill head has
    // moved beyond its 13px halo.
    const corridorPixels = await page.evaluate((sample) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const ctx = canvas.getContext('2d')!;
      const center = [
        ...ctx.getImageData(Math.round(sample.x), Math.round(sample.y), 1, 1).data,
      ];
      const adjacent = [
        ...ctx.getImageData(
          Math.round(sample.adjacentX),
          Math.round(sample.adjacentY),
          1,
          1,
        ).data,
      ];
      return { center, adjacent };
    }, witness);
    const rgbDistance = Math.hypot(
      corridorPixels.center[0]! - corridorPixels.adjacent[0]!,
      corridorPixels.center[1]! - corridorPixels.adjacent[1]!,
      corridorPixels.center[2]! - corridorPixels.adjacent[2]!,
    );
    expect(rgbDistance, 'the cleared corridor pixel should visibly differ from nearby earth')
      .toBeGreaterThan(25);

    await expect.poll(async () => (await readProbe(page))?.sandhogExplosionCount ?? 0, {
      timeout: 5_000,
      intervals: [10, 16, 16, 25],
      message: 'the real browser shot should emit its Sandhog endpoint blast',
    }).toBeGreaterThanOrEqual(1);
  });
});

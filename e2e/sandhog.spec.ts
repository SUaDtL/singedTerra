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

interface SandhogFrame {
  readonly probe: SandhogProbe;
  readonly probeIsImmutable: boolean;
  readonly pixels: Readonly<{
    center: readonly number[];
    adjacent: readonly number[];
    rgbDistance: number;
  }> | null;
}

interface SandhogObservation {
  readonly done: boolean;
  readonly frames: readonly SandhogFrame[];
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
    const briefing = page.locator('[data-ui="first-salvo-briefing"]');
    if (await briefing.isVisible()) {
      await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
    }
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    if (await skip.isVisible()) await skip.click();
    await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
    await page.locator('[data-battle-console-armory-item]')
      .filter({ has: page.getByRole('heading', { name: 'Sandhog', exact: true }) })
      .getByRole('button', { name: 'Equip', exact: true }).click();
    await page.getByRole('dialog', { name: 'Armory', exact: true })
      .getByRole('button', { name: 'Close Armory', exact: true }).click();
    const fire = page.locator('button[data-battle-console-action="fire"]');
    await expect(fire).toHaveAttribute('aria-label', 'Fire Sandhog');
    await expect(fire).toBeVisible();

    const before = await readProbe(page);
    expect(before, 'the deterministic hot-seat entrypoint exposes a narrow read-only probe')
      .not.toBeNull();
    await page.evaluate(() => {
      const MAX_RETAINED_FRAMES = 128;
      let remainingRafFrames = 600;
      let rafId = 0;
      const observation: {
        done: boolean;
        frames: SandhogFrame[];
        stop: () => void;
      } = {
        done: false,
        frames: [],
        stop: () => {
          observation.done = true;
          cancelAnimationFrame(rafId);
        },
      };
      (
        window as unknown as { __SINGED_TERRA_SANDHOG_OBSERVER__?: typeof observation }
      ).__SINGED_TERRA_SANDHOG_OBSERVER__ = observation;

      const sample = (): void => {
        const probe = (
          window as unknown as { __SINGED_TERRA_E2E__?: SandhogProbe }
        ).__SINGED_TERRA_E2E__;
        if (probe?.sandhog || probe?.sandhogExplosionCount) {
          let pixels: SandhogFrame['pixels'] = null;
          const witness = probe.corridorWitness;
          if (witness) {
            const ctx = document.querySelector<HTMLCanvasElement>('#game')!.getContext('2d')!;
            const center = Object.freeze(Array.from(ctx.getImageData(
              Math.round(witness.x),
              Math.round(witness.y),
              1,
              1,
            ).data));
            const adjacent = Object.freeze(Array.from(ctx.getImageData(
              Math.round(witness.adjacentX),
              Math.round(witness.adjacentY),
              1,
              1,
            ).data));
            pixels = Object.freeze({
              center,
              adjacent,
              rgbDistance: Math.hypot(
                center[0]! - adjacent[0]!,
                center[1]! - adjacent[1]!,
                center[2]! - adjacent[2]!,
              ),
            });
          }
          const copiedProbe = Object.freeze({
            ...probe,
            sandhog: probe.sandhog ? Object.freeze({ ...probe.sandhog }) : null,
            corridorWitness: probe.corridorWitness
              ? Object.freeze({ ...probe.corridorWitness })
              : null,
          });
          observation.frames.push(Object.freeze({
            probe: copiedProbe,
            probeIsImmutable: Object.isFrozen(probe)
              && (probe.sandhog === null || Object.isFrozen(probe.sandhog))
              && (probe.corridorWitness === null || Object.isFrozen(probe.corridorWitness)),
            pixels,
          }));
          if (observation.frames.length > MAX_RETAINED_FRAMES) observation.frames.shift();
        }
        remainingRafFrames -= 1;
        if (probe?.sandhogExplosionCount || remainingRafFrames === 0) {
          observation.stop();
          return;
        }
        rafId = requestAnimationFrame(sample);
      };
      rafId = requestAnimationFrame(sample);
    });

    try {
      await fire.click();
      // Deliberately let the short drill window pass without a test-runner read.
      // The browser-side recorder must retain coherent same-frame evidence.
      await page.waitForTimeout(3_000);
      await expect.poll(async () => page.evaluate(() => (
        window as unknown as {
          __SINGED_TERRA_SANDHOG_OBSERVER__?: SandhogObservation;
        }
      ).__SINGED_TERRA_SANDHOG_OBSERVER__?.done ?? false), {
        timeout: 15_000,
        message: 'the real browser shot should reach its Sandhog endpoint blast',
      }).toBe(true);

      const observation = await page.evaluate(() => {
        const ownedWindow = window as unknown as {
          __SINGED_TERRA_SANDHOG_OBSERVER__?: SandhogObservation;
        };
        const retained = ownedWindow.__SINGED_TERRA_SANDHOG_OBSERVER__!;
        return { done: retained.done, frames: retained.frames };
      });
      expect(observation.frames.length).toBeGreaterThan(0);
      expect(observation.frames.length).toBeLessThanOrEqual(128);
      expect(observation.frames.every((frame) => frame.probeIsImmutable)).toBe(true);

      const deepIndex = observation.frames.findIndex((frame) => {
        const remaining = frame.probe.sandhog?.burrowTicksRemaining;
        return remaining !== null
          && remaining !== undefined
          && remaining <= 14
          && frame.probe.sandhog?.centerSolid === false
          && frame.probe.terrainVersion > before!.terrainVersion;
      });
      expect(deepIndex, 'the real shot should enter its underground drill phase').toBeGreaterThan(-1);
      const deep = observation.frames[deepIndex]!;
      const deepRemaining = deep.probe.sandhog!.burrowTicksRemaining!;

      const advanced = observation.frames.slice(deepIndex + 1).find((frame) => {
        const sandhog = frame.probe.sandhog;
        const witness = frame.probe.corridorWitness;
        return sandhog !== null
          && sandhog.burrowTicksRemaining !== null
          && sandhog.burrowTicksRemaining < deepRemaining
          && witness !== null
          && witness.centerSolid === false
          && witness.adjacentSolid === true
          && Math.hypot(sandhog.x - witness.x, sandhog.y - witness.y) > 18
          && frame.pixels !== null
          && frame.pixels.rgbDistance > 25;
      });
      expect(
        advanced,
        'the drill should expose a visibly distinct cleared center beside solid earth',
      ).toBeDefined();
      expect(advanced!.probe.terrainVersion).toBeGreaterThan(before!.terrainVersion);
      expect(advanced!.pixels!.rgbDistance).toBeGreaterThan(25);
      expect(observation.frames.some((frame) => frame.probe.sandhogExplosionCount >= 1),
        'the real browser shot should emit its Sandhog endpoint blast').toBe(true);
    } finally {
      await page.evaluate(() => {
        const ownedWindow = window as unknown as {
          __SINGED_TERRA_SANDHOG_OBSERVER__?: { stop: () => void };
        };
        ownedWindow.__SINGED_TERRA_SANDHOG_OBSERVER__?.stop();
        delete ownedWindow.__SINGED_TERRA_SANDHOG_OBSERVER__;
      }).catch(() => undefined);
    }
  });
});

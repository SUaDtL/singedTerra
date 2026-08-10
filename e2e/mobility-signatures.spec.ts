import { expect, test, type Page } from '@playwright/test';
import { TANK_PART_SETS } from '../client/src/renderer/tankPartCatalog';

const KITS = [
  { id: 'foundry', label: 'Foundry', accent: '#d6a15f', expectedOps: ['strokeRect'] },
  { id: 'ranger', label: 'Ranger', accent: '#c68cff', expectedOps: ['strokeRect'] },
  { id: 'bulwark', label: 'Bulwark', accent: '#6ee7ff', expectedOps: ['arc', 'lineTo', 'stroke'] },
  { id: 'jackal', label: 'Jackal', accent: '#ffc857', expectedOps: ['arc', 'lineTo', 'stroke'] },
] as const;

type Kit = (typeof KITS)[number];
const FRAME_STORE = '__singedTerraMobilityFrames';

interface TankDraw {
  x: number;
  y: number;
}

interface Mask {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelDifference {
  changed: number;
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  fingerprint: string;
}

interface ProbeState {
  tankDraws: TankDraw[];
  accentOps: Array<{ kind: string; style: string }>;
}

/**
 * A test-only, pre-navigation observer. It never mutates game state or canvas
 * output: it records the already-issued active-tank treads blits and
 * profile-accent mobility primitives, strictly on #game.
 */
async function installCanvasProbe(page: Page): Promise<void> {
  await page.addInitScript(({ accents }) => {
    const view = window as typeof window & {
      __singedTerraMobilityProbe?: {
        tankDraws: Array<{ x: number; y: number; width: number; height: number }>;
        accentOps: Array<{ kind: string; style: string }>;
      };
    };
    const probe = view.__singedTerraMobilityProbe = { tankDraws: [], accentOps: [] };
    const accentSet = new Set(accents);
    const context = CanvasRenderingContext2D.prototype;
    const originalDrawImage = context.drawImage;
    context.drawImage = (function (
      this: CanvasRenderingContext2D,
      image: CanvasImageSource,
      ...args: number[]
    ): void {
      if (
        this.canvas.id === 'game'
        && image instanceof HTMLCanvasElement
        && args.length === 2
      ) {
        probe.tankDraws.push({ x: args[0]!, y: args[1]!, width: image.width, height: image.height });
      }
      Reflect.apply(originalDrawImage, this, [image, ...args]);
    }) as typeof originalDrawImage;

    const observe = (kind: string, original: (...args: number[]) => unknown) => function (
      this: CanvasRenderingContext2D,
      ...args: number[]
    ): unknown {
      if (this.canvas.id === 'game') {
        const style = String(kind === 'fillRect' ? this.fillStyle : this.strokeStyle).toLowerCase();
        if (accentSet.has(style)) probe.accentOps.push({ kind, style });
      }
      return Reflect.apply(original, this, args);
    };
    for (const method of ['fillRect', 'strokeRect', 'arc', 'lineTo', 'stroke'] as const) {
      const original = context[method] as unknown as (...args: number[]) => unknown;
      (context[method] as unknown) = observe(method, original);
    }
  }, {
    accents: KITS.map((kit) => kit.accent),
  });
}

async function requestFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function clearProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as typeof window & { __singedTerraMobilityProbe?: ProbeState })
      .__singedTerraMobilityProbe;
    if (!probe) throw new Error('Mobility Canvas probe was not installed before navigation');
    probe.tankDraws.length = 0;
    probe.accentOps.length = 0;
  });
}

async function probeState(page: Page, kit: Kit): Promise<ProbeState> {
  const treads = TANK_PART_SETS[kit.id].parts.treads;
  return page.locator('#game').evaluate((canvas, treads) => {
    const probe = (window as typeof window & { __singedTerraMobilityProbe?: {
      tankDraws: Array<{ x: number; y: number; width: number; height: number }>;
      accentOps: Array<{ kind: string; style: string }>;
    } }).__singedTerraMobilityProbe;
    if (!probe) throw new Error('Mobility Canvas probe was not installed before navigation');
    const activeTreads = probe.tankDraws
      .filter((draw) => draw.width === treads.width && draw.height === treads.height)
      .filter((draw) => draw.x >= 0 && draw.x < canvas.width / 2);
    return {
      tankDraws: activeTreads.map(({ x, y }) => ({ x, y })),
      accentOps: probe.accentOps.map(({ kind, style }) => ({ kind, style })),
    };
  }, treads);
}

async function canvasHash(page: Page): Promise<string> {
  return page.locator('#game').evaluate((canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Game canvas has no readable 2D context');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let offset = 0; offset < data.length; offset += 16) {
      hash = Math.imul(hash ^ data[offset]!, 16777619);
      hash = Math.imul(hash ^ data[offset + 1]!, 16777619);
      hash = Math.imul(hash ^ data[offset + 2]!, 16777619);
    }
    return String(hash >>> 0);
  });
}

/** Waits for three consecutive unchanged production frames after the active art is actually blitting. */
async function waitForStableCanvas(page: Page, kit: Kit): Promise<TankDraw> {
  let previousHash: string | null = null;
  let stableFrames = 0;
  let latest: TankDraw | null = null;
  await expect.poll(async () => {
    await requestFrame(page);
    const [hash, probe] = await Promise.all([canvasHash(page), probeState(page, kit)]);
    latest = probe.tankDraws.at(-1) ?? null;
    if (latest === null || hash !== previousHash) {
      previousHash = hash;
      stableFrames = 0;
      return false;
    }
    stableFrames++;
    return stableFrames >= 3;
  }, { timeout: 5_000, intervals: [30, 50, 80, 120] }).toBe(true);
  return latest!;
}

async function startGarageMatch(page: Page, kit: Kit): Promise<void> {
  await page.goto('.');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.lobby-garage')).toHaveCount(2);

  if (await page.locator('#app').evaluate((element) => element.classList.contains('is-compact'))) {
    await page.getByRole('button', { name: 'Customize Player 1 tank' }).click();
    await expect(page.getByRole('dialog', { name: 'Vehicle Bay: Player 1' })).toBeVisible();
  }
  const preset = page.getByRole('button', { name: `Apply ${kit.label} preset to Player 1` });
  await preset.click();
  await expect(preset).toHaveAttribute('aria-pressed', 'true');
  const done = page.getByRole('button', { name: 'Done customizing tank' });
  if (await done.isVisible()) await done.click();

  const advanced = page.locator('.lobby-advanced');
  await advanced.locator('summary').click();
  await advanced.locator('.lobby-field').filter({ hasText: 'Seed' }).locator('input').fill('1337');
  await page.getByRole('button', { name: 'Deploy local battle' }).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('.st-hud__fuel-value')).toHaveText('100');
}

function undercarriageMask(kit: Kit, draw: TankDraw): Mask {
  const treads = TANK_PART_SETS[kit.id].parts.treads;
  const tankX = draw.x - treads.offsetX;
  const tankY = draw.y - treads.offsetY;
  return {
    x: Math.floor(tankX - 48),
    y: Math.max(0, Math.floor(tankY - 36)),
    width: 72,
    height: 56,
  };
}

async function saveMaskFrame(page: Page, name: string, mask: Mask): Promise<void> {
  await page.locator('#game').evaluate((canvas, { name, mask, storeName }) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Game canvas has no readable 2D context');
    const store = (window as typeof window & { [key: string]: Record<string, Uint8ClampedArray> | undefined })[storeName]
      ?? ((window as typeof window & { [key: string]: Record<string, Uint8ClampedArray> | undefined })[storeName] = {});
    store[name] = ctx.getImageData(mask.x, mask.y, mask.width, mask.height).data;
  }, { name, mask, storeName: FRAME_STORE });
}

async function waitForSignatureExpiry(page: Page, kit: Kit, mask: Mask): Promise<void> {
  let prior: { hash: string; operations: number } | null = null;
  let stableFrames = 0;
  await expect.poll(async () => {
    await requestFrame(page);
    const [hash, probe] = await Promise.all([canvasHash(page), probeState(page, kit)]);
    const next = { hash, operations: probe.accentOps.length };
    if (prior !== null && next.hash === prior.hash && next.operations === prior.operations) {
      stableFrames++;
    } else {
      stableFrames = 0;
    }
    prior = next;
    return stableFrames >= 3;
  }, { timeout: 5_000, intervals: [30, 50, 80, 120] }).toBe(true);
  await saveMaskFrame(page, 'settled', mask);
}

async function pixelDifference(page: Page, mask: Mask, names: readonly string[]): Promise<PixelDifference[]> {
  return page.locator('#game').evaluate((_, { mask, names, storeName }) => {
    const store = (window as typeof window & { [key: string]: Record<string, Uint8ClampedArray> | undefined })[storeName];
    if (!store) throw new Error('Mobility frame store is missing');
    const settled = store['settled'];
    if (!settled) throw new Error('Settled movement frame is missing');
    return names.map((name) => {
      const frame = store[name];
      if (!frame) throw new Error(`Missing mobility frame ${name}`);
      let changed = 0;
      let left = mask.width;
      let top = mask.height;
      let right = -1;
      let bottom = -1;
      const cells = new Uint16Array(18 * 14);
      for (let pixel = 0; pixel < mask.width * mask.height; pixel++) {
        const offset = pixel * 4;
        const delta = Math.abs(frame[offset]! - settled[offset]!)
          + Math.abs(frame[offset + 1]! - settled[offset + 1]!)
          + Math.abs(frame[offset + 2]! - settled[offset + 2]!);
        if (delta < 18) continue;
        changed++;
        const x = pixel % mask.width;
        const y = Math.floor(pixel / mask.width);
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
        const cellX = Math.min(17, Math.floor(x / (mask.width / 18)));
        const cellY = Math.min(13, Math.floor(y / (mask.height / 14)));
        cells[cellY * 18 + cellX]!++;
      }
      return {
        changed,
        bounds: right < 0 ? null : { left, top, right, bottom },
        fingerprint: Array.from(cells, (count) => Math.min(15, Math.floor(count / 2)).toString(16)).join(''),
      };
    });
  }, { mask, names, storeName: FRAME_STORE });
}

async function assertFitted(page: Page): Promise<void> {
  const geometry = await page.locator('#game').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    return {
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  expect(geometry.box.width).toBeGreaterThan(1);
  expect(geometry.box.height).toBeGreaterThan(1);
  expect(geometry.box.x).toBeGreaterThanOrEqual(-1);
  expect(geometry.box.y).toBeGreaterThanOrEqual(-1);
  expect(geometry.box.x + geometry.box.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.box.y + geometry.box.height).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function exerciseMove(page: Page, kit: Kit): Promise<{ mask: Mask; baseline: TankDraw; moved: TankDraw; evidence: PixelDifference; probe: ProbeState }> {
  const baseline = await waitForStableCanvas(page, kit);
  await clearProbe(page);
  const fuel = page.locator('.st-hud__fuel-value');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const move = touch
    ? page.locator('.st-hud__touch-strip [data-command="move-right"]')
    : page.locator('.st-hud__mobility [data-move="8"]');
  await move.click();
  await expect(fuel).toHaveText('92');
  await expect.poll(async () => {
    const draws = (await probeState(page, kit)).tankDraws;
    return draws.at(-1)?.x ?? null;
  }, { timeout: 3_000, intervals: [20, 40, 80] }).toBe(baseline.x + 8);
  // expect.poll returns void; read the actual same-frame coordinate after its exact assertion.
  const current = (await probeState(page, kit)).tankDraws.at(-1)!;
  const mask = undercarriageMask(kit, current);
  for (let frame = 0; frame < 8; frame++) {
    await requestFrame(page);
    await saveMaskFrame(page, `live-${frame}`, mask);
  }
  await expect.poll(async () => (await probeState(page, kit)).accentOps.length, {
    timeout: 2_000, intervals: [20, 40, 80],
  }).toBeGreaterThan(0);
  await waitForSignatureExpiry(page, kit, mask);
  const probe = await probeState(page, kit);
  const candidates = await pixelDifference(page, mask, Array.from({ length: 8 }, (_, index) => `live-${index}`));
  const evidence = candidates.reduce((largest, candidate) => candidate.changed > largest.changed ? candidate : largest);
  return { mask, baseline, moved: current, evidence, probe };
}

test.describe('Mobility signatures in the production bundle', () => {
  test('Garage-selected mobility kits move the active tank exactly eight pixels and leave distinct undercarriage signatures', async ({ page }) => {
    test.setTimeout(75_000);
    await installCanvasProbe(page);
    const fingerprints: string[] = [];
    for (const kit of KITS) {
      await startGarageMatch(page, kit);
      const result = await exerciseMove(page, kit);
      expect(result.moved.x, `${kit.label} active treads should use the real +8 draw coordinate`).toBe(result.baseline.x + 8);
      expect(result.evidence.changed, `${kit.label} signature mask should be nonblank`).toBeGreaterThan(12);
      expect(result.evidence.bounds, `${kit.label} signature should occupy the moved undercarriage mask`).not.toBeNull();
      expect(result.probe.accentOps.some((op) => op.style === kit.accent)).toBe(true);
      for (const operation of kit.expectedOps) {
        expect(result.probe.accentOps.some((op) => op.kind === operation), `${kit.label} should draw ${operation} with its profile accent`).toBe(true);
      }
      await assertFitted(page);
      fingerprints.push(result.evidence.fingerprint);
    }
    expect(new Set(fingerprints).size).toBe(KITS.length);
  });

  test('reduced motion keeps the moved undercarriage mask and accent operation log unchanged', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installCanvasProbe(page);
    const kit = KITS[0];
    await startGarageMatch(page, kit);
    const baseline = await waitForStableCanvas(page, kit);
    await clearProbe(page);
    const fuel = page.locator('.st-hud__fuel-value');
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const move = touch ? page.locator('.st-hud__touch-strip [data-command="move-right"]') : page.locator('.st-hud__mobility [data-move="8"]');
    await move.click();
    await expect(fuel).toHaveText('92');
    await expect.poll(async () => (await probeState(page, kit)).tankDraws.at(-1)?.x ?? null).toBe(baseline.x + 8);
    const moved = (await probeState(page, kit)).tankDraws.at(-1)!;
    const mask = undercarriageMask(kit, moved);
    for (let frame = 0; frame < 4; frame++) {
      await requestFrame(page);
      await saveMaskFrame(page, `live-${frame}`, mask);
    }
    await waitForStableCanvas(page, kit);
    await saveMaskFrame(page, 'settled', mask);
    const differences = await pixelDifference(page, mask, ['live-0', 'live-1', 'live-2', 'live-3']);
    expect(differences.every((difference) => difference.changed === 0)).toBe(true);
    expect((await probeState(page, kit)).accentOps).toHaveLength(0);
    await assertFitted(page);
  });
});

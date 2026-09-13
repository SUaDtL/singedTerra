import { writeFile } from 'node:fs/promises';
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { gotoRunningGame } from './support';

/**
 * R17 is deliberately an observational harness.  It attaches the unaggregated
 * CDP samples rather than defining a pass/fail performance budget before a
 * target-device baseline exists.  It must be run manually in an exclusive
 * headed-browser window against an identified candidate; it is not CI work.
 */
const RETAINED_SAMPLES = 5;
const WARMUP_SAMPLES = 1;
const IDLE_WINDOW_MS = 10_000;
const AIM_INPUTS = 20;
const AIM_INTERVAL_MS = 100;
const VIEWPORT = { width: 1440, height: 900 };

const METRIC_NAMES = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
] as const;

type MetricName = typeof METRIC_NAMES[number];
type MetricValues = Record<MetricName, number | null>;
type ScenarioName = 'idle' | 'aim' | 'impact';

interface ResourceByteEntry {
  name: string;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
}

interface BrowserEnvironment {
  userAgent: string;
  platform: string;
  language: string;
  hardwareConcurrency: number;
  deviceMemoryGiB: number | null;
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  reducedMotion: boolean;
  timezone: string;
}

interface Sample {
  scenario: ScenarioName;
  ordinal: number;
  warmup: boolean;
  windowDurationMs: number;
  metricBefore: MetricValues;
  metricAfter: MetricValues;
  metricDelta: MetricValues;
  resourceBytes: ResourceByteEntry[];
  idlePhase: { before: string | null; after: string | null } | null;
  aimAngle: { before: string; after: string; inputs: number } | null;
  taskDurationOutlier: boolean | null;
}

interface RawResult {
  schema: 'singedterra-r17-desktop-baseline-v1';
  observedAt: string;
  method: 'headed Chromium CDP Performance.getMetrics';
  measurementClass: 'desktop-browser-main-thread-and-heap';
  traceMode: string;
  retainedSamplesPerScenario: number;
  warmupSamplesPerScenario: number;
  candidate: {
    baseUrl: string;
    expectedBundleHash: string | null;
    sourceIdentity: string | null;
    identityVerification: 'external; not verified by this harness';
  };
  browserVersion: string;
  environment: BrowserEnvironment;
  externalEnvironment: {
    osVersion: string | null;
    powerState: string | null;
  };
  samples: Sample[];
  exclusions: 'none; IQR flags are descriptive only';
  limitations: string[];
}

type WindowMeasurement = Omit<Sample, 'scenario' | 'ordinal' | 'warmup' | 'idlePhase' | 'aimAngle' | 'taskDurationOutlier'>;

function emptyMetrics(): MetricValues {
  return {
    TaskDuration: null,
    ScriptDuration: null,
    LayoutDuration: null,
    RecalcStyleDuration: null,
    JSHeapUsedSize: null,
    JSHeapTotalSize: null,
  };
}

async function metrics(session: CDPSession): Promise<MetricValues> {
  const response = await session.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  const entries = new Map(response.metrics.map(({ name, value }) => [name, value]));
  const values = emptyMetrics();
  for (const name of METRIC_NAMES) values[name] = entries.get(name) ?? null;
  return values;
}

function difference(after: MetricValues, before: MetricValues): MetricValues {
  const delta = emptyMetrics();
  for (const name of METRIC_NAMES) {
    delta[name] = after[name] === null || before[name] === null ? null : after[name] - before[name];
  }
  return delta;
}

async function resourceBytes(page: Page): Promise<ResourceByteEntry[]> {
  return page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const resource = entry as PerformanceResourceTiming;
    return {
      name: resource.name,
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    };
  }));
}

async function environment(page: Page): Promise<BrowserEnvironment> {
  return page.evaluate(() => {
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });
}

async function waitForTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

function validatedCandidateBase(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('R17 requires E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/');
  const candidate = new URL(baseURL);
  if (
    candidate.protocol !== 'http:'
    || candidate.hostname !== '127.0.0.1'
    || candidate.port !== '5198'
    || candidate.pathname !== '/singedTerra/'
    || candidate.search !== ''
    || candidate.hash !== ''
  ) {
    throw new Error(`R17 refuses non-local or non-canonical candidate URL: ${baseURL}`);
  }
  return candidate.toString();
}

function requiredCandidateBinding(): { expectedBundleHash: string; sourceIdentity: string } {
  const expectedBundleHash = process.env['R17_EXPECTED_BUNDLE_HASH']?.trim();
  const sourceIdentity = process.env['R17_SOURCE_IDENTITY']?.trim();
  if (!expectedBundleHash || !sourceIdentity) {
    throw new Error('R17 requires externally verified R17_EXPECTED_BUNDLE_HASH and R17_SOURCE_IDENTITY before opening a browser.');
  }
  return { expectedBundleHash, sourceIdentity };
}

async function openFixedHotSeat(browser: Browser, candidateBase: string): Promise<{ page: Page; session: CDPSession }> {
  const candidate = new URL(candidateBase);
  // This manual context does not inherit playwright.config.ts's fixture context.
  // Apply the same loopback-only proxy policy here and abort any HTTP request that
  // does not remain on the exact candidate origin.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
  });
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== candidate.origin) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoRunningGame(page, new URL('?e2e=hotseat', candidate).toString());
  // Existing guide tests use the same delay to let the bounded opening flourish
  // finish before observing a static scene.
  await page.waitForTimeout(1_000);
  await waitForTwoFrames(page);
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  return { page, session };
}

async function runWindow(page: Page, session: CDPSession, operation: () => Promise<void>): Promise<WindowMeasurement> {
  const metricBefore = await metrics(session);
  const startedAt = await page.evaluate(() => performance.now());
  await operation();
  const endedAt = await page.evaluate(() => performance.now());
  const metricAfter = await metrics(session);
  return {
    windowDurationMs: endedAt - startedAt,
    metricBefore,
    metricAfter,
    metricDelta: difference(metricAfter, metricBefore),
    resourceBytes: await resourceBytes(page),
  };
}

async function measureScenario(
  browser: Browser,
  candidateBase: string,
  scenario: ScenarioName,
  ordinal: number,
): Promise<{ sample: Sample; environment: BrowserEnvironment }> {
  const { page, session } = await openFixedHotSeat(browser, candidateBase);
  try {
    const observedEnvironment = await environment(page);
    let idlePhase: Sample['idlePhase'] = null;
    let aimAngle: Sample['aimAngle'] = null;
    const window = await runWindow(page, session, async () => {
      if (scenario === 'idle') {
        const surface = page.locator('[data-battle-console-surface]');
        const before = await surface.getAttribute('data-battle-console-phase');
        expect(before).toBe('player-turn');
        await page.waitForTimeout(IDLE_WINDOW_MS);
        const after = await surface.getAttribute('data-battle-console-phase');
        expect(after).toBe(before);
        idlePhase = { before, after };
        return;
      }
      if (scenario === 'aim') {
        const angle = page.locator('[data-semantic-key="node:output:Angle:43"]');
        const aimRight = page.getByRole('button', { name: 'Aim barrel right', exact: true });
        const before = (await angle.textContent())?.trim();
        expect(before).toMatch(/^\d+°$/);
        for (let input = 0; input < AIM_INPUTS; input += 1) {
          await aimRight.click();
          await page.waitForTimeout(AIM_INTERVAL_MS);
        }
        await waitForTwoFrames(page);
        const after = (await angle.textContent())?.trim();
        expect(after).toMatch(/^\d+°$/);
        expect(after).not.toBe(before);
        aimAngle = { before: before!, after: after!, inputs: AIM_INPUTS };
        return;
      }
      const fire = page.locator('[data-battle-console-action="fire"]');
      await expect(fire).toBeEnabled();
      await fire.click();
      await expect(fire).toBeDisabled();
      await expect(fire).toBeEnabled({ timeout: 30_000 });
    });
    return {
      environment: observedEnvironment,
      sample: {
        ...window,
        scenario,
        ordinal,
        warmup: ordinal < WARMUP_SAMPLES,
        idlePhase,
        aimAngle,
        taskDurationOutlier: null,
      },
    };
  } finally {
    await session.detach();
    await page.context().close();
  }
}

function percentile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

/** Flags anomalous TaskDuration deltas without dropping or replacing any sample. */
function markTaskDurationOutliers(samples: Sample[]): void {
  for (const scenario of ['idle', 'aim', 'impact'] as const) {
    const retained = samples.filter((sample) => sample.scenario === scenario && !sample.warmup);
    const values = retained
      .map((sample) => sample.metricDelta.TaskDuration)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);
    if (values.length < 4) continue;
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    const spread = q3 - q1;
    const lower = q1 - 1.5 * spread;
    const upper = q3 + 1.5 * spread;
    for (const sample of retained) {
      const value = sample.metricDelta.TaskDuration;
      sample.taskDurationOutlier = value !== null && (value < lower || value > upper);
    }
  }
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(360_000);

// This is a manual, headed measurement harness.  It is intentionally absent
// from ordinary local/CI E2E runs so a shared worker never creates an
// uncontrolled two-minute desktop benchmark.
test.skip(process.env['R17_MEASURE'] !== '1', 'R17 measurement requires R17_MEASURE=1 and an exclusive browser window');

test('R17 retains desktop idle, aim, and impact browser measurements', async ({ browser, baseURL }, testInfo) => {
  const candidateBase = validatedCandidateBase(baseURL);
  const candidateBinding = requiredCandidateBinding();
  const samples: Sample[] = [];
  let capturedEnvironment: BrowserEnvironment | null = null;
  for (const scenario of ['idle', 'aim', 'impact'] as const) {
    for (let ordinal = 0; ordinal < WARMUP_SAMPLES + RETAINED_SAMPLES; ordinal += 1) {
      const measurement = await measureScenario(browser, candidateBase, scenario, ordinal);
      samples.push(measurement.sample);
      if (capturedEnvironment === null) capturedEnvironment = measurement.environment;
    }
  }
  markTaskDurationOutliers(samples);
  const result: RawResult = {
    schema: 'singedterra-r17-desktop-baseline-v1',
    observedAt: new Date().toISOString(),
    method: 'headed Chromium CDP Performance.getMetrics',
    measurementClass: 'desktop-browser-main-thread-and-heap',
    traceMode: process.env['R17_TRACE_MODE'] ?? 'operator-not-recorded',
    retainedSamplesPerScenario: RETAINED_SAMPLES,
    warmupSamplesPerScenario: WARMUP_SAMPLES,
    candidate: {
      baseUrl: candidateBase,
      expectedBundleHash: candidateBinding.expectedBundleHash,
      sourceIdentity: candidateBinding.sourceIdentity,
      identityVerification: 'external; not verified by this harness',
    },
    browserVersion: await browser.version(),
    environment: capturedEnvironment!,
    externalEnvironment: {
      osVersion: process.env['R17_OS_VERSION'] ?? null,
      powerState: process.env['R17_POWER_STATE'] ?? null,
    },
    samples,
    exclusions: 'none; IQR flags are descriptive only',
    limitations: [
      'CDP TaskDuration and ScriptDuration measure browser main-thread work; they are not GPU, energy, thermal, or input-to-photon measurements.',
      'PerformanceResourceTiming reports fetched transfer and encoded body bytes. Decoded image or GPU residency is not measured.',
      'This standard desktop viewport is not physical mobile-device evidence.',
      'Reconnect transport timing is intentionally absent: a disposable Supabase browser integration is required for that scenario.',
    ],
  };
  const artifact = testInfo.outputPath('r17-desktop-baseline.json');
  const body = JSON.stringify(result, null, 2);
  await writeFile(artifact, body, 'utf8');
  await testInfo.attach('r17-desktop-baseline.json', {
    body: Buffer.from(body),
    contentType: 'application/json',
  });
});

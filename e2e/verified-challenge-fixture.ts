import type { Page, Route } from '@playwright/test';

export const VERIFIED_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const VERIFIED_SESSION_ID = '22222222-2222-4222-8222-222222222222';
export const PRIOR_SESSION_ID = '33333333-3333-4333-8333-333333333333';
export const VERIFIED_CHALLENGE_STORAGE_KEY = 'singedterra:verified-challenge:cq1';
export const QUALIFYING_FIRE = Object.freeze({ angle: 32, power: 100 });

export const VERIFIED_DESCRIPTOR = Object.freeze({
  descriptorVersion: 1,
  trialId: 'crosswind-qualification',
  editionId: 'cq1',
  entitlementId: 'crosswind-qualification',
  objectiveVersion: 1,
  verifierArtifactId: 'cq1',
  cpuPolicyId: 'cq1-hard-v3',
  rewardVersion: 1,
  reward: { medalId: 'crosswind-qualification', xp: 200 },
  seed: 42,
  rules: {
    maxPlayers: 2,
    humanSeat: 0,
    rounds: 1,
    walls: 'wrap',
    hazards: 'none',
    gravity: 0.15,
    maxWind: 6,
    interestRate: 0,
    suddenDeathTurn: 0,
    teamMode: false,
    armsLevel: 0,
    starterWeaponFalloff: 'decisive',
    weapon: 'baby_missile',
  },
  limits: {
    humanSalvos: 3,
    cpuSalvos: 3,
    angle: { min: 0, max: 180 },
    power: { min: 0, max: 100 },
    sessionSeconds: 1800,
    computeAttempts: 3,
  },
  sessionId: VERIFIED_SESSION_ID,
  accountId: VERIFIED_ACCOUNT_ID,
  admittedAt: '2099-09-13T12:00:00.000000Z',
  expiresAt: '2099-09-13T12:30:00.000000Z',
});

const ranks = Object.freeze({
  cadet: Object.freeze({ code: 'R-01', title: 'Cadet', level: 1,
    insignia: Object.freeze({ mark: '◇', label: 'single hollow diamond' }) }),
  gunner: Object.freeze({ code: 'R-02', title: 'Gunner', level: 2,
    insignia: Object.freeze({ mark: '◆', label: 'single diamond' }) }),
  bombardier: Object.freeze({ code: 'R-03', title: 'Bombardier', level: 3,
    insignia: Object.freeze({ mark: '◆◆', label: 'double diamond' }) }),
});

function medal(
  sessionId = PRIOR_SESSION_ID,
  awardedAt = '2099-09-13T11:00:00.000000Z',
) {
  return Object.freeze({
    entitlementId: 'crosswind-qualification',
    medalId: 'crosswind-qualification',
    xp: 200,
    rewardVersion: 1,
    awardedAt,
    sessionId,
  });
}

export function verifiedCareer(
  verifiedMatches: number,
  verifiedWins: number,
  challengeAwarded: boolean,
) {
  const replayXp = 100 * (verifiedMatches + verifiedWins);
  const challengeXp = challengeAwarded ? 200 : 0;
  const totalXp = replayXp + challengeXp;
  const level = Math.floor(totalXp / 500) + 1;
  const current = level >= 2 ? ranks.gunner : ranks.cadet;
  const next = level >= 2 ? ranks.bombardier : ranks.gunner;
  return Object.freeze({
    careerProjectionVersion: 1,
    evidence: 'verified_career_v1',
    replay: Object.freeze({ verifiedMatches, verifiedWins, xp: replayXp }),
    challenge: Object.freeze({ xp: challengeXp, medals: Object.freeze(challengeAwarded ? [medal()] : []) }),
    totalXp,
    level,
    levelXp: totalXp % 500,
    nextLevelXp: 500,
    rank: Object.freeze({ current, next }),
  });
}

const emptyCareer = verifiedCareer(0, 0, false);
const awardedCareer = Object.freeze({
  ...verifiedCareer(0, 0, true),
  challenge: Object.freeze({ xp: 200, medals: Object.freeze([
    medal(VERIFIED_SESSION_ID, '2099-09-13T12:05:00.000000Z'),
  ]) }),
});
const priorAwardedCareer = verifiedCareer(0, 0, true);

export type ReceiptDisposition = 'awarded' | 'already_owned';

export function verifiedReceipt(disposition: ReceiptDisposition) {
  const first = disposition === 'awarded';
  return Object.freeze({
    evidence: 'verified_challenge_cq1',
    sessionId: VERIFIED_SESSION_ID,
    accountId: VERIFIED_ACCOUNT_ID,
    editionId: 'cq1',
    transcript: Object.freeze([QUALIFYING_FIRE]),
    outcome: 'objective_cleared',
    disposition,
    xpGranted: first ? 200 : 0,
    completedAt: '2099-09-13T12:05:00.000000Z',
    careerBefore: first ? emptyCareer : priorAwardedCareer,
    careerAfter: first ? awardedCareer : priorAwardedCareer,
  });
}

export interface VerifiedNetworkFixtureOptions {
  readonly disposition?: ReceiptDisposition;
  readonly startDisabled?: boolean;
  readonly resumedTranscript?: readonly { angle: number; power: number }[];
  readonly holdCompletion?: boolean;
  readonly busyCompletionOnce?: boolean;
  readonly career?: ReturnType<typeof verifiedCareer>;
  readonly careerUnavailable?: boolean;
}

export interface VerifiedNetworkFixture {
  readonly requests: {
    start: unknown[];
    get: unknown[];
    complete: unknown[];
    abandon: unknown[];
    career: number;
  };
  releaseCompletion(): void;
}

/** Enter the production lobby through the same splash control a player uses. */
export async function gotoVerifiedFixtureLobby(page: Page, url = './'): Promise<void> {
  await page.goto(url);
  const splash = page.locator('#st-splash');
  await splash.waitFor({ state: 'visible' });
  await splash.click();
  await splash.waitFor({ state: 'hidden' });
  await page.locator('#lobby').waitFor({ state: 'visible' });
  await page.locator('#lobby .lobby-card').waitFor({ state: 'visible' });
}

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

function accountSummary400() {
  return {
    matchesPlayed: 3,
    wins: 1,
    progressionVersion: 1,
    totalXp: 400,
    level: 1,
    levelXp: 400,
    nextLevelXp: 500,
    verifiedProgression: {
      evidence: 'verified_replay_v2',
      matchesPlayed: 3,
      wins: 1,
      progressionVersion: 1,
      totalXp: 400,
      level: 1,
      levelXp: 400,
      nextLevelXp: 500,
    },
  };
}

/** Explicit browser-only network double. No fixture writes engine or terminal state. */
export async function installVerifiedNetworkFixture(
  page: Page,
  options: VerifiedNetworkFixtureOptions = {},
): Promise<VerifiedNetworkFixture> {
  const requests = { start: [] as unknown[], get: [] as unknown[], complete: [] as unknown[],
    abandon: [] as unknown[], career: 0 };
  let completionReleased = !options.holdCompletion;
  let releaseCompletion!: () => void;
  const completionGate = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  let busyDelivered = false;
  const receipt = verifiedReceipt(options.disposition ?? 'awarded');
  const resumeTranscript = options.resumedTranscript ?? [];

  await page.addInitScript(({ authStorageKey, resume, accountId, storageKey, descriptor }) => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    window.localStorage.setItem(authStorageKey ?? `sb-${window.location.hostname.split('.')[0]}-auth-token`, JSON.stringify({
      access_token: ['e2e', 'verified', 'session', 'token'].join('-'),
      refresh_token: ['e2e', 'verified', 'refresh', 'token'].join('-'),
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: accountId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'ranger@example.test',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-09-13T10:00:00.000Z',
      },
    }));
    if (resume.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify({
        storageVersion: 1,
        editionId: 'cq1',
        accountId,
        descriptor,
        transcript: resume,
        completionPending: false,
      }));
    }
  }, {
    authStorageKey: process.env['E2E_AUTH_STORAGE_KEY'] ?? null,
    resume: resumeTranscript,
    accountId: VERIFIED_ACCOUNT_ID,
    storageKey: VERIFIED_CHALLENGE_STORAGE_KEY,
    descriptor: VERIFIED_DESCRIPTOR,
  });

  await page.route('**/rest/v1/profiles**', (route) => json(route, {
    id: VERIFIED_ACCOUNT_ID,
    display_name: 'Ranger',
  }));
  await page.route('**/auth/v1/user', (route) => json(route, {
    id: VERIFIED_ACCOUNT_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'ranger@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-13T10:00:00.000Z',
  }));
  await page.route('**/functions/v1/account_summary', (route) => json(route, accountSummary400()));
  await page.route('**/functions/v1/verified_career_summary', (route) => {
    requests.career += 1;
    return options.careerUnavailable
      ? json(route, { responseVersion: 1, error: 'verification_unavailable' }, 503)
      : json(route, { responseVersion: 1, career: options.career ?? verifiedCareer(3, 1, true) });
  });
  await page.route('**/functions/v1/start_verified_challenge', (route) => {
    requests.start.push(route.request().postDataJSON());
    return options.startDisabled
      ? json(route, { responseVersion: 1, error: 'challenge_starts_disabled' }, 503)
      : json(route, { responseVersion: 1, descriptor: VERIFIED_DESCRIPTOR,
        resumed: resumeTranscript.length > 0 });
  });
  await page.route('**/functions/v1/get_verified_challenge', (route) => {
    requests.get.push(route.request().postDataJSON());
    if (options.busyCompletionOnce && busyDelivered) {
      return json(route, { responseVersion: 1, descriptor: VERIFIED_DESCRIPTOR, status: 'completed',
        computeAttempts: 1, boundTranscript: [QUALIFYING_FIRE], receipt });
    }
    return json(route, { responseVersion: 1, descriptor: VERIFIED_DESCRIPTOR, status: 'active',
      computeAttempts: 0, boundTranscript: null, receipt: null });
  });
  await page.route('**/functions/v1/complete_verified_challenge', async (route) => {
    requests.complete.push(route.request().postDataJSON());
    if (!completionReleased) await completionGate;
    if (options.busyCompletionOnce && !busyDelivered) {
      busyDelivered = true;
      return json(route, { responseVersion: 1, error: 'verification_busy', retryAfter: 1 }, 503,
        { 'Retry-After': '1', 'Access-Control-Expose-Headers': 'Retry-After' });
    }
    return json(route, { responseVersion: 1, receipt });
  });
  await page.route('**/functions/v1/abandon_verified_challenge', (route) => {
    requests.abandon.push(route.request().postDataJSON());
    return json(route, { responseVersion: 1, descriptor: VERIFIED_DESCRIPTOR, status: 'abandoned',
      computeAttempts: 0, boundTranscript: null, receipt: null });
  });

  return {
    requests,
    releaseCompletion() {
      completionReleased = true;
      releaseCompletion();
    },
  };
}

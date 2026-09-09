import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { VerifiedDeploymentSession, type VerifiedDeploymentAccountPort } from './VerifiedDeploymentSession';
import { VerifiedDeploymentStorage } from './verifiedDeploymentStorage';
import type { VerifiedDeploymentStart, VerifiedDeploymentReceipt } from './verifiedDeployment';

const verifiedSessionId = '00000000-0000-4000-8000-000000000061'

const verifiedStart: VerifiedDeploymentStart = {
  resumed: false,
  descriptor: {
    sessionId: verifiedSessionId,
    expiresAt: '2026-08-12T13:30:00.000Z',
    contractVersion: 2,
    engineVersion: 2,
    rulesetVersion: 4,
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
  },
}

const verifiedReceipt: VerifiedDeploymentReceipt = {
  result: { sessionId: verifiedSessionId, won: true, outcome: 'win', verifiedXp: 200 },
  progression: {
    evidence: 'verified_replay_v2',
    prior: {
      evidence: 'verified_replay_v2', matchesPlayed: 0, wins: 0, progressionVersion: 1,
      totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500,
    },
    current: {
      evidence: 'verified_replay_v2', matchesPlayed: 1, wins: 1, progressionVersion: 1,
      totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500,
    },
  },
}

type PolicyVersion = 2 | 3;

function startFor(version: PolicyVersion, resumed = false): VerifiedDeploymentStart {
  return version === 2
    ? { ...verifiedStart, resumed }
    : {
        resumed,
        descriptor: { ...verifiedStart.descriptor, contractVersion: 3, engineVersion: 3 },
      };
}

function receiptFor(version: PolicyVersion): VerifiedDeploymentReceipt {
  return {
    ...verifiedReceipt,
    progression: {
      ...verifiedReceipt.progression,
      evidence: version === 2 ? 'verified_replay_v2' : 'verified_replay_v3',
    },
  };
}

function setup(version: PolicyVersion = 2) {
  const start = startFor(version);
  const receipt = receiptFor(version);
  const account: { -readonly [K in keyof VerifiedDeploymentAccountPort]: VerifiedDeploymentAccountPort[K] } = {
    state: { status: 'authenticated', busy: false, error: '', profile: { id: 'owner', displayName: 'Ranger', summary: null } },
    startVerifiedDeployment: vi.fn(async () => start),
    completeVerifiedDeployment: vi.fn(async () => receipt),
    abandonVerifiedDeployment: vi.fn(async () => true),
  };
  const session = new VerifiedDeploymentSession(account, (now) => new VerifiedDeploymentStorage(localStorage, now));
  return { account, session, start, receipt };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-12T13:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('verified deployment session boundary', () => {
  it('records accepted evidence, completes exactly that descriptor, and returns to Battery', async () => {
    const { account, session } = setup();
    expect(session.verifiedDeployment.status).toBe('idle');
    await expect(session.startVerifiedDeployment()).resolves.toEqual(verifiedStart);
    expect(session.recordVerifiedDeploymentFire({ angle: 37, power: 64 })).toBe(true);
    await expect(session.completeVerifiedDeployment()).resolves.toEqual(verifiedReceipt);
    expect(account.completeVerifiedDeployment).toHaveBeenCalledWith(verifiedSessionId, [{ angle: 37, power: 64 }]);
    expect(session.verifiedDeployment.status).toBe('verified');
    expect(session.returnVerifiedDeploymentToBattery()).toBe(true);
    expect(session.verifiedDeployment.status).toBe('idle');
  });
  it.each([2, 3] as const)('retains V%s terminal evidence for a retry without appending another shot', async (version) => {
    const { account, session, receipt } = setup(version);
    vi.mocked(account.completeVerifiedDeployment!).mockResolvedValueOnce(null);
    await session.startVerifiedDeployment();
    session.recordVerifiedDeploymentFire({ angle: 37, power: 64 });
    await expect(session.completeVerifiedDeployment()).resolves.toBeNull();
    expect(session.recordVerifiedDeploymentFire({ angle: 0, power: 0 })).toBe(false);
    await expect(session.retryVerifiedDeploymentCompletion()).resolves.toEqual(receipt);
    expect(account.completeVerifiedDeployment).toHaveBeenNthCalledWith(2, verifiedSessionId, [{ angle: 37, power: 64 }]);
  });
  it.each([[2, 3], [3, 2]] as const)(
    'rejects V%s descriptor completion carrying V%s evidence',
    async (descriptorVersion, receiptVersion) => {
      const mismatch = setup(descriptorVersion);
      vi.mocked(mismatch.account.completeVerifiedDeployment!).mockResolvedValue(receiptFor(receiptVersion));
      await mismatch.session.startVerifiedDeployment();
      mismatch.session.recordVerifiedDeploymentFire({ angle: 37, power: 64 });
      await expect(mismatch.session.completeVerifiedDeployment()).resolves.toBeNull();
      expect(mismatch.session.verifiedDeployment.status).toBe('retryable');
    },
  );
  it.each([2, 3] as const)('expires V%s input and requires an explicit casual choice', async (version) => {
    const { session, start } = setup(version);
    await session.startVerifiedDeployment();
    expect(session.continueVerifiedDeploymentCasually()).toBe(false);
    expect(session.refreshVerifiedDeploymentDeadline(Date.parse(start.descriptor.expiresAt)).status).toBe('expired');
    expect(session.continueVerifiedDeploymentCasually()).toBe(true);
    expect(session.verifiedDeployment.status).toBe('casual');
  });
  it.each([2, 3] as const)('abandons only the active V%s owner descriptor', async (version) => {
    const { account, session } = setup(version);
    await session.startVerifiedDeployment();
    await expect(session.abandonVerifiedDeployment()).resolves.toBe(true);
    expect(account.abandonVerifiedDeployment).toHaveBeenCalledWith(verifiedSessionId);
    expect(session.verifiedDeployment.status).toBe('idle');
  });
  it.each([2, 3] as const)('freezes V%s on account change and revalidates the same descriptor for its owner', async (version) => {
    const { account, session, start } = setup(version);
    const owner = account.state;
    await session.startVerifiedDeployment();
    account.state = { status: 'anonymous', busy: false, error: '' };
    expect(session.syncAccountIdentity()).toBe(true);
    session.freezeVerifiedDeploymentForAccountChange();
    expect(session.verifiedDeployment.status).toBe('frozen');
    account.state = owner;
    expect(session.syncAccountIdentity()).toBe(true);
    vi.mocked(account.startVerifiedDeployment!).mockResolvedValue({ ...start, resumed: true });
    await session.revalidateFrozenVerifiedDeployment(session.advanceRecoveryGeneration());
    expect(session.verifiedDeployment.status).toBe('active');
  });
  it.each([[2, 3], [3, 2]] as const)(
    'rejects resumed same-session tuple substitution from V%s to V%s',
    async (storedVersion, resumedVersion) => {
      const { account, session } = setup(storedVersion);
      const owner = account.state;
      await session.startVerifiedDeployment();
      account.state = { status: 'anonymous', busy: false, error: '' };
      session.syncAccountIdentity();
      session.freezeVerifiedDeploymentForAccountChange();
      account.state = owner;
      session.syncAccountIdentity();
      vi.mocked(account.startVerifiedDeployment!).mockResolvedValue(startFor(resumedVersion, true));

      await session.revalidateFrozenVerifiedDeployment(session.advanceRecoveryGeneration());

      expect(session.verifiedDeployment.status).toBe('frozen');
    },
  );
  it('ignores a deferred start that completes after an account switch', async () => {
    const { account, session } = setup();
    let finish!: (value: VerifiedDeploymentStart) => void;
    vi.mocked(account.startVerifiedDeployment!).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = session.startVerifiedDeployment();
    account.state = { status: 'anonymous', busy: false, error: '' };
    session.syncAccountIdentity();
    finish(verifiedStart);
    await expect(pending).resolves.toBeNull();
    expect(session.verifiedDeployment.status).toBe('idle');
  });
});

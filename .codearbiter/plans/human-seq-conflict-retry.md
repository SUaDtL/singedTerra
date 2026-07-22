# Human Seq-Conflict Retry Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** APPROVED — user approved 2026-07-21.

**Goal:** Prove the real `NetworkClient` human seq-conflict retry, exhaustion, and teardown contracts through deterministic public-API tests.

**Architecture:** A new focused Vitest suite instantiates `NetworkClient`, stubs `fetch`, fixes jitter at zero, and advances fake timers through the documented retry schedule. Production code remains unchanged unless the tests expose a genuine defect.

**Tech Stack:** TypeScript, Vitest fake timers, jsdom, existing `NetworkClient` public API; no new dependency.

## Global Constraints

- Test the real `NetworkClient`; do not reimplement its retry algorithm in a helper.
- Use only public behavior: `sendAction`, `onFireFailed`, `isFiring`, `stop`, and captured POSTs.
- Fix `Math.random()` at `0` so expected delays are exactly 40/80/160/240/240ms.
- Preserve all production retry counts, delays, jitter, payloads, and error messages.
- No dependency, lockfile, workflow, Supabase, Edge Function, or deployment change.
- Task workers leave changes uncommitted; codeArbiter owns one landing commit.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Human conflict retry coverage | — | focused GREEN plus two temporary RED mutations | ACCEPTED |
| T2 | Review closure, full matrix, commit, PR, and green CI | T1 | reviews, commit gate, hosted checks | IN PROGRESS |

---

### Task 1: Cover human seq-conflict liveness

**Files:**

- Create: `client/src/client/NetworkClient.humanRetry.test.ts`
- Temporarily mutate and restore: `client/src/client/NetworkClient.ts`

**Interfaces:**

- Consumes: `new NetworkClient(supabase, roomId, playerId, options, token)`.
- Consumes: `sendAction({ type: 'fire' })`, `onFireFailed(listener)`, `isFiring`, and `stop()`.
- Produces: three focused tests that observe POST count/timing/body and failure notifications.

- [x] **Step 1: Add the focused public-API suite**

Create `client/src/client/NetworkClient.humanRetry.test.ts` with this structure:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

const conflict = () => ({
  ok: false,
  json: async () => ({ ok: false, error: 'seq_conflict', retry: true }),
});
const accepted = () => ({ ok: true, json: async () => ({ ok: true, seq: 0 }) });

async function settleFetch(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>): NetworkClient {
  vi.stubGlobal('fetch', fetchMock);
  return new NetworkClient(
    {} as unknown as SupabaseClient,
    'room-1',
    'player-abc',
    OPTIONS,
    'seat-token-test',
  );
}

describe('NetworkClient — human seq-conflict retry (#120)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries one human conflict at 40ms with the identical payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(accepted());
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(39);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(retryInit.body).toBe(firstInit.body);

    client.stop();
  });

  it('bounds persistent conflicts at five retries and releases the firing lock', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => conflict());
    const client = makeClient(fetchMock);
    const failure = vi.fn();
    client.onFireFailed(failure);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    for (const delay of [40, 80, 160, 240, 240]) {
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledWith('Shot kept colliding — try again.');
    expect(client.isFiring).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    client.stop();
  });

  it('cancels a scheduled retry when the client stops', async () => {
    const fetchMock = vi.fn().mockResolvedValue(conflict());
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    client.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Prove the current production contract is GREEN**

Run:

```powershell
npm -w @singedterra/client exec vitest run src/client/NetworkClient.humanRetry.test.ts
```

Expected: 1 file and 3 tests pass. If the exact helper needs a TypeScript-only correction, change
the test fixture without weakening the three observable assertions.

- [x] **Step 3: Prove retry scheduling mutation sensitivity**

Temporarily change `NetworkClient.MAX_SEQ_RETRIES` from `5` to `0` with `apply_patch`, rerun the
focused command, and require failures in the retry-success and bounded-exhaustion cases. Restore the
constant to `5` with `apply_patch` and rerun to 3/3 GREEN.

- [x] **Step 4: Prove teardown mutation sensitivity**

Temporarily remove only `clearTimeout(this.seqRetryTimer)` from `stop()` with `apply_patch`, rerun the
focused command, and require the teardown case to fail because the pending timer remains allocated
immediately after `stop()`. The `_disposed` backstop may still prevent a second POST; the timer-count
assertion independently proves prompt resource cancellation. Restore the line with `apply_patch`
and rerun to 3/3 GREEN.

- [x] **Step 5: Run task verification**

```powershell
npm run typecheck
npm run test:client
git diff --check
git diff --quiet -- package-lock.json
```

Expected: typecheck passes; 22 Vitest files and 171 tests pass; diff hygiene passes; lockfile has no
diff. Only the new test, approved spec/plan, and append-only sprint receipt may remain changed.

- [x] **Step 6: Request task review**

The reviewer must confirm the suite instantiates the real class, uses public behavior, distinguishes
human retry from the existing bot no-retry path, kills both required mutations, does not advance into
the 9-second fire watchdog, and leaves production code unchanged.

---

### Task 2: Close review and open a green pull request

- [x] **Step 1: Run whole-diff review and coverage audit**

Require zero Critical/Important or CRITICAL/HIGH findings. Coverage must explicitly evaluate missing
retry scheduling, an off-by-one retry cap, lost failure notification/unlock, and teardown leakage.

- [x] **Step 2: Run the complete final matrix**

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

Expected: every command exits 0; the E2E count remains 18 passed and 9 intentional skips while PR
#159 is unmerged.

- [x] **Step 3: Append SMARTS and verification receipts**

Record the stale-premise narrowing, approved design, mutation RED/GREEN evidence, exact test counts,
review outcomes, unchanged dependency state, and branch/base SHA in `.codearbiter/sprint-log.md`.

- [ ] **Step 4: Run `$ca-commit`**

Stage exact intended paths only. Classification is `test(client)` unless a genuine production defect
requires a separately reviewed `fix(client)` change. Use `Closes #120` in the PR, not the commit.

- [ ] **Step 5: Run `$ca-pr` and `$ca-watch`**

Open a ready PR that closes #120, never merge it, and watch every available check to green.

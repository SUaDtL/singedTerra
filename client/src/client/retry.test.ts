import { afterEach, describe, expect, it, vi } from 'vitest';
import { postOnceWithRetry, RETRY_DELAY_MS, settleWithDeadline } from './retry';

describe('postOnceWithRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first successful value without scheduling a delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('ready');

    await expect(postOnceWithRetry(fn)).resolves.toEqual({ ok: true, value: 'ready' });
    expect(fn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a transient failure and returns the later value', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('recovered');

    await expect(postOnceWithRetry(fn, 2, 0)).resolves.toEqual({ ok: true, value: 'recovered' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns the exact final error after exhausting every attempt', async () => {
    const first = new Error('first');
    const final = new Error('final');
    const fn = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(final);

    const result = await postOnceWithRetry(fn, 2, 0);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected retry exhaustion');
    expect(result.error).toBe(final);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clamps non-positive attempts to one call', async () => {
    const failure = new Error('only attempt');
    const fn = vi.fn().mockRejectedValue(failure);

    const result = await postOnceWithRetry(fn, 0, 0);

    expect(result).toEqual({ ok: false, error: failure });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('waits for the default delay only between attempts', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('done');

    const pending = postOnceWithRetry(fn);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(fn).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true, value: 'done' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('honors a custom retry delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('done');

    const pending = postOnceWithRetry(fn, 2, 40);
    await vi.advanceTimersByTimeAsync(39);
    expect(fn).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true, value: 'done' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries with no scheduled timer when the delay is zero', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('done');

    await expect(postOnceWithRetry(fn, 2, 0)).resolves.toEqual({ ok: true, value: 'done' });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels before a stale continuation can make another attempt', async () => {
    let active = true;
    const fn = vi.fn().mockImplementation(async () => {
      active = false;
      throw new Error('uncertain');
    });

    const result = await postOnceWithRetry(fn, 2, 0, () => active);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected cancellation');
    expect(result.error).toMatchObject({ message: 'retry_cancelled' });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('settles a non-cooperating operation at its deadline and ignores its late result', async () => {
    vi.useFakeTimers();
    let resolveLate!: (value: string) => void;
    const operation = new Promise<string>((resolve) => { resolveLate = resolve; });
    const onDeadline = vi.fn();

    const pending = settleWithDeadline(operation, 25, onDeadline);
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toMatchObject({ ok: false, error: { message: 'operation_deadline_exceeded' } });
    expect(onDeadline).toHaveBeenCalledOnce();

    resolveLate('too late');
    await Promise.resolve();
    await expect(pending).resolves.toMatchObject({ ok: false });
  });
});

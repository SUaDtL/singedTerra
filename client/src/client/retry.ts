/** Default pause between failed attempts. Modest so callers (and the harness)
 *  don't pay much wall-clock time; override with the `delayMs` param (pass 0 in tests). */
export const RETRY_DELAY_MS = 200;

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Resolve at a hard deadline even when the supplied thenable ignores cancellation. */
export function settleWithDeadline<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  onDeadline?: () => void,
): Promise<Settled<T>> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: Settled<T>): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { onDeadline?.(); } catch { /* cancellation is best effort */ }
      finish({ ok: false, error: new Error('operation_deadline_exceeded') });
    }, Math.max(0, timeoutMs));
    Promise.resolve(operation).then(
      (value) => finish({ ok: true, value }),
      (error) => finish({ ok: false, error }),
    );
  });
}

/**
 * postOnceWithRetry — pure, dependency-free retry helper.
 *
 * Calls `fn()`. If it throws/rejects, retries until the total number of
 * attempts reaches `attempts`. On the first success resolves
 * `{ ok: true, value }`. If all attempts fail, resolves (NEVER rejects) to
 * `{ ok: false, error }`.
 *
 * Semantics:
 * - `attempts=2` means one initial try plus one retry (two calls total).
 * - `attempts` is clamped to a minimum of 1: a non-positive count still
 *   calls `fn()` exactly once (never zero), so the helper always either
 *   succeeds or yields a captured error.
 * - A `delayMs` pause (default `RETRY_DELAY_MS`) is awaited BETWEEN attempts
 *   only — never before the first attempt and never after the last. With the
 *   default `attempts=2` that is at most a single delay.
 */
export async function postOnceWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = RETRY_DELAY_MS,
  canAttempt: () => boolean = () => true,
): Promise<Settled<T>> {
  const total = attempts < 1 ? 1 : attempts;
  let lastError: unknown;
  for (let i = 0; i < total; i++) {
    if (!canAttempt()) return { ok: false, error: new Error('retry_cancelled') };
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
      if (!canAttempt()) return { ok: false, error: new Error('retry_cancelled') };
    }
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError };
}

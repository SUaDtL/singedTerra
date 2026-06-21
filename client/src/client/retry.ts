/** Default pause between failed attempts. Modest so callers (and the harness)
 *  don't pay much wall-clock time; override with the `delayMs` param (pass 0 in tests). */
export const RETRY_DELAY_MS = 200;

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
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const total = attempts < 1 ? 1 : attempts;
  let lastError: unknown;
  for (let i = 0; i < total; i++) {
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
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

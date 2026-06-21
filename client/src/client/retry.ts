/**
 * postOnceWithRetry — pure, dependency-free retry helper.
 *
 * Calls `fn()`. If it throws/rejects, retries until the total number of
 * attempts reaches `attempts`. On the first success resolves
 * `{ ok: true, value }`. If all attempts fail, resolves (NEVER rejects) to
 * `{ ok: false, error }`.
 *
 * Semantics: `attempts=2` means one initial try plus one retry (two calls total).
 */
export async function postOnceWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError };
}

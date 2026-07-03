/**
 * edgeFunctions.ts — the single owner of the Supabase Edge-Function HTTP
 * transport. Every `functions/v1/<name>` POST in the client goes through here,
 * so the base URL and the default header block live in exactly one place.
 *
 * DOMAIN-AGNOSTIC by design: this is transport only. `ok` reflects the HTTP
 * status (`res.ok`) and NOTHING else — callers apply their own success
 * predicate on the parsed body (e.g. restart_game keys success on `data.ok`
 * while the Lobby sites key on `data.error`). Fetch rejections are NOT caught
 * here — callers that need a "Network error" fallback wrap the call in their
 * own try/catch, exactly as before this module existed.
 *
 * Env is read INSIDE the functions (not at module top) so tests can stub
 * `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` per-test.
 */

export interface EdgeResult<T> {
  /** HTTP-level success only (`res.ok`). Never folds in `data.error`/`data.ok`. */
  ok: boolean;
  status: number;
  /** Parsed JSON body, or `null` when the body was empty / not JSON. */
  data: T | null;
}

/** Build the full Edge-Function URL for `name`. */
export function edgeUrl(name: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

/** The default header block every Edge-Function POST carries. */
export function edgeHeaders(): Record<string, string> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anon}`,
    'apikey': anon,
  };
}

/**
 * POST `body` (JSON-encoded) to the named Edge Function and return the HTTP
 * status + parsed body. Non-JSON / empty bodies yield `data: null`. Fetch
 * rejections propagate to the caller.
 */
export async function callFunction<T = unknown>(
  name: string,
  body: unknown,
  opts?: { signal?: AbortSignal },
): Promise<EdgeResult<T>> {
  const res = await fetch(edgeUrl(name), {
    method: 'POST',
    headers: edgeHeaders(),
    body: JSON.stringify(body),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

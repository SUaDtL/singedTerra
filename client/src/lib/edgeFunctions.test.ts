/**
 * edgeFunctions.test.ts — direct characterization of the shared Edge-Function
 * transport (callFunction / edgeUrl / edgeHeaders). Mirrors the fetch-mock +
 * import.meta.env-stub style of NetworkClient.requestRematch.test.ts: no real
 * network, no real Supabase, no dev server.
 *
 * This is the transport-level companion to the requestRematch parity anchor —
 * requestRematch proves the restart_game caller's response handling is
 * unchanged; these tests prove the request every migrated caller now emits
 * (URL, headers, method, body, ok/status/data mapping) is exactly the old one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callFunction, edgeUrl, edgeHeaders } from './edgeFunctions';

describe('edgeFunctions (Edge-Function transport)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('edgeUrl builds the functions/v1 URL from VITE_SUPABASE_URL', () => {
    expect(edgeUrl('create_room')).toBe('https://example.supabase.co/functions/v1/create_room');
  });

  it('edgeHeaders returns the three headers with exact keys and values', () => {
    expect(edgeHeaders()).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer anon-key-test',
      'apikey': 'anon-key-test',
    });
  });

  it('callFunction POSTs to the correct URL with the header block and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ roomId: 'r1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const payload = { code: 'ABCD', playerName: 'Alice' };
    await callFunction('join_room', payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://example.supabase.co/functions/v1/join_room');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Authorization']).toBe('Bearer anon-key-test');
    expect(init.headers['apikey']).toBe('anon-key-test');
    expect(init.body).toBe(JSON.stringify(payload));
    // No AbortSignal was requested, so none is forwarded.
    expect('signal' in init).toBe(false);
  });

  it('returns ok:true / status / parsed data on a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, foo: 'bar' }),
      }),
    );

    const result = await callFunction<{ ok: boolean; foo: string }>('restart_game', {});
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true, foo: 'bar' } });
    // Generic typing compiles: data is narrowed to the requested shape.
    expect(result.data?.foo).toBe('bar');
  });

  it('ok mirrors res.ok:false on a 400 (still returns the parsed body)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad request' }),
      }),
    );

    const result = await callFunction<{ error: string }>('create_room', {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.data).toEqual({ error: 'bad request' });
  });

  it('ok mirrors res.ok:false on a 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    const result = await callFunction('finish_game', {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it('yields data:null when the body is not JSON / empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      }),
    );

    const result = await callFunction('ready_up', {});
    expect(result).toEqual({ ok: true, status: 200, data: null });
  });

  it('does NOT catch fetch rejections — they propagate to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(callFunction('heartbeat', {})).rejects.toThrow('boom');
  });

  it('forwards opts.signal to fetch when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await callFunction('list_rooms', {}, { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});

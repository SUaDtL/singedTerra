import { describe, expect, it, vi } from 'vitest'
import { claimCompletedMatch, type ClaimMatchPost, type SessionReader } from './matchClaim'

const payload = { roomId: 'room-1', playerId: 'player-1', token: 'seat-1' }

function sessionReader(
  result: Awaited<ReturnType<SessionReader['getSession']>>,
): SessionReader {
  return { getSession: vi.fn(async () => result) }
}

function post(result: Awaited<ReturnType<ClaimMatchPost>> = { ok: true, status: 200 }): ClaimMatchPost {
  return vi.fn(async () => result)
}

describe('claimCompletedMatch', () => {
  it('skips claim_match when no authenticated session is available', async () => {
    const auth = sessionReader({ data: { session: null }, error: null })
    const send = post()

    await expect(claimCompletedMatch(auth, payload, send)).resolves.toBe('anonymous')

    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'returns a session error', getSession: async () => ({ data: { session: null }, error: { message: 'backend access-token' } }) },
    { label: 'rejects while reading the session', getSession: async () => { throw new Error('backend access-token') } },
  ])('throws a bounded error when getSession $label', async ({ getSession }) => {
    const auth: SessionReader = { getSession }

    await expect(claimCompletedMatch(auth, payload, post())).rejects.toThrow('Account session unavailable.')
    await expect(claimCompletedMatch(auth, payload, post())).rejects.not.toThrow('backend access-token')
  })

  it('keeps the signed-in bearer in transport options and sends only the match proof body', async () => {
    const auth = sessionReader({
      data: { session: { access_token: 'account-bearer-secret' } },
      error: null,
    })
    const send = post()

    await claimCompletedMatch(auth, payload, send)

    expect(send).toHaveBeenCalledWith(
      'claim_match',
      { roomId: 'room-1', playerId: 'player-1', token: 'seat-1' },
      { bearerToken: 'account-bearer-secret' },
    )
    const [, body] = (send as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown]
    expect(JSON.stringify(body)).not.toContain('account-bearer-secret')
  })

  it('returns linked after an HTTP-successful claim', async () => {
    const auth = sessionReader({
      data: { session: { access_token: 'account-bearer-secret' } },
      error: null,
    })

    await expect(claimCompletedMatch(auth, payload, post({ ok: true, status: 201 }))).resolves.toBe('linked')
  })

  it('reports only the status when claim_match returns a non-success HTTP response', async () => {
    const auth = sessionReader({
      data: { session: { access_token: 'account-bearer-secret' } },
      error: null,
    })

    await expect(claimCompletedMatch(
      auth,
      payload,
      post({ ok: false, status: 403 }),
    )).rejects.toThrow('claim_match HTTP 403')
    await expect(claimCompletedMatch(
      auth,
      payload,
      post({ ok: false, status: 403 }),
    )).rejects.not.toThrow('account-bearer-secret')
  })
})

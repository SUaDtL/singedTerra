import { VerifiedChallengeTransportError, type VerifiedChallengeInvoker } from './verifiedChallenge'

interface ChallengeBackend {
  auth: { getSession(): Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }> }
  functions: { invoke(name: string, options: { body: Readonly<Record<string, unknown>>; headers: Record<string, string>; signal: AbortSignal }):
    Promise<{ data: unknown; error: unknown; response?: Response }> }
}

/** Preserve SDK HTTP failures as versioned protocol replies. Authentication is
 * pinned to the captured account; timeout never schedules a later allocation. */
export function createVerifiedChallengeInvoker(client: ChallengeBackend, currentAccount: () => string | null): VerifiedChallengeInvoker {
  return async (operation, body) => {
    const accountId = currentAccount()
    if (!accountId) throw new VerifiedChallengeTransportError('unauthorized', 401)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new VerifiedChallengeTransportError('request_timeout', 503))
      }, 5000)
    })
    const request = async () => {
      const auth = await client.auth.getSession()
      if (controller.signal.aborted) throw new VerifiedChallengeTransportError('request_timeout', 503)
      if (auth.error || !auth.data.session || auth.data.session.user.id !== accountId || currentAccount() !== accountId)
        throw new VerifiedChallengeTransportError('unauthorized', 401)
      const result = await client.functions.invoke(operation, { body,
        headers: { Authorization: `Bearer ${auth.data.session.access_token}` }, signal: controller.signal })
      if (currentAccount() !== accountId) throw new VerifiedChallengeTransportError('unauthorized', 401)
      if (!result.error) return { status: result.response?.status ?? 200, data: result.data, headers: result.response?.headers }
      if (!result.response) throw new VerifiedChallengeTransportError('verification_unavailable', 503)
      const text = await result.response.text()
      if (text.length > 4096) throw new VerifiedChallengeTransportError('verification_unavailable', 503)
      const data: unknown = JSON.parse(text)
      if (currentAccount() !== accountId) throw new VerifiedChallengeTransportError('unauthorized', 401)
      return { status: result.response.status, data, headers: result.response.headers }
    }
    try { return await Promise.race([request(), timeout]) }
    finally { clearTimeout(timer) }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1, type VerifiedChallengeDescriptor } from '@shared/net/verifiedChallenge'
import { VerifiedChallengeClient } from './VerifiedChallengeClient'

const descriptor = Object.freeze({
  ...VERIFIED_CHALLENGE_CQ1,
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  admittedAt: '2026-09-13T12:00:00.000000Z',
  expiresAt: '2026-09-13T12:30:00.000000Z',
}) as VerifiedChallengeDescriptor

function makeRafQueue() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  const cancel = vi.fn((id: number): void => { callbacks.delete(id) })
  return {
    request,
    cancel,
    pendingIds: (): number[] => [...callbacks.keys()],
    callback: (id: number): FrameRequestCallback => {
      const callback = callbacks.get(id)
      if (!callback) throw new Error(`No queued animation frame ${id}`)
      return callback
    },
    runNext(timestamp: number): void {
      const [id] = [...callbacks.keys()]
      if (id === undefined) throw new Error('No queued animation frame')
      const callback = callbacks.get(id)!
      callbacks.delete(id)
      callback(timestamp)
    },
  }
}

describe('VerifiedChallengeClient', () => {
  let raf: ReturnType<typeof makeRafQueue>

  beforeEach(() => {
    raf = makeRafQueue()
    vi.stubGlobal('requestAnimationFrame', raf.request)
    vi.stubGlobal('cancelAnimationFrame', raf.cancel)
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('restores an exact retained transcript without recording it again and reports terminal after the final render', () => {
    const recordAcceptedFire = vi.fn(() => true)
    const order: string[] = []
    const onTerminal = vi.fn(() => { order.push('terminal') })
    const client = new VerifiedChallengeClient({
      descriptor,
      transcript: [{ angle: 32, power: 100 }],
      recordAcceptedFire,
      onTerminal,
    })
    client.onStateChange(() => { order.push('render') })

    expect(client.terminalResult).toMatchObject({
      terminal: 'objective_cleared', transcript: [{ angle: 32, power: 100 }], liveTicks: 118,
    })
    expect(recordAcceptedFire).not.toHaveBeenCalled()
    expect(onTerminal).not.toHaveBeenCalled()

    client.start()
    expect(order).toEqual(['render', 'terminal'])
    expect(onTerminal).toHaveBeenCalledOnce()
    expect(client.getState()?.phase).toBe('PLAYER_TURN')
    expect(raf.pendingIds()).toEqual([])

    client.start()
    expect(onTerminal).toHaveBeenCalledOnce()
  })

  it('caches one detached retained snapshot until the next state emission', () => {
    const client = new VerifiedChallengeClient({ descriptor, recordAcceptedFire: () => true, onTerminal: vi.fn() })
    const first = client.getState()!
    expect(client.getState()).toBe(first)
    const originalPixel = first.terrain[0]
    first.terrain[0] = originalPixel === 0 ? 1 : 0
    expect(client.getState()!.terrain[0]).not.toBe(originalPixel)

    client.sendAction({ type: 'set_angle', angle: 46 })
    const next = client.getState()!
    expect(next).not.toBe(first)
    expect(next.terrain[0]).toBe(originalPixel)
    expect(client.getState()).toBe(next)
  })

  it('exposes a newly reached terminal result to the final state listener before reporting completion', () => {
    const observed: Array<VerifiedChallengeClient['terminalResult']> = []
    const order: string[] = []
    const client = new VerifiedChallengeClient({ descriptor, recordAcceptedFire: () => true,
      onTerminal: () => { order.push('terminal') } })
    client.onStateChange(() => {
      observed.push(client.terminalResult)
      order.push('render')
    })
    client.start()
    expect(observed).toEqual([null])
    client.sendAction({ type: 'set_angle', angle: 32 })
    client.sendAction({ type: 'set_power', power: 100 })
    client.sendAction({ type: 'fire' })
    for (let frame = 1; !client.terminalResult && frame <= 200; frame++) raf.runNext(frame * (1_000 / 60))

    expect(observed.at(-1)).toMatchObject({ terminal: 'objective_cleared', liveTicks: 118 })
    expect(observed.filter((result) => result !== null)).toHaveLength(1)
    expect(order.slice(-2)).toEqual(['render', 'terminal'])
    expect(order.filter((event) => event === 'terminal')).toHaveLength(1)
    expect(raf.pendingIds()).toEqual([])
  })

  it.each([30, 60, 120])('runs the retained objective identically at %i Hz', (displayHz) => {
    const recordAcceptedFire = vi.fn(() => true)
    const onTerminal = vi.fn()
    const client = new VerifiedChallengeClient({ descriptor, recordAcceptedFire, onTerminal })
    client.start()
    client.sendAction({ type: 'set_angle', angle: 32 })
    client.sendAction({ type: 'set_power', power: 100 })
    client.sendAction({ type: 'fire' })
    expect(recordAcceptedFire).toHaveBeenCalledWith({ angle: 32, power: 100 })

    let frame = 0
    while (!client.terminalResult && frame < displayHz * 10) {
      frame += 1
      raf.runNext(frame * (1_000 / displayHz))
    }

    expect(client.terminalResult).toMatchObject({
      terminal: 'objective_cleared', transcript: [{ angle: 32, power: 100 }], liveTicks: 118,
      cpuHealth: 71.69216246578995,
    })
    expect(onTerminal).toHaveBeenCalledOnce()
    expect(client.getState()?.phase).toBe('PLAYER_TURN')
    expect(raf.pendingIds()).toEqual([])
  })

  it('fast-forwards only retained fixed ticks and preserves the exact result', () => {
    const client = new VerifiedChallengeClient({ descriptor, recordAcceptedFire: () => true, onTerminal: vi.fn() })
    client.setFastForward(true)
    client.start()
    client.sendAction({ type: 'set_angle', angle: 32 })
    client.sendAction({ type: 'set_power', power: 100 })
    client.sendAction({ type: 'fire' })

    let frame = 0
    while (!client.terminalResult && frame < 30) {
      frame += 1
      raf.runNext(frame * (1_000 / 60))
    }

    expect(frame).toBeLessThan(30)
    expect(client.terminalResult).toMatchObject({
      terminal: 'objective_cleared', liveTicks: 118, cpuHealth: 71.69216246578995,
    })
  })

  it('rejects ordinary game actions and fails closed when accepted-fire persistence fails', () => {
    const onUnavailable = vi.fn()
    const client = new VerifiedChallengeClient({
      descriptor,
      recordAcceptedFire: vi.fn(() => false),
      onTerminal: vi.fn(),
      onUnavailable,
    })
    const initial = client.getState()
    client.sendAction({ type: 'move', delta: 1 })
    client.sendAction({ type: 'select_weapon', weapon: 'nuke' })
    expect(client.getState()).toBe(initial)

    client.start()
    client.sendAction({ type: 'set_angle', angle: 32 })
    client.sendAction({ type: 'set_power', power: 100 })
    expect(() => client.sendAction({ type: 'fire' })).toThrow('verified_challenge_fire_persistence_failed')
    expect(onUnavailable).toHaveBeenCalledWith('fire_persistence_failed')
    expect(raf.pendingIds()).toEqual([])
    expect(client.terminalResult).toBeNull()
  })

  it('invalidates stopped RAF callbacks so they cannot tick or reschedule a restarted match', () => {
    const listener = vi.fn()
    const client = new VerifiedChallengeClient({ descriptor, recordAcceptedFire: () => true, onTerminal: vi.fn() })
    client.onStateChange(listener)
    client.start()
    const staleId = raf.pendingIds()[0]!
    const stale = raf.callback(staleId)
    client.stop()
    expect(raf.pendingIds()).toEqual([])

    client.start()
    expect(listener).toHaveBeenCalledTimes(2)
    const currentIds = raf.pendingIds()
    stale(1_000 / 60)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(raf.pendingIds()).toEqual(currentIds)
  })

  it('fails malformed restore before any frame can start', () => {
    const onUnavailable = vi.fn()
    expect(() => new VerifiedChallengeClient({
      descriptor,
      transcript: [{ angle: 32.5, power: 100 }] as never,
      recordAcceptedFire: () => true,
      onTerminal: vi.fn(),
      onUnavailable,
    })).toThrow('verified_challenge_restore_failed')
    expect(onUnavailable).toHaveBeenCalledWith('invalid_restore')
    expect(raf.pendingIds()).toEqual([])
  })
})

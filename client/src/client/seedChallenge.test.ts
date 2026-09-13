import { describe, expect, it } from 'vitest'
import { QUICK_OPERATIONS } from './quickOperations'
import {
  buildSeedChallengeUrl,
  parseSeedChallengeFragment,
  readSeedChallengeUrl,
  resolvePublicSeedChallenge,
  serializeSeedChallenge,
} from './seedChallenge'

describe('ST1 public seed challenge contract', () => {
  it.each([
    ['LL', 'last-light-siege', 0, 'ST1-LL-0'],
    ['LL', 'last-light-siege', 42, 'ST1-LL-16'],
    ['LL', 'last-light-siege', 4294967295, 'ST1-LL-1Z141Z3'],
    ['CW', 'crosswind-range', 42, 'ST1-CW-16'],
    ['CR', 'caldera-run', 42, 'ST1-CR-16'],
    ['LA', 'lean-arsenal', 42, 'ST1-LA-16'],
  ] as const)('round trips %s without serializing private state', (tag, operationId, seed, code) => {
    const parsed = parseSeedChallengeFragment(`#challenge=${code}`)
    expect(parsed).toMatchObject({ status: 'valid', challenge: { version: 'ST1', tag, operationId, seed } })
    if (parsed.status !== 'valid') throw new Error('Expected valid challenge')
    expect(Object.keys(parsed.challenge).sort()).toEqual(['operationId', 'origin', 'seed', 'tag', 'version'])
    expect(parsed.challenge.origin).toBe('imported-public-challenge')
    expect(serializeSeedChallenge(parsed.challenge)).toBe(code)
  })

  it.each(['0', '16', '4E2', 'NAN', '1Z141Z3'])('accepts canonical uint32 token %s', (token) => {
    expect(parseSeedChallengeFragment(`#challenge=ST1-LL-${token}`).status).toBe('valid')
  })

  it.each([
    '', '00', '016', '+16', '-0', '0x2A', '4.2', '4-2', '1z', '1Z141Z4',
  ])('rejects non-canonical seed token %s', (token) => {
    expect(parseSeedChallengeFragment(`#challenge=ST1-LL-${token}`).status).toBe('invalid')
  })

  it.each([
    '#challenge=st1-ll-16',
    '#challenge=ST2-LL-16',
    '#challenge=ST1-XX-16',
    '#challenge=ST1-LL-%31%36',
    '#challenge=ST1-LL-16&join=ABCD',
    '#challenge=ST1-LL-16#extra',
    '#challenge=ST1-LL-１６',
    '#challenge=ST1-LL-16 ',
    `#challenge=ST1-LL-16${'X'.repeat(20)}`,
  ])('rejects malformed or ambiguous fragment %s', (fragment) => {
    expect(parseSeedChallengeFragment(fragment).status).toBe('invalid')
  })

  it.each(['CW', 'CR', 'LA'])('rejects non-curated P04 seed for %s', (tag) => {
    expect(parseSeedChallengeFragment(`#challenge=ST1-${tag}-42`).status).toBe('invalid')
    expect(parseSeedChallengeFragment(`#challenge=ST1-${tag}-16`).status).toBe('valid')
  })

  it('keeps query routes and unrelated fragments outside challenge admission', () => {
    expect(readSeedChallengeUrl('https://play.example/singedTerra/#challenge=ST1-LL-16').status).toBe('valid')
    expect(readSeedChallengeUrl('https://play.example/singedTerra/?join=ABCD#challenge=ST1-LL-16').status).toBe('invalid')
    expect(readSeedChallengeUrl('https://play.example/singedTerra/?e2e=hotseat#challenge=ST1-LL-16').status).toBe('invalid')
    expect(readSeedChallengeUrl('https://play.example/singedTerra/#section').status).toBe('absent')
    expect(readSeedChallengeUrl('javascript:alert(1)#challenge=ST1-LL-16').status).toBe('invalid')
  })

  it('builds a credential-free path-preserving canonical fragment URL', () => {
    const challenge = resolvePublicSeedChallenge('last-light-siege', 42, 'local-selection')
    expect(challenge).not.toBeNull()
    expect(buildSeedChallengeUrl(
      'https://user:secret@play.example/singedTerra/?join=ABCD#old', challenge!,
    )).toBe('https://play.example/singedTerra/#challenge=ST1-LL-16')
    expect(buildSeedChallengeUrl('data:text/plain,no', challenge!)).toBeNull()
  })

  it('fails closed when the current operation registry drifts', () => {
    const lastLight = QUICK_OPERATIONS.find((operation) => operation.id === 'last-light-siege')!
    expect(resolvePublicSeedChallenge(lastLight.id, 7, 'local-selection')).not.toBeNull()
    expect(resolvePublicSeedChallenge(lastLight.id, 7, 'local-selection', {
      ...lastLight,
      settings: { ...lastLight.settings, rounds: 5 },
    })).toBeNull()
    expect(resolvePublicSeedChallenge('standard', 7, 'local-selection')).toBeNull()
  })
})

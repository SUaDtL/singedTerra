import { describe, expect, it } from 'vitest'
import * as loadoutModule from './loadout'

type LoadoutApi = {
  readonly CAMPAIGN_LOADOUT_VERSION: number
  readonly createCampaignLoadout: (selection?: unknown) => any
  readonly parseCampaignLoadout: (value: unknown) => any | null
  readonly applyCampaignLoadoutDecision: (
    loadout: unknown,
    supplies: number,
    decision: unknown,
  ) => { readonly loadout: any; readonly supplies: number; readonly cost: number }
  readonly applyEmergencyHullPatch: (loadout: unknown) => any
}

const api = loadoutModule as unknown as Partial<LoadoutApi>

function requireApi<Key extends keyof LoadoutApi>(key: Key): LoadoutApi[Key] {
  expect(api[key], `${key} must be implemented`).toBeTypeOf(
    key === 'CAMPAIGN_LOADOUT_VERSION' ? 'number' : 'function',
  )
  return api[key] as LoadoutApi[Key]
}

describe('Ash Road carried loadout', () => {
  it('owns a versioned legal granted kit separately from optional inventory', () => {
    const create = requireApi('createCampaignLoadout')
    expect(requireApi('CAMPAIGN_LOADOUT_VERSION')).toBe(1)
    const loadout = create()

    expect(loadout).toMatchObject({
      kind: 'campaign-loadout',
      loadoutVersion: 1,
      hull: 100,
      carried: {
        basicWeaponId: 'baby_missile',
        offensiveWeaponIds: ['missile', 'napalm'],
        defensiveWeaponId: 'shield',
      },
      owned: {
        grantedWeaponIds: ['baby_missile', 'missile', 'napalm', 'shield'],
        purchasedWeaponIds: [],
        rewardWeaponIds: [],
      },
    })
    expect(loadout.carried.ammunition).toEqual([
      { weaponId: 'baby_missile', quantity: null },
      { weaponId: 'missile', quantity: 3 },
      { weaponId: 'napalm', quantity: 2 },
      { weaponId: 'shield', quantity: 1 },
    ])
    expect(Object.isFrozen(loadout)).toBe(true)
    expect(Object.isFrozen(loadout.carried.ammunition)).toBe(true)
    expect(Object.isFrozen(loadout.owned.grantedWeaponIds)).toBe(true)
  })

  it('creates a selected two-offense kit from the bound profile and rejects illegal slots', () => {
    const create = requireApi('createCampaignLoadout')
    const loadout = create({ offensiveWeaponIds: ['missile', 'cluster_bomb'] })
    expect(loadout.carried).toMatchObject({
      offensiveWeaponIds: ['missile', 'cluster_bomb'],
      defensiveWeaponId: 'shield',
    })
    expect(loadout.carried.ammunition).toEqual([
      { weaponId: 'baby_missile', quantity: null },
      { weaponId: 'missile', quantity: 3 },
      { weaponId: 'cluster_bomb', quantity: 2 },
      { weaponId: 'shield', quantity: 1 },
    ])
    expect(loadout.owned.grantedWeaponIds).toEqual([
      'baby_missile', 'missile', 'cluster_bomb', 'shield',
    ])
    expect(() => create({ offensiveWeaponIds: ['missile', 'missile'] })).toThrow(/selection/i)
    expect(() => create({ offensiveWeaponIds: ['missile', 'shield'] })).toThrow(/selection/i)
  })

  it('fails closed on version/key/profile/slot/inventory drift and returns a detached value', () => {
    const create = requireApi('createCampaignLoadout')
    const parse = requireApi('parseCampaignLoadout')
    const loadout = create()
    const source = structuredClone(loadout)
    const parsed = parse(source)
    expect(parsed).toEqual(loadout)
    expect(parsed).not.toBe(source)
    expect(parsed.carried).not.toBe(source.carried)

    const optionalInventory = structuredClone(loadout)
    optionalInventory.owned.purchasedWeaponIds = ['cluster_bomb']
    optionalInventory.owned.rewardWeaponIds = ['sandhog']
    const optionalParsed = parse(optionalInventory)
    expect(optionalParsed?.owned).toMatchObject({
      grantedWeaponIds: ['baby_missile', 'missile', 'napalm', 'shield'],
      purchasedWeaponIds: ['cluster_bomb'],
      rewardWeaponIds: ['sandhog'],
    })
    expect(optionalParsed?.carried.offensiveWeaponIds).toEqual(['missile', 'napalm'])

    const mutations = [
      (value: any) => { value.extra = true },
      (value: any) => { value.loadoutVersion = 2 },
      (value: any) => { value.profile.contentDigest = '0'.repeat(64) },
      (value: any) => { value.carried.basicWeaponId = 'missile' },
      (value: any) => { value.carried.offensiveWeaponIds.push('sandhog') },
      (value: any) => { value.owned.rewardWeaponIds = ['unknown'] },
      (value: any) => { value.owned.purchasedWeaponIds = ['baby_missile'] },
      (value: any) => { value.carried.ammunition[1].quantity = Number.MAX_SAFE_INTEGER + 1 },
    ]
    for (const mutate of mutations) {
      const candidate = structuredClone(loadout)
      mutate(candidate)
      expect(parse(candidate)).toBeNull()
    }
  })

  it('repairs, refills one finite special, retains, and patches without losing basic play', () => {
    const create = requireApi('createCampaignLoadout')
    const decide = requireApi('applyCampaignLoadoutDecision')
    const patchHull = requireApi('applyEmergencyHullPatch')
    const loadout = structuredClone(create())
    loadout.hull = 41
    loadout.carried.ammunition[1].quantity = 0
    loadout.carried.ammunition[2].quantity = 0
    loadout.carried.ammunition[3].quantity = 0

    const retained = decide(loadout, 0, { kind: 'retain' })
    expect(retained).toMatchObject({ supplies: 0, cost: 0, loadout: { hull: 41 } })
    expect(retained.loadout.carried.ammunition[0]).toEqual({
      weaponId: 'baby_missile', quantity: null,
    })
    expect(() => decide(loadout, 0, { kind: 'repair' })).toThrow(/suppl/i)
    expect(() => decide(loadout, 0, { kind: 'refill', weaponId: 'missile' })).toThrow(/suppl/i)

    const patched = patchHull(loadout)
    expect(patched.hull).toBe(60)
    expect(patchHull(patched)).toBe(patched)

    const repaired = decide(loadout, 2, { kind: 'repair' })
    expect(repaired).toMatchObject({ supplies: 0, cost: 2, loadout: { hull: 100 } })
    const refilled = decide(loadout, 1, { kind: 'refill', weaponId: 'missile' })
    expect(refilled).toMatchObject({ supplies: 0, cost: 1 })
    expect(refilled.loadout.carried.ammunition).toContainEqual({
      weaponId: 'missile', quantity: 3,
    })
    expect(refilled.loadout.carried.ammunition).toContainEqual({
      weaponId: 'napalm', quantity: 0,
    })
    expect(() => decide(loadout, 1, { kind: 'refill', weaponId: 'baby_missile' }))
      .toThrow(/basic|unlimited/i)
    expect(() => decide(loadout, Number.MAX_SAFE_INTEGER + 1, { kind: 'retain' })).toThrow()
    expect(() => decide(loadout, 2, { kind: 'repair', extra: true })).toThrow()
  })
})

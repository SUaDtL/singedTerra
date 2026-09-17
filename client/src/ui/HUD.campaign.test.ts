// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import { GameEngine } from '@shared/engine/GameEngine'
import type { CampaignResult } from '@shared/campaign/outcomes'
import type { CampaignObjectState } from '@shared/campaign/objects'
import { CampaignClient } from '../campaign/CampaignClient'
import { ASH_ROAD_EPISODE } from '../campaign/content/episode'
import type {
  BattleConsoleLifecycleController,
  BattleConsoleLifecycleEnterRequest,
} from './battleConsole/lifecycle'
import type { BattleConsolePresentationState } from './battleConsole/types'
import { HUD } from './HUD'

interface CampaignPresentationContract {
  readonly commitmentCount: number
  readonly supplies: number
  readonly retryable: boolean
  readonly objects: readonly Pick<
    CampaignObjectState,
    'id' | 'kind' | 'health' | 'maxHealth' | 'alive'
  >[]
  readonly result: CampaignResult | null
}

type CampaignBattleConsoleState = BattleConsolePresentationState & {
  readonly campaign: CampaignPresentationContract | null
}

function mount() {
  const requests: BattleConsoleLifecycleEnterRequest[] = []
  const updates: BattleConsolePresentationState[] = []
  const enter = vi.fn(async (request: BattleConsoleLifecycleEnterRequest) => {
    requests.push(request)
    return { generation: requests.length, committed: true, status: 'ready', resources: {} } as never
  })
  const lifecycle = {
    enter,
    restart: enter,
    update: vi.fn((next: BattleConsolePresentationState) => updates.push(next)),
    destroy: vi.fn(async () => ({} as never)),
    snapshot: () => ({ activeGeneration: requests.length || null, status: 'ready', resources: {} }) as never,
  } satisfies BattleConsoleLifecycleController
  const root = document.createElement('div')
  const overlay = document.createElement('div')
  const modal = document.createElement('div')
  const rail = document.createElement('div')
  document.body.append(root, overlay, modal, rail)
  const hud = new HUD(root, overlay, modal, rail, { battleConsoleLifecycle: lifecycle })
  return { hud, lifecycle, requests, updates }
}

function latestPresentation(
  requests: readonly BattleConsoleLifecycleEnterRequest[],
  updates: readonly BattleConsolePresentationState[],
): CampaignBattleConsoleState {
  return (updates.at(-1) ?? requests.at(-1)?.initialState) as CampaignBattleConsoleState
}

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelector('#st-hud-style')?.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HUD campaign presentation boundary', () => {
  it('copies the exact authoritative campaign projection into the callback-free console state', async () => {
    const { hud, requests, updates } = mount()
    const client = new CampaignClient({
      encounter: ASH_ROAD_EPISODE.encounters[0]!,
      combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
    })
    try {
      const engineState = client.getState()
      hud.setInputCapabilities(client.inputCapabilities)
      hud.setCampaignRunPresentation({ supplies: 2, retryable: false })
      hud.update(engineState, false, true, true, true)
      await Promise.resolve()

      const projected = latestPresentation(requests, updates).campaign
      expect(projected).toBeDefined()
      expect(projected).toEqual({
        encounterId: engineState.campaign!.encounterId,
        objective: engineState.campaign!.objective,
        commitmentCount: engineState.campaign!.commitmentCount,
        supplies: 2,
        retryable: false,
        objects: engineState.campaign!.objects!.map((object) => ({
          id: object.id,
          kind: object.kind,
          health: object.health,
          maxHealth: object.maxHealth,
          alive: object.alive,
        })),
        result: engineState.campaign!.result,
      })
      expect(projected?.objects.map(({ id }) => id)).toEqual([
        'refinery',
        'drum-a',
        'drum-b',
      ])
      expect(Object.values(projected ?? {}).every((value) => typeof value !== 'function')).toBe(true)
      const mission = document.querySelector<HTMLElement>('[data-campaign-mission]')!
      expect(mission.hidden).toBe(false)
      expect(mission.textContent).toContain('Fuel Stop')
      expect(mission.textContent).toContain('Destroy all defenders')
      expect(mission.textContent).toContain('Keep Refinery standing')
      expect(mission.textContent).not.toContain('2 supplies')
      expect(document.querySelector('[data-ui="match-title"]')?.textContent).toBe('Mission')
      expect(document.querySelector('[data-ui="match-drawer-toggle"]')?.textContent).toBe('Mission')
    } finally {
      client.stop()
      await hud.destroy()
    }
  })

  it('destroys the campaign generation and re-enters ordinary play with an explicit null projection', async () => {
    const { hud, lifecycle, requests, updates } = mount()
    const campaignClient = new CampaignClient({
      encounter: ASH_ROAD_EPISODE.encounters[0]!,
      combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
    })
    const ordinaryState = new GameEngine({
      players: [
        { name: 'Alice', color: '#e84d4d' },
        { name: 'Bob', color: '#4d8ce8' },
      ],
      maxPlayers: 2,
      seed: 18,
    }).getState()
    try {
      hud.setInputCapabilities(campaignClient.inputCapabilities)
      hud.update(campaignClient.getState(), false, true, true, true)
      await Promise.resolve()
      expect(latestPresentation(requests, updates).campaign).toBeDefined()

      await hud.leaveBattleConsole()
      hud.update(ordinaryState, false, true, true, true)
      await Promise.resolve()

      expect(lifecycle.destroy).toHaveBeenCalledTimes(1)
      expect(requests).toHaveLength(2)
      expect(latestPresentation(requests, updates).campaign).toBeNull()
      expect(document.querySelector('[data-campaign-fact-id]')).toBeNull()
      expect(document.querySelector<HTMLElement>('[data-campaign-mission]')?.hidden).toBe(true)
      expect(document.querySelector('[data-ui="match-title"]')?.textContent).toBe('Match')
    } finally {
      campaignClient.stop()
      await hud.destroy()
    }
  })
})

// @vitest-environment jsdom

import { fireEvent, getByRole, queryAllByRole } from '@testing-library/dom'
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampaignProjection, CampaignResult } from '@shared/campaign/outcomes'
import type { CampaignObjectState } from '@shared/campaign/objects'
import { BattleConsoleRoot } from './BattleConsoleRoot'
import type { BattleConsolePresentationState } from './types'

interface CampaignPresentationContract {
  readonly encounterId?: string
  readonly objective?: CampaignProjection['objective']
  readonly warning?: CampaignProjection['warning']
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

const baseState: BattleConsolePresentationState = {
  commander: {
    id: 'p1',
    name: 'Ranger',
    portrait: {
      color: '#e84d4d',
      loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
    },
    health: 83,
  },
  mobility: { fuel: 72, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'missile', name: 'Missile', ammo: 4, canCycle: true },
  armory: { available: false, credits: 0, open: false, submitting: false, items: [] },
  ballistics: { angle: 47, power: 56, wind: -1.2 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: false, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
}

const campaign: CampaignPresentationContract = {
  encounterId: 'high-road',
  objective: {
    kind: 'survive-or-eliminate',
    protectedObjectIds: ['refinery'],
    humanCommitments: 5,
  },
  warning: {
    id: 'high-road-strike', kind: 'announced-strike', sourceObjectId: 'gun-emplacement',
    sourceSpawnId: 'gun-emplacement', announcedAtHumanCommitment: 4,
    dueHumanCommitment: 5, targetX: 640, visibleReach: 55, maxDamage: 35,
    damageReach: 55, craterRadius: 24, status: 'pending', fired: false,
  },
  commitmentCount: 4,
  supplies: 2,
  retryable: false,
  objects: [
    { id: 'refinery', kind: 'protected', health: 61, maxHealth: 100, alive: true },
    { id: 'drum-a', kind: 'supply-drum', health: 0, maxHealth: 20, alive: false },
  ],
  result: null,
}

function state(overrides: Partial<CampaignPresentationContract> = {}): CampaignBattleConsoleState {
  return {
    ...baseState,
    campaign: { ...campaign, ...overrides },
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('campaign battle-console semantic projection', () => {
  it('keeps campaign telemetry out of the command deck without duplicating world geometry', () => {
    const host = document.createElement('div')
    render(
      <BattleConsoleRoot
        state={state()}
        lifecycleStatus="ready"
        dispatch={vi.fn()}
      />,
      host,
    )

    expect(queryAllByRole(host, 'region', { name: 'Campaign objective' })).toHaveLength(0)
    expect(host.querySelector('[data-campaign-objective]')).toBeNull()
    expect(host.textContent).not.toContain('horizontal position')
    expect(host.textContent).not.toContain('supplies')
    expect(host.querySelector('[data-campaign-hit-region]')).toBeNull()
    expect(host.querySelector('canvas[data-campaign-object]')).toBeNull()
  })

  it('keeps campaign telemetry absent as state changes and ordinary play resumes', () => {
    const host = document.createElement('div')
    const dispatch = vi.fn()
    render(<BattleConsoleRoot state={state()} lifecycleStatus="ready" dispatch={dispatch} />, host)
    render(
      <BattleConsoleRoot
        state={state({
          commitmentCount: 5,
          objects: [
            { id: 'refinery', kind: 'protected', health: 24, maxHealth: 100, alive: true },
            { id: 'drum-a', kind: 'supply-drum', health: 0, maxHealth: 20, alive: false },
          ],
        })}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    )

    expect(host.querySelector('[data-campaign-objective]')).toBeNull()

    render(
      <BattleConsoleRoot
        state={{ ...baseState, campaign: null } as CampaignBattleConsoleState}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    )
    expect(queryAllByRole(host, 'region', { name: 'Campaign objective' })).toHaveLength(0)
    expect(host.querySelector('[data-campaign-objective]')).toBeNull()
  })

  it('keeps the campaign view callback-free and emits only typed battle intents', () => {
    const host = document.createElement('div')
    const dispatch = vi.fn()
    render(<BattleConsoleRoot state={state()} lifecycleStatus="ready" dispatch={dispatch} />, host)

    fireEvent.click(getByRole(host, 'button', { name: 'Fire Missile' }))
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'fire' })
    expect(campaign.objects.every((fact) =>
      Object.values(fact).every((value) => typeof value !== 'function'))).toBe(true)
  })

  it('does not duplicate the mission-owned retry action in the command deck', () => {
    const host = document.createElement('div')
    const dispatch = vi.fn()
    render(
      <BattleConsoleRoot
        state={state({
          retryable: true,
          result: { outcome: 'failure', reason: 'protected-object', commitmentId: 1 },
        })}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    )

    expect(queryAllByRole(host, 'button', { name: 'Retry High Road' })).toHaveLength(0)

    render(
      <BattleConsoleRoot
        state={state({
          retryable: false,
          result: { outcome: 'success', reason: 'objective', commitmentId: 3 },
        })}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    )
    expect(queryAllByRole(host, 'button', { name: 'Retry High Road' })).toHaveLength(0)
  })
})

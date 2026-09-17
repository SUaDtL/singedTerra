// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampaignBattleConsolePresentation } from './battleConsole/types'
import { CampaignMissionView, projectCampaignMission } from './CampaignMissionView'

const highRoad: CampaignBattleConsolePresentation = {
  encounterId: 'high-road',
  objective: {
    kind: 'survive-or-eliminate', protectedObjectIds: ['pump'], humanCommitments: 3,
  },
  warning: {
    status: 'pending', sourceObjectId: 'ridge-relay', dueHumanCommitment: 1, targetX: 310,
  },
  commitmentCount: 0,
  supplies: 5,
  retryable: false,
  objects: [
    { id: 'pump', kind: 'protected', health: 100, maxHealth: 100, alive: true },
    { id: 'ridge-relay', kind: 'relay', health: 35, maxHealth: 35, alive: true },
  ],
  result: null,
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('campaign mission presentation', () => {
  it('reduces engine facts to one playable hierarchy without raw coordinates or supplies', () => {
    expect(projectCampaignMission(highRoad)).toEqual({
      chapter: 'Ash Road',
      encounter: 'High Road',
      objective: 'Hold the pump',
      progress: 'Survive 0 / 3 turns · or destroy the defender',
      warning: { tone: 'pending', text: 'Strike in 1 turn' },
      objects: [
        { id: 'pump', label: 'Pump', role: 'Protected', health: 100, maxHealth: 100, alive: true },
        { id: 'ridge-relay', label: 'Relay', role: 'Threat', health: 35, maxHealth: 35, alive: true },
      ],
      outcome: null,
      retryLabel: null,
    })
  })

  it('renders a concise mission instrument and reserves live announcement for warning edges', () => {
    const host = document.createElement('div')
    const retry = vi.fn()
    const view = new CampaignMissionView({ host, onRetry: retry })
    view.update(highRoad)

    const mission = host.querySelector<HTMLElement>('[data-campaign-mission]')!
    expect(mission.hidden).toBe(false)
    expect(mission.textContent).toContain('Hold the pump')
    expect(mission.textContent).toContain('Survive 0 / 3 turns')
    expect(mission.textContent).toContain('Strike in 1 turn')
    expect(mission.textContent).not.toContain('310')
    expect(mission.textContent).not.toContain('supplies')
    expect(host.querySelector('[data-campaign-warning]')?.getAttribute('role')).toBe('status')
    expect(host.querySelector('[data-campaign-object="pump"]')?.textContent)
      .toContain('PumpProtected100')
  })

  it('offers retry from the mission instrument only for a retryable failure', () => {
    const host = document.createElement('div')
    const retry = vi.fn()
    const view = new CampaignMissionView({ host, onRetry: retry })
    view.update({
      ...highRoad,
      result: { outcome: 'failure', reason: 'protected-object', commitmentId: 1 },
      retryable: true,
    })

    const button = host.querySelector<HTMLButtonElement>('[data-campaign-retry]')!
    expect(button.textContent).toBe('Retry High Road')
    button.click()
    expect(retry).toHaveBeenCalledOnce()

    view.update(null)
    expect(host.querySelector<HTMLElement>('[data-campaign-mission]')?.hidden).toBe(true)
  })
})

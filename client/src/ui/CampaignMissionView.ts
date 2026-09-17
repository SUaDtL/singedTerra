import type { CampaignBattleConsolePresentation } from './battleConsole/types'

export interface CampaignMissionObject {
  readonly id: string
  readonly label: string
  readonly role: 'Protected' | 'Threat'
  readonly health: number
  readonly maxHealth: number
  readonly alive: boolean
}

export interface CampaignMissionProjection {
  readonly chapter: 'Ash Road'
  readonly encounter: string
  readonly objective: string
  readonly progress: string | null
  readonly warning: Readonly<{ tone: 'pending' | 'due'; text: string }> | null
  readonly objects: readonly CampaignMissionObject[]
  readonly outcome: 'Success' | 'Failure' | null
  readonly retryLabel: string | null
}

const ENCOUNTER_NAMES = Object.freeze({
  'fuel-stop': 'Fuel Stop',
  'high-road': 'High Road',
  'salvage-pit': 'Salvage Pit',
  'relay-ridge': 'Relay Ridge',
} as const)

const OBJECT_NAMES = Object.freeze({
  refinery: 'Refinery',
  pump: 'Pump',
  'ridge-relay': 'Relay',
  'siege-relay': 'Relay',
  'drill-cache': 'Cache',
} as const)

function titleCase(value: string): string {
  return value.split(/[-_]+/u).filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ')
}

function encounterName(id: string | undefined): string {
  if (!id) return 'Field Operation'
  return ENCOUNTER_NAMES[id as keyof typeof ENCOUNTER_NAMES] ?? titleCase(id)
}

function objectName(id: string): string {
  return OBJECT_NAMES[id as keyof typeof OBJECT_NAMES] ?? titleCase(id)
}

export function projectCampaignMission(
  campaign: CampaignBattleConsolePresentation,
): CampaignMissionProjection {
  const objective = campaign.objective
  const protectedIds = objective?.protectedObjectIds ?? []
  const protectedNames = protectedIds.map(objectName)
  const objectiveText = objective?.kind === 'survive-or-eliminate'
    ? protectedNames.length === 1 ? `Hold the ${protectedNames[0]!.toLowerCase()}` : 'Hold the position'
    : 'Destroy all defenders'
  const progress = objective?.kind === 'survive-or-eliminate'
    ? `Survive ${Math.min(campaign.commitmentCount, objective.humanCommitments ?? 0)} / ${objective.humanCommitments ?? 0} turns · or destroy the defender`
    : protectedNames.length > 0
      ? `Keep ${protectedNames.join(' and ')} standing`
      : null
  const warning = campaign.warning?.status === 'pending'
    ? {
      tone: 'pending' as const,
      text: `Strike in ${Math.max(1, campaign.warning.dueHumanCommitment - campaign.commitmentCount)} turn${campaign.warning.dueHumanCommitment - campaign.commitmentCount === 1 ? '' : 's'}`,
    }
    : campaign.warning?.status === 'due'
      ? { tone: 'due' as const, text: 'Strike incoming' }
      : null
  const relevantIds = new Set([
    ...protectedIds,
    ...(campaign.warning?.sourceObjectId ? [campaign.warning.sourceObjectId] : []),
  ])
  const objects = campaign.objects
    .filter(({ id }) => relevantIds.has(id))
    .map((object): CampaignMissionObject => ({
      id: object.id,
      label: objectName(object.id),
      role: protectedIds.includes(object.id) ? 'Protected' : 'Threat',
      health: object.health,
      maxHealth: object.maxHealth,
      alive: object.alive,
    }))
  const outcome = campaign.result?.outcome === 'success'
    ? 'Success' as const
    : campaign.result ? 'Failure' as const : null
  const encounter = encounterName(campaign.encounterId)
  return Object.freeze({
    chapter: 'Ash Road',
    encounter,
    objective: objectiveText,
    progress,
    warning,
    objects: Object.freeze(objects),
    outcome,
    retryLabel: campaign.retryable && campaign.result?.outcome !== 'success'
      ? `Retry ${encounter}`
      : null,
  })
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

export class CampaignMissionView {
  readonly root: HTMLElement
  private readonly chapter = element('div', 'st-hud__mission-chapter')
  private readonly encounter = element('div', 'st-hud__mission-encounter')
  private readonly objective = element('div', 'st-hud__mission-objective')
  private readonly progress = element('div', 'st-hud__mission-progress')
  private readonly warning = element('div', 'st-hud__mission-warning')
  private readonly objects = element('ul', 'st-hud__mission-objects')
  private readonly outcome = element('div', 'st-hud__mission-outcome')
  private readonly retry = element('button', 'st-hud__mission-retry')
  private lastProjectionKey: string | null = null

  constructor(options: Readonly<{ host: HTMLElement; onRetry: () => void }>) {
    this.root = element('section', 'st-hud__mission')
    this.root.dataset['campaignMission'] = ''
    this.root.setAttribute('aria-label', 'Campaign mission')
    this.warning.dataset['campaignWarning'] = ''
    this.warning.setAttribute('role', 'status')
    this.warning.setAttribute('aria-live', 'polite')
    this.objects.setAttribute('aria-label', 'Mission objects')
    this.outcome.setAttribute('role', 'status')
    this.retry.type = 'button'
    this.retry.dataset['campaignRetry'] = ''
    this.retry.addEventListener('click', options.onRetry)
    this.root.append(
      this.chapter, this.encounter, this.objective, this.progress,
      this.warning, this.objects, this.outcome, this.retry,
    )
    this.root.hidden = true
    options.host.append(this.root)
  }

  update(campaign: CampaignBattleConsolePresentation | null): void {
    this.root.hidden = campaign === null
    if (!campaign) {
      this.lastProjectionKey = null
      return
    }
    const projection = projectCampaignMission(campaign)
    const projectionKey = JSON.stringify(projection)
    if (projectionKey === this.lastProjectionKey) return
    this.lastProjectionKey = projectionKey
    this.root.dataset['campaignResult'] = projection.outcome?.toLowerCase() ?? 'active'
    this.chapter.textContent = projection.chapter
    this.encounter.textContent = projection.encounter
    this.objective.textContent = projection.objective
    this.progress.hidden = projection.progress === null
    this.progress.textContent = projection.progress ?? ''
    this.warning.hidden = projection.warning === null
    this.warning.textContent = projection.warning?.text ?? ''
    this.warning.dataset['tone'] = projection.warning?.tone ?? ''
    this.objects.replaceChildren(...projection.objects.map((object) => {
      const row = element('li', 'st-hud__mission-object')
      row.dataset['campaignObject'] = object.id
      row.dataset['role'] = object.role.toLowerCase()
      row.dataset['alive'] = String(object.alive)
      const label = element('span', 'st-hud__mission-object-name')
      label.textContent = object.label
      const role = element('span', 'st-hud__mission-object-role')
      role.textContent = object.role
      const health = element('span', 'st-hud__mission-object-health')
      health.textContent = object.alive ? String(Math.round(object.health)) : 'Down'
      const meter = element('span', 'st-hud__mission-object-meter')
      const fill = element('span', 'st-hud__mission-object-fill')
      fill.style.width = `${Math.max(0, Math.min(100, object.maxHealth > 0 ? object.health / object.maxHealth * 100 : 0))}%`
      meter.append(fill)
      row.append(label, role, health, meter)
      row.setAttribute('aria-label', `${object.label}, ${object.role.toLowerCase()}, ${object.alive ? `${Math.round(object.health)} of ${Math.round(object.maxHealth)} health` : 'destroyed'}`)
      return row
    }))
    this.outcome.hidden = projection.outcome === null
    this.outcome.textContent = projection.outcome === 'Success'
      ? 'Objective complete'
      : projection.outcome === 'Failure' ? 'Mission failed' : ''
    this.retry.hidden = projection.retryLabel === null
    this.retry.textContent = projection.retryLabel ?? ''
  }
}

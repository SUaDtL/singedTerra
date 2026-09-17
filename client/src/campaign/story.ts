import { ASH_ROAD_EPISODE } from './content/episode'

export interface CampaignStoryBeat {
  readonly id: string
  readonly encounterId: string
  readonly title: string
  readonly body: string
  readonly factObjectIds: readonly string[]
}

const BEATS = Object.freeze([
  Object.freeze({
    id: 'fuel-stop-secured', encounterId: 'fuel-stop', title: 'Fuel Stop Secured',
    body: 'The refinery is still standing. Choose the road to Relay Ridge and service the carried kit before moving out.',
    factObjectIds: Object.freeze(['refinery']),
  }),
  Object.freeze({
    id: 'high-road-cleared', encounterId: 'high-road', title: 'High Road Cleared',
    body: 'The pump survived the crossing. Relay Ridge is the last position between the convoy and open ground.',
    factObjectIds: Object.freeze(['pump']),
  }),
  Object.freeze({
    id: 'salvage-pit-cleared', encounterId: 'salvage-pit', title: 'Salvage Pit Cleared',
    body: 'The pit is quiet. What remains of the carried hull and ammunition goes with you to Relay Ridge.',
    factObjectIds: Object.freeze(['drill-cache']),
  }),
  Object.freeze({
    id: 'relay-ridge-cleared', encounterId: 'relay-ridge', title: 'Ash Road Open',
    body: 'The siege gun is down. The convoy has a road through the ash.',
    factObjectIds: Object.freeze(['siege-relay']),
  }),
] as const satisfies readonly CampaignStoryBeat[])

for (const beat of BEATS) {
  const encounter = ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === beat.encounterId,
  )
  if (!encounter || beat.factObjectIds.some(
    (id) => !encounter.objects.some((object) => object.id === id),
  )) throw new Error(`Campaign story beat ${beat.id} is not fact-bound`)
}

export const ASH_ROAD_STORY_BEATS: readonly CampaignStoryBeat[] = BEATS

export function campaignStoryBeatFor(encounterId: string): CampaignStoryBeat | null {
  return BEATS.find((beat) => beat.encounterId === encounterId) ?? null
}

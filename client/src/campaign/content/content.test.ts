import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  ASH_ROAD_CONTENT_STATUS,
  ASH_ROAD_EPISODE,
  ASH_ROAD_ROUTE_IDS,
} from './episode'
import {
  ASH_ROAD_STORY,
  ASH_ROAD_STORY_LIMITS,
  parseCampaignStory,
} from './story'
import { isCampaignWeaponId } from '@shared/campaign/combatProfiles'
import { parseCampaignEpisodeDefinition } from '@shared/campaign/definitions'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

function clone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>
}

function contentDigest(value: { readonly contentDigest: string }): string {
  const digestInput = structuredClone(value) as Mutable<typeof value>
  delete (digestInput as Partial<typeof digestInput>).contentDigest
  return createHash('sha256').update(JSON.stringify(digestInput)).digest('hex')
}

describe('Ash Road authored episode', () => {
  it('publishes four encounters and exactly two legal three-encounter routes', () => {
    expect(ASH_ROAD_CONTENT_STATUS).toEqual({
      confidence: 'prototype-unverified',
      acceptance: 'source-engine-playthrough-required',
    })
    expect(ASH_ROAD_EPISODE.encounters.map(({ encounterId }) => encounterId)).toEqual([
      'fuel-stop',
      'high-road',
      'salvage-pit',
      'relay-ridge',
    ])
    expect(ASH_ROAD_EPISODE.routes).toEqual([
      { id: ASH_ROAD_ROUTE_IDS.highRoad, encounterIds: ['fuel-stop', 'high-road', 'relay-ridge'] },
      { id: ASH_ROAD_ROUTE_IDS.salvagePit, encounterIds: ['fuel-stop', 'salvage-pit', 'relay-ridge'] },
    ])
    expect(parseCampaignEpisodeDefinition(ASH_ROAD_EPISODE)).toEqual(ASH_ROAD_EPISODE)
    expect(ASH_ROAD_EPISODE.encounters.map(contentDigest))
      .toEqual(ASH_ROAD_EPISODE.encounters.map(({ contentDigest: digest }) => digest))
    expect(contentDigest(ASH_ROAD_EPISODE)).toBe(ASH_ROAD_EPISODE.contentDigest)
  })

  it('equips every spawn with a canonical campaign weapon ID', () => {
    for (const encounter of ASH_ROAD_EPISODE.encounters) {
      for (const spawn of encounter.spawns) {
        for (const equipmentId of spawn.equipment) {
          expect(isCampaignWeaponId(equipmentId), `${encounter.encounterId}:${spawn.id}:${equipmentId}`)
            .toBe(true)
        }
      }
    }
  })

  it('rejects episode version, route, and reference drift', () => {
    const unknownVersion = clone(ASH_ROAD_EPISODE) as unknown as Record<string, unknown>
    unknownVersion.episodeVersion = 2
    expect(parseCampaignEpisodeDefinition(unknownVersion)).toBeNull()

    const duplicateRoute = clone(ASH_ROAD_EPISODE)
    duplicateRoute.routes[1]!.encounterIds[1] = 'high-road'
    expect(parseCampaignEpisodeDefinition(duplicateRoute)).toBeNull()

    const unknownEncounter = clone(ASH_ROAD_EPISODE)
    unknownEncounter.routes[0]!.encounterIds[1] = 'missing-encounter'
    expect(parseCampaignEpisodeDefinition(unknownEncounter)).toBeNull()

    const badObjectiveReference = clone(ASH_ROAD_EPISODE)
    badObjectiveReference.encounters[0]!.objective.protectedObjectIds[0] = 'missing-refinery'
    expect(parseCampaignEpisodeDefinition(badObjectiveReference)).toBeNull()

    const badWarningReference = clone(ASH_ROAD_EPISODE)
    badWarningReference.encounters[1]!.warning!.sourceObjectId = 'missing-relay'
    expect(parseCampaignEpisodeDefinition(badWarningReference)).toBeNull()
  })
})

describe('Ash Road authored story', () => {
  it('keeps unique source-driven event IDs within explicit delivery limits', () => {
    expect(ASH_ROAD_STORY.storyVersion).toBe(1)
    expect(ASH_ROAD_STORY.beats).toHaveLength(ASH_ROAD_STORY_LIMITS.maximumBeats)
    expect(ASH_ROAD_STORY.beats.map(({ eventId }) => eventId)).toEqual([
      'fuel-stop-entry',
      'first-drum-destroyed',
      'fuel-stop-intact-supply',
      'route-choice',
      'warning-announced',
      'relay-disabled',
      'siege-gun-entry',
      'episode-complete',
    ])
    expect(new Set(ASH_ROAD_STORY.beats.map(({ eventId }) => eventId)).size)
      .toBe(ASH_ROAD_STORY.beats.length)
    expect(Math.max(...ASH_ROAD_STORY.beats.map(({ text }) => text.length)))
      .toBeLessThanOrEqual(ASH_ROAD_STORY_LIMITS.maximumTextLength)
    expect(Math.max(...ASH_ROAD_STORY.beats.map(({ maximumPerCommitment }) => maximumPerCommitment)))
      .toBe(ASH_ROAD_STORY_LIMITS.maximumReactiveLinesPerCommitment)
    expect(parseCampaignStory(ASH_ROAD_STORY, ASH_ROAD_EPISODE)).toEqual(ASH_ROAD_STORY)
    expect(contentDigest(ASH_ROAD_STORY)).toBe(ASH_ROAD_STORY.contentDigest)
  })

  it('rejects story event, version, limit, and authored-reference drift', () => {
    const unknownVersion = clone(ASH_ROAD_STORY) as unknown as Record<string, unknown>
    unknownVersion.storyVersion = 2
    expect(parseCampaignStory(unknownVersion, ASH_ROAD_EPISODE)).toBeNull()

    const duplicateEvent = clone(ASH_ROAD_STORY)
    duplicateEvent.beats[1]!.eventId = duplicateEvent.beats[0]!.eventId
    expect(parseCampaignStory(duplicateEvent, ASH_ROAD_EPISODE)).toBeNull()

    const excessiveReactiveDelivery = clone(ASH_ROAD_STORY)
    const excessiveBeat = excessiveReactiveDelivery.beats[1] as { maximumPerCommitment: number }
    excessiveBeat.maximumPerCommitment = 2
    expect(parseCampaignStory(excessiveReactiveDelivery, ASH_ROAD_EPISODE)).toBeNull()

    const unknownEncounter = clone(ASH_ROAD_STORY)
    unknownEncounter.beats[0]!.encounterIds[0] = 'missing-encounter'
    expect(parseCampaignStory(unknownEncounter, ASH_ROAD_EPISODE)).toBeNull()

    const unknownObject = clone(ASH_ROAD_STORY)
    unknownObject.beats[1]!.objectIds[0] = 'missing-drum'
    expect(parseCampaignStory(unknownObject, ASH_ROAD_EPISODE)).toBeNull()
  })
})

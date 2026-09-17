import { describe, expect, it } from 'vitest'
import { ASH_ROAD_EPISODE } from './content/episode'
import { ASH_ROAD_STORY_BEATS, campaignStoryBeatFor } from './story'

describe('Ash Road story beats', () => {
  it('binds one bounded factual beat to every authored encounter', () => {
    expect(ASH_ROAD_STORY_BEATS).toHaveLength(ASH_ROAD_EPISODE.encounters.length)
    expect(new Set(ASH_ROAD_STORY_BEATS.map(({ id }) => id)).size)
      .toBe(ASH_ROAD_STORY_BEATS.length)
    for (const encounter of ASH_ROAD_EPISODE.encounters) {
      const beat = campaignStoryBeatFor(encounter.encounterId)
      expect(beat).not.toBeNull()
      expect(beat!.factObjectIds.every(
        (id) => encounter.objects.some((object) => object.id === id),
      )).toBe(true)
      expect(beat!.body.length).toBeLessThanOrEqual(180)
    }
  })

  it('does not invent a beat for unknown content', () => {
    expect(campaignStoryBeatFor('unknown')).toBeNull()
  })
})

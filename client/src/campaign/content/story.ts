import type { CampaignEpisodeDefinition } from '@shared/campaign/definitions'
import { ASH_ROAD_EPISODE } from './episode'

export const ASH_ROAD_STORY_LIMITS = Object.freeze({
  maximumBeats: 8,
  maximumTextLength: 160,
  maximumReactiveLinesPerCommitment: 1,
} as const)

export type AshRoadSpeakerId = 'mara' | 'rook'
export type AshRoadStoryBoundary =
  | 'before-encounter'
  | 'safe-decision'
  | 'after-settled-commitment'
  | 'between-encounters'
  | 'after-episode'

export interface CampaignStoryCharacter {
  readonly id: AshRoadSpeakerId
  readonly role: string
  readonly voice: string
}

export interface CampaignStoryBeat {
  readonly eventId: string
  readonly speakerId: AshRoadSpeakerId
  readonly text: string
  readonly boundary: AshRoadStoryBoundary
  readonly encounterIds: readonly string[]
  readonly objectIds: readonly string[]
  /** Zero for non-reactive beats; one is the hard per-commitment delivery cap. */
  readonly maximumPerCommitment: 0 | 1
}

export interface CampaignStoryDefinition {
  readonly kind: 'campaign-story'
  readonly storyVersion: 1
  readonly storyId: string
  readonly episodeId: string
  readonly episodeVersion: 1
  readonly episodeContentDigest: string
  readonly contentDigest: string
  readonly status: 'prototype-unverified'
  readonly setting: string
  readonly characters: readonly CampaignStoryCharacter[]
  readonly beats: readonly CampaignStoryBeat[]
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const DIGEST = /^[0-9a-f]{64}$/

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && IDENTIFIER.test(value)
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every(identifier) || new Set(value).size !== value.length) return null
  return Object.freeze([...value])
}

const BOUNDARIES: readonly AshRoadStoryBoundary[] = [
  'before-encounter',
  'safe-decision',
  'after-settled-commitment',
  'between-encounters',
  'after-episode',
]

export function parseCampaignStory(
  value: unknown,
  episode: CampaignEpisodeDefinition,
): CampaignStoryDefinition | null {
  if (!record(value) || !exactKeys(value, ['kind', 'storyVersion', 'storyId', 'episodeId',
    'episodeVersion', 'episodeContentDigest', 'contentDigest', 'status', 'setting', 'characters', 'beats'])
    || value.kind !== 'campaign-story' || value.storyVersion !== 1 || !identifier(value.storyId)
    || value.episodeId !== episode.episodeId || value.episodeVersion !== episode.episodeVersion
    || value.episodeContentDigest !== episode.contentDigest || typeof value.contentDigest !== 'string'
    || !DIGEST.test(value.contentDigest) || value.status !== 'prototype-unverified'
    || typeof value.setting !== 'string' || value.setting.length === 0 || value.setting.length > 240
    || !Array.isArray(value.characters) || value.characters.length !== 2
    || !Array.isArray(value.beats) || value.beats.length !== ASH_ROAD_STORY_LIMITS.maximumBeats) return null

  const characters: CampaignStoryCharacter[] = []
  for (const character of value.characters) {
    if (!record(character) || !exactKeys(character, ['id', 'role', 'voice'])
      || (character.id !== 'mara' && character.id !== 'rook')
      || typeof character.role !== 'string' || character.role.length === 0 || character.role.length > 80
      || typeof character.voice !== 'string' || character.voice.length === 0 || character.voice.length > 120) return null
    characters.push(Object.freeze({ id: character.id, role: character.role, voice: character.voice }))
  }
  if (new Set(characters.map(({ id }) => id)).size !== characters.length) return null

  const encounterById = new Map(episode.encounters.map((encounter) => [encounter.encounterId, encounter]))
  const speakerIds = new Set(characters.map(({ id }) => id))
  const beats: CampaignStoryBeat[] = []
  for (const beat of value.beats) {
    if (!record(beat) || !exactKeys(beat, ['eventId', 'speakerId', 'text', 'boundary', 'encounterIds',
      'objectIds', 'maximumPerCommitment']) || !identifier(beat.eventId)
      || !speakerIds.has(beat.speakerId as AshRoadSpeakerId) || typeof beat.text !== 'string'
      || beat.text.length === 0 || beat.text.length > ASH_ROAD_STORY_LIMITS.maximumTextLength
      || !BOUNDARIES.includes(beat.boundary as AshRoadStoryBoundary)
      || (beat.maximumPerCommitment !== 0
        && beat.maximumPerCommitment !== ASH_ROAD_STORY_LIMITS.maximumReactiveLinesPerCommitment)) return null
    const encounterIds = stringList(beat.encounterIds)
    const objectIds = stringList(beat.objectIds)
    if (!encounterIds || !objectIds || encounterIds.some((id) => !encounterById.has(id))) return null
    const referencedObjects = new Set(encounterIds.flatMap((id) =>
      encounterById.get(id)!.objects.map(({ id: objectId }) => objectId)))
    if (objectIds.some((id) => !referencedObjects.has(id))) return null
    beats.push(Object.freeze({
      eventId: beat.eventId,
      speakerId: beat.speakerId as AshRoadSpeakerId,
      text: beat.text,
      boundary: beat.boundary as AshRoadStoryBoundary,
      encounterIds,
      objectIds,
      maximumPerCommitment: beat.maximumPerCommitment as 0 | 1,
    }))
  }
  if (new Set(beats.map(({ eventId }) => eventId)).size !== beats.length) return null

  return Object.freeze({
    kind: 'campaign-story', storyVersion: 1, storyId: value.storyId,
    episodeId: episode.episodeId, episodeVersion: 1, episodeContentDigest: episode.contentDigest,
    contentDigest: value.contentDigest, status: 'prototype-unverified', setting: value.setting,
    characters: Object.freeze(characters), beats: Object.freeze(beats),
  })
}

const candidate: CampaignStoryDefinition = {
  kind: 'campaign-story',
  storyVersion: 1,
  storyId: 'ash-road-chapter-one-story',
  episodeId: 'ash-road-chapter-one',
  episodeVersion: 1,
  episodeContentDigest: '7b912d1f1e52a508ea7f7522644cc14f523f6bed3269c0363823bd448d778dbd',
  contentDigest: 'f0d32c9221eaebceae0a814f13b700f53b53e286958cde6cbc19bf5bd684ead7',
  status: 'prototype-unverified',
  setting: 'A mobile water refinery must reach a settlement before its reserve runs dry. The convoy travels between combat scenes.',
  characters: [
    { id: 'mara', role: 'refinery engineer', voice: 'practical, dry, concerned about what survives' },
    { id: 'rook', role: 'spotter', voice: 'brief, observational, never gives exact solution angles' },
  ],
  beats: [
    {
      eventId: 'fuel-stop-entry', speakerId: 'mara', boundary: 'before-encounter',
      encounterIds: ['fuel-stop'], objectIds: ['drum-a', 'drum-b'], maximumPerCommitment: 0,
      text: 'We need what is in those drums. We do not need the gun standing beside them.',
    },
    {
      eventId: 'first-drum-destroyed', speakerId: 'rook', boundary: 'after-settled-commitment',
      encounterIds: ['fuel-stop'], objectIds: ['drum-a', 'drum-b'], maximumPerCommitment: 1,
      text: 'That opened the road. Less left to carry, though.',
    },
    {
      eventId: 'fuel-stop-intact-supply', speakerId: 'mara', boundary: 'between-encounters',
      encounterIds: ['fuel-stop'], objectIds: ['drum-a', 'drum-b'], maximumPerCommitment: 0,
      text: 'Fuel intact. Now we can afford a choice.',
    },
    {
      eventId: 'route-choice', speakerId: 'mara', boundary: 'between-encounters',
      encounterIds: ['fuel-stop'], objectIds: [], maximumPerCommitment: 0,
      text: 'The high road has a working pump. The pit has military salvage. Pick what we can use.',
    },
    {
      eventId: 'warning-announced', speakerId: 'rook', boundary: 'safe-decision',
      encounterIds: ['high-road', 'relay-ridge'], objectIds: ['ridge-relay', 'siege-relay'],
      maximumPerCommitment: 0,
      text: 'Incoming on the marked ground. Move, brace, or silence the relay.',
    },
    {
      eventId: 'relay-disabled', speakerId: 'rook', boundary: 'after-settled-commitment',
      encounterIds: ['high-road', 'relay-ridge'], objectIds: ['ridge-relay', 'siege-relay'],
      maximumPerCommitment: 1,
      text: 'Relay down. No more guided strikes.',
    },
    {
      eventId: 'siege-gun-entry', speakerId: 'mara', boundary: 'before-encounter',
      encounterIds: ['relay-ridge'], objectIds: ['siege-relay'], maximumPerCommitment: 0,
      text: 'That gun closes the valley. Its relay and its footing look less impressive.',
    },
    {
      eventId: 'episode-complete', speakerId: 'mara', boundary: 'after-episode',
      encounterIds: ['relay-ridge'], objectIds: [], maximumPerCommitment: 0,
      text: 'Water on the road. That is a better ending than a crater.',
    },
  ],
}

const parsed = parseCampaignStory(candidate, ASH_ROAD_EPISODE)
if (!parsed) throw new Error('Invalid authored Ash Road story')

export const ASH_ROAD_STORY = parsed

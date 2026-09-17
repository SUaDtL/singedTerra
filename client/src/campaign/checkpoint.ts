import {
  parseCampaignEncounterDefinition,
  parseCampaignRun,
  type CampaignEncounterDefinition,
  type CampaignRun,
} from '@shared/campaign/definitions'
import {
  resolveCampaignCombatProfile,
  type ResolvedCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import type { CampaignDescriptor } from '../client/modeConfig'
import { ASH_ROAD_EPISODE } from './content/episode'
import { parseCampaignLoadout } from './loadout'

export const CAMPAIGN_CHECKPOINT_VERSION = 1 as const

export interface CampaignProfileBinding {
  readonly profileId: string
  readonly profileVersion: 1
  readonly contentDigest: string
}

export interface CampaignCheckpoint {
  readonly kind: 'campaign-checkpoint'
  readonly checkpointVersion: typeof CAMPAIGN_CHECKPOINT_VERSION
  readonly run: CampaignRun
  readonly encounter: CampaignEncounterDefinition
  readonly profile: CampaignProfileBinding
  readonly attempt: number
  readonly supplies: number
}

export interface CreateCampaignCheckpointInput {
  readonly run: CampaignRun
  readonly encounter: CampaignEncounterDefinition
  readonly combatProfile: ResolvedCampaignCombatProfile
  readonly attempt: number
  readonly supplies: number
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function sameParsedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveProfileBinding(value: unknown): {
  readonly binding: CampaignProfileBinding
  readonly profile: ResolvedCampaignCombatProfile
} | null {
  if (!record(value) || !exactKeys(value, ['profileId', 'profileVersion', 'contentDigest'])
    || typeof value.profileId !== 'string' || value.profileVersion !== 1
    || typeof value.contentDigest !== 'string') return null
  let profile: ResolvedCampaignCombatProfile
  try {
    profile = resolveCampaignCombatProfile({
      profileId: value.profileId,
      profileVersion: value.profileVersion,
    })
  } catch {
    return null
  }
  if (value.contentDigest !== profile.contentDigest) return null
  return {
    binding: Object.freeze({
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      contentDigest: profile.contentDigest,
    }),
    profile,
  }
}

export function parseCampaignCheckpoint(value: unknown): CampaignCheckpoint | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'checkpointVersion', 'run', 'encounter', 'profile', 'attempt', 'supplies',
  ]) || value.kind !== 'campaign-checkpoint'
    || value.checkpointVersion !== CAMPAIGN_CHECKPOINT_VERSION
    || !integer(value.attempt, 1, 0xffff_ffff)
    || !integer(value.supplies, 0, Number.MAX_SAFE_INTEGER)) return null

  const run = parseCampaignRun(value.run)
  const encounter = parseCampaignEncounterDefinition(value.encounter)
  const resolved = resolveProfileBinding(value.profile)
  if (!run || !encounter || !resolved) return null
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === run.routeId)
  const authoredEncounterId = route?.encounterIds[run.currentEncounterIndex]
  const authoredEncounter = ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === authoredEncounterId,
  )
  if (run.episodeId !== ASH_ROAD_EPISODE.episodeId
    || run.episodeVersion !== ASH_ROAD_EPISODE.episodeVersion
    || run.episodeContentDigest !== ASH_ROAD_EPISODE.contentDigest
    || !route
    || !route.encounterIds.every((id, index) => run.encounterIds[index] === id)
    || !authoredEncounter
    || encounter.encounterId !== authoredEncounter.encounterId
    || !sameParsedValue(encounter, authoredEncounter)
    || run.combatProfileId !== resolved.profile.profileId
    || run.combatProfileVersion !== resolved.profile.profileVersion
    || run.combatProfileContentDigest !== resolved.profile.contentDigest
    || encounter.combatProfileId !== resolved.profile.profileId
    || encounter.combatProfileVersion !== resolved.profile.profileVersion) return null

  const canonicalRun = parseCampaignRun({
    ...run,
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    routeId: route.id,
    encounterIds: route.encounterIds,
  })
  const canonicalEncounter = parseCampaignEncounterDefinition(authoredEncounter)
  if (!canonicalRun || !canonicalEncounter) return null

  return Object.freeze({
    kind: 'campaign-checkpoint',
    checkpointVersion: CAMPAIGN_CHECKPOINT_VERSION,
    run: canonicalRun,
    encounter: canonicalEncounter,
    profile: resolved.binding,
    attempt: value.attempt,
    supplies: value.supplies,
  })
}

export function createCampaignCheckpoint(input: CreateCampaignCheckpointInput): CampaignCheckpoint {
  if (!record(input) || !exactKeys(input, [
    'run', 'encounter', 'combatProfile', 'attempt', 'supplies',
  ])) throw new Error('invalid campaign checkpoint input')

  const canonicalProfile = resolveCampaignCombatProfile({
    profileId: input.combatProfile.profileId,
    profileVersion: input.combatProfile.profileVersion,
  })
  if (input.combatProfile !== canonicalProfile) {
    throw new Error('campaign checkpoint requires the resolved combat profile')
  }
  const checkpoint = parseCampaignCheckpoint({
    kind: 'campaign-checkpoint',
    checkpointVersion: CAMPAIGN_CHECKPOINT_VERSION,
    run: input.run,
    encounter: input.encounter,
    profile: {
      profileId: canonicalProfile.profileId,
      profileVersion: canonicalProfile.profileVersion,
      contentDigest: canonicalProfile.contentDigest,
    },
    attempt: input.attempt,
    supplies: input.supplies,
  })
  if (!checkpoint) throw new Error('invalid or unbound campaign checkpoint')
  return checkpoint
}

/** Rehydrate only bound authored inputs; live GameState is never checkpoint data. */
export function campaignDescriptorFromCheckpoint(
  value: unknown,
  loadoutValue?: unknown,
): CampaignDescriptor {
  const checkpoint = parseCampaignCheckpoint(value)
  if (!checkpoint) throw new Error('invalid campaign checkpoint')
  const profile = resolveCampaignCombatProfile({
    profileId: checkpoint.profile.profileId,
    profileVersion: checkpoint.profile.profileVersion,
  })
  const loadout = loadoutValue === undefined ? null : parseCampaignLoadout(loadoutValue)
  if (loadoutValue !== undefined && !loadout) throw new Error('invalid campaign carried loadout')
  return Object.freeze({
    encounter: checkpoint.encounter,
    combatProfile: profile,
    ...(loadout ? {
      humanLoadout: Object.freeze({
        hull: loadout.hull,
        ammunition: Object.freeze(loadout.carried.ammunition.map(({ weaponId, quantity }) =>
          Object.freeze({ weaponId, quantity }))),
      }),
    } : {}),
  })
}

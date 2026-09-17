import {
  parseCampaignEpisodeDefinition,
  type CampaignEncounterDefinition,
  type CampaignEpisodeDefinition,
} from '@shared/campaign/definitions'

/**
 * The packet supplied these coordinates and tuning values as prototype candidates.
 * They remain intentionally unverified until retained source-engine playthroughs
 * establish that both routes and their promised counterplay are legal.
 */
export const ASH_ROAD_CONTENT_STATUS = Object.freeze({
  confidence: 'prototype-unverified',
  acceptance: 'source-engine-playthrough-required',
} as const)

export const ASH_ROAD_ROUTE_IDS = Object.freeze({
  highRoad: 'high-road-route',
  salvagePit: 'salvage-pit-route',
} as const)

const PROFILE_ID = 'ash-road-v1'
const HUMAN_EQUIPMENT = Object.freeze([
  'baby_missile', 'missile', 'cluster_bomb', 'sandhog', 'napalm', 'shield',
])
const DEFENDER_EQUIPMENT = Object.freeze(['baby_missile', 'missile', 'cluster_bomb'])
const SIEGE_EQUIPMENT = Object.freeze(['missile', 'cluster_bomb', 'shield'])

function terrain(points: readonly (readonly [number, number])[]) {
  return {
    kind: 'height-control-points' as const,
    version: 1 as const,
    width: 1200,
    bitmapHeight: 600,
    floorY: 400,
    points: points.map(([x, y]) => ({ x, y })),
  }
}

const encounters = [
  {
    kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: 'fuel-stop', combatProfileId: PROFILE_ID, combatProfileVersion: 1,
    contentDigest: '569e0ea1868e6fa42bf833a8a2668e5073a46b007d1ffa7f58979a8cb3efb8f7',
    seed: 4201,
    terrain: terrain([[0, 325], [160, 305], [372, 305], [560, 350], [700, 305],
      [850, 305], [1040, 325], [1199, 325]]),
    spawns: [
      { id: 'p1', role: 'human', x: 280, hull: 100, equipment: HUMAN_EQUIPMENT },
      { id: 'p2', role: 'defender', x: 800, hull: 100, equipment: DEFENDER_EQUIPMENT },
    ],
    objects: [
      { id: 'refinery', kind: 'protected', x: 350, width: 44, height: 36, health: 100 },
      { id: 'drum-a', kind: 'supply-drum', x: 715, width: 28, height: 28, health: 20 },
      { id: 'drum-b', kind: 'supply-drum', x: 765, width: 28, height: 28, health: 20 },
    ],
    objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] },
    warning: null,
  },
  {
    kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: 'high-road', combatProfileId: PROFILE_ID, combatProfileVersion: 1,
    contentDigest: '6ee140085fcdbd8c9d44107a6b6b437f8215f5c7d12d55988029c20a416dda6d',
    seed: 4202,
    terrain: terrain([[0, 340], [200, 320], [430, 320], [580, 365], [700, 285],
      [790, 285], [920, 285], [1199, 330]]),
    spawns: [
      { id: 'p1', role: 'human', x: 310, hull: 100, equipment: HUMAN_EQUIPMENT },
      { id: 'p2', role: 'defender', x: 830, hull: 100, equipment: DEFENDER_EQUIPMENT },
    ],
    objects: [
      { id: 'pump', kind: 'protected', x: 380, width: 44, height: 36, health: 100 },
      { id: 'ridge-relay', kind: 'relay', x: 745, width: 44, height: 36, health: 35 },
    ],
    objective: {
      kind: 'survive-or-eliminate', protectedObjectIds: ['pump'], humanCommitments: 3,
    },
    warning: {
      kind: 'announced-strike', sourceObjectId: 'ridge-relay', sourceSpawnId: 'p2',
    },
  },
  {
    kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: 'salvage-pit', combatProfileId: PROFILE_ID, combatProfileVersion: 1,
    contentDigest: 'a954930657136958b279c43febe9c287cf9c3afe9940aebc82a3e781048c9bf6',
    seed: 4203,
    terrain: terrain([[0, 300], [180, 300], [230, 320], [310, 320], [380, 345],
      [560, 350], [690, 325], [880, 325], [1000, 325], [1199, 345]]),
    spawns: [
      { id: 'p1', role: 'human', x: 270, hull: 100, equipment: HUMAN_EQUIPMENT },
      { id: 'p2', role: 'defender', x: 710, hull: 100, equipment: DEFENDER_EQUIPMENT },
      { id: 'p3', role: 'defender', x: 960, hull: 100, equipment: DEFENDER_EQUIPMENT },
    ],
    objects: [
      { id: 'drill-cache', kind: 'cache', x: 840, width: 44, height: 36, health: 40 },
      { id: 'drum-c', kind: 'supply-drum', x: 765, width: 28, height: 28, health: 20 },
    ],
    objective: { kind: 'eliminate', protectedObjectIds: [] },
    warning: null,
  },
  {
    kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: 'relay-ridge', combatProfileId: PROFILE_ID, combatProfileVersion: 1,
    contentDigest: 'cc4d420a2e70c5e3d61a14701a82873f4af7ea76a6273dcb9c5bc4497989b0ef',
    seed: 4204,
    terrain: terrain([[0, 325], [220, 315], [420, 315], [600, 365], [740, 280],
      [960, 280], [1199, 320]]),
    spawns: [
      { id: 'p1', role: 'human', x: 310, hull: 100, equipment: HUMAN_EQUIPMENT },
      { id: 'p2', role: 'siege-gun', x: 875, hull: 100, equipment: SIEGE_EQUIPMENT },
    ],
    objects: [
      { id: 'siege-relay', kind: 'relay', x: 765, width: 44, height: 36, health: 35 },
      { id: 'siege-drum', kind: 'supply-drum', x: 820, width: 28, height: 28, health: 20 },
    ],
    objective: { kind: 'eliminate', protectedObjectIds: [] },
    warning: {
      kind: 'announced-strike', sourceObjectId: 'siege-relay', sourceSpawnId: 'p2',
    },
  },
] as const satisfies readonly CampaignEncounterDefinition[]

const candidate: CampaignEpisodeDefinition = {
  kind: 'campaign-episode',
  episodeVersion: 1,
  episodeId: 'ash-road-chapter-one',
  contentDigest: '7b912d1f1e52a508ea7f7522644cc14f523f6bed3269c0363823bd448d778dbd',
  entryEncounterId: 'fuel-stop',
  encounters,
  routes: [
    {
      id: ASH_ROAD_ROUTE_IDS.highRoad,
      encounterIds: ['fuel-stop', 'high-road', 'relay-ridge'],
    },
    {
      id: ASH_ROAD_ROUTE_IDS.salvagePit,
      encounterIds: ['fuel-stop', 'salvage-pit', 'relay-ridge'],
    },
  ],
}

const parsed = parseCampaignEpisodeDefinition(candidate)
if (!parsed) throw new Error('Invalid authored Ash Road episode')

export const ASH_ROAD_EPISODE = parsed

// AC-01/AC-03: strict, bounded, caller-detached campaign contracts.
// Run: node --import tsx scripts/checks/campaign_definitions.mjs
import assert from 'node:assert/strict'
import {
  CAMPAIGN_CONTRACT_LIMITS,
  parseCampaignCombatProfile,
  parseCampaignEncounterDefinition,
  parseCampaignEpisodeDefinition,
  parseCampaignResult,
  parseCampaignRun,
} from '../../shared/src/campaign/definitions.ts'

const digest = (digit) => digit.repeat(64)
const point = (x, y) => ({ x, y })

const encounter = (encounterId, seed, overrides = {}) => ({
  kind: 'campaign-encounter',
  episodeVersion: 1,
  encounterVersion: 1,
  encounterId,
  combatProfileId: 'ash-road-v1',
  combatProfileVersion: 1,
  contentDigest: digest(String(seed % 10)),
  seed,
  terrain: {
    kind: 'height-control-points', version: 1,
    width: 1200, bitmapHeight: 600, floorY: 400,
    points: [point(0, 325), point(600, 350), point(1199, 325)],
  },
  spawns: [
    { id: 'p1', role: 'human', x: 280, hull: 100, equipment: ['baby_missile'] },
    { id: 'p2', role: 'defender', x: 800, hull: 100, equipment: ['baby_missile'] },
  ],
  objects: [
    { id: 'refinery', kind: 'protected', x: 350, width: 44, height: 36, health: 100 },
    { id: 'drum-a', kind: 'supply-drum', x: 715, width: 28, height: 28, health: 20 },
  ],
  objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] },
  warning: null,
  ...overrides,
})

const encounters = [
  encounter('fuel-stop', 4201),
  encounter('high-road', 4202, {
    objects: [{ id: 'relay', kind: 'relay', x: 745, width: 44, height: 36, health: 35 }],
    objective: { kind: 'survive-or-eliminate', protectedObjectIds: [], humanCommitments: 3 },
    warning: { kind: 'announced-strike', sourceObjectId: 'relay', sourceSpawnId: 'p2' },
  }),
  encounter('salvage-pit', 4203),
  encounter('relay-ridge', 4204, {
    spawns: [
      { id: 'p1', role: 'human', x: 310, hull: 100, equipment: ['baby_missile'] },
      { id: 'p2', role: 'siege-gun', x: 875, hull: 100, equipment: ['baby_missile'] },
    ],
    objects: [{ id: 'siege-relay', kind: 'relay', x: 765, width: 44, height: 36, health: 35 }],
    objective: { kind: 'eliminate', protectedObjectIds: [] },
    warning: { kind: 'announced-strike', sourceObjectId: 'siege-relay', sourceSpawnId: 'p2' },
  }),
]

const episode = {
  kind: 'campaign-episode', episodeVersion: 1, episodeId: 'ash-road-chapter-one',
  contentDigest: digest('a'), entryEncounterId: 'fuel-stop', encounters,
  routes: [
    { id: 'high-road-route', encounterIds: ['fuel-stop', 'high-road', 'relay-ridge'] },
    { id: 'salvage-route', encounterIds: ['fuel-stop', 'salvage-pit', 'relay-ridge'] },
  ],
}

const profile = {
  kind: 'campaign-combat-profile', profileVersion: 1, profileId: 'ash-road-v1',
  contentDigest: digest('b'),
  choices: [
    { id: 'baby_missile', slot: 'offense', ammunition: 99 },
    { id: 'missile', slot: 'offense', ammunition: 4 },
    { id: 'shield', slot: 'defense', ammunition: 1 },
  ],
}

const run = {
  kind: 'campaign-run', runVersion: 1, runId: 'run-0001',
  episodeId: episode.episodeId, episodeVersion: 1, episodeContentDigest: episode.contentDigest,
  combatProfileId: profile.profileId, combatProfileVersion: 1,
  combatProfileContentDigest: profile.contentDigest,
  routeId: 'high-road-route', encounterIds: ['fuel-stop', 'high-road', 'relay-ridge'],
  currentEncounterIndex: 0,
}

const result = {
  kind: 'campaign-result', resultVersion: 1, runId: run.runId,
  encounterId: 'fuel-stop', encounterVersion: 1,
  encounterContentDigest: encounters[0].contentDigest,
  attempt: 1, outcome: 'success', commitments: 2,
}

const parserCases = [
  ['episode', parseCampaignEpisodeDefinition, episode, 'episodeVersion'],
  ['encounter', parseCampaignEncounterDefinition, encounters[0], 'encounterVersion'],
  ['profile', parseCampaignCombatProfile, profile, 'profileVersion'],
  ['run', parseCampaignRun, run, 'runVersion'],
  ['result', parseCampaignResult, result, 'resultVersion'],
]

for (const [name, parse, valid, versionKey] of parserCases) {
  assert.deepEqual(parse(valid), valid, `${name} v1 parses`)
  assert.equal(parse({ ...valid, [versionKey]: 2 }), null, `${name} unknown version fails closed`)
  assert.equal(parse({ ...valid, kind: 'campaign-future' }), null, `${name} unknown discriminant fails closed`)
  assert.equal(parse({ ...valid, surprise: true }), null, `${name} rejects unknown fields`)
  for (const invalid of [null, false, [], name]) assert.equal(parse(invalid), null)

  const caller = structuredClone(valid)
  const retained = parse(caller)
  assert.ok(retained)
  const mutate = (value) => {
    if (Array.isArray(value)) value.push('caller-mutation')
    else if (value && typeof value === 'object') value.callerMutation = true
  }
  const nested = name === 'episode' ? caller.encounters[0].terrain.points
    : name === 'encounter' ? caller.terrain.points
      : name === 'profile' ? caller.choices
        : name === 'run' ? caller.encounterIds : caller
  mutate(nested)
  assert.deepEqual(retained, valid, `${name} output is detached from caller-owned nesting`)
  const assertDeepFrozen = (value) => {
    if (!value || typeof value !== 'object') return
    assert.ok(Object.isFrozen(value), `${name} nested output is frozen`)
    Object.values(value).forEach(assertDeepFrozen)
  }
  assertDeepFrozen(retained)
}

assert.equal(CAMPAIGN_CONTRACT_LIMITS.encounters, 4)
assert.equal(CAMPAIGN_CONTRACT_LIMITS.routes, 2)
assert.equal(CAMPAIGN_CONTRACT_LIMITS.routeLength, 3)
assert.equal(CAMPAIGN_CONTRACT_LIMITS.objectsPerEncounter, 8)

const invalidEpisodes = [
  { ...episode, encounters: encounters.slice(0, 3) },
  { ...episode, routes: episode.routes.slice(0, 1) },
  { ...episode, encounters: [...encounters.slice(0, 3), encounter('fuel-stop', 4205)] },
  { ...episode, routes: [episode.routes[0], { id: 'high-road-route', encounterIds: episode.routes[1].encounterIds }] },
  { ...episode, routes: [episode.routes[0], { ...episode.routes[1], encounterIds: ['fuel-stop', 'missing', 'relay-ridge'] }] },
  { ...episode, entryEncounterId: 'missing' },
]
for (const invalid of invalidEpisodes)
  assert.equal(parseCampaignEpisodeDefinition(invalid), null, 'invalid graph identity/reference is rejected')

const invalidEncounters = [
  encounter('duplicate-object', 4300, { objects: [encounters[0].objects[0], encounters[0].objects[0]] }),
  encounter('bad-object-reference', 4301, { objective: { kind: 'eliminate', protectedObjectIds: ['missing'] } }),
  encounter('bad-warning-object', 4302, { warning: { kind: 'announced-strike', sourceObjectId: 'missing', sourceSpawnId: 'p2' } }),
  encounter('bad-warning-spawn', 4303, { warning: { kind: 'announced-strike', sourceObjectId: 'drum-a', sourceSpawnId: 'missing' } }),
  encounter('too-many-objects', 4304, { objects: Array.from({ length: 9 }, (_, i) => ({
    id: `object-${i}`, kind: 'supply-drum', x: 100 + i * 50, width: 20, height: 20, health: 20,
  })) }),
  encounter('spawn-out-of-bounds', 4305, { spawns: [
    { id: 'p1', role: 'human', x: 5, hull: 100, equipment: ['baby_missile'] },
    { id: 'p2', role: 'defender', x: 800, hull: 100, equipment: ['baby_missile'] },
  ] }),
  encounter('duplicate-spawn', 4306, { spawns: [
    { id: 'p1', role: 'human', x: 280, hull: 100, equipment: ['baby_missile'] },
    { id: 'p1', role: 'defender', x: 800, hull: 100, equipment: ['baby_missile'] },
  ] }),
  encounter('crowded-spawns', 4307, { spawns: [
    { id: 'p1', role: 'human', x: 280, hull: 100, equipment: ['baby_missile'] },
    { id: 'p2', role: 'defender', x: 300, hull: 100, equipment: ['baby_missile'] },
  ] }),
  encounter('object-out-of-bounds', 4308, { objects: [
    { id: 'edge', kind: 'protected', x: 10, width: 44, height: 36, health: 100 },
  ], objective: { kind: 'eliminate', protectedObjectIds: ['edge'] } }),
  encounter('overlapping-objects', 4309, { objects: [
    { id: 'left', kind: 'protected', x: 350, width: 44, height: 36, health: 100 },
    { id: 'right', kind: 'supply-drum', x: 370, width: 28, height: 28, health: 20 },
  ], objective: { kind: 'eliminate', protectedObjectIds: ['left'] } }),
  encounter('spawn-object-overlap', 4310, { objects: [
    { id: 'blocking-body', kind: 'protected', x: 295, width: 44, height: 36, health: 100 },
  ], objective: { kind: 'eliminate', protectedObjectIds: ['blocking-body'] } }),
  encounter('bad-terrain-bounds', 4311, { terrain: {
    kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600, floorY: 400,
    points: [point(0, 325), point(1200, 325)],
  } }),
  encounter('wrong-arena', 4312, { terrain: {
    kind: 'height-control-points', version: 1, width: 800, bitmapHeight: 500, floorY: 400,
    points: [point(0, 325), point(799, 325)],
  } }),
]
for (const invalid of invalidEncounters)
  assert.equal(parseCampaignEncounterDefinition(invalid), null, `invalid encounter rejected: ${invalid.encounterId}`)

assert.equal(parseCampaignCombatProfile({ ...profile, choices: [profile.choices[0], profile.choices[0]] }), null,
  'duplicate profile choice IDs are rejected')
assert.equal(parseCampaignRun({ ...run, encounterIds: ['fuel-stop', 'fuel-stop', 'relay-ridge'] }), null,
  'duplicate run encounter references are rejected')

console.log('campaign-definitions: PASS (AC-01/AC-03 strict versioned graph, bounds, references, and ownership)')

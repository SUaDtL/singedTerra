export type AshRoadAssetId = 'drum' | 'refinery' | 'relay' | 'cache' | 'siege' | 'panorama'

export interface AshRoadAssetManifestEntry {
  readonly id: AshRoadAssetId
  readonly path: string
  readonly width: number
  readonly height: number
  readonly alpha: boolean
  readonly requiredStates: readonly string[]
  readonly fallback: string
  readonly sha256: string
}

export const ASH_ROAD_CAMPAIGN_ASSETS = Object.freeze([
  Object.freeze({
    id: 'drum', path: 'art/campaign/ash-road-drum.webp', width: 256, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'damaged', 'destroyed/debris']),
    fallback: 'code-native drum silhouette, health bar, damage marks and debris cross',
    sha256: 'cd3e66c5ba52db916892ff1d0977a2b33689a9464639550baea4e17fdd26343b',
  }),
  Object.freeze({
    id: 'refinery', path: 'art/campaign/ash-road-refinery.webp', width: 320, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'damaged', 'failed']),
    fallback: 'code-native protected-object silhouette, health bar and failure cross',
    sha256: 'ddd9435cf5d658fcc4c5e57e3f3b6b156ace7243d7bcd2606e6dce958213fe07',
  }),
  Object.freeze({
    id: 'relay', path: 'art/campaign/ash-road-relay.webp', width: 256, height: 256,
    alpha: true, requiredStates: Object.freeze(['active', 'damaged', 'disabled']),
    fallback: 'code-native mast, health bar, damage marks and visibly broken disabled cross',
    sha256: '073088ce09ca09825b09538a44cc9c88092b65815986f7e2978776fcd477c023',
  }),
  Object.freeze({
    id: 'cache', path: 'art/campaign/ash-road-cache.webp', width: 320, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'destroyed']),
    fallback: 'code-native cache silhouette, health bar and debris cross',
    sha256: 'b99e7b43f75f8ba9498ce8e5579a0426912563e7b4dadb23aec5a231ef940050',
  }),
  Object.freeze({
    id: 'siege', path: 'art/campaign/ash-road-siege.webp', width: 384, height: 256,
    alpha: true, requiredStates: Object.freeze(['ready', 'announcing', 'disabled']),
    fallback: 'existing real tank body, barrel, warning region and canonical hull facts',
    sha256: '2cd05a5a85744e5235634c3a2d140bbad4344a3270ba612db61e5ca87ffdda5d',
  }),
  Object.freeze({
    id: 'panorama', path: 'art/campaign/ash-road-panorama.webp', width: 1440, height: 480,
    alpha: false, requiredStates: Object.freeze(['chapter-backdrop']),
    fallback: 'existing authored battlefield sky and terrain pipeline',
    sha256: '28c61911c9d978dc3ea33c0abd10bcc6c8c4f32330a18711816bd1ec78389d4c',
  }),
] as const satisfies readonly AshRoadAssetManifestEntry[])

export function ashRoadAsset(id: AshRoadAssetId): AshRoadAssetManifestEntry {
  const entry = ASH_ROAD_CAMPAIGN_ASSETS.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`unknown Ash Road asset: ${id}`)
  return entry
}

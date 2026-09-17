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
  /** Exclusive pixel bounds of meaningful alpha, used to seat world art on terrain. */
  readonly contentBounds?: Readonly<{
    left: number
    top: number
    right: number
    bottom: number
  }>
}

export const ASH_ROAD_CAMPAIGN_ASSETS = Object.freeze([
  Object.freeze({
    id: 'drum', path: 'art/campaign/ash-road-drum.webp', width: 256, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'damaged', 'destroyed/debris']),
    fallback: 'code-native drum silhouette, health bar, damage marks and debris cross',
    sha256: 'cd3e66c5ba52db916892ff1d0977a2b33689a9464639550baea4e17fdd26343b',
    contentBounds: Object.freeze({ left: 44, top: 28, right: 212, bottom: 228 }),
  }),
  Object.freeze({
    id: 'refinery', path: 'art/campaign/ash-road-refinery.webp', width: 320, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'damaged', 'failed']),
    fallback: 'code-native protected-object silhouette, health bar and failure cross',
    sha256: '083548150298bd2b179b839652d312416b673f2935095cb2c3a7cf9285db82a6',
    contentBounds: Object.freeze({ left: 59, top: 13, right: 272, bottom: 223 }),
  }),
  Object.freeze({
    id: 'relay', path: 'art/campaign/ash-road-relay.webp', width: 256, height: 256,
    alpha: true, requiredStates: Object.freeze(['active', 'damaged', 'disabled']),
    fallback: 'code-native mast, health bar, damage marks and visibly broken disabled cross',
    sha256: '073088ce09ca09825b09538a44cc9c88092b65815986f7e2978776fcd477c023',
    contentBounds: Object.freeze({ left: 55, top: 7, right: 202, bottom: 238 }),
  }),
  Object.freeze({
    id: 'cache', path: 'art/campaign/ash-road-cache.webp', width: 320, height: 256,
    alpha: true, requiredStates: Object.freeze(['intact', 'destroyed']),
    fallback: 'code-native cache silhouette, health bar and debris cross',
    sha256: 'd0bdca639101f90ac3bd15abee521a0f20b4a4d9618998172979575a33481cd7',
    contentBounds: Object.freeze({ left: 47, top: 68, right: 273, bottom: 190 }),
  }),
  Object.freeze({
    id: 'siege', path: 'art/campaign/ash-road-siege.webp', width: 384, height: 256,
    alpha: true, requiredStates: Object.freeze(['ready', 'announcing', 'disabled']),
    fallback: 'existing real tank body, barrel, warning region and canonical hull facts',
    sha256: 'a18a791d439aa7a7ffd7a4517923682e54cfa10d11e158445c55cbbdff770dcb',
    contentBounds: Object.freeze({ left: 69, top: 47, right: 316, bottom: 212 }),
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

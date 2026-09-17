import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampaignObjectState } from '@shared/campaign/objects'

interface EncounterViewport {
  readonly width: number
  readonly height: number
  readonly devicePixelRatio: number
  readonly zoom: number
}

interface EncounterHitRegion {
  readonly id: string
  readonly kind: CampaignObjectState['kind']
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

interface EncounterRenderFrame {
  readonly objectIds: readonly string[]
  readonly hitRegions: readonly EncounterHitRegion[]
  readonly assetState: 'loading' | 'ready' | 'failed'
  readonly animationPending: boolean
  readonly view: {
    readonly scale: number
    readonly offsetX: number
    readonly offsetY: number
  }
}

interface EncounterObjectRendererContract {
  draw(
    context: CanvasRenderingContext2D,
    objects: readonly CampaignObjectState[],
    viewport: EncounterViewport,
    elapsedMs?: number,
  ): EncounterRenderFrame
  reset(): void
  destroy(): void
}

type EncounterObjectRendererConstructor = new (options?: {
  readonly createImage?: () => HTMLImageElement
  readonly deferAssetLoad?: boolean
  readonly reducedMotion?: boolean
  readonly onVisualReady?: () => void
}) => EncounterObjectRendererContract

async function loadRenderer(): Promise<EncounterObjectRendererConstructor> {
  try {
    const modulePath = './EncounterObjectRenderer'
    const candidate = await import(/* @vite-ignore */ modulePath) as {
      EncounterObjectRenderer?: EncounterObjectRendererConstructor
    }
    if (typeof candidate.EncounterObjectRenderer !== 'function') {
      throw new Error('EncounterObjectRenderer export is missing')
    }
    return candidate.EncounterObjectRenderer
  } catch (error) {
    expect.fail(`EncounterObjectRenderer API is not implemented: ${String(error)}`)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function object(
  id: string,
  kind: CampaignObjectState['kind'],
  x: number,
  health: number,
): CampaignObjectState {
  const width = kind === 'supply-drum' ? 28 : 44
  const height = kind === 'supply-drum' ? 28 : 36
  const bottom = 305
  return {
    id,
    kind,
    x,
    width,
    height,
    maxHealth: kind === 'supply-drum' ? 20 : 100,
    health,
    alive: health > 0,
    collisionBounds: {
      left: x - width / 2,
      right: x + width / 2,
      top: bottom - height,
      bottom,
    },
    supportSamples: [
      { x: Math.ceil(x - width / 2), y: bottom },
      { x: Math.floor(x), y: bottom },
      { x: Math.floor(x + width / 2), y: bottom },
    ],
  }
}

const objects = Object.freeze([
  object('refinery', 'protected', 350, 61),
  object('drum-a', 'supply-drum', 715, 20),
])

function contextTrace() {
  const operations: string[] = []
  const context = {
    save: vi.fn(() => operations.push('save')),
    restore: vi.fn(() => operations.push('restore')),
    beginPath: vi.fn(() => operations.push('beginPath')),
    closePath: vi.fn(() => operations.push('closePath')),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(() => operations.push('ellipse')),
    fill: vi.fn(() => operations.push('fill')),
    stroke: vi.fn(() => operations.push('stroke')),
    fillRect: vi.fn(() => operations.push('fillRect')),
    strokeRect: vi.fn(() => operations.push('strokeRect')),
    fillText: vi.fn((text: string) => operations.push(`text:${text}`)),
    drawImage: vi.fn(() => operations.push('drawImage')),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    set fillStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set lineWidth(_value: number) {},
    set globalAlpha(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D
  return { context, operations }
}

describe('EncounterObjectRenderer campaign world authority', () => {
  it('uses art-only visual bounds while collision and hit geometry stay unchanged', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const images: HTMLImageElement[] = []
    const renderer = new EncounterObjectRenderer({
      createImage: () => {
        const image = {
          src: '', naturalWidth: 320, naturalHeight: 256, onload: null, onerror: null,
        } as unknown as HTMLImageElement
        images.push(image)
        return image
      },
      deferAssetLoad: true,
      reducedMotion: true,
    })
    const loading = renderer.draw(contextTrace().context, [objects[0]!], {
      width: 1200, height: 600, devicePixelRatio: 1, zoom: 1,
    })
    expect(loading.hitRegions[0]).toEqual({
      id: 'refinery', kind: 'protected', left: 328, right: 372, top: 269, bottom: 305,
    })
    images[0]!.onload?.(new Event('load'))

    const trace = contextTrace()
    renderer.draw(trace.context, [objects[0]!], {
      width: 1200, height: 600, devicePixelRatio: 1, zoom: 1,
    })

    expect(trace.context.drawImage).toHaveBeenCalledWith(
      images[0],
      314,
      247 + 33 / 256 * 58,
      72,
      58,
    )
    const draw = vi.mocked(trace.context.drawImage).mock.calls[0]!
    const opaqueBottom = Number(draw[2]) + (223 / 256) * Number(draw[4])
    expect(opaqueBottom).toBeCloseTo(objects[0]!.collisionBounds.bottom, 8)
    expect(trace.operations).not.toContain('strokeRect')
    expect(trace.operations).toContain('ellipse')
    expect(trace.operations).toContain('text:REFINERY · 61')
    renderer.destroy()
  })

  it('lets the aggregate Renderer defer campaign art until the first campaign draw', async () => {
    const assignedSources: string[] = []
    class TrackingImage {
      onload: ((event: Event) => unknown) | null = null
      onerror: ((event: Event | string) => unknown) | null = null
      naturalWidth = 0
      naturalHeight = 0
      private source = ''
      set src(value: string) {
        this.source = value
        assignedSources.push(value)
      }
      get src(): string { return this.source }
    }
    vi.stubGlobal('Image', TrackingImage)
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(contextTrace().context as never)
    const { Renderer } = await import('./Renderer')

    const aggregateRenderer = new Renderer(canvas)

    expect(assignedSources.some((source) => source.includes('ash-road-drum'))).toBe(false)
    expect((aggregateRenderer as unknown as {
      encounterObjectVisualInvalidated: boolean
    }).encounterObjectVisualInvalidated).toBe(false)

    const EncounterObjectRenderer = await loadRenderer()
    const createImage = vi.fn(() => new TrackingImage() as unknown as HTMLImageElement)
    const renderer = new EncounterObjectRenderer({ createImage, deferAssetLoad: true })
    expect(createImage).not.toHaveBeenCalled()
    renderer.draw(contextTrace().context, objects, {
      width: 1200,
      height: 600,
      devicePixelRatio: 1,
      zoom: 1,
    })
    expect(createImage).toHaveBeenCalledTimes(2)
    expect(assignedSources.some((source) => source.includes('ash-road-drum'))).toBe(true)
    expect(assignedSources.some((source) => source.includes('ash-road-refinery'))).toBe(true)
    renderer.destroy()
  })

  it('does not request decoration for wreck-only campaign frames', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const createImage = vi.fn(() => ({
      src: '', naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null,
    }) as unknown as HTMLImageElement)
    const renderer = new EncounterObjectRenderer({ createImage, deferAssetLoad: true })
    const wrecks = objects.map((entry) => ({ ...entry, health: 0, alive: false }))

    const frame = renderer.draw(contextTrace().context, wrecks, {
      width: 1200, height: 600, devicePixelRatio: 1, zoom: 1,
    })

    expect(createImage).not.toHaveBeenCalled()
    expect(frame.animationPending).toBe(false)

    const { Renderer } = await import('./Renderer')
    const aggregate = Object.assign(Object.create(Renderer.prototype), {
      battlefieldBackdrop: { isSettled: true },
      worldAtmosphere: { isActive: false },
      explosionArt: { isSettled: true },
      terrain: { isMaterialSettled: true },
      encounterObjects: { isSettled: false, hasDecorativeMotion: () => true },
      encounterObjectVisualInvalidated: true,
      tanks: { isChassisArtSettled: true },
      tankArtInvalidated: false,
      bursts: [], scorches: [], wallContacts: [],
      shake: 0, kickX: 0, kickY: 0, effectsBusy: 0,
      prevMobilityPoses: new Map(), mobilityEffects: { isActive: false },
      tankRecoil: null, windGust: null,
    }) as { isAnimating(state: import('@shared/types/GameState').GameState): boolean }
    const wreckOnlyState = {
      phase: 'PLAYER_TURN', tanks: [], projectiles: [], fire: [],
      campaign: { objects: wrecks },
    } as unknown as import('@shared/types/GameState').GameState
    expect(aggregate.isAnimating(wreckOnlyState)).toBe(false)
    renderer.destroy()
  })

  it('keeps canonical object IDs on Canvas-owned hit geometry', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const renderer = new EncounterObjectRenderer()
    const frame = renderer.draw(contextTrace().context, objects, {
      width: 1200,
      height: 600,
      devicePixelRatio: 1,
      zoom: 1,
    })

    expect(frame.objectIds).toEqual(['refinery', 'drum-a'])
    expect(frame.hitRegions).toEqual([
      { id: 'refinery', kind: 'protected', left: 328, right: 372, top: 269, bottom: 305 },
      { id: 'drum-a', kind: 'supply-drum', left: 701, right: 729, top: 277, bottom: 305 },
    ])
    renderer.destroy()
  })

  it('projects deterministic finite geometry for responsive viewports and bounded zoom', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const renderer = new EncounterObjectRenderer()
    const viewports = [
      { width: 1200, height: 600, devicePixelRatio: 1, zoom: 1 },
      { width: 720, height: 360, devicePixelRatio: 2, zoom: 1.25 },
      { width: 320, height: 180, devicePixelRatio: 3, zoom: 99 },
    ] as const

    const first = viewports.map((viewport) =>
      renderer.draw(contextTrace().context, objects, viewport))
    const second = viewports.map((viewport) =>
      renderer.draw(contextTrace().context, objects, viewport))

    expect(second.map(({ view, hitRegions }) => ({ view, hitRegions })))
      .toEqual(first.map(({ view, hitRegions }) => ({ view, hitRegions })))
    first.forEach((frame, index) => {
      const viewport = viewports[index]!
      const fitScale = Math.min(viewport.width / 1200, viewport.height / 600)
      expect(Object.values(frame.view).every(Number.isFinite)).toBe(true)
      expect(frame.view.scale).toBeGreaterThan(0)
      expect(frame.view.scale).toBeLessThanOrEqual(fitScale * 2)
      for (const bounds of frame.hitRegions) {
        expect(bounds.left).toBeLessThan(bounds.right)
        expect(bounds.top).toBeLessThan(bounds.bottom)
        expect(Object.values(bounds).filter((value) => typeof value === 'number')
          .every(Number.isFinite)).toBe(true)
      }
    })
    renderer.destroy()
  })

  it('keeps code-native objects visible with failed assets and suppresses only nonessential reduced-motion work', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const images: HTMLImageElement[] = []
    const renderer = new EncounterObjectRenderer({
      createImage: () => {
        const image = {
          src: '', naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null,
        } as unknown as HTMLImageElement
        images.push(image)
        return image
      },
      reducedMotion: true,
    })
    for (const image of images) image.onerror?.(new Event('error'))
    const trace = contextTrace()
    const frame = renderer.draw(trace.context, objects, {
      width: 600,
      height: 300,
      devicePixelRatio: 2,
      zoom: 1,
    }, 2_000)

    expect(frame.assetState).toBe('failed')
    expect(frame.animationPending).toBe(false)
    expect(frame.objectIds).toEqual(['refinery', 'drum-a'])
    expect(trace.operations).not.toContain('drawImage')
    expect(trace.operations.some((operation) =>
      operation === 'fillRect' || operation === 'strokeRect' || operation === 'fill')).toBe(true)
    expect(trace.operations).toContain('text:REFINERY · 61')
    expect(trace.operations).toContain('text:SUPPLY · 20')
    renderer.destroy()
  })

  it('settles decorative motion after a finite generation budget and re-arms on reset', async () => {
    const EncounterObjectRenderer = await loadRenderer()
    const image = {
      src: '',
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null,
      onerror: null,
    } as unknown as HTMLImageElement
    const renderer = new EncounterObjectRenderer({ createImage: () => image })
    const viewport = { width: 1200, height: 600, devicePixelRatio: 1, zoom: 1 }

    const frames = Array.from({ length: 25 }, () =>
      renderer.draw(contextTrace().context, objects, viewport))

    expect(frames.slice(0, 24).every((frame) => frame.animationPending)).toBe(true)
    expect(frames[24]?.animationPending).toBe(false)
    renderer.reset()
    expect(renderer.draw(contextTrace().context, objects, viewport).animationPending).toBe(true)
    renderer.destroy()
  })
})

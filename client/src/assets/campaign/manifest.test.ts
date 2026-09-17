// @vitest-environment node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ASH_ROAD_CAMPAIGN_ASSETS } from './manifest'

describe('Ash Road art manifest', () => {
  it('binds every required art family and state to exact shipped bytes and fallbacks', async () => {
    expect(ASH_ROAD_CAMPAIGN_ASSETS.map(({ id }) => id)).toEqual([
      'drum', 'refinery', 'relay', 'cache', 'siege', 'panorama',
    ])
    expect(new Set(ASH_ROAD_CAMPAIGN_ASSETS.flatMap(({ requiredStates }) => requiredStates))).toEqual(
      new Set([
        'intact', 'damaged', 'destroyed/debris', 'failed', 'active', 'disabled',
        'destroyed', 'ready', 'announcing', 'chapter-backdrop',
      ]),
    )
    for (const entry of ASH_ROAD_CAMPAIGN_ASSETS) {
      const file = path.resolve(process.cwd(), 'public', entry.path)
      const bytes = await readFile(file)
      const metadata = await sharp(bytes).metadata()
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
      expect(metadata).toMatchObject({
        format: 'webp', width: entry.width, height: entry.height, hasAlpha: entry.alpha,
      })
      expect(entry.fallback.length).toBeGreaterThan(20)
    }
  })

  it('keeps wide object padding transparent instead of painting black world-space boxes', async () => {
    const padding = new Map([['refinery', 32], ['cache', 32], ['siege', 64]])
    for (const entry of ASH_ROAD_CAMPAIGN_ASSETS.filter(({ id }) => padding.has(id))) {
      const file = path.resolve(process.cwd(), 'public', entry.path)
      const decoded = await sharp(await readFile(file)).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true })
      const inset = padding.get(entry.id)!
      for (let y = 0; y < decoded.info.height; y += 1) {
        for (let x = 0; x < decoded.info.width; x += 1) {
          if (x >= inset && x < decoded.info.width - inset) continue
          expect(decoded.data[(y * decoded.info.width + x) * 4 + 3]).toBe(0)
        }
      }
    }
  })

  it('records the actual opaque footprint used to ground every world object', async () => {
    for (const entry of ASH_ROAD_CAMPAIGN_ASSETS.filter(({ id }) => id !== 'panorama')) {
      expect('contentBounds' in entry).toBe(true)
      if (!('contentBounds' in entry)) throw new Error(`${entry.id} has no content bounds`)
      const file = path.resolve(process.cwd(), 'public', entry.path)
      const decoded = await sharp(await readFile(file)).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true })
      const { width, height } = decoded.info
      let minX = width
      let minY = height
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (decoded.data[(y * width + x) * 4 + 3]! < 8) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
      expect(entry.contentBounds).toEqual({
        left: minX,
        top: minY,
        right: maxX + 1,
        bottom: maxY + 1,
      })
    }
  })
})

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
})

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const TARGETS = Object.freeze([
  Object.freeze({ file: 'ash-road-refinery.webp', horizontalPadding: 32 }),
  Object.freeze({ file: 'ash-road-cache.webp', horizontalPadding: 32 }),
  Object.freeze({ file: 'ash-road-siege.webp', horizontalPadding: 64 }),
])

const root = path.resolve(import.meta.dirname, '..', '..', 'client', 'public', 'art', 'campaign')

for (const target of TARGETS) {
  const file = path.join(root, target.file)
  const source = await readFile(file)
  const decoded = await sharp(source).ensureAlpha().toColourspace('srgb')
    .raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = decoded.info
  let changed = false
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= target.horizontalPadding && x < width - target.horizontalPadding) continue
      const offset = (y * width + x) * channels
      if (decoded.data[offset + 3] === 0) continue
      decoded.data.fill(0, offset, offset + 4)
      changed = true
    }
  }
  if (!changed) {
    console.log(`${target.file}: padding already transparent`)
    continue
  }
  const output = await sharp(decoded.data, { raw: { width, height, channels } })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer()
  await writeFile(file, output)
  console.log(`${target.file}: cleared ${target.horizontalPadding}px horizontal padding`)
}

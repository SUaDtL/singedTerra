import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { verifySeedChallengeCompatibility } from './seed_challenge_compatibility.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'st1-compat-'))
  const files = {
    'shared/src/engine/Engine.ts': 'export const engine = 1\n',
    'shared/src/types/Game.ts': 'export interface Game {}\n',
    'client/src/main.ts': 'export const driver = 1\n',
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  const manifest = {
    schemaVersion: 1,
    challengeVersion: 'ST1',
    hashNormalization: 'utf8-lf',
    disposition: 'initial-st1-contract-reviewed',
    recursiveDirectories: ['shared/src/engine', 'shared/src/types'],
    explicitFiles: ['client/src/main.ts'],
    sources: Object.entries(files).map(([sourcePath, content]) => ({
      path: sourcePath,
      sha256: digest(content),
    })).sort((a, b) => a.path.localeCompare(b.path)),
  }
  return { root, manifest }
}

test('accepts exact sorted membership and source hashes', async (t) => {
  const { root, manifest } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await assert.doesNotReject(verifySeedChallengeCompatibility(root, manifest))
})

test('rejects added or deleted behavior-source membership', async (t) => {
  const { root, manifest } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'shared/src/engine/NewRule.ts'), 'export const changed = true\n')
  await assert.rejects(
    verifySeedChallengeCompatibility(root, manifest),
    /ST1 source membership drift.*shared\/src\/engine\/NewRule\.ts/,
  )
  await rm(path.join(root, 'shared/src/engine/NewRule.ts'))
  await rm(path.join(root, 'shared/src/types/Game.ts'))
  await assert.rejects(
    verifySeedChallengeCompatibility(root, manifest),
    /ST1 source membership drift.*shared\/src\/types\/Game\.ts/,
  )
})

test('rejects source hash drift and malformed manifest ordering', async (t) => {
  const { root, manifest } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'client/src/main.ts'), 'export const driver = 2\n')
  await assert.rejects(
    verifySeedChallengeCompatibility(root, manifest),
    /ST1 source hash drift.*client\/src\/main\.ts/,
  )
  const reversed = { ...manifest, sources: [...manifest.sources].reverse() }
  await assert.rejects(
    verifySeedChallengeCompatibility(root, reversed),
    /ST1 manifest sources must be sorted/,
  )
  await assert.rejects(
    verifySeedChallengeCompatibility(root, { ...manifest, explicitFiles: ['../outside.ts'] }),
    /unsafe source path/,
  )
})

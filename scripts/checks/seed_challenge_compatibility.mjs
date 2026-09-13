import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const slash = (value) => value.replaceAll('\\', '/')
const sortPaths = (values) => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === slash(value)
    && !path.posix.isAbsolute(value)
    && !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

async function productionSourceFiles(repoRoot, relativeDirectory) {
  const found = []
  async function visit(relative) {
    const absolute = path.join(repoRoot, relative)
    const entries = await readdir(absolute, { withFileTypes: true })
    for (const entry of entries) {
      const child = slash(path.posix.join(slash(relative), entry.name))
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile()
        && !entry.name.endsWith('.test.ts')
        && !entry.name.endsWith('.spec.ts')) found.push(child)
    }
  }
  await visit(relativeDirectory)
  return found
}

async function manifestMembership(repoRoot, manifest) {
  const recursive = await Promise.all(
    manifest.recursiveDirectories.map((directory) => productionSourceFiles(repoRoot, directory)),
  )
  return sortPaths([...new Set([...recursive.flat(), ...manifest.explicitFiles.map(slash)])])
}

async function sha256File(absolutePath) {
  const normalized = (await readFile(absolutePath, 'utf8')).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.challengeVersion !== 'ST1'
    || manifest.hashNormalization !== 'utf8-lf') {
    throw new Error('ST1 compatibility manifest schema/version is invalid')
  }
  if (typeof manifest.disposition !== 'string' || manifest.disposition.length === 0) {
    throw new Error('ST1 compatibility manifest requires a reviewed disposition')
  }
  if (!Array.isArray(manifest.recursiveDirectories)
    || !Array.isArray(manifest.explicitFiles)
    || !Array.isArray(manifest.sources)) {
    throw new Error('ST1 compatibility manifest membership is invalid')
  }
  const membershipPaths = [
    ...manifest.recursiveDirectories,
    ...manifest.explicitFiles,
    ...manifest.sources.map((source) => source?.path),
  ]
  if (!membershipPaths.every(safeRelativePath)) {
    throw new Error('ST1 compatibility manifest contains an unsafe source path')
  }
  const sourcePaths = manifest.sources.map((source) => source.path)
  const sorted = sortPaths(sourcePaths)
  if (sourcePaths.some((sourcePath, index) => sourcePath !== sorted[index])) {
    throw new Error('ST1 manifest sources must be sorted')
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    throw new Error('ST1 manifest sources must be unique')
  }
}

/** Verify exact membership before hashes so a newly added behavior input cannot escape review. */
export async function verifySeedChallengeCompatibility(repoRoot, manifest) {
  validateManifest(manifest)
  const admitted = manifest.sources.map((source) => slash(source.path))
  const current = await manifestMembership(repoRoot, manifest)
  const admittedSet = new Set(admitted)
  const currentSet = new Set(current)
  const added = current.filter((sourcePath) => !admittedSet.has(sourcePath))
  const missing = admitted.filter((sourcePath) => !currentSet.has(sourcePath))
  if (added.length > 0 || missing.length > 0) {
    throw new Error(`ST1 source membership drift; added=[${added.join(',')}]; missing=[${missing.join(',')}]`)
  }
  for (const source of manifest.sources) {
    if (!/^[0-9a-f]{64}$/.test(source.sha256)) {
      throw new Error(`ST1 manifest hash is invalid: ${source.path}`)
    }
    const actual = await sha256File(path.join(repoRoot, source.path))
    if (actual !== source.sha256) {
      throw new Error(`ST1 source hash drift: ${slash(source.path)}`)
    }
  }
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url)
  const repoRoot = path.resolve(path.dirname(scriptPath), '..', '..')
  const manifestPath = path.join(repoRoot, 'docs', 'compatibility', 'st1-source-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await verifySeedChallengeCompatibility(repoRoot, manifest)
  process.stdout.write(`ST1 compatibility PASS (${manifest.sources.length} bound sources)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

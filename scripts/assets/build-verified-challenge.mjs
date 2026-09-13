import { build } from 'vite'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { RETAINED_ENTRY_ID, RETAINED_ENTRY, retainedViteConfig } from './verified-challenge.vite.config.mjs'

const toolRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const OUTPUT = 'shared/src/verified/retained/'
const SCHEMA = 'singedterra-retained-challenge/v1'
const EXPORTS = ['artifactApiVersion', 'catalog', 'createController', 'editionId', 'replayWithWork', 'workLimits']
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const lf = (source) => source.replace(/\r\n?/g, '\n')
const json = (value) => JSON.stringify(value, null, 2) + '\n'
const posix = (path) => path.replaceAll('\\', '/')
const fail = (message) => { throw new Error(message) }

// These type-only renderer seams never become runtime imports. The retained
// controller/result contract is declared here rather than aliasing a current class.
export const DECLARATION = `// Generated retained cq1 API. Runtime is self-contained; MIT, singedTerra contributors.
import type { GameState, GamePhase } from '../../types/GameState.ts';
export type HumanAction = { readonly type: 'set_angle'; readonly angle: number }
  | { readonly type: 'set_power'; readonly power: number } | { readonly type: 'fire' };
export interface HumanFire { readonly angle: number; readonly power: number }
export type Terminal = 'objective_cleared' | 'terminal_without_clear' | 'objective_not_cleared' | 'work_limit';
export type WorkKind = 'engineTicks' | 'cpuProbes' | 'cpuCandidates' | 'sweepSegments' | 'sweepSamples'
  | 'collisionChecks' | 'terrainCells' | 'terrainSteps' | 'engineSteps' | 'allocatedBytes' | 'copiedBytes' | 'totalUnits';
export type Work = Readonly<Record<WorkKind, number>>;
export type Event = Readonly<{ type: 'salvo_settled'; actor: 'human' | 'cpu'; salvo: number; ticks: number;
  humanHealth: number; cpuHealth: number; damageToCpu: number; phase: GamePhase }>
  | Readonly<{ type: 'cpu_selected'; salvo: number; angle: number; power: number; probeCount: number;
    simulationTicks: number; coarseBest: HumanFire }> | Readonly<{ type: 'terminal'; terminal: Terminal }>;
export interface Result {
  readonly editionId: 'cq1'; readonly seed: 42; readonly terminal: Terminal;
  readonly humanSalvos: number; readonly cpuSalvos: number; readonly humanHealth: number; readonly cpuHealth: number;
  readonly liveTicks: number; readonly cpuSimulationTicks: number; readonly maximumProbeCount: number;
  readonly transcript: readonly HumanFire[]; readonly events: readonly Event[];
}
export interface Controller {
  readonly complete: boolean; readonly awaitingHuman: boolean; readonly transcript: readonly HumanFire[];
  readonly events: readonly Event[]; readonly work: Work;
  /** Detached snapshot; typed-array storage is independent of the engine. Null after work refusal. */
  getState(): Readonly<GameState> | null;
  applyHumanAction(action: HumanAction): boolean; tick(): void; result(): Result;
}
export declare const artifactApiVersion: 1;
export declare const editionId: 'cq1';
export declare const catalog: Readonly<{ editionId: 'cq1'; trialId: 'crosswind-qualification';
  entitlementId: 'crosswind-qualification'; descriptorVersion: 1; objectiveVersion: 1;
  verifierArtifactId: 'cq1'; cpuPolicyId: 'cq1-hard-v3'; rewardVersion: 1; seed: 42;
  reward: Readonly<{ medalId: 'crosswind-qualification'; xp: 200 }>;
  rules: Readonly<{ maxPlayers: 2; humanSeat: 0; rounds: 1; walls: 'wrap'; hazards: 'none'; gravity: 0.15;
    maxWind: 6; interestRate: 0; suddenDeathTurn: 0; teamMode: false; armsLevel: 0;
    starterWeaponFalloff: 'decisive'; weapon: 'baby_missile' }>;
  limits: Readonly<{ humanSalvos: 3; cpuSalvos: 3; angle: Readonly<{min:0;max:180}>;
    power: Readonly<{min:0;max:100}>; sessionSeconds:1800; computeAttempts:3 }> }>;
export declare const workLimits: Work;
export declare function createController(): Controller;
export declare function replayWithWork(transcript: unknown): Readonly<{ result: Result; work: Work }>;
`

function inspect(source, path, emitted = false) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, emitted ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) fail(`forbidden retained syntax: ${path}`)
  const forbiddenGlobals = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'Deno', 'process', 'require', 'eval', 'Function', 'setTimeout', 'setInterval', 'globalThis', 'window', 'self', 'performance'])
  if (emitted) forbiddenGlobals.add('Date')
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        const specifier = node.moduleSpecifier
        if (emitted || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.') || !specifier.text.endsWith('.ts'))
          fail(`forbidden retained import: ${path}`)
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) fail(`forbidden retained dynamic import: ${path}`)
    if (ts.isMetaProperty(node)) fail(`forbidden retained import meta: ${path}`)
    if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) fail(`forbidden retained global ${node.text}: ${path}`)
    if (ts.isElementAccessExpression(node) && ['Math', 'Date'].includes(node.expression.getText(ast)))
      fail(`forbidden retained computed clock/random access: ${path}`)
    if (ts.isPropertyAccessExpression(node) && ((node.expression.getText(ast) === 'Math' && node.name.text === 'random')
      || (node.expression.getText(ast) === 'Date' && node.name.text === 'now')))
      fail(`forbidden retained clock/random: ${path}`)
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'Date' && !node.arguments?.length)
      fail(`forbidden retained clock: ${path}`)
    ts.forEachChild(node, visit)
  }
  visit(ast)
}

function inventoryDigest(manifest) {
  const { integrity, ...body } = manifest
  return sha256(json(body))
}

function registryCode(manifest) {
  return `// Reviewed static allowlist. Digests identify content; they are not credentials.
import * as cq1 from './retained/cq1.mjs';
export const CQ1_ARTIFACT_SHA256 = '${manifest.artifact.sha256}';
export const CQ1_MANIFEST_INTEGRITY = '${manifest.integrity}';
const retainedCq1 = Object.freeze({ ...cq1, sha256: CQ1_ARTIFACT_SHA256 });
export function getVerifiedChallengeArtifact(editionId: unknown): typeof retainedCq1 {
  if (editionId !== 'cq1') throw new Error('unsupported_verified_challenge_artifact');
  return retainedCq1;
}
`
}

export async function buildCandidate({ root = toolRoot } = {}) {
  root = await realpath(root)
  const sources = new Map()
  let renderedModules = []
  const plugin = {
    name: 'singedterra-retained-closure', enforce: 'pre',
    async resolveId(id, importer) {
      if (id === RETAINED_ENTRY_ID || id === resolve(root, RETAINED_ENTRY_ID) || id === posix(resolve(root, RETAINED_ENTRY_ID))) return RETAINED_ENTRY_ID
      if (!id.startsWith('.') && !isAbsolute(id)) fail(`forbidden retained external: ${id}`)
      const resolved = await realpath(resolve(importer && importer !== RETAINED_ENTRY_ID ? dirname(importer) : root, id))
      const path = posix(relative(root, resolved))
      if (!path.startsWith('shared/src/') || path.includes('/../') || !path.endsWith('.ts')) fail(`forbidden retained source: ${path}`)
      return resolved
    },
    async load(id) {
      if (id === RETAINED_ENTRY_ID) return RETAINED_ENTRY
      const path = posix(relative(root, id))
      if (!path.startsWith('shared/src/') || !path.endsWith('.ts')) fail(`forbidden retained module: ${path}`)
      const source = lf(await readFile(id, 'utf8'))
      inspect(source, path)
      sources.set(path, { path, sha256: sha256(source) })
      return source
    },
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle)
      if (outputs.length !== 1 || outputs[0].type !== 'chunk') fail('forbidden retained extra output')
      const chunk = outputs[0]
      if (chunk.imports.length || chunk.dynamicImports.length || chunk.exports.slice().sort().join() !== EXPORTS.slice().sort().join())
        fail('forbidden retained output imports/exports')
      renderedModules = Object.keys(chunk.modules).filter((id) => id !== RETAINED_ENTRY_ID)
        .map((id) => posix(relative(root, id))).sort()
    },
  }
  const built = await build(retainedViteConfig(root, plugin))
  if (Array.isArray(built) && built.length !== 1) fail('forbidden retained output shape')
  const output = Array.isArray(built) ? built[0] : built
  if (!output.output || output.output.length !== 1) fail('forbidden retained output shape')
  // Bundler region comments contain filesystem-dependent display paths only.
  // Drop them without touching authored comments or executable statements.
  const bundled = lf(output.output[0].code).replace(/^\/\/#(?:end)?region.*\n/gm, '')
  const code = '// Generated retained cq1; MIT, singedTerra contributors. Do not regenerate in normal builds.\n' + bundled
  inspect(code, 'cq1.mjs', true)
  const sourceInputs = [...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const generatorInputs = await Promise.all(['scripts/assets/build-verified-challenge.mjs', 'scripts/assets/verified-challenge.vite.config.mjs']
    .map(async (path) => ({ path, sha256: sha256(lf(await readFile(resolve(toolRoot, path), 'utf8'))) })))
  const configurationInputs = []
  for (const path of ['package-lock.json', 'package.json', 'client/package.json', 'tsconfig.base.json', 'shared/tsconfig.json']) {
    try { configurationInputs.push({ path, sha256: sha256(lf(await readFile(resolve(root, path), 'utf8'))) }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const manifest = {
    schema: SCHEMA, editionId: 'cq1', artifactApiVersion: 1,
    artifact: { path: OUTPUT + 'cq1.mjs', sha256: sha256(code), bytes: Buffer.byteLength(code) },
    declaration: { path: OUTPUT + 'cq1.d.mts', sha256: sha256(DECLARATION) },
    sourceNormalization: 'UTF-8 with CRLF/CR normalized to LF; no other normalization',
    sourceInputs, renderedModules, generatorInputs, configurationInputs,
    entrySha256: sha256(RETAINED_ENTRY), exports: EXPORTS,
    tools: { node: process.version, vite: require('vite/package.json').version, rolldown: require('rolldown/package.json').version, typescript: ts.version },
    license: 'MIT; singedTerra contributors; generated from one authored engine, no third-party runtime modules',
  }
  manifest.integrity = inventoryDigest(manifest)
  return { code, declaration: DECLARATION, manifest, registry: registryCode(manifest) }
}

export async function freezeCandidate({ root = toolRoot, candidate } = {}) {
  const directory = resolve(root, OUTPUT)
  const paths = ['cq1.mjs', 'cq1.d.mts', 'cq1.manifest.json'].map((file) => resolve(directory, file))
  paths.push(resolve(root, 'shared/src/verified/challengeArtifacts.ts'))
  for (const path of paths) {
    try { await stat(path); fail('already retained: cq1 cannot be overwritten') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await mkdir(directory, { recursive: true })
  // Exclusive creation never replaces reviewed bytes, even on a concurrent freeze.
  await writeFile(paths[0], candidate.code, { flag: 'wx' })
  await writeFile(paths[1], candidate.declaration, { flag: 'wx' })
  await writeFile(paths[2], json(candidate.manifest), { flag: 'wx' })
  await writeFile(paths[3], candidate.registry, { flag: 'wx' })
  return verifyRetained({ root })
}

export async function verifyRetained({ root = toolRoot } = {}) {
  let manifest, code, declaration, registry
  try {
    manifest = JSON.parse(await readFile(resolve(root, OUTPUT + 'cq1.manifest.json'), 'utf8'))
    code = await readFile(resolve(root, OUTPUT + 'cq1.mjs'))
    declaration = await readFile(resolve(root, OUTPUT + 'cq1.d.mts'))
    registry = await readFile(resolve(root, 'shared/src/verified/challengeArtifacts.ts'), 'utf8')
  } catch (error) { if (error.code === 'ENOENT') fail('missing retained cq1 artifact'); throw error }
  if (manifest.schema !== SCHEMA || manifest.editionId !== 'cq1' || manifest.artifactApiVersion !== 1
    || manifest.artifact?.path !== OUTPUT + 'cq1.mjs' || manifest.declaration?.path !== OUTPUT + 'cq1.d.mts'
    || manifest.integrity !== inventoryDigest(manifest)) fail('retained manifest integrity mismatch')
  const paths = manifest.sourceInputs?.map((input) => input.path)
  if (!paths?.length || new Set(paths).size !== paths.length || paths.some((path) => !/^shared\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/.test(path))
    || manifest.sourceInputs.some((input) => !/^[a-f0-9]{64}$/.test(input.sha256))
    || manifest.renderedModules.some((path) => !paths.includes(path))) fail('retained source inventory mismatch')
  if (sha256(code) !== manifest.artifact.sha256 || code.length !== manifest.artifact.bytes) fail('retained artifact hash mismatch')
  if (sha256(declaration) !== manifest.declaration.sha256) fail('retained declaration hash mismatch')
  if (lf(registry) !== registryCode(manifest)) fail('retained registry binding mismatch')
  inspect(code.toString('utf8'), 'cq1.mjs', true)
  return manifest
}

export async function reproduceRetained({ root = toolRoot } = {}) {
  const frozen = await verifyRetained({ root })
  const candidate = await buildCandidate({ root })
  if (json(frozen) !== json(candidate.manifest)) fail('retained reproduction mismatch: current source/tools differ from frozen provenance')
  return frozen
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length && !['--verify', '--reproduce', '--generate=cq1'].includes(args[0]))) fail('unsupported retained build arguments')
  const manifest = args[0] === '--generate=cq1' ? await freezeCandidate({ candidate: await buildCandidate() })
    : args[0] === '--reproduce' ? await reproduceRetained() : await verifyRetained()
  console.log(`retained cq1 ${args[0] ?? '--verify'}: PASS ${manifest.artifact.sha256}`)
}

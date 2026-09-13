import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCandidate, freezeCandidate, verifyRetained, reproduceRetained } from './build-verified-challenge.mjs'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'singedterra-retained-test-'))
  try {
    await mkdir(join(root, 'shared/src/net'), { recursive: true })
    await writeFile(join(root, 'shared/src/net/verifiedChallengeController.ts'), `
      import { answer } from './answer.ts';
      export class VerifiedChallengeController { static create() { return { answer }; } }
      export const replayVerifiedChallengeWithWork = () => ({ result: answer, work: {} });
    `)
    await writeFile(join(root, 'shared/src/net/answer.ts'), 'export const answer = 42;\n')
    await writeFile(join(root, 'shared/src/net/verifiedChallenge.ts'), 'export const VERIFIED_CHALLENGE_CQ1 = Object.freeze({editionId:"cq1"});\n')
    await writeFile(join(root, 'shared/src/net/verifiedChallengeWorkLimits.ts'), 'export const VERIFIED_CHALLENGE_WORK_LIMITS = Object.freeze({engineTicks:1});\n')
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('generation is deterministic, closed, and explicit; verification never rewrites', async () => fixture(async (root) => {
  await assert.rejects(verifyRetained({ root }), /missing retained/)
  const first = await buildCandidate({ root })
  const second = await buildCandidate({ root })
  assert.deepEqual(first, second)
  assert.ok(first.manifest.sourceInputs.some(({ path }) => path.endsWith('/answer.ts')))
  assert.ok(!first.code.includes('import '))
  await freezeCandidate({ root, candidate: first })
  await verifyRetained({ root })
  await reproduceRetained({ root })
  await assert.rejects(freezeCandidate({ root, candidate: first }), /already retained/)
  const output = join(root, 'shared/src/verified/retained/cq1.mjs')
  await writeFile(output, first.code + '\n// tampered\n')
  await assert.rejects(verifyRetained({ root }), /artifact hash/)
  assert.equal(await readFile(output, 'utf8'), first.code + '\n// tampered\n')
}))

test('changed current source cannot rewrite retained bytes; explicit reproduction reports drift', async () => fixture(async (root) => {
  await freezeCandidate({ root, candidate: await buildCandidate({ root }) })
  await writeFile(join(root, 'shared/src/net/answer.ts'), 'export const answer = 99;\n')
  await verifyRetained({ root })
  await assert.rejects(reproduceRetained({ root }), /retained reproduction mismatch/)
}))

test('same source in different absolute directories generates identical bytes and provenance', async () => fixture(async (root) => {
  const first = await buildCandidate({ root })
  await fixture(async (otherRoot) => assert.deepEqual(await buildCandidate({ root: otherRoot }), first))
}))

test('external and dynamic imports fail before a retained artifact is written', async () => fixture(async (root) => {
  for (const source of [
    'import "https://example.invalid/physics.js"; export const answer=1;',
    'import "node:fs"; export const answer=1;',
    'export const answer=import("./hidden.ts");',
    'export const answer=Date.now();',
    'export const answer=Math["random"]();',
    'export const answer=Date["now"]();',
  ]) {
    await writeFile(join(root, 'shared/src/net/answer.ts'), source)
    await assert.rejects(buildCandidate({ root }), /forbidden retained/)
  }
}))

test('added or missing runtime dependencies and missing artifacts fail closed', async () => fixture(async (root) => {
  const candidate = await buildCandidate({ root })
  await freezeCandidate({ root, candidate })
  await writeFile(join(root, 'shared/src/net/extra.ts'), 'export const extra = 1;\n')
  await writeFile(join(root, 'shared/src/net/answer.ts'), 'import { extra } from "./extra.ts"; export const answer = 42 + extra;\n')
  const expanded = await buildCandidate({ root })
  assert.ok(expanded.manifest.sourceInputs.some(({ path }) => path.endsWith('/extra.ts')))
  await assert.rejects(reproduceRetained({ root }), /retained reproduction mismatch/)
  await rm(join(root, 'shared/src/net/extra.ts'))
  await assert.rejects(buildCandidate({ root }), /ENOENT|no such file/i)
  await verifyRetained({ root })
  const registry = join(root, 'shared/src/verified/challengeArtifacts.ts')
  await writeFile(registry, candidate.registry + '\nexport const fallback = true;\n')
  await assert.rejects(verifyRetained({ root }), /registry binding/)
  await writeFile(registry, candidate.registry)
  await rm(join(root, 'shared/src/verified/retained/cq1.mjs'))
  await assert.rejects(verifyRetained({ root }), /missing retained/)
}))

test('manifest source membership and declaration changes fail closed', async () => fixture(async (root) => {
  const candidate = await buildCandidate({ root })
  await freezeCandidate({ root, candidate })
  const manifestPath = join(root, 'shared/src/verified/retained/cq1.manifest.json')
  for (const sourceInputs of [candidate.manifest.sourceInputs.slice(1), [...candidate.manifest.sourceInputs, candidate.manifest.sourceInputs[0]]]) {
    await writeFile(manifestPath, JSON.stringify({ ...candidate.manifest, sourceInputs }))
    await assert.rejects(verifyRetained({ root }), /manifest integrity|source inventory/)
  }
  await writeFile(manifestPath, JSON.stringify(candidate.manifest))
  await writeFile(join(root, 'shared/src/verified/retained/cq1.d.mts'), 'export const anything: any;\n')
  await assert.rejects(verifyRetained({ root }), /declaration hash/)
}))

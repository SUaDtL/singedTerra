// Runtime/dependency contract guard.
//
// Keeps the Node runtime, Node type surface, and the two Supabase execution
// contexts aligned. A browser-only Dependabot bump must not silently leave the
// Edge Function client behind.
//
// Run: npx tsx scripts/checks/dependency_contract.mjs

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const rootPackage = readJson('package.json')
const clientPackage = readJson('client/package.json')
const nodeVersion = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim()
const edgeSource = readFileSync(
  resolve(root, 'supabase/functions/_shared/mod.ts'),
  'utf8',
)
const ciWorkflow = readFileSync(
  resolve(root, '.github/workflows/ci.yml'),
  'utf8',
)

const assertions = []
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
  assertions.push(message)
}

const checkJobPattern =
  /^  check:\s*$([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\s*$|(?![\s\S]))/m
const checkJobMatch = ciWorkflow.match(checkJobPattern)
const checkJobSteps = (checkJobMatch?.[1] ?? '')
  .split(/(?=^      - )/m)
  .filter((step) => /^      - /m.test(step))
const installStepIndex = checkJobSteps.findIndex((step) =>
  /^      - run: npm ci\s*$/m.test(step),
)
const auditStepIndex = checkJobSteps.findIndex((step) =>
  /^        run: npm run audit:deps\s*$/m.test(step),
)
const installStep = checkJobSteps[installStepIndex] ?? ''
const auditStep = checkJobSteps[auditStepIndex] ?? ''

assert(nodeVersion === '24.18.0', '.nvmrc selects supported Node 24.18.0')
assert(
  rootPackage.engines?.node === '>=24.15.0 <25',
  'package engines enforce the Node 24.15 compatibility floor',
)
assert(
  /^\^24\./.test(rootPackage.devDependencies?.['@types/node'] ?? ''),
  '@types/node stays on the Node 24 line',
)
assert(
  rootPackage.scripts?.['audit:deps'] === 'npm audit --audit-level=high',
  'root exposes the complete high-severity dependency audit',
)
assert(
  'jobs:\n  check:\n    runs-on: ubuntu-latest\n'.match(checkJobPattern)?.[1]
    .includes('runs-on: ubuntu-latest') === true,
  'workflow parser accepts the primary job at end of file',
)
assert(
  auditStepIndex >= 0,
  'primary CI invokes the governed dependency audit',
)
assert(
  installStepIndex >= 0 && auditStepIndex > installStepIndex,
  'primary CI audits dependencies after its clean install',
)
assert(
  !/^    (?:if|continue-on-error):/m.test(checkJobMatch?.[1] ?? ''),
  'primary CI job is unconditional and blocking',
)
assert(
  !/^        (?:if|continue-on-error):/m.test(installStep),
  'primary CI clean install is unconditional and blocking',
)
assert(
  !/^        (?:if|continue-on-error):/m.test(auditStep),
  'primary CI dependency audit is unconditional and blocking',
)

const browserSupabase = clientPackage.dependencies?.['@supabase/supabase-js']
assert(
  /^\d+\.\d+\.\d+$/.test(browserSupabase ?? ''),
  'browser Supabase dependency is an exact version',
)

const edgeModule = ts.createSourceFile(
  'supabase/functions/_shared/mod.ts',
  edgeSource,
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS,
)
const edgeImports = edgeModule.statements
  .filter(ts.isImportDeclaration)
  .map((statement) => statement.moduleSpecifier)
  .filter(ts.isStringLiteral)
  .map((specifier) => specifier.text)
  .filter((specifier) => specifier.startsWith('https://esm.sh/@supabase/supabase-js@'))
const edgeMatch = edgeImports[0]?.match(
  /^https:\/\/esm\.sh\/@supabase\/supabase-js@(\d+\.\d+\.\d+)$/,
)
assert(edgeImports.length === 1, 'Edge has one live Supabase import')
assert(edgeMatch !== undefined && edgeMatch !== null, 'Edge Supabase import is exactly versioned')
assert(
  edgeMatch?.[1] === browserSupabase,
  'browser and Edge Supabase versions match',
)

for (const message of assertions) console.log(`PASS: ${message}`)
console.log(`\nDEPENDENCY CONTRACT CHECK: PASSED (${assertions.length} assertions)`)

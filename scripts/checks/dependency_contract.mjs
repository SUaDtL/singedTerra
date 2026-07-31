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

const assertions = []
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
  assertions.push(message)
}

assert(nodeVersion === '24', '.nvmrc selects Node 24')
assert(rootPackage.engines?.node === '24.x', 'package engines match Node 24')
assert(
  /^\^24\./.test(rootPackage.devDependencies?.['@types/node'] ?? ''),
  '@types/node stays on the Node 24 line',
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

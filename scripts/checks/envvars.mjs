// Env-var name drift guard for singedTerra Edge Functions.
//
// Asserts that every key read via Deno.env.get('KEY') in
// supabase/functions/_shared/mod.ts is documented in
// supabase/functions/.env.example.
//
// If a key is missing from .env.example this check exits 1, naming the
// missing key. This prevents .env.example from drifting out of sync with
// the loader (the original mismatch was SUPABASE_SECRET_KEYS vs
// SUPABASE_SERVICE_ROLE_KEY).
//
// Run: npx tsx scripts/checks/envvars.mjs

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../')

const MOD_PATH = resolve(root, 'supabase/functions/_shared/mod.ts')
const EXAMPLE_PATH = resolve(root, 'supabase/functions/.env.example')

const log = (...args) => console.log(...args)
const fail = (msg) => { failed = true; log(`FAIL: ${msg}`) }
let failed = false

// --- extract Deno.env.get('KEY') keys from mod.ts ---
const modSource = readFileSync(MOD_PATH, 'utf8')
const ENV_GET_RE = /Deno\.env\.get\(['"]([^'"]+)['"]\)/g
const loaderKeys = new Set()
let m
while ((m = ENV_GET_RE.exec(modSource)) !== null) {
  loaderKeys.add(m[1])
}

// --- extract documented variable names from .env.example ---
const exampleSource = readFileSync(EXAMPLE_PATH, 'utf8')
const exampleKeys = new Set()
for (const line of exampleSource.split('\n')) {
  const trimmed = line.trim()
  // skip blank lines and comments
  if (!trimmed || trimmed.startsWith('#')) continue
  // accept NAME= or NAME =value
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx > 0) {
    exampleKeys.add(trimmed.slice(0, eqIdx).trim())
  }
}

log(`Loader keys (Deno.env.get): ${[...loaderKeys].join(', ')}`)
log(`Example keys (.env.example): ${[...exampleKeys].join(', ')}`)

// --- assert every loader key is documented ---
for (const key of loaderKeys) {
  if (!exampleKeys.has(key)) {
    fail(`"${key}" is read by the loader but missing from .env.example`)
  }
}

if (failed) {
  log('\nenvvars: FAILED')
  process.exit(1)
} else {
  log('\nenvvars: OK')
  process.exit(0)
}

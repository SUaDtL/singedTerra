// T19 static migration/integration tripwires. Real SQL semantics and concurrency
// are tested separately by verified-challenge-database.mjs against PostgreSQL.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { catalog } from '../../shared/src/verified/retained/cq1.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const functions = ['is_valid_challenge_transcript', 'challenge_utc', 'reject_challenge_evidence_mutation',
  'guard_challenge_session', 'reconcile_verified_challenge', 'set_verified_challenge_starts', 'start_verified_challenge',
  'challenge_receipt_json', 'get_verified_challenge', 'abandon_verified_challenge', 'acquire_verification_compute_lease',
  'verification_compute_lease_is_current', 'complete_verified_deployment_fenced', 'release_verification_compute_lease',
  'verified_career_ledger_snapshot', 'finalize_verified_challenge', 'reject_verified_challenge'].sort()
const tables = ['verified_challenge_catalog', 'verified_challenge_controls', 'verified_challenge_sessions',
  'verified_challenge_receipts', 'verified_challenge_awards', 'verification_compute_leases'].sort()
const endpoints = ['start_verified_challenge', 'complete_verified_challenge', 'get_verified_challenge',
  'abandon_verified_challenge', 'verified_career_summary'].sort()
const normalize = (source) => source.replace(/\s+/g, ' ').trim()
const digest = (source) => createHash('sha256').update(normalize(source)).digest('hex')

// Split only at top-level semicolons; comments and quoted function bodies cannot
// masquerade as top-level grants or admission statements. This is deliberately
// a narrow checked-migration guard, not a general PostgreSQL parser.
function statements(source) {
  const output = []
  let current = ''
  for (let i = 0; i < source.length;) {
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i + 2)
      i = end < 0 ? source.length : end + 1; current += ' '; continue
    }
    if (source.startsWith('/*', i)) {
      let depth = 1; i += 2
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) { depth++; i += 2 }
        else if (source.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      assert.equal(depth, 0, 'unterminated SQL comment'); current += ' '; continue
    }
    const quote = source[i]
    if (quote === "'" || quote === '"') {
      const start = i++
      let closed = false
      while (i < source.length) {
        if (source[i++] === quote) {
          if (source[i] === quote) i++
          else { closed = true; break }
        }
      }
      assert.ok(closed, 'unterminated SQL string'); current += source.slice(start, i); continue
    }
    const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
    if (tag) {
      const end = source.indexOf(tag, i + tag.length)
      assert.ok(end >= 0, 'unterminated SQL function body')
      current += source.slice(i, end + tag.length); i = end + tag.length; continue
    }
    if (source[i] === ';') {
      if (current.trim()) output.push(current.trim())
      current = ''; i++; continue
    }
    current += source[i++]
  }
  assert.equal(current.trim(), '', 'unterminated SQL statement')
  return output
}

export function validateChallengeMigration(source) {
  const all = statements(source)
  const byPrefix = (prefix) => all.filter((statement) => statement.startsWith(prefix))
  const routines = byPrefix('CREATE FUNCTION ')
  assert.deepEqual(routines.map((s) => s.match(/^CREATE FUNCTION public\.([a-z_]+)\(/)?.[1]).sort(), functions)
  const headers = routines.map((routine) => normalize(routine.slice(0, routine.indexOf(' AS $')))).sort().join('\n')
  assert.equal(createHash('sha256').update(headers).digest('hex'), 'ae09993a3c409cdb6453cafaa457a87a426300cfe23fa4034ce6b5ebdd8ced61',
    'reviewed routine signatures, returns and execution attributes')
  for (const routine of routines) {
    const header = routine.slice(0, routine.indexOf(' AS $'))
    assert.match(header, /SET search_path = ''$/)
    const name = routine.match(/^CREATE FUNCTION public\.([a-z_]+)/)[1]
    if (!['is_valid_challenge_transcript', 'challenge_utc', 'reject_challenge_evidence_mutation', 'guard_challenge_session', 'challenge_receipt_json'].includes(name))
      assert.match(header, /SECURITY DEFINER/)
  }
  assert.deepEqual(byPrefix('CREATE TABLE ').map((s) => s.match(/^CREATE TABLE public\.([a-z_]+) /)?.[1]).sort(), tables)
  // Pin the independently reviewed dynamic ACL loop and final grant list. A
  // changed ACL needs review and an explicit guard update, never auto-refresh.
  const acl = byPrefix('DO ')
  assert.equal(acl.length, 1)
  assert.equal(digest(acl[0]), '4bedbe78013d3e5b8e6e68dabcdd4b78543d946ed35216313889c47ebe9ac1de')
  const grants = byPrefix('GRANT ')
  assert.equal(grants.length, 1)
  assert.equal(digest(grants[0]), 'd51ac0cc9611a662f9feaedadee81053c77972159763c3f920aa76c0e0cb77d6')
  const insertions = byPrefix('INSERT ')
  assert.equal(insertions.length, 2)
  assert.ok(insertions.some((s) => normalize(s) === "INSERT INTO public.verified_challenge_controls(edition_id) VALUES ('cq1')"))
  const seed = insertions.find((s) => s.startsWith('INSERT INTO public.verified_challenge_catalog '))
  const match = seed?.match(/^INSERT INTO public\.verified_challenge_catalog VALUES\s*\(\s*'cq1','crosswind-qualification','crosswind-qualification',1,\s*'([^']+)'\s*\)$/)
  assert.ok(match, 'exact cq1 catalog insertion')
  assert.deepEqual(JSON.parse(match[1]), catalog, 'SQL catalog matches the retained edition')
  const normalized = normalize(all.join('\n'))
  assert.match(normalized, /starts_enabled boolean NOT NULL DEFAULT false,/)
  assert.match(normalized, /compute_attempts BETWEEN 0 AND 3\)/)
  assert.match(normalized, /expires_at=v_now\+interval '10 seconds',uncertain_until=v_now\+interval '410 seconds'/)
  for (const statement of all) {
    assert.match(statement, /^(?:CREATE (?:FUNCTION|TABLE|TRIGGER|UNIQUE INDEX) |INSERT INTO public\.verified_challenge_(?:catalog|controls)|DO \$acl\$|GRANT EXECUTE ON FUNCTION |COMMENT ON TABLE public\.|SET (?:lock_timeout|statement_timeout) = |RESET (?:lock_timeout|statement_timeout)$)/,
      'unreviewed top-level migration operation')
  }
  return true
}

async function check() {
  const source = await readFile(resolve(root, 'supabase/migrations/024_verified_challenge_rewards.sql'), 'utf8')
  validateChallengeMigration(source)
  const mutations = [
    ['enabled default', (s) => s.replace('starts_enabled boolean NOT NULL DEFAULT false', 'starts_enabled boolean NOT NULL DEFAULT true')],
    ['extra admission update', (s) => s + "\nUPDATE public.verified_challenge_controls SET starts_enabled=true;"],
    ['widened service grant', (s) => s.replace('TO service_role;', 'TO service_role,authenticated;')],
    ['trailing browser grant', (s) => s + '\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;'],
    ['missing RLS', (s) => s.replace('ENABLE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY')],
    ['ACL inventory omission', (s) => s.replace("'verified_career_ledger_snapshot','finalize_verified_challenge'", "'finalize_verified_challenge'")],
    ['mutable reward', (s) => s.replace('"xp":200},"seed":42', '"xp":201},"seed":42')],
    ['wrong seed', (s) => s.replace('"xp":200},"seed":42', '"xp":200},"seed":43')],
    ['extra RPC', (s) => s + "\nCREATE FUNCTION public.hostile() RETURNS void LANGUAGE sql AS $$SELECT;$$;"],
    ['missing RPC', (s) => s.replace('CREATE FUNCTION public.get_verified_challenge(', 'CREATE FUNCTION public.missing_get_verified_challenge(')],
    ['changed RPC account type', (s) => s.replace('CREATE FUNCTION public.get_verified_challenge(p_account_id uuid', 'CREATE FUNCTION public.get_verified_challenge(p_account_id text')],
    ['unsafe search path', (s) => s.replace("SECURITY DEFINER SET search_path = ''", 'SECURITY DEFINER SET search_path = public')],
    ['unbounded attempts', (s) => s.replace('compute_attempts BETWEEN 0 AND 3', 'compute_attempts BETWEEN 0 AND 30')],
    ['short uncertain cooldown', (s) => s.replace("v_now+interval '410 seconds'", "v_now+interval '10 seconds'")],
    ['extra dynamic SQL', (s) => s + "\nDO $$BEGIN EXECUTE 'SELECT public.set_verified_challenge_starts(''cq1'',true)'; END$$;"],
  ]
  for (const [label, mutate] of mutations) {
    const changed = mutate(source)
    assert.notEqual(changed, source, `${label}: mutation target exists`)
    assert.throws(() => validateChallengeMigration(changed), undefined, label)
  }
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  assert.match(pkg.scripts.precheck, /node scripts\/checks\/verified_challenge_migration\.mjs/)
  assert.match(pkg.scripts.prebuild, /npm run check:verified-challenge:artifact/)
  assert.equal(pkg.scripts['check:verified-challenge:artifact'], 'node scripts/assets/build-verified-challenge.mjs --verify')
  assert.match(pkg.scripts.check, /npm run check:verified-challenge(?:$| &&)/)
  assert.match(pkg.scripts['check:verified-challenge'], /node --import tsx scripts\/checks\/verified_challenge_retention\.mjs/)
  assert.doesNotMatch(pkg.scripts['check:verified-challenge'], /--generate|--reproduce|benchmark/)
  assert.match(pkg.scripts['check:database'], /node scripts\/checks\/verified-challenge-database\.mjs/)
  assert.equal(pkg.scripts['check:verified-challenge:benchmark'], 'node --import tsx scripts/checks/verified_challenge_benchmark.mjs')
  const manifest = JSON.parse(await readFile(resolve(root, 'supabase/backend-release-manifest.json'), 'utf8'))
  assert.deepEqual(manifest.compatibility.verifiedChallengeEditions, ['cq1'])
  assert.deepEqual(manifest.compatibility.verifiedChallengeResponseVersions, [1])
  for (const name of endpoints) assert.equal(manifest.functions.find((entry) => entry.name === name)?.verifyJwt, false, name)
  assert.ok(manifest.migrations.some(({ path }) => path === 'supabase/migrations/024_verified_challenge_rewards.sql'))
  console.log(`verified-challenge-migration: PASS (disabled catalog, service-only ACL, ${functions.length} routines, ${tables.length} tables, ${mutations.length} negative mutations; SQL execution is a separate gate)`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await check()

// Run: npm run check:database. Uses an isolated PostgreSQL 15 container, no ports.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Docker Official Image library/postgres, reviewed PostgreSQL 15 Alpine index.
const image = 'postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b';
const name = `singedterra-db-check-${process.pid}-${Date.now()}`;
const docker = (args, options = {}) => execFileSync('docker', args,
  { encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], ...options });
const sql = (input) => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input });
const file = (path) => sql(readFileSync(resolve(root, path), 'utf8'));
let started = false;
try {
  docker(['run', '--detach', '--name', name, '--network', 'none', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  for (let attempt = 0; ; attempt++) {
    // The image's initialization server accepts Unix sockets before shutting
    // down. Only the final server accepts TCP on the isolated loopback device.
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-t', '1'], { timeout: 5000 }); break; }
    catch (error) {
      if (attempt >= 29) throw error;
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
  for (const migration of ['001_init', '002_rematch', '010_room_seats', '016_verified_deployments',
    '017_verified_deployment_v2', '018_atomic_rematch', '019_verified_deployment_start_qualification',
    '020_verified_deployment_v3']) {
    file(`supabase/migrations/${migration}.sql`);
  }
  file('scripts/checks/rematch_postgres.sql');
  file('scripts/checks/verified_deployment_start_postgres.sql');
  file('scripts/checks/verified_deployment_v3_postgres.sql');

  sql(`INSERT INTO auth.users(id) VALUES
    ('31000000-0000-4000-8000-000000000001'),
    ('31000000-0000-4000-8000-000000000002'),
    ('31000000-0000-4000-8000-000000000003');
    UPDATE public.verified_deployment_contracts SET starts_enabled=true, disabled_at=now()-interval '31 minutes'
      WHERE contract_version IN (2,3);`);
  const run = promisify(execFile);
  const concurrentSql = async (query) => {
    try {
      const result = await run('docker', ['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { timeout: 30_000 });
      return result.stdout.trim();
    } catch (error) {
      return `${error.stderr ?? ''}`.includes('verified_deployment_incompatible_active') ? 'INCOMPATIBLE' : Promise.reject(error);
    }
  };
  const sameUser = await Promise.all([
    concurrentSql(`SELECT contract_version FROM public.start_verified_deployment_for_contracts(
      '31000000-0000-4000-8000-000000000001','{}',now()+interval '29 minutes',ARRAY[2]::smallint[]);`),
    concurrentSql(`SELECT contract_version FROM public.start_verified_deployment_for_contracts(
      '31000000-0000-4000-8000-000000000001','{}',now()+interval '29 minutes',ARRAY[3]::smallint[]);`),
  ]);
  assert.equal(sameUser.includes('INCOMPATIBLE'), true);
  assert.equal(sameUser.some((value) => value === '2' || value === '3'), true);
  assert.equal(sql(`SELECT count(*) FROM public.verified_deployments
    WHERE user_id='31000000-0000-4000-8000-000000000001' AND status='active';`).trim(), '1');

  const disableRace = await Promise.all([
    concurrentSql(`SELECT contract_version FROM public.start_verified_deployment_for_contracts(
      '31000000-0000-4000-8000-000000000002','{}',now()+interval '29 minutes',ARRAY[2,3]::smallint[]);`),
    concurrentSql("SELECT starts_enabled FROM public.set_verified_deployment_starts(3::smallint,false);"),
  ]);
  assert.equal(disableRace.some((value) => value === '2' || value === '3'), true);
  assert.equal(sql('SELECT starts_enabled FROM public.verified_deployment_contracts WHERE contract_version=3;').trim(), 'f');
  const racedTuple = sql(`SELECT contract_version FROM public.verified_deployments
    WHERE user_id='31000000-0000-4000-8000-000000000002' AND status='active';`).trim();
  assert.equal(racedTuple === '2' || racedTuple === '3', true);
  const returnedTuple = disableRace.find((value) => value === '2' || value === '3');
  assert.equal(returnedTuple, racedTuple);
  assert.equal(sql(`SELECT contract_version FROM public.start_verified_deployment_for_contracts(
    '31000000-0000-4000-8000-000000000003','{}',now()+interval '29 minutes',ARRAY[2,3]::smallint[]);`).trim(), '2');

  // Two independent connections contend for the same predecessor. Exactly one
  // prepared successor and one pointer survive, regardless of scheduling.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('50000000-0000-4000-8000-000000000001','RACE',1,'finished','{}',
      '[{"id":"test-seat","name":"Test","color":"#f00","ready":true}]');`);
  const outputs = await Promise.all(['6', '7'].map(async (digit) => {
    const query = `SELECT public.create_room_rematch('50000000-0000-4000-8000-000000000001','test-seat',
      '${digit}0000000-0000-4000-8000-000000000001','RC0${digit}',1,'{}','[]');`;
    const result = await run('docker', ['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { timeout: 30_000 });
    return result.stdout.trim();
  }));
  assert.equal(outputs[0], outputs[1], 'concurrent rematches must return one successor');
  assert.equal(sql("SELECT count(*) FROM public.rooms WHERE code IN ('RC06','RC07');").trim(), '1');
  console.log('PostgreSQL regressions PASS: immediate FK, atomic rollback, ACL, concurrent rematch, verified start/resume.');
} finally {
  if (started) docker(['rm', '--force', name]);
}

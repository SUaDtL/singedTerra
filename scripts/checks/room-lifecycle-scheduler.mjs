// Functional scheduler proof only: PostgreSQL 17 / pg_cron 1.6.4 in an isolated
// cached image. This does not exercise or bypass the production >=1.6.5 guard.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.argv.includes('--baseline');
assert.ok(process.argv.slice(2).every((arg) => arg === '--baseline'), 'Unknown argument');
const image = 'public.ecr.aws/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453';
const name = `singedterra-room-scheduler-${process.pid}-${Date.now()}`;
const roomId = '63000000-0000-4000-8000-000000000001';
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const sql = (input) => docker([
  'exec', '-i', name, 'psql', '-X', '-h', '/tmp', '-U', 'postgres',
  '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt',
], { input });
const json = (query) => JSON.parse(sql(query).trim());
const pause = () => new Promise((done) => setTimeout(done, 200));
const waitFor = async (label, query, accepts) => {
  const deadline = Date.now() + 20_000;
  let observed;
  do {
    observed = json(query);
    if (accepts(observed)) return observed;
    await pause();
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out: ${JSON.stringify(observed)}`);
};
const runs = (jobId, status) => `SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'runId',runid,'status',status,'command',command,'returnMessage',return_message)
  ORDER BY runid),'[]'::jsonb) FROM cron.job_run_details
  WHERE jobid=${jobId} AND status='${status}';`;
const stateQuery = (includeLifecycle) => `SELECT jsonb_build_object(
  'status',r.status,'winner',r.winner,
  'players',r.players,
  'actions',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.seq)
    FROM public.room_actions a WHERE a.room_id=r.id),'[]'::jsonb),
  'seats',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.seat_id)
    FROM public.room_seats s WHERE s.room_id=r.id),'[]'::jsonb),
  'receipts',(SELECT count(*) FROM public.match_scores WHERE room_id=r.id)
  ${includeLifecycle ? ", 'abandonedAt',r.abandoned_at" : ''})
  FROM public.rooms r WHERE r.id='${roomId}';`;

let started = false;
try {
  // Bypass the image's Supabase bootstrap; initialize one empty test cluster as
  // the unprivileged OS postgres user. Only fixed fixture SQL reaches it.
  docker(['run', '--detach', '--pull', 'never', '--name', name,
    '--network', 'none', '--user', 'postgres', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true', '--entrypoint', 'bash', image,
    '-ceu', `initdb -D /tmp/room-scheduler-pg -U postgres --auth-local=trust --auth-host=reject > /tmp/room-scheduler-init.log
exec postgres -D /tmp/room-scheduler-pg -c unix_socket_directories=/tmp -c listen_addresses= -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c cron.use_background_workers=on`]);
  started = true;
  for (let attempt = 0; ; attempt++) {
    try {
      docker(['exec', name, 'pg_isready', '-h', '/tmp', '-U', 'postgres', '-t', '1'],
        { timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt >= 49) {
        console.error(docker(['logs', name]));
        throw error;
      }
      await pause();
    }
  }
  const isolation = JSON.parse(docker(['inspect', name]))[0];
  assert.equal(isolation.HostConfig.NetworkMode, 'none');
  assert.equal(isolation.Config.User, 'postgres');
  assert.ok(!isolation.HostConfig.PortBindings || Object.keys(isolation.HostConfig.PortBindings).length === 0);
  assert.ok(!isolation.HostConfig.Binds || isolation.HostConfig.Binds.length === 0);
  assert.ok(isolation.Mounts.every((mount) => mount.Type !== 'bind'));
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE EXTENSION pg_cron;`);
  const runtime = json(`SELECT jsonb_build_object('postgres',current_setting('server_version'),
    'pgCron',(SELECT extversion FROM pg_extension WHERE extname='pg_cron'),
    'backgroundWorkers',current_setting('cron.use_background_workers'),
    'listenAddresses',current_setting('listen_addresses'));`);
  assert.match(runtime.postgres, /^17\./);
  assert.equal(runtime.pgCron, '1.6.4');
  assert.equal(runtime.backgroundWorkers, 'on');
  assert.equal(runtime.listenAddresses, '');
  console.log(JSON.stringify({ evidence: 'isolated-functional-scheduler-only', image,
    runtime, schedule: '1 second', productionSchedule: '* * * * *', baseline }));
  for (const migration of ['001_init', '002_rematch', '003_match_scores',
    '004_atomic_submit_action', '007_apply_room_reap', '009_reap_status_guard',
    '010_room_seats', '018_atomic_rematch', '021_atomic_room_commands',
    '022_atomic_casual_completion', ...(!baseline ? ['023_room_lifecycle'] : [])]) {
    sql(readFileSync(resolve(root, `supabase/migrations/${migration}.sql`), 'utf8'));
  }
  if (!baseline) {
    assert.throws(() => sql(readFileSync(resolve(root, 'supabase/ops/enable_room_cleanup.sql'), 'utf8')),
      /room cleanup requires a verified pg_cron version/,
      'the production installer must refuse this unpatched functional-test image');
    assert.equal(sql("SELECT count(*) FROM cron.job WHERE jobname='singedterra-room-cleanup';").trim(), '0');
    console.log('Production installer correctly refused pg_cron1.6.4 before scheduling any job.');
  }
  sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms,public.room_seats TO service_role;
    GRANT SELECT, INSERT ON public.room_actions TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.match_scores TO service_role;
    INSERT INTO public.rooms(id,code,seed,status,options,players,created_at) VALUES
      ('${roomId}','CRN1',1,'active',
       '{"rounds":1,"rulesetVersion":4,"commandProtocolVersion":2,"roomLifecycleVersion":1}',
       '[{"id":"cron-human","name":"Human","ready":true,"lastSeen":0},{"id":"cron-bot","name":"CPU","ready":true,"ai":"hard"}]',
       clock_timestamp()-interval '1 hour');
    INSERT INTO public.room_seats(room_id,seat_id,token,created_at) VALUES
      ('${roomId}','cron-human','noncredential-fixture-value',clock_timestamp()-interval '1 hour');
    INSERT INTO public.room_actions(room_id,seq,player_id,action) VALUES
      ('${roomId}',0,'cron-human','{"type":"move","delta":1}');`);
  if (!baseline) {
    sql(`UPDATE public.rooms SET lifecycle_started_at=clock_timestamp()-interval '1 hour'
      WHERE id='${roomId}';
      UPDATE public.room_seats SET last_seen_at=clock_timestamp()-interval '1 hour',left_at=NULL
      WHERE room_id='${roomId}';`);
  }
  const before = json(stateQuery(!baseline));
  assert.equal(before.status, 'active');
  // No application invokes cleanup after this point: pg_cron's background worker
  // owns the first transition. Polling below is SELECT-only observation.
  const command = baseline
    ? `SELECT public.apply_room_reap(ARRAY['${roomId}']::uuid[], '[]'::jsonb);`
    : 'SELECT public.expire_abandoned_rooms();';
  const jobId = Number(sql(`SELECT cron.schedule('singedterra-room-cleanup','1 second',
    $command$${command}$command$);`).trim());
  assert.ok(Number.isSafeInteger(jobId) && jobId > 0);
  const firstRuns = await waitFor('scheduled cleanup', runs(jobId, 'succeeded'),
    (rows) => rows.length >= 1);
  assert.equal(firstRuns[0].command, command);
  console.log(JSON.stringify({ event: 'scheduled-cleanup-completed', runs: firstRuns }));
  const after = json(stateQuery(!baseline));
  assert.equal(after.status, 'finished', baseline
    ? 'causal RED: a successful scheduled existing apply_room_reap leaves the abandoned active room active'
    : 'the scheduled expiry must retire the abandoned room without browser/API calls');
  if (baseline) throw new Error('baseline unexpectedly supplied active-room retirement');
  assert.ok(after.abandonedAt);
  assert.equal(after.winner, null);
  assert.equal(after.receipts, 0);
  for (const field of ['players', 'actions', 'seats']) assert.deepEqual(after[field], before[field]);
  console.log(JSON.stringify({ event: 'room-retired-with-history', status: after.status,
    abandonedAt: after.abandonedAt, players: after.players.length,
    actions: after.actions.length, seats: after.seats.length, receipts: after.receipts }));
  const repeatedRuns = await waitFor('repeated scheduled cleanup', runs(jobId, 'succeeded'),
    (rows) => rows.some((row) => row.runId > firstRuns.at(-1).runId));
  assert.deepEqual(json(stateQuery(true)), after,
    'repeated scheduled expiry must preserve the exact terminal marker and history');
  console.log(JSON.stringify({ event: 'repeat-idempotent', runs: repeatedRuns }));
  sql(`SELECT cron.unschedule(${jobId});`);
  assert.equal(sql('SELECT public.expire_abandoned_rooms();').trim(), '0');

  // Fixed, harmless arithmetic failure proves job failures remain observable;
  // no untrusted role receives cron ownership, DDL, scheduling, or configuration.
  const failedJobId = Number(sql(`SELECT cron.schedule('singedterra-room-cleanup-failure-test',
    '1 second','SELECT 1 / 0;');`).trim());
  const failedRuns = await waitFor('observable cron failure', runs(failedJobId, 'failed'),
    (rows) => rows.length >= 1);
  assert.match(failedRuns[0].returnMessage, /division by zero/i);
  sql(`SELECT cron.unschedule(${failedJobId});`);
  assert.deepEqual(json(stateQuery(true)), after);
  console.log(JSON.stringify({ event: 'scheduled-failure-observed', runs: failedRuns }));
  console.log('Room lifecycle scheduler PASS: actual background execution, preserved history, idempotent repeat, observable failure, and production-version refusal. PG17/pg_cron1.6.4 functional evidence only; no production enablement approval implied.');
} finally {
  if (started) {
    docker(['rm', '--force', '--volumes', name]);
    console.log(`Removed isolated scheduler container ${name}`);
  }
}

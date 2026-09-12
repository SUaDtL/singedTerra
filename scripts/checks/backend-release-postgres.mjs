// R14 disposable upgrade rehearsal. No host port or production connection is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const image = 'postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b';
const name = `singedterra-backend-release-${process.pid}-${Date.now()}`;
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const sql = (input) => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input });
const migration = (version, slug) => sql(readFileSync(resolve(root, `supabase/migrations/${version}_${slug}.sql`), 'utf8'));

for (const [handler, rpc] of [
  ['abandon_verified_deployment', 'abandon_verified_deployment'],
  ['complete_verified_deployment', 'complete_verified_deployment'],
  ['finish_game', 'finish_casual_match_v1'],
]) {
  assert.match(readFileSync(resolve(root, `supabase/functions/${handler}/index.ts`), 'utf8'),
    new RegExp(`\\.rpc\\(['\"]${rpc}['\"]`), `${handler} must retain the exercised ${rpc} deployment seam`);
}

let started = false;
try {
  docker(['run', '--detach', '--name', name, '--network', 'none', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  for (let attempt = 0; ; attempt += 1) {
    try {
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-t', '1'], { timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt >= 29) throw error;
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }

  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';`);
  for (const [version, slug] of [
    ['001', 'init'], ['002', 'rematch'], ['003', 'match_scores'], ['004', 'atomic_submit_action'],
    ['005', 'rate_limits'], ['006', 'drop_redundant_room_actions_index'], ['007', 'apply_room_reap'],
    ['008', 'rate_limits_global_cleanup'], ['009', 'reap_status_guard'], ['010', 'room_seats'],
    ['011', 'data_classification_comments'], ['012', 'profiles'], ['013', 'authenticated_gameplay_reads'],
    ['014', 'match_participants'], ['015', 'hotseat_match_results'], ['016', 'verified_deployments'], ['017', 'verified_deployment_v2'],
    ['018', 'atomic_rematch'], ['019', 'verified_deployment_start_qualification'],
    ['020', 'verified_deployment_v3'],
  ]) migration(version, slug);

  sql(`INSERT INTO auth.users(id) VALUES
    ('61000000-0000-4000-8000-000000000001'),
    ('61000000-0000-4000-8000-000000000002'),
    ('61000000-0000-4000-8000-000000000003'),
    ('61000000-0000-4000-8000-000000000004'),
    ('61000000-0000-4000-8000-000000000005'),
    ('61000000-0000-4000-8000-000000000006');
    INSERT INTO public.verified_deployments(id,user_id,config,contract_version,engine_version,ruleset_version,status,expires_at)
    VALUES
    ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','{}',1,1,3,'active',now()+interval '20 minutes'),
    ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','{}',2,2,4,'active',now()+interval '20 minutes'),
    ('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','{}',3,3,4,'active',now()+interval '20 minutes'),
    ('62000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000004','{}',2,2,4,'completed',now()+interval '20 minutes'),
    ('62000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000005','{}',2,2,4,'active',now()+interval '20 minutes'),
    ('62000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000006','{}',1,1,3,'active',now()+interval '20 minutes');
    INSERT INTO public.verified_match_results(
      session_id,user_id,transcript,won,outcome,verified_xp,
      prior_verified_matches,prior_verified_wins,prior_total_xp,
      current_verified_matches,current_verified_wins,current_total_xp)
    VALUES ('62000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000004',
      '[{"angle":45,"power":50}]',true,'win',200,0,0,0,1,1,200);
    INSERT INTO public.rooms(id,code,seed,status,options,players,winner)
    VALUES ('63000000-0000-4000-8000-000000000001','OLD1',1,'finished','{"rounds":1}',
      '[{"id":"old-a","name":"A"},{"id":"old-b","name":"B"}]','p1');
    INSERT INTO public.match_scores(room_id,winner,rounds,scoreboard)
    VALUES ('63000000-0000-4000-8000-000000000001','p1',1,
      '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');`);

  const before = sql(`SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.id) FROM (
      SELECT id,user_id,contract_version,engine_version,ruleset_version,status,expires_at,created_at,updated_at
      FROM public.verified_deployments) row_value;
    SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.session_id) FROM (
      SELECT * FROM public.verified_match_results) row_value;`).trim().split(/\r?\n/);

  migration('021', 'atomic_room_commands');

  const after021 = sql(`SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.id) FROM (
      SELECT id,user_id,contract_version,engine_version,ruleset_version,status,expires_at,created_at,updated_at
      FROM public.verified_deployments) row_value;
    SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.session_id) FROM (
      SELECT * FROM public.verified_match_results) row_value;`).trim().split(/\r?\n/);
  assert.deepEqual(after021, before, 'migration 021 must not rewrite verified sessions or immutable results');
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='match_scores' AND column_name='completion_version';`).trim(), '0');
  assert.equal(sql(`SELECT to_regprocedure('public.finish_casual_match_v1(uuid,text,text,text,integer,jsonb)') IS NULL;`).trim(), 't');

  const interruptionReceipt = sql(`SELECT session_id||':'||current_verified_matches||':'||current_total_xp||':'||created_at
    FROM public.complete_verified_deployment(
      '61000000-0000-4000-8000-000000000005','62000000-0000-4000-8000-000000000005',
      '[{"angle":45,"power":50}]',false,'loss',100);`).trim();
  assert.equal(sql(`SELECT contract_version||':'||engine_version||':'||ruleset_version||':'||status
    FROM public.abandon_verified_deployment(
      '61000000-0000-4000-8000-000000000006','62000000-0000-4000-8000-000000000006');`).trim(),
  '1:1:3:abandoned', 'retained legacy handler remains usable at the interrupted release boundary');
  const interrupted = sql(`SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.id) FROM (
      SELECT id,user_id,contract_version,engine_version,ruleset_version,status,expires_at,created_at,updated_at
      FROM public.verified_deployments) row_value;
    SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.session_id) FROM (
      SELECT * FROM public.verified_match_results) row_value;`).trim().split(/\r?\n/);

  // Model a db-push interruption after 021 committed. A corrected release reruns
  // the forward migration phase, which applies the still-pending 022 only.
  migration('022', 'atomic_casual_completion');
  const repaired = sql(`SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.id) FROM (
      SELECT id,user_id,contract_version,engine_version,ruleset_version,status,expires_at,created_at,updated_at
      FROM public.verified_deployments) row_value;
    SELECT string_agg(row_to_json(row_value)::text,'|' ORDER BY row_value.session_id) FROM (
      SELECT * FROM public.verified_match_results) row_value;`).trim().split(/\r?\n/);
  assert.deepEqual(repaired, interrupted, 'fix-forward migration 022 must preserve state written before the repair');
  const repairedRetry = sql(`SELECT session_id||':'||current_verified_matches||':'||current_total_xp||':'||created_at
    FROM public.complete_verified_deployment(
      '61000000-0000-4000-8000-000000000005','62000000-0000-4000-8000-000000000005',
      '[{"angle":45,"power":50}]',false,'loss',100);`).trim();
  assert.equal(repairedRetry, interruptionReceipt, 'a receipt created at interruption remains the immutable retry after repair');

  assert.equal(sql(`SELECT string_agg(contract_version||':'||engine_version||':'||ruleset_version||':'||status,',' ORDER BY contract_version)
    FROM public.verified_deployments WHERE status='active';`).trim(), '1:1:3:active,2:2:4:active,3:3:4:active');
  assert.equal(sql(`SELECT completion_version IS NULL AND completion_status='legacy_unvalidated'
      AND evidence_tier='casual_participant_reported' AND terminal_revision IS NULL
    FROM public.match_scores WHERE room_id='63000000-0000-4000-8000-000000000001';`).trim(), 't');

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players)
    VALUES ('63000000-0000-4000-8000-000000000002','NEW1',2,'active','{"rounds":1}',
      '[{"id":"p1","name":"A"},{"id":"p2","name":"B"}]');
    INSERT INTO public.room_seats(room_id,seat_id,token)
    VALUES ('63000000-0000-4000-8000-000000000002','p1','release-rehearsal-token');`);
  const casualCompletion = `SELECT public.finish_casual_match_v1(
    '63000000-0000-4000-8000-000000000002','p1','release-rehearsal-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},
      {"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]')::text;`;
  const casualFirst = sql(casualCompletion).trim();
  const casualRetry = sql(casualCompletion).trim();
  assert.equal(casualRetry, casualFirst, 'current casual completion retry must return the immutable receipt');
  assert.match(casualFirst, /"ok": true/);
  assert.equal(sql(`SELECT completion_version||':'||completion_status||':'||terminal_revision||':'||evidence_tier
    FROM public.match_scores WHERE room_id='63000000-0000-4000-8000-000000000002';`).trim(),
  '1:complete:0:casual_participant_reported');
  assert.throws(() => sql(`UPDATE public.match_scores SET rounds=2
    WHERE room_id='63000000-0000-4000-8000-000000000002';`), /casual_completion_receipt_immutable/,
  'current casual receipts cannot be rewritten');

  for (const suffix of ['2', '3']) {
    const session = `62000000-0000-4000-8000-00000000000${suffix}`;
    const user = `61000000-0000-4000-8000-00000000000${suffix}`;
    const first = sql(`SELECT session_id||':'||current_verified_matches||':'||current_total_xp||':'||created_at
      FROM public.complete_verified_deployment('${user}','${session}','[{"angle":45,"power":50}]',false,'loss',100);`).trim();
    const retry = sql(`SELECT session_id||':'||current_verified_matches||':'||current_total_xp||':'||created_at
      FROM public.complete_verified_deployment('${user}','${session}','[{"angle":45,"power":50}]',false,'loss',100);`).trim();
    assert.equal(retry, first, `V${suffix} completion retry must return the immutable receipt`);
    assert.equal(sql(`SELECT count(*) FROM public.verified_match_results WHERE session_id='${session}';`).trim(), '1');
  }

  const legacyAbandon = sql(`SELECT contract_version||':'||engine_version||':'||ruleset_version||':'||status
    FROM public.abandon_verified_deployment('61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001');`).trim();
  assert.equal(legacyAbandon, '1:1:3:abandoned', 'legacy active state remains recoverable through the retained handler');

  assert.throws(() => sql(`INSERT INTO public.verified_deployments(
    user_id,config,contract_version,engine_version,ruleset_version,status,expires_at)
    VALUES ('61000000-0000-4000-8000-000000000001','{}',2,3,4,'active',now()+interval '20 minutes');`),
  /verified_deployments_version_tuple_check/, 'mixed verified tuples must fail closed');

  const historicalResult = sql(`SELECT contract_version||':'||engine_version||':'||ruleset_version||':'||current_verified_matches||':'||current_total_xp
    FROM public.verified_match_results result JOIN public.verified_deployments deployment ON deployment.id=result.session_id
    WHERE result.session_id='62000000-0000-4000-8000-000000000004';`).trim();
  assert.equal(historicalResult, '2:2:4:1:200', 'historical completed receipts remain readable and unchanged');

  assert.throws(() => sql(`UPDATE public.verified_match_results SET current_total_xp=999
    WHERE session_id='62000000-0000-4000-8000-000000000002';`), /verified_match_result_immutable/,
  'verified result history cannot be rewritten into an invalid receipt');

  console.log('Backend release PostgreSQL rehearsal PASS: full 001-020 -> interrupted 021 -> fix-forward 022, legacy/V2/V3 compatibility, immutable verified/casual retry, mixed-tuple rejection.');
} finally {
  if (started) docker(['rm', '--force', name]);
}

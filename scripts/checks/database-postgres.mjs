// Run: npm run check:database. Uses an isolated PostgreSQL 15 container, no ports.
import { execFileSync, execFile, spawn } from 'node:child_process';
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

const openPsqlSession = (label) => {
  const child = spawn('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const waiter of waiters.splice(0)) waiter();
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => {
      if (code === 0) resolveExit(stdout);
      else rejectExit(new Error(`${label} psql exited ${code}: ${stderr || stdout}`));
    });
  });
  const waitFor = async (marker) => {
    const deadline = Date.now() + 30_000;
    while (!stdout.includes(marker)) {
      if (Date.now() >= deadline) throw new Error(`${label} did not emit ${marker}: ${stderr || stdout}`);
      await new Promise((resolveWait) => {
        const timeout = setTimeout(resolveWait, 100);
        waiters.push(() => { clearTimeout(timeout); resolveWait(); });
      });
    }
  };
  return {
    send(input) { child.stdin.write(input); },
    close() { child.stdin.end(); },
    waitFor,
    exited,
    output() { return stdout; },
  };
};
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
  for (const migration of ['001_init', '002_rematch', '003_match_scores', '004_atomic_submit_action', '010_room_seats', '016_verified_deployments',
    '017_verified_deployment_v2', '018_atomic_rematch', '019_verified_deployment_start_qualification',
    '020_verified_deployment_v3', '021_atomic_room_commands']) {
    file(`supabase/migrations/${migration}.sql`);
  }
  file('scripts/checks/rematch_postgres.sql');
  file('scripts/checks/verified_deployment_start_postgres.sql');
  file('scripts/checks/verified_deployment_v3_postgres.sql');

  // R06: two independent proxies prove they both observed the same room/log
  // revision before either is released to the v2 RPC.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players,active_player_index,turn) VALUES
    ('41000000-0000-4000-8000-000000000001','CMD1',1,'active','{"rulesetVersion":4,"commandProtocolVersion":2}',
      '[{"id":"proxy-a","name":"A","color":"#f00","ready":true},{"id":"cpu-seat","name":"CPU","color":"#0f0","ready":true,"ai":"hard"},{"id":"proxy-b","name":"B","color":"#00f","ready":true},{"id":"ai-null","name":"Null AI","color":"#999","ready":true,"ai":null},{"id":"ai-invalid","name":"Invalid AI","color":"#aaa","ready":true,"ai":"expert"}]',1,0);`);
  sql(`INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
    ('41000000-0000-4000-8000-000000000001','proxy-a','token-a'),
    ('41000000-0000-4000-8000-000000000001','proxy-b','token-b');`);
  const commandSessions = ['A', 'B'].map((label) => openPsqlSession(`command-${label}`));
  for (const [index, session] of commandSessions.entries()) {
    const label = index === 0 ? 'A' : 'B';
    session.send(`BEGIN;
      SELECT active_player_index || ':' || turn || ':' || COALESCE((SELECT MAX(seq)+1 FROM public.room_actions WHERE room_id='41000000-0000-4000-8000-000000000001'),0)
        FROM public.rooms WHERE id='41000000-0000-4000-8000-000000000001';
      \\echo READY_${label}
    `);
  }
  await Promise.all(commandSessions.map((session, index) => session.waitFor(`READY_${index === 0 ? 'A' : 'B'}`)));
  assert.equal(commandSessions[0].output().includes('1:0:0'), true, 'proxy A must prove stale revision 0');
  assert.equal(commandSessions[1].output().includes('1:0:0'), true, 'proxy B must prove stale revision 0');
  for (const [index, session] of commandSessions.entries()) {
    const label = index === 0 ? 'A' : 'B';
    session.send(`SELECT public.submit_room_command_v2(
      '41000000-0000-4000-8000-000000000001','proxy-${label.toLowerCase()}','token-${label.toLowerCase()}',
      2::smallint,'cpu:v2:room:0:cpu-seat:fire',0,'cpu-seat',
      '{"type":"fire","angle":45,"power":70,"weapon":"baby_missile"}',0,false,4::smallint);
      COMMIT;
      \\echo DONE_${label}
    `);
    session.close();
  }
  await Promise.all(commandSessions.map((session, index) => session.waitFor(`DONE_${index === 0 ? 'A' : 'B'}`)));
  await Promise.all(commandSessions.map((session) => session.exited));
  assert.equal(sql(`SELECT count(*) FROM public.room_actions WHERE room_id='41000000-0000-4000-8000-000000000001';`).trim(), '1',
    'two stale proxies for one logical CPU intent must append once');
  const commandReceipts = commandSessions.map((session) => session.output().split(/\r?\n/).find((line) => line.startsWith('{"ok": true')));
  assert.equal(commandReceipts[0], commandReceipts[1], 'competing CPU proxies must receive the same receipt');
  assert.equal(sql(`SELECT active_player_index || ':' || turn FROM public.rooms WHERE id='41000000-0000-4000-8000-000000000001';`).trim(), '0:1');

  const commandCall = (overrides = {}) => {
    const command = {
      submitter: 'proxy-a', token: 'token-a', version: 2,
      intent: 'human-v2-intent', revision: 1, actor: 'proxy-a',
      action: '{"type":"move","delta":1}', next: 'NULL', roundOver: false, ruleset: 4,
      ...overrides,
    };
    return sql(`SELECT public.submit_room_command_v2(
      '41000000-0000-4000-8000-000000000001','${command.submitter}','${command.token}',
      ${command.version}::smallint,'${command.intent}',${command.revision},'${command.actor}',
      '${command.action}'::jsonb,${command.next},${command.roundOver},${command.ruleset}::smallint);`).trim();
  };
  assert.match(commandCall({ intent: 'cpu:v2:room:0:cpu-seat:fire', actor: 'proxy-a', revision: 0 }), /"error": "intent_conflict"/,
    'same room/protocol intent with a changed actor must conflict');
  assert.match(commandCall({ intent: 'cpu:v2:room:0:cpu-seat:fire', actor: 'cpu-seat', revision: 0,
    action: '{"type":"fire","angle":46,"power":70,"weapon":"baby_missile"}', next: 0 }), /"error": "intent_conflict"/,
    'same intent with changed payload must conflict');
  assert.match(commandCall({ intent: 'stale-human', revision: 0 }), /"error": "revision_conflict"/);
  assert.match(commandCall({ intent: 'bad-token', token: 'wrong' }), /"error": "invalid_seat_token"/);
  assert.match(commandCall({ intent: 'human-proxy', actor: 'proxy-b' }), /"error": "cannot_proxy_human"/);
  assert.match(commandCall({ intent: 'null-ai-proxy', actor: 'ai-null' }), /"error": "cannot_proxy_human"/,
    'null AI metadata must not grant CPU proxy authority');
  assert.match(commandCall({ intent: 'invalid-ai-proxy', actor: 'ai-invalid' }), /"error": "cannot_proxy_human"/,
    'invalid AI metadata must not grant CPU proxy authority');
  assert.match(commandCall({ intent: 'missing-version', version: 'NULL' }), /"error": "invalid_command"/);
  assert.match(commandCall({ intent: 'missing-revision', revision: 'NULL' }), /"error": "invalid_command"/);
  assert.match(commandCall({ intent: 'missing-action-type', action: '{}' }), /"error": "invalid_command"/);
  assert.match(commandCall({ intent: 'action-secret', action: '{"type":"move","delta":1,"token":"must-not-persist"}' }),
    /"error": "invalid_command"/, 'unknown action fields cannot enter the public action log');
  assert.throws(() => sql(`INSERT INTO public.room_actions(
    room_id,seq,player_id,action,command_version,intent_id,expected_revision,submitted_by,
    command_ends_turn,command_round_over
  ) VALUES (
    '41000000-0000-4000-8000-000000000001',99,'proxy-a','{"type":"move","delta":1}',
    2,'incomplete-row',NULL,'proxy-a',false,false
  );`), /room_actions_command_metadata_complete/,
  'the table constraint must reject a partially populated v2 metadata row');
  assert.throws(() => sql(`SET ROLE anon; SELECT public.submit_room_command_v2(
    '41000000-0000-4000-8000-000000000001','proxy-a','token-a',2::smallint,
    'anon-call',1,'proxy-a','{"type":"move","delta":1}',NULL,false,4::smallint);`),
  /permission denied for function submit_room_command_v2/,
  'only service_role may execute the command admission function directly');

  assert.match(commandCall(), /"ok": true/); // active-seat move, revision 1
  assert.match(commandCall({ intent: 'human-buy', revision: 2, action: '{"type":"buy","weapon":"nuke"}' }), /"ok": true/);
  assert.match(commandCall({ submitter: 'proxy-a', intent: 'shop-proxy-b', revision: 3, actor: 'proxy-b',
    action: '{"type":"buy","weapon":"nuke","tankId":"p3"}', roundOver: true }), /"error": "cannot_proxy_human"/);
  assert.match(commandCall({ submitter: 'proxy-b', token: 'token-b', intent: 'shop-self-b', revision: 3, actor: 'proxy-b',
    action: '{"type":"buy","weapon":"nuke","tankId":"p3"}', roundOver: true }), /"ok": true/);
  assert.match(commandCall({ submitter: 'proxy-b', token: 'token-b', intent: 'continue-b', revision: 4, actor: 'proxy-b',
    action: '{"type":"next_round"}', roundOver: true }), /"ok": true/,
    'a non-opener member may initiate next_round without proxying the opener');
  assert.equal(sql(`SELECT action->'commandActor'->>'role' FROM public.room_actions
    WHERE room_id='41000000-0000-4000-8000-000000000001' AND intent_id='continue-b';`).trim(), 'transition-initiator');
  assert.equal(sql(`SELECT active_player_index || ':' || turn FROM public.rooms
    WHERE id='41000000-0000-4000-8000-000000000001';`).trim(), '0:1',
    'move, buy and next_round must remain turn-neutral');

  sql(`UPDATE public.rooms SET status='finished' WHERE id='41000000-0000-4000-8000-000000000001';`);
  assert.match(commandCall({ intent: 'after-finish', revision: 5 }), /"error": "room_not_active"/);
  assert.equal(commandCall({ submitter: 'proxy-b', token: 'token-b', intent: 'cpu:v2:room:0:cpu-seat:fire',
    revision: 0, actor: 'cpu-seat', action: '{"type":"fire","angle":45,"power":70,"weapon":"baby_missile"}', next: 0 }), commandReceipts[0],
    'an authenticated identical retry returns the original receipt after finish');

  // finish-first: command sees active in a stale read, then rejects after the
  // finish UPDATE wins the room lock.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('41000000-0000-4000-8000-000000000002','CMD2',1,'active','{"rulesetVersion":4,"commandProtocolVersion":2}',
      '[{"id":"human-f","name":"F","color":"#f00","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('41000000-0000-4000-8000-000000000002','human-f','token-f');`);
  const finishFirst = openPsqlSession('finish-first');
  finishFirst.send(`BEGIN; UPDATE public.rooms SET status='finished' WHERE id='41000000-0000-4000-8000-000000000002'; \\echo FINISH_LOCKED\n`);
  await finishFirst.waitFor('FINISH_LOCKED');
  const blockedCommand = openPsqlSession('finish-first-command');
  blockedCommand.send(`BEGIN; SELECT status FROM public.rooms WHERE id='41000000-0000-4000-8000-000000000002'; \\echo COMMAND_STALE\n`);
  await blockedCommand.waitFor('COMMAND_STALE');
  blockedCommand.send(`SELECT public.submit_room_command_v2('41000000-0000-4000-8000-000000000002','human-f','token-f',2::smallint,'finish-first',0,'human-f','{"type":"move","delta":1}',NULL,false,4::smallint); COMMIT; \\echo COMMAND_DONE\n`);
  finishFirst.send('COMMIT; \\echo FINISH_DONE\n'); finishFirst.close(); blockedCommand.close();
  await Promise.all([finishFirst.exited, blockedCommand.exited]);
  assert.match(blockedCommand.output(), /"error": "room_not_active"/);
  assert.equal(sql(`SELECT count(*) FROM room_actions WHERE room_id='41000000-0000-4000-8000-000000000002';`).trim(), '0');

  // action-first: finish waits for the command transaction, then commits after
  // the one accepted row/cursor state.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('41000000-0000-4000-8000-000000000003','CMD3',1,'active','{"rulesetVersion":4,"commandProtocolVersion":2}',
      '[{"id":"human-a","name":"A","color":"#f00","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('41000000-0000-4000-8000-000000000003','human-a','token-a3');`);
  const actionFirst = openPsqlSession('action-first');
  actionFirst.send(`BEGIN; SELECT public.submit_room_command_v2('41000000-0000-4000-8000-000000000003','human-a','token-a3',2::smallint,'action-first',0,'human-a','{"type":"move","delta":1}',NULL,false,4::smallint); \\echo ACTION_LOCKED\n`);
  await actionFirst.waitFor('ACTION_LOCKED');
  const blockedFinish = openPsqlSession('action-first-finish');
  blockedFinish.send(`BEGIN; SELECT status FROM public.rooms WHERE id='41000000-0000-4000-8000-000000000003'; \\echo FINISH_STALE\n`);
  await blockedFinish.waitFor('FINISH_STALE');
  blockedFinish.send(`UPDATE public.rooms SET status='finished' WHERE id='41000000-0000-4000-8000-000000000003' AND status='active'; COMMIT; \\echo FINISH_DONE\n`);
  actionFirst.send('COMMIT; \\echo ACTION_DONE\n'); actionFirst.close(); blockedFinish.close();
  await Promise.all([actionFirst.exited, blockedFinish.exited]);
  assert.equal(sql(`SELECT status || ':' || (SELECT count(*) FROM room_actions WHERE room_id=rooms.id)
    FROM rooms WHERE id='41000000-0000-4000-8000-000000000003';`).trim(), 'finished:1');

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
  console.log('PostgreSQL regressions PASS: atomic v2 command receipts, stale-preread serialization, action/finish ordering, ACL, rematch, verified start/resume.');
} finally {
  if (started) docker(['rm', '--force', name]);
}

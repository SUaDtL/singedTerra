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
  child.stdin.write("SELECT 'BACKEND_PID:' || pg_backend_pid();\n");
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
    async backendPid() {
      await waitFor('BACKEND_PID:');
      const match = stdout.match(/BACKEND_PID:(\d+)/);
      if (!match) throw new Error(`${label} did not expose its PostgreSQL backend PID`);
      return Number(match[1]);
    },
    exited,
    output() { return stdout; },
  };
};

const waitForBlockedBy = async (waiter, holder, ordering) => {
  const [waiterPid, holderPid] = await Promise.all([waiter.backendPid(), holder.backendPid()]);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const blocked = sql(`SELECT COALESCE(${holderPid}=ANY(pg_blocking_pids(${waiterPid})), false)::text;`).trim();
    if (blocked === 'true') {
      console.log(JSON.stringify({ kind: 'r08-lock-wait', ordering, holderPid, waiterPid }));
      return;
    }
    await new Promise((done) => setTimeout(done, 25));
  }
  const activity = sql(`SELECT pid || ':' || state || ':' || COALESCE(wait_event_type, '') || ':' || COALESCE(wait_event, '')
    FROM pg_stat_activity WHERE pid IN (${holderPid}, ${waiterPid}) ORDER BY pid;`).trim();
  throw new Error(`${ordering} did not observe waiter ${waiterPid} blocked by holder ${holderPid}; ${activity}`);
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
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
  for (const migration of ['001_init', '002_rematch', '003_match_scores', '004_atomic_submit_action', '010_room_seats', '016_verified_deployments',
    '017_verified_deployment_v2', '018_atomic_rematch', '019_verified_deployment_start_qualification',
    '020_verified_deployment_v3', '021_atomic_room_commands', '022_atomic_casual_completion']) {
    file(`supabase/migrations/${migration}.sql`);
  }
  // Mirror the hosted service role's table access so service-only RPC ACL and
  // nested helper execution are exercised as that role, not only as postgres.
  sql(`GRANT SELECT, UPDATE ON public.rooms TO service_role;
    GRANT SELECT ON public.room_seats TO service_role;
    GRANT SELECT, INSERT ON public.room_actions TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.match_scores TO service_role;`);
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

  // R08 RED: completion must live in the same room-lock transaction as the
  // v2 action cursor and return an immutable participant-reported receipt.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000001','FIN1',1,'active','{"rounds":1,"teamMode":false}',
      '[{"id":"fin-a","name":"A","color":"#f00","ready":true},{"id":"fin-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
      ('42000000-0000-4000-8000-00000000000f','FINA',1,'active','{"rounds":1}',
        '[{"id":"other-seat","name":"Other","color":"#00f","ready":true},{"id":"other-peer","name":"Peer","color":"#ff0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000001','fin-a','fin-token-a'),
      ('42000000-0000-4000-8000-00000000000f','other-seat','other-room-token');`);
  const unfinishedCompletionState = () => sql(`SELECT r.status || ':' || COALESCE(r.winner, 'NULL') || ':'
      || (SELECT count(*) FROM public.room_actions WHERE room_id=r.id) || ':'
      || (SELECT count(*) FROM public.match_scores WHERE room_id=r.id)
    FROM public.rooms r WHERE r.id='42000000-0000-4000-8000-000000000001';`).trim();
  for (const attempt of [
    { label: 'invalid target-room token', player: 'fin-a', token: 'wrong-token', error: 'invalid_seat_token' },
    { label: 'token valid only for another room and seat', player: 'fin-a', token: 'other-room-token', error: 'invalid_seat_token' },
    { label: 'nonmember with another room valid token', player: 'other-seat', token: 'other-room-token', error: 'not_room_member' },
  ]) {
    const refusal = sql(`SET ROLE service_role; SELECT public.finish_casual_match_v1(
      '42000000-0000-4000-8000-000000000001','${attempt.player}','${attempt.token}','p1',1,
      '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},
        {"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":25}]'::jsonb); RESET ROLE;`);
    assert.match(refusal, new RegExp(`"error": "${attempt.error}"`), attempt.label);
    assert.equal(unfinishedCompletionState(), 'active:NULL:0:0', `${attempt.label} must not mutate terminal state`);
  }
  const firstCompletion = sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000001','fin-a','fin-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},
      {"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":25}]'::jsonb);`).trim();
  assert.match(firstCompletion, /"ok": true/);
  assert.match(firstCompletion, /"evidence": "casual_participant_reported"/);
  assert.equal(sql(`SELECT status || ':' || winner FROM public.rooms
    WHERE id='42000000-0000-4000-8000-000000000001';`).trim(), 'finished:p1');
  assert.equal(sql(`SELECT winner || ':' || completion_status || ':' || evidence_tier
    FROM public.match_scores WHERE room_id='42000000-0000-4000-8000-000000000001';`).trim(),
    'p1:complete:casual_participant_reported');
  assert.match(sql(`SET ROLE service_role; SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000001','fin-a','fin-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},
      {"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":25}]'::jsonb); RESET ROLE;`),
  /"ok": true/, 'the hosted-style service role can execute the complete nested RPC path');
  assert.throws(() => sql(`SET ROLE anon; SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000001','fin-a','fin-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},
      {"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":25}]'::jsonb);`),
  /permission denied for function finish_casual_match_v1/,
  'anon cannot execute the casual completion RPC');
  const completionRetry = sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000001','fin-a','fin-token-a','p1',1,
    '[{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":25},
      {"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100}]'::jsonb);`).trim();
  assert.equal(completionRetry, firstCompletion, 'response-loss retry must return the exact immutable receipt');
  assert.equal(sql(`SELECT count(*) FROM public.match_scores
    WHERE room_id='42000000-0000-4000-8000-000000000001';`).trim(), '1');

  // Contradictory reporters synchronize before the RPC. The room row lock must
  // serialize them to one receipt and one explicit conflict, never mixed winners.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000002','FIN2',1,'active','{"rounds":1,"teamMode":false}',
      '[{"id":"race-a","name":"A","color":"#f00","ready":true},{"id":"race-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000002','race-a','race-token-a'),
      ('42000000-0000-4000-8000-000000000002','race-b','race-token-b');`);
  const completionRacers = ['A', 'B'].map((label) => openPsqlSession(`completion-${label}`));
  for (const [index, session] of completionRacers.entries()) {
    session.send(`BEGIN; SELECT status FROM public.rooms WHERE id='42000000-0000-4000-8000-000000000002'; \\echo COMPLETION_READY_${index}\n`);
  }
  await Promise.all(completionRacers.map((session, index) => session.waitFor(`COMPLETION_READY_${index}`)));
  completionRacers[0].send(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000002','race-a','race-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":10}]'); COMMIT; \\echo COMPLETION_DONE_A\n`);
  completionRacers[1].send(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000002','race-b','race-token-b','p2',1,
    '[{"tankId":"p1","playerName":"A","roundWins":0,"kills":0,"totalDamage":10},{"tankId":"p2","playerName":"B","roundWins":1,"kills":1,"totalDamage":100}]'); COMMIT; \\echo COMPLETION_DONE_B\n`);
  for (const session of completionRacers) session.close();
  await Promise.all(completionRacers.map((session) => session.exited));
  const completionRaceOutput = completionRacers.map((session) => session.output());
  assert.equal(completionRaceOutput.filter((value) => /"ok": true/.test(value)).length, 1);
  assert.equal(completionRaceOutput.filter((value) => /"error": "completion_conflict"/.test(value)).length, 1);
  assert.equal(sql(`SELECT (r.winner IS NOT DISTINCT FROM s.winner)::text || ':' || count(*)
    FROM public.rooms r JOIN public.match_scores s ON s.room_id=r.id
    WHERE r.id='42000000-0000-4000-8000-000000000002' GROUP BY r.winner,s.winner;`).trim(), 'true:1');

  // A score write failure aborts the whole statement, including the room status.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000003','FIN3',1,'active','{"rounds":1}',
      '[{"id":"fail-a","name":"A","color":"#f00","ready":true},{"id":"fail-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000003','fail-a','fail-token-a');
    CREATE FUNCTION public.reject_test_score() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.room_id='42000000-0000-4000-8000-000000000003' THEN RAISE EXCEPTION 'forced score failure'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER reject_test_score BEFORE INSERT ON public.match_scores
      FOR EACH ROW EXECUTE FUNCTION public.reject_test_score();`);
  assert.throws(() => sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000003','fail-a','fail-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /forced score failure/);
  assert.equal(sql(`SELECT status || ':' || COALESCE(winner, 'NULL') FROM public.rooms
    WHERE id='42000000-0000-4000-8000-000000000003';`).trim(), 'active:NULL');
  assert.equal(sql(`SELECT count(*) FROM public.match_scores
    WHERE room_id='42000000-0000-4000-8000-000000000003';`).trim(), '0');
  sql('DROP TRIGGER reject_test_score ON public.match_scores; DROP FUNCTION public.reject_test_score();');

  // Strict malformed reports, impossible winners and corrupt rosters leave the
  // active room untouched so a corrected report remains recoverable.
  for (const scoreboard of [
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100}]',
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p1","playerName":"A","roundWins":0,"kills":0,"totalDamage":0}]',
    '[{"tankId":"p1","playerName":"A","roundWins":10,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]',
  ]) {
    assert.match(sql(`SELECT public.finish_casual_match_v1(
      '42000000-0000-4000-8000-000000000003','fail-a','fail-token-a','p1',1,'${scoreboard}');`),
    /"error": "invalid_scoreboard"/);
  }
  assert.match(sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000003','fail-a','fail-token-a','p2',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /"error": "winner_mismatch"/);
  assert.equal(sql(`SELECT status FROM public.rooms WHERE id='42000000-0000-4000-8000-000000000003';`).trim(), 'active');

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000004','FIN4',1,'active','{"rounds":1}',
      '[{"id":"dup-seat","name":"A","color":"#f00","ready":true},{"id":"dup-seat","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000004','dup-seat','dup-token');`);
  assert.match(sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000004','dup-seat','dup-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /"error": "invalid_roster"/);

  // Pre-scoreboard clients can still finish atomically, but their receipt is
  // explicitly score_absent rather than being mislabeled complete.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000005','FIN5',1,'active','{}',
      '[{"id":"old-a","name":"A","color":"#f00","ready":true},{"id":"old-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000005','old-a','old-token-a');`);
  const absentReceipt = sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000005','old-a','old-token-a','p1',NULL,NULL);`).trim();
  assert.match(absentReceipt, /"completionStatus": "score_absent"/);
  assert.equal(sql(`SELECT completion_status || ':' || jsonb_array_length(scoreboard)
    FROM public.match_scores WHERE room_id='42000000-0000-4000-8000-000000000005';`).trim(), 'score_absent:0');

  // A legacy finished room whose score write was lost is repairable. A legacy
  // malformed row is repairable only when its winner agrees with rooms.winner.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players,winner) VALUES
    ('42000000-0000-4000-8000-000000000006','FIN6',1,'finished','{"rounds":1}',
      '[{"id":"legacy-a","name":"A","color":"#f00","ready":true},{"id":"legacy-b","name":"B","color":"#0f0","ready":true}]','p1'),
    ('42000000-0000-4000-8000-000000000007','FIN7',1,'finished','{"rounds":1}',
      '[{"id":"legacy-c","name":"C","color":"#f00","ready":true},{"id":"legacy-d","name":"D","color":"#0f0","ready":true}]','p1');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000006','legacy-a','legacy-token-a'),
      ('42000000-0000-4000-8000-000000000007','legacy-c','legacy-token-c');
    INSERT INTO public.match_scores(room_id,winner,rounds,scoreboard) VALUES
      ('42000000-0000-4000-8000-000000000007','p1',99,'[{"tankId":"p1"}]');`);
  assert.match(sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000006','legacy-a','legacy-token-a','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /"ok": true/);
  assert.match(sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000007','legacy-c','legacy-token-c','p1',1,
    '[{"tankId":"p1","playerName":"C","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"D","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /"legacyRepaired": true/);
  assert.equal(sql(`SELECT rounds || ':' || completion_status FROM public.match_scores
    WHERE room_id='42000000-0000-4000-8000-000000000007';`).trim(), '1:complete');

  assert.throws(() => sql(`UPDATE public.match_scores SET rounds=2
    WHERE room_id='42000000-0000-4000-8000-000000000001';`),
  /casual_completion_receipt_immutable/,
  'a versioned participant-reported receipt must be immutable in the database');

  // Finish-first: the completion RPC holds the room lock. A command that
  // preread active must wait, then reject without appending after completion.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000008','FIN8',1,'active',
      '{"rounds":1,"teamMode":false,"rulesetVersion":4,"commandProtocolVersion":2}',
      '[{"id":"finish-lock-a","name":"A","color":"#f00","ready":true},{"id":"finish-lock-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000008','finish-lock-a','finish-lock-token');`);
  const completionFirst = openPsqlSession('r08-completion-first');
  completionFirst.send(`BEGIN; SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000008','finish-lock-a','finish-lock-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');
    \\echo COMPLETION_LOCKED\n`);
  await completionFirst.waitFor('COMPLETION_LOCKED');
  const commandAfterCompletion = openPsqlSession('r08-command-after-completion');
  commandAfterCompletion.send(`BEGIN; SELECT status FROM public.rooms
    WHERE id='42000000-0000-4000-8000-000000000008'; \\echo COMMAND_SAW_ACTIVE\n`);
  await commandAfterCompletion.waitFor('COMMAND_SAW_ACTIVE');
  assert.match(commandAfterCompletion.output(), /active/);
  commandAfterCompletion.send(`SELECT public.submit_room_command_v2(
    '42000000-0000-4000-8000-000000000008','finish-lock-a','finish-lock-token',
    2::smallint,'r08-finish-first',0,'finish-lock-a','{"type":"move","delta":1}',NULL,false,4::smallint);
    COMMIT; \\echo COMMAND_AFTER_COMPLETION_DONE\n`);
  await waitForBlockedBy(commandAfterCompletion, completionFirst, 'completion-first');
  completionFirst.send('COMMIT; \\echo COMPLETION_FIRST_DONE\n');
  completionFirst.close(); commandAfterCompletion.close();
  await Promise.all([completionFirst.exited, commandAfterCompletion.exited]);
  assert.match(commandAfterCompletion.output(), /"error": "room_not_active"/);
  assert.equal(sql(`SELECT status || ':' || (SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id)
    || ':' || (SELECT terminal_revision FROM public.match_scores WHERE room_id=rooms.id)
    FROM public.rooms WHERE id='42000000-0000-4000-8000-000000000008';`).trim(), 'finished:0:0');

  // Action-first: the command holds the room lock. Completion waits, observes
  // the committed action, and records its revision in the terminal receipt.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-000000000009','FIN9',1,'active',
      '{"rounds":1,"teamMode":false,"rulesetVersion":4,"commandProtocolVersion":2}',
      '[{"id":"action-lock-a","name":"A","color":"#f00","ready":true},{"id":"action-lock-b","name":"B","color":"#0f0","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-000000000009','action-lock-a','action-lock-token');`);
  const actionBeforeCompletion = openPsqlSession('r08-action-first');
  actionBeforeCompletion.send(`BEGIN; SELECT public.submit_room_command_v2(
    '42000000-0000-4000-8000-000000000009','action-lock-a','action-lock-token',
    2::smallint,'r08-action-first',0,'action-lock-a','{"type":"move","delta":1}',NULL,false,4::smallint);
    \\echo ACTION_FIRST_LOCKED\n`);
  await actionBeforeCompletion.waitFor('ACTION_FIRST_LOCKED');
  const completionAfterAction = openPsqlSession('r08-completion-after-action');
  completionAfterAction.send(`BEGIN; SELECT status FROM public.rooms
    WHERE id='42000000-0000-4000-8000-000000000009'; \\echo COMPLETION_SAW_ACTIVE\n`);
  await completionAfterAction.waitFor('COMPLETION_SAW_ACTIVE');
  completionAfterAction.send(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-000000000009','action-lock-a','action-lock-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');
    COMMIT; \\echo COMPLETION_AFTER_ACTION_DONE\n`);
  await waitForBlockedBy(completionAfterAction, actionBeforeCompletion, 'action-first');
  actionBeforeCompletion.send('COMMIT; \\echo ACTION_FIRST_DONE\n');
  actionBeforeCompletion.close(); completionAfterAction.close();
  await Promise.all([actionBeforeCompletion.exited, completionAfterAction.exited]);
  assert.match(completionAfterAction.output(), /"ok": true/);
  assert.equal(sql(`SELECT status || ':' || (SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id)
    || ':' || (SELECT terminal_revision FROM public.match_scores WHERE room_id=rooms.id)
    FROM public.rooms WHERE id='42000000-0000-4000-8000-000000000009';`).trim(), 'finished:1:1');

  // Supported legacy v1 admission shares the same room lock with completion.
  // Collect all three outcomes before asserting so a pre-fix RED reports both
  // append-after-finish defects and the coherent action-first control together.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players,winner) VALUES
    ('42000000-0000-4000-8000-00000000000c','FLC1',1,'finished','{"rounds":1}',
      '[{"id":"late-v1-a","name":"A"},{"id":"late-v1-b","name":"B"}]','p1');`);
  assert.equal(sql(`SELECT pg_get_function_result(p.oid) || ':' || p.prosecdef::text || ':'
      || (p.proconfig IS NULL)::text
    FROM pg_proc p
    WHERE p.oid='public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)'::regprocedure;`).trim(),
  'integer:false:true', 'the replacement preserves the v1 scalar API, SECURITY INVOKER, and default search path');
  assert.equal(sql(`SELECT has_function_privilege('service_role',
      'public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)','EXECUTE')::text || ':'
      || has_function_privilege('anon',
      'public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)','EXECUTE')::text || ':'
      || has_function_privilege('authenticated',
      'public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)','EXECUTE')::text;`).trim(),
  'true:false:false', 'the replacement preserves service-only execution');
  let lateLegacyRejected = false;
  try {
    sql(`SET ROLE service_role; SELECT public.submit_room_action(
      '42000000-0000-4000-8000-00000000000c','late-v1-a',
      '{"type":"move","delta":1}',false,0,0);`);
  } catch {
    lateLegacyRejected = true;
  }
  const lateLegacyCount = Number(sql(`SELECT count(*) FROM public.room_actions
    WHERE room_id='42000000-0000-4000-8000-00000000000c';`).trim());

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-00000000000d','FLC2',1,'active','{"rounds":1}',
      '[{"id":"finish-v1-a","name":"A"},{"id":"finish-v1-b","name":"B"}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-00000000000d','finish-v1-a','finish-v1-token');`);
  const legacyCompletionFirst = openPsqlSession('legacy-completion-first');
  legacyCompletionFirst.send(`BEGIN; SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-00000000000d','finish-v1-a','finish-v1-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');
    \\echo LEGACY_COMPLETION_LOCKED\n`);
  await legacyCompletionFirst.waitFor('LEGACY_COMPLETION_LOCKED');
  const legacyCommandAfterCompletion = openPsqlSession('legacy-command-after-completion');
  legacyCommandAfterCompletion.send(`BEGIN; SELECT status FROM public.rooms
    WHERE id='42000000-0000-4000-8000-00000000000d'; \\echo LEGACY_COMMAND_SAW_ACTIVE\n`);
  await legacyCommandAfterCompletion.waitFor('LEGACY_COMMAND_SAW_ACTIVE');
  legacyCommandAfterCompletion.send(`SET LOCAL ROLE service_role; SELECT public.submit_room_action(
    '42000000-0000-4000-8000-00000000000d','finish-v1-a','{"type":"move","delta":1}',false,0,0);
    COMMIT; \\echo LEGACY_COMMAND_AFTER_COMPLETION_DONE\n`);
  await waitForBlockedBy(legacyCommandAfterCompletion, legacyCompletionFirst, 'legacy-completion-first');
  legacyCompletionFirst.send('COMMIT; \\echo LEGACY_COMPLETION_FIRST_DONE\n');
  legacyCompletionFirst.close(); legacyCommandAfterCompletion.close();
  const legacyCompletionSettlements = await Promise.allSettled([
    legacyCompletionFirst.exited, legacyCommandAfterCompletion.exited,
  ]);
  const legacyCompletionFirstState = sql(`SELECT status || ':'
    || (SELECT terminal_revision FROM public.match_scores WHERE room_id=rooms.id) || ':'
    || (SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id)
    FROM public.rooms WHERE id='42000000-0000-4000-8000-00000000000d';`).trim();

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-00000000000e','FLC3',1,'active','{"rounds":1}',
      '[{"id":"action-v1-a","name":"A"},{"id":"action-v1-b","name":"B"}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-00000000000e','action-v1-a','action-v1-token');`);
  const legacyActionFirst = openPsqlSession('legacy-action-first');
  legacyActionFirst.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.submit_room_action(
    '42000000-0000-4000-8000-00000000000e','action-v1-a','{"type":"move","delta":1}',false,0,0);
    \\echo LEGACY_ACTION_LOCKED\n`);
  await legacyActionFirst.waitFor('LEGACY_ACTION_LOCKED');
  const legacyCompletionAfterAction = openPsqlSession('legacy-completion-after-action');
  legacyCompletionAfterAction.send(`BEGIN; SELECT status FROM public.rooms
    WHERE id='42000000-0000-4000-8000-00000000000e'; \\echo LEGACY_COMPLETION_SAW_ACTIVE\n`);
  await legacyCompletionAfterAction.waitFor('LEGACY_COMPLETION_SAW_ACTIVE');
  legacyCompletionAfterAction.send(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-00000000000e','action-v1-a','action-v1-token','p1',1,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0}]');
    COMMIT; \\echo LEGACY_COMPLETION_AFTER_ACTION_DONE\n`);
  await waitForBlockedBy(legacyCompletionAfterAction, legacyActionFirst, 'legacy-action-first');
  legacyActionFirst.send('COMMIT; \\echo LEGACY_ACTION_FIRST_DONE\n');
  legacyActionFirst.close(); legacyCompletionAfterAction.close();
  await Promise.all([legacyActionFirst.exited, legacyCompletionAfterAction.exited]);
  const legacyActionFirstState = sql(`SELECT status || ':'
    || (SELECT terminal_revision FROM public.match_scores WHERE room_id=rooms.id) || ':'
    || (SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id)
    FROM public.rooms WHERE id='42000000-0000-4000-8000-00000000000e';`).trim();

  assert.deepEqual({
    lateLegacyRejected,
    lateLegacyCount,
    completionFirstCommandRejected: legacyCompletionSettlements[1].status === 'rejected',
    legacyCompletionFirstState,
    legacyActionFirstState,
  }, {
    lateLegacyRejected: true,
    lateLegacyCount: 0,
    completionFirstCommandRejected: true,
    legacyCompletionFirstState: 'finished:0:0',
    legacyActionFirstState: 'finished:1:1',
  }, 'legacy v1 actions and completion must exclude each other under the shared room lock');

  // Winner derivation is strict for draws and alternating-seat teams.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('42000000-0000-4000-8000-00000000000a','FIND',1,'active','{"rounds":1,"teamMode":false}',
      '[{"id":"draw-a","name":"A"},{"id":"draw-b","name":"B"}]'),
    ('42000000-0000-4000-8000-00000000000b','FINT',1,'active','{"rounds":3,"teamMode":true}',
      '[{"id":"team-a","name":"A"},{"id":"team-b","name":"B"},{"id":"team-c","name":"C"},{"id":"team-d","name":"D"}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('42000000-0000-4000-8000-00000000000a','draw-a','draw-token'),
      ('42000000-0000-4000-8000-00000000000b','team-a','team-token');`);
  const drawReceipt = sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-00000000000a','draw-a','draw-token',NULL,1,
    '[{"tankId":"p1","playerName":"A","roundWins":0,"kills":0,"totalDamage":10},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":10}]');`).trim();
  assert.match(drawReceipt, /"winnerId": null/, 'draw receipts must retain an explicit null winner');
  assert.match(sql(`SELECT public.finish_casual_match_v1(
    '42000000-0000-4000-8000-00000000000b','team-a','team-token','p1',3,
    '[{"tankId":"p1","playerName":"A","roundWins":1,"kills":1,"totalDamage":50},{"tankId":"p2","playerName":"B","roundWins":0,"kills":0,"totalDamage":0},{"tankId":"p3","playerName":"C","roundWins":1,"kills":1,"totalDamage":50},{"tankId":"p4","playerName":"D","roundWins":0,"kills":0,"totalDamage":0}]');`),
  /"ok": true/, 'team winner derives from the alternating-seat team total');

  // The verified evidence store is separate and unchanged by casual completion.
  assert.equal(sql('SELECT count(*) FROM public.verified_match_results;').trim(), '0');

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
  console.log('PostgreSQL regressions PASS: atomic v1/v2 action and casual completion receipts, synchronized action/finish orderings, rollback, immutable retry, legacy repair, ACL, rematch, verified start/resume.');
} finally {
  if (started) docker(['rm', '--force', name]);
}

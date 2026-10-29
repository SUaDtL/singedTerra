// Run directly with Node. Uses an isolated PostgreSQL 15 container with no ports.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Docker Official Image library/postgres, already pinned by database-postgres.mjs.
const image = 'postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b';
const name = `singedterra-room-lifecycle-${process.pid}-${Date.now()}`;
const migration023 = resolve(root, 'supabase/migrations/023_room_lifecycle.sql');
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const sql = (input) => docker(
  ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
  { input },
);
const file = (path) => sql(readFileSync(resolve(root, path), 'utf8'));
const json = (query) => JSON.parse(sql(query).trim().split(/\r?\n/).at(-1));
const scalar = (query) => sql(query).trim().split(/\r?\n/).at(-1) ?? '';

const assertPublicRoutineAcl = () => {
  // Owner-scoped delivery guard, not a global database/default-privilege change.
  // Include every overload created by the migration role; pgcrypto and other
  // extension members deliberately keep their independently managed grants.
  const unsafe = json(`SELECT COALESCE(jsonb_agg(signature ORDER BY signature),'[]'::jsonb)
    FROM (SELECT p.oid::regprocedure::text AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
          AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e')
        AND (EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
          OR has_function_privilege('anon',p.oid,'EXECUTE')
          OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) routines;`);
  assert.deepEqual(unsafe, [], 'Application public routine ACL must deny browser callers');
};

const openPsqlSession = (label) => {
  const child = spawn('docker',
    ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { stdio: ['pipe', 'pipe', 'pipe'] });
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
    child.once('exit', (code) => code === 0
      ? resolveExit(stdout)
      : rejectExit(new Error(`${label} psql exited ${code}: ${stderr || stdout}`)));
  });
  const waitFor = async (marker) => {
    const deadline = Date.now() + 30_000;
    while (!stdout.includes(marker)) {
      if (Date.now() >= deadline) throw new Error(`${label} did not emit ${marker}: ${stderr || stdout}`);
      await new Promise((done) => {
        const timeout = setTimeout(done, 100);
        waiters.push(() => { clearTimeout(timeout); done(); });
      });
    }
  };
  return {
    send(input) { child.stdin.write(input); },
    close() { child.stdin.end(); },
    waitFor,
    async backendPid() {
      await waitFor('BACKEND_PID:');
      return Number(stdout.match(/BACKEND_PID:(\d+)/)?.[1]);
    },
    exited,
    output() { return stdout; },
  };
};

const waitForBlockedBy = async (waiter, holder, ordering) => {
  const [waiterPid, holderPid] = await Promise.all([waiter.backendPid(), holder.backendPid()]);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (sql(`SELECT COALESCE(${holderPid}=ANY(pg_blocking_pids(${waiterPid})),false)::text;`).trim() === 'true') return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`${ordering}: waiter ${waiterPid} never blocked behind ${holderPid}`);
};

const players = (a, b = null) => JSON.stringify([
  { id: a, name: 'Human A', color: '#f00', ready: true },
  ...(b ? [{ id: b, name: 'Human B', color: '#0f0', ready: true }] : []),
  { id: `${a}-bot`, name: 'CPU', color: '#00f', ready: true, ai: 'hard' },
]);
const humans = (a, b) => JSON.stringify([
  { id: a, name: 'Human A', color: '#f00', ready: true },
  { id: b, name: 'Human B', color: '#0f0', ready: true },
]);
const options = JSON.stringify({ rounds: 1, teamMode: false, rulesetVersion: 4,
  commandProtocolVersion: 2, roomLifecycleVersion: 1 });

let started = false;
try {
  docker(['run', '--detach', '--name', name, '--network', 'none',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  for (let attempt = 0; ; attempt++) {
    try {
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-t', '1'],
        { timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt >= 29) throw error;
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`);
  // Apply the complete inventory so a future migration cannot silently sit
  // outside the routine-ACL delivery guard. Auth here is only a schema fixture.
  const migrationFiles = readdirSync(resolve(root, 'supabase/migrations'))
    .filter(path => path.endsWith('.sql')).sort();
  for (const migration of migrationFiles) {
    assert.match(migration, /^\d{3}_[a-z0-9_]+\.sql$/, 'unexpected SQL migration must not be silently excluded');
  }
  for (const migration of migrationFiles.filter(path => path < '023_')) {
    file(`supabase/migrations/${migration}`);
  }
  sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_seats TO service_role;
    GRANT SELECT, INSERT ON public.room_actions TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.match_scores TO service_role;`);

  if (!existsSync(migration023)) {
    // Causal RED against the current production cleanup path. The room is old,
    // opted into lifecycle v1, has no present human, and contains durable game
    // history. Migration 009 protects it from the waiting-room reaper, leaving
    // an abandoned active room forever. The failure is the observed state, not
    // a missing function, column, migration, or import.
    sql(`INSERT INTO public.rooms(id,code,seed,status,options,players,created_at)
      VALUES ('61000000-0000-4000-8000-000000000001','RED1',1,'active',
        '${options}'::jsonb,
        '[{"id":"red-human","name":"Human","color":"#f00","ready":true,"lastSeen":0},{"id":"red-bot","name":"CPU","color":"#00f","ready":true,"ai":"hard"}]',
        now()-interval '1 hour');
      INSERT INTO public.room_seats(room_id,seat_id,token,created_at) VALUES
        ('61000000-0000-4000-8000-000000000001','red-human','red-token',now()-interval '1 hour');
      INSERT INTO public.room_actions(room_id,seq,player_id,action) VALUES
        ('61000000-0000-4000-8000-000000000001',0,'red-human','{"type":"move","delta":1}');
      SET ROLE service_role;
      SELECT public.apply_room_reap(
        ARRAY['61000000-0000-4000-8000-000000000001']::uuid[], '[]'::jsonb);
      RESET ROLE;`);
    const state = json(`SELECT jsonb_build_object(
      'status',status,'players',jsonb_array_length(players),
      'actions',(SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id),
      'seats',(SELECT count(*) FROM public.room_seats WHERE room_id=rooms.id))
      FROM public.rooms WHERE id='61000000-0000-4000-8000-000000000001';`);
    assert.equal(state.status, 'finished',
      `causal RED: stale eligible active room remains ${state.status} after the existing cleanup path; ` +
      `durable state is still ${state.players} players/${state.actions} actions/${state.seats} seats`);
    throw new Error('baseline unexpectedly supplied room lifecycle retirement');
  }

  file('supabase/migrations/023_room_lifecycle.sql');
  for (const migration of migrationFiles.filter(path => path > '023_room_lifecycle.sql')) {
    file(`supabase/migrations/${migration}`);
  }

  // B047: a new signature obtains PUBLIC EXECUTE even when the old overload
  // was revoked. Demonstrate real anonymous execution, then require the guard
  // to catch both a new function and an overload. These are disposable fixtures.
  assertPublicRoutineAcl();
  const routineAclBefore = scalar(`SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) ORDER BY oid)
    FROM pg_proc WHERE pronamespace='public'::regnamespace;`);
  sql(`CREATE FUNCTION public.maintenance_acl_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 7 $$;
    CREATE FUNCTION public.update_room_player(integer) RETURNS integer LANGUAGE sql AS $$ SELECT $1 $$;`);
  assert.equal(scalar(`SET ROLE anon; SELECT public.maintenance_acl_probe();`), '7');
  assert.equal(scalar(`SET ROLE authenticated; SELECT public.update_room_player(9);`), '9');
  assert.throws(assertPublicRoutineAcl, error => /Application public routine ACL/.test(error.message)
    && /maintenance_acl_probe\(\)/.test(error.message) && /update_room_player\(integer\)/.test(error.message),
    'ACL guard must detect newly-created public function and overload');
  sql(`REVOKE ALL ON FUNCTION public.maintenance_acl_probe(), public.update_room_player(integer)
      FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.maintenance_acl_probe(), public.update_room_player(integer) TO service_role;`);
  assertPublicRoutineAcl();
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`SET ROLE ${role}; SELECT public.maintenance_acl_probe();`), /permission denied for function maintenance_acl_probe/);
    assert.throws(() => sql(`SET ROLE ${role}; SELECT public.update_room_player(9);`), /permission denied for function update_room_player/);
  }
  assert.equal(scalar(`SET ROLE service_role; SELECT public.maintenance_acl_probe() + public.update_room_player(9);`), '16');
  // An explicit browser-role grant is also unsafe, even with PUBLIC revoked.
  sql(`GRANT EXECUTE ON FUNCTION public.maintenance_acl_probe() TO authenticated;`);
  assert.throws(assertPublicRoutineAcl, /Application public routine ACL/);
  sql(`REVOKE EXECUTE ON FUNCTION public.maintenance_acl_probe() FROM authenticated;`);
  assertPublicRoutineAcl();
  sql(`DROP FUNCTION public.maintenance_acl_probe(); DROP FUNCTION public.update_room_player(integer);`);
  assert.equal(scalar(`SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) ORDER BY oid)
    FROM pg_proc WHERE pronamespace='public'::regnamespace;`), routineAclBefore,
  'authorization fixtures must not alter existing routine grants');
  assert.ok(Number(scalar(`SELECT count(*) FROM pg_proc p JOIN pg_depend d ON d.objid=p.oid
    WHERE p.pronamespace='public'::regnamespace AND d.classid='pg_proc'::regclass
      AND d.refclassid='pg_extension'::regclass AND d.deptype='e';`)) > 0,
  'the guard must run in a schema containing deliberately excluded extension routines');
  // Its boundary is this role's public application routines, not all schemas or
  // all future owners. Demonstrate both exclusions without changing defaults.
  sql(`CREATE SCHEMA maintenance_private_probe;
    CREATE FUNCTION maintenance_private_probe.probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE ROLE maintenance_other_owner;
    GRANT USAGE,CREATE ON SCHEMA public TO maintenance_other_owner;
    SET ROLE maintenance_other_owner;
    CREATE FUNCTION public.maintenance_other_owner_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    RESET ROLE;`);
  assertPublicRoutineAcl();
  sql(`DROP FUNCTION public.maintenance_other_owner_probe();
    REVOKE USAGE,CREATE ON SCHEMA public FROM maintenance_other_owner; DROP ROLE maintenance_other_owner;
    DROP FUNCTION maintenance_private_probe.probe(); DROP SCHEMA maintenance_private_probe;`);
  assertPublicRoutineAcl();

  // B048/B060: live metadata corrects the historical prose without rewriting
  // applied migrations or implying that the thin referee runs engine physics.
  assert.equal(scalar(`SELECT obj_description('public.submit_room_action(uuid,text,jsonb,boolean,integer,integer)'::regprocedure,'pg_proc');`),
    'Historical SECURITY INVOKER routine: service_role bypasses RLS; EXECUTE ACLs, not RLS, bounded application access. Migration 023 revoked EXECUTE from PUBLIC, anon, authenticated and service_role. Live legacy submissions use submit_room_action_for_seat with seat and locked-turn checks.');
  assert.equal(scalar(`SELECT col_description('public.rooms'::regclass,attnum) FROM pg_attribute
    WHERE attrelid='public.rooms'::regclass AND attname='active_player_index';`),
    'classification: PUBLIC - client-reported successor cursor persisted by the thin referee and used for current-actor gating (ADR-0008); not a seat credential. Clients retain engine turn-order authority; the referee does not validate physics, aliveness or round phase.');
  assert.equal(scalar(`SELECT col_description('public.rooms'::regclass,attnum) FROM pg_attribute
    WHERE attrelid='public.rooms'::regclass AND attname='turn';`),
    'classification: PUBLIC - monotonic referee turn counter used to reject stale legacy submissions under the room lock; not a seat credential or server-authoritative engine state.');
  console.log(`Public routine ACL guard PASS: ${migrationFiles.length} migrations, current owner, extension exclusion, new-function/overload and explicit-role negative controls; forward metadata comments verified.`);

  // Two handlers can have authorized the same captured turn before either
  // transaction obtains the lock. Both human and CPU-proxy requests must be
  // checked against the current turn under that lock, not just assigned seqs.
  for (const proxy of [false, true]) {
    const id = proxy ? '65000000-0000-4000-8000-000000000002' : '65000000-0000-4000-8000-000000000001';
    const actor = proxy ? 'race-a-bot' : 'race-a';
    const active = proxy ? 2 : 0;
    sql(`INSERT INTO public.rooms(id,code,seed,status,options,players,active_player_index,turn)
      VALUES('${id}','${proxy ? 'LGC2' : 'LGC1'}',1,'active',
        '{"maxPlayers":3,"commandProtocolVersion":1}','${players('race-a','race-b')}',${active},7);
      INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
        ('${id}','race-a','race-token-a'),('${id}','race-b','race-token-b');`);
    const first = openPsqlSession(`legacy-${proxy}-first`);
    first.send(`BEGIN; SELECT id FROM public.rooms WHERE id='${id}' FOR UPDATE;
      \\echo LEGACY_LOCKED\n`);
    await first.waitFor('LEGACY_LOCKED');
    const second = openPsqlSession(`legacy-${proxy}-second`);
    const secondResult = second.exited.then(() => ({ rejected: false }), error => ({ rejected: true, error }));
    second.send(`SET ROLE service_role; SELECT public.submit_room_action_for_seat(
      '${id}','${proxy ? 'race-b' : 'race-a'}','${proxy ? 'race-token-b' : 'race-token-a'}','${actor}',
      '{"type":"fire","angle":45,"power":50,"weapon":"baby_missile"}',true,1,8);\n`);
    await waitForBlockedBy(second, first, `legacy-${proxy}`);
    first.send(`SET LOCAL ROLE service_role; SELECT public.submit_room_action_for_seat(
      '${id}','race-a','race-token-a','${actor}',
      '{"type":"fire","angle":45,"power":50,"weapon":"baby_missile"}',true,1,8);
      COMMIT;\n`);
    first.close(); second.close();
    await first.exited;
    const loser = await secondResult;
    assert.equal(scalar(`SELECT count(*) FROM public.room_actions WHERE room_id='${id}';`), '1',
      `same captured legacy ${proxy ? 'CPU' : 'human'} turn must append only once`);
    assert.equal(loser.rejected, true, 'the stale request must be refused');
    assert.match(String(loser.error), /stale legacy turn/);
    assert.equal(scalar(`SELECT turn || ':' || active_player_index FROM public.rooms WHERE id='${id}';`), '8:1');
  }

  // Preserve the legacy ROUND_OVER per-seat shop and membership-only next-round
  // exceptions. A stale normal actor and forged shop actor still append nothing.
  const legacyId = '65000000-0000-4000-8000-000000000001';
  const legacyAction = (actor, action) => `SET ROLE service_role;
    SELECT public.submit_room_action_for_seat('${legacyId}','race-a','race-token-a',
    '${actor}','${JSON.stringify(action)}',false,1,8);`;
  assert.equal(scalar(legacyAction('race-a', { type: 'buy', weapon: 'baby_missile', tankId: 'p1' })), '1');
  assert.equal(scalar(legacyAction('race-a-bot', { type: 'buy', accessory: 'battery', tankId: 'p3' })), '2');
  assert.equal(scalar(legacyAction('race-a', { type: 'next_round' })), '3');
  for (const [action, error] of [
    [{ type: 'move', delta: 1 }, /stale legacy turn/],
    [{ type: 'buy', weapon: 'baby_missile', tankId: 'p2' }, /actor unavailable/],
  ]) {
    assert.throws(() => sql(legacyAction('race-a', action)), error);
    assert.equal(scalar(`SELECT count(*) FROM public.room_actions WHERE room_id='${legacyId}';`), '4');
  }

  // Real boundary replacement for the six retired applyPlayerUpdate helper
  // assertions: errors, self-name, trim/color/lease, other-seat preservation,
  // and bounded loadout replacement. Refusals leave both roster and lease alone.
  const editId = '66000000-0000-4000-8000-000000000001';
  const baseRoster = [
    { id: 'edit-a', name: 'Ana', color: '#f00', ready: false, lastSeen: 1 },
    { id: 'edit-b', name: 'Bo', color: '#0f0', ready: false, lastSeen: 2 },
  ];
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('${editId}','EDT1',1,'waiting','{"maxPlayers":4,"roomLifecycleVersion":1}','${JSON.stringify(baseRoster)}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
    ('${editId}','edit-a','edit-token-a'),('${editId}','edit-b','edit-token-b'),('${editId}','ghost','ghost-token');`);
  const edit = (changes, player = 'edit-a', token = 'edit-token-a') => json(`SET ROLE service_role;
    SELECT public.update_room_player('${editId}','${player}','${token}','${JSON.stringify(changes)}');`);
  const editState = () => json(`SELECT jsonb_build_object('players',players,'leases',
    (SELECT jsonb_agg(jsonb_build_object('id',seat_id,'seen',last_seen_at) ORDER BY seat_id)
      FROM public.room_seats WHERE room_id=rooms.id)) FROM public.rooms WHERE id='${editId}';`);
  for (const [changes, player, token, error] of [
    [{ name: 'X' }, 'ghost', 'ghost-token', 'player_not_in_room'],
    [{ name: '  bo  ' }, 'edit-a', 'edit-token-a', 'name_conflict'],
    [{ color: '#0f0' }, 'edit-a', 'edit-token-a', 'color_conflict'],
    [{ name: 'X' }, 'edit-a', 'wrong-token', 'invalid_seat_token'],
  ]) {
    const before = editState();
    assert.deepEqual(edit(changes, player, token), { ok: false, error });
    assert.deepEqual(editState(), before);
  }
  for (const changes of [null, [], {}, { ready: true }, { name: '' }, { color: 'red' },
    { loadout: null }, { loadout: { treads: 'bad', hull: 'foundry', turret: 'foundry', barrel: 'foundry' } }]) {
    const before = editState();
    assert.deepEqual(edit(changes), { ok: false, error: 'invalid_changes' });
    assert.deepEqual(editState(), before);
  }
  const sameName = edit({ name: 'Ana' });
  assert.equal(sameName.ok, true);
  assert.equal(sameName.players[0].name, 'Ana');
  assert.ok(sameName.players[0].lastSeen > 1);
  const changed = edit({ name: '  Cy  ', color: '#00f' });
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.players[0], { ...baseRoster[0], name: 'Cy', color: '#00f', lastSeen: changed.players[0].lastSeen });
  assert.deepEqual(changed.players[1], baseRoster[1]);
  const loadout = { treads: 'jackal', hull: 'bulwark', turret: 'foundry', barrel: 'jackal' };
  const equipped = edit({ loadout });
  assert.equal(equipped.ok, true);
  assert.deepEqual(equipped.players[0].loadout, loadout);
  assert.notEqual(equipped.players[0].loadout, loadout);
  assert.deepEqual(equipped.players[1], baseRoster[1]);
  assert.equal(scalar(`SELECT (floor(extract(epoch FROM s.last_seen_at)*1000)=(r.players->0->>'lastSeen')::numeric)::text
    FROM public.room_seats s JOIN public.rooms r ON r.id=s.room_id WHERE r.id='${editId}' AND s.seat_id='edit-a';`), 'true');

  // Same lock order as the live ready/start/join/leave/edit/revoke transactions.
  // Prove actual blocking with pg_blocking_pids, then inspect committed rows.
  for (const [index, transition] of ['ready', 'start', 'join', 'leave', 'edit', 'revoke'].entries()) {
    const id = `67000000-0000-4000-8000-00000000000${index}`;
    const roster = baseRoster.map(p => ({ ...p, ready: transition === 'start' && p.id === 'edit-b' }));
    sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
      ('${id}','ER${index}X',1,'waiting','{"maxPlayers":4,"roomLifecycleVersion":1}','${JSON.stringify(roster)}');
      INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('${id}','edit-a','edit-token-a'),('${id}','edit-b','edit-token-b');`);
    const holder = openPsqlSession(`${transition}-before-edit`);
    holder.send(`BEGIN; SELECT id FROM public.rooms WHERE id='${id}' FOR UPDATE; \\echo EDIT_LOCKED\n`);
    await holder.waitFor('EDIT_LOCKED');
    const waiter = openPsqlSession(`edit-after-${transition}`);
    waiter.send(`SET ROLE service_role; SELECT public.update_room_player('${id}','edit-a','edit-token-a','{"name":"Updated A"}');\n`);
    await waitForBlockedBy(waiter, holder, `${transition}-before-edit`);
    const mutation = {
      ready: `SELECT public.room_lifecycle('${id}','edit-b','edit-token-b','ready');`,
      start: `SELECT public.room_lifecycle('${id}','edit-a','edit-token-a','ready');`,
      join: `SELECT public.admit_room_seat('${id}','${JSON.stringify(roster)}',
        '${JSON.stringify([...roster, { id: 'edit-c', name: 'C', color: '#abc', ready: false }])}','edit-c','edit-token-c');`,
      leave: `SELECT public.room_lifecycle('${id}','edit-b','edit-token-b','leave');`,
      edit: `SELECT public.update_room_player('${id}','edit-b','edit-token-b','{"name":"Updated B"}');`,
      revoke: `DELETE FROM public.room_seats WHERE room_id='${id}' AND seat_id='edit-a';`,
    }[transition];
    holder.send(`SET LOCAL ROLE service_role; ${mutation} COMMIT;\n`);
    holder.close(); waiter.close();
    await Promise.all([holder.exited, waiter.exited]);
    const result = JSON.parse(waiter.output().trim().split(/\r?\n/).at(-1));
    const state = json(`SELECT jsonb_build_object('status',status,'players',players) FROM public.rooms WHERE id='${id}';`);
    if (transition === 'start' || transition === 'revoke') {
      assert.deepEqual(result, { ok: false, error: transition === 'start' ? 'room_not_waiting' : 'invalid_seat_token' });
      assert.equal(state.players[0].name, 'Ana');
      if (transition === 'start') {
        assert.equal(state.status, 'active');
        assert.equal(state.players.every(p => p.ready), true);
      }
    } else {
      assert.equal(result.ok, true);
      assert.equal(state.status, 'waiting');
      assert.equal(state.players[0].name, 'Updated A');
      if (transition === 'ready') assert.equal(state.players[1].ready, true);
      if (transition === 'join') {
        assert.deepEqual(state.players[2], { id: 'edit-c', name: 'C', color: '#abc', ready: false });
        assert.equal(scalar(`SELECT count(*) FROM public.room_seats WHERE room_id='${id}' AND seat_id='edit-c';`), '1');
      }
      if (transition === 'leave') assert.equal(state.players.length, 1);
      if (transition === 'edit') assert.equal(state.players[1].name, 'Updated B');
    }
  }
  for (const signature of ['update_room_player(uuid,text,text,jsonb)',
    'submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer)']) {
    assert.equal(scalar(`SELECT has_function_privilege('service_role','public.${signature}','EXECUTE')::text || ':' ||
      has_function_privilege('anon','public.${signature}','EXECUTE')::text || ':' ||
      has_function_privilege('authenticated','public.${signature}','EXECUTE')::text;`), 'true:false:false');
    assert.equal(scalar(`SELECT (prosecdef AND proconfig @> ARRAY['search_path=""','lock_timeout=3s'])::text
      FROM pg_proc WHERE oid='public.${signature}'::regprocedure;`), 'true');
  }
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`SET ROLE ${role}; SELECT public.update_room_player('${editId}','edit-a','edit-token-a','{"name":"Denied"}');`), /permission denied for function update_room_player/);
  }
  console.log('Atomic mutation regressions PASS: real human/CPU stale-turn races; legacy shop; player validation, ACL and ready/start/join/leave/edit/revocation races.');

  // The contract is service-only and uses a fixed, hardened search path.
  assert.equal(sql(`SELECT has_function_privilege('service_role',
      'public.room_lifecycle(uuid,text,text,text)','EXECUTE')::text || ':' ||
      has_function_privilege('anon','public.room_lifecycle(uuid,text,text,text)','EXECUTE')::text || ':' ||
      has_function_privilege('authenticated','public.room_lifecycle(uuid,text,text,text)','EXECUTE')::text || ':' ||
      has_function_privilege('service_role','public.expire_abandoned_rooms()','EXECUTE')::text || ':' ||
      has_function_privilege('anon','public.expire_abandoned_rooms()','EXECUTE')::text || ':' ||
      has_function_privilege('authenticated','public.expire_abandoned_rooms()','EXECUTE')::text;`).trim(),
  'true:false:false:true:false:false');
  assert.equal(sql(`SELECT bool_and(p.prosecdef AND EXISTS (
      SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'))::text
    FROM pg_proc p WHERE p.oid IN (
      'public.room_lifecycle(uuid,text,text,text)'::regprocedure,
      'public.admit_room_seat(uuid,jsonb,jsonb,text,text)'::regprocedure,
      'public.expire_abandoned_rooms()'::regprocedure);`).trim(), 'true');
  assert.equal(sql(`SELECT has_function_privilege('service_role',
      'public.admit_room_seat(uuid,jsonb,jsonb,text,text)','EXECUTE')::text || ':' ||
      has_function_privilege('anon','public.admit_room_seat(uuid,jsonb,jsonb,text,text)','EXECUTE')::text || ':' ||
      has_function_privilege('authenticated','public.admit_room_seat(uuid,jsonb,jsonb,text,text)','EXECUTE')::text;`).trim(),
  'true:false:false');

  // Join admission compares the caller's waiting-room roster under the same
  // room lock as the player update and secret seat insert. A stale retry cannot
  // overwrite the admitted roster or mint another credential.
  const joinBefore = JSON.stringify([{ id: 'join-a', name: 'A', color: '#f00', ready: false }]);
  const joinAfter = JSON.stringify([
    { id: 'join-a', name: 'A', color: '#f00', ready: false },
    { id: 'join-b', name: 'B', color: '#0f0', ready: false },
  ]);
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000000','JON1',1,'waiting',
      '{"maxPlayers":2,"roomLifecycleVersion":1}','${joinBefore}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000000','join-a','join-token-a');`);
  const admitted = json(`SET ROLE service_role; SELECT public.admit_room_seat(
    '62000000-0000-4000-8000-000000000000','${joinBefore}','${joinAfter}',
    'join-b','join-token-b');`);
  assert.equal(admitted.ok, true);
  const staleAdmission = json(`SET ROLE service_role; SELECT public.admit_room_seat(
    '62000000-0000-4000-8000-000000000000','${joinBefore}',
    '${JSON.stringify([...JSON.parse(joinAfter), { id: 'join-c', name: 'C' }])}',
    'join-c','join-token-c');`);
  assert.equal(staleAdmission.ok, false);
  assert.equal(sql(`SELECT jsonb_array_length(players) || ':' ||
      (SELECT count(*) FROM public.room_seats WHERE room_id=rooms.id) || ':' ||
      (SELECT count(*) FROM public.room_seats WHERE room_id=rooms.id AND seat_id='join-c')
    FROM public.rooms WHERE code='JON1';`).trim(), '2:2:0');

  // Inserts and waiting->active transitions initialize leases at the database
  // clock. Unauthorized requests cannot refresh, leave, ready, or start a room.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000001','AUT1',1,'active','${options}',
      '${players('auth-a','auth-b')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000001','auth-a','auth-token-a'),
      ('62000000-0000-4000-8000-000000000001','auth-b','auth-token-b');`);
  assert.equal(sql(`SELECT (lifecycle_started_at IS NOT NULL AND
      (SELECT bool_and(last_seen_at >= lifecycle_started_at) FROM public.room_seats
       WHERE room_id=rooms.id))::text FROM public.rooms
      WHERE id='62000000-0000-4000-8000-000000000001';`).trim(), 'true');
  const beforeUnauthorized = sql(`SELECT last_seen_at::text || ':' || COALESCE(left_at::text,'')
    FROM public.room_seats WHERE room_id='62000000-0000-4000-8000-000000000001'
    AND seat_id='auth-a';`).trim();
  const unauthorized = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000001','auth-a','wrong-token','heartbeat');`);
  assert.equal(unauthorized.ok, false);
  assert.equal(sql(`SELECT last_seen_at::text || ':' || COALESCE(left_at::text,'')
    FROM public.room_seats WHERE room_id='62000000-0000-4000-8000-000000000001'
    AND seat_id='auth-a';`).trim(), beforeUnauthorized);

  // The credentialed legacy wire path remains functional for both the human
  // submitter and a valid CPU proxy. After that human leaves, the same token
  // receives the exact authorization failure and appends no canonical row.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-00000000000e','V1P1',1,'active','${options}',
      '${players('v1-a','v1-b')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-00000000000e','v1-a','v1-token-a'),
      ('62000000-0000-4000-8000-00000000000e','v1-b','v1-token-b');`);
  assert.equal(scalar(`SET ROLE service_role; SELECT public.submit_room_action_for_seat(
    '62000000-0000-4000-8000-00000000000e','v1-a','v1-token-a','v1-a',
    '{"type":"move","delta":1}',false,0,0);`).trim(), '0');
  // A CPU proxy remains legal on that CPU's turn; the previous fixture called
  // this while the human was active and therefore exercised the old lock gap.
  sql(`UPDATE public.rooms SET active_player_index=2 WHERE code='V1P1';`);
  assert.equal(scalar(`SET ROLE service_role; SELECT public.submit_room_action_for_seat(
    '62000000-0000-4000-8000-00000000000e','v1-a','v1-token-a','v1-a-bot',
    '{"type":"move","delta":1}',false,0,0);`).trim(), '1');
  assert.equal(json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-00000000000e','v1-a','v1-token-a','leave');`).ok, true);
  let leftCpuProxyRejected = false;
  try {
    sql(`\\set VERBOSITY verbose
      SET ROLE service_role; SELECT public.submit_room_action_for_seat(
      '62000000-0000-4000-8000-00000000000e','v1-a','v1-token-a','v1-a-bot',
      '{"type":"move","delta":1}',false,0,0);`);
  } catch (error) {
    assert.match(String(error.stderr ?? ''), /ERROR:\s+42501: seat unavailable/);
    leftCpuProxyRejected = true;
  }
  assert.deepEqual({
    leftCpuProxyRejected,
    rows: json(`SELECT jsonb_agg(jsonb_build_object('seq',seq,'playerId',player_id) ORDER BY seq)
      FROM public.room_actions WHERE room_id='62000000-0000-4000-8000-00000000000e';`),
  }, {
    leftCpuProxyRejected: true,
    rows: [{ seq: 0, playerId: 'v1-a' }, { seq: 1, playerId: 'v1-a-bot' }],
  });

  // One current human protects the room; bots never count as presence. The
  // exact cutoff expires, while a lease just inside ten minutes does not.
  sql(`UPDATE public.room_seats SET last_seen_at=CASE seat_id
      WHEN 'auth-a' THEN clock_timestamp()-interval '20 minutes'
      ELSE clock_timestamp() END
    WHERE room_id='62000000-0000-4000-8000-000000000001';
    SELECT public.expire_abandoned_rooms();`);
  assert.equal(sql(`SELECT status FROM public.rooms
    WHERE id='62000000-0000-4000-8000-000000000001';`).trim(), 'active');

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000002','BND1',1,'active','${options}','${players('boundary-a')}'),
    ('62000000-0000-4000-8000-000000000003','BND2',1,'active','${options}','${players('fresh-a')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000002','boundary-a','boundary-token'),
      ('62000000-0000-4000-8000-000000000003','fresh-a','fresh-token');`);
  const boundaryReceipt = json(`SET ROLE service_role; SELECT public.submit_room_command_v2(
    '62000000-0000-4000-8000-000000000002','boundary-a','boundary-token',
    2::smallint,'lifecycle-preserved-receipt',0,'boundary-a',
    '{"type":"move","delta":1}',NULL,false,4::smallint);`);
  assert.equal(boundaryReceipt.ok, true);
  sql(`UPDATE public.rooms SET lifecycle_started_at=clock_timestamp()-interval '1 hour'
      WHERE code IN ('BND1','BND2');
    UPDATE public.room_seats SET last_seen_at=CASE
      WHEN room_id='62000000-0000-4000-8000-000000000002' THEN clock_timestamp()-interval '10 minutes'
      ELSE clock_timestamp()-interval '9 minutes 59 seconds' END
      WHERE room_id IN ('62000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000003');
    SELECT public.expire_abandoned_rooms();`);
  assert.equal(sql(`SELECT string_agg(code || ':' || status,',' ORDER BY code) FROM public.rooms
    WHERE code IN ('BND1','BND2');`).trim(), 'BND1:finished,BND2:active');
  assert.equal(sql(`SELECT (abandoned_at IS NOT NULL)::text FROM public.rooms WHERE code='BND1';`).trim(), 'true');

  // Expiry retires rather than deletes, preserving roster, ordered actions,
  // seats, and the absence of any completion receipt or match award.
  assert.deepEqual(json(`SELECT jsonb_build_object(
      'players',jsonb_array_length(players),
      'actions',(SELECT count(*) FROM public.room_actions WHERE room_id=rooms.id),
      'seats',(SELECT count(*) FROM public.room_seats WHERE room_id=rooms.id),
      'receipts',(SELECT count(*) FROM public.match_scores WHERE room_id=rooms.id),
      'winner',winner,
      'intent',(SELECT intent_id FROM public.room_actions WHERE room_id=rooms.id))
      FROM public.rooms WHERE code='BND1';`),
  { players: 2, actions: 1, seats: 1, receipts: 0, winner: null,
    intent: 'lifecycle-preserved-receipt' });

  // Explicit leave is idempotent. A remaining human protects play; the last
  // human retires it immediately, and later heartbeat cannot reactivate it.
  const leaveA = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000001','auth-a','auth-token-a','leave');`);
  assert.equal(leaveA.ok, true);
  assert.equal(sql(`SELECT status FROM public.rooms WHERE code='AUT1';`).trim(), 'active');
  let leftCommandRejected = false;
  try {
    const leftCommand = json(`SET ROLE service_role; SELECT public.submit_room_command_v2(
      '62000000-0000-4000-8000-000000000001','auth-a','auth-token-a',
      2::smallint,'left-seat-command',0,'auth-a',
      '{"type":"move","delta":1}',NULL,false,4::smallint);`);
    leftCommandRejected = leftCommand.ok === false;
  } catch {
    leftCommandRejected = true;
  }
  let leftLegacyRejected = false;
  try {
    const hasCredentialedLegacy = sql(`SELECT (to_regprocedure(
      'public.submit_room_action_for_seat(uuid,text,text,text,jsonb,boolean,integer,integer)')
      IS NOT NULL)::text;`).trim() === 'true';
    const result = hasCredentialedLegacy
      ? sql(`\\set VERBOSITY verbose
          SET ROLE service_role; SELECT public.submit_room_action_for_seat(
          '62000000-0000-4000-8000-000000000001','auth-a','auth-token-a','auth-a',
          '{"type":"move","delta":1}',false,0,0);`).trim()
      : sql(`SET ROLE service_role; SELECT public.submit_room_action(
          '62000000-0000-4000-8000-000000000001','auth-a',
          '{"type":"move","delta":1}',false,0,0);`).trim();
    leftLegacyRejected = result === '';
  } catch (error) {
    assert.match(String(error.stderr ?? ''), /ERROR:\s+42501: seat unavailable/);
    leftLegacyRejected = true;
  }
  const leaveB = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000001','auth-b','auth-token-b','leave');`);
  const leaveBAgain = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000001','auth-b','auth-token-b','leave');`);
  assert.equal(leaveB.ok, true);
  assert.equal(leaveBAgain.ok, true);
  assert.equal(sql(`SELECT status || ':' || (abandoned_at IS NOT NULL)::text || ':' ||
    jsonb_array_length(players) FROM public.rooms WHERE code='AUT1';`).trim(), 'finished:true:3');
  let leftRematchRejected = false;
  try {
    const result = sql(`SET ROLE service_role; SELECT public.create_room_rematch(
      '62000000-0000-4000-8000-000000000001','auth-a',
      '62000000-0000-4000-8000-00000000000c','LFT1',2,'${options}','${players('auth-a','auth-b')}');`).trim();
    leftRematchRejected = result === '';
  } catch {
    leftRematchRejected = true;
  }

  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-00000000000d','LFC1',1,'active','${options}',
      '${humans('left-finish-a','left-finish-b')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-00000000000d','left-finish-a','left-finish-token-a'),
      ('62000000-0000-4000-8000-00000000000d','left-finish-b','left-finish-token-b');`);
  assert.equal(json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-00000000000d','left-finish-a','left-finish-token-a','leave');`).ok, true);
  let leftFirstCompletionRejected = false;
  try {
    const result = json(`SET ROLE service_role; SELECT public.finish_casual_match_v1(
      '62000000-0000-4000-8000-00000000000d','left-finish-a','left-finish-token-a','p1',1,
      '[{"tankId":"p1","playerName":"Human A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"Human B","roundWins":0,"kills":0,"totalDamage":0}]');`);
    leftFirstCompletionRejected = result.ok === false;
  } catch {
    leftFirstCompletionRejected = true;
  }
  assert.deepEqual({
    leftCommandRejected,
    leftCommandActions: Number(sql(`SELECT count(*) FROM public.room_actions
      WHERE room_id='62000000-0000-4000-8000-000000000001';`).trim()),
    leftLegacyRejected,
    leftRematchRejected,
    rematchPointer: sql(`SELECT COALESCE(rematch_room_id::text,'') FROM public.rooms
      WHERE id='62000000-0000-4000-8000-000000000001';`).trim(),
    successorCount: Number(sql(`SELECT count(*) FROM public.rooms WHERE code='LFT1';`).trim()),
    leftFirstCompletionRejected,
    completionRoomStatus: sql(`SELECT status FROM public.rooms WHERE code='LFC1';`).trim(),
    completionReceiptCount: Number(sql(`SELECT count(*) FROM public.match_scores
      WHERE room_id='62000000-0000-4000-8000-00000000000d';`).trim()),
  }, {
    leftCommandRejected: true,
    leftCommandActions: 0,
    leftLegacyRejected: true,
    leftRematchRejected: true,
    rematchPointer: '',
    successorCount: 0,
    leftFirstCompletionRejected: true,
    completionRoomStatus: 'active',
    completionReceiptCount: 0,
  }, 'a left seat retains history but cannot append v1/v2 actions, authorize a rematch, or mint a first completion receipt');
  const postLeaveHeartbeat = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000001','auth-b','auth-token-b','heartbeat');`);
  assert.equal(postLeaveHeartbeat.ok, false);
  assert.equal(sql(`SELECT status FROM public.rooms WHERE code='AUT1';`).trim(), 'finished');

  // A heartbeat that wins the room lock refreshes presence before the expiry
  // pass can decide eligibility. Expiry blocks, then leaves the room active.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-00000000000b','HBT1',1,'active','${options}',
      '${players('heartbeat-a')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-00000000000b','heartbeat-a','heartbeat-token');
    UPDATE public.rooms SET lifecycle_started_at=clock_timestamp()-interval '1 hour' WHERE code='HBT1';
    UPDATE public.room_seats SET last_seen_at=clock_timestamp()-interval '9 minutes 59 seconds'
      WHERE room_id='62000000-0000-4000-8000-00000000000b';`);
  const heartbeatFirst = openPsqlSession('heartbeat-first');
  heartbeatFirst.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-00000000000b','heartbeat-a','heartbeat-token','heartbeat');
    \\echo HEARTBEAT_LOCKED\n`);
  await heartbeatFirst.waitFor('HEARTBEAT_LOCKED');
  const expiryAfterHeartbeat = openPsqlSession('expiry-after-heartbeat');
  expiryAfterHeartbeat.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.expire_abandoned_rooms();
    COMMIT; \\echo EXPIRY_AFTER_HEARTBEAT_DONE\n`);
  // The bounded sweeper uses SKIP LOCKED: it completes without waiting, then a
  // later sweep sees the refreshed lease. The protected room remains active.
  await expiryAfterHeartbeat.waitFor('EXPIRY_AFTER_HEARTBEAT_DONE');
  heartbeatFirst.send('COMMIT; \\echo HEARTBEAT_DONE\n');
  heartbeatFirst.close(); expiryAfterHeartbeat.close();
  await Promise.all([heartbeatFirst.exited, expiryAfterHeartbeat.exited]);
  assert.equal(sql(`SELECT r.status || ':' || (s.last_seen_at > clock_timestamp()-interval '1 minute')::text || ':' ||
      (s.left_at IS NULL)::text FROM public.rooms r JOIN public.room_seats s ON s.room_id=r.id
    WHERE r.code='HBT1';`).trim(), 'active:true:true');

  // Ready owns the waiting-room lock and returns the authoritative roster plus
  // whether this call started play. Starting initializes both human leases.
  const waitingOptions = JSON.stringify({ maxPlayers: 2, roomLifecycleVersion: 1 });
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000004','RDY1',1,'waiting','${waitingOptions}',
      '[{"id":"ready-a","name":"A","color":"#f00","ready":false},{"id":"ready-b","name":"B","color":"#0f0","ready":false}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000004','ready-a','ready-token-a'),
      ('62000000-0000-4000-8000-000000000004','ready-b','ready-token-b');`);
  const readyA = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000004','ready-a','ready-token-a','ready');`);
  const readyB = json(`SET ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000004','ready-b','ready-token-b','ready');`);
  assert.equal(readyA.started, false);
  assert.equal(readyB.started, true);
  assert.equal(Array.isArray(readyB.players), true);
  assert.equal(sql(`SELECT status || ':' || (lifecycle_started_at IS NOT NULL)::text || ':' ||
    (SELECT bool_and(last_seen_at >= lifecycle_started_at AND left_at IS NULL)
     FROM public.room_seats WHERE room_id=rooms.id)::text FROM public.rooms WHERE code='RDY1';`).trim(),
  'active:true:true');

  // A stale waiting snapshot cannot trim a room after ready starts it: both
  // operations serialize on the room row, then migration 009's status guard wins.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000005','RDY2',1,'waiting','${waitingOptions}',
      '[{"id":"race-ready","name":"A","ready":false},{"id":"race-ready-b","name":"B","ready":true}]');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000005','race-ready','race-token'),
      ('62000000-0000-4000-8000-000000000005','race-ready-b','race-token-b');`);
  const readyFirst = openPsqlSession('ready-first');
  readyFirst.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.room_lifecycle(
    '62000000-0000-4000-8000-000000000005','race-ready','race-token','ready');
    \\echo READY_LOCKED\n`);
  await readyFirst.waitFor('READY_LOCKED');
  const staleReaper = openPsqlSession('stale-reaper');
  staleReaper.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.apply_room_reap('{}'::uuid[],
    '[{"id":"62000000-0000-4000-8000-000000000005","players":[]}]');
    COMMIT; \\echo REAPER_DONE\n`);
  await waitForBlockedBy(staleReaper, readyFirst, 'ready-before-stale-reap');
  readyFirst.send('COMMIT; \\echo READY_DONE\n');
  readyFirst.close(); staleReaper.close();
  await Promise.all([readyFirst.exited, staleReaper.exited]);
  assert.equal(sql(`SELECT status || ':' || jsonb_array_length(players) FROM public.rooms
    WHERE code='RDY2';`).trim(), 'active:2');

  // Rematch creation initializes a fresh successor lease at the server clock.
  // It must not inherit predecessor presence (including a future timestamp).
  // A separate negative assertion above proves departed predecessors cannot
  // authorize or populate a rematch at all.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000006','OLD1',1,'finished','${options}','${players('rematch-a')}');
    INSERT INTO public.room_seats(room_id,seat_id,token,last_seen_at,left_at) VALUES
    ('62000000-0000-4000-8000-000000000006','rematch-a','rematch-token',
      clock_timestamp()+interval '1 minute',NULL);
    UPDATE public.room_seats SET last_seen_at=clock_timestamp()+interval '1 minute',
      left_at=NULL
      WHERE room_id='62000000-0000-4000-8000-000000000006' AND seat_id='rematch-a';`);
  sql(`SET ROLE service_role; SELECT public.create_room_rematch(
    '62000000-0000-4000-8000-000000000006','rematch-a',
    '62000000-0000-4000-8000-000000000007','NEW1',2,'${options}','${players('rematch-a')}');`);
  assert.equal(sql(`SELECT (successor.lifecycle_started_at IS NOT NULL
      AND successor_seat.last_seen_at >= successor.lifecycle_started_at
      AND successor_seat.last_seen_at <= clock_timestamp()
      AND successor_seat.last_seen_at > clock_timestamp()-interval '1 minute'
      AND successor_seat.last_seen_at < predecessor_seat.last_seen_at
      AND successor_seat.left_at IS NULL)::text
    FROM public.rooms successor
    JOIN public.room_seats successor_seat ON successor_seat.room_id=successor.id
    JOIN public.rooms predecessor ON predecessor.code='OLD1'
    JOIN public.room_seats predecessor_seat ON predecessor_seat.room_id=predecessor.id
      AND predecessor_seat.seat_id=successor_seat.seat_id
    WHERE successor.code='NEW1';`).trim(), 'true',
  'rematch must initialize a fresh successor lease without inheriting predecessor presence');

  // Legacy rooms without the explicit capability remain untouched.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000008','LEG1',1,'active','{"rounds":1}',
      '${players('legacy-a')}');
    INSERT INTO public.room_seats(room_id,seat_id,token,last_seen_at) VALUES
      ('62000000-0000-4000-8000-000000000008','legacy-a','legacy-token',
       clock_timestamp()-interval '1 day');
    SELECT public.expire_abandoned_rooms();`);
  assert.equal(sql(`SELECT status || ':' || (abandoned_at IS NULL)::text FROM public.rooms
    WHERE code='LEG1';`).trim(), 'active:true');

  // Expiry-first: completion blocks on the lifecycle room lock, then rejects;
  // no completion receipt is minted for abandonment.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-000000000009','EXP1',1,'active','${options}',
      '${humans('expiry-a','expiry-b')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-000000000009','expiry-a','expiry-token-a'),
      ('62000000-0000-4000-8000-000000000009','expiry-b','expiry-token-b');
    UPDATE public.rooms SET lifecycle_started_at=clock_timestamp()-interval '1 hour' WHERE code='EXP1';
    UPDATE public.room_seats SET last_seen_at=clock_timestamp()-interval '1 hour'
      WHERE room_id='62000000-0000-4000-8000-000000000009';`);
  const expiryFirst = openPsqlSession('expiry-first');
  expiryFirst.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.expire_abandoned_rooms();
    \\echo EXPIRY_LOCKED\n`);
  await expiryFirst.waitFor('EXPIRY_LOCKED');
  const finishAfterExpiry = openPsqlSession('finish-after-expiry');
  finishAfterExpiry.send(`BEGIN; SELECT public.finish_casual_match_v1(
    '62000000-0000-4000-8000-000000000009','expiry-a','expiry-token-a','p1',1,
    '[{"tankId":"p1","playerName":"Human A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"Human B","roundWins":0,"kills":0,"totalDamage":0}]');
    COMMIT; \\echo FINISH_AFTER_EXPIRY_DONE\n`);
  await waitForBlockedBy(finishAfterExpiry, expiryFirst, 'expiry-before-completion');
  expiryFirst.send('COMMIT; \\echo EXPIRY_DONE\n');
  expiryFirst.close(); finishAfterExpiry.close();
  const expirySettled = await Promise.allSettled([expiryFirst.exited, finishAfterExpiry.exited]);
  assert.equal(expirySettled[1].status, 'fulfilled');
  assert.match(finishAfterExpiry.output(), /"ok": false/);
  assert.match(finishAfterExpiry.output(), /"error": "room_not_active"/);
  assert.equal(sql(`SELECT status || ':' || (abandoned_at IS NOT NULL)::text || ':' ||
    (SELECT count(*) FROM public.match_scores WHERE room_id=rooms.id) FROM public.rooms
    WHERE code='EXP1';`).trim(), 'finished:true:0');

  // Completion-first: expiry waits, observes terminal status, and cannot add an
  // abandonment marker or alter the immutable completion receipt.
  sql(`INSERT INTO public.rooms(id,code,seed,status,options,players) VALUES
    ('62000000-0000-4000-8000-00000000000a','FIN1',1,'active','${options}',
      '${humans('finish-a','finish-b')}');
    INSERT INTO public.room_seats(room_id,seat_id,token) VALUES
      ('62000000-0000-4000-8000-00000000000a','finish-a','finish-token-a'),
      ('62000000-0000-4000-8000-00000000000a','finish-b','finish-token-b');
    UPDATE public.rooms SET lifecycle_started_at=clock_timestamp()-interval '1 hour' WHERE code='FIN1';
    UPDATE public.room_seats SET last_seen_at=clock_timestamp()-interval '1 hour'
      WHERE room_id='62000000-0000-4000-8000-00000000000a';`);
  const finishFirst = openPsqlSession('finish-first');
  finishFirst.send(`BEGIN; SELECT public.finish_casual_match_v1(
    '62000000-0000-4000-8000-00000000000a','finish-a','finish-token-a','p1',1,
    '[{"tankId":"p1","playerName":"Human A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"Human B","roundWins":0,"kills":0,"totalDamage":0}]');
    \\echo FINISH_LOCKED\n`);
  await finishFirst.waitFor('FINISH_LOCKED');
  const expiryAfterFinish = openPsqlSession('expiry-after-finish');
  expiryAfterFinish.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.expire_abandoned_rooms();
    COMMIT; \\echo EXPIRY_AFTER_FINISH_DONE\n`);
  await expiryAfterFinish.waitFor('EXPIRY_AFTER_FINISH_DONE');
  finishFirst.send('COMMIT; \\echo FINISH_DONE\n');
  finishFirst.close(); expiryAfterFinish.close();
  await Promise.all([finishFirst.exited, expiryAfterFinish.exited]);
  assert.match(finishFirst.output(), /"ok": true/,
    `completion-first fixture must produce a receipt: ${finishFirst.output()}`);
  assert.equal(sql(`SELECT r.status || ':' || (r.abandoned_at IS NULL)::text || ':' ||
      m.completion_status || ':' || m.terminal_revision
    FROM public.rooms r JOIN public.match_scores m ON m.room_id=r.id WHERE r.code='FIN1';`).trim(),
  'finished:true:complete:0');
  const identicalCompletion = json(`SELECT public.finish_casual_match_v1(
    '62000000-0000-4000-8000-00000000000a','finish-a','finish-token-a','p1',1,
    '[{"tankId":"p1","playerName":"Human A","roundWins":1,"kills":1,"totalDamage":100},{"tankId":"p2","playerName":"Human B","roundWins":0,"kills":0,"totalDamage":0}]');`);
  assert.equal(identicalCompletion.ok, true);
  assert.equal(sql(`SELECT count(*) FROM public.match_scores m JOIN public.rooms r ON r.id=m.room_id
    WHERE r.code='FIN1';`).trim(), '1');

  console.log('Room lifecycle PostgreSQL regressions PASS: causal expiry, lease boundary, human/bot presence, auth, ready/leave, preservation, legacy exclusion, rematch initialization, ACL, and serialized terminal races.');
} finally {
  if (started) docker(['rm', '--force', name]);
}

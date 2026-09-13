// Focused T10-T12 harness. No host ports, no existing project containers.
// --red checks the missing storage/lease contracts against migrations 016-020.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const image = 'postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b';
const name = `singedterra-p10-db-${process.pid}-${Date.now()}`;
const root = new URL('../../', import.meta.url);
const docker = (args, options = {}) => execFileSync('docker', args,
  { encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], ...options });
const sql = (input) => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input });
const file = (path) => sql(readFileSync(new URL(path, root), 'utf8'));
const red = process.argv.includes('--red');
const sessions = [];
function openSession(label) {
  const child = spawn('docker',['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});
  let stdout = ''; let stderr = ''; let failure;
  child.stdout.on('data',(chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data',(chunk) => { stderr += chunk.toString(); });
  child.once('error',(error) => { failure=error; });
  const exited = new Promise((done) => child.once('exit',(code) => { if(code!==0) failure=new Error(`${label}: ${stderr}`); done(); }));
  const waitFor = async (marker) => {
    const deadline=Date.now()+5000;
    while(!stdout.includes(marker)) {
      if(failure) throw failure;
      if(Date.now()>deadline) throw new Error(`${label} did not emit ${marker}: ${stderr}`);
      await new Promise((done)=>setTimeout(done,10));
    }
  };
  const session = { child,send(input){child.stdin.write(`${input}\n`);},waitFor,output(){return stdout;},
    async pid(){await waitFor('PID:');return Number(stdout.match(/PID:(\d+)/)[1]);},
    async close(){child.stdin.end();await exited;if(failure) throw failure;},
  };
  session.send("SELECT 'PID:'||pg_backend_pid();");sessions.push(session);return session;
}
async function blockedBy(waiter,holder,label) {
  const waiterPid=await waiter.pid();const holderPid=await holder.pid();const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    if(sql(`SELECT ${holderPid}=ANY(pg_blocking_pids(${waiterPid}));`).trim()==='t') {
      console.log(`${label}: PostgreSQL proved backend ${waiterPid} blocked by ${holderPid}`);return;
    }
    await new Promise((done)=>setTimeout(done,10));
  }
  throw new Error(`${label}: no real database lock contention observed`);
}
const startCall=(account)=>`public.start_verified_challenge('${account}','crosswind-qualification',ARRAY[1]::smallint[])`;
const acquireCall=(account,session)=>`public.acquire_verification_compute_lease('${account}','complete_verified_challenge','${session}','cq1','[{"angle":45,"power":70}]')`;
const finalizeCall=(account,session,lease)=>`public.finalize_verified_challenge('${account}','${session}','cq1','[{"angle":45,"power":70}]','objective_cleared','${lease.workerId}',${lease.fence})`;
const jsonQuery=(query)=>JSON.parse(sql(`SELECT ${query};`).trim());
const jsonLine=(session)=>JSON.parse(session.output().split(/\r?\n/).find((line)=>line.startsWith('{')));
async function synchronized(firstSql,secondSql,label) {
  const holder=openSession(`${label}-holder`);const waiter=openSession(`${label}-waiter`);
  holder.send(`BEGIN; SELECT ${firstSql};\n\\echo HOLDER_READY`);await holder.waitFor('HOLDER_READY');
  waiter.send(`BEGIN; SELECT ${secondSql}; COMMIT;\n\\echo WAITER_DONE`);
  await blockedBy(waiter,holder,label);
  holder.send('COMMIT;\n\\echo HOLDER_DONE');
  await Promise.all([holder.waitFor('HOLDER_DONE'),waiter.waitFor('WAITER_DONE')]);
  await Promise.all([holder.close(),waiter.close()]);
  return [jsonLine(holder),jsonLine(waiter)];
}

async function checkRaces() {
  sql(`INSERT INTO auth.users(id) VALUES
    ('c3000000-0000-4000-8000-000000000001'),('c3000000-0000-4000-8000-000000000002'),
    ('c3000000-0000-4000-8000-000000000003'),('c3000000-0000-4000-8000-000000000004');
    SELECT public.set_verified_challenge_starts('cq1',true);`);
  const a='c3000000-0000-4000-8000-000000000001';
  const starts=await synchronized(startCall(a),startCall(a),'parallel start/resume');
  assert.equal(starts[0].resumed,false);assert.equal(starts[1].resumed,true);
  assert.deepEqual(starts[0].descriptor,starts[1].descriptor);
  const session=starts[0].descriptor.sessionId;
  const leases=await synchronized(acquireCall(a,session),
    `public.acquire_verification_compute_lease('${a}','verified_replay_probe',NULL,'probe-v1',NULL)`,'challenge/probe contention');
  assert.equal(leases[0].ok,true);assert.equal(leases[1].error,'verification_busy');
  assert.equal(sql(`SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id='${session}';`).trim(),'1');
  const results=await synchronized(finalizeCall(a,session,leases[0]),finalizeCall(a,session,leases[0]),'same-session receipt race');
  assert.deepEqual(results[0],results[1]);assert.equal(results[0].receipt.xpGranted,200);
  assert.equal(sql(`SELECT count(*) FROM public.verified_challenge_awards WHERE account_id='${a}';`).trim(),'1');

  // One-active-session storage means distinct sessions for an account cannot
  // both start active. Contend a second explicit start against first finalization:
  // only after the winner commits may the second session start and clear (+0).
  const b='c3000000-0000-4000-8000-000000000002';
  const first=jsonQuery(startCall(b));const firstLease=jsonQuery(acquireCall(b,first.descriptor.sessionId));
  sql(`CREATE FUNCTION public.p10_test_start_and_clear(account uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE s jsonb; l jsonb; BEGIN s:=public.start_verified_challenge(account,'crosswind-qualification',ARRAY[1]::smallint[]);
    l:=public.acquire_verification_compute_lease(account,'complete_verified_challenge',(s->'descriptor'->>'sessionId')::uuid,'cq1','[{"angle":45,"power":70}]');
    RETURN public.finalize_verified_challenge(account,(s->'descriptor'->>'sessionId')::uuid,'cq1','[{"angle":45,"power":70}]','objective_cleared',
      (l->>'workerId')::uuid,(l->>'fence')::bigint); END $$;`);
  const distinct=await synchronized(finalizeCall(b,first.descriptor.sessionId,firstLease),`public.p10_test_start_and_clear('${b}')`,'distinct-session first-clear race');
  assert.equal(distinct[0].receipt.disposition,'awarded');assert.equal(distinct[1].receipt.disposition,'already_owned');
  assert.notEqual(distinct[0].receipt.sessionId,distinct[1].receipt.sessionId);
  assert.equal(jsonQuery(`public.verified_career_ledger_snapshot('${b}')`).totalXp,200);
  sql('DROP FUNCTION public.p10_test_start_and_clear(uuid);');

  // These legacy calls deliberately exercise the staged old signature to prove
  // its ACCOUNT LOCK and unchanged XP receipts, not to claim T14 lease integration.
  for(const [index,legacyFirst] of [true,false].entries()) {
    const account=`c3000000-0000-4000-8000-00000000000${index+3}`;
    const deployment=`d3000000-0000-4000-8000-00000000000${index+3}`;
    const challenge=jsonQuery(startCall(account));const lease=jsonQuery(acquireCall(account,challenge.descriptor.sessionId));
    sql(`INSERT INTO public.verified_deployments(id,user_id,config,contract_version,engine_version,ruleset_version,expires_at)
      VALUES('${deployment}','${account}','{}',2,2,4,now()+interval '29 minutes');`);
    const old=`(SELECT to_jsonb(r) FROM public.complete_verified_deployment('${account}','${deployment}','[{"angle":45,"power":70}]',true,'win',200) r)`;
    const current=finalizeCall(account,challenge.descriptor.sessionId,lease);
    const paired=await synchronized(legacyFirst?old:current,legacyFirst?current:old,legacyFirst?'legacy-before-challenge':'challenge-before-legacy');
    const receipt=paired[legacyFirst?1:0].receipt;const legacy=paired[legacyFirst?0:1];
    assert.equal(receipt.careerBeforeLedger.replayXp,legacyFirst?200:0);
    assert.equal(receipt.careerBeforeLedger.verifiedMatches,legacyFirst?1:0);
    assert.equal(receipt.careerAfterLedger.totalXp,legacyFirst?400:200);
    assert.equal(legacy.prior_total_xp,0);assert.equal(legacy.current_total_xp,200);
    assert.equal(jsonQuery(`public.verified_career_ledger_snapshot('${account}')`).totalXp,400);
    assert.deepEqual(jsonQuery(current).receipt,receipt,'retry returns the original facts after later replay XP');
  }
  console.log('Synchronized real connection races PASS; T14 endpoint lease participation remains a separate integration gate.');
}
let owned = false;
try {
  docker(['run', '--detach', '--name', name, '--network', 'none', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  owned = true;
  for (let attempt = 0; ; attempt++) {
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-t', '1'], { timeout: 5000 }); break; }
    catch (error) { if (attempt >= 29) throw error; await new Promise((done) => setTimeout(done, 1000)); }
  }
  sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);');
  for (const migration of ['016_verified_deployments','017_verified_deployment_v2','019_verified_deployment_start_qualification','020_verified_deployment_v3']) {
    file(`supabase/migrations/${migration}.sql`);
  }
  file('scripts/checks/verified_deployment_v3_postgres.sql');
  if (!red) file('supabase/migrations/024_verified_challenge_rewards.sql');
  for (const test of ['verified_challenge_postgres', 'verification_compute_lease_postgres']) {
    if (red) {
      assert.throws(() => file(`scripts/checks/${test}.sql`), /T1[02]: .*required/);
      console.log(`${test}: expected RED on required absent database capability`);
    } else {
      file(`scripts/checks/${test}.sql`);
      console.log(`${test}: PASS`);
    }
  }
  if (!red) {
    file('scripts/checks/verification_legacy_fence_postgres.sql');
    console.log('verification_legacy_fence_postgres: PASS');
    file('scripts/checks/verified_deployment_v3_postgres.sql');
    await checkRaces();
  }
  console.log(`PostgreSQL 15 focused ${red ? 'RED baseline' : 'storage/lease'} completed. Full public career projection and Edge isolation are separate gates.`);
} finally {
  for(const session of sessions) { if(!session.child.stdin.destroyed) session.child.stdin.end(); }
  if (owned) docker(['rm', '--force', name]);
}

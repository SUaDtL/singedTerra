import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync, mkdtempSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { tmpdir, networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

// Exercise the imported production journey owner. Mutation qualification uses a
// disposable module copy under ignored task evidence, never edited source.
const journey = await import(process.env.LAST_STAND_GUARD_MODULE
  ? pathToFileURL(resolve(process.env.LAST_STAND_GUARD_MODULE)).href
  : '../../e2e/helpers/lastStandJourney.mjs');
const base = new URL('http://localhost:4173/singedTerra/');
function routeProbe(url, method='GET', resourceType='fetch') {
  const effects=[];
  return { effects, request:()=>({url:()=>url,method:()=>method,resourceType:()=>resourceType}),
    abort:async reason=>effects.push(['abort',reason]),
    fulfill:async response=>effects.push(['fulfill',response]), continue:async()=>effects.push(['continue']) };
}
async function localTransport(run) {
  let hits=0;
  const server=createServer((request,response)=>{hits++; run.handler(request,response);});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try { await run.assert(new URL('/singedTerra/',origin),()=>hits); }
  finally { server.closeAllConnections(); await new Promise(done=>server.close(done)); }
}

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/\r\n/g, '\n');
const pages = readFileSync('.github/workflows/deploy-pages.yml', 'utf8').replace(/\r\n/g, '\n');

function job(source, id) {
  const found = source.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z_][A-Za-z0-9_-]*:|$)`));
  assert.ok(found, `Missing job ${id}`);
  return found[1];
}

function assertWorkflow(source) {
  assert.match(source, /on:\n  pull_request:\n  push:\n    branches: \[main\]/);
  assert.doesNotMatch(source, /paths-ignore:|pull_request_target|continue-on-error/);
  const scope = job(source, 'scope');
  assert.match(scope, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(scope, /PR_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /PUSH_BASE_SHA: \$\{\{ github\.event\.before \}\}/);
  assert.match(scope, /PUSH_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /Unsupported CI event/);
  assert.match(scope, /node --test scripts\/checks\/manual_baseline\.test\.mjs/);
  assert.match(scope, /migration_classification\.mjs --check history --base "\$base" --head "\$head"/);
  assert.match(scope, /CI_BASE_SHA="\$base" CI_HEAD_SHA="\$head" node scripts\/ci\/changeScope\.mjs/);
  for (const [id, name, work] of [
    ['check', 'typecheck · harnesses · build', 'check-work'],
    ['edge', 'edge function tests (deno)', 'edge-work'],
    ['e2e', 'e2e · rendering guardrails', 'browser'],
  ]) {
    const gate = job(source, id);
    assert.ok(gate.includes(`name: ${name}\n`));
    assert.ok(gate.includes(`needs: [scope, ${work}]`));
    assert.match(gate, /if: always\(\)/);
    assert.match(gate, /run: node scripts\/ci\/requiredResult\.mjs/);
    assert.match(gate, /SCOPE_RESULT: \$\{\{ needs\.scope\.result \}\}/);
    assert.match(gate, /DOCS_ONLY: \$\{\{ needs\.scope\.outputs\.docs_only \}\}/);
    assert.ok(gate.includes(`WORK_RESULT: \u0024{{ needs.${work}.result }}`));
    assert.match(job(source, work), /needs: scope\n    if: needs\.scope\.outputs\.docs_only == 'false'/);
  }
  const browser = job(source, 'browser');
  assert.match(browser, /fail-fast: false/);
  assert.match(browser, /lane: \[core-1, core-2, product\]/);
  for (const shard of [1, 2]) {
    assert.ok(browser.includes(`if: matrix.lane == 'core-${shard}'\n        run: npm run test:e2e -- --shard=${shard}/2 --workers=2 --grep-invert "@live|@last-stand"`));
  }
  assert.match(browser, /if: matrix\.lane == 'product'\n        run: npx playwright test -c playwright\.product-completion\.config\.ts/);
  assert.match(browser, /name: Last Stand shared Campaigns journey\n        if: matrix\.lane == 'product'\n        env:\n          VITE_BASE: \/singedTerra\/\n          E2E_DENY_EXTERNAL_NETWORK: '1'\n        run: node node_modules\/@playwright\/test\/cli\.js test e2e\/last-stand-playable-loop\.spec\.ts --config=playwright\.config\.ts --project=desktop-fine --workers=1 --retries=0/);
  assert.match(browser, /name: playwright-\$\{\{ matrix\.lane \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.equal(source.match(/uses: actions\/checkout@/g)?.length, source.match(/persist-credentials: false/g)?.length);
}

function assertCandidateMatrix(source) {
  const candidate = job(source, 'candidate-test');
  assert.match(candidate, /fail-fast: false/);
  assert.match(candidate, /lane: \[core-1, core-2, product\]/);
  for (const shard of [1, 2]) {
    assert.ok(candidate.includes(`core-${shard}) npm run test:e2e -- --grep-invert @live --workers=2 --shard=${shard}/2 ;;`));
  }
  assert.match(candidate, /product\) npx playwright test -c playwright\.product-completion\.config\.ts ;;/);
  assert.match(candidate, /BROWSER_LANE: \$\{\{ matrix\.lane \}\}/);
  const checks = [...candidate.matchAll(/node scripts\/ci\/releaseCandidate\.mjs verify client\/dist/g)];
  assert.equal(checks.length, 2);
  const execute = candidate.indexOf('case "$BROWSER_LANE"');
  assert.ok(checks[0].index < execute && checks[1].index > execute);
  assert.match(candidate, /artifact-ids: \$\{\{ needs\.build\.outputs\.artifact_id \}\}/);
  assert.match(candidate, /E2E_DENY_EXTERNAL_NETWORK: '1'/);
  assert.match(job(source, 'freshness'), /needs: \[gate, candidate-test\]/);
  assert.match(job(source, 'publish'), /needs: \[gate, build, candidate-test, freshness\]/);
}

test('every required check validates classified work and the complete browser matrix', () => assertWorkflow(ci));
test('Last Stand has one maintained shared journey and both entrypoints', () => {
  for (const path of ['e2e/helpers/lastStandJourney.mjs', 'e2e/last-stand-playable-loop.spec.ts',
    'scripts/last-stand-playable-loop.mjs']) assert.ok(existsSync(path), `Missing maintained Last Stand entry: ${path}`);
  const spec = readFileSync('e2e/last-stand-playable-loop.spec.ts', 'utf8');
  assert.match(spec, /Last Stand Campaigns journey preserves no-award exit and a stronger redeploy/);
  assert.match(spec, /@last-stand/);
  assert.match(spec, /runLastStandJourney/);
  const python = readFileSync('campaign-unity/Tools/verify_last_stand_loop.py', 'utf8');
  const normal = python.slice(python.indexOf('    def test_defeat_buy_reload_redeploy'));
  assert.match(normal, /scripts.*last-stand-playable-loop\.mjs/);
  assert.doesNotMatch(normal, /build_once\(/);
});
test('removed classification, result validation, shards and optionalized work are rejected', () => {
  for (const [from, to] of [
    ['if: always()', 'if: success()'],
    ['needs: [scope, browser]', 'needs: [scope]'],
    ['node scripts/ci/requiredResult.mjs', 'echo skipped'],
    ["if: needs.scope.outputs.docs_only == 'false'", "if: false"],
    ['--shard=2/2', '--shard=1/2'],
    ['lane: [core-1, core-2, product]', 'lane: [core-1, product]'],
    ['--check history', '--check inventory'],
    ['CI_BASE_SHA="$base"', 'CI_BASE_SHA=""'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['WORK_RESULT: ${{ needs.browser.result }}', 'WORK_RESULT: success'],
  ]) assert.throws(() => assertWorkflow(ci.replace(from, to)), from);
});
test('all candidate shards prove the same bytes before and after execution', () => assertCandidateMatrix(pages));
test('candidate matrix rejects omitted coverage or digest verification', () => {
  for (const [from, to] of [
    ['lane: [core-1, core-2, product]', 'lane: [core-1, product]'],
    ['--shard=2/2', '--shard=1/2'],
    ['product) npx playwright test', 'product) echo skipped'],
    ['node scripts/ci/releaseCandidate.mjs verify client/dist', 'echo verified'],
    ["E2E_DENY_EXTERNAL_NETWORK: '1'", "E2E_DENY_EXTERNAL_NETWORK: '0'"],
    ['artifact-ids: ${{ needs.build.outputs.artifact_id }}', 'name: arbitrary'],
    ['needs: [gate, candidate-test]', 'needs: [gate]'],
  ]) assert.throws(() => assertCandidateMatrix(pages.replaceAll(from, to)), from);
});

test('rejects nonlocal, wrong-base and credentialed journey admission', () => {
  assert.equal(journey.admitJourneyBase(base.href).href,base.href);
  for(const url of ['https://outside.invalid/singedTerra/','http://127.0.0.1:4173/other/',
    'http://user:secret@localhost:4173/singedTerra/','http://localhost:4173/singedTerra/?escape=1'])
    assert.throws(()=>journey.admitJourneyBase(url),url);
});
test('native Chrome enforces deny-external proxy before startup', () => {
  const args=journey.nativeChromeArgs('owned-test-profile');
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:9'));
  assert.ok(args.includes('--proxy-bypass-list=127.0.0.1;localhost;[::1]'));
  assert.ok(!args.some(value=>/disable-web-security|no-sandbox|ignore-certificate-errors/.test(value)));
});
test('rejects escaped evidence parent before writing', () => {
  const root=resolve('campaign-unity/Evidence/last-stand-playable-loop/t06');
  assert.equal(journey.admitEvidenceParent(root),root);
  assert.throws(()=>journey.admitEvidenceParent(resolve(root,'..')));
});
test('rejects resolved evidence junction escape before writing', () => {
  const target=mkdtempSync(resolve(tmpdir(),'st-ls-boundary-'));
  const link=resolve('campaign-unity/Evidence/last-stand-playable-loop/t06',`junction-${randomUUID().slice(0,8)}`);
  writeFileSync(resolve(target,'sentinel'),'owned containment fixture');
  try {
    symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>journey.admitEvidenceParent(resolve(link,'child')),/containment|escaped/i);
    assert.equal(readFileSync(resolve(target,'sentinel'),'utf8'),'owned containment fixture');
  } finally {if(existsSync(link))unlinkSync(link);unlinkSync(resolve(target,'sentinel'));rmdirSync(target);}
});
test('rejects external origin before fault or rejoin fixtures', async () => {
  for(const [url,state] of [['https://outside.invalid/singedTerra/last-stand/Build/game.wasm',{fault:'/singedTerra/last-stand/Build/game.wasm'}],
    ['https://outside.invalid/rest/v1/rooms?select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at&id=eq.room-rejoin-fixture',{rejoin:true}]]) {
    const route=routeProbe(url); await assert.rejects(journey.routeLastStandRequest(route,base,state));
    assert.deepEqual(route.effects,[]);
  }
});
test('rejects unexpected backend methods, endpoints and awarding requests', async () => {
  for(const [path,method] of [['/functions/v1/complete_verified_deployment','POST'],
    ['/rest/v1/rooms','POST'],['/rest/v1/rooms?select=id&id=eq.unexpected','GET'],['/singedTerra/last-stand/index.html','POST']]) {
    const route=routeProbe(new URL(path,base).href,method);
    await assert.rejects(journey.routeLastStandRequest(route,base,{rejoin:true}));
    assert.deepEqual(route.effects,[]);
  }
  const asset=routeProbe(new URL('last-stand/index.html',base).href,'GET','document');
  await journey.routeLastStandRequest(asset,base); assert.deepEqual(asset.effects,[['continue']]);
});
test('only the exact same-origin GET rejoin fixture is fulfilled',async()=>{
  const route=routeProbe(new URL('/rest/v1/rooms?select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at&id=eq.room-rejoin-fixture',base).href);
  await journey.routeLastStandRequest(route,base,{rejoin:true});assert.equal(route.effects[0][0],'fulfill');
  assert.equal(JSON.parse(route.effects[0][1].body).id,'room-rejoin-fixture');
});
test('rejects preflight redirects without following them', async () => {
  await localTransport({handler:(req,res)=>{ if(req.url.endsWith('redirect')){res.writeHead(302,{Location:'/sink'});res.end();}
    else res.end('escaped');},assert:async(local,hits)=>{
    await assert.rejects(journey.fetchBoundRuntime(local,'redirect'),/redirect|status/i);
    assert.equal(hits(),1,'Only the admitted request may reach the server');
  }});
});
test('bounds preflight response size and lifetime', async () => {
  await localTransport({handler:(req,res)=>{if(req.url.endsWith('slow'))setTimeout(()=>res.end('late'),500);else res.end('x'.repeat(100));},
    assert:async local=>{
      await assert.rejects(journey.fetchBoundRuntime(local,'large',{maxBytes:8}),/size|limit/i);
      const start=Date.now(); await assert.rejects(journey.fetchBoundRuntime(local,'slow',{timeoutMs:100}),/abort|timeout/i);
      assert.ok(Date.now()-start<450,'Preflight must stop before the server finishes');
      await assert.rejects(journey.fetchBoundRuntime(local,'../escaped'),/path|base/i);
    }});
});
test('rejects missing or drifted served runtime and absent readiness', () => {
  const bytes=Buffer.from('actual bound bytes');
  const expected='cf04fdb1362cf0628b8c2041d024ca4c0a0db0bca41338030b9e4bc1db29c677';
  // Positive digest is computed from the actual bytes, independently of owner hashing.
  return import('node:crypto').then(({createHash})=>{
    const digest=createHash('sha256').update(bytes).digest('hex');
    journey.assertServedBytes({status:200,bytes},digest);
    assert.throws(()=>journey.assertServedBytes({status:404,bytes},digest));
    assert.throws(()=>journey.assertServedBytes({status:200,bytes:Buffer.from('changed')},digest));
    assert.throws(()=>journey.assertServedBytes({status:200,bytes},expected));
    journey.assertUnityReady({action:'ready',phase:'garage',wallet:0,level:0,saveState:'ready'});
    for(const state of [null,{action:'ready',phase:'battle'},{action:'ready',phase:'garage',wallet:0,level:0,saveState:'blocked'}])
      assert.throws(()=>journey.assertUnityReady(state));
  });
});
test('rejects unplanned gameplay keys, cancels, edges, coordinates and hidden input', () => {
  const action={x:50,y:70},down={area:'gameplay',kind:'pointerdown',button:0,target:'unity-canvas',focused:true,hidden:false,...action};
  const up={...down,kind:'pointerup'};
  assert.equal(journey.validateGameplayInput([down,up,{area:'outer',kind:'keydown'}],[action]).matched,true);
  for(const trace of [[down], [down,up,{area:'gameplay',kind:'keydown'}],[down,up,{area:'gameplay',kind:'pointercancel'}],
    [{...down,x:51},up],[{...down,focused:false},up],[{...down,hidden:true},up],[{...down,target:'other'},up],[up,down]])
    assert.throws(()=>journey.validateGameplayInput(trace,[action]));
});
test('JS cache revalidation accepts only exact same-load successful 304 fetch', () => {
  const failure={scope:'healthy',load:2,url:'http://localhost:4173/singedTerra/last-stand/Build/game.data',failure:'net::ERR_ABORTED',response_status:304,method:'GET',resource_type:'fetch'};
  const success={scope:'healthy',load:2,type:'log',text:`[UnityCache] '${failure.url}' successfully revalidated and served from the browser cache`};
  assert.equal(journey.classifyBrowserEvidence([success],[failure],[]).accepted.length,1);
  for(const bad of [{...failure,load:3},{...failure,method:'POST'},{...failure,resource_type:'script'},
    {...failure,response_status:200},{...failure,failure:'net::ERR_FAILED'},{...failure,url:failure.url.replace('.data','.wasm')}])
    assert.equal(journey.classifyBrowserEvidence([success],[bad],[]).requestErrors.length,1);
  assert.equal(journey.classifyBrowserEvidence([{...success,type:'error'}],[failure],[]).requestErrors.length,1);
});
test('rejects unrelated console, page, HTTP and request errors in every fault scope', () => {
  for(const scope of ['healthy','loader-fault','wasm-fault','storage-corrupt','storage-blocked']) {
    const message={scope,type:'error',text:'Unrelated shader exception',load:3};
    const classified=journey.classifyBrowserEvidence([message],[{scope,load:3,url:base.href,failure:'net::ERR_FAILED'}],
      [{scope,kind:'pageerror',text:'Unrelated crash'},{scope,kind:'http',status:500,url:base.href}]);
    assert.equal(classified.consoleErrors.length,1,scope);
    assert.equal(classified.requestErrors.length,1,scope);
    assert.equal(classified.httpErrors.length,2,scope);
  }
  assert.equal(journey.classifyConsole([{type:'log',text:'[UnityCache] game.data not stored in the browser cache due to the error: denied'}]).length,1);
});
test('only exact induced fault evidence is accepted while every unrelated error still fails',()=>{
  const entry={scope:'loader-fault',load:3,url:new URL('last-stand/Build/game.loader.js',base).href,resourceType:'script',consoleTexts:['Last Stand load failed Unity loader unavailable']};
  const failure={scope:entry.scope,load:entry.load,url:entry.url,method:'GET',resource_type:'script',response_status:null,failure:'net::ERR_FAILED'};
  const message={scope:entry.scope,load:entry.load,type:'error',text:entry.consoleTexts[0]};
  const good=journey.classifyBrowserEvidence([message],[failure],[],[entry]);assert.equal(good.expected.length,2);
  for(const bad of [{...failure,load:4},{...failure,url:base.href},{...failure,method:'POST'},{...failure,failure:'net::ERR_ABORTED'}])
    assert.equal(journey.classifyBrowserEvidence([],[bad],[],[entry]).requestErrors.length,1);
  assert.equal(journey.classifyBrowserEvidence([{...message,text:'Unrelated crash'}],[failure],[],[entry]).consoleErrors.length,1);
});
test('process ancestry rejects reused parent PID and profile deletion rejects an owned wrong-prefix fixture',()=>{
  const root={pid:100,ppid:1,start:'2026-10-10T22:10:55.0000000Z',exe:'owned',depth:0},child={pid:101,ppid:100,start:'2026-10-10T22:10:56.0000000Z',exe:'owned'};
  assert.equal(journey.collectOwnedDescendants([root,child],[root]).length,2);
  assert.equal(journey.collectOwnedDescendants([{...root,start:'2026-10-10T22:11:00.0000000Z'},child],[root]).length,1);
  const profile=mkdtempSync(resolve(tmpdir(),'st-ls-boundary-'));writeFileSync(resolve(profile,'sentinel'),'owned');
  try {assert.throws(()=>journey.removeOwnedProfile(profile),/containment/i);assert.equal(readFileSync(resolve(profile,'sentinel'),'utf8'),'owned');}
  finally{if(existsSync(resolve(profile,'sentinel')))unlinkSync(resolve(profile,'sentinel'));if(existsSync(profile))rmdirSync(profile);}
});
test('process ownership chronology rejects stale and ambiguous branches while retaining proven children',async t=>{
  // Inert process tables only: no native observation, supervisor or termination.
  const root={pid:77,ppid:1,start:'2026-10-10T22:10:55.1234567Z',exe:'owned-node',depth:0};
  const child={pid:99,ppid:77,start:'2026-10-10T22:10:56.0000000Z',exe:'owned-child'};
  const older={pid:88,ppid:77,start:'2026-10-10T06:08:56.0000000Z',exe:'unrelated-child'};
  const staleGrandchild={pid:89,ppid:88,start:'2026-10-10T06:08:57.0000000Z',exe:'unrelated-grandchild'};
  const grandchild={pid:100,ppid:99,start:'2026-10-10T22:10:57.0000000Z',exe:'owned-grandchild'};
  const pids=(table,known)=>journey.collectOwnedDescendants(table,known).map(item=>item.pid).sort((a,b)=>a-b);
  const retained=[root,{...older,depth:1},{...staleGrandchild,depth:2},{...child,depth:1}];
  const cases=[
    {name:'stale branch cannot authorize its descendants',table:[staleGrandchild,older,root,child],known:[root],expected:[77,99]},
    {name:'retained stale branch is pruned before destructive selection',table:[root,older,staleGrandchild,child],known:retained,expected:[77,99]},
    {name:'parent exit preserves proven valid children and prunes retained stale branch',table:[older,staleGrandchild,child,grandchild],known:retained,expected:[77,99,100]},
    {name:'reused live parent cannot adopt new children but proven children survive',table:[{...root,start:'2026-10-10T22:11:00.0000000Z'},child,{...older,start:'2026-10-10T22:11:01.0000000Z'}],known:[root,{...child,depth:1}],expected:[77,99]},
    {name:'changed executable is not the recorded live parent',table:[{...root,exe:'unrelated-node'},child],known:[root],expected:[77]},
    {name:'Windows submillisecond precision rejects earlier and admits equal or later stamps',table:[root,
      {...older,start:'2026-10-10T22:10:55.1234566Z'}, {...child,start:'2026-10-10T22:10:55.1234567Z'},
      {...grandchild,ppid:77,start:'2026-10-10T22:10:55.1234568Z'}],known:[root],expected:[77,99,100]},
    {name:'Linux decimal tick widths compare numerically',table:[{...root,start:'100'},{...older,start:'99'},
      {...child,start:'100'},{...grandchild,ppid:77,start:'101'}],known:[{...root,start:'100'}],expected:[77,99,100]},
    {name:'Linux tick ordering retains integer precision',table:[{...root,start:'9007199254740993'},
      {...older,start:'9007199254740992'},{...child,start:'9007199254740993'},
      {...grandchild,ppid:77,start:'9007199254740994'}],known:[{...root,start:'9007199254740993'}],expected:[77,99,100]},
    {name:'retained ambiguous branch is pruned',table:[root,{...older,start:'unknown'},staleGrandchild],
      known:[root,{...older,start:'unknown',depth:1},{...staleGrandchild,depth:2}],expected:[77]},
  ];
  for(const start of ['',undefined,'unknown','2026-02-30T22:10:56.0000000Z','2026-10-10T22:10:56',
    '2026-10-10T22:10:56.0000000+00:00','2026-10-10T22:10:56.12345678Z','100','100.1','1e2'])
    cases.push({name:`ambiguous child clock ${String(start)}`,table:[root,{...child,start}],known:[root],expected:[77]});
  for(const start of ['unknown','100'])
    cases.push({name:`ambiguous or mixed parent clock ${start}`,table:[{...root,start},child],known:[{...root,start}],expected:[77]});
  for(const item of cases)await t.test(item.name,()=>assert.deepEqual(pids(item.table,item.known),item.expected,item.name));
});

test('teardown error is retained as a failed result before it propagates',async()=>{
  const path=resolve(journey.admitEvidenceParent(),`teardown-refusal-${randomUUID().slice(0,8)}.json`),report={status:'pass'};
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{throw new Error('bounded teardown refusal');},
    ()=>writeFileSync(path,JSON.stringify(report))),/bounded teardown refusal/);
  const retained=JSON.parse(readFileSync(path,'utf8'));assert.equal(retained.status,'failed');assert.match(retained.cleanup_error,/bounded teardown refusal/);
});

// Honest harness fault fixtures: these are not rendered audio or player passes.
// evaluate executes the imported observer/measurement's actual browser function.
function audioFaultPage(capture, unavailable, {now=2000,origin=1700000000000,pathname='/singedTerra/last-stand/',hidden=false,focused=true}={}) {
  const sandbox=createContext({window:{__stAudioCapture:capture},
    performance:{now:()=>now,timeOrigin:origin},
    document:{hidden,hasFocus:()=>focused},location:{pathname}});
  const page={reads:0,evaluate:async(expression,argument)=>{
    page.reads++;if(unavailable)throw unavailable;
    sandbox.argument=argument;
    const value=await runInContext(typeof expression==='string'?expression:`(${expression.toString()})(argument)`,sandbox);
    return value===undefined?value:JSON.parse(JSON.stringify(value));
  }};
  return page;
}
function audioCheck(report) {
  return (condition,name,detail)=>{
    report.checks.push({name,pass:Boolean(condition),detail});assert.ok(condition,name);
  };
}
function measuredFault(report,page,begin=1000,end=1600,min=5) {
  return journey.measureRenderedAudioEnergy(page,begin,end,audioCheck(report),min,{report,load:17,scope:'healthy'});
}
const sampleAssertion=/enough measured rendered WebAudio samples/;
const sampleAt=(t,rms=.004)=>({t,rms,peak:rms*2});

test('audio diagnostics retain missing capture before the original sample failure',async()=>{
  for(const supported of [true,false]) {
    const report={checks:[]},page=audioFaultPage({supported,errors:['honest capture fault'],captures:[]});
    await assert.rejects(measuredFault(report,page),sampleAssertion);
    assert.equal(report.checks.at(-1).pass,false);
    assert.ok(report.audio_diagnostics?.length,'Missing capture diagnostics must be retained before failure');
    const retained=report.audio_diagnostics.at(-1);
    assert.equal(retained.schema_version,1);assert.equal(retained.load,17);assert.equal(retained.scope,'healthy');
    assert.equal(retained.present,true);assert.equal(retained.supported,supported);
    assert.equal(retained.capture_count,0);assert.equal(retained.sample_count,0);
    assert.deepEqual(retained.errors,['honest capture fault']);assert.equal(retained.error_count,1);
    assert.deepEqual(retained.window,{begin:1000,end:1600,min:5,inclusive:true,samples:0,sample_bounds:null});
    assert.deepEqual(report.checks.at(-1).detail,retained);
  }
});
test('audio diagnostics retain stopped capture and exact inclusive window before failure',async()=>{
  const samples=[sampleAt(999),sampleAt(1000),sampleAt(1200),sampleAt(1400),sampleAt(1600),sampleAt(1601)];
  const report={checks:[]},page=audioFaultPage({supported:true,errors:[],captures:[{
    context:{state:'suspended',currentTime:2.5,sampleRate:48000},recorder:{state:'inactive'},started:900,
    timer_active:false,timer_started:900,timer_stopped:1601,timer_ticks:6,last_timer_tick:1601,finish_count:1,samples}]});
  await assert.rejects(measuredFault(report,page),sampleAssertion);
  assert.ok(report.audio_diagnostics?.length,'Stopped capture diagnostics must survive the sample-count assertion');
  const retained=report.audio_diagnostics.at(-1),capture=retained.captures[0];
  assert.equal(retained.sample_count,6);assert.deepEqual(retained.sample_bounds,{first:999,last:1601});
  assert.equal(retained.window.samples,4);assert.deepEqual(retained.window.sample_bounds,{first:1000,last:1600});
  assert.equal(capture.context_state,'suspended');assert.equal(capture.context_time,2.5);assert.equal(capture.sample_rate,48000);
  assert.equal(capture.recorder_state,'inactive');assert.equal(capture.finish_count,1);
  assert.deepEqual(capture.timer,{active:false,started:900,stopped:1601,ticks:6,last_tick:1601});
  assert.equal(capture.sample_count,6);assert.deepEqual(capture.sample_bounds,{first:999,last:1601});
  assert.equal(samples.length,6,'Observation must not restart or add samples');
});
test('audio diagnostics retain unavailable page errors without replacing the original read failure',async()=>{
  const original=new Error(`honest unavailable execution context ${'x'.repeat(700)}`),report={checks:[]};
  const page=audioFaultPage(undefined,original);
  await assert.rejects(measuredFault(report,page),error=>error===original);
  assert.ok(report.audio_diagnostics?.length,'Unavailable page must retain a best-effort diagnostic error');
  const retained=report.audio_diagnostics.at(-1);
  assert.equal(retained.present,null);assert.equal(retained.capture_count,null);assert.equal(retained.window.samples,null);
  assert.deepEqual({begin:retained.window.begin,end:retained.window.end,min:retained.window.min},
    {begin:1000,end:1600,min:5});
  assert.match(retained.diagnostic_error,/unavailable execution context/);assert.ok(retained.diagnostic_error.length<=500);
  assert.ok(original.message.length>700,'Original failure is not truncated to the diagnostic bound');
  assert.equal(report.checks.length,0,'Read failure cannot become a fabricated sample assertion');
});
test('audio diagnostics retain absent observer without inventing a successful sample read',async()=>{
  const report={checks:[]};
  await assert.rejects(measuredFault(report,audioFaultPage(undefined)),/undefined|captures/);
  assert.ok(report.audio_diagnostics?.length,'Absent observer state must be retained after the original read error');
  const retained=report.audio_diagnostics.at(-1);
  assert.equal(retained.present,false);assert.equal(retained.supported,null);assert.equal(retained.capture_count,0);
  assert.equal(retained.window.samples,null);assert.equal(report.checks.length,0);
});
test('audio diagnostics preserve sufficient sample energy and distinguish silence',async()=>{
  for(const rms of [.004,0]) {
    const report={checks:[]},samples=[sampleAt(999,1),...[1000,1100,1200,1300,1600].map(t=>sampleAt(t,rms)),sampleAt(1601,1)];
    const capture={supported:true,errors:[],captures:[{samples}]};
    const measured=await measuredFault(report,audioFaultPage(capture));
    assert.equal(measured.samples,5);assert.equal(measured.maximum_rms,rms);assert.ok(Math.abs(measured.mean_rms-rms)<1e-12);
    assert.ok(report.audio_diagnostics?.length,'Successful energy selection must retain its exact window too');
    const retained=report.audio_diagnostics.at(-1);
    assert.equal(retained.window.samples,5);assert.deepEqual(retained.window.sample_bounds,{first:1000,last:1600});
    assert.equal(retained.sample_count,7);assert.equal(report.checks.at(-1).pass,true);
    if(rms===0)assert.throws(()=>audioCheck(report)(measured.maximum_rms>.0005,'rendered purchase cue measured'),/rendered purchase cue measured/);
    else audioCheck(report)(measured.maximum_rms>.0005,'rendered purchase cue measured');
  }
});
test('audio sample failure survives cleanup failure with both errors retained',async()=>{
  const report={status:'running',checks:[]};let original,persisted,cleaned=false;
  try{await measuredFault(report,audioFaultPage({supported:true,errors:[],captures:[]}));}
  catch(error){original=error;report.status='failed';report.error=`${error.name}: ${error.message}`;}
  assert.match(original.message,sampleAssertion);
  const cleanup=new Error('honest cleanup fault');
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{cleaned=true;throw cleanup;},
    ()=>{persisted=JSON.parse(JSON.stringify(report));},original),error=>error===original);
  assert.equal(cleaned,true);assert.equal(persisted.status,'failed');assert.match(persisted.error,sampleAssertion);
  assert.match(persisted.cleanup_error,/honest cleanup fault/);assert.equal(persisted.audio_diagnostics.at(-1).window.samples,0);
});
test('audio capture diagnostics observe lifecycle without starting stopped capture',async()=>{
  const clock={now:900},timers=new Map(),calls={starts:0,stops:0};let timerId=0;
  class FaultAudioNode {constructor(context){this.context=context;}connect(target){return target;}disconnect(){}}
  class FaultRecorder {
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';}
    start(){calls.starts++;this.state='recording';}
    stop(){calls.stops++;this.state='inactive';queueMicrotask(()=>this.onstop());}
  }
  const listeners=[],audioContext={state:'running',currentTime:1,sampleRate:48000,destination:{},
    createMediaStreamDestination:()=>({stream:{}}),createAnalyser:()=>({getFloatTimeDomainData:values=>values.fill(0)}),
    addEventListener:(name,listener)=>listeners.push(listener)};
  const sandbox=createContext({window:{},AudioNode:FaultAudioNode,MediaRecorder:FaultRecorder,
    performance:{now:()=>clock.now,timeOrigin:1700000000000},
    document:{hidden:false,hasFocus:()=>true},location:{pathname:'/singedTerra/last-stand/'},
    setInterval:callback=>{timers.set(++timerId,callback);return timerId;},clearInterval:id=>timers.delete(id),
    Blob,btoa:value=>Buffer.from(value,'binary').toString('base64')});
  runInContext(journey.AUDIO_CAPTURE,sandbox);
  new FaultAudioNode(audioContext).connect(audioContext.destination);
  clock.now=1000;for(const callback of timers.values())callback();
  clock.now=1020;for(const callback of timers.values())callback();
  await sandbox.window.__stAudioCapture.finish();
  const report={checks:[]};
  await assert.rejects(measuredFault(report,audioFaultPage(sandbox.window.__stAudioCapture)),sampleAssertion);
  assert.ok(report.audio_diagnostics?.length,'Real observer finish lifecycle must be visible in retained diagnostics');
  const retained=report.audio_diagnostics.at(-1),capture=retained.captures[0];
  assert.equal(capture.context_state,'running');assert.equal(capture.recorder_state,'inactive');
  assert.equal(capture.timer.active,false);assert.equal(capture.timer.ticks,2);assert.equal(capture.timer.last_tick,1020);
  assert.equal(capture.timer.started,900);assert.equal(capture.timer.stopped,1020);assert.equal(capture.finish_count,1);
  assert.equal(capture.sample_count,2);assert.equal(timers.size,0);assert.deepEqual(calls,{starts:1,stops:1});
  listeners.forEach(listener=>listener());
  assert.deepEqual(calls,{starts:1,stops:1},'Diagnostics and state observation cannot restart a finished recorder');
  assert.equal(timers.size,0);
});
test('audio diagnostics bound capture details and errors while identifying the current document',async()=>{
  const captures=Array.from({length:10},()=>({samples:[1000,1100,1200,1300,1600].map(t=>sampleAt(t))}));
  const errors=Array.from({length:10},()=>`honest fault ${'e'.repeat(900)}`),report={checks:[]};
  await measuredFault(report,audioFaultPage({supported:true,errors,captures}));
  assert.ok(report.audio_diagnostics?.length,'Bounded current-document diagnostics must be retained');
  const retained=report.audio_diagnostics.at(-1);
  assert.equal(retained.observed_at_ms,2000);assert.equal(retained.time_origin_ms,1700000000000);
  assert.deepEqual(retained.document,{pathname:'/singedTerra/last-stand/',hidden:false,focused:true});
  assert.equal(retained.capture_count,10);assert.equal(retained.error_count,10);
  assert.equal(retained.captures.length,8);assert.equal(retained.errors.length,8);
  assert.equal(retained.captures_truncated,2);assert.equal(retained.errors_truncated,2);
  assert.ok(retained.errors.every(error=>error.length<=500));
  assert.equal(retained.sample_count,50);assert.equal(retained.window.samples,50);
  assert.ok(retained.captures.every(capture=>!('samples' in capture) && !('context' in capture) && !('audio' in capture)));
});

test('journey error survives persistence failure after successful cleanup',async()=>{
  const report={status:'running',checks:[]};let original,cleaned=0,persistAttempts=0;
  await assert.rejects(measuredFault(report,audioFaultPage({supported:true,errors:[],captures:[]})),error=>{
    original=error;return sampleAssertion.test(error.message);
  });
  report.status='failed';report.error=String(original);
  const persistence=new Error('honest failed evidence write');
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{cleaned++;},()=>{
    persistAttempts++;throw persistence;
  },original),error=>error===original);
  assert.equal(cleaned,1);assert.equal(persistAttempts,1);
  assert.equal(report.status,'failed');assert.equal(report.error,String(original));
  assert.equal(report.persist_error,String(persistence));assert.equal(report.cleanup_error,undefined);
  assert.equal(report.audio_diagnostics.at(-1).window.samples,0);
});

test('journey error survives cleanup and persistence failures',async()=>{
  const original=new Error('honest primary journey fault'),cleanup=new Error('honest cleanup fault');
  const persistence=new Error('honest rejected persistence promise'),report={status:'failed',error:String(original)},calls=[];
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{
    calls.push('cleanup');throw cleanup;
  },async()=>{calls.push('persist');throw persistence;},original),error=>error===original);
  assert.deepEqual(calls,['cleanup','persist']);assert.equal(report.status,'failed');
  assert.equal(report.error,String(original));assert.equal(report.cleanup_error,String(cleanup));
  assert.equal(report.persist_error,String(persistence));
});

test('cleanup error takes precedence over persistence failure',async()=>{
  const cleanup=new Error('honest earlier cleanup fault'),persistence=new Error('honest later persistence fault');
  const report={status:'pass'},calls=[];
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{
    calls.push('cleanup');throw cleanup;
  },()=>{calls.push('persist');throw persistence;}),error=>error===cleanup);
  assert.deepEqual(calls,['cleanup','persist']);assert.equal(report.status,'failed');
  assert.equal(report.cleanup_error,String(cleanup));assert.equal(report.persist_error,String(persistence));
  assert.equal(report.error,undefined,'No original journey error may be fabricated');
});

test('standalone persistence failure is retained in memory and propagates',async()=>{
  const persistence=new Error('honest standalone persistence fault'),report={status:'pass'},calls=[];
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{calls.push('cleanup');},async()=>{
    calls.push('persist');throw persistence;
  }),error=>error===persistence);
  assert.deepEqual(calls,['cleanup','persist']);assert.equal(report.status,'failed');
  assert.equal(report.persist_error,String(persistence));assert.equal(report.cleanup_error,undefined);
  assert.equal(report.error,undefined,'Failed persistence cannot imply a journey error or written result');
});

test('standalone cleanup failure still persists its failed report and propagates',async()=>{
  const cleanup=new Error('honest standalone cleanup fault'),report={status:'pass'},calls=[];let persisted;
  await assert.rejects(journey.retainJourneyOutcome(report,async()=>{
    calls.push('cleanup');throw cleanup;
  },()=>{calls.push('persist');persisted=JSON.parse(JSON.stringify(report));}),error=>error===cleanup);
  assert.deepEqual(calls,['cleanup','persist']);assert.equal(persisted.status,'failed');
  assert.equal(persisted.cleanup_error,String(cleanup));assert.equal(report.cleanup_error,String(cleanup));
  assert.equal(report.error,undefined);assert.equal(report.persist_error,undefined);
});

test('audio diagnostics retain latest sixteen snapshots and exact dropped count',async()=>{
  const report={},page=audioFaultPage({supported:true,errors:[],captures:[]});
  for(let load=0;load<20;load++)await journey.retainRenderedAudioDiagnostics(page,report,{load,scope:`honest fixture ${load}`});
  assert.equal(report.audio_diagnostics.length,16);assert.equal(report.audio_diagnostics_dropped,4);
  assert.deepEqual(report.audio_diagnostics.map(row=>row.load),Array.from({length:16},(_,index)=>index+4));
  assert.deepEqual(report.audio_diagnostics.map(row=>row.scope),Array.from({length:16},(_,index)=>`honest fixture ${index+4}`));
  assert.ok(report.audio_diagnostics.every(row=>row.present && row.capture_count===0 && row.sample_count===0));
});

test('audio diagnostics bound long pathname and follow replacement document identity',async()=>{
  const report={},pathname=`/${'p'.repeat(700)}`;
  await journey.retainRenderedAudioDiagnostics(audioFaultPage({supported:true,errors:[],captures:[]},undefined,
    {now:10,origin:100,pathname}),report,{load:2,scope:'first'});
  await journey.retainRenderedAudioDiagnostics(audioFaultPage(undefined,undefined,
    {now:3,origin:200,pathname:'/replacement',hidden:true,focused:false}),report,{load:3,scope:'replacement'});
  const [first,replacement]=report.audio_diagnostics;
  assert.equal(first.document.pathname.length,500);assert.equal(first.document.pathname,pathname.slice(0,500));
  assert.equal(first.time_origin_ms,100);assert.equal(first.observed_at_ms,10);
  assert.equal(first.load,2);assert.equal(first.scope,'first');assert.equal(first.present,true);
  assert.equal(replacement.time_origin_ms,200);assert.equal(replacement.observed_at_ms,3);
  assert.equal(replacement.load,3);assert.equal(replacement.scope,'replacement');
  assert.deepEqual(replacement.document,{pathname:'/replacement',hidden:true,focused:false});
  assert.equal(replacement.present,false);assert.equal(replacement.supported,null);
  assert.equal(replacement.capture_count,0);assert.equal(replacement.sample_count,0);
});

test('audio read failure retains recovered current document and the original error',async()=>{
  const original=new Error('honest first execution context read fault'),report={checks:[]};let reads=0;
  const recovered=audioFaultPage({supported:true,errors:[],captures:[]},undefined,
    {now:7,origin:222,pathname:'/recovered',hidden:true,focused:false});
  const page={evaluate:async(...args)=>{reads++;if(reads===1)throw original;return recovered.evaluate(...args);}};
  await assert.rejects(measuredFault(report,page),error=>error===original);
  assert.equal(reads,2);assert.equal(report.checks.length,0,'Failed read cannot produce a sample-count assertion');
  const retained=report.audio_diagnostics.at(-1);
  assert.equal(retained.present,true);assert.equal(retained.capture_count,0);assert.equal(retained.sample_count,0);
  assert.equal(retained.observed_at_ms,7);assert.equal(retained.time_origin_ms,222);
  assert.deepEqual(retained.document,{pathname:'/recovered',hidden:true,focused:false});
  assert.equal(retained.load,17);assert.equal(retained.scope,'healthy');
  assert.deepEqual(retained.window,{begin:1000,end:1600,min:5,inclusive:true,samples:null,sample_bounds:null});
});

if(process.env.LAST_STAND_BOUNDARY_NATIVE==='1')test('owned supervisor timeout stops actual child and grandchild listener',async()=>{
  const {spawn}=await import('node:child_process');
  const output=resolve(journey.admitEvidenceParent(),`tree-timeout-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);mkdirSync(output);
  const script=`const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify("require('node:http').createServer((req,res)=>res.end('owned')).listen(0,'127.0.0.1',function(){require('node:fs').writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,port:this.address().port}));});")} ,${JSON.stringify(resolve(output,'listener.json'))}],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['-e',script],{stdio:'ignore',windowsHide:true});
  const deadline=Date.now()+5000;while(!existsSync(resolve(output,'listener.json')) && Date.now()<deadline)await new Promise(done=>setTimeout(done,50));
  assert.ok(existsSync(resolve(output,'listener.json')));const listener=JSON.parse(readFileSync(resolve(output,'listener.json'),'utf8'));
  assert.equal(await fetch(`http://127.0.0.1:${listener.port}`).then(r=>r.text()),'owned');
  const supervisor=journey.startOwnedSupervisor(child,output,null,600);
  await new Promise(done=>setTimeout(done,4000));const result=await supervisor.stop();
  assert.equal(result.reason,'timeout');assert.ok(result.tree.known.some(item=>item.pid===listener.pid));assert.deepEqual(result.tree.remaining,[]);
  await assert.rejects(fetch(`http://127.0.0.1:${listener.port}`));
  writeFileSync(resolve(output,'timeout-result.json'),JSON.stringify({status:'pass',listener,cleanup:result},null,2));
  console.log(`LAST_STAND_TREE_TIMEOUT_EVIDENCE=${output}`);
});

if(process.env.LAST_STAND_BOUNDARY_NATIVE==='1')test('owned native startup admission failure and Python timeout stop browser descendants and retain cleanup results',async()=>{
  const output=resolve(journey.admitEvidenceParent(),`lifecycle-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);mkdirSync(output);
  const {chromium}=await import('@playwright/test'),{spawn}=await import('node:child_process');
  const startup=resolve(output,'startup');mkdirSync(startup);
  const connector={executablePath:()=>chromium.executablePath(),connectOverCDP:()=>chromium.connectOverCDP('http://127.0.0.1:9',{noDefaults:true,timeout:1000})};
  await assert.rejects(journey.ownedChrome(connector,startup));
  const startupReceipt=JSON.parse(readFileSync(resolve(startup,'browser-profile.json'),'utf8'));
  assert.equal(startupReceipt.status,'removed');assert.equal(existsSync(startupReceipt.profile),false);
  const module=pathToFileURL(resolve('e2e/helpers/lastStandJourney.mjs')).href;
  const fixture=resolve(output,'timeout-owner.mjs');
  writeFileSync(fixture,`import {chromium} from ${JSON.stringify(pathToFileURL(resolve('node_modules/playwright/index.mjs')).href)};
    import {ownedChrome} from ${JSON.stringify(module)};import {writeFileSync} from 'node:fs';
    const browser=await ownedChrome(chromium,${JSON.stringify(output)});writeFileSync(${JSON.stringify(resolve(output,'owner-ready.json'))},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);`);
  const python=process.platform==='win32'?'C:/Python314/python.exe':'python3';
  const child=spawn(python,['-B','-c','import subprocess,sys\ntry: subprocess.run([sys.argv[1],sys.argv[2]],timeout=8,check=True)\nexcept subprocess.TimeoutExpired: print("EXPECTED_PYTHON_TIMEOUT",flush=True)',process.execPath,fixture],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let raw='';child.stdout.on('data',data=>{raw+=data;});child.stderr.on('data',data=>{raw+=data;});
  const exit=await new Promise(done=>child.once('close',done));writeFileSync(resolve(output,'python-timeout.log'),raw);assert.equal(exit,0);assert.match(raw,/EXPECTED_PYTHON_TIMEOUT/);
  assert.ok(existsSync(resolve(output,'owner-ready.json')),'Real owned Chrome started before Python timeout');
  const deadline=Date.now()+25000;let result;
  while(Date.now()<deadline){const name=(await import('node:fs')).readdirSync(output).find(name=>name.endsWith('.result.json'));
    if(name){result=JSON.parse(readFileSync(resolve(output,name),'utf8'));break;}await new Promise(done=>setTimeout(done,100));}
  assert.equal(result?.status,'stopped');assert.equal(result.reason,'owner-exit');assert.ok(result.tree.known.length>1,'Actual descendants must be observed');
  assert.deepEqual(result.tree.remaining,[]);assert.equal(existsSync(result.profile),false);
  writeFileSync(resolve(output,'lifecycle-result.json'),JSON.stringify({status:'pass',startup:startupReceipt,python_timeout:result,host:process.platform,forced_playwright_worker:'MISSING',linux_observation:process.platform==='linux'?'observed':'MISSING'},null,2));
  console.log(`LAST_STAND_LIFECYCLE_EVIDENCE=${output}`);
});

if(process.env.LAST_STAND_BOUNDARY_NATIVE==='1')test('proxied native page, background worker, WebSocket and Node preflight cannot reach owned nonloopback sink',async()=>{
  const output=resolve(journey.admitEvidenceParent(),`boundary-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(output);const record={status:'running',pid:process.pid};let native,hits=0;
  const address=Object.values(networkInterfaces()).flat().find(item=>item.family==='IPv4' && !item.internal)?.address;
  assert.ok(address,'Owned nonloopback interface prerequisite absent');
  const sink=createServer((req,res)=>{hits++;res.setHeader('Access-Control-Allow-Origin','*');res.end('owned sink');});
  sink.on('upgrade',(req,socket)=>{hits++;socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
  await new Promise(done=>sink.listen(0,'0.0.0.0',done));
  const sinkURL=`http://${address}:${sink.address().port}/sink`,socketURL=sinkURL.replace('http:','ws:');
  const local=createServer((req,res)=>{
    if(req.url.endsWith('redirect')){res.writeHead(302,{Location:sinkURL});res.end();}
    else if(req.url.endsWith('worker.js')){res.setHeader('Content-Type','text/javascript');res.end(`self.onmessage=async()=>{try{await fetch('${sinkURL}');postMessage('reached');}catch{postMessage('denied');}}`);}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Owned transport boundary</title>');}
  });
  await new Promise(done=>local.listen(0,'127.0.0.1',done));
  const localBase=new URL(`http://127.0.0.1:${local.address().port}/singedTerra/`);
  record.sink={address,port:sink.address().port,pid:process.pid};record.local={port:local.address().port,pid:process.pid};
  try {
    const calibration=await fetch(sinkURL);assert.equal(await calibration.text(),'owned sink');assert.equal(hits,1);hits=0;
    const {chromium}=await import('@playwright/test');native=await journey.ownedChrome(chromium,output);
    const page=native.context.pages()[0];await page.goto(localBase.href);
    record.results=await page.evaluate(async({sinkURL,socketURL})=>{
      const page=await fetch(sinkURL).then(()=> 'reached',()=> 'denied');
      const websocket=await new Promise(done=>{const socket=new WebSocket(socketURL);const timer=setTimeout(()=>{socket.close();done('timeout');},3000);
        socket.onopen=()=>{clearTimeout(timer);socket.close();done('reached');};socket.onerror=()=>{clearTimeout(timer);done('denied');};});
      const worker=await new Promise(done=>{const worker=new Worker('worker.js');worker.onmessage=e=>{worker.terminate();done(e.data);};worker.postMessage('probe');});
      return {page,websocket,worker};
    },{sinkURL,socketURL});
    assert.deepEqual(record.results,{page:'denied',websocket:'denied',worker:'denied'});
    await assert.rejects(journey.fetchBoundRuntime(new URL(`http://${address}:${sink.address().port}/singedTerra/`),'index.html'),/local/i);
    await assert.rejects(journey.fetchBoundRuntime(localBase,'redirect'),/redirect|status/i);
    await new Promise(done=>setTimeout(done,300));assert.equal(hits,0,'No denied transport reached the calibrated sink');
    record.hits=hits;record.status='pass';
  } catch(error){record.status='failed';record.error=String(error);throw error;}
  finally {
    try{if(native)await native.close();}catch(error){record.status='failed';record.cleanup_error=String(error);throw error;}
    finally {sink.closeAllConnections();local.closeAllConnections();await Promise.all([new Promise(done=>sink.close(done)),new Promise(done=>local.close(done))]);
      writeFileSync(resolve(output,'boundary-result.json'),JSON.stringify(record,null,2));console.log(`LAST_STAND_BOUNDARY_EVIDENCE=${output}`);}
  }
});

test('process ownership rejects incomplete executable identities before retention and fresh adoption',async t=>{
  // Finite inert tables exercise the actual collector; no process observation or termination.
  const root={pid:77,ppid:1,start:'100',exe:'owned-node',depth:0};
  const child={pid:99,ppid:77,start:'101',exe:'owned-child'};
  const grandchild={pid:100,ppid:99,start:'102',exe:'owned-grandchild'};
  const sibling={pid:101,ppid:77,start:'101',exe:'owned-sibling'};
  const retainedChild={...child,depth:1},retainedGrandchild={...grandchild,depth:2};
  const identities=(table,known)=>journey.collectOwnedDescendants(table,known).sort((a,b)=>a.pid-b.pid);
  const withExe=(identity,variant)=>{
    const changed={...identity};
    if(variant.absent)delete changed.exe;else changed.exe=variant.value;
    return changed;
  };
  const malformed=[
    {name:'absent',absent:true},{name:'undefined',value:undefined},{name:'empty',value:''},
    {name:'null',value:null},{name:'number',value:0},{name:'boolean',value:true},
    {name:'object',value:{}},{name:'array',value:[]},{name:'boxed string',value:new String('owned-node')},
  ];
  for(const variant of malformed){
    const incompleteRoot=withExe(root,variant),incompleteChild=withExe(child,variant);
    const incompleteRetainedChild={...incompleteChild,depth:1};
    const cases=[
      {name:'new incomplete child and its grandchild rejected',table:[grandchild,incompleteChild,sibling,root],
        known:[root],expected:[root,{...sibling,depth:1}]},
      {name:'retained incomplete child cannot authorize new grandchild',table:[grandchild,incompleteChild,root],
        known:[root,incompleteRetainedChild],expected:[root]},
      {name:'exited incomplete retained child and deeper branch pruned',table:[grandchild],
        known:[root,incompleteRetainedChild,retainedGrandchild],expected:[root]},
      {name:'incomplete recorded root and matching live root rejected',table:[incompleteRoot,child],
        known:[incompleteRoot],expected:[]},
      {name:'incomplete recorded root cannot retain complete descendants',table:[child,grandchild],
        known:[incompleteRoot,retainedChild,retainedGrandchild],expected:[]},
      {name:'incomplete live root cannot authorize fresh adoption',table:[incompleteRoot,child],
        known:[root],expected:[root]},
      {name:'incomplete live retained parent cannot authorize fresh grandchild',table:[root,incompleteChild,grandchild],
        known:[root,retainedChild],expected:[root,retainedChild]},
    ];
    for(const item of cases)await t.test(`${variant.name}: ${item.name}`,()=>
      assert.deepEqual(identities(item.table,item.known),item.expected,`${variant.name}: ${item.name}`));
  }
  await t.test('complete Linux identity chain is admitted',()=>
    assert.deepEqual(identities([grandchild,child,root],[root]),[root,retainedChild,retainedGrandchild]));
  await t.test('complete proven Linux orphans survive and live child adopts grandchild',()=>
    assert.deepEqual(identities([grandchild,child],[root,retainedChild]),[root,retainedChild,retainedGrandchild]));
  await t.test('complete proven descendants survive all parent exits',()=>
    assert.deepEqual(identities([], [root,retainedChild,retainedGrandchild]),[root,retainedChild,retainedGrandchild]));
  await t.test('changed live executable cannot authorize a fresh child',()=>
    assert.deepEqual(identities([{...root,exe:'unrelated-node'},child],[root]),[root]));
  const windowsRoot={...root,start:'2026-10-10T22:10:55.1234567Z'};
  const windowsChild={...child,start:'2026-10-10T22:10:56.1234567Z',depth:1};
  await t.test('complete proven Windows orphan remains owned after root exits',()=>
    assert.deepEqual(identities([windowsChild],[windowsRoot,windowsChild]),[windowsRoot,windowsChild]));
});

test('process ownership private matcher rejects incomplete executable identities',async t=>{
  // Capture only the actual trusted private declarations, never process callbacks.
  // The source override admits archived/fault evidence without changing production.
  const sourceURL=process.env.LAST_STAND_MATCHER_SOURCE
    ? pathToFileURL(resolve(process.env.LAST_STAND_MATCHER_SOURCE))
    : new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url);
  const source=readFileSync(sourceURL,'utf8');
  const matcherMarker='const sameProcess=',presenceMarker='const hasProcessExecutable=';
  const endMarker='export function ownedProcessIdentity';
  assert.equal(source.split(matcherMarker).length-1,1,'Private matcher delimiter must be unique');
  assert.equal(source.split(endMarker).length-1,1,'Private matcher end delimiter must be unique');
  const presenceCount=source.split(presenceMarker).length-1;
  assert.ok(presenceCount===0 || presenceCount===1,'Presence predicate delimiter must be unique when present');
  const matcherStart=source.indexOf(matcherMarker),presenceStart=source.indexOf(presenceMarker);
  assert.ok(presenceStart===-1 || presenceStart<matcherStart,'Capture the actual preceding presence predicate');
  const begin=presenceStart===-1?matcherStart:presenceStart,end=source.indexOf(endMarker,matcherStart);
  assert.ok(end>matcherStart,'Matcher capture end follows its declaration');
  const block=source.slice(begin,end);
  assert.ok(block.length<1024,'Private matcher capture stays bounded');
  const declarations=block.trim().split(/\r?\n/);
  assert.equal(declarations.length,presenceCount+1,'Capture only the one or two private declarations');
  assert.ok(declarations.every(line=>line.startsWith(matcherMarker) || line.startsWith(presenceMarker)));
  const sandbox=createContext({}, {codeGeneration:{strings:false,wasm:false}});
  runInContext(`${block}\nglobalThis.authorize=(left,right)=>Boolean(sameProcess(left,right));`,sandbox,{timeout:1000});
  await t.test('actual private matcher capture succeeds in an inert context',()=>assert.equal(typeof sandbox.authorize,'function'));
  console.log(`PRIVATE_MATCHER_CAPTURE=${JSON.stringify({source:sourceURL.href,begin,end,bytes:block.length,declarations:declarations.length})}`);
  const complete={pid:77,start:'100',exe:'owned-node'};
  const variants=[{name:'absent',absent:true},{name:'undefined',value:undefined},{name:'empty',value:''},
    {name:'null',value:null},{name:'number',value:0},{name:'boolean',value:true},
    {name:'object',value:{}},{name:'array',value:[]},{name:'boxed string',value:new String('owned-node')}];
  const incomplete=variant=>{
    const identity={...complete};
    if(variant.absent)delete identity.exe;else identity.exe=variant.value;
    return identity;
  };
  for(const variant of variants){
    const left=incomplete(variant),right=incomplete(variant);
    for(const item of [{name:'equal incomplete executable values on both sides',left,right},
      {name:'incomplete left identity',left,right:complete},{name:'incomplete right identity',left:complete,right}])
      await t.test(`${variant.name}: ${item.name}`,()=>
        assert.equal(sandbox.authorize(item.left,item.right),false,`${variant.name}: ${item.name}`));
  }
  const controls=[
    {name:'exact complete identity authorizes',left:complete,right:{...complete},expected:true},
    {name:'different left PID refuses',left:{...complete,pid:78},right:complete,expected:false},
    {name:'different right PID refuses',left:complete,right:{...complete,pid:78},expected:false},
    {name:'different left start refuses',left:{...complete,start:'101'},right:complete,expected:false},
    {name:'different right start refuses',left:complete,right:{...complete,start:'101'},expected:false},
    {name:'different left executable refuses',left:{...complete,exe:'unrelated'},right:complete,expected:false},
    {name:'different right executable refuses',left:complete,right:{...complete,exe:'unrelated'},expected:false},
    {name:'absent left identity refuses',left:undefined,right:complete,expected:false},
    {name:'absent right identity refuses',left:complete,right:undefined,expected:false},
    {name:'null left identity refuses',left:null,right:complete,expected:false},
    {name:'null right identity refuses',left:complete,right:null,expected:false},
    {name:'both absent identities refuse',left:undefined,right:undefined,expected:false},
    {name:'both null identities refuse',left:null,right:null,expected:false},
    {name:'null and absent identities refuse',left:null,right:undefined,expected:false},
  ];
  for(const item of controls)await t.test(item.name,()=>
    assert.equal(sandbox.authorize(item.left,item.right),item.expected,item.name));
});

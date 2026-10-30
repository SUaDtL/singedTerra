import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {ENDURANCE_POLICY,parseEnduranceArguments,newEnduranceLedger,accountEnduranceObservation,
  enduranceVerdict,appendBounded} from '../last-stand-wave-endurance.mjs';
import * as endurance from '../last-stand-wave-endurance.mjs';
import {assertDependencyFreeWaveGuards} from './lastStandDependencyFreeFixture.mjs';

test('endurance guards import and execute in a checkout without installed Playwright',()=>{
  assertDependencyFreeWaveGuards(`
    const {parseEnduranceArguments,newEnduranceLedger,accountEnduranceObservation,enduranceVerdict}=
      await import('./scripts/last-stand-wave-endurance.mjs');
    assert.equal(parseEnduranceArguments(['manifest','output','--smoke']).mode,'smoke');
    const ledger=newEnduranceLedger();
    for(const atMs of [0,1000])accountEnduranceObservation(ledger,{atMs,timeOrigin:1,stateAgeMs:0,
      tick:atMs/50,runId:1,phase:'battle',paused:false,speed:1});
    assert.equal(ledger.activeMs,1000);assert.equal(ledger.observedSimulationMs,1000);
    assert.equal(enduranceVerdict('smoke',ledger).enduranceQualified,false);
  `);
});

const observed=(atMs,changes={})=>({atMs,timeOrigin:12345,stateAgeMs:0,tick:Math.floor(atMs/50),runId:2,
  phase:'battle',paused:false,speed:1,...changes});
const complete=()=>({...newEnduranceLedger(),activeMs:ENDURANCE_POLICY.activeTargetMs,
  elapsedMs:ENDURANCE_POLICY.activeTargetMs+1000,observedSimulationMs:ENDURANCE_POLICY.activeTargetMs,samples:36001});
const proof={completed:true,finalBindingsVerified:true,storageLatencyVerified:true};

test('actual endurance report declares bounded smoke or an unfulfilled ten-hour target truthfully',()=>{
  for(const mode of ['smoke','endurance'])for(const research of [false,true]){
    const {report}=endurance.createEnduranceReport({options:{mode,research,smokeSeconds:180},
      expectedSpeed:research?5:1,fixture:{qualificationPurchasePolicy:{},saveSha256:'inert-save'},
      manifestPath:'inert',manifestBytes:Buffer.from('inert'),hash:()=> 'inert-hash',sources:{},packaged:{}});
    assert.equal(report.mode,mode);assert.equal(report.enduranceQualified,false);
    assert.equal(report.expectedSpeed,research?5:1);assert.equal(report.policy.activeTargetMs,36000000);
    assert.equal(report.policy.maximumSampleGapMs,5000);
    if(mode==='smoke'){
      assert.match(report.scope,/180.second.*smoke/i);assert.match(report.scope,/cannot qualify endurance/i);
      assert.doesNotMatch(report.scope,/ten real active hours/i);
    }else assert.match(report.scope,/target of ten real active hours/i);
  }
});

test('actual research endurance admission requires current schema and retains exact fixture/source bindings',()=>{
  const prefix=join(tmpdir(),'st-endurance-admission-'),directory=mkdtempSync(prefix);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  try{
    // Inert files exercise the actual reader; they are not earned profiles or
    // production source evidence and never enter a browser context.
    const sourceSha256={};mkdirSync(join(directory,'sources'));
    for(let index=0;index<20;index++){
      const path=`sources/input-${index}.cs`,bytes=`inert source ${index}`;
      writeFileSync(join(directory,path),bytes);sourceSha256[path]=sha(bytes);
    }
    const save={version:6,pendingDefeat:null,checkpoint:null,research:{completedRanks:{gameSpeed:8}}};
    const fixture={id:'mature-5x',savePath:'mature-5x.json',requestedSpeed:5,
      qualificationPurchasePolicy:{intervalRealSeconds:900,quantity:'Max',intentsPerInterval:1,
        trackOrder:['cannonAttack','hullCapacity','scrapYield','cannonAttack','cannonCycle','launcherAttack','armor']}};
    const path=join(directory,'manifest.json'),savePath=join(directory,fixture.savePath);
    const manifest={schema:'last-stand-research-qualification-fixtures/v1',storageKey:'singedTerra.lastStand.prototype.v1',
      sourceSha256,cases:[fixture]};
    const write=record=>{const bytes=JSON.stringify(record);writeFileSync(savePath,bytes);fixture.saveSha256=sha(bytes);
      writeFileSync(path,JSON.stringify(manifest));};
    const admit=()=>endurance.admitResearchFixtures(manifest,path,directory);
    write(save);assert.doesNotThrow(admit);
    for(const version of [4,5,7,0,-1,6.5,'6',null,undefined]){
      write({...save,version});assert.throws(admit,/Current endurance requires save version 6/);
    }
    write(save);writeFileSync(savePath,JSON.stringify({...save,version:7}));
    assert.throws(admit,/Fixture bytes changed/);
    write(save);writeFileSync(join(directory,'sources/input-0.cs'),'changed');
    assert.throws(admit,/Fixture source changed/);
    writeFileSync(join(directory,'sources/input-0.cs'),'inert source 0');
    write({...save,research:{completedRanks:{gameSpeed:7}}});assert.throws(admit,/Five times speed must be earned/);
    write(save);fixture.savePath='../mature-5x.json';assert.throws(admit,/named sibling/);
  }finally{
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory,{recursive:true,force:true});
  }
});

test('researched 5x counts real hours and rejects missing entitlement or covert acceleration',()=>{
  assert.equal(parseEnduranceArguments(['fixture','output','--endurance','--research']).research,true);
  const ledger=newEnduranceLedger(5);
  for(let seconds=0;seconds<=60;seconds++)accountEnduranceObservation(ledger,
    observed(seconds*1000,{speed:5,tick:seconds*100}));
  assert.equal(ledger.activeMs,60000);assert.equal(ledger.observedSimulationMs,300000);
  assert.throws(()=>accountEnduranceObservation(ledger,observed(61000,{speed:1,tick:6100})));
  const fast=newEnduranceLedger(5);accountEnduranceObservation(fast,observed(0,{speed:5,tick:0}));
  assert.throws(()=>{for(let seconds=1;seconds<30;seconds++)accountEnduranceObservation(fast,
    observed(seconds*1000,{speed:5,tick:seconds*200}));},/real elapsed|acceleration/);
  const five={...complete(),expectedSpeed:5,observedSimulationMs:ENDURANCE_POLICY.activeTargetMs*5};
  assert.equal(enduranceVerdict('endurance',five,proof).enduranceQualified,true);
  five.activeMs/=5;five.elapsedMs/=5;
  assert.equal(enduranceVerdict('endurance',five,proof).enduranceQualified,false,'Two hours at 5x is not ten real hours');
  assert.throws(()=>newEnduranceLedger(10));
});

test('one-shot endurance admission cannot be shortened with smoke duration or ambiguous flags',()=>{
  assert.equal(parseEnduranceArguments(['fixture','output','--endurance']).mode,'endurance');
  assert.deepEqual(parseEnduranceArguments(['fixture','output','--smoke','--smoke-seconds=45']),
    {manifest:'fixture',output:'output',mode:'smoke',smokeSeconds:45});
  for(const flags of [[],['--smoke','--endurance'],['--endurance','--endurance'],['--duration=1'],
    ['--endurance','--smoke-seconds=30'],['--smoke','--smoke-seconds=0'],['--smoke','--smoke-seconds=601'],
    ['--smoke','--smoke-seconds=30','--smoke-seconds=31']])
    assert.throws(()=>parseEnduranceArguments(['fixture','output',...flags]));
});

test('active, paused, terminal and uncertain transitions are accounted separately',()=>{
  const ledger=newEnduranceLedger();
  for(const sample of [observed(0),observed(1000),observed(2000,{paused:true,speed:0}),
    observed(3000,{phase:'result',speed:0,tick:40}),observed(4000,{phase:'workshop',speed:0,tick:40}),
    observed(5000,{runId:3,tick:0}),observed(6000,{runId:3,tick:20})])accountEnduranceObservation(ledger,sample);
  assert.equal(ledger.activeMs,2000);assert.equal(ledger.pausedMs,1000);assert.equal(ledger.endedMs,1000);
  assert.equal(ledger.unknownMs,2000);assert.equal(ledger.elapsedMs,6000);
  assert.equal(ledger.activeMs+ledger.pausedMs+ledger.endedMs+ledger.unknownMs,ledger.elapsedMs);
});

test('reload, stale state, missing wall observations, acceleration and run tick reversal fail',()=>{
  for(const bad of [observed(1000,{timeOrigin:54321}),observed(1000,{stateAgeMs:5001}),
    observed(5001),observed(1000,{speed:5}),observed(1000,{tick:-1}),observed(1000,{tick:0}),observed(-1)]){
    const ledger=newEnduranceLedger();accountEnduranceObservation(ledger,observed(0,{tick:10}));
    assert.throws(()=>accountEnduranceObservation(ledger,bad));
  }
});

test('a frozen active game cannot turn elapsed wall time into successful endurance',()=>{
  const ledger=newEnduranceLedger();accountEnduranceObservation(ledger,observed(0,{tick:0}));
  for(let seconds=1;seconds<30;seconds++)accountEnduranceObservation(ledger,observed(seconds*1000,{tick:0}));
  assert.throws(()=>accountEnduranceObservation(ledger,observed(30000,{tick:0})),/stopped advancing/);
});

test('declared 1x cannot conceal sustained 2x ticks or refresh its observation-age allowance',()=>{
  for(const stateAgeMs of [0,5000]){
    const ledger=newEnduranceLedger();accountEnduranceObservation(ledger,observed(0,{stateAgeMs}));
    assert.throws(()=>{
      for(let seconds=1;seconds<=20;seconds++)accountEnduranceObservation(ledger,
        observed(seconds*1000,{tick:seconds*40,stateAgeMs}));
    },/real elapsed|acceleration/);
  }
  const ledger=complete();ledger.observedSimulationMs*=2;
  assert.equal(enduranceVerdict('endurance',ledger,proof).enduranceQualified,false);
});

test('fixed telemetry jitter is admitted once per run and ordinary 1x remains bounded',()=>{
  const ledger=newEnduranceLedger();accountEnduranceObservation(ledger,observed(0,{stateAgeMs:500}));
  for(let seconds=1;seconds<=100;seconds++)accountEnduranceObservation(ledger,
    observed(seconds*1000,{tick:seconds*20+10,stateAgeMs:5000}));
  assert.equal(ledger.simulationLeadAllowanceMs,1500);
  accountEnduranceObservation(ledger,observed(101000,{runId:3,tick:0,stateAgeMs:0}));
  accountEnduranceObservation(ledger,observed(102000,{runId:3,tick:20,stateAgeMs:0}));
  assert.equal(ledger.simulationLeadAllowanceMs,2500);
  assert.throws(()=>accountEnduranceObservation(ledger,observed(103000,{runId:2})),/run identity/);
});

test('paused or ended time cannot fund later accelerated gameplay',()=>{
  for(const phase of ['battle','result']){
    const ledger=newEnduranceLedger();accountEnduranceObservation(ledger,observed(0,{phase,paused:true,speed:0,tick:0}));
    for(let seconds=1;seconds<=100;seconds++)accountEnduranceObservation(ledger,
      observed(seconds*1000,{phase,paused:true,speed:0,tick:0}));
    accountEnduranceObservation(ledger,observed(101000,{tick:20}));
    assert.throws(()=>{
      for(let seconds=102;seconds<120;seconds++)accountEnduranceObservation(ledger,
        observed(seconds*1000,{tick:20+(seconds-101)*40}));
    },/real elapsed|acceleration/);
  }
  const ledger=complete();ledger.elapsedMs=ENDURANCE_POLICY.wallLimitMs;
  ledger.observedSimulationMs=ENDURANCE_POLICY.activeTargetMs+3600000;
  assert.equal(enduranceVerdict('endurance',ledger,proof).enduranceQualified,false);
});

test('actual startup resumes the earned workshop save using its sole rendered resume control',async()=>{
  assert.equal(typeof endurance.resumeEarnedCheckpoint,'function');
  for(const name of ['Deploy','Redeploy']){
    const calls=[];const layout={controls:[{name,active:true,interactable:true},
      {name:name==='Deploy'?'Redeploy':'Deploy',active:false,interactable:true}]};
    await endurance.resumeEarnedCheckpoint(layout,async control=>calls.push(control));assert.deepEqual(calls,[name]);
  }
  for(const controls of [[],[{name:'Deploy',active:true,interactable:false}],
    ['Deploy','Redeploy'].map(name=>({name,active:true,interactable:true}))])
    await assert.rejects(endurance.resumeEarnedCheckpoint({controls},()=>assert.fail('Must refuse ambiguous or missing resume')));
  const source=readFileSync(new URL('../last-stand-wave-endurance.mjs',import.meta.url),'utf8');
  assert.match(source,/await resumeEarnedCheckpoint\(layout,click\)/,'The production startup must use the tested resolver');
  assert.match(source,/readyObserved\|\|=isEnduranceReadyObservation\(latest\)/,'Startup retains the actual ready action');
  assert.match(source,/until\(\(\)=>readyObserved&&latest\?\.saveState==='ready'/,'Early save-ready controls cannot authorize startup');
  assert.match(source,/chromium\.launch\(\{headless:true,chromiumSandbox:true\}\)/,'The owned browser keeps its sandbox enabled');
});

test('only the actual runtime ready event qualifies initial readiness',()=>{
  assert.equal(typeof endurance.isEnduranceReadyObservation,'function');
  for(const state of [undefined,{saveState:'ready'},{action:'controls-ready',saveState:'ready'},
    {action:'ready',saveState:'failed'}])assert.equal(endurance.isEnduranceReadyObservation(state),false);
  assert.equal(endurance.isEnduranceReadyObservation({action:'ready',saveState:'ready'}),true);
});

test('passive checkpoint latency measures real storage calls and preserves their returns and errors',()=>{
  assert.equal(typeof endurance.installCheckpointStorageProbe,'function');
  let now=0;const values=new Map();const denied=new Error('quota');
  class Storage {setItem(key,value){now+=2;if(value==='deny')throw denied;values.set(key,String(value));return undefined;}
    getItem(key){now+=3;return values.get(key)??null;}}
  const localStorage=new Storage(),sessionStorage=new Storage();
  const window={localStorage,Storage};const globals={window,performance:{now:()=>now},Reflect,Object,String,Math};
  runInNewContext('('+endurance.installCheckpointStorageProbe.toString()+')()',globals);
  assert.equal(localStorage.setItem('unrelated','x'),undefined);sessionStorage.setItem('singedTerra.lastStand.prototype.v1','session');
  const key='singedTerra.lastStand.prototype.v1';assert.equal(localStorage.setItem(key,'saved'),undefined);
  assert.equal(localStorage.getItem(key),'saved');
  assert.throws(()=>localStorage.setItem(key,'deny'),error=>error===denied);
  let result=window.__stCheckpointStorageProbe.snapshot();
  assert.equal(result.writes.count,2);assert.equal(result.writes.successes,1);assert.equal(result.writes.errors,1);
  assert.equal(result.writes.maximumMs,2);assert.equal(result.readbacks.count,1);
  assert.equal(result.readbacks.maximumMs,5);assert.equal(result.readbacks.mismatches,0);
  for(let n=0;n<100;n++){localStorage.setItem(key,String(n));assert.equal(localStorage.getItem(key),String(n));}
  result=window.__stCheckpointStorageProbe.snapshot();assert.equal(result.recent.length,16);
  assert.equal(result.recentDropped,86);assert.equal(result.writes.count,102);assert.equal(result.readbacks.count,101);
});

test('smoke remains diagnostic even if supplied a ten-hour observation fixture',()=>{
  const verdict=enduranceVerdict('smoke',complete(),proof);
  assert.equal(verdict.status,'smoke-pass');assert.equal(verdict.enduranceQualified,false);
  assert.equal(enduranceVerdict('smoke',newEnduranceLedger(),proof).status,'incomplete');
});

test('endurance requires ten active hours, correlated simulation and final identity verification',()=>{
  assert.deepEqual(enduranceVerdict('endurance',complete(),proof),{status:'pass',enduranceQualified:true});
  for(const mutate of [value=>value.activeMs--,value=>value.elapsedMs=ENDURANCE_POLICY.wallLimitMs+1,
    value=>value.observedSimulationMs=0,value=>value.samples=3]){
    const ledger=complete();mutate(ledger);assert.equal(enduranceVerdict('endurance',ledger,proof).enduranceQualified,false);
  }
  for(const fault of [{completed:false},{finalBindingsVerified:false},{storageLatencyVerified:false},{errors:1},{interrupted:true}])
    assert.equal(enduranceVerdict('endurance',complete(),{...proof,...fault}).enduranceQualified,false);
  assert.equal(enduranceVerdict('endurance',complete(),{...proof,interrupted:true}).status,'interrupted');
});

test('bounded diagnostic rings retain their newest observations and report exact drops',()=>{
  const items=[];let dropped=0;
  for(let n=0;n<10000;n++)dropped+=appendBounded(items,{sequence:n},128);
  assert.equal(items.length,128);assert.equal(dropped,9872);
  assert.equal(items[0].sequence,9872);assert.equal(items.at(-1).sequence,9999);
  assert.throws(()=>appendBounded(items,{},0));
});

test('failed final evidence retention always closes the owned browser and keeps the first error',async()=>{
  assert.equal(typeof endurance.finalizeOwnedEndurance,'function');
  const calls=[],failures=[],diskFull=new Error('ENOSPC'),closeError=new Error('browser close'),retryError=new Error('EACCES');
  let writes=0;
  const result=await endurance.finalizeOwnedEndurance({prepareReport:()=>calls.push('prepare'),
    persist:()=>{calls.push('persist');throw ++writes===1?diskFull:retryError;},
    closeBrowser:async()=>{calls.push('close');throw closeError;},onFailure:error=>failures.push(error)});
  assert.equal(result,diskFull);assert.deepEqual(calls,['prepare','persist','close','persist']);
  assert.deepEqual(failures,[diskFull,closeError,retryError]);
  let closed=0;
  const hashError=new Error('readback denied');
  assert.equal(await endurance.finalizeOwnedEndurance({prepareReport:()=>{throw hashError;},persist:()=>{},
    closeBrowser:async()=>{closed++;},onFailure:()=>{}}),hashError);
  assert.equal(closed,1);
  const source=readFileSync(new URL('../last-stand-wave-endurance.mjs',import.meta.url),'utf8');
  assert.match(source,/process\.exitCode=1;\s*await finalizeOwnedEndurance\(/,'Exit failure does not depend on successful disk retention');
});

// Run the actual orchestration with inert browser/filesystem seams. The clock
// advances only when an awaited operation is scheduled, never inside accounting.
function observationClock(){
  let now=0;const pending=[];
  const sleep=ms=>new Promise(resolve=>pending.push({at:now+ms,resolve}));
  return {now:()=>now,sleep,pending:()=>pending.length,async finish(operation){
    let result,error,settled=false;
    operation.then(value=>{result=value;settled=true;},value=>{error=value;settled=true;});
    for(let count=0;count<10000&&!settled;count++){
      await new Promise(resolve=>setImmediate(resolve));
      if(settled)break;
      assert.ok(pending.length,'The actual orchestration must await owned work');
      now=Math.min(...pending.map(item=>item.at));
      const due=pending.filter(item=>item.at===now);
      for(const item of due){pending.splice(pending.indexOf(item),1);item.resolve();}
    }
    assert.ok(settled,'Bounded deterministic orchestration');
    if(error)throw error;return result;
  }};
}

async function actualEnduranceOrchestration({screenshotMs=0,speed=5,transitions=false,
  probeFailure=null,actionFailure=null,cancelAt=Infinity,retained={},
  saved={version:6,pendingDefeat:null,checkpoint:null}}={}){
  const clock=observationClock(),ledger=newEnduranceLedger(speed),observations=[],actions=[];
  const report={summaries:0,screenshots:[],runsObserved:0,callback:{},audioCueTelemetry:{}};
  const card={key:'cannonAttack',level:0,cap:100,n:0,category:'Attack',canPurchase:true};
  const shop={open:false,mode:'Run',cards:[card],spentScrap:0};let quantity=0;
  const layout={shopControls:[{name:'ShopQuantity',label:'[1]'}]};
  const probe=()=>({timeOrigin:123,now:clock.now(),frames:{},audioContexts:{}});
  const globals={...endurance,assert,performance:{now:clock.now},ledger,report,started:0,
    options:{research:!transitions,mode:'smoke',smokeSeconds:60},expectedSpeed:speed,
    fixture:{qualificationPurchasePolicy:{trackOrder:['cannonAttack']}},shop,layout,
    interrupted:false,observerError:null,completed:false,previousRun:0,output:'inert',saveKey:'save',samplesPath:'inert',
    until:async predicate=>{assert.ok(predicate(),'Inert rendered state follows its completed input');},
    click:async name=>{const action={name,at:clock.now()};actions.push(action);
      await clock.sleep(['Claim','Redeploy'].includes(name)?7000:1400);action.finishedAt=clock.now();
      if(actionFailure)throw actionFailure;
      if(name==='ShopEntry')shop.open=true;
      if(name==='ShopTabAttack')shop.category='Attack';
      if(name==='ShopQuantity'&&++quantity===3)layout.shopControls[0].label='[MAX]';
      if(name==='ShopCard_cannonAttackBuy'){card.n+=29;shop.spentScrap+=2619;}
      if(name==='ShopClose')shop.open=false;},
    page:{waitForTimeout:clock.sleep,evaluate:async fn=>{
      if(fn.toString().includes('localStorage'))return JSON.stringify(saved);
      if(fn.toString().includes('__stCheckpointStorageProbe'))return {writes:{successes:1,errors:0},readbacks:{count:1,errors:0,mismatches:0,unconfirmed:0},pending:false};
      if(probeFailure&&clock.now()>=2000)throw probeFailure;
      return probe();},screenshot:()=>clock.sleep(screenshotMs)},
    cdp:{send:async()=>({metrics:[]})},checkSourceBindings:()=>{},compactState:value=>({...value}),
    sha:()=> 'inert-hash',resolve:(...parts)=>parts.join('/'),appendFileSync:()=>{},writeFileSync:()=>{},persist:()=>{},
    Buffer,process:{memoryUsage:()=>({})},structuredClone,
    accountEnduranceObservation:(value,next)=>{observations.push({...next});return accountEnduranceObservation(value,next);}};
  Object.defineProperties(globals,{interrupted:{get:()=>clock.now()>=cancelAt},latestAt:{get:clock.now},latest:{get:()=>{
    const state={saveState:'ready',checkpointBlocked:false,hasCheckpoint:false,
      phase:'battle',paused:false,speed,tick:Math.floor(clock.now()*speed/50),runId:2};
    if(transitions&&clock.now()>=5000){
      const claimed=actions.find(item=>item.name==='Claim')?.finishedAt;
      const deployed=actions.find(item=>item.name==='Redeploy')?.finishedAt;
      if(deployed!==undefined){state.runId=3;state.tick=Math.floor((clock.now()-deployed)*speed/50);}
      else Object.assign(state,{phase:claimed===undefined?'result':'workshop',tick:100*speed,speed:0});
    }
    return state;}}});
  const operation=endurance.observeEnduranceRun(globals);
  try{await clock.finish(operation);}finally{Object.assign(retained,{ledger,observations,actions,pending:clock.pending()});}
  return {ledger,observations,actions,report,completed:globals.completed};
}

test('actual endurance durable readback admits current and retained checkpoint editions in current envelopes',async()=>{
  const current={runId:2,contentVersion:'last-stand-content-v2',encounter:{rulesVersion:'last-stand-waves-v2',tier:1,fitting:1,
    completedWave:1,mortarShots:0,railgunShots:0,nextMortarTick:1,nextRailgunTick:1,mortarDamage:18,railgunDamage:40},
    shop:{economyVersion:'combat-depth-economy-v4'}};
  const retained={runId:2,contentVersion:'last-stand-content-v1',encounter:{rulesVersion:'last-stand-waves-v1',tier:1,fitting:1,completedWave:1},
    shop:{economyVersion:'research-farming-economy-v3'}};
  for(const checkpoint of [null,current,retained]){
    const result=await actualEnduranceOrchestration({saved:{version:6,pendingDefeat:null,checkpoint}});
    assert.equal(result.completed,true);
    assert.equal(result.report.latestSample.checkpoint.wave,checkpoint?.encounter.completedWave??null);
  }
  for(const version of [4,5,7,0,-1,6.5,'6',null,undefined])
    await assert.rejects(actualEnduranceOrchestration({saved:{version,pendingDefeat:null,checkpoint:null}}),/Current endurance requires save version 6/);
  for(const mutate of [cp=>cp.encounter.rulesVersion='unknown',cp=>cp.contentVersion='last-stand-content-v1',
    cp=>cp.shop.economyVersion='research-farming-economy-v3',cp=>delete cp.encounter.mortarDamage]){
    const checkpoint=structuredClone(current);mutate(checkpoint);
    await assert.rejects(actualEnduranceOrchestration({saved:{version:6,pendingDefeat:null,checkpoint}}),
      /Unknown wave rules|Mixed content edition|Mixed economy edition|Missing weapon state/);
  }
  await assert.rejects(actualEnduranceOrchestration({saved:{version:6,pendingDefeat:{runId:2},checkpoint:null}}),
    /Current runs never create legacy Claim rewards/);
});

test('actual endurance observer samples through awaited work and rejects a real sampling blackout',async()=>{
  const result=await actualEnduranceOrchestration();
  assert.equal(result.completed,true);
  assert.equal(result.report.periodicPurchases[0].quantity,29);
  const opened=result.actions.find(item=>item.name==='ShopEntry').at;
  const closed=result.actions.find(item=>item.name==='ShopClose').at+1400;
  assert.ok(closed-opened>ENDURANCE_POLICY.maximumSampleGapMs);
  assert.ok(result.observations.filter(item=>item.atMs>opened&&item.atMs<closed).length>=5,
    'Fresh observations continue during the actual multi-input purchase');
  assert.ok(result.observations.slice(1).every((item,index)=>item.atMs-result.observations[index].atMs<=5000));
  assert.equal(result.ledger.activeMs,result.ledger.elapsedMs);
});

test('actual observer keeps sampling long screenshots and rendered Claim/Redeploy transitions at 1x and 5x',async()=>{
  for(const speed of [1,5]){
    const result=await actualEnduranceOrchestration({speed,screenshotMs:7500,transitions:true});
    assert.equal(result.completed,true);
    assert.ok(result.observations.filter(item=>item.atMs>0&&item.atMs<7500).length>=6,
      'A screenshot cannot stop fresh observations');
    for(const name of ['Claim','Redeploy']){
      const action=result.actions.find(item=>item.name===name);
      assert.ok(result.observations.filter(item=>item.atMs>action.at&&item.atMs<action.finishedAt).length>=5,
        name+' remains observed while its rendered transition is pending');
    }
    assert.equal(result.report.runsObserved,2);
    assert.ok(result.ledger.endedMs>=12000);
    assert.ok(result.ledger.activeMs<result.ledger.elapsedMs-12000,'Result/workshop time cannot become gameplay');
    assert.equal(result.ledger.activeMs+result.ledger.pausedMs+result.ledger.endedMs+result.ledger.unknownMs,result.ledger.elapsedMs);
  }
});

test('owned sampler keeps the exact 5000ms boundary and refuses a true 5001ms blackout without credit',async()=>{
  for(const speed of [1,5])for(const gap of [5000,5001]){
    const clock=observationClock(),ledger=newEnduranceLedger(speed);
    const sampling=endurance.startEnduranceSampling({wait:()=>clock.sleep(gap),sample:async stopped=>{
      if(!stopped())accountEnduranceObservation(ledger,observed(clock.now(),{speed,tick:Math.floor(clock.now()*speed/50)}));}});
    const operation=(async()=>{await sampling.ready;await clock.sleep(gap+1);await sampling.stop();sampling.check();})();
    if(gap===5001){
      await assert.rejects(clock.finish(operation),/Unobserved clock gap/);
      assert.equal(ledger.activeMs,0);assert.equal(ledger.elapsedMs,0);assert.equal(ledger.samples,1);
    }else{
      await clock.finish(operation);assert.equal(ledger.activeMs,5000);assert.equal(ledger.samples,2);
    }
    assert.equal(clock.pending(),0,'Stop joins its pending wait');
  }
});

test('actual orchestration preserves action/probe failures and cancellation while joining its sampler',async()=>{
  for(const kind of ['actionFailure','probeFailure']){
    const failure=new Error(kind),retained={};
    await assert.rejects(actualEnduranceOrchestration({[kind]:failure,retained}),error=>error===failure);
    assert.equal(retained.pending,0,'No observer wait survives failed work');
    assert.ok(retained.ledger.samples>0);
  }
  const retained={},result=await actualEnduranceOrchestration({cancelAt:3500,retained});
  assert.equal(result.completed,false);assert.equal(retained.pending,0);
  assert.equal(result.ledger.elapsedMs,3000,'Cancellation and cleanup add no observation credit');
});

test('stop waits for its in-flight probe and forbids late accounting before browser cleanup',async()=>{
  const clock=observationClock(),order=[],ledger=newEnduranceLedger();
  let reading=0,maximumReaders=0;
  const sampling=endurance.startEnduranceSampling({wait:clock.sleep,sample:async stopped=>{
    maximumReaders=Math.max(maximumReaders,++reading);order.push('probe-start');
    await clock.sleep(2000);reading--;order.push('probe-end');
    if(!stopped())accountEnduranceObservation(ledger,observed(clock.now()));
  }});
  await clock.finish((async()=>{
    await clock.sleep(500);order.push('stop');await sampling.stop();sampling.check();
    await endurance.finalizeOwnedEndurance({prepareReport:()=>{},persist:()=>{},
      closeBrowser:async()=>order.push('close'),onFailure:assert.fail});
  })());
  assert.deepEqual(order,['probe-start','stop','probe-end','close']);
  assert.equal(ledger.samples,0);assert.equal(maximumReaders,1);assert.equal(clock.pending(),0);
});

test('slow fresh probes never overlap and a failed observer wait remains an owned failure',async()=>{
  const clock=observationClock(),ledger=newEnduranceLedger();let readers=0,maximum=0;
  const sampling=endurance.startEnduranceSampling({wait:clock.sleep,sample:async stopped=>{
    maximum=Math.max(maximum,++readers);await clock.sleep(1200);readers--;
    if(!stopped())accountEnduranceObservation(ledger,observed(clock.now()));
  }});
  await clock.finish((async()=>{await sampling.ready;await clock.sleep(7000);await sampling.stop();sampling.check();})());
  assert.equal(maximum,1);assert.equal(readers,0);assert.ok(ledger.samples>=3);assert.equal(clock.pending(),0);
  const failure=new Error('observer wait disconnected');
  const failed=endurance.startEnduranceSampling({sample:async()=>{},wait:async()=>{throw failure;}});
  await failed.ready;await failed.stop();assert.throws(()=>failed.check(),error=>error===failure);
});

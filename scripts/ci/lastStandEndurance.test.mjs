import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ENDURANCE_POLICY,parseEnduranceArguments,newEnduranceLedger,accountEnduranceObservation,
  enduranceVerdict,appendBounded} from '../last-stand-wave-endurance.mjs';
import * as endurance from '../last-stand-wave-endurance.mjs';

const observed=(atMs,changes={})=>({atMs,timeOrigin:12345,stateAgeMs:0,tick:Math.floor(atMs/50),runId:2,
  phase:'battle',paused:false,speed:1,...changes});
const complete=()=>({...newEnduranceLedger(),activeMs:ENDURANCE_POLICY.activeTargetMs,
  elapsedMs:ENDURANCE_POLICY.activeTargetMs+1000,observedSimulationMs:ENDURANCE_POLICY.activeTargetMs,samples:36001});
const proof={completed:true,finalBindingsVerified:true,storageLatencyVerified:true};

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

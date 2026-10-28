import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {LAST_STAND_JOURNEY_INPUTS} from '../../e2e/helpers/lastStandJourney.mjs';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import {WAVE_JOURNEY_INPUTS} from '../../e2e/helpers/lastStandWaveJourney.mjs';
import {currentQualificationInputs} from './lastStandQualification.mjs';
import {idleWaveFields,abandonedWaveSave} from './lastStandWaveSaveFixtures.mjs';
import {WAVE_ORACLE_SOURCES} from '../../e2e/helpers/lastStandWaveOracle.mjs';
import {lastStandViewportPartition,LAST_STAND_ENTRY_ROUTES} from '../../e2e/helpers/lastStandMatrix.mjs';
import {assertLastStandWaveMatrix,WAVE_ENTRY_ACTIONS} from './lastStandWaveMatrixResult.mjs';
import {assertCombinedWaveQualification,assertWaveBinding,assertWaveTerminals,verifyWaveFiles,WAVE_CONTRACT,WAVE_RUNTIME_KEYS,
  WAVE_LIFECYCLE_CHECKS,WAVE_ENTRY_CHECKS,WAVE_RECOVERY_CHECKS,WAVE_ERROR_CHECK} from './lastStandWaveQualification.mjs';

// Inert contract fixtures only. They are never browser reports or acceptance.
const hash='a'.repeat(64),head='b'.repeat(40),clone=value=>structuredClone(value);
const profiles=[1,2].flatMap(tier=>['repair','launcher','scattergun'].flatMap(fitting=>[20,30,40,50].map(d=>`${tier}:${fitting}:${d}`)));
const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const controlInputPaths=['e2e/helpers/lastStandControlReveal.mjs','e2e/helpers/lastStandTierJourney.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json'];

for(const path of controlInputPaths)test('source closure: wave producer binds actual '+path,()=>{
  const wave=readFileSync(new URL('../../e2e/helpers/lastStandWaveJourney.mjs',import.meta.url),'utf8');
  const begin=wave.indexOf('const hashInputs='),end=wave.indexOf('\n',begin);
  assert.ok(begin>0&&end>begin,'Exercise the actual wave input recorder');
  const recorded=runInNewContext(wave.slice(begin,end)+';hashInputs();',{WAVE_JOURNEY_INPUTS,createHash,readFileSync,resolve});
  assert.equal(recorded[path],createHash('sha256').update(readFileSync(resolve(path))).digest('hex'),
    'Wave input recorder must include the actual consumed input: '+path);
});

test('source closure: current wave reader rejects omitted or changed control input bindings',()=>{
  const expected={...expectedFixture(),inputs:currentQualificationInputs()},report=baseReport(expected);
  const check=r=>assertWaveBinding(r,expected,'linux','linux-functional','viewport-section-pass');
  assert.doesNotThrow(()=>check(report));
  for(const path of controlInputPaths)for(const fault of ['omitted','changed','invalid','raw-omitted','raw-invalid']){
    const broken=clone(report);
    if(fault==='omitted')delete broken.binding.portable_text_inputs[path];
    if(fault==='changed')broken.binding.portable_text_inputs[path]='0'.repeat(64);
    if(fault==='invalid')broken.binding.portable_text_inputs[path]='invalid hash';
    if(fault==='raw-omitted')delete broken.binding.input_files[path];
    if(fault==='raw-invalid')broken.binding.input_files[path]='invalid hash';
    assert.throws(()=>check(broken),undefined,fault+' '+path);
  }
});
// Reduced from the failed native checkpoint-reload capture: wallet 6, workshop,
// inactive Deploy and active Redeploy both labelled RESUME RUN. Inert guards only.
function deploymentFixture(phase='workshop',hasCheckpoint=true){
  const state={load:19,timeOrigin:1792728632683.2,scope:'healthy',phase,saveState:'ready',wallet:6,hasCheckpoint};
  const layout={load:state.load,timeOrigin:state.timeOrigin,scope:state.scope,phase,
    controls:['Deploy','Redeploy'].map(name=>({name,label:hasCheckpoint?'RESUME RUN':'DEPLOY',
      active:name===(phase==='garage'?'Deploy':'Redeploy'),interactable:true}))};
  return {state,layout};
}
test('deployment control binds observed phase, checkpoint intent and the exact current layout',()=>{
  assert.equal(typeof journey.lastStandDeploymentControl,'function');
  for(const phase of ['garage','workshop'])for(const checkpoint of [true,false]){
    const value=deploymentFixture(phase,checkpoint);
    assert.equal(journey.lastStandDeploymentControl(value.state,value.layout),phase==='garage'?'Deploy':'Redeploy');
  }
  for(const mutate of [v=>v.layout.phase='garage',v=>v.layout.load++,v=>v.layout.timeOrigin++,v=>v.layout.scope='other',
    v=>v.state.phase=v.layout.phase='battle',v=>v.state.saveState='failed',v=>v.state.hasCheckpoint='true',
    v=>v.layout.controls.forEach(c=>c.active=true),v=>v.layout.controls.forEach(c=>c.active=false),
    v=>{v.layout.controls[0].active=true;v.layout.controls[0].interactable=false;},
    v=>v.layout.controls[1].interactable=false,v=>v.layout.controls[1].name='Deploy',v=>v.layout.controls[1].label='DEPLOY',
    v=>v.layout.controls.push({...v.layout.controls[1]})]){
    const value=deploymentFixture();mutate(value);assert.throws(()=>journey.lastStandDeploymentControl(value.state,value.layout));
  }
});
test('actual earned checkpoint, purchase and terminal reload callers choose the observed primary control',async()=>{
  const calls=[source.match(/const resumedCheckpoint=(await gameClick\([^;\n]+\));/),
    source.match(/const hitStart=hits.length;(await gameClick\([^;\n]+\));/),
    source.match(/kind:'terminal-reload',saved:[^\n]+state:finalReload\}\);\n\s*(await gameClick\([^;\n]+\));/)];
  for(const [index,match]of calls.entries()){
    assert.ok(match,'Actual reload deployment caller required: '+index);
    const invoke=new Function('gameClick','states','layouts','lastStandDeploymentControl',`return (async()=>${match[1]})();`);
    for(const phase of ['garage','workshop']){
      const value=deploymentFixture(phase,index===0),observed=[];
      await invoke(async(...args)=>observed.push(args),[value.state],[value.layout],journey.lastStandDeploymentControl);
      assert.deepEqual(observed,[[phase==='garage'?'Deploy':'Redeploy',index===0?'resume':'deploy']]);
      value.layout.phase='battle';
      await assert.rejects(invoke(()=>assert.fail('Mismatched layout must refuse before pointer input'),
        [value.state],[value.layout],journey.lastStandDeploymentControl));
    }
  }
});
test('wave matrix requires exact resume control and keeps earned post-abandon garage distinct',()=>{
  const {reports,expected}=matrixFixture();assert.doesNotThrow(()=>assertLastStandWaveMatrix(reports,expected));
  const resume=rows=>rows.flatMap(r=>r.screenshots).find(s=>s.file.startsWith('resume-ready-'));
  const abandoned=rows=>rows.flatMap(r=>r.screenshots).find(s=>s.file.startsWith('garage-after-abandon-'));
  for(const mutate of [r=>resume(r).layout.controls[0].name='Deploy',r=>resume(r).layout.controls[0].active=false,
    r=>resume(r).layout.controls.push({...resume(r).layout.controls[0]}),r=>resume(r).layout.scope='other',
    r=>resume(r).state.wallet=0,r=>abandoned(r).state.hasCheckpoint=true,
    r=>abandoned(r).layout.controls[0].name='Redeploy',
    r=>{abandoned(r).state.phase=abandoned(r).layout.phase='workshop';}]){
    const copy=clone(reports);mutate(copy);assert.throws(()=>assertLastStandWaveMatrix(copy,expected));
  }
});
test('current matrix rejects missing admitted clock evidence instead of falling back to archived timing',()=>{
  const {reports,expected}=matrixFixture();
  for(const mutate of [e=>delete e.clock,e=>delete e.after.clockPending,e=>e.clock.elapsed_ms++,
    e=>{delete e.resumed.clockTimestamp;delete e.after.clockTimestamp;delete e.resumed.wave;delete e.after.wave;},
    e=>e.after.tick++,e=>e.after.clockTimestamp+=.05]){
    const copy=clone(reports);mutate(copy[0].lifecycle.find(r=>r.kind==='explicit-pause').evidence);
    assert.throws(()=>assertLastStandWaveMatrix(copy,expected));
  }
});
function expectedFixture(){return {head,inputs:Object.fromEntries(LAST_STAND_JOURNEY_INPUTS.map(p=>[p,hash])),
  runtime:Object.fromEntries(WAVE_RUNTIME_KEYS.map(p=>[p,p==='build'?'inert-test-build':hash])),
  served:Object.fromEntries(Array.from({length:17},(_,i)=>[`file-${i}`,{sha256:hash,bytes:1}])),
  waveSources:Object.fromEntries(WAVE_ORACLE_SOURCES.map(p=>[p,hash]))};}
function resumeFixture(){
  const encounter={rulesVersion:'last-stand-waves-v1',tier:1,fitting:1,wave:1,completedWave:1,tick:201,hull:114,kills:6,committedCannonDamage:20};
  const saved={...idleWaveFields(),credits:2,lastFinalizedRunId:0,checkpoint:{runId:1,encounter},pendingDefeat:null};
  const resumed={action:'resume',t:100,load:2,timeOrigin:1000,phase:'battle',saveState:'ready',runId:1,activeTier:1,
    fittingId:'repair',profileVersion:encounter.rulesVersion,hasCheckpoint:true,checkpointBlocked:false,
    checkpointWave:1,completedWave:1,wave:2,tick:201,hull:114,kills:6,cannonDamage:20,wallet:2,pendingRunId:0,paused:true,speed:0};
  return {kind:'checkpoint-resume',saved,resumed,stable:{...resumed,action:'menu',t:1300},stored:clone(saved),observedClock:{t:1301,timeOrigin:1000}};
}
function terminalFixture(mode){
  const load=mode==='foreground'?3:5,run=mode==='foreground'?2:3,identity={load,timeOrigin:load*1000,scope:'healthy'};
  const before={...identity,t:100,run,status:'Running',loop:{runId:run,phase:'battle'},fitting:'repair',tier:1};
  const terminal={...identity,t:200,run,action:'terminal',status:'Defeated',hp:0,tick:5080,kills:100};
  const staged={...identity,t:201,action:'defeat-staged',phase:'settling',tick:5080,kills:100,hull:0,saveState:'ready',
    sessionRun:run,runId:0,pendingRunId:0,hasCheckpoint:false,wallet:4};
  const result={...staged,action:'result',phase:'result',t:230};
  const saved={...idleWaveFields({runId:run,finalized:true}),checkpoint:null,pendingDefeat:null,lastFinalizedRunId:run,credits:4};
  const layouts=[{...identity,phase:'settling',t:202,controls:[{name:'Claim',active:false,interactable:false}]}];
  return {kind:'wave-terminal',mode,evidence:{before,terminal,staged,result,saved,layouts},
    ...(mode==='hidden'?{continuation:{completion:'hidden'},interval:{begin:110,recovered:240,before:{...before},events:[
      {...identity,t:105,kind:'visibilitychange',hidden:true,focused:false,globalTarget:true},
      {...identity,t:235,kind:'visibilitychange',hidden:false,focused:true,globalTarget:true}]}}:{})};
}
test('hidden terminal cannot use recovered bookkeeping to hide an earlier real visibility return',()=>{
 const valid=lifeReport(expectedFixture());assert.doesNotThrow(()=>assertWaveTerminals(valid));
 for(const change of [r=>r.interval.events[1].t=190,r=>r.interval.events[1].t=220,
  r=>{r.interval.events[1].t=220;r.interval.events.push({...r.interval.events[1],t:239});},r=>r.interval.events.shift(),
  r=>r.interval.events[1].load++,r=>r.interval.events[1].timeOrigin++,r=>r.interval.events[1].scope='other',
  r=>r.interval.events[1].globalTarget=false,r=>r.interval.before.run++,r=>r.interval.begin=99]){
  const value=lifeReport(expectedFixture()),row=value.lifecycle.find(r=>r.kind==='wave-terminal'&&r.mode==='hidden');
  change(row);assert.throws(()=>assertWaveTerminals(value),undefined,String(change));
 }
});
function deferredTerminalFixture(){
 const row=terminalFixture('hidden'),e=row.evidence,identity={load:e.before.load,timeOrigin:e.before.timeOrigin,scope:e.before.scope};
 Object.assign(e.before,{tick:0,selectedSpeed:1,clockTimestamp:1,clockPending:0});
 Object.assign(e.terminal,{t:60210,tick:256});Object.assign(e.staged,{t:60211,tick:256});
 Object.assign(e.result,{t:60230,tick:0});e.layouts[0].t=60212;
 row.interval={before:clone(e.before),begin:110,recovered:60130,ms:14300,events:[
  {...identity,t:105,kind:'visibilitychange',hidden:true,focused:false,globalTarget:true},
  {...identity,t:60120,kind:'visibilitychange',hidden:false,focused:true,globalTarget:true}]};
 const pair=(id,t,fromTick,previousTimestamp,timestamp,priorPending)=>{
  const elapsed=timestamp-previousTimestamp,a={...identity,id,run:e.before.run,t,action:'begin',fromTick,tick:fromTick,steps:0,
   previousTimestamp,timestamp,elapsed,priorPending,pending:priorPending+elapsed,speed:1,paused:false,failed:false};
  return [a,{...a,t:t+20,action:'end',tick:fromTick+128,steps:128,pending:a.pending-6.4}];
 };
 const callbacks=[...pair(1,30000,0,1,30.9,0),...pair(2,60200,128,30.9,61.1,23.5)];
 row.continuation=journey.validateBackgroundWaveTerminal({...row,callbackRecords:callbacks});return row;
}
test('deferred terminal retains full hidden dwell and capped debt through native return, distinct from hidden persistence',()=>{
 const row=deferredTerminalFixture(),callbacks=row.continuation.callbacks;
 assert.equal(row.continuation.completion,'after-native-return');
 assert.deepEqual(journey.validateBackgroundWaveTerminal(terminalFixture('hidden')),{completion:'hidden'});
 const report=lifeReport(expectedFixture());report.lifecycle=report.lifecycle.map(r=>r.kind==='wave-terminal'&&r.mode==='hidden'?row:r);
 assert.doesNotThrow(()=>assertWaveTerminals(report));
 for(const mode of ['hidden','unknown',undefined]){
  const broken=clone(report);broken.lifecycle.find(r=>r.mode==='hidden').continuation.completion=mode;
  assert.throws(()=>assertWaveTerminals(broken));
 }
 // A sub-tick callback can admit time without emitting a record; exact carry
 // must include that gap, without inventing a skipped model step.
 const fractional=clone(row),a=fractional.continuation.callbacks[0],b=fractional.continuation.callbacks[1];
 for(const record of [a,b]){record.previousTimestamp+=.02;record.priorPending+=.02;record.elapsed-=.02;}
 assert.doesNotThrow(()=>journey.validateBackgroundWaveTerminal({...fractional,callbackRecords:fractional.continuation.callbacks}));
 assert.equal(callbacks.at(-1).tick,row.evidence.terminal.tick);
});
test('deferred terminal rejects shortened hidden dwell, interrupted visibility, lost debt, cap overflow and stalled catch-up',()=>{
 const faults=[r=>r.interval.ms--,r=>r.interval.begin=0,r=>r.interval.before.run++,r=>r.evidence.before.selectedSpeed=2,
  r=>r.interval.events[1].t=r.interval.begin+r.interval.ms-1,
  r=>r.interval.events.splice(1,0,{...r.interval.events[1],t:106},{...r.interval.events[0],t:108}),
  r=>r.interval.events[1].focused=false,r=>r.interval.events[0].globalTarget=false,r=>r.interval.events[1].load++,
  r=>r.interval.events[1].timeOrigin++,r=>r.interval.events[1].scope='other',
  r=>r.evidence.result.t=r.interval.recovered+60001,r=>r.evidence.result.sessionRun++,
  r=>r.evidence.terminal.t=60199,r=>r.evidence.terminal.t=60221,r=>r.evidence.terminal.tick++,
  r=>r.continuation.callbacks.pop(),r=>r.continuation.callbacks[2].id++,r=>r.continuation.callbacks[2].load++,
  r=>r.continuation.callbacks[2].fromTick++,r=>r.continuation.callbacks[3].steps=129,
  r=>r.continuation.callbacks[2].paused=true,r=>r.continuation.callbacks[3].failed=true,
  r=>r.continuation.callbacks[2].speed=2,r=>r.continuation.callbacks[2].elapsed=-1,
  ...[.05,.05-.5e-9].map(gap=>r=>{for(const record of r.continuation.callbacks.slice(0,2)){
   record.previousTimestamp+=gap;record.priorPending+=gap;record.elapsed-=gap;}}),
  r=>{for(const record of r.continuation.callbacks.slice(2)){record.previousTimestamp+=.02;record.priorPending+=.02;record.elapsed-=.02;}},
  r=>r.continuation.callbacks[2].previousTimestamp-=1,r=>r.continuation.callbacks[3].timestamp++,
  r=>r.continuation.callbacks[2].priorPending-=.01,r=>r.continuation.callbacks[2].priorPending+=.01,
  r=>r.continuation.callbacks[3].pending-=.01,r=>r.continuation.callbacks[3].pending+=.01,
  r=>r.evidence.before.clockPending+=.01,r=>r.evidence.before.clockTimestamp+=.01];
 for(const fault of faults){const row=deferredTerminalFixture();fault(row);
  assert.throws(()=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks}),undefined,String(fault));}
});
test('deferred terminal rejects a hidden automatic pause, checkpoint failure or replayed background cue',()=>{
 const row=deferredTerminalFixture(),before=row.evidence.before;
 const state={...before,sessionRun:before.run,t:31000,phase:'battle',paused:false,saveState:'ready',checkpointBlocked:false};
 const verify=(states,cues=[])=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks,states,cues});
 assert.doesNotThrow(()=>verify([state]));
 for(const fault of [{paused:true},{checkpointBlocked:true},{saveState:'failed'}])assert.throws(()=>verify([{...state,...fault}]));
 assert.throws(()=>verify([state],[{...before,t:32000,action:'cue'}]));
 assert.throws(()=>verify([state],[{...before,t:60220,action:'cue'}]));
});
test('deferred terminal refuses an unsolicited settling pause before the same result',()=>{
 const row=deferredTerminalFixture(),state={...row.evidence.staged,t:60215,paused:true};
 const verify=states=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks,states});
 assert.doesNotThrow(()=>verify([{...state,paused:false}]));
 assert.doesNotThrow(()=>verify([{...row.evidence.result,paused:true}]));
 assert.throws(()=>verify([state]),/automatic pause/);
});
test('deferred terminal cannot extend its actual native-return deadline using reported recovery time',()=>{
 const row=deferredTerminalFixture();
 row.evidence.result.t=row.interval.events[1].t+60000;
 row.interval.recovered=row.evidence.result.t;
 assert.doesNotThrow(()=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks}));
 row.evidence.result.t++;
 row.interval.recovered=row.evidence.result.t;
 assert.throws(()=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks}),/bounded foreground catch-up/);
});
test('background terminal cannot move its interval start after the source-bound model observation',()=>{
 const row=deferredTerminalFixture();row.interval.before={...row.interval.before,t:107};row.interval.events[0].t=108;
 assert.throws(()=>journey.validateBackgroundWaveTerminal({...row,callbackRecords:row.continuation.callbacks}),/source-bound model observation/);
});
function intervalFixture(kind='hidden'){
  const pause=kind==='explicit-pause';
  const id={load:kind==='hidden'?7:6,timeOrigin:7000,scope:'healthy'},model={...id,action:'tick',run:1,tick:0,
    hp:120,kills:0,spawned:0,cannon:0,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:0,wave:1,completedWave:0,
    rules:'last-stand-waves-v1:playable-prototype-v1',status:'Running',paused:false,failed:false,catchingUp:false,
    callbackSteps:1,selectedSpeed:1,effectiveSpeed:1,clockTimestamp:1,clockPending:0,terminalElapsed:0,fitting:'repair',tier:1};
  const sample=(t,extra={})=>{const row={...model,t,...extra};return {...row,hull:row.hp,loop:{...id,t:t+1,action:'session',phase:'battle',runId:19,
    sessionRun:row.run,tick:row.tick,kills:row.kills,paused:row.paused,activeTier:1,cannonDamage:20,hull:row.hp}};};
  const before=sample(90),paused=sample(100,{action:'pause',paused:true,reason:'user'}),
    returned=sample(10100,{action:'visibility',paused:true,reason:'user',clockTimestamp:11}),
    resumed=sample(10200,{action:'pause',clockTimestamp:11.1}),
    after=sample(pause?10300:200,{tick:1,clockTimestamp:pause?11.15:1.05});
  const events=[{...id,t:110,globalTarget:true,kind:kind==='blur'?'blur':'visibilitychange',hidden:kind!=='blur',focused:false},
    {...id,t:pause?10150:190,globalTarget:true,kind:kind==='blur'?'focus':'visibilitychange',hidden:false,focused:true}];
  const oracle={0:before,1:after};
  const proof=pause?journey.validateExplicitPause({before,paused,returned,resumed,after,events,oracle}):
    journey.validateBackgroundInterval({kind,before,after,events,oracle});
  return {kind,evidence:proof};
}
function baseReport(expected,host='linux'){
  const rt=expected.runtime;
  return {contract:WAVE_CONTRACT,status:'pass',normal_speed:true,qualification:{host,profile:host==='linux'?'linux-functional':'windows-player',
    functional:'viewport-section-pass',merge_ready:false,natural_terminal:'pass',
    ...Object.fromEntries(['rendered_audio','native_blur','capture_cadence','procedural_cues'].map(k=>[k,host==='linux'?'unexecuted-requires-windows':'pass']))},
    binding:{current_head:head,portable_text_inputs:clone(expected.inputs),input_files:clone(expected.inputs),...rt,
      served:clone(expected.served),served_after:clone(expected.served)},
    wave_model:{format:'st-last-stand-wave-model-oracle/1',host,source_lf_sha256:clone(expected.waveSources),
      qualification:'compiled actual wave model bound to inspected player export',export_binding:{build:rt.build,
        sourceInventorySha256:rt.source_inventory_sha256,receiptSha256:rt.receipt_sha256,sourceLockSha256:rt.source_lock_sha256,manifestSha256:rt.manifest_sha256},
      commands:[0,1].map(()=>({exit:0,error:null,argv:['mono','fixture'],stdoutSha256:hash,stderrSha256:hash})),
      output_sha256:hash,executable_sha256:hash,profiles:clone(profiles),rows:24,maximumTicks:12000},
    checks:[{name:WAVE_ERROR_CHECK,pass:true}],actions:[],keyboard_actions:[],input_trace:{matched:true,actions:0,observed_edges:0,outer_keyboard_edges:2},
    keyboard_trace:{matched:true,actions:0,observed_edges:0},lifecycle:[],screenshots:[]};
}
function lifeReport(expected,host='linux'){
  const report=baseReport(expected,host),resume=resumeFixture(),foreground=terminalFixture('foreground'),hidden=terminalFixture('hidden');
  report.checks.push(...WAVE_LIFECYCLE_CHECKS.map(name=>({name,pass:true,...(name==='two salvage commits Cannon Attack level1'?{detail:{wallet:0,level:1,cannonDamage:30}}:{})})));
  report.keyboard_actions=[['ShopCard_cannonAttackBuy','purchase'],['SpeedRate','session'],['Claim','continue'],['Claim','continue']]
    .map(([name,action])=>({name,action,keys:['Enter']}));
  report.keyboard_trace={matched:true,actions:4,observed_edges:8};
  report.lifecycle=[resume,{kind:'checkpoint-abandon',before:clone(resume.saved),after:abandonedWaveSave(resume.saved)},
    {kind:'background-wave',saved:{...idleWaveFields({runId:2}),credits:1,pendingDefeat:null,checkpoint:{runId:2,encounter:{completedWave:1,rulesVersion:'last-stand-waves-v1',tier:1}}},
      interval:{begin:100,recovered:200,before:{load:3,timeOrigin:3000,run:2,tick:0}},after:{t:210,load:3,timeOrigin:3000,run:2,tick:201,loop:{runId:2,wallet:1,activeTier:1}}},
    intervalFixture('explicit-pause'),intervalFixture(),{kind:'no-replay-telemetry',cues:[]},foreground,hidden,
    {kind:'terminal-reload',saved:clone(foreground.evidence.saved),state:{load:4,runId:0,pendingRunId:0,hasCheckpoint:false,wallet:4}}];
  return report;
}
function capture(phase,viewport,file){
  const actual=['checkpoint','resumed','background-checkpoint'].includes(phase)?'battle':phase==='resume-ready'?'workshop':
    phase==='garage-after-abandon'?'garage':phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase;
  const checkpoint=['resume-ready','checkpoint','resumed','background-checkpoint'].includes(phase);
  return {file,viewport:{width:viewport.width,height:viewport.height},sha256:hash,load:1,scope:phase.endsWith('-fault')?phase:'healthy',
    state:{load:1,timeOrigin:1000,scope:'healthy',phase:actual,paused:true,hasCheckpoint:checkpoint,saveState:'ready',wallet:phase==='resume-ready'?1:0},
    layout:{load:1,timeOrigin:1000,scope:'healthy',phase:actual,controls:[{name:actual==='workshop'?'Redeploy':'Deploy',
      label:checkpoint?'RESUME RUN':'DEPLOY',active:true,interactable:true}]}};
}
function matrixFixture(){
  const expected=expectedFixture(),reports=Array.from({length:12},(_,i)=>{
    const section=i<10?'lifecycle':i===10?'recovery':'entry',shard=i<10?`${i+1}/10`:null;
    const p=lastStandViewportPartition(shard??undefined,{host:'linux',profile:'linux-functional'});
    const report=section==='lifecycle'?lifeReport(expected):baseReport(expected);
    report.viewport_partition={section,shard,viewports:section==='lifecycle'?p.viewports.map(v=>v.name):[],
      phase_viewports:section==='entry'?[]:p.phaseViewports.map(v=>v.name),entry_viewports:section==='entry'?p.entryViewports.map(v=>v.name):[],
      gameplay_viewport:section==='recovery'?null:'standard'};
    if(section!=='lifecycle')report.checks.push(...(section==='entry'?WAVE_ENTRY_CHECKS:WAVE_RECOVERY_CHECKS).map(name=>({name,pass:true})));
    const viewports=section==='entry'?p.entryViewports:section==='recovery'?p.phaseViewports:p.viewports;
    for(const v of viewports){
      if(section==='lifecycle')for(const n of [0,1]){const shot=capture('garage',v,`layout-${v.name}-garage-${n}.png`);shot.state.wallet=n;report.screenshots.push(shot);}
      const phases=section==='entry'?['entry']:section==='recovery'?['storage-corrupt','storage-blocked','loader-fault','wasm-fault']:
        p.phaseViewports.length?['garage','battle','checkpoint','resume-ready','resumed','garage-after-abandon','background-checkpoint','result','background-result']:[];
      report.screenshots.push(...phases.map(phase=>capture(phase,v,`${phase}-${v.name}.png`)));
    }
    if(section==='entry'){
      report.actions=WAVE_ENTRY_ACTIONS.map(([name,action])=>({name,action,x:10,y:20}));
      report.input_trace={matched:true,actions:9,observed_edges:18,outer_keyboard_edges:2};
      report.retired_campaign_preservation={before_sha256:hash,after_launch_sha256:hash,native_return:'observed unchanged',retirement:'observed Last Stand only'};
      report.routes=clone(LAST_STAND_ENTRY_ROUTES);report.campaign_entry=p.entryViewports.map(viewport=>({viewport,order:['last-stand'],bounds:{x:0,y:0,width:44,height:44}}));
      report.lifecycle=[{kind:'new-run-cancel',layout:{selection:'ConfirmCancel'},confirmation:{runId:1},cancelled:{runId:1,paused:true},saved:JSON.stringify(resumeFixture().saved)}];
    }
    return report;
  });return {expected,reports};
}
function companionFixture(){
  const expected=expectedFixture(),windows=lifeReport(expected,'win32'),linux=lifeReport(expected);
  for(const report of [windows,linux]){report.qualification.functional='pass';report.checks.push(...[...WAVE_ENTRY_CHECKS,...WAVE_RECOVERY_CHECKS].map(name=>({name,pass:true})));}
  windows.checks.push({name:'all five procedural cues admitted',pass:true,detail:['cannon','impact','destruction','defeat','purchase']});
  windows.lifecycle.push(intervalFixture('blur'));windows.audio=[{},{},{}];windows.motion={};windows.playable_capture={};windows.active_play_review={};
  windows.frame_timing={capture_active:Object.fromEntries(['first-foe-before-impact','first-hit-through-pause','resumed-before-focus-loss','resumed-after-focus-loss']
    .map(name=>[name,{p95_ms:10,p99_ms:20,max_ms:30}])),no_capture_active:{p95_ms:10}};
  const entry=windows.lifecycle.find(r=>r.kind==='wave-terminal'&&r.mode==='foreground'),e=entry.evidence;
  const p=lastStandViewportPartition(undefined,{host:'linux',profile:'linux-functional'}).phaseViewports;
  const paused={...e.staged,action:'session',paused:true,t:205},resumed={...paused,paused:false,t:220};
  entry.interaction={paused,resumed,viewports:p.map(v=>v.name)};
  windows.screenshots=p.map((v,i)=>{const layout={...e.layouts[0],t:206+i,width:v.width,height:v.height};e.layouts.push(layout);
    return {file:`settling-${v.name}.png`,viewport:{width:v.width,height:v.height},sha256:hash,state:{...paused,t:206+i},layout};});
  return {...expected,windows,linux};
}

test('current aggregate retains ten real wave lifecycles, entry, recovery and explicitly pending endurance',()=>{
  const {reports,expected}=matrixFixture(),result=assertLastStandWaveMatrix(reports,expected);
  assert.equal(result.status,'pass');assert.equal(result.natural_terminal,'pass');assert.equal(result.full_acceptance,'pending');assert.equal(result.merge_ready,false);
  const mutations=[r=>r.pop(),r=>r[1]=clone(r[0]),r=>delete r[0].contract,r=>r[0].contract='old-manual-claim',
    r=>r[0].contract='last-stand-waves/v1',r=>r[0].lifecycle[0].saved.version=4,
    r=>delete r[0].wave_model.source_lf_sha256['LastStandEconomyCatalog.cs'],
    r=>r[0].binding.current_head='c'.repeat(40),r=>r[0].binding.served_after={},r=>r[0].wave_model.source_lf_sha256={},
    r=>r[0].wave_model.export_binding=null,r=>r[0].wave_model.commands[1].exit=1,r=>r[0].wave_model.profiles.pop(),
    r=>r[0].qualification.merge_ready=true,r=>r[0].qualification.natural_terminal='pending',r=>r[0].error='failure',
    r=>r[0].lifecycle[0].stable.tick++,r=>r[0].lifecycle[0].stable.t=100,r=>r[0].lifecycle[0].stored.credits++,
    r=>r[0].lifecycle[1].after.credits++,r=>r[0].lifecycle[2].saved.checkpoint.runId=1,
    r=>r[0].lifecycle=r[0].lifecycle.filter(v=>v.kind!=='wave-terminal'),r=>r[0].keyboard_actions.pop(),
    r=>r[0].screenshots.pop(),r=>r[0].screenshots[0].viewport.width++,r=>r[0].screenshots[0].layout.load++,
    r=>r[10].screenshots.pop(),r=>r[10].checks.pop(),r=>r[11].actions.reverse(),r=>r[11].input_trace.observed_edges--,
    r=>r[11].input_trace.outer_keyboard_edges=0,r=>r[11].routes.pop(),r=>r[11].campaign_entry[0].bounds.width=43];
  for(const mutate of mutations){const copy=clone(reports);mutate(copy);assert.throws(()=>assertLastStandWaveMatrix(copy,expected));}
});

test('current entry producer uses the exact nine Linux pointer actions and current aggregate rejects contract drift',()=>{
  const begin=source.indexOf("    if(section.entry){\n    await gameClick('Deploy','deploy');"),end=source.indexOf('    if(section.lifecycle){',begin);
  assert.ok(begin>0&&end>begin);
  const block=source.slice(begin,end).replace(/    if\(player\)\{[^\n]+\}\n/g,'');
  const actions=[...block.matchAll(/await gameClick\('([^']+)','([^']+)'/g)].map(([,name,action])=>[name,action]);
  assert.deepEqual(actions,WAVE_ENTRY_ACTIONS);
  for(const mutate of [r=>r.actions.splice(1,1),r=>r.actions.push(clone(r.actions[0])),r=>r.actions[1].action='deploy',r=>r.lifecycle[0].layout.selection='ConfirmProceed']){
    const {reports,expected}=matrixFixture();mutate(reports[11]);assert.throws(()=>assertLastStandWaveMatrix(reports,expected));
  }
});

test('actual maintained wave purchase feeds current aggregate and rejects wallet, level and damage twins',async()=>{
  const begin=source.indexOf("    const bought=await gameKey('ShopCard_cannonAttackBuy','purchase');"),end=source.indexOf('\n',begin);
  assert.ok(begin>0&&end>begin);const run=new Function('gameKey','check','savedWave','return(async()=>{'+source.slice(begin,end)+'})();');
  for(const fault of [null,{wallet:1},{level:0},{cannonDamage:20}]){
    const {reports,expected}=matrixFixture(),observations=[];
    await run(async()=>({wallet:0,level:1,cannonDamage:30,...fault}),(pass,name,detail)=>observations.push({pass,name,detail}),{credits:2});
    reports[0].checks=reports[0].checks.filter(c=>c.name!=='two salvage commits Cannon Attack level1').concat(observations);
    if(fault)assert.throws(()=>assertLastStandWaveMatrix(reports,expected));else assert.doesNotThrow(()=>assertLastStandWaveMatrix(reports,expected));
  }
});

test('wave companions require Windows media, genuine terminal interaction and cannot promote short runs to full acceptance',()=>{
  const fixture=companionFixture(),result=assertCombinedWaveQualification(fixture);
  assert.equal(result.status,'pass');assert.equal(result.natural_terminal,'pass');assert.equal(result.full_acceptance,'pending');
  assert.throws(()=>assertCombinedWaveQualification({...fixture,requireFull:true}),/endurance/);
  for(const mutate of [v=>v.windows.qualification.procedural_cues='short-run-pass',v=>v.windows.checks.at(-1).detail.splice(3,1),
    v=>v.windows.screenshots.pop(),v=>v.windows.screenshots[0].state.paused=false,v=>v.windows.screenshots[0].layout.load++,
    v=>v.windows.frame_timing.capture_active['first-foe-before-impact'].p95_ms=51,
    v=>v.windows.frame_timing.no_capture_active.p95_ms=0,v=>v.windows.audio.pop(),
    v=>v.linux.qualification.rendered_audio='pass',v=>v.linux.binding.current_head='d'.repeat(40),
    v=>v.linux.lifecycle.find(r=>r.kind==='wave-terminal'&&r.mode==='hidden').interval.recovered=220]){
    const copy=clone(fixture);mutate(copy);assert.throws(()=>assertCombinedWaveQualification(copy));
  }
});

test('current CLIs dispatch only the wave contract while historical exports stay available for archived evidence tests',()=>{
  for(const [name,call]of [['lastStandQualification.mjs','assertCombinedWaveQualification'],['lastStandMatrixResult.mjs','assertLastStandWaveMatrix']]){
    const file=readFileSync(new URL(name,import.meta.url),'utf8'),cli=file.slice(file.indexOf('if(process.argv[1]'));
    assert.ok(cli.includes(call+'('));assert.ok(cli.includes('verifyFiles('));assert.ok(cli.includes('currentWaveExpected('));
  }
});

test('raw wave verifier binds compiler streams, every native edge, oracle membership and actual screenshot pixels',t=>{
  const root=mkdtempSync(join(tmpdir(),'st-inert-wave-reader-'));t.after(()=>rmSync(root,{recursive:true}));mkdirSync(join(root,'wave-model-oracle'));
  const expected=expectedFixture(),report=baseReport(expected),sha=b=>createHash('sha256').update(b).digest('hex');
  const raw=Buffer.from(profiles.flatMap(key=>[0,1,2].map(tick=>key.replaceAll(':',',')+
    `,${tick},${tick===2?0:120},0,0,0,0,0,0,${tick===2?1:0},0,0,1,0,${tick===2?'Defeated':'Running'}\r\n`)).join(''));
  const empty=Buffer.alloc(0),driver=Buffer.from('inert fixture, never executed'),exe=Buffer.from('not an executable');
  const model=report.wave_model;model.rows=72;model.inputs={'/inert/Program.cs':sha(driver)};model.executable_sha256=sha(exe);model.output_sha256=sha(raw);
  model.commands[0].stdoutSha256=sha(empty);model.commands[0].stderrSha256=sha(empty);model.commands[1].stdoutSha256=sha(raw);model.commands[1].stderrSha256=sha(empty);
  const put=(name,value)=>writeFileSync(join(root,name),typeof value==='object'&&!Buffer.isBuffer(value)?JSON.stringify(value):value);
  put('wave-model-oracle/binding.json',model);put('wave-model-oracle/commands.json',{inputs:model.inputs,commands:model.commands});
  put('wave-model-oracle/Program.cs',driver);put('wave-model-oracle/WaveOracle.exe',exe);
  put('wave-model-oracle/compile.stdout',empty);put('wave-model-oracle/compile.stderr',empty);put('wave-model-oracle/run.stdout',raw);put('wave-model-oracle/run.stderr',empty);
  put('runtime-telemetry.json',{states:[],encounters:[],layouts:[]});put('input-trace.json',[]);report.input_trace.outer_keyboard_edges=0;
  assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));
  for(const name of ['Program.cs','WaveOracle.exe','compile.stdout','compile.stderr','run.stdout','run.stderr']){
    const path='wave-model-oracle/'+name,original=readFileSync(join(root,path));put(path,Buffer.from('changed'));
    assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));put(path,original);
  }
  put('input-trace.json',[{area:'gameplay',kind:'pointerdown'}]);assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));put('input-trace.json',[]);
  for(const kind of ['explicit-pause','hidden']){
    const record=intervalFixture(kind),e=record.evidence;
    const endpoints=kind==='explicit-pause'?['before','paused','returned','resumed','after']:['before','after'];
    const telemetry={states:endpoints.map(key=>e[key].loop),encounters:endpoints.map(key=>{
      const {loop,hull,...row}=e[key];return row;
    }),layouts:[]};
    report.lifecycle=[record];put('runtime-telemetry.json',telemetry);put('input-trace.json',e.events);
    assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));
    for(const mutate of [v=>v.clock.elapsed_ms++,v=>v.after.clockTimestamp+=.05,v=>v.after.clockPending=.04,
      v=>v.after.loop.load++,v=>v.events.pop(),v=>v.events[0].globalTarget=false]){
      const broken=clone(record);mutate(broken.evidence);report.lifecycle=[broken];
      assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
    }
    // Both rows really exist in this inert raw capture. Authenticating each row
    // separately must not admit a report that pairs unrelated observations.
    for(const mutate of [v=>v.load++,v=>v.timeOrigin++,v=>v.scope='other',v=>v.sessionRun++,v=>v.runId++,
      v=>v.tick++,v=>v.kills++,v=>v.paused=true,v=>v.t=e.after.t-.1]){
      const broken=clone(record),alternate=broken.evidence.after.loop;alternate.t+=.25;mutate(alternate);
      const withAlternate=clone(telemetry);withAlternate.states.push(alternate);
      report.lifecycle=[broken];put('runtime-telemetry.json',withAlternate);
      assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report),undefined,String(mutate));
    }
    put('runtime-telemetry.json',telemetry);
    report.lifecycle=[record];const changed=clone(telemetry);changed.encounters.at(-1).clockTimestamp+=.05;
    put('runtime-telemetry.json',changed);assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
    put('runtime-telemetry.json',telemetry);put('input-trace.json',e.events.slice(0,1));
    assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
  }
  const before=intervalFixture().evidence.before;Object.assign(before.loop,{wallet:4,completedWave:0,saveState:'ready'});
  const {loop,hull,...initial}=before,terminal={...initial,t:200,tick:2,action:'terminal',status:'Defeated',hp:0,closeHits:1};
  const staged={...loop,t:201,action:'defeat-staged',phase:'settling',runId:0,pendingRunId:0,hasCheckpoint:false,tick:2,hull:0};
  const result={...staged,t:230,action:'result',phase:'result',tick:0},layout={...staged,t:202,controls:[]};
  const terminalRaw={states:[loop,staged,result],encounters:[initial,terminal],layouts:[layout]};
  const saved={...idleWaveFields({runId:19,finalized:true}),checkpoint:null,pendingDefeat:null,lastFinalizedRunId:19,credits:4};
  const proof=journey.validateWaveTerminal({before,result,saved,...terminalRaw,oracle:{0:initial,2:terminal}});
  const interval={before,begin:110,recovered:240,events:terminalFixture('hidden').interval.events.map(e=>({...e,load:before.load,timeOrigin:before.timeOrigin}))};
  report.lifecycle=[{kind:'wave-terminal',mode:'hidden',evidence:proof,interval,continuation:{completion:'hidden'}}];put('runtime-telemetry.json',terminalRaw);put('input-trace.json',interval.events);
  assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));
  for(const changed of [interval.events.slice(0,1),interval.events.map(e=>({...e,load:e.load+1})),
    interval.events.map(e=>e.hidden?e:{...e,t:220})]){
    put('input-trace.json',changed);assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
  }
  // Exercise the same raw oracle reader for deferred completion. These are
  // inert observations, never a browser qualification or a save injection.
  const deferredRaw=clone(terminalRaw),[deferredBefore,deferredTerminal]=deferredRaw.encounters;
  deferredTerminal.t=2010;deferredRaw.states[1].t=2011;deferredRaw.states[2].t=2030;deferredRaw.layouts[0].t=2012;
  const callback={load:before.load,timeOrigin:before.timeOrigin,scope:before.scope,run:before.run,id:1,t:2000,
    action:'begin',fromTick:0,tick:0,steps:0,previousTimestamp:1,timestamp:2.9,elapsed:1.9,priorPending:0,
    pending:1.9,speed:1,paused:false,failed:false};
  deferredRaw.callbackRecords=[callback,{...callback,t:2020,action:'end',tick:2,steps:2,pending:1.8}];deferredRaw.cues=[];
  const deferredProof=journey.validateWaveTerminal({before,result:deferredRaw.states[2],saved,...deferredRaw,oracle:{0:deferredBefore,2:deferredTerminal}});
  const deferredInterval={...interval,recovered:1910,ms:1600,events:interval.events.map(e=>e.hidden?e:{...e,t:1900})};
  const deferred={kind:'wave-terminal',mode:'hidden',evidence:deferredProof,interval:deferredInterval};
  deferred.continuation=journey.validateBackgroundWaveTerminal({...deferred,...deferredRaw});
  report.lifecycle=[deferred];put('runtime-telemetry.json',deferredRaw);put('input-trace.json',deferredInterval.events);
  assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));
  for(const fault of [r=>r.callbackRecords.pop(),r=>r.callbackRecords[1].pending-=.01,
    r=>r.callbackRecords[1].steps=129,r=>r.callbackRecords[0].run++,r=>r.callbackRecords[0].t=2011,
    r=>r.states.push({...loop,t:1800,paused:true}),r=>r.states.push({...loop,t:1800,checkpointBlocked:true}),
    r=>r.states.push({...loop,t:2015,phase:'settling',paused:true}),
    r=>r.states.push({...loop,t:1800,saveState:'failed'}),r=>r.cues.push({...callback,t:2005})]){
    const changed=clone(deferredRaw);fault(changed);put('runtime-telemetry.json',changed);
    assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report),undefined,String(fault));
  }
  put('runtime-telemetry.json',deferredRaw);
  for(const fault of [r=>r.interval.ms--,r=>r.continuation.completion='hidden',r=>r.continuation.callbacks.pop(),
    r=>r.continuation.callbacks[0].priorPending+=.01]){
    const changed=clone(deferred);fault(changed);report.lifecycle=[changed];
    assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report),undefined,String(fault));
  }
  report.lifecycle=[deferred];put('input-trace.json',deferredInterval.events.map(e=>e.hidden?e:{...e,t:1709}));
  assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
  const stalled=clone(deferred),stalledRaw=clone(deferredRaw);
  stalled.evidence.result.t=stalled.interval.events[1].t+60001;stalled.interval.recovered=stalled.evidence.result.t;
  stalledRaw.states[2].t=stalled.evidence.result.t;
  report.lifecycle=[stalled];put('runtime-telemetry.json',stalledRaw);put('input-trace.json',deferredInterval.events);
  assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report),/bounded foreground catch-up/);
  const masked=clone(deferred);masked.interval.before={...masked.interval.before,t:107};masked.interval.events[0].t=108;
  const interrupted=[deferredInterval.events[0],{...deferredInterval.events[1],t:106},
    {...deferredInterval.events[0],t:108},deferredInterval.events[1]];
  report.lifecycle=[masked];put('runtime-telemetry.json',deferredRaw);put('input-trace.json',interrupted);
  assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
  report.lifecycle=[];put('runtime-telemetry.json',{states:[],encounters:[],layouts:[]});put('input-trace.json',[]);
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(44,16);png.writeUInt32BE(44,20);
  put('shot.png',png);report.screenshots=[{file:'shot.png',sha256:sha(png),viewport:{width:44,height:44}}];
  assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));report.screenshots[0].viewport.width=45;
  assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
});

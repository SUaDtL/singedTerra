import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LAST_STAND_JOURNEY_INPUTS} from '../../e2e/helpers/lastStandJourney.mjs';
import {WAVE_ORACLE_SOURCES} from '../../e2e/helpers/lastStandWaveOracle.mjs';
import {lastStandViewportPartition,LAST_STAND_ENTRY_ROUTES} from '../../e2e/helpers/lastStandMatrix.mjs';
import {assertLastStandWaveMatrix,WAVE_ENTRY_ACTIONS} from './lastStandWaveMatrixResult.mjs';
import {assertCombinedWaveQualification,assertWaveBinding,verifyWaveFiles,WAVE_CONTRACT,WAVE_RUNTIME_KEYS,
  WAVE_LIFECYCLE_CHECKS,WAVE_ENTRY_CHECKS,WAVE_RECOVERY_CHECKS,WAVE_ERROR_CHECK} from './lastStandWaveQualification.mjs';

// Inert contract fixtures only. They are never browser reports or acceptance.
const hash='a'.repeat(64),head='b'.repeat(40),clone=value=>structuredClone(value);
const profiles=[1,2].flatMap(tier=>['repair','launcher','scattergun'].flatMap(fitting=>[20,30,40,50].map(d=>`${tier}:${fitting}:${d}`)));
const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');
function expectedFixture(){return {head,inputs:Object.fromEntries(LAST_STAND_JOURNEY_INPUTS.map(p=>[p,hash])),
  runtime:Object.fromEntries(WAVE_RUNTIME_KEYS.map(p=>[p,p==='build'?'inert-test-build':hash])),
  served:Object.fromEntries(Array.from({length:17},(_,i)=>[`file-${i}`,{sha256:hash,bytes:1}])),
  waveSources:Object.fromEntries(WAVE_ORACLE_SOURCES.map(p=>[p,hash]))};}
function resumeFixture(){
  const encounter={rulesVersion:'last-stand-waves-v1',tier:1,fitting:1,wave:1,completedWave:1,tick:201,hull:114,kills:6,committedCannonDamage:20};
  const saved={version:4,credits:1,lastFinalizedRunId:0,checkpoint:{runId:1,encounter},pendingDefeat:null};
  const resumed={action:'resume',t:100,load:2,timeOrigin:1000,phase:'battle',saveState:'ready',runId:1,activeTier:1,
    fittingId:'repair',profileVersion:encounter.rulesVersion,hasCheckpoint:true,checkpointBlocked:false,
    checkpointWave:1,completedWave:1,wave:2,tick:201,hull:114,kills:6,cannonDamage:20,wallet:1,pendingRunId:0,paused:true,speed:0};
  return {kind:'checkpoint-resume',saved,resumed,stable:{...resumed,action:'menu',t:1300},stored:clone(saved),observedClock:{t:1301,timeOrigin:1000}};
}
function terminalFixture(mode){
  const load=mode==='foreground'?3:5,run=mode==='foreground'?2:3,identity={load,timeOrigin:load*1000,scope:'healthy'};
  const before={...identity,t:100,run,status:'Running',loop:{runId:run,phase:'battle'},fitting:'repair',tier:1};
  const terminal={...identity,t:200,run,action:'terminal',status:'Defeated',hp:0,tick:5080,kills:100};
  const staged={...identity,t:201,action:'defeat-staged',phase:'settling',tick:5080,kills:100,hull:0,saveState:'ready',
    sessionRun:run,runId:0,pendingRunId:0,hasCheckpoint:false,wallet:4};
  const result={...staged,action:'result',phase:'result',t:230};
  const saved={version:4,checkpoint:null,pendingDefeat:null,lastFinalizedRunId:run,credits:4};
  const layouts=[{...identity,phase:'settling',t:202,controls:[{name:'Claim',active:false,interactable:false}]}];
  return {kind:'wave-terminal',mode,evidence:{before,terminal,staged,result,saved,layouts},
    ...(mode==='hidden'?{interval:{begin:110,recovered:240,before:{...before}}}:{})};
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
  report.checks.push(...WAVE_LIFECYCLE_CHECKS.map(name=>({name,pass:true,...(name==='one salvage commits Cannon Attack level1'?{detail:{wallet:0,level:1,cannonDamage:30}}:{})})));
  report.keyboard_actions=[['ShopCard_cannonAttackBuy','purchase'],['SpeedRate','session'],['Claim','continue'],['Claim','continue']]
    .map(([name,action])=>({name,action,keys:['Enter']}));
  report.keyboard_trace={matched:true,actions:4,observed_edges:8};
  report.lifecycle=[resume,{kind:'checkpoint-abandon',before:clone(resume.saved),after:{...clone(resume.saved),checkpoint:null,lastFinalizedRunId:1}},
    {kind:'background-wave',saved:{version:4,credits:1,pendingDefeat:null,checkpoint:{runId:2,encounter:{completedWave:1,rulesVersion:'last-stand-waves-v1',tier:1}}},
      interval:{begin:100,recovered:200,before:{load:3,timeOrigin:3000,run:2,tick:0}},after:{t:210,load:3,timeOrigin:3000,run:2,tick:201,loop:{runId:2,wallet:1,activeTier:1}}},
    {kind:'explicit-pause',evidence:{}},{kind:'hidden',evidence:{}},{kind:'no-replay-telemetry',cues:[]},foreground,hidden,
    {kind:'terminal-reload',saved:clone(foreground.evidence.saved),state:{load:4,runId:0,pendingRunId:0,hasCheckpoint:false,wallet:4}}];
  return report;
}
function capture(phase,viewport,file){
  const actual=['checkpoint','resumed','background-checkpoint'].includes(phase)?'battle':phase==='resume-ready'?'workshop':
    phase==='garage-after-abandon'?'garage':phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase;
  return {file,viewport:{width:viewport.width,height:viewport.height},sha256:hash,load:1,scope:phase.endsWith('-fault')?phase:'healthy',
    state:{load:1,timeOrigin:1000,phase:actual,paused:true,hasCheckpoint:true,wallet:0},
    layout:{load:1,timeOrigin:1000,phase:actual,controls:[{label:'RESUME RUN',active:true,interactable:true}]}};
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
  windows.lifecycle.push({kind:'blur',evidence:{}});windows.audio=[{},{},{}];windows.motion={};windows.playable_capture={};windows.active_play_review={};
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
    await run(async()=>({wallet:0,level:1,cannonDamage:30,...fault}),(pass,name,detail)=>observations.push({pass,name,detail}),{credits:1});
    reports[0].checks=reports[0].checks.filter(c=>c.name!=='one salvage commits Cannon Attack level1').concat(observations);
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
  const raw=Buffer.from(profiles.map(key=>key.replaceAll(':',',')+',0,120,0,0,0,0,0,0,0,0,0,1,0,Running\r\n').join(''));
  const empty=Buffer.alloc(0),driver=Buffer.from('inert fixture, never executed'),exe=Buffer.from('not an executable');
  const model=report.wave_model;model.inputs={'/inert/Program.cs':sha(driver)};model.executable_sha256=sha(exe);model.output_sha256=sha(raw);
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
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(44,16);png.writeUInt32BE(44,20);
  put('shot.png',png);report.screenshots=[{file:'shot.png',sha256:sha(png),viewport:{width:44,height:44}}];
  assert.doesNotThrow(()=>verifyWaveFiles(join(root,'result.json'),report));report.screenshots[0].viewport.width=45;
  assert.throws(()=>verifyWaveFiles(join(root,'result.json'),report));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import {browserMatrix} from './browserMatrix.mjs';
import {assertLastStandMatrix,lastStandMatrixResultFiles} from './lastStandMatrixResult.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as partitionOwner from '../../e2e/helpers/lastStandMatrix.mjs';

test('independent recovery runs beside lifecycle while preserving every original viewport',()=>{
  const {include:lanes}=browserMatrix(),campaigns=lanes.filter(l=>l.suite==='campaigns');
  assert.equal(campaigns.length,11,'Independent recovery cannot remain serial on the lifecycle critical path');
  assert.deepEqual(campaigns.filter(l=>l.journey_section==='lifecycle').map(l=>l.journey_shard),
    Array.from({length:10},(_,i)=>`${i+1}/10`));
  assert.deepEqual(campaigns.filter(l=>l.journey_section==='recovery').map(l=>l.journey_shard),
    ['']);
  assert.equal(typeof partitionOwner.lastStandJourneySection,'function');
  const scope={host:'linux',profile:'linux-functional',shard:'1/10'};
  assert.deepEqual(partitionOwner.lastStandJourneySection(undefined,scope),{name:'full',lifecycle:true,recovery:true});
  assert.deepEqual(partitionOwner.lastStandJourneySection('lifecycle',scope),{name:'lifecycle',lifecycle:true,recovery:false});
  assert.deepEqual(partitionOwner.lastStandJourneySection('recovery',{...scope,shard:undefined}),{name:'recovery',lifecycle:false,recovery:true});
  for(const value of ['',null,'skip','full','recovery; skip'])
    assert.throws(()=>partitionOwner.lastStandJourneySection(value,scope));
  for(const changed of [{host:'win32'},{profile:'windows-player'},{shard:'1/10'}])
    assert.throws(()=>partitionOwner.lastStandJourneySection('recovery',{...scope,shard:undefined,...changed}));
  assert.throws(()=>partitionOwner.lastStandJourneySection('lifecycle',{...scope,shard:undefined}));
});

test('Campaigns viewport partitions cover all ten profiles without a full-proof claim', () => {
  assert.equal(typeof journey.lastStandViewportPartition, 'function',
    'The measured serial viewport loops need an explicit, closed partition owner');
  const whole = journey.lastStandViewportPartition(undefined, {host:'linux', profile:'linux-functional'});
  const pieces = Array.from({length:10}, (_,i) => journey.lastStandViewportPartition(`${i+1}/10`,
    {host:'linux',profile:'linux-functional'}));
  assert.equal(whole.shard, null);
  assert.deepEqual(pieces.flatMap(p=>p.viewports), whole.viewports);
  assert.deepEqual(pieces.flatMap(p=>p.entryViewports), whole.entryViewports);
  assert.deepEqual(pieces.flatMap(p=>p.phaseViewports),whole.phaseViewports,
    'Partition exactly the original five-phase matrix, without expanding its scope');
  assert.ok(pieces.every(p=>p.captureViewport===whole.captureViewport),
    'Gameplay stays at its original standard viewport; only existing layout inspections are sharded');
  for(const value of ['', '0/10', '11/10', '1/9', '01/10', '1', '1/10; echo bad'])
    assert.throws(()=>journey.lastStandViewportPartition(value,{host:'linux',profile:'linux-functional'}));
  assert.throws(()=>journey.lastStandViewportPartition('1/10',{host:'win32',profile:'windows-player'}));
});

// Inert unit fixtures only. These never become browser or qualification evidence.
function matrixFixture() {
  const head='a'.repeat(40),inputs={'unit-fixture.mjs':'b'.repeat(64)};
  const checks=['unfinished reload abandoned without award','ordinary defeat successfully saved one pending award',
    'pending defeat in actual browser-local storage','successful pending defeat survives reload',
    'one Claim pays exactly one salvage','one salvage commits Cannon Attack level1',
    'purchase reload retains permanent level and spent balance','same first foe one-hit defeated by real 30 damage',
    'background terminal produces one persisted manual result','background Claim cannot award twice',
    '.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
    'corrupt bytes preserved by Retry','blocked writes recover through real Retry','pause stops combat ticks',
    'no unclassified browser/Unity/shader/request errors in any scope'].map(name=>({name,pass:true}));
  const served=Object.fromEntries(Array.from({length:17},(_,i)=>[`unit-runtime-${i}`,{sha256:'c'.repeat(64),bytes:1}]));
  const recoveryNames=new Set(['.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
    'corrupt bytes preserved by Retry','blocked writes recover through real Retry']);
  const reports=Array.from({length:11},(_,i)=>{
    const section=i<10?'lifecycle':'recovery',shard=i<10?`${i+1}/10`:null;
    const partition=journey.lastStandViewportPartition(shard??undefined,{host:'linux',profile:'linux-functional'});
    const profiles=section==='recovery'?partition.phaseViewports:partition.viewports;
    const screenshots=profiles.flatMap(selected=>{
      const viewport=selected.name;
      const labels=section==='recovery'?['storage-corrupt','storage-blocked','loader-fault','wasm-fault']:
        ['layout-garage','layout-workshop',...(i<5?['garage','battle','result','workshop','background-result']:[])];
      return labels.map(label=>{const phase=label.replace('layout-','');return {file:label.startsWith('layout-')?`layout-${viewport}-${phase}-0.png`:`${phase}-${viewport}.png`,
        viewport:{width:selected.width,height:selected.height},sha256:'e'.repeat(64),load:1,
        scope:phase.endsWith('-fault')?phase:'healthy',
        state:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase},
        layout:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase}};});
    });
    return {status:'pass',qualification:{host:'linux',profile:'linux-functional',functional:'viewport-section-pass'},
      viewport_partition:{shard,section,viewports:section==='lifecycle'?profiles.map(v=>v.name):[],
        phase_viewports:partition.phaseViewports.map(v=>v.name),gameplay_viewport:section==='lifecycle'?'standard':null},
      binding:{current_head:head,portable_text_inputs:inputs,served,served_after:served},
      checks:checks.filter(c=>c.name==='no unclassified browser/Unity/shader/request errors in any scope' ||
        (section==='recovery'?recoveryNames.has(c.name):!recoveryNames.has(c.name))),screenshots};
  });
  return {reports,expected:{head,inputs}};
}

test('matrix qualification requires all actual branches, profiles and exact source/runtime bindings', () => {
  const {reports,expected}=matrixFixture();
  const result=assertLastStandMatrix(reports,expected);
  assert.equal(result.status,'pass');assert.equal(result.shards.length,11);
  assert.match(result.scope,/no Windows\/media qualification/);
  const faults=[
    reports=>reports.pop(),reports=>reports.push(reports[0]),reports=>{reports[9]=reports[0];},
    reports=>{reports[0].binding.current_head='d'.repeat(40);},
    reports=>{reports[0].binding.portable_text_inputs={};},
    reports=>{reports[0].binding.served_after={};},
    reports=>{reports[0].qualification.functional='pass';},
    reports=>{reports[0].qualification.host='win32';},
    reports=>{reports[0].status='failed';},
    reports=>{reports[0].error='real failure';},
    reports=>{reports[0].checks[0].pass=false;},
    reports=>{reports[0].checks=reports[0].checks.filter(c=>c.name!=='background Claim cannot award twice');},
    reports=>{reports[0].screenshots.shift();},
    reports=>{reports[0].screenshots[0].viewport.width=1;},
    reports=>{reports[0].screenshots[0].state.phase='result';},
    reports=>{reports[0].screenshots[0].layout.phase='result';},
    reports=>{reports[0].screenshots[0].layout.load=2;},
    reports=>{const c=reports[0].screenshots[0];delete c.load;delete c.state.load;delete c.layout.load;},
    reports=>{reports[0].screenshots[0].layout.timeOrigin=2000;},
    reports=>{reports[10].screenshots.at(-1).scope='healthy';},
    reports=>{reports[10].viewport_partition.section='lifecycle';},
    reports=>{reports[10].viewport_partition.shard='6/10';},
    reports=>{reports[0].viewport_partition.section='full';},
    reports=>{reports[0].viewport_partition.viewports=['wrong'];},
    reports=>{reports[0].viewport_partition.phase_viewports=[];},
    reports=>{reports[0].viewport_partition.gameplay_viewport='wide';},
  ];
  for(const fault of faults){const sample=structuredClone(matrixFixture());fault(sample.reports);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected));}
});

test('recovery qualification refuses every missing original fault profile and branch',()=>{
  const baseline=matrixFixture(),recovery=baseline.reports.at(-1);
  for(const capture of recovery.screenshots){
    const sample=structuredClone(baseline);
    sample.reports.at(-1).screenshots=sample.reports.at(-1).screenshots.filter(s=>s.file!==capture.file);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected),capture.file);
  }
  for(const check of recovery.checks){
    const sample=structuredClone(baseline);
    sample.reports.at(-1).checks=sample.reports.at(-1).checks.filter(c=>c.name!==check.name);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected),check.name);
  }
});

test('actual journey section guards execute both Windows sections and keep Linux owners disjoint',async()=>{
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const entryStart=source.indexOf('    if(section.lifecycle){'),entryEnd=source.indexOf('    const geometry=',entryStart);
  const mainStart=source.indexOf('    if(section.lifecycle){',entryEnd),recoveryStart=source.indexOf('    if(section.recovery){',mainStart);
  const recoveryEnd=source.indexOf("    scope='healthy';\n    report.input_trace=",recoveryStart);
  const blocks=[['lifecycle',source.slice(entryStart,entryEnd)],['lifecycle',source.slice(mainStart,recoveryStart)],
    ['recovery',source.slice(recoveryStart,recoveryEnd)]];
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  for(const section of [{name:'full',lifecycle:true,recovery:true},{name:'lifecycle',lifecycle:true,recovery:false},
    {name:'recovery',lifecycle:false,recovery:true}])for(const [owner,block]of blocks){
      assert.ok(block.startsWith(`    if(section.${owner}){`));
      const reached=new Error('Explicit inert first-side-effect sentinel');
      const stop=()=>{throw reached;};
      const run=new AsyncFunction('section','goto','gameClick','readFileSync','join','ROOT',
        '"use strict";let scope;'+block);
      const execution=run(section,stop,stop,stop,()=>'', '/inert');
      if(section[owner])await assert.rejects(execution,error=>error===reached);
      else await execution;
    }
});

test('CI browser allocation contains every disjoint suite and exactly four general shards', () => {
  const {include:lanes}=browserMatrix();
  assert.equal(lanes.length,17);
  assert.equal(new Set(lanes.map(l=>l.lane)).size,17);
  assert.deepEqual(lanes.filter(l=>l.suite==='core').map(l=>l.shard),[1,2,3,4]);
  assert.equal(lanes.filter(l=>l.suite==='product').length,1);
  assert.equal(lanes.filter(l=>l.suite==='tier').length,1);
  assert.deepEqual(lanes.filter(l=>l.suite==='campaigns' && l.journey_section==='lifecycle').map(l=>l.journey_shard),
    Array.from({length:10},(_,i)=>`${i+1}/10`));
  const whole=journey.lastStandViewportPartition();
  assert.deepEqual(whole.viewports.map(v=>[v.name,v.width,v.height]),[
    ['approved-standard',1366,768],['approved-wide',1920,1080],['approved-portrait',390,844],
    ['approved-landscape',844,390],['approved-compact',720,640],['wide',1600,900],
    ['standard',1280,720],['compact',800,600],['narrow-landscape',568,320],['portrait',390,844],
  ]);
});

test('transport discovery counts journeys and retains failures without counting sandbox results', t => {
  const root=mkdtempSync(join(tmpdir(),'singedterra-matrix-discovery-'));
  const directories=['journey-current-a','journey-current-b','ci-browser-sandbox-owned'];
  t.after(()=>{for(const name of directories){unlinkSync(join(root,name,'result.json'));rmdirSync(join(root,name));}rmdirSync(root);});
  for(const name of directories){mkdirSync(join(root,name));writeFileSync(join(root,name,'result.json'),
    JSON.stringify({status:name.endsWith('-b')?'failed':'pass'}));}
  assert.deepEqual(lastStandMatrixResultFiles(root).sort(),directories.slice(0,2).map(name=>join(root,name,'result.json')).sort());
});

test('portrait partitions resume Ash Road in landscape and restore canonical Unity gameplay', async () => {
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const begin=source.indexOf("    report.ash_road_preservation.native_return='observed unchanged';");
  const end=source.indexOf('    const briefing=',begin);
  assert.ok(begin>0 && end>begin);
  let viewport={width:390,height:844};
  const resume={innerText:async()=> 'Resume Ash Road'},report={ash_road_preservation:{}};
  await runInNewContext('(async()=>{'+source.slice(begin,end)+'})()',{
    report,selected:async()=>{},check:(value,name)=>assert.ok(value,name),
    outerPointer:async target=>{if(target===resume)assert.ok(viewport.width>viewport.height,'Ash Road cannot expose its HUD in portrait');},
    page:{setViewportSize:async value=>{viewport=value;},locator:selector=>selector==='[data-command-primary]'?resume:
      {waitFor:async()=>{},isVisible:async()=>false}},
  });
  assert.equal(viewport.width,1280);assert.equal(viewport.height,720);
  const restored=source.indexOf("'unfinished Return abandoned without award'",end);
  const nextDeploy=source.indexOf("await gameClick('Deploy','deploy')",restored);
  assert.ok(source.slice(restored,nextDeploy).includes('await resize(captureViewport)'),
    'The next Unity deployment must restore the canonical profile after the separate Ash Road check');
});

test('actual HUD geometry reads CSS bounds and backing pixels in one DOM snapshot', async () => {
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const begin=source.indexOf('    const geometry=async(name)=>{'),end=source.indexOf('    const resize=async',begin);
  assert.ok(begin>0 && end>begin);
  for(const fault of [undefined,'hidden','collapsed','zero-area','backing-size']) {
    let reads=0;
    const box={x:0,y:0,width:fault==='zero-area'?0:1280,height:720},element={width:fault==='backing-size'?1290:1280,height:720,
      getBoundingClientRect:()=>box};
    const layout={coordinates:'top-left',width:1280,height:720,
      controls:[{name:'ToggleMute',x:10,y:10,width:44,height:44,active:true,interactable:true}]};
    const run=runInNewContext('(async()=>{'+source.slice(begin,end)+'return geometry("ToggleMute");})()',{
      assert,check:(ok,name)=>assert.ok(ok,name),layouts:[layout],VIEWPORTS:[],
      getComputedStyle:()=>({visibility:fault==='hidden'?'hidden':fault==='collapsed'?'collapse':'visible'}),
      page:{viewportSize:()=>({width:1280,height:720}),locator:()=>({
        boundingBox:async()=>{reads++;return fault==='hidden'?null:box;},
        evaluate:async fn=>{reads++;return fn(element);},
      })},
    });
    if(fault)await assert.rejects(run);
    else {const result=await run;assert.equal(result.item.name,'ToggleMute');assert.equal(result.canvas.width,1280);
      assert.equal(reads,1,'Separate CSS/backing reads add a slow renderer roundtrip to every geometry check');}
  }
});

test('actual phase inspection captures once while preserving geometry and focus checks',async()=>{
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const begin=source.indexOf('    const resize=async'),phase=source.indexOf('    const phaseMatrix=',begin),
    end=source.indexOf('    if(section.lifecycle)await resize(captureViewport);\n    const armGameClick=',phase);
  assert.ok(begin>0 && phase>begin && end>phase);
  const viewport={name:'standard',width:1280,height:720},captures=[];let geometry=0,focus=0;
  await runInNewContext('(async()=>{'+source.slice(begin,end)+'await phaseMatrix("garage");})()',{
    assert,check:(ok,name)=>assert.ok(ok,name),states:[{phase:'garage',paused:false}],
    layouts:[{width:1280,height:720}],report:{screenshots:[]},
    section:{lifecycle:true},matrix:{viewports:[],phaseViewports:[viewport],captureViewport:viewport},
    geometry:async()=>{geometry++;},keyboardFocus:async()=>{focus++;},screenshot:async name=>{captures.push(name);},
    page:{setViewportSize:async()=>{},viewportSize:()=>viewport,waitForTimeout:async()=>{},
      locator:()=>({evaluate:async()=>({width:1280,height:720})}),evaluate:async()=>({width:1280,height:720,
        scrollWidth:1280,scrollHeight:720,nav:{bottom:80},link:{x:0,y:0,right:40,bottom:40},loss:{x:50,y:0,right:100,bottom:40}})},
  });
  assert.equal(geometry,1);assert.equal(focus,1);
  assert.deepEqual(captures,['garage-standard'],'Phase metadata needs one fresh native capture, not a duplicate layout image');
});

test('actual journey check journals every observation without rewriting the growing report each time',()=>{
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const begin=source.indexOf('  const check =',source.indexOf('export async function runLastStandJourney(')),
    end=source.indexOf('  const write =',begin);
  assert.ok(begin>0 && end>begin);
  let clock=0,observerError;const snapshots=[],journal=[],report={status:'running',checks:[],inert_payload:'x'.repeat(5000)};
  const check=runInNewContext(source.slice(begin,end)+'check;',{
    assert,report,resultPath:'owned-result.json',lastResultWrite:-Infinity,Date:{now:()=>clock},
    throwObserverFailure:()=>{if(observerError)throw observerError;},
    writeFileSync:(_path,bytes)=>snapshots.push(JSON.parse(bytes)),
    appendFileSync:(_path,bytes)=>journal.push(JSON.parse(bytes)),
  });
  for(let i=0;i<50;i++)check(true,'observed-'+i,{i});
  assert.equal(snapshots.length,1,'Do not repeatedly serialize a growing multi-megabyte report inside one sampling interval');
  assert.equal(journal.length,50);assert.equal(report.checks.length,50);
  assert.deepEqual(journal.map(row=>row.name),Array.from({length:50},(_,i)=>'observed-'+i));
  assert.throws(()=>check(false,'intentional failure'),/intentional failure/);
  assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).checks.at(-1).pass,false);
  assert.equal(journal.at(-1).pass,false,'A failed assertion must be durably retained before throwing');
  clock=1000;check(true,'later observation');assert.equal(snapshots.length,3);
  observerError=new Error('prior observer failure');
  assert.throws(()=>check(true,'cannot admit observation'),error=>error===observerError);
  assert.equal(journal.length,52);
  const appendError=new Error('owned journal disk failure');
  const failedCheck=runInNewContext(source.slice(begin,end)+'check;',{
    assert,report:{status:'running',checks:[]},resultPath:'owned-result.json',lastResultWrite:-Infinity,
    Date:{now:()=>0},throwObserverFailure:()=>{},appendFileSync:()=>{throw appendError;},
    writeFileSync:()=>assert.fail('A journal failure cannot be hidden by a passing snapshot'),
  });
  assert.throws(()=>failedCheck(true,'must fail persistence'),error=>error===appendError);
});

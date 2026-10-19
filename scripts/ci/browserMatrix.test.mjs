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

test('startup routing has an independent owner instead of repeating on every gameplay shard',()=>{
  const {include:lanes}=browserMatrix();
  assert.equal(lanes.length,18,'Startup routing and entry captures must leave the gameplay critical path');
  assert.deepEqual(lanes.filter(l=>l.journey_section==='entry').map(l=>[l.lane,l.journey_shard]),[['last-stand-12','']]);
  assert.deepEqual(partitionOwner.lastStandJourneySection('entry',{host:'linux',profile:'linux-functional'}),
    {name:'entry',entry:true,lifecycle:false,recovery:false});
  assert.throws(()=>partitionOwner.lastStandJourneySection('entry',{host:'linux',profile:'linux-functional',shard:'1/10'}));
});

test('independent recovery runs beside lifecycle while preserving every original viewport',()=>{
  const {include:lanes}=browserMatrix(),campaigns=lanes.filter(l=>l.suite==='campaigns');
  assert.equal(campaigns.length,12,'Independent recovery cannot remain serial on the lifecycle critical path');
  assert.deepEqual(campaigns.filter(l=>l.journey_section==='lifecycle').map(l=>l.journey_shard),
    Array.from({length:10},(_,i)=>`${i+1}/10`));
  assert.deepEqual(campaigns.filter(l=>l.journey_section==='recovery').map(l=>l.journey_shard),
    ['']);
  assert.equal(typeof partitionOwner.lastStandJourneySection,'function');
  const scope={host:'linux',profile:'linux-functional',shard:'1/10'};
  assert.deepEqual(partitionOwner.lastStandJourneySection(undefined,scope),{name:'full',entry:true,lifecycle:true,recovery:true});
  assert.deepEqual(partitionOwner.lastStandJourneySection('lifecycle',scope),{name:'lifecycle',entry:false,lifecycle:true,recovery:false});
  assert.deepEqual(partitionOwner.lastStandJourneySection('recovery',{...scope,shard:undefined}),{name:'recovery',entry:false,lifecycle:false,recovery:true});
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
  const entryRoutes=[['compatible Ash Road resume','ash-road'],['remembered Skirmishes','standard'],
    ['Return before remembered Ash Road','last-stand'],['validated ST1 before remembered Ash Road','imported-challenge'],
    ['invite before validated ST1','online'],['invite before explicit Return','online'],['rejoin before validated ST1','online'],
    ['invalid mixed signals cannot override remembered Ash Road','ash-road'],['invalid Return spelling cannot override remembered Ash Road','ash-road']]
    .map(([name,selected])=>({name,selected}));
  const entryChecks=['global fresh startup remains Skirmishes','zero Unity runtime payload before ordinary launch',
    'entry loss disclosure is rendered','entry disclosure names no-award unfinished loss',
    'unfinished Return abandoned without award','unfinished reload abandoned without award',
    'Ash Road record bytes preserved through native Last Stand Return','actual compatible Ash Road resume enters its game',
    'no unclassified browser/Unity/shader/request errors in any scope'];
  const unfinishedActions=[{name:'Deploy',action:'deploy',x:0,y:0},{name:'Deploy',action:'deploy',x:0,y:0}];
  const unfinishedTrace=[...unfinishedActions.flatMap(a=>['pointerdown','pointerup'].map(kind=>({kind,area:'gameplay',
    button:0,target:'unity-canvas',x:a.x,y:a.y,focused:true,hidden:false}))),
    ...['keydown','keyup'].map(kind=>({kind,area:'outer',code:'Enter',target:'last-stand-return'}))];
  const reports=Array.from({length:12},(_,i)=>{
    const section=i<10?'lifecycle':i===10?'recovery':'entry',shard=i<10?`${i+1}/10`:null;
    const partition=journey.lastStandViewportPartition(shard??undefined,{host:'linux',profile:'linux-functional'});
    const profiles=section==='entry'?partition.entryViewports:section==='recovery'?partition.phaseViewports:partition.viewports;
    const screenshots=profiles.flatMap(selected=>{
      const viewport=selected.name;
      const labels=section==='entry'?['entry']:section==='recovery'?['storage-corrupt','storage-blocked','loader-fault','wasm-fault']:
        ['layout-garage','layout-workshop',...(i<5?['garage','battle','result','workshop','background-result']:[])];
      return labels.map(label=>{const phase=label.replace('layout-','');return {file:label==='entry'?`entry-${viewport}.png`:
        label.startsWith('layout-')?`layout-${viewport}-${phase}-0.png`:`${phase}-${viewport}.png`,
        viewport:{width:selected.width,height:selected.height},sha256:'e'.repeat(64),load:1,
        scope:phase.endsWith('-fault')?phase:'healthy',
        state:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase},
        layout:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase}};});
    });
    return {status:'pass',qualification:{host:'linux',profile:'linux-functional',functional:'viewport-section-pass'},
      viewport_partition:{shard,section,viewports:section==='lifecycle'?profiles.map(v=>v.name):[],
        phase_viewports:section==='entry'?[]:partition.phaseViewports.map(v=>v.name),
        entry_viewports:section==='entry'?profiles.map(v=>v.name):[],gameplay_viewport:section!=='recovery'?'standard':null},
      binding:{current_head:head,portable_text_inputs:inputs,served,served_after:served},
      checks:section==='entry'?entryChecks.map(name=>({name,pass:true})):checks.filter(c=>c.name==='no unclassified browser/Unity/shader/request errors in any scope' ||
        (section==='recovery'?recoveryNames.has(c.name):!recoveryNames.has(c.name) && c.name!=='unfinished reload abandoned without award')),screenshots,
      ...(section==='entry'?{routes:entryRoutes,input_trace:journey.validateGameplayInput(unfinishedTrace,unfinishedActions),
        actions:unfinishedActions,
        ash_road_preservation:{before_sha256:'f'.repeat(64),after_launch_sha256:'f'.repeat(64),
          native_return:'observed unchanged',actual_resume:'observed via public Resume control'},campaign_entry:profiles.map(viewport=>({viewport,
        order:['last-stand','ash-road'],bounds:{x:0,y:0,width:100,height:44}}))}:{})};
  });
  return {reports,expected:{head,inputs}};
}

test('matrix qualification requires all actual branches, profiles and exact source/runtime bindings', () => {
  const {reports,expected}=matrixFixture();
  const result=assertLastStandMatrix(reports,expected);
  assert.equal(result.status,'pass');assert.equal(result.shards.length,12);
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

test('independent unfinished exits have one required entry owner instead of repeating every gameplay journey',()=>{
  const {reports,expected}=matrixFixture();
  assert.doesNotThrow(()=>assertLastStandMatrix(reports,expected));
  assert.ok(reports.slice(0,10).every(r=>!r.checks.some(c=>c.name==='unfinished reload abandoned without award')));
  assert.ok(reports[11].checks.some(c=>c.name==='unfinished reload abandoned without award'));
});

test('recovery qualification refuses every missing original fault profile and branch',()=>{
  const baseline=matrixFixture(),recovery=baseline.reports[10];
  for(const capture of recovery.screenshots){
    const sample=structuredClone(baseline);
    sample.reports[10].screenshots=sample.reports[10].screenshots.filter(s=>s.file!==capture.file);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected),capture.file);
  }
  for(const check of recovery.checks){
    const sample=structuredClone(baseline);
    sample.reports[10].checks=sample.reports[10].checks.filter(c=>c.name!==check.name);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected),check.name);
  }
});

test('entry qualification requires every original routing case and actual reachable viewport capture',()=>{
  const baseline=matrixFixture(),entry=baseline.reports[11];
  const faults=[
    r=>r.routes.push({...r.routes[0]}),r=>r.routes[0].selected='wrong',r=>r.campaign_entry.pop(),
    r=>r.campaign_entry[0].viewport.width=1,r=>r.campaign_entry[0].order=['ash-road','last-stand'],
    r=>r.campaign_entry[0].bounds.width=43,r=>r.campaign_entry[0].bounds.x=2000,
    r=>r.campaign_entry[0].bounds.y=2000,r=>r.campaign_entry[0].bounds.width='100',
    r=>r.input_trace.actions=1,r=>r.input_trace.observed_edges=2,r=>r.input_trace.matched=false,
    r=>r.input_trace.outer_keyboard_edges=0,r=>r.actions.pop(),r=>r.actions[0].name='Seed',
    r=>r.ash_road_preservation.native_return='unexecuted-in-lifecycle-section',
    r=>r.ash_road_preservation.actual_resume='unexecuted-in-lifecycle-section',
    r=>r.ash_road_preservation.after_launch_sha256='d'.repeat(64),
    r=>r.screenshots[0].load=0,r=>r.screenshots[0].scope='loader-fault',
    r=>r.viewport_partition.entry_viewports=[],r=>r.viewport_partition.phase_viewports=['approved-standard'],
  ];
  for(const expected of entry.routes)faults.push(r=>r.routes=r.routes.filter(v=>v.name!==expected.name));
  for(const capture of entry.screenshots)faults.push(r=>r.screenshots=r.screenshots.filter(v=>v.file!==capture.file));
  for(const check of entry.checks)faults.push(r=>r.checks=r.checks.filter(v=>v.name!==check.name));
  for(const fault of faults){
    const sample=structuredClone(baseline);fault(sample.reports[11]);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected));
  }
});

test('actual journey section guards execute all Windows sections and keep Linux owners disjoint',async()=>{
  const source=readFileSync('e2e/helpers/lastStandJourney.mjs','utf8');
  const commonStart=source.indexOf('    if(section.entry || section.lifecycle){');
  const entryStart=source.indexOf('    if(section.entry){',commonStart);
  const preparationStart=source.indexOf('    if(section.entry || section.lifecycle){',entryStart);
  const entryEnd=source.indexOf('    const geometry=',preparationStart);
  const exitsStart=source.indexOf('    if(section.entry){',entryEnd);
  const mainStart=source.indexOf('    if(section.lifecycle){',exitsStart),recoveryStart=source.indexOf('    if(section.recovery){',mainStart);
  const recoveryEnd=source.indexOf("    scope='healthy';\n    report.input_trace=",recoveryStart);
  const blocks=[['common',source.slice(commonStart,entryStart)],['entry',source.slice(entryStart,preparationStart)],
    ['common',source.slice(preparationStart,entryEnd)],['entry',source.slice(exitsStart,mainStart)],['lifecycle',source.slice(mainStart,recoveryStart)],
    ['recovery',source.slice(recoveryStart,recoveryEnd)]];
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  for(const name of [undefined,'entry','lifecycle','recovery']){
    const section=partitionOwner.lastStandJourneySection(name,{host:'linux',profile:'linux-functional',
      shard:name==='lifecycle'?'1/10':undefined});
    for(const [owner,block]of blocks){
      assert.ok(block.startsWith('    if(section.'));
      const reached=new Error('Explicit inert first-side-effect sentinel');
      const stop=()=>{throw reached;};
      const run=new AsyncFunction('section','goto','gameClick','readFileSync','join','ROOT','assert','ash','skirmish',
        'ashRoadRecord','LAST_STAND_ENTRY_ROUTES','setRouteState','page','screenshot',
        '"use strict";let scope,rejoin,rejoinBinding;'+block);
      const execution=run(section,stop,stop,stop,()=>'', '/inert',assert,{},{},{},partitionOwner.LAST_STAND_ENTRY_ROUTES,
        stop,{setViewportSize:stop},stop);
      if(owner==='common'?(section.entry || section.lifecycle):section[owner])
        await assert.rejects(execution,error=>error===reached);
      else await execution;
    }
  }
});

test('CI browser allocation contains every disjoint suite and exactly four general shards', () => {
  const {include:lanes}=browserMatrix();
  assert.equal(lanes.length,18);
  assert.equal(new Set(lanes.map(l=>l.lane)).size,18);
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

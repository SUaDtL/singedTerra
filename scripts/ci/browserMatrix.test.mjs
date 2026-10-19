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
  const reports=Array.from({length:10},(_,i)=>{
    const shard=`${i+1}/10`,selected=journey.lastStandViewportPartition(shard,{host:'linux',profile:'linux-functional'}).viewports[0],viewport=selected.name;
    return {status:'pass',qualification:{host:'linux',profile:'linux-functional',functional:'viewport-shard-pass'},
      viewport_partition:{shard,viewports:[viewport],phase_viewports:i<5?[viewport]:[],gameplay_viewport:'standard'},
      binding:{current_head:head,portable_text_inputs:inputs,served,served_after:served},checks,
      screenshots:['layout-garage','layout-workshop',...(i<5?['garage','battle','result','workshop','background-result','storage-corrupt','storage-blocked',
        'loader-fault','wasm-fault']:[])].map(label=>{const phase=label.replace('layout-','');return {file:label.startsWith('layout-')?`layout-${viewport}-${phase}-0.png`:`${phase}-${viewport}.png`,
          viewport:{width:selected.width,height:selected.height},sha256:'e'.repeat(64),load:1,
          scope:phase.endsWith('-fault')?phase:'healthy',
          state:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase},
          layout:{load:1,timeOrigin:1000,phase:phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase}};})};
  });
  return {reports,expected:{head,inputs}};
}

test('matrix qualification requires all actual branches, profiles and exact source/runtime bindings', () => {
  const {reports,expected}=matrixFixture();
  const result=assertLastStandMatrix(reports,expected);
  assert.equal(result.status,'pass');assert.equal(result.shards.length,10);
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
    reports=>{reports[0].screenshots.at(-1).scope='healthy';},
    reports=>{reports[0].viewport_partition.viewports=['wrong'];},
    reports=>{reports[0].viewport_partition.phase_viewports=[];},
    reports=>{reports[0].viewport_partition.gameplay_viewport='wide';},
  ];
  for(const fault of faults){const sample=structuredClone(matrixFixture());fault(sample.reports);
    assert.throws(()=>assertLastStandMatrix(sample.reports,sample.expected));}
});

test('CI browser allocation contains every disjoint suite and exactly four general shards', () => {
  const {include:lanes}=browserMatrix();
  assert.equal(lanes.length,16);
  assert.equal(new Set(lanes.map(l=>l.lane)).size,16);
  assert.deepEqual(lanes.filter(l=>l.suite==='core').map(l=>l.shard),[1,2,3,4]);
  assert.equal(lanes.filter(l=>l.suite==='product').length,1);
  assert.equal(lanes.filter(l=>l.suite==='tier').length,1);
  assert.deepEqual(lanes.filter(l=>l.suite==='campaigns').map(l=>l.journey_shard),
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

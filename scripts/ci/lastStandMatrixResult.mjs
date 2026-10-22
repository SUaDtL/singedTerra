import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lastStandViewportPartition,LAST_STAND_ENTRY_ROUTES} from '../../e2e/helpers/lastStandMatrix.mjs';
import {currentQualificationInputs} from './lastStandQualification.mjs';

const functionalChecks=[
  'unfinished reload abandoned without award','ordinary defeat successfully saved one pending award',
  'pending defeat in actual browser-local storage','successful pending defeat survives reload',
  'one Claim pays exactly one salvage','one salvage commits Cannon Attack level1',
  'purchase reload retains permanent level and spent balance','same first foe one-hit defeated by real 30 damage',
  'background terminal produces one persisted manual result','background Claim cannot award twice',
  '.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
  'corrupt bytes preserved by Retry','blocked writes recover through real Retry','pause stops combat ticks',
  'no unclassified browser/Unity/shader/request errors in any scope',
];
const recoveryChecks=['.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
  'corrupt bytes preserved by Retry','blocked writes recover through real Retry'];
const entryChecks=['global fresh startup remains Skirmishes','zero Unity runtime payload before ordinary launch',
  'entry loss disclosure is rendered','entry disclosure names no-award unfinished loss',
  'unfinished Return abandoned without award','unfinished reload abandoned without award',
  'retired campaign has no library entry','retired campaign has no start or resume entry',
  'retired campaign bytes preserved through native Last Stand Return','native Return offers only Last Stand',
  'no unclassified browser/Unity/shader/request errors in any scope'];
export function assertLastStandMatrix(reports,{head,inputs}) {
  assert.match(head,/^[a-f0-9]{40}$/,'Exact matrix checkout required');
  assert.equal(reports.length,12,'All ten lifecycle viewport shards and complete entry/recovery matrices are required');
  const seen=new Set();
  for(const report of reports) {
    const {shard,section}=report.viewport_partition??{};
    assert.ok(['entry','lifecycle','recovery'].includes(section),'Unknown matrix section');
    if(section!=='lifecycle')assert.equal(shard,null,'Entry/recovery require their complete original matrices');
    else assert.ok(shard,'Lifecycle requires a viewport shard');
    const partition=lastStandViewportPartition(shard??undefined,{host:'linux',profile:'linux-functional'});
    const key=section==='lifecycle'?shard:section;
    assert.ok(!seen.has(key),'Missing or duplicate viewport/section shard');seen.add(key);
    assert.equal(report.status,'pass');
    assert.equal(report.qualification?.host,'linux');
    assert.equal(report.qualification.profile,'linux-functional');
    assert.equal(report.qualification.functional,'viewport-section-pass','A fragment cannot claim full qualification');
    assert.equal(report.binding?.current_head,head,'Stale matrix checkout');
    assert.deepEqual(report.binding.portable_text_inputs,inputs,'Changed matrix inputs');
    assert.deepEqual(report.binding,reports[0].binding,'All shards must observe the same source and runtime bytes');
    assert.equal(Object.keys(report.binding.served??{}).length,17,'Complete served runtime required');
    assert.deepEqual(report.binding.served_after,report.binding.served,'Served bytes changed');
    assert.ok(report.checks?.length && report.checks.every(c=>c.pass===true),'Every assertion must pass');
    const requiredChecks=section==='entry'?entryChecks:section==='recovery'?[...recoveryChecks,'no unclassified browser/Unity/shader/request errors in any scope']:
      functionalChecks.filter(name=>!recoveryChecks.includes(name) && name!=='unfinished reload abandoned without award');
    for(const name of requiredChecks)assert.ok(report.checks.some(c=>c.name===name && c.pass===true),
      'Missing functional branch: '+name);
    for(const key of ['error','observer_failures','cleanup_error','persist_error','runtime_drift_error','motion_cleanup_error'])
      assert.ok(!report[key],'Failed execution cannot qualify: '+key);
    assert.deepEqual(report.viewport_partition.viewports,section==='lifecycle'?partition.viewports.map(v=>v.name):[]);
    assert.deepEqual(report.viewport_partition.phase_viewports,section==='entry'?[]:partition.phaseViewports.map(v=>v.name));
    assert.deepEqual(report.viewport_partition.entry_viewports,section==='entry'?partition.entryViewports.map(v=>v.name):[]);
    assert.equal(report.viewport_partition.gameplay_viewport,section!=='recovery'?'standard':null,'Original gameplay viewport required');
    if(section==='entry'){
      const preserved=report.retired_campaign_preservation;
      assert.match(preserved?.before_sha256??'',/^[a-f0-9]{64}$/,'Opaque retired campaign bytes required');
      assert.equal(preserved.after_launch_sha256,preserved.before_sha256,'Retired campaign bytes changed on ordinary launch');
      assert.equal(preserved.native_return,'observed unchanged');
      assert.equal(preserved.retirement,'observed Last Stand only');
      assert.equal(report.input_trace?.matched,true,'Unfinished deployments require matched native input');
      assert.equal(report.input_trace.actions,2);assert.equal(report.input_trace.observed_edges,4);
      assert.ok(Number.isInteger(report.input_trace.outer_keyboard_edges) && report.input_trace.outer_keyboard_edges>=2,
        'Unfinished Return requires actual native outer keyboard input');
      assert.equal(report.actions?.length,2);
      assert.ok(report.actions.every(a=>a.name==='Deploy' && a.action==='deploy'),'Both unfinished runs require ordinary Deploy');
      for(const expected of LAST_STAND_ENTRY_ROUTES){
        const observed=report.routes?.filter(r=>r.name===expected.name);
        assert.equal(observed?.length,1,'Every original startup-routing case is required exactly once');
        assert.equal(observed[0].selected,expected.selected,'Wrong startup selection');
      }
      assert.equal(report.campaign_entry?.length,partition.entryViewports.length,'All original entry profiles required');
    }
    const profiles=section==='entry'?partition.entryViewports:section==='recovery'?partition.phaseViewports:partition.viewports;
    const required=section==='entry'?[{phase:'entry',layoutOnly:false}]:section==='recovery'?['storage-corrupt','storage-blocked','loader-fault','wasm-fault'].map(phase=>({phase,layoutOnly:false})):
      [...['garage','workshop'].map(phase=>({phase,layoutOnly:true})),
        ...(partition.phaseViewports.length?['garage','battle','result','workshop','background-result'].map(phase=>({phase,layoutOnly:false})):[])];
    for(const selected of profiles){
    const viewport=selected.name;
    for(const {phase,layoutOnly} of required)
    {
      const capture=report.screenshots?.find(s=>layoutOnly?
        s.file.startsWith(`layout-${viewport}-${phase}-`) && s.file.endsWith('.png'):s.file===`${phase}-${viewport}.png`);
      assert.ok(capture,'Missing actual phase/profile capture: '+phase+'/'+viewport);
      assert.deepEqual(capture.viewport,{width:selected.width,height:selected.height},'Wrong observed viewport');
      assert.match(capture.sha256??'',/^[a-f0-9]{64}$/,'Actual capture digest required');
      if(section==='entry'){
        assert.equal(capture.scope,'healthy');assert.ok(Number.isInteger(capture.load) && capture.load>0);
        const observed=report.campaign_entry.find(v=>v.viewport?.name===viewport);
        assert.deepEqual(observed?.viewport,selected,'Wrong observed Campaigns entry viewport');
        assert.deepEqual(observed.order,['last-stand'],'Last Stand must be the only campaign');
        const b=observed.bounds;
        assert.ok(b && ['x','y','width','height'].every(k=>Number.isFinite(b[k])) && b.width>=44 && b.height>=44 && b.x>=0 && b.y>=0 &&
          b.x+b.width<=selected.width && b.y+b.height<=selected.height,'Entry launch must remain visible and reachable');
        continue;
      }
      if(phase==='loader-fault' || phase==='wasm-fault')assert.equal(capture.scope,phase,'Wrong error-document scope');
      else {
        const expectedPhase=phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase;
        assert.equal(capture.state?.phase,expectedPhase,'Wrong captured runtime phase');
        assert.equal(capture.layout?.phase,expectedPhase,'Wrong captured HUD phase');
        assert.ok(Number.isInteger(capture.load) && capture.load>0,'Captured document identity required');
        assert.equal(capture.state.load,capture.load,'Stale captured state document');
        assert.equal(capture.layout.load,capture.load,'Stale captured layout document');
        assert.ok(Number.isFinite(capture.state.timeOrigin) && capture.state.timeOrigin>0,'Captured document clock required');
        assert.equal(capture.state.timeOrigin,capture.layout.timeOrigin,'State/layout come from different documents');
      }
    }
    }
  }
  return {status:'pass',scope:'ten Linux lifecycle viewport shards, complete entry and five-profile recovery matrices; no Windows/media qualification',
    head,shards:[...seen].sort(),inputs};
}
export function lastStandMatrixResultFiles(root) {
  return readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
    const path=resolve(root,entry.name);
    assert.ok(!entry.isSymbolicLink(),'Matrix artifacts cannot contain symlinks');
    // The upload also contains the separate ci-browser-sandbox probe result.
    // Count only actual journey owners, never silently discard a failed journey.
    return entry.isDirectory()?lastStandMatrixResultFiles(path):
      entry.name==='result.json' && basename(root).startsWith('journey-')?[path]:[];
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const files=lastStandMatrixResultFiles(resolve(process.argv[2]));
  const reports=files.map(file=>{
    const report=JSON.parse(readFileSync(file,'utf8'));
    for(const screenshot of report.screenshots??[]) {
      const path=resolve(dirname(file),screenshot.file),from=relative(dirname(file),path);
      assert.ok(from && !isAbsolute(from) && !from.startsWith('..'),'Capture escapes its artifact directory');
      assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),screenshot.sha256,'Capture bytes changed');
    }
    return report;
  });
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const summary=assertLastStandMatrix(reports,{head,inputs:currentQualificationInputs()});
  writeFileSync('last-stand-matrix-result.json',JSON.stringify({...summary,files},null,2));
  console.log(JSON.stringify(summary));
}

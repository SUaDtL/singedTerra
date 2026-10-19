import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lastStandViewportPartition} from '../../e2e/helpers/lastStandMatrix.mjs';
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
export function assertLastStandMatrix(reports,{head,inputs}) {
  assert.match(head,/^[a-f0-9]{40}$/,'Exact matrix checkout required');
  assert.equal(reports.length,10,'All ten successful viewport shards are required');
  const seen=new Set();
  for(const report of reports) {
    const {shard}=report.viewport_partition??{};
    const partition=lastStandViewportPartition(shard,{host:'linux',profile:'linux-functional'});
    assert.ok(shard && !seen.has(shard),'Missing or duplicate viewport shard');seen.add(shard);
    assert.equal(report.status,'pass');
    assert.equal(report.qualification?.host,'linux');
    assert.equal(report.qualification.profile,'linux-functional');
    assert.equal(report.qualification.functional,'viewport-shard-pass','A fragment cannot claim full qualification');
    assert.equal(report.binding?.current_head,head,'Stale matrix checkout');
    assert.deepEqual(report.binding.portable_text_inputs,inputs,'Changed matrix inputs');
    assert.deepEqual(report.binding,reports[0].binding,'All shards must observe the same source and runtime bytes');
    assert.equal(Object.keys(report.binding.served??{}).length,17,'Complete served runtime required');
    assert.deepEqual(report.binding.served_after,report.binding.served,'Served bytes changed');
    assert.ok(report.checks?.length && report.checks.every(c=>c.pass===true),'Every assertion must pass');
    for(const name of functionalChecks)assert.ok(report.checks.some(c=>c.name===name && c.pass===true),
      'Missing functional branch: '+name);
    for(const key of ['error','observer_failures','cleanup_error','persist_error','runtime_drift_error','motion_cleanup_error'])
      assert.ok(!report[key],'Failed execution cannot qualify: '+key);
    const selected=partition.viewports[0],viewport=selected.name;
    assert.deepEqual(report.viewport_partition.viewports,[viewport]);
    assert.deepEqual(report.viewport_partition.phase_viewports,partition.phaseViewports.map(v=>v.name));
    assert.equal(report.viewport_partition.gameplay_viewport,'standard','Original gameplay viewport required');
    const required=[...['garage','workshop'].map(phase=>({phase,layoutOnly:true})),
      ...(partition.phaseViewports.length?['garage','battle','result','workshop','background-result',
        'storage-corrupt','storage-blocked','loader-fault','wasm-fault'].map(phase=>({phase,layoutOnly:false})):[])];
    for(const {phase,layoutOnly} of required)
    {
      const capture=report.screenshots?.find(s=>layoutOnly?
        s.file.startsWith(`layout-${viewport}-${phase}-`) && s.file.endsWith('.png'):s.file===`${phase}-${viewport}.png`);
      assert.ok(capture,'Missing actual phase/profile capture: '+phase+'/'+viewport);
      assert.deepEqual(capture.viewport,{width:selected.width,height:selected.height},'Wrong observed viewport');
      assert.match(capture.sha256??'',/^[a-f0-9]{64}$/,'Actual capture digest required');
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
  return {status:'pass',scope:'ten Linux functional viewport shards; no Windows/media qualification',
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

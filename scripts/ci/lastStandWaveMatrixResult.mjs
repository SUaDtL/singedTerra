import assert from 'node:assert/strict';
import {lastStandDeploymentControl} from '../../e2e/helpers/lastStandJourney.mjs';
import {lastStandViewportPartition,LAST_STAND_ENTRY_ROUTES} from '../../e2e/helpers/lastStandMatrix.mjs';
import {assertWaveBinding,assertWaveLifecycle,requireWaveChecks,WAVE_ENTRY_CHECKS,WAVE_RECOVERY_CHECKS,WAVE_CONTRACT} from './lastStandWaveQualification.mjs';

export const WAVE_ENTRY_ACTIONS=Object.freeze([['Deploy','deploy'],['Deploy','resume'],['Menu','menu'],['MenuAbandon','confirmation'],
  ['ConfirmCancel','confirmation-cancel'],['SettingsClose','menu-close'],['Menu','menu'],['MenuAbandon','confirmation'],['ConfirmProceed','abandon']]);
function captureIdentity(capture,selected){
  assert.deepEqual(capture.viewport,{width:selected.width,height:selected.height});
  assert.match(capture.sha256??'',/^[a-f0-9]{64}$/);assert.ok(Number.isInteger(capture.load)&&capture.load>0);
}
function runtimeCapture(capture,phase){
  assert.ok(capture.state&&capture.layout);assert.equal(capture.state.load,capture.load);assert.equal(capture.layout.load,capture.load);
  assert.ok(Number.isFinite(capture.state.timeOrigin)&&capture.state.timeOrigin>0);assert.equal(capture.layout.timeOrigin,capture.state.timeOrigin);
  if(phase==='resume-ready'){
    assert.ok(Number.isInteger(capture.state.wallet) && capture.state.wallet>=0);
    assert.equal(capture.state.phase,capture.state.wallet>0?'workshop':'garage','Reload uses the actual funded inspection phase');
    assert.equal(capture.state.hasCheckpoint,true);
    lastStandDeploymentControl(capture.state,capture.layout);
  }else{
    const actual=['checkpoint','resumed','background-checkpoint'].includes(phase)?'battle':phase==='garage-after-abandon'?'garage':phase==='background-result'?'result':phase.startsWith('storage-')?'garage':phase;
    assert.equal(capture.state.phase,actual);assert.equal(capture.layout.phase,actual);
    if(['checkpoint','resumed','background-checkpoint'].includes(phase)){assert.equal(capture.state.paused,true);assert.equal(capture.state.hasCheckpoint,true);}
    if(['garage','garage-after-abandon'].includes(phase)){
      assert.equal(capture.state.hasCheckpoint,false);lastStandDeploymentControl(capture.state,capture.layout);
    }
  }
}
export function assertLastStandWaveMatrix(reports,expected){
  assert.equal(reports.length,12,'All ten lifecycle and complete entry/recovery sections required');
  const seen=new Set();
  for(const report of reports){
    const {section,shard}=report.viewport_partition??{};assert.ok(['entry','lifecycle','recovery'].includes(section));
    if(section!=='lifecycle')assert.equal(shard,null);else assert.ok(shard);
    const partition=lastStandViewportPartition(shard??undefined,{host:'linux',profile:'linux-functional'}),key=section==='lifecycle'?shard:section;
    assert.ok(!seen.has(key),'Duplicate wave matrix section');seen.add(key);
    assertWaveBinding(report,expected,'linux','linux-functional','viewport-section-pass');
    assert.deepEqual(report.binding,reports[0].binding,'All shards bind the same candidate/runtime');
    for(const key of ['rendered_audio','native_blur','capture_cadence','procedural_cues'])assert.equal(report.qualification[key],'unexecuted-requires-windows');
    assert.deepEqual(report.viewport_partition.viewports,section==='lifecycle'?partition.viewports.map(v=>v.name):[]);
    assert.deepEqual(report.viewport_partition.phase_viewports,section==='entry'?[]:partition.phaseViewports.map(v=>v.name));
    assert.deepEqual(report.viewport_partition.entry_viewports,section==='entry'?partition.entryViewports.map(v=>v.name):[]);
    assert.equal(report.viewport_partition.gameplay_viewport,section==='recovery'?null:'standard');
    if(section==='lifecycle')assertWaveLifecycle(report);
    if(section==='recovery')requireWaveChecks(report,WAVE_RECOVERY_CHECKS);
    if(section==='entry'){
      requireWaveChecks(report,WAVE_ENTRY_CHECKS);
      assert.deepEqual(report.actions.map(a=>[a.name,a.action]),WAVE_ENTRY_ACTIONS,'Current Return/resume/cancel/abandon sequence required');
      assert.ok(Number.isInteger(report.input_trace.outer_keyboard_edges)&&report.input_trace.outer_keyboard_edges>=2,'Native Return keyboard input required');
      const preserved=report.retired_campaign_preservation;assert.match(preserved?.before_sha256??'',/^[a-f0-9]{64}$/);
      assert.equal(preserved.after_launch_sha256,preserved.before_sha256);assert.equal(preserved.native_return,'observed unchanged');assert.equal(preserved.retirement,'observed Last Stand only');
      for(const expectedRoute of LAST_STAND_ENTRY_ROUTES){const found=report.routes?.filter(r=>r.name===expectedRoute.name);assert.equal(found?.length,1);assert.equal(found[0].selected,expectedRoute.selected);}
      assert.equal(report.campaign_entry?.length,partition.entryViewports.length);
      const cancel=report.lifecycle?.filter(row=>row.kind==='new-run-cancel');assert.equal(cancel?.length,1);
      assert.equal(cancel[0].layout?.selection,'ConfirmCancel');assert.equal(cancel[0].cancelled?.paused,true);
      const saved=JSON.parse(cancel[0].saved);assert.equal(saved.version,4);assert.ok(saved.checkpoint);
      assert.equal(cancel[0].confirmation.runId,saved.checkpoint.runId);assert.equal(cancel[0].cancelled.runId,saved.checkpoint.runId);
    }
    const profiles=section==='entry'?partition.entryViewports:section==='recovery'?partition.phaseViewports:partition.viewports;
    for(const viewport of profiles){
      if(section==='lifecycle'){
        const garage=report.screenshots?.filter(s=>s.file.startsWith(`layout-${viewport.name}-garage-`)&&s.file.endsWith('.png'));
        assert.ok(garage?.length>=2,'Both fresh and earned garage layouts required: '+viewport.name);
        for(const capture of garage){captureIdentity(capture,viewport);runtimeCapture(capture,'garage');}
        assert.ok(garage.some(s=>s.state.wallet===0)&&garage.some(s=>s.state.wallet>0),'Garage layouts must cover fresh and earned state');
      }
      const phases=section==='entry'?['entry']:section==='recovery'?['storage-corrupt','storage-blocked','loader-fault','wasm-fault']:
        partition.phaseViewports.length?['garage','battle','checkpoint','resume-ready','resumed','garage-after-abandon','background-checkpoint','result','background-result']:[];
      for(const phase of phases){
        const found=report.screenshots?.filter(s=>s.file===`${phase}-${viewport.name}.png`);assert.equal(found?.length,1,'Actual phase/profile capture required: '+phase+'/'+viewport.name);
        const capture=found[0];captureIdentity(capture,viewport);
        if(phase==='entry'){
          assert.equal(capture.scope,'healthy');const observed=report.campaign_entry.find(v=>v.viewport?.name===viewport.name);
          assert.deepEqual(observed?.viewport,viewport);assert.deepEqual(observed.order,['last-stand']);const b=observed.bounds;
          assert.ok(b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.width>=44&&b.height>=44&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width&&b.y+b.height<=viewport.height);
        }else if(phase.endsWith('-fault'))assert.equal(capture.scope,phase);else runtimeCapture(capture,phase);
      }
    }
  }
  assert.deepEqual([...seen].sort(),[...Array.from({length:10},(_,n)=>`${n+1}/10`),'entry','recovery'].sort());
  return {status:'pass',contract:WAVE_CONTRACT,head:expected.head,shards:[...seen].sort(),inputs:expected.inputs,
    scope:'ten Linux short-wave lifecycle profiles plus complete entry and recovery matrices',full_acceptance:'pending',merge_ready:false,
    native_media:'not-established',natural_terminal:'pass',endurance:'pending-dedicated-10-12-hour-observation'};
}

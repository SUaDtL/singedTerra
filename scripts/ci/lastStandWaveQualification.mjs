import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {LAST_STAND_JOURNEY_INPUTS,validateCheckpointResume,validateWaveTerminal,validateGameplayInput,validateKeyboardGameplayInput,validateModelObservation,
  validateAdmittedClock,validateExplicitPause,validateBackgroundInterval,waveIntervalEvents} from '../../e2e/helpers/lastStandJourney.mjs';
import {WAVE_ORACLE_SOURCES,parseWaveOracleCsv} from '../../e2e/helpers/lastStandWaveOracle.mjs';

export const WAVE_CONTRACT='last-stand-waves/v1';
export const WAVE_RUNTIME_KEYS=Object.freeze(['manifest_sha256','receipt_sha256','source_lock_sha256','source_inventory_sha256','wrapper_sha256','build']);
export const WAVE_RECOVERY_CHECKS=Object.freeze(['.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
  'corrupt bytes preserved by Retry','blocked writes recover through real Retry']);
export const WAVE_ERROR_CHECK='no unclassified browser/Unity/shader/request errors in any scope';
export const WAVE_LIFECYCLE_CHECKS=Object.freeze(['normal-speed automatic baseline deployed','first base cannon leaves identical 30 HP foe at 10 HP',
  'pause stops combat ticks','cleared waves atomically bank rewards and complete checkpoints','wave rewards require no manual Claim',
  'saved wave survives reload and awaits explicit Resume','Resume restores saved state paused without offline catch-up',
  'confirmed abandon keeps banked rewards and finalizes run','one salvage commits Cannon Attack level1',
  'purchase reload retains permanent level and spent balance','same first foe one-hit defeated by real 30 damage',
  'background wave rewards and checkpoint share one durable save','natural defeat finalizes checkpoint without a second payout',
  'Continue cannot pay a second reward','finalized natural defeat cannot resume after reload',
  'background natural defeat finalizes checkpoint once without payout','repeated foreground returns cannot award or resurrect finalized run']);
export const WAVE_ENTRY_CHECKS=Object.freeze(['global fresh startup remains Skirmishes','zero Unity runtime payload before ordinary launch',
  'entry loss disclosure is rendered','entry disclosure explains saved wave resume','ordinary Return preserves complete checkpoint',
  'unfinished Return offers explicit saved-run resume','Return resume waits paused at saved state','Cancel preserves complete checkpoint',
  'unfinished reload preserves complete checkpoint','confirmed new run keeps banked progress','retired campaign has no library entry',
  'retired campaign has no start or resume entry','retired campaign bytes preserved through native Last Stand Return','native Return offers only Last Stand']);
const digest=value=>createHash('sha256').update(value).digest('hex');
const sha=value=>assert.match(value??'',/^[a-f0-9]{64}$/,'Exact SHA256 evidence required');
export function currentWaveExpected(root=resolve(import.meta.dirname,'../..')) {
  const manifestPath=resolve(root,'client/public/last-stand/asset-manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const runtime={manifest_sha256:digest(readFileSync(manifestPath)),receipt_sha256:manifest.source.receiptSha256,
    source_lock_sha256:manifest.source.sourceLockSha256,source_inventory_sha256:manifest.source.sourceInventorySha256,
    wrapper_sha256:manifest.wrapperSha256,build:manifest.source.build};
  const served=Object.fromEntries(Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}).map(([path,sha256])=>{
    assert.ok(/^[A-Za-z0-9_./-]+$/.test(path)&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Runtime path escaped');
    const bytes=readFileSync(resolve(root,'client/public/last-stand',path));assert.equal(digest(bytes),sha256);return [path,{sha256,bytes:bytes.length}];}));
  const waveSources=Object.fromEntries(WAVE_ORACLE_SOURCES.map(name=>[name,digest(readFileSync(resolve(root,'campaign-unity/Unity/Assets/Scripts',name),'utf8').replace(/\r\n|\r/g,'\n'))]));
  return {runtime,served,waveSources};
}
export function requireWaveChecks(report,names) {
  assert.ok(report.checks?.length && report.checks.every(c=>c.pass===true),'Every assertion must pass');
  for(const name of names)assert.ok(report.checks.some(c=>c.name===name&&c.pass===true),'Missing wave branch: '+name);
}
export function assertWaveBinding(report,{head,inputs,runtime,served,waveSources},host,profile,functional) {
  assert.match(head,/^[a-f0-9]{40}$/);assert.equal(report.contract,WAVE_CONTRACT,'Current wave contract required');
  assert.equal(report.status,'pass');assert.equal(report.normal_speed,true);
  assert.equal(report.qualification?.host,host);assert.equal(report.qualification.profile,profile);
  assert.equal(report.qualification.functional,functional);assert.equal(report.qualification.merge_ready,false,'Short segments cannot claim merge readiness');
  for(const key of ['error','observer_failures','cleanup_error','persist_error','runtime_drift_error','motion_cleanup_error'])
    assert.ok(!report[key],'Failed execution cannot qualify: '+key);
  assert.deepEqual(Object.keys(inputs).sort(),[...LAST_STAND_JOURNEY_INPUTS].sort(),'Complete current input closure required');
  for(const value of Object.values(inputs))sha(value);
  assert.equal(report.binding?.current_head,head,'Stale matrix checkout');
  assert.deepEqual(report.binding.portable_text_inputs,inputs,'Changed authored inputs');
  assert.deepEqual(Object.keys(report.binding.input_files??{}).sort(),Object.keys(inputs).sort());
  for(const value of Object.values(report.binding.input_files))sha(value);
  assert.equal(Object.keys(served).length,17,'Complete runtime/wrapper inventory required');
  for(const item of Object.values(served)){sha(item.sha256);assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>0);}
  for(const key of WAVE_RUNTIME_KEYS){assert.ok(runtime[key]);assert.equal(report.binding[key],runtime[key],'Changed runtime binding: '+key);}
  assert.deepEqual(report.binding.served,served);assert.deepEqual(report.binding.served_after,served,'Runtime drift during execution');
  const wave=report.wave_model;assert.equal(wave?.format,'st-last-stand-wave-model-oracle/1');assert.equal(wave.host,host);
  assert.deepEqual(Object.keys(waveSources).sort(),[...WAVE_ORACLE_SOURCES].sort());
  assert.deepEqual(wave.source_lf_sha256,waveSources,'Wave oracle compiled different production sources');
  assert.equal(wave.qualification,'compiled actual wave model bound to inspected player export');
  assert.deepEqual(wave.export_binding,{build:runtime.build,sourceInventorySha256:runtime.source_inventory_sha256,
    receiptSha256:runtime.receipt_sha256,sourceLockSha256:runtime.source_lock_sha256,manifestSha256:runtime.manifest_sha256});
  assert.equal(wave.commands?.length,2);assert.ok(wave.commands.every(c=>c.exit===0&&!c.error));
  for(const command of wave.commands){sha(command.stdoutSha256);sha(command.stderrSha256);assert.ok(command.argv?.length>=2);}
  sha(wave.output_sha256);sha(wave.executable_sha256);assert.equal(wave.commands[1].stdoutSha256,wave.output_sha256);
  assert.deepEqual([...wave.profiles].sort(),[1,2].flatMap(tier=>['repair','launcher','scattergun'].flatMap(fitting=>[20,30,40,50].map(d=>`${tier}:${fitting}:${d}`))).sort());
  assert.ok(Number.isSafeInteger(wave.rows)&&wave.rows>=24);assert.ok(Number.isInteger(wave.maximumTicks)&&wave.maximumTicks>=100&&wave.maximumTicks<=24000);
  assert.equal(report.input_trace?.matched,true);assert.equal(report.input_trace.actions,report.actions?.length);
  assert.equal(report.input_trace.observed_edges,report.actions.length*2,'Exact planned pointer edges required');
  assert.equal(report.keyboard_trace?.matched,true);assert.equal(report.keyboard_trace.actions,report.keyboard_actions?.length);
  const keyboardEdges=report.keyboard_actions.reduce((total,a)=>{assert.ok(a.keys?.length&&a.keys.at(-1)==='Enter');return total+a.keys.length*2;},0);
  assert.equal(report.keyboard_trace.observed_edges,keyboardEdges,'Exact planned keyboard edges required');
  for(const action of report.actions){assert.ok(action.name&&action.action);assert.ok(Number.isFinite(action.x)&&Number.isFinite(action.y));}
  requireWaveChecks(report,[WAVE_ERROR_CHECK]);
}
const only=(rows,kind)=>{const found=rows?.filter(row=>row.kind===kind);assert.equal(found?.length,1,'Exactly one '+kind+' proof required');return found[0];};
function assertWaveIntervalClock(record){
  const e=record.evidence;assert.equal(e?.clock?.basis,'admitted-clock/v1','Current wave interval requires actual admitted clock evidence');
  assert.deepEqual(validateAdmittedClock(record.kind==='explicit-pause'?e.resumed:e.before,e.after),e.clock);
}
export function assertWaveLifecycle(report) {
  requireWaveChecks(report,WAVE_LIFECYCLE_CHECKS);
  const resume=only(report.lifecycle,'checkpoint-resume');validateCheckpointResume(resume);
  assert.ok(resume.stable.t>=resume.resumed.t+1000,'Fresh post-wait state required');
  assert.ok(resume.saved.checkpoint.encounter.completedWave>0,'Earned checkpoint required');
  const abandon=only(report.lifecycle,'checkpoint-abandon');assert.deepEqual(abandon.before,resume.saved);
  assert.deepEqual(abandon.after,{...abandon.before,checkpoint:null,lastFinalizedRunId:abandon.before.checkpoint.runId},'Abandon changes only durable run finalization');
  const purchase=report.checks.find(c=>c.name==='one salvage commits Cannon Attack level1').detail;
  assert.equal(purchase?.wallet,resume.saved.credits-1);assert.equal(purchase.level,1);assert.equal(purchase.cannonDamage,30);
  const background=only(report.lifecycle,'background-wave'),cp=background.saved?.checkpoint;
  assert.equal(background.saved?.version,4);assert.ok(cp&&cp.runId>resume.saved.checkpoint.runId);
  assert.ok(cp.encounter.completedWave>=1);assert.equal(background.saved.pendingDefeat,null);
  assert.equal(cp.runId,background.after?.loop?.runId);assert.equal(background.saved.credits,background.after.loop.wallet);
  assert.equal(cp.encounter.rulesVersion,'last-stand-waves-v1');assert.equal(cp.encounter.tier,background.after.loop.activeTier);
  assert.ok(background.interval?.begin<background.interval.recovered);
  assert.ok(background.after.t>=background.interval.recovered);assert.equal(background.after.load,background.interval.before.load);
  assert.equal(background.after.timeOrigin,background.interval.before.timeOrigin);
  assert.equal(background.after.run,background.interval.before.run);
  assert.ok(background.after.tick>background.interval.before.tick);
  assertWaveIntervalClock(only(report.lifecycle,'explicit-pause'));
  assertWaveIntervalClock(only(report.lifecycle,'hidden'));
  for(const row of report.lifecycle.filter(row=>row.kind==='blur'))assertWaveIntervalClock(row);
  assert.ok(report.lifecycle.some(row=>['no-replay','no-replay-telemetry'].includes(row.kind)&&Array.isArray(row.cues)&&row.cues.length===0),'Observed no-replay evidence required');
  assert.ok(report.keyboard_actions.some(a=>a.name==='ShopCard_cannonAttackBuy'&&a.action==='purchase'),'Real keyboard purchase required');
  assert.ok(report.keyboard_actions.some(a=>a.name==='SpeedRate'&&a.action==='session'),'Real keyboard speed controls required');
  assertWaveTerminals(report);
}

export function assertWaveTerminals(report) {
  assert.equal(report.qualification.natural_terminal,'pass');
  const terminals=report.lifecycle.filter(row=>row.kind==='wave-terminal');assert.equal(terminals.length,2);
  assert.deepEqual(terminals.map(row=>row.mode).sort(),['foreground','hidden']);
  for(const row of terminals){
    const {before,terminal,staged,result,saved,layouts}=row.evidence??{};
    assert.ok(before?.loop?.runId>0&&before.status==='Running'&&before.loop.phase==='battle');
    assert.equal(terminal?.action,'terminal');assert.equal(terminal.status,'Defeated');assert.equal(terminal.hp,0);
    assert.equal(staged?.action,'defeat-staged');assert.equal(staged.phase,'settling');assert.equal(staged.tick,terminal.tick);
    assert.equal(staged.hull,0);assert.equal(staged.kills,terminal.kills);
    for(const state of [staged,result]){
      assert.equal(state.load,before.load);assert.equal(state.timeOrigin,before.timeOrigin);assert.equal(state.scope,before.scope);
      assert.equal(state.sessionRun,before.run);assert.equal(state.runId,0);assert.equal(state.pendingRunId,0);
      assert.equal(state.hasCheckpoint,false);assert.equal(state.saveState,'ready');
    }
    assert.equal(result.action,'result');assert.equal(result.phase,'result');assert.equal(result.wallet,staged.wallet);
    assert.ok(before.t<terminal.t&&terminal.t<=staged.t&&staged.t<=result.t);
    assert.equal(saved?.version,4);assert.equal(saved.checkpoint,null);assert.equal(saved.pendingDefeat,null);
    assert.equal(saved.lastFinalizedRunId,before.loop.runId);assert.equal(saved.credits,staged.wallet);
    assert.ok(layouts?.length&&layouts.every(layout=>layout.phase==='settling'&&layout.load===before.load&&
      layout.timeOrigin===before.timeOrigin&&layout.t>=terminal.t&&layout.t<=result.t&&
      !layout.controls.some(c=>c.name==='Claim'&&c.active&&c.interactable)));
    if(row.mode==='hidden'){
      assert.ok(row.interval?.begin<terminal.t&&row.interval.recovered>=result.t,'Terminal must happen during the actual hidden interval');
      assert.equal(row.interval.before.run,before.run);assert.equal(row.interval.before.load,before.load);
      assert.equal(row.interval.before.timeOrigin,before.timeOrigin);
    }
  }
  const foreground=terminals.find(row=>row.mode==='foreground').evidence,reload=only(report.lifecycle,'terminal-reload');
  assert.deepEqual(reload.saved,foreground.saved);assert.ok(reload.state.load>foreground.result.load);
  for(const key of ['runId','pendingRunId'])assert.equal(reload.state[key],0);
  assert.equal(reload.state.hasCheckpoint,false);assert.equal(reload.state.wallet,foreground.saved.credits);
  assert.equal(report.keyboard_actions.filter(a=>a.name==='Claim'&&a.action==='continue').length,2,'Both result acknowledgements use real keyboard input');
}

function assertWaveSettlingInteraction(report){
  const entry=report.lifecycle.find(row=>row.kind==='wave-terminal'&&row.mode==='foreground'),transition=entry.evidence;
  const {paused,resumed,viewports}=entry.interaction??{};
  const profiles=[['approved-standard',1366,768],['approved-wide',1920,1080],['approved-portrait',390,844],
    ['approved-landscape',844,390],['approved-compact',720,640]];
  assert.deepEqual(viewports,profiles.map(row=>row[0]));
  assert.equal(paused?.phase,'settling');assert.equal(paused.paused,true);assert.equal(resumed?.phase,'settling');assert.equal(resumed.paused,false);
  assert.ok(paused.t<resumed.t&&paused.t>=transition.staged.t&&resumed.t<=transition.result.t);
  for(const state of [paused,resumed]){
    assert.equal(state.load,transition.before.load);assert.equal(state.timeOrigin,transition.before.timeOrigin);
    assert.equal(state.sessionRun,transition.before.run);assert.equal(state.runId,0);assert.equal(state.pendingRunId,0);
    assert.equal(state.tick,transition.terminal.tick);assert.equal(state.wallet,transition.saved.credits);
  }
  for(const [name,width,height]of profiles){
    const shots=report.screenshots.filter(item=>item.file===`settling-${name}.png`);assert.equal(shots.length,1);
    const shot=shots[0];assert.deepEqual(shot.viewport,{width,height});
    for(const stamp of [shot.state,shot.layout]){
      assert.equal(stamp.phase,'settling');assert.equal(stamp.load,paused.load);assert.equal(stamp.timeOrigin,paused.timeOrigin);
      assert.ok(stamp.t>=paused.t&&stamp.t<=resumed.t);
    }
    assert.equal(shot.state.paused,true);assert.equal(shot.state.tick,paused.tick);assert.equal(shot.state.sessionRun,paused.sessionRun);
    assert.deepEqual(transition.layouts.find(layout=>layout.t===shot.layout.t),shot.layout);
  }
}

// Short sessions establish execution consistency, not the separately required
// 10–12-hour endurance observation or owner acceptance.
export function assertCombinedWaveQualification({windows,linux,head,inputs,runtime,served,waveSources,baseHead,linuxParents=[],requireFull=false}) {
  for(const [report,host,profile]of [[windows,'win32','windows-player'],[linux,'linux','linux-functional']]){
    let checkout=head;
    if(host==='linux'&&report.binding?.current_head!==head){assert.match(baseHead??'',/^[a-f0-9]{40}$/);assert.deepEqual(linuxParents,[baseHead,head]);checkout=report.binding.current_head;}
    assertWaveBinding(report,{head:checkout,inputs,runtime,served,waveSources},host,profile,'pass');
    assertWaveLifecycle(report);requireWaveChecks(report,[...WAVE_ENTRY_CHECKS,...WAVE_RECOVERY_CHECKS]);
    for(const key of ['rendered_audio','native_blur','capture_cadence'])assert.equal(report.qualification[key],host==='win32'?'pass':'unexecuted-requires-windows');
    assert.equal(report.qualification.procedural_cues,host==='win32'?'pass':'unexecuted-requires-windows');
  }
  const cues=windows.checks.filter(c=>c.name==='all five procedural cues admitted');assert.equal(cues.length,1);
  for(const name of ['cannon','impact','destruction','defeat','purchase'])assert.ok(cues[0].detail?.includes(name));
  assertWaveSettlingInteraction(windows);
  assert.ok(windows.lifecycle.some(row=>row.kind==='blur'&&row.evidence),'Native visible-window blur remains required');
  assert.ok(windows.audio?.length>=3&&windows.motion&&windows.playable_capture&&windows.active_play_review,'Rendered media required');
  const active=windows.frame_timing?.capture_active;
  assert.deepEqual(Object.keys(active??{}).sort(),['first-foe-before-impact','first-hit-through-pause','resumed-before-focus-loss','resumed-after-focus-loss'].sort());
  for(const value of Object.values(active))assert.ok(Number.isFinite(value.p95_ms)&&Number.isFinite(value.p99_ms)&&Number.isFinite(value.max_ms)&&value.p95_ms<=50&&value.p99_ms<=100&&value.max_ms<=250);
  const uncaptured=windows.frame_timing.no_capture_active;assert.ok(uncaptured&&Number.isFinite(uncaptured.p95_ms)&&active['first-foe-before-impact'].p95_ms<=uncaptured.p95_ms*1.5+5);
  assert.equal(requireFull,false,'Full wave acceptance requires dedicated verified 10–12-hour endurance evidence');
  return {status:'pass',scope:'short-wave companion execution consistency only',head,contract:WAVE_CONTRACT,
    full_acceptance:'pending',merge_ready:false,natural_terminal:'pass',endurance:'pending-dedicated-10-12-hour-observation',
    owner_acceptance:'not-established',deployment:'not-established'};
}

// Re-read fixed local artifacts. Report summaries are not substitutes for their
// compiler output, actual input edges or runtime document observations.
export function verifyWaveFiles(resultPath,report) {
  assert.equal(report.contract,WAVE_CONTRACT);
  const directory=dirname(resolve(resultPath));
  const read=name=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
  const bytes=name=>readFileSync(resolve(directory,name));
  const model=read('wave-model-oracle/binding.json');assert.deepEqual(model,report.wave_model);
  assert.deepEqual(read('wave-model-oracle/commands.json'),{inputs:model.inputs,commands:model.commands});
  const driverInputs=Object.entries(model.inputs).filter(([path])=>path.split(/[\\/]/).at(-1)==='Program.cs');
  assert.equal(driverInputs.length,1);assert.equal(digest(bytes('wave-model-oracle/Program.cs')),driverInputs[0][1]);
  assert.equal(digest(bytes('wave-model-oracle/WaveOracle.exe')),model.executable_sha256);
  for(const [i,command]of model.commands.entries())for(const stream of ['stdout','stderr'])
    assert.equal(digest(bytes(`wave-model-oracle/${i?'run':'compile'}.${stream}`)),command[stream+'Sha256']);
  const raw=bytes('wave-model-oracle/run.stdout');assert.equal(digest(raw),model.output_sha256);
  const profiles=parseWaveOracleCsv(raw);assert.deepEqual(Object.keys(profiles),model.profiles);
  assert.equal(Object.values(profiles).reduce((sum,p)=>sum+Object.keys(p).length,0),model.rows);
  const telemetry=read('runtime-telemetry.json'),trace=read('input-trace.json');
  assert.deepEqual(validateGameplayInput(trace,report.actions),report.input_trace);
  assert.deepEqual(validateKeyboardGameplayInput(trace,report.keyboard_actions),report.keyboard_trace);
  const actualState=state=>assert.deepEqual(telemetry.states.find(item=>item.load===state.load&&item.timeOrigin===state.timeOrigin&&
    item.t===state.t&&item.action===state.action),state,'Reported state differs from actual runtime telemetry');
  const actualLayout=layout=>assert.deepEqual(telemetry.layouts.find(item=>item.load===layout.load&&item.timeOrigin===layout.timeOrigin&&
    item.t===layout.t),layout,'Reported geometry differs from actual runtime telemetry');
  const oracle=before=>profiles[`${before.tier}:${before.fitting}:${before.loop.cannonDamage}`]??
    profiles[`${before.loop.activeTier}:${before.fitting}:${before.loop.cannonDamage}`];
  for(const record of report.lifecycle??[]){
    if(['explicit-pause','hidden','blur'].includes(record.kind)){
      assertWaveIntervalClock(record);const e=record.evidence,paused=record.kind==='explicit-pause';
      for(const key of paused?['before','paused','returned','resumed','after']:['before','after']){
        const {loop,hull,...model}=e[key];
        assert.deepEqual(telemetry.encounters.find(item=>item.load===model.load && item.timeOrigin===model.timeOrigin &&
          item.t===model.t && item.action===model.action),model,'Interval endpoint differs from actual runtime telemetry');
        actualState(loop);
        for(const field of ['load','timeOrigin','scope','tick','kills','paused'])
          assert.equal(loop[field],model[field],'Interval loop/model pairing differs: '+field);
        assert.equal(loop.sessionRun,model.run,'Interval loop belongs to another encounter session');
        assert.ok(Number.isSafeInteger(loop.runId) && loop.runId>0 && loop.runId===e.before.loop.runId,
          'Interval loop belongs to another saved run');
        assert.ok(Number.isFinite(loop.t) && loop.t>=model.t,'Interval loop predates its model observation');
        assert.equal(hull,loop.hull);assert.equal(model.hp,hull);
        validateModelObservation(model,oracle(e[key]));
      }
      const events=waveIntervalEvents(paused?e.paused:e.before,paused?e.resumed:e.after,trace);
      assert.deepEqual(events,e.events,'Interval native events differ from actual input trace');
      const proof=paused?validateExplicitPause({...e,events,oracle:oracle(e.before)}):
        validateBackgroundInterval({...e,kind:record.kind,events,oracle:oracle(e.before)});
      assert.deepEqual(proof,e,'Interval proof differs from actual admitted clock and source model');
    }else if(record.kind==='checkpoint-resume'){
      validateCheckpointResume(record);actualState(record.resumed);actualState(record.stable);
      const e=record.saved.checkpoint.encounter,expected=profiles[`${e.tier}:${['launcher','repair','scattergun'][e.fitting]}:${e.committedCannonDamage}`]?.[e.tick];
      assert.ok(expected,'Saved boundary absent from source model');
      for(const [field,key]of [['hull','hp'],['kills','kills'],['completedWave','completedWave']])assert.equal(e[field],expected[key]);
    }else if(record.kind==='wave-terminal'){
      const proof=validateWaveTerminal({...record.evidence,...telemetry,oracle:oracle(record.evidence.before)});
      assert.deepEqual(proof,record.evidence,'Terminal proof differs from actual source-bound telemetry');
      if(record.interaction){actualState(record.interaction.paused);actualState(record.interaction.resumed);}
    }else if(record.kind==='terminal-reload')actualState(record.state);
    else if(record.kind==='background-wave'){
      const {loop,hull,...model}=record.after;
      assert.deepEqual(telemetry.encounters.find(item=>item.load===model.load&&item.timeOrigin===model.timeOrigin&&item.t===model.t&&item.action===model.action),model);
      actualState(loop);validateModelObservation(record.after,oracle(record.after));
    }else if(record.kind==='new-run-cancel'){
      actualState(record.confirmation);actualState(record.cancelled);actualLayout(record.layout);
    }
  }
  for(const shot of report.screenshots??[]){
    assert.equal(shot.file,basename(shot.file),'Evidence path must be a contained file');
    const raw=bytes(shot.file);assert.equal(digest(raw),shot.sha256);
    assert.ok(raw.length>=24&&raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&raw.toString('ascii',12,16)==='IHDR');
    assert.equal(raw.readUInt32BE(16),shot.viewport.width);assert.equal(raw.readUInt32BE(20),shot.viewport.height);
    if(shot.state)actualState(shot.state);if(shot.layout)actualLayout(shot.layout);
  }
  return {profiles,telemetry};
}

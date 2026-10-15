// Ordinary evidence consistency check. This never creates native authority or
// substitutes for the genuine executions and independent review of their media.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAST_STAND_JOURNEY_INPUTS, admitEncounterOracleOutput, encounterOraclePackage, encounterCompilationSourceBinding, validateSettlingTransition } from '../../e2e/helpers/lastStandJourney.mjs';

const root=resolve(import.meta.dirname,'../..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const runtimeKeys=['manifest_sha256','receipt_sha256','source_lock_sha256','source_inventory_sha256','wrapper_sha256','build'];
export function currentQualificationInputs(directory=root) {
  return Object.fromEntries(LAST_STAND_JOURNEY_INPUTS.map(path=>[path,digest(readFileSync(resolve(directory,path),'utf8').replace(/\r\n/g,'\n'))]));
}

export function assertCombinedQualification({windows,linux,head,inputs,runtime,served,baseHead,linuxParents=[]}) {
  assert.match(head,/^[a-f0-9]{40}$/,'Exact candidate HEAD required');
  assert.deepEqual(Object.keys(inputs).sort(),[...LAST_STAND_JOURNEY_INPUTS].sort(),'Complete closed authored-input map required');
  for(const value of Object.values(inputs))assert.match(value,/^[a-f0-9]{64}$/);
  assert.equal(Object.keys(served).length,17,'Complete raw runtime and wrapper membership required');
  for(const [report,profile,host]of [[windows,'windows-player','win32'],[linux,'linux-functional','linux']]) {
    assert.ok(report && report.status==='pass','Both successful qualification results are required');
    assert.equal(report.qualification?.profile,profile,'Companion profile mismatch');
    assert.equal(report.qualification.host,host,'Companion host mismatch');
    assert.equal(report.qualification.functional,'pass','Full functional journey is required on both hosts');
    assert.ok(report.checks?.length>0 && report.checks.every(item=>item.pass===true),'Every observed assertion must pass');
    for(const name of ['unfinished reload abandoned without award','ordinary defeat successfully saved one pending award',
      'pending defeat in actual browser-local storage','successful pending defeat survives reload','one Claim pays exactly one salvage',
      'one salvage commits Cannon Attack level1','purchase reload retains permanent level and spent balance',
      'same first foe one-hit defeated by real 30 damage','background terminal produces one persisted manual result',
      'background Claim cannot award twice','.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
      'corrupt bytes preserved by Retry','blocked writes recover through real Retry','pause stops combat ticks'])
      assert.ok(report.checks.some(item=>item.name===name && item.pass===true),'Required functional branch absent: '+name);
    for(const key of ['error','observer_failures','cleanup_error','persist_error','runtime_drift_error','motion_cleanup_error'])
      assert.ok(!report[key],'Failed execution cannot qualify: '+key);
    const checkout=report.binding?.current_head;
    assert.match(checkout??'',/^[a-f0-9]{40}$/,'Observed checkout HEAD required');
    if(host==='linux' && checkout!==head) {
      assert.match(baseHead??'',/^[a-f0-9]{40}$/,'Current base HEAD required');
      assert.deepEqual(linuxParents,[baseHead,head],'Linux PR merge checkout must have current base and exact candidate as its two ordered parents');
    } else assert.equal(checkout,head,'Stale candidate HEAD');
    assert.deepEqual(report.binding.portable_text_inputs,inputs,'Authored helper/runner/workflow bytes changed');
    assert.deepEqual(Object.keys(report.binding.input_files).sort(),[...LAST_STAND_JOURNEY_INPUTS].sort(),'Raw input observation map incomplete');
    for(const key of runtimeKeys)assert.equal(report.binding[key],runtime[key],'Raw runtime/source binding changed: '+key);
    assert.deepEqual(report.binding.served,served,'Served raw runtime bytes changed');
    assert.deepEqual(report.binding.served_after,served,'Served runtime changed during execution');
    for(const key of ['rendered_audio','native_blur','capture_cadence'])
      assert.equal(report.qualification[key],host==='win32'?'pass':'unexecuted-requires-windows','Assigned obligation incomplete: '+key);
    const settling=report.lifecycle?.filter(item=>item.kind==='settling-transition');
    assert.ok(settling?.length===1 && settling[0].scope===(host==='win32'?'interactive-five-viewports':'transient-functional-telemetry') &&
      settling[0].evidence?.before && settling[0].evidence.terminal && settling[0].evidence.staged &&
      settling[0].evidence.result && settling[0].evidence.layouts?.length,'Required actual settling transition scope absent');
  }
  const interactions=windows.lifecycle.filter(item=>item.kind==='settling-interaction'),transition=windows.lifecycle.find(item=>item.kind==='settling-transition').evidence;
  assert.ok(interactions.length===1 && interactions[0].scope==='native-pause-five-viewports-resume','Windows interactive settling proof absent');
  const {paused,resumed,viewports}=interactions[0];
  const profiles=[['approved-standard',1366,768],['approved-wide',1920,1080],['approved-portrait',390,844],
    ['approved-landscape',844,390],['approved-compact',720,640]];
  assert.deepEqual(viewports,profiles.map(item=>item[0]),
    'Windows settling requires all five viewports');
  assert.ok(paused?.phase==='settling' && paused.paused===true && resumed?.phase==='settling' && resumed.paused===false &&
    paused.t<resumed.t && paused.load===transition.before.load && paused.timeOrigin===transition.before.timeOrigin &&
    paused.sessionRun===transition.before.run && paused.pendingRunId===transition.before.loop.runId &&
    paused.tick===transition.terminal.tick,'Windows real settling Pause/Resume proof absent');
  for(const key of ['load','timeOrigin','sessionRun','pendingRunId','tick'])
    assert.equal(resumed[key],paused[key],'Windows settling Resume changed '+key);
  for(const [name,width,height]of profiles){
    const shots=windows.screenshots?.filter(item=>item.file===`settling-${name}.png`);
    assert.equal(shots?.length,1,'Actual Windows settling viewport screenshot absent: '+name);
    const shot=shots[0],state=shot.state,layout=shot.layout;
    assert.deepEqual(shot.viewport,{width,height},'Actual settling viewport dimensions differ: '+name);
    assert.ok(state?.phase==='settling' && state.paused===true && layout?.phase==='settling' &&
      Number.isFinite(state.t) && state.t>=paused.t && state.t<=resumed.t &&
      Number.isFinite(layout.t) && layout.t>=paused.t && layout.t<=resumed.t &&
      Number.isFinite(layout.width) && layout.width>0 && Number.isFinite(layout.height) && layout.height>0,
      'Settling screenshot must retain an actual paused geometry inside the interaction interval');
    for(const key of ['load','timeOrigin','sessionRun','pendingRunId','tick'])
      assert.equal(state[key],paused[key],'Settling screenshot state differs: '+key);
    assert.equal(layout.load,paused.load);assert.equal(layout.timeOrigin,paused.timeOrigin);
    assert.deepEqual(transition.layouts.find(item=>item.t===layout.t && item.width===layout.width && item.height===layout.height),layout,
      'Settling screenshot geometry absent from actual transition layouts');
  }
  assert.ok(windows.audio?.length>=3 && windows.playable_capture && windows.active_play_review && windows.motion,
    'Actual native audio and playable motion evidence required');
  assert.ok(windows.lifecycle?.some(item=>item.kind==='blur'),'Actual native blur journey required');
  const active=windows.frame_timing?.capture_active;
  assert.deepEqual(Object.keys(active??{}).sort(),['first-foe-before-impact','first-hit-through-pause','resumed-before-focus-loss','resumed-after-focus-loss'].sort());
  for(const value of Object.values(active))assert.ok(value.p95_ms<=50 && value.p99_ms<=100 && value.max_ms<=250,'Original active cadence thresholds');
  const captured=active['first-foe-before-impact'],uncaptured=windows.frame_timing.no_capture_active;
  assert.ok(uncaptured && captured.p95_ms<=uncaptured.p95_ms*1.5+5,'Original capture-overhead threshold');
  return {status:'pass',head,profiles:['windows-player','linux-functional'],scope:'combined execution consistency; hosted checks and independent review separately required'};
}

function assertSettlingPngDimensions(bytes,viewport){
  assert.ok(bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.toString('ascii',12,16)==='IHDR','Actual settling screenshot must be PNG');
  assert.equal(bytes.readUInt32BE(16),viewport.width,'Actual settling PNG width differs');
  assert.equal(bytes.readUInt32BE(20),viewport.height,'Actual settling PNG height differs');
}
function verifyFiles(path,report) {
  const directory=dirname(resolve(path));
  const verify=item=>{
    assert.ok(item && item.file===basename(item.file),'Evidence reference must be a file within its result directory');
    assert.equal(digest(readFileSync(resolve(directory,item.file))),item.sha256,'Raw evidence digest changed: '+item.file);
  };
  for(const item of report.screenshots??[])verify(item);
  if(report.qualification.profile==='windows-player') {
    for(const item of [...report.audio,report.motion,report.playable_capture,report.active_play_review])verify(item);
    verify({file:report.frame_timing.raw,sha256:report.frame_timing.raw_sha256});
    const motion=report.motion;
    assert.equal(motion.raw,'normal-speed-repair/frames.json');
    assert.equal(motion.timeline,'normal-speed-repair/timeline.txt');
    for(const [file,sha]of [[motion.raw,motion.raw_sha256],[motion.timeline,motion.timeline_sha256]])
      assert.equal(digest(readFileSync(resolve(directory,file))),sha,'Raw motion trace/timeline changed');
    const raw=read(resolve(directory,motion.raw)).frames,order=motion.presentation_order;
    assert.ok(Array.isArray(raw) && raw.length>=2 && raw.length===motion.frames,'Captured frame count differs');
    assert.ok(Array.isArray(order) && order.length===raw.length && new Set(order).size===raw.length &&
      order.every(index=>Number.isInteger(index) && index>=0 && index<raw.length),'Motion presentation must retain every raw frame once');
    const stamps=order.map(index=>raw[index].timestamp);
    assert.ok(stamps.every((stamp,index)=>Number.isFinite(stamp) && (!index || stamp>stamps[index-1])),
      'Motion presentation requires distinct increasing native timestamps');
    assert.ok(Math.abs(stamps.at(-1)-stamps[0]-motion.duration_seconds)<.000001,'Motion native duration changed');
  }
  const model=read(resolve(directory,'model-oracle/binding.json'));
  assert.equal(model.host,report.qualification.host);assert.equal(model.fresh_host_compilation,true);
  assert.deepEqual(model.source_binding,encounterCompilationSourceBinding(),'Compiled model current source/export binding differs');
  assert.ok(model.commands.length===2 && model.commands.every(item=>item.exit===0 && !item.error),'Fresh compile and model execution required');
  const leafInput=name=>{
    const matches=Object.entries(model.inputs).filter(([path])=>path.split(/[\\/]/).at(-1)===name);
    assert.equal(matches.length,1,'Exact compiled input required: '+name);return matches[0][1];
  };
  assert.equal(digest(readFileSync(resolve(directory,'model-oracle/Program.cs'))),leafInput('Program.cs'),'Retained compiler driver changed');
  assert.equal(digest(readFileSync(resolve(directory,'model-oracle/EncounterOracle.exe'))),model.exe_sha256,'Retained model executable changed');
  assert.equal(model.commands[1].launch_file_sha256,model.exe_sha256,'Run executable binding differs');
  const raw=readFileSync(resolve(directory,'model-oracle/actual-model.csv'));
  assert.equal(digest(raw),model.output_sha256);assert.equal(model.commands[1].stdout_sha256,model.output_sha256);
  const reference=encounterOraclePackage(),profiles=admitEncounterOracleOutput(raw,reference,reference.source_lf_sha256).profiles;
  const telemetry=read(resolve(directory,'runtime-telemetry.json'));
  const recorded=report.lifecycle.find(item=>item.kind==='settling-transition').evidence;
  const actual=validateSettlingTransition({before:recorded.before,result:recorded.result,...telemetry,
    oracle:profiles[`${recorded.before.fitting}:${recorded.before.loop.cannonDamage}`]});
  assert.deepEqual(actual,recorded,'Settling proof differs from actual runtime telemetry and source model');
  if(report.qualification.host==='win32'){
    const interaction=report.lifecycle.find(item=>item.kind==='settling-interaction');
    const shots=report.screenshots.filter(item=>interaction.viewports.some(name=>item.file===`settling-${name}.png`));
    for(const shot of shots){
      assertSettlingPngDimensions(readFileSync(resolve(directory,shot.file)),shot.viewport);
      assert.deepEqual(telemetry.layouts.find(item=>item.load===shot.layout.load && item.timeOrigin===shot.layout.timeOrigin &&
        item.t===shot.layout.t),shot.layout,'Settling screenshot geometry differs from actual telemetry');
    }
    for(const state of [interaction.paused,interaction.resumed,...shots.map(item=>item.state)])
      assert.deepEqual(telemetry.states.find(item=>item.load===state.load && item.timeOrigin===state.timeOrigin &&
        item.action===state.action && item.t===state.t),state,'Settling interaction differs from actual runtime telemetry');
  }
  for(const [i,command]of model.commands.entries())for(const stream of ['stdout','stderr']){
    assert.equal(command[stream],(i===0?'compile':'run')+'.'+stream+'.txt','Fixed contained model stream required');
    assert.equal(digest(readFileSync(resolve(directory,'model-oracle',command[stream]))),command[stream+'_sha256']);
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length,5,'Usage: node scripts/ci/lastStandQualification.mjs WINDOWS_RESULT LINUX_RESULT EXACT_HEAD');
  const [windowsPath,linuxPath,head]=process.argv.slice(2),windows=read(windowsPath),linux=read(linuxPath);
  const git=args=>execFileSync('git',['--no-replace-objects',...args],{cwd:root,encoding:'utf8',timeout:10_000,windowsHide:true}).trim();
  assert.match(head,/^[a-f0-9]{40}$/,'Exact candidate HEAD required');
  assert.equal(git(['rev-parse','HEAD']),head,'Collector checkout must be the exact candidate');
  const linuxCheckout=linux.binding?.current_head;
  assert.match(linuxCheckout??'',/^[a-f0-9]{40}$/,'Observed Linux checkout HEAD required');
  const baseHead=git(['rev-parse','origin/main']);
  let linuxParents=[];
  if(linuxCheckout!==head) {
    assert.equal(git(['cat-file','-t',linuxCheckout]),'commit','Linux checkout must be a commit object');
    linuxParents=git(['show','-s','--no-show-signature','--format=%P',linuxCheckout]).split(' ');
  }
  const manifestPath=resolve(root,'client/public/last-stand/asset-manifest.json'),manifest=read(manifestPath);
  const runtime={manifest_sha256:digest(readFileSync(manifestPath)),receipt_sha256:manifest.source.receiptSha256,
    source_lock_sha256:manifest.source.sourceLockSha256,source_inventory_sha256:manifest.source.sourceInventorySha256,
    wrapper_sha256:manifest.wrapperSha256,build:manifest.source.build};
  const served=Object.fromEntries(Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}).map(([path,sha256])=>{
    const bytes=readFileSync(resolve(root,'client/public/last-stand',path));assert.equal(digest(bytes),sha256);
    return [path,{sha256,bytes:bytes.length}];
  }));
  const result=assertCombinedQualification({windows,linux,head,inputs:currentQualificationInputs(),runtime,served,baseHead,linuxParents});
  verifyFiles(windowsPath,windows);verifyFiles(linuxPath,linux);
  console.log(JSON.stringify({...result,windows_result_sha256:digest(readFileSync(windowsPath)),linux_result_sha256:digest(readFileSync(linuxPath))}));
}

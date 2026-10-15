import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import { assertCombinedQualification } from './lastStandQualification.mjs';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');

async function battleLayoutFixture(player=false,fault){
  const begin=source.indexOf('    const battleLayouts=async()=>{');
  const end=source.indexOf('    // Two unfinished exits',begin);
  const callBegin=source.indexOf("    if(player)check(sound.maximum_rms");
  const callEnd=source.indexOf('    const muted=',callBegin);
  const base={t:100,timeOrigin:10000,load:1,run:1,tick:10,hull:120,kills:0,terminalElapsed:0,
    status:'Running',paused:false,loop:{phase:'battle'}};
  const rows=[base,{...base,t:200,paused:true},{...base,t:800,paused:true},
    {...base,t:900},{...base,t:1700,tick:26}];
  if(fault==='origin')rows[2].timeOrigin++;
  if(fault==='run')rows[2].run++;
  if(['tick','hull','kills','terminalElapsed'].includes(fault))rows[2][fault]++;
  if(fault==='resume-tick')rows[3].tick++;
  let paused=false;const calls=[],report={lifecycle:[]};
  const run=new Function('player','check','sound','screenshot','phaseMatrix','observation','gameClick','mark',
    'reference','validateModelObservation','sameDocument','elapsedTicks','report','VIEWPORTS','assert',
    'return (async()=>{'+(begin<0?'':source.slice(begin,end))+source.slice(callBegin,callEnd)+'})()');
  await run(player,(ok,name)=>assert.ok(ok,name),{maximum_rms:1},async()=>{
    assert.equal(paused,!player,'Linux battle screenshot must be publicly paused; Windows stays live');calls.push('screenshot');
  },async label=>{
    assert.equal(paused,!player,'Slow Linux battle layouts must be publicly paused');calls.push(label);
  },async()=>structuredClone(rows.shift()),async(name,action,predicate)=>{
    assert.equal(name,'Pause');paused=!paused;calls.push(paused?'pause':'resume');
    const state={phase:'battle',paused};assert.ok(predicate(state));return state;
  },async()=>950,()=>({}),()=>{},(a,b)=>{
    assert.equal(a.timeOrigin,b.timeOrigin,'same document origin');assert.equal(a.run,b.run,'same run');
  },(a,b)=>assert.equal(b.tick-a.tick,(b.t-a.t)/50),report,
    ['standard','wide','portrait','compact','small'].map(name=>({name})),assert);
  return {calls,report};
}

test('actual first-hit call pauses Linux layout inspection and preserves Windows live battle',async()=>{
  const linux=await battleLayoutFixture();
  assert.deepEqual(linux.calls,['pause','screenshot','battle','resume']);
  assert.equal(linux.report.lifecycle[0].kind,'paused-battle-layout');
  assert.equal(linux.report.lifecycle[0].viewports.length,5);
  assert.deepEqual((await battleLayoutFixture(true)).calls,['screenshot','battle']);
});

test('paused layout and Resume reject changed counters or document identity',async()=>{
  for(const fault of ['tick','hull','kills','terminalElapsed','resume-tick','origin','run'])
    await assert.rejects(battleLayoutFixture(false,fault),/changed|counted|origin|run/);
});

test('central workload budget separates web-server startup and bounds actual owners',()=>{
  assert.equal(typeof journey.lastStandJourneyTimeBudget,'function','Actual caller budget must be centralized');
  for(const [host,testMs]of [['win32',1_200_000],['linux',1_800_000]]){
    for(const served of [false,true]){
      const b=journey.lastStandJourneyTimeBudget(host,{served});
      assert.equal(b.testMs,testMs);assert.equal(b.startupMs,served?0:180_000);
      assert.equal(b.browserMs,testMs+40_000);
      assert.equal(b.runnerMs,testMs+b.startupMs+5_000);
      assert.ok(b.supervisorMs>=b.runnerMs+35_000);
      assert.ok(journey.ownedSupervisorLifetimeLimit(host)>=b.supervisorMs);
      assert.ok(b.pythonMs>=b.supervisorMs+35_000);
    }
  }
  assert.throws(()=>journey.lastStandJourneyTimeBudget('darwin'),/host/);
  for(const [file,needles]of [
    ['../../e2e/last-stand-playable-loop.spec.ts',['test.setTimeout(lastStandJourneyTimeBudget().testMs)']],
    ['../last-stand-playable-loop.mjs',['lastStandJourneyTimeBudget(process.platform,{served:Boolean(process.env.E2E_LIVE_URL)})',
      'startOwnedSupervisor(child,output,null,budget.supervisorMs)','budget.runnerMs']],
  ]){
    const text=readFileSync(new URL(file,import.meta.url),'utf8');
    for(const needle of needles)assert.ok(text.includes(needle),file+' uses actual derived '+needle);
  }
  assert.ok(source.includes("ownedChrome(chromium,output,'native',lastStandJourneyTimeBudget().browserMs)"));
  assert.ok(source.includes("mode='native', lifetimeMs=640_000"),'Unrelated generic Chrome default stays unchanged');
  const config=readFileSync(new URL('../../playwright.config.ts',import.meta.url),'utf8');
  assert.ok(config.includes('timeout: 180_000'),'Budget agrees with actual webServer startup allowance');
});
test('offline reader refuses an intact older oracle with stale current-source binding',()=>{
  const reader=readFileSync(new URL('./lastStandQualification.mjs',import.meta.url),'utf8');
  const begin=reader.indexOf('function verifyFiles('),end=reader.indexOf('\nif(process.argv[1]',begin);
  const bytes=Buffer.from('explicit inert byte fixture'),sha=createHash('sha256').update(bytes).digest('hex');
  const model={host:'linux',fresh_host_compilation:true,output_sha256:sha,source_binding:{sources:'stale'},
    commands:[0,1].map(()=>({exit:0,error:null,stdout:'inert.stdout.txt',stderr:'inert.stderr.txt',stdout_sha256:sha,stderr_sha256:sha}))};
  const run=runInNewContext(reader.slice(begin,end)+';verifyFiles',{
    assert,dirname,resolve,basename,read:()=>model,readFileSync:()=>bytes,digest:()=>sha,
    encounterCompilationSourceBinding:()=>({sources:'current'}),admitEncounterOracleOutput:()=>{},
  });
  assert.throws(()=>run('/explicit-inert/result.json',{qualification:{profile:'linux-functional',host:'linux'},screenshots:[]}),
    /source|binding|differ/i);
});

test('offline reader checks retained compiler bytes and fixed streams using pure reference admission',()=>{
  const reader=readFileSync(new URL('./lastStandQualification.mjs',import.meta.url),'utf8');
  const begin=reader.indexOf('function verifyFiles('),end=reader.indexOf('\nif(process.argv[1]',begin);
  const bytes=Buffer.from('explicit inert byte fixture'),sha=createHash('sha256').update(bytes).digest('hex');
  const binding={sources:'explicit current fixture'},reference={source_lf_sha256:{'inert.cs':sha}};
  for(const fault of ['none','stream-escape','driver','executable','run-output']){
    let parity=0;
    const model={host:'linux',fresh_host_compilation:true,output_sha256:sha,source_binding:binding,
      inputs:{'/explicit-inert/Program.cs':sha},exe_sha256:sha,
      commands:[0,1].map(i=>({exit:0,error:null,launch_file_sha256:sha,stdout:(i?'run':'compile')+'.stdout.txt',
        stderr:(i?'run':'compile')+'.stderr.txt',stdout_sha256:sha,stderr_sha256:sha}))};
    if(fault==='stream-escape')model.commands[0].stderr='../outside';
    if(fault==='driver')model.inputs['/explicit-inert/Program.cs']='bad';
    if(fault==='executable')model.exe_sha256='bad';
    if(fault==='run-output')model.commands[1].stdout_sha256='bad';
    const run=runInNewContext(reader.slice(begin,end)+';verifyFiles',{
      assert,dirname,resolve,basename,read:()=>model,readFileSync:()=>bytes,digest:()=>sha,
      encounterCompilationSourceBinding:()=>binding,encounterOraclePackage:()=>reference,
      admitEncounterOracleOutput:(_raw,bundle,sources)=>{parity++;assert.equal(bundle,reference);assert.equal(sources,reference.source_lf_sha256);},
    });
    const call=()=>run('/explicit-inert/result.json',{qualification:{profile:'linux-functional',host:'linux'},screenshots:[]});
    if(fault==='none'){assert.doesNotThrow(call);assert.equal(parity,1);}
    else assert.throws(call,'Inert stale/escaped compiler bytes must refuse: '+fault);
  }
});
test('functional no-replay observation retains cue refusal without inventing PCM',async()=>{
  const begin=source.indexOf('    const noReplay=async('),end=source.indexOf('    const away=',begin);
  assert.ok(begin>0 && end>begin);
  const run=new Function('energy','report','cues','load','validateNoReplayAudio','check',
    source.slice(begin,end)+'return noReplay(10,20);');
  const report={lifecycle:[]};
  const result=await run(async()=>null,report,[],1,journey.validateNoReplayAudio,(ok,message)=>assert.ok(ok,message));
  assert.equal(result.rendered_audio,'unexecuted-requires-windows');
  assert.equal(result.cues.length,0);
  await assert.rejects(run(async()=>null,{lifecycle:[]},[{load:1,t:15}],1,journey.validateNoReplayAudio,
    (ok,message)=>assert.ok(ok,message)),/replay cue/);
});

test('qualification has a closed Windows default and rejects every incompatible profile/host',()=>{
  assert.deepEqual(journey.lastStandQualificationProfile(undefined,'win32'),{name:'windows-player',nativeMedia:true});
  assert.deepEqual(journey.lastStandQualificationProfile('linux-functional','linux'),{name:'linux-functional',nativeMedia:false});
  for(const [name,host]of [['windows-player','linux'],['linux-functional','win32'],['windows-player','darwin'],
    ['linux-functional','darwin'],['skip-audio','linux'],['','win32'],[null,'win32'],['WINDOWS-PLAYER','win32']])
    assert.throws(()=>journey.lastStandQualificationProfile(name,host),/profile|host/);
});

test('actual owned watcher admits the derived cleanup budget but retains a closed host bound',async()=>{
  const begin=source.indexOf('export async function watchOwnedProcess('),end=source.indexOf('\nexport function nativeChromeArgs',begin);
  for(const [host,lifetime,expected]of [['win32',1_430_000,'stopped'],['win32',1_440_001,'failed'],
    ['linux',2_030_000,'stopped'],['linux',2_040_001,'failed'],['linux',640_000,'stopped']]){
    let record;
    const run=runInNewContext(source.slice(begin,end).replace('export async','async')+';watchOwnedProcess',{
      assert,process:{platform:host},admitEvidenceParent:()=>{},relative:()=> 'supervisor-inert.json',
      ownedSupervisorLifetimeLimit:()=>journey.ownedSupervisorLifetimeLimit(host),
      processTable:()=>[],collectOwnedDescendants:()=>[],writeFileSync:(_path,json)=>record=JSON.parse(json),
      existsSync:()=>true,stopOwnedProcessTree:async()=>({known:[],remaining:[]}),readdirSync:()=>[],
    });
    await run({output:'/explicit-inert',path:'/explicit-inert/supervisor-inert.json',root:{ppid:2,exe:'inert'},
      owner:{pid:2,exe:'inert'},known:[],lifetimeMs:lifetime});
    assert.equal(record.status,expected,host+' actual owned watcher lifetime '+lifetime);
  }
});

// Invented unit values only. These are never emitted as execution evidence.
function fixture(){
  const sha='a'.repeat(64),head='b'.repeat(40);
  const inputs=Object.fromEntries(journey.LAST_STAND_JOURNEY_INPUTS.map(path=>[path,sha]));
  const runtime=Object.fromEntries(['manifest_sha256','receipt_sha256','source_lock_sha256','source_inventory_sha256','wrapper_sha256'].map(key=>[key,sha]));
  runtime.build='explicit-inert-unit';
  const served=Object.fromEntries(Array.from({length:17},(_,i)=>['inert-'+i,{sha256:sha,bytes:3}]));
  const names=['unfinished reload abandoned without award','ordinary defeat successfully saved one pending award',
    'pending defeat in actual browser-local storage','successful pending defeat survives reload','one Claim pays exactly one salvage',
    'one salvage commits Cannon Attack level1','purchase reload retains permanent level and spent balance',
    'same first foe one-hit defeated by real 30 damage','background terminal produces one persisted manual result',
    'background Claim cannot award twice','.loader.js: real Retry recovered genuine scene','.wasm: real Retry recovered genuine scene',
    'corrupt bytes preserved by Retry','blocked writes recover through real Retry','pause stops combat ticks'];
  const windows={status:'pass',qualification:{profile:'windows-player',host:'win32',functional:'pass',rendered_audio:'pass',native_blur:'pass',capture_cadence:'pass'},
    checks:names.map(name=>({name,pass:true})),binding:{current_head:head,portable_text_inputs:inputs,input_files:inputs,...runtime,served,served_after:served},
    audio:[{},{},{}],motion:{},playable_capture:{},active_play_review:{},lifecycle:[{kind:'blur'}],
    frame_timing:{capture_active:Object.fromEntries(['first-foe-before-impact','first-hit-through-pause','resumed-before-focus-loss','resumed-after-focus-loss']
      .map(key=>[key,{p95_ms:16,p99_ms:20,max_ms:40}])),no_capture_active:{p95_ms:16}}};
  const linux=structuredClone(windows);linux.qualification={profile:'linux-functional',host:'linux',functional:'pass',
    rendered_audio:'unexecuted-requires-windows',native_blur:'unexecuted-requires-windows',capture_cadence:'unexecuted-requires-windows'};
  // A successful functional host contributes no claimed PCM/media observations.
  linux.audio=[];delete linux.motion;delete linux.playable_capture;delete linux.active_play_review;delete linux.frame_timing;
  return {windows,linux,head,inputs,runtime,served};
}

test('both current profile results are mandatory and every incomplete or stale companion refuses',()=>{
  assert.equal(assertCombinedQualification(fixture()).status,'pass');
  const mutations=[
    x=>delete x.windows,x=>delete x.linux,x=>x.windows.status='failed',x=>x.linux.status='failed',
    x=>x.linux.qualification.profile='windows-player',x=>x.windows.qualification.host='linux',
    x=>x.windows.qualification.rendered_audio='pending',x=>x.windows.qualification.native_blur='unexecuted-requires-windows',
    x=>x.windows.qualification.capture_cadence='pending',x=>x.linux.qualification.functional='pending',
    x=>x.linux.qualification.rendered_audio='pass',x=>x.windows.binding.current_head='c'.repeat(40),
    x=>x.linux.binding.portable_text_inputs['e2e/helpers/lastStandJourney.mjs']='c'.repeat(64),
    x=>x.linux.binding.wrapper_sha256='c'.repeat(64),x=>x.windows.binding.served_after={},
    x=>delete x.windows.binding.input_files['scripts/ci/ciWorkflow.test.mjs'],
    x=>x.windows.audio=[],x=>delete x.windows.motion,x=>x.windows.lifecycle=[],
    x=>x.windows.checks[0].pass=false,x=>x.linux.checks=x.linux.checks.filter(item=>item.name!=='pause stops combat ticks'),
    x=>x.windows.frame_timing.capture_active['first-foe-before-impact'].p95_ms=51,
    x=>x.windows.frame_timing.capture_active['first-foe-before-impact'].p99_ms=101,
    x=>x.windows.frame_timing.capture_active['first-foe-before-impact'].max_ms=251,
    x=>x.windows.frame_timing.no_capture_active.p95_ms=1,
    x=>x.windows.error='actual execution error',x=>x.windows.cleanup_error='actual cleanup error',
    x=>x.linux.observer_failures=[{error:'actual callback failed'}],
  ];
  for(const [i,mutate]of mutations.entries()){
    const value=structuredClone(fixture());mutate(value);
    assert.throws(()=>assertCombinedQualification(value),'Inert incomplete companion '+i+' must refuse');
  }
});

test('GitHub merge checkout requires the exact candidate and current base as its two ordered parents',()=>{
  const value=fixture();value.baseHead='d'.repeat(40);value.linuxParents=[value.baseHead,value.head];
  value.linux.binding.current_head='c'.repeat(40);
  assert.equal(assertCombinedQualification(value).status,'pass');
  assert.equal(value.linux.binding.current_head,'c'.repeat(40),'Observed report checkout is never rewritten');
  for(const parents of [[],[value.head],[value.head,value.baseHead],['e'.repeat(40),value.head],
    [value.baseHead,'e'.repeat(40)],[value.baseHead,value.head,'e'.repeat(40)]])
    assert.throws(()=>assertCombinedQualification({...value,linuxParents:parents}),/parent|checkout|HEAD/);
});

test('actual merge-parent collector refuses a blob before reading parent-like contents',()=>{
  const reader=readFileSync(new URL('./lastStandQualification.mjs',import.meta.url),'utf8');
  const begin=reader.search(/  (?:const|let) linuxParents=/),end=reader.indexOf('  const manifestPath=',begin);
  assert.ok(begin>0 && end>begin);
  const run=new Function('git','linuxCheckout','head','assert',reader.slice(begin,end)+'return linuxParents;');
  const calls=[];
  const git=args=>{calls.push(args);return args[0]==='cat-file'?'blob':'d'.repeat(40)+' '+'b'.repeat(40);};
  assert.throws(()=>run(git,'c'.repeat(40),'b'.repeat(40),assert),/commit object/);
  assert.deepEqual(calls,[['cat-file','-t','c'.repeat(40)]]);
});

test('functional allocation keeps paused-time, manual Claim, purchase, save and stronger-hit failures fatal',()=>{
  for(const name of ['pause stops combat ticks','one Claim pays exactly one salvage','one salvage commits Cannon Attack level1',
    'purchase reload retains permanent level and spent balance','same first foe one-hit defeated by real 30 damage',
    'ordinary defeat successfully saved one pending award','background Claim cannot award twice']){
    const value=fixture();value.linux.checks.find(item=>item.name===name).pass=false;
    assert.throws(()=>assertCombinedQualification(value),/assertion/);
  }
});

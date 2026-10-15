import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import { assertCombinedQualification } from './lastStandQualification.mjs';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');

function inducedWasmFixture(){
  const id={scope:'wasm-fault',load:20},root='http://localhost:4173/singedTerra/last-stand/';
  const entry={...id,url:root+'Build/inert.wasm',resourceType:'fetch',consoleTexts:[],
    documentURL:root,frameworkURL:root+'Build/inert.framework.js',loaderURL:root+'Build/inert.loader.js'};
  const stack=`TypeError: Failed to fetch\n    at instantiateAsync (${entry.frameworkURL}:9:15253)\n    at createWasm (${entry.frameworkURL}:9:16334)\n    at ${entry.frameworkURL}:9:345789\n    at ${entry.loaderURL}:1:21444`;
  const message={...id,type:'error',text:'Last Stand load failed '+stack,location:{url:root}};
  const failure={...id,url:entry.url,method:'GET',resource_type:'fetch',response_status:null,failure:'net::ERR_FAILED'};
  const pageError={...id,kind:'pageerror',text:'TypeError: Failed to fetch',stack};
  return {entry,messages:[message],failures:[failure],httpErrors:[pageError]};
}

test('only the induced exact wasm bootstrap error pair is classified expected',()=>{
  const value=inducedWasmFixture();
  const result=journey.classifyBrowserEvidence(value.messages,value.failures,value.httpErrors,[value.entry]);
  assert.equal(result.consoleErrors.length,0,'Exact injected wasm wrapper failure must be classified');
  assert.equal(result.requestErrors.length,0);assert.equal(result.httpErrors.length,0);
  assert.equal(result.expected.length,3);
});

test('wasm classification refuses missing, duplicate, stale, unrelated or unbound witnesses',()=>{
  const mutations=[x=>x.failures=[],x=>x.failures[0].method='POST',x=>x.failures[0].response_status=500,
    x=>x.failures[0].resource_type='script',x=>x.failures[0].url+='wrong',x=>x.failures[0].load++,
    x=>x.messages[0].scope='healthy',x=>x.messages[0].location.url+='wrong',x=>x.messages[0].text+='\nUnrelated exception',
    x=>x.messages[0].text=x.messages[0].text.replace('instantiateAsync','UnrelatedShader'),
    x=>x.messages[0].text=x.messages[0].text.replaceAll(x.entry.frameworkURL,'http://unrelated.invalid/a.js'),
    x=>x.messages.push({...x.messages[0]}),x=>x.httpErrors.push({...x.httpErrors[0]}),
    x=>delete x.httpErrors[0].stack,x=>x.httpErrors[0].load++,x=>x.httpErrors[0].text='Unrelated crash',
    x=>x.httpErrors[0].stack+='\nUnrelated shader',x=>x.httpErrors.push({kind:'http',status:500,url:'http://unrelated.invalid/'}),
  ];
  for(const [i,mutate]of mutations.entries()){
    const x=inducedWasmFixture();mutate(x);
    const r=journey.classifyBrowserEvidence(x.messages,x.failures,x.httpErrors,[x.entry]);
    assert.ok(r.consoleErrors.length || r.requestErrors.length || r.httpErrors.length,'Unbound inert wasm fault '+i+' must remain fatal');
  }
});

async function motionFixture(timestamps=[3,1,2]){
  const begin=source.indexOf('async function startMotion('),end=source.indexOf('\nfunction decodedAudio(',begin);
  assert.ok(begin>0 && end>begin);const files=new Map();let receive;
  const session={on:(_event,callback)=>receive=callback,detach:async()=>{},send:async method=>{
    if(method==='Page.startScreencast')for(const [i,timestamp]of timestamps.entries())
      await receive({sessionId:i,data:Buffer.from('explicit inert image '+i).toString('base64'),metadata:{timestamp}});
  }};
  const start=runInNewContext(source.slice(begin,end)+';startMotion',{
    assert,Buffer,join:(...parts)=>parts.join('/'),mkdirSync:()=>{},
    writeFileSync:(path,data)=>files.set(path,data),fileHash:()=> 'inert-digest',
    runTool:tool=>tool==='ffprobe'?JSON.stringify({streams:[{nb_read_frames:timestamps.length,
      duration:Math.max(...timestamps)-Math.min(...timestamps)}]}):'',
  });
  const capture=await start({newCDPSession:async()=>session},{},'/explicit-inert');
  const report=await capture.encode();
  return {files,report};
}

test('actual recorder presents every distinct CDP frame by native timestamp and retains arrival order',async()=>{
  const {files,report}=await motionFixture();
  assert.deepEqual(JSON.parse(files.get('/explicit-inert/normal-speed-repair/frames.json')).frames.map(frame=>frame.timestamp),[3,1,2]);
  const timeline=files.get('/explicit-inert/normal-speed-repair/timeline.txt');
  assert.deepEqual([...timeline.matchAll(/file '([^']+)'/g)].map(item=>item[1]),
    ['frame-000001.jpg','frame-000002.jpg','frame-000000.jpg']);
  assert.equal(report.frames,3);assert.equal(report.encoded_frames,3);assert.equal(report.duration_seconds,2);
  assert.deepEqual(Array.from(report.presentation_order),[1,2,0]);
});

test('actual recorder still rejects duplicate or nonfinite native timestamps without dropping frames',async()=>{
  for(const values of [[1,1,2],[1,NaN,2],[1,Infinity,2]])
    await assert.rejects(motionFixture(values),/CDP timestamp/);
});

test('offline motion verification requires intact raw trace and a complete native presentation permutation',()=>{
  const reader=readFileSync(new URL('./lastStandQualification.mjs',import.meta.url),'utf8');
  const begin=reader.indexOf('function verifyFiles('),end=reader.indexOf('  const model=',begin);
  const bytes=Buffer.from('explicit inert retained media'),sha=createHash('sha256').update(bytes).digest('hex');
  const run=runInNewContext(reader.slice(begin,end)+'};verifyFiles',{
    assert,dirname,resolve,basename,readFileSync:()=>bytes,digest:()=>sha,
    read:()=>({frames:[{timestamp:3},{timestamp:1},{timestamp:2}]}),
  });
  for(const fault of ['none','raw','timeline','duplicate-index','missing-index','wrong-order','duration']){
    const media={file:'inert.mp4',sha256:sha},motion={...media,frames:3,duration_seconds:2,
      raw:'normal-speed-repair/frames.json',raw_sha256:sha,presentation_order:[1,2,0],
      timeline:'normal-speed-repair/timeline.txt',timeline_sha256:sha};
    if(fault==='raw')motion.raw_sha256='bad';
    if(fault==='timeline')motion.timeline_sha256='bad';
    if(fault==='duplicate-index')motion.presentation_order=[1,1,0];
    if(fault==='missing-index')motion.presentation_order=[1,2];
    if(fault==='wrong-order')motion.presentation_order=[0,1,2];
    if(fault==='duration')motion.duration_seconds=4;
    const report={qualification:{profile:'windows-player'},audio:[],motion,playable_capture:media,active_play_review:media,
      frame_timing:{raw:'inert.json',raw_sha256:sha}};
    const call=()=>run('/explicit-inert/result.json',report);
    if(fault==='none')assert.doesNotThrow(call);else assert.throws(call,'Invalid inert motion '+fault+' must refuse');
  }
});

test('hidden return requires both actual global witnesses in either focus/visibility order',()=>{
  const id={load:16,timeOrigin:100000,scope:'healthy'};
  const event=(kind,t,focused,hidden)=>({...id,kind,t,focused,hidden,globalTarget:true});
  const invoke=events=>journey.validateAwayAudioReturn({kind:'hidden',before:{...id,t:0},begin:20,recovered:100,ms:40,
    events,cues:[],states:[],encounters:[],oracle:{}});
  const loss=event('visibilitychange',10,false,true);
  for(const pair of [[event('focus',70,true,true),event('visibilitychange',72,true,false)],
    [event('visibilitychange',70,false,false),event('focus',72,true,false)]])
    assert.equal(invoke([loss,...pair]).boundary.returned.t,72);
  for(const pair of [[event('visibilitychange',72,true,false)],[event('focus',72,true,false)],
    [event('focus',70,true,true),{...event('visibilitychange',72,true,false),globalTarget:false}],
    [{...event('focus',70,true,true),load:15},event('visibilitychange',72,true,false)]])
    assert.throws(()=>invoke([loss,...pair]),/boundary absent/);
});

function focusAckFixture(){
  // Explicit inert events exercise the actual validator; these are not host evidence.
  const id={load:16,timeOrigin:100000,scope:'healthy'};
  const event=(kind,t,focused,hidden)=>({...id,kind,t,focused,hidden,globalTarget:true});
  const model={tick:20,hp:120,kills:0,spawned:1,cannon:0,launcher:0,healed:0,
    closeHits:0,rangedHits:0,alive:1,status:'Running'};
  const state={...id,sessionRun:1,runId:7,cannonDamage:20,action:'session',phase:'battle',
    paused:false,muted:false,saveState:'ready',hull:120,kills:0};
  return {kind:'hidden',before:{...id,t:900,run:1,loop:{runId:7,cannonDamage:20}},
    begin:1250,recovered:7200,ms:6000,
    events:[event('visibilitychange',1000,false,true),event('focus',7000,true,true),
      event('visibilitychange',7010,true,false)],
    encounters:[{...id,...model,t:7002,run:1,action:'visibility',focused:true,
      applicationPaused:false,paused:false,failed:false,catchingUp:false}],
    states:[{...state,t:7030,tick:20},{...state,t:7080,tick:21}],
    cues:[{...id,t:7059,text:'ST_LS_AUDIO event=cannon\n'},
      {...id,t:7059.1,text:'ST_LS_AUDIO event=impact\n'}],
    oracle:{20:model,21:{...model,tick:21,cannon:1}}};
}

test('hidden return admits the current model focus acknowledgement before coherent visibility',()=>{
  const result=journey.validateAwayAudioReturn(focusAckFixture());
  assert.equal(result.boundary.model_focus_return.t,7000);
  assert.equal(result.boundary.returned.t,7010);
  assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[20,21]]);
  assert.equal(result.cues.length,0);
});

test('focus acknowledgement anchor preserves identity, latest focus and silent hidden boundaries',()=>{
  const mutations=[x=>x.encounters[0].t=6999,x=>x.encounters[0].load++,
    x=>x.encounters[0].timeOrigin++,x=>x.encounters[0].scope='stale',x=>x.encounters[0].run++,
    x=>x.encounters[0].paused=true,x=>x.encounters[0].catchingUp=true,x=>x.encounters[0].failed=true,
    x=>x.encounters[0].applicationPaused=true,x=>x.encounters[0].hp--,
    x=>x.events.splice(1,1),x=>x.events.pop(),
    x=>x.events.splice(2,0,{...x.events[1],t:7006}),
    x=>x.events.splice(2,0,{...x.events[1],kind:'blur',t:7006,focused:false}),
  ];
  for(const [i,mutate]of mutations.entries()){
    const x=focusAckFixture();mutate(x);
    assert.throws(()=>journey.validateAwayAudioReturn(x),'Invalid inert focus acknowledgement '+i+' must fail');
  }
  const x=focusAckFixture();x.cues.unshift({...x.cues[0],t:7005});
  const result=journey.validateAwayAudioReturn(x);
  assert.equal(result.cues[0].t,7005,'A pre-visible cue must remain in the forbidden quiet window');
  assert.throws(()=>journey.validateNoReplayAudio({energy:{samples:20,maximum_rms:0},cues:result.cues}),/replay cue/);
});

async function battleLayoutFixture(player=false,fault,withMute=false){
  const begin=source.indexOf('    const battleLayouts=async()=>{');
  const end=source.indexOf('    // Two unfinished exits',begin);
  const callBegin=source.indexOf("    if(player)check(sound.maximum_rms");
  const callEnd=source.indexOf(withMute?'    const pauseStart=':'    const muted=',callBegin);
  const base={t:100,timeOrigin:10000,load:1,run:1,tick:10,hull:120,kills:0,terminalElapsed:0,
    status:'Running',paused:false,loop:{phase:'battle'}};
  const rows=[base,{...base,t:200,paused:true},{...base,t:800,paused:true},
    {...base,t:900},{...base,t:1700,tick:26}];
  if(fault==='origin')rows[2].timeOrigin++;
  if(fault==='run')rows[2].run++;
  if(['tick','hull','kills','terminalElapsed'].includes(fault))rows[2][fault]++;
  if(fault==='resume-tick')journey.validateExplicitPause({before:base,
    paused:{...base,t:200,paused:true,reason:'user'},returned:{...base,t:11200,paused:true,reason:'user'},
    resumed:{...base,t:11300,tick:11},after:{...base,t:12100,tick:26},events:[],oracle:{}});
  let paused=false,muted=false;const calls=[],report={lifecycle:[]};
  const run=new Function('player','check','sound','screenshot','phaseMatrix','observation','gameClick','mark',
    'reference','validateModelObservation','sameDocument','elapsedTicks','report','VIEWPORTS','assert','page','energy','gameKey',
    'return (async()=>{'+(begin<0?'':source.slice(begin,end))+source.slice(callBegin,callEnd)+'})()');
  await run(player,(ok,name)=>assert.ok(ok,name),{maximum_rms:1},async()=>{
    assert.equal(paused,!player,'Linux battle screenshot must be publicly paused; Windows stays live');calls.push('screenshot');
  },async label=>{
    assert.equal(paused,!player,'Slow Linux battle layouts must be publicly paused');calls.push(label);
  },async()=>structuredClone(rows.shift()),async(name,action,predicate)=>{
    if(name==='ToggleMute'){
      assert.ok(paused,'Linux mute inspection must remain under actual Pause');muted=!muted;calls.push('mute');return {muted};
    }
    assert.equal(name,'Pause');paused=!paused;calls.push(paused?'pause':'resume');
    const state={phase:'battle',paused};assert.ok(predicate(state));return state;
  },async()=>950,()=>({}),()=>{},(a,b)=>{
    assert.equal(a.timeOrigin,b.timeOrigin,'same document origin');assert.equal(a.run,b.run,'same run');
  },(a,b)=>assert.equal(b.tick-a.tick,(b.t-a.t)/50),report,
    ['standard','wide','portrait','compact','small'].map(name=>({name})),assert,
    {waitForTimeout:async()=>{}},async()=>null,async()=>assert.fail('Linux must not toggle a second Pause during its paused inspection'));
  return {calls,report};
}

test('actual first-hit call pauses Linux layout inspection and preserves Windows live battle',async()=>{
  const linux=await battleLayoutFixture();
  assert.deepEqual(linux.calls,['pause','screenshot','battle']);
  assert.equal(linux.report.lifecycle[0].kind,'paused-battle-layout');
  assert.equal(linux.report.lifecycle[0].viewports.length,5);
  assert.deepEqual((await battleLayoutFixture(true)).calls,['screenshot'],'Canonical timed capture must not repeat the live viewport sweep');
});

test('actual Linux mute and Pause preparation reuse the real paused layout interval',async()=>{
  const {calls}=await battleLayoutFixture(false,undefined,true);
  assert.deepEqual(calls,['pause','screenshot','battle','mute','mute']);
  assert.ok(source.includes("if(player)await phaseMatrix('explicit-pause')"),'One actual Linux paused matrix covers both geometry observations');
  assert.ok(source.includes('validateExplicitPause({before:pauseBefore,paused:pausedObservation,returned,'),
    'Original actual Resume/counter/time/model oracle remains mandatory');
});

test('actual Windows live layout inspection uses the existing unfinished run before no-award reload',async()=>{
  const begin=source.indexOf('    const liveBattleLayouts=async()=>{'),end=source.indexOf('    const battleLayouts=',begin);
  assert.ok(begin>0 && end>begin,'Separate actual live layout owner required');
  const call=source.indexOf('await liveBattleLayouts();',end),reload=source.indexOf('load++;await page.reload',call);
  assert.ok(call>0 && reload>call && reload<source.indexOf('    const baselineHitStart=',call),
    'Live layout caller must use the existing real unfinished reload before canonical recording');
  for(const player of [false,true]){
    const base={t:50,load:1,timeOrigin:10000,run:1,tick:1,paused:false,loop:{phase:'battle'}},
      after={...base,t:1050,tick:21},states=[{phase:'battle',paused:false}],report={lifecycle:[]},calls=[];
    const run=new Function('player','observation','check','phaseMatrix','states','report','VIEWPORTS',
      'validateModelObservation','reference','elapsedTicks',source.slice(begin,end)+'return liveBattleLayouts();');
    let next=base;
    await run(player,async()=>{const value=next;next=after;return value;},(ok,name)=>assert.ok(ok,name),
      async label=>calls.push(label),states,report,['standard','wide','portrait','compact','small'].map(name=>({name})),
      ()=>{},()=>({}),(a,b)=>assert.equal(b.tick-a.tick,(b.t-a.t)/50));
    assert.deepEqual(calls,player?['battle']:[]);
    if(player)assert.equal(report.lifecycle[0].viewports.length,5);
  }
});

test('paused layout and Resume reject changed counters or document identity',async()=>{
  for(const fault of ['tick','hull','kills','terminalElapsed','resume-tick','origin','run'])
    await assert.rejects(battleLayoutFixture(false,fault),/changed|counted|origin|run/);
});

test('central workload budget separates web-server startup and bounds actual owners',()=>{
  assert.equal(typeof journey.lastStandJourneyTimeBudget,'function','Actual caller budget must be centralized');
  for(const [host,testMs]of [['win32',1_200_000],['linux',3_600_000]]){
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
    ['linux',3_830_000,'stopped'],['linux',3_840_001,'failed'],['linux',640_000,'stopped']]){
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

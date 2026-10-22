import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import { assertCombinedQualification } from './lastStandQualification.mjs';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');

function effectsOnlyFixture(fault=()=>{}) {
  const calls=[];
  const layout={settingsControls:[{name:'MusicEnabled',label:'AMBIENT MUSIC: ON',active:true,interactable:true}]};
  const preferences={musicEnabled:false,muted:false,masterVolume:100,effectsVolume:100};
  const changed={musicEnabled:false,preferencesState:'ready'};
  const options={currentLayout:()=>layout,readPreferences:async()=>preferences,
    check:(value,message)=>assert.ok(value,message),click:async(name,action)=>{
      calls.push([name,action]);
      if(name==='MusicEnabled'){layout.settingsControls[0].label='AMBIENT MUSIC: OFF';fault({layout,preferences,changed});}
      if(name==='SettingsClose')layout.settingsControls[0].active=false;
      return changed;
    }};
  return {calls,options,layout};
}
test('legacy effects qualification selects real music-off control before measuring silence',async()=>{
  const fixture=effectsOnlyFixture();
  const result=await journey.configureEffectsOnlyJourneyAudio(fixture.options);
  assert.deepEqual(fixture.calls,[['Menu','menu'],['MenuSettings','menu'],['MusicEnabled','preferences'],['SettingsClose','menu-close']]);
  assert.equal(result.preferences.musicEnabled,false);
  assert.equal(fixture.layout.settingsControls[0].active,false);
  assert.ok(source.indexOf('report.effects_only_audio=await configureEffectsOnlyJourneyAudio')<source.indexOf("const startAudio=await mark();const deployed=await gameClick('Deploy','deploy')"));
  assert.ok(source.includes("pauseSound.maximum_rms<.0005,'pause stops effects with ambient music explicitly disabled'"));
});
test('effects-only setup rejects unconfirmed settings or accidentally silenced effects',async()=>{
  for(const mutate of [x=>x.preferences.musicEnabled=true,x=>x.preferences.muted=true,
    x=>x.preferences.masterVolume=0,x=>x.preferences.effectsVolume=0,x=>x.changed.preferencesState='not-saved',
    x=>x.changed.musicEnabled=true,x=>x.layout.settingsControls[0].label='AMBIENT MUSIC: ON']){
    const fixture=effectsOnlyFixture(mutate);
    await assert.rejects(journey.configureEffectsOnlyJourneyAudio(fixture.options),/confirmed real music-off/);
    assert.ok(!fixture.calls.some(([name])=>name==='SettingsClose'),'Failed setup must not claim completed audio preparation');
  }
});
function cancelledReturnFixture(){
  const before={load:1,timeOrigin:123,t:10,runId:4,wallet:2,pendingRunId:0,phase:'battle',paused:false,tick:20,hull:120,kills:0};
  const confirmed={...before,t:20,action:'confirmation',menu:'confirm',paused:true,tick:21};
  return {before,confirmed,cancelled:{...confirmed,t:30,action:'confirmation-cancel',menu:'menu'},
    layout:{load:1,timeOrigin:123,selection:'ConfirmCancel',settingsControls:[{name:'ConfirmCancel',active:true,interactable:true}]},
    saveBefore:'unchanged local record',saveAfter:'unchanged local record'};
}
test('unfinished native Return cancellation preserves the run and requires Cancel-first focus',()=>{
  const fixture=cancelledReturnFixture();assert.equal(journey.validateCancelledReturn(fixture).initialSelection,'ConfirmCancel');
  for(const mutate of [x=>x.confirmed.runId++,x=>x.cancelled.wallet++,x=>x.cancelled.pendingRunId++,
    x=>x.cancelled.tick++,x=>x.cancelled.hull--,x=>x.cancelled.kills++,x=>x.cancelled.paused=false,
    x=>x.cancelled.timeOrigin++,x=>x.cancelled.t=0,x=>x.layout.selection='ConfirmProceed',
    x=>x.layout.settingsControls[0].interactable=false,x=>x.layout.load++,x=>x.saveAfter='changed']){
    const candidate=cancelledReturnFixture();mutate(candidate);
    assert.throws(()=>journey.validateCancelledReturn(candidate));
  }
});

async function ownedPortProbe(contents,{exitCode=null}={}){
  const begin=source.indexOf("    const active = join(profile, 'DevToolsActivePort');"),
    end=source.indexOf('    browser = await chromium.connectOverCDP',begin);
  assert.ok(begin>0 && end>begin);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  let clock=0,reads=0,delays=0;
  const run=new AsyncFunction('join','profile','Date','existsSync','child','assert','delay','readFileSync',
    source.slice(begin,end)+'return port;');
  const port=await run((...parts)=>parts.join('/'),'owned-inert-profile',{now:()=>clock},()=>true,{exitCode},assert,
    async ms=>{clock+=ms;delays++;},()=>contents[Math.min(reads++,contents.length-1)]);
  return {port,clock,reads,delays};
}

test('owned Chrome waits for a complete port line after empty and partial file creation',async()=>{
  const result=await ownedPortProbe(['','37','37049\n/devtools/browser/inert']);
  assert.equal(result.port,37049);assert.equal(result.delays,2);assert.equal(result.reads,3);
  assert.equal(result.clock,100);
});

test('owned Chrome port readiness preserves strict bounds, child liveness and original deadline',async()=>{
  for(const line of ['0','1023','65536','NaN','37049wrong'])
    await assert.rejects(ownedPortProbe([line+'\n/devtools/browser/inert']),/Invalid owned CDP port/);
  await assert.rejects(ownedPortProbe(['37049\n/devtools/browser/inert'],{exitCode:0}),/Owned Chrome did not expose loopback CDP/);
  await assert.rejects(ownedPortProbe(['']),/Owned Chrome did not expose loopback CDP/);
  for(const port of [1024,37049,65535])assert.equal((await ownedPortProbe([port+'\n/devtools/browser/inert'])).port,port);
});

function proceduralCueCheck(player,names){
  const begin=source.indexOf('    const cueNames=messages.filter'),end=source.indexOf('    }\n    if(section.recovery){',begin);
  assert.ok(begin>0 && end>begin);
  const checks=[],report={qualification:{procedural_cues:player?'pending':'unexecuted-requires-windows'}};
  const check=(pass,name,detail)=>{checks.push({pass,name,detail});assert.ok(pass,name);};
  new Function('messages','check','player','report',source.slice(begin,end))(
    names.map(name=>({text:'ST_LS_AUDIO event='+name})),check,player,report);
  return {report,checks};
}

test('Linux retains observed cue telemetry without claiming the Windows five-cue obligation',()=>{
  const {report,checks}=proceduralCueCheck(false,['cannon','impact','destruction','purchase']);
  assert.equal(report.qualification.procedural_cues,'unexecuted-requires-windows');
  assert.equal(checks.some(item=>item.name==='all five procedural cues admitted'),false);
});

test('Windows still requires every procedural cue before its scope passes',()=>{
  const names=['cannon','impact','destruction','defeat','purchase'];
  for(const missing of names)assert.throws(()=>proceduralCueCheck(true,names.filter(name=>name!==missing)),/all five procedural cues admitted/);
  const {report,checks}=proceduralCueCheck(true,names);
  assert.equal(report.qualification.procedural_cues,'pass');
  assert.deepEqual(checks,[{pass:true,name:'all five procedural cues admitted',detail:names}]);
});

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

function settlingFixture(){
  // Explicit inert transition records, never host evidence.
  const id={load:16,timeOrigin:100000,scope:'healthy'},model={tick:1,hp:120,kills:0,spawned:1,
    cannon:0,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:1,status:'Running'};
  const session={...id,action:'session',phase:'battle',t:101,sessionRun:1,runId:7,pendingRunId:0,
    wallet:0,cannonDamage:20,tick:1,hull:120,kills:0,paused:false,saveState:'ready'};
  const encounter={...id,...model,action:'tick',t:100,run:1,fitting:'repair',paused:false,failed:false,catchingUp:false};
  const terminal={...encounter,t:200,tick:2,hp:0,status:'Defeated',action:'terminal'};
  const staged={...session,t:202,action:'defeat-staged',phase:'settling',tick:2,hull:0,runId:0,pendingRunId:7};
  const result={...staged,t:300,action:'result',phase:'result',tick:0};
  const layout={...id,t:201,phase:'settling',controls:[{name:'Claim',active:false,interactable:false},
    {name:'Pause',active:true,interactable:true}]};
  return {before:{...encounter,hull:120,loop:session},result,states:[session,staged,result],
    encounters:[encounter,terminal],layouts:[layout],oracle:{1:model,2:{...model,tick:2,hp:0,status:'Defeated'}}};
}

test('portable settling observes the real transient transition without a late pointer command',async()=>{
  const begin=source.indexOf('    const hiddenStart=awayWindows[0][1]'),end=source.indexOf('    check(result.pendingRunId',begin);
  assert.ok(begin>0 && end>begin);
  const x=settlingFixture(),states=[x.states[0]],report={lifecycle:[]};
  const run=new Function('player','awayWindows','mark','states','armGameClick','check','until','load','focused',
    'phaseMatrix','gameClick','page','observation','report','layouts','encounters','reference','validateSettlingTransition',
    'return(async()=>{'+source.slice(begin,end)+'return result;})()');
  const until=async(items,_start,predicate)=>{
    if(items.length===1)items.push(...x.states.slice(1));
    return items.filter(predicate).at(-1);
  };
  const result=await run(false,[['hidden',10,20]],async()=>100,states,
    async()=>async()=>{throw new Error('Portable pointer arrived after transient settling');},
    (ok,name)=>assert.ok(ok,name),until,16,()=>{},()=>{throw new Error('Portable transient phase cannot promise paused matrix');},
    ()=>{}, {waitForTimeout:async()=>{}},async()=>x.before,report,x.layouts,x.encounters,()=>x.oracle,
    journey.validateSettlingTransition);
  assert.equal(result.phase,'result');
  assert.equal(report.lifecycle.find(item=>item.kind==='settling-transition').scope,'transient-functional-telemetry');
});

test('transient settling binds actual terminal, pre-staging layout and pending manual result',()=>{
  const proof=journey.validateSettlingTransition(settlingFixture());
  assert.equal(proof.terminal.t,200);assert.equal(proof.staged.t,202);
  assert.equal(proof.layouts[0].t,201,'Actual layout may precede staging but must follow terminal');
  assert.equal(proof.result.wallet,0);assert.equal(proof.result.pendingRunId,7);
});

test('transient settling refuses stale, missing, duplicate, claimable or automatically awarded evidence',()=>{
  const mutations=[x=>x.layouts=[],x=>x.layouts[0].timeOrigin++,x=>x.layouts[0].load++,
    x=>x.layouts[0].t=199,x=>x.layouts[0].t=301,x=>x.layouts[0].phase='battle',
    x=>{x.layouts[0].controls[0].active=true;x.layouts[0].controls[0].interactable=true;},
    x=>x.layouts[0].controls=[],x=>x.states.push({...x.states[1],t:203}),
    x=>x.states[1].pendingRunId++,x=>x.states[1].tick++,x=>x.states[1].wallet++,
    x=>x.states.push({...x.states[1],t:250,action:'claim'}),
    x=>x.encounters[1].run++,x=>x.encounters[1].hp++,x=>x.encounters[1].failed=true,
    x=>x.encounters[1].catchingUp=true,x=>x.encounters.splice(1,1),
    x=>x.before.loop.runId=0,x=>x.before.loop.wallet++,x=>x.before.run++,
    x=>x.result.phase='battle',x=>x.result.wallet++,x=>x.result.pendingRunId++,x=>x.result.saveState='blocked',
  ];
  for(const [i,mutate]of mutations.entries()){
    const x=settlingFixture();mutate(x);
    assert.throws(()=>journey.validateSettlingTransition(x),'Invalid inert transient proof '+i+' must fail');
  }
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

function focusRefreshFixture(){
  // Inert reduction of CI shard 5: visibility republishes an unchanged tick
  // before AdvanceAt processes the elapsed time since the last model callback.
  const x=focusAckFixture(),state=x.states[0],model=x.oracle[20];
  x.states=[{...state,t:6750,tick:19},{...state,t:6800,tick:20},
    {...state,t:7004,tick:20},{...state,t:7040,tick:25}];
  x.cues=x.cues.map(c=>({...c,t:c.t-44}));
  for(let tick=21;tick<=25;tick++)x.oracle[tick]={...model,tick,cannon:tick>=23?1:0};
  return x;
}

test('focus-only session refresh does not replace the actual advancing callback clock',()=>{
  const result=journey.validateAwayAudioReturn(focusRefreshFixture());
  assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[20,25]]);
  assert.equal(result.cues.length,0);
});

function reportedCallbackTailFixture(){
  // Reduced recorded rows from CI39558068741 / last-stand-10, artifact12327300165.
  // Exact emission times, run identity and oracle outputs are retained. The
  // enclosing begin/recovered marks are inert bounds, not captured host proof.
  const id={load:3,timeOrigin:1792565620753.3,scope:'healthy'};
  const event=(kind,t,focused,hidden)=>({...id,kind,t,focused,hidden,globalTarget:true});
  const model={hp:120,spawned:9,launcher:0,healed:0,closeHits:0,rangedHits:0,status:'Running'};
  const oracle=Object.fromEntries([
    [469,7,15,2],[470,7,15,2],[471,7,15,2],[472,8,16,1],[473,8,16,1],
    [474,8,16,1],[475,8,16,1],[476,8,16,1],[477,8,16,1],[478,8,16,1],[479,8,16,1],
  ].map(([tick,kills,cannon,alive])=>[tick,{...model,tick,kills,cannon,alive}]));
  const state={...id,sessionRun:1,runId:1,pendingRunId:0,cannonDamage:20,action:'session',
    phase:'battle',paused:false,muted:false,saveState:'ready',hull:120};
  return {kind:'hidden',before:{...id,t:112320.30000000002,run:1,loop:{runId:1,cannonDamage:20}},
    begin:113957,recovered:120012,ms:6000,
    events:[event('blur',113938.19999999998,false,false),
      event('visibilitychange',113956.30000000002,false,true),
      event('focus',119969.9,true,true),event('visibilitychange',119976.6,true,false)],
    encounters:[{...id,...oracle[469],t:119970.6,run:1,action:'visibility',focused:true,
      applicationPaused:false,paused:false,failed:false,catchingUp:false}],
    states:[{...state,t:118491.80000000002,tick:449,kills:7},
      {...state,t:119492.80000000002,tick:469,kills:7},
      {...state,t:119975.19999999998,tick:469,kills:7},
      {...state,t:120011.19999999998,tick:479,kills:8}],
    cues:[{...id,t:119978.4,text:'ST_LS_AUDIO event=cannon\n'},
      {...id,t:119979.19999999998,text:'ST_LS_AUDIO event=destruction\n'}],oracle};
}

test('recorded shard10 return cues remain eligible before bounded state reporting completes',()=>{
  const x=reportedCallbackTailFixture();
  assert.ok(x.states[3].t-x.states[1].t>500,'Recorded post-callback log crosses the admission boundary');
  assert.ok(x.cues.every(c=>c.t-x.states[1].t<500),'Recorded cue emissions precede the unchanged boundary');
  const result=journey.validateAwayAudioReturn(x);
  assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[469,479]]);
  assert.equal(result.cues.length,0);
});

test('callback reporting tail preserves admission, step, provenance and exact cue bounds',()=>{
  const faults=[
    ['late cue',x=>{x.cues[0].t=x.states[1].t+500.1;x.cues[1].t=x.cues[0].t+.1;}],
    ['delayed state',x=>{x.states[3].t=x.cues[0].t+50.1;x.recovered=x.states[3].t+1;}],
    ['eleven steps',x=>{x.states[3].tick=480;x.oracle[480]={...x.oracle[479],tick:480};}],
    ['foreign anchor load',x=>x.states[1].load++],
    ['foreign anchor origin',x=>x.states[1].timeOrigin++],
    ['foreign anchor run',x=>x.states[1].runId++],
    ['inert anchor',x=>x.states[0].tick=x.states[1].tick],
    ['missing anchor',x=>x.states.splice(1,1)],
    ['stale anchor',x=>x.states[1].t-=1000],
    ['background admission',x=>x.encounters[0].focused=false],
    ['catch-up admission',x=>x.encounters[0].catchingUp=true],
    ['muted callback',x=>x.states[3].muted=true],
    ['wrong final model',x=>x.states[3].hull--],
    ['duplicate cue',x=>x.cues.push({...x.cues[1]})],
    ['wrong cue',x=>x.cues[1].text='ST_LS_AUDIO event=impact\n'],
  ];
  for(const [name,mutate]of faults){
    const x=reportedCallbackTailFixture();mutate(x);
    assert.throws(()=>journey.validateAwayAudioReturn(x),'Invalid '+name+' must fail');
  }
});

test('focus refresh retains the short callback budget, exact model cues and clock identity',()=>{
  const mutations=[x=>x.states[1].t=6400,x=>x.states[1].tick=19,
    x=>x.states[1].load++,x=>x.states[1].timeOrigin++,x=>x.states[1].scope='stale',
    x=>x.states[1].sessionRun++,x=>x.states[1].runId++,x=>x.states.shift(),
    x=>x.states[3].tick=30,x=>x.states[3].muted=true,x=>x.states[3].paused=true,
    x=>x.states[3].saveState='blocked',x=>x.states[3].cannonDamage++,
    x=>x.encounters[0].catchingUp=true,
    x=>x.cues.push({...x.cues[0]}),x=>x.cues[0].text='ST_LS_AUDIO event=destruction\n'];
  for(const [i,mutate]of mutations.entries()){
    const x=focusRefreshFixture();mutate(x);
    assert.throws(()=>journey.validateAwayAudioReturn(x),'Invalid inert callback clock '+i+' must fail');
  }
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
    'reference','validateModelObservation','sameDocument','elapsedTicks','report','matrix','assert','page','energy','gameKey',
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
    {phaseViewports:['standard','wide','portrait','compact','small'].map(name=>({name}))},assert,
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
    const run=new Function('player','observation','check','phaseMatrix','states','report','matrix',
      'validateModelObservation','reference','elapsedTicks','mark',source.slice(begin,end)+'return liveBattleLayouts();');
    let next=base;
    await run(player,async()=>{const value=next;next=after;return value;},(ok,name)=>assert.ok(ok,name),
      async label=>calls.push(label),states,report,{phaseViewports:['standard','wide','portrait','compact','small'].map(name=>({name}))},
      ()=>{},()=>({}),(a,b)=>assert.equal(b.tick-a.tick,(b.t-a.t)/50),async()=>0);
    assert.deepEqual(calls,player?['battle']:[]);
    if(player)assert.equal(report.lifecycle[0].viewports.length,5);
  }
});

test('live layout elapsed endpoints require fresh post-advance tick observations',async()=>{
  const begin=source.indexOf('    const liveBattleLayouts=async()=>{'),end=source.indexOf('    const battleLayouts=',begin);
  const clockBegin=source.indexOf('function sameDocument('),clockEnd=source.indexOf('const MODEL_FIELDS=',clockBegin);
  const elapsed=runInNewContext(source.slice(clockBegin,clockEnd)+';elapsedTicks',{assert});
  const run=new Function('player','observation','check','phaseMatrix','report','matrix',
    'validateModelObservation','reference','elapsedTicks','mark',source.slice(begin,end)+'return liveBattleLayouts();');
  const id={load:15,timeOrigin:100000,run:1,paused:false,catchingUp:false,callbackSteps:1,loop:{phase:'battle'}};
  // Explicit inert model/visibility rows use the retained failure's clock values.
  const before={...id,t:6548.2,tick:20},visibility={...id,t:27053.2,tick:429,callbackSteps:0},
    advanced={...id,t:27558.4,tick:440};
  let swept=false;
  const observation=async options=>!swept?before:
    options?.action==='tick' && options.minT>=27395.5?advanced:visibility;
  const report={lifecycle:[]};
  await run(true,observation,(ok,name)=>assert.ok(ok,name),async()=>{swept=true;},report,{phaseViewports:[]},
    ()=>{},()=>({}),elapsed,async()=>swept?27395.5:6530);
  assert.equal(report.lifecycle[0].before.tick,20);assert.equal(report.lifecycle[0].after.tick,440);
  assert.throws(()=>elapsed(before,visibility),/elapsed tick reconciliation differs/,
    'The original strict elapsed oracle must continue rejecting visibility-only clock endpoints');
});

test('paused layout and Resume reject changed counters or document identity',async()=>{
  for(const fault of ['tick','hull','kills','terminalElapsed','resume-tick','origin','run'])
    await assert.rejects(battleLayoutFixture(false,fault),/changed|counted|origin|run/);
});

function earlyFocusPauseFixture() {
  // Inert model rows reproduce the ordering retained in CI39181737284: Unity
  // acknowledges focus while hidden, then the browser reports visible return.
  const base={load:13,timeOrigin:10000,run:1,tick:173,hp:120,hull:120,kills:0,terminalElapsed:0,callbackSteps:1,catchingUp:false,
    spawned:2,cannon:1,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:1,status:'Running'};
  const paused={...base,t:33000,paused:true,reason:'user'},returned={...paused,t:44460},
    resumed={...base,t:44600,paused:false},after={...resumed,t:45600,tick:193};
  return {before:{...base,t:32900,paused:false},paused,returned,resumed,after,
    events:[{...base,kind:'visibilitychange',t:33909,hidden:true,focused:false},
      {...base,kind:'focus',t:44459,hidden:true,focused:true},
      {...base,kind:'visibilitychange',t:44473,hidden:false,focused:true}],
    oracle:{173:paused,193:after}};
}
test('explicit Pause admits model focus acknowledgement before visible return but before Resume',()=>{
  const evidence=journey.validateExplicitPause(earlyFocusPauseFixture());
  assert.equal(evidence.resumed_ticks,20);
  for(const fault of ['missing-visible','after-resume','advanced-paused-tick']) {
    const value=earlyFocusPauseFixture();
    if(fault==='missing-visible')value.events.pop();
    if(fault==='after-resume')value.events.at(-1).t=value.resumed.t+1;
    if(fault==='advanced-paused-tick')value.resumed.tick++;
    assert.throws(()=>journey.validateExplicitPause(value),/foreground recovery|Resume counted/);
  }
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
test('tier wrapper admits the host capture budget before starting its real journey',async()=>{
  const spec=readFileSync(new URL('../../e2e/last-stand-playable-loop.spec.ts',import.meta.url),'utf8');
  const begin=spec.indexOf("test('Last Stand tier goals unlock and survive reload'");
  const end=spec.indexOf("\ntest('Last Stand Campaigns journey",begin);
  assert.ok(begin>=0 && end>begin,'Actual tier wrapper required');
  for(const host of ['linux','win32']) {
    const calls=[];let callback;
    const test=Object.assign((_name,_options,body)=>{callback=body;},{
      skip:condition=>assert.equal(condition,false),setTimeout:ms=>calls.push(['test',ms])});
    runInNewContext(spec.slice(begin,end),{test,
      lastStandJourneyTimeBudget:()=>journey.lastStandJourneyTimeBudget(host),
      runLastStandTierJourney:async()=>{calls.push(['journey']);}});
    await callback({page:{setDefaultTimeout:ms=>calls.push(['action',ms])},baseURL:'http://127.0.0.1:4173/singedTerra/'},
      {project:{name:'desktop-fine'}});
    assert.deepEqual(calls,[['test',journey.lastStandJourneyTimeBudget(host).testMs],
      ['action',host==='linux'?60_000:10_000],['journey']],host+' owns capture and DOM allowances');
  }
});

test('actual maintained journey uses a finite host DOM allowance without changing game clocks',()=>{
  const body=source.slice(source.indexOf('export async function runLastStandJourney('));
  const statement=body.match(/page\.setDefaultTimeout\([^;]+\);/)?.[0];
  assert.ok(statement,'Actual maintained DOM admission required');
  for(const [host,expected] of [['linux',60_000],['win32',10_000]]) {
    let observed;
    runInNewContext(statement,{page:{setDefaultTimeout:ms=>{observed=ms;}},
      lastStandJourneyTimeBudget:()=>journey.lastStandJourneyTimeBudget(host)});
    assert.equal(observed,expected,host+' admits software-renderer main-thread latency');
    const budget=journey.lastStandJourneyTimeBudget(host);
    assert.equal(budget.actionMs,observed);
    assert.ok(Number.isFinite(observed) && observed>0 && observed<budget.testMs);
    assert.equal(budget.testMs,host==='linux'?3_600_000:1_200_000);
  }
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
    let parity=0;const settling=settlingFixture(),evidence=journey.validateSettlingTransition(settling);
    const model={host:'linux',fresh_host_compilation:true,output_sha256:sha,source_binding:binding,
      inputs:{'/explicit-inert/Program.cs':sha},exe_sha256:sha,
      commands:[0,1].map(i=>({exit:0,error:null,launch_file_sha256:sha,stdout:(i?'run':'compile')+'.stdout.txt',
        stderr:(i?'run':'compile')+'.stderr.txt',stdout_sha256:sha,stderr_sha256:sha}))};
    if(fault==='stream-escape')model.commands[0].stderr='../outside';
    if(fault==='driver')model.inputs['/explicit-inert/Program.cs']='bad';
    if(fault==='executable')model.exe_sha256='bad';
    if(fault==='run-output')model.commands[1].stdout_sha256='bad';
    const run=runInNewContext(reader.slice(begin,end)+';verifyFiles',{
      assert,dirname,resolve,basename,read:path=>path.endsWith('runtime-telemetry.json')?settling:model,readFileSync:()=>bytes,digest:()=>sha,
      encounterCompilationSourceBinding:()=>binding,encounterOraclePackage:()=>reference,
      validateSettlingTransition:journey.validateSettlingTransition,
      admitEncounterOracleOutput:(_raw,bundle,sources)=>{parity++;assert.equal(bundle,reference);assert.equal(sources,reference.source_lf_sha256);
        return {profiles:{'repair:20':settling.oracle}};},
    });
    const call=()=>run('/explicit-inert/result.json',{qualification:{profile:'linux-functional',host:'linux'},screenshots:[],
      lifecycle:[{kind:'settling-transition',evidence}]});
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
  const windows={status:'pass',qualification:{profile:'windows-player',host:'win32',functional:'pass',rendered_audio:'pass',native_blur:'pass',capture_cadence:'pass',procedural_cues:'pass'},
    checks:names.map(name=>({name,pass:true})),binding:{current_head:head,portable_text_inputs:inputs,input_files:inputs,...runtime,served,served_after:served},
    audio:[{},{},{}],motion:{},playable_capture:{},active_play_review:{},lifecycle:[{kind:'blur'}],
    frame_timing:{capture_active:Object.fromEntries(['first-foe-before-impact','first-hit-through-pause','resumed-before-focus-loss','resumed-after-focus-loss']
      .map(key=>[key,{p95_ms:16,p99_ms:20,max_ms:40}])),no_capture_active:{p95_ms:16}}};
  windows.checks.push({name:'all five procedural cues admitted',pass:true,detail:['cannon','impact','destruction','defeat','purchase']});
  const transition=settlingFixture(),viewports=[['approved-standard',1366,768],['approved-wide',1920,1080],
    ['approved-portrait',390,844],['approved-landscape',844,390],['approved-compact',720,640]];
  windows.screenshots=viewports.map(([name,width,height],i)=>{
    const layout={...transition.layouts[0],t:230+i,width,height:height-104,pixelRatio:1},
      state={...transition.states[1],action:'session',t:230+i,paused:true};
    transition.layouts.push(layout);transition.states.push(state);
    return {file:`settling-${name}.png`,sha256:sha,viewport:{width,height},load:16,scope:'healthy',layout,state};
  });
  const proof=journey.validateSettlingTransition(transition);
  windows.lifecycle.push({kind:'settling-transition',scope:'interactive-five-viewports',evidence:proof},
    {kind:'settling-interaction',scope:'native-pause-five-viewports-resume',
      paused:{...proof.staged,t:220,paused:true},resumed:{...proof.staged,t:270,paused:false},
      viewports:['approved-standard','approved-wide','approved-portrait','approved-landscape','approved-compact']});
  const linux=structuredClone(windows);linux.qualification={profile:'linux-functional',host:'linux',functional:'pass',
    rendered_audio:'unexecuted-requires-windows',native_blur:'unexecuted-requires-windows',capture_cadence:'unexecuted-requires-windows',procedural_cues:'unexecuted-requires-windows'};
  linux.checks=linux.checks.filter(item=>item.name!=='all five procedural cues admitted');
  // A successful functional host contributes no claimed PCM/media observations.
  linux.audio=[];delete linux.motion;delete linux.playable_capture;delete linux.active_play_review;delete linux.frame_timing;
  linux.lifecycle=linux.lifecycle.filter(item=>item.kind!=='settling-interaction');
  linux.lifecycle.find(item=>item.kind==='settling-transition').scope='transient-functional-telemetry';
  return {windows,linux,head,inputs,runtime,served};
}

test('combined qualification refuses missing Windows five-cue evidence or Linux media claims',()=>{
  assert.equal(assertCombinedQualification(fixture()).status,'pass');
  const name='all five procedural cues admitted';
  const mutations=[x=>delete x.windows.qualification.procedural_cues,x=>x.windows.qualification.procedural_cues='pending',
    x=>delete x.linux.qualification.procedural_cues,x=>x.linux.qualification.procedural_cues='pass',
    x=>x.windows.checks=x.windows.checks.filter(item=>item.name!==name),
    x=>x.windows.checks.find(item=>item.name===name).detail=['cannon','impact','destruction','purchase'],
    x=>x.windows.checks.find(item=>item.name===name).detail='cannon impact destruction defeat purchase',
    x=>x.windows.checks.push({...x.windows.checks.find(item=>item.name===name)}),
    x=>x.linux.checks.push({...x.windows.checks.find(item=>item.name===name)})];
  for(const [i,mutate]of mutations.entries()){
    const value=fixture();mutate(value);
    assert.throws(()=>assertCombinedQualification(value),'Missing or misassigned procedural-cue evidence '+i+' must refuse');
  }
});

test('combined qualification requires Linux transient proof and Windows interactive settling proof',()=>{
  const mutations=[x=>x.linux.lifecycle=[],x=>x.windows.lifecycle=x.windows.lifecycle.filter(item=>item.kind!=='settling-interaction'),
    x=>x.linux.lifecycle.find(item=>item.kind==='settling-transition').scope='interactive-five-viewports',
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-transition').evidence.layouts=[],
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-interaction').viewports.pop(),
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-interaction').paused.paused=false,
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-interaction').resumed.pendingRunId++,
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-interaction').resumed.tick++,
    x=>x.windows.screenshots.pop(),x=>x.windows.screenshots[0].viewport.width++,
    x=>x.windows.screenshots[0].state.paused=false,x=>x.windows.screenshots[0].state.t=210,
    x=>x.windows.screenshots[0].layout.t=280,x=>x.windows.screenshots[0].layout.width=0,
    x=>x.windows.lifecycle.find(item=>item.kind==='settling-transition').evidence.layouts.pop(),
  ];
  for(const [i,mutate]of mutations.entries()){
    const x=fixture();mutate(x);assert.throws(()=>assertCombinedQualification(x),'Missing inert settling proof '+i+' must fail');
  }
});

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

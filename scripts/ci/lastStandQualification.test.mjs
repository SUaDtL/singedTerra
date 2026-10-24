import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import { assertCombinedQualification } from './lastStandQualification.mjs';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');

function keyboardSubmitFixture(){
  const identity={load:3,timeOrigin:1000,scope:'healthy'},prepared={...identity,t:10,phase:'battle'};
  return {name:'SpeedRate',prepared,state:{...identity,phase:'battle'},
    layout:{...prepared,t:30,selection:'SpeedRate',controls:[{name:'SpeedRate',active:true,interactable:true}],shopControls:[],settingsControls:[]},
    navigation:{...identity,t:20,kind:'keydown',code:'Tab',target:'unity-canvas',focused:true,hidden:false},
    documentState:{timeOrigin:1000,t:40,focused:true}};
}
test('keyboard submit requires fresh exact selection and a current focused document',()=>{
  assert.equal(typeof journey.validateKeyboardSubmit,'function');
  assert.doesNotThrow(()=>journey.validateKeyboardSubmit(keyboardSubmitFixture()));
  for(const mutate of [v=>v.layout.selection='ShopEntry',v=>v.layout.selection='Menu',v=>v.layout.t=19,
    v=>v.layout.load++,v=>v.layout.timeOrigin++,v=>v.layout.scope='other',v=>v.layout.phase='result',
    v=>v.state.phase='result',v=>v.navigation.load++,v=>v.navigation.timeOrigin++,v=>v.navigation.scope='other',
    v=>v.navigation.code='Enter',v=>v.navigation.hidden=true,v=>v.navigation.focused=false,
    v=>v.documentState.focused=false,v=>v.documentState.timeOrigin++,v=>v.documentState.t=19,
    v=>v.layout.controls[0].interactable=false,v=>v.layout.controls[0].active=false,
    v=>v.layout.shopControls.push({...v.layout.controls[0]})]){
    const value=keyboardSubmitFixture();mutate(value);assert.throws(()=>journey.validateKeyboardSubmit(value));
  }
});
test('actual keyboard caller refuses retained wave-boundary focus migration before Enter',async()=>{
  const begin=source.indexOf('    const gameKey=async('),end=source.indexOf('\n    const mark=',begin);
  assert.ok(begin>=0 && end>begin);
  for(const [selection,delayed] of [['SpeedRate',false],['ShopEntry',false],['Menu',false],['SpeedRate',true],['ShopEntry',true]]){
    const value=keyboardSubmitFixture(),trace=[],states=[],encounters=[],downs=[],report={keyboard_actions:[],screenshots:[]};
    let now=10,freshWaits=0;
    value.layout.controls=[{name:'Menu',x:20,y:0},{name:'SpeedRate',x:0,y:20},{name:'ShopEntry',x:40,y:20}]
      .map(c=>({...c,active:true,interactable:true}));
    const layouts=[value.layout],page={locator:()=>({evaluate:async()=>true}),waitForTimeout:async()=>{},
      evaluate:async code=>typeof code==='string'?null:{...value.documentState,t:now+10},
      keyboard:{press:async code=>{now+=10;trace.push({...value.navigation,t:now,code});value.layout.t=delayed?19:now+1;},
        down:async key=>{downs.push(key);states.push({action:'session',paused:true});encounters.push({action:'pause'});},up:async()=>{}}};
    const run=runInNewContext(source.slice(begin,end)+';gameKey',{page,trace,states,encounters,layouts,report,
      geometry:async()=>({layout:value.prepared}),keyboardFocus:async()=>{},
      hudControls:layout=>[...layout.controls,...layout.shopControls,...layout.settingsControls],
      check:(condition,message)=>assert.ok(condition,message),screenshot:async()=>{value.layout.selection=selection;},
      until:async(items,start,predicate)=>{
        if(items===layouts && delayed){
          assert.equal(predicate(value.layout),false,'A delayed pre-Tab layout is not a fresh selection observation');
          value.layout.t=now+1;freshWaits++;assert.equal(predicate(value.layout),true,'Freshness wait must not wait for the expected target');
        }
        return items.slice(start).find(predicate);
      },validateKeyboardSubmit:journey.validateKeyboardSubmit});
    states.push(value.state);
    if(selection==='SpeedRate'){await run('SpeedRate','session',item=>item.paused);assert.deepEqual(downs,['Enter']);}
    else {await assert.rejects(run('SpeedRate','session',item=>item.paused));assert.deepEqual(downs,[]);}
    assert.equal(freshWaits,delayed?1:0);
  }
});

function waveClockFixture(){
  // Inert shape reproduces Linux3's 65 admitted ticks and delayed console tail.
  const sample={load:3,timeOrigin:1000,scope:'healthy',run:1,rules:'last-stand-waves-v1:playable-prototype-v1',
    wave:1,completedWave:0,tick:215,hp:120,hull:120,kills:0,spawned:1,cannon:0,launcher:0,healed:0,
    closeHits:0,rangedHits:0,alive:1,status:'Running',paused:false,catchingUp:false,failed:false,
    callbackSteps:1,terminalElapsed:0,selectedSpeed:1,effectiveSpeed:1,clockPending:.026};
  const before={...sample,t:200000,clockTimestamp:198.54},paused={...sample,t:210000,paused:true,reason:'user',clockTimestamp:208.54};
  const returned={...paused,t:222000,clockTimestamp:220.54},resumed={...sample,t:227226.9,clockTimestamp:225.768};
  const after={...sample,t:230535.8,tick:280,clockTimestamp:229.038,clockPending:.046,callbackSteps:7};
  const events=[{load:3,timeOrigin:1000,scope:'healthy',globalTarget:true,t:210100,kind:'visibilitychange',hidden:true,focused:false},
    {load:3,timeOrigin:1000,scope:'healthy',globalTarget:true,t:222100,kind:'visibilitychange',hidden:false,focused:true}];
  return {before,paused,returned,resumed,after,events,oracle:{215:paused,280:after}};
}
test('current wave elapsed proof uses exact admitted clock and carry despite delayed state emission',()=>{
  const value=waveClockFixture(),proof=journey.validateExplicitPause(value);
  assert.equal(proof.resumed_ticks,65);assert.equal(proof.clock.basis,'admitted-clock/v1');
  assert.equal(proof.resumed,value.resumed);assert.equal(proof.after,value.after);
  for(const mutate of [v=>delete v.after.clockTimestamp,v=>delete v.resumed.clockPending,v=>v.after.clockTimestamp+=.05,
    v=>v.after.clockTimestamp=-1,v=>v.after.clockTimestamp=NaN,v=>v.after.clockPending=.05,v=>v.resumed.clockPending=-.01,
    v=>v.after.clockPending+=.01,v=>v.after.tick++,v=>v.resumed.effectiveSpeed=.5,v=>v.after.selectedSpeed=2,
    v=>v.after.callbackSteps=129,v=>v.after.catchingUp=true,v=>v.resumed.catchingUp=true,v=>v.after.rules='historical',
    v=>v.after.scope='other',v=>v.events[1].scope='other',v=>v.events[1].globalTarget=false]){
    const invalid=waveClockFixture();mutate(invalid);assert.throws(()=>journey.validateExplicitPause(invalid));
  }
  const background={kind:'hidden',before:{...value.resumed,t:210000},after:value.after,
    events:value.events,oracle:{215:value.resumed,280:value.after}};
  assert.equal(journey.validateBackgroundInterval(background).clock.basis,'admitted-clock/v1');
});

function fittingFixture(initial='repair',fault=()=>{}) {
  const state={fittingId:initial,menu:''},calls=[];
  const layout={controls:[{name:'ToggleFitting',active:false,interactable:false},
    {name:'FittingPrevious',active:true,interactable:initial==='launcher'},
    {name:'FittingNext',active:true,interactable:initial==='repair'}]};
  const options={currentState:()=>state,currentLayout:()=>layout,waitFor:async predicate=>assert.ok(predicate(),'Current selector observation required'),
    click:async name=>{
      calls.push(name);
      if(name==='FittingNext'||name==='FittingPrevious'){
        state.fittingId=name==='FittingNext'?'launcher':'repair';
        layout.controls[1].interactable=state.fittingId==='launcher';
        layout.controls[2].interactable=state.fittingId==='repair';
      }
      fault({state,layout,name});
    }};
  return {options,calls,state,layout};
}

test('fitting journey uses the actual inline arrow and observes equipped identity in either direction',async()=>{
  for(const [initial,fitting,arrow] of [['repair','launcher','FittingNext'],['launcher','repair','FittingPrevious']]){
    const fixture=fittingFixture(initial);await journey.selectLastStandFitting({...fixture.options,fitting});
    assert.deepEqual(fixture.calls,[arrow]);assert.equal(fixture.state.fittingId,fitting);
    assert.equal(fixture.state.menu,'');
  }
  const unchanged=fittingFixture();await journey.selectLastStandFitting({...unchanged.options,fitting:'repair'});
  assert.deepEqual(unchanged.calls,[],'Already-equipped identity avoids unnecessary selection input');
});

test('fitting journey rejects unavailable, mismatched or modal selections before claiming completion',async()=>{
  for(const fault of [
    ({state})=>{state.menu='fitting';},
    ({state})=>{state.fittingId='repair';},
    ({layout})=>{layout.controls[1].interactable=false;},
    ({layout})=>{layout.controls[0].active=true;},
  ]){
    const fixture=fittingFixture('repair',fault);
    await assert.rejects(journey.selectLastStandFitting({...fixture.options,fitting:'launcher'}));
    assert.deepEqual(fixture.calls,['FittingNext'],'Failed inline selection never opens or closes an unrelated modal');
  }
  const unavailable=fittingFixture();unavailable.layout.controls[2].interactable=false;
  await assert.rejects(journey.selectLastStandFitting({...unavailable.options,fitting:'launcher'}),/visibly available/);
  assert.deepEqual(unavailable.calls,[],'Unavailable arrows refuse before sending input');
  const covered=fittingFixture();covered.state.menu='menu';
  await assert.rejects(journey.selectLastStandFitting({...covered.options,fitting:'launcher'}),/actual garage/);
  assert.deepEqual(covered.calls,[],'Covered garage refuses before sending input');
});

test('fitting journey awaits a real post-reload layout even when the default fitting is already selected',async()=>{
  for(const fitting of ['repair','launcher']) {
    const fixture=fittingFixture();let layoutReady=false,readinessWaits=0;
    fixture.options.currentLayout=()=>layoutReady?fixture.layout:undefined;
    fixture.options.waitFor=async predicate=>{
      if(!layoutReady) {
        assert.equal(predicate(),false,'State readiness cannot stand in for the missing HUD layout');
        layoutReady=true;readinessWaits++;
      }
      assert.ok(predicate(),'Actual awaited observation is required');
    };
    await journey.selectLastStandFitting({...fixture.options,fitting});
    assert.equal(readinessWaits,1);
    assert.deepEqual(fixture.calls,fitting==='launcher'?['FittingNext']:[]);
  }
  const missing=fittingFixture();missing.options.currentLayout=()=>undefined;
  await assert.rejects(journey.selectLastStandFitting({...missing.options,fitting:'launcher'}));
  assert.deepEqual(missing.calls,[],'A missing layout never permits pointer input');
});

function settingFixture(control,paused=false,fault=()=>{}){
  const state={menu:'',paused,selectedSpeed:paused?0:.5,muted:false},calls=[];
  let effects=true,tab=0;
  const layout={settingsControls:[]};
  const refresh=()=>{layout.settingsControls=['MenuSettings','SettingsTab0','SettingsTab1','SettingsClose','SettingsMute','DisplayEffects']
    .map(name=>({name,active:state.menu==='menu'?name==='MenuSettings':state.menu==='settings'&&
      (name==='SettingsClose'||name.startsWith('SettingsTab')||name===(tab===0?'SettingsMute':'DisplayEffects')),interactable:true}));};
  refresh();
  const options={control,currentState:()=>state,currentLayout:()=>layout,
    readValue:()=>control==='SettingsMute'?state.muted:effects,waitFor:async predicate=>assert.ok(predicate(),'Actual settings observation required'),
    click:async name=>{calls.push(name);
      if(name==='Menu')state.menu='menu';else if(name==='MenuSettings')state.menu='settings';
      else if(name.startsWith('SettingsTab'))tab=Number(name.slice(-1));else if(name==='SettingsClose')state.menu='';
      else if(name==='SettingsMute')state.muted=!state.muted;else if(name==='DisplayEffects')effects=!effects;
      refresh();fault({name,state,layout});
    }};
  return {options,state,calls};
}
test('combat preferences use visible Audio or Display controls and preserve manual pause and speed',async()=>{
  for(const [control,tab]of [['SettingsMute',0],['DisplayEffects',1]])for(const paused of [false,true]){
    const fixture=settingFixture(control,paused);await journey.changeLastStandSetting(fixture.options);
    assert.deepEqual(fixture.calls,['Menu','MenuSettings','SettingsTab'+tab,control,'SettingsClose']);
    assert.equal(fixture.state.menu,'');assert.equal(fixture.state.paused,paused);
    assert.equal(fixture.state.selectedSpeed,paused?0:.5);
  }
});
test('combat settings refuse wrong pages, hidden controls, unchanged values and pause/rate drift',async()=>{
  for(const fault of [
    ({name,state})=>{if(name==='Menu')state.menu='about';},
    ({name,layout})=>{if(name==='SettingsTab0')layout.settingsControls.find(c=>c.name==='SettingsMute').active=false;},
    ({name,state})=>{if(name==='SettingsMute')state.muted=false;},
    ({name,state})=>{if(name==='SettingsClose')state.paused=true;},
    ({name,state})=>{if(name==='SettingsClose')state.selectedSpeed=1;},
  ])await assert.rejects(journey.changeLastStandSetting(settingFixture('SettingsMute',false,fault).options));
  const covered=settingFixture('SettingsMute');covered.state.menu='settings';
  await assert.rejects(journey.changeLastStandSetting(covered.options),/starts at the actual game/);assert.deepEqual(covered.calls,[]);
});

test('combat capture rejects legacy clutter, missing speed controls, modal or inaccessible actions',()=>{
  const fixture=()=>({phase:'battle',controls:['Menu','SpeedMinus','SpeedRate','SpeedPlus'].map(name=>({name,active:true,interactable:true})),
    shopControls:[{name:'ShopEntry',active:true,interactable:true}],settingsControls:[]});
  const valid=fixture();assert.equal(journey.validateCompactCombatControls(valid),valid);
  for(const mutate of [
    x=>x.controls.push({name:'Pause',active:true,interactable:true}),
    x=>x.controls.push({name:'ToggleMute',active:true,interactable:true}),
    x=>x.controls.push({name:'Effects',active:true,interactable:true}),
    x=>x.controls.pop(),x=>x.controls[0].interactable=false,x=>x.controls[2].interactable=false,
    x=>x.shopControls[0].active=false,x=>x.shopControls[0].interactable=false,
    x=>x.shopControls.push({name:'ShopClose',active:true,interactable:true}),
    x=>x.settingsControls.push({name:'SettingsClose',active:true}),x=>x.phase='garage',
  ]){const value=fixture();mutate(value);assert.throws(()=>journey.validateCompactCombatControls(value));}
});

function calloutFixture(){
  return {visible:true,target:'Attachment_Repair',width:1366,height:664,pixelRatio:1,
    anchorWorld:{x:1,y:2,z:3},projectedAnchor:{x:800,y:320,z:12},endpointScreen:{x:800,y:320}};
}
test('fitting callout parser requires actual current module, viewport and projected endpoint agreement',()=>{
  for(const [fitting,target] of [['repair','Attachment_Repair'],['launcher','Attachment_Launcher']]){
    const value=calloutFixture();value.target=target;
    assert.equal(journey.validateFittingCalloutObservation(value,{visible:true,fitting,width:1366,height:664}),value);
  }
  const hidden={...calloutFixture(),visible:false,target:'',projectedAnchor:{x:0,y:0,z:0},endpointScreen:{x:0,y:0}};
  journey.validateFittingCalloutObservation(hidden,{visible:false,width:1366,height:664});
  for(const mutate of [value=>delete value.target,value=>value.extra=true,value=>value.visible=1,
    value=>value.target='WholeHull',value=>value.target='Attachment_Launcher',value=>value.width=1365,
    value=>value.height=665,value=>value.pixelRatio=0,value=>value.anchorWorld.x=NaN,
    value=>value.projectedAnchor.z=-1,value=>value.projectedAnchor.x=1400,
    value=>value.endpointScreen.x+=2,value=>value.endpointScreen.y-=2]){
    const candidate=calloutFixture();mutate(candidate);
    assert.throws(()=>journey.validateFittingCalloutObservation(candidate,{visible:true,fitting:'repair',width:1366,height:664}));
  }
  for(const mutate of [value=>value.target='Attachment_Repair',value=>value.projectedAnchor.x=12,value=>value.endpointScreen.y=12]){
    const candidate=structuredClone(hidden);mutate(candidate);
    assert.throws(()=>journey.validateFittingCalloutObservation(candidate,{visible:false}),'Hidden stale markers must refuse');
  }
});

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
    {name:'SpeedRate',active:true,interactable:true}]};
  return {before:{...encounter,hull:120,loop:session},result,states:[session,staged,result],
    encounters:[encounter,terminal],layouts:[layout],oracle:{1:model,2:{...model,tick:2,hp:0,status:'Defeated'}}};
}

test('portable wave settling observes the real transient transition without a late pointer command',async()=>{
  const begin=source.indexOf('    const terminalBefore=await observation()'),end=source.indexOf("    await phaseMatrix('result');",begin);
  assert.ok(begin>0&&end>begin);
  const before={tick:10},naturalResult={phase:'result'},saved={version:4},states=[],encounters=[],layouts=[],report={lifecycle:[]};
  const oracle={100:{tick:100,status:'Defeated'}};
  const run=new Function('player','observation','states','reference','check','armGameClick','until','load',
    'phaseMatrix','gameClick','page','SAVE_KEY','validateWaveTerminal','encounters','layouts','report',
    'return(async()=>{'+source.slice(begin,end)+'return naturalResult;})()');
  const result=await run(false,async()=>before,states,()=>oracle,(ok,name)=>assert.ok(ok,name),
    ()=>assert.fail('Portable observer cannot issue a late settling pointer'),async()=>naturalResult,1,
    ()=>assert.fail('Portable observer cannot promise a paused five-viewport interval'),()=>assert.fail('No late pointer'),
    {evaluate:async()=>JSON.stringify(saved)},'save',(value)=>{
      assert.equal(value.before,before);assert.equal(value.result,naturalResult);assert.deepEqual(value.saved,saved);
      assert.equal(value.states,states);assert.equal(value.encounters,encounters);assert.equal(value.layouts,layouts);assert.equal(value.oracle,oracle);
      return {before,result:naturalResult,saved};
    },encounters,layouts,report);
  assert.equal(result,naturalResult);assert.equal(report.lifecycle.length,1);
  assert.equal(report.lifecycle[0].kind,'wave-terminal');assert.equal(report.lifecycle[0].mode,'foreground');
  assert.equal(report.lifecycle[0].interaction,undefined,'Linux cannot claim Windows native settling interaction');
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

function withCallbackRecords(x,elapsed,priorPending=0){
  const previous=x.states.at(-2),next=x.states.at(-1),t=x.cues[0].t-.25;
  const id={load:x.before.load,timeOrigin:x.before.timeOrigin,scope:x.before.scope};
  const admission={...id,id:1,run:x.before.run,fromTick:previous.tick,timestamp:t/1000,
    previousTimestamp:t/1000-elapsed,elapsed,priorPending,speed:1,focused:true,
    applicationPaused:false,paused:false,failed:false};
  const steps=next.tick-previous.tick,pending=steps*.05;
  x.callbackRecords=[{...admission,action:'begin',t,tick:previous.tick,steps:0,pending,age:0},
    {...admission,action:'end',t:next.t+.1,tick:next.tick,steps,pending:0,age:(next.t+.1-t)/1000}];
  return x;
}

function focusAckFixture(){
  // Explicit inert events exercise the actual validator; these are not host evidence.
  const id={load:16,timeOrigin:100000,scope:'healthy'};
  const event=(kind,t,focused,hidden)=>({...id,kind,t,focused,hidden,globalTarget:true});
  const model={tick:20,hp:120,kills:0,spawned:1,cannon:0,launcher:0,healed:0,
    closeHits:0,rangedHits:0,alive:1,status:'Running'};
  const state={...id,sessionRun:1,runId:7,cannonDamage:20,action:'session',phase:'battle',
    paused:false,muted:false,saveState:'ready',hull:120,kills:0};
  return withCallbackRecords({kind:'hidden',before:{...id,t:900,run:1,loop:{runId:7,cannonDamage:20}},
    begin:1250,recovered:7200,ms:6000,
    events:[event('visibilitychange',1000,false,true),event('focus',7000,true,true),
      event('visibilitychange',7010,true,false)],
    encounters:[{...id,...model,t:7002,run:1,action:'visibility',focused:true,
      applicationPaused:false,paused:false,failed:false,catchingUp:false}],
    states:[{...state,t:7030,tick:20},{...state,t:7080,tick:21}],
    cues:[{...id,t:7059,text:'ST_LS_AUDIO event=cannon\n'},
      {...id,t:7059.1,text:'ST_LS_AUDIO event=impact\n'}],
    oracle:{20:model,21:{...model,tick:21,cannon:1}}},.05);
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
  return withCallbackRecords(x,.25);
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
  return withCallbackRecords({kind:'hidden',before:{...id,t:112320.30000000002,run:1,loop:{runId:1,cannonDamage:20}},
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
      {...id,t:119979.19999999998,text:'ST_LS_AUDIO event=destruction\n'}],oracle},.49,.01);
}

test('recorded return shape with explicit admission remains eligible before state reporting completes',()=>{
  const x=reportedCallbackTailFixture();
  assert.ok(x.states[3].t-x.states[1].t>500,'Recorded post-callback log crosses the admission boundary');
  assert.ok(x.cues.every(c=>c.t-x.states[1].t<500),'Recorded cue emissions precede the unchanged boundary');
  const result=journey.validateAwayAudioReturn(x);
  assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[469,479]]);
  assert.equal(result.cues.length,0);
});

function admittedCallbackFixture(){
  // The retained CI failures have fresh cues followed by delayed render/HUD
  // observations. These explicit callback records are inert regression input,
  // not invented telemetry for either historical hosted execution.
  const x=reportedCallbackTailFixture(),id={load:3,timeOrigin:1792565620753.3,scope:'healthy'};
  const callback={...id,id:52,run:1,fromTick:469,timestamp:119.977,previousTimestamp:119.497,
    elapsed:.48,priorPending:.02,speed:1,focused:true,applicationPaused:false,paused:false,failed:false};
  x.callbackRecords=[{...callback,action:'begin',t:119977,tick:469,steps:0,pending:.5,age:0},
    {...callback,action:'end',t:120101,tick:479,steps:10,pending:0,age:.124}];
  x.states[3].t=120100;x.recovered=120110;
  return x;
}

test('explicit callback admission accepts fresh cues despite delayed HUD reporting',()=>{
  const x=admittedCallbackFixture();
  assert.ok(x.states[3].t-x.cues[0].t>50,'The old state-log tail rejects this correctly admitted callback');
  const result=journey.validateAwayAudioReturn(x);
  assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[469,479]]);
  assert.equal(result.cues.length,0);
});

test('callback telemetry stays separate from model state and retains the document emission clock',()=>{
  const probe=source.match(/const RUNTIME_PROBE = `([\s\S]+?)`;/)?.[1];assert.ok(probe);
  const output=[],context={performance:{now:()=>123.5,timeOrigin:100000},console:{log:text=>output.push(text)}};
  runInNewContext(probe,context);
  const callback=admittedCallbackFixture().callbackRecords[0];
  context.console.log('ST_ENC_CALLBACK '+JSON.stringify(callback));
  const observed=JSON.parse(output.find(s=>s.startsWith('ST_TEST_RUNTIME ')).slice('ST_TEST_RUNTIME '.length));
  const records={states:[],encounters:[],hits:[],layouts:[],cues:[],callbackRecords:[]};
  journey.retainRuntimeObservation(observed,7,'test-only',records);
  assert.deepEqual(records.callbackRecords,[{...callback,t:123.5,timeOrigin:100000,load:7,scope:'test-only'}]);
  assert.ok(['states','encounters','hits','layouts','cues'].every(key=>records[key].length===0));
  assert.throws(()=>journey.retainRuntimeObservation(observed,7,'test-only',{...records,callbackRecords:undefined}));
});

test('explicit callback records reject stale admission, retained debt, missing provenance and oversized batches',()=>{
  const faults=[
    ['missing records',x=>delete x.callbackRecords],['empty records',x=>x.callbackRecords=[]],
    ['missing completion',x=>x.callbackRecords.pop()],['duplicate completion',x=>x.callbackRecords.push({...x.callbackRecords[1]})],
    ['duplicate admission',x=>x.callbackRecords.splice(1,0,{...x.callbackRecords[0]})],
    ['foreign completion id',x=>x.callbackRecords[1].id++],['foreign completion load',x=>x.callbackRecords[1].load++],
    ['foreign completion origin',x=>x.callbackRecords[1].timeOrigin++],['foreign completion run',x=>x.callbackRecords[1].run++],
    ['foreign scope',x=>x.callbackRecords[0].scope='other'],['invalid id',x=>x.callbackRecords.forEach(c=>c.id=0)],
    ['changed clock',x=>x.callbackRecords[1].timestamp++],['changed tick origin',x=>x.callbackRecords[1].fromTick++],
    ['stale elapsed',x=>x.callbackRecords.forEach(c=>{c.elapsed=.501;c.previousTimestamp=c.timestamp-c.elapsed;})],
    ['late emission',x=>x.callbackRecords[0].age=.03],
    ['retained whole-step debt',x=>x.callbackRecords.forEach(c=>c.priorPending=.05)],
    ['unspent foreground debt',x=>x.callbackRecords[1].pending=.05],
    ['invented debt',x=>x.callbackRecords[0].pending=.6],['inconsistent steps',x=>x.callbackRecords[1].steps=9],
    ['oversized batch',x=>{x.callbackRecords[1].steps=11;x.callbackRecords[1].tick=480;x.states[3].tick=480;
      x.oracle[480]={...x.oracle[479],tick:480};}],
    ['nonfinite elapsed',x=>x.callbackRecords.forEach(c=>c.elapsed=NaN)],
    ['pre-visible callback',x=>x.callbackRecords[0].t=x.events.at(-1).t-1],
    ['cue before admission',x=>x.callbackRecords[0].t=x.cues[0].t+.1],
    ['cue after completion',x=>x.callbackRecords[1].t=x.cues[0].t-.1],
    ['overlapping callback',x=>x.callbackRecords.splice(1,0,{...x.callbackRecords[0],id:53,t:x.cues[1].t+.1})],
    ['background admission',x=>x.callbackRecords[0].focused=false],
    ['background completion',x=>x.callbackRecords[1].applicationPaused=true],
    ['paused callback',x=>x.callbackRecords[0].paused=true],['failed callback',x=>x.callbackRecords[1].failed=true],
  ];
  for(const [name,mutate] of faults){
    const x=admittedCallbackFixture();mutate(x);
    assert.throws(()=>journey.validateAwayAudioReturn(x),'Invalid '+name+' must fail');
  }
});

test('callback reporting tail preserves admission, step, provenance and exact cue bounds',()=>{
  const faults=[
    ['late cue',x=>{x.cues[0].t=x.callbackRecords[0].t+10.1;x.cues[1].t=x.cues[0].t+.1;}],
    ['state outside callback',x=>{x.states[3].t=x.callbackRecords[1].t+.1;x.recovered=x.states[3].t+1;}],
    ['eleven steps',x=>{x.states[3].tick=480;x.oracle[480]={...x.oracle[479],tick:480};}],
    ['foreign callback load',x=>x.callbackRecords[0].load++],
    ['foreign callback origin',x=>x.callbackRecords[0].timeOrigin++],
    ['foreign callback run',x=>x.callbackRecords[0].run++],
    ['inert callback',x=>x.callbackRecords[1].steps=0],
    ['missing callback',x=>x.callbackRecords.shift()],
    ['stale admission',x=>x.callbackRecords.forEach(c=>{c.elapsed=.5001;c.previousTimestamp=c.timestamp-c.elapsed;})],
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
  const mutations=[x=>x.callbackRecords.forEach(c=>c.previousTimestamp-=1),x=>x.callbackRecords[0].tick=19,
    x=>x.callbackRecords[0].load++,x=>x.callbackRecords[0].timeOrigin++,x=>x.callbackRecords[0].scope='stale',
    x=>x.callbackRecords[0].run++,x=>x.callbackRecords[1].run++,x=>x.callbackRecords=[],
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
  const end=source.indexOf('    // Ordinary Return and reload preserve the checkpoint',begin);
  const callBegin=source.indexOf("    if(player)check(sound.maximum_rms");
  const callEnd=source.indexOf(withMute?'    const pauseStart=':'    const changeSetting=',callBegin);
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
    'reference','validateModelObservation','sameDocument','elapsedTicks','report','matrix','assert','page','energy','gameKey','changeLastStandSetting','layouts',
    'return (async()=>{'+(begin<0?'':source.slice(begin,end))+source.slice(callBegin,callEnd)+'})()');
  await run(player,(ok,name)=>assert.ok(ok,name),{maximum_rms:1},async()=>{
    assert.equal(paused,!player,'Linux battle screenshot must be publicly paused; Windows stays live');calls.push('screenshot');
  },async label=>{
    assert.equal(paused,!player,'Slow Linux battle layouts must be publicly paused');calls.push(label);
  },async()=>structuredClone(rows.shift()),async(name,action,predicate)=>{
    assert.equal(name,'SpeedRate');paused=!paused;calls.push(paused?'pause':'resume');
    const state={phase:'battle',paused};assert.ok(predicate(state));return state;
  },async()=>950,()=>({}),()=>{},(a,b)=>{
    assert.equal(a.timeOrigin,b.timeOrigin,'same document origin');assert.equal(a.run,b.run,'same run');
  },(a,b)=>assert.equal(b.tick-a.tick,(b.t-a.t)/50),report,
    {phaseViewports:['standard','wide','portrait','compact','small'].map(name=>({name}))},assert,
    {waitForTimeout:async()=>{}},async()=>null,async()=>assert.fail('Linux must not toggle a second Pause during its paused inspection'),
    async({control})=>{assert.equal(control,'SettingsMute');assert.ok(paused,'Linux mute inspection remains manually paused');
      muted=!muted;calls.push('settings-mute');return {muted};},[]);
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
  assert.deepEqual(calls,['pause','screenshot','battle','settings-mute','settings-mute']);
  assert.ok(source.includes("if(player)await phaseMatrix('explicit-pause')"),'One actual Linux paused matrix covers both geometry observations');
  assert.ok(source.includes('validateExplicitPause({before:pauseBefore,paused:pausedObservation,returned,'),
    'Original actual Resume/counter/time/model oracle remains mandatory');
});

test('actual Windows live layout inspection uses the resumed run before checkpoint-preserving reload',async()=>{
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
  const elapsed=runInNewContext(source.slice(clockBegin,clockEnd).replaceAll('export function ','function ')+';elapsedTicks',{assert});
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
  for(const [host,testMs]of [['win32',2_400_000],['linux',3_600_000]]){
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
      'startOwnedSupervisor(child,output,null,budget.supervisorMs,ownedRoot)','budget.runnerMs']],
  ]){
    const text=readFileSync(new URL(file,import.meta.url),'utf8');
    for(const needle of needles)assert.ok(text.includes(needle),file+' uses actual derived '+needle);
  }
  assert.ok(source.includes("ownedChrome(chromium,output,'native',lastStandJourneyTimeBudget().browserMs)"));
  assert.ok(source.includes("mode='native', lifetimeMs=640_000"),'Unrelated generic Chrome default stays unchanged');
  const config=readFileSync(new URL('../../playwright.config.ts',import.meta.url),'utf8');
  assert.ok(config.includes('timeout: 180_000'),'Budget agrees with actual webServer startup allowance');
});
test('wave wrapper admits the host capture budget before starting its real journey',async()=>{
  const spec=readFileSync(new URL('../../e2e/last-stand-playable-loop.spec.ts',import.meta.url),'utf8');
  const begin=spec.indexOf("test('Last Stand earned waves and complete checkpoints survive reload'");
  const end=spec.indexOf("\ntest('Last Stand Campaigns journey",begin);
  assert.ok(begin>=0 && end>begin,'Actual tier wrapper required');
  for(const host of ['linux','win32']) {
    const calls=[];let callback;
    const test=Object.assign((_name,_options,body)=>{callback=body;},{
      skip:condition=>assert.equal(condition,false),setTimeout:ms=>calls.push(['test',ms])});
    runInNewContext(spec.slice(begin,end),{test,
      lastStandJourneyTimeBudget:()=>journey.lastStandJourneyTimeBudget(host),
      runLastStandWaveJourney:async()=>{calls.push(['journey']);}});
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
    assert.equal(budget.testMs,host==='linux'?3_600_000:2_400_000);
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
  for(const fault of ['none','stream-escape','driver','executable','run-output','wave-current','wave-stale']){
    let parity=0,waveReads=0;const settling=settlingFixture(),evidence=journey.validateSettlingTransition(settling);
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
      verifyWaveFiles:(_path,report)=>{waveReads++;assert.equal(report.contract,'last-stand-waves/v2','Stale wave contract rejected by current verifier');},
      admitEncounterOracleOutput:(_raw,bundle,sources)=>{parity++;assert.equal(bundle,reference);assert.equal(sources,reference.source_lf_sha256);
        return {profiles:{'repair:20':settling.oracle}};},
    });
    const call=()=>run('/explicit-inert/result.json',{qualification:{profile:'linux-functional',host:'linux'},screenshots:[],
      ...(fault.startsWith('wave-')?{contract:fault==='wave-current'?'last-stand-waves/v2':'last-stand-waves/v1'}:{}),
      lifecycle:[{kind:'settling-transition',evidence}]});
    if(fault==='none'){assert.doesNotThrow(call);assert.equal(parity,1);}
    else if(fault==='wave-current'){assert.doesNotThrow(call);assert.equal(waveReads,1,'Current wave report must reach its actual verifier dispatch');}
    else if(fault==='wave-stale'){assert.throws(call,/Stale wave contract/);assert.equal(waveReads,1,'Old wave report cannot bypass current wave rejection');}
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
  for(const [host,lifetime,expected]of [['win32',2_630_000,'stopped'],['win32',2_640_000,'stopped'],['win32',2_640_001,'failed'],
    ['linux',3_830_000,'stopped'],['linux',3_840_001,'failed'],['linux',640_000,'stopped']]){
    const f=inertSupervisor({host});await f.watchOwnedProcess({...f.options,lifetimeMs:lifetime});
    const record=JSON.parse(f.files.get(f.options.path+'.result.json'));
    assert.equal(record.status,expected,host+' actual owned watcher lifetime '+lifetime);
  }
});

function inertSupervisor({failWrite,stopRequested=true,host='win32'}={}) {
  const root={pid:40,ppid:20,start:'200',exe:'inert-browser',depth:0};
  const owner={pid:20,ppid:10,start:'100',exe:'inert-owner'};
  const options={output:'/explicit-inert',path:'/explicit-inert/supervisor-inert.json',
    root,owner,profile:'/explicit-inert-profile',known:[root],lifetimeMs:1000};
  const files=new Map(),descriptors=new Map(),cleanup=[],writes=[],renames=[];let fd=0,profile=true;
  const write=(path,text)=>{
    path=typeof path==='number'?descriptors.get(path):path;writes.push(path);
    if(failWrite?.(path)){files.set(path,'');throw Object.assign(new Error('injected ENOSPC: '+path),{code:'ENOSPC'});}
    files.set(path,String(text));
  };
  const begin=source.includes('export function publishOwnedSupervisorJson(')
    ?source.indexOf('export function publishOwnedSupervisorJson('):source.indexOf('export function startOwnedSupervisor(');
  const end=source.indexOf('\nexport function nativeChromeArgs',begin);
  const context={assert,process:{pid:20,execPath:'inert-node',platform:host},ROOT:'/explicit-inert',
    admitEvidenceParent:()=>{},relative:()=> 'supervisor-inert.json',join:(...parts)=>parts.join('/'),
    randomUUID:()=> 'inert-id',ownedSupervisorLifetimeLimit:()=>journey.ownedSupervisorLifetimeLimit(host),
    processTable:()=>[root,owner],collectOwnedDescendants:journey.collectOwnedDescendants,
    sameProcess:(a,b)=>a.pid===b.pid && a.start===b.start && a.exe===b.exe,
    writeFileSync:write,readFileSync:path=>files.get(path),
    openSync:(path,mode)=>{assert.equal(mode,'wx');assert.ok(!files.has(path));files.set(path,'');descriptors.set(++fd,path);return fd;},
    closeSync:value=>descriptors.delete(value),unlinkSync:path=>files.delete(path),
    renameSync:(from,to)=>{renames.push([from,to]);files.set(to,files.get(from));files.delete(from);},
    existsSync:path=>path===options.profile?profile:path.endsWith('.stop')?stopRequested || files.has(path):files.has(path),
    stopOwnedProcessTree:async known=>{cleanup.push(JSON.parse(JSON.stringify(known)));return{known,stopped:known,remaining:[]};},
    removeOwnedProfile:path=>{assert.equal(path,options.profile);profile=false;},
    readdirSync:()=>[],delay:async()=>{},spawn:()=>({unref(){}}),console:{error(){}}};
  const actual=runInNewContext(source.slice(begin,end).replaceAll(/^export /gm,'')+
    ';({startOwnedSupervisor,watchOwnedProcess,publishOwnedSupervisorJson})',context);
  return {...actual,options,files,cleanup,writes,renames,descriptors,context};
}

test('owned watcher still cleans admitted exact identities after observational ENOSPC and reports failure',async()=>{
  const f=inertSupervisor({failWrite:path=>path.includes('.observed.json')});
  await f.watchOwnedProcess(f.options);
  assert.deepEqual(f.cleanup,[f.options.known],'Observational write failure must not skip admitted cleanup');
  const result=JSON.parse(f.files.get(f.options.path+'.result.json'));
  assert.equal(result.status,'failed');assert.match(result.error,/ENOSPC/);
  assert.deepEqual(result.tree.remaining,[]);assert.equal(result.profile_removed,true);
});

test('owned watcher never cleans inadmissible ownership or lifetime after failed validation',async()=>{
  for(const change of [{root:{pid:40,ppid:999,start:'200',exe:'inert-browser'}},{lifetimeMs:0}]){
    const f=inertSupervisor();await f.watchOwnedProcess({...f.options,...change});
    assert.deepEqual(f.cleanup,[]);assert.equal(JSON.parse(f.files.get(f.options.path+'.result.json')).status,'failed');
  }
});

test('owned watcher failed final publication cannot leave partial JSON at its result path',async()=>{
  const f=inertSupervisor({failWrite:path=>path.includes('.result.json')});
  await assert.rejects(f.watchOwnedProcess(f.options),/ENOSPC/);
  assert.deepEqual(f.cleanup,[f.options.known]);
  assert.equal(f.files.has(f.options.path+'.result.json'),false,'Incomplete final JSON must never be published');
  assert.equal(f.descriptors.size,0);assert.equal(f.files.has(f.options.path+'.result.json.pending-inert-id'),false);
});

test('owned supervisor stop falls back to its admitted identities on stop-marker ENOSPC',async()=>{
  const f=inertSupervisor({failWrite:path=>path.endsWith('.stop')});
  const supervisor=f.startOwnedSupervisor({pid:40},f.options.output,f.options.profile,1000);
  await assert.rejects(supervisor.stop(),/ENOSPC/);
  assert.deepEqual(f.cleanup,[f.options.known],'Stop receipt failure must still attempt exact admitted cleanup');
});

test('owned supervisor rejects malformed final publication and still attempts admitted cleanup',async()=>{
  const f=inertSupervisor(),supervisor=f.startOwnedSupervisor({pid:40},f.options.output,f.options.profile,1000);
  f.files.set(supervisor.resultPath,'');
  await assert.rejects(supervisor.stop(),/JSON|publication/);
  assert.deepEqual(f.cleanup,[f.options.known],'A permanently empty receipt must not leave owned cleanup unattempted');
});

test('owned supervisor only admits complete matching successful cleanup receipts',async()=>{
  const receipt=options=>({status:'stopped',root:options.root,owner:options.owner,profile:options.profile,
    tree:{known:options.known,remaining:[]},profile_removed:true});
  for(const change of [null,result=>{result.root={...result.root,start:'reused-start'};},
    result=>{result.root={...result.root,exe:'unrelated-executable'};},result=>{result.owner={...result.owner,pid:999};},
    result=>{result.profile='/unowned-profile';},result=>{result.tree.remaining=[result.root];},
    result=>{result.profile_removed=false;},result=>{result.status='failed';result.error='observational ENOSPC';}]){
    const f=inertSupervisor(),supervisor=f.startOwnedSupervisor({pid:40},f.options.output,f.options.profile,1000);
    const result=receipt(f.options);change?.(result);f.files.set(supervisor.resultPath,JSON.stringify(result));
    if(change){await assert.rejects(supervisor.stop(),/mismatch|cleanup|removal|ENOSPC/);assert.deepEqual(f.cleanup,[f.options.known]);}
    else {assert.equal((await supervisor.stop()).status,'stopped');assert.deepEqual(f.cleanup,[]);}
  }
});

test('owned supervisor failed publications preserve prior bytes and only remove their own pending file',()=>{
  const f=inertSupervisor(),path=f.options.path+'.result.json',pending=path+'.pending-inert-id';
  f.files.set(path,'previous complete receipt');f.files.set(pending,'pre-existing unrelated collision');
  assert.throws(()=>f.publishOwnedSupervisorJson(path,{status:'failed'}));
  assert.equal(f.files.get(pending),'pre-existing unrelated collision');assert.equal(f.files.get(path),'previous complete receipt');
  f.files.delete(pending);f.context.renameSync=()=>{throw new Error('injected rename refusal');};
  assert.throws(()=>f.publishOwnedSupervisorJson(path,{status:'failed'}),/rename refusal/);
  assert.equal(f.files.has(pending),false);assert.equal(f.files.get(path),'previous complete receipt');assert.equal(f.descriptors.size,0);
});

test('owned watcher preserves observational failure through cleanup and final publication failures',async()=>{
  const f=inertSupervisor({failWrite:path=>path.includes('.observed.json') || path.includes('.result.json')});
  f.context.stopOwnedProcessTree=async()=>{throw new Error('injected cleanup refusal');};
  await assert.rejects(f.watchOwnedProcess(f.options),error=>{
    assert.match(error.message,/observed.json/);assert.match(error.publication_error,/result.json/);return true;
  });
  assert.equal(f.files.has(f.options.path+'.result.json'),false);
});

test('owned supervisor parent rejects missing executable identity before admitting fallback cleanup',()=>{
  for(const who of ['root','owner']){
    const f=inertSupervisor();f.options[who].exe=undefined;
    assert.throws(()=>f.startOwnedSupervisor({pid:40},f.options.output,f.options.profile,1000),/executable/);
    assert.deepEqual(f.cleanup,[]);assert.equal(f.files.size,0);
  }
});

test('owned Chrome startup retention failures clean only the child identity admitted before the write',async()=>{
  const begin=source.indexOf('export async function ownedChrome('),end=source.indexOf('\nfunction frameTiming(',begin);
  for(const stage of ['initial-receipt','supervisor-options','inadmissible-parent','missing-executable']){
    const root={pid:40,ppid:stage==='inadmissible-parent'?999:20,start:'200',exe:stage==='missing-executable'?undefined:'inert-browser'};
    const reused={pid:40,ppid:20,start:'999',exe:'unrelated-reused-pid'},cleanup=[],removed=[];
    const failure=new Error('injected startup ENOSPC: '+stage);let current=root;
    const child={pid:40,exitCode:null,stdout:{on(){}},stderr:{on(){}},on(){}};
    const run=runInNewContext(source.slice(begin,end).replace('export async','async')+';ownedChrome',{
      assert,process:{platform:'win32',pid:20,env:{ProgramFiles:'/explicit-inert'}},
      join:(...parts)=>parts.join('/'),tmpdir:()=>'/explicit-inert-temp',mkdtempSync:()=>'/explicit-inert-temp/st-ls-chrome-fixture',
      existsSync:()=>true,spawn:()=>child,nativeChromeArgs:()=>[],ownedProcessIdentity:()=>current,
      writeFileSync(path){if(path.endsWith('browser-profile.json') && stage==='initial-receipt'){current=reused;throw failure;}},
      startOwnedSupervisor(){current=reused;throw failure;},
      stopOwnedProcessTree:async known=>{cleanup.push(JSON.parse(JSON.stringify(known)));return{known,remaining:[]};},
      removeOwnedProfile:path=>removed.push(path),delay:async()=>{},ownedBrowsers:new Set(),ownedBrowserWindows:new Map(),
    });
    await assert.rejects(run({},'/explicit-inert-output'),error=>{
      if(stage==='inadmissible-parent')assert.match(error.message,/ancestry|parent/);
      else if(stage==='missing-executable')assert.match(error.message,/executable/);
      else assert.equal(error,failure);return true;
    });
    if(['inadmissible-parent','missing-executable'].includes(stage)){
      assert.deepEqual(cleanup,[]);assert.deepEqual(removed,[]);
    }else{
      assert.deepEqual(cleanup,[[{...root,depth:0}]],stage+' must retain the original PID/start/exe tuple');
      assert.deepEqual(removed,['/explicit-inert-temp/st-ls-chrome-fixture']);
    }
  }
});

test('standalone journey setup failure cleans its pre-write admitted child and cannot pass',async()=>{
  const runner=readFileSync(new URL('../last-stand-playable-loop.mjs',import.meta.url),'utf8');
  const begin=runner.indexOf("  const root=resolve(import.meta.dirname,'..');"),end=runner.lastIndexOf('\n}');
  assert.ok(begin>=0 && end>begin,'Actual standalone runner body required');
  const body=runner.slice(begin,end).replace('import.meta.dirname',"'/explicit-inert/scripts'");
  for(const stage of ['supervisor-options','inadmissible-parent','missing-executable']){
    const root={pid:40,ppid:stage==='inadmissible-parent'?999:20,start:'200',exe:stage==='missing-executable'?undefined:'inert-runner'};
    const reused={pid:40,ppid:20,start:'999',exe:'unrelated-reused-pid'},cleanup=[],files=new Map();
    const failure=new Error('injected runner options ENOSPC');let current=root;
    const child={pid:40,exitCode:null,stdout:{on(){}},stderr:{on(){}},on(){},once(){}};
    const processFixture={pid:20,execPath:'inert-node',platform:'win32',env:{},stderr:{write(){}},once(){}};
    const report=await runInNewContext('(async()=>{'+body+';return report;})()',{
      assert,process:processFixture,resolve:(...parts)=>parts.join('/'),join:(...parts)=>parts.join('/'),
      admitEvidenceParent:()=>'/explicit-inert',randomUUID:()=> 'inert-id',mkdirSync(){},spawn:()=>child,
      lastStandJourneyTimeBudget:()=>journey.lastStandJourneyTimeBudget('win32'),ownedProcessIdentity:()=>current,
      startOwnedSupervisor(){current=reused;throw failure;},
      finishOwnedSupervisorCleanup:async(options,known)=>{assert.equal(options.profile,null);
        cleanup.push(JSON.parse(JSON.stringify(known)));return{tree:{known,remaining:[]},profiles:[],profile_removed:null};},
      clearTimeout(){},writeFileSync:(path,value)=>files.set(path,value),console:{log(){}},
    });
    assert.equal(report.status,'failed');assert.equal(processFixture.exitCode,1);
    if(stage==='supervisor-options'){
      assert.equal(report.error,String(failure));assert.deepEqual(cleanup,[[{...root,depth:0}]]);
      assert.equal(report.cleanup.tree.remaining.length,0);
    }else{
      assert.match(report.error,stage==='inadmissible-parent'?/ancestry|parent/:/executable/);assert.deepEqual(cleanup,[]);
    }
  }
});

test('owned supervisor cannot replace the pre-write admitted child with a reused process identity',()=>{
  for(const key of ['pid','start','exe']){
    const f=inertSupervisor(),expected={...f.options.root,[key]:key==='pid'?999:'different-'+key};
    assert.throws(()=>f.startOwnedSupervisor({pid:40},f.options.output,f.options.profile,1000,expected),/identity changed/);
    assert.deepEqual(f.cleanup,[]);assert.equal(f.files.size,0);
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
  const begin=reader.search(/  (?:const|let) linuxParents=/),end=reader.indexOf('  const result=assertCombinedWaveQualification(',begin);
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


test('background wave caller awaits a post-return observation before collecting its checkpoint',async()=>{
  const begin=source.indexOf('    const afterBackground=await observation('),end=source.indexOf('\n',begin);
  assert.ok(begin>0&&end>begin,'Execute the maintained background checkpoint observation');
  const interval={recovered:1000,before:{run:2}},stale={t:999,run:2,tick:200},fresh={t:1010,run:2,tick:201};
  const run=new Function('observation','reference','validateModelObservation','interval',
    'return(async()=>{'+source.slice(begin,end)+'return afterBackground;})();');
  const observed=await run(async options=>options?.minT>=interval.recovered&&options.run===2?fresh:stale,
    ()=>({201:fresh}),(state,oracle)=>assert.deepEqual(oracle[state.tick],state,'Pre-return cached sample cannot establish a post-return checkpoint'),interval);
  assert.equal(observed,fresh);
});


function waveReturnTerminalFixture(kind='hidden'){
  // Counter shape from retained current wave oracle Tier1/repair/30 ticks5078–5080.
  // Timing is inert test data; this does not establish native/browser acceptance.
  const x=focusAckFixture(),id={load:x.before.load,timeOrigin:x.before.timeOrigin,scope:x.before.scope};
  const rule='last-stand-waves-v1',rules=rule+':playable-prototype-v1';
  const row={tick:5078,hp:6,kills:65,spawned:66,cannon:222,launcher:0,scattergun:0,healed:264,
    closeHits:1,rangedHits:45,alive:1,wave:11,completedWave:10,status:'Running'};
  x.oracle={5078:row,5079:{...row,tick:5079},5080:{...row,tick:5080,hp:0,healed:267,rangedHits:46,status:'Defeated'}};
  x.before={...x.before,...row,rules,loop:{...x.before.loop,cannonDamage:30,profileVersion:rule,activeTier:1},fitting:'repair'};
  const base={...id,sessionRun:1,runId:7,pendingRunId:0,cannonDamage:30,profileVersion:rule,activeTier:1,fittingId:'repair',
    action:'session',phase:'battle',paused:false,muted:false,saveState:'ready',hasCheckpoint:true,hull:6,kills:65};
  x.states=[{...base,t:7020,tick:5078},{...base,t:7030,tick:5079},
    {...base,t:7080,tick:5080,hull:0,action:'defeat-staged',phase:'settling',runId:0,pendingRunId:0,hasCheckpoint:false}];
  x.encounters=[{...x.encounters[0],...row,rules},
    {...id,...x.oracle[5080],rules,t:7059.05,run:1,action:'terminal',focused:true,applicationPaused:false,
      catchingUp:false,paused:false,failed:false,callbackSteps:1,terminalElapsed:0}];
  x.cues=[{...id,t:7059,text:'ST_LS_AUDIO event=impact\n'},{...id,t:7059.1,text:'ST_LS_AUDIO event=defeat\n'}];
  x.kind=kind;
  if(kind==='blur'){x.events=[{...x.events[0],kind:'blur',hidden:false},{...x.events[2],kind:'focus'}];x.encounters[0].t=7012;}
  return withCueWitnesses(withCallbackRecords(x,.05));
}
function withCueWitnesses(x){
  const [begin,end]=x.callbackRecords;
  x.callbackRecords=[begin,...x.cues.map((c,i)=>({...c,text:undefined,action:'cue',id:begin.id,run:begin.run,
    fromTick:begin.fromTick,tick:end.tick,steps:end.steps,ordinal:i+1,cue:c.text.match(/event=(\w+)/)[1],
    timestamp:begin.timestamp,previousTimestamp:begin.previousTimestamp,admittedAt:begin.timestamp+.0001*(i+1),
    played:true,reason:'played',t:c.t-.00001})),end];
  return x;
}
function waveCueFixture(){
  const x=focusAckFixture(),rule='last-stand-waves-v1',rules=rule+':playable-prototype-v1';
  x.before={...x.before,wave:1,rules,fitting:'repair',loop:{...x.before.loop,profileVersion:rule,activeTier:1}};
  x.encounters=x.encounters.map(e=>({...e,wave:1,completedWave:0,rules}));
  x.states=x.states.map(e=>({...e,profileVersion:rule,activeTier:1,fittingId:'repair',hasCheckpoint:true,pendingRunId:0}));
  return withCueWitnesses(x);
}
test('actual audio return caller rejects contradictory wave/archive identity before recording evidence',async()=>{
  const start=source.indexOf('    const noReplay=async('),end=source.indexOf('\n    const away=',start);
  assert.ok(start>=0 && end>start);
  const run=async x=>{
    const report={lifecycle:[]};
    const noReplay=runInNewContext(source.slice(start,end)+';noReplay',{
      validateAwayAudioReturn:journey.validateAwayAudioReturn,validateNoReplayAudio:journey.validateNoReplayAudio,
      cues:x.cues,states:x.states,encounters:x.encounters,callbackRecords:x.callbackRecords,
      reference:()=>x.oracle,energy:async()=>null,check:(value,message)=>assert.ok(value,message),report,
    });
    await noReplay(x.begin,x.recovered,x);return report;
  };
  // Current and explicitly archived inputs both retain their intended lane.
  const archive=focusAckFixture();archive.before.rules='playable-prototype-v1';
  archive.before.loop.profileVersion='tier-goals-v1';
  for(const x of [waveCueFixture(),archive,focusAckFixture()]){
    const report=await run(x);assert.equal(report.lifecycle.length,1);
    assert.equal(report.lifecycle[0].boundary.callbacks.length,1);
  }
  for(const mutate of [
    x=>{x.before.loop.profileVersion='tier-goals-v1';x.callbackRecords=x.callbackRecords.filter(c=>c.action!=='cue');},
    x=>{delete x.before.loop.profileVersion;},x=>{delete x.before.rules;},
    x=>{x.before.rules='playable-prototype-v1';},
    x=>{x.before.loop.profileVersion='tier-goals-v1';x.cues=[];x.callbackRecords=x.callbackRecords.filter(c=>c.action!=='cue');},
  ]){
    const x=waveCueFixture();mutate(x);
    await assert.rejects(()=>run(x),/wave profile and model rules disagree/,String(mutate));
  }
});

test('actual observer and audio caller accept only silent finalized current-wave result intervals',async()=>{
  const start=source.indexOf('    const noReplay=async('),end=source.indexOf('\n    const away=',start);
  assert.ok(start>=0 && end>start);
  const fixture=async(kind='hidden')=>{
    // Reduced shard9 CI39973718698 result-state rows. Bounds are inert;
    // the production observer pairs the actual model-less lifecycle shape.
    const id={load:6,timeOrigin:1792767933281.4,scope:'healthy'};
    const model={...id,action:'visibility',t:270273.19999999995,run:1,rules:'playable-prototype-v1',
      status:'Fitting',fitting:'repair',tick:0,wave:0,completedWave:0,hp:120,kills:0,locked:false,
      clockTimestamp:-1,clockPending:-1,callbackSteps:0,paused:false,failed:false,catchingUp:false};
    const state={...id,action:'session',t:270335.79999999993,sessionRun:1,profileVersion:'last-stand-waves-v1',
      phase:'result',saveState:'ready',runId:0,pendingRunId:0,activeTier:0,hasCheckpoint:false,
      tick:0,wave:0,completedWave:0,hull:120,kills:0,paused:false,cannonDamage:30};
    const before=await journey.observeRuntimePair({encounters:[model],states:[state],load:6,
      clock:async()=>({t:272510.29999999993,timeOrigin:id.timeOrigin}),
      wait:async()=>assert.fail('Already coherent idle pair must not wait'),check:(v,m)=>assert.ok(v,m)});
    const event=(type,t,focused,hidden)=>({...id,kind:type,t,focused,hidden,globalTarget:true});
    const events=kind==='hidden'?[event('blur',273181.5,false,false),event('visibilitychange',273212.29999999993,false,true),
      event('focus',279230.3999999999,true,true),event('visibilitychange',279259.79999999993,true,false)]:
      [event('blur',273181.5,false,false),event('focus',279230.3999999999,true,false)];
    return {kind,before,begin:273220,recovered:279400,ms:6000,events,cues:[],callbackRecords:[],
      encounters:[model,{...model,t:279231.1}],states:[state,{...state,t:279257}]};
  };
  const run=async x=>{
    const report={lifecycle:[]};
    const noReplay=runInNewContext(source.slice(start,end)+';noReplay',{
      validateAwayAudioReturn:journey.validateAwayAudioReturn,validateNoReplayAudio:journey.validateNoReplayAudio,
      cues:x.cues,states:x.states,encounters:x.encounters,callbackRecords:x.callbackRecords,
      reference:()=>undefined,energy:async()=>null,check:(v,m)=>assert.ok(v,m),report,
    });
    await noReplay(x.begin,x.recovered,x);return report;
  };
  for(const kind of ['hidden','blur']){
    const report=await run(await fixture(kind));
    assert.equal(report.lifecycle.length,1);assert.equal(report.lifecycle[0].boundary.callbacks.length,0);
    assert.equal(report.lifecycle[0].cues.length,0);
  }
  for(const mutate of [
    x=>x.before.status='Running',x=>x.before.wave=1,x=>x.before.tick=1,x=>x.before.locked=true,
    x=>x.before.clockTimestamp=0,x=>x.before.clockPending=0,x=>x.before.callbackSteps=1,
    x=>{delete x.before.rules;},x=>x.before.loop.phase='battle',x=>x.before.loop.runId=3,
    x=>x.before.loop.pendingRunId=3,x=>x.before.loop.activeTier=1,x=>x.before.loop.hasCheckpoint=true,
    x=>x.before.loop.sessionRun++,x=>x.before.loop.load++,x=>x.before.loop.wave=1,
    x=>x.before.loop.tick=1,x=>x.before.loop.saveState='retry',
    x=>x.encounters.at(-1).status='Running',x=>x.states.at(-1).runId=4,
    x=>x.cues.push({...x.before,t:x.begin+1,text:'ST_LS_AUDIO event=defeat\n'}),
    x=>x.cues.push({...x.before,t:x.recovered-1,text:'ST_LS_AUDIO event=cannon\n'}),
    x=>x.callbackRecords.push({...x.before,t:x.begin+1,action:'begin'}),
    x=>x.callbackRecords.push({...x.before,t:x.recovered-1,action:'cue',played:false,reason:'expired'}),
  ]){const x=await fixture();mutate(x);await assert.rejects(()=>run(x),undefined,String(mutate));}
});

test('current-wave cue decisions distinguish fresh playback from delayed diagnostic logging',()=>{
  const x=waveCueFixture();
  // Keep admission exactly at500ms while only the diagnostic emission is late.
  const begin=x.callbackRecords[0],end=x.callbackRecords.at(-1);
  for(const row of x.callbackRecords)row.previousTimestamp=begin.timestamp-.49;
  begin.elapsed=end.elapsed=.49;begin.pending=.05;
  for(const row of x.callbackRecords.filter(c=>c.action==='cue'))row.admittedAt=begin.previousTimestamp+.5;
  for(const row of x.callbackRecords.filter(c=>c.action==='cue'))row.t+=30;
  x.cues.forEach(c=>c.t+=30);x.states.at(-1).t+=30;end.t+=30;end.age=(end.t-begin.t)/1000;
  assert.equal(journey.validateAwayAudioReturn(x).boundary.callbacks.length,1);
});
test('current-wave cue decisions retain exact expired attempts including entirely silent callbacks',()=>{
  for(const all of [false,true]){
    const x=waveCueFixture(),begin=x.callbackRecords[0];
    const attempts=x.callbackRecords.filter(c=>c.action==='cue');
    for(const row of all?attempts:attempts.slice(1)){row.played=false;row.reason='expired';row.admittedAt=begin.previousTimestamp+.500001;}
    // Slow processing may finish later; admission retains the exact callback origin.
    x.callbackRecords.at(-1).age=.6;x.callbackRecords.at(-1).t+=600;x.states.at(-1).t+=550;x.recovered+=600;
    x.cues=all?[]:x.cues.slice(0,1);
    const proof=journey.validateAwayAudioReturn(x);
    assert.equal(proof.boundary.callbacks.length,1);assert.equal(proof.boundary.callbacks[0].attempts.length,2);
  }
});
test('current-wave cue decisions reject stale played, missing, forged, reordered and wrong-tick attempts',()=>{
  for(const mutate of [
    x=>{x.cues.at(-1).t=x.callbackRecords.at(-1).t+1;x.recovered=x.callbackRecords.at(-1).t+2;},
    x=>{x.cues=[];x.callbackRecords=x.callbackRecords.filter(c=>c.action!=="cue");},
    x=>x.callbackRecords.splice(1,1),x=>x.callbackRecords.splice(2,0,{...x.callbackRecords[1]}),
    x=>x.callbackRecords[1].run++,x=>x.callbackRecords[1].id++,x=>x.callbackRecords[1].ordinal=2,
    x=>x.callbackRecords[2].ordinal=1,x=>x.callbackRecords[1].tick--,x=>x.callbackRecords[1].steps++,
    x=>x.callbackRecords[1].admittedAt=x.callbackRecords[1].previousTimestamp+.500001,
    x=>x.callbackRecords[1].admittedAt=NaN,x=>x.callbackRecords[1].admittedAt=-1,
    x=>x.callbackRecords[1].admittedAt=x.callbackRecords[1].timestamp-.01,
    x=>x.callbackRecords[1].previousTimestamp--,x=>x.callbackRecords[1].cue='impact',
    x=>{x.cues=[];x.callbackRecords[1].played=false;x.callbackRecords[1].reason='expired';},
    x=>{x.callbackRecords[1].played=false;x.callbackRecords[1].reason='expired';},
  ]){const x=waveCueFixture();mutate(x);assert.throws(()=>journey.validateAwayAudioReturn(x),undefined,String(mutate));}
});
test('current-wave cue decisions bind the exact event tick inside a multi-step callback',()=>{
  const x=waveCueFixture(),begin=x.callbackRecords[0],end=x.callbackRecords.at(-1);
  x.oracle[22]={...x.oracle[21],tick:22};x.states.at(-1).tick=22;
  for(const record of x.callbackRecords)record.previousTimestamp=begin.timestamp-.1;
  begin.elapsed=end.elapsed=.1;begin.pending=.1;end.tick=22;end.steps=2;
  assert.equal(journey.validateAwayAudioReturn(x).boundary.callbacks.length,1);
  for(const attempt of x.callbackRecords.filter(c=>c.action==='cue')){attempt.tick=22;attempt.steps=2;}
  assert.throws(()=>journey.validateAwayAudioReturn(x),/exact model tick/);
});
test('fresh current-wave terminal return cues bind finalized no-payout identity for blur and hidden returns',()=>{
  for(const kind of ['blur','hidden']){
    const x=waveReturnTerminalFixture(kind),result=journey.validateAwayAudioReturn(x);
    assert.deepEqual(result.cues,[]);assert.deepEqual(result.boundary.callbacks.map(c=>[c.from,c.to]),[[5079,5080]]);
    assert.equal(result.boundary.callbacks[0].cues.at(-1).text,'ST_LS_AUDIO event=defeat\n');
  }
});
test('wave terminal identity branch cannot bypass source, checkpoint, event or callback freshness guards',()=>{
  for(const mutate of [
    x=>x.before.loop.profileVersion='tier-goals-v1',x=>x.states.at(-1).profileVersion='tier-goals-v1',
    x=>x.states.at(-1).runId=8,x=>x.states.at(-1).pendingRunId=7,x=>x.states.at(-1).hasCheckpoint=true,
    x=>x.states.at(-1).sessionRun++,x=>x.states.at(-1).activeTier++,x=>x.states.at(-1).fittingId='launcher',x=>x.encounters.at(-1).rules='other',
    x=>x.encounters.at(-1).run++,x=>x.encounters.at(-1).hp=1,x=>x.encounters.at(-1).callbackSteps++,
    x=>x.states.push({...x.states.at(-1),t:7080.05}),x=>x.cues.push({...x.cues.at(-1)}),
    x=>x.cues[0].text='ST_LS_AUDIO event=cannon\n',x=>x.cues.push({...x.cues[0],t:2000}),
    x=>x.callbackRecords.pop(),x=>x.callbackRecords[0].priorPending=.05,
    x=>x.callbackRecords.forEach(c=>{c.elapsed=.501;c.previousTimestamp=c.timestamp-.501;}),
    x=>x.callbackRecords[1].steps=11,x=>x.callbackRecords.forEach(c=>c.age=1),
  ]){const x=waveReturnTerminalFixture();mutate(x);assert.throws(()=>{const value=journey.validateAwayAudioReturn(x);
    journey.validateNoReplayAudio({energy:{samples:10,maximum_rms:0},cues:value.cues});},undefined,String(mutate));}
});

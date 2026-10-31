import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import {parseWaveOracleCsv} from '../../e2e/helpers/lastStandWaveOracle.mjs';
import {validateWaveTerminal,validateCheckpointResume} from '../../e2e/helpers/lastStandJourney.mjs';
import {idleWaveFields,abandonedWaveSave} from './lastStandWaveSaveFixtures.mjs';

// Inert observations test rejection. They never qualify a browser or grant saves.
const clone=x=>structuredClone(x);
const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('current idle wave save accepts only clock metadata changes and rejects historical or altered progression',()=>{
 const before={...idleWaveFields(),credits:2,permanentLevels:{cannonAttack:0},checkpoint:{runId:1,wave:1,
  encounter:{rulesVersion:'last-stand-waves-v1',tier:1,fitting:1}},pendingDefeat:null};
 const after=clone(before);after.revision+=2;after.research.revision+=2;after.research.lastObservedUtcMilliseconds+=15001;
 assert.equal(journey.assertWaveSavePreserved(before,after),true);
 assert.equal(journey.assertWaveSavePreserved(before,clone(before)),true);
 for(const mutate of [v=>v.version=4,v=>delete v.research,v=>v.revision=before.revision-1,
  v=>v.research.revision=0,v=>v.research.revision+=10,v=>v.research.lastObservedUtcMilliseconds=999,
  v=>v.research.completedRanks.gameSpeed=1,v=>v.research.nextProjectIdentity++,v=>v.research.completionSequence++,
  v=>v.research.slots[0].active={identity:1},v=>v.research.slots[1].queued={identity:1},
  v=>v.research.partials.scrapLogistics={},v=>v.credits++,v=>v.permanentLevels.cannonAttack++,
  v=>v.checkpoint.wave++,v=>v.history.current.closedMilliseconds++,v=>v.extra='unexplained']){
  const broken=clone(after);mutate(broken);assert.throws(()=>journey.assertWaveSavePreserved(before,broken),undefined,String(mutate));
 }
});
test('abandon records one bounded final history entry without rewards, time loss or aggregate inflation',()=>{
 const before={...idleWaveFields(),credits:2,lastFinalizedRunId:0,checkpoint:{runId:1,
  encounter:{rulesVersion:'last-stand-waves-v1',tier:1,fitting:1}},pendingDefeat:null};
 const after=abandonedWaveSave(before),final=after.history.recent.at(-1);
 final.pausedMilliseconds+=1000;final.closedMilliseconds+=2000;final.activeMilliseconds+=50;final.speedMilliseconds[1]+=50;
 after.history.lifetime.activeMilliseconds+=50;after.history.tiers[0].activeMilliseconds+=50;
 assert.equal(journey.validateWaveAbandonSave({before,after}),true);
 for(const mutate of [v=>v.credits++,v=>v.revision=before.revision,v=>v.history.current=clone(before.history.current),
  v=>v.history.recent.push(clone(v.history.recent[0])),v=>v.history.lastFinalizedRunId++,
  v=>v.history.recent[0].finishReason='defeat',v=>v.history.recent[0].highestClearedWave++,
  v=>v.history.recent[0].repeatableSalvage++,v=>v.history.recent[0].endContext='different build',
  v=>v.history.recent[0].activeMilliseconds=0,v=>v.history.recent[0].speedMilliseconds[1]++,
  v=>v.history.lifetime.runs++,v=>v.history.lifetime.milestoneSalvage++,v=>v.history.tiers[0].repeatableSalvage++]){
  const broken=clone(after);mutate(broken);assert.throws(()=>journey.validateWaveAbandonSave({before,after:broken}),undefined,String(mutate));
 }
});
test('actual foreground and background collectors select the current result transition instead of a later session row',async()=>{
 const before={load:6,timeOrigin:1000,scope:'healthy',run:1,t:10},result={...before,t:100,action:'result',phase:'result',sessionRun:1};
 const rows=[result,{...result,t:102,action:'session'},{...result,t:104,sessionRun:2},{...result,t:105,timeOrigin:2000}];
 for(const [name,saved,owner,start] of [['naturalResult','naturalSaved','terminalBefore','terminalStart'],
  ['backgroundResult','backgroundFinal','backgroundBefore','backgroundStart']]){
  const run=(until,states,load,before,start,expectedTerminal)=>journey.collectWaveResult({until,states,before,start,
    ...(name==='naturalResult'?{expectedTerminal}:{})});
  const selected=await run(async(items,index,predicate)=>items.slice(index).filter(predicate).at(-1),rows,6,before,0,{tick:5080},journey.isWaveResultFor);
  assert.equal(selected,result,'Only the genuine current-session result transition may be collected');
 }
});

test('actual hidden terminal caller records its hidden boundary before native return and refuses early visibility',async()=>{
 const before={load:6,timeOrigin:1000,scope:'healthy',run:1,t:10,tick:0},result={...before,t:100,action:'result',phase:'result',sessionRun:1};
 for(const earlyReturn of [false,true]){
  const events=[],order=[],states=[{...result,t:50,phase:'battle',action:'session'}];
  const until=async(items,start,predicate,seconds)=>{
   assert.ok(seconds>0 && seconds<=60);order.push('observe');
   states.push(result,{...result,t:102,action:'session'});
   return items.slice(start).filter(predicate).at(-1);
  };
  const away=async(kind,ms,options)=>{assert.equal(kind,'hidden');assert.ok(ms>0);order.push('hidden');
   assert.equal(typeof options?.waitHidden,'function','The hidden boundary must be observed before native return');
   if(earlyReturn)events.push({...before,t:70,kind:'visibilitychange',hidden:false,globalTarget:true});
   await options.waitHidden({before,begin:20});order.push('visible');return {};};
  const run=((away,until,states,load,backgroundBefore,backgroundStart,backgroundExpected,trace,isWaveResultFor,assertWaveStillHidden)=>journey.collectHiddenWaveResult({away,until,states,before:backgroundBefore,start:backgroundStart,expectedTerminal:backgroundExpected,trace}).then(value=>value.result));
  const work=run(away,until,states,6,before,0,{tick:5080},events,journey.isWaveResultFor,journey.assertWaveStillHidden);
  if(earlyReturn){await assert.rejects(work);assert.ok(!order.includes('visible'));}
  else {assert.equal(await work,result);assert.ok(order.indexOf('visible')<order.indexOf('observe'));}
 }
});
test('actual hidden terminal path retains throttled debt and requires deterministic completion after native return',async()=>{
 // Retained source-bound shard4 artifact12786888769 (ZIP SHA256
 // ae313f87993791e4eed2a8732a65e112c9e25a8f80988003ad4b09a8eda2de2e):
 // after 60-second callbacks, the model is still running with all debt retained.
 const identity={load:6,timeOrigin:1793153951722.9,scope:'healthy'},before={...identity,run:1,t:10971.6,tick:24};
 const deferred={...identity,t:310383.2,action:'session',phase:'battle',sessionRun:1,tick:1764,
  saveState:'ready',paused:false,clockPending:212.40899999999783};
 const states=[deferred],trace=[{...identity,t:13164.5,kind:'visibilitychange',hidden:true,focused:false,globalTarget:true}];
 const result={...deferred,t:338000,action:'result',phase:'result',tick:0},order=[];
 const until=async(items,start,predicate,seconds)=>{
  assert.ok(seconds>0 && seconds<=60);order.push('observe');
  const found=items.slice(start).filter(predicate).at(-1);
  if(!found)throw new Error('Expected real runtime observation absent: throttled hidden callbacks retain debt');
  return found;
 };
 const away=async(kind,ms,options)=>{
  assert.equal(kind,'hidden');assert.ok(ms>250000);order.push('hidden');
  await options.waitHidden({before,begin:13165});
  order.push('native-return');trace.push({...trace[0],t:327542.5,hidden:false,focused:true});
  states.push(result);return {before,begin:13165,recovered:327618,ms,events:trace};
 };
 const run=((away,until,states,load,backgroundBefore,backgroundStart,backgroundExpected,trace,isWaveResultFor,assertWaveStillHidden)=>journey.collectHiddenWaveResult({away,until,states,before:backgroundBefore,start:backgroundStart,expectedTerminal:backgroundExpected,trace}).then(value=>value.result));
 assert.equal(await run(away,until,states,6,before,0,{tick:5080},trace,journey.isWaveResultFor,
  journey.assertWaveStillHidden),result);
 assert.deepEqual(order,['hidden','native-return','observe']);
});
test('actual away owner verifies the hidden boundary after its minimum interval and before native return',async()=>{
 const order=[],before={t:10,load:1,timeOrigin:1000,scope:'healthy'},trace=[];
 const page={bringToFront:async()=>order.push('original-front'),waitForFunction:async()=>{},waitForTimeout:async()=>order.push('minimum-away')};
 const other={goto:async()=>{},bringToFront:async()=>order.push('hidden'),isClosed:()=>false,close:async()=>order.push('closed')};
 const native={context:{newPage:async()=>other}},report={},marks=[20,100];
 const away=(kind,ms,options)=>journey.runJourneyAway({trace,observation:async()=>before,page,host:'linux',
   check:(condition,message)=>assert.ok(condition,message),native,report,mark:async()=>marks.shift(),
   noReplay:async()=>order.push('audio')},kind,ms,options);
 await away('hidden',60,{waitHidden:async()=>order.push('result')});
 assert.deepEqual(order.slice(0,5),['original-front','hidden','minimum-away','result','original-front']);
});
test('actual background terminal collector retains native edges from its verified model observation',()=>{
 const before={load:6,timeOrigin:1000,scope:'healthy',t:100},trace=[
  {...before,t:105,kind:'visibilitychange',hidden:true,globalTarget:true},
  {...before,t:106,kind:'visibilitychange',hidden:false,globalTarget:true},
  {...before,t:108,kind:'visibilitychange',hidden:true,globalTarget:true}];
 const context={backgroundBefore:before,terminalAway:{before:{...before,t:107},recovered:200,events:trace.slice(2)},trace,
  backgroundResult:{},backgroundFinal:{},states:[],encounters:[],layouts:[],callbackRecords:[],cues:[],backgroundOracle:{},
  validateWaveTerminal:()=>({before}),validateBackgroundWaveTerminal:()=>({}),waveIntervalEvents:journey.waveIntervalEvents};
 const run=context=>{journey.retainHiddenWaveTerminal({interval:context.terminalAway,before:context.backgroundBefore,
  proof:context.validateWaveTerminal(),trace:context.trace,callbackRecords:context.callbackRecords,states:context.states,
  cues:context.cues,validateContinuation:context.validateBackgroundWaveTerminal});return context.terminalAway;};
 const interval=run(context);assert.deepEqual(interval.before,before);assert.deepEqual(interval.events,trace);
});
function csv(){return Buffer.from([1,2].flatMap(tier=>['repair','launcher','scattergun'].flatMap(fitting=>[20,30,40,50].flatMap(damage=>[
 `${tier},${fitting},${damage},0,120,0,0,0,0,0,0,0,0,0,1,0,Running`,
 `${tier},${fitting},${damage},1,120,1,1,1,0,0,0,0,0,0,2,1,Running`,
 `${tier},${fitting},${damage},2,0,1,2,1,0,0,0,1,0,1,2,1,Defeated`,
]))).join('\r\n')+'\r\n');}
test('fresh wave oracle rejects malformed, incomplete and contradictory output',()=>{
 const valid=csv();assert.equal(Object.keys(parseWaveOracleCsv(valid)).length,24);
 for(const bad of [valid.subarray(0,-2),Buffer.from(valid.toString().replace('repair','unknown')),
   Buffer.from(valid.toString().replace(',120,0,0,',',120,1,0,')),
   Buffer.from(valid.toString().replace(',1,120,',',2,120,')),
   Buffer.from(valid.toString().replace(',0,120,',',0,9007199254740992,')),
   Buffer.from(valid.toString().replace(',2,0,',',2,1,')),
   Buffer.from(valid.toString().replace(',2,1,Running',',9,1,Running')),
   Buffer.from(valid.toString().split('\r\n').slice(3).join('\r\n'))])assert.throws(()=>parseWaveOracleCsv(bad));
});
function terminal(){
 const id={load:4,timeOrigin:1000,scope:'healthy'};
 const state={...id,t:102,action:'session',phase:'battle',runId:3,sessionRun:2,pendingRunId:0,
  tick:1,hull:10,kills:2,wallet:5,completedWave:1,hasCheckpoint:true,saveState:'ready'};
 const row={...id,t:100,action:'tick',run:2,tick:1,hp:10,kills:2,spawned:3,cannon:2,launcher:0,
  healed:0,closeHits:1,rangedHits:0,alive:1,wave:2,completedWave:1,status:'Running',paused:false,failed:false,catchingUp:false};
 const end={...row,t:200,action:'terminal',tick:2,hp:0,status:'Defeated',closeHits:2};
 const staged={...state,t:201,action:'defeat-staged',phase:'settling',runId:0,tick:2,hull:0,hasCheckpoint:false};
 const result={...staged,t:800,action:'result',phase:'result',tick:0};
 const layout={...id,t:200.5,phase:'settling',controls:[{name:'Claim',active:false,interactable:false}]};
 return {before:{...row,hull:10,loop:state},result,saved:{...idleWaveFields({runId:3,finalized:true}),checkpoint:null,pendingDefeat:null,lastFinalizedRunId:3,credits:5},
  states:[state,staged,result],encounters:[row,end],layouts:[layout],oracle:{1:row,2:end}};
}
test('natural wave terminal proof rejects changed identities, fabricated rows and duplicate payout',()=>{
 assert.doesNotThrow(()=>validateWaveTerminal(terminal()));
 const mutate=[v=>v.before.tick++,v=>v.before.loop.wallet++,v=>v.result.scope='other',v=>v.result.sessionRun++,
  v=>v.result.action='claim',v=>v.states=v.states.slice(0,-1),v=>v.encounters.shift(),v=>v.encounters.push(clone(v.encounters[1])),
  v=>v.encounters[1].paused=true,v=>v.encounters[1].catchingUp=true,v=>v.encounters[1].failed=true,
  v=>v.encounters[1].t=99,v=>v.saved.credits++,v=>v.saved.checkpoint={},v=>v.saved.lastFinalizedRunId++,
  v=>v.saved.pendingDefeat={reward:1},v=>v.states[1].wallet++,v=>v.layouts[0].controls[0]={name:'Claim',active:true,interactable:true},
  v=>v.states[1].hasCheckpoint=true,v=>v.layouts[0].scope='other'];
 for(const [i,change]of mutate.entries()){const value=terminal();change(value);assert.throws(()=>validateWaveTerminal(value),'Invalid terminal '+i);}
});
test('resume evidence requires fresh paused state, same document and immutable saved state',()=>{
 const e={hull:90,tick:250,kills:6,tier:1,fitting:1,rulesVersion:'last-stand-waves-v1',completedWave:1,committedCannonDamage:20};
 const saved={...idleWaveFields({runId:3}),credits:1,checkpoint:{runId:3,encounter:e}};
 const resumed={load:3,timeOrigin:100,t:1000,action:'resume',phase:'battle',saveState:'ready',runId:3,activeTier:1,fittingId:'repair',
  profileVersion:e.rulesVersion,hasCheckpoint:true,checkpointBlocked:false,checkpointWave:1,completedWave:1,wave:2,
  tick:250,hull:90,kills:6,cannonDamage:20,wallet:1,pendingRunId:0,paused:true,speed:0};
 const value={saved,resumed,stable:{...resumed,t:2200,action:'menu'},stored:clone(saved),observedClock:{timeOrigin:100,t:2210}};
 assert.doesNotThrow(()=>validateCheckpointResume(value));
 for(const change of [v=>v.stable.t=1000,v=>v.stable.tick++,v=>v.resumed.hull++,v=>v.stored.credits++,
  v=>v.stable.timeOrigin++,v=>v.observedClock.timeOrigin++,v=>v.stable.paused=false,v=>v.resumed.action='deploy']){
  const broken=clone(value);change(broken);assert.throws(()=>validateCheckpointResume(broken));
 }
});


test('terminal payout binds the final same-session completed wave even on a simultaneous clear',()=>{
 const make=()=>{
  const value=terminal();value.encounters[1].completedWave=2;
  const bank={...value.states[0],t:199,action:'wave-committed',completedWave:2,wallet:6};value.states.splice(1,0,bank);
  value.states.find(s=>s.action==='defeat-staged').wallet=6;value.result.wallet=6;value.saved.credits=6;
  return value;
 };
 assert.doesNotThrow(()=>validateWaveTerminal(terminal()),'Unchanged-wave before.loop fallback remains valid');
 assert.doesNotThrow(()=>validateWaveTerminal(make()),'Actual same-session final-wave bank is admissible');
 for(const mutate of [
  v=>v.states=v.states.filter(s=>s.action!=='wave-committed'),
  v=>v.states.find(s=>s.action==='wave-committed').sessionRun++,
  v=>v.states.find(s=>s.action==='wave-committed').completedWave--,
  v=>v.states.find(s=>s.action==='wave-committed').scope='other',
  v=>v.states.find(s=>s.action==='wave-committed').t=210,
  v=>{v.states.find(s=>s.action==='defeat-staged').wallet=999;v.result.wallet=999;v.saved.credits=999;},
 ]){const value=make();mutate(value);assert.throws(()=>validateWaveTerminal(value),undefined,String(mutate));}
});

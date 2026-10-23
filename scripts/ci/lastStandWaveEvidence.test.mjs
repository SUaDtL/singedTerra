import assert from 'node:assert/strict';
import test from 'node:test';
import {parseWaveOracleCsv} from '../../e2e/helpers/lastStandWaveOracle.mjs';
import {validateWaveTerminal,validateCheckpointResume} from '../../e2e/helpers/lastStandJourney.mjs';

// Inert observations test rejection. They never qualify a browser or grant saves.
const clone=x=>structuredClone(x);
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
 return {before:{...row,hull:10,loop:state},result,saved:{version:4,checkpoint:null,pendingDefeat:null,lastFinalizedRunId:3,credits:5},
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
 const saved={version:4,credits:1,checkpoint:{runId:3,encounter:e}};
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {admitSkillsFixtures,admitCombatFixture,assertOneSkillDraw,skillInputBinding,audioCueIdentity,skillActivationCues,clickFreshState} from '../last-stand-skills-journey.mjs';

const keys=['overdrive','emergencyRepairs','minefield','reinforcedHull','ballistics','reactiveLining'];
function profile(){return {version:9,credits:100,skills:{intel:1,copies:[0,0,0,0,0,0],loadout:[],firstAwards:[]},
  checkpoint:null,loadoutPresets:[null,null,null],tierRecords:{'tier-1':{bestWave:25},'tier-2':{unlocked:false}}};}
function fixtures(){
  const fresh=profile();fresh.skills.intel=0;fresh.tierRecords['tier-1'].bestWave=0;
  const eligible=profile(),collection=profile();collection.skills.copies=[1,1,1,1,1,1];collection.skills.loadout=keys.slice(0,3);
  collection.tierRecords['tier-1'].bestWave=500;collection.tierRecords['tier-2'].unlocked=true;
  collection.loadoutPresets[1]={name:'Passive',skills:keys.slice(3)};
  return {kind:'isolated-skills-review-fixtures',saveVersion:9,scope:'Development fixtures, not earned-player balance proof.',
    profiles:Object.fromEntries(Object.entries({fresh,eligible,collection}).map(([key,value])=>[key,JSON.stringify(value)]))};
}

test('Skills journey admits explicit isolated fixtures and refuses misleading seed shapes',()=>{
  assert.equal(admitSkillsFixtures(fixtures()),true);
  for(const alter of [f=>f.kind='earned-player-run',f=>f.saveVersion=8,f=>f.scope='Earned live acceptance',
    f=>{const p=JSON.parse(f.profiles.collection);p.checkpoint={runId:1};f.profiles.collection=JSON.stringify(p);},
    f=>{const p=JSON.parse(f.profiles.eligible);p.skills.intel=2;f.profiles.eligible=JSON.stringify(p);}]){
    const invalid=fixtures();alter(invalid);assert.throws(()=>admitSkillsFixtures(invalid));
  }
  const saved=profile();saved.skills.copies=[1,1,1,1,1,1];saved.skills.loadout=['overdrive','minefield','emergencyRepairs'];
  saved.tierRecords['tier-2'].unlocked=true;saved.selectedFitting='repair';saved.secondaryFitting=null;saved.permanentLevels={fieldRepair:0};
  const combat={kind:'isolated-skills-combat-review-fixture',saveVersion:9,scope:'Gifted development fixture with ordinary baseline 3 HP repair',profile:JSON.stringify(saved),
    preflight:{mode:'production-model-natural-damage',spentMask:7,survived:true,firstDamageSimulatedMilliseconds:56100}};
  assert.deepEqual(admitCombatFixture(combat),saved);
  for(const alter of [p=>p.checkpoint={runId:1},p=>p.skills.loadout=keys.slice(0,3),p=>p.secondaryFitting='repair',p=>p.tierRecords['tier-2'].unlocked=false]){
    const invalid=structuredClone(saved);alter(invalid);assert.throws(()=>admitCombatFixture({...combat,profile:JSON.stringify(invalid)}));
  }
});

test('Skills journey requires exactly one eligible copy and one Intel debit',()=>{
  const before=profile(),after=structuredClone(before);after.skills.intel=0;after.skills.copies[3]=1;
  assert.equal(assertOneSkillDraw(before,after,[0,3]),3);
  for(const alter of [p=>p.skills.intel=1,p=>p.skills.copies[3]=2,p=>p.skills.copies[0]=1,
    p=>{p.skills.copies[3]=0;p.skills.copies[1]=1;},p=>p.skills.loadout=['reinforcedHull'],
    p=>p.skills.firstAwards=['tier-1:skills-25'],p=>p.credits--,
    p=>p.loadoutPresets[0]={name:'Changed'}]){
    const invalid=structuredClone(after);alter(invalid);assert.throws(()=>assertOneSkillDraw(before,invalid,[0,3]));
  }
});

test('Skills journey binds Q/E/R to actual equipped slot order including passive slots',()=>{
  const reordered=['overdrive','minefield','emergencyRepairs'];
  assert.deepEqual(skillInputBinding(reordered,'emergencyRepairs'),{slot:2,key:'r',control:'CombatSkill2'});
  assert.deepEqual(skillInputBinding(reordered,'minefield'),{slot:1,key:'e',control:'CombatSkill1'});
  assert.deepEqual(skillInputBinding(['reinforcedHull','overdrive','ballistics'],'overdrive'),{slot:1,key:'e',control:'CombatSkill1'});
  assert.deepEqual(reordered,['overdrive','minefield','emergencyRepairs'],'Binding must not sort the captured loadout');
  assert.throws(()=>skillInputBinding(reordered,'reinforcedHull'));
  assert.throws(()=>skillInputBinding(['overdrive','overdrive'],'overdrive'));
  assert.throws(()=>skillInputBinding(['minefield'],'overdrive'));
});

test('Skills audio witness accepts one Unity line ending but requires exact cue identity',()=>{
  for(const ending of ['', '\n', '\r\n'])assert.equal(audioCueIdentity('skill-overdrive'+ending),'skill-overdrive');
  for(const invalid of ['other-skill-overdrive\n','skill-overdrive-extra\n',' skill-overdrive\n','skill-overdrive \n','skill-overdrive\n\n','SKILL-OVERDRIVE\n'])
    assert.notEqual(audioCueIdentity(invalid),'skill-overdrive');
  assert.throws(()=>audioCueIdentity(null));
  assert.deepEqual(skillActivationCues(['skill-overdrive\n','skill-repairs','skill-mines-armed\r\n','skill-minefield\n']),
    ['skill-overdrive','skill-repairs','skill-mines-armed'],'A delayed armed-mine detonation is not a second activation');
  assert.deepEqual(skillActivationCues(['skill-minefield\n','skill-mines-armed-extra\n',' skill-overdrive\n']),[]);
});

test('Skills state witnesses require a fresh action and current durable values across later observations',async()=>{
  async function scenario(newPackets,expectedSuccess){
    const states=[{action:'saved',value:3}],calls=[];
    const actor={run:{states},state:()=>states.at(-1),click:async(name)=>{calls.push(name);states.push(...newPackets);},
      until:async predicate=>{if(!predicate())throw new Error('No admitted new transition');}};
    const result=clickFreshState(actor,'Apply',s=>s.action==='saved',{},s=>s.value===3);
    if(expectedSuccess)await result;else await assert.rejects(result,/No admitted new transition/);
    assert.deepEqual(calls,['Apply'],'Observing a state never replays the input');
  }
  await scenario([{action:'saved',value:3},{action:'research',value:3}],true);
  await scenario([{action:'research',value:3}],false);
  await scenario([{action:'saved',value:3},{action:'research',value:2}],false);
  await scenario([],false);
});

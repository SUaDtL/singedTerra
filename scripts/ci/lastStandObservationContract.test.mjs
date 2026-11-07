import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWaveOracleCsv} from '../../e2e/helpers/lastStandWaveOracle.mjs';
import {validateWaveResume} from '../../e2e/helpers/lastStandWaveJourney.mjs';
import {validateModelObservation} from '../../e2e/helpers/lastStandJourney.mjs';
import {idleWaveFields} from './lastStandWaveSaveFixtures.mjs';

// Invented reader inputs exercise admission only; never player evidence.
function currentCsv(){return Buffer.from([1,2,3,4].flatMap(tier=>
  ['repair','launcher','scattergun','mortar','railgun'].flatMap(fitting=>[20,30,40,50].map(damage=>
    `${tier},${fitting},${damage},0,120,0,0,0,0,0,0,0,0,0,1,0,0,0,18,40,1,1,Running`))).join('\r\n')+'\r\n');}
test('current source oracle admits all four tiers and five armaments with explicit shot counters',()=>{
  const bytes=currentCsv(),profiles=parseWaveOracleCsv(bytes);
  assert.equal(Object.keys(profiles).length,80);
  assert.equal(profiles['4:railgun:50'][0].mortar,0);
  assert.equal(profiles['4:railgun:50'][0].railgun,0);
  for(const bad of [Buffer.from(bytes.toString().replace('mortar','unknown')),
    Buffer.from(bytes.toString().split('\r\n').slice(1).join('\r\n')),
    Buffer.from(bytes.toString().replace(',18,40,1,1,Running',',-1,40,1,1,Running'))])assert.throws(()=>parseWaveOracleCsv(bad));
});
function currentResume(){
  const keys=['cannonAttack','launcherAttack','hullCapacity','armor','cannonCycle','fieldRepair','scattergunAttack','scrapYield','mortarAttack','railgunAttack'];
  const levels=Object.fromEntries(keys.map(key=>[key,0]));
  const e={rulesVersion:'last-stand-waves-v2',tier:4,fitting:4,wave:1,completedWave:1,tick:201,hull:114,kills:6,
    committedCannonDamage:20,mortarShots:0,railgunShots:3,nextMortarTick:1,nextRailgunTick:240,mortarDamage:18,railgunDamage:40};
  const shop={version:3,economyVersion:'combat-depth-economy-v4',runId:1,fitting:4,tier:4,uniqueKills:6,
    earnedScrap:18,spentScrap:0,scrap:18,permanentLevels:levels,runPurchases:{...levels}};
  const saved={...idleWaveFields(),version:6,credits:1,checkpoint:{runId:1,contentVersion:'last-stand-content-v2',encounter:e,shop}};
  const state={phase:'battle',saveState:'ready',runId:1,activeTier:4,profileVersion:e.rulesVersion,
    contentVersion:'last-stand-content-v2',economyVersion:shop.economyVersion,wave:2,completedWave:1,checkpointWave:1,
    hasCheckpoint:true,checkpointBlocked:false,tick:201,hull:114,kills:6,cannonDamage:20,fittingId:'railgun',paused:true,speed:0,wallet:1,
    mortarShots:e.mortarShots,railgunShots:e.railgunShots,mortarDamage:e.mortarDamage,railgunDamage:e.railgunDamage};
  return {saved,afterResume:state,stable:{...state},afterStored:structuredClone(saved),shop:{mode:'Run',runId:1,
    uniqueKills:6,earnedScrap:18,spentScrap:0,scrap:18,cards:keys.map(key=>({key,p:0,n:0}))}};
}
test('expanded resume binds all three edition identities and preserves the new ledger',()=>{
  assert.doesNotThrow(()=>validateWaveResume(currentResume()));
  for(const mutate of [v=>v.afterResume.contentVersion='last-stand-content-v1',v=>v.stable.economyVersion='research-farming-economy-v3',
    v=>{v.saved.checkpoint.shop.economyVersion='research-farming-economy-v3';v.afterStored=structuredClone(v.saved);},
    v=>{delete v.saved.checkpoint.encounter.railgunShots;v.afterStored=structuredClone(v.saved);},v=>v.stable.fittingId='mortar']){
    const value=currentResume();mutate(value);assert.throws(()=>validateWaveResume(value));
  }
});
test('the archive envelope cannot hide current rules or omit current weapon state',()=>{
  for(const mutate of [v=>{},v=>{v.saved.checkpoint.contentVersion='unknown';v.saved.checkpoint.shop.economyVersion='unknown';},
    v=>delete v.saved.checkpoint.encounter.railgunShots]){
    const value=currentResume();value.saved.version=5;mutate(value);value.afterStored=structuredClone(value.saved);
    assert.throws(()=>validateWaveResume(value),'Version5 only describes the retained edition');
  }
});
test('current checkpoint weapons match actual resumed observations and reject impossible scalar values',()=>{
  for(const mutate of [v=>v.saved.checkpoint.encounter.railgunShots=999,v=>v.saved.checkpoint.encounter.mortarDamage=0,
    v=>v.saved.checkpoint.encounter.nextRailgunTick=0,v=>v.stable.railgunShots++,v=>v.stable.mortarDamage++]){
    const value=currentResume();mutate(value);value.afterStored=structuredClone(value.saved);
    assert.throws(()=>validateWaveResume(value));
  }
});
test('actual model observations cannot omit or forge newly emitted armament counters',()=>{
  const model={tick:1,hp:120,kills:0,spawned:1,cannon:0,launcher:0,scattergun:0,mortar:0,railgun:1,
    healed:0,closeHits:0,rangedHits:0,alive:1,status:'Running',wave:1,completedWave:0};
  assert.doesNotThrow(()=>validateModelObservation(model,{1:model}));
  for(const key of ['scattergun','mortar','railgun']){
    const changed={...model,[key]:model[key]+1};assert.throws(()=>validateModelObservation(changed,{1:model}));
    delete changed[key];assert.throws(()=>validateModelObservation(changed,{1:model}));
  }
});
test('the current compiled oracle refuses mixed rules, content or economy observations',()=>{
  const oracle=parseWaveOracleCsv(currentCsv(),{format:2})['4:railgun:50'];
  const model={...oracle[0],rules:'last-stand-waves-v2:storm-foundry'};
  assert.doesNotThrow(()=>validateModelObservation(model,oracle));
  for(const change of [{rules:'last-stand-waves-v1:storm-foundry'},{contentVersion:'last-stand-content-v1'},
    {economyVersion:'research-farming-economy-v3'},{railgun:1}])
    assert.throws(()=>validateModelObservation({...model,...change},oracle));
  assert.throws(()=>parseWaveOracleCsv(currentCsv(),{format:1}));
});

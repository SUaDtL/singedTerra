import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWaveOracleCsv,CURRENT_WAVE_EDITION,COMBAT_DEPTH_WAVE_EDITION} from '../../e2e/helpers/lastStandWaveOracle.mjs';
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

function buildcraftCsv(){return Buffer.from([1,2,3,4,5,6].flatMap(tier=>
  ['repair','launcher','scattergun','mortar','railgun','arc','shield'].flatMap(fitting=>[20,30,40,50].map(damage=>
    [tier,fitting,damage,0,120,0,0,0,0,0,0,0,0,0,1,0,0,0,18,40,1,1,0,16,fitting==='shield'?60:0,fitting==='shield'?60:0,0,0,1,20,0,'Running'].join(',')))).join('\r\n')+'\r\n');}
test('format3 maps exactly six tiers and seven fittings and binds observed Arc/shield state',()=>{
  const bytes=buildcraftCsv(),profiles=parseWaveOracleCsv(bytes,{format:3});assert.equal(Object.keys(profiles).length,168);
  const oracle=profiles['6:shield:50'],model={...oracle[0],rules:'last-stand-waves-v3:storm-foundry'};
  assert.equal(model.shield,60);assert.doesNotThrow(()=>validateModelObservation(model,oracle));
  for(const key of ['arc','arcDamage','shield','shieldCapacity','shieldRestored','shieldAbsorbed','armorPiercing','areaControl','fieldEngineering']){
    assert.throws(()=>validateModelObservation({...model,[key]:model[key]+1},oracle));
    const missing={...model};delete missing[key];assert.throws(()=>validateModelObservation(missing,oracle));
  }
  for(const options of [{format:2},{edition:COMBAT_DEPTH_WAVE_EDITION},{edition:{...CURRENT_WAVE_EDITION,rulesVersion:'last-stand-waves-v4'}}])
    assert.throws(()=>parseWaveOracleCsv(bytes,options));
  assert.throws(()=>parseWaveOracleCsv(Buffer.from(bytes.toString().split('\r\n').slice(1).join('\r\n'))));
  assert.throws(()=>parseWaveOracleCsv(Buffer.from(bytes.toString().replace(',60,60,0,0,1,20,0,Running',',61,60,0,0,1,20,0,Running'))));
});
function buildcraftResume(){
  const value=currentResume(),saved=value.saved,cp=saved.checkpoint;
  saved.version=8;saved.research.catalogVersion='research-v2';saved.research.slots.push({active:null,queued:null});
  for(const key of ['armorPiercing','areaControl','fieldEngineering']){saved.research.completedRanks[key]=0;saved.research.partials[key]=null;}
  cp.contentVersion='last-stand-content-v3';Object.assign(cp.encounter,{rulesVersion:'last-stand-waves-v3',tier:6,fitting:1,railgunShots:0});
  Object.assign(cp.shop,{economyVersion:'buildcraft-economy-v5',tier:6,fitting:1});
  for(const key of ['arcOutput','shieldCapacity']){cp.shop.permanentLevels[key]=0;cp.shop.runPurchases[key]=0;value.shop.cards.push({key,p:0,n:0});}
  cp.loadout={primary:'repair',secondary:'shield'};cp.combatResearch={armorPiercing:0,areaControl:0,fieldEngineering:0};
  cp.buildcraft={arcShots:0,nextArcTick:1,arcDamage:16,shield:60,shieldCapacity:60,shieldRestored:0,shieldAbsorbed:0,nextShieldRechargeTick:220,lastShieldHitTick:0};
  for(const state of [value.afterResume,value.stable])Object.assign(state,{profileVersion:'last-stand-waves-v3',contentVersion:cp.contentVersion,economyVersion:cp.shop.economyVersion,
    activeTier:6,fittingId:'repair',activeSecondaryId:'shield',railgunShots:0,arcShots:0,arcDamage:16,shield:60,shieldCapacity:60});
  value.afterStored=structuredClone(saved);return value;
}
test('profile8 resume requires exact captured build, new state and research while retaining profile7',()=>{
  assert.doesNotThrow(()=>validateWaveResume(currentResume()));assert.doesNotThrow(()=>validateWaveResume(buildcraftResume()));
  for(const mutate of [v=>v.saved.version=7,v=>v.saved.version=9,v=>delete v.saved.checkpoint.loadout,
    v=>v.saved.checkpoint.loadout.secondary='repair',v=>v.saved.checkpoint.combatResearch.areaControl=21,
    v=>v.saved.checkpoint.combatResearch.areaControl=1,v=>v.saved.checkpoint.buildcraft.extra=1,
    v=>delete v.saved.checkpoint.buildcraft.shieldAbsorbed,v=>v.saved.checkpoint.buildcraft.shield=61,
    v=>v.saved.checkpoint.encounter.tier=7,v=>v.saved.research.catalogVersion='research-v3',
    v=>v.stable.activeSecondaryId='',v=>v.stable.arcDamage++,v=>v.stable.shield++]){
    const value=buildcraftResume();mutate(value);value.afterStored=structuredClone(value.saved);assert.throws(()=>validateWaveResume(value));
  }
});

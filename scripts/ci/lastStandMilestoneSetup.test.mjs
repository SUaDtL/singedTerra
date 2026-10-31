import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {assertCombatCaptureSave} from '../last-stand-combat-feedback.mjs';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';
import * as milestones from '../last-stand-wave-milestones.mjs';
import {MILESTONE_FIXTURE_SOURCES,admitMilestoneFixtures} from '../last-stand-wave-milestones.mjs';
import {assertDependencyFreeWaveGuards} from './lastStandDependencyFreeFixture.mjs';
import {idleWaveFields} from './lastStandWaveSaveFixtures.mjs';

const checkpoint=(wave=99,legacy=false)=>({runId:1,contentVersion:legacy?'last-stand-content-v1':'last-stand-content-v2',
  encounter:{rulesVersion:legacy?'last-stand-waves-v1':'last-stand-waves-v2',tier:1,fitting:1,completedWave:wave,
    ...(legacy?{}:{mortarShots:0,railgunShots:0,nextMortarTick:1,nextRailgunTick:1,mortarDamage:18,railgunDamage:40})},
  shop:{economyVersion:legacy?'research-farming-economy-v3':'combat-depth-economy-v4'}});
const save=(wave=99,legacy=false)=>({version:6,credits:2,checkpoint:checkpoint(wave,legacy),pendingDefeat:null,permanentLevels:{cannonAttack:0}});

function milestoneCaller(saved,expected){
  const raw=Buffer.from(JSON.stringify(saved)),next=Buffer.from(JSON.stringify(expected));
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  return milestones.readMilestoneFixtureSaves({savePath:'before',expectedSavePath:'after',saveSha256:sha(raw),expectedSaveSha256:sha(next),targetWave:100},
    {readFile:path=>path==='before'?raw:next});
}
async function combatSaveCaller(saved,{baseline=false,wallet=saved.credits}={}){
  return assertCombatCaptureSave({baseline,page:{evaluate:async()=>saved},state:()=>({wallet})});
}
async function milestoneReadbackCaller(before,actual,{afterWave=false,saved=before,item,fixture}={}){
  if(afterWave)return milestones.assertMilestoneCompletedReadback({saved,expected:before,actual,item,fixture});
  return milestones.assertMilestoneResumeReadback({saved,state:()=>({tick:before.checkpoint.encounter.tick,hull:before.checkpoint.encounter.hull}),
    page:{evaluate:async()=>JSON.stringify(actual)},key:'inert'});
}

function timedMilestone(){
  const saved={...idleWaveFields({wave:99}),...save(),unlockedFittings:['launcher','repair'],firstClears:[]};
  saved.research.lastObservedUtcMilliseconds=10000;
  Object.assign(saved.checkpoint.encounter,{tick:100,hull:100});
  Object.assign(saved.checkpoint.shop,{purchaseSequence:5,runPurchases:{cannonAttack:2}});
  const expected=structuredClone(saved);expected.checkpoint.encounter.tick=120;
  expected.checkpoint.encounter.completedWave=100;expected.history.current.highestClearedWave=100;
  const actual=structuredClone(expected);actual.revision+=2;actual.research.revision++;
  actual.research.lastObservedUtcMilliseconds=12400;actual.checkpoint.shop.purchaseSequence+=3;
  actual.history.current.activeMilliseconds+=1000;actual.history.current.speedMilliseconds[1]+=1000;
  actual.history.current.pausedMilliseconds+=220;actual.history.current.closedMilliseconds+=1050;
  const state=(action,t,tick,paused)=>({action,t,timeOrigin:11000,runId:1,phase:'battle',saveState:'ready',tick,
    speed:paused?0:1,paused,completedWave:tick>=120?100:99,checkpointWave:tick>=120?100:99});
  const states=[{...state('ready',100,0,false),phase:'workshop'},state('session',195,100,true),
    state('resume',200,100,true),state('session',420,100,false),state('speed',430,100,false),
    state('wave-committed',1440,120,false),state('speed',1600,124,true)];
  const input=[170,180,390,400,1570,1580].map((t,n)=>({kind:n%2?'pointerup':'pointerdown',t,
    timeOrigin:11000,trusted:true,target:'unity-canvas',x:10,y:20}));
  const actions=['Redeploy','SpeedRate','SpeedRate'].map((name,n)=>({name,inputStart:n*2,inputEnd:n*2+2,x:10,y:20}));
  return {saved,expected,actual,fixture:{nextWaveTicks:20,targetWave:100},item:{states,input,actions}};
}

test('actual milestone completion validates observed history time without weakening saved fields',async()=>{
  const invoke=x=>milestoneReadbackCaller(x.expected,x.actual,{afterWave:true,...x});
  const good=timedMilestone();await invoke(good);
  for(const mutate of [x=>x.actual.history.current.activeMilliseconds++,
    x=>x.actual.history.current.activeMilliseconds=-1,x=>x.actual.history.current.pausedMilliseconds=100000,
    x=>x.actual.history.current.pausedMilliseconds=0,x=>x.actual.history.current.closedMilliseconds=0,
    x=>x.actual.history.current.closedMilliseconds=100000,x=>x.actual.history.current.speedMilliseconds[1]++,
    x=>{x.actual.history.current.speedMilliseconds[1]--;x.actual.history.current.speedMilliseconds[0]++;},
    x=>x.actual.history.current.speedMilliseconds.pop(),x=>x.actual.history.current.closedMilliseconds=1050.5,
    x=>x.actual.history.current.runId++,x=>x.actual.history.current.repeatableSalvage++,
    x=>x.actual.history.current.startContext='forged',x=>x.actual.history.lifetime.activeMilliseconds++,
    x=>x.actual.history.recent.push({}),x=>x.actual.credits++,x=>x.actual.checkpoint.encounter.hull--,
    x=>x.actual.permanentLevels.cannonAttack++,x=>x.actual.research.completedRanks.gameSpeed++,
    x=>x.actual.research.revision=x.actual.revision+1,x=>x.actual.research.lastObservedUtcMilliseconds=0,
    x=>x.actual.checkpoint.shop.purchaseSequence=1,
    x=>x.item.states=x.item.states.filter(s=>s.action!=='wave-committed'),
    x=>x.item.states.push({...x.item.states.find(s=>s.action==='wave-committed')}),
    x=>x.item.states.find(s=>s.action==='wave-committed').tick++,
    x=>x.item.states.find(s=>s.action==='wave-committed').runId++,
    x=>x.item.states[3].speed=2,x=>x.item.states[3].paused=true,
    x=>x.item.states[3].timeOrigin++,x=>x.item.states[5].t=1000,
    x=>x.item.states[5].t=NaN,x=>x.item.input[3].trusted=false,
    x=>x.item.input[3].timeOrigin++,x=>x.item.actions[1].name='Other',
    x=>x.fixture.nextWaveTicks++,x=>x.expected.history.current.activeMilliseconds++]){
    const bad=timedMilestone();mutate(bad);await assert.rejects(invoke(bad),String(mutate));
  }
});

test('actual milestone timing rejects paused-prefix activity and invalid committed tick progress',async()=>{
  const invoke=x=>milestoneReadbackCaller(x.expected,x.actual,{afterWave:true,...x});
  await invoke(timedMilestone());
  for(const mutate of [s=>s.tick++,s=>s.phase='workshop',s=>s.saveState='blocked',
    s=>s.tick=-1,s=>s.tick=NaN,s=>s.tick+=.5]){
    const x=timedMilestone(),row={...x.item.states[2],action:'session',t:300};
    mutate(row);x.item.states.splice(3,0,row);
    await assert.rejects(invoke(x),'Invalid paused prefix: '+mutate);
  }
  for(const tick of [99,121,100.5]){
    const x=timedMilestone();x.item.states.splice(5,0,{...x.item.states[3],t:700,tick});
    await assert.rejects(invoke(x),'Invalid active tick progression: '+tick);
  }
  const x=timedMilestone();x.item.states.splice(5,0,{...x.item.states[3],t:700,tick:110},
    {...x.item.states[3],t:800,tick:109});
  await assert.rejects(invoke(x),'Ticks cannot reverse while running');
});

test('actual milestone readbacks preserve idle research metadata while refusing gameplay changes',async()=>{
  const base={...idleWaveFields(),...save(),unlockedFittings:['launcher','repair'],firstClears:[]};
  Object.assign(base.checkpoint.encounter,{tick:50,hull:100});
  Object.assign(base.checkpoint.shop,{purchaseSequence:5,runPurchases:{cannonAttack:2}});
  for(const afterWave of [false]){
    const actual=structuredClone(base);actual.revision+=2;actual.research.revision++;
    actual.research.lastObservedUtcMilliseconds+=100;
    if(afterWave)actual.checkpoint.shop.purchaseSequence+=3;
    await milestoneReadbackCaller(base,actual,{afterWave});
    for(const mutate of [v=>v.credits++,v=>v.checkpoint.encounter.tick++,v=>v.checkpoint.encounter.hull--,
      v=>v.checkpoint.shop.runPurchases.cannonAttack++,v=>v.permanentLevels.cannonAttack++,
      v=>v.unlockedFittings.push('scattergun'),v=>v.firstClears.push('tier-1:wave-100'),
      v=>v.history.current.activeMilliseconds++,v=>v.recoveryRemainder++,
      v=>v.research.completedRanks.gameSpeed++,v=>v.research.partials.gameSpeed={},
      v=>v.research.slots[0].queued={},v=>v.research.nextProjectIdentity++,
      v=>v.revision=base.revision-1,v=>v.research.revision=base.research.revision-1,
      v=>v.research.revision=v.revision+1,v=>v.research.lastObservedUtcMilliseconds=0,
      v=>v.checkpoint.shop.purchaseSequence=-1,v=>v.checkpoint.shop.purchaseSequence=1.5,
      v=>v.checkpoint.shop.purchaseSequence=1]){
      const bad=structuredClone(actual);mutate(bad);
      await assert.rejects(milestoneReadbackCaller(base,bad,{afterWave}),String(mutate));
    }
  }
});

test('actual milestone caller requires current input and expected envelopes with complete saved editions',()=>{
  for(const legacy of [false,true])assert.doesNotThrow(()=>milestoneCaller(save(99,legacy),save(100,legacy)));
  for(const side of ['before','after'])for(const version of [4,5,7,0,6.5,'6',null,undefined]){
    const before=save(),after=save(100);(side==='before'?before:after).version=version;
    assert.throws(()=>milestoneCaller(before,after),/Current milestone requires save version 6/);
  }
  for(const mutate of [cp=>cp.encounter.rulesVersion='future',cp=>cp.contentVersion='last-stand-content-v1',
    cp=>cp.shop.economyVersion='research-farming-economy-v3',cp=>delete cp.encounter.mortarDamage])for(const side of ['before','after']){
    const before=save(),after=save(100);mutate((side==='before'?before:after).checkpoint);
    assert.throws(()=>milestoneCaller(before,after),/Unknown wave rules|Mixed content edition|Mixed economy edition|Missing weapon state/);
  }
  assert.throws(()=>milestoneCaller(save(98),save(100)));
  assert.throws(()=>milestoneCaller(save(),save(101)));
  assert.throws(()=>milestoneCaller(save(99,true),save(100)),/retain its saved edition/);
});

test('actual milestone runner binds and rechecks the shared oracle source-list owner',()=>{
  let changed=false;
  const dependency='e2e/helpers/lastStandWaveOracle.mjs';
  const hashes=()=>milestones.hashMilestoneRunnerInputs({directory:'inert-source-root',resolvePath:(_,path)=>path,
    readFile:path=>Buffer.from(path+(changed&&path===dependency?' changed':''))});
  const report={inputs:hashes()};assert.ok(Object.hasOwn(report.inputs,dependency),'Shared oracle source-list owner is bound');
  const check=()=>milestones.assertMilestoneRunnerInputs(report,hashes);
  assert.doesNotThrow(check);changed=true;assert.throws(check);
  changed=false;delete report.inputs[dependency];assert.throws(check);
});

test('actual combat capture requires current durable schema while preserving archived baseline behavior',async()=>{
  for(const legacy of [false,true])await combatSaveCaller(save(1,legacy));
  await combatSaveCaller({...save(),version:3,credits:0,checkpoint:null},{baseline:true});
  await assert.rejects(combatSaveCaller({...save(),version:3,credits:1},{baseline:true}),/Archived pre-wave capture/);
  for(const version of [4,5,7,0,6.5,'6',null,undefined])
    await assert.rejects(combatSaveCaller({...save(),version}),/Current capture requires save version 6/);
  for(const mutate of [cp=>cp.encounter.rulesVersion='future',cp=>cp.contentVersion='last-stand-content-v1',
    cp=>cp.shop.economyVersion='research-farming-economy-v3',cp=>delete cp.encounter.mortarDamage]){
    const saved=save();mutate(saved.checkpoint);
    await assert.rejects(combatSaveCaller(saved),/Unknown wave rules|Mixed content edition|Mixed economy edition|Missing weapon state/);
  }
  await assert.rejects(combatSaveCaller(save(0)),/completed a durable wave/);
  await assert.rejects(combatSaveCaller(save(),{wallet:3}),/matches live wallet/);
  await assert.rejects(combatSaveCaller({...save(),pendingDefeat:{runId:1}}));
  await assert.rejects(combatSaveCaller({...save(),permanentLevels:{cannonAttack:1}}));
});

test('milestone guard imports and executes in a checkout without installed Playwright',()=>{
  assertDependencyFreeWaveGuards(`
    const {MILESTONE_FIXTURE_SOURCES,admitMilestoneFixtures}=await import('./scripts/last-stand-wave-milestones.mjs');
    assert.ok(MILESTONE_FIXTURE_SOURCES.includes('campaign-unity/Unity/Assets/Scripts/EncounterModel.cs'));
    assert.throws(()=>admitMilestoneFixtures({schema:'untrusted'},'unused'),{code:'ERR_ASSERTION'});
  `);
});

// Inert bytes exercise manifest rejection only; they are never fed to Unity.
test('milestone setup requires complete source closure and four unique contained byte-bound fixtures',()=>{
  const root=mkdtempSync(join(tmpdir(),'st-milestone-admission-'));
  const sha=value=>createHash('sha256').update(value).digest('hex');
  try{
    const manifestPath=join(root,'fixture','manifest.json');mkdirSync(dirname(manifestPath));
    const valid={schema:'last-stand-earned-milestone-fixtures/v1',storageKey:'singedTerra.lastStand.prototype.v1',
      commands:[['compiler','input'],['runtime','program']],sourceSha256:{},cases:[]};
    for(const path of MILESTONE_FIXTURE_SOURCES){const full=join(root,path);mkdirSync(dirname(full),{recursive:true});
      writeFileSync(full,path);valid.sourceSha256[path]=sha(path);}
    for(const fitting of ['repair','launcher'])for(const targetWave of [100,300]){
      const item={fitting,targetWave,nextWaveTicks:400,expectedUnlockTier:targetWave===300?2:0,
        expectedUnlockFitting:targetWave===100?'scattergun':null};
      for(const [field,suffix,digest]of [['savePath','before','saveSha256'],['expectedSavePath','expected-next-clear','expectedSaveSha256']]){
        item[field]=join(dirname(manifestPath),`${fitting}-tier1-wave${targetWave}-${suffix}.json`);
        const bytes=JSON.stringify(save(targetWave-(field==='savePath'?1:0)));
        writeFileSync(item[field],bytes);item[digest]=sha(bytes);
      }
      valid.cases.push(item);
    }
    admitMilestoneFixtures(valid,manifestPath,root);
    const source=MILESTONE_FIXTURE_SOURCES[0];
    for(const mutate of [v=>v.sourceSha256={},v=>delete v.sourceSha256[source],
      v=>v.sourceSha256[source]='a'.repeat(64),v=>v.sourceSha256['../foreign.cs']='a'.repeat(64),
      v=>v.cases[1]=v.cases[0],v=>v.cases.pop(),v=>v.cases[0].savePath=join(root,'outside.json'),
      v=>v.cases[0].savePath=v.cases[0].expectedSavePath,v=>v.cases[0].saveSha256='a'.repeat(64),
      v=>v.cases[0].nextWaveTicks=0,v=>v.cases[0].expectedUnlockFitting=null,
      v=>v.cases[1].expectedUnlockTier=1,v=>v.storageKey='other',v=>v.commands=[]]){
      const bad=structuredClone(valid);mutate(bad);assert.throws(()=>admitMilestoneFixtures(bad,manifestPath,root),String(mutate));
    }
    for(const [field,digest]of [['savePath','saveSha256'],['expectedSavePath','expectedSaveSha256']]){
      const original=readFileSync(valid.cases[0][field]);
      for(const version of [5,7,'6',null]){
        const bad=structuredClone(valid),changed={...JSON.parse(original),version},bytes=JSON.stringify(changed);
        writeFileSync(bad.cases[0][field],bytes);bad.cases[0][digest]=sha(bytes);
        assert.throws(()=>admitMilestoneFixtures(bad,manifestPath,root),/Current milestone requires save version 6/);
      }
      writeFileSync(valid.cases[0][field],original);
    }
  }finally{
    assert.ok(root.startsWith(join(tmpdir(),'st-milestone-admission-')),'Remove only this test-created temporary directory');
    rmSync(root,{recursive:true,force:true});
  }
});

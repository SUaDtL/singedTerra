import {findLastStandSettingsViewport} from '../../e2e/helpers/lastStandControlReveal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {tierJourneyControlGeometry} from '../../e2e/helpers/lastStandTierJourney.mjs';
import { WAVE_JOURNEY_PROBE, validateEarlyWaveCommits, validateWaveMilestoneText, validateWaveResume, validateWaveCommit, validateWaveAbandon } from '../../e2e/helpers/lastStandWaveJourney.mjs';
import {capturePausedJourneyCheckpoint,validateSavedRunReady} from '../../e2e/helpers/lastStandJourneyRuntime.mjs';
import {idleWaveFields,abandonedWaveSave} from './lastStandWaveSaveFixtures.mjs';

// Invented observations exercise the acceptance reader, never qualify a player.
const clone=value=>structuredClone(value);
test('passive wave probe captures each durable boundary before delayed host input',()=>{
  const output=[];let raw=null,reads=0;
  const browser={console:{log:(...args)=>output.push(args)},performance:{now:()=>100,timeOrigin:50},
    window:{addEventListener(){}},localStorage:{getItem:key=>{assert.equal(key,'singedTerra.lastStand.prototype.v1');reads++;return raw;}}};
  runInNewContext(WAVE_JOURNEY_PROBE,browser);
  const emit=(wave,ready=true)=>{
    raw=JSON.stringify({checkpoint:{runId:1,encounter:{completedWave:wave}},credits:wave});
    browser.console.log('ST_LS_STATE '+JSON.stringify({hasCheckpoint:true,runId:1,checkpointWave:wave,saveState:ready?'ready':'pending'}));
  };
  emit(0);emit(1);emit(1);emit(2,false);emit(2);
  // Host input arrives only now; latest storage alone has lost the first boundary.
  const captured=output.filter(row=>row[0].startsWith('ST_WAVE_OBSERVATION ')).map(row=>JSON.parse(row[0].slice(20)))
    .filter(row=>row.checkpoint!==undefined).map(row=>JSON.parse(row.checkpoint));
  assert.deepEqual(captured.map(row=>row.checkpoint.encounter.completedWave),[0,1,2]);
  assert.deepEqual(captured.map(row=>row.credits),[0,1,2]);assert.equal(reads,3);
});
test('Return and reload capture only after verified pause despite delayed native input',async()=>{
  let wave=0,paused=false;
  const value=await capturePausedJourneyCheckpoint({
    pause:async()=>{await Promise.resolve();wave++;paused=true;},
    readState:()=>({phase:'battle',paused,speed:paused?0:1,saveState:'ready',checkpointBlocked:false}),
    readSave:async()=>JSON.stringify({checkpoint:{wave},wallet:wave})});
  // Later focus traversal cannot advance a paused game.
  await Promise.resolve();if(!paused)wave++;
  assert.equal(JSON.parse(value.saved).checkpoint.wave,wave);assert.equal(wave,1);
  for(const changed of [{phase:'garage'},{paused:false},{speed:1},{saveState:'pending'},{checkpointBlocked:true}]){
    await assert.rejects(capturePausedJourneyCheckpoint({pause:async()=>{},readState:()=>({...value.state,...changed}),
      readSave:async()=>{assert.fail('Unverified pause must not be read as a stable checkpoint');}}));
  }
});
test('saved-run readiness follows earned Salvage without relaxing checkpoint identity',()=>{
  const saved={credits:0,pendingDefeat:null,checkpoint:{runId:7,encounter:{completedWave:2}}};
  const state={action:'ready',saveState:'ready',hasCheckpoint:true,checkpointBlocked:false,
    pendingRunId:0,runId:7,checkpointWave:2,wallet:0,phase:'garage'};
  for(const credits of [0,1,25])assert.equal(validateSavedRunReady({
    state:{...state,wallet:credits,phase:credits>0?'workshop':'garage'},saved:{...saved,credits},expectedRunId:7}),true);
  for(const changed of [{action:'deploy'},{saveState:'pending'},{hasCheckpoint:false},{checkpointBlocked:true},
    {pendingRunId:7},{runId:8},{checkpointWave:3},{wallet:1},{phase:'workshop'},{phase:'battle'},{phase:'result'}])
    assert.throws(()=>validateSavedRunReady({state:{...state,...changed},saved,expectedRunId:7}));
  for(const changed of [{checkpoint:null},{pendingDefeat:{runId:7}},{credits:-1},
    {checkpoint:{runId:8,encounter:{completedWave:2}}}])
    assert.throws(()=>validateSavedRunReady({state,saved:{...saved,...changed},expectedRunId:7}));
  assert.throws(()=>validateSavedRunReady({state,saved,expectedRunId:0}));
});

test('wave milestone assertions admit current displayed labels and reject missing disclosures',()=>{
  const validate=(_assert,text)=>validateWaveMilestoneText(text);
  // Relevant text transcribed from PR547 job123226012352's rendered-menu failure.
  // This tests reader admission; it is not a replacement browser qualification.
  const text='Every completed wave pays repeatable Salvage. Bonuses below are earned once per tier. '+
    'Base rewards exclude Salvage Recovery research. Unlocking a tier never ends or moves your run.\n\n'+
    'WAVE 100 / UPCOMING\nOne-time bonus: +50 Salvage / Unlock Auxiliary Scattergun\nBase wave reward: +2 Salvage\n\n'+
    'WAVE 300 / UPCOMING\nOne-time bonus: +150 Salvage / Unlock Tier 2\nBase wave reward: +4 Salvage\n';
  assert.doesNotThrow(()=>validate(assert,text));
  for(const label of ['UPCOMING','One-time bonus','repeatable Salvage','Base wave reward',
    'WAVE 100 /','Unlock Auxiliary Scattergun','WAVE 300 /','Unlock Tier 2'])
    assert.throws(()=>validate(assert,text.replaceAll(label,'missing')),label);
});
function fixture(){
  const levels={cannonAttack:0,launcherAttack:0,hullCapacity:0,armor:0,cannonCycle:0,fieldRepair:0,scattergunAttack:0,scrapYield:0};
  const encounter={rulesVersion:'last-stand-waves-v1',tier:1,fitting:1,wave:1,completedWave:1,tick:201,hull:114,kills:6,committedCannonDamage:20};
  const shop={runId:1,fitting:1,uniqueKills:6,earnedScrap:60,spentScrap:0,scrap:60,permanentLevels:levels,runPurchases:{...levels}};
  const saved={...idleWaveFields(),credits:1,nextRunId:2,lastFinalizedRunId:0,permanentLevels:levels,firstClears:[],unlockedFittings:['repair','launcher'],
    tierRecords:{'dust-basin':{bestWave:1,legacyTicks:0,legacyKills:0,unlocked:true}},checkpoint:{runId:1,encounter,shop},pendingDefeat:null};
  const state={phase:'battle',saveState:'ready',runId:1,activeTier:1,profileVersion:'last-stand-waves-v1',wave:2,completedWave:1,
    checkpointWave:1,hasCheckpoint:true,checkpointBlocked:false,tick:201,hull:114,kills:6,cannonDamage:20,fittingId:'repair',paused:true,speed:0,wallet:1};
  const observedShop={mode:'Run',runId:1,scrap:60,spentScrap:0,earnedScrap:60,uniqueKills:6,
    cards:Object.entries(levels).map(([key,value])=>({key,p:value,n:value}))};
  return {saved,afterResume:state,stable:{...state},afterStored:clone(saved),shop:observedShop};
}
test('wave resume proves exact checkpoint state and paused stability, including the full shop ledger',()=>{
  const value=fixture();assert.doesNotThrow(()=>validateWaveResume(value));
  for(const [name,mutate]of Object.entries({
    'time catch-up':v=>v.afterResume.tick++, 'hull refill':v=>v.afterResume.hull++,
    'kill drift':v=>v.afterResume.kills++, 'wrong run':v=>v.afterResume.runId++,
    'wrong wave':v=>v.afterResume.wave++, 'unpaused':v=>v.afterResume.paused=false,
    'advance after resume':v=>v.stable.tick++, 'changed saved bytes':v=>v.afterStored.credits++,
    'lost scrap':v=>v.shop.scrap--, 'refunded spending':v=>v.shop.spentScrap++,
    'lost upgrade':v=>v.shop.cards[0].n++, 'missing track':v=>v.shop.cards.pop(),
    'duplicate track':v=>v.shop.cards[1]=clone(v.shop.cards[0]),
  })){const broken=clone(value);mutate(broken);assert.throws(()=>validateWaveResume(broken),undefined,name);}
});
test('wave commits require sequential wave and actual durable reward/ledger changes',()=>{
  const after=fixture().saved;const before=clone(after);before.credits=0;before.checkpoint.encounter.completedWave=0;
  before.checkpoint.encounter.wave=1;before.checkpoint.encounter.kills=0;before.checkpoint.shop.uniqueKills=0;
  const observation={before,after,state:{...fixture().afterResume,paused:false,speed:1},repeatable:1,firstClear:0};
  assert.doesNotThrow(()=>validateWaveCommit(observation));
  for(const mutate of [v=>v.after.credits=0,v=>v.after.credits=2,v=>v.after.checkpoint.runId=2,
    v=>v.after.checkpoint.encounter.completedWave=2,v=>v.after.checkpoint.shop.uniqueKills=5,
    v=>v.state.checkpointWave=0,v=>v.state.wave=1,v=>v.after.pendingDefeat={reward:1}]){
    const broken=clone(observation);mutate(broken);assert.throws(()=>validateWaveCommit(broken));
  }
});

for(const edition of [3,4])test('v'+edition+' wave commits preserve both captured fitting identities',()=>{
  const after=fixture().saved,cp=after.checkpoint;
  Object.assign(after,idleWaveFields({profileVersion:edition===4?9:8}));
  cp.contentVersion='last-stand-content-v'+edition;
  Object.assign(cp.encounter,{rulesVersion:'last-stand-waves-v'+edition,mortarShots:0,railgunShots:0,
    nextMortarTick:1,nextRailgunTick:1,mortarDamage:18,railgunDamage:40});
  Object.assign(cp.shop,{version:3,tier:1,economyVersion:'buildcraft-economy-v5'});
  cp.loadout={primary:'repair',secondary:null};
  cp.combatResearch={armorPiercing:0,areaControl:0,fieldEngineering:0};
  cp.buildcraft={arcShots:0,arcDamage:16,nextArcTick:1,shield:0,shieldCapacity:0,shieldRestored:0,
    shieldAbsorbed:0,nextShieldRechargeTick:20,lastShieldHitTick:0};
  if(edition===4){
    after.skills={intel:0,copies:[0,0,0,0,0,0],loadout:[],firstAwards:[]};
    cp.skills={loadout:[],ranks:[0,0,0,0,0,0]};
    cp.skillState={spentMask:0,overdriveUntilTick:0,minefieldArmed:false,minefieldDamage:0};
  }
  const before=clone(after);before.credits=0;before.checkpoint.encounter.completedWave=0;
  before.checkpoint.encounter.kills=0;before.checkpoint.shop.uniqueKills=0;
  const state={...fixture().afterResume,profileVersion:cp.encounter.rulesVersion,contentVersion:cp.contentVersion,
    economyVersion:cp.shop.economyVersion,mortarShots:0,railgunShots:0,mortarDamage:18,railgunDamage:40,
    arcShots:0,arcDamage:16,shield:0,shieldCapacity:0,activeSecondaryId:'',paused:false,speed:1};
  const observation={before,after,state,repeatable:1,firstClear:0};
  assert.doesNotThrow(()=>validateWaveCommit(observation));
  const broken=clone(observation);broken.after.checkpoint.loadout.secondary='shield';
  broken.state.activeSecondaryId='shield';
  assert.throws(()=>validateWaveCommit(broken),/Cleared wave keeps both captured fitting identities/);
});

test('delayed pause still proves each individual committed cohort and rejects gaps or extra rewards',()=>{
  const first=fixture(),second=clone(first);
  second.saved.credits=2;Object.assign(second.saved.checkpoint.encounter,{wave:2,completedWave:2,kills:12});
  second.saved.checkpoint.shop.uniqueKills=12;
  Object.assign(second.afterResume,{wave:3,completedWave:2,checkpointWave:2,wallet:2,kills:12});
  const starting=clone(first.saved);starting.credits=0;starting.checkpoint.encounter.completedWave=0;
  starting.checkpoint.encounter.kills=0;starting.checkpoint.shop.uniqueKills=0;
  const value={starting,initial:{data:starting,state:{...first.afterResume,checkpointWave:0,completedWave:0,wave:1,wallet:0},load:1,timeOrigin:1000,t:10},
    commits:[{data:first.saved,state:first.afterResume,load:1,timeOrigin:1000,t:20},
      {data:second.saved,state:second.afterResume,load:1,timeOrigin:1000,t:30}],
    pausedSave:clone(second.saved),pausedState:{...second.afterResume,load:1,timeOrigin:1000,t:40,tick:300}};
  assert.doesNotThrow(()=>validateEarlyWaveCommits(value));
  for(const mutate of [v=>v.commits.shift(),v=>v.commits.pop(),v=>v.commits[1].data.credits++,
    v=>v.commits[1].data.checkpoint.runId++,v=>v.commits.splice(1,0,clone(v.commits[0])),
    v=>v.pausedSave.credits++,v=>v.commits[1].data.checkpoint.encounter.completedWave=10,
    ...Object.entries({phase:'garage',paused:false,speed:1,saveState:'pending',checkpointBlocked:true,
      runId:2,profileVersion:'unknown',activeTier:2,fittingId:'launcher',completedWave:3,checkpointWave:3,wave:4,wallet:3,
      timeOrigin:999,load:2,t:25}).map(([key,replacement])=>v=>v.pausedState[key]=replacement),
    v=>v.commits[1].state.runId=999,v=>v.commits[1].timeOrigin=999,v=>v.commits[1].load=2,
    v=>v.commits[1].t=-1,v=>v.commits[1].t=19,v=>v.initial.timeOrigin=0]){
    const broken=clone(value);mutate(broken);assert.throws(()=>validateEarlyWaveCommits(broken));
  }
});
test('confirmed abandon invalidates only the run and preserves banked progression through reload',()=>{
  const before=fixture().saved;const after=abandonedWaveSave(before);
  const value={before,after,reloaded:clone(after)};assert.doesNotThrow(()=>validateWaveAbandon(value));
  for(const mutate of [v=>v.after.checkpoint=clone(v.before.checkpoint),v=>v.after.credits--,
    v=>v.after.lastFinalizedRunId=0,v=>v.after.pendingDefeat={reward:1},
    v=>v.reloaded.checkpoint=clone(v.before.checkpoint),v=>v.after.permanentLevels.cannonAttack++]){
    const broken=clone(value);mutate(broken);assert.throws(()=>validateWaveAbandon(broken));
  }
});

function clippedSurfaceFixture(settings=true,kind='LastStandConsoleSurface'){
  const clip={x:345.0000305175781,y:72,width:676,height:571.9999389648438};
  const name=settings?'MenuResume':'ShopCard_cannonAttackBuy',viewport=settings?'SettingsModal/SettingsPanel/SettingsViewport':'ShopPanel/ShopViewport';
  const item={name,x:353.0000305175781,y:171,width:660,height:44,active:true,interactable:true};
  const graphic={...item,path:viewport+(settings?'/SettingsContent/':'/ShopContent/ShopCard_cannonAttack/')+name,
    kind,hasClip:true,clip,raycastTarget:true};
  const graphics=[{path:viewport,kind,active:true,hasClip:true,clip},graphic];
  const layout={width:1366,height:664,controls:[],shopControls:settings?[]:[item],settingsControls:settings?[item]:[],
    graphicsTruncated:false,settingsScrollOffset:0,settingsMaximumScrollOffset:0,scrollOffset:0,maximumScrollOffset:settings?0:100,
    raw:'ST_LS_HUD_LAYOUT '+JSON.stringify({graphics})};
  return {layout,graphics,canvas:{width:1366,height:664}};
}
test('actual chrome surface class retains measured settings and shop clipping ownership',()=>{
  for(const settings of [true,false])for(const kind of ['Image','LastStandConsoleSurface']){
    const {layout,canvas}=clippedSurfaceFixture(settings,kind);
    const result=tierJourneyControlGeometry(layout,canvas);assert.equal(result.length,1);assert.equal(result[0].full,true);
  }
});
test('clipped control geometry refuses unrelated or ambiguous surfaces, changed clips and unreachable targets',()=>{
  for(const settings of [true,false])for(const mutate of [
    f=>f.graphics[1].kind='Text',f=>f.graphics[1].kind='LastStandConsoleFrame',f=>f.graphics[1].hasClip=false,
    f=>f.graphics[1].clip={...f.graphics[1].clip,x:346},f=>f.graphics[1].x++,
    f=>f.graphics[1].path='Unrelated/'+f.graphics[1].path.split('/').at(-1),
    f=>f.graphics.push(clone(f.graphics[1])),f=>f.graphics.push(clone(f.graphics[0])),
    f=>f.graphics[0].active=false,f=>f.layout.graphicsTruncated=true,
    f=>f.layout[settings?'settingsScrollOffset':'scrollOffset']=-1,
    f=>{const item=(settings?f.layout.settingsControls:f.layout.shopControls)[0];item.height=43;f.graphics[1].height=43;},
    f=>{const item=(settings?f.layout.settingsControls:f.layout.shopControls)[0];item.y=800;f.graphics[1].y=800;},
  ]){
    const f=clippedSurfaceFixture(settings);mutate(f);f.layout.raw='ST_LS_HUD_LAYOUT '+JSON.stringify({graphics:f.graphics});
    assert.throws(()=>tierJourneyControlGeometry(f.layout,f.canvas));
  }
});

test('shared mouse and touch reader locates the actual chrome viewport',()=>{
    const select=findLastStandSettingsViewport;
    for(const kind of ['Image','LastStandConsoleSurface']){
      const actual={active:true,path:'SettingsModal/SettingsPanel/SettingsViewport',kind};
      const distractors=[{...actual,active:false},{...actual,path:actual.path+'/Child'},
        {...actual,kind:'Text'},{...actual,kind:'LastStandConsoleFrame'}];
      assert.equal(select(distractors),undefined,'Decorations and inactive/descendant nodes are not the scroll viewport');
      assert.equal(select([...distractors,actual]),actual,'Mouse and touch locate the exact active chrome surface');
    }
});

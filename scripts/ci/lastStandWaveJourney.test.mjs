import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tierJourneyControlGeometry} from '../../e2e/helpers/lastStandTierJourney.mjs';
import { validateWaveResume, validateWaveCommit, validateWaveAbandon } from '../../e2e/helpers/lastStandWaveJourney.mjs';
import {idleWaveFields,abandonedWaveSave} from './lastStandWaveSaveFixtures.mjs';

// Invented observations exercise the acceptance reader, never qualify a player.
const clone=value=>structuredClone(value);
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

for(const [script,count] of [['last-stand-controls.mjs',1],['last-stand-controls-touch.mjs',2]])
test(script+' locates the actual chrome viewport for every scroll input path',()=>{
  const source=readFileSync(new URL('../'+script,import.meta.url),'utf8');
  const predicates=[...source.matchAll(/raw\(\)\.graphics\.find\((g=>[^\n]+?)\);/g)].map(match=>match[1]).filter(predicate=>predicate.includes('/SettingsViewport'));
  assert.equal(predicates.length,count,'Exercise every actual mouse/touch viewport reader');
  for(const predicate of predicates){
    // Execute the maintained selector in isolation; no browser or synthetic player receipt.
    const select=new Function('graphics','return graphics.find('+predicate+');');
    for(const kind of ['Image','LastStandConsoleSurface']){
      const actual={active:true,path:'SettingsModal/SettingsPanel/SettingsViewport',kind};
      const distractors=[{...actual,active:false},{...actual,path:actual.path+'/Child'},
        {...actual,kind:'Text'},{...actual,kind:'LastStandConsoleFrame'}];
      assert.equal(select(distractors),undefined,'Decorations and inactive/descendant nodes are not the scroll viewport');
      assert.equal(select([...distractors,actual]),actual,'Mouse and touch locate the exact active chrome surface');
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {readShopControlObservation,LAST_STAND_HELPER_INPUTS} from '../../e2e/helpers/lastStandJourney.mjs';
import * as tierJourney from '../../e2e/helpers/lastStandTierJourney.mjs';
const {tierJourneyControlGeometry}=tierJourney;
import {lastStandObservedControls} from '../../e2e/helpers/lastStandBrowserActor.mjs';
import {admitResearchFixtures,researchJourneyInputHashes} from '../last-stand-research-journey.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const observationContract=JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v1.json',import.meta.url),'utf8'));
const previousObservationContract=JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v2.json',import.meta.url),'utf8'));
const currentObservationContract=JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v3.json',import.meta.url),'utf8'));
const continuityObservationContract=JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v4.json',import.meta.url),'utf8'));
// Invented telemetry tests only the admission reader; it cannot qualify a UI.
function observation(contract=observationContract){
  const groups=Object.fromEntries(contract.inventories.map(({field,names})=>[field,names]));
  return {...(contract.header.includes('schema')?{schema:contract.schema}:{}),phase:'garage',coordinates:'top-left',selection:'',width:1366,height:664,pixelRatio:1,scrollOffset:0,maximumScrollOffset:0,
    settingsScrollOffset:0,settingsMaximumScrollOffset:0,
    ...Object.fromEntries(Object.entries(groups).map(([key,names])=>[key,names.map(name=>({name,label:name,accessibleLabel:name,mode:key,trackKey:'',x:0,y:0,width:44,height:44,active:false,interactable:false}))])),
    graphics:[],...Object.fromEntries(contract.tail.map(key=>[key,0]))};
}
const raw=value=>'ST_LS_HUD_LAYOUT '+JSON.stringify(value);

test('tier journey binds its executable helper and observation closure and detects each changed file',async t=>{
  assert.equal(typeof tierJourney.tierJourneyInputHashes,'function');
  const current=await tierJourney.tierJourneyInputHashes();
  for(const path of ['e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,
    ...[1,2,3,4].map(version=>'campaign-unity/Tools/contracts/last-stand-observation-v'+version+'.json')]){
    assert.ok(Object.hasOwn(current,path),'Bound current execution source: '+path);
    assert.equal(current[path],sha(readFileSync(path)));
  }
  assert.equal(Object.hasOwn(current,'scripts/last-stand-first-session.mjs'),false);
  const firstSession=await tierJourney.tierJourneyInputHashes({firstSession:true});
  assert.deepEqual(Object.keys(firstSession).filter(path=>!Object.hasOwn(current,path)),['scripts/last-stand-first-session.mjs']);
  const root=mkdtempSync(join(tmpdir(),'st-tier-source-hashes-'));t.after(()=>rmSync(root,{recursive:true}));
  for(const path of Object.keys(firstSession)){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),'inert');}
  const before=await tierJourney.tierJourneyInputHashes({firstSession:true,sourceRoot:root});
  for(const path of Object.keys(before)){
    writeFileSync(join(root,path),'changed');
    const after=await tierJourney.tierJourneyInputHashes({firstSession:true,sourceRoot:root});
    assert.notDeepEqual(after,before,'Changed execution input cannot retain evidence binding: '+path);
    assert.deepEqual(Object.keys(after).filter(key=>after[key]!==before[key]),[path]);
    writeFileSync(join(root,path),'inert');
  }
});

for(const version of [1,2,3,4])test('research journey binds observation v'+version+' and detects changed bytes',t=>{
  const contract='campaign-unity/Tools/contracts/last-stand-observation-v'+version+'.json';
  const current=researchJourneyInputHashes();assert.ok(Object.hasOwn(current,contract));
  assert.equal(current[contract],sha(readFileSync(contract)));
  const root=mkdtempSync(join(tmpdir(),'st-research-source-hashes-'));t.after(()=>rmSync(root,{recursive:true}));
  for(const path of Object.keys(current)){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),'inert');}
  const before=researchJourneyInputHashes(root);writeFileSync(join(root,contract),'changed contract');
  assert.notEqual(researchJourneyInputHashes(root)[contract],before[contract]);
});
test('retained v1 complete telemetry contains every unique Lab/history/bulk and wave info owner',()=>{
  const result=readShopControlObservation(raw(observation()));
  assert.equal(result.researchControls.length,17);assert.equal(result.historyControls.length,2);
  assert.equal(result.shopControls.length,16);assert.equal(result.graphicsTruncated,false);
  for(const name of ['ShopCard_mortarAttackBuy','ShopCard_railgunAttackBuy'])
    assert.equal(result.shopControls.filter(control=>control.name===name).length,1);
  assert.ok(result.controls.some(control=>control.name==='WaveInfo'));
  assert.ok(result.settingsControls.some(control=>control.name==='MenuWaveInfo'));
});
test('retained v1 telemetry refuses missing, duplicate, unknown, invalid and truncated data',()=>{
  for(const mutate of [v=>delete v.researchControls,v=>v.researchControls.pop(),v=>v.researchControls[1].name=v.researchControls[0].name,
    v=>v.controls=v.controls.filter(control=>control.name!=='WaveInfo'),v=>v.settingsControls=v.settingsControls.filter(control=>control.name!=='MenuWaveInfo'),
    v=>v.shopControls[2].name='invented',v=>v.controls[0].width=-1,v=>v.historyScrollOffset=-1,
    v=>delete v.historyMaximumScrollOffset,v=>v.graphics=null,v=>v.undeclared=true,v=>v.researchControls[0].extra='bad']){
    const value=observation();mutate(value);assert.throws(()=>readShopControlObservation(raw(value)));
  }
  const text=raw(observation());assert.throws(()=>readShopControlObservation(text.slice(0,-20)));
  assert.throws(()=>readShopControlObservation(text.slice(0,8190)));
});
for(const [version,contract] of [[2,previousObservationContract],[3,currentObservationContract],[4,continuityObservationContract]])test('retained v1 and exact v'+version+' observations remain distinct complete contracts',()=>{
  const retained=readShopControlObservation(raw(observation()));
  assert.equal(retained.historyControls.length,2);assert.equal(Object.hasOwn(retained,'plannerControls'),false);
  const value=observation(contract),result=readShopControlObservation(raw(value));
  assert.equal(result.historyControls.length,version>=3?10:9);assert.equal(result.plannerControls.length,16);
  assert.ok(result.settingsControls.some(item=>item.name==='MenuPlanner'));
  assert.equal(lastStandObservedControls(result).filter(item=>item.name==='PlannerPin').length,1);
  for(const mutate of [v=>delete v.plannerControls,v=>delete v.plannerMaximumScrollOffset,
    v=>v.plannerControls.pop(),v=>v.plannerControls.push({...v.plannerControls[0]}),
    v=>v.historyControls.pop(),v=>v.historyControls[1].name=v.historyControls[0].name,
    v=>v.historyControls=v.historyControls.filter(item=>item.name!=='RunHistoryTier'),
    v=>v.plannerControls[0].width='44',v=>v.plannerControls[0].active=1,
    v=>v.settingsControls=v.settingsControls.filter(item=>item.name!=='MenuPlanner'),
    v=>v.unknown='extra',v=>v.plannerScrollOffset=-1,v=>v.plannerControls[0].unexpected=true]){
    const bad=clone(value);mutate(bad);assert.throws(()=>readShopControlObservation(raw(bad)));
  }
  if(version>=3)for(const mutate of [v=>delete v.schema,v=>v.schema='singedterra-last-stand-observation/v2',v=>v.schema='unknown',
    v=>v.researchControls=v.researchControls.filter(item=>item.name!=='ResearchHelp'),
    v=>v.historyControls=v.historyControls.filter(item=>item.name!=='RunHistoryHelp'),
    v=>delete v.researchListScrollOffset,v=>v.researchDetailMaximumScrollOffset='200',v=>v.researchListMaximumScrollOffset=-1]){
    const bad=clone(value);mutate(bad);assert.throws(()=>readShopControlObservation(raw(bad)));
  }
  const packet=raw(value);
  for(const duplicate of [packet.replace('"phase":"garage"','"phase":"garage","phase":"garage"'),
    packet.replace('"width":44','"width":44,"width":44'),
    packet.replace('"phase":"garage"','"phase":"garage","ph\\u0061se":"garage"')])
    assert.throws(()=>readShopControlObservation(duplicate),/Duplicate/,'repeated JSON keys are not repaired by parsing');
});

test('v4 save and Help observation requires all eleven new controls and refuses a v3 downgrade',()=>{
  const names=['DataExport','DataImport','DataPrevious','DataGarage','BackupCancel','BackupReplace',
    'HelpPrevious','HelpNext','MenuGuidance','GuidanceDismiss','HelpAction'];
  const current=observation(continuityObservationContract),result=readShopControlObservation(raw(current));
  assert.equal(result.settingsControls.length,52);
  assert.equal(lastStandObservedControls(result).length,132);
  for(const name of names){
    assert.equal(result.settingsControls.filter(item=>item.name===name).length,1,name+' belongs to exactly one owner');
    const missing=clone(current);missing.settingsControls=missing.settingsControls.filter(item=>item.name!==name);
    assert.throws(()=>readShopControlObservation(raw(missing)),/Complete settingsControls/,name+' cannot disappear');
  }
  for(const schema of ['singedterra-last-stand-observation/v3','singedterra-last-stand-observation/v5',null]){
    const value=clone(current);value.schema=schema;assert.throws(()=>readShopControlObservation(raw(value)));
  }
  for(const mutate of [value=>value.settingsControls.at(-1).name='invented-backup-action',
    value=>value.settingsControls.push(clone(value.settingsControls.at(-1)))]){
    const value=clone(current);mutate(value);assert.throws(()=>readShopControlObservation(raw(value)));
  }
});

function scrollingModalGeometry(owner){
  const name=owner==='Planner'?'PlannerPin':'RunHistoryRunANext';
  const field=owner==='Planner'?'plannerControls':'historyControls';
  const clip={x:20,y:100,width:400,height:100};
  const item={name,x:28,y:220,width:384,height:44,active:true,interactable:true};
  const path=owner+'Modal/'+owner+'Panel/'+owner+'Viewport';
  const graphics=[{path,kind:'LastStandConsoleSurface',active:true,hasClip:true,clip},
    {...item,path:path+'/'+owner+'Content/'+name,kind:'LastStandConsoleSurface',hasClip:true,clip}];
  const scroll=owner==='Planner'?'planner':'history';
  return {layout:{width:800,height:600,controls:[],shopControls:[],settingsControls:[],researchControls:[],historyControls:[],plannerControls:[],
    [field]:[item],[scroll+'ScrollOffset']:0,[scroll+'MaximumScrollOffset']:200,graphicsTruncated:false,raw:raw({graphics})},
    graphics,canvas:{width:800,height:600},item,scroll};
}
for(const owner of ['Planner','RunHistory'])test(owner+' geometry proves own pane reach and refuses false clipping',()=>{
  const value=scrollingModalGeometry(owner);assert.equal(tierJourneyControlGeometry(value.layout,value.canvas)[0].full,false);
  value.item.y-=100;value.graphics[1].y-=100;value.layout[value.scroll+'ScrollOffset']=100;value.layout.raw=raw({graphics:value.graphics});
  assert.equal(tierJourneyControlGeometry(value.layout,value.canvas)[0].full,true);
  for(const mutate of [v=>v.graphics[1].path='Other/'+v.graphics[1].path,v=>v.graphics[1].clip={...v.graphics[1].clip,y:101},
    v=>v.layout.settingsControls.push({active:true}),v=>v.layout.controls.push({active:false,interactable:true}),
    v=>v.graphics.push(clone(v.graphics[0])),v=>v.layout[v.scroll+'MaximumScrollOffset']=20,
    v=>v.item.height=120,v=>v.layout[v.scroll+'ScrollOffset']=-1]){
    const bad=scrollingModalGeometry(owner);mutate(bad);bad.layout.raw=raw({graphics:bad.graphics});
    assert.throws(()=>tierJourneyControlGeometry(bad.layout,bad.canvas));
  }
});
function labGeometry(){
  const clip={x:20,y:100,width:400,height:400},name='ResearchStart0';
  const item={name,x:28,y:160,width:384,height:44,active:true,interactable:true};
  const path='ResearchModal/ResearchPanel/ResearchDetailViewport';
  const graphics=[{path,kind:'LastStandConsoleSurface',active:true,hasClip:true,clip},
    {...item,path:path+'/ResearchDetailContent/'+name,kind:'LastStandConsoleSurface',hasClip:true,clip}];
  return {layout:{width:800,height:600,controls:[],shopControls:[],settingsControls:[],researchControls:[item],historyControls:[],
    researchScrollOffset:0,researchMaximumScrollOffset:400,graphicsTruncated:false,raw:raw({graphics})},graphics,canvas:{width:800,height:600}};
}
test('Lab geometry uses its own measured pane and exclusive modal input',()=>{
  const value=labGeometry();assert.equal(tierJourneyControlGeometry(value.layout,value.canvas)[0].full,true);
  for(const mutate of [v=>v.graphics[1].path='Other/'+v.graphics[1].path,v=>v.graphics[1].clip={...v.graphics[1].clip,y:101},
    v=>v.layout.settingsControls.push({active:true}),v=>v.layout.controls.push({active:false,interactable:true}),
    v=>v.graphics.push(clone(v.graphics[0]))]){
    const value=labGeometry();mutate(value);value.layout.raw=raw({graphics:value.graphics});assert.throws(()=>tierJourneyControlGeometry(value.layout,value.canvas));
  }
});
function currentLabGeometry(name){
  const value=labGeometry(),list=name==='ResearchFilter'||name.startsWith('ResearchProject-');
  const pane=list?'List':'Detail';
  value.layout.schema='singedterra-last-stand-observation/v3';
  Object.assign(value.layout,{researchListScrollOffset:0,researchListMaximumScrollOffset:400,researchDetailScrollOffset:0,researchDetailMaximumScrollOffset:400});
  const item=value.layout.researchControls[0];item.name=name;item.y=620;
  value.graphics[0].path=value.graphics[0].path.replace('Detail',pane);
  Object.assign(value.graphics[1],item,{path:value.graphics[0].path+'/Research'+pane+'Content/'+name});
  value.layout.raw=raw({graphics:value.graphics});
  return value;
}
for(const name of ['ResearchFilter','ResearchProject-gameSpeed','ResearchBack','ResearchStart0'])test(name+' v3 geometry requires its own pane and full real scroll reach',()=>{
  const value=currentLabGeometry(name);assert.equal(tierJourneyControlGeometry(value.layout,value.canvas)[0].full,false);
  const pane=name==='ResearchFilter'||name.startsWith('ResearchProject-')?'List':'Detail',other=pane==='List'?'Detail':'List';
  value.layout['research'+other+'MaximumScrollOffset']=0;
  assert.doesNotThrow(()=>tierJourneyControlGeometry(value.layout,value.canvas),'other pane cannot determine reach');
  for(const mutate of [v=>v.layout['research'+pane+'MaximumScrollOffset']=20,
    v=>delete v.layout['research'+pane+'ScrollOffset'],
    v=>v.graphics[1].path=v.graphics[1].path.replace('Research'+pane+'Content','Research'+other+'Content'),
    v=>v.graphics[1].clip={...v.graphics[1].clip,y:101},v=>v.layout.graphicsTruncated=true]){
    const bad=currentLabGeometry(name);mutate(bad);bad.layout.raw=raw({graphics:bad.graphics});
    assert.throws(()=>tierJourneyControlGeometry(bad.layout,bad.canvas));
  }
});
for(const [version,names] of [[3,['SettingsTab0','ChoicePrevious','ChoiceNext']],[4,['HelpPrevious','HelpNext']]])for(const name of names)test(name+' v'+version+' admits fixed or genuine compact scroll ownership',()=>{
  function packet(clipped){
    const item={name,x:28,y:clipped?620:20,width:44,height:44,active:true,interactable:true},clip={x:20,y:100,width:400,height:400};
    const path='SettingsModal/SettingsPanel/SettingsViewport';
    const graphics=[{path,kind:'LastStandConsoleSurface',active:true,hasClip:true,clip},
      {...item,path:clipped?path+'/SettingsContent/'+name:'SettingsModal/SettingsPanel/'+name,kind:'LastStandConsoleSurface',hasClip:clipped,clip}];
    return {layout:{schema:'singedterra-last-stand-observation/v'+version,width:800,height:600,controls:[],shopControls:[],settingsControls:[item],
      settingsScrollOffset:0,settingsMaximumScrollOffset:400,graphicsTruncated:false,raw:raw({graphics})},graphics};
  }
  for(const clipped of [false,true])assert.equal(tierJourneyControlGeometry(packet(clipped).layout,{width:800,height:600})[0].full,!clipped);
  for(const mutate of [v=>v.graphics[1].path='Other/'+v.graphics[1].path,v=>v.layout.settingsMaximumScrollOffset=10,
    v=>v.graphics.push(clone(v.graphics[1])),v=>v.layout.graphicsTruncated=true]){
    const bad=packet(true);mutate(bad);bad.layout.raw=raw({graphics:bad.graphics});
    assert.throws(()=>tierJourneyControlGeometry(bad.layout,{width:800,height:600}));
  }
});
test('fixture admission binds relative saves and exact current sources; rejects damaged provenance',()=>{
  const directory=mkdtempSync(join(tmpdir(),'st-research-reader-'));
  try{
    const names=['LastStandProgression','LastStandResearchState','LastStandResearchCatalog','LastStandRunHistory','LastStandUpgradeCatalog',
      'LastStandEconomyCatalog','LastStandStore','LastStandSaveJson','LastStandResearchClock','LastStandProgressionResearchSave'];
    const sourceSha256={};for(const name of names){const path='campaign-unity/Unity/Assets/Scripts/'+name+'.cs';mkdirSync(join(directory,'campaign-unity/Unity/Assets/Scripts'),{recursive:true});writeFileSync(join(directory,path),name);sourceSha256[path]=sha(name);}
    const stamp=Date.now(),cases=['lab-near-completion','mature-5x'].map(id=>{
      const bytes=JSON.stringify({version:6,checkpoint:null,research:{lastObservedUtcMilliseconds:stamp,completedRanks:{gameSpeed:0,salvageRecovery:0,researchSpeed:0,scrapLogistics:0}}});
      writeFileSync(join(directory,id+'.json'),bytes);return{id,savePath:id+'.json',saveSha256:sha(bytes),createdUtcMilliseconds:stamp};
    });
    const manifest={schema:'last-stand-research-qualification-fixtures/v1',storageKey:'singedTerra.lastStand.prototype.v1',scope:'Explicit development seeds',
      clockMode:'current UTC final anchors; synthetic earlier training',generatedUtcMilliseconds:stamp,sourceSha256,cases};
    const path=join(directory,'manifest.json');writeFileSync(path,JSON.stringify(manifest));
    assert.doesNotThrow(()=>admitResearchFixtures(manifest,path,directory));
    // This is the current generator's admission lane, not an archived-save
    // reader. Rehash each mutation so version rejection cannot pass merely
    // because the file no longer matches its manifest.
    for(const row of cases){
      const file=join(directory,row.savePath),original=readFileSync(file);
      for(const version of [5,7,0,'6',null,undefined]){
        const saved=JSON.parse(original);saved.version=version;
        const bytes=JSON.stringify(saved),broken=clone(manifest);
        writeFileSync(file,bytes);broken.cases.find(item=>item.id===row.id).saveSha256=sha(bytes);
        assert.throws(()=>admitResearchFixtures(broken,path,directory),/Current research fixture requires save version 6/,
          row.id+': '+String(version));
      }
      writeFileSync(file,original);
    }
    for(const mutate of [v=>v.cases[0].savePath='../lab-near-completion.json',v=>v.cases[0].saveSha256='0'.repeat(64),
      v=>v.cases[0].id='other',v=>v.clockMode='fixed UTC for generator regression only',v=>delete v.sourceSha256['campaign-unity/Unity/Assets/Scripts/LastStandResearchState.cs']]){
      const broken=clone(manifest);mutate(broken);assert.throws(()=>admitResearchFixtures(broken,path,directory));
    }
    writeFileSync(join(directory,Object.keys(sourceSha256)[0]),'changed');assert.throws(()=>admitResearchFixtures(manifest,path,directory));
  }finally{rmSync(directory,{recursive:true,force:true});}
});

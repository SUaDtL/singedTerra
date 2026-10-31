// Explicit accelerated, production-earned setup. This is separate from the
// ordinary fresh-account journey and does not establish elapsed-time endurance.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LAST_STAND_HELPER_INPUTS,admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,
  fetchBoundRuntime,assertServedBytes,readShopControlObservation,assertWaveCheckpointEdition,assertWaveSavePreserved} from '../e2e/helpers/lastStandJourney.mjs';
import {tierJourneyControlGeometry} from '../e2e/helpers/lastStandTierJourney.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';
import {WAVE_ORACLE_SOURCES} from '../e2e/helpers/lastStandWaveOracle.mjs';

const root=resolve(import.meta.dirname,'..'),key='singedTerra.lastStand.prototype.v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const MILESTONE_FIXTURE_SOURCES=Object.freeze([
  ...WAVE_ORACLE_SOURCES.map(name=>'campaign-unity/Unity/Assets/Scripts/'+name),
  ...['LastStandProgression','LastStandStore','LastStandRunCheckpoint','LastStandProgressionSave','LastStandLegacySave',
    'LastStandSaveJson','LastStandProgressionBackup','LastStandProgressionResearch','LastStandProgressionResearchSave','LastStandRunHistory',
    'LastStandResearchState','LastStandResearchCatalog','LastStandResearchClock','Content/LastStandResearchDefinitions']
    .map(name=>'campaign-unity/Unity/Assets/Scripts/'+name+'.cs'),
  'campaign-unity/Tools/last_stand_waves/EarnedMilestoneFixtures.cs',
  'campaign-unity/Tools/last_stand_waves/generate_earned_milestone_fixtures.py',
  'campaign-unity/Tools/last_stand_source_closure.py','campaign-unity/Tools/last_stand_test_runtime.py']);
export function admitMilestoneSaves(saved,expected,fixture){
  for(const value of [saved,expected]){
    assert.equal(value?.version,6,'Current milestone requires save version 6');
    assertWaveCheckpointEdition(value.checkpoint);
  }
  assert.deepEqual(assertWaveCheckpointEdition(saved.checkpoint),assertWaveCheckpointEdition(expected.checkpoint),
    'Expected milestone must retain its saved edition');
  assert.equal(saved.checkpoint.encounter.completedWave,fixture.targetWave-1);
  assert.equal(expected.checkpoint.encounter.completedWave,fixture.targetWave);
}
export function assertMilestoneHistoryTiming(saved,expected,actual,fixture,{states,input,actions}){
  const keys=['activeMilliseconds','pausedMilliseconds','closedMilliseconds'],before=saved.history.current,
    planned=expected.history.current,after=actual.history.current,run=saved.checkpoint.runId;
  assert.ok(Number.isSafeInteger(run)&&run>0);
  for(const row of [before,planned,after]){
    assert.equal(row.runId,run,'History retains the resumed run');
    for(const key of keys)assert.ok(Number.isSafeInteger(row[key])&&row[key]>=0,'Integral nonnegative history time');
    assert.equal(row.speedMilliseconds.length,10);
    assert.ok(row.speedMilliseconds.every(v=>Number.isSafeInteger(v)&&v>=0));
    assert.equal(row.speedMilliseconds.reduce((a,b)=>a+b,0),row.activeMilliseconds,'Speed bins sum to active time');
  }
  for(const key of [...keys,'speedMilliseconds'])assert.deepEqual(planned[key],before[key],'Pure-model oracle adds no wall time');
  const unique=(predicate,label)=>{const matches=states.filter(predicate);assert.equal(matches.length,1,'Unique '+label);return matches[0];};
  const ready=unique(s=>s.action==='ready','initial ready witness'),
    resume=unique(s=>s.action==='resume','initial resume witness'),
    commit=unique(s=>s.action==='wave-committed'&&s.completedWave===fixture.targetWave,'milestone commit witness');
  const origin=ready.timeOrigin;
  assert.ok(Number.isFinite(origin)&&origin>0);
  let previous=-1;
  for(const row of states){
    assert.ok(Number.isFinite(row.t)&&row.t>=0&&row.t>=previous&&row.timeOrigin===origin,'One ordered document observation stream');
    previous=row.t;
    if(row.t>=ready.t&&row.t<=commit.t)assert.equal(row.runId,run,'Observed run cannot change');
  }
  assert.ok(ready.t<resume.t&&resume.t<commit.t);
  assert.ok(['garage','workshop'].includes(ready.phase));assert.equal(ready.saveState,'ready');
  assert.equal(resume.phase,'battle');assert.equal(resume.saveState,'ready');
  assert.equal(resume.tick,saved.checkpoint.encounter.tick);assert.equal(resume.paused,true);assert.equal(resume.speed,0);
  assert.equal(commit.tick,expected.checkpoint.encounter.tick);assert.equal(commit.checkpointWave,fixture.targetWave);
  assert.equal(commit.phase,'battle');assert.equal(commit.saveState,'ready');
  const active=states.find(s=>s.t>resume.t&&s.t<=commit.t&&!s.paused);
  assert.ok(active,'Observed initial unpause required');
  assert.equal(active.tick,resume.tick,'Initial unpause begins at the restored tick');
  let previousTick=resume.tick;
  for(const row of states.filter(s=>s.t>=resume.t&&s.t<=commit.t)){
    assert.equal(row.phase,'battle');assert.equal(row.saveState,'ready','Observed history requires confirmed save ownership');
    assert.ok(Number.isSafeInteger(row.tick)&&row.tick>=previousTick&&row.tick<=commit.tick,'Observed ticks remain monotonic within the committed interval');
    previousTick=row.tick;
    assert.equal(typeof row.paused,'boolean');assert.equal(row.speed,row.paused?0:1,'Observed pause and 1x selection agree');
    if(row.t<active.t){assert.equal(row.paused,true);assert.equal(row.tick,resume.tick,'Paused prefix cannot advance combat');}
  }
  for(const row of states.filter(s=>s.t>=active.t&&s.t<=commit.t)){
    assert.equal(row.phase,'battle');assert.equal(row.paused,false);assert.equal(row.speed,1,'Only observed 1x time is admitted');
  }
  const pointerUp=(index,names)=>{
    const action=actions[index];assert.ok(action&&names.includes(action.name),'Expected initial rendered action');
    assert.ok(Number.isSafeInteger(action.inputStart)&&Number.isSafeInteger(action.inputEnd)&&action.inputStart>=0&&action.inputEnd<=input.length);
    const edges=input.slice(action.inputStart,action.inputEnd).filter(e=>['pointerdown','pointerup'].includes(e.kind));
    assert.deepEqual(edges.map(e=>e.kind),['pointerdown','pointerup']);
    assert.ok(edges.every(e=>e.trusted===true&&e.target==='unity-canvas'&&e.timeOrigin===origin&&
      Number.isFinite(e.t)&&e.t>=0&&Math.abs(e.x-action.x)<1&&Math.abs(e.y-action.y)<1));
    assert.ok(edges[0].t<=edges[1].t);return edges[1];
  };
  const deploy=pointerUp(0,['Deploy','Redeploy']),unpause=pointerUp(1,['SpeedRate']);
  assert.ok(ready.t<=deploy.t&&deploy.t<=resume.t&&resume.t<=unpause.t&&unpause.t<=active.t&&active.t<commit.t);
  assert.ok(actions[0].inputEnd<=actions[1].inputStart,'Initial action ranges cannot overlap');
  const tickDelta=commit.tick-resume.tick;
  assert.ok(Number.isSafeInteger(tickDelta)&&tickDelta>0);assert.equal(tickDelta,fixture.nextWaveTicks);
  const added=Object.fromEntries(keys.map(key=>[key,after[key]-before[key]]));
  assert.ok(Object.values(added).every(v=>Number.isSafeInteger(v)&&v>=0),'History counters cannot roll back');
  assert.equal(added.activeMilliseconds,tickDelta*50,'Exact committed 1x steps fund active time');
  for(let n=0;n<10;n++)assert.equal(after.speedMilliseconds[n]-before.speedMilliseconds[n],n===1?tickDelta*50:0,'Only the 1x bin advances');
  // Console witnesses bracket native actions. The single millisecond allowance
  // is integer-floor rounding, not an extra frame or elapsed-time allowance.
  const pausedBounds=[Math.max(0,Math.floor(unpause.t-resume.t)-1),Math.ceil(active.t-deploy.t)+1];
  assert.ok(added.pausedMilliseconds>=pausedBounds[0]&&added.pausedMilliseconds<=pausedBounds[1],'Paused time is the initial resume-to-1x interval');
  const seedUtc=saved.research.lastObservedUtcMilliseconds;
  assert.ok(Number.isSafeInteger(seedUtc)&&seedUtc>=0&&seedUtc<=origin+ready.t+1,'Stable initial UTC clock');
  const closedBounds=[Math.max(0,Math.floor(origin-seedUtc)-1),Math.max(0,Math.ceil(origin+ready.t-seedUtc)+1)];
  assert.ok(added.closedMilliseconds>=closedBounds[0]&&added.closedMilliseconds<=closedBounds[1],'Closed time is bracketed by document load and initial ready UTC');
  assert.ok(added.activeMilliseconds<=Math.ceil(commit.t-unpause.t)+1,'Active time cannot exceed observed 1x wall time');
  assert.ok(added.activeMilliseconds+added.pausedMilliseconds<=Math.ceil(commit.t-deploy.t)+2,'Active and paused time cannot double count the observed interval');
  return {...added,pausedBounds,closedBounds,runId:run,timeOrigin:origin,resumeTick:resume.tick,committedTick:commit.tick};
}
export function admitMilestoneFixtures(fixtures,manifestPath,sourceRoot=root){
  assert.equal(fixtures.schema,'last-stand-earned-milestone-fixtures/v1');
  assert.equal(fixtures.storageKey,key);
  assert.ok(fixtures.commands?.length===2 && fixtures.commands.every(argv=>Array.isArray(argv)&&argv.length>=2&&argv.every(v=>typeof v==='string'&&v.length>0)));
  assert.deepEqual(Object.keys(fixtures.sourceSha256??{}).sort(),[...MILESTONE_FIXTURE_SOURCES].sort(),'Exact production and generator source closure required');
  for(const [path,sha]of Object.entries(fixtures.sourceSha256)){
    assert.match(sha,/^[a-f0-9]{64}$/);assert.equal(hash(readFileSync(resolve(sourceRoot,path))),sha,'Fixture source changed: '+path);
  }
  assert.deepEqual(fixtures.cases?.map(c=>`${c.fitting}:${c.targetWave}`).sort(),['launcher:100','launcher:300','repair:100','repair:300'],'All four unique milestone fixtures required');
  const directory=realpathSync(dirname(manifestPath));
  for(const fixture of fixtures.cases){
    for(const [field,suffix,shaField]of [['savePath','before','saveSha256'],['expectedSavePath','expected-next-clear','expectedSaveSha256']]){
      const expected=resolve(directory,`${fixture.fitting}-tier1-wave${fixture.targetWave}-${suffix}.json`);
      assert.equal(resolve(fixture[field]),expected,'Fixture must be its named sibling JSON file');
      assert.equal(realpathSync(fixture[field]),expected,'Fixture cannot follow a link outside its manifest directory');
      assert.equal(hash(readFileSync(expected)),fixture[shaField],'Fixture bytes changed');
    }
    admitMilestoneSaves(JSON.parse(readFileSync(fixture.savePath)),JSON.parse(readFileSync(fixture.expectedSavePath)),fixture);
    assert.ok(Number.isSafeInteger(fixture.nextWaveTicks)&&fixture.nextWaveTicks>0&&fixture.nextWaveTicks<=24000);
    assert.equal(fixture.expectedUnlockTier,fixture.targetWave===300?2:0);
    assert.equal(fixture.expectedUnlockFitting,fixture.targetWave===100?'scattergun':null);
  }
}

async function main(){
const manifestPath=resolve(process.argv[2]??'');
assert.ok(process.argv[2],'Supply an earned milestone fixture manifest');
const fixtureBytes=readFileSync(manifestPath),fixtures=JSON.parse(fixtureBytes);
const checkSources=()=>admitMilestoneFixtures(fixtures,manifestPath);
checkSources();
for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,encoding:'utf8'});
const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4173/singedTerra/');
const packaged=packagedRuntimeSnapshot(),runtime=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
for(const [path,sha]of Object.entries({...runtime.files,'index.html':runtime.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),sha);
const output=resolve(root,'campaign-unity/Evidence/waves-milestones',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(output,{recursive:true});
const hashes=()=>hashMilestoneRunnerInputs();
const report={status:'running',scope:'Real rendered 1x milestone, unlock and fitting behavior after accelerated production-earned setup; no normal-player duration, native media or endurance claim.',
  seeded:true,normalSpeed:true,host:process.platform,fixtureManifest:manifestPath,fixtureSha256:hash(fixtureBytes),inputs:hashes(),packaged,cases:[]};
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
try {
  for(const fixture of fixtures.cases){
    assert.ok(['launcher','repair'].includes(fixture.fitting)&&[100,300].includes(fixture.targetWave));
    const {bytes,saved,expected}=readMilestoneFixtureSaves(fixture);
    const context=await browser.newContext({viewport:{width:1366,height:768}});
    const page=await context.newPage(),states=[],layouts=[],input=[],errors=[];
    const item={fitting:fixture.fitting,targetWave:fixture.targetWave,status:'running',states,layouts,input,actions:[],shots:[],errors};
    report.cases.push(item);let observerError;
    const state=()=>states.at(-1),layout=()=>layouts.at(-1);
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{try{
      const raw=message.text();if(message.type()==='error')errors.push(raw);
      if(raw.startsWith('ST_WAVE_INPUT '))input.push(JSON.parse(raw.slice(14)));
      if(!raw.startsWith('ST_WAVE_OBSERVATION '))return;
      const {text,t,timeOrigin}=JSON.parse(raw.slice(20));
      if(text.startsWith('ST_LS_STATE '))states.push({...JSON.parse(text.slice(12)),t,timeOrigin});
      if(text.startsWith('ST_LS_HUD_LAYOUT '))layouts.push({...readShopControlObservation(text),t,timeOrigin});
    }catch(error){observerError??=error;}});
    const until=async(predicate,seconds=30)=>{const end=Date.now()+seconds*1000;
      while(Date.now()<end){if(observerError)throw observerError;if(predicate())return;await page.waitForTimeout(30);}
      throw new Error('Milestone state absent: '+JSON.stringify(state()));};
    const geometry=async()=>{const canvas=await page.locator('#unity-canvas').boundingBox();assert.ok(canvas);
      const pixels=await page.locator('#unity-canvas').evaluate(c=>({width:c.width,height:c.height}));
      await until(()=>layout()?.width===pixels.width&&layout()?.height===pixels.height,8);
      return {canvas,layout:layout(),targets:tierJourneyControlGeometry(layout(),canvas)};};
    const click=async name=>{
      let found;
      for(let n=0;n<40;n++){
        found=await geometry();const target=found.targets.find(c=>c.name===name);assert.ok(target,'Rendered target '+name);
        if(target.full)break;
        const l=found.layout,c=[...l.controls,...l.shopControls,...l.settingsControls].find(c=>c.name===name),clip=target.clip;
        const old=l.settingsScrollOffset+l.scrollOffset,sign=c.y<clip.y?-1:1;
        await page.mouse.move(found.canvas.x+(clip.x+clip.width/2)*found.canvas.width/l.width,
          found.canvas.y+(clip.y+clip.height/2)*found.canvas.height/l.height);
        await page.mouse.wheel(0,sign*100);await until(()=>Math.abs(layout().settingsScrollOffset+layout().scrollOffset-old)>.5,5);
      }
      assert.ok(found.targets.find(c=>c.name===name)?.full,'Complete target is visible');
      const l=found.layout,c=[...l.controls,...l.shopControls,...l.settingsControls].find(c=>c.name===name&&c.active&&c.interactable);assert.ok(c);
      const x=found.canvas.x+(c.x+c.width/2)*found.canvas.width/l.width,y=found.canvas.y+(c.y+c.height/2)*found.canvas.height/l.height,start=input.length;
      await page.mouse.click(x,y,{delay:80});await until(()=>input.slice(start).some(e=>e.kind==='pointerup'),5);
      const edges=input.slice(start).filter(e=>['pointerdown','pointerup'].includes(e.kind));
      assert.deepEqual(edges.map(e=>e.kind),['pointerdown','pointerup']);
      assert.ok(edges.every(e=>e.trusted&&e.target==='unity-canvas'&&Math.abs(e.x-x)<1&&Math.abs(e.y-y)<1));
      item.actions.push({name,x,y,inputStart:start,inputEnd:input.length});
    };
    const shot=async label=>{await geometry();const path=resolve(output,`${fixture.fitting}-${fixture.targetWave}-${label}.png`);
      await page.screenshot({path});item.shots.push({path,viewport:page.viewportSize(),state:state(),layout:layout()});};
    try {
      await page.addInitScript(WAVE_JOURNEY_PROBE);
      // An isolated test context imports the exact production-generated save
      // once. All subsequent simulation, rewards and selection use real input.
      await page.goto(base.href);await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:bytes.toString('utf8')});
      await page.goto(new URL('last-stand/',base).href);await until(()=>states.some(s=>s.action==='ready')&&state()?.saveState==='ready',60);
      assert.equal(state().hasCheckpoint,true);assert.equal(state().checkpointWave,fixture.targetWave-1);
      const resume=layout().controls.find(c=>c.active&&c.interactable&&['Deploy','Redeploy'].includes(c.name));assert.ok(resume);
      await click(resume.name);await until(()=>state()?.phase==='battle'&&state().paused);
      await assertMilestoneResumeReadback({state,saved,page,key});
      await click('SpeedRate');await until(()=>state()?.speed===1&&!state().paused);
      const begin=Date.now();await until(()=>state()?.completedWave===fixture.targetWave,fixture.nextWaveTicks*.05+45);
      await click('SpeedRate');await until(()=>state()?.paused);item.realWaveMilliseconds=Date.now()-begin;
      const actual=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key));item.actualSave=actual;
      assertMilestoneCompletedReadback({saved,expected,actual,fixture,item});
      assert.equal(actual.credits,saved.credits+fixture.expectedRepeatable+fixture.expectedFirstClear);
      const graphics=()=>JSON.parse(layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics;
      const receipt=()=>graphics().find(g=>g.active&&g.path.endsWith('/WaveReceipt'))?.text;
      await until(()=>receipt()?.includes('W'+fixture.targetWave));
      assert.match(receipt(),fixture.targetWave===100?/SCATTERGUN UNLOCKED/:/TIER 2 UNLOCKED/);
      await shot('reward-desktop');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await shot('reward-portrait');
      await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(200);
      await click('Menu');await until(()=>state()?.menu==='menu');await shot('menu-chrome');
      await click('MenuAbandon');await until(()=>state()?.menu==='confirm');await click('ConfirmProceed');
      await until(()=>!state()?.hasCheckpoint&&state()?.menu==='');
      if(fixture.targetWave===100){
        for(let i=0;i<3&&state()?.fittingId!=='scattergun';i++){
          const before=state().fittingId;await click('FittingNext');await until(()=>state()?.fittingId!==before);
        }
        assert.equal(state().fittingId,'scattergun');await shot('scattergun-fitted');
      }else{await click('TierNext');await until(()=>state()?.selectedTier===2&&!state().lockedTierPreview);await shot('tier-two-battlefield');}
      const deployment=layout().controls.find(c=>c.active&&c.interactable&&['Deploy','Redeploy'].includes(c.name));assert.ok(deployment);
      await click(deployment.name);await until(()=>state()?.phase==='battle');
      assert.equal(state().activeTier,fixture.targetWave===300?2:1);
      if(fixture.targetWave===100)assert.equal(state().fittingId,'scattergun');
      await page.waitForTimeout(1500);await shot('unlocked-deployment');
      assert.deepEqual(errors,[]);if(observerError)throw observerError;item.status='pass';
    }finally{await context.close();writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));}
  }
  checkSources();assertMilestoneRunnerInputs(report,hashes);assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());report.status='pass';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await browser.close();writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,error:report.error}));}
}

export function readMilestoneFixtureSaves(fixture,{readFile=readFileSync,hashBytes=hash}={}) {
    const bytes=readFile(fixture.savePath),expectedBytes=readFile(fixture.expectedSavePath);
    assert.equal(hashBytes(bytes),fixture.saveSha256);assert.equal(hashBytes(expectedBytes),fixture.expectedSaveSha256);
    const saved=JSON.parse(bytes),expected=JSON.parse(expectedBytes);
    admitMilestoneSaves(saved,expected,fixture);
  return {bytes,saved,expected};
}
export async function assertMilestoneResumeReadback({state,saved,page,key}) {
      assert.equal(state().tick,saved.checkpoint.encounter.tick);assert.equal(state().hull,saved.checkpoint.encounter.hull);
      assertWaveSavePreserved(saved,JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key)));
}
export function assertMilestoneCompletedReadback({saved,expected,actual,fixture,item}) {
      const normalized=value=>{const copy=structuredClone(value);const shop=copy.checkpoint.shop;
        assert.ok(Number.isSafeInteger(shop.purchaseSequence)&&shop.purchaseSequence>=Object.values(shop.runPurchases).reduce((a,b)=>a+b,0));
        delete shop.purchaseSequence;return copy;};
      item.historyTiming=assertMilestoneHistoryTiming(saved,expected,actual,fixture,item);
      const comparable=structuredClone(actual);
      for(const key of ['activeMilliseconds','pausedMilliseconds','closedMilliseconds','speedMilliseconds'])
        comparable.history.current[key]=structuredClone(expected.history.current[key]);
      assertWaveSavePreserved(normalized(expected),normalized(comparable));
}
export const MILESTONE_RUNNER_INPUTS=Object.freeze(['scripts/last-stand-wave-milestones.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandJourney.mjs','e2e/helpers/lastStandWaveOracle.mjs',
  ...LAST_STAND_HELPER_INPUTS,'campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json','campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v4.json']);
export function hashMilestoneRunnerInputs({directory=root,readFile=readFileSync,resolvePath=resolve,hashBytes=hash}={}) {
  return Object.fromEntries(MILESTONE_RUNNER_INPUTS.map(path=>[path,hashBytes(readFile(resolvePath(directory,path)))]));
}
export function assertMilestoneRunnerInputs(report,hashes=hashMilestoneRunnerInputs) { assert.deepEqual(hashes(),report.inputs); }

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

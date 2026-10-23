// Explicit accelerated, production-earned setup. This is separate from the
// ordinary fresh-account journey and does not establish elapsed-time endurance.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,
  fetchBoundRuntime,assertServedBytes,readShopControlObservation} from '../e2e/helpers/lastStandJourney.mjs';
import {tierJourneyControlGeometry} from '../e2e/helpers/lastStandTierJourney.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';

const root=resolve(import.meta.dirname,'..'),key='singedTerra.lastStand.prototype.v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const MILESTONE_FIXTURE_SOURCES=Object.freeze([
  ...['EncounterModel','EncounterProfile','LastStandProgression','LastStandStore','LastStandRunClock',
    'LastStandSpeedPolicy','LastStandShopState','LastStandWaveCatalog','LastStandUpgradeCatalog','LastStandTierCatalog',
    'LastStandRunCheckpoint','LastStandProgressionSave','LastStandLegacySave','LastStandSaveJson',
    'LastStandRewardCatalog','MechanicsShopModel','LastStandSelection'].map(name=>'campaign-unity/Unity/Assets/Scripts/'+name+'.cs'),
  'campaign-unity/Tools/last_stand_waves/EarnedMilestoneFixtures.cs',
  'campaign-unity/Tools/last_stand_waves/generate_earned_milestone_fixtures.py',
  'campaign-unity/Tools/last_stand_source_closure.py']);
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
const inputs=['scripts/last-stand-wave-milestones.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandJourney.mjs'];
const hashes=()=>Object.fromEntries(inputs.map(path=>[path,hash(readFileSync(resolve(root,path)))]));
const report={status:'running',scope:'Real rendered 1x milestone, unlock and fitting behavior after accelerated production-earned setup; no normal-player duration, native media or endurance claim.',
  seeded:true,normalSpeed:true,host:process.platform,fixtureManifest:manifestPath,fixtureSha256:hash(fixtureBytes),inputs:hashes(),packaged,cases:[]};
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
try {
  for(const fixture of fixtures.cases){
    assert.ok(['launcher','repair'].includes(fixture.fitting)&&[100,300].includes(fixture.targetWave));
    const bytes=readFileSync(fixture.savePath),expectedBytes=readFileSync(fixture.expectedSavePath);
    assert.equal(hash(bytes),fixture.saveSha256);assert.equal(hash(expectedBytes),fixture.expectedSaveSha256);
    const saved=JSON.parse(bytes),expected=JSON.parse(expectedBytes);
    assert.equal(saved.version,4);assert.equal(saved.checkpoint.encounter.completedWave,fixture.targetWave-1);
    assert.equal(expected.checkpoint.encounter.completedWave,fixture.targetWave);
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
      assert.equal(state().tick,saved.checkpoint.encounter.tick);assert.equal(state().hull,saved.checkpoint.encounter.hull);
      assert.deepEqual(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key)),saved);
      await click('SpeedRate');await until(()=>state()?.speed===1&&!state().paused);
      const begin=Date.now();await until(()=>state()?.completedWave===fixture.targetWave,fixture.nextWaveTicks*.05+45);
      await click('SpeedRate');await until(()=>state()?.paused);item.realWaveMilliseconds=Date.now()-begin;
      const actual=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key));item.actualSave=actual;
      const normalized=value=>{const copy=structuredClone(value);const shop=copy.checkpoint.shop;
        assert.ok(Number.isSafeInteger(shop.purchaseSequence)&&shop.purchaseSequence>=Object.values(shop.runPurchases).reduce((a,b)=>a+b,0));
        delete shop.purchaseSequence;return copy;};
      assert.deepEqual(normalized(actual),normalized(expected),'Every durable field except the volatile quote epoch matches independently restored production execution');
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
  checkSources();assert.deepEqual(hashes(),report.inputs);assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());report.status='pass';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await browser.close();writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,error:report.error}));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

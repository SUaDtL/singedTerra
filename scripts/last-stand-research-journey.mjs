// Explicit development seeds in disposable browser contexts. Only the initial
// import writes storage; every tested action uses ordinary canvas input.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,fetchBoundRuntime,
  assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls as controls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';

const root=resolve(import.meta.dirname,'..'),key='singedTerra.lastStand.prototype.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=['scripts/last-stand-research-journey.mjs','e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,
  'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs','e2e/helpers/lastStandBrowserActor.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json'];
export function researchJourneyInputHashes(sourceRoot=root){return Object.fromEntries(inputs.map(path=>[path,sha(readFileSync(resolve(sourceRoot,path)))]));}
const hashes=researchJourneyInputHashes;
const tracks=['gameSpeed','salvageRecovery','researchSpeed','scrapLogistics'];

export function admitResearchFixtures(manifest,manifestPath,sourceRoot=root){
  assert.equal(manifest.schema,'last-stand-research-qualification-fixtures/v1');
  assert.equal(manifest.storageKey,key);assert.match(manifest.scope,/development seeds/i);
  assert.equal(manifest.clockMode,'current UTC final anchors; synthetic earlier training','Fixed regression clocks cannot qualify a browser');
  assert.ok(Number.isSafeInteger(manifest.generatedUtcMilliseconds));
  assert.deepEqual(manifest.cases?.map(row=>row.id).sort(),['lab-near-completion','mature-5x']);
  const sources=manifest.sourceSha256;assert.ok(sources&&Object.keys(sources).length>=10);
  for(const required of ['LastStandProgression','LastStandResearchState','LastStandResearchCatalog','LastStandRunHistory','LastStandUpgradeCatalog'])
    assert.ok(Object.hasOwn(sources,'campaign-unity/Unity/Assets/Scripts/'+required+'.cs'),'Required production source '+required);
  for(const [path,expected]of Object.entries(sources)){
    assert.ok(!isAbsolute(path)&&!path.includes('..')&&!path.includes('\\'),'Repository-relative source');
    assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(resolve(sourceRoot,path))),expected,'Fixture source changed: '+path);
  }
  const directory=realpathSync(dirname(manifestPath));
  for(const row of manifest.cases){
    assert.equal(row.savePath,row.id+'.json','Named relative sibling save required');
    const file=resolve(directory,row.savePath);assert.equal(realpathSync(file),file,'Fixture cannot escape through a link');
    assert.equal(sha(readFileSync(file)),row.saveSha256,'Exact production-generated fixture bytes');
    const saved=JSON.parse(readFileSync(file,'utf8'));assert.equal(saved.version,6,'Current research fixture requires save version 6');assert.equal(saved.checkpoint,null);
    assert.ok(Number.isSafeInteger(row.createdUtcMilliseconds)&&row.createdUtcMilliseconds<=Date.now()+1000);
    assert.equal(saved.research.lastObservedUtcMilliseconds,row.createdUtcMilliseconds);
    assert.deepEqual(Object.keys(saved.research.completedRanks).sort(),[...tracks].sort());
  }
}

async function main(){
  assert.ok(process.argv[2],'Usage: node scripts/last-stand-research-journey.mjs <fixture-manifest> [new-output-directory]');
  const manifestPath=resolve(process.argv[2]),fixtureBytes=readFileSync(manifestPath),fixtures=JSON.parse(fixtureBytes);
  admitResearchFixtures(fixtures,manifestPath);
  const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4173/singedTerra/');
  for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
    execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
  const packaged=packagedRuntimeSnapshot(),inputHashes=hashes();
  const runtime=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
  const boundFiles={...runtime.files,'index.html':runtime.wrapperSha256};
  for(const [path,expected]of Object.entries(boundFiles))assertServedBytes(await fetchBoundRuntime(base,path),expected);
  const output=resolve(process.argv[3]??resolve(root,'campaign-unity/Evidence/research-browser',new Date().toISOString().replace(/[:.]/g,'-')));
  mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
  const report={schema:'last-stand-research-browser-journey/v1',status:'running',
    scope:'Source-bound headless browser input, save and rendered screenshots. Development seeds are not ordinary earned progression, elapsed endurance, native acceptance or owner visual approval.',
    fixtureManifest:{path:manifestPath,sha256:sha(fixtureBytes),scope:fixtures.scope},packaged,inputs:inputHashes,runs:[],checks:[]};
  const persist=()=>writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));
  const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
  const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const contexts=[];
  async function contextFor(id){
    const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,
      proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});contexts.push(context);
    await context.addInitScript(WAVE_JOURNEY_PROBE);
    const fixture=fixtures.cases.find(row=>row.id===id);
    if(fixture){
      const seed=await context.newPage();await seed.goto(base.href);
      const raw=readFileSync(resolve(dirname(manifestPath),fixture.savePath),'utf8');
      await seed.evaluate(({key,raw})=>{if(localStorage.getItem(key)!==null)throw new Error('Development seed requires empty isolated storage');localStorage.setItem(key,raw);},{key,raw});
      await seed.close();
    }
    return context;
  }
  const actor=(context,id,options={})=>createLastStandBrowserActor({context,id,report,output,base,persist,...options});

  try{
    // Start this fixture first to keep its deliberately near-complete project
    // within a real closing/reopening window. Generate with --lab-remaining-ms 60000.
    const labContext=await contextFor('lab-near-completion');let lab=await actor(labContext,'lab-desktop');
    await lab.click('ResearchEntry');await lab.until(()=>lab.state().menu==='research');await lab.shot('initial-lab');
    const beforeClose=await lab.stored('before-real-close'),project=beforeClose.research.slots[0].active;
    assert.ok(project);const remaining=project.durationMilliseconds-project.earnedMilliseconds;
    const completionExpected=project.rank===1&&remaining<=60000;
    await lab.page.close();
    await new Promise(resolve=>setTimeout(resolve,completionExpected?remaining+700:2500));
    lab=await actor(labContext,'lab-reopened');const reopened=await lab.stored('after-real-reopen');
    check('closed tab retains funding and advances only research',()=>{
      assert.equal(reopened.credits,beforeClose.credits);assert.equal(reopened.checkpoint,null);
      assert.deepEqual(reopened.history,beforeClose.history);
      assert.ok(reopened.research.lastObservedUtcMilliseconds>beforeClose.research.lastObservedUtcMilliseconds);
      if(completionExpected){assert.equal(reopened.research.completedRanks.gameSpeed,1);assert.equal(reopened.research.slots[0].active.identity,beforeClose.research.slots[0].queued.identity);}
      else assert.ok(reopened.research.slots[0].active.earnedMilliseconds>project.earnedMilliseconds||reopened.research.completionSequence>beforeClose.research.completionSequence);
    });
    report.closedCompletionObserved=completionExpected;report.initialCompletionMayPrecedeFirstLoad=!completionExpected;
    await lab.click('ResearchEntry');await lab.select('salvageRecovery');const beforeStart=await lab.stored('before-start');
    await lab.shot('ready-to-start');
    await lab.click('ResearchStart1');let saved=await lab.stored('started');
    check('visible Start uses shared wallet once',()=>{assert.equal(saved.research.slots[1].active.track,'salvageRecovery');assert.equal(saved.credits,beforeStart.credits-saved.research.slots[1].active.chargedCost);});
    await lab.select('researchSpeed');const beforeQueue=saved;await lab.click('ResearchQueue1');saved=await lab.stored('queued');
    check('one funded queued project',()=>{assert.equal(saved.research.slots[1].queued.track,'researchSpeed');assert.equal(saved.credits,beforeQueue.credits-saved.research.slots[1].queued.chargedCost);});
    const beforeSuspend=saved;await lab.click('ResearchSuspend1');saved=await lab.stored('suspended-promoted');
    check('Suspend refunds active and promotes paid queue',()=>{assert.equal(saved.credits,beforeSuspend.credits+beforeSuspend.research.slots[1].active.chargedCost);assert.equal(saved.research.slots[1].active.identity,beforeSuspend.research.slots[1].queued.identity);assert.equal(saved.research.slots[1].queued,null);assert.equal(saved.research.partials.salvageRecovery.identity,beforeSuspend.research.slots[1].active.identity);});
    await lab.select('scrapLogistics');const beforeSwitch=saved;await lab.click('ResearchSwitch1');saved=await lab.stored('switched');
    check('Switch keeps partial time and reconciles refund/replacement cost',()=>{assert.equal(saved.research.slots[1].active.track,'scrapLogistics');assert.equal(saved.credits,beforeSwitch.credits+beforeSwitch.research.slots[1].active.chargedCost-saved.research.slots[1].active.chargedCost);assert.equal(saved.research.partials.researchSpeed.identity,beforeSwitch.research.slots[1].active.identity);});
    await lab.shot('projects-active');await lab.page.setViewportSize({width:390,height:844});await lab.page.waitForTimeout(200);await lab.shot('portrait-detail');
    if(controls(lab.layout()).some(item=>item.name==='ResearchBack'&&item.active))await lab.click('ResearchBack');await lab.shot('portrait-list');
    await lab.page.setViewportSize({width:1366,height:768});await lab.page.waitForTimeout(200);
    // The original document keeps its browser-owned exclusive writer lock.
    // A second document can inspect the profile, but Retry cannot take the
    // lock. Closing the owner and reloading the second document transfers it.
    const beforeSecond=await lab.stored('before-read-only-tab');
    const second=await actor(labContext,'second-tab',{saveState:'blocked'});
    assert.match(second.state().saveError,/another last stand tab.*own this profile/i);
    await second.click('RetrySave');await second.until(()=>second.state().saveState==='blocked');
    await second.click('Menu');await second.click('MenuResearch');await second.select('salvageRecovery');
    const blocked=await second.stored('read-only-after-retry-and-inspection');
    check('second tab remains read-only while the original owns the profile',()=>{
      assert.equal(second.state().saveState,'blocked');
      assert.ok(controls(second.layout()).filter(item=>/^Research(Start|Queue|Switch|Suspend|RemoveQueued)/.test(item.name)).every(item=>!item.active||!item.interactable));
      assert.equal(blocked.credits,beforeSecond.credits);
      assert.equal(blocked.research.slots[1].active.identity,beforeSecond.research.slots[1].active.identity);
      assert.equal(blocked.research.slots[1].queued,null);
      assert.deepEqual(blocked.permanentLevels,beforeSecond.permanentLevels);
    });
    await second.shot('read-only-lab');
    await lab.page.bringToFront();await lab.click('ResearchClose');await lab.click('ResearchEntry');
    const retained=await lab.stored('original-writer-retained');
    check('original owner retains its wallet and funded project',()=>{
      assert.equal(lab.state().saveState,'ready');assert.equal(retained.credits,beforeSecond.credits);
      assert.equal(retained.research.slots[1].active.identity,beforeSecond.research.slots[1].active.identity);
      assert.equal(retained.research.slots[1].queued,null);
    });
    await lab.page.close();await second.page.bringToFront();await second.reload();
    await second.click('ResearchEntry');await second.select('salvageRecovery');
    const acquired=await second.stored('second-writer-after-owner-close-and-reload');
    await second.click('ResearchQueue1');const winner=await second.stored('new-owner-funded-queue');
    check('reloaded second tab acquires ownership and funds one queue',()=>{
      assert.equal(second.state().saveState,'ready');assert.equal(acquired.credits,retained.credits);
      assert.equal(acquired.research.slots[1].active.identity,retained.research.slots[1].active.identity);
      assert.equal(acquired.research.slots[1].queued,null);
      assert.equal(winner.research.slots[1].queued.track,'salvageRecovery');
      assert.equal(winner.credits,acquired.credits-winner.research.slots[1].queued.chargedCost);
      assert.equal(winner.research.slots[1].active.identity,acquired.research.slots[1].active.identity);
    });
    await second.click('ResearchClose');await second.click('ShopEntry');const beforeBulk=await second.stored('before-bulk');
    for(const label of ['[1]','[10]','[100]','[MAX]']){
      assert.ok(controls(second.layout()).find(item=>item.name==='ShopQuantity').label.includes(label));
      await second.click('ShopQuantity');
    }
    await second.click('ShopQuantity');await second.until(()=>second.shop()?.cards.find(card=>card.key==='cannonAttack')?.purchaseQuantity===10);
    const quote=second.shop().cards.find(card=>card.key==='cannonAttack');await second.click('ShopCard_cannonAttackBuy');const afterBulk=await second.stored('after-bulk');
    check('bulk selection is free and one click buys displayed aggregate',()=>{assert.equal(afterBulk.credits,beforeBulk.credits-quote.quotedCost);assert.equal(afterBulk.permanentLevels.cannonAttack,quote.resultLevel);});
    await second.shot('bulk-desktop');await second.page.setViewportSize({width:390,height:844});await second.page.waitForTimeout(200);await second.shot('bulk-portrait');
    await second.click('ShopClose');await second.click('Menu');await second.click('MenuHistory');await second.shot('history-portrait');
    await second.click('RunHistoryClose');assert.equal(second.state().menu,'');await labContext.close();

    const freshContext=await contextFor(null),fresh=await actor(freshContext,'ordinary-fresh');const freshSave=await fresh.stored('ordinary-created');
    await fresh.click('ResearchEntry');await fresh.select('gameSpeed');
    check('ordinary fresh profile exposes locked Labs without purchasable action',()=>{
      assert.equal(freshSave.credits,0);assert.ok(Object.values(freshSave.research.completedRanks).every(rank=>rank===0));
      assert.ok(controls(fresh.layout()).filter(item=>/^Research(Start|Queue|Switch|Suspend|RemoveQueued)/.test(item.name)).every(item=>!item.active||!item.interactable));
      assert.match(controls(fresh.layout()).find(item=>item.name==='ResearchProject-gameSpeed').label,/PREVIEW - RESEARCH LOCKED/);
      assert.ok(controls(fresh.layout()).some(item=>item.name==='ResearchHelp'&&item.active&&item.interactable),'Rules remain available through explicit help');
    });await fresh.shot('locked-lab');await freshContext.close();

    const matureContext=await contextFor('mature-5x'),mature=await actor(matureContext,'mature-speed');
    const matureSave=await mature.stored('before-deploy');assert.equal(matureSave.research.completedRanks.gameSpeed,8);
    const deploy=controls(mature.layout()).find(item=>['Deploy','Redeploy'].includes(item.name)&&item.active&&item.interactable);assert.ok(deploy);
    await mature.click(deploy.name);await mature.until(()=>mature.state().phase==='battle');
    for(let rate=1.5;rate<=5;rate+=.5){await mature.click('SpeedPlus');await mature.until(()=>mature.state().speed===rate);}
    check('earned maximum stops at five',()=>assert.equal(controls(mature.layout()).find(item=>item.name==='SpeedPlus').interactable,false));
    await mature.click('SpeedRate');await mature.until(()=>mature.state().paused&&mature.state().speed===0);const pausedTick=mature.state().tick;
    await mature.page.waitForTimeout(800);assert.equal(mature.state().tick,pausedTick);await mature.click('SpeedRate');await mature.until(()=>mature.state().speed===5&&!mature.state().paused);
    for(let rate=4.5;rate>=0;rate-=.5){await mature.click('SpeedMinus');await mature.until(()=>mature.state().speed===rate);}
    check('half-step slowdown reaches pause',()=>{assert.equal(mature.state().paused,true);assert.equal(mature.state().selectedSpeed,0);});
    await mature.click('SpeedPlus');await mature.until(()=>mature.state().speed===.5&&!mature.state().paused);await mature.shot('half-speed');
    await mature.click('Menu');await mature.click('MenuAbandon');await mature.click('ConfirmProceed');await mature.until(()=>mature.state().phase!=='battle'&&!mature.state().hasCheckpoint);
    const finalized=await mature.stored('explicit-abandon');check('explicit abandon finalizes one observed run',()=>{assert.equal(finalized.history.lifetime.runs,matureSave.history.lifetime.runs+1);assert.equal(finalized.history.recent.at(-1).finishReason,'abandon');assert.ok(finalized.history.recent.at(-1).activeMilliseconds>0);});
    await mature.click('Menu');await mature.click('MenuHistory');await mature.shot('finalized-history');await matureContext.close();
    assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(hashes(),inputHashes);
    assert.equal(sha(readFileSync(manifestPath)),sha(fixtureBytes));admitResearchFixtures(fixtures,manifestPath);
    for(const [path,expected]of Object.entries(boundFiles))assertServedBytes(await fetchBoundRuntime(base,path),expected);
    for(const run of report.runs)assert.deepEqual(run.errors,[],'No browser errors in '+run.id);
    report.status='passed';persist();console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,closedCompletionObserved:report.closedCompletionObserved}));
  }catch(error){report.status='failed';report.error=String(error?.stack??error);persist();throw error;}
  finally{for(const context of contexts)await context.close().catch(()=>{});await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();

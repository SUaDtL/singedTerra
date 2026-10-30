import {LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
// Declared development profiles reach late content; all player actions use
// normal input in disposable contexts. This is not earned progression proof.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,fetchBoundRuntime,assertServedBytes} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls as controls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';

const root=resolve(import.meta.dirname,'..'),key='singedTerra.lastStand.prototype.v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const inputs=['scripts/last-stand-combat-depth-journey.mjs','e2e/helpers/lastStandBrowserActor.mjs',
  'e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json'];
const hashes=()=>Object.fromEntries(inputs.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
const fits=['repair','launcher','scattergun','mortar','railgun'];
const environments=['sunlit-ash','iron-perimeter','cinder-basin','storm-foundry'];

export function admitFixtures(manifest,path,sourceRoot=root){
  assert.equal(manifest.schema,'last-stand-combat-depth-presentation-fixtures/v1');
  assert.equal(manifest.storageKey,key);assert.match(manifest.scope,/development/i);
  assert.equal(manifest.clockMode,'current UTC final anchors; synthetic earlier training');
  assert.equal(manifest.sourceUnchanged,true);
  assert.ok(Object.keys(manifest.sourceSha256).length>=20);
  for(const [name,expected]of Object.entries(manifest.sourceSha256)){
    assert.ok(!isAbsolute(name)&&!name.includes('..')&&!name.includes('\\'));
    assert.equal(sha(readFileSync(resolve(sourceRoot,name))),expected,'Fixture source changed: '+name);
  }
  const directory=realpathSync(dirname(path));
  const fixtureIds=['roster-ready','tier2-before-elite','legacy-v4'];
  assert.deepEqual(manifest.cases.map(row=>row.id).sort(),[...fixtureIds].sort(),'Exactly the three declared fixture identities');
  for(const row of manifest.cases){
    assert.equal(row.savePath,row.id+'.json');const file=resolve(directory,row.savePath);
    assert.equal(dirname(file),directory,'Fixture must be a direct sibling of its manifest');
    assert.equal(realpathSync(file),file);assert.equal(sha(readFileSync(file)),row.saveSha256);
    const value=JSON.parse(readFileSync(file));assert.equal(value.version,row.version);
    if(row.id==='legacy-v4')assert.equal(value.version,4);
    if(row.id!=='legacy-v4'){
      assert.equal(value.version,6);assert.ok(Number.isSafeInteger(row.createdUtcMilliseconds)&&row.createdUtcMilliseconds<=Date.now()+1000);
      assert.equal(value.research.lastObservedUtcMilliseconds,row.createdUtcMilliseconds);
    }
  }
  assert.ok(manifest.cases.some(c=>c.id==='roster-ready'));
}

export function assertFittingCallout(callout,{fitting,width,height}){
  const targets={repair:'Attachment_Repair',launcher:'Attachment_Launcher',scattergun:'Attachment_Scattergun',mortar:'Attachment_Mortar',railgun:'Attachment_Railgun'};
  assert.ok(Object.hasOwn(targets,fitting));assert.equal(callout.visible,true);
  assert.equal(callout.target,targets[fitting]);assert.equal(callout.width,width);assert.equal(callout.height,height);
  for(const point of [callout.projectedAnchor,callout.endpointScreen]){
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
    assert.ok(point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height,'Callout anchor is inside the current canvas');
  }
  assert.ok(Math.abs(callout.projectedAnchor.x-callout.endpointScreen.x)<2);
  assert.ok(Math.abs(callout.projectedAnchor.y-callout.endpointScreen.y)<2);
}
export function verifyFixtureAfter(manifest,path,originalBytes,sourceRoot=root){
  assert.equal(sha(readFileSync(path)),sha(originalBytes),'Fixture manifest bytes changed during the player check');
  admitFixtures(manifest,path,sourceRoot);
}

async function main(){
  assert.ok(process.argv[2],'Usage: node scripts/last-stand-combat-depth-journey.mjs <fixture manifest> <fresh output>');
  const manifestPath=resolve(process.argv[2]),fixtureBytes=readFileSync(manifestPath),manifest=JSON.parse(fixtureBytes);
  admitFixtures(manifest,manifestPath);
  const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4174/singedTerra/');
  for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
  const packaged=packagedRuntimeSnapshot(),inputHashes=hashes();
  const runtime=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
  const bound={...runtime.files,'index.html':runtime.wrapperSha256};
  for(const [path,expected]of Object.entries(bound))assertServedBytes(await fetchBoundRuntime(base,path),expected);
  const output=resolve(process.argv[3]??resolve(root,'campaign-unity/Evidence/combat-depth-browser',new Date().toISOString().replace(/[:.]/g,'-')));
  mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
  const report={schema:'last-stand-combat-depth-browser/v1',status:'running',packaged,inputs:inputHashes,
    fixtureManifest:{path:manifestPath,sha256:sha(fixtureBytes)},scope:'Isolated development profiles, actual packaged rendering/input/save observations. Not earned progression, native/device audio or endurance acceptance.',runs:[],checks:[]};
  const persist=()=>writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));
  const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
  const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true,chromiumSandbox:true});const contexts=[];
  async function actor(id){
    const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,hasTouch:true,
      proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});contexts.push(context);
    await context.addInitScript(WAVE_JOURNEY_PROBE);
    const row=manifest.cases.find(c=>c.id===id);assert.ok(row);
    const seed=await context.newPage();await seed.goto(base.href);
    const raw=readFileSync(resolve(dirname(manifestPath),row.savePath),'utf8');
    await seed.evaluate(({key,raw})=>{if(localStorage.getItem(key)!==null)throw new Error('Isolated storage must be empty');localStorage.setItem(key,raw);},{key,raw});
    await seed.close();return createLastStandBrowserActor({context,id,report,output,base,persist});
  }
  async function selectFit(a,fit,touch=false){
    for(let n=0;a.state().fittingId!==fit&&n<5;n++){
      const current=fits.indexOf(a.state().fittingId);assert.ok(current>=0);
      await a.click(current<fits.indexOf(fit)?'FittingNext':'FittingPrevious',{touch});
    }
    assert.equal(a.state().fittingId,fit);
  }
  async function selectTier(a,tier,touch=false){
    for(let n=0;Number(a.state().garageTierId)!==tier&&n<4;n++)
      await a.click(Number(a.state().garageTierId)<tier?'TierNext':'TierPrevious',{touch});
    assert.equal(Number(a.state().garageTierId),tier);assert.equal(a.state().environmentId,environments[tier-1]);
  }
  async function abandon(a){await a.click('Menu');await a.click('MenuAbandon');await a.click('ConfirmProceed');await a.until(()=>a.state().phase!=='battle'&&!a.state().hasCheckpoint);}
  async function deploy(a){
    const candidates=controls(a.layout()).filter(c=>['Deploy','Redeploy'].includes(c.name)&&c.active&&c.interactable);
    assert.equal(candidates.length,1,'One current deploy/resume action');await a.click(candidates[0].name);
  }
  try{
    const a=await actor('roster-ready');
    for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:568,height:320}]){
      const touch=viewport.width<1000;await a.page.setViewportSize(viewport);await a.geometry();
      for(const fit of fits){
        const calloutStart=a.run.callouts.length;
        await selectFit(a,fit,touch);await a.geometry();
        await a.until(()=>{
          if(a.run.callouts.length<=calloutStart)return false;
          try{assertFittingCallout(a.run.callouts.at(-1),{fitting:fit,width:a.layout().width,height:a.layout().height});return true;}catch{return false;}
        });
        const callout=a.run.callouts.at(-1);check(`attached ${fit} callout ${viewport.width}`,()=>{
          assertFittingCallout(callout,{fitting:fit,width:a.layout().width,height:a.layout().height});
        });await a.shot('garage-'+viewport.width+'-'+fit);
      }
      for(let tier=1;tier<=4;tier++){await selectTier(a,tier,touch);await a.shot('environment-'+viewport.width+'-'+tier);}
      await a.click('Menu',{touch});await a.shot('menu-'+viewport.width);await a.click('SettingsClose',{touch});
    }
    await a.page.setViewportSize({width:1366,height:768});await a.geometry();await selectTier(a,2);
    for(const fit of fits){
      await selectFit(a,fit);await deploy(a);await a.until(()=>a.state().phase==='battle');
      for(let speed=1.5;a.state().speed<5&&speed<=5;speed+=.5)await a.click('SpeedPlus');
      await a.until(()=>a.state().completedWave>=1,60);
      await a.click('SpeedRate');await a.until(()=>a.state().paused);
      check(fit+' uses current edition in actual player',()=>{
        assert.equal(a.state().profileVersion,'last-stand-waves-v2');assert.equal(a.state().contentVersion,'last-stand-content-v2');
        assert.equal(a.state().economyVersion,'combat-depth-economy-v4');assert.equal(a.state().fittingId,fit);
        if(fit==='mortar')assert.ok(a.state().mortarShots>0);if(fit==='railgun')assert.ok(a.state().railgunShots>0);
      });await a.shot('battle-'+fit);await a.click('WaveInfo');await a.shot('wave-stats-'+fit);
      const text=JSON.parse(a.layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics.map(g=>g.text??'').join('\n');
      check(fit+' exposes wave combat and value stats',()=>{for(const term of ['Armor:','Damage:','Scrap','Windup:'])assert.ok(text.includes(term),term);});
      await a.click('SettingsClose');await a.click('ShopEntry');await a.shot('run-shop-'+fit);
      if(['mortar','railgun'].includes(fit)){
        const track=fit+'Attack',before=a.shop(),quote=before.cards.find(c=>c.key===track);
        assert.ok(quote.canPurchase);await a.click('ShopCard_'+track+'Buy');
        await a.until(()=>a.shop().cards.find(c=>c.key===track).level===quote.resultLevel);
        check(fit+' purchase charges the displayed price and updates its effect',()=>{
          const after=a.shop(),card=after.cards.find(c=>c.key===track);
          assert.equal(after.scrap,before.scrap-quote.quotedCost);assert.equal(card.currentEffect,quote.resultEffect);
          assert.equal(after.spentScrap,before.spentScrap+quote.quotedCost);
        });await a.shot('purchased-'+fit);
      }
      await a.click('ShopClose');
      if(['mortar','railgun'].includes(fit)){
        const saved=await a.stored('before-reload-'+fit);await a.reload();await deploy(a);await a.until(()=>a.state().phase==='battle'&&a.state().paused);
        check(fit+' resumes the saved wave boundary',()=>{
          const e=saved.checkpoint.encounter;assert.equal(a.state().tick,e.tick);assert.equal(a.state().completedWave,e.completedWave);
          for(const field of ['mortarShots','railgunShots','mortarDamage','railgunDamage'])assert.equal(a.state()[field],e[field]);
        });await a.shot('resumed-'+fit);
      }
      await abandon(a);
    }
    // Keyboard activation follows actual focus; no injected callbacks.
    for(let n=0;n<80&&a.layout().selection!=='Menu';n++){await a.page.keyboard.press('Tab');await a.page.waitForTimeout(60);}
    assert.equal(a.layout().selection,'Menu');await a.page.keyboard.press('Enter');await a.until(()=>a.state().menu==='menu');
    await a.shot('keyboard-menu');await a.click('SettingsClose');
    const elite=await actor('tier2-before-elite');await deploy(elite);await elite.until(()=>elite.state().phase==='battle'&&elite.state().paused);
    await elite.click('Menu');await elite.click('MenuSettings');await elite.click('SettingsTab1');await elite.click('DisplayEffects');
    await elite.until(()=>elite.run.encounters.at(-1)?.fullEffects===false);await elite.click('SettingsClose');
    const eliteBoundary=await elite.stored('before-elite-wave');
    for(let speed=1.5;elite.state().selectedSpeed<5&&speed<=5;speed+=.5)await elite.click('SpeedPlus');
    if(elite.state().paused)await elite.click('SpeedRate');
    // The elite is the last member of this actual eight-enemy cohort. Wait for
    // all spawns so the battle image includes it, rather than an empty wave start.
    await elite.until(()=>elite.state().wave===50&&elite.state().remainingWaveEnemies>0&&
      elite.run.encounters.at(-1)?.spawned>=eliteBoundary.checkpoint.encounter.spawned+8,60);
    await elite.click('SpeedRate');await elite.until(()=>elite.state().paused);await elite.click('WaveInfo');
    check('wave 50 lists the actual elite under reduced effects',()=>{
      const text=JSON.parse(elite.layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics.map(g=>g.text??'').join('\n');
      assert.ok(text.includes('SIEGE ELITE'));assert.ok(text.includes('Windup: 1.5 s'));
      assert.equal(elite.run.encounters.at(-1).fullEffects,false);
    });await elite.shot('elite-wave-stats');await elite.click('SettingsClose');await elite.shot('elite-reduced-effects-battle');
    if(manifest.cases.some(c=>c.id==='legacy-v4')){
      const old=await actor('legacy-v4'),original=JSON.parse(readFileSync(resolve(dirname(manifestPath),'legacy-v4.json')));
      await deploy(old);await old.until(()=>old.state().phase==='battle'&&old.state().paused);
      check('retained run restores original rules and progress',()=>{
        assert.equal(old.state().profileVersion,'last-stand-waves-v1');assert.equal(old.state().contentVersion,'last-stand-content-v1');
        assert.equal(old.state().tick,original.checkpoint.encounter.tick);assert.equal(old.state().completedWave,original.checkpoint.encounter.completedWave);
      });await old.shot('retained-resume');
    }
    assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(hashes(),inputHashes);verifyFixtureAfter(manifest,manifestPath,fixtureBytes);
    for(const [path,expected]of Object.entries(bound))assertServedBytes(await fetchBoundRuntime(base,path),expected);
    for(const run of report.runs)assert.deepEqual(run.errors,[],'No browser errors in '+run.id);
    report.status='passed';persist();console.log(JSON.stringify({status:report.status,output,checks:report.checks.length}));
  }catch(error){report.status='failed';report.error=String(error?.stack??error);persist();throw error;}
  finally{for(const context of contexts)await context.close().catch(()=>{});await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();

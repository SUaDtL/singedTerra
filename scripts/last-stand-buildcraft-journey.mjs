// Ordinary input against the actual package; isolated development seeds only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {admitFixtures,verifyFixtureAfter} from './last-stand-combat-depth-journey.mjs';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,fetchBoundRuntime,
  assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';
import {assertProfilePreservedExceptResearchClock} from '../e2e/helpers/lastStandWaveGuards.mjs';
import {createFreshEvidenceDirectory} from '../e2e/helpers/lastStandEvidenceDirectory.mjs';

const root=resolve(import.meta.dirname,'..'),key='singedTerra.lastStand.prototype.v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.ok(process.argv[2],'Supply the current source-bound presentation fixture manifest.');
const fixturePath=resolve(process.argv[2]),fixtureBytes=readFileSync(fixturePath),fixtures=JSON.parse(fixtureBytes);
admitFixtures(fixtures,fixturePath);assert.equal(fixtures.schema,'last-stand-combat-depth-presentation-fixtures/v2');
const inputs=[...new Set(['scripts/last-stand-buildcraft-journey.mjs','scripts/last-stand-combat-depth-journey.mjs',
  'e2e/helpers/lastStandBrowserActor.mjs','e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandEvidenceDirectory.mjs',...LAST_STAND_HELPER_INPUTS,
  ...[1,2,3,4,5,6].map(v=>'campaign-unity/Tools/contracts/last-stand-observation-v'+v+'.json')])];
const inputHashes=()=>Object.fromEntries(inputs.map(path=>[path,hash(readFileSync(resolve(root,path)))]));
const beforeInputs=inputHashes(),base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4174/singedTerra/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname)&&base.port==='4174');
for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
const packaged=packagedRuntimeSnapshot(),manifest=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
for(const [path,expected] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),expected);
const evidenceRoot=resolve(root,'campaign-unity/Evidence/buildcraft-browser');
const output=resolve(process.argv[3]??resolve(evidenceRoot,new Date().toISOString().replace(/[:.]/g,'-')));
createFreshEvidenceDirectory(evidenceRoot,output);
const report={schema:'last-stand-buildcraft-browser/v1',status:'running',packaged,inputs:beforeInputs,
  fixtureManifest:{path:fixturePath,sha256:hash(fixtureBytes)},
  scope:'Actual packaged WebGL, trusted mouse/touch/keyboard, isolated development profiles. Gifted seed strength and synthetic prior research time are not earned balance, real-duration endurance, physical-device or owner acceptance.',runs:[],checks:[]};
const resultPath=resolve(output,'result.json'),persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:true,chromiumSandbox:true}),contexts=[];
const controls=a=>lastStandObservedControls(a.layout());
async function actor(id,viewport,prepared=false){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true,
    proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});contexts.push(context);
  await context.addInitScript(WAVE_JOURNEY_PROBE);
  if(prepared){
    const row=fixtures.cases.find(row=>row.id===(typeof prepared==='string'?prepared:'roster-ready')),raw=readFileSync(resolve(dirname(fixturePath),row.savePath),'utf8');
    const seed=await context.newPage();await seed.goto(base.href);
    await seed.evaluate(({key,raw})=>{if(localStorage.getItem(key)!==null)throw new Error('Expected empty isolated storage');localStorage.setItem(key,raw);},{key,raw});
    await seed.close();
  }
  const a=await createLastStandBrowserActor({context,id,report,output,base,persist,maxRetainedLayouts:8});
  a.run.armoryCallouts=[];
  a.page.on('console',message=>{for(const bay of [1,2]){
    const prefix='ST_LS_ARMORY_BAY'+bay+' ';
    if(message.text().startsWith(prefix))try{a.run.armoryCallouts.push({bay,...JSON.parse(message.text().slice(prefix.length))});}
    catch(error){a.run.errors.push(String(error));}
  }});
  return a;
}
async function choose(a,bay,id){
  const field=bay===1?'armoryDraftPrimaryId':'armoryDraftSecondaryId';
  const order=['','repair','launcher','scattergun','mortar','railgun','arc','shield'];
  for(let steps=0;steps<9&&a.state()[field]!==id;steps++)
    await a.click('ArmoryBay'+bay+(order.indexOf(a.state()[field])<order.indexOf(id)?'Next':'Previous'));
  assert.equal(a.state()[field],id);
}
async function name(a,value){
  await a.click('ArmoryName');const start=a.run.inputs.length;
  await a.page.keyboard.press('Control+A');await a.page.keyboard.type(value,{delay:45});await a.page.keyboard.press('Tab');
  await a.until(()=>a.run.inputs.slice(start).some(e=>e.kind==='keyup'&&e.code==='Tab'));
  assert.ok(a.run.inputs.slice(start).filter(e=>['keydown','keyup'].includes(e.kind)).every(e=>e.trusted));
  a.run.actions.push({name:'name-build',at:Date.now(),inputStart:start,inputEnd:a.run.inputs.length});
}
async function deploy(a){
  const offered=controls(a).filter(c=>['Deploy','Redeploy'].includes(c.name)&&c.active&&c.interactable);
  assert.equal(offered.length,1,'One ordinary deploy/resume action must be offered');
  await a.click(offered[0].name);
}
try{
  const fresh=await actor('fresh',{width:1280,height:900});
  const initial=await fresh.stored('initial');await fresh.click('ArmoryEntry');
  check('Fresh Armory clearly locks the second bay and disables its controls',()=>{
    assert.equal(fresh.state().equipmentBayCount,1);
    assert.equal(controls(fresh).find(c=>c.name==='ArmoryBay2Next').interactable,false);
  });
  await choose(fresh,1,'arc');await fresh.shot('locked-arc-preview');
  check('Locked fitting previews cannot be applied',()=>assert.equal(fresh.state().armoryCanApply,false));
  assertProfilePreservedExceptResearchClock(initial,await fresh.stored('locked-preview'));
  await fresh.click('ArmoryCancel');check('Cancel restores the saved primary fitting',()=>assert.equal(fresh.state().selectedPrimaryId,initial.selectedFitting));
  await fresh.page.context().close();

  const a=await actor('prepared',{width:1280,height:900},true);
  const before=await a.stored('before-build');await a.click('ArmoryEntry');
  await choose(a,1,'arc');await choose(a,2,'shield');await name(a,'Storm Guard');
  assertProfilePreservedExceptResearchClock(before,await a.stored('unapplied-build'));
  await a.until(()=>a.run.armoryCallouts.some(c=>c.bay===1&&c.visible)&&a.run.armoryCallouts.some(c=>c.bay===2&&c.visible));
  await a.shot('two-module-preview');await a.click('ArmoryRotateRight');
  check('Both module callouts attach to the projected tank geometry',()=>{
    for(const bay of [1,2]){
      const callout=a.run.armoryCallouts.findLast(c=>c.bay===bay&&c.visible);assert.ok(callout);
      assert.ok(Math.hypot(callout.endpointScreen.x-callout.projectedAnchor.x,callout.endpointScreen.y-callout.projectedAnchor.y)<2);
    }
  });
  await a.click('ArmoryApply');await a.until(()=>a.state().action==='armory-saved');
  const applied=await a.stored('applied-build');
  check('Named preset and both bays commit together without spending resources',()=>{
    assert.equal(applied.selectedFitting,'arc');assert.equal(applied.secondaryFitting,'shield');
    assert.equal(applied.loadoutPresets[0].name,'Storm Guard');assert.equal(applied.credits,before.credits);
    assert.equal(a.state().armoryCanApply,false);
  });
  await a.click('ArmoryCancel');await a.reload();
  check('Reload retains the two-bay build',()=>{assert.equal(a.state().selectedPrimaryId,'arc');assert.equal(a.state().selectedSecondaryId,'shield');});
  await a.click('ResearchEntry');await a.select('armorPiercing');await a.shot('combat-research-ready');
  const beforeLab=await a.stored('before-third-lab');
  assert.equal(a.state().researchLabCount,3);await a.click('ResearchStart2');
  const fundedLab=await a.stored('funded-third-lab');
  check('Earned third lab funds one combat project from the shared wallet',()=>{
    const project=fundedLab.research.slots[2].active;
    assert.equal(project.track,'armorPiercing');assert.equal(project.rank,1);
    assert.equal(fundedLab.credits,beforeLab.credits-project.chargedCost);
    assert.deepEqual(fundedLab.research.completedRanks,beforeLab.research.completedRanks);
    assert.equal(fundedLab.selectedFitting,'arc');assert.equal(fundedLab.secondaryFitting,'shield');
  });
  await a.shot('third-lab-funded');await a.click('ResearchClose');await a.reload();
  const reloadedLab=await a.stored('reloaded-third-lab');
  check('Reload preserves the funded third lab without paying twice',()=>{
    assert.equal(a.state().wallet,fundedLab.credits);
    const fundedProject=fundedLab.research.slots[2].active,reloadedProject=reloadedLab.research.slots[2].active;
    assert.ok(Number.isSafeInteger(reloadedProject?.earnedMilliseconds)&&
      reloadedProject.earnedMilliseconds>=fundedProject.earnedMilliseconds&&
      reloadedProject.earnedMilliseconds<fundedProject.durationMilliseconds,'The funded project advances without completing during this reload');
    // Only this project's elapsed time may change beyond the shared clock metadata.
    const comparableReload=structuredClone(reloadedLab);
    comparableReload.research.slots[2].active.earnedMilliseconds=fundedProject.earnedMilliseconds;
    assertProfilePreservedExceptResearchClock(fundedLab,comparableReload);
  });
  for(const [tier,environment] of [[5,'glass-wastes'],[6,'frostline-relay']]){
    while(a.state().selectedTier<tier)await a.click('TierNext');
    check('Tier '+tier+' has its own environment',()=>assert.equal(a.state().environmentId,environment));await a.shot('tier-'+tier);
  }
  while(a.state().selectedTier>1)await a.click('TierPrevious');
  await deploy(a);await a.until(()=>a.state().phase==='battle'&&a.state().arcShots>0,30);
  await a.click('SpeedRate');await a.until(()=>a.state().paused);
  check('Deployed Arc and Shield are actual combat state',()=>{assert.equal(a.state().activeSecondaryId,'shield');assert.ok(a.state().arcShots>0&&a.state().shieldCapacity>0);});
  await a.shot('paired-combat');const checkpoint=(await a.stored('before-reload')).checkpoint;
  await a.reload();check('Reload retains the last confirmed checkpoint',()=>assert.equal(a.state().hasCheckpoint,true));
  await a.click('Menu');await a.click('MenuArmory');await choose(a,1,'repair');await a.click('ArmoryApply');await a.until(()=>a.state().action==='armory-saved');
  assert.deepEqual((await a.stored('future-build')).checkpoint,checkpoint);
  await a.click('ArmoryCancel');await deploy(a);await a.until(()=>a.state().phase==='battle');
  check('Resume starts paused with its captured build, independent of the next build',()=>{
    assert.equal(a.state().paused,true);assert.equal(a.state().fittingId,'arc');assert.equal(a.state().activeSecondaryId,'shield');
  });await a.shot('resumed-captured-build');await a.page.context().close();

  const commander=await actor('commander',{width:1280,height:900},'tier5-before-commander');
  const commanderFixture=fixtures.cases.find(row=>row.id==='tier5-before-commander');
  await deploy(commander);await commander.until(()=>commander.state().phase==='battle'&&commander.state().paused);
  const bossCheckpoint=(await commander.stored('before-preview')).checkpoint;
  await commander.click('WaveInfo');await commander.until(()=>commander.state().menu==='wave');await commander.shot('upcoming-commander-stats');
  assert.deepEqual((await commander.stored('after-preview')).checkpoint,bossCheckpoint);
  await commander.click('SettingsClose');
  for(let n=0;n<10&&commander.state().selectedSpeed<5;n++)await commander.click('SpeedPlus');
  if(commander.state().paused)await commander.click('SpeedRate');
  await commander.until(()=>commander.state().wave===100&&commander.state().tick>=commanderFixture.commanderObservedTick&&commander.state().remainingWaveEnemies>0,60);
  await commander.click('SpeedRate');await commander.until(()=>commander.state().paused);await commander.shot('commander-encounter');
  check('Saved wave 99 resumes into its actual Commander cohort through normal controls',()=>{
    assert.equal(commander.state().wave,100);assert.ok(commander.state().remainingWaveEnemies>0);
    assert.equal(commander.state().environmentId,'glass-wastes');
  });
  await commander.click('WaveInfo');await commander.shot('current-commander-stats');await commander.page.context().close();

  for(const [id,viewport] of [['portrait',{width:390,height:844}],['compact',{width:568,height:266}]]){
    const small=await actor(id,viewport,true);await small.click('ArmoryEntry',{touch:true});
    await choose(small,1,'arc');await choose(small,2,'shield');await name(small,'Mobile Guard');
    await small.click('ArmoryApply',{touch:true});await small.until(()=>small.state().action==='armory-saved');await small.shot('applied');
    check(id+' supports named two-bay builds with full-sized controls',()=>{
      for(const control of small.layout().armoryControls.filter(c=>c.active))assert.ok(control.width>=43.8&&control.height>=43.8);
      assert.equal(small.state().selectedSecondaryId,'shield');
    });await small.page.context().close();
  }
  for(const run of report.runs)check(run.id+' has zero browser errors',()=>assert.deepEqual(run.errors,[]));
  assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(inputHashes(),beforeInputs);
  verifyFixtureAfter(fixtures,fixturePath,fixtureBytes);report.status='pass';
}catch(error){
  report.status='failed';report.error=String(error.stack??error);process.exitCode=1;
  for(const [i,context] of contexts.entries())for(const page of context.pages())if(!page.isClosed())
    await page.screenshot({path:resolve(output,'failure-'+i+'.png')}).catch(()=>{});
}finally{
  for(const context of contexts)await context.close().catch(()=>{});await browser.close();persist();
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,result:resultPath,error:report.error}));
}

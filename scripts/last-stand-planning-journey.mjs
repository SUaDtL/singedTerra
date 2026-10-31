// Empty, disposable profile; ordinary input against the source-bound exported game.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,
  fetchBoundRuntime,assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';

const root=resolve(import.meta.dirname,'..');
const inputs=['scripts/last-stand-planning-journey.mjs','e2e/helpers/lastStandBrowserActor.mjs',
  'e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json','campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v4.json'];
const hashes=()=>Object.fromEntries(inputs.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4174/singedTerra/');
for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
const packaged=packagedRuntimeSnapshot(),inputHashes=hashes();
const runtime=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
for(const [path,expected] of Object.entries({...runtime.files,'index.html':runtime.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),expected);
const output=resolve(process.argv[2]??resolve(root,'campaign-unity/Evidence/planning-browser',new Date().toISOString().replace(/[:.]/g,'-')));
mkdirSync(output,{recursive:true});
const resultPath=resolve(output,'result.json');
assert.ok(!(()=>{try{readFileSync(resultPath);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}})(),'Preserve an existing journey result');
const report={schema:'last-stand-planning-browser/v1',status:'running',packaged,inputs:inputHashes,
  scope:'Empty isolated profile; actual headless browser input, persistence and screenshots. No seeded rewards, device, hardware audio, endurance or owner acceptance.',runs:[],checks:[]};
const persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
let context;
try{
  context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,hasTouch:true,
    proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
  await context.addInitScript(WAVE_JOURNEY_PROBE);
  const actor=await createLastStandBrowserActor({context,id:'planning',report,output,base,persist});
  const preferences=()=>actor.page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.preferences.v1'));
  const text=name=>JSON.parse(actor.layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics.find(g=>g.active&&g.path.endsWith('/'+name))?.text??'';
  const initial=await actor.stored('empty-profile');
  await actor.click('ResearchEntry');await actor.select('gameSpeed');
  check('locked research explains the progression requirement before spending',()=>{
    assert.match(text('ResearchStatus'),/RESEARCH LOCKED.*wave 25/);
    assert.match(text('ResearchDescription'),/Clear Tier 1, wave 25/);
    assert.equal(text('ResearchHelpBody'),'');assert.equal(actor.state().wallet,0);
  });
  await actor.shot('research-locked-desktop');await actor.click('ResearchHelp');
  check('research rules are available on request',()=>assert.match(text('ResearchHelpBody'),/queued project/));
  await actor.shot('research-help');await actor.click('ResearchClose');
  await actor.click('Menu');await actor.click('MenuHistory');
  check('empty history explains how to create a record',()=>assert.match(text('RunHistoryBody'),/Deploy|deploy|complete a run|Complete a run/));
  await actor.shot('history-empty');await actor.click('RunHistoryHelp');
  check('history methodology is available on request',()=>assert.match(text('RunHistoryBody'),/HOW COMPARISONS WORK/));
  await actor.click('RunHistoryClose');
  await actor.click('Menu');await actor.click('MenuPlanner');await actor.until(()=>actor.state().menu==='planner');
  check('planner offers current tier goal without spending',()=>{
    assert.match(text('PlannerGoalLabel'),/Tier 2/);
    assert.match(text('PlannerGoalDetail'),/Clear Tier 1 wave 300/);
    assert.equal(actor.state().wallet,0);
  });
  await actor.shot('desktop-goal');await actor.click('PlannerPin');
  const pin=JSON.parse(await preferences()).pinnedGoal;
  check('ordinary pin action saves stable goal identity',()=>assert.match(pin,/^tier:/));
  await actor.reload();await actor.click('Menu');await actor.click('MenuPlanner');
  check('pin survives real reload',()=>assert.match(text('PlannerSummary'),/Pinned: Tier 2/));
  assert.equal(JSON.parse(await preferences()).pinnedGoal,pin);
  await actor.click('PlannerBudget');await actor.click('PlannerWorkshopNext');await actor.click('PlannerResearchNext');
  check('budget alternatives disclose actual costs and unlocks',()=>{
    assert.match(text('PlannerWorkshopDetail'),/Salvage/);assert.match(text('PlannerResearchDetail'),/Salvage/);
    assert.match(text('PlannerResearchDetail'),/Tier 1 wave 25/);assert.equal(actor.state().wallet,0);
  });
  await actor.shot('desktop-budget');
  await actor.page.setViewportSize({width:390,height:844});await actor.page.waitForTimeout(300);
  await actor.geometry();await actor.click('PlannerWorkshopPrevious',{touch:true});await actor.shot('touch-budget');
  await actor.page.setViewportSize({width:568,height:266});await actor.page.waitForTimeout(300);
  await actor.geometry();await actor.click('PlannerGoals');await actor.click('PlannerClear');await actor.shot('compact-goals');
  check('compact ordinary scrolling reaches clear without changing progression',()=>{assert.equal(initial.credits,0);assert.equal(actor.state().wallet,initial.credits);});
  assert.ok(!JSON.parse(await preferences()).pinnedGoal);
  await actor.page.setViewportSize({width:1280,height:800});await actor.page.waitForTimeout(300);
  await actor.click('PlannerBudget');await actor.click('PlannerWorkshopOpen');
  await actor.until(()=>actor.state().menu==='');
  check('planner routes to existing permanent upgrade owner',()=>assert.equal(actor.shop().mode,'Permanent'));
  await actor.click('ShopClose');await actor.click('Deploy');await actor.click('SpeedRate');
  await actor.until(()=>actor.state().paused&&actor.state().selectedSpeed===0);
  const before=await actor.stored('paused-before-history');
  await actor.click('Menu');await actor.click('MenuHistory');await actor.click('RunHistoryView');
  check('one provisional run does not fabricate a comparison',()=>assert.match(text('RunHistoryBody'),/Select two different runs|Rate delta unavailable/));
  await actor.shot('two-run-empty-comparison');
  await actor.click('RunHistoryView');await actor.shot('farming-insufficient-data');
  check('farming view states insufficient measurements',()=>assert.match(text('RunHistoryBody'),/Insufficient samples/));
  const after=await actor.stored('paused-after-history');
  check('comparison preserves checkpoint and currency',()=>{assert.deepEqual(after.checkpoint,before.checkpoint);assert.ok(Number.isSafeInteger(before.credits));assert.equal(after.credits,before.credits);});
  await actor.click('RunHistoryClose');await actor.until(()=>actor.state().menu==='');
  check('closing comparison preserves manual pause',()=>{assert.equal(actor.state().paused,true);assert.equal(actor.state().selectedSpeed,0);});
  check('no browser errors',()=>assert.deepEqual(actor.run.errors,[]));
  assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(hashes(),inputHashes);
  report.status='pass';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally{await context?.close();await browser.close();persist();console.log(JSON.stringify({status:report.status,checks:report.checks.length,result:resultPath,error:report.error}));}

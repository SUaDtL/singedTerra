// Packaged appearance checks use ordinary input and disposable browser profiles.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,
  fetchBoundRuntime,assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';
import {createFreshEvidenceDirectory} from '../e2e/helpers/lastStandEvidenceDirectory.mjs';

const root=resolve(import.meta.dirname,'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=[...new Set(['scripts/last-stand-appearance.mjs','e2e/helpers/lastStandBrowserActor.mjs',
  'e2e/helpers/lastStandJourney.mjs','e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandEvidenceDirectory.mjs','scripts/ci/lastStandEvidenceDirectory.test.mjs',
  ...[1,2,3,4,5,6].map(v=>'campaign-unity/Tools/contracts/last-stand-observation-v'+v+'.json'),...LAST_STAND_HELPER_INPUTS])];
const inputHashes=()=>Object.fromEntries(inputs.map(path=>[path,hash(readFileSync(resolve(root,path)))]));
const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4174/singedTerra/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname)&&base.port==='4174');
for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
const packaged=packagedRuntimeSnapshot(),beforeInputs=inputHashes();
const manifest=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
for(const [path,expected] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),expected);
const output=resolve(process.argv[2]??resolve(root,'campaign-unity/Evidence/tank-customization',new Date().toISOString().replace(/[:.]/g,'-')));
createFreshEvidenceDirectory(resolve(root,'campaign-unity/Evidence/tank-customization'),output);
const report={schema:'last-stand-appearance-browser/v1',status:'running',packaged,inputs:beforeInputs,
  scope:'Actual packaged WebGL, fresh isolated profiles, ordinary trusted input, persistence and rendered layout. No player saves modified. Not physical-device performance or owner art acceptance.',runs:[],checks:[]};
const resultPath=resolve(output,'result.json'),persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:true,chromiumSandbox:true}),contexts=[];
const create=async(id,viewport)=>{
  const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true,
    proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});contexts.push(context);
  await context.addInitScript(WAVE_JOURNEY_PROBE);
  const actor=await createLastStandBrowserActor({context,id,report,output,base,persist,maxRetainedLayouts:8});
  actor.run.appearanceCallouts=[];
  actor.page.on('console',message=>{
    const raw=message.text(),prefix='ST_LS_APPEARANCE_CALLOUT ';
    if(raw.startsWith(prefix)){
      try{actor.run.appearanceCallouts.push(JSON.parse(raw.slice(prefix.length)));}
      catch(error){actor.run.errors.push(String(error));}
    }
  });
  return actor;
};
const control=(actor,name)=>lastStandObservedControls(actor.layout()).find(item=>item.name===name);
const open=async actor=>{await actor.click('Menu');await actor.click('MenuAppearance');await actor.until(()=>actor.state().menu==='appearance');};
const chooseMixed=async actor=>{
  await actor.click('AppearancePartsTab');
  for(const [slot,kit] of [['Treads','Ranger'],['Hull','Jackal'],['Turret','Bulwark'],['Barrel','Ranger']])
    await actor.click('Appearance'+slot+kit);
  await actor.click('AppearancePaintTab');await actor.click('AppearancePaintBlue');
};
const mixed={treads:'ranger',hull:'jackal',turret:'bulwark',barrel:'ranger',paint:'blue'};
try{
  const actor=await create('desktop',{width:1280,height:900});
  const initial=await actor.stored('initial');await actor.shot('garage');await open(actor);
  check('current contract includes all appearance controls',()=>{
    assert.equal(actor.layout().schema,'singedterra-last-stand-observation/v6');
    assert.equal(actor.layout().appearanceControls.length,33);assert.equal(actor.state().appearanceCanApply,false);
  });
  for(const kit of ['Foundry','Ranger','Bulwark','Jackal']){
    await actor.click('AppearancePreset'+kit);await actor.shot('kit-'+kit.toLowerCase());
    check(kit+' is a whole-tank preview only',()=>{
      assert.equal(actor.state().appearanceDraft.treads,kit.toLowerCase());assert.deepEqual(actor.state().appearance,initial.appearance);
    });
  }
  await chooseMixed(actor);
  await actor.click('AppearancePaintRed');
  const keyboardStart=actor.run.inputs.length;
  await actor.page.keyboard.press('Tab',{delay:90});
  await actor.page.keyboard.press('Enter',{delay:90});
  await actor.until(()=>actor.state().appearanceDraft.paint==='blue');
  await actor.until(()=>actor.run.inputs.slice(keyboardStart).some(event=>event.kind==='keyup'&&event.code==='Enter'),5);
  check('Tab and Enter activate the next named paint choice',()=>{
    const edges=actor.run.inputs.slice(keyboardStart).filter(event=>['keydown','keyup'].includes(event.kind));
    assert.deepEqual(edges.map(event=>[event.kind,event.code]),[['keydown','Tab'],['keyup','Tab'],['keydown','Enter'],['keyup','Enter']]);
    assert.ok(edges.every(event=>event.trusted));
  });
  actor.run.actions.push({name:'keyboard-blue-paint',inputStart:keyboardStart,inputEnd:actor.run.inputs.length});
  await actor.shot('mixed-preview');
  check('mixed selection is visible without committing',()=>{assert.deepEqual(actor.state().appearanceDraft,mixed);assert.deepEqual(actor.state().appearance,initial.appearance);});
  await actor.until(()=>actor.run.appearanceCallouts.at(-1)?.visible&&actor.run.appearanceCallouts.at(-1)?.target==='Railgun');
  const attachment=actor.run.appearanceCallouts.at(-1),calloutStart=actor.run.appearanceCallouts.length;
  await actor.click('AppearanceRotateRight');
  await actor.until(()=>actor.run.appearanceCallouts.length>calloutStart);
  check('part callout follows the actual projected part while rotating',()=>{
    const next=actor.run.appearanceCallouts.at(-1);
    assert.ok(next.visible&&next.target==='Railgun');
    assert.ok(Math.hypot(next.endpointScreen.x-next.projectedAnchor.x,next.endpointScreen.y-next.projectedAnchor.y)<1);
    assert.ok(Math.hypot(next.projectedAnchor.x-attachment.projectedAnchor.x,next.projectedAnchor.y-attachment.projectedAnchor.y)>1);
  });await actor.shot('mixed-rotated-callout');
  await actor.click('AppearanceCancel');await actor.until(()=>actor.state().menu==='');
  check('Cancel restores the saved tank',()=>assert.deepEqual(actor.state().appearanceDraft,initial.appearance));
  await open(actor);await chooseMixed(actor);await actor.click('AppearanceApply');
  await actor.until(()=>actor.state().action==='appearance-saved');
  check('Apply confirms profile appearance without changing economy or fitting',()=>{
    assert.deepEqual(actor.state().appearance,mixed);assert.equal(actor.state().wallet,initial.credits);
    assert.equal(actor.state().fittingId,initial.selectedFitting);assert.equal(actor.state().appearanceCanApply,false);
  });await actor.shot('mixed-saved');
  await actor.click('AppearancePaintPurple');await actor.page.keyboard.press('Escape');await actor.until(()=>actor.state().menu==='');
  check('Escape discards an unapplied paint change',()=>assert.deepEqual(actor.state().appearanceDraft,mixed));
  await actor.reload();check('reload preserves mixed appearance',()=>assert.deepEqual(actor.state().appearance,mixed));
  await actor.shot('reloaded-garage');await actor.click('Deploy');await actor.until(()=>actor.state().phase==='battle');
  await actor.click('Menu');
  check('battle retains appearance and offers no cosmetic editor',()=>{
    assert.deepEqual(actor.state().appearance,mixed);assert.equal(control(actor,'MenuAppearance').active,false);
  });await actor.shot('combat-mixed');await actor.page.context().close();
  for(const [id,viewport] of [['portrait',{width:390,height:844}],['compact',{width:568,height:266}],['narrow',{width:500,height:298}]]){
    const small=await create(id,viewport);
    if(id!=='portrait')check(id+' has an actual 142px canvas',()=>{
      assert.equal(small.layout().width,viewport.width);assert.equal(small.layout().height,142);
    });
    await open(small);await chooseMixed(small);await small.click('AppearanceApply');
    await small.until(()=>small.state().action==='appearance-saved');await small.shot('applied');
    check(id+' named choices and Apply are reachable through ordinary scrolling',()=>assert.deepEqual(small.state().appearance,mixed));
    await small.click('AppearanceCancel');await small.until(()=>small.state().menu==='');await small.page.context().close();
  }
  for(const run of report.runs)check(run.id+' has no browser errors and bounded validated layout evidence',()=>{
    assert.deepEqual(run.errors,[]);assert.ok(run.layouts.length<=8);
    assert.ok(run.layoutPacketsObserved>=run.layouts.length);
  });
  assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(inputHashes(),beforeInputs);
  report.status='pass';
}catch(error){
  report.status='failed';report.error=String(error.stack??error);process.exitCode=1;
  for(const [i,context] of contexts.entries())for(const page of context.pages())if(!page.isClosed())
    await page.screenshot({path:resolve(output,'failure-'+i+'.png')}).catch(()=>{});
}finally{
  for(const context of contexts)await context.close().catch(()=>{});await browser.close();persist();
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,result:resultPath,error:report.error}));
}

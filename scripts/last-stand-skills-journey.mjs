// Actual packaged WebGL and trusted browser input. Development saves enter
// empty disposable contexts once; no test action calls into the game runtime.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,fetchBoundRuntime,
  assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';
import {assertProfilePreservedExceptResearchClock,assertSkillProfile,assertSkillCheckpoint,SKILL_KEYS} from '../e2e/helpers/lastStandWaveGuards.mjs';
import {createFreshEvidenceDirectory} from '../e2e/helpers/lastStandEvidenceDirectory.mjs';

const root=resolve(import.meta.dirname,'..'),storageKey='singedTerra.lastStand.prototype.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tokens=['Overdrive','EmergencyRepairs','Minefield','ReinforcedHull','Ballistics','ReactiveLining'];
const activeKeys=SKILL_KEYS.slice(0,3),passiveKeys=SKILL_KEYS.slice(3);
const inputs=[...new Set(['scripts/last-stand-skills-journey.mjs','scripts/ci/lastStandSkillsJourney.test.mjs','e2e/helpers/lastStandBrowserActor.mjs',
  'e2e/helpers/lastStandJourney.mjs','e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandEvidenceDirectory.mjs',...LAST_STAND_HELPER_INPUTS,
  ...[1,2,3,4,5,6,7].map(v=>'campaign-unity/Tools/contracts/last-stand-observation-v'+v+'.json'),
  'campaign-unity/Tools/last_stand_skills/generate_review_profiles.py',
  'campaign-unity/Tools/last_stand_skills/SkillProgressionChecks.cs',
  'campaign-unity/Tools/last_stand_source_closure.py','campaign-unity/Tools/last_stand_test_runtime.py',
  ...['LastStandProgressionSkills','LastStandProgressionSkillsSave','LastStandLoopSkills','LastStandSkillsHud',
    'LastStandCombatSkillsHud','LastStandSkillHudLayout','LastStandArmorySession','LastStandLoopArmory',
    'LastStandAudio','EncounterSkills','Content/LastStandSkillCatalog'].map(name=>'campaign-unity/Unity/Assets/Scripts/'+name+'.cs')])];
export const skillsJourneyInputHashes=()=>Object.fromEntries(inputs.map(path=>[path,sha(readFileSync(resolve(root,path)))]));

export function admitSkillsFixtures(fixtures){
  assert.equal(fixtures.kind,'isolated-skills-review-fixtures');assert.equal(fixtures.saveVersion,9);
  assert.match(fixtures.scope,/Development fixtures, not earned-player balance proof/);
  assert.deepEqual(Object.keys(fixtures.profiles).sort(),['collection','eligible','fresh']);
  for(const [name,raw] of Object.entries(fixtures.profiles)){
    assert.equal(typeof raw,'string');const saved=JSON.parse(raw);assert.equal(saved.version,9);assertSkillProfile(saved.skills);
    assert.equal(saved.checkpoint,null,'Initial fixture has no hidden resumed encounter: '+name);
    assert.equal(saved.loadoutPresets.length,3,'Use the existing complete-build preset collection');
  }
  const fresh=JSON.parse(fixtures.profiles.fresh),eligible=JSON.parse(fixtures.profiles.eligible),collection=JSON.parse(fixtures.profiles.collection);
  assert.equal(fresh.skills.intel,0);assert.deepEqual(fresh.skills.copies,[0,0,0,0,0,0]);
  assert.equal(eligible.tierRecords['tier-1'].bestWave,25);assert.equal(eligible.skills.intel,1);
  assert.deepEqual(eligible.skills.copies,[0,0,0,0,0,0]);
  assert.ok(collection.tierRecords['tier-1'].bestWave>=500&&collection.tierRecords['tier-2'].unlocked);
  assert.deepEqual(collection.skills.loadout,activeKeys);assert.ok(collection.skills.copies.every(n=>n>0&&n<6));
  assert.deepEqual(collection.loadoutPresets[1].skills,passiveKeys);
  return true;
}

export function admitCombatFixture(fixture){
  assert.equal(fixture.kind,'isolated-skills-combat-review-fixture');assert.equal(fixture.saveVersion,9);
  assert.match(fixture.scope,/gift|development/i);assert.equal(typeof fixture.profile,'string');
  const saved=JSON.parse(fixture.profile);assert.equal(saved.version,9);assertSkillProfile(saved.skills);
  assert.equal(saved.checkpoint,null,'Combat starts with a real deployment, not a seeded checkpoint');
  assert.deepEqual(saved.skills.loadout,['overdrive','minefield','emergencyRepairs']);
  assert.ok(saved.tierRecords['tier-2'].unlocked);assert.equal(saved.selectedFitting,'repair');
  assert.equal(saved.secondaryFitting,null);assert.equal(saved.permanentLevels.fieldRepair,0);
  assert.match(fixture.scope,/baseline 3 HP/,'Disclose the ordinary fitting repair; do not silently suppress it');
  assert.equal(fixture.preflight.mode,'production-model-natural-damage');assert.equal(fixture.preflight.spentMask,7);
  assert.equal(fixture.preflight.survived,true);assert.ok(fixture.preflight.firstDamageSimulatedMilliseconds<=60000);return saved;
}

export function assertOneSkillDraw(before,after,eligibleIndices){
  assertSkillProfile(before.skills);assertSkillProfile(after.skills);
  assert.equal(after.skills.intel,before.skills.intel-1,'One committed draw spends one Intel');
  const changes=after.skills.copies.map((n,i)=>n-before.skills.copies[i]);
  assert.equal(changes.filter(n=>n===1).length,1,'Exactly one copy is granted');
  assert.ok(changes.every(n=>n===0||n===1),'Draw cannot remove or multiply copies');
  assert.ok(eligibleIndices.includes(changes.indexOf(1)),'Draw belongs to actual eligible unfinished pool');
  assert.deepEqual(after.skills.loadout,before.skills.loadout,'Drawing never silently equips');
  assert.deepEqual(after.skills.firstAwards,before.skills.firstAwards);assert.equal(after.credits,before.credits);
  assert.deepEqual(after.loadoutPresets,before.loadoutPresets);return changes.indexOf(1);
}

export function skillInputBinding(loadout,id){
  assert.ok(Array.isArray(loadout)&&loadout.length<=3&&new Set(loadout).size===loadout.length&&loadout.every(key=>SKILL_KEYS.includes(key)));
  assert.ok(activeKeys.includes(id)&&loadout.includes(id),'Only an equipped active has an activation binding');
  const slot=loadout.indexOf(id);return {slot,key:['q','e','r'][slot],control:'CombatSkill'+slot};
}

export function audioCueIdentity(raw){
  assert.equal(typeof raw,'string');
  // Unity's WebGL logger appends one transport line ending. Preserve every
  // other character so a substring, extra whitespace or another cue cannot pass.
  return raw.endsWith('\r\n')?raw.slice(0,-2):raw.endsWith('\n')?raw.slice(0,-1):raw;
}

export const skillActivationCues=audio=>audio.map(audioCueIdentity).filter(cue=>
  ['skill-overdrive','skill-repairs','skill-mines-armed'].includes(cue));

export async function clickFreshState(a,name,predicate,options={},durable=predicate){
  const start=a.run.states.length;await a.click(name,options);
  // Console observations may deliver a periodic research packet after the
  // action packet. Require a new action witness and the current durable state.
  await a.until(()=>a.run.states.slice(start).some(predicate)&&durable(a.state()));
}

const wheelProbe=`window.addEventListener('wheel',event=>console.log('ST_WAVE_INPUT '+JSON.stringify({kind:'wheel',trusted:event.isTrusted,deltaY:event.deltaY,x:event.clientX,y:event.clientY,target:event.target?.id??'',t:performance.now(),timeOrigin:performance.timeOrigin})),{capture:true,passive:true});`;
const controls=a=>lastStandObservedControls(a.layout());
const control=(a,name)=>controls(a).find(item=>item.name===name);
const graphics=a=>JSON.parse(a.layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics;
const text=(a,name)=>graphics(a).find(g=>g.active&&g.path.endsWith('/'+name))?.text??'';
const uses=a=>[a.state().overdriveUsed,a.state().repairsUsed,a.state().minefieldUsed];
const heardAudio=(a,cue)=>a.run.audio.some(raw=>audioCueIdentity(raw)===cue);

export async function runSkillsJourney(fixtureArg,outputArg,combatArg){
  assert.ok(fixtureArg,'Supply Evidence/last-stand-skills/review-profiles.json and optionally a fresh output directory.');
  const fixturePath=resolve(fixtureArg),fixtureBytes=readFileSync(fixturePath),fixtures=JSON.parse(fixtureBytes);
  admitSkillsFixtures(fixtures);
  const combatPath=resolve(combatArg??'campaign-unity/Evidence/last-stand-skills/review-profiles-combat.json');
  const combatBytes=readFileSync(combatPath),combatFixture=JSON.parse(combatBytes);admitCombatFixture(combatFixture);
  const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4175/singedTerra/');
  assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'Isolated local package host required');
  const evidenceRoot=resolve(root,'campaign-unity/Evidence/last-stand-skills/browser');
  const output=resolve(outputArg??resolve(evidenceRoot,new Date().toISOString().replace(/[:.]/g,'-')));
  createFreshEvidenceDirectory(evidenceRoot,output);
  const report={schema:'last-stand-skills-browser/v1',status:'running',startedUtc:new Date().toISOString(),
    scope:'Actual source-bound packaged WebGL, trusted mouse/touch/keyboard, isolated development fixture saves. Gifted workshop strength, prior simulated clears and deterministic fixture draws are not earned balance, native/device performance, real-duration endurance or owner visual acceptance. Runtime observations and original save bytes are retained; no runtime injection or clock overrides.',
    fixture:{path:fixturePath,sha256:sha(fixtureBytes),scope:fixtures.scope,profileSha256:Object.fromEntries(Object.entries(fixtures.profiles).map(([id,raw])=>[id,sha(raw)])),
      combat:{path:combatPath,sha256:sha(combatBytes),profileSha256:sha(combatFixture.profile),scope:combatFixture.scope,preflight:combatFixture.preflight}},
    inputs:skillsJourneyInputHashes(),preflight:[],runs:[],checks:[]};
  const resultPath=resolve(output,'result.json'),persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
  const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
  let browser;const contexts=[];
  persist();
  async function snapshot(a,label){
    const raw=await a.page.evaluate(key=>localStorage.getItem(key),storageKey);assert.equal(typeof raw,'string');
    const value=JSON.parse(raw);assertSkillProfile(value.skills);
    const path=resolve(output,a.run.id+'-'+label+'.save.json');writeFileSync(path,raw);
    a.run.storage.push({label,at:Date.now(),path,sha256:sha(raw),value});persist();return value;
  }
  async function actor(id,viewport,fixture){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true,
      proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});contexts.push(context);
    await context.addInitScript(WAVE_JOURNEY_PROBE);await context.addInitScript(wheelProbe);
    if(fixture){
      const seed=await context.newPage();await seed.goto(base.href);
      const raw=fixture==='combat'?combatFixture.profile:fixtures.profiles[fixture];
      await seed.evaluate(({key,raw})=>{if(localStorage.getItem(key)!==null)throw new Error('Expected empty isolated storage');localStorage.setItem(key,raw);},{key:storageKey,raw});
      await seed.close();
    }
    const a=await createLastStandBrowserActor({context,id,report,output,base,persist,maxRetainedLayouts:8});
    a.run.fixture=fixture??'empty-context';assert.equal(a.layout().schema,'singedterra-last-stand-observation/v7');return a;
  }
  async function press(a,key){
    const start=a.run.inputs.length;await a.page.keyboard.press(key,{delay:90});
    await a.until(()=>a.run.inputs.slice(start).some(e=>e.kind==='keyup'),5);
    const edges=a.run.inputs.slice(start).filter(e=>['keydown','keyup'].includes(e.kind));
    assert.ok(edges.length>=2&&edges.every(e=>e.trusted),'Ordinary trusted keyboard input');
    a.run.actions.push({name:'key-'+key,at:Date.now(),inputStart:start,inputEnd:a.run.inputs.length});
    await a.page.waitForTimeout(140);
  }
  async function disabledClick(a,name){
    await a.until(()=>control(a,name)?.active&&!control(a,name).interactable);
    const geometry=await a.geometry(),item=control(a,name),target=geometry.targets.find(t=>t.name===name);
    assert.ok(target?.full,'Disabled control is fully visible');
    const x=geometry.canvas.x+(item.x+item.width/2)*geometry.canvas.width/geometry.layout.width;
    const y=geometry.canvas.y+(item.y+item.height/2)*geometry.canvas.height/geometry.layout.height,start=a.run.inputs.length;
    await a.page.mouse.click(x,y,{delay:90});await a.until(()=>a.run.inputs.slice(start).some(e=>e.kind==='pointerup'),5);
    const edges=a.run.inputs.slice(start).filter(e=>['pointerdown','pointerup'].includes(e.kind));
    assert.deepEqual(edges.map(e=>e.kind),['pointerdown','pointerup']);assert.ok(edges.every(e=>e.trusted&&e.target==='unity-canvas'));
    a.run.actions.push({name:'refused-'+name,at:Date.now(),x,y,inputStart:start,inputEnd:a.run.inputs.length});await a.page.waitForTimeout(150);
  }
  async function openSkills(a,touch=false){await a.click('Menu',{touch});await a.click('MenuSkills',{touch});await a.until(()=>a.state().menu==='skills');}
  const clickState=clickFreshState;
  const sameOrder=(actual,expected)=>JSON.stringify(actual)===JSON.stringify(expected);
  async function toggleSkill(a,id,options={}){
    const before=a.state().skillDraft,expected=before.includes(id)?before.filter(key=>key!==id):[...before,id];
    await clickState(a,'Skill'+tokens[SKILL_KEYS.indexOf(id)]+'Equip',s=>sameOrder(s.skillDraft,expected),options);
  }
  async function applySkills(a,options={}){
    const expected=[...a.state().skillDraft];
    await clickState(a,'SkillsApply',s=>s.action==='skills-apply'&&sameOrder(s.selectedSkills,expected),options,s=>sameOrder(s.selectedSkills,expected));
  }
  async function pause(a,paused,options={}){
    await clickState(a,'SpeedRate',s=>s.paused===paused,options);
  }
  async function deploy(a){
    await a.until(()=>controls(a).filter(c=>['Deploy','Redeploy'].includes(c.name)&&c.active&&c.interactable).length===1);
    const offered=controls(a).filter(c=>['Deploy','Redeploy'].includes(c.name)&&c.active&&c.interactable);
    assert.equal(offered.length,1,'Exactly one visible deploy/resume control');await a.click(offered[0].name);
    await a.until(()=>a.state().phase==='battle');
  }
  async function choose(a,bay,id){
    const field=bay===1?'armoryDraftPrimaryId':'armoryDraftSecondaryId',order=['','repair','launcher','scattergun','mortar','railgun','arc','shield'];
    for(let i=0;i<9&&a.state()[field]!==id;i++){
      const before=a.state()[field];
      await clickState(a,'ArmoryBay'+bay+(order.indexOf(before)<order.indexOf(id)?'Next':'Previous'),s=>s[field]!==before);
    }
    assert.equal(a.state()[field],id);
  }
  async function nameBuild(a,name){
    await a.click('ArmoryName');const start=a.run.inputs.length;
    await a.page.keyboard.press('Control+A');await a.page.keyboard.type(name,{delay:35});await press(a,'Tab');
    assert.ok(a.run.inputs.slice(start).filter(e=>['keydown','keyup'].includes(e.kind)).every(e=>e.trusted));
    a.run.actions.push({name:'name-build',value:name,at:Date.now(),inputStart:start,inputEnd:a.run.inputs.length});
    // Chromium also selects wrapper text on Ctrl+A. Clear that highlight with
    // an ordinary click on its observed, non-navigating title before capture.
    const clearStart=a.run.inputs.length;await a.page.locator('#last-stand-nav > span').click({delay:90});
    await a.until(()=>a.run.inputs.slice(clearStart).some(e=>e.kind==='pointerup'&&e.trusted),5);
    assert.ok(await a.page.evaluate(()=>window.getSelection()?.isCollapsed??true));
    a.run.actions.push({name:'clear-wrapper-text-selection',target:'#last-stand-nav > span',at:Date.now(),inputStart:clearStart,inputEnd:a.run.inputs.length});
  }
  async function applyBuild(a){
    const primary=a.state().armoryDraftPrimaryId,secondary=a.state().armoryDraftSecondaryId;
    await clickState(a,'ArmoryApply',s=>s.action==='armory-saved',{},
      s=>s.selectedPrimaryId===primary&&s.selectedSecondaryId===secondary&&!s.armoryCanApply);
  }
  async function selectPreset(a,slot){
    assert.ok(Number.isInteger(slot)&&slot>=0&&slot<3);
    for(let n=0;n<3&&a.state().armoryPresetSlot!==slot;n++){
      const before=a.state().armoryPresetSlot,next=before+(before<slot?1:-1);
      await clickState(a,'ArmoryPreset'+(before<slot?'Next':'Previous'),s=>s.armoryPresetSlot===next);
    }
    assert.equal(a.state().armoryPresetSlot,slot);
  }
  async function focusAndScroll(a,label){
    await a.geometry();assert.ok(a.layout().skillsMaximumScrollOffset>0,'Compact collection uses real scroll owner');
    let furthest=0;
    for(let n=0;n<12;n++){
      const count=a.run.layoutPacketsObserved,previous=a.layout().selection;await press(a,'Tab');
      await a.until(()=>a.run.layoutPacketsObserved>count&&a.layout().selection!==previous);
      const geometry=await a.geometry(),selected=a.layout().selection;
      assert.ok(a.layout().skillsControls.some(c=>c.name===selected&&c.active&&c.interactable),'Focus stays within Skills');
      assert.ok(geometry.targets.find(t=>t.name===selected)?.full,'Focused action is fully revealed');
      furthest=Math.max(furthest,a.layout().skillsScrollOffset);
    }
    assert.ok(furthest>0,'Keyboard traversed into scrolled content');
    let count=a.run.layoutPacketsObserved;await press(a,'End');
    await a.until(()=>a.run.layoutPacketsObserved>count&&a.layout().skillsScrollOffset>=a.layout().skillsMaximumScrollOffset-1);
    await a.shot(label+'-end');
    assert.ok(a.layout().skillsScrollOffset>=a.layout().skillsMaximumScrollOffset-1,'End reaches real bottom');
    count=a.run.layoutPacketsObserved;await press(a,'Home');await a.until(()=>a.run.layoutPacketsObserved>count&&a.layout().skillsScrollOffset<1);
    const geo=await a.geometry(),pane=graphics(a).find(g=>g.active&&g.path.endsWith('/SkillsViewport'));
    assert.ok(pane);const x=geo.canvas.x+(pane.x+pane.width/2)*geo.canvas.width/geo.layout.width;
    const y=geo.canvas.y+(pane.y+pane.height/2)*geo.canvas.height/geo.layout.height,start=a.run.inputs.length;
    await a.page.mouse.move(x,y);await a.page.mouse.wheel(0,220);
    await a.until(()=>a.run.inputs.slice(start).some(e=>e.kind==='wheel'&&e.trusted)&&a.layout().skillsScrollOffset>0);
    a.run.actions.push({name:'collection-wheel',at:Date.now(),inputStart:start,inputEnd:a.run.inputs.length});
    await a.shot(label+'-scrolled');
  }
  try{
    for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs']){
      const argv=[resolve(root,'scripts/assets',tool)];
      try{const stdout=execFileSync(process.execPath,argv,{cwd:root,encoding:'utf8',stdio:'pipe'});report.preflight.push({argv,exitCode:0,stdout});}
      catch(error){report.preflight.push({argv,exitCode:error.status,stdout:String(error.stdout??''),stderr:String(error.stderr??'')});throw error;}
    }
    report.packaged=packagedRuntimeSnapshot();
    const manifest=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
    for(const [path,expected] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))assertServedBytes(await fetchBoundRuntime(base,path),expected);
    report.servedRuntimeVerified=true;persist();
    const require=createRequire(process.env.ST_SKILLS_NODE_ROOT?resolve(process.env.ST_SKILLS_NODE_ROOT,'package.json'):import.meta.url);
    const packagePath=require.resolve('@playwright/test/package.json'),packageBytes=readFileSync(packagePath);
    report.browserRuntime={packagePath,packageSha256:sha(packageBytes),playwrightVersion:JSON.parse(packageBytes).version,nodeVersion:process.version};
    // Full Chromium's headless mode uses the ordinary Windows graphics path.
    // The default headless shell selects SwiftShader here and takes seconds
    // per canvas input; it cannot reliably qualify short timed skill windows.
    const channel=process.env.ST_SKILLS_BROWSER_CHANNEL??'chromium';
    report.browserRuntime.channel=channel;
    const {chromium}=require('@playwright/test');browser=await chromium.launch({channel,headless:true,chromiumSandbox:true});
    report.browserRuntime.browserVersion=browser.version();

    const fresh=await actor('fresh',{width:1280,height:800});const empty=await snapshot(fresh,'initial');
    await openSkills(fresh);await fresh.shot('locked');
    check('Fresh collection explains locked pool, ownership and shared capacity',()=>{
      assert.equal(fresh.state().skillSlots,0);assert.equal(fresh.state().skillIntel,0);
      assert.match(text(fresh,'SkillsPool'),/wave 25/);assert.match(text(fresh,'SkillsSelection'),/0 \/ 0/);
      assert.ok(fresh.layout().skillsControls.filter(c=>c.name.endsWith('Equip')).every(c=>!c.interactable));
    });
    await disabledClick(fresh,'SkillsDraw');assertProfilePreservedExceptResearchClock(empty,await snapshot(fresh,'locked-refusal'));
    await fresh.page.context().close();

    const eligible=await actor('first-draw',{width:1280,height:800},'eligible');await openSkills(eligible);
    assert.match(text(eligible,'SkillsPool'),/1 in 2 each/);const beforeDraw=await snapshot(eligible,'before-draw');
    await clickState(eligible,'SkillsDraw',s=>s.skillIntel===0&&s.skillsStatus.endsWith('Saved.'));
    const afterDraw=await snapshot(eligible,'after-draw'),drawn=assertOneSkillDraw(beforeDraw,afterDraw,[0,3]);
    check('First ordinary draw spends one Intel for one eligible owned copy',()=>assert.match(text(eligible,'SkillsStatus'),/Saved\./));
    await eligible.shot('draw-receipt');await disabledClick(eligible,'SkillsDraw');
    assertProfilePreservedExceptResearchClock(afterDraw,await snapshot(eligible,'unfunded-refusal'));
    await toggleSkill(eligible,SKILL_KEYS[drawn]);assert.deepEqual(eligible.state().selectedSkills,[]);
    await clickState(eligible,'SkillsCancel',s=>s.menu==='');assertProfilePreservedExceptResearchClock(afterDraw,await snapshot(eligible,'cancelled'));
    await openSkills(eligible);await toggleSkill(eligible,SKILL_KEYS[drawn]);await applySkills(eligible);
    const firstEquipped=await snapshot(eligible,'applied');assert.deepEqual(firstEquipped.skills.loadout,[SKILL_KEYS[drawn]]);
    await eligible.reload();check('Apply survives actual reload without a second draw',()=>{
      assert.deepEqual(eligible.state().selectedSkills,[SKILL_KEYS[drawn]]);assert.equal(eligible.state().skillIntel,0);assert.deepEqual(eligible.state().skillCopies,afterDraw.skills.copies);
    });await eligible.page.context().close();

    let a=await actor('desktop',{width:1920,height:1080},'collection');const initial=await snapshot(a,'initial');await openSkills(a);
    await toggleSkill(a,'emergencyRepairs');await toggleSkill(a,'reinforcedHull');
    assert.deepEqual(a.state().selectedSkills,activeKeys);await clickState(a,'SkillsCancel',s=>s.menu==='');
    assertProfilePreservedExceptResearchClock(initial,await snapshot(a,'mixed-cancelled'));
    await openSkills(a);await toggleSkill(a,'emergencyRepairs');await toggleSkill(a,'reinforcedHull');await applySkills(a);
    const mixed=['overdrive','minefield','reinforcedHull'];assert.deepEqual(a.state().selectedSkills,mixed);await a.shot('mixed-shared-slots');
    await clickState(a,'SkillsArmory',s=>s.menu==='armory');const mixedSlot=a.state().armoryPresetSlot;await nameBuild(a,'Mixed patrol');await applyBuild(a);
    const mixedSaved=await snapshot(a,'mixed-preset');assert.deepEqual(mixedSaved.loadoutPresets[mixedSlot].skills,mixed);
    assert.deepEqual(mixedSaved.loadoutPresets.slice(0,2),initial.loadoutPresets.slice(0,2),'New complete build uses the empty preset and preserves existing named builds');
    await selectPreset(a,1);await a.until(()=>/Reinforced Hull.*Ballistics.*Reactive Lining/.test(text(a,'ArmorySkillsSummary')));
    await choose(a,2,'');await choose(a,1,'scattergun');await nameBuild(a,'Passive guard');
    assertProfilePreservedExceptResearchClock(mixedSaved,await snapshot(a,'passive-preview'));
    await applyBuild(a);const passive=await snapshot(a,'passive-preset');
    check('One existing named preset atomically applies hardware and passive skills',()=>{
      assert.equal(passive.selectedFitting,'scattergun');assert.equal(passive.secondaryFitting,null);assert.deepEqual(passive.skills.loadout,passiveKeys);
      assert.deepEqual(passive.loadoutPresets[1],{name:'Passive guard',loadout:{primary:'scattergun',secondary:null},skills:passiveKeys});assert.equal(passive.credits,initial.credits);
    });
    await a.until(()=>graphics(a).filter(g=>g.path.includes('ArmoryBay2Art')).every(g=>!g.active));
    check('Empty secondary bay contains no misleading equipment artwork',()=>{
      const art=graphics(a).filter(g=>g.path.includes('ArmoryBay2Art'));
      assert.ok(art.length>0,'Actual bay graphics are observed');assert.ok(art.every(g=>!g.active));
    });await a.shot('full-build-preset');
    await selectPreset(a,mixedSlot);await a.until(()=>/Overdrive.*Minefield.*Reinforced Hull/.test(text(a,'ArmorySkillsSummary')));await applyBuild(a);
    await clickState(a,'ArmorySkills',s=>s.menu==='skills');await toggleSkill(a,'reinforcedHull');await toggleSkill(a,'emergencyRepairs');await applySkills(a);
    await clickState(a,'SkillsArmory',s=>s.menu==='armory');await choose(a,2,'');await nameBuild(a,'Active pressure');await applyBuild(a);
    const prepared=await snapshot(a,'active-pressure'),capturedActive=prepared.skills.loadout;
    assert.deepEqual(capturedActive,['overdrive','minefield','emergencyRepairs'],'Removing Hull then adding Repairs preserves deliberate equip order');
    const boostBinding=skillInputBinding(capturedActive,'overdrive'),repairBinding=skillInputBinding(capturedActive,'emergencyRepairs'),mineBinding=skillInputBinding(capturedActive,'minefield');
    await clickState(a,'ArmoryCancel',s=>s.menu==='');await a.page.context().close();
    a=await actor('desktop-combat',{width:1920,height:1080},'combat');await snapshot(a,'initial-combat-fixture');
    assert.deepEqual(a.state().selectedSkills,capturedActive,'Separate disclosed combat fixture uses the order prepared through collection UI');
    if(a.state().selectedTier!==2)await clickState(a,'TierNext',s=>s.selectedTier===2);
    await deploy(a);
    await a.until(()=>a.state().activeSkills.length===3);assert.deepEqual(a.state().activeSkills,capturedActive,'Deployment captures exact shared slot order');
    await clickState(a,'Menu',s=>s.menu==='menu'&&s.paused);const menuTick=a.state().tick,menuUses=uses(a),menuAudio=a.run.audio.length;
    for(const key of ['q','e','r'])await press(a,key);
    check('Menu pause refuses Q/E/R without time, use or audio changes',()=>{
      assert.equal(a.state().tick,menuTick);assert.deepEqual(uses(a),menuUses);assert.equal(a.run.audio.length,menuAudio);assert.equal(a.state().paused,true);
    });await a.shot('menu-pauses-skills');await clickState(a,'MenuResume',s=>s.menu===''&&!s.paused);await pause(a,true);
    const pausedTick=a.state().tick;for(const key of ['q','e','r'])await press(a,key);
    assert.equal(a.state().tick,pausedTick);assert.deepEqual(uses(a),[false,false,false]);await pause(a,false);
    await press(a,boostBinding.key);await a.until(()=>a.state().overdriveUsed&&a.state().overdriveRemainingTicks>0&&heardAudio(a,'skill-overdrive'));
    check(boostBinding.key.toUpperCase()+' activates Overdrive through its actual slot with admitted cue',()=>assert.ok(heardAudio(a,'skill-overdrive')));
    await a.shot('overdrive');
    for(let i=0;i<12&&control(a,'SpeedPlus')?.interactable;i++){
      const before=a.state().selectedSpeed;await clickState(a,'SpeedPlus',s=>s.selectedSpeed>before);
    }
    const damageStart=a.run.states.length;
    await a.until(()=>a.run.states.length>damageStart&&a.state().hull<a.run.encounters.at(-1)?.maxHp&&control(a,repairBinding.control)?.active&&control(a,repairBinding.control).interactable,180);
    const damaged=a.state().hull,repairStart=a.run.states.length;await press(a,repairBinding.key);
    await a.until(()=>a.run.states.slice(repairStart).some(s=>s.action==='skill-activated'&&s.repairsUsed)&&heardAudio(a,'skill-repairs'));
    const repairReceipt=a.run.states.slice(repairStart).find(s=>s.action==='skill-activated'&&s.repairsUsed);
    check(repairBinding.key.toUpperCase()+' repairs real damage once through its actual slot',()=>{
      assert.ok(heardAudio(a,'skill-repairs'));assert.ok(repairReceipt.hull>damaged,'Accepted repair packet improves the fresh pre-input hull');
    });
    await press(a,mineBinding.key);await a.until(()=>a.state().minefieldUsed&&heardAudio(a,'skill-mines-armed'));
    check(mineBinding.key.toUpperCase()+' arms Minefield once through captured slot',()=>{assert.ok(heardAudio(a,'skill-mines-armed'));assert.deepEqual(uses(a),[true,true,true]);});
    await a.shot('all-actives-used');const afterUseWave=a.state().checkpointWave;
    await a.until(()=>a.state().checkpointWave>afterUseWave,90);await pause(a,true);
    const saved=await snapshot(a,'spent-checkpoint');assertSkillCheckpoint(saved.checkpoint);assert.equal(saved.checkpoint.skillState.spentMask,7);
    await a.reload();await openSkills(a);for(const key of capturedActive)await toggleSkill(a,key);
    for(const key of passiveKeys)await toggleSkill(a,key);await applySkills(a);
    const future=await snapshot(a,'next-run-passives');assert.deepEqual(future.checkpoint,saved.checkpoint);await clickState(a,'SkillsCancel',s=>s.menu==='');await deploy(a);
    await a.until(()=>a.state().paused);const resumedTick=a.state().tick,resumedUses=uses(a);
    for(const key of ['q','e','r'])await press(a,key);await a.page.waitForTimeout(700);
    check('Reload resumes paused with captured spent actives despite future passive build',()=>{
      assert.equal(a.state().tick,saved.checkpoint.encounter.tick);assert.equal(a.state().tick,resumedTick);assert.deepEqual(a.state().activeSkills,capturedActive);
      assert.deepEqual(a.state().selectedSkills,passiveKeys);assert.deepEqual(resumedUses,[true,true,true]);assert.deepEqual(uses(a),resumedUses);
    });await a.shot('paused-resume');const cues=skillActivationCues(a.run.audio).length;
    await pause(a,false);for(const key of ['q','e','r'])await press(a,key);
    check('Resume cannot refill spent skills',()=>{assert.deepEqual(uses(a),[true,true,true]);assert.equal(skillActivationCues(a.run.audio).length,cues);});
    await pause(a,true);await snapshot(a,'after-resume');await a.page.context().close();

    for(const [id,viewport] of [['portrait',{width:390,height:844}],['short-landscape',{width:844,height:390}]]){
      const small=await actor(id,viewport,'collection');await openSkills(small,true);await focusAndScroll(small,id);
      await toggleSkill(small,'emergencyRepairs',{touch:true});await toggleSkill(small,'reinforcedHull',{touch:true});await applySkills(small,{touch:true});
      check(id+' applies mixed slots through scrolling touch controls',()=>assert.deepEqual(small.state().selectedSkills,mixed));
      await clickState(small,'SkillsArmory',s=>s.menu==='armory',{touch:true});const compactSlot=small.state().armoryPresetSlot;await nameBuild(small,'Compact '+id);await applyBuild(small);
      const compactSave=await snapshot(small,'named-mixed-build');assert.deepEqual(compactSave.loadoutPresets[compactSlot].skills,mixed);await small.shot('armory');
      await clickState(small,'ArmoryCancel',s=>s.menu==='',{touch:true});await deploy(small);
      await small.click('CombatSkill0',{touch:true});await small.until(()=>small.state().overdriveUsed&&heardAudio(small,'skill-overdrive'));
      await small.click('CombatSkill1',{touch:true});await small.until(()=>small.state().minefieldUsed&&heardAudio(small,'skill-mines-armed'));
      check(id+' pointer actives work while passive shared slot stays noninteractive',()=>{
        assert.match(control(small,'CombatSkill2').label,/PASSIVE/);assert.equal(control(small,'CombatSkill2').interactable,false);
        assert.ok(heardAudio(small,'skill-overdrive')&&heardAudio(small,'skill-mines-armed'));
      });await pause(small,true,{touch:true});await small.shot('mixed-combat');await snapshot(small,'combat-save');await small.page.context().close();
    }
    for(const run of report.runs)check(run.id+' has zero browser errors and trusted action edges',()=>{
      assert.deepEqual(run.errors,[]);assert.ok(run.actions.length>0&&run.inputs.some(e=>e.kind==='pointerup'));
      assert.ok(run.inputs.filter(e=>['pointerdown','pointerup','keydown','keyup','wheel'].includes(e.kind)).every(e=>e.trusted));
    });
    assertPackagedRuntimeParity(report.packaged,packagedRuntimeSnapshot());assert.deepEqual(skillsJourneyInputHashes(),report.inputs);
    assert.equal(sha(readFileSync(fixturePath)),report.fixture.sha256,'Fixture bytes unchanged');
    assert.equal(sha(readFileSync(combatPath)),report.fixture.combat.sha256,'Separate combat fixture bytes unchanged');report.status='pass';
  }catch(error){
    report.status='failed';report.error=String(error.stack??error);
    for(const [i,context] of contexts.entries())for(const page of context.pages())if(!page.isClosed())
      await page.screenshot({path:resolve(output,'failure-'+i+'.png')}).catch(()=>{});
  }finally{
    for(const context of contexts)await context.close().catch(()=>{});await browser?.close();
    report.finishedUtc=new Date().toISOString();persist();
    // Playwright can attach megabytes of WebGL browser logs to a transport
    // error. Preserve them in result.json, keep the terminal summary bounded.
    console.log(JSON.stringify({status:report.status,checks:report.checks.length,result:resultPath,error:report.error?.split('\n')[0]}));
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runSkillsJourney(process.argv[2],process.argv[3],process.argv[4]).then(report=>{if(report.status!=='pass')process.exitCode=1;})
    .catch(error=>{console.error(error);process.exitCode=1;});

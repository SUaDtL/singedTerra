import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity,
  fetchBoundRuntime, assertServedBytes, readShopControlObservation, selectLastStandFitting } from './lastStandJourney.mjs';
import { tierJourneyControlGeometry } from './lastStandTierJourney.mjs';
import { buildWaveOracle } from './lastStandWaveOracle.mjs';

const SAVE_KEY='singedTerra.lastStand.prototype.v1';
const FITTINGS=['launcher','repair','scattergun'];
export const WAVE_JOURNEY_INPUTS=Object.freeze(['e2e/helpers/lastStandWaveJourney.mjs','e2e/helpers/lastStandWaveOracle.mjs',
  'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandJourney.mjs','e2e/last-stand-playable-loop.spec.ts',
  'scripts/last-stand-first-session.mjs']);
const hashInputs=()=>Object.fromEntries(WAVE_JOURNEY_INPUTS.map(path=>[path,createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));

// These assertions compare observations; Unity remains the sole save decoder
// and simulation owner. No JS fixture can qualify a player or grant rewards.
export function validateWaveResume({saved,afterResume,stable,afterStored,shop}) {
  assert.equal(saved.version,4);assert.ok(saved.checkpoint,'A durable checkpoint is required');
  assert.deepEqual(afterStored,saved,'Resume must not rewrite or reward the saved wave');
  const {runId,encounter:e,shop:s}=saved.checkpoint;
  for(const state of [afterResume,stable]) {
    assert.equal(state.phase,'battle');assert.equal(state.saveState,'ready');
    assert.equal(state.profileVersion,e.rulesVersion);assert.equal(state.runId,runId);
    assert.equal(state.activeTier,e.tier);assert.equal(state.fittingId,FITTINGS[e.fitting]);
    assert.equal(state.hasCheckpoint,true);assert.equal(state.checkpointBlocked,false);
    assert.equal(state.wave,e.completedWave+1);assert.equal(state.completedWave,e.completedWave);
    assert.equal(state.checkpointWave,e.completedWave);assert.equal(state.tick,e.tick,'No closed-tab or paused catch-up');
    assert.equal(state.hull,e.hull);assert.equal(state.kills,e.kills);
    assert.equal(state.cannonDamage,e.committedCannonDamage);assert.equal(state.wallet,saved.credits);
    assert.equal(state.paused,true);assert.equal(state.speed,0);
  }
  assert.equal(shop.mode,'Run');assert.equal(shop.runId,runId);
  for(const key of ['uniqueKills','earnedScrap','spentScrap','scrap'])assert.equal(shop[key],s[key],'Restored ledger '+key);
  assert.deepEqual(shop.cards.map(c=>c.key).sort(),Object.keys(s.runPurchases).sort(),'Exactly one card per saved track');
  for(const card of shop.cards){assert.equal(card.p,s.permanentLevels[card.key]);assert.equal(card.n,s.runPurchases[card.key]);}
}
export function validateWaveCommit({before,after,state,repeatable,firstClear}) {
  assert.equal(before.version,4);assert.equal(after.version,4);
  assert.ok(before.checkpoint && after.checkpoint);assert.equal(after.pendingDefeat,null,'No separate defeat payout for a wave');
  const prior=before.checkpoint,current=after.checkpoint,e=current.encounter;
  assert.equal(current.runId,prior.runId);assert.equal(current.shop.runId,prior.runId);
  assert.equal(e.completedWave,prior.encounter.completedWave+1,'Exactly the next finite cohort commits');
  assert.equal(e.wave,e.completedWave);assert.equal(e.rulesVersion,'last-stand-waves-v1');
  assert.equal(e.tier,prior.encounter.tier);assert.equal(e.fitting,prior.encounter.fitting);
  assert.ok(e.hull>0);assert.ok(e.kills>prior.encounter.kills);
  assert.equal(current.shop.uniqueKills,e.kills,'All cleared enemies enter the saved ledger');
  assert.equal(after.credits,before.credits+repeatable+firstClear,'Reward is durable exactly once');
  assert.equal(state.checkpointWave,e.completedWave);assert.equal(state.completedWave,e.completedWave);
  assert.equal(state.wave,e.completedWave+1,'Next wave follows the committed boundary');
  assert.equal(state.hasCheckpoint,true);assert.equal(state.wallet,after.credits);
}
export function validateWaveAbandon({before,after,reloaded}) {
  assert.ok(before.checkpoint);assert.equal(after.checkpoint,null);
  assert.equal(after.lastFinalizedRunId,before.checkpoint.runId);assert.equal(after.pendingDefeat,null);
  const expected={...before,checkpoint:null,lastFinalizedRunId:before.checkpoint.runId};
  assert.deepEqual(after,expected,'Abandon preserves every banked reward and upgrade');
  assert.deepEqual(reloaded,after,'A finalized run cannot resurrect after reload');
}

// Passive input/console stamps. No gameplay callback, storage replacement,
// simulation speed override or Unity SendMessage is exposed by this observer.
export const WAVE_JOURNEY_PROBE=`(() => {
 const original=console.log;
 console.log=function(...args){const text=args.map(String).join(' ');const t=performance.now(),timeOrigin=performance.timeOrigin;
  original.apply(this,args);
  if(['ST_LS_STATE ','ST_LS_HUD_LAYOUT ','ST_LS_SHOP_STATE ','ST_LS_SHOP_PURCHASE ','ST_ENC_STATE ','ST_ENC_CALLBACK ','ST_LS_AUDIO event='].some(tag=>text.startsWith(tag)))
   original.call(console,'ST_WAVE_OBSERVATION '+JSON.stringify({text,t,timeOrigin}));};
 for(const kind of ['pointerdown','pointerup','keydown','keyup','blur','focus','visibilitychange'])
  window.addEventListener(kind,event=>original.call(console,'ST_WAVE_INPUT '+JSON.stringify({kind:event.type,t:performance.now(),timeOrigin:performance.timeOrigin,
   trusted:event.isTrusted,code:event.code,x:event.clientX,y:event.clientY,target:event.target?.id??'',focused:document.hasFocus(),hidden:document.hidden})),{capture:true,passive:true});
})();`;

// Current ordinary-player acceptance. Deep progression is separately exercised
// by the source-bound core/save tests; this journey earns its initial wave itself.
export async function runLastStandWaveJourney({page,baseURL,testInfo,fitting='repair',viewports=[
  {name:'approved-standard',width:1366,height:768},{name:'approved-wide',width:1920,height:1080},
  {name:'approved-portrait',width:390,height:844},{name:'approved-landscape',width:844,height:390},
  {name:'approved-compact',width:720,height:640}]}) {
  assert.ok(['repair','launcher'].includes(fitting),'Fresh accounts use an unlocked fitting');
  const base=admitJourneyBase(baseURL),output=dirname(testInfo.outputPath('wave-observations.json'));
  for(const name of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
    execFileSync(process.execPath,[resolve('scripts/assets',name)],{encoding:'utf8'});
  const packaged=packagedRuntimeSnapshot(),inputs=hashInputs(),oracle=buildWaveOracle(output);
  const manifest=JSON.parse(readFileSync(resolve('client/public/last-stand/asset-manifest.json'),'utf8'));
  for(const [path,expected]of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
    assertServedBytes(await fetchBoundRuntime(base,path),expected);
  const report={version:1,status:'running',normalSpeed:true,seeded:false,host:process.platform,fitting,
    scope:'Source-bound ordinary-input wave/checkpoint browser behavior; native media and owner acceptance are separate.',
    inputs,packaged,oracle:oracle.binding,actions:[],inputsObserved:[],states:[],layouts:[],shops:[],purchases:[],
    encounters:[],callbacks:[],audio:[],storage:[],checks:[],screenshots:[],errors:[],errorObservations:[]};
  let load=0,observerError;const current=rows=>rows.filter(row=>row.load===load).at(-1);
  const ready=()=>report.states.some(row=>row.load===load&&row.action==='ready')&&current(report.states)?.saveState==='ready';
  const check=(claim,run)=>{run();report.checks.push({name:claim,pass:true});};
  const consoleObserver=message=>{
    const raw=message.text();if(message.type()==='error'){
      report.errors.push(raw);report.errorObservations.push({text:raw,load,observedAt:Date.now(),
        location:message.location(),state:current(report.states),lastAction:report.actions.at(-1)});
    }
    try {
      if(raw.startsWith('ST_WAVE_INPUT '))report.inputsObserved.push({...JSON.parse(raw.slice(14)),load});
      if(!raw.startsWith('ST_WAVE_OBSERVATION '))return;
      const observation=JSON.parse(raw.slice(20)),{text,t,timeOrigin}=observation;
      for(const [tag,rows]of [['ST_LS_STATE ',report.states],['ST_LS_SHOP_STATE ',report.shops],
        ['ST_LS_SHOP_PURCHASE ',report.purchases],['ST_ENC_STATE ',report.encounters],['ST_ENC_CALLBACK ',report.callbacks]])
        if(text.startsWith(tag))rows.push({...JSON.parse(text.slice(tag.length).split('\n')[0]),t,timeOrigin,load});
      if(text.startsWith('ST_LS_HUD_LAYOUT '))report.layouts.push({...readShopControlObservation(text),t,timeOrigin,load});
      if(text.startsWith('ST_LS_AUDIO event='))report.audio.push({text,t,timeOrigin,load});
    } catch(error){observerError??=error;}
  };
  const pageError=error=>report.errors.push(String(error));page.on('console',consoleObserver);page.on('pageerror',pageError);
  await page.addInitScript(WAVE_JOURNEY_PROBE);
  const until=async(predicate,seconds=30)=>{
    const deadline=Date.now()+seconds*1000;
    while(Date.now()<deadline){if(observerError)throw observerError;if(predicate())return;await page.waitForTimeout(40);}
    throw new Error('Wave journey state absent: '+JSON.stringify(current(report.states)));
  };
  const stored=async label=>{
    const raw=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
    const data=raw===null?null:JSON.parse(raw);report.storage.push({label,raw,data,load});return data;
  };
  const geometry=async()=>{
    const pixels=await page.locator('#unity-canvas').evaluate(c=>({width:c.width,height:c.height}));
    await until(()=>Math.abs(current(report.layouts)?.width-pixels.width)<1&&Math.abs(current(report.layouts)?.height-pixels.height)<1,8);
    const layout=current(report.layouts),canvas=await page.locator('#unity-canvas').boundingBox();assert.ok(canvas);
    return {layout,canvas,projected:tierJourneyControlGeometry(layout,canvas)};
  };
  const reveal=async name=>{
    for(let attempt=0;attempt<40;attempt++){
      const geometryNow=await geometry(),{layout,canvas,projected}=geometryNow;
      const target=projected.find(c=>c.name===name);assert.ok(target,'Current visible-page target '+name);
      if(target.full)return geometryNow;
      const item=[...layout.controls,...layout.shopControls,...layout.settingsControls].find(c=>c.name===name);
      const clip=target.clip,sign=item.y<clip.y?-1:1;
      const x=canvas.x+(clip.x+clip.width/2)*canvas.width/layout.width;
      const y=canvas.y+(clip.y+clip.height/2)*canvas.height/layout.height;
      const old=layout.settingsScrollOffset+layout.scrollOffset;
      await page.mouse.move(x,y);await page.mouse.wheel(0,sign*Math.min(180,clip.height*canvas.height/layout.height/2));
      await until(()=>Math.abs(current(report.layouts).settingsScrollOffset+current(report.layouts).scrollOffset-old)>.5,5);
    }
    assert.fail('Target could not be fully revealed by ordinary scrolling: '+name);
  };
  const click=async name=>{
    const {layout,canvas}=await reveal(name);
    const control=[...layout.controls,...layout.shopControls,...layout.settingsControls].find(c=>c.name===name&&c.active&&c.interactable);
    assert.ok(control,'Current operable control '+name);
    const x=canvas.x+(control.x+control.width/2)*canvas.width/layout.width,y=canvas.y+(control.y+control.height/2)*canvas.height/layout.height;
    const start=report.inputsObserved.length;await page.mouse.click(x,y,{delay:100});
    await until(()=>report.inputsObserved.slice(start).some(e=>e.kind==='pointerup'),5);
    const edges=report.inputsObserved.slice(start).filter(e=>['pointerdown','pointerup'].includes(e.kind));
    assert.deepEqual(edges.map(e=>e.kind),['pointerdown','pointerup']);
    assert.ok(edges.every(e=>e.trusted&&e.target==='unity-canvas'&&Math.abs(e.x-x)<1&&Math.abs(e.y-y)<1));
    report.actions.push({name,x,y,load,inputStart:start,inputEnd:report.inputsObserved.length});
  };
  const capture=async label=>{await geometry();const path=testInfo.outputPath(label+'.png');await page.screenshot({path});
    report.screenshots.push({label,path,load,viewport:page.viewportSize(),state:current(report.states)});};
  const matrix=async label=>{for(const viewport of viewports){await page.setViewportSize({width:viewport.width,height:viewport.height});
    await page.waitForTimeout(200);await capture(label+'-'+viewport.name);}await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(200);};
  const reload=async()=>{load++;await page.reload();await until(ready);};
  const resume=async(saved,label)=>{
    const control=current(report.layouts).controls.find(c=>c.active&&c.interactable&&['Deploy','Redeploy'].includes(c.name));assert.ok(control);
    await click(control.name);await until(()=>current(report.states)?.phase==='battle'&&current(report.states).paused);
    const afterResume=current(report.states);await page.waitForTimeout(1100);
    // Force a fresh observation through an ordinary control after the wait;
    // an old unchanged console row alone cannot establish paused stability.
    await click('Menu');await until(()=>current(report.states)?.menu==='menu');
    validateWaveResume({saved,afterResume,stable:current(report.states),afterStored:await stored(label),shop:current(report.shops)});
    await click('SettingsClose');await until(()=>current(report.states)?.menu==='');
  };
  try {
    await page.setViewportSize({width:1366,height:768});load++;await page.goto(new URL('last-stand/',base).href);
    await until(ready);
    const initial=await stored('fresh');assert.equal(initial.version,4);assert.equal(initial.checkpoint,null);assert.equal(initial.credits,0);
    assert.ok(Object.values(initial.permanentLevels).every(level=>level===0));
    await click('TierNext');await until(()=>current(report.states)?.lockedTierPreview);
    check('First locked tier is a preview with no further tier or deploy action',()=>{
      for(const name of ['TierNext','Deploy'])assert.equal(current(report.layouts).controls.find(c=>c.name===name).interactable,false);
    });assert.deepEqual(await stored('locked-preview'),initial);
    await click('TierPrevious');await until(()=>!current(report.states)?.lockedTierPreview);
    await selectLastStandFitting({fitting,click,currentLayout:()=>current(report.layouts),currentState:()=>current(report.states),waitFor:p=>until(p,8)});
    await matrix('wave-garage');await click('Deploy');await until(()=>current(report.states)?.phase==='battle');
    const starting=await stored('starting-checkpoint');assert.equal(starting.checkpoint.encounter.completedWave,0);assert.equal(starting.checkpoint.encounter.tick,0);
    await until(()=>current(report.states)?.completedWave===1,90);
    await click('SpeedRate');await until(()=>current(report.states)?.paused);
    const cleared=await stored('wave-one-cleared');
    check('Defeated finite cohort banks one wave and its reward before the next wave',()=>{
      validateWaveCommit({before:starting,after:cleared,state:current(report.states),repeatable:1,firstClear:0});
      const row=oracle.profiles['1:'+fitting+':20'][cleared.checkpoint.encounter.tick];assert.ok(row);
      for(const [savedKey,oracleKey]of [['hull','hp'],['kills','kills'],['completedWave','completedWave'],['cannonShots','cannon'],['launcherShots','launcher'],['restored','healed']])
        assert.equal(cleared.checkpoint.encounter[savedKey],row[oracleKey],'Actual-model boundary '+savedKey);
    });
    await matrix('wave-combat-paused');await click('Menu');await until(()=>current(report.states)?.menu==='menu');
    await click('MenuMilestones');await until(()=>current(report.states)?.menu==='milestones');await matrix('wave-milestones');
    const milestoneText=JSON.parse(current(report.layouts).raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics.find(g=>g.path.endsWith('/SettingsBody')&&g.active)?.text;
    assert.match(milestoneText,/UPCOMING/);assert.match(milestoneText,/One-time bonus/);assert.match(milestoneText,/Repeatable wave reward/);
    assert.match(milestoneText,/WAVE 100 /);assert.match(milestoneText,/scattergun/);assert.match(milestoneText,/WAVE 300 /);assert.match(milestoneText,/Unlock Tier 2/);
    await click('SettingsClose');await until(()=>current(report.states)?.menu==='');
    await click('ShopEntry');await until(()=>current(report.shops)?.open);
    await click('ShopTabAttack');await until(()=>current(report.shops)?.category==='Attack');
    const priorShop=current(report.shops);await click('ShopCard_cannonAttackBuy');
    await until(()=>current(report.purchases)?.accepted&&current(report.shops)?.spentScrap>priorShop.spentScrap);
    check('Partial-wave purchase spends Scrap and increases the actual run upgrade',()=>{
      assert.equal(current(report.shops).cards.find(c=>c.key==='cannonAttack').n,1);
      assert.equal(current(report.shops).spentScrap-priorShop.spentScrap,current(report.purchases).chargedScrap);
      assert.equal(current(report.shops).scrap,priorShop.scrap-current(report.purchases).chargedScrap);
    });assert.deepEqual(await stored('partial-wave-purchase'),cleared,'Partial-wave purchases do not rewrite the checkpoint');
    await reload();assert.deepEqual(await stored('closed-tab-reload'),cleared);
    assert.equal(current(report.states).phase==='garage'||current(report.states).phase==='workshop',true);
    await resume(cleared,'restored-checkpoint');report.checks.push({name:'Explicit resume restores HP, wave, upgrades and resources together and starts paused',pass:true});
    await click('Menu');await until(()=>current(report.states)?.menu==='menu');await click('MenuNewRun');
    await until(()=>current(report.states)?.menu==='confirm');await click('ConfirmCancel');await until(()=>current(report.states)?.menu==='menu');
    assert.deepEqual(await stored('cancel-new-run'),cleared);await click('SettingsClose');await until(()=>current(report.states)?.menu==='');
    // This ordinary page navigation goes through the production wrapper bridge.
    await page.getByRole('link',{name:'Return to Campaigns',exact:true}).click();
    await page.locator('button[data-command-item="last-stand"][aria-current="true"]').waitFor({state:'visible'});
    assert.deepEqual(await stored('ordinary-return'),cleared);
    load++;await page.goto(new URL('last-stand/',base).href);await until(ready);
    await resume(cleared,'return-resumed');
    await click('Menu');await until(()=>current(report.states)?.menu==='menu');await click('MenuAbandon');await until(()=>current(report.states)?.menu==='confirm');
    await click('ConfirmProceed');await until(()=>!current(report.states)?.hasCheckpoint&&current(report.states)?.menu==='');
    const abandoned=await stored('confirmed-abandon');await reload();
    const reloaded=await stored('abandon-reloaded');
    check('Confirmed abandon preserves banked rewards and cannot resurrect the checkpoint',()=>validateWaveAbandon({before:cleared,after:abandoned,reloaded}));
    assert.ok(!current(report.layouts).controls.some(c=>c.active&&/RESUME RUN/.test(c.label)));
    if(observerError)throw observerError;assert.deepEqual(report.errors,[]);assert.ok(report.inputsObserved.some(e=>e.trusted));
    assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(hashInputs(),inputs);
    report.status='pass';return report;
  } catch(error){report.status='failed';report.error=String(error);throw error;}
  finally {
    page.off('console',consoleObserver);page.off('pageerror',pageError);
    const path=testInfo.outputPath('wave-observations.json');writeFileSync(path,JSON.stringify(report,null,2));
    await testInfo.attach('Wave and checkpoint observations',{path,contentType:'application/json'});
    for(const shot of report.screenshots)await testInfo.attach(shot.label,{path:shot.path,contentType:'image/png'});
  }
}

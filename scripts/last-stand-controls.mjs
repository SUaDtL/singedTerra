import {findLastStandSettingsViewport} from '../e2e/helpers/lastStandControlReveal.mjs';
import {LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
// Real player input against a freshly source-bound Web export. No gameplay save fixtures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity, fetchBoundRuntime, assertServedBytes,
  readShopControlObservation, AUDIO_CAPTURE, selectLastStandFitting, validateFittingCalloutObservation,
  validateCompactCombatControls } from '../e2e/helpers/lastStandJourney.mjs';
import { tierJourneyControlGeometry } from '../e2e/helpers/lastStandTierJourney.mjs';

const arguments_=process.argv.slice(2), fittingArguments=arguments_.filter(value=>value.startsWith('--fitting='));
const positional=arguments_.filter(value=>!value.startsWith('--fitting='));
assert.ok(fittingArguments.length<=1&&positional.length<=1,'Use [output] [--fitting=repair|launcher]');
const fittings=fittingArguments.length?[fittingArguments[0].slice('--fitting='.length)]:['repair','launcher'];
assert.ok(fittings.every(value=>['repair','launcher'].includes(value)),'Known fitting filter required');
const output = resolve(positional[0] ?? 'campaign-unity/Evidence/player-controls/' + new Date().toISOString().replace(/[:.]/g,'-'));
const base = admitJourneyBase(process.env.E2E_LIVE_URL ?? 'http://127.0.0.1:4173/singedTerra/');
for (const name of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve('scripts/assets',name)],{stdio:'pipe'});
const manifest = JSON.parse(readFileSync('client/public/last-stand/asset-manifest.json','utf8'));
for (const [path,hash] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),hash);
mkdirSync(dirname(output),{recursive:true}); mkdirSync(output,{recursive:false});
const inputHashes=()=>Object.fromEntries(['scripts/last-stand-controls.mjs',
  'e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandControlReveal.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json','campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v4.json','e2e/helpers/lastStandTierJourney.mjs',
  'scripts/assets/verify-last-stand-source.mjs','scripts/assets/verify-last-stand.mjs']
  .map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const report = {status:'running',scope:'source-bound headless Web controls and recorded audio; owner listening and native acceptance separate',
  runtime:packagedRuntimeSnapshot(),inputs:inputHashes(),requestedFittings:fittings,runs:[]};
const assertInputs=async()=>{
  assertPackagedRuntimeParity(report.runtime,packagedRuntimeSnapshot());
  assert.deepEqual(inputHashes(),report.inputs,'Controls journal inputs changed while running');
  for(const [path,hash] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
    assertServedBytes(await fetchBoundRuntime(base,path),hash);
};
const persist=()=>writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2));
try {
for(const fitting of fittings) {
  const browser=await chromium.launch({headless:true});
  const run={fitting,status:'running',actions:[],captures:[],audioWindows:[],callouts:[],errors:[],consoleErrors:[]}; report.runs.push(run); persist();
  let page,latest,layout,callout,parseError;
  try {
    const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:fitting==='launcher'?2:1,
      proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
    await context.addInitScript(AUDIO_CAPTURE);
    await context.addInitScript(() => {
      window.__stRenderViewports=[];
      const original=WebGL2RenderingContext.prototype.viewport;
      WebGL2RenderingContext.prototype.viewport=function(x,y,w,h) {
        window.__stRenderViewports.push({t:performance.now(),w,h,bufferWidth:this.drawingBufferWidth,bufferHeight:this.drawingBufferHeight});
        if(window.__stRenderViewports.length>200)window.__stRenderViewports.shift();
        return original.call(this,x,y,w,h);
      };
    });
    page=await context.newPage();
    page.on('pageerror',error=>run.errors.push(String(error)));
    page.on('console',message=>{
      const text=message.text();
      if(message.type()==='error')run.consoleErrors.push(text);
      try {
        if(text.startsWith('ST_LS_STATE ')) latest=JSON.parse(text.slice(12));
        if(text.startsWith('ST_LS_HUD_LAYOUT ')) layout=readShopControlObservation(text);
        if(text.startsWith('ST_LS_FITTING_CALLOUT ')){
          callout=validateFittingCalloutObservation(JSON.parse(text.slice('ST_LS_FITTING_CALLOUT '.length)));
          run.callouts.push({observedAt:Date.now(),value:callout});
        }
      } catch(error) { parseError ??= error; run.rejectedTelemetry ??= text; }
    });
    const until=async(check,seconds=15)=>{
      const end=Date.now()+seconds*1000;
      while(Date.now()<end) { if(parseError)throw parseError; if(check())return; await page.waitForTimeout(50); }
      throw new Error('Missing observation: '+JSON.stringify(latest));
    };
    const raw=()=>JSON.parse(layout.raw.slice('ST_LS_HUD_LAYOUT '.length));
    const items=()=>layout?[...layout.controls,...layout.shopControls,...layout.settingsControls]:[];
    const point=async(c)=>{
      const box=await page.locator('#unity-canvas').boundingBox();
      return {x:box.x+(c.x+c.width/2)*box.width/layout.width,y:box.y+(c.y+c.height/2)*box.height/layout.height};
    };
    const awaitCanvasSize=async()=>{
      // The ready event can precede Unity's first DPR-aware Canvas update.
      // Wait for actual geometry after every load/resize before mapping input.
      const bounds=await page.locator('#unity-canvas').boundingBox();
      await until(()=>layout&&Math.abs(layout.width/layout.pixelRatio-bounds.width)<1&&Math.abs(layout.height/layout.pixelRatio-bounds.height)<1);
    };
    const click=async(name)=>{
      await awaitCanvasSize();
      await until(()=>items()?.some(c=>c.name===name&&c.active&&c.interactable));
      for(let attempt=0;attempt<16;attempt++) {
        const item=items().find(c=>c.name===name&&c.active&&c.interactable);
        const viewport=findLastStandSettingsViewport(raw().graphics);
        if(viewport&&item.mode==='Settings'&&!['SettingsClose','SettingsTab0','SettingsTab1','SettingsTab2','SettingsTab3','ChoicePrevious','ChoiceNext'].includes(name)) {
          if(item.y<viewport.y||item.y+item.height>viewport.y+viewport.height) {
            await page.mouse.move(...Object.values(await point(viewport)));
            await page.mouse.wheel(0,item.y<viewport.y?-220:220); await page.waitForTimeout(100); continue;
          }
        }
        const p=await point(item); run.actions.push({name,label:item.label,tick:latest?.tick,...p});
        await page.mouse.click(p.x,p.y,{delay:80}); await page.waitForTimeout(100); return;
      }
      throw new Error('Control is not reachable by scrolling: '+name);
    };
    const capture=async(label)=>{
      tierJourneyControlGeometry(layout,await page.locator('#unity-canvas').boundingBox());
      if(['battle','settling'].includes(latest.phase)&&latest.menu===''&&!layout.shopControls.some(c=>c.name==='ShopClose'&&c.active))
        validateCompactCombatControls(layout);
      const visible=latest.menu===''&&['garage','workshop'].includes(latest.phase)&&
        !layout.shopControls.some(c=>c.name==='ShopClose'&&c.active);
      await until(()=>callout&&callout.visible===visible&&callout.width===layout.width&&callout.height===layout.height);
      validateFittingCalloutObservation(callout,{visible,fitting:latest.fittingId,width:layout.width,height:layout.height});
      const path=join(output,fitting+'-'+label+'.png'); await page.screenshot({path});
      run.captures.push({label,path,state:{...latest},layout:raw(),callout}); persist();
    };
    const audioWindow=async(label,audible)=>{
      const start=await page.evaluate(()=>performance.now()); let samples=[];
      for(let attempt=0;attempt<16;attempt++) {
        await page.waitForTimeout(attempt===0?1200:400);
        samples=await page.evaluate(start=>(window.__stAudioCapture?.captures??[]).flatMap(c=>c.samples.filter(s=>s.t>start+250)),start);
        if(samples.length>=10)break;
      }
      assert.ok(samples.length>=10,'Actual Web Audio samples exist');
      const peak=Math.max(...samples.map(s=>s.peak));
      assert.ok(audible?peak>0.00001:peak<0.00001,label+' measured '+peak);
      run.audioWindows.push({label,audible,peak,samples});
    };
    const sampleEffect=async(label,audible)=>{
      const start=await page.evaluate(()=>performance.now());
      await click('EffectsSample'); let samples=[];
      for(let attempt=0;attempt<16;attempt++) {
        await page.waitForTimeout(400);
        samples=await page.evaluate(start=>(window.__stAudioCapture?.captures??[]).flatMap(c=>c.samples.filter(s=>s.t>=start)),start);
        if(samples.length>=10)break;
      }
      assert.ok(samples.length>=10,'Actual effects sample was observed');
      const peak=Math.max(...samples.map(s=>s.peak));
      assert.ok(audible?peak>0.00001:peak<0.00001,label+' measured '+peak);
      run.audioWindows.push({label,audible,peak,samples});
    };
    const keyboardCycle=async()=>{
      const box=await page.locator('#unity-canvas').boundingBox();
      const offset=layout.settingsScrollOffset*layout.height/box.height;
      const fixed=name=>['SettingsClose','ChoicePrevious','ChoiceNext'].includes(name)||/^SettingsTab[0-3]$/.test(name);
      const ordered=items().filter(c=>c.mode==='Settings'&&c.active&&c.interactable)
        .map(c=>({...c,logicalY:c.y+(fixed(c.name)?0:offset)})).sort((a,b)=>Math.abs(a.logicalY-b.logicalY)>.5?a.logicalY-b.logicalY:a.x-b.x);
      const initial=raw().selection; let index=ordered.findIndex(c=>c.name===initial);
      assert.ok(index>=0); const visited=new Set();
      for(let i=0;i<ordered.length;i++) {
        index=(index+1)%ordered.length; const expected=ordered[index].name;
        await page.keyboard.press('Tab'); await until(()=>raw().selection===expected);
        visited.add(raw().selection);
      }
      assert.equal(visited.size,ordered.length); assert.equal(raw().selection,initial,'Tab wraps inside the modal');
      index=(index+ordered.length-1)%ordered.length;
      await page.keyboard.press('Shift+Tab'); await until(()=>raw().selection===ordered[index].name);
      await page.keyboard.press('Tab'); await until(()=>raw().selection===initial);
    };
    const keyboardGarageArrow=async(name,observed)=>{
      assert.equal(latest.menu,'','Garage keyboard check has no overlay');
      const bound=items().filter(c=>c.active&&c.interactable).length+3,visited=[];
      for(let i=0;i<bound;i++) {
        await page.keyboard.press('Tab');await page.waitForTimeout(100);visited.push(raw().selection);
        if(raw().selection!==name||!await page.locator('#unity-canvas').evaluate(c=>document.activeElement===c))continue;
        assert.ok(items().some(c=>c.name===name&&c.active&&c.interactable),'Keyboard arrow is visibly enabled');
        await page.keyboard.press('Enter');await until(observed);
        run.actions.push({input:'keyboard',name,keys:[...visited.map(()=> 'Tab'),'Enter'],visited});return;
      }
      throw Error('Keyboard cannot reach actual inline arrow '+name+': '+visited.join(','));
    };
    const frameWindow=async(label)=>{
      const intervals=await page.evaluate(()=>new Promise(resolve=>{
        const values=[]; let previous;
        function tick(now) { if(previous!==undefined)values.push(now-previous); previous=now;
          if(values.length>=90)resolve(values);else requestAnimationFrame(tick); }
        requestAnimationFrame(tick);
      }));
      const sorted=[...intervals].sort((a,b)=>a-b);
      (run.frameWindows??=[]).push({label,scope:'headless browser frame cadence; no hardware FPS or GPU-time guarantee',intervals,
        medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)]});
    };
    await page.goto(new URL('last-stand/',base).href); await until(()=>latest?.saveState==='ready',60);
    assert.equal(latest.wallet,0); assert.equal(latest.level,0);
    await page.waitForTimeout(1200);
    const beforeGesture=await page.evaluate(()=>(window.__stAudioCapture?.captures??[]).map(c=>({state:c.context.state,samples:c.samples})));
    assert.ok(beforeGesture.every(c=>c.samples.every(s=>s.peak<0.00001)),'No rendered audio before the first gesture');
    run.beforeGesture=beforeGesture;
    await selectLastStandFitting({fitting,click,currentLayout:()=>layout,currentState:()=>latest,waitFor:predicate=>until(predicate)});
    const originalSave=await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1'));
    assert.equal(latest.environmentId,'sunlit-ash');
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:720,height:640},{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(viewport);await awaitCanvasSize();
      assert.equal(latest.menu,'');assert.equal(latest.garageTierId,'1');assert.equal(latest.garageTierUnlocked,true);
      assert.equal(items().find(c=>c.name==='ToggleTier').active,false,'Legacy tier toggle stays hidden in the garage');
      assert.equal(items().find(c=>c.name==='TierPrevious').interactable,false,'Tier browser has a bounded first endpoint');
      await capture('tier-current-'+viewport.width);
      if(viewport.width===1920)await keyboardGarageArrow('TierNext',()=>latest.garageTierId==='2');
      else {await click('TierNext');await until(()=>latest.garageTierId==='2');}
      assert.equal(latest.garageTierUnlocked,false);assert.equal(latest.selectedTier,1);assert.equal(latest.lockedTierPreview,true);
      assert.equal(latest.menu,'','Inline tier preview does not open a modal');
      assert.equal(latest.environmentId,'iron-perimeter');
      assert.equal(items().find(c=>c.name==='TierNext').interactable,false,'First locked tier is the preview boundary');
      assert.equal(items().find(c=>c.name==='Deploy').interactable,false,'Locked preview cannot deploy the previous tier');
      assert.equal(await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1')),originalSave,'Preview never commits a locked tier');
      await capture('tier-locked-preview-'+viewport.width);
      if(viewport.width===1920) {
        await keyboardGarageArrow('TierPrevious',()=>latest.garageTierId==='1');
        await click('TierNext');await until(()=>latest.lockedTierPreview);
        await click('Menu');await until(()=>latest.menu==='menu');
        await until(()=>callout?.visible===false);validateFittingCalloutObservation(callout,{visible:false});
        assert.equal(latest.environmentId,'sunlit-ash','Opening Menu restores the selected battlefield');
        assert.equal(latest.lockedTierPreview,false);
        await click('SettingsClose');await until(()=>latest.menu==='');
      } else {await click('TierPrevious');await until(()=>latest.garageTierId==='1');}
      assert.equal(latest.selectedTier,1);assert.equal(latest.environmentId,'sunlit-ash','Returning from locked preview restores the selected battlefield');
      assert.equal(latest.lockedTierPreview,false);assert.equal(latest.menu,'');
    }
    await page.setViewportSize({width:1366,height:768});
    await selectLastStandFitting({fitting,click,currentLayout:()=>layout,currentState:()=>latest,waitFor:predicate=>until(predicate)});
    await awaitCanvasSize();
    const fittingName=raw().graphics.find(g=>g.active&&g.kind==='Text'&&g.path.endsWith('/GarageFittingName'));
    assert.ok(fittingName&&fittingName.text.toUpperCase().includes(fitting==='repair'?'FIELD REPAIR':'AUXILIARY LAUNCHER'),
      'Visible garage card names the actual equipped fitting');
    assert.ok(raw().graphics.some(g=>g.active&&g.kind==='Text'&&g.path.endsWith('/GarageFittingDescription')&&g.text.trim()),
      'Visible fitting card supplies its mechanic description');
    await capture('fitting-selected');
    await click('Menu'); await click('MenuSettings'); await audioWindow('menu-music',true);
    await click('MusicEnabled'); await audioWindow('music-disabled',false);
    await sampleEffect('effects-sample-with-music-off',true);
    await click('MusicEnabled'); await click('MasterMinus'); await click('MusicPlus');
    for(let i=0;i<10;i++)await click('EffectsMinus');
    assert.equal(latest.effectsVolume,0); await audioWindow('effects-muted-music-continues',true);
    await click('MusicEnabled'); await audioWindow('both-channels-off',false);
    await sampleEffect('effects-zero-sample-silent',false); await click('MusicEnabled');
    for(let i=0;i<10;i++)await click('EffectsPlus');
    await click('SettingsTab1'); await frameWindow('current-quality');
    await click('DisplayQuality'); await click('DisplayEffects'); await frameWindow('performance-quality');
    assert.equal(latest.renderScale,.75,'Owned pipeline requests 75% resolution');
    await page.waitForTimeout(300);
    run.renderViewports=await page.evaluate(()=>window.__stRenderViewports);
    assert.ok(run.renderViewports.some(v=>Math.abs(v.w-v.bufferWidth*.75)<=2&&Math.abs(v.h-v.bufferHeight*.75)<=2),
      'Actual WebGL scene viewport uses 75% of the drawing buffer');
    if(await page.evaluate(()=>document.fullscreenEnabled)) {
      await click('DisplayFullscreen');
      await page.waitForFunction(()=>document.fullscreenElement!==null);
      await until(()=>latest.fullscreen===true);
      await click('DisplayFullscreen'); await page.waitForFunction(()=>document.fullscreenElement===null);
    } else assert.equal(items().find(c=>c.name==='DisplayFullscreen').interactable,false);
    await click('SettingsTab2'); await click('TutorialTips'); await click('PurchaseSuggestions');
    await capture('gameplay-settings');
    await click('SettingsClose'); await click('Deploy'); await until(()=>latest.phase==='battle');
    await until(()=>callout?.visible===false);validateFittingCalloutObservation(callout,{visible:false});
    await click('SpeedMinus'); assert.equal(latest.selectedSpeed,.5);
    const before=latest.tick,startWall=Date.now(); await page.waitForTimeout(2100);
    await click('SpeedMinus'); // Reconcile and emit the exact end of this measured rate interval.
    const elapsed=(Date.now()-startWall)/1000,advanced=latest.tick-before;
    assert.ok(Math.abs(advanced-elapsed*10)<=4,'Half-speed advances ten simulated ticks per measured wall second');
    run.halfSpeed={elapsed,advanced};
    assert.equal(latest.paused,true); assert.equal(latest.selectedSpeed,0);
    await click('SpeedPlus'); assert.equal(latest.selectedSpeed,.5);
    await click('SpeedRate'); const paused=latest.tick;
    await click('Menu'); await click('MenuSettings');
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:720,height:640},{width:390,height:844},{width:844,height:390}]) {
      await click('SettingsClose');
      await page.setViewportSize(viewport); await page.waitForTimeout(300);
      const canvasBounds=await page.locator('#unity-canvas').boundingBox();
      await until(()=>Math.abs(layout.width/layout.pixelRatio-canvasBounds.width)<1&&Math.abs(layout.height/layout.pixelRatio-canvasBounds.height)<1);
      await capture('battle-paused-'+viewport.width);
      await click('Menu'); await click('MenuSettings');
      for(const [tab,label] of [[0,'audio'],[1,'display'],[2,'gameplay'],[3,'save-account']]) {
        await click('SettingsTab'+tab); await capture(label+'-'+viewport.width);
      }
      await keyboardCycle();
      assert.equal(latest.tick,paused,'Menu/manual pause excludes elapsed time');
      await click('SettingsBack');
      for(const [button,label] of [['MenuHelp','help'],['MenuAbout','about']]) {
        await click(button); await capture(label+'-'+viewport.width);
        await click('SettingsBack');
      }
      await click('MenuSettings');
    }
    await page.setViewportSize({width:1366,height:768});
    const restoredBounds=await page.locator('#unity-canvas').boundingBox();
    await until(()=>Math.abs(layout.width/layout.pixelRatio-restoredBounds.width)<1&&Math.abs(layout.height/layout.pixelRatio-restoredBounds.height)<1);
    await click('SettingsClose'); await until(()=>latest.menu==='');
    assert.equal(latest.paused,true,'Closing menu preserves manual pause');
    await audioWindow('manual-pause-music',true);
    const away=await context.newPage(); await away.goto('about:blank'); await away.bringToFront();
    const hidden=await page.evaluate(()=>document.hidden);
    if(hidden) { await audioWindow('hidden-tab-silence',false); }
    run.backgroundVisibility={hidden,scope:hidden?'actual headless tab visibility':'headless browser did not hide original tab; native check remains pending'};
    await page.bringToFront(); await away.close(); await audioWindow('return-to-tab-music',true);
    await click('Menu'); await click('MenuSettings'); await click('SettingsTab0');
    await click('SettingsMute'); await audioWindow('master-muted',false); await click('SettingsMute');
    await click('SettingsClose'); assert.equal(latest.paused,true,'Audio settings preserve manual pause');
    await click('Menu'); await click('MenuAbandon');
    assert.equal(raw().selection,'ConfirmCancel','Destructive confirmation defaults to Cancel');
    await click('ConfirmCancel'); assert.equal(latest.runId>0,true);
    await click('MenuAbandon'); await click('ConfirmProceed');
    assert.equal(latest.phase,'garage'); assert.equal(latest.wallet,0); assert.equal(latest.runId,0);
    await click('Menu'); await click('MenuSettings'); await click('SettingsTab3');
    await capture('save-account');
    const persisted=await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.preferences.v1'));
    assert.ok(persisted); assert.equal(JSON.parse(persisted).tutorialTips,false); assert.equal(JSON.parse(persisted).lastPositiveSpeed,.5);
    const audio=await page.evaluate(()=>window.__stAudioCapture.finish());
    assert.ok(audio.supported); assert.deepEqual(audio.errors,[]);
    for(const [i,c] of audio.captures.entries()) writeFileSync(join(output,fitting+'-audio-'+i+'.webm'),Buffer.from(c.audio,'base64'));
    run.audio=audio.captures.map(({audio,...summary})=>summary);
    latest=null; layout=null; callout=null; await page.reload(); await until(()=>latest?.saveState==='ready',60);
    await click('Menu'); await click('MenuSettings'); await click('SettingsTab2');
    assert.match(items().find(c=>c.name==='TutorialTips').label,/OFF/);
    assert.match(items().find(c=>c.name==='PurchaseSuggestions').label,/OFF/);
    await click('SettingsTab3'); await click('SettingsDefaults'); await click('ConfirmCancel');
    assert.equal(await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.preferences.v1')),persisted);
    await click('MenuSettings'); await click('SettingsDefaults'); await click('ConfirmProceed');
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.preferences.v1'))).tutorialTips,true);
    assert.equal(latest.wallet,0); assert.equal(latest.level,0);
    await capture('defaults-restored');
    await click('DataAccount');
    await page.waitForURL(url=>url.hash==='#account/last-stand'||url.pathname.endsWith('/singedTerra/'));
    await page.getByRole('dialog',{name:'Player account'}).waitFor({state:'visible',timeout:15000});
    run.accountRoute={url:page.url(),dialogVisible:true};
    latest=null; layout=null; callout=null; await page.goto(new URL('last-stand/',base).href); await until(()=>latest?.saveState==='ready',60);
    await click('Deploy'); const exitRun=latest.runId;
    const reserved=await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1'));
    const checkpoint=JSON.parse(reserved).checkpoint;
    assert.ok(checkpoint && checkpoint.runId===exitRun,'Deploy reserved a durable checkpoint');
    await page.getByRole('link',{name:/return to campaigns/i}).click();
    await page.waitForURL(url=>!url.pathname.endsWith('/last-stand/'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1')),reserved,'Return preserves the last committed wave');
    const returnURL=page.url();latest=null;layout=null;callout=null;
    await page.goto(new URL('last-stand/',base).href);await until(()=>latest?.saveState==='ready',60);
    assert.equal(latest.phase,'garage','Reload never auto-starts combat');assert.equal(latest.hasCheckpoint,true);
    await click('Deploy');await until(()=>latest.phase==='battle' && latest.paused);
    assert.equal(latest.runId,exitRun);assert.equal(latest.tick,checkpoint.encounter.tick,'Explicit Resume restores the committed simulation tick');
    run.wrapperReturn={url:returnURL,preservedRun:exitRun,resumedPaused:true,checkpointTick:checkpoint.encounter.tick};
    assert.deepEqual(run.consoleErrors,[],'No browser/Unity console errors during the normal journey');
    // Browser-enforced denied capability; response bytes stay unchanged.
    await page.route(new URL('last-stand/',base).href,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,headers:{...response.headers(),'permissions-policy':'fullscreen=()'}});
    });
    latest=null; layout=null; callout=null; await page.goto(new URL('last-stand/',base).href); await until(()=>latest?.saveState==='ready',60);
    await click('Menu'); await click('MenuSettings'); await click('SettingsTab1');
    assert.equal(await page.evaluate(()=>document.fullscreenEnabled),false);
    assert.equal(items().find(c=>c.name==='DisplayFullscreen').interactable,false);
    run.fullscreenDenied={browserPolicy:'fullscreen=()',enabled:false,scope:'actual browser capability denial; promise refusal separately covered by actual jslib regression'};
    await capture('fullscreen-denied');
    await assertInputs(); if(parseError)throw parseError;
    assert.deepEqual(run.errors,[]); run.status='pass'; persist();
  } catch(error) {
    run.status='failed'; run.lastState=latest; run.lastLayout=layout; run.error=String(error.stack??error);
    if(page&&!page.isClosed()) {
      await page.screenshot({path:join(output,fitting+'-failure.png')}).catch(()=>{});
      if(!run.audio)try {
        const audio=await page.evaluate(()=>window.__stAudioCapture?.finish?.());
        if(audio) {
          for(const [i,c] of audio.captures.entries())writeFileSync(join(output,fitting+'-failed-audio-'+i+'.webm'),Buffer.from(c.audio,'base64'));
          run.failedAudio={supported:audio.supported,errors:audio.errors,captures:audio.captures.map(({audio,...summary})=>summary)};
        }
      } catch(captureError) { run.failedAudioError=String(captureError); }
    }
    persist(); throw error;
  } finally { await browser.close(); }
}
await assertInputs(); report.status='pass'; persist(); console.log('PLAYER_CONTROLS_EVIDENCE='+output);
} catch(error) { report.status='failed'; report.error=String(error.stack??error); persist(); throw error; }

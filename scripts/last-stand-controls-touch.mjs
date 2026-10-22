// Real Chromium touch input against the maintained Web export; no save fixtures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity,
  fetchBoundRuntime, assertServedBytes, readShopControlObservation, validateCompactCombatControls } from '../e2e/helpers/lastStandJourney.mjs';
import { tierJourneyControlGeometry } from '../e2e/helpers/lastStandTierJourney.mjs';

const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4173/singedTerra/');
const output=resolve('campaign-unity/Evidence/player-controls/touch-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const name of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
  execFileSync(process.execPath,[resolve('scripts/assets',name)],{stdio:'pipe'});
const runtime=packagedRuntimeSnapshot(),manifest=JSON.parse(readFileSync('client/public/last-stand/asset-manifest.json','utf8'));
const inputs=()=>Object.fromEntries(['scripts/last-stand-controls-touch.mjs','e2e/helpers/lastStandJourney.mjs',
  'e2e/helpers/lastStandTierJourney.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const served=async()=>{for(const [path,hash] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256}))
  assertServedBytes(await fetchBoundRuntime(base,path),hash);};
await served(); mkdirSync(output,{recursive:false});
const report={status:'running',scope:'headless Chromium touch events and geometry; no physical-device qualification',runtime,inputs:inputs(),actions:[],captures:[],errors:[]};
const persist=()=>writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2)); persist();
const browser=await chromium.launch({headless:true}); let page,latest,layout,parseError;
try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
  page=await context.newPage(); const cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',message=>{const text=message.text();if(message.type()==='error')report.errors.push(text);
    try {if(text.startsWith('ST_LS_STATE '))latest=JSON.parse(text.slice(12));
      if(text.startsWith('ST_LS_HUD_LAYOUT '))layout=readShopControlObservation(text);
    }catch(error){parseError??=error;report.rejectedTelemetry??=text;}});
  const until=async(check)=>{const end=Date.now()+60000;while(Date.now()<end){if(parseError)throw parseError;if(check())return;await page.waitForTimeout(75);}throw Error('Touch observation timed out: '+JSON.stringify(latest));};
  const raw=()=>JSON.parse(layout.raw.slice('ST_LS_HUD_LAYOUT '.length));
  const items=()=>layout?[...layout.controls,...layout.shopControls,...layout.settingsControls]:[];
  const point=async(c)=>{const box=await page.locator('#unity-canvas').boundingBox();return{x:box.x+(c.x+c.width/2)*box.width/layout.width,y:box.y+(c.y+c.height/2)*box.height/layout.height};};
  const swipe=async(down=false)=>{
    const viewport=raw().graphics.find(g=>g.active&&g.path.endsWith('/SettingsViewport')&&g.kind==='Image');
    assert.ok(viewport);const p=await point(viewport),box=await page.locator('#unity-canvas').boundingBox();
    const distance=Math.min(180,viewport.height*box.height/layout.height*.55),start=p.y+(down?-distance/2:distance/2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:start}]});
    for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:start+(down?1:-1)*distance*i/8}]});await page.waitForTimeout(50);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);report.actions.push({input:'swipe',down});
  };
  const tap=async(name)=>{
    await until(()=>items().some(c=>c.name===name&&c.active&&c.interactable));
    for(let i=0;i<12;i++){
      const c=items().find(c=>c.name===name),viewport=raw().graphics.find(g=>g.active&&g.path.endsWith('/SettingsViewport')&&g.kind==='Image');
      if(viewport&&c.mode==='Settings'&&!['ChoicePrevious','ChoiceNext'].includes(name)&&!/^Settings(?:Close|Tab[0-3])$/.test(name)&&(c.y<viewport.y||c.y+c.height>viewport.y+viewport.height)){
        await swipe(c.y<viewport.y);continue;
      }
      const p=await point(c);await page.touchscreen.tap(p.x,p.y);report.actions.push({input:'tap',name,...p});await page.waitForTimeout(250);return;
    }throw Error('Touch target unreachable: '+name);
  };
  const capture=async(label)=>{tierJourneyControlGeometry(layout,await page.locator('#unity-canvas').boundingBox());
    if(['battle','settling'].includes(latest.phase)&&latest.menu===''&&!layout.shopControls.some(c=>c.name==='ShopClose'&&c.active))
      validateCompactCombatControls(layout);
    await page.screenshot({path:join(output,label+'.png')});report.captures.push({label,state:{...latest},layout:raw()});persist();};
  const awaitCanvasSize=async()=>{const box=await page.locator('#unity-canvas').boundingBox();
    await until(()=>layout&&Math.abs(layout.width/layout.pixelRatio-box.width)<1&&Math.abs(layout.height/layout.pixelRatio-box.height)<1);};
  await page.goto(new URL('last-stand/',base).href);await until(()=>latest?.saveState==='ready');
  await awaitCanvasSize();
  const originalSave=await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1'));
  for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);await awaitCanvasSize();
    assert.equal(items().find(c=>c.name==='ToggleTier').active,false);
    await tap('TierNext');await until(()=>latest.garageTierId==='2');
    assert.equal(latest.garageTierUnlocked,false);assert.equal(latest.lockedTierPreview,true);
    assert.equal(latest.selectedTier,1);assert.equal(latest.environmentId,'iron-perimeter');assert.equal(latest.menu,'');
    assert.equal(items().find(c=>c.name==='TierNext').interactable,false);assert.equal(items().find(c=>c.name==='Deploy').interactable,false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.prototype.v1')),originalSave);
    await capture('tier-locked-preview-'+viewport.width);
    await tap('TierPrevious');await until(()=>latest.garageTierId==='1');assert.equal(latest.environmentId,'sunlit-ash');
    assert.equal(latest.lockedTierPreview,false);assert.equal(latest.menu,'');
    await tap('FittingNext');await until(()=>latest.fittingId==='launcher');
    assert.equal(items().find(c=>c.name==='FittingNext').interactable,false);
    assert.equal(latest.menu,'','Fitting touch arrow operates inline');
    await capture('fitting-launcher-'+viewport.width);
    await tap('FittingPrevious');await until(()=>latest.fittingId==='repair');
    assert.equal(items().find(c=>c.name==='FittingPrevious').interactable,false);assert.equal(latest.menu,'');
  }
  await page.setViewportSize({width:390,height:844});await awaitCanvasSize();
  await tap('Deploy');await tap('SpeedRate');assert.equal(latest.selectedSpeed,0);
  await tap('SpeedPlus');assert.equal(latest.selectedSpeed,.5);await tap('SpeedPlus');assert.equal(latest.selectedSpeed,1);
  assert.equal(items().find(c=>c.name==='SpeedPlus').interactable,false,'Touch cannot exceed the initial cap');
  await tap('SpeedMinus');await tap('SpeedMinus');assert.equal(latest.selectedSpeed,0);await capture('portrait-paused');
  await tap('Menu');await tap('MenuSettings');
  for(const tab of [0,1,2,3]){await tap('SettingsTab'+tab);await capture('portrait-tab-'+tab);}
  await tap('SettingsBack');await tap('MenuHelp');const offset=layout.settingsScrollOffset;await swipe();
  assert.ok(layout.settingsScrollOffset>offset,'Real touch drag scrolls Help');await capture('portrait-help-scrolled');
  await tap('SettingsBack');await tap('SettingsClose');assert.equal(latest.paused,true,'Touch close preserves manual pause');
  await page.setViewportSize({width:844,height:390});await awaitCanvasSize();await capture('landscape-paused');
  await tap('Menu');await tap('MenuSettings');await tap('SettingsTab0');await tap('MusicEnabled');
  assert.equal(latest.musicEnabled,false);await capture('landscape-audio');await tap('SettingsClose');assert.equal(latest.paused,true);
  await served();assertPackagedRuntimeParity(runtime,packagedRuntimeSnapshot());assert.deepEqual(inputs(),report.inputs);
  if(parseError)throw parseError;assert.deepEqual(report.errors,[]);report.status='pass';
}catch(error){report.status='failed';report.error=String(error.stack??error);report.lastState=latest;report.lastLayout=layout;
  if(page&&!page.isClosed())await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
}finally{persist();await browser.close();console.log('PLAYER_CONTROLS_TOUCH_EVIDENCE='+output);}

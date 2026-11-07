import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {tierJourneyControlGeometry} from '../../e2e/helpers/lastStandTierJourney.mjs';
import {createJourneyActions} from '../../e2e/helpers/lastStandJourney.mjs';
import {WAVE_JOURNEY_PROBE} from '../../e2e/helpers/lastStandWaveJourney.mjs';

import {revealObservedLastStandControl} from '../../e2e/helpers/lastStandControlReveal.mjs';

function driverFixture({offset=0,targetY=587,fault,keyboardReveal=true,keyboardClipAtSubmit=false}={}){
  const canvas={x:0,y:104,width:1280,height:616},clip={x:302,y:72,width:676,height:524};
  const inputs=[],trace=[],layouts=[],states=[{load:1,timeOrigin:100,scope:'healthy',phase:'battle'}];
  let t=10,scroll=offset,focused=true,origin=100,viewport={width:1280,height:720};
  const publish=()=>{
    const item={name:'MenuAbandon',x:310,y:targetY-scroll,width:660,height:44,active:fault!=='missing',interactable:fault!=='disabled'};
    const path='SettingsModal/SettingsPanel/SettingsViewport';
    const graphics=[{path,kind:'LastStandConsoleSurface',active:true,hasClip:true,clip},
      {...item,path:path+'/SettingsContent/MenuAbandon',kind:'LastStandConsoleSurface',hasClip:true,clip}];
    layouts.push({load:1,timeOrigin:100,scope:'healthy',phase:'battle',t:t++,coordinates:'top-left',width:1280,height:616,
      controls:[],shopControls:[],settingsControls:[item],graphics,graphicsTruncated:false,
      raw:'ST_LS_HUD_LAYOUT '+JSON.stringify({graphics}),settingsScrollOffset:scroll,settingsMaximumScrollOffset:155,
      scrollOffset:0,maximumScrollOffset:0,selection:'MenuAbandon'});
    return layouts.at(-1);
  };
  publish();
  const acknowledge=()=>states.push({...states[0],action:'abandon-request',t:t++});
  const page={
    viewportSize:()=>viewport,
    locator:()=>({evaluate:async fn=>String(fn).includes('getBoundingClientRect')?
      {canvas,pixels:{width:1280,height:616}}:true}),
    evaluate:async expression=>{
      if(typeof expression!=='function')return;
      if(keyboardClipAtSubmit&&inputs.some(i=>i.kind==='key')){scroll=0;publish();}
      return {focused,timeOrigin:origin,t:t++,canvas:{...canvas,pixelWidth:1280,pixelHeight:616}};
    },
    waitForTimeout:async()=>{},
    mouse:{move:async(x,y)=>inputs.push({kind:'move',x,y}),wheel:async(_x,delta)=>{
      inputs.push({kind:'wheel',delta});
      if(fault==='focus')focused=false;
      if(fault==='origin')origin++;
      if(fault==='viewport')viewport={width:1281,height:720};
      if(fault==='blur')trace.push({globalTarget:true,kind:'blur'});
      if(fault==='element-blur')trace.push({globalTarget:false,kind:'blur'});
      if(!['stuck','wrong-pane'].includes(fault))scroll=Math.max(0,Math.min(155,scroll+delta));
      const row=publish();
      if(fault==='wrong-pane')row.scrollOffset=30;
      if(fault==='load')row.load++;
      if(fault==='stale')row.t=0;
      if(fault==='scope')row.scope='different';
      if(fault==='phase')row.phase='workshop';
      if(fault==='clip'){
        row.graphics=row.graphics.map(g=>({...g,clip:{...clip,y:clip.y+1,height:clip.height-1}}));
        row.raw='ST_LS_HUD_LAYOUT '+JSON.stringify({graphics:row.graphics});
      }
    },down:async()=>{inputs.push({kind:'down'});assert.equal(tierJourneyControlGeometry(layouts.at(-1),canvas)[0].full,true);},
      up:async()=>{inputs.push({kind:'up'});acknowledge();}},
    keyboard:{press:async key=>{
      inputs.push({kind:'key',key});trace.push({kind:'keydown',code:key,target:'unity-canvas',focused:true,hidden:false,
        load:1,timeOrigin:100,scope:'healthy',t:t++});
      if(keyboardReveal)scroll=155;publish();
    },down:async key=>inputs.push({kind:'key-down',key}),up:async key=>{inputs.push({kind:'key-up',key});acknowledge();}},
  };
  const until=async(rows,start,predicate)=>{
    const found=rows.slice(start).find(predicate);assert.ok(found,'Fresh action observation missing');return found;
  };
  const driver=createJourneyActions({page,trace,states,layouts,load:1,
    report:{actions:[],keyboard_actions:[],screenshots:[]},until,
    check:(ok,message)=>assert.ok(ok,message),focused:async()=>assert.ok(focused),
    keyboardFocus:async()=>{},screenshot:async()=>{},encounters:[]});
  return {driver,inputs,layouts,canvas,page,trace,states};
}

test('actual pointer driver reveals a clipped menu action before strict pointer arming',async()=>{
  const f=driverFixture();
  const click=await f.driver.armGameClick('MenuAbandon','abandon-request');
  assert.equal(f.inputs.filter(i=>i.kind==='wheel').length,1,'Ordinary wheel must reveal the actual viewport');
  assert.equal(f.inputs.some(i=>i.kind==='down'),false,'Arming must not activate the control');
  assert.equal(f.layouts.at(-1).settingsScrollOffset,155);
  await click();assert.deepEqual(f.inputs.filter(i=>['down','up'].includes(i.kind)).map(i=>i.kind),['down','up']);
});

test('actual keyboard driver allows Tab to reveal its target before final visibility admission',async()=>{
  const f=driverFixture();await f.driver.gameKey('MenuAbandon','abandon-request');
  assert.deepEqual(f.inputs.map(i=>i.kind),['key','key-down','key-up']);
  assert.equal(f.layouts.at(-1).settingsScrollOffset,155);
});

test('actual pointer reveal scrolls upward and leaves already visible targets alone',async()=>{
  const above=driverFixture({offset:155,targetY:171});
  await (await above.driver.armGameClick('MenuAbandon','abandon-request'))();
  assert.ok(above.inputs.find(i=>i.kind==='wheel').delta<0);
  assert.equal(above.layouts.at(-1).settingsScrollOffset,0);
  const visible=driverFixture({offset:155});
  await (await visible.driver.armGameClick('MenuAbandon','abandon-request'))();
  assert.equal(visible.inputs.some(i=>i.kind==='wheel'),false);
});

for(const [fault,expected]of Object.entries({
  stuck:/did not move the actual target scroll owner/, 'wrong-pane':/did not move the actual target scroll owner/,
  focus:/visibly focused document/,origin:/visibly focused document/,viewport:/changed viewport/,blur:/focus or visibility loss/,
  load:/same-document layout/,stale:/same-document layout/,scope:/same-document layout/,phase:/same-document layout/,
  clip:/changed target viewport/,disabled:/currently enabled target/,missing:/currently enabled target/,
}))test(`actual pointer reveal rejects ${fault} before pointer arming`,async()=>{
  const f=driverFixture({fault});await assert.rejects(f.driver.armGameClick('MenuAbandon','abandon-request'),expected);
  assert.equal(f.inputs.some(i=>i.kind==='down'),false);
});

test('actual reveal preserves unreachable geometry refusal and keyboard final full-target admission',async()=>{
  const unreachable=driverFixture({targetY:800});
  await assert.rejects(unreachable.driver.armGameClick('MenuAbandon','abandon-request'),/reachable in the real scroll range/);
  assert.equal(unreachable.inputs.length,0);
  const keyboard=driverFixture({keyboardReveal:false});
  await assert.rejects(keyboard.driver.gameKey('MenuAbandon','abandon-request'),/completely visible inside its actual viewport/);
  assert.equal(keyboard.inputs.some(i=>i.kind==='key-down'),false,'Do not submit Enter into a clipped control');
  const changed=driverFixture({keyboardClipAtSubmit:true});
  await assert.rejects(changed.driver.gameKey('MenuAbandon','abandon-request'),/Keyboard submit requires the complete target/);
  assert.equal(changed.inputs.some(i=>i.kind==='key-down'),false,'Recheck current target after the final document read');
});

test('maintained wave journey uses the same ordinary reveal owner',async()=>{
  const run=(page,report,load,geometry)=>revealObservedLastStandControl({name:'MenuAbandon',page,geometry,
    trace:report.inputsObserved,readLoad:()=>load});
  for(const fault of [undefined,'element-blur','blur']){
    const f=driverFixture({fault});
    const geometry=async()=>({layout:f.layouts.at(-1),canvas:f.canvas,projected:tierJourneyControlGeometry(f.layouts.at(-1),f.canvas)});
    const pending=run(f.page,{inputsObserved:f.trace},1,geometry);
    if(fault==='blur')await assert.rejects(pending,/focus or visibility loss/);
    else {const observed=await pending;assert.equal(observed.layout.settingsScrollOffset,155);}
    assert.equal(f.inputs.filter(i=>i.kind==='wheel').length,1);
  }
});

test('actual wave input observer distinguishes document loss from harmless element blur',()=>{
  const listeners=new Map(),events=[],window={addEventListener:(kind,callback)=>listeners.set(kind,callback)};
  const document={hasFocus:()=>true,hidden:false};
  runInNewContext(WAVE_JOURNEY_PROBE,{window,document,performance:{now:()=>1,timeOrigin:100},
    console:{log:raw=>{if(raw.startsWith('ST_WAVE_INPUT '))events.push(JSON.parse(raw.slice(14)));}}});
  for(const target of [{id:'unity-canvas'},window,document])listeners.get('blur')({type:'blur',target,isTrusted:true});
  assert.deepEqual(events.map(e=>e.globalTarget),[false,true,true]);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { tierJourneyControlGeometry } from '../../e2e/helpers/lastStandTierJourney.mjs';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');

function ownedStartupFixture({ready=false,missing=false}={}) {
  const begin=source.indexOf('export async function ownedChrome(');
  const end=source.indexOf('\nfunction frameTiming',begin);
  assert.ok(begin>0 && end>begin,'Exercise the maintained owned browser launcher');
  const page={identity:'original startup tab'},pages=ready?[page]:[],receipts=[],calls=[];
  const unavailable=new Error('Original startup page did not arrive');
  let deliver;
  const context={pages:()=>pages,waitForEvent:async(event,options)=>{
    assert.equal(event,'page');assert.ok(options.timeout>0 && options.timeout<=20000);
    calls.push('wait-page');
    if(missing)throw unavailable;
    return new Promise(resolve=>{deliver=resolve;});
  },newPage:()=>assert.fail('Do not replace the original native startup tab')};
  const browser={contexts:()=>[context],close:async()=>calls.push('close-connection'),
    newBrowserCDPSession:async()=>({send:async method=>{assert.equal(method,'Browser.close');calls.push('close-browser');}})};
  const launch=runInNewContext(source.slice(begin,end).replace('export async function','async function')+';ownedChrome',{
    process:{platform:'linux'},join,assert,existsSync:()=>true,mkdtempSync:()=>'/owned/profile',tmpdir:()=>'/tmp',
    nativeChromeArgs:()=>['about:blank'],spawn:()=>({pid:12345,exitCode:null,stdout:{on(){}},stderr:{on(){}},on(){}}),
    writeFileSync:(path,contents)=>{if(path.endsWith('browser-profile.json'))receipts.push(JSON.parse(contents));},
    readFileSync:()=> '12345\n/owned-endpoint',delay:async()=>{},ownedBrowsers:new Set(),ownedBrowserWindows:new WeakMap(),
    startOwnedSupervisor:()=>({root:{pid:12345},stop:async()=>{calls.push('stop-owned-tree');return {status:'stopped'};}}),
  });
  return {page,context,calls,receipts,unavailable,
    launch:()=>launch({executablePath:()=>'/owned/chrome',connectOverCDP:async()=>browser},'/owned/evidence'),
    deliver:()=>{pages.push(page);deliver?.(page);}};
}

test('owned browser waits for its delayed original tab before callers inspect pages',async()=>{
  const fixture=ownedStartupFixture();let settled=false;
  const launching=fixture.launch().then(native=>{settled=true;return native;});
  await new Promise(resolve=>setImmediate(resolve));
  try {
    assert.equal(settled,false,'CDP can connect before the original tab becomes available');
    fixture.deliver();
    const native=await launching;
    assert.equal(native.context.pages()[0],fixture.page,'Return the original native tab without synthesizing another');
    assert.deepEqual(fixture.calls,['wait-page']);
    await native.close();
  } finally {fixture.deliver();await (await launching).close();}
});

test('owned browser preserves an existing tab and cleans up when no original tab arrives',async()=>{
  const ready=ownedStartupFixture({ready:true});
  const native=await ready.launch();
  assert.equal(native.context.pages()[0],ready.page);assert.deepEqual(ready.calls,[]);
  await native.close();
  const missing=ownedStartupFixture({missing:true});
  await assert.rejects(missing.launch(),error=>error===missing.unavailable);
  assert.deepEqual(missing.calls,['wait-page','close-browser','stop-owned-tree','close-connection']);
  assert.equal(missing.receipts.at(-1).status,'removed');
});
const controlContextBegin=source.indexOf('    const hudControls=');
const controlContextEnd=source.indexOf('    const geometry=',controlContextBegin);
assert.ok(controlContextBegin>0 && controlContextEnd>controlContextBegin,'Actual maintained control geometry helpers are required');
const controlContext=source.slice(controlContextBegin,controlContextEnd);
const begin=source.indexOf('    const focused=async label=>{');
const end=source.indexOf('    const screenshot=',begin);
assert.ok(begin>0 && end>begin,'Actual maintained focus caller is required');
const run=new Function('process','page','native','report','ensureOwnedNativeForeground','check',
  source.slice(begin,end)+'return focused("inert caller-order fixture");');

async function returnKeyboardFixture({host='linux',initial='return',entryFails=false,outline='solid',measure=false,trap=false,loseFocus=false,
  initiallyUnfocused=false,restoreFocus=true}={}){
  const begin=source.indexOf('    const keyboardFocus=async locator=>{',source.indexOf('export async function runLastStandJourney('));
  const end=source.indexOf('    const dismissSplash=',begin);
  assert.ok(begin>0 && end>begin);
  const target={id:'last-stand-return'},canvas={id:'unity-canvas'},keys=[];
  let lost=initiallyUnfocused,focusCalls=0;
  const document={activeElement:initial==='return'?target:canvas,hidden:false,hasFocus:()=>!lost,
    getElementById:id=>id==='unity-canvas'?canvas:null};let index=0,reads=0;
  const read=(fn,element)=>{reads++;return fn(element);};
  // Inert reduction of the maintained wrapper: either direction into the canvas
  // invokes enter-first; previous from its first control exits to native Return.
  const context={document,window:{},process:{platform:host},focused:async()=>{focusCalls++;if(restoreFocus)lost=false;},check:(ok,name)=>assert.ok(ok,name),
    getComputedStyle:()=>({outlineStyle:outline,outlineWidth:'2px'}),
    page:{evaluate:async()=>{reads++;},locator:()=>({count:async()=>{reads++;return 1;},evaluate:async fn=>read(fn,canvas)}),
      keyboard:{press:async key=>{keys.push(key);
        if(document.activeElement===target){if(!entryFails){document.activeElement=canvas;index=0;}}
        else if(!trap && (key==='Shift+Tab' && index===0 || key==='Tab' && ++index===20))document.activeElement=target;
        lost=loseFocus;
      }}},
  };
  const locator={evaluate:async fn=>read(fn,target)};
  const {runInNewContext}=await import('node:vm');
  await runInNewContext('(async()=>{'+source.slice(begin,end)+'await keyboardFocus(locator);})()', {...context,locator});
  return measure?{keys,reads,focusCalls}:keys;
}

test('Linux Return inspection batches current DOM proof without redundant renderer roundtrips',async()=>{
  for(const initial of ['return','canvas']){
    const result=await returnKeyboardFixture({initial,measure:true});
    assert.ok(result.reads<=3,`Current focus, native entry and final outline need at most three reads, observed ${result.reads}`);
  }
});

test('batched Return inspection activates missing focus and rechecks the actual document',async()=>{
  const restored=await returnKeyboardFixture({initiallyUnfocused:true,measure:true});
  assert.equal(restored.focusCalls,1);
  assert.deepEqual(restored.keys,['Tab','Shift+Tab']);
  await assert.rejects(returnKeyboardFixture({initiallyUnfocused:true,restoreFocus:false}),/document focus and visibility/);
});

test('Linux repeated Return inspection enters first then escapes instead of traversing the whole HUD',async()=>{
  assert.deepEqual(await returnKeyboardFixture(),['Tab','Shift+Tab']);
  assert.deepEqual(await returnKeyboardFixture({initial:'canvas'}),['Shift+Tab']);
});

test('Return preparation preserves Windows navigation and rejects failed native entry or invisible focus',async()=>{
  const keys=await returnKeyboardFixture({host:'win32'});
  assert.equal(keys[0],'Shift+Tab');assert.equal(keys.length,21);
  await assert.rejects(returnKeyboardFixture({entryFails:true}),/native Tab enters/);
  await assert.rejects(returnKeyboardFixture({outline:'none'}),/visible keyboard focus/);
  await assert.rejects(returnKeyboardFixture({trap:true}),/outer control reachable/);
  await assert.rejects(returnKeyboardFixture({loseFocus:true}),/outer control reachable/);
});

test('Linux already-visible focus needs one current DOM read without redundant activation',async()=>{
  const calls=[];
  await run({platform:'linux'},{
    bringToFront:async()=>calls.push('activate'),waitForFunction:async()=>calls.push('wait'),
    evaluate:async expression=>{assert.equal(expression,'!document.hidden && document.hasFocus()');calls.push('read');return true;},
  },{},{},async()=>assert.fail('No Windows native qualification on Linux'),ok=>assert.ok(ok));
  assert.deepEqual(calls,['read'],'An already focused Linux document needs no repeated renderer activation/wait roundtrips');
});

test('Linux missing focus still requires actual activation, a bounded wait and fresh confirmation',async()=>{
  for(const returned of [true,false]){
    const calls=[];let reads=0;
    const action=run({platform:'linux'},{
      bringToFront:async()=>calls.push('activate'),waitForFunction:async(_expr,_arg,options)=>{
        calls.push('wait');assert.equal(options.timeout,10000);},
      evaluate:async()=>{calls.push('read');return ++reads===1?false:returned;},
    },{},{},async()=>assert.fail('No Windows native qualification on Linux'),ok=>assert.ok(ok));
    if(returned)await action;else await assert.rejects(action);
    assert.deepEqual(calls,['read','activate','wait','read']);
  }
});

test('owned native foreground is established before waiting for document focus',async()=>{
  const calls=[];let established=false;
  await run({platform:'win32'}, {
    bringToFront:async()=>calls.push('cdp'),
    waitForFunction:async()=>{assert.ok(established,'DOM focus cannot precede owned native establishment');calls.push('dom');},
    evaluate:async()=>established,
  },{}, {},async()=>{established=true;calls.push('native');},condition=>assert.ok(condition));
  assert.deepEqual(calls,['cdp','native','dom']);
});

test('Windows already-focused DOM still requires owned native foreground proof',async()=>{
  const calls=[];let established=false;
  await run({platform:'win32'},{
    bringToFront:async()=>calls.push('activate'),
    waitForFunction:async()=>{assert.ok(established);calls.push('wait');},
    evaluate:async()=>{assert.ok(established,'A true DOM result cannot bypass native establishment');calls.push('read');return true;},
  },{},{},async()=>{established=true;calls.push('native');},ok=>assert.ok(ok));
  assert.deepEqual(calls,['activate','native','wait','read']);
});

test('native foreground refusal propagates before a DOM wait can proceed',async()=>{
  const failure=new Error('explicit inert native establishment refusal');let waits=0;
  await assert.rejects(run({platform:'win32'}, {
    bringToFront:async()=>{},waitForFunction:async()=>{waits++;},evaluate:async()=>false,
  },{}, {},async()=>{throw failure;},condition=>assert.ok(condition)),error=>error===failure);
  assert.equal(waits,0,'A refused native prerequisite must not reach document waits');
});

test('settling pointer prerequisites complete before the brief wave phase begins',async()=>{
  const begin=source.indexOf("    if(player){\n      const prepared=await armGameClick('SpeedRate'"),end=source.indexOf('    const naturalResult=',begin);
  assert.ok(begin>0&&end>begin,'Execute the maintained natural-terminal pointer preparation');
  let clock=0,armedAt=null,paused=false;const calls=[],states=[];
  const prepare=async()=>{clock+=900;armedAt=clock;calls.push('prepare');return async()=>{
    assert.ok(clock<500,'Slow foreground preparation missed the actual settling phase');paused=true;calls.push('input');return {paused};
  };};
  const run=new Function('player','armGameClick','until','states','terminalStart','load','expectedTerminal','terminalBefore','phaseMatrix','gameClick',
    'return(async()=>{let terminalPaused,terminalResumed;'+source.slice(begin,end)+'return {terminalPaused,terminalResumed};})();');
  const result=await run(true,prepare,async()=>{clock=0;states.push({phase:'settling',load:7});calls.push('settling');},states,0,7,
    {tick:5000},{tick:1000},async()=>{assert.ok(paused,'Actual matrix requires acknowledged Pause');calls.push('matrix');},
    async()=>{assert.ok(paused);paused=false;calls.push('resume');return {paused};});
  assert.equal(armedAt,900);assert.equal(result.terminalPaused.paused,true);assert.equal(result.terminalResumed.paused,false);
  assert.deepEqual(calls,['prepare','settling','input','matrix','resume']);
});

test('prepared pointer follows the actual new control rectangle after the Shop entry disappears',async()=>{
  const begin=source.indexOf('    const armGameClick='),end=source.indexOf('    const gameClick=',begin);
  const before={phase:'battle',load:1,timeOrigin:100,t:1,width:100,height:100,controls:[{name:'Pause',x:0,y:0,width:44,height:44,active:true,interactable:true}],shopControls:[],settingsControls:[],graphics:[]};
  const layouts=[before],states=[{phase:'battle',load:1,timeOrigin:100}];let point,pressed;
  const page={evaluate:async expression=>typeof expression==='function'?{focused:true,timeOrigin:100,
    canvas:{x:0,y:0,width:100,height:100,pixelWidth:100,pixelHeight:100}}:undefined,
    mouse:{move:async(x,y)=>point={x,y},down:async()=>pressed=point,up:async()=>{}},
    waitForTimeout:async()=>{},viewportSize:()=>({width:100,height:100})};
  const run=new Function('geometry','focused','page','trace','states','report','until','check','layouts','assert','tierJourneyControlGeometry',
    'let load=1;'+controlContext+source.slice(begin,end)+'return armGameClick("Pause","session");');
  const click=await run(async()=>({canvas:{x:0,y:0,width:100,height:100},layout:before,item:before.controls[0]}),
    async()=>{},page,[],states,{actions:[]},async()=>({load:1,phase:'settling',paused:true}),(ok,message)=>assert.ok(ok,message),layouts,assert,tierJourneyControlGeometry);
  layouts.push({...before,t:2,phase:'settling',controls:[{...before.controls[0],x:50}]});
  states.push({...states[0],phase:'settling'});
  await click();assert.deepEqual(pressed,{x:72,y:22},'Actual pointer must use the latest observed enabled target, not the old battle center');
});

test('HUD-only pointer actions require a fresh same-document layout acknowledgement',async()=>{
  const begin=source.indexOf('    const armGameClick='),end=source.indexOf('    const gameClick=',begin);
  for(const fault of [undefined,'absent','load','origin','time','predicate']){
    const before={phase:'workshop',load:1,timeOrigin:100,t:10,width:100,height:100,opened:true,
      controls:[],shopControls:[{name:'ShopEntry',x:0,y:0,width:44,height:44,active:true,interactable:true}],settingsControls:[],graphics:[]};
    const layouts=[before],states=[{phase:'workshop',load:1,timeOrigin:100}];let inputs=0;
    const after={...before,t:11};
    if(fault==='load')after.load=2;if(fault==='origin')after.timeOrigin=101;
    if(fault==='time')after.t=9;if(fault==='predicate')after.opened=false;
    const page={evaluate:async expression=>typeof expression==='function'?{focused:true,timeOrigin:100,
      canvas:{x:0,y:0,width:100,height:100,pixelWidth:100,pixelHeight:100}}:undefined,
      mouse:{move:async()=>{},down:async()=>{inputs++;},up:async()=>{if(fault!=='absent')layouts.push(after);}},
      waitForTimeout:async()=>{},viewportSize:()=>({width:100,height:100})};
    const run=new Function('geometry','focused','page','trace','states','report','until','check','layouts','assert','tierJourneyControlGeometry',
      'let load=1;'+controlContext+source.slice(begin,end)+'return armGameClick("ShopEntry","hud-layout",item=>item.opened);');
    const click=await run(async()=>({canvas:{x:0,y:0,width:100,height:100},layout:before,item:before.shopControls[0]}),
      async()=>{},page,[],states,{actions:[]},async(rows,start,predicate)=>{
        assert.equal(rows,layouts,'HUD changes must await actual layouts, without invented gameplay states');
        const actual=rows.slice(start).find(predicate);assert.ok(actual,'Fresh action observation missing');return actual;
      },(ok,message)=>assert.ok(ok,message),layouts,assert,tierJourneyControlGeometry);
    if(fault)await assert.rejects(click(),/Fresh action observation missing/);else assert.equal(await click(),after);
    assert.equal(inputs,1);assert.equal(states.length,1,'A shop opening does not invent a state event');
  }
});

for(const loss of ['blur','hidden','reload','resize','used','document','origin','canvas','layout-origin','layout-dimensions',
  'layout-load','stale-layout','phase','missing','disabled','out-of-bounds'])test(`prepared pointer refuses ${loss} before sending input`,async()=>{
  const begin=source.indexOf('    const armGameClick=');const end=source.indexOf('    const gameClick=',begin);
  assert.ok(begin>0 && end>begin);
  const trace=[],states=[{load:1,timeOrigin:100,phase:'battle'}];let inputs=0,width=100;
  const layout={load:1,timeOrigin:100,t:1,phase:'battle',width:100,height:100,
    controls:[{name:'Pause',x:0,y:0,width:44,height:44,active:true,interactable:true}],shopControls:[],settingsControls:[],graphics:[]};
  const layouts=[layout];
  const page={evaluate:async expression=>typeof expression==='function'?{focused:loss!=='document',timeOrigin:loss==='origin'?101:100,
    canvas:{x:0,y:0,width:loss==='canvas'?200:100,height:100,pixelWidth:100,pixelHeight:100}}:undefined,
    mouse:{move:async()=>{},down:async()=>{inputs++;},up:async()=>{}},waitForTimeout:async()=>{},viewportSize:()=>({width,height:100})};
  const compile=new Function('geometry','focused','page','trace','states','report','until','check','layouts','assert','tierJourneyControlGeometry',
    'let load=1;'+controlContext+source.slice(begin,end)+'return {armGameClick,reload:()=>load++};');
  const fixture=compile(async()=>({canvas:{x:0,y:0,width:100,height:100},layout,item:layout.controls[0]}),
    async()=>{},page,trace,states,{actions:[]},async()=>({phase:'settling',paused:true}),(ok,message)=>assert.ok(ok,message),layouts,assert,tierJourneyControlGeometry);
  const click=await fixture.armGameClick('Pause','session');
  if(loss==='blur')trace.push({globalTarget:true,kind:'blur'});
  if(loss==='hidden')trace.push({globalTarget:true,kind:'visibilitychange',hidden:true});
  if(loss==='reload')fixture.reload();
  if(loss==='resize')width=200;
  if(loss==='layout-origin')layouts.push({...layout,timeOrigin:101});
  if(loss==='layout-dimensions')layouts.push({...layout,width:101});
  if(loss==='layout-load')layouts.push({...layout,load:2});
  if(loss==='stale-layout')layouts.push({...layout,t:0});
  if(loss==='phase')layouts.push({...layout,phase:'settling'});
  if(loss==='missing')layouts.push({...layout,controls:[]});
  if(loss==='disabled')layouts.push({...layout,controls:[{...layout.controls[0],interactable:false}]});
  if(loss==='out-of-bounds')layouts.push({...layout,controls:[{...layout.controls[0],x:100}]});
  if(loss==='used'){await click();inputs=0;}
  await assert.rejects(click(),/prepared pointer/);assert.equal(inputs,0);
});

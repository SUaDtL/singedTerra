import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url),'utf8');
const begin=source.indexOf('    const focused=async label=>{');
const end=source.indexOf('    const screenshot=',begin);
assert.ok(begin>0 && end>begin,'Actual maintained focus caller is required');
const run=new Function('process','page','native','report','ensureOwnedNativeForeground','check',
  source.slice(begin,end)+'return focused("inert caller-order fixture");');

test('owned native foreground is established before waiting for document focus',async()=>{
  const calls=[];let established=false;
  await run({platform:'win32'}, {
    bringToFront:async()=>calls.push('cdp'),
    waitForFunction:async()=>{assert.ok(established,'DOM focus cannot precede owned native establishment');calls.push('dom');},
    evaluate:async()=>established,
  },{}, {},async()=>{established=true;calls.push('native');},condition=>assert.ok(condition));
  assert.deepEqual(calls,['cdp','native','dom']);
});

test('native foreground refusal propagates before a DOM wait can proceed',async()=>{
  const failure=new Error('explicit inert native establishment refusal');let waits=0;
  await assert.rejects(run({platform:'win32'}, {
    bringToFront:async()=>{},waitForFunction:async()=>{waits++;},evaluate:async()=>false,
  },{}, {},async()=>{throw failure;},condition=>assert.ok(condition)),error=>error===failure);
  assert.equal(waits,0,'A refused native prerequisite must not reach document waits');
});

test('settling pointer prerequisites complete before the brief phase begins',async()=>{
  const begin=source.indexOf('    await until(states,defeatStart,');
  const armed=source.lastIndexOf('    const settlingClick=',begin);
  const end=source.indexOf("    check(!layouts.at(-1).controls",begin);
  const caller=source.slice(armed>source.indexOf('const hiddenStart=')?armed:begin,end);
  let clock=0,armedAt=null,paused=false;const calls=[];
  const states=[{phase:'battle',load:7,run:3}];
  const click=async()=>{assert.ok(clock<500,'Slow foreground preparation missed the actual settling phase');paused=true;calls.push('input');};
  const prepare=async()=>{clock+=900;armedAt=clock;calls.push('prepare');return click;};
  const run=new Function('until','states','defeatStart','mark','gameClick','armGameClick','focused','phaseMatrix','check','return (async()=>{'+caller+'})();');
  await run(async()=>{clock=0;states.push({phase:'settling',load:7,run:3});calls.push('settling');},states,0,async()=>clock,
    async()=>{await prepare();return click();},prepare,async()=>{assert.ok(paused,'Native verification follows the real paused acknowledgement');calls.push('native-after');},
    async()=>{assert.ok(paused);calls.push('matrix');},(ok,message)=>assert.ok(ok,message));
  assert.equal(armedAt,900);
  assert.deepEqual(calls,['prepare','settling','input','native-after','matrix']);
});

test('prepared pointer follows the actual new control rectangle after the Shop entry disappears',async()=>{
  const begin=source.indexOf('    const armGameClick='),end=source.indexOf('    const gameClick=',begin);
  const before={phase:'battle',load:1,timeOrigin:100,t:1,width:10,height:10,controls:[{name:'Pause',x:0,y:0,width:2,height:2,active:true,interactable:true}]};
  const layouts=[before],states=[{phase:'battle',load:1,timeOrigin:100}];let point,pressed;
  const page={evaluate:async expression=>typeof expression==='function'?{focused:true,timeOrigin:100,
    canvas:{x:0,y:0,width:10,height:10,pixelWidth:10,pixelHeight:10}}:undefined,
    mouse:{move:async(x,y)=>point={x,y},down:async()=>pressed=point,up:async()=>{}},
    waitForTimeout:async()=>{},viewportSize:()=>({width:10,height:10})};
  const run=new Function('geometry','focused','page','trace','states','report','until','check','layouts','assert',
    'let load=1;'+source.slice(begin,end)+'return armGameClick("Pause","session");');
  const click=await run(async()=>({canvas:{x:0,y:0,width:10,height:10},layout:before,item:before.controls[0]}),
    async()=>{},page,[],states,{actions:[]},async()=>({load:1,phase:'settling',paused:true}),(ok,message)=>assert.ok(ok,message),layouts,assert);
  layouts.push({...before,t:2,phase:'settling',controls:[{...before.controls[0],x:6}]});
  states.push({...states[0],phase:'settling'});
  await click();assert.deepEqual(pressed,{x:7,y:1},'Actual pointer must use the latest observed enabled target, not the old battle center');
});

for(const loss of ['blur','hidden','reload','resize','used','document','origin','canvas','layout-origin','layout-dimensions',
  'layout-load','stale-layout','phase','missing','disabled','out-of-bounds'])test(`prepared pointer refuses ${loss} before sending input`,async()=>{
  const begin=source.indexOf('    const armGameClick=');const end=source.indexOf('    const gameClick=',begin);
  assert.ok(begin>0 && end>begin);
  const trace=[],states=[{load:1,timeOrigin:100,phase:'battle'}];let inputs=0,width=10;
  const layout={load:1,timeOrigin:100,t:1,phase:'battle',width:10,height:10,
    controls:[{name:'Pause',x:0,y:0,width:2,height:2,active:true,interactable:true}]};
  const layouts=[layout];
  const page={evaluate:async expression=>typeof expression==='function'?{focused:loss!=='document',timeOrigin:loss==='origin'?101:100,
    canvas:{x:0,y:0,width:loss==='canvas'?20:10,height:10,pixelWidth:10,pixelHeight:10}}:undefined,
    mouse:{move:async()=>{},down:async()=>{inputs++;},up:async()=>{}},waitForTimeout:async()=>{},viewportSize:()=>({width,height:10})};
  const compile=new Function('geometry','focused','page','trace','states','report','until','check','layouts','assert',
    'let load=1;'+source.slice(begin,end)+'return {armGameClick,reload:()=>load++};');
  const fixture=compile(async()=>({canvas:{x:0,y:0,width:10,height:10},layout,item:layout.controls[0]}),
    async()=>{},page,trace,states,{actions:[]},async()=>({phase:'settling',paused:true}),(ok,message)=>assert.ok(ok,message),layouts,assert);
  const click=await fixture.armGameClick('Pause','session');
  if(loss==='blur')trace.push({globalTarget:true,kind:'blur'});
  if(loss==='hidden')trace.push({globalTarget:true,kind:'visibilitychange',hidden:true});
  if(loss==='reload')fixture.reload();
  if(loss==='resize')width=20;
  if(loss==='layout-origin')layouts.push({...layout,timeOrigin:101});
  if(loss==='layout-dimensions')layouts.push({...layout,width:11});
  if(loss==='layout-load')layouts.push({...layout,load:2});
  if(loss==='stale-layout')layouts.push({...layout,t:0});
  if(loss==='phase')layouts.push({...layout,phase:'settling'});
  if(loss==='missing')layouts.push({...layout,controls:[]});
  if(loss==='disabled')layouts.push({...layout,controls:[{...layout.controls[0],interactable:false}]});
  if(loss==='out-of-bounds')layouts.push({...layout,controls:[{...layout.controls[0],x:100}]});
  if(loss==='used'){await click();inputs=0;}
  await assert.rejects(click(),/prepared pointer/);assert.equal(inputs,0);
});

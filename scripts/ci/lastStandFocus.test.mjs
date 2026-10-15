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

for(const loss of ['blur','hidden','reload','resize','used','document'])test(`prepared pointer refuses ${loss} before sending input`,async()=>{
  const begin=source.indexOf('    const armGameClick=');const end=source.indexOf('    const gameClick=',begin);
  assert.ok(begin>0 && end>begin);
  const trace=[],states=[];let inputs=0,width=10;
  const page={evaluate:async expression=>expression.includes('document.hasFocus')?loss!=='document':undefined,
    mouse:{move:async()=>{},down:async()=>{inputs++;},up:async()=>{}},waitForTimeout:async()=>{},viewportSize:()=>({width,height:10})};
  const compile=new Function('geometry','focused','page','trace','states','report','until','check',
    'let load=1;'+source.slice(begin,end)+'return {armGameClick,reload:()=>load++};');
  const fixture=compile(async()=>({canvas:{x:0,y:0,width:10,height:10},layout:{width:10,height:10},item:{x:0,y:0,width:2,height:2}}),
    async()=>{},page,trace,states,{actions:[]},async()=>({phase:'settling',paused:true}),(ok,message)=>assert.ok(ok,message));
  const click=await fixture.armGameClick('Pause','session');
  if(loss==='blur')trace.push({globalTarget:true,kind:'blur'});
  if(loss==='hidden')trace.push({globalTarget:true,kind:'visibilitychange',hidden:true});
  if(loss==='reload')fixture.reload();
  if(loss==='resize')width=20;
  if(loss==='used'){await click();inputs=0;}
  await assert.rejects(click(),/prepared pointer/);assert.equal(inputs,0);
});

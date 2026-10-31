// One-shot real elapsed observation. Smoke runs can never qualify endurance.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {admitMilestoneFixtures} from './last-stand-wave-milestones.mjs';
import {LAST_STAND_HELPER_INPUTS,admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,
  fetchBoundRuntime,assertServedBytes,readShopControlObservation,assertWaveCheckpointEdition} from '../e2e/helpers/lastStandJourney.mjs';
import {tierJourneyControlGeometry} from '../e2e/helpers/lastStandTierJourney.mjs';

export const ENDURANCE_POLICY=Object.freeze({activeTargetMs:10*60*60*1000,wallLimitMs:12*60*60*1000,
  maximumSampleGapMs:5000,maximumStateAgeMs:5000,maximumStallMs:30000,summaryEveryMs:60000,
  maximumTickLeadMs:1000,maximumSummaries:725,maximumActions:128,maximumErrors:32});

export function parseEnduranceArguments(args){
  assert.ok(args.length>=3,'Use <fixture-manifest> <new-output-directory> --endurance | --smoke [--smoke-seconds=120]');
  const [manifest,output,...flags]=args;
  assert.ok(manifest && output && !manifest.startsWith('--') && !output.startsWith('--'));
  assert.equal(flags.filter(flag=>['--endurance','--smoke'].includes(flag)).length,1,'Choose exactly one observation mode');
  assert.equal(new Set(flags).size,flags.length,'No repeated flags');
  assert.ok(flags.every(flag=>['--endurance','--smoke','--research'].includes(flag)||/^--smoke-seconds=\d+$/.test(flag)),'Unknown endurance option');
  const seconds=flags.filter(flag=>flag.startsWith('--smoke-seconds='));assert.ok(seconds.length<=1);
  const mode=flags.includes('--smoke')?'smoke':'endurance';
  assert.ok(mode==='smoke'||seconds.length===0,'Smoke duration cannot shorten endurance');
  const smokeSeconds=seconds.length?Number(seconds[0].split('=')[1]):120;
  assert.ok(Number.isSafeInteger(smokeSeconds)&&smokeSeconds>=30&&smokeSeconds<=600,'Smoke is a bounded 30–600 second diagnostic');
  return {manifest,output,mode,smokeSeconds,...(flags.includes('--research')?{research:true}:{})};
}

// Observation accounting only. These helpers neither advance nor mutate the game.
export function newEnduranceLedger(expectedSpeed=1){
  assert.ok([1,5].includes(expectedSpeed),'Observation must declare shipped 1x or researched 5x');
  return {expectedSpeed,previous:null,elapsedMs:0,activeMs:0,pausedMs:0,endedMs:0,unknownMs:0,
  observedSimulationMs:0,simulationLeadAllowanceMs:0,simulationTransitionAllowanceMs:0,runClock:null,samples:0,documentTimeOrigin:null,
  lastProgressAt:0,lastTick:null,lastRunId:null};}
export function accountEnduranceObservation(ledger,next){
  for(const key of ['atMs','timeOrigin','stateAgeMs','tick','runId'])assert.ok(Number.isFinite(next[key])&&next[key]>=0,'Finite observation '+key);
  const speed=ledger.expectedSpeed;
  assert.ok(next.speed===0||next.speed===speed,'Only paused or the declared actual speed is admitted');
  if(ledger.documentTimeOrigin===null)ledger.documentTimeOrigin=next.timeOrigin;
  assert.equal(next.timeOrigin,ledger.documentTimeOrigin,'The observed document cannot reload or change');
  assert.ok(next.stateAgeMs<=ENDURANCE_POLICY.maximumStateAgeMs,'Live state observation is stale');
  if(next.runId>0){
    if(!ledger.runClock||ledger.runClock.runId!==next.runId){
      assert.ok(!ledger.runClock||next.runId>ledger.runClock.runId,'A new run identity must advance, never refresh an earlier clock allowance');
      // The session emits a state at least once per simulation second. Allow the
      // baseline's observed age plus one fixed emission/transport interval. This
      // allowance is granted once per genuine run, never once per sample.
      const allowanceMs=(next.stateAgeMs+ENDURANCE_POLICY.maximumTickLeadMs)*speed;
      ledger.runClock={runId:next.runId,tick:next.tick,atMs:next.atMs,allowanceMs,activeMs:0,transitionAllowanceMs:0};
      ledger.simulationLeadAllowanceMs+=allowanceMs;
    }
  }
  const prior=ledger.previous;
  if(prior){
    const delta=next.atMs-prior.atMs;
    assert.ok(delta>=0&&delta<=ENDURANCE_POLICY.maximumSampleGapMs,'Unobserved clock gap cannot count as gameplay or sleep through qualification');
    const active=value=>value.phase==='battle'&&!value.paused&&value.speed===speed;
    const bucket=active(prior)&&active(next)&&prior.runId===next.runId?'activeMs':
      prior.phase==='battle'&&next.phase==='battle'&&(prior.paused||next.paused)?'pausedMs':
      prior.phase!=='battle'&&next.phase!=='battle'?'endedMs':'unknownMs';
    ledger[bucket]+=delta;ledger.elapsedMs+=delta;
    if(next.runId===prior.runId&&next.runId>0){
      assert.ok(next.tick>=prior.tick,'Simulation tick cannot go backwards within one run');
      ledger.observedSimulationMs+=(next.tick-prior.tick)*50;
      if(active(prior)&&active(next))ledger.runClock.activeMs+=delta;
      else if(active(prior)||active(next)){
        // At most one bounded sample interval around an observed transition.
        // Fully paused/ended intervals never buy future simulation time.
        ledger.runClock.transitionAllowanceMs+=delta*speed;ledger.simulationTransitionAllowanceMs+=delta*speed;
      }
    }
    if(active(next)&&active(prior)&&next.runId===prior.runId&&next.tick===prior.tick)
      assert.ok(next.atMs-ledger.lastProgressAt<ENDURANCE_POLICY.maximumStallMs,'Active game stopped advancing');
  }
  if(next.runId>0)assert.ok((next.tick-ledger.runClock.tick)*50<=ledger.runClock.activeMs*speed+
    ledger.runClock.transitionAllowanceMs+ledger.runClock.allowanceMs,
    'Simulation acceleration exceeds observed active real elapsed time plus bounded transition and baseline allowances');
  if(next.tick!==ledger.lastTick||next.runId!==ledger.lastRunId)ledger.lastProgressAt=next.atMs;
  ledger.lastTick=next.tick;ledger.lastRunId=next.runId;ledger.previous={...next};ledger.samples++;
  return ledger;
}
export function enduranceVerdict(mode,ledger,{completed=false,finalBindingsVerified=false,storageLatencyVerified=false,errors=0,interrupted=false}={}){
  assert.ok(['smoke','endurance'].includes(mode));
  const qualified=mode==='endurance'&&completed&&!interrupted&&errors===0&&finalBindingsVerified&&
    ledger.activeMs>=ENDURANCE_POLICY.activeTargetMs&&ledger.elapsedMs<=ENDURANCE_POLICY.wallLimitMs&&
    ledger.observedSimulationMs>=ledger.activeMs*ledger.expectedSpeed*.95&&ledger.observedSimulationMs<=ledger.activeMs*ledger.expectedSpeed+
      ledger.simulationTransitionAllowanceMs+ledger.simulationLeadAllowanceMs&&
    storageLatencyVerified&&ledger.samples>=ENDURANCE_POLICY.activeTargetMs/ENDURANCE_POLICY.maximumSampleGapMs;
  return {enduranceQualified:qualified,status:errors?'failed':interrupted?'interrupted':qualified?'pass':
    mode==='smoke'&&completed&&finalBindingsVerified&&storageLatencyVerified&&ledger.activeMs>0&&ledger.observedSimulationMs>0?'smoke-pass':'incomplete'};
}
export function appendBounded(items,item,maximum){
  assert.ok(Number.isSafeInteger(maximum)&&maximum>0);items.push(item);if(items.length>maximum){items.shift();return 1;}return 0;
}

export async function resumeEarnedCheckpoint(layout,click){
  const controls=layout?.controls?.filter(item=>['Deploy','Redeploy'].includes(item.name)&&item.active&&item.interactable)??[];
  assert.equal(controls.length,1,'Exactly one rendered checkpoint resume control is required');
  await click(controls[0].name);
}
export function isEnduranceReadyObservation(state){return state?.action==='ready'&&state.saveState==='ready';}

// A single owned observer keeps taking fresh samples while input/reporting awaits
// the browser. A blocked event loop still produces a real gap; no timestamps are
// synthesized. stop() joins the in-flight read before the browser may be closed.
export function startEnduranceSampling({sample,wait}){
  let stopped=false,failed=false,failure,first;
  const ready=new Promise(resolve=>{first=resolve;});
  const done=(async()=>{
    try{
      while(!stopped){
        await sample(()=>stopped);first();
        if(!stopped)await wait(1000);
      }
    }catch(error){failed=true;failure=error;}
    finally{first();}
  })();
  return {ready,check(){if(failed)throw failure;},async stop(){stopped=true;await done;}};
}

export async function finalizeOwnedEndurance({prepareReport,persist,closeBrowser,onFailure}){
  const failures=[];
  try{prepareReport();persist();}catch(error){failures.push(error);}
  finally{try{await closeBrowser();}catch(error){failures.push(error);}}
  if(failures.length){
    for(const error of failures)onFailure(error);
    // Retention is best effort after cleanup. The first failure remains primary,
    // including when reporting that failure encounters another filesystem error.
    try{persist();}catch(error){onFailure(error);}
  }
  return failures[0]??null;
}

// This observes the existing synchronous browser storage calls. It never adds a
// read or write, changes saved bytes, swallows an exception, or alters a result.
// The readback span begins at setItem and ends at the first subsequent getItem;
// it excludes C# serialization and later UI work, and includes observer overhead.
export function installCheckpointStorageProbe(){
  const key='singedTerra.lastStand.prototype.v1',storage=window.localStorage,prototype=window.Storage.prototype;
  const originalSet=prototype.setItem,originalGet=prototype.getItem;
  const writes={count:0,successes:0,errors:0,totalMs:0,maximumMs:0};
  const readbacks={count:0,errors:0,mismatches:0,totalMs:0,maximumMs:0,unconfirmed:0};
  const recent=[];let recentDropped=0,pending=null;
  const retain=record=>{recent.push(record);if(recent.length>16){recent.shift();recentDropped++;}};
  prototype.setItem=function(...args){
    if(this!==storage||args[0]!==key)return Reflect.apply(originalSet,this,args);
    if(pending){readbacks.unconfirmed++;pending=null;}
    const record={sequence:++writes.count,startedMs:performance.now(),codeUnits:typeof args[1]==='string'?args[1].length:null};
    try{
      const result=Reflect.apply(originalSet,this,args);record.writeMs=performance.now()-record.startedMs;record.success=true;writes.successes++;
      if(typeof args[1]==='string'&&args[1].length<128*1024)pending={record,expected:args[1]};else readbacks.unconfirmed++;
      return result;
    }catch(error){record.writeMs=performance.now()-record.startedMs;record.success=false;writes.errors++;throw error;}
    finally{writes.totalMs+=record.writeMs;writes.maximumMs=Math.max(writes.maximumMs,record.writeMs);retain(record);}
  };
  prototype.getItem=function(...args){
    if(this!==storage||args[0]!==key||!pending)return Reflect.apply(originalGet,this,args);
    const observed=pending;pending=null;
    try{
      const result=Reflect.apply(originalGet,this,args),elapsed=performance.now()-observed.record.startedMs;
      readbacks.count++;readbacks.totalMs+=elapsed;readbacks.maximumMs=Math.max(readbacks.maximumMs,elapsed);
      observed.record.readbackMs=elapsed;observed.record.readbackMatches=result===observed.expected;
      if(!observed.record.readbackMatches)readbacks.mismatches++;
      return result;
    }catch(error){readbacks.errors++;observed.record.readbackError=true;throw error;}
  };
  window.__stCheckpointStorageProbe={snapshot(){return {writes:{...writes},readbacks:{...readbacks},
    pending:pending!==null,recent:recent.map(record=>({...record})),recentDropped};}};
}

function passiveBrowserProbe(){
  const bins=[16.7,33.4,50,100,250,1000,Infinity];
  const frames={count:0,totalMs:0,maximumMs:0,histogram:bins.map(()=>0)};
  let previous,contextsCreated=0,contextsDropped=0,inputCount=0;
  const contexts=[],input=[];
  function frame(now){if(previous!==undefined){const delta=now-previous;frames.count++;frames.totalMs+=delta;
    frames.maximumMs=Math.max(frames.maximumMs,delta);frames.histogram[bins.findIndex(bound=>delta<=bound)]++;}
    previous=now;requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  const wrapped=new Map();
  for(const name of ['AudioContext','webkitAudioContext'])if(typeof window[name]==='function'){
    const original=window[name];
    if(!wrapped.has(original))wrapped.set(original,new Proxy(original,{construct(target,args,newTarget){
      const context=Reflect.construct(target,args,newTarget);contextsCreated++;
      if(contexts.length<8)contexts.push(context);else contextsDropped++;return context;}}));
    window[name]=wrapped.get(original);
  }
  for(const kind of ['pointerdown','pointerup'])addEventListener(kind,event=>{
    input.push({sequence:++inputCount,kind,trusted:event.isTrusted,target:event.target?.id??'',x:event.clientX,y:event.clientY,t:performance.now()});
    if(input.length>8)input.shift();
  },true);
  window.__stEnduranceProbe={snapshot(){return {timeOrigin:performance.timeOrigin,now:performance.now(),hidden:document.hidden,
    focused:document.hasFocus(),frames:{...frames,histogram:[...frames.histogram]},inputCount,input:[...input],
    audioContexts:{created:contextsCreated,dropped:contextsDropped,retained:contexts.map(context=>({state:context.state,currentTime:context.currentTime,sampleRate:context.sampleRate}))}};}};
}

const root=resolve(import.meta.dirname,'..'),saveKey='singedTerra.lastStand.prototype.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputPaths=['scripts/last-stand-wave-endurance.mjs','scripts/last-stand-wave-milestones.mjs',
  'e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'e2e/helpers/lastStandWaveOracle.mjs','campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json','campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v4.json',
  'scripts/assets/verify-last-stand-source.mjs','scripts/assets/verify-last-stand.mjs'];
const inputHashes=()=>Object.fromEntries(inputPaths.map(path=>[path,sha(readFileSync(resolve(root,path)))]));
const compactState=state=>Object.fromEntries(['phase','saveState','runId','activeTier','wave','completedWave','checkpointWave','hasCheckpoint',
  'checkpointBlocked','tick','hull','kills','wallet','paused','speed','fittingId'].map(key=>[key,state?.[key]??null]));

// Current generated seeds and post-migration browser readbacks use the same
// envelope as the production serializer. Retained runs preserve their complete
// combat/content/economy edition inside that current envelope, not an old schema.
export function assertCurrentEnduranceSave(saved){
  assert.equal(saved?.version,6,'Current endurance requires save version 6');
  if(saved.checkpoint)assertWaveCheckpointEdition(saved.checkpoint);
  return saved;
}

export function admitResearchFixtures(fixtures,manifestPath,sourceRoot=root){
  assert.equal(fixtures.schema,'last-stand-research-qualification-fixtures/v1');
  assert.equal(fixtures.storageKey,saveKey);
  assert.ok(Object.keys(fixtures.sourceSha256??{}).length>=20,'Production and fixture source closure required');
  for(const [path,digest]of Object.entries(fixtures.sourceSha256)){
    const location=resolve(sourceRoot,path),rel=relative(sourceRoot,location);
    assert.ok(!isAbsolute(path)&&!rel.startsWith('..')&&!isAbsolute(rel),'Source must stay in checkout');
    assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(location)),digest,'Fixture source changed: '+path);
  }
  const directory=realpathSync(dirname(manifestPath));
  for(const fixture of fixtures.cases??[]){
    assert.ok(/^[a-z0-9-]+$/.test(fixture.id));
    assert.equal(fixture.savePath,fixture.id+'.json','Fixture uses its named sibling file');
    const location=resolve(directory,fixture.savePath);assert.equal(realpathSync(location),location);
    assert.equal(sha(readFileSync(location)),fixture.saveSha256,'Fixture bytes changed');
    const save=assertCurrentEnduranceSave(JSON.parse(readFileSync(location)));
    if(fixture.id==='mature-5x'){
      assert.equal(fixture.requestedSpeed,5);assert.equal(save.research.completedRanks.gameSpeed,8,'Five times speed must be earned in fixture');
      assert.equal(save.checkpoint,null,'Mature fixture deploys through rendered input');
      assert.equal(fixture.qualificationPurchasePolicy?.intervalRealSeconds,900);
      assert.equal(fixture.qualificationPurchasePolicy?.quantity,'Max');
      assert.equal(fixture.qualificationPurchasePolicy?.intentsPerInterval,1);
      assert.deepEqual(fixture.qualificationPurchasePolicy?.trackOrder,
        ['cannonAttack','hullCapacity','scrapYield','cannonAttack','cannonCycle','launcherAttack','armor']);
    }
  }
  assert.equal(fixtures.cases?.filter(item=>item.id==='mature-5x').length,1);
}

async function main(){
  const options=parseEnduranceArguments(process.argv.slice(2));
  const manifestPath=resolve(options.manifest),manifestBytes=readFileSync(manifestPath),fixtures=JSON.parse(manifestBytes);
  const admitFixtures=options.research?admitResearchFixtures:admitMilestoneFixtures;
  admitFixtures(fixtures,manifestPath);
  const fixture=fixtures.cases.find(item=>options.research?item.id==='mature-5x':item.fitting==='repair'&&item.targetWave===300);assert.ok(fixture);
  const saveBytes=readFileSync(options.research?resolve(dirname(manifestPath),fixture.savePath):fixture.savePath);assert.equal(sha(saveBytes),fixture.saveSha256);
  const expectedSpeed=options.research?5:1;
  const output=resolve(options.output);assert.ok(!existsSync(output),'An observation never overwrites existing evidence');
  for(const name of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
    execFileSync(process.execPath,[resolve(root,'scripts/assets',name)],{cwd:root,encoding:'utf8'});
  const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4173/singedTerra/');
  const packaged=packagedRuntimeSnapshot(),runtimePath=resolve(root,'client/public/last-stand/asset-manifest.json');
  const runtimeBytes=readFileSync(runtimePath),runtime=JSON.parse(runtimeBytes),sources=inputHashes();
  const checkSourceBindings=()=>{assert.deepEqual(inputHashes(),sources,'Runner input source changed');
    assert.equal(sha(readFileSync(runtimePath)),sha(runtimeBytes),'Packaged runtime manifest changed');
    assert.equal(sha(readFileSync(manifestPath)),sha(manifestBytes),'Fixture manifest changed');admitFixtures(fixtures,manifestPath);};
  const verifyServed=async()=>{for(const [path,digest]of Object.entries({...runtime.files,'index.html':runtime.wrapperSha256}))
    assertServedBytes(await fetchBoundRuntime(base,path),digest);};
  await verifyServed();mkdirSync(output,{recursive:true});
  const {ledger,report}=createEnduranceReport({options,expectedSpeed,fixture,manifestPath,manifestBytes,sources,packaged});
  const resultPath=resolve(output,'result.json'),samplesPath=resolve(output,'samples.ndjson');
  const persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
  const recordError=error=>{const message=String(error);report.errorsTotal++;report.errorsDropped+=appendBounded(report.errors,
    {at:new Date().toISOString(),error:message.slice(0,4000),truncated:message.length>4000},ENDURANCE_POLICY.maximumErrors);};
  let browser,context,page,cdp,latest,layout,shop,latestAt=0,readyObserved=false,interrupted=false,completed=false,observerError,started,previousRun=0;
  const onSignal=()=>{interrupted=true;};process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);persist();
  try {
    const {chromium}=await import('@playwright/test');
    browser=await chromium.launch({headless:true,chromiumSandbox:true});
    browser.on('disconnected',()=>{if(!completed&&!interrupted)observerError??=new Error('Owned browser disconnected');});
    context=await browser.newContext({viewport:{width:1366,height:768},proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
    await context.addInitScript(installCheckpointStorageProbe);await context.addInitScript(passiveBrowserProbe);
    page=await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(base.href);await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:saveKey,raw:saveBytes.toString('utf8')});
    page.on('pageerror',error=>{recordError(error);observerError??=error;});
    page.on('crash',()=>{observerError??=new Error('Renderer crashed');});
    page.on('console',message=>{try{
      const text=message.text();if(message.type()==='error'){recordError(text);observerError??=new Error(text);return;}
      if(text.length>2*1024*1024)throw new Error('Telemetry exceeds the bounded observer input');
      if(text.startsWith('ST_LS_STATE ')){latest=JSON.parse(text.slice(12));latestAt=performance.now();readyObserved||=isEnduranceReadyObservation(latest);}
      else if(text.startsWith('ST_LS_HUD_LAYOUT '))layout=readShopControlObservation(text);
      else if(text.startsWith('ST_LS_SHOP_STATE '))shop=JSON.parse(text.slice(17));
      else if(text.startsWith('ST_ENC_CALLBACK ')){const event=JSON.parse(text.slice(16));report.callback.count++;
        report.callback.maximumSteps=Math.max(report.callback.maximumSteps,event.steps??0);
        report.callback.maximumElapsedSeconds=Math.max(report.callback.maximumElapsedSeconds,event.elapsed??0);
        report.callback.maximumPendingSeconds=Math.max(report.callback.maximumPendingSeconds,event.pending??0);}
      else if(text.startsWith('ST_LS_AUDIO event=')){const event=text.slice(18).trim();report.audioCueTelemetry.events++;
        const name=/^[a-zA-Z]{1,32}$/.test(event)?event:'unclassified';
        const known=Object.hasOwn(report.audioCueTelemetry.byName,name)||Object.keys(report.audioCueTelemetry.byName).length<16?name:'other';
        report.audioCueTelemetry.byName[known]=(report.audioCueTelemetry.byName[known]??0)+1;}
    }catch(error){observerError??=error;}});
    const until=async(predicate,seconds=20)=>{const deadline=performance.now()+seconds*1000;
      while(performance.now()<deadline){if(observerError)throw observerError;if(interrupted)throw new Error('Interrupted during input');if(predicate())return;await page.waitForTimeout(50);}
      throw new Error('Required rendered state absent: '+JSON.stringify(compactState(latest)));};
    const click=async name=>{
      await until(()=>layout&&[...layout.controls,...layout.shopControls,...layout.settingsControls].some(item=>item.name===name&&item.active&&item.interactable));
      const box=await page.locator('#unity-canvas').boundingBox();assert.ok(box);
      const pixels=await page.locator('#unity-canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
      await until(()=>layout?.width===pixels.width&&layout?.height===pixels.height);
      const targets=tierJourneyControlGeometry(layout,box);assert.ok(targets.find(item=>item.name===name)?.full,'Rendered control is fully visible: '+name);
      const item=[...layout.controls,...layout.shopControls,...layout.settingsControls].find(item=>item.name===name&&item.active&&item.interactable);
      const x=box.x+(item.x+item.width/2)*box.width/layout.width,y=box.y+(item.y+item.height/2)*box.height/layout.height;
      const before=await page.evaluate(()=>window.__stEnduranceProbe.snapshot().inputCount);
      await page.mouse.click(x,y,{delay:80});
      const input=await page.evaluate(before=>window.__stEnduranceProbe.snapshot().input.filter(event=>event.sequence>before),before);
      assert.deepEqual(input.map(event=>event.kind),['pointerdown','pointerup']);
      assert.ok(input.every(event=>event.trusted&&event.target==='unity-canvas'&&Math.abs(event.x-x)<1&&Math.abs(event.y-y)<1));
      report.actionsTotal++;report.actionsDropped+=appendBounded(report.actions,{at:new Date().toISOString(),name,x,y,input},ENDURANCE_POLICY.maximumActions);
    };
    await page.goto(new URL('last-stand/',base).href);await until(()=>readyObserved&&latest?.saveState==='ready',60);
    if(options.research){
      assert.equal(latest.hasCheckpoint,false);await resumeEarnedCheckpoint(layout,click);await until(()=>latest?.phase==='battle'&&!latest.paused);
      for(let rate=1.5;rate<=5;rate+=.5){await click('SpeedPlus');await until(()=>latest.speed===rate);}
    }else{
      assert.equal(latest.checkpointWave,299);await resumeEarnedCheckpoint(layout,click);await until(()=>latest?.phase==='battle'&&latest.paused);
      assert.equal(latest.tick,JSON.parse(saveBytes).checkpoint.encounter.tick);
      await click('SpeedRate');await until(()=>latest?.phase==='battle'&&!latest.paused&&latest.speed===1);
    }
    cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    started=performance.now();report.observationStartedAt=new Date().toISOString();
    const {summary}=await observeEnduranceRun({options,fixture,click,until,page,report,ledger,checkSourceBindings,
      cdp,saveKey,started,expectedSpeed,output,samplesPath,persist,
      get shop(){return shop;},get layout(){return layout;},get latest(){return latest;},get latestAt(){return latestAt;},
      get interrupted(){return interrupted;},
      get observerError(){return observerError;},set observerError(value){observerError=value;},
      get previousRun(){return previousRun;},set previousRun(value){previousRun=value;},
      get completed(){return completed;},set completed(value){completed=value;}});
    await summary(true);checkSourceBindings();await verifyServed();assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());
    report.finalBindingsVerified=true;
  }catch(error){if(interrupted&&error.message==='Interrupted during input')report.cancellationReason=error.message;
    else {recordError(error);report.failure=String(error.stack??error).slice(0,16000);}
    if(page&&!page.isClosed())await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  }finally{
    process.exitCode=1;
    await finalizeOwnedEndurance({prepareReport:()=>{
      report.finishedAt=new Date().toISOString();report.realObservationMs=started===undefined?null:performance.now()-started;
      Object.assign(report,enduranceVerdict(options.mode,ledger,{completed,finalBindingsVerified:report.finalBindingsVerified,
        storageLatencyVerified:report.storageLatencyVerified,errors:report.errorsTotal,interrupted}));
      if(existsSync(samplesPath))report.samplesSha256=sha(readFileSync(samplesPath));
      report.latestState=compactState(latest);
    },persist,closeBrowser:async()=>{if(browser)await browser.close();},onFailure:error=>{
      recordError(error);report.status='failed';report.enduranceQualified=false;
      report.failure??=String(error.stack??error).slice(0,16000);
    }});
    process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    process.exitCode=report.status==='pass'||report.status==='smoke-pass'?0:interrupted?130:1;
    console.log(JSON.stringify({status:report.status,enduranceQualified:report.enduranceQualified,output,activeHours:ledger.activeMs/3600000,elapsedHours:ledger.elapsedMs/3600000}));
  }
}

export function createEnduranceReport({options,expectedSpeed,fixture,manifestPath,manifestBytes,sources,packaged,host=process,hash=sha}) {
  const ledger=newEnduranceLedger(expectedSpeed),report={schema:'last-stand-real-elapsed-endurance/v1',status:'running',enduranceQualified:false,
    mode:options.mode,policy:ENDURANCE_POLICY,seeded:true,normalSpeed:!options.research,expectedSpeed,
    purchasePolicy:options.research?{...fixture.qualificationPurchasePolicy,
      firstPurchaseRealSeconds:options.mode==='smoke'?30:900,
      note:options.mode==='smoke'?'Early rendered purchase diagnostic; cannot qualify endurance.':'Measured fifteen-minute cadence.'}:null,
    command:[host.execPath,...host.argv.slice(1)],
    scope:(options.mode==='smoke'?`${options.smokeSeconds}-second bounded smoke diagnostic; cannot qualify endurance. `:
      'Endurance observation with a target of ten real active hours; completion remains subject to measured final admission. ')+
      (options.research?'One headless Chromium document at researched 5x from a declared mature development profile. Rendered purchases and speed controls only; no time acceleration beyond the actual game setting. No native audio or physical-device claim.':
      'One long-lived headless Chromium document with real elapsed gameplay at shipped 1x. Accelerated production-earned initial save; rendered Continue/redeploy after natural defeat. No purchases, clock changes, offline simulation, 5x farming-duration, native media or physical-device claim.'),
    startedAt:new Date().toISOString(),fixtureManifest:manifestPath,fixtureSha256:hash(manifestBytes),saveSha256:fixture.saveSha256,
    inputs:sources,packaged,host:host.platform,ledger,actions:[],actionsTotal:0,actionsDropped:0,errors:[],errorsTotal:0,errorsDropped:0,
    callback:{count:0,maximumSteps:0,maximumElapsedSeconds:0,maximumPendingSeconds:0},audioCueTelemetry:{events:0,byName:{}},
    metricLimits:{renderer:'CDP JSHeapUsedSize/JSHeapTotalSize are renderer JavaScript heap metrics; they are not measured WebAssembly linear memory.',
      wasmLinearMemoryBytes:null,wasmAvailability:'Not exposed by the passive observer.',
      audio:'Engine cue/admission logs and AudioContext state/time only. No rendered signal, recording, speaker output or native audio acceptance.',
      checkpointLatency:'Measured localStorage setItem duration and span through its first getItem readback for the progression key. Excludes C# serialization and later UI work; includes passive observer overhead. No callback interval is treated as storage latency.',
      frameHistogramUpperBoundsMs:[16.7,33.4,50,100,250,1000,'unbounded'],
      retention:'Latest state/layout only; 128 action and 32 error ring entries; at most 725 minute summaries; hourly checkpoints/screenshots.'},
    summaries:0,screenshots:[],runsObserved:0,finalBindingsVerified:false,storageLatencyVerified:false};
  return {ledger,report};
}
// The sampler and rendered work share live state. Forwarding adapters preserve
// cancellation/error updates while tests exercise the same awaited operations.
const enduranceObservationAdapters={startEnduranceSampling,accountEnduranceObservation,assertCurrentEnduranceSave,compactState,
  sha,resolve,appendFileSync,writeFileSync,performance,process,Date,Buffer,structuredClone,assert,ENDURANCE_POLICY};
export async function observeEnduranceRun(runtime) {
  const context=Object.create(enduranceObservationAdapters);
  for(const key of Reflect.ownKeys(runtime))Object.defineProperty(context,key,{get:()=>runtime[key],set:value=>{runtime[key]=value;}});
    let nextSummary=0,nextScreenshot=0,lastCheckpoint=null;
    let nextPurchaseActiveMs=context.options.research&&context.options.mode==='smoke'?30000:900000,purchaseCursor=0;
    const periodicPurchase=async()=>{
      const policy=context.fixture.qualificationPurchasePolicy;
      await context.click('ShopEntry');await context.until(()=>context.shop?.open&&context.shop.mode==='Run');
      try{
        let skipped=0;
        while(skipped<policy.trackOrder.length){
          const card=context.shop.cards.find(item=>item.key===policy.trackOrder[purchaseCursor%policy.trackOrder.length]);
          context.assert.ok(card,'Declared policy track exists in actual run');
          if(card.level<card.cap)break;
          purchaseCursor++;skipped++;
        }
        if(skipped===policy.trackOrder.length)return;
        for(let n=0;n<4;n++){
          const quantity=context.layout.shopControls.find(item=>item.name==='ShopQuantity');
          if(quantity?.label?.includes('[MAX]'))break;
          await context.click('ShopQuantity');
        }
        context.assert.ok(context.layout.shopControls.find(item=>item.name==='ShopQuantity')?.label?.includes('[MAX]'),'Actual Max quantity selected');
        const key=policy.trackOrder[purchaseCursor%policy.trackOrder.length];
        let card=context.shop.cards.find(item=>item.key===key);
        await context.click('ShopTab'+card.category);await context.until(()=>context.shop.category===card.category);
        card=context.shop.cards.find(item=>item.key===key);
        if(!card.canPurchase){context.assert.equal(card.refusal,'InsufficientScrap');return;}
        const before={n:card.n,spent:context.shop.spentScrap};
        // A live kill may invalidate the displayed version between pointer
        // down/up. Retry a freshly rendered quote at most twice; never replay
        // an accepted debit or invoke a game method from the observer.
        for(let attempt=0;attempt<3;attempt++){
          await context.click('ShopCard_'+key+'Buy');await context.page.waitForTimeout(100);
          const after=context.shop.cards.find(item=>item.key===key);
          if(after.n>before.n){
            context.assert.ok(context.shop.spentScrap>before.spent);
            context.report.periodicPurchases??=[];
            context.assert.ok(context.report.periodicPurchases.length<64,'Bounded fifteen-minute purchase record');
            context.report.periodicPurchases.push({atActiveMs:context.ledger.activeMs,key,quantity:after.n-before.n,
              cost:context.shop.spentScrap-before.spent,runId:context.latest.runId,tick:context.latest.tick});
            purchaseCursor++;return;
          }
        }
        throw new Error('Rendered periodic purchase remained stale after bounded retries');
      }finally{if(context.shop?.open)await context.click('ShopClose');}
    };
    const summary=async(final=false)=>{
      context.checkSourceBindings();context.assert.ok(context.report.summaries<context.ENDURANCE_POLICY.maximumSummaries,'Bounded minute summary count');
      const probe=await context.page.evaluate(()=>window.__stEnduranceProbe.snapshot());
      const storageLatency=await context.page.evaluate(()=>window.__stCheckpointStorageProbe.snapshot());
      context.report.storageLatencyVerified=storageLatency.writes.successes>0&&storageLatency.readbacks.count>0&&
        storageLatency.writes.errors===0&&storageLatency.readbacks.errors===0&&storageLatency.readbacks.mismatches===0&&
        storageLatency.readbacks.unconfirmed===0&&!storageLatency.pending;
      const metrics=await context.cdp.send('Performance.getMetrics');const values=Object.fromEntries(metrics.metrics.map(item=>[item.name,item.value]));
      const raw=await context.page.evaluate(key=>localStorage.getItem(key),context.saveKey);context.assert.ok(raw&&raw.length<128*1024,'Bounded saved checkpoint');
      const saved=context.assertCurrentEnduranceSave(JSON.parse(raw));context.assert.equal(saved.pendingDefeat,null,'Current runs never create legacy Claim rewards');
      if(saved.checkpoint){
        if(lastCheckpoint?.runId===saved.checkpoint.runId)context.assert.ok(saved.checkpoint.encounter.completedWave>=lastCheckpoint.wave,'Committed checkpoint cannot go backwards');
        lastCheckpoint={runId:saved.checkpoint.runId,wave:saved.checkpoint.encounter.completedWave};}
      const record={sequence:context.report.summaries++,at:new context.Date().toISOString(),elapsedMs:context.performance.now()-context.started,final,
        ledger:{activeMs:context.ledger.activeMs,pausedMs:context.ledger.pausedMs,endedMs:context.ledger.endedMs,unknownMs:context.ledger.unknownMs,observedSimulationMs:context.ledger.observedSimulationMs},
        state:context.compactState(context.latest),browser:{timeOrigin:probe.timeOrigin,now:probe.now,hidden:probe.hidden,focused:probe.focused,frames:probe.frames,audioContexts:probe.audioContexts},
        rendererJavaScript:{heapUsedBytes:values.JSHeapUsedSize??null,heapTotalBytes:values.JSHeapTotalSize??null,
          documents:values.Documents??null,nodes:values.Nodes??null,eventListeners:values.JSEventListeners??null},
        wasmLinearMemoryBytes:null,nodeRunnerMemory:context.process.memoryUsage(),callback:{...context.report.callback},audioCueTelemetry:context.structuredClone(context.report.audioCueTelemetry),
        checkpointStorageLatency:storageLatency,
        checkpoint:{sha256:context.sha(context.Buffer.from(raw)),bytes:context.Buffer.byteLength(raw),runId:saved.checkpoint?.runId??null,wave:saved.checkpoint?.encounter.completedWave??null},
        actionsTotal:context.report.actionsTotal,errorsTotal:context.report.errorsTotal};
      context.appendFileSync(context.samplesPath,JSON.stringify(record)+'\n');
      if(record.elapsedMs>=nextScreenshot||final){context.assert.ok(context.report.screenshots.length<15,'Bounded screenshots');
        const stem='sample-'+String(record.sequence).padStart(4,'0'),path=context.resolve(context.output,stem+'.png');await context.page.screenshot({path});
        context.writeFileSync(context.resolve(context.output,stem+'-checkpoint.json'),raw);context.report.screenshots.push({path,at:record.at,elapsedMs:record.elapsedMs});nextScreenshot+=3600000;}
      context.report.latestSample=record;context.persist();
    };
    const sampling=context.startEnduranceSampling({wait:ms=>context.page.waitForTimeout(ms),sample:async stopped=>{
      try{
        if(stopped()||context.interrupted)return;
        if(context.observerError)throw context.observerError;
        const probe=await context.page.evaluate(()=>window.__stEnduranceProbe.snapshot()),now=context.performance.now();
        if(stopped()||context.interrupted)return;
        if(context.observerError)throw context.observerError;
        context.assert.equal(context.latest?.saveState,'ready','A save fault stops endurance qualification');
        context.assert.equal(context.latest?.checkpointBlocked,false,'A blocked checkpoint stops endurance qualification');
        const observation={atMs:now-context.started,timeOrigin:probe.timeOrigin,stateAgeMs:now-context.latestAt,phase:context.latest.phase,
          paused:context.latest.paused,speed:context.latest.speed,tick:context.latest.tick,runId:context.latest.runId};
        context.accountEnduranceObservation(context.ledger,observation);
        context.assert.ok(context.ledger.elapsedMs<=context.ENDURANCE_POLICY.wallLimitMs,'Twelve-hour wall limit reached without ten active hours');
        if(context.latest.runId>0&&context.latest.runId!==context.previousRun){context.report.runsObserved++;context.previousRun=context.latest.runId;}
      }catch(error){context.observerError??=error;throw error;}
    }});
    try{
      await sampling.ready;sampling.check();
      while(!context.interrupted){
        sampling.check();
        if(context.observerError)throw context.observerError;context.assert.equal(context.latest?.saveState,'ready','A save fault stops endurance qualification');
        context.assert.equal(context.latest?.checkpointBlocked,false,'A blocked checkpoint stops endurance qualification');
        const now=context.performance.now();
        if(context.options.mode==='smoke'?context.ledger.elapsedMs>=context.options.smokeSeconds*1000:context.ledger.activeMs>=context.ENDURANCE_POLICY.activeTargetMs){context.completed=true;break;}
        context.assert.ok(context.ledger.elapsedMs<context.ENDURANCE_POLICY.wallLimitMs,'Twelve-hour wall limit reached without ten active hours');
        if(now-context.started>=nextSummary){await summary();nextSummary+=context.ENDURANCE_POLICY.summaryEveryMs;}
        if(context.options.research&&context.ledger.activeMs>=nextPurchaseActiveMs&&context.latest.phase==='battle'&&!context.latest.paused){
          await periodicPurchase();nextPurchaseActiveMs+=900000;
        }
        if(context.latest.phase==='result'){await context.click('Claim');await context.until(()=>context.latest?.phase==='workshop');}
        if(['garage','workshop'].includes(context.latest.phase)){
          context.assert.equal(context.latest.hasCheckpoint,false,'Unexpected resumable run cannot be silently replaced');
          await context.click(context.latest.phase==='garage'?'Deploy':'Redeploy');await context.until(()=>context.latest?.phase==='battle'&&!context.latest.paused&&context.latest.speed===context.expectedSpeed);
        }
        await context.page.waitForTimeout(1000);
      }
    }finally{
      await sampling.stop();
    }
    sampling.check();

  return {summary};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

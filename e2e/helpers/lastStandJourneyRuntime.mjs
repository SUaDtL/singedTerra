import {lastStandJourneyTimeBudget} from './lastStandProcessSupervisor.mjs';
import {lastStandDeploymentControl} from './lastStandJourneyActions.mjs';
import {SAVE_KEY} from './lastStandJourneyHost.mjs';
import {validateModelObservation} from './lastStandRuntimeObservation.mjs';
import {validateBackgroundCheckpoint,isWaveResultFor,validateWaveTerminal,assertWaveStillHidden,validateBackgroundWaveTerminal} from './lastStandWaveGuards.mjs';
import assert from 'node:assert/strict';
import { observeRuntimePair, validateAwayAudioReturn, validateNoReplayAudio, waveIntervalEvents,
  observeFirstCannonImpact, observeFreshCannonAudio } from './lastStandRuntimeObservation.mjs';
import { ensureOwnedNativeForeground, activateOwnedNativeWindow, retainAwayFailure, cleanupAwayAuxiliary } from './lastStandNativeDriver.mjs';
import { changeLastStandSetting } from './lastStandJourneyActions.mjs';
import {startMotion,frameTiming} from './lastStandMediaCapture.mjs';

// Each operation receives the live caller state at invocation. Tests supply
// explicit inert adapters; the runner uses these same imported operations.
export function throwJourneyObserverFailure(error) { if(error)throw error; }

export async function observeJourneyRuntime({encounters,states,load,check,page},options) {
  return observeRuntimePair({encounters,states,load,check,options,
    clock:()=>page.evaluate(()=>({t:performance.now(),timeOrigin:performance.timeOrigin})),
    wait:ms=>page.waitForTimeout(ms)});
}

export async function observeBaselineImpact({deployed,start,hits,encounters,callbackRecords,cues,oracle,until,check,player}) {
  const first=await observeFirstCannonImpact({deployed,start,hits,encounters,callbackRecords,oracle,until});
  check(first.firstFoeHull===10,'first base cannon leaves identical 30 HP foe at 10 HP',first);
  const firstSound=player?await observeFreshCannonAudio({deployed,encounters,callbackRecords,cues,oracle,until}):null;
  if(player)check(true,'baseline fresh cannon/impact admission bound independently of authoritative hit',firstSound);
  return {first,firstHit:first.t,firstSound};
}

export async function startBaselineCapture({screenshot,phaseMatrix,hits,mark,gameClick,check,player,page,native,output,setMotion,
  encounters,callbackRecords,cues,modelOracle,until,captureMotion=startMotion}) {
  await screenshot('00-garage');await phaseMatrix('garage');
  const baselineHitStart=hits.length;
  const startAudio=await mark();const deployed=await gameClick('Deploy','deploy');
  check(deployed.phase==='battle' && deployed.cannonDamage===20,'normal-speed automatic baseline deployed',deployed);
  if(player){await page.evaluate('window.__stFrameProbe.start()');setMotion(await captureMotion(native.context,page,output));}
  const motionStart=await mark();
  const impact=await observeBaselineImpact({deployed,start:baselineHitStart,hits,encounters,callbackRecords,cues,
    oracle:modelOracle[`${deployed.activeTier}:${deployed.fittingId}:${deployed.cannonDamage}`],until,check,player});
  return {startAudio,deployed,motionStart,...impact};
}

export async function measureBaselineImpact({page,player,energy,check,battleLayouts,firstSound}) {
  await page.waitForTimeout(750);const sound=player?await energy(firstSound.begin,firstSound.end):null;
  if(player)check(sound.maximum_rms>.0005,'rendered cannon/impact output measured',sound);
  const layoutPause=await battleLayouts();return {sound,layoutPause};
}

export async function observeUpgradedImpact({deployed,start,hits,encounters,callbackRecords,cues,oracle,until,check,player,
  page,write,report,noCaptureStart,measureFrames=frameTiming}) {
  const upgradedHit=await observeFirstCannonImpact({deployed,start,hits,encounters,callbackRecords,oracle,until});
  const noCaptureEnd=upgradedHit.t;
  if(player){
    const noCaptureFrames=await page.evaluate('window.__stFrameProbe.stop()');write('animation-frame-no-capture-timestamps.json',{timestamps:noCaptureFrames,active_window:[noCaptureStart,noCaptureEnd]});
    report.frame_timing.no_capture_active=measureFrames(noCaptureFrames,noCaptureStart,noCaptureEnd);
    const captured=report.frame_timing.capture_active['first-foe-before-impact'],uncaptured=report.frame_timing.no_capture_active;
    check(captured.p95_ms<=uncaptured.p95_ms*1.5+5,'screencast pre-impact p95 within 50 percent plus5ms',{captured,uncaptured});
  }
  check(upgradedHit.firstFoeHull===0 && upgradedHit.kills>=1,'same first foe one-hit defeated by real 30 damage',upgradedHit);
  const upgradedSound=player?await observeFreshCannonAudio({deployed,encounters,callbackRecords,cues,oracle,until}):null;
  if(player)check(true,'upgraded fresh cannon/impact admission bound independently of authoritative hit',upgradedSound);
  return {upgradedHit,upgradedSound};
}

export async function prepareJourneyPause({player,check,layoutPause,gameClick,layouts,states,until,mark,page,energy,observation,gameKey,
  changeSetting=changeLastStandSetting}) {
  const setting=control=>changeSetting({control,click:name=>gameClick(name,'hud-layout'),
    currentLayout:()=>layouts.at(-1),currentState:()=>states.at(-1),readValue:()=>states.at(-1).muted,
    waitFor:predicate=>until(layouts,0,()=>predicate(),8)});
  const muted=await setting('SettingsMute');check(muted.muted,'actual mute state enabled');const muteStart=await mark();await page.waitForTimeout(1200);
  const mute=await energy(muteStart+150,await mark());if(player)check(mute.maximum_rms<.0005,'mute suppresses rendered output',mute);
  const unmuted=await setting('SettingsMute');check(!unmuted.muted,'actual mute state disabled');
  const pauseBefore=layoutPause?.before??await observation();
  const paused=layoutPause?.paused??await gameKey('SpeedRate','session',item=>item.paused);
  const pausedObservation=layoutPause?.paused??await observation({action:'pause',paused:true,minT:pauseBefore.t,run:pauseBefore.run});
  return {pauseBefore,paused,pausedObservation};
}

export async function checkJourneyAudioReturn({energy,report,cues,load,states,encounters,callbackRecords,reference,check,
  validateReturn=validateAwayAudioReturn,validateAudio=validateNoReplayAudio},begin,end,interval) {
  const selected=interval?validateReturn({...interval,cues,states,encounters,callbackRecords,oracle:reference(interval.before)}):
    {begin,end,cues:cues.filter(item=>item.load===load && begin<=item.t && item.t<=end)};
  const measured=await energy(selected.begin,selected.end),observedCues=selected.cues;
  if(measured===null){
    check(observedCues.length===0,'functional telemetry has no background/return replay cue',observedCues);
    const result={rendered_audio:'unexecuted-requires-windows',cues:observedCues};
    report.lifecycle.push({kind:'no-replay-telemetry',begin:selected.begin,end:selected.end,...result,boundary:selected.boundary});return result;
  }
  const result=validateAudio({energy:measured,cues:observedCues});report.lifecycle.push({kind:'no-replay',
    begin:selected.begin,end:selected.end,energy:result,cues:observedCues,boundary:selected.boundary});return result;
}

export async function focusJourneyDocument({native,page,report,check,host=process.platform,ensureForeground=ensureOwnedNativeForeground},label) {
  if(host==='linux' && await page.evaluate('!document.hidden && document.hasFocus()')){
    check(true,`${label}: document focus and visibility`);return;
  }
  await page.bringToFront();
  if(host==='win32')await ensureForeground({native,page,report,kind:label,role:'original-precondition'});
  await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10_000});
  check(await page.evaluate('!document.hidden && document.hasFocus()'),`${label}: ${host==='win32'?'native':'document'} focus and visibility`);
}

export async function runJourneyAway({native,page,observation,check,mark,noReplay,report,output,trace,motion,
  host=process.platform,ensureForeground=ensureOwnedNativeForeground,activateWindow=activateOwnedNativeWindow,
  retainFailure=retainAwayFailure,cleanup=cleanupAwayAuxiliary},kind,ms,{waitHidden}={}) {
  const traceStart=trace.length;const before=await observation();let other,session,awayError;
  await page.bringToFront();
  await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10000});
  if(host==='win32')await ensureForeground({native,page,report,kind,role:'original-precondition'});
  if(kind==='blur') {
    check(host==='win32','Real visible window-blur capability is required; headless focus emulation is not player evidence');
    session=await native.browser.newBrowserCDPSession();
    const created=native.context.waitForEvent('page');
    await session.send('Target.createTarget',{url:'about:blank',newWindow:true});other=await created;
  } else other=await native.context.newPage();
  try {
    await other.goto('about:blank');await other.bringToFront();
    if(kind==='blur')await activateWindow({native,page:other,report,kind,role:'auxiliary'});
    await page.waitForFunction(kind==='blur'?'!document.hidden && !document.hasFocus()':'document.hidden && !document.hasFocus()',null,{timeout:10000});
    const begin=await mark();await page.waitForTimeout(ms);
    if(waitHidden){assert.equal(kind,'hidden');await waitHidden({before,begin});}
    await page.bringToFront();
    if(kind==='blur')await activateWindow({native,page,report,kind,role:'original'});
    await page.waitForFunction('!document.hidden && document.hasFocus()');
    const recovered=await mark();await noReplay(begin+200,recovered,{kind,before,begin,recovered,ms,events:trace.slice(traceStart)});
    return {before,begin,recovered,...(waitHidden?{ms,events:waveIntervalEvents(before,{...before,t:recovered},trace.slice(traceStart))}:{})};
  } catch(error) {
    awayError=error;
    try {await retainFailure({native,page,other,kind,report,output,error,
      capture:{motion_handle_present:typeof motion==='undefined'?null:Boolean(motion),cdp_capture_state:'unknown'}});}
    catch(failure){const errors=report.window_diagnostic_failures??=[];
      errors.push({kind,name:String(failure?.name??'Error').slice(0,100),message:String(failure?.message??failure).slice(0,1000),
        stack:String(failure?.stack??'').slice(0,4000)});if(errors.length>8){errors.shift();report.window_diagnostic_failures_dropped=(report.window_diagnostic_failures_dropped??0)+1;}}
    throw error;
  } finally {await cleanup({other,session,report,kind,primaryError:awayError});}
}

export async function observeReturnedWave({observation,reference,interval,validateObservation=validateModelObservation}) {
    const afterBackground=await observation({minT:interval.recovered,run:interval.before.run});validateObservation(afterBackground,reference(afterBackground));

  return afterBackground;
}
export async function captureBackgroundCheckpoint({observation,reference,interval,gameKey,page,check,report,phaseMatrix,nextBoundary,saveKey=SAVE_KEY,validateObservation=validateModelObservation,validateCheckpoint=validateBackgroundCheckpoint}) {
    const afterBackground=await observeReturnedWave({observation,reference,interval,validateObservation});
    const checkpointState=await gameKey('SpeedRate','session',item=>item.paused);
    const backgroundSaved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),saveKey));
    validateCheckpoint({interval,after:afterBackground,checkpointState,saved:backgroundSaved});
    check(backgroundSaved.checkpoint?.encounter.completedWave>=nextBoundary && backgroundSaved.credits===checkpointState.wallet &&
      backgroundSaved.pendingDefeat===null,'background wave rewards and checkpoint share one durable save');
    report.lifecycle.push({kind:'background-wave',interval,after:afterBackground,checkpointState,saved:backgroundSaved});
    await phaseMatrix('background-checkpoint');


}
export async function prepareSettlingInteraction({player,armGameClick,until,states,terminalStart,load,expectedTerminal,terminalBefore,phaseMatrix,gameClick}) {
    let terminalPaused,terminalResumed;
    if(player){
      const prepared=await armGameClick('SpeedRate','session',item=>item.phase==='settling' && item.paused);
      await until(states,terminalStart,item=>item.load===load && item.phase==='settling',
        (expectedTerminal.tick-terminalBefore.tick)*.05+30);
      terminalPaused=await prepared();await phaseMatrix('settling');
      terminalResumed=await gameClick('SpeedRate','session',item=>item.phase==='settling' && !item.paused);
    }

  return {terminalPaused,terminalResumed};
}
export async function collectWaveResult({until,states,start,before,expectedTerminal}) {
  return until(states,start,item=>isWaveResultFor(before,item),expectedTerminal?(expectedTerminal.tick-before.tick)*.05+30:60);
}
export async function captureWaveTerminal({before,result,page,states,encounters,layouts,oracle,saveKey=SAVE_KEY,validateTerminal=validateWaveTerminal}) {
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),saveKey));
  const proof=validateTerminal({before,result,saved,states,encounters,layouts,oracle});
  return {saved,proof};
}
export async function observeNaturalTerminal({observation,states,reference,check,player,armGameClick,until,load,phaseMatrix,gameClick,page,encounters,layouts,report,matrix,saveKey=SAVE_KEY,validateTerminal=validateWaveTerminal}) {
    const terminalBefore=await observation(),terminalStart=states.length,terminalOracle=reference(terminalBefore);
    const expectedTerminal=Object.values(terminalOracle).at(-1);
    check(expectedTerminal.status==='Defeated','current wave oracle has a natural terminal');
    const {terminalPaused,terminalResumed}=await prepareSettlingInteraction({player,armGameClick,until,states,terminalStart,load,expectedTerminal,terminalBefore,phaseMatrix,gameClick});
    const naturalResult=await collectWaveResult({until,states,start:terminalStart,before:terminalBefore,expectedTerminal});
    const {saved:naturalSaved,proof:naturalProof}=await captureWaveTerminal({before:terminalBefore,result:naturalResult,page,states,encounters,layouts,oracle:terminalOracle,saveKey,validateTerminal});
    report.lifecycle.push({kind:'wave-terminal',mode:'foreground',evidence:naturalProof,
      ...(player?{interaction:{paused:terminalPaused,resumed:terminalResumed,viewports:matrix.phaseViewports.map(v=>v.name)}}:{})});
    check(true,'natural defeat finalizes checkpoint without a second payout',naturalProof);

  return {naturalResult,naturalSaved,naturalProof};
}
export async function collectHiddenWaveResult({away,until,states,before,start,expectedTerminal,trace}) {
  const interval=await away('hidden',(expectedTerminal.tick-before.tick)*50+1500,{
    waitHidden:async({before,begin})=>assertWaveStillHidden(before,begin,trace)});
  const result=await collectWaveResult({until,states,start,before});
  return {interval,result};
}
export function retainHiddenWaveTerminal({interval,before,proof,trace,callbackRecords,states,cues,validateContinuation=validateBackgroundWaveTerminal}) {
  interval.before=before;
  interval.events=waveIntervalEvents(before,{...before,t:interval.recovered},trace);
  return validateContinuation({interval,evidence:proof,callbackRecords,states,cues});
}
export function checkProceduralJourneyCues({messages,player,check,report}) {
    const cueNames=messages.filter(item=>!item.text.startsWith('ST_TEST_RUNTIME ') && item.text.includes('ST_LS_AUDIO event='))
      .map(item=>item.text.split('ST_LS_AUDIO event=')[1].split('\n')[0]);
    if(player){
      check(['cannon','impact','destruction','defeat','purchase'].every(cue=>cueNames.includes(cue)),'all five procedural cues admitted',cueNames);
      report.qualification.procedural_cues='pass';
    }

}
export function saveJourneyCannonAudio({saveAudio,name,sound,staged}) {
  return saveAudio(name,{'cannon-impact':[sound.begin,sound.end],...(staged?{defeat:[staged.t-250,staged.t+750]}:{})});
}

export function admitJourneyPage(page,budget=lastStandJourneyTimeBudget()) { page.setDefaultTimeout(budget.actionMs); }
export async function runWaveJourneyTest({test,page,baseURL,testInfo,runJourney,budget=lastStandJourneyTimeBudget()}) {
  test.skip(testInfo.project.name!=='desktop-fine','One journey owns the five-profile matrix');
  test.setTimeout(budget.testMs);
  admitJourneyPage(page,budget);
  if(!baseURL)throw new Error('Production baseURL is required');
  await runJourney({page,baseURL,testInfo});
}
export async function deployObservedJourney({gameClick,states,layouts},action='deploy') {
  return gameClick(lastStandDeploymentControl(states.at(-1),layouts.at(-1)),action);
}
export async function purchaseJourneyCannon({gameKey,check,savedWave}) {
  const bought=await gameKey('ShopCard_cannonAttackBuy','purchase');check(bought.wallet===savedWave.credits-2 && bought.level===1 && bought.cannonDamage===30,'two salvage commits Cannon Attack level1',bought);
  return bought;
}

export async function verifyRetiredCampaignReturn({report,selected,check,page}) {
    report.retired_campaign_preservation.native_return='observed unchanged';
    await selected('last-stand');
    const campaignItems=await page.locator('.command-center__library-items [data-command-item]').evaluateAll(items=>items.map(item=>item.dataset.commandItem));
    check(campaignItems.length===1&&campaignItems[0]==='last-stand','native Return offers only Last Stand');
    report.retired_campaign_preservation.retirement='observed Last Stand only';
}
export async function resumeReturnedJourney({resize,captureViewport,gameClick}) {
  await resize(captureViewport);
  return gameClick('Deploy','resume');
}

import assert from 'node:assert/strict';
import { waveIntervalEvents, validateModelObservation } from './lastStandRuntimeObservation.mjs';


export function isWaveResultFor(before,item) {
  return item?.action==='result' && item.phase==='result' && item.sessionRun===before.run &&
    item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    Number.isFinite(item.t) && item.t>=before.t;
}

export function assertWaveStillHidden(before,begin,events) {
  assert.ok(!events.some(item=>item.load===before.load && item.timeOrigin===before.timeOrigin &&
    item.scope===before.scope && item.globalTarget===true && item.kind==='visibilitychange' &&
    item.t>=begin && !item.hidden),'Hidden terminal wait observed a premature native visibility return');
}

export function validateHiddenWaveTerminal({interval,evidence,events=interval?.events}) {
  const {before,terminal,staged,result}=evidence;
  assert.ok(interval && Number.isFinite(interval.begin) && Number.isFinite(interval.recovered) &&
    interval.before.t<=interval.begin && interval.begin<interval.recovered);
  for(const key of ['load','timeOrigin','scope','run'])assert.equal(interval.before[key],before[key]);
  assert.deepEqual(events,waveIntervalEvents(interval.before,{...interval.before,t:interval.recovered},events),
    'Hidden terminal requires its exact bounded native visibility events');
  assert.ok(events.every((event,index)=>Number.isFinite(event.t) && (!index || event.t>=events[index-1].t)));
  const loss=events.find(item=>item.kind==='visibilitychange' && item.hidden && !item.focused);
  const visible=loss && events.find(item=>item.t>loss.t && item.kind==='visibilitychange' && !item.hidden);
  assert.ok(loss && visible && loss.t<=interval.begin && visible.t<=interval.recovered &&
    loss.t<terminal.t && terminal.t<=staged.t && staged.t<=result.t && result.t<visible.t,
    'Terminal, durable staging and exact result must finish before the first actual visibility return');
  assert.ok(isWaveResultFor(before,result),'Hidden terminal requires the exact same-session result transition');
  return {loss,visible};
}

// The loaded-page contract permits throttled callbacks and reconciliation on
// ordinary return. Keep that outcome separate from actual hidden persistence.
export function validateBackgroundWaveTerminal({interval,evidence,events=interval?.events,callbackRecords=[],states=[],cues=[]}) {
  const {before,terminal,result}=evidence;
  assert.deepEqual(interval?.before,before,'Background interval starts at the source-bound model observation');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const loss=events?.find(item=>current(item) && item.globalTarget===true &&
    item.kind==='visibilitychange' && item.hidden && !item.focused);
  const visible=loss && events.find(item=>current(item) && item.globalTarget===true &&
    item.kind==='visibilitychange' && !item.hidden && item.t>loss.t);
  if(visible && result.t<visible.t){
    validateHiddenWaveTerminal({interval,evidence,events});return {completion:'hidden'};
  }
  assert.ok(interval && Number.isFinite(interval.begin) && Number.isFinite(interval.recovered));
  for(const key of ['load','timeOrigin','scope','run'])assert.equal(interval.before[key],before[key]);
  assert.deepEqual(events,waveIntervalEvents(before,{...before,t:interval.recovered},events),
    'Deferred terminal requires its exact bounded native visibility events');
  assert.ok(events.every((event,index)=>Number.isFinite(event.t) && (!index || event.t>=events[index-1].t)));
  const requiredMs=(terminal.tick-before.tick)*50+1500;
  assert.ok(before.selectedSpeed===1 && Number.isSafeInteger(terminal.tick) && terminal.tick>before.tick &&
    Number.isSafeInteger(before.tick) && interval.ms===requiredMs && loss && visible &&
    before.t<=loss.t && loss.t<=interval.begin && visible.t>=interval.begin+requiredMs &&
    visible.t<=interval.recovered,
    'Deferred terminal requires the full oracle-derived 1x hidden interval before its first native return');
  assert.ok(events.some(item=>item.globalTarget===true && item.t>=visible.t && item.t<=interval.recovered &&
    item.focused===true && item.hidden===false),'Deferred terminal requires actual native foreground return');
  assert.ok(isWaveResultFor(before,result) && result.t>=visible.t && result.t<=visible.t+60000,
    'Deferred terminal must finish within the bounded foreground catch-up window');
  const callbacks=callbackRecords.filter(item=>current(item) && item.run===before.run &&
    ['begin','end'].includes(item.action) && item.fromTick>=before.tick && item.t>=before.t && item.t<=result.t);
  const starts=callbacks.filter(item=>item.action==='begin'),ends=callbacks.filter(item=>item.action==='end');
  assert.ok(starts.length>0 && starts.length===ends.length,'Deferred terminal requires complete admitted callback pairs');
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;
  let tick=before.tick,pending=before.clockPending,timestamp=before.clockTimestamp;
  for(let i=0;i<starts.length;i++){
    const a=starts[i],b=ends[i];
    assert.ok(a.id===b.id && a.run===b.run && a.t<=b.t && (!i || ends[i-1].t<=a.t) &&
      (!i || a.id>starts[i-1].id),'Deferred callbacks retain exact identity and ordering');
    for(const row of [a,b])assert.ok(row.paused===false && row.failed===false && row.speed===before.selectedSpeed &&
      Number.isFinite(row.pending) && row.pending>=0 && Number.isFinite(row.elapsed) && row.elapsed>=0 &&
      near(row.timestamp-row.previousTimestamp,row.elapsed),'Deferred callback admission must remain unpaused and monotonic');
    assert.ok(a.fromTick===tick && b.fromTick===tick && a.tick===tick && a.steps===0 &&
      Number.isInteger(b.steps) && b.steps>=0 && b.steps<=128 && b.tick===tick+b.steps,
      'Deferred callback must preserve the 128-step cap and every model tick');
    // Sub-tick admissions do not emit callback records. Their monotonic clock
    // gap adds time but cannot hide a step because fromTick must still match.
    const gap=a.previousTimestamp-timestamp;
    assert.ok(Number.isFinite(gap) && gap>=-1e-6 &&
      (gap<=1e-6 || (pending+1e-9<.05 && a.priorPending+1e-9<.05)) &&
      near(a.priorPending,pending+Math.max(0,gap)*before.selectedSpeed) && near(b.priorPending,a.priorPending) &&
      near(a.pending,a.priorPending+a.elapsed*a.speed) && near(b.pending,a.pending-b.steps*.05) &&
      near(a.timestamp,b.timestamp) && near(a.previousTimestamp,b.previousTimestamp) && near(a.elapsed,b.elapsed),
      'Deferred callbacks must conserve admitted elapsed time and retained debt');
    tick=b.tick;pending=b.pending;timestamp=b.timestamp;
  }
  assert.equal(tick,terminal.tick,'Deferred callbacks must reach the independently verified terminal tick');
  assert.ok(starts.at(-1).t<=terminal.t && terminal.t<=ends.at(-1).t,
    'Terminal must belong to the final measured callback');
  const during=item=>current(item) && item.t>=before.t && item.t<=result.t;
  assert.ok(states.filter(item=>during(item)&&item.sessionRun===before.run).every(item=>
    item.saveState==='ready' && !item.checkpointBlocked && (!['battle','settling'].includes(item.phase) || item.paused===false)),
    'Deferred terminal cannot hide an automatic pause or failed checkpoint');
  assert.ok(!cues.some(item=>current(item) && item.t>=loss.t+200 && item.t<=result.t),
    'Deferred terminal cannot replay background or catch-up cues');
  return {completion:'after-native-return',callbacks};
}

// These ordinary-player journeys never fund research. Only its idle clock and
// transaction revisions may advance during Return, reload or explicit Resume.
// A funded project needs the separate research journey's completion evidence.
export function assertIdleWaveSave(saved) {
  assert.ok(saved?.version===5||saved?.version===6,'Supported wave/profile envelope required');
  if(saved.version===6&&saved.checkpoint)assertWaveCheckpointEdition(saved.checkpoint);
  if(saved.version===5&&saved.checkpoint){
    const {encounter:e,shop:s}=saved.checkpoint;
    assert.equal(e?.rulesVersion,'last-stand-waves-v1','Archive envelope cannot contain current rules');
    assert.ok(Number.isInteger(e.tier)&&e.tier>=1&&e.tier<=2&&Number.isInteger(e.fitting)&&e.fitting>=0&&e.fitting<=2,'Archive content range');
    assert.ok(!Object.hasOwn(saved.checkpoint,'contentVersion'),'Archive checkpoint has no explicit content field');
    for(const key of ['mortarShots','railgunShots','nextMortarTick','nextRailgunTick','mortarDamage','railgunDamage'])
      assert.ok(!Object.hasOwn(e,key),'Current weapon field in archive envelope');
    if(s){
      assert.ok(s.version===undefined||s.version===1||s.version===2,'Archive shop schema');
      if(s.economyVersion!==undefined)assert.ok(['long-run-economy-v1','research-farming-economy-v2','research-farming-economy-v3'].includes(s.economyVersion),'Archive economy');
      for(const key of ['tier','rewardWave','defeatedMask'])assert.ok(!Object.hasOwn(s,key),'Current ledger field in archive envelope');
      for(const levels of [s.permanentLevels,s.runPurchases])if(levels)
        for(const key of ['mortarAttack','railgunAttack'])assert.ok(!Object.hasOwn(levels,key),'Current upgrade in archive envelope');
    }
  }
  assert.ok(Number.isSafeInteger(saved.revision)&&saved.revision>0);
  const r=saved.research;assert.equal(r?.version,1);assert.equal(r.catalogVersion,'research-v1');
  assert.ok(Number.isSafeInteger(r.revision)&&r.revision>=0);
  assert.ok(Number.isSafeInteger(r.lastObservedUtcMilliseconds)&&r.lastObservedUtcMilliseconds>=0);
  assert.equal(r.nextProjectIdentity,1);assert.equal(r.completionSequence,0);
  const empty=Object.fromEntries(['gameSpeed','salvageRecovery','researchSpeed','scrapLogistics'].map(key=>[key,0]));
  assert.deepEqual(r.completedRanks,empty,'Ordinary wave qualification uses no research grants');
  assert.deepEqual(r.partials,Object.fromEntries(Object.keys(empty).map(key=>[key,null])));
  assert.deepEqual(r.slots,[{active:null,queued:null},{active:null,queued:null}]);
  assert.equal(saved.history?.version,1);
}

export const WAVE_FITTINGS=Object.freeze(['launcher','repair','scattergun','mortar','railgun']);

export function assertWaveCheckpointEdition(checkpoint){
  const e=checkpoint?.encounter,s=checkpoint?.shop;
  assert.ok(e&&s,'Complete checkpoint edition required');
  const current=e.rulesVersion==='last-stand-waves-v2';
  assert.equal(e.rulesVersion,current?'last-stand-waves-v2':'last-stand-waves-v1','Unknown wave rules');
  assert.equal(checkpoint.contentVersion,current?'last-stand-content-v2':'last-stand-content-v1','Mixed content edition');
  assert.ok(current?s.economyVersion==='combat-depth-economy-v4':
    ['long-run-economy-v1','research-farming-economy-v2','research-farming-economy-v3'].includes(s.economyVersion),'Mixed economy edition');
  assert.ok(Number.isInteger(e.tier)&&e.tier>=1&&e.tier<=(current?4:2),'Tier outside saved edition');
  assert.ok(Number.isInteger(e.fitting)&&e.fitting>=0&&e.fitting<(current?5:3),'Fitting outside saved edition');
  const fields=['mortarShots','railgunShots','nextMortarTick','nextRailgunTick','mortarDamage','railgunDamage'];
  for(const key of fields)if(current)assert.ok(Number.isSafeInteger(e[key])&&e[key]>=0,'Missing weapon state: '+key);
  else assert.ok(!Object.hasOwn(e,key),'New weapon state in legacy edition');
  if(current){
    assert.ok(e.nextMortarTick>=1&&e.nextRailgunTick>=1,'Invalid initial armament due tick');
    assert.ok(e.mortarDamage>=18&&e.railgunDamage>=40,'Invalid armament damage');
  }
  return {rulesVersion:e.rulesVersion,contentVersion:checkpoint.contentVersion,economyVersion:s.economyVersion};
}

export function assertWaveStateEdition(state,saved){
  if(saved.version!==6)return; // Historical reader fixtures retain their envelope.
  const edition=assertWaveCheckpointEdition(saved.checkpoint);
  assert.equal(state.profileVersion,edition.rulesVersion);
  assert.equal(state.contentVersion,edition.contentVersion);
  assert.equal(state.economyVersion,edition.economyVersion);
  return edition;
}

export function assertWaveRestoredState(state,saved){
  const edition=assertWaveStateEdition(state,saved);
  if(!edition)return;
  if(edition.rulesVersion==='last-stand-waves-v2')for(const key of ['mortarShots','railgunShots','mortarDamage','railgunDamage'])
    assert.equal(state[key],saved.checkpoint.encounter[key],'Restored armament differs: '+key);
}

export function validateBackgroundCheckpoint({interval,after,checkpointState:state,saved}) {
  assertIdleWaveSave(saved);
  const cp=saved.checkpoint,e=cp?.encounter;
  assert.ok(e&&state&&after?.loop&&interval?.before,'A separate paused checkpoint witness is required');
  for(const row of [interval.before,after,after.loop,state]) {
    assert.ok(Number.isSafeInteger(row.load)&&row.load>0&&Number.isFinite(row.timeOrigin)&&row.timeOrigin>0);
    assert.ok(Number.isFinite(row.t)&&row.t>=0&&typeof row.scope==='string'&&row.scope.length>0);
    for(const key of ['load','timeOrigin','scope'])assert.equal(row[key],after[key],'Checkpoint witnesses share one document');
  }
  assert.ok(Number.isSafeInteger(after.run)&&after.run>0);assert.equal(after.run,interval.before.run);
  assert.equal(after.loop.sessionRun,after.run);assert.equal(state.sessionRun,after.run);
  assert.ok(Number.isSafeInteger(cp.runId)&&cp.runId>0);assert.equal(cp.runId,after.loop.runId);assert.equal(state.runId,cp.runId);
  assert.ok(Number.isFinite(interval.begin)&&Number.isFinite(interval.recovered)&&interval.before.t<=interval.begin&&interval.begin<interval.recovered);
  assert.ok(after.t>=interval.recovered&&after.loop.t>=after.t&&state.t>=after.loop.t,'Paused checkpoint must follow the running return witness');
  assert.equal(after.loop.paused,false);assert.equal(state.action,'session');assert.equal(state.phase,'battle');
  assert.equal(state.saveState,'ready');assert.equal(state.paused,true);assert.equal(state.speed,0);
  assert.equal(state.hasCheckpoint,true);assert.equal(state.checkpointBlocked,false);assert.equal(state.pendingRunId,0);
  assert.equal(saved.pendingDefeat,null);assert.equal(state.wallet,saved.credits,'Durable balance must match its paused checkpoint witness');
  assert.ok(Number.isSafeInteger(e.completedWave)&&e.completedWave>0&&e.completedWave>=after.completedWave);
  assert.equal(e.wave,e.completedWave,'A saved checkpoint names its completed cohort');
  assert.equal(state.completedWave,e.completedWave);assert.equal(state.checkpointWave,e.completedWave);assert.equal(state.wave,e.completedWave+1);
  assert.ok(Number.isSafeInteger(e.tick)&&e.tick>0&&Number.isSafeInteger(state.tick)&&state.tick>=e.tick&&state.tick>=after.tick);
  assert.ok(['last-stand-waves-v1','last-stand-waves-v2'].includes(e.rulesVersion));assertWaveStateEdition(state,saved);assertWaveStateEdition(after.loop,saved);assert.equal(state.profileVersion,e.rulesVersion);assert.equal(after.loop.profileVersion,e.rulesVersion);
  assert.equal(state.activeTier,e.tier);assert.equal(after.loop.activeTier,e.tier);
  assert.equal(state.fittingId,WAVE_FITTINGS[e.fitting]);assert.equal(state.fittingId,after.fitting);
  assert.equal(state.cannonDamage,e.committedCannonDamage);assert.equal(state.cannonDamage,after.loop.cannonDamage);
  assert.equal(saved.history.current?.runId,cp.runId);assert.equal(saved.history.current.highestClearedWave,e.completedWave);
  return true;
}

export function assertWaveSavePreserved(before,after) {
  assertIdleWaveSave(before);assertIdleWaveSave(after);
  assert.ok(after.revision>=before.revision,'Profile revision cannot roll back');
  assert.ok(after.research.revision>=before.research.revision,'Research revision cannot roll back');
  assert.ok(after.research.lastObservedUtcMilliseconds>=before.research.lastObservedUtcMilliseconds,'Qualification requires a stable host clock');
  assert.ok(after.research.revision-before.research.revision<=after.revision-before.revision);
  const project=r=>{const {revision,lastObservedUtcMilliseconds,...rest}=r;return rest;};
  assert.deepEqual(project(after.research),project(before.research),'Idle clock cannot alter research');
  assert.deepEqual({...after,revision:before.revision,research:before.research},before,
    'Clock reconciliation cannot rewrite the checkpoint, history, wallet, upgrades or unlocks');
  return true;
}

export function validateWaveAbandonSave({before,after}) {
  assertIdleWaveSave(before);assertIdleWaveSave(after);assert.ok(before.checkpoint);
  assert.equal(after.checkpoint,null);assert.equal(after.lastFinalizedRunId,before.checkpoint.runId);
  assert.ok(after.revision>before.revision,'Finalization is a durable transaction');
  const prior=before.history,current=prior.current,history=after.history,final=history.recent?.at(-1);
  assert.ok(current&&final);assert.equal(current.runId,before.checkpoint.runId);
  assert.equal(history.current,null);assert.equal(history.lastFinalizedRunId,current.runId);
  assert.equal(final.finishReason,'abandon');assert.equal(final.runId,current.runId);
  const measured=['activeMilliseconds','pausedMilliseconds','closedMilliseconds','speedMilliseconds'];
  const stable=record=>Object.fromEntries(Object.entries(record).filter(([key])=>!measured.includes(key)&&key!=='finishReason'));
  assert.deepEqual(stable(final),stable(current),'Abandon cannot change banked history or frozen build context');
  for(const key of measured.slice(0,3))assert.ok(Number.isSafeInteger(final[key])&&final[key]>=current[key]);
  assert.equal(final.speedMilliseconds.length,10);
  final.speedMilliseconds.forEach((value,index)=>assert.ok(Number.isSafeInteger(value)&&value>=current.speedMilliseconds[index]));
  assert.equal(final.speedMilliseconds.reduce((sum,value)=>sum+value,0),final.activeMilliseconds);
  assert.deepEqual(history.recent,[...prior.recent,final].slice(-20),'Append exactly one bounded run summary');
  const aggregate=(old,tier)=>({tier,runs:(old?.runs??0)+1,bestWave:Math.max(old?.bestWave??0,final.highestClearedWave),
    ...Object.fromEntries(['activeMilliseconds','repeatableSalvage','milestoneSalvage','researchBonusSalvage'].map(key=>[key,(old?.[key]??0)+final[key]]))});
  assert.deepEqual(history.lifetime,aggregate(prior.lifetime,0));
  const tiers=prior.tiers.map(row=>row.tier===final.tier?aggregate(row,row.tier):row);
  if(!prior.tiers.some(row=>row.tier===final.tier))tiers.push(aggregate(null,final.tier));
  assert.deepEqual(history.tiers,tiers,'Finalization updates only the matching tier aggregate');
  assertWaveSavePreserved(before,{...after,checkpoint:before.checkpoint,lastFinalizedRunId:before.lastFinalizedRunId,history:before.history});
  return true;
}

export function validateWaveTerminal({before,result,saved,states,encounters,layouts,oracle}) {
  assert.ok(Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) && Number.isFinite(before.t) &&
    before.loop?.runId>0 && before.status==='Running' && before.loop.phase==='battle' &&
    !before.paused && !before.failed && !before.catchingUp);
  const {loop,hull,...encounterBefore}=before;
  assert.deepEqual(encounters.find(item=>item.load===before.load && item.timeOrigin===before.timeOrigin &&
    item.run===before.run && item.action===before.action && item.t===before.t),encounterBefore,'Actual pre-terminal observation required');
  assert.deepEqual(states.find(item=>item.load===loop.load && item.timeOrigin===loop.timeOrigin &&
    item.action===loop.action && item.t===loop.t),loop,'Actual pre-terminal loop state required');
  assert.equal(loop.load,before.load);assert.equal(loop.timeOrigin,before.timeOrigin);assert.equal(loop.scope,before.scope);
  assert.equal(loop.sessionRun,before.run);assert.equal(loop.tick,before.tick);assert.equal(hull,before.hp);
  assert.equal(loop.hull,before.hp);assert.equal(loop.kills,before.kills);assert.equal(loop.saveState,'ready');
  validateModelObservation(before,oracle);
  const same=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    Number.isFinite(item.t) && item.t>=before.t;
  const terminals=encounters.filter(item=>same(item) && item.run===before.run && item.action==='terminal');
  assert.equal(terminals.length,1,'Exactly one actual terminal tick required');
  const terminal=terminals[0];validateModelObservation(terminal,oracle);
  assert.equal(terminal.status,'Defeated');assert.equal(terminal.hp,0);
  assert.ok(terminal.t>before.t && !terminal.paused && !terminal.failed && !terminal.catchingUp);
  const run=states.filter(item=>same(item) && item.sessionRun===before.run);
  const staged=run.filter(item=>item.action==='defeat-staged');
  assert.equal(staged.length,1,'Exactly one durable terminal staging required');
  const stage=staged[0];assert.equal(stage.phase,'settling');assert.equal(stage.tick,terminal.tick);
  assert.equal(stage.kills,terminal.kills);assert.equal(stage.hull,0);assert.equal(stage.saveState,'ready');
  assert.equal(stage.runId,0);assert.equal(stage.pendingRunId,0);assert.equal(stage.hasCheckpoint,false);
  assert.ok(stage.t>=terminal.t && result.t>=stage.t && same(result));
  assert.equal(result.action,'result');assert.equal(result.sessionRun,before.run);
  assert.deepEqual(states.find(item=>same(item) && item.action==='result' && item.t===result.t),result,
    'Actual same-session result required');
  assert.equal(result.phase,'result');assert.equal(result.saveState,'ready');
  assert.equal(result.runId,0);assert.equal(result.pendingRunId,0);assert.equal(result.hasCheckpoint,false);
  assert.equal(result.wallet,stage.wallet);
  assertIdleWaveSave(saved);assert.equal(saved.checkpoint,null);assert.equal(saved.pendingDefeat,null);
  assert.equal(saved.lastFinalizedRunId,before.loop.runId);assert.equal(saved.credits,stage.wallet);
  const geometry=layouts.filter(item=>same(item) && item.phase==='settling' && item.t>=terminal.t && item.t<=result.t);
  assert.ok(geometry.length && geometry.every(item=>!item.controls.some(c=>c.name==='Claim' && c.active && c.interactable)),
    'No result acknowledgement before terminal feedback settles');
  const latestBank=states.filter(item=>same(item) && item.sessionRun===before.run && item.t<=stage.t && item.action==='wave-committed').at(-1)??before.loop;
  // A simultaneous final kill/death may bank that last cohort once in the same
  // atomic transaction, but still requires its actual same-session bank record.
  // Ordinary defeat cannot mint an additional death reward.
  assert.equal(latestBank.completedWave,terminal.completedWave,'Terminal requires the final completed wave bank');
  assert.equal(stage.wallet,latestBank.wallet,'Defeat cannot add a second wave reward');
  assert.ok(!run.some(item=>item.action==='claim'),'Wave runs cannot create a legacy reward claim');
  return {before,terminal,staged:stage,result,saved,layouts:geometry};
}


export function validateCheckpointResume({saved,resumed,stable,stored,observedClock}) {
  assertIdleWaveSave(saved);
  const checkpoint=saved.checkpoint,e=checkpoint?.encounter;
  assert.ok(checkpoint && e && e.hull>0,'A living saved boundary is required');
  assertWaveSavePreserved(saved,stored);
  for(const state of [resumed,stable]) {
    assertWaveRestoredState(state,saved);
    assert.equal(state.phase,'battle');assert.equal(state.saveState,'ready');
    assert.equal(state.runId,checkpoint.runId);assert.equal(state.activeTier,e.tier);
    assert.equal(state.fittingId,WAVE_FITTINGS[e.fitting]);
    assert.equal(state.profileVersion,e.rulesVersion);assert.equal(state.hasCheckpoint,true);
    assert.equal(state.checkpointBlocked,false);assert.equal(state.checkpointWave,e.completedWave);
    assert.equal(state.completedWave,e.completedWave);assert.equal(state.wave,e.completedWave+1);
    assert.equal(state.tick,e.tick);assert.equal(state.hull,e.hull);assert.equal(state.kills,e.kills);
    assert.equal(state.cannonDamage,e.committedCannonDamage);assert.equal(state.wallet,saved.credits);
    assert.equal(state.pendingRunId,0);assert.equal(state.paused,true);assert.equal(state.speed,0);
  }
  assert.equal(resumed.action,'resume');assert.ok(stable.t>=resumed.t+1000 && observedClock?.t>=stable.t,
    'Fresh actual state must remain paused after at least one real second');
  assert.equal(resumed.load,stable.load);assert.equal(resumed.timeOrigin,stable.timeOrigin);
  assert.equal(observedClock.timeOrigin,resumed.timeOrigin);
  return {saved,resumed,stable,stored,observedClock};
}

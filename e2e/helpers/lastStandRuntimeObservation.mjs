import assert from 'node:assert/strict';

// Explicit host adapters keep tests on the same implementation used by journeys.
const defaultHost={process,Date,Buffer};
export function createRuntimeObservation(overrides={}) {
  const {process,Date,Buffer}={...defaultHost,...overrides};


// Associate loop records with the session run actually preceding them in this
// console stream. Progression runId and EncounterSession.run are different
// domains; their deploy records below establish the association, not equality.
function implementation_retainRuntimeObservation(observation,load,scope,{states,encounters,hits,layouts,cues,callbackRecords}) {
  if(observation.text.includes('ST_ENC_CALLBACK ')) {
    assert.ok(Array.isArray(callbackRecords),'Callback observations require their dedicated owner');
    callbackRecords.push({...JSON.parse(observation.text.split('ST_ENC_CALLBACK ')[1].split('\n')[0]),
      t:observation.t,timeOrigin:observation.timeOrigin,load,scope});
  }
  for(const [tag,items] of [['ST_LS_STATE ',states],['ST_ENC_STATE ',encounters],['ST_LS_HIT ',hits],['ST_LS_HUD_LAYOUT ',layouts]]) {
    if(!observation.text.includes(tag))continue;
    const item={...JSON.parse(observation.text.split(tag)[1].split('\n')[0]),
      t:observation.t,timeOrigin:observation.timeOrigin,load,scope};
    if(tag==='ST_LS_STATE ') {
      const session=encounters.at(-1);
      item.sessionRun=session?.load===load && session.timeOrigin===observation.timeOrigin ? session.run : null;
    }
    items.push(item);
  }
  if(observation.text.includes('ST_LS_AUDIO event='))cues.push({...observation,load,scope});
}


async function implementation_observeRuntimePair({encounters,states,load,clock,wait,check,options={}}) {
  const initial=await clock(),deadline=Date.now()+8000;
  const documentRecord=item=>item?.load===load && item.timeOrigin===initial.timeOrigin;
  const loopRun=item=>item?.runId || item?.pendingRunId || 0;
  let detail;
  while(true) {
    const now=await clock(),latest=encounters.at(-1),current=states.at(-1);
    check(Number.isFinite(now.t) && Number.isFinite(now.timeOrigin) && now.timeOrigin===initial.timeOrigin && now.t>=initial.t,
      'coherent observation document clock',{initial,now});
    const encounter=options.status || options.action ? encounters.findLast(item=>documentRecord(item) &&
      (options.status===undefined || item.status===options.status) && (options.action===undefined || item.action===options.action) &&
      (options.paused===undefined || item.paused===options.paused) && item.run===latest?.run && item.t>=(options.minT??0)) : latest;
    const deployment=encounters.findLast(item=>documentRecord(item) && item.run===encounter?.run && item.action==='deploy');
    const deployedState=deployment && states.find(item=>documentRecord(item) && item.sessionRun===deployment.run &&
      ['deploy','resume'].includes(item.action) && item.tick===deployment.tick && item.t>=deployment.t && item.runId>0);
    const state=states.findLast(item=>documentRecord(item) && item.sessionRun===encounter?.run && item.tick===encounter?.tick &&
      item.t>=encounter.t && loopRun(item)===loopRun(current));
    detail={options,now,latest,current,encounter,state,deployment,deployedState};
    const identity=documentRecord(latest) && documentRecord(current) && documentRecord(encounter) && state &&
      Number.isInteger(encounter.run) && encounter.run>=0 && current.sessionRun===encounter.run &&
      (options.run===undefined || encounter.run===options.run) && encounter.t<=now.t && state.t<=now.t &&
      encounter.t>=(options.minT??0) && (options.action===undefined || encounter.action===options.action) &&
      (options.paused===undefined || encounter.paused===options.paused);
    // Active streams report at second boundaries. An older active report must
    // await a real new pair; immutable Pause/Fitting and requested action/terminal
    // witness retain their actual event clock without inventing a fresh stamp.
    const fresh=encounter && (options.action!==undefined || encounter.paused || encounter.status!=='Running' || now.t-encounter.t<=1000);
    const runBound=encounter?.status==='Fitting' || (deployedState && loopRun(state)===deployedState.runId);
    if(identity && fresh && runBound) {
      check(encounter.hp===state.hull && encounter.kills===state.kills && encounter.paused===state.paused &&
        (options.status!==undefined || encounter.paused===current.paused),
        'coherent actual loop/session observation counters',detail);
      return {...encounter,hull:state.hull,loop:state};
    }
    if(now.t-initial.t>=8000 || Date.now()>=deadline) {
      check(false,'coherent actual loop/session observation pair absent within bounded wait',detail);
      throw new Error('Actual runtime observation pair absent');
    }
    await wait(40);
  }
}


function implementation_sameDocument(before, after) {
  for (const item of [before,after]) {
    assert.ok(Number.isFinite(item?.t) && Number.isFinite(item.timeOrigin), 'Invalid observation clock');
    const maximum=Number.isInteger(item.wave) && item.wave>0 ? 2147483647 : 3600;
    assert.ok(Number.isSafeInteger(item.tick) && item.tick>=0 && item.tick<=maximum, 'Invalid observed tick');
  }
  assert.equal(after.load,before.load,'Background observation crossed documents');
  assert.equal(after.timeOrigin,before.timeOrigin,'Background observation clock changed');
  assert.equal(after.run,before.run,'Background observation crossed runs');
  assert.ok(after.t>=before.t,'Observation clock moved backward');
}

function implementation_nativeIntervalEvents(kind,before,after,events) {
  assert.ok(['blur','hidden'].includes(kind),'Unknown background interval');
  const admitted=events.filter(e=>e.load===before.load && e.timeOrigin===before.timeOrigin && e.t>=before.t && e.t<=after.t);
  assert.ok(admitted.some(e=>kind==='blur' ? e.kind==='blur' && !e.hidden && !e.focused :
    e.kind==='visibilitychange' && e.hidden && !e.focused), 'Missing separate native background focus/visibility event');
  assert.ok(admitted.some(e=>!e.hidden && e.focused && ['focus','visibilitychange'].includes(e.kind)),
    'Missing native foreground recovery event');
}

function implementation_elapsedTicks(before,after) {
  sameDocument(before,after);
  if(isWaveObservation(before) || isWaveObservation(after))return validateAdmittedClock(before,after);
  const expected=(after.t-before.t)/50, actual=after.tick-before.tick;
  // Fractional carry at two observed fixed-step boundaries is below one tick.
  assert.ok(actual>0 && Math.abs(actual-expected)<=1.01, 'Background elapsed tick reconciliation differs');
  assert.ok(!after.paused && !after.catchingUp,'Background continuation paused or retained unresolved debt');
  assert.ok(Number.isInteger(after.callbackSteps) && after.callbackSteps>=0 && after.callbackSteps<=128,
    'Background callback step budget exceeded');
}

function implementation_isWaveObservation(item){return Number.isInteger(item?.wave) && item.wave>0 || /^last-stand-waves-v[12]:/.test(item?.rules??'');}

function implementation_validateAdmittedClock(before,after) {
  sameDocument(before,after);
  for(const item of [before,after]){
    assert.match(item.rules??'',/^last-stand-waves-v[12]:/);assert.ok(Number.isInteger(item.wave) && item.wave>0);
    assert.equal(item.scope,'healthy');assert.equal(item.status,'Running');
    assert.equal(item.paused,false);assert.equal(item.catchingUp,false);assert.equal(item.failed,false);
    assert.equal(item.selectedSpeed,1);assert.equal(item.effectiveSpeed,1);
    assert.ok(Number.isFinite(item.clockTimestamp) && item.clockTimestamp>=0 &&
      Number.isFinite(item.clockPending) && item.clockPending>=0 && item.clockPending<.05,
      'Active wave observation requires its actual admitted clock and sub-step carry');
    assert.ok(Number.isInteger(item.callbackSteps) && item.callbackSteps>=0 && item.callbackSteps<=128,
      'Background callback step budget exceeded');
  }
  assert.equal(after.rules,before.rules);
  const elapsed=after.clockTimestamp-before.clockTimestamp,ticks=after.tick-before.tick;
  assert.ok(elapsed>0 && ticks>0 && Math.abs(ticks*.05-(elapsed+before.clockPending-after.clockPending))<=1e-6,
    'Admitted elapsed time, fixed ticks and retained carry differ');
  return {basis:'admitted-clock/v1',elapsed_ms:elapsed*1000,ticks,initial_carry:before.clockPending,final_carry:after.clockPending};
}

function implementation_waveIntervalEvents(before,after,events) {
  return events.filter(item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    item.globalTarget===true && ['blur','focus','visibilitychange'].includes(item.kind) && item.t>=before.t && item.t<=after.t);
}

const MODEL_FIELDS=['tick','hp','kills','spawned','cannon','launcher','healed','closeHits','rangedHits','alive','status'];

function implementation_validateModelObservation(observed,oracle) {
  assert.ok(oracle && Object.hasOwn(oracle,observed.tick),'Source-bound model oracle tick absent');
  const expected=oracle[observed.tick];
  if(expected.rulesVersion){
    assert.ok(observed.rules?.startsWith(expected.rulesVersion+':'),'Source oracle rules differ');
    assert.equal(observed.contentVersion,expected.contentVersion,'Source oracle content differs');
    assert.equal(observed.economyVersion,expected.economyVersion,'Source oracle economy differs');
    for(const key of ['mortarDamage','railgunDamage'])assert.equal(observed[key],expected[key],'Source oracle effect differs: '+key);
  }
  for(const key of MODEL_FIELDS)assert.equal(observed[key],expected[key],'Source-bound model '+key+' differs');
  if(Object.hasOwn(expected,'mortar'))for(const key of ['scattergun','mortar','railgun'])
    assert.equal(observed[key],expected[key],'Source-bound armament '+key+' differs');
  if(Object.hasOwn(expected,'wave'))for(const key of ['wave','completedWave'])
    assert.equal(observed[key],expected[key],'Source-bound wave '+key+' differs');
}

const sameDeploymentDocument=(item,deployed)=>item.load===deployed.load && item.timeOrigin===deployed.timeOrigin && item.scope===deployed.scope;

function implementation_cannonDeployment(deployed,encounters,oracle){
  assert.ok(Number.isSafeInteger(deployed.load) && deployed.load>0 && Number.isFinite(deployed.timeOrigin) && deployed.timeOrigin>0 &&
    Number.isFinite(deployed.t) && deployed.t>=0 && deployed.scope==='healthy' &&
    Number.isSafeInteger(deployed.runId) && Number.isSafeInteger(deployed.sessionRun),
    'Cannon proof requires explicit current document, scope and run identities');
  assert.ok(deployed.action==='deploy' && deployed.phase==='battle' && deployed.saveState==='ready' &&
    ['last-stand-waves-v1','last-stand-waves-v2'].includes(deployed.profileVersion) && deployed.runId>0 && deployed.sessionRun>0 && deployed.tick===0 &&
    deployed.activeTier===1 && deployed.fittingId==='repair' && [20,30].includes(deployed.cannonDamage),
    'First cannon proof requires its actual current repair deployment');
  const models=encounters.filter(item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun && item.action==='deploy');
  assert.ok(models.length===1 && models[0].t<=deployed.t && models[0].tick===0 && models[0].fitting==='repair' &&
    models[0].rules.startsWith(deployed.profileVersion+':'),'First cannon proof requires its raw same-run model deployment');
  validateModelObservation(models[0],oracle);
}

function implementation_cannonCallback(item,deployed,records){
  const group=records.filter(row=>sameDeploymentDocument(row,deployed) && row.run===deployed.sessionRun && row.id===item.id);
  const starts=group.filter(row=>row.action==='begin'),ends=group.filter(row=>row.action==='end');
  assert.ok(starts.length===1 && ends.length===1,'Cannon evidence requires one complete actual callback');
  const begin=starts[0],end=ends[0];
  assert.ok(Number.isSafeInteger(begin.id) && begin.id>0 && Number.isSafeInteger(begin.fromTick) && begin.fromTick>=0,
    'Cannon callback requires its actual positive identity and integral tick');
  assert.ok([begin,end].every(row=>['t','timestamp','previousTimestamp','elapsed','priorPending','pending'].every(key=>
    Number.isFinite(row[key]) && row[key]>=0) && row.timestamp>=row.previousTimestamp &&
    Math.abs(row.elapsed-(row.timestamp-row.previousTimestamp))<=1e-9) &&
    begin.priorPending===end.priorPending,'Cannon callback clocks and retained carry must be finite, monotonic and consistent');
  assert.ok(begin.t>=deployed.t && begin.t<=item.t && item.t<=end.t && begin.fromTick===end.fromTick &&
    begin.tick===begin.fromTick && end.tick===begin.fromTick+end.steps && Number.isInteger(end.steps) && end.steps>0 && end.steps<=128 &&
    begin.fromTick<item.tick && item.tick<=end.tick && begin.timestamp===end.timestamp &&
    begin.previousTimestamp===end.previousTimestamp,'Cannon evidence must belong to its actual bounded run callback');
  return {begin,end,group};
}

async function implementation_observeFirstCannonImpact({deployed,start,hits,encounters,callbackRecords,oracle,until}){
  cannonDeployment(deployed,encounters,oracle);
  const expected=Object.values(oracle).find(row=>row.cannon>0);
  assert.ok(expected?.cannon===1 && oracle[expected.tick-1]?.cannon===0,'First cannon event absent from source-bound oracle');
  const hit=await until(hits,start,item=>sameDeploymentDocument(item,deployed) && item.t>=deployed.t,45);
  assert.ok(hit.tick===expected.tick && hit.cannonDamage===deployed.cannonDamage && hit.kills===expected.kills &&
    hit.firstFoeHull===Math.max(0,30-deployed.cannonDamage),'First authoritative cannon impact differs from deployment/oracle');
  await until(callbackRecords,0,item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun &&
    item.action==='end' && item.t>=hit.t && item.fromTick<hit.tick && item.tick>=hit.tick,8);
  const starts=callbackRecords.filter(item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun &&
    item.action==='begin' && item.t>=deployed.t && item.t<=hit.t && item.fromTick<hit.tick);
  const begin=starts.at(-1);assert.ok(begin,'First impact has no authoritative callback');
  cannonCallback({...hit,id:begin.id},deployed,callbackRecords);
  assert.equal(hits.slice(start).filter(item=>sameDeploymentDocument(item,deployed) && item.t>=deployed.t && item.tick===hit.tick).length,1,
    'First authoritative impact cannot be duplicated');
  return hit;
}

async function implementation_observeFreshCannonAudio({deployed,encounters,callbackRecords,cues,oracle,until}){
  cannonDeployment(deployed,encounters,oracle);
  const current=item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun && item.t>=deployed.t;
  const cannon=await until(callbackRecords,0,item=>current(item) && item.action==='cue' && item.cue==='cannon' && item.played &&
    callbackRecords.some(next=>current(next) && next.action==='cue' && next.id===item.id && next.tick===item.tick && next.ordinal===item.ordinal+1 && next.played) &&
    callbackRecords.some(end=>current(end) && end.id===item.id && end.action==='end'),45);
  const {begin,end,group}=cannonCallback(cannon,deployed,callbackRecords);
  const a=oracle[cannon.tick-1],b=oracle[cannon.tick];
  assert.ok(a && b && b.cannon-a.cannon===1 && [0,1].includes(b.kills-a.kills),'Played cannon must match an actual oracle event');
  assert.ok(Number.isSafeInteger(cannon.ordinal) && cannon.ordinal>0 &&
    group.filter(item=>item.action==='cue' && item.ordinal===cannon.ordinal).length===1,
    'Played cannon requires one unique identified admission');
  const companion=group.filter(item=>item.action==='cue' && item.ordinal===cannon.ordinal+1);
  assert.equal(companion.length,1,'Played cannon needs one admitted impact/destruction companion');
  const attempts=[cannon,companion[0]],expected=['cannon',b.kills>a.kills?'destruction':'impact'];
  assert.ok(begin.focused && !begin.applicationPaused && !begin.paused && !begin.failed && begin.priorPending<.05 && begin.elapsed<=.5 && end.elapsed<=.5,
    'Fresh cannon sound cannot come from hidden, paused or retained-debt callbacks');
  const events=attempts.map((item,index)=>{
    assert.ok(item.cue===expected[index] && item.played===true && item.reason==='played' && item.tick===cannon.tick && item.fromTick===begin.fromTick &&
      item.timestamp===begin.timestamp && item.previousTimestamp===begin.previousTimestamp && item.steps===item.tick-item.fromTick &&
      item.steps>=1 && item.steps<=10 && item.timestamp-item.previousTimestamp<=.5 && Number.isFinite(item.admittedAt) &&
      item.admittedAt>=item.timestamp && item.admittedAt-item.previousTimestamp<=.5 && item.t>=begin.t && item.t<=end.t,
      'Cannon/impact audio requires its fresh actual playback admission');
    const next=group.filter(row=>row.action==='cue' && row.t>item.t).sort((x,y)=>x.t-y.t)[0];
    const played=cues.filter(row=>sameDeploymentDocument(row,deployed) && row.t>=item.t && row.t<=(next?.t??end.t) &&
      row.text.trim()==='ST_LS_AUDIO event='+item.cue);
    assert.equal(played.length,1,'Each admitted sound requires one actual played-event observation');return played[0];
  });
  assert.ok(cannon.t<=events[0].t && events[0].t<=companion[0].t && companion[0].t<=events[1].t &&
    companion[0].admittedAt>=cannon.admittedAt,'Played cannon and companion must retain actual chronological admission and log order');
  return {begin:Math.max(deployed.t,events[0].t-500),end:events[1].t+750,deployed,callback:{begin,end},attempts,events};
}

function implementation_validateSettlingTransition({before,result,states,layouts,encounters,oracle}) {
  assert.ok(Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) && Number.isFinite(before.t) &&
    before.status==='Running' && !before.paused && !before.failed && !before.catchingUp &&
    before.loop?.phase==='battle' && before.loop.runId>0 && before.loop.wallet===0,
    'Settling requires the actual current unfinished battle');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const {loop,hull,...original}=before;
  assert.deepEqual(encounters.find(item=>current(item) && item.run===before.run && item.t===before.t && item.action===before.action),original,
    'Settling starting observation differs from actual telemetry');
  assert.deepEqual(states.find(item=>current(item) && item.t===loop.t && item.action===loop.action),loop,
    'Settling starting loop differs from actual telemetry');
  validateModelObservation(before,oracle);
  assert.ok(result && current(result) && result.sessionRun===before.run && result.action==='result' &&
    result.phase==='result' && Number.isFinite(result.t) && result.t>before.t && result.runId===0 &&
    result.pendingRunId===loop.runId && result.wallet===0 && result.saveState==='ready',
    'Settling requires one saved pending manual result without an award');
  assert.deepEqual(states.find(item=>current(item) && item.action==='result' && item.t===result.t),result,
    'Settling result differs from actual telemetry');
  const terminals=encounters.filter(item=>current(item) && item.run===before.run && item.action==='terminal' &&
    item.t>=before.t && item.t<result.t);
  assert.equal(terminals.length,1,'Settling requires one actual terminal');const terminal=terminals[0];
  assert.ok(terminal.status==='Defeated' && !terminal.paused && !terminal.failed && !terminal.catchingUp,
    'Settling terminal is not eligible');validateModelObservation(terminal,oracle);
  const interval=states.filter(item=>current(item) && item.t>=terminal.t && item.t<=result.t);
  assert.ok(interval.length && interval.every(item=>item.sessionRun===before.run && item.runId===0 &&
    item.pendingRunId===loop.runId && item.wallet===0 && !['claim','purchase','deploy','redeploy'].includes(item.action)),
    'Settling awarded or performed an automatic action');
  const staged=interval.filter(item=>item.action==='defeat-staged');
  assert.ok(staged.length===1 && staged[0].phase==='settling' && staged[0].tick===terminal.tick,
    'Settling requires unique current-run staging');
  // Layout is emitted just before its staging state. Anchor it to the actual
  // terminal, rather than requiring the opposite log-notification order.
  const observed=layouts.filter(item=>current(item) && item.phase==='settling' && item.t>=terminal.t && item.t<result.t);
  assert.ok(observed.length && observed.every(item=>Array.isArray(item.controls) &&
    item.controls.some(control=>control.name==='Claim') &&
    !item.controls.some(control=>control.name==='Claim' && control.active && control.interactable)) &&
    observed.some(item=>item.controls.some(control=>control.name==='SpeedRate' && control.active && control.interactable)),
    'Settling layout absent or Claim enabled before the manual result');
  return {before,terminal,staged:staged[0],result,layouts:observed};
}

function implementation_validateBackgroundInterval({kind,before,after,events,oracle}) {
  const clock=elapsedTicks(before,after),observedEvents=clock?waveIntervalEvents(before,after,events):events;
  nativeIntervalEvents(kind,before,after,observedEvents);
  assert.equal(before.status,'Running','Background interval must start with an active model');
  assert.equal(after.status,'Running','Use terminal ownership oracle for terminal intervals');
  validateModelObservation(before,oracle);validateModelObservation(after,oracle);
  return {kind,elapsed_ms:after.t-before.t,ticks:after.tick-before.tick,events:observedEvents,...(clock?{clock,before,after}:{})};
}

function implementation_validateExplicitPause({before,paused,returned,resumed,after,events,oracle}) {
  sameDocument(before,paused);sameDocument(paused,returned);sameDocument(returned,resumed);
  assert.ok(paused.paused && returned.paused && paused.reason==='user' && returned.reason==='user',
    'Explicit Pause changed on foreground return');
  assert.ok(returned.t-paused.t>=10000,'Explicit Pause requires ten seconds away');
  for(const key of ['tick','hull','kills','terminalElapsed']) {
    assert.equal(returned[key],paused[key],'Explicit Pause changed '+key);
    assert.equal(resumed[key],paused[key],'Resume counted paused '+key);
  }
  // Unity can acknowledge focus while the tab is still hidden. The frozen
  // paused model sample need not follow visibility, but actual visible return
  // must precede the user's measured Resume. Counters stay bound above.
  const clock=elapsedTicks(resumed,after),observedEvents=clock?waveIntervalEvents(paused,resumed,events):events;
  nativeIntervalEvents('hidden',paused,resumed,observedEvents);
  if(clock)for(const item of [paused,returned,resumed]){
    assert.equal(item.scope,resumed.scope);assert.equal(item.rules,resumed.rules);
    assert.ok(Number.isFinite(item.clockTimestamp) && item.clockTimestamp>=paused.clockTimestamp && item.clockTimestamp<=resumed.clockTimestamp);
    assert.equal(item.clockPending,resumed.clockPending,'Pause and Resume preserve the admitted fractional carry');
  }
  validateModelObservation(paused,oracle);validateModelObservation(after,oracle);
  return {paused_ms:resumed.t-paused.t,resumed_ticks:after.tick-resumed.tick,...(clock?{clock,before,paused,returned,resumed,after,events:observedEvents}:{})};
}

function implementation_validateTerminalOwnership({runId,beforeWallet,states,pending,claimed,controls}) {
  assert.ok(Number.isInteger(runId) && runId>0,'Terminal run identity absent');
  const staged=states.filter(s=>s.action==='defeat-staged'),result=states.filter(s=>s.action==='result'),claims=states.filter(s=>s.action==='claim');
  assert.equal(staged.length,1,'Duplicate or missing terminal staging');
  assert.equal(result.length,1,'Duplicate or missing terminal result');
  assert.equal(claims.length,1,'Duplicate or missing manual Claim');
  assert.ok(states.indexOf(staged[0])<states.indexOf(result[0]) && states.indexOf(result[0])<states.indexOf(claims[0]),
    'Terminal/Claim ordering differs');
  for(const s of states.filter(s=>states.indexOf(s)<states.indexOf(claims[0]))) {
    assert.equal(s.wallet,beforeWallet,'Premature terminal award');
    assert.equal(s.pendingRunId,runId,'Terminal pending identity changed');
    assert.equal(s.saveState,'ready','Terminal persistence not ready');
  }
  assert.equal(pending?.pendingDefeat?.runId,runId,'Persisted pending run differs');
  assert.equal(pending.pendingDefeat.reward,1,'Persisted terminal reward differs');
  assert.equal(claims[0].wallet,beforeWallet+1,'Manual Claim wallet differs');
  assert.equal(claims[0].pendingRunId,0,'Claim left a pending award');
  assert.equal(claims[0].saveState,'ready','Claim persistence not ready');
  assert.equal(claimed?.credits,beforeWallet+1,'Persisted Claim wallet differs');
  assert.ok(!claimed.pendingDefeat,'Claim persisted a repeated award');
  assert.ok(!controls.some(c=>c.name==='Claim' && c.active && c.interactable),'Repeated Claim remains available');
  assert.ok(!states.some(s=>['deploy','purchase'].includes(s.action)),'Automatic terminal action');
  return {runId,staging:staged.length,results:result.length,claims:claims.length};
}

function implementation_validateNoReplayAudio({energy,cues}) {
  assert.ok(Number.isInteger(energy?.samples) && energy.samples>=5,'Empty or insufficient rendered audio evidence');
  assert.ok(Number.isFinite(energy.maximum_rms) && energy.maximum_rms>=0 && energy.maximum_rms<.0005,
    'Rendered background/return audio must be silent without replay');
  assert.ok(Array.isArray(cues) && cues.length===0,'Background/return replay cue observed');
  return energy;
}


// A native return can precede its bookkeeping mark by several fresh model
// callbacks. Admit those cues only against the current source-bound model;
// the real away span and the gap before the first eligible cue remain silent.
function implementation_validateAwayAudioReturn({kind,before,begin,recovered,ms,events,cues,states,encounters,callbackRecords,oracle}) {
  assert.ok(['blur','hidden'].includes(kind) && Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) &&
    [before.t,begin,recovered,ms].every(Number.isFinite) && ms>0 && before.t<=begin && begin<recovered,
    'Invalid native audio interval identity/clock');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const global=events.filter(e=>current(e) && e.globalTarget===true && ['blur','focus','visibilitychange'].includes(e.kind));
  assert.ok(global.every(e=>Number.isFinite(e.t) && typeof e.hidden==='boolean' && typeof e.focused==='boolean'),
    'Invalid global native audio event');
  const loss=global.find(e=>before.t<=e.t && e.t<=begin && !e.focused &&
    (kind==='blur'?e.kind==='blur' && !e.hidden:e.kind==='visibilitychange' && e.hidden));
  let returned,modelFocusReturn;
  if(loss && kind==='blur')returned=global.find(e=>e.t>loss.t && e.t<=recovered && e.kind==='focus' && e.focused && !e.hidden);
  if(loss && kind==='hidden'){
    // Browser focus and visibility notifications may arrive in either order.
    // Require both genuine global witnesses, then their coherent completion.
    const eligible=global.filter(e=>e.t>loss.t && e.t<=recovered);
    const focus=eligible.find(e=>e.kind==='focus' && e.focused),visible=eligible.find(e=>e.kind==='visibilitychange' && !e.hidden);
    if(focus && visible)returned=eligible.find(e=>e.t>=Math.max(focus.t,visible.t) && e.focused && !e.hidden);
  }
  assert.ok(loss && returned,'Current global native audio loss/return boundary absent');
  // Unity may acknowledge focus while the document is still hidden. Only the
  // model boundary uses that actual focus; cues still wait for visible return.
  modelFocusReturn=kind==='blur'?returned:global.findLast(e=>e.t>loss.t && e.t<=returned.t && e.kind==='focus' && e.focused);
  assert.ok(modelFocusReturn && !global.some(e=>e.t>modelFocusReturn.t && e.t<=returned.t && !e.focused),
    'Current uninterrupted native focus boundary absent');
  assert.ok(returned.t-loss.t>=ms,'Actual native unfocused audio span is shorter than the declared interval');
  const observed=cues.filter(c=>current(c) && c.t>=loss.t+200 && c.t<=recovered);
  assert.ok(observed.every(c=>Number.isFinite(c.t)),'Invalid current audio cue clock');
  const returnCues=observed.filter(c=>c.t>=returned.t),callbacks=[];
  const waveRun=['last-stand-waves-v1','last-stand-waves-v2'].includes(before.loop?.profileVersion);
  // The current controller retains its wave profile after ReturnToInspection
  // removes the model. Its finalized result has explicit absent-clock/run fields;
  // it is a silent lifecycle boundary, never an archived combat callback lane.
  const idleModel=item=>current(item) && item.run===before.run && item.status==='Fitting' &&
    item.rules==='playable-prototype-v1' && item.tick===0 && item.wave===0 && item.completedWave===0 &&
    item.locked===false && item.clockTimestamp===-1 && item.clockPending===-1 && item.callbackSteps===0 &&
    item.paused===false && item.failed===false && item.catchingUp===false;
  const idleLoop=(item,phase)=>current(item) && item.sessionRun===before.run && item.profileVersion===before.loop.profileVersion &&
    item.phase===phase && item.saveState==='ready' && item.runId===0 && item.pendingRunId===0 &&
    item.activeTier===0 && item.hasCheckpoint===false && item.tick===0 && item.wave===0 && item.completedWave===0;
  const idleWaveResult=waveRun && idleModel(before) && idleLoop(before.loop,'result') && before.loop.t>=before.t;
  assert.equal(waveRun,typeof before.rules==='string' && /^last-stand-waves-v[12]:/.test(before.rules) || idleWaveResult,
    'Native audio interval wave profile and model rules disagree');
  if(idleWaveResult){
    const during=item=>current(item) && item.t>=before.t && item.t<=recovered;
    const {loop,hull,...model}=before;
    assert.deepEqual(encounters.find(item=>current(item) && item.run===before.run && item.t===before.t && item.action===before.action),model,
      'Idle interval requires its actual model observation');
    assert.deepEqual(states.find(item=>current(item) && item.t===loop.t && item.action===loop.action),loop,
      'Idle interval requires its actual paired result observation');
    const results=states.filter(item=>current(item) && item.sessionRun===before.run && item.action==='result' && item.t<=recovered);
    assert.ok(results.length===1 && idleLoop(results[0],'result') && Number.isFinite(results[0].t) &&
      results[0].t<=loop.t && loop.t<=loss.t,'Idle interval requires the first raw finalized result before native loss');
    const finalized=results[0];
    // ReturnToInspection emits its cleared model and synchronous session HUD
    // before the controller publishes result. Retain and prove that prefix;
    // a later research refresh must not hide any subsequent activity.
    const idleState=item=>item.t<finalized.t ? item.action==='session' && idleLoop(item,'settling') &&
      item.hull===model.hp && item.kills===0 && item.paused===false : idleLoop(item,'result');
    assert.ok(Array.isArray(callbackRecords) && !callbackRecords.some(during) && !cues.some(during) &&
      encounters.filter(during).every(idleModel) && states.filter(during).every(idleState),
      'Finalized idle result cannot admit combat callbacks, cues or an active lifecycle');
  }
  const attempts=waveRun?(callbackRecords??[]).filter(c=>current(c) && c.action==='cue' && c.t>=returned.t && c.t<=recovered):[];
  const observations=waveRun?attempts:returnCues;
  const playedByAttempt=new Map();
  if(waveRun){
    // A fully omitted silent group must not erase model events. Only fresh,
    // foreground, non-indebted callbacks with an unmuted source state qualify
    // for this obligation; old background debt is still deliberately discarded.
    for(const begin of (callbackRecords??[]).filter(c=>current(c) && c.run===before.run && c.action==='begin' &&
      c.t>=returned.t && c.t<=recovered && c.focused===true && c.applicationPaused===false && c.paused===false &&
      c.failed===false && c.elapsed>=0 && c.elapsed<=.5 && c.priorPending>=0 && c.priorPending<.05)){
      const end=callbackRecords.find(c=>current(c) && c.run===begin.run && c.id===begin.id && c.action==='end' && c.t<=recovered);
      const prior=states.findLast(c=>current(c) && c.sessionRun===begin.run && c.tick===begin.fromTick && c.t<=begin.t);
      const a=oracle[begin.fromTick],b=oracle[end?.tick];
      if(end && end.steps>0 && end.steps<=10 && prior?.phase==='battle' && prior.muted===false && prior.saveState==='ready' && a && b &&
        (b.cannon>a.cannon || b.launcher>a.launcher || (b.scattergun??0)>(a.scattergun??0) ||
         b.closeHits>a.closeHits || b.rangedHits>a.rangedHits || b.status==='Defeated'))
        assert.ok(attempts.some(c=>c.id===begin.id && c.run===begin.run),'Current-wave model callback is missing all cue decisions');
    }
    const played=attempts.filter(c=>c.played===true);
    assert.equal(played.length,returnCues.length,'Current-wave playback requires one exact cue decision per played line');
    for(const [i,attempt] of played.entries()){
      const cue=returnCues[i],next=attempts[attempts.indexOf(attempt)+1];
      assert.ok(cue.text.match(/^ST_LS_AUDIO event=(\w+)\s*$/)?.[1]===attempt.cue && cue.t>=attempt.t &&
        (!next || cue.t<=next.t),'Played cue order/name differs from its playback decision');
      playedByAttempt.set(attempt,cue);
    }
  }
  if(observations.length) {
    const resumed=encounters.find(e=>current(e) && e.run===before.run && e.action==='visibility' &&
      e.t>=modelFocusReturn.t && e.t<=observations[0].t && e.focused && !e.applicationPaused);
    assert.ok(resumed && !resumed.paused && !resumed.failed && !resumed.catchingUp,
      'Current reconciled foreground model boundary absent');
    validateModelObservation(resumed,oracle);
    const finalizedWave=s=>s.runId===0 && s.pendingRunId===0 && s.hasCheckpoint===false &&
      s.profileVersion===before.loop.profileVersion && s.activeTier===before.loop.activeTier && s.fittingId===before.fitting;
    if(waveRun)assert.ok(before.wave>0 && before.rules?.startsWith(before.loop.profileVersion+':') && resumed.rules===before.rules,
      'Current wave callback requires its exact model profile');
    const runLoops=states.filter(s=>current(s) && s.sessionRun===before.run &&
      (waveRun && s.action==='defeat-staged'?finalizedWave(s):(s.runId || s.pendingRunId)===before.loop.runId) && s.t<=recovered &&
      ['session','defeat-staged'].includes(s.action));
    const loops=runLoops.filter(s=>s.t>=resumed.t);
    assert.ok(Array.isArray(callbackRecords),'Return cues require actual callback admission records');
    const records=callbackRecords.filter(c=>current(c) && c.run===before.run && c.t<=recovered);
    const groups=new Map();
    for(const cue of observations) {
      const admitted=records.findLast(c=>c.action==='begin' && c.t<=cue.t && (!waveRun || c.id===cue.id));
      const ends=admitted?records.filter(c=>c.action==='end' && c.id===admitted.id):[];
      const completed=ends[0];
      assert.ok(admitted && completed && ends.length===1 && Number.isInteger(admitted.id) && admitted.id>0 &&
        records.filter(c=>c.action==='begin' && c.id===admitted.id).length===1 &&
        admitted.t>=returned.t && completed.t>=cue.t && completed.t>=admitted.t &&
        !records.some(c=>c.action==='begin' && c.t>admitted.t && c.t<completed.t),
        'Return cue lacks a unique current foreground callback');
      for(const key of ['fromTick','timestamp','previousTimestamp','elapsed','priorPending','speed'])
        assert.equal(completed[key],admitted[key],'Callback admission changed: '+key);
      assert.ok([admitted.t,completed.t,admitted.timestamp,admitted.previousTimestamp,admitted.elapsed,
        admitted.priorPending,admitted.pending,completed.pending,admitted.speed,admitted.age,completed.age].every(Number.isFinite) &&
        admitted.previousTimestamp>=0 && admitted.elapsed>=0 && admitted.elapsed<=.5 && admitted.age>=0 && completed.age>=admitted.age &&
        Math.abs(admitted.timestamp-admitted.previousTimestamp-admitted.elapsed)<1e-7 &&
        admitted.priorPending>=0 && admitted.priorPending<.05 && admitted.speed>0 &&
        admitted.pending>0 && admitted.pending<=admitted.priorPending+admitted.elapsed*admitted.speed+1e-7 &&
        completed.pending>=0 && (completed.pending<.05 || oracle[completed.tick]?.status==='Defeated') &&
        Number.isInteger(admitted.fromTick) && admitted.fromTick>=resumed.tick && admitted.tick===admitted.fromTick && admitted.steps===0 &&
        Number.isInteger(completed.steps) && completed.steps>0 && completed.steps<=10 &&
        completed.tick===admitted.fromTick+completed.steps &&
        Math.abs(admitted.pending-completed.pending-completed.steps*.05)<1e-7 &&
        (waveRun || (admitted.elapsed+admitted.age)*1000+cue.t-admitted.t<=500) &&
        [admitted,completed].every(c=>c.focused===true && c.applicationPaused===false && c.paused===false && c.failed===false),
        'Return cue lacks a fresh eligible foreground model callback');
      const previous=runLoops.findLast(s=>s.tick===admitted.fromTick && s.t<=admitted.t);
      const next=loops.find(s=>s.tick===completed.tick && s.t>=cue.t && s.t<=completed.t);
      const terminals=next?.action==='defeat-staged' && previous?encounters.filter(e=>current(e) &&
        e.run===before.run && e.action==='terminal' && e.tick===next.tick && e.t>admitted.t && e.t<=next.t):[];
      const terminal=terminals[0];
      assert.ok(next && previous && next.tick>previous.tick && previous.tick>=resumed.tick &&
        previous.phase==='battle' && !previous.paused && !previous.muted && previous.saveState==='ready' &&
        previous.cannonDamage===before.loop.cannonDamage && previous.hull===oracle[previous.tick]?.hp &&
        previous.kills===oracle[previous.tick]?.kills &&
        (next.phase==='battle' || terminal && next.phase==='settling') && !next.paused && !next.muted && next.saveState==='ready' &&
        next.cannonDamage===before.loop.cannonDamage,
        'Return callback lacks current source-bound before/after model states');
      if(terminal) {
        // AdvanceAt retains elapsed after the final combat step. Wave runs
        // finalize before PlayDefeat; archived runs retain PendingDefeat.
        assert.ok(terminals.length===1 && previous.phase==='battle' && oracle[previous.tick]?.status==='Running' &&
          terminal.status==='Defeated' && terminal.focused && !terminal.applicationPaused && !terminal.paused &&
          !terminal.failed && !terminal.catchingUp && Number.isFinite(terminal.terminalElapsed) &&
          terminal.terminalElapsed>=0 && terminal.terminalElapsed<=.48 &&
          Number.isInteger(terminal.callbackSteps) && terminal.callbackSteps>0 && terminal.callbackSteps<=128 &&
          terminal.callbackSteps===next.tick-previous.tick && next.runId===0 && before.loop.runId>0 &&
          (waveRun?finalizedWave(next) && terminal.rules===before.rules && terminal.wave>0:next.pendingRunId===before.loop.runId) &&
          loops.filter(s=>s.action==='defeat-staged' && s.tick===next.tick).length===1,
          'Return defeat lacks a unique current eligible terminal/staging transition');
        validateModelObservation(terminal,oracle);
      }
      const admission=encounters.findLast(e=>current(e) && e.run===before.run && e.t<=cue.t);
      assert.ok(admission?.focused && !admission.applicationPaused && !admission.paused && !admission.failed &&
        !admission.catchingUp,'Background/catch-up return cue observed');
      assert.ok(oracle[next.tick] && next.hull===oracle[next.tick].hp && next.kills===oracle[next.tick].kills,
        'Return callback differs from current source-bound model');
      const group=groups.get(admitted)??{previous,next,terminal,admitted,completed,cues:[],attempts:[]};
      if(waveRun){
        assert.ok(cue.run===before.run && Number.isInteger(cue.ordinal) && cue.ordinal===group.attempts.length+1 &&
          (!cue.played || playedByAttempt.get(cue)?.t<=completed.t) &&
          cue.fromTick===admitted.fromTick && cue.timestamp===admitted.timestamp && cue.previousTimestamp===admitted.previousTimestamp &&
          Number.isInteger(cue.tick) && cue.tick>admitted.fromTick && cue.tick<=completed.tick &&
          Number.isInteger(cue.steps) && cue.steps===cue.tick-admitted.fromTick &&
          (!group.attempts.length || cue.tick>=group.attempts.at(-1).tick && cue.t>=group.attempts.at(-1).t) &&
          Number.isFinite(cue.admittedAt) && cue.admittedAt>=0 && cue.admittedAt>=admitted.timestamp+admitted.age &&
          cue.admittedAt<=completed.timestamp+completed.age &&
          (!group.attempts.length || cue.admittedAt>=group.attempts.at(-1).admittedAt) &&
          (cue.played===true && cue.reason==='played' && cue.admittedAt-cue.previousTimestamp<=.5 ||
           cue.played===false && cue.reason==='expired' && cue.admittedAt-cue.previousTimestamp>.5),
          'Invalid, stale or foreign current-wave cue decision');
        group.attempts.push(cue);if(cue.played)group.cues.push(playedByAttempt.get(cue));
      }else group.cues.push(cue);
      groups.set(admitted,group);
    }
    for(const {previous,next,terminal,admitted,completed,cues:actual,attempts:decisions} of groups.values()) {
      const expected=[];
      for(let tick=previous.tick+1;tick<=next.tick;tick++) {
        const a=oracle[tick-1],b=oracle[tick];assert.ok(a && b,'Return model event tick absent');
        const cannon=b.cannon-a.cannon,weapons=cannon+b.launcher-a.launcher,killed=b.kills-a.kills;
        assert.ok(cannon>=0 && weapons>=killed && killed>=0,'Invalid source-bound return model event counters');
        const tickNames=[...Array(cannon).fill('cannon'),...Array(killed).fill('destruction'),
          ...Array(weapons-killed+b.closeHits-a.closeHits+b.rangedHits-a.rangedHits).fill('impact')];
        if(waveRun){
          // This maintained return lane qualifies repair/launcher model counters.
          // A burst oracle must expose individual target events before it can qualify Scattergun audio.
          assert.equal((b.scattergun??0)-(a.scattergun??0),0,'Return cue oracle lacks individual Scattergun target events');
          const witnessed=decisions.filter(c=>c.tick===tick && c.cue!=='defeat').map(c=>c.cue);
          assert.deepEqual(witnessed.sort(),[...tickNames].sort(),'Cue decision differs from its exact model tick');
        }
        expected.push(...tickNames);
      }
      const names=waveRun?decisions.map(c=>c.cue):actual.map(c=>c.text.match(/^ST_LS_AUDIO event=(\w+)\s*$/)?.[1]);
      const ordered=waveRun?decisions:actual;
      if(terminal) {
        assert.ok(names.at(-1)==='defeat' && ordered.at(-1).t>=terminal.t &&
          ordered.slice(0,-1).every(c=>c.t<=terminal.t), 'Return terminal cue ordering differs');
        expected.push('defeat');
      }
      assert.deepEqual(names.sort(),expected.sort(),'Unmatched, stale or duplicate background/return replay cue');
      callbacks.push({from:previous.tick,to:next.tick,t:next.t,admitted,completed,cues:actual,...(waveRun?{attempts:decisions}:{})});
    }
  }
  const end=returnCues[0]?.t??recovered;
  return {begin:loss.t+200,end,cues:observed.filter(c=>c.t<end || !returnCues.length),
    boundary:{kind,loss,returned,model_focus_return:modelFocusReturn,bookkeeping_recovered:recovered,unfocused_ms:returned.t-loss.t,callbacks}};
}
  const retainRuntimeObservation=overrides.retainRuntimeObservation??implementation_retainRuntimeObservation;
  const observeRuntimePair=overrides.observeRuntimePair??implementation_observeRuntimePair;
  const sameDocument=overrides.sameDocument??implementation_sameDocument;
  const nativeIntervalEvents=overrides.nativeIntervalEvents??implementation_nativeIntervalEvents;
  const elapsedTicks=overrides.elapsedTicks??implementation_elapsedTicks;
  const isWaveObservation=overrides.isWaveObservation??implementation_isWaveObservation;
  const validateAdmittedClock=overrides.validateAdmittedClock??implementation_validateAdmittedClock;
  const waveIntervalEvents=overrides.waveIntervalEvents??implementation_waveIntervalEvents;
  const validateModelObservation=overrides.validateModelObservation??implementation_validateModelObservation;
  const cannonDeployment=overrides.cannonDeployment??implementation_cannonDeployment;
  const cannonCallback=overrides.cannonCallback??implementation_cannonCallback;
  const observeFirstCannonImpact=overrides.observeFirstCannonImpact??implementation_observeFirstCannonImpact;
  const observeFreshCannonAudio=overrides.observeFreshCannonAudio??implementation_observeFreshCannonAudio;
  const validateSettlingTransition=overrides.validateSettlingTransition??implementation_validateSettlingTransition;
  const validateBackgroundInterval=overrides.validateBackgroundInterval??implementation_validateBackgroundInterval;
  const validateExplicitPause=overrides.validateExplicitPause??implementation_validateExplicitPause;
  const validateTerminalOwnership=overrides.validateTerminalOwnership??implementation_validateTerminalOwnership;
  const validateNoReplayAudio=overrides.validateNoReplayAudio??implementation_validateNoReplayAudio;
  const validateAwayAudioReturn=overrides.validateAwayAudioReturn??implementation_validateAwayAudioReturn;
  return {retainRuntimeObservation,observeRuntimePair,sameDocument,nativeIntervalEvents,elapsedTicks,isWaveObservation,validateAdmittedClock,waveIntervalEvents,MODEL_FIELDS,validateModelObservation,sameDeploymentDocument,cannonDeployment,cannonCallback,observeFirstCannonImpact,observeFreshCannonAudio,validateSettlingTransition,validateBackgroundInterval,validateExplicitPause,validateTerminalOwnership,validateNoReplayAudio,validateAwayAudioReturn};
}
const defaultOwner=createRuntimeObservation();
export const {retainRuntimeObservation,observeRuntimePair,sameDocument,nativeIntervalEvents,elapsedTicks,validateAdmittedClock,waveIntervalEvents,validateModelObservation,observeFirstCannonImpact,observeFreshCannonAudio,validateSettlingTransition,validateBackgroundInterval,validateExplicitPause,validateTerminalOwnership,validateNoReplayAudio,validateAwayAudioReturn}=defaultOwner;

// Console ownership stays live across reloads; malformed observations retain the
// first failure instead of escaping an event callback or borrowing another run.
export function bindJourneyConsole({page,messages,readIdentity,records,trace,retainObserverFailure,
  retainObservation=retainRuntimeObservation,now=Date.now}) {
  page.on('console',message=>{
    const {load,scope}=readIdentity();
    const raw=message.text(),record={type:message.type(),text:raw,location:message.location(),load,scope,time:now()};
    messages.push(record);
    try {
      if(raw.startsWith('ST_TEST_RUNTIME '))retainObservation(JSON.parse(raw.slice('ST_TEST_RUNTIME '.length)),load,scope,records);
      else if(raw.startsWith('ST_TEST_INPUT '))trace.push({...JSON.parse(raw.slice('ST_TEST_INPUT '.length)),load,scope});
    } catch(error) {retainObserverFailure(record,error);}
  });
}

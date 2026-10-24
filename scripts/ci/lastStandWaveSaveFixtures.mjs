// Invented reader-test inputs only. Never a save seed, player report or receipt.
const researchKeys=['gameSpeed','salvageRecovery','researchSpeed','scrapLogistics'];
const aggregate=(run,tier)=>({tier,runs:run?1:0,bestWave:run?.highestClearedWave??0,
  activeMilliseconds:run?.activeMilliseconds??0,repeatableSalvage:run?.repeatableSalvage??0,
  milestoneSalvage:run?.milestoneSalvage??0,researchBonusSalvage:run?.researchBonusSalvage??0});
export function idleWaveFields({runId=1,wave=1,finalized=false}={}) {
  const run={runId,tier:1,fitting:'repair',economyVersion:'research-farming-economy-v2',
    startContext:'inert-context',endContext:'inert-context',highestClearedWave:wave,finishReason:finalized?'defeat':'',
    sinceUpdate:false,activeMilliseconds:50,pausedMilliseconds:0,closedMilliseconds:0,repeatableSalvage:wave,
    milestoneSalvage:0,researchBonusSalvage:0,speedMilliseconds:[0,50,0,0,0,0,0,0,0,0]};
  return {version:5,revision:3,recoveryRemainder:0,research:{version:1,catalogVersion:'research-v1',revision:1,
    lastObservedUtcMilliseconds:1000,nextProjectIdentity:1,completionSequence:0,
    completedRanks:Object.fromEntries(researchKeys.map(key=>[key,0])),partials:Object.fromEntries(researchKeys.map(key=>[key,null])),
    slots:[{active:null,queued:null},{active:null,queued:null}]},
    history:{version:1,lastFinalizedRunId:finalized?runId:0,current:finalized?null:run,
      recent:finalized?[run]:[],tiers:finalized?[aggregate(run,1)]:[],lifetime:aggregate(finalized?run:null,0)}};
}
export function abandonedWaveSave(before) {
  const result=structuredClone(before),run={...result.history.current,finishReason:'abandon'};
  result.revision++;result.checkpoint=null;result.lastFinalizedRunId=run.runId;
  result.history={version:1,lastFinalizedRunId:run.runId,current:null,recent:[run],tiers:[aggregate(run,1)],lifetime:aggregate(run,0)};
  return result;
}

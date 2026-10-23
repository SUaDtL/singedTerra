// Historical artifact entry and detached watchdog for this task's owned trees.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { admitEvidenceParent, startOwnedSupervisor, watchOwnedProcess, runLastStandShopJourney, lastStandJourneyTimeBudget, ownedProcessIdentity, finishOwnedSupervisorCleanup } from '../e2e/helpers/lastStandJourney.mjs';

if(process.argv[2]==='--watch-owner') {
  const path=resolve(process.argv[3]);admitEvidenceParent(path);
  const options=JSON.parse(readFileSync(path,'utf8'));assert.equal(options.path,path);
  await watchOwnedProcess(options);
} else if(process.argv[2]==='--shop-player') {
  assert.equal(process.argv.length,4,'Shop player requires exactly one fitting');
  const fitting=process.argv[3];assert.ok(['launcher','repair'].includes(fitting),'Unknown Shop fitting');
  const {chromium}=await import('@playwright/test');
  const result=await runLastStandShopJourney({chromium,fitting,
    baseURL:process.env.ST_SHOP_PLAYER_BASE_URL??'http://127.0.0.1:5203/'});
  console.log(`SHOP_PLAYER_RESULT=${result.path}`);
  process.exitCode=result.status==='pass'?0:1;
} else {
  const root=resolve(import.meta.dirname,'..');
  const output=join(admitEvidenceParent(),`artifact-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(output,{recursive:true});
  const argv=['node_modules/@playwright/test/cli.js','test','e2e/last-stand-playable-loop.spec.ts',
    '--reporter=json','--workers=1','--config=playwright.config.ts','--project=desktop-fine','--retries=0'];
  const report={status:'running',argv,output,owner:process.pid,cleanup:null};let stdout='',stderr='',supervisor,child,ownedRoot,code=1,timer;
  const budget=lastStandJourneyTimeBudget(process.platform,{served:Boolean(process.env.E2E_LIVE_URL)});
  try {
    child=spawn(process.execPath,argv,{cwd:root,env:{...process.env,VITE_BASE:'/singedTerra/',E2E_DENY_EXTERNAL_NETWORK:'1',
      LAST_STAND_ENTRYPOINT:'historical-python-artifact',LAST_STAND_EVIDENCE_PARENT:output},stdio:['ignore','pipe','pipe'],windowsHide:true});
    const finished=new Promise(done=>child.once('close',done));
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
    child.on('error',error=>{report.spawn_error=String(error);});
    const candidate=ownedProcessIdentity(child.pid);
    assert.equal(candidate.ppid,process.pid,'Owned runner child ancestry mismatch');
    assert.ok(typeof candidate.exe==='string' && candidate.exe.length>0,'Owned runner executable identity absent');
    ownedRoot=candidate;
    supervisor=startOwnedSupervisor(child,output,null,budget.supervisorMs,ownedRoot);
    const stop=async reason=>{report.reason=reason;try{report.cleanup=await supervisor.stop();}catch(error){report.cleanup_error=String(error);}};
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void stop(signal);});
    timer=setTimeout(()=>{void stop('runner-timeout');},budget.runnerMs);
    code=await finished;report.exit=code;report.status=code===0 && !report.reason?'pass':'failed';
  } catch(error){report.status='failed';report.error=String(error);}
  finally {
    clearTimeout(timer);
    try {
      if(supervisor)report.cleanup=await supervisor.stop();
      else if(ownedRoot)report.cleanup=await finishOwnedSupervisorCleanup({output,profile:null},[{...ownedRoot,depth:0}]);
    } catch(error){report.cleanup_error=String(error);report.status='failed';}
    writeFileSync(join(output,'playwright.json'),stdout);writeFileSync(join(output,'stderr.log'),stderr);
    writeFileSync(join(output,'runner-result.json'),JSON.stringify(report,null,2));
    console.log(`LAST_STAND_LOOP_EVIDENCE=${output}`);
    process.exitCode=report.status==='pass'?0:(code||1);
  }
}

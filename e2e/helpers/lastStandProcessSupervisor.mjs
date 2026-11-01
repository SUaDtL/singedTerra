import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openSync, writeFileSync, closeSync, renameSync, unlinkSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { stopOwnedProcessTree, removeOwnedProfile, sameProcess, processTable, collectOwnedDescendants } from './lastStandProcessOwnership.mjs';
import { join, relative } from 'node:path';
import { admitEvidenceParent, ROOT, delay } from './lastStandJourneyHost.mjs';
import { spawn } from 'node:child_process';

// Explicit host adapters keep tests on the same implementation used by journeys.
const defaultHost={randomUUID,openSync,writeFileSync,closeSync,renameSync,unlinkSync,stopOwnedProcessTree,removeOwnedProfile,readdirSync,join,readFileSync,existsSync,sameProcess,admitEvidenceParent,processTable,collectOwnedDescendants,spawn,ROOT,delay,relative,process,Date,Buffer};
export function createLastStandProcessSupervisor(overrides={}) {
  const {randomUUID,openSync,writeFileSync,closeSync,renameSync,unlinkSync,stopOwnedProcessTree,removeOwnedProfile,readdirSync,join,readFileSync,existsSync,sameProcess,admitEvidenceParent,processTable,collectOwnedDescendants,spawn,ROOT,delay,relative,process,Date,Buffer}={...defaultHost,...overrides};

function implementation_lastStandJourneyTimeBudget(host=process.platform,{served=false}={}) {
  assert.ok(['win32','linux'].includes(host),'Unsupported journey budget host');
  // Native qualification reached the hidden natural terminal at 28.5 minutes,
  // before loader/wasm and storage recovery matrices or final retention. Admit
  // 40 minutes total; individual action, gameplay and media guards stay fixed.
  const testMs=host==='win32'?2_400_000:3_600_000,startupMs=served?0:180_000;
  // Test/browser clocks start after webServer setup; the standalone owner
  // starts before it and must also admit owned-tree cleanup.
  // Software-rendered Linux Unity frames can occupy the page thread beyond
  // the Windows DOM allowance. Keep each read/capture bounded independently.
  return Object.freeze({testMs,startupMs,actionMs:host==='linux'?60_000:10_000,browserMs:testMs+40_000,
    runnerMs:testMs+startupMs+5_000,supervisorMs:testMs+startupMs+50_000,
    pythonMs:testMs+180_000+100_000});
}

function implementation_ownedSupervisorLifetimeLimit(host=process.platform) {
  return ['win32','linux'].includes(host)?lastStandJourneyTimeBudget(host).supervisorMs+10_000:640_000;
}

function implementation_publishOwnedSupervisorJson(path,value) {
  const text=JSON.stringify(value,null,2),pending=`${path}.pending-${randomUUID()}`;
  let fd,created=false;
  try {
    fd=openSync(pending,'wx');created=true;
    writeFileSync(fd,text);closeSync(fd);fd=undefined;
    renameSync(pending,path);
  } catch(error) {
    if(fd!==undefined)try{closeSync(fd);}catch{}
    if(created)try{unlinkSync(pending);}catch{}
    throw error;
  }
}

async function implementation_finishOwnedSupervisorCleanup(options,known) {
  const cleanup={tree:await stopOwnedProcessTree(known)};
  if(options.profile)removeOwnedProfile(options.profile);
  else {
    cleanup.profiles=[];
    const scan=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Evidence symlink refused');
      if(entry.isDirectory())scan(path);else if(entry.name==='browser-profile.json'){
        const receipt=JSON.parse(readFileSync(path,'utf8'));
        if(receipt.status==='removed' || !existsSync(receipt.profile))continue;
        assert.ok(cleanup.tree.known.some(item=>sameProcess(item,receipt.root)),'Profile browser ownership not in supervised tree');
        removeOwnedProfile(receipt.profile);cleanup.profiles.push({profile:receipt.profile,root:receipt.root,removed:true});
      }
    }};scan(options.output);
  }
  cleanup.profile_removed=options.profile?!existsSync(options.profile):null;return cleanup;
}

function implementation_startOwnedSupervisor(child, output, profile, lifetimeMs=640_000, expectedRoot) {
  assert.ok(Number.isInteger(lifetimeMs) && lifetimeMs>0 && lifetimeMs<=ownedSupervisorLifetimeLimit(),'Invalid owned lifetime');
  admitEvidenceParent(output);
  assert.ok(Number.isInteger(child.pid) && child.pid>0,'Owned spawn did not return a PID');
  const table=processTable(),root=table.find(item=>item.pid===child.pid),owner=table.find(item=>item.pid===process.pid);
  assert.ok(root && owner,'Owned process exited before supervision admission');
  assert.equal(root.ppid,owner.pid,'Owned child ancestry mismatch');
  assert.ok(typeof root.exe==='string' && root.exe.length>0 && typeof owner.exe==='string' && owner.exe.length>0,'Owned executable identity absent');
  if(expectedRoot)assert.ok(sameProcess(root,expectedRoot),'Owned child identity changed before supervision admission');
  const id=randomUUID().slice(0,8),path=join(output,`supervisor-${id}.json`);
  const options={root,owner,profile,output,lifetimeMs,path,known:collectOwnedDescendants(table,[{...root,depth:0}])};
  publishOwnedSupervisorJson(path,options);
  const watcher=spawn(process.execPath,[join(ROOT,'scripts/last-stand-playable-loop.mjs'),'--watch-owner',path],
    {detached:true,stdio:'ignore',windowsHide:true});watcher.unref();
  const resultPath=`${path}.result.json`,stopPath=`${path}.stop`;
  return {path,resultPath,root,stop:async()=>{
    try {
      writeFileSync(stopPath,'stop');const deadline=Date.now()+35_000;
      while(!existsSync(resultPath) && Date.now()<deadline)await delay(100);
      assert.ok(existsSync(resultPath),'Owned supervisor result absent');
      const result=JSON.parse(readFileSync(resultPath,'utf8'));
      assert.ok(sameProcess(result.root,options.root) && result.root.ppid===options.root.ppid,'Owned supervisor result root mismatch');
      assert.ok(sameProcess(result.owner,options.owner) && result.owner.ppid===options.owner.ppid,'Owned supervisor result owner mismatch');
      assert.equal(result.profile,options.profile,'Owned supervisor result profile mismatch');
      assert.equal(result.status,'stopped',`Owned cleanup failed: ${result.error}`);
      assert.ok(Array.isArray(result.tree?.remaining) && result.tree.remaining.length===0,'Owned supervisor result did not confirm complete cleanup');
      if(profile)assert.equal(result.profile_removed,true,'Owned supervisor result did not confirm profile removal');
      return result;
    } catch(error) {
      // The parent retains the original admitted identities even if the watcher
      // cannot retain observations or publish a complete result. Failure stays
      // failure after this bounded, identity-checked cleanup attempt.
      try{error.fallback_cleanup=await finishOwnedSupervisorCleanup(options,options.known);}
      catch(cleanup){error.cleanup_error=String(cleanup);}
      throw error;
    }
  }};
}

async function implementation_watchOwnedProcess(options) {
  admitEvidenceParent(options.output);
  assert.ok(relative(options.output,options.path).startsWith('supervisor-'),'Supervisor receipt containment failed');
  let known=options.known,reason='owner-exit',admitted=false,failure;const begin=Date.now(),result={status:'running',root:options.root,owner:options.owner,profile:options.profile};
  try {
    assert.equal(options.root.ppid,options.owner.pid,'Supervisor root was not created by its recorded owner');
    assert.ok(options.root.exe && options.owner.exe,'Owned executable identity absent');
    assert.ok(Number.isInteger(options.lifetimeMs) && options.lifetimeMs>0 && options.lifetimeMs<=ownedSupervisorLifetimeLimit(),'Invalid owned lifetime');
    admitted=true;
    while(true){const table=processTable();known=collectOwnedDescendants(table,known);
      publishOwnedSupervisorJson(`${options.path}.observed.json`,{known,observedAt:new Date().toISOString()});
      if(existsSync(`${options.path}.stop`)){reason='requested-stop';break;}
      if(!table.some(item=>sameProcess(item,options.owner)))break;
      if(!table.some(item=>sameProcess(item,options.root))){reason='root-exit';break;}
      if(Date.now()-begin>options.lifetimeMs){reason='timeout';break;}
      await delay(200);
    }
  } catch(error){failure=error;result.status='failed';result.error=String(error);result.known=known;}
  finally {
    result.reason=reason;
    if(admitted)try {
      Object.assign(result,await finishOwnedSupervisorCleanup(options,known));
      if(result.status!=='failed')result.status='stopped';
    } catch(error){failure??=error;result.status='failed';result.error??=String(error);result.cleanup_error=String(error);result.known=known;}
    try{publishOwnedSupervisorJson(`${options.path}.result.json`,result);}
    catch(error){if(failure){failure.publication_error=String(error);throw failure;}throw error;}
  }
}
  const lastStandJourneyTimeBudget=overrides.lastStandJourneyTimeBudget??implementation_lastStandJourneyTimeBudget;
  const ownedSupervisorLifetimeLimit=overrides.ownedSupervisorLifetimeLimit??implementation_ownedSupervisorLifetimeLimit;
  const publishOwnedSupervisorJson=overrides.publishOwnedSupervisorJson??implementation_publishOwnedSupervisorJson;
  const finishOwnedSupervisorCleanup=overrides.finishOwnedSupervisorCleanup??implementation_finishOwnedSupervisorCleanup;
  const startOwnedSupervisor=overrides.startOwnedSupervisor??implementation_startOwnedSupervisor;
  const watchOwnedProcess=overrides.watchOwnedProcess??implementation_watchOwnedProcess;
  return {lastStandJourneyTimeBudget,ownedSupervisorLifetimeLimit,publishOwnedSupervisorJson,finishOwnedSupervisorCleanup,startOwnedSupervisor,watchOwnedProcess};
}
const defaultOwner=createLastStandProcessSupervisor();
export const {lastStandJourneyTimeBudget,ownedSupervisorLifetimeLimit,publishOwnedSupervisorJson,finishOwnedSupervisorCleanup,startOwnedSupervisor,watchOwnedProcess}=defaultOwner;

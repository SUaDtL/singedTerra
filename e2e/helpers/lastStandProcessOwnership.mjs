import { powershell, delay } from './lastStandJourneyHost.mjs';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, readlinkSync, realpathSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';

export function processTable() {
  if(process.platform==='win32') return JSON.parse(powershell(`@(
    Get-CimInstance Win32_Process | Where-Object { $_.CreationDate -and $_.ExecutablePath } | ForEach-Object { [pscustomobject]@{
      pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; start=$_.CreationDate.ToUniversalTime().ToString('o'); exe=$_.ExecutablePath
    } }) | ConvertTo-Json -Compress`));
  assert.equal(process.platform,'linux','Owned process supervision requires Windows or Linux');
  return readdirSync('/proc').filter(name=>/^\d+$/.test(name)).flatMap(name=>{
    try {const stat=readFileSync(`/proc/${name}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
      let exe;try{exe=readlinkSync(`/proc/${name}/exe`);}catch{}
      return [{pid:Number(name),ppid:Number(fields[1]),start:fields[19],exe}];
    } catch {return [];}
  });
}

const hasProcessExecutable=identity=>typeof identity?.exe==='string' && identity.exe.length>0;

export const sameProcess=(left,right)=>hasProcessExecutable(left) && hasProcessExecutable(right) && left.pid===right.pid && left.start===right.start && left.exe===right.exe;

export function ownedProcessIdentity(pid) {
  assert.ok(Number.isInteger(pid) && pid>0,'Invalid owned PID');
  const identity=processTable().find(item=>item.pid===pid);assert.ok(identity,'Owned process identity absent');return identity;
}

// processTable supplies UTC Windows creation stamps or Linux monotonic start ticks.
// Keep their domains separate and retain every supplied fractional digit.
function processStartClock(start) {
  if(typeof start!=='string')return null;
  if(/^(0|[1-9]\d*)$/.test(start))return {domain:'linux-ticks',value:BigInt(start)};
  const stamp=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,7})Z$/.exec(start);
  if(!stamp)return null;
  const seconds=Date.parse(`${stamp[1]}.000Z`);
  if(!Number.isFinite(seconds) || new Date(seconds).toISOString().slice(0,19)!==stamp[1])return null;
  return {domain:'windows-utc',value:BigInt(seconds)*10000n+BigInt(stamp[2].padEnd(7,'0'))};
}

function bornUnderParent(child,parent) {
  const childClock=processStartClock(child.start),parentClock=processStartClock(parent.start);
  return childClock && parentClock && childClock.domain===parentClock.domain && childClock.value>=parentClock.value;
}

export function collectOwnedDescendants(table, known) {
  const identities=new Map(known.filter(item=>hasProcessExecutable(item) && (item.depth??0)===0).map(item=>[item.pid,item]));
  const adopt=(candidates,requireLiveParent)=>{
    let changed=true;
    while(changed){changed=false;for(const item of candidates){
      const parent=identities.get(item.ppid);
      if(parent && hasProcessExecutable(item) && !identities.has(item.pid) && bornUnderParent(item,parent) &&
        (!requireLiveParent || table.some(candidate=>sameProcess(candidate,parent)))) {
        identities.set(item.pid,{...item,depth:(parent.depth??0)+1});changed=true;
      }
    }};
  };
  // Revalidate retained ancestry before it reaches destructive selection. A
  // recorded valid parent can have exited; fresh adoption requires it live.
  adopt(known,false);adopt(table,true);return [...identities.values()];
}

export async function stopOwnedProcessTree(identities) {
  let known=identities,remaining=[];const stopped=[],deadline=Date.now()+15_000;
  do {
    const table=processTable();known=collectOwnedDescendants(table,known);
    remaining=known.filter(item=>table.some(current=>sameProcess(item,current)));
    if(!remaining.length)break;
    const targets=[...remaining].sort((a,b)=>(b.depth??0)-(a.depth??0));
    if(process.platform==='win32') {
      const encoded=Buffer.from(JSON.stringify(targets)).toString('base64');
      powershell(`$targets=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
        foreach($target in $targets){$current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$target.pid)
          if($current -and $current.CreationDate.ToUniversalTime().ToString('o') -eq $target.start -and $current.ExecutablePath -eq $target.exe){
            try {Stop-Process -Id $target.pid -Force -ErrorAction Stop}
            catch {$after=Get-CimInstance Win32_Process -Filter ('ProcessId='+$target.pid)
              if($after -and $after.CreationDate.ToUniversalTime().ToString('o') -eq $target.start -and $after.ExecutablePath -eq $target.exe){throw}}
          }}`);
    } else for(const target of targets) {
      if(processTable().some(item=>sameProcess(item,target)))try{process.kill(target.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
    stopped.push(...targets);await delay(150);
  } while(Date.now()<deadline);
  const table=processTable();remaining=known.filter(item=>table.some(current=>sameProcess(item,current)));
  assert.equal(remaining.length,0,'Owned process descendants remain');return {known,stopped,remaining};
}

export function removeOwnedProfile(profile) {
  const tempRoot=realpathSync(tmpdir()),target=resolve(profile),rel=relative(tempRoot,target);
  assert.ok(!isAbsolute(rel) && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith('st-ls-chrome-'),'Profile containment failed');
  if(!existsSync(target))return;
  assert.ok(!lstatSync(target).isSymbolicLink() && realpathSync(target)===target,'Profile resolved containment failed');
  if(process.platform==='win32') {
    const data=Buffer.from(JSON.stringify({target,tempRoot})).toString('base64');
    powershell(`$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'))|ConvertFrom-Json
      $target=(Resolve-Path -LiteralPath $data.target -ErrorAction Stop).Path
      if([IO.Path]::GetDirectoryName($target) -ne $data.tempRoot -or -not [IO.Path]::GetFileName($target).StartsWith('st-ls-chrome-')){throw 'Profile containment failed'}
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop`);
  } else rmSync(target,{recursive:true});
  assert.ok(!existsSync(target),'Owned profile remains');
}

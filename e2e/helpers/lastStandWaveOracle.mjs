import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyLastStandSource } from '../../scripts/assets/verify-last-stand-source.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const WAVE_ORACLE_SOURCES=Object.freeze(['EncounterModel.cs','EncounterBuildcraft.cs','EncounterSkills.cs','Content/LastStandSkillCatalog.cs','EncounterProfile.cs','LastStandTierCatalog.cs',
  'LastStandWaveCatalog.cs','LastStandRewardCatalog.cs','LastStandSelection.cs','LastStandUpgradeCatalog.cs','LastStandEconomyCatalog.cs','MechanicsShopModel.cs',
  'LastStandShopState.cs','LastStandRunClock.cs','LastStandSpeedPolicy.cs','Content/LastStandRunEdition.cs','Content/LastStandLoadout.cs','Content/LastStandEnemyCatalog.cs','EncounterFoeKind.cs','EncounterGeometry.cs']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileSha=path=>sha(readFileSync(path));

export const COMBAT_DEPTH_WAVE_EDITION=Object.freeze({rulesVersion:'last-stand-waves-v2',contentVersion:'last-stand-content-v2',economyVersion:'combat-depth-economy-v4'});
export const BUILDCRAFT_WAVE_EDITION=Object.freeze({rulesVersion:'last-stand-waves-v3',contentVersion:'last-stand-content-v3',economyVersion:'buildcraft-economy-v5'});
export const CURRENT_WAVE_EDITION=Object.freeze({rulesVersion:'last-stand-waves-v4',contentVersion:'last-stand-content-v4',economyVersion:'buildcraft-economy-v5'});
const RETAINED_ECONOMIES=['long-run-economy-v1','research-farming-economy-v2','research-farming-economy-v3'];
export function waveOracleProfileKeys(edition=CURRENT_WAVE_EDITION){
  const current=edition.rulesVersion===CURRENT_WAVE_EDITION.rulesVersion||edition.rulesVersion===BUILDCRAFT_WAVE_EDITION.rulesVersion;
  const depth=edition.rulesVersion===COMBAT_DEPTH_WAVE_EDITION.rulesVersion;
  if(current)assert.deepEqual(edition,edition.rulesVersion===BUILDCRAFT_WAVE_EDITION.rulesVersion?BUILDCRAFT_WAVE_EDITION:CURRENT_WAVE_EDITION,'Unsupported oracle edition');
  else if(depth)assert.deepEqual(edition,COMBAT_DEPTH_WAVE_EDITION,'Unsupported retained combat-depth edition');
  else {
    assert.ok(RETAINED_ECONOMIES.includes(edition.economyVersion),'Unsupported oracle economy');
    assert.deepEqual(edition,{rulesVersion:'last-stand-waves-v1',contentVersion:'last-stand-content-v1',economyVersion:edition.economyVersion},'Unsupported retained oracle edition');
  }
  return (current?[1,2,3,4,5,6]:depth?[1,2,3,4]:[1,2]).flatMap(tier=>(current?['repair','launcher','scattergun','mortar','railgun','arc','shield']:depth?['repair','launcher','scattergun','mortar','railgun']:['repair','launcher','scattergun'])
    .flatMap(fitting=>[20,30,40,50].map(damage=>`${tier}:${fitting}:${damage}`)));
}

export function parseWaveOracleCsv(raw,{edition,format='auto'}={}) {
  assert.ok(Buffer.isBuffer(raw),'Wave oracle requires observed raw output bytes');
  const bytes=raw.subarray(raw.subarray(0,3).equals(Buffer.from([239,187,191]))?3:0);
  const text=bytes.toString('utf8');
  assert.ok(text.endsWith('\r\n'),'Incomplete wave oracle output');
  const profiles={},counts={};
  // Each wire format retains an exact column count and edition mapping.
  const count=text.slice(0,text.indexOf('\r\n')).split(',').length;
  const detected=({17:1,23:2,32:3})[count];
  assert.ok(detected,'Unknown oracle field count');
  assert.ok(format==='auto'||[1,2,3].includes(format),'Unknown oracle format');
  if(format!=='auto')assert.equal(detected,format,'Oracle fields differ from declared format');
  const archived=detected===1,buildcraft=detected===3;
  edition??=buildcraft?CURRENT_WAVE_EDITION:archived?{rulesVersion:'last-stand-waves-v1',contentVersion:'last-stand-content-v1',economyVersion:'research-farming-economy-v3'}:COMBAT_DEPTH_WAVE_EDITION;
  assert.equal(['last-stand-waves-v3','last-stand-waves-v4'].includes(edition.rulesVersion),buildcraft,'Oracle format must match buildcraft or skills edition');
  if(archived)assert.equal(edition.rulesVersion,'last-stand-waves-v1','Archive format retains original rules');
  const identities=new Set(waveOracleProfileKeys(edition));
  for(const line of text.slice(0,-2).split('\r\n')) {
    const cells=line.split(',');
    assert.equal(cells.length,count,'Wave oracle field count');
    const [tier,fitting,damage,...rest]=cells,status=rest.pop();
    assert.ok(identities.has(`${tier}:${fitting}:${damage}`) && ['Running','Defeated'].includes(status),'Unknown wave oracle identity/status');
    assert.ok(rest.every(value=>/^(?:0|[1-9]\d*)$/.test(value)),'Wave oracle requires exact integers');
    const values=rest.map(Number);assert.ok(values.every(Number.isSafeInteger),'Wave oracle integer overflow');
    const [tick,hp,kills,spawned,cannon,launcher,scattergun,healed,closeHits,rangedHits,alive,wave,completedWave,mortar,railgun,
      mortarDamage,railgunDamage,nextMortarTick,nextRailgunTick,arc,arcDamage,shield,shieldCapacity,shieldRestored,shieldAbsorbed,nextArcTick,nextShieldRechargeTick,lastShieldHitTick]=values;
    const key=`${tier}:${fitting}:${damage}`,profile=profiles[key]??={};
    assert.equal(tick,counts[key]??0,'Missing or duplicate wave oracle tick');counts[key]=tick+1;
    assert.ok(wave>=1 && completedWave<=wave && (completedWave===wave || completedWave===wave-1), 'Invalid wave boundary');
    assert.ok(kills<=spawned && spawned-kills===alive,'Wave cohort accounting mismatch');
    assert.ok((status==='Defeated')===(hp===0),'Wave terminal hull mismatch');
    if(tick>0) {
      const previous=profile[tick-1];
      assert.equal(previous.status,'Running','Rows after terminal');
      assert.ok(wave>=previous.wave && wave<=previous.wave+1 && completedWave>=previous.completedWave &&
        completedWave<=previous.completedWave+1,'Wave transition discontinuity');
    }
    profile[tick]={tick,hp,kills,spawned,cannon,launcher,scattergun,healed,closeHits,rangedHits,alive,wave,completedWave,status};
    if(!archived)Object.assign(profile[tick],{mortar,railgun,mortarDamage,railgunDamage,nextMortarTick,nextRailgunTick,...edition});
    if(buildcraft){
      assert.ok(arcDamage>=16&&shield<=shieldCapacity&&lastShieldHitTick<=tick,'Invalid buildcraft oracle state');
      Object.assign(profile[tick],{arc,arcDamage,shield,shieldCapacity,shieldRestored,shieldAbsorbed,nextArcTick,nextShieldRechargeTick,lastShieldHitTick,
        fitting,secondaryFitting:'',armorPiercing:0,areaControl:0,fieldEngineering:0});
    }
  }
  assert.deepEqual(Object.keys(profiles).sort(),[...identities].sort(),'Incomplete wave oracle profile set');
  return profiles;
}

// This compiles and steps the actual owner. It is a fresh source-bound oracle,
// not a second JavaScript combat implementation or a replaced historical fixture.
// Browser qualification always requires the inspected export binding. Local
// development tests may explicitly request source-only proof, which is labeled.
export function buildWaveOracle(output,{requireExport=true,maximumTicks=12000,edition=CURRENT_WAVE_EDITION}={}) {
  const expectedProfiles=waveOracleProfileKeys(edition),format=[CURRENT_WAVE_EDITION.rulesVersion,BUILDCRAFT_WAVE_EDITION.rulesVersion].includes(edition.rulesVersion)?3:2;
  assert.ok(Number.isInteger(maximumTicks) && maximumTicks>=100 && maximumTicks<=24000,'Wave oracle tick bound');
  const directory=join(output,'wave-model-oracle');mkdirSync(directory,{recursive:false});
  const scripts=join(ROOT,'campaign-unity/Unity/Assets/Scripts');
  const sources=WAVE_ORACLE_SOURCES.map(name=>join(scripts,name));
  const sourceLF=Object.fromEntries(WAVE_ORACLE_SOURCES.map(name=>[name,sha(readFileSync(join(scripts,name),'utf8').replace(/\r\n|\r/g,'\n'))]));
  let exportBinding=null;
  if(requireExport) {
    const verified=verifyLastStandSource(ROOT);
    for(const [name,hash] of Object.entries(sourceLF))assert.deepEqual(verified.receipt.sourceFiles[`Unity/Assets/Scripts/${name}`],
      {mode:'lf-text',sha256:hash},'Wave oracle source differs from the inspected player export');
    exportBinding={build:verified.receipt.build,sourceInventorySha256:verified.manifest.source.sourceInventorySha256,
      receiptSha256:verified.manifest.source.receiptSha256,sourceLockSha256:verified.manifest.source.sourceLockSha256,
      manifestSha256:fileSha(join(ROOT,'client/public/last-stand/asset-manifest.json'))};
  }
  assert.ok(['win32','linux'].includes(process.platform),'Supported host compiler required');
  const monoRoot='C:/Program Files/Unity 6000.3.27f2/Editor/Data/MonoBleedingEdge';
  const mono=process.platform==='linux'?'/usr/bin/mono':join(monoRoot,'bin/mono.exe');
  const compiler=process.platform==='linux'?'/usr/lib/mono/4.5/mcs.exe':join(monoRoot,'lib/mono/msbuild/Current/bin/Roslyn/csc.exe');
  const driver=join(directory,'Program.cs'),executable=join(directory,'WaveOracle.exe');
  writeFileSync(driver,`using System;using SingedTerra.Encounter;using SingedTerra.LastStand;
class Program {static void Main(){
 Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.Out.NewLine="\\r\\n";
 System.Threading.Thread.CurrentThread.CurrentCulture=System.Globalization.CultureInfo.InvariantCulture;
 var edition=LastStandRunEdition.Resolve("${edition.rulesVersion}","${edition.contentVersion}","${edition.economyVersion}");
 foreach(var tier in edition.Tiers)foreach(var fitting in edition.Fittings)foreach(int damage in new[]{20,30,40,50}){
  if(!tier.Playable||!fitting.Playable)continue;
  var model=new EncounterModel(fitting.Mechanic,EncounterProfile.ForTier(tier.Id,edition),damage);
  EncounterCheckpoint boundary=model.CaptureCheckpoint();
  string name=fitting.Id;
  while(true){
   Console.WriteLine(string.Join(",",tier.Id,name,damage,model.Tick,model.Hull,model.Kills,model.Spawned,model.CannonShots,model.LauncherShots,model.ScattergunShots,model.Restored,model.CloseHits,model.RangedHits,model.ActiveCount,model.Wave,model.CompletedWave,model.MortarShots,model.RailgunShots,model.CurrentMortarDamage,model.CurrentRailgunDamage,boundary?.NextMortarTick??0,boundary?.NextRailgunTick??0${format===3?",model.ArcShots,model.CurrentArcDamage,model.Shield,model.CurrentShieldCapacity,model.ShieldRestored,model.ShieldAbsorbed,boundary?.Buildcraft?.NextArcTick??0,boundary?.Buildcraft?.NextShieldRechargeTick??0,boundary?.Buildcraft?.LastShieldHitTick??0":""},model.Status));
   if(model.Status!=EncounterStatus.Running || model.Tick>=${maximumTicks})break;
   model.Step();boundary=model.AwaitingWaveCommit?model.CaptureCheckpoint():null;
   if(model.AwaitingWaveCommit && model.Status==EncounterStatus.Running)model.ContinueAfterCheckpoint();
  }
 }
}}`);
  const before=Object.fromEntries([mono,compiler,...sources,driver].map(path=>[path,fileSha(path)]));
  const commands=[];
  function execute(name,args) {
    const result=spawnSync(mono,args,{cwd:ROOT,timeout:120000,encoding:null,maxBuffer:64*1024*1024});
    writeFileSync(join(directory,`${name}.stdout`),result.stdout??Buffer.alloc(0));
    writeFileSync(join(directory,`${name}.stderr`),result.stderr??Buffer.alloc(0));
    commands.push({argv:[mono,...args],exit:result.status,error:result.error?String(result.error):null,
      stdoutSha256:sha(result.stdout??Buffer.alloc(0)),stderrSha256:sha(result.stderr??Buffer.alloc(0))});
    writeFileSync(join(directory,'commands.json'),JSON.stringify({inputs:before,commands},null,2));
    assert.ok(!result.error && result.status===0,`Wave oracle ${name} failed; inspect retained stdout/stderr`);
    return result.stdout;
  }
  execute('compile',[compiler,'-nologo',...(process.platform==='linux'?['-langversion:7.2']:[]),`-out:${executable}`,...sources,driver]);
  const raw=execute('run',[executable]);const profiles=parseWaveOracleCsv(raw,{edition,format});
  assert.deepEqual(Object.keys(profiles).sort(),expectedProfiles.sort());
  for(const [path,hash] of Object.entries(before))assert.equal(fileSha(path),hash,'Wave oracle inputs changed during execution');
  const binding={format:'st-last-stand-wave-model-oracle/'+format,edition,host:process.platform,source_lf_sha256:sourceLF,
    commands,inputs:before,executable_sha256:fileSha(executable),output_sha256:sha(raw),maximumTicks,
    profiles:Object.keys(profiles),rows:Object.values(profiles).reduce((n,p)=>n+Object.keys(p).length,0),
    export_binding:exportBinding,qualification:requireExport?'compiled actual wave model bound to inspected player export':'source-only; no player export qualification'};
  writeFileSync(join(directory,'binding.json'),JSON.stringify(binding,null,2));
  return {profiles,binding};
}

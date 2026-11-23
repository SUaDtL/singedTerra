import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {admitFixtures,assertFittingCallout,verifyFixtureAfter,PRESENTATION_FIXTURE_SOURCES} from '../last-stand-combat-depth-journey.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t,current=false){
  const root=mkdtempSync(join(tmpdir(),'st-inert-presentation-reader-'));t.after(()=>rmSync(root,{recursive:true}));
  const dir=join(root,'fixtures');mkdirSync(dir);const sourceSha256={};
  for(const name of current?PRESENTATION_FIXTURE_SOURCES:Array.from({length:20},(_,i)=>'source'+i)){
    mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),'inert');sourceSha256[name]=sha('inert');}
  const stamp=Date.now(),raw=JSON.stringify({version:current?8:7,research:{lastObservedUtcMilliseconds:stamp}});
  const cases=(current?['roster-ready','tier2-before-elite','tier5-before-commander','legacy-v4']:['roster-ready','tier2-before-elite','legacy-v4']).map(id=>{
    const commander=id==='tier5-before-commander',version=id==='legacy-v4'?4:current?8:7,
      value={...JSON.parse(raw),version,...commander?{checkpoint:{encounter:{tier:5,wave:99,completedWave:99,tick:1000,hull:100}}}:{}};
    const bytes=JSON.stringify(value);
    writeFileSync(join(dir,id+'.json'),bytes);return {id,savePath:id+'.json',saveSha256:sha(bytes),version,createdUtcMilliseconds:stamp,
      ...commander?{tier:5,completedWave:99,nextWave:100,hasCheckpoint:true,productionReloadValidated:true,nextCohortContainsCommander:true,
        commanderObservedTick:1100,simulatedRuns:[{tier:5,completedWave:99,committedBoundaries:99}]}:{}};
  });
  const value={schema:'last-stand-combat-depth-presentation-fixtures/v'+(current?2:1),storageKey:'singedTerra.lastStand.prototype.v1',
    scope:'Inert development reader inputs, not player evidence',clockMode:'current UTC final anchors; synthetic earlier training',sourceUnchanged:true,sourceSha256,cases};
  const path=join(dir,'manifest.json'),bytes=Buffer.from(JSON.stringify(value));writeFileSync(path,bytes);
  return {root,dir,value,path,bytes,raw};
}
test('presentation admission refuses duplicate, unknown and escaping fixture identities',t=>{
  const f=fixture(t);assert.doesNotThrow(()=>admitFixtures(f.value,f.path,f.root));
  writeFileSync(join(f.root,'escape.json'),f.raw);
  for(const row of [f.value.cases[0],{...f.value.cases[0],id:'../escape',savePath:'../escape.json'}]){
    const bad=structuredClone(f.value);bad.cases.push(row);assert.throws(()=>admitFixtures(bad,f.path,f.root));
  }
});
test('current Commander admission requires the fourth identity and actual wave99 boundary claims; retained v1 stays three-case',t=>{
  const f=fixture(t,true),retained=fixture(t);admitFixtures(retained.value,retained.path,retained.root);
  admitFixtures(f.value,f.path,f.root);
  for(const change of [m=>m.cases.splice(2,1),m=>m.cases.push(m.cases[2]),m=>m.cases[2].id='unknown',
    m=>m.cases[2].nextWave=101,m=>m.cases[2].nextCohortContainsCommander=false,m=>m.cases[2].simulatedRuns[0].committedBoundaries=98]){
    const bad=structuredClone(f.value);change(bad);assert.throws(()=>admitFixtures(bad,f.path,f.root));
  }
  const extra=structuredClone(retained.value);extra.cases.push(structuredClone(f.value.cases[2]));assert.throws(()=>admitFixtures(extra,retained.path,retained.root));
  const row=f.value.cases[2],file=join(f.dir,row.savePath),raw=readFileSync(file);
  for(const change of [v=>v.checkpoint.encounter.tier=2,v=>v.checkpoint.encounter.wave=100,v=>v.checkpoint.encounter.completedWave=98,v=>v.checkpoint.encounter.hull=0]){
    const saved=JSON.parse(raw),bad=structuredClone(f.value);change(saved);const bytes=JSON.stringify(saved);
    writeFileSync(file,bytes);bad.cases[2].saveSha256=sha(bytes);assert.throws(()=>admitFixtures(bad,f.path,f.root));
  }
});
test('current presentation requires exact source closure and valid profile8 or profile9 while retaining v1 profile7',t=>{
  const f=fixture(t,true);assert.doesNotThrow(()=>admitFixtures(f.value,f.path,f.root));
  const current=structuredClone(f.value),first=current.cases[0],saved={...JSON.parse(f.raw),version:9,
    skills:{intel:2,copies:[1,0,0,0,0,0],loadout:['overdrive'],firstAwards:[]}};
  const raw=JSON.stringify(saved);writeFileSync(join(f.dir,first.savePath),raw);first.version=9;first.saveSha256=sha(raw);
  assert.doesNotThrow(()=>admitFixtures(current,f.path,f.root));
  writeFileSync(join(f.dir,f.value.cases[0].savePath),f.raw);
  for(const mutate of [m=>delete m.sourceSha256[PRESENTATION_FIXTURE_SOURCES[0]],
    m=>m.sourceSha256.unknown=sha('inert'),m=>m.schema='last-stand-combat-depth-presentation-fixtures/v3',
    m=>m.schema='last-stand-combat-depth-presentation-fixtures/v1']){
    const bad=structuredClone(f.value);mutate(bad);assert.throws(()=>admitFixtures(bad,f.path,f.root));
  }
  for(const version of [7,9,10]){
    const bad=structuredClone(f.value),row=bad.cases[0],raw=JSON.stringify({...JSON.parse(f.raw),version});
    writeFileSync(join(f.dir,row.savePath),raw);row.version=version;row.saveSha256=sha(raw);
    assert.throws(()=>admitFixtures(bad,f.path,f.root));
  }
});
test('manifest bytes cannot change during an otherwise unchanged player check',t=>{
  const f=fixture(t);verifyFixtureAfter(f.value,f.path,f.bytes,f.root);
  writeFileSync(f.path,JSON.stringify({...f.value,scope:'different development fixture claim'}));
  assert.throws(()=>verifyFixtureAfter(f.value,f.path,f.bytes,f.root));
});
test('callout evidence names the current module and viewport rather than coincident coordinates',()=>{
  const good={visible:true,target:'Attachment_Mortar',width:390,height:688,projectedAnchor:{x:150,y:250},endpointScreen:{x:150,y:250}};
  const expected={fitting:'mortar',width:390,height:688};assertFittingCallout(good,expected);
  for(const patch of [{target:'Attachment_Launcher'},{visible:false},{width:1,height:1},{endpointScreen:{x:152,y:250}},
    {projectedAnchor:{x:-1,y:1},endpointScreen:{x:-1,y:1}},{projectedAnchor:{x:150,y:Infinity},endpointScreen:{x:150,y:Infinity}}])
    assert.throws(()=>assertFittingCallout({...good,...patch},expected));
});

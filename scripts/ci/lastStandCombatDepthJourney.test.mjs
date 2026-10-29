import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {admitFixtures,assertFittingCallout,verifyFixtureAfter} from '../last-stand-combat-depth-journey.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'st-inert-presentation-reader-'));t.after(()=>rmSync(root,{recursive:true}));
  const dir=join(root,'fixtures');mkdirSync(dir);const sourceSha256={};
  for(let i=0;i<20;i++){const name='source'+i;writeFileSync(join(root,name),'inert');sourceSha256[name]=sha('inert');}
  const stamp=Date.now(),raw=JSON.stringify({version:6,research:{lastObservedUtcMilliseconds:stamp}});
  const cases=['roster-ready','tier2-before-elite','legacy-v4'].map(id=>{
    const version=id==='legacy-v4'?4:6,bytes=JSON.stringify({...JSON.parse(raw),version});
    writeFileSync(join(dir,id+'.json'),bytes);return {id,savePath:id+'.json',saveSha256:sha(bytes),version,createdUtcMilliseconds:stamp};
  });
  const value={schema:'last-stand-combat-depth-presentation-fixtures/v1',storageKey:'singedTerra.lastStand.prototype.v1',
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

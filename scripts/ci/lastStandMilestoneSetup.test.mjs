import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {MILESTONE_FIXTURE_SOURCES,admitMilestoneFixtures} from '../last-stand-wave-milestones.mjs';

// Inert bytes exercise manifest rejection only; they are never fed to Unity.
test('milestone setup requires complete source closure and four unique contained byte-bound fixtures',()=>{
  const root=mkdtempSync(join(tmpdir(),'st-milestone-admission-'));
  const sha=value=>createHash('sha256').update(value).digest('hex');
  try{
    const manifestPath=join(root,'fixture','manifest.json');mkdirSync(dirname(manifestPath));
    const valid={schema:'last-stand-earned-milestone-fixtures/v1',storageKey:'singedTerra.lastStand.prototype.v1',
      commands:[['compiler','input'],['runtime','program']],sourceSha256:{},cases:[]};
    for(const path of MILESTONE_FIXTURE_SOURCES){const full=join(root,path);mkdirSync(dirname(full),{recursive:true});
      writeFileSync(full,path);valid.sourceSha256[path]=sha(path);}
    for(const fitting of ['repair','launcher'])for(const targetWave of [100,300]){
      const item={fitting,targetWave,nextWaveTicks:400,expectedUnlockTier:targetWave===300?2:0,
        expectedUnlockFitting:targetWave===100?'scattergun':null};
      for(const [field,suffix,digest]of [['savePath','before','saveSha256'],['expectedSavePath','expected-next-clear','expectedSaveSha256']]){
        item[field]=join(dirname(manifestPath),`${fitting}-tier1-wave${targetWave}-${suffix}.json`);
        writeFileSync(item[field],'{}');item[digest]=sha('{}');
      }
      valid.cases.push(item);
    }
    admitMilestoneFixtures(valid,manifestPath,root);
    const source=MILESTONE_FIXTURE_SOURCES[0];
    for(const mutate of [v=>v.sourceSha256={},v=>delete v.sourceSha256[source],
      v=>v.sourceSha256[source]='a'.repeat(64),v=>v.sourceSha256['../foreign.cs']='a'.repeat(64),
      v=>v.cases[1]=v.cases[0],v=>v.cases.pop(),v=>v.cases[0].savePath=join(root,'outside.json'),
      v=>v.cases[0].savePath=v.cases[0].expectedSavePath,v=>v.cases[0].saveSha256='a'.repeat(64),
      v=>v.cases[0].nextWaveTicks=0,v=>v.cases[0].expectedUnlockFitting=null,
      v=>v.cases[1].expectedUnlockTier=1,v=>v.storageKey='other',v=>v.commands=[]]){
      const bad=structuredClone(valid);mutate(bad);assert.throws(()=>admitMilestoneFixtures(bad,manifestPath,root),String(mutate));
    }
  }finally{
    assert.ok(root.startsWith(join(tmpdir(),'st-milestone-admission-')),'Remove only this test-created temporary directory');
    rmSync(root,{recursive:true,force:true});
  }
});

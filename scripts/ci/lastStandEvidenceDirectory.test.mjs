import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFreshEvidenceDirectory} from '../../e2e/helpers/lastStandEvidenceDirectory.mjs';

test('evidence output is a fresh contained child and existing results survive refusal',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'st-evidence-dir-'));
  try{
    const root=join(temporary,'task');mkdirSync(root);
    const output=createFreshEvidenceDirectory(root,join(root,'run'));
    writeFileSync(join(output,'result.json'),'original evidence');
    assert.throws(()=>createFreshEvidenceDirectory(root,output),/already exists/);
    assert.equal(readFileSync(join(output,'result.json'),'utf8'),'original evidence');
    assert.throws(()=>createFreshEvidenceDirectory(root,join(temporary,'outside')),/escaped/);
    assert.throws(()=>createFreshEvidenceDirectory(root,root),/escaped/);
    writeFileSync(join(root,'file'),'keep');
    assert.throws(()=>createFreshEvidenceDirectory(root,join(root,'file','run')),/non-directory/);
  }finally{rmSync(temporary,{recursive:true,force:true});}
});

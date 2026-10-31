import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,fileHash} from '../../e2e/helpers/lastStandJourneyHost.mjs';
import {hashFiles} from '../lib/provenance-hash.mjs';

test('shared provenance hashing preserves standard byte and file vectors',()=>{
  assert.equal(hash(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hash(Buffer.alloc(0)),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const temporary=mkdtempSync(join(tmpdir(),'st-provenance-'));
  try{
    const path=join(temporary,'ordinary file $(literal) & bytes.bin');writeFileSync(path,Buffer.from('abc'));
    assert.equal(fileHash(path),hash(Buffer.from('abc')));
    assert.throws(()=>fileHash(join(temporary,'absent')));
  }finally{rmSync(temporary,{recursive:true,force:true});}
});

test('checksum CLI treats paths as data and returns no partial results on refusal',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'st-provenance-cli-'));
  const helper=fileURLToPath(new URL('../lib/provenance-hash.mjs',import.meta.url));
  const run=input=>spawnSync(process.execPath,[helper,'--hash-files'],{input,encoding:'utf8',timeout:5000});
  try{
    const path=join(temporary,'space $(literal) & unicode-\u00e9.bin');writeFileSync(path,'abc');
    const valid=run(JSON.stringify({paths:[path]}));assert.equal(valid.status,0,valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout),{files:[{path,sha256:hash('abc')}]});
    for(const request of [{paths:[]},{paths:[path,path]},{paths:[path],extra:true},{paths:[path,join(temporary,'missing')]}]){
      const failed=run(JSON.stringify(request));assert.equal(failed.status,1);assert.equal(failed.stdout,'');
      assert.equal(failed.stderr,'Provenance checksum request failed.\n');
    }
    for(const input of [Buffer.from([0xff]),' '.repeat(128*1024+1),'not json']){
      const failed=run(input);assert.equal(failed.status,1);assert.equal(failed.stdout,'');
    }
    assert.throws(()=>hashFiles({paths:[path+'\0']}),/Invalid checksum request/);
  }finally{rmSync(temporary,{recursive:true,force:true});}
});

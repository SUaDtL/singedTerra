import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Copy actual sources, including their complete local import closure, outside the
// installed checkout. Pure CI guards must run before npm installs any packages.
const sources=['scripts/last-stand-wave-milestones.mjs','scripts/last-stand-wave-endurance.mjs',
  'e2e/helpers/lastStandJourney.mjs','e2e/helpers/lastStandMatrix.mjs','e2e/helpers/lastStandTierJourney.mjs',
  'e2e/helpers/lastStandWaveJourney.mjs','e2e/helpers/lastStandWaveOracle.mjs','scripts/assets/verify-last-stand-source.mjs'];
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

export function assertDependencyFreeWaveGuards(program){
  const prefix=join(tmpdir(),'st-pure-wave-import-'),directory=mkdtempSync(prefix);
  try{
    for(const path of sources){const destination=join(directory,path);mkdirSync(dirname(destination),{recursive:true});
      copyFileSync(join(repository,path),destination);}
    assert.equal(existsSync(join(directory,'node_modules')),false);
    const result=spawnSync(process.execPath,['--input-type=module','--eval',`
      import assert from 'node:assert/strict';
      await assert.rejects(import('@playwright/test'),{code:'ERR_MODULE_NOT_FOUND'},
        'The isolated checkout must genuinely lack Playwright');
      ${program}
      console.log('dependency-free wave guards passed');
    `],{cwd:directory,env:{...process.env,NODE_PATH:''},encoding:'utf8',timeout:30000,maxBuffer:128*1024});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.equal(result.stdout.trim(),'dependency-free wave guards passed');
  }finally{
    assert.ok(directory.startsWith(prefix),'Remove only this test-created temporary checkout');
    rmSync(directory,{recursive:true,force:true});
  }
}

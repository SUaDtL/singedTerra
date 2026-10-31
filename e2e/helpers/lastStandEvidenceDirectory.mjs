import assert from 'node:assert/strict';
import {existsSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';

// Cooperating evidence writers: admit one fresh child of the declared task
// root, and refuse existing or redirected paths before any output is written.
export function createFreshEvidenceDirectory(taskRoot,candidate){
  const root=resolve(taskRoot),output=resolve(candidate),child=relative(root,output);
  assert.ok(child && !isAbsolute(child) && child!=='..' && !child.startsWith('..'+sep),'Evidence output escaped its task root');
  let cursor=output;
  while(true){
    if(existsSync(cursor)){
      const stat=lstatSync(cursor);
      assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'Evidence path contains a link or non-directory');
      assert.equal(resolve(realpathSync(cursor)),cursor,'Evidence resolved path differs');
    }
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  assert.ok(!existsSync(output),'Evidence output already exists');
  mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});return output;
}

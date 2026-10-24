"""Exercise the authored Web bootstrap and shipped storage bridge in two documents."""
from pathlib import Path
import importlib.util
import json
import subprocess
import unittest

TOOLS=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('entry',TOOLS/'make_web_entry.py')
entry=importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)
BRIDGE=(TOOLS.parent/'Unity/Assets/Plugins/WebGL/LastStandStorage.jslib').read_text()

class WriterLockTests(unittest.TestCase):
    def test_only_lock_owner_can_write_and_boot_waits_for_ownership(self):
        program=r'''
const vm=require('node:vm'),assert=require('node:assert/strict');
const bootstrap=BOOTSTRAP,bridge=BRIDGE;
let held=false,writes=0;
const locks={request:async(name,options,callback)=>{
  assert.equal(name,'singedTerra.lastStand.prototype.v1');assert.equal(options.ifAvailable,true);
  await Promise.resolve();
  if(held)return callback(null);
  held=true;return callback({name});
}};
function documentContext(available=true){
  const element={style:{},addEventListener(){},focus(){}};
  let boots=0;
  const window={addEventListener(){},localStorage:{setItem(){writes++},getItem(){return null}}};
  const context={window,navigator:available?{locks}:{},config:{},canvas:element,Promise,console,
    document:{querySelector:()=>element},createUnityInstance:async()=>{boots++;assert.equal(typeof window.__lastStandSaveWriter,'boolean');return {}}};
  vm.runInNewContext(bootstrap,context);
  assert.equal(boots,0,'Unity cannot initialize profile before lock result');
  const library={};
  vm.runInNewContext(bridge,{window,LibraryManager:{library},mergeInto:Object.assign,UTF8ToString:v=>v});
  return {context,window,library,boots:()=>boots};
}
(async()=>{
  const first=documentContext(),second=documentContext();
  for(let n=0;n<10;n++)await Promise.resolve();
  assert.equal(first.boots(),1);assert.equal(second.boots(),1);
  assert.equal(first.library.LastStandStorage_CanWrite(),1);assert.equal(second.library.LastStandStorage_CanWrite(),0);
  assert.equal(first.library.LastStandStorage_Set('singedTerra.lastStand.prototype.v1','save-a'),1);
  assert.equal(second.library.LastStandStorage_Set('singedTerra.lastStand.prototype.v1','save-b'),0);
  assert.equal(writes,1,'losing tab must not write even when invoked directly');
  const unsupported=documentContext(false);
  for(let n=0;n<10;n++)await Promise.resolve();
  assert.equal(unsupported.boots(),1,'unsupported browser retains read-only inspection');
  assert.equal(unsupported.library.LastStandStorage_Set('singedTerra.lastStand.prototype.v1','save-c'),0);
  held=false; // Browser releases the first document's lock when it is destroyed.
  const reopened=documentContext();
  for(let n=0;n<10;n++)await Promise.resolve();
  assert.equal(reopened.library.LastStandStorage_CanWrite(),1);
  console.log('PASS exclusive ownership and reload recovery');
})().catch(error=>{console.error(error);process.exitCode=1});
'''.replace('BOOTSTRAP',json.dumps(entry.LAST_STAND_BOOTSTRAP)).replace('BRIDGE',json.dumps(BRIDGE))
        result=subprocess.run(['node','-e',program],capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('PASS exclusive ownership',result.stdout)

if __name__=='__main__': unittest.main()

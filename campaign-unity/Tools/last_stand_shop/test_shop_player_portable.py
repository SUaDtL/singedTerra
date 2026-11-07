"""Portable actual Shop CLI/observation checks; no browser or external receipts.

Run: python -B -m unittest discover -s campaign-unity/Tools/last_stand_shop
-p test_shop_player_portable.py -v
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

WORKTREE = Path(__file__).resolve().parents[3]
NODE = shutil.which('node') or 'node'


class ShopPlayerTests(unittest.TestCase):
    def setUp(self):
        supplied = os.environ.get('ST_SHOP_TEST_EVIDENCE')
        if supplied:
            self.output = Path(supplied)
        else:
            temporary = tempfile.TemporaryDirectory(prefix='st-shop-portable-')
            self.addCleanup(temporary.cleanup)
            self.output = Path(temporary.name)

    def __str__(self):
        return f'{self._testMethodName} ({type(self).__module__}.{type(self).__qualname__})'

    def test_shop_terminal_retry_observation_waits_for_current_defeat(self):
        """Actual wait/capture rejects an earlier reservation retry before defeat."""
        script = r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(process.argv[1],'utf8');
const recovery=source.slice(source.indexOf('async function runShopRecoveryJourney('));
const untilStart=recovery.indexOf('  const until=async('),untilEnd=recovery.indexOf('\n  try {',untilStart);
const captureStart=recovery.indexOf('    const captureFailure=async('),captureEnd=recovery.indexOf('    const recover=async(',captureStart);
const terminalStart=recovery.indexOf("    await mode('uncertain');game.defeat=");
const waitStart=recovery.indexOf('\n',terminalStart)+1,waitEnd=recovery.indexOf('    game.terminal=',waitStart);
assert.ok(untilStart>0&&untilEnd>untilStart&&captureStart>untilEnd&&captureEnd>captureStart&&
  terminalStart>captureEnd&&waitStart>terminalStart&&waitEnd>waitStart,'Actual recovery wait and capture seams exist');
const actual=runInNewContext('(async ({records,game,page,snapshot,check,load})=>{'+
  'let observerError;const persist=()=>{};const current=items=>items.findLast(item=>item.load===load);'+
  recovery.slice(untilStart,untilEnd)+recovery.slice(captureStart,captureEnd)+
  'const defeatCase={};'+recovery.slice(waitStart,waitEnd)+'return defeatCase;})',{});

// Exact compact observations from the retained 2026-10-12 failed native journey.
// Load 11's earlier reservation retry, not load 2, satisfied the actual until.
const defeat={run:1,tick:1573,t:116890.79999995232,load:11,timeOrigin:1791768357392.2,seq:2795,order:6782};
const ready={action:'session',phase:'battle',saveState:'ready',runId:1,pendingRunId:0,tick:1572,
  t:116840.89999997616,load:11,timeOrigin:1791768357392.2,seq:2793,order:6777};
const valid={action:'save-error',phase:'save-error',saveState:'retry',runId:1,pendingRunId:0,tick:1573,
  t:116896.59999996424,load:11,timeOrigin:1791768357392.2,seq:2798,order:6792};
const reservation={action:'save-error',phase:'garage',saveState:'retry',runId:0,pendingRunId:0,tick:0,
  t:7591.899999976158,load:11,timeOrigin:1791768357392.2,seq:797,order:2486};
const cases=[
  ['observed-stale-reservation',reservation],
  ['foreign-load',{...valid,load:2}],
  ['foreign-document',{...valid,timeOrigin:1791768271744.5}],
  ['foreign-run',{...valid,runId:2}],
  ['preterminal-tick',{...valid,tick:1572}],
  ['preterminal-clock',{...valid,t:defeat.t-1}],
  ['preterminal-sequence',{...valid,seq:defeat.seq-1}],
  ['unconfirmed-ready',{...valid,saveState:'ready'}],
];
const failures=[];
for(const [name,rejected]of cases){
  const records={states:[rejected,ready]};let polls=0;
  const page={async waitForTimeout(ms){assert.equal(ms,40);assert.equal(++polls,1);records.states.push(valid);}};
  try {
    const result=await actual({records,game:{defeat,deploy:{runId:1}},page,load:11,
      snapshot:async()=>({state:records.states.findLast(row=>row.load===11)}),
      check:(condition,message)=>assert.ok(condition,message)});
    assert.equal(polls,1,'Capture must wait for the current defeat retry');
    assert.equal(result.failure,valid,'Capture must use the current same-document post-terminal retry');
    console.log('PASS terminal_retry_observation '+name);
  } catch(error){failures.push(name+': '+error.message);console.error('FAIL terminal_retry_observation '+name+': '+error.message);}
}
// A retry already observed after the terminal boundary must not time out.
const already=await actual({records:{states:[reservation,ready,valid]},game:{defeat,deploy:{runId:1}},load:11,
  page:{async waitForTimeout(){assert.fail('Current retry should be admitted immediately');}},
  snapshot:async()=>({state:valid}),check:(condition,message)=>assert.ok(condition,message)});
assert.equal(already.failure,valid);
console.log('PASS terminal_retry_observation already-current');
assert.deepEqual(failures,[],'Actual recovery wait admitted stale/foreign/preterminal retry observations');
"""
        argv = [NODE, '--input-type=module', '-e', script,
                str(WORKTREE / 'e2e/helpers/lastStandJourney.mjs')]
        result = subprocess.run(argv, cwd=WORKTREE, capture_output=True, timeout=30)
        output = self.output
        output.mkdir(parents=True, exist_ok=True)
        (output / 'terminal-observation.stdout.txt').write_bytes(result.stdout)
        (output / 'terminal-observation.stderr.txt').write_bytes(result.stderr)
        (output / 'terminal-observation.command.json').write_text(json.dumps(
            {'argv': argv, 'cwd': str(WORKTREE), 'exit': result.returncode}, indent=2), encoding='utf8')
        print(result.stdout.decode('utf8', 'replace'), end='', flush=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf8', 'replace'))


    def test_shop_player_headless_launch_is_explicit(self):
        """Actual launch argument function; preexisting native defaults stay exact."""
        script = r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const {createLastStandNativeDriver}=await import((await import('node:url')).pathToFileURL(process.argv[1]));
for(const platform of ['win32','linux']){
 const actual=createLastStandNativeDriver({process:{platform}}).nativeChromeArgs;
 const expected=['--user-data-dir=inert-profile','--remote-debugging-address=127.0.0.1',
   '--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
   '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost;[::1]',
   '--window-size=1616,988',...(platform==='win32'?[]:['--headless=new']),'about:blank'];
 assert.deepEqual(Array.from(actual('inert-profile')),expected,'Original native defaults stay exact: '+platform);
 const selected=Array.from(actual('inert-profile','shop-headless'));
 assert.equal(selected.filter(arg=>arg==='--headless=new').length,1,'Explicit Shop mode selects genuine headless Chrome: '+platform);
 assert.deepEqual(selected.filter(arg=>arg!=='--headless=new'),expected.filter(arg=>arg!=='--headless=new'));
 assert.throws(()=>actual('inert-profile','unknown'),'Only the explicit bounded mode is accepted');
 console.log('PASS default_native_and_explicit_shop_headless '+platform);
}
"""
        result = subprocess.run([NODE, '--input-type=module', '-e', script,
                                 str(WORKTREE / 'e2e/helpers/lastStandJourney.mjs')],
                                cwd=WORKTREE, capture_output=True, timeout=30)
        output = self.output
        output.mkdir(parents=True, exist_ok=True)
        (output / 'headless.stdout.txt').write_bytes(result.stdout)
        (output / 'headless.stderr.txt').write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf8', 'replace'))


    def test_shop_player_option_dispatch(self):
        """Execute the actual CLI branch with inert process/browser boundaries."""
        script = r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as url from 'node:url';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
const cli=process.argv[1],source=readFileSync(cli,'utf8');
for(const fitting of ['launcher','repair']) {
  const calls=[],writes=[];
  const context=createContext({console,Buffer,setTimeout,clearTimeout,URL,
    process:{argv:['node',cli,'--shop-player',fitting],pid:4242,execPath:process.execPath,
      env:{ST_SHOP_PLAYER_BASE_URL:'http://127.0.0.1:5203/',ST_SHOP_TEST_EVIDENCE:'inert-output'},
      once(){},stderr:{write(){}}}});
  const module=(values)=>new SyntheticModule(Object.keys(values),function(){
    for(const [name,value]of Object.entries(values))this.setExport(name,value);
  },{context});
  const modules=new Map([
    ['node:assert/strict',module({default:assert})],['node:path',module(path)],['node:crypto',module(crypto)],['node:url',module(url)],
    ['node:fs',module({readFileSync,mkdirSync(){},writeFileSync(...args){writes.push(args);}})],
    ['node:child_process',module({spawn(){calls.push({mode:'classic'});throw new Error('Inert classic spawn intercepted');}})],
    ['@playwright/test',module({chromium:{inert:true}})],
    ['../e2e/helpers/lastStandJourney.mjs',module({admitEvidenceParent:()=> 'inert-output',
      startOwnedSupervisor(){throw new Error('Unexpected supervisor');},watchOwnedProcess(){throw new Error('Unexpected watch');},
      lastStandJourneyTimeBudget(){throw new Error('Unexpected classic budget');},
      ownedProcessIdentity(){throw new Error('Unexpected classic identity');},
      finishOwnedSupervisorCleanup(){throw new Error('Unexpected classic cleanup');},
      async runLastStandShopJourney(options){calls.push({mode:'shop',...options});return {path:'inert-output/result.json',status:'pass'};}})]
  ]);
  const resolve=async specifier=>{const item=modules.get(specifier);assert.ok(item,'Known inert dependency: '+specifier);return item;};
  const actual=new SourceTextModule(source,{context,identifier:cli,
    initializeImportMeta:meta=>{meta.dirname=path.dirname(cli);meta.url=url.pathToFileURL(cli).href;},
    importModuleDynamically:async specifier=>{const item=await resolve(specifier);if(item.status==='unlinked')await item.link(resolve);
      if(item.status==='linked')await item.evaluate();return item;}});
  await actual.link(resolve);await actual.evaluate();
  assert.deepEqual(calls.map(call=>call.mode),['shop'],'Requested Shop journey must not enter the classic runner');
  assert.equal(calls[0].fitting,fitting,'Requested fitting reaches the real journey entry');
  assert.equal(calls[0].baseURL,'http://127.0.0.1:5203/');
  console.log('PASS actual_shop_dispatch '+fitting);
}
"""
        result = subprocess.run([NODE, '--experimental-vm-modules',
                                 '--input-type=module', '-e', script,
                                 str(WORKTREE / 'scripts/last-stand-playable-loop.mjs')],
                                cwd=WORKTREE, capture_output=True, timeout=30)
        output = self.output
        output.mkdir(parents=True, exist_ok=True)
        (output / 'dispatch.stdout.txt').write_bytes(result.stdout)
        (output / 'dispatch.stderr.txt').write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf8', 'replace'))

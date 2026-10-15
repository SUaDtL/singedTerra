import assert from 'node:assert/strict';
import test from 'node:test';
import { chromiumNamespaceProfile, requireHostedLinux, validateSandboxObservation } from './prepareLastStandBrowser.mjs';

const executable='/home/runner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const observed=()=>({rows:[['Layer 1 Sandbox','Namespace'],['PID namespaces','Yes'],['Network namespaces','Yes'],
  ['Seccomp-BPF sandbox','Yes'],['Seccomp-BPF sandbox supports TSYNC','Yes'],
  ['Ptrace Protection with Yama LSM (Non-broker)','No']],evaluation:'You are adequately sandboxed.'});

test('namespace policy admits only the exact pinned executable and one userns grant',()=>{
  const policy=chromiumNamespaceProfile(executable,'1243');
  assert.ok(policy.includes(`"${executable}"`));
  assert.equal((policy.match(/\bprofile\b/g)??[]).length,1);
  assert.equal((policy.match(/\buserns,/g)??[]).length,1);
  assert.doesNotMatch(policy,/[*?@]|\b(?:capability|network|mount|ptrace|change_profile)\b/);
  for(const path of ['/opt/google/chrome/chrome',executable+'/extra',executable.replace('1243','1244'),
    executable.replace('/chrome-linux64','/../chrome-linux64'),executable+'"\nuserns,\n',
    executable.replace('/home/runner/','/home/another/'),executable+'*'])
    assert.throws(()=>chromiumNamespaceProfile(path,'1243'));
  for(const revision of ['','0','1243\n','1243*','1243"','../1243']) {
    assert.throws(()=>chromiumNamespaceProfile(executable,revision));
    assert.throws(()=>chromiumNamespaceProfile(executable.replace('1243',revision),revision));
  }
});

test('actual namespace and seccomp status is required while diagnostic Yama may be No',()=>{
  const value=observed();assert.deepEqual(validateSandboxObservation(value),value);
  for(const label of ['Layer 1 Sandbox','PID namespaces','Network namespaces','Seccomp-BPF sandbox']) {
    const missing=observed();missing.rows=missing.rows.filter(row=>row[0]!==label);
    assert.throws(()=>validateSandboxObservation(missing));
    const disabled=observed();disabled.rows.find(row=>row[0]===label)[1]='No';
    assert.throws(()=>validateSandboxObservation(disabled));
    const duplicate=observed();duplicate.rows.push(duplicate.rows.find(row=>row[0]===label));
    assert.throws(()=>validateSandboxObservation(duplicate));
  }
  for(const evaluation of ['','You are NOT adequately sandboxed.','You are adequately sandboxed. '])
    assert.throws(()=>validateSandboxObservation({...observed(),evaluation}));
  for(const rows of [[],null,[['Layer 1 Sandbox']],Array(33).fill(['x','Yes'])])
    assert.throws(()=>validateSandboxObservation({...observed(),rows}));
});

test('policy setup refuses local and non-Linux contexts without invoking host actions',()=>{
  const valid={platform:'linux',githubActions:'true',runnerOS:'Linux'};
  assert.doesNotThrow(()=>requireHostedLinux(valid));
  for(const invalid of [{platform:'win32'},{platform:'darwin'},{githubActions:undefined},
    {githubActions:'false'},{runnerOS:'Windows'}])
    assert.throws(()=>requireHostedLinux({...valid,...invalid}),/hosted Linux/);
});

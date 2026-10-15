import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const globalRestriction='/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');

export function requireHostedLinux({platform,githubActions,runnerOS}) {
  assert.ok(platform==='linux' && githubActions==='true' && runnerOS==='Linux',
    'Browser policy setup is limited to the hosted Linux CI job');
}

// Chromium's documented userns profile, restricted to the exact installed
// Playwright revision, never a wildcard or caller-provided policy.
// https://github.com/chromium/chromium/blob/main/docs/security/apparmor-userns-restrictions.md
export function chromiumNamespaceProfile(executable,revision) {
  assert.match(revision,/^[1-9][0-9]{0,8}$/,'Invalid pinned Chromium revision');
  assert.equal(executable,`/home/runner/.cache/ms-playwright/chromium-${revision}/chrome-linux64/chrome`,
    'Browser policy requires the exact canonical pinned Chromium executable');
  return `abi <abi/4.0>,\ninclude <tunables/global>\nprofile singedterra-last-stand "${executable}" flags=(unconfined) {\n  userns,\n}\n`;
}

export function validateSandboxObservation({rows,evaluation}) {
  assert.ok(Array.isArray(rows) && rows.length>0 && rows.length<=32,'Actual sandbox table is required');
  const values=new Map();
  for(const row of rows) {
    assert.ok(Array.isArray(row) && row.length===2 && row.every(cell=>typeof cell==='string' && cell.length<=300),
      'Malformed sandbox status row');
    assert.ok(!values.has(row[0]),'Duplicate sandbox status row');values.set(...row);
  }
  for(const [label,value] of [['Layer 1 Sandbox','Namespace'],['PID namespaces','Yes'],
    ['Network namespaces','Yes'],['Seccomp-BPF sandbox','Yes']])
    assert.equal(values.get(label),value,'Actual Chromium sandbox differs: '+label);
  assert.equal(evaluation,'You are adequately sandboxed.','Chromium sandbox evaluation failed');
  return {rows,evaluation};
}

function describe(path) {
  try {
    const stat=lstatSync(path);let writable=false;
    try {accessSync(path,constants.W_OK);writable=true;} catch {}
    return {path,uid:stat.uid,mode:(stat.mode&0o7777).toString(8),regular:stat.isFile(),
      symlink:stat.isSymbolicLink(),writable};
  } catch(error) {return {path,error:error.code};}
}

export async function prepareLastStandBrowser() {
  requireHostedLinux({platform:process.platform,githubActions:process.env.GITHUB_ACTIONS,runnerOS:process.env.RUNNER_OS});
  assert.equal(process.env.CHROME_DEVEL_SANDBOX,undefined,'An inherited sandbox-helper override is not admitted');
  const {chromium}=await import('@playwright/test');
  const {admitEvidenceParent,ownedChrome}=await import('../../e2e/helpers/lastStandJourney.mjs');
  const output=mkdtempSync(join(admitEvidenceParent(),'ci-browser-sandbox-'));
  console.log('LAST_STAND_SANDBOX_EVIDENCE='+output);
  const record={status:'running',host:process.platform,method:'exact-executable AppArmor userns policy and actual Chromium diagnostics',
    installed_helper:{selected:false,file:describe('/opt/google/chrome/chrome-sandbox'),directory:describe('/opt/google/chrome')}};
  console.log('LAST_STAND_INSTALLED_HELPER='+JSON.stringify(record.installed_helper));
  let native,failure,profilePath,executable,globalBefore;
  try {
    const metadataPath=join(dirname(createRequire(import.meta.url).resolve('playwright-core/package.json')),'browsers.json');
    const pinned=JSON.parse(readFileSync(metadataPath,'utf8')).browsers.find(browser=>browser.name==='chromium');
    assert.ok(pinned,'Pinned Chromium metadata is required');
    executable=chromium.executablePath();
    assert.equal(realpathSync(executable),executable,'Pinned Chromium must resolve to itself');
    assert.ok(lstatSync(executable).isFile(),'Pinned Chromium must be a regular executable');
    const policy=chromiumNamespaceProfile(executable,pinned.revision);
    const temp=realpathSync(process.env.RUNNER_TEMP);
    const directory=mkdtempSync(join(temp,'st-ls-browser-policy-'));
    assert.equal(realpathSync(directory),directory,'Policy directory must resolve to itself');
    assert.equal(dirname(directory),temp,'Policy directory escaped runner temp');
    assert.ok(relative(temp,directory).startsWith('st-ls-browser-policy-'),'Unexpected policy directory');
    profilePath=join(directory,'last-stand.apparmor');
    writeFileSync(profilePath,policy,{flag:'wx',mode:0o600});
    globalBefore=readFileSync(globalRestriction,'utf8').trim();
    record.inputs={executable,executable_sha256:digest(executable),pinned,
      metadata_sha256:digest(metadataPath),profile_sha256:digest(profilePath),global_restriction:globalBefore};
    writeFileSync(join(output,'profile.apparmor'),policy);
    const command=['/usr/bin/sudo','-n','/usr/sbin/apparmor_parser','--base','/etc/apparmor.d','--replace',profilePath];
    const result=spawnSync(command[0],command.slice(1),{encoding:'utf8',timeout:30_000,maxBuffer:1024*1024});
    writeFileSync(join(output,'policy.stdout.txt'),result.stdout??'');
    writeFileSync(join(output,'policy.stderr.txt'),result.stderr??'');
    record.policy_command={argv:command,exit:result.status,error:result.error?String(result.error):null};
    assert.ok(!result.error && result.status===0,'Exact Chromium policy load failed; inspect retained policy stderr');
    assert.equal(readFileSync(globalRestriction,'utf8').trim(),globalBefore,'Global userns restriction changed');
    native=await ownedChrome(chromium,output);
    const launch=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    assert.equal(launch.executable,executable,'Startup selected another browser executable');
    assert.ok(!launch.args.some(arg=>['--no-sandbox','--disable-namespace-sandbox','--disable-seccomp-filter-sandbox',
      '--disable-setuid-sandbox','--single-process'].includes(arg)),'Browser sandbox-disabling argument refused');
    const session=await native.browser.newBrowserCDPSession();
    record.browser=await session.send('Browser.getVersion');await session.detach();
    assert.equal(record.browser.product.split('/').at(-1),pinned.browserVersion,'Actual browser differs from pinned version');
    const page=native.context.pages()[0]??await native.context.newPage();
    await page.goto('chrome://sandbox');
    await page.waitForFunction(()=>Boolean(document.querySelector('#evaluation')?.textContent?.trim()),null,{timeout:10_000});
    const observed=await page.evaluate(()=>({
      rows:Array.from(document.querySelectorAll('#sandbox-status tr'),row=>Array.from(row.querySelectorAll('td'),cell=>cell.textContent.trim())),
      evaluation:document.querySelector('#evaluation').textContent.trim(),
    }));
    record.sandbox_observation=observed;
    await page.screenshot({path:join(output,'sandbox-status.png'),timeout:10_000});
    validateSandboxObservation(observed);
    record.launch=launch;record.status='pass';
  } catch(error) {failure=error;record.status='failed';record.error=String(error);}
  finally {
    if(native)try{await native.close();}catch(error){record.cleanup_error=String(error);failure??=error;}
    if(record.inputs)try {
      assert.equal(digest(executable),record.inputs.executable_sha256,'Browser bytes drifted during sandbox proof');
      assert.equal(digest(profilePath),record.inputs.profile_sha256,'Policy bytes drifted during sandbox proof');
      assert.equal(readFileSync(globalRestriction,'utf8').trim(),globalBefore,'Global userns restriction changed');
      record.global_policy_unchanged=true;
    } catch(error) {record.integrity_error=String(error);failure??=error;}
    if(failure)record.status='failed';
    writeFileSync(join(output,'result.json'),JSON.stringify(record,null,2));
    console.log('LAST_STAND_BROWSER_SANDBOX='+JSON.stringify(record));
  }
  // The exact policy remains loaded for the subsequent journey on this
  // disposable runner. Browser/profile processes were cleaned by ownedChrome.
  if(failure)throw failure;
  return record;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareLastStandBrowser();

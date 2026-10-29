import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { WAVE_ORACLE_SOURCES } from '../../e2e/helpers/lastStandWaveOracle.mjs';

// A clean checkout has no ignored journey evidence directories. Initialize the
// fixed repository-owned parent; the production admission still proves its
// canonical containment before compiling or retaining any evidence.
mkdirSync(resolve(import.meta.dirname,'../../campaign-unity/Evidence/last-stand-playable-loop/t06'),{recursive:true});

// Candidate uses the production journey; the RED adapter executes the frozen
// original journey assertions. Fixtures are negative controls, never gameplay.
const journey = await import(process.env.LAST_STAND_BACKGROUND_BASELINE_MODULE
  ? pathToFileURL(resolve(process.env.LAST_STAND_BACKGROUND_BASELINE_MODULE)).href
  : process.env.LAST_STAND_GUARD_MODULE
    ? pathToFileURL(resolve(process.env.LAST_STAND_GUARD_MODULE)).href
    : '../../e2e/helpers/lastStandJourney.mjs');
const sample = (t, tick, extra={}) => ({ t, timeOrigin:100000, load:1, run:7,
  tick, hull:120, hp:120, kills:0, spawned:1,cannon:0,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:1,
  paused:false, reason:'', catchingUp:false,
  callbackSteps:1, status:'Running', terminalElapsed:0, ...extra });
const event = (t, kind, hidden, focused) => ({ t, timeOrigin:100000, load:1, kind, hidden, focused });
// Pinned actual unchanged EncounterModel repair/20 observations at ticks 20/28.
// Author evidence/model-oracle binds the source, compiler and actual output.
const oracle=Object.fromEntries([20,28].map(tick=>[tick,{tick,hp:120,kills:0,spawned:1,
  cannon:0,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:1,status:'Running'}]));
oracle[228]={tick:228,hp:120,kills:3,spawned:5,cannon:7,launcher:0,healed:0,closeHits:0,rangedHits:0,alive:2,status:'Running'};
const background = () => ({ kind:'hidden', before:sample(1000,20), after:sample(1400,28),
  oracle,events:[event(1010,'visibilitychange',true,false),event(1350,'visibilitychange',false,true)] });
const pause = () => ({ before:sample(1000,20), paused:sample(1000,20,{paused:true,reason:'user'}),
  returned:sample(11000,20,{paused:true,reason:'user'}), resumed:sample(11100,20), after:sample(11500,28),
  oracle,events:[event(1100,'visibilitychange',true,false),event(11000,'visibilitychange',false,true)] });
const terminal = () => ({ runId:9, beforeWallet:0,
  states:[{action:'defeat-staged',phase:'settling',pendingRunId:9,wallet:0,saveState:'ready'},
    {action:'result',phase:'result',pendingRunId:9,wallet:0,saveState:'ready'},
    {action:'claim',phase:'workshop',pendingRunId:0,wallet:1,saveState:'ready'}],
  pending:{pendingDefeat:{runId:9,reward:1}}, claimed:{pendingDefeat:null,credits:1},
  controls:[{name:'Claim',active:false,interactable:false}] });

// Execute the maintained production caller body itself, including its binding
// to the shared boundary. The frozen faulty source is a RED-only override.
const callerURL=process.env.LAST_STAND_OBSERVATION_SOURCE
  ? pathToFileURL(resolve(process.env.LAST_STAND_OBSERVATION_SOURCE))
  : process.env.LAST_STAND_GUARD_MODULE
    ? pathToFileURL(resolve(process.env.LAST_STAND_GUARD_MODULE))
    : new URL('../../e2e/helpers/lastStandJourney.mjs',import.meta.url);
const callerBytes=readFileSync(callerURL);
const callerSource=callerBytes.toString('utf8').replace(/\r\n/g,'\n');
const callerDeclarations=[...callerSource.matchAll(/\n[ \t]*const observation\s*=\s*async\s+options\s*=>/g)];
assert.equal(callerDeclarations.length,1,'Unique actual production async observation caller is required');
const callerBegin=callerDeclarations[0].index;
const callerEnd=callerSource.indexOf('    const reference=',callerBegin);
assert.ok(callerBegin>0 && callerEnd>callerBegin,'Actual production observation caller is required');
const actualCaller=new Function('encounters','states','load','check','page','observeRuntimePair','options',
  callerSource.slice(callerBegin,callerEnd)+'return observation(options);');
const witness=()=>{
  const model=journey.readBoundEncounterOracle()['repair:20'];
  const encounter=tick=>({...sample(tick*50,tick),...model[tick],run:1,fitting:'repair',action:'tick'});
  const state=tick=>({...model[tick],hull:model[tick].hp,t:tick*50+.01,timeOrigin:100000,load:1,
    sessionRun:1,runId:19,pendingRunId:0,cannonDamage:20,paused:false,phase:'battle'});
  return {model,encounter,state,encounters:[{...encounter(0),action:'deploy'},encounter(20)],
    states:[{...state(0),action:'deploy'},state(20),state(21)],now:1055,origin:100000,waits:0};
};
const callObserved=(x,options)=>actualCaller(x.encounters,x.states,1,
  (condition,name)=>assert.ok(condition,name),{
    evaluate:async()=>({t:x.now,timeOrigin:x.origin}),
    waitForTimeout:async ms=>{x.waits++;x.now+=ms;if(x.onWait)x.onWait();},
  },journey.observeRuntimePair,options);

function nativeWindowObservation(pid, ownership=null) {
  assert.ok(Number.isInteger(pid) && pid>0,'Native window observation requires the owned browser PID');
  if(ownership)assert.ok(ownership.pid===pid && ownership.root?.pid===pid && ownership.root.start &&
    ownership.root.exe && ownership.profile,'Complete owned fixture identity required');
  const encoded=Buffer.from(JSON.stringify(ownership)).toString('base64');
  // Read actual Win32 top-level window state without native activation or
  // document focus/visibility emulation. Player focus qualification stays T-11.
  const script=`$ErrorActionPreference='Stop'
    $owner=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
    function Assert-OwnedFixture {
      if($owner){
        $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owner.root.pid)
        if(-not $live -or $live.CreationDate.ToUniversalTime().ToString('o') -ne $owner.root.start -or $live.ExecutablePath -ne $owner.root.exe){throw 'Owned fixture process identity mismatch'}
        $argument='--user-data-dir='+$owner.profile
        if(-not ($live.CommandLine.Contains('"'+$argument+'"') -or $live.CommandLine.Split(' ').Contains($argument))){throw 'Owned fixture profile mismatch'}
      }
    }
    Assert-OwnedFixture
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class LastStandNativeWindowProbe {
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public uint Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll", EntryPoint="GetMonitorInfoW", SetLastError=true)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  public static object[] Read(uint owner) {
    var previous=SetThreadDpiAwarenessContext(new IntPtr(-4));
    if(previous==IntPtr.Zero)throw new InvalidOperationException("Physical fixture context unavailable");
    try {
    if(!AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(),new IntPtr(-4)))throw new InvalidOperationException("Physical fixture context rejected");
    var windows = new List<object>();
    bool complete=EnumWindows((window, parameter) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == owner) {
        if(windows.Count>=12)throw new InvalidOperationException("Owned fixture window observation overflow");
        Rect rect; bool measured = GetWindowRect(window, out rect);
        var monitor=MonitorFromWindow(window,0); // No nearest-monitor fallback.
        var info=new MonitorInfo { Size=(uint)Marshal.SizeOf(typeof(MonitorInfo)) };
        bool monitorMeasured=monitor!=IntPtr.Zero && GetMonitorInfo(monitor,ref info);
        var kind = new StringBuilder(256); GetClassName(window, kind, kind.Capacity);
        var title = new StringBuilder(1024); GetWindowText(window, title, title.Capacity);
        windows.Add(new { hwnd = window.ToInt64().ToString(), pid = pid,
          visible = IsWindowVisible(window), minimized = IsIconic(window), measured = measured,
          kind = kind.ToString(), title = title.ToString(), left = rect.Left, top = rect.Top,
          width = rect.Right - rect.Left, height = rect.Bottom - rect.Top,
          workarea = monitorMeasured ? new { left=info.Work.Left, top=info.Work.Top,
            width=info.Work.Right-info.Work.Left, height=info.Work.Bottom-info.Work.Top } : null });
      }
      return true;
    }, IntPtr.Zero);
    if(!complete)throw new InvalidOperationException("Incomplete owned fixture window observation");
    return windows.ToArray();
    } finally {
      if(SetThreadDpiAwarenessContext(previous)==IntPtr.Zero || !AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(),previous))
        throw new InvalidOperationException("Physical fixture context restoration failed");
    }
  }
}
'@
    $windows=@([LastStandNativeWindowProbe]::Read(${pid}))
    Assert-OwnedFixture
    ConvertTo-Json -InputObject $windows -Depth 5 -Compress`;
  return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',
    Buffer.from(script,'utf16le').toString('base64')],
    {encoding:'utf8',timeout:10_000,maxBuffer:1024*1024,windowsHide:true}));
}

async function placeOwnedInertWindow({native,page,report,role,output}) {
  // Fit this owned inert fixture to the current monitor rather than a retained
  // desktop's coordinates. Only geometry and real tab selection change; the
  // production native/document oracle stays strict.
  assert.equal(page.context(),native.context,'Only the task-owned inert page may be placed');
  assert.ok(!page.isClosed() && (page.url()==='about:blank' || page.url().startsWith('data:text/html,')),
    'Placement is limited to the isolated inert fixture');
  const documentState=()=>page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  const record={role,document_before:await documentState()};
  (report.inert_window_placements??=[]).push(record);
  let session,browserSession;
  try {
    session=await native.context.newCDPSession(page);browserSession=await native.browser.newBrowserCDPSession();
    const {targetInfo}=await session.send('Target.getTargetInfo');record.target=targetInfo;
    assert.ok(targetInfo.type==='page' && targetInfo.targetId && targetInfo.browserContextId);
    record.before=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.equal(record.before.bounds.windowState,'normal');
    const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    record.native_before=nativeWindowObservation(receipt.pid,receipt);
    record.window=journey.bindOwnedNativeWindow({windows:record.native_before,dropped:0},record.before.bounds,receipt.pid);
    record.display=record.window.workarea;
    assert.ok(record.display && ['left','top','width','height'].every(key=>Number.isSafeInteger(record.display[key])) &&
      record.display.width>0 && record.display.height>0 &&
      Number.isSafeInteger(record.display.left+record.display.width) && Number.isSafeInteger(record.display.top+record.display.height),
      'Measured safe native workarea required');
    const inset=role.endsWith('auxiliary')?40:20;
    record.requested={left:record.display.left+inset,top:record.display.top+inset,
      width:Math.min(record.window.width,record.display.width-inset*2),
      height:Math.min(record.window.height,record.display.height-inset*2)};
    assert.ok(record.requested.width>=640 && record.requested.height>=480,'Native workarea must fit the inert fixture');
    await browserSession.send('Browser.setWindowBounds',{windowId:record.before.windowId,bounds:record.requested});
    record.after=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.equal(record.after.windowId,record.before.windowId);
    for(const key of Object.keys(record.requested))assert.equal(record.after.bounds[key],record.requested[key]);
    record.native_after=nativeWindowObservation(receipt.pid,receipt);
    const after=journey.bindOwnedNativeWindow({windows:record.native_after,dropped:0},record.after.bounds,receipt.pid);
    assert.equal(after.hwnd,record.window.hwnd,'Owned fixture HWND changed');
    assert.deepEqual(after.workarea,record.display,'Owned fixture workarea changed');
    record.tab_before=await documentState();await page.bringToFront();record.tab_after=await documentState();
  } finally {for(const value of [session,browserSession])if(value)await value.detach();}
}

async function assertOwnedNativeStartup() {
  if(process.platform!=='win32')return;
  const {chromium}=await import('@playwright/test');
  const parent=journey.admitEvidenceParent();
  const output=mkdtempSync(join(parent,'native-startup-guard-'));
  console.log('ST_LS_NATIVE_STARTUP='+output);
  // Match the production viewport and first real navigation with an inert
  // task-owned loopback document. No application/player storage is loaded.
  const serverRequests=[];
  const server=createServer((request,response)=>{
    serverRequests.push({method:request.method,path:request.url});
    if(request.method!=='GET' || request.url!=='/native-startup'){
      response.writeHead(404);response.end();return;
    }
    response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    response.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Owned native startup guard</title><p>Native startup visibility fixture.</p>');
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const fixtureURL=`http://127.0.0.1:${server.address().port}/native-startup`;
  const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  const report={host:process.platform,node:{path:process.execPath,version:process.version,sha256:digest(process.execPath)},
    source_sha256:createHash('sha256').update(callerBytes).digest('hex'),
    method:'maintained ownedChrome, isolated inert loopback document, actual owned Win32 HWND oracle; document diagnostics only',
    requests:[],deniedRequests:[],serverRequests,observations:[],status:'running'};
  let native,page,original,pageSession,browserSession;
  const observe=async label=>{
    const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    const identity=journey.ownedProcessIdentity(receipt.pid);
    assert.deepEqual(identity,receipt.root,'Native HWND must belong to the same live owned browser identity');
    const target=await pageSession.send('Target.getTargetInfo');
    const window=await browserSession.send('Browser.getWindowForTarget',{targetId:target.targetInfo.targetId});
    report.observations.push({label,utc:new Date().toISOString(),root:receipt.root,
      windows:nativeWindowObservation(receipt.pid),target,window,
      document:await page.evaluate(()=>({url:location.href,title:document.title,hidden:document.hidden,focused:document.hasFocus(),
        t:performance.now(),timeOrigin:performance.timeOrigin}))});
  };
  try {
    native=await journey.ownedChrome(chromium,output);
    page=native.context.pages()[0];
    page.setDefaultTimeout(10_000);
    page.on('request',request=>report.requests.push(request.url()));
    await page.route('**/*',async route=>{
      if(route.request().url()===fixtureURL)await route.continue();
      else {report.deniedRequests.push(route.request().url());await route.abort('blockedbyclient');}
    });
    pageSession=await native.context.newCDPSession(page);
    browserSession=await native.browser.newBrowserCDPSession();
    const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    report.chrome={path:receipt.executable,sha256:digest(receipt.executable),version:native.browser.version()};
    assert.equal(page.url(),'about:blank','Startup guard cannot access app/player data');
    await page.setViewportSize({width:1280,height:720});
    await page.goto(fixtureURL,{waitUntil:'domcontentloaded'});
    await observe('owned inert document; no positive document qualification');
    const actual=report.observations.at(-1);
    assert.equal(actual.target.targetInfo.type,'page');
    assert.equal(actual.target.targetInfo.url,fixtureURL);
    assert.equal(actual.target.targetInfo.title,'Owned native startup guard');
    assert.equal(actual.window.bounds.windowState,'normal');
    const owned=actual.windows.filter(window=>window.pid===receipt.pid && window.kind==='Chrome_WidgetWin_1' &&
      window.title==='Owned native startup guard - Google Chrome' && window.measured &&
      window.left===actual.window.bounds.left && window.top===actual.window.bounds.top &&
      window.width===actual.window.bounds.width && window.height===actual.window.bounds.height);
    assert.equal(owned.length,1,'One exact owned native top-level Chrome HWND must match the current CDP target');
    report.ownedWindow=owned[0];
    assert.ok(owned[0].visible && !owned[0].minimized && owned[0].width>0 && owned[0].height>0,
      'Owned headed Windows Chrome must expose an actual visible nonminimized native window');
    assert.equal(actual.document.url,fixtureURL);
    assert.deepEqual(report.requests,[fixtureURL],'Startup guard cannot request app/player content');
    assert.deepEqual(report.deniedRequests,[],'Inert startup cannot attempt other page network requests');
    assert.deepEqual(serverRequests,[{method:'GET',path:'/native-startup'}],'Only the exact inert loopback path may be requested');
    assert.equal(digest(receipt.executable),report.chrome.sha256,'Actual Chrome bytes drifted during startup');
    assert.equal(digest(process.execPath),report.node.sha256,'Actual Node bytes drifted during startup');
    assert.equal(digest(callerURL),report.source_sha256,'Maintained launcher source drifted during startup');
    report.status='pass';
  } catch(error){original=error;report.status='fail';report.error=String(error);throw error;}
  finally {
    try {
      if(native)await native.close();
      const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
      report.cleanup={receipt,result:JSON.parse(readFileSync(join(output,'browser-cleanup.json'),'utf8'))};
      assert.equal(receipt.status,'removed');
      assert.ok(!existsSync(receipt.profile),'Owned startup profile must be removed');
      assert.equal(report.cleanup.result.status,'stopped');
      assert.deepEqual(report.cleanup.result.tree.remaining,[]);
    } catch(error){report.cleanup_error=String(error);report.status='fail';if(original)original.cleanup_error=String(error);else throw error;}
    finally{
      server.closeAllConnections();await new Promise(done=>server.close(done));
      writeFileSync(join(output,'native-startup-observation.json'),JSON.stringify(report,null,2));
    }
  }
}

async function assertPrecleanupWindowDiagnostics({faultOnly=false}={}) {
  if(process.platform!=='win32')return;
  const {chromium}=await import(pathToFileURL(resolve('node_modules/@playwright/test/index.mjs')).href);
  const output=mkdtempSync(join(journey.admitEvidenceParent(),'precleanup-diagnostic-guard-'));
  console.log('ST_LS_PRECLEANUP_DIAGNOSTICS='+output);
  const report={window_failures:[],events:[],episodes:[],status:'running',fixture:
    'owned inert document; actual focus precondition; exact auxiliary activation rejects before cleanup'};
  const begin=callerSource.indexOf('    const away=async(',callerSource.indexOf('export async function runLastStandJourney('));
  const end=callerSource.indexOf('    const saveAudio=',begin);
  assert.ok(begin>0 && end>begin,'Actual maintained away caller is required');
  const actualAway=new Function('native','page','observation','check','mark','noReplay','report','output',
    'retainAwayFailure','cleanupAwayAuxiliary','ensureOwnedNativeForeground','trace',callerSource.slice(begin,end)+'return away("blur",1);');
  writeFileSync(join(output,'actual-away-source.txt'),callerSource.slice(begin,end));
  let native,page,original;
  const documentState=target=>target.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  const observedPage=async target=>{
    const session=await native.context.newCDPSession(target);
    try {const info=await session.send('Target.getTargetInfo');
      return {target:info.targetInfo,document:await documentState(target)};
    } finally {await session.detach();}
  };
  const episode=async fault=>{
    // This genuine input targets only an inert owned page. It establishes a
    // positive document precondition; HWND foreground alone is insufficient.
    await page.bringToFront();await page.mouse.click(40,40);
    await journey.ensureOwnedNativeForeground({native,page,report,kind:'blur',role:'precleanup-precondition'});
    await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10000});
    const precondition=await observedPage(page);
    assert.equal(precondition.document.hidden,false);assert.equal(precondition.document.focused,true);
    const activation=new Error('declared exact-owned-aux activation failure');
    const activationStack=activation.stack,diagnostic=new Error('declared diagnostic observer failure');
    const cleanup=new Error('declared exact-owned-aux cleanup failure');
    const detach=new Error('declared away CDP detach failure');
    let aux,closes=0,detaches=0,caught;
    const observation={fault,precondition,activation:{message:activation.message,stack:activationStack},
      cleanupCalls:[],diagnosticCalls:0};report.episodes.push(observation);
    const created=other=>{
      aux=other;
      other.bringToFront=async()=>{observation.activationRejected=true;throw activation;};
      const close=other.close.bind(other);
      other.close=async()=>{
        closes++;observation.cleanupCalls.push({beforeClose:true,auxClosed:other.isClosed(),
          diagnostics:structuredClone(report.window_failures),original:await observedPage(page),auxiliary:await observedPage(other)});
        await close();if(fault)throw cleanup;
      };
    };
    native.context.on('page',created);
    const browser={newBrowserCDPSession:async()=>{
      const session=await native.browser.newBrowserCDPSession();
      if(fault){const release=session.detach.bind(session);session.detach=async()=>{detaches++;await release();throw detach;};}
      return session;
    }};
    const active=fault?{...native,browser}:native;
    try {
      await actualAway(active,page,async()=>({fixture:'inert; no gameplay observation'}),
        (condition,name)=>assert.ok(condition,name),()=>page.evaluate('performance.now()'),
        async()=>assert.fail('Activation failure cannot reach audio or interval acceptance'),report,output,
        fault?async()=>{observation.diagnosticCalls++;throw diagnostic;}:journey.retainAwayFailure,
        journey.cleanupAwayAuxiliary,async args=>{
          assert.equal(args.page,page,'Original precondition targets the canonical owned page');
          return journey.ensureOwnedNativeForeground({...args,native});
        },report.events);
    } catch(error){caught=error;observation.caught={message:error.message,stack:error.stack};}
    finally {native.context.off('page',created);observation.closes=closes;observation.detaches=detaches;
      observation.auxClosed=aux?.isClosed()??null;observation.afterCleanup=await observedPage(page);
      writeFileSync(join(output,fault?'fault.json':'target.json'),JSON.stringify(report,null,2));}
    assert.ok(observation.activationRejected,'Setup must reach the actual exact-owned-aux activation failure');
    assert.equal(closes,1,'The exact owned auxiliary is closed once');assert.equal(aux.isClosed(),true);
    assert.equal(caught,activation,'Original activation exception remains primary through diagnostics and cleanup');
    assert.equal(caught.stack,activationStack,'Original activation stack remains exact');
    if(fault) {
      assert.equal(observation.diagnosticCalls,1);assert.equal(detaches,1);
      assert.ok(report.window_diagnostic_failures.some(item=>item.message===diagnostic.message));
      assert.deepEqual(report.auxiliary_cleanup_failures.map(item=>item.message),[cleanup.message,detach.message]);
    } else {
      const beforeClose=observation.cleanupCalls[0];
      assert.equal(beforeClose.diagnostics.length,1,
        'Actual away failure must retain owned window/document diagnostics before auxiliary cleanup');
      const retained=beforeClose.diagnostics[0],receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
      assert.equal(retained.stage,'before-aux-cleanup');assert.equal(retained.kind,'blur');
      assert.equal(retained.primary_error.message,activation.message);assert.equal(retained.primary_error.stack,activationStack);
      assert.deepEqual(retained.ownership.root,receipt.root);assert.equal(retained.ownership.profile,receipt.profile);
      assert.equal(retained.original.target.targetId,precondition.target.targetId);
      assert.equal(retained.auxiliary.target.targetId,beforeClose.auxiliary.target.targetId);
      for(const item of [retained.original,retained.auxiliary]) {
        assert.equal(item.status,'observed');assert.equal(item.target.type,'page');
        assert.equal(typeof item.target.browserContextId,'string');
        assert.ok(Number.isInteger(item.window.windowId));
        assert.equal(typeof item.document.hidden,'boolean');assert.equal(typeof item.document.focused,'boolean');
        assert.ok(Number.isFinite(item.document.t));assert.ok(Number.isFinite(item.document.timeOrigin));
        assert.equal(item.native_window.status,'bound');assert.equal(item.native_window.window.pid,receipt.pid);
      }
      assert.equal(retained.native.status,'observed');assert.equal(typeof retained.native.foreground.hwnd,'string');
      assert.ok(Number.isInteger(retained.native.foreground.pid));
      assert.ok(retained.native.windows.every(item=>item.pid===receipt.pid));
      assert.equal(retained.auxiliary.document.closed,false);
      assert.ok(!retained.diagnostic_errors.length);
      assert.ok(Buffer.byteLength(JSON.stringify(report))<64*1024,'Diagnostic evidence remains bounded');
    }
  };
  try {
    native=await journey.ownedChrome(chromium,output);page=native.context.pages()[0];page.setDefaultTimeout(10_000);
    await page.goto('data:text/html,'+encodeURIComponent('<!doctype html><title>Owned precleanup diagnostics guard</title><button style="width:200px;height:100px">Inert focus target</button>'));
    await placeOwnedInertWindow({native,page,report,role:'precleanup-original',output});
    await journey.activateOwnedNativeWindow({native,page,report,kind:'setup',role:'precleanup-original'});
    if(!faultOnly)await episode(false);
    if(!process.env.LAST_STAND_PRECLEANUP_TARGET_ONLY)await episode(true);
    if(!faultOnly && !process.env.LAST_STAND_PRECLEANUP_TARGET_ONLY) {
      const refused={window_failures:[]};
      await journey.retainAwayFailure({native:{...native,browser:{}},page,other:page,kind:'blur',report:refused,error:new Error('ownership refusal fixture')});
      assert.equal(refused.window_failures[0].ownership.status,'refused');
      assert.equal(refused.window_failures[0].native.status,'unavailable');
      assert.equal(refused.window_failures[0].original.status,'unavailable');
      report.ownershipRefusal=refused;
    }
    report.status='pass';
  } catch(error){original=error;report.status='fail';report.error={message:error.message,stack:error.stack};throw error;}
  finally {
    try {if(native)await native.close();
      const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
      const cleanup=JSON.parse(readFileSync(join(output,'browser-cleanup.json'),'utf8'));
      report.cleanup={receipt,result:cleanup};assert.equal(receipt.status,'removed');assert.ok(!existsSync(receipt.profile));
      assert.equal(cleanup.status,'stopped');assert.deepEqual(cleanup.tree.remaining,[]);
    } catch(error){report.native_cleanup_error=String(error);if(!original)throw error;}
    finally {writeFileSync(join(output,'precleanup-observation.json'),JSON.stringify(report,null,2));}
  }
}

async function assertOwnedCaptionProofControls() {
  // Honest native-response fault fixtures; no actual pointer input or foreign activation.
  const pid=77,window={hwnd:'444',pid,kind:'Chrome_WidgetWin_1',measured:true,
    visible:true,minimized:false,left:20,top:30,width:800,height:600};
  const snapshot={dropped:0,windows:[window],foreground:{hwnd:'444',pid}};
  const caption={status:'proved',hwnd:'444',pid,rootHwnd:'444',rootPid:pid,
    x:660,y:46,hitTest:2,capture:'0',keysClear:true,rechecked:true};
  const input={size:40,expectedSize:40,count:3,sent:3,balanced:true};
  const accepted={attempted:true,accepted:true,status:'accepted',caption,input,snapshot,
    physical:physicalCaptionFixture(window,caption)};
  assert.doesNotThrow(()=>journey.assertOwnedNativeActivation(accepted,window,pid));
  const invalid=[{...accepted,caption:null},
    ...[{status:'covered'},{hitTest:1},{hitTest:20},{hwnd:'555'},{pid:88},
      {rootHwnd:'555'},{rootPid:88},{x:821},{y:631},{capture:'555'},
      {keysClear:false},{rechecked:false}].map(change=>({...accepted,caption:{...caption,...change}})),
    {...accepted,input:null},...[{size:28},{sent:2},{count:2},{balanced:false}]
      .map(change=>({...accepted,input:{...input,...change}}))];
  for(const result of invalid)assert.throws(()=>journey.assertOwnedNativeActivation(result,window,pid),
    'Covered, noncaption, unowned, captured, modified, stale or partial native input must refuse qualification');
}

function physicalCaptionFixture(window,caption) {
  // Fault-control records only. They are never passed to the native input path.
  const desktop={left:-1920,top:-1080,width:3840,height:2160};
  const point={...caption,cursorMeasured:true,contextVerified:true,desktopUnchanged:true,
    geometryUnchanged:true};
  return {context:'PER_MONITOR_AWARE_V2',entered:true,verified:true,restored:true,
    geometry:Object.fromEntries(['left','top','width','height'].map(key=>[key,window[key]])),
    desktop,mapping:{x:Math.round((caption.x-desktop.left)*65535/(desktop.width-1)),
      y:Math.round((caption.y-desktop.top)*65535/(desktop.height-1))},
    moveSent:1,downSent:1,upSent:1,
    beforeDown:{...point,stage:'before-down'},beforeUp:{...point,stage:'before-up'}};
}

async function assertPhysicalCaptionProofControls() {
  // Negative desktop origins exercise physical offsets, not primary-screen coordinates.
  const pid=77,window={hwnd:'444',pid,kind:'Chrome_WidgetWin_1',measured:true,
    visible:true,minimized:false,left:-1800,top:-900,width:800,height:600};
  const caption={status:'proved',hwnd:'444',pid,rootHwnd:'444',rootPid:pid,
    x:-1160,y:-884,hitTest:2,capture:'0',keysClear:true,rechecked:true};
  const accepted={attempted:true,accepted:true,status:'accepted',caption,
    input:{size:40,expectedSize:40,count:3,sent:3,balanced:true},
    snapshot:{dropped:0,windows:[window],foreground:{hwnd:'444',pid}},
    physical:physicalCaptionFixture(window,caption)};
  assert.doesNotThrow(()=>journey.assertOwnedNativeActivation(accepted,window,pid));
  const faults=[
    ['missing-physical',x=>delete x.physical],
    ...['entered','verified','restored'].map(key=>[key,x=>x.physical[key]=false]),
    ['wrong-context',x=>x.physical.context='SYSTEM_AWARE'],
    ['missing-geometry',x=>delete x.physical.geometry],
    ['geometry-drift',x=>x.physical.geometry.left++],
    ['missing-desktop',x=>delete x.physical.desktop],
    ['invalid-desktop',x=>x.physical.desktop.width=1],
    ['ambiguous-desktop',x=>x.physical.desktop.width=65537],
    ['offset-mapping',x=>x.physical.mapping.x=Math.round(caption.x*65535/3839)],
    ['mapping-drift',x=>x.physical.mapping.y++],
    ['missing-mapping',x=>delete x.physical.mapping],
    ['missing-down-proof',x=>delete x.physical.beforeDown],
    ['missing-up-proof',x=>delete x.physical.beforeUp],
    ...['beforeDown','beforeUp'].flatMap(stage=>[
      ...['cursorMeasured','contextVerified','desktopUnchanged','geometryUnchanged','keysClear','rechecked']
        .map(key=>[stage+'-'+key,x=>x.physical[stage][key]=false]),
      ...[{x:caption.x+1},{y:caption.y+1},{rootHwnd:'555'},{rootPid:88},{hitTest:1},
        {capture:'555'},{status:'covered'},{stage:'before-move'}].map((change,index)=>
          [stage+'-point-'+index,x=>Object.assign(x.physical[stage],change)])]),
    ...['moveSent','downSent','upSent'].map(key=>[key,x=>x.physical[key]=0])];
  for(const [name,mutate]of faults) {
    const invalid=structuredClone(accepted);mutate(invalid);
    assert.throws(()=>journey.assertOwnedNativeActivation(invalid,window,pid),
      'Physical caption proof must refuse '+name);
  }
  return faults.length;
}

async function assertOwnedCaptionExposureControls() {
  if(process.platform!=='win32')return;
  // Execute the maintained preparation, physical input and finally paths with inert externs.
  // This is behavioral evidence, never a native foreground or gameplay outcome.
  let source=callerSource.split("    Add-Type -TypeDefinition @'\n")[1]?.split("\n'@")[0];
  assert.ok(source,'Actual native preparation source required');
  let replaced=0;
  source=source.replace(/^  \[DllImport[^\n]+\] public static extern (.+?) (\w+)\((.*)\);$/gm,
    (line,type,name,params)=>{
      replaced++;
      const args=params.split(',').filter(x=>x.trim()).map(part=>{
        const words=part.trim().split(/\s+/);return (['out','ref'].includes(words[0])?words[0]+' ':'')+words.at(-1);
      }).join(', ');
      if(line.includes('kernel32.dll'))return '  public static '+type+' '+name+'('+params+') { throw new InvalidOperationException("Kernel admission must not run in the direct Activate seam"); }';
      return '  public static '+type+' '+name+'('+params+') { return Seam.'+name+'('+args+'); }';
    });
  assert.ok(replaced>=20 && !source.includes('[DllImport'),'All preparation externs must be inert');
  let seam=assertPhysicalCaptionNativeSeamControls.toString().split('const seam=`')[1]?.split('`;')[0];
  assert.ok(seam,'Preserved compiled fixture seam required');
  seam=seam.replace('public static string Mode;',
    'public static bool Topmost; public static int PrepareCalls, RestoreCalls, ForeignChanges; public static string Mode;')
    .replace('Mode=mode;Moves=',
      'Mode=mode;Topmost=mode=="initial-topmost";PrepareCalls=RestoreCalls=ForeignChanges=0;Moves=')
    .replace('public static IntPtr GetForegroundWindow() { return new IntPtr(444); }',
      'public static IntPtr GetForegroundWindow() { return new IntPtr(Ups>0 && Mode!="foreground-mismatch"?444:555); }')
    .replace(/public static IntPtr WindowFromPhysicalPoint\(Point point\) \{[^\n]+\}/,
      'public static IntPtr WindowFromPhysicalPoint(Point point) { return new IntPtr(Topmost && Mode!="covered-even-prepared"?444:555); }')
    .replace('public static bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags) { return true; }',`
    public static bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags) {
      if(window!=new IntPtr(444)){ForeignChanges++;return false;}
      if(x!=0 || y!=0 || width!=0 || height!=0 || (flags & 0x213)!=0x213)throw new InvalidOperationException("Geometry or activation flags changed");
      if(after==new IntPtr(-1)){
        PrepareCalls++;
        if(Mode=="prepare-exception")throw new InvalidOperationException("Preparation seam exception");
        if(Mode=="prepare-refused")return false;
        Topmost=Mode!="prepare-style-mismatch";return true;
      }
      if(after==new IntPtr(-2)){
        RestoreCalls++;
        if(Mode=="restore-exception")throw new InvalidOperationException("Restoration seam exception");
        if(Mode=="restore-refused")return false;
        Topmost=Mode=="restore-style-mismatch";return true;
      }
      return after==IntPtr.Zero;
    }`)
    .replace('public static IntPtr GetWindowLongPtr64(IntPtr window, int index) { return IntPtr.Zero; }',
      'public static IntPtr GetWindowLongPtr64(IntPtr window, int index) { return new IntPtr(Topmost?8:0); }')
    .replace('public static int GetWindowLong32(IntPtr window, int index) { return 0; }',
      'public static int GetWindowLong32(IntPtr window, int index) { return Topmost?8:0; }')
    .replace('if(flag==0xC001) { Moves++;',
      'if(flag==0xC001 && Mode=="input-exception")throw new InvalidOperationException("Input seam exception");\n        if(flag==0xC001) { Moves++;');
  source=source.slice(0,source.lastIndexOf('}'))+seam+'\n}';
  const script="$ErrorActionPreference='Stop';Add-Type -TypeDefinition @'\n"+source+"\n'@\n"+`
$taskFailures=@();$taskRows=@()
foreach($taskMode in @('valid-covered','initial-topmost','prepare-refused','prepare-exception','prepare-style-mismatch','covered-even-prepared','input-exception','restore-refused','restore-exception','restore-style-mismatch','foreground-mismatch')){
  [LastStandAwayWindowProbe+Seam]::Reset($taskMode);$taskResult=$null;$taskError=$null
  try{$taskResult=[LastStandAwayWindowProbe]::Activate(77,'444',20,30,800,600,[Func[bool]]{[LastStandAwayWindowProbe+Seam]::Identity()})}catch{$taskError=$_.Exception.Message}
  $taskPrepare=[LastStandAwayWindowProbe+Seam]::PrepareCalls;$taskRestore=[LastStandAwayWindowProbe+Seam]::RestoreCalls
  $taskDown=[LastStandAwayWindowProbe+Seam]::Downs;$taskUp=[LastStandAwayWindowProbe+Seam]::Ups
  $taskTopmost=[LastStandAwayWindowProbe+Seam]::Topmost;$taskPass=$false
  if($taskMode -eq 'initial-topmost'){$taskPass=-not $taskResult.accepted -and $taskPrepare -eq 0 -and $taskRestore -eq 0 -and $taskDown -eq 0 -and $taskTopmost}
  elseif($taskMode -eq 'valid-covered'){$taskPass=$taskResult.accepted -and $taskDown -eq 1 -and $taskUp -eq 1 -and $taskResult.input.sent -eq 3 -and $taskResult.input.balanced -and $taskResult.physical.presentation.normalBefore -and $taskResult.physical.presentation.applied -and $taskResult.physical.presentation.restored -and $taskResult.physical.presentation.normalAfter -and $taskPrepare -eq 1 -and $taskRestore -eq 1 -and -not $taskTopmost}
  else{
    $taskPass=-not $taskResult.accepted -and $taskPrepare -eq 1 -and $taskRestore -eq 1
    if($taskMode -like 'restore-*'){$taskPass=$taskPass -and $taskDown -eq 1 -and $taskUp -eq 1 -and $taskTopmost -and -not $taskResult.physical.presentation.restored}
    elseif($taskMode -eq 'foreground-mismatch'){$taskPass=$taskPass -and $taskDown -eq 1 -and $taskUp -eq 1 -and -not $taskTopmost}
    else{$taskPass=$taskPass -and $taskDown -eq 0 -and $taskUp -eq 0 -and -not $taskTopmost}
  }
  if($taskMode -in @('prepare-exception','input-exception')){$taskPass=$taskPass -and $null -ne $taskError}
  $taskPass=$taskPass -and [LastStandAwayWindowProbe+Seam]::ForeignChanges -eq 0 -and [LastStandAwayWindowProbe+Seam]::Context -eq [IntPtr]::new(-2)
  $taskRows+=@{mode=$taskMode;passed=$taskPass;prepare=$taskPrepare;restore=$taskRestore;topmost=$taskTopmost;down=$taskDown;up=$taskUp;result=$taskResult;error=$taskError;foreignChanges=[LastStandAwayWindowProbe+Seam]::ForeignChanges;flags=@([LastStandAwayWindowProbe+Seam]::Flags.ToArray())}
  if(-not $taskPass){$taskFailures+=$taskMode}
}
@{fixture='actual compiled preparation with inert externs; no native PASS';rows=$taskRows;failures=$taskFailures}|ConvertTo-Json -Depth 12 -Compress
`;
  const raw=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',
    '$taskScript=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($taskScript))'],
    {input:script,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024,windowsHide:true});
  const evidence=JSON.parse(raw);
  console.log('ST_LS_OWNED_CAPTION_EXPOSURE='+JSON.stringify({...evidence,actualCompiledSource:source}));
  assert.equal(evidence.rows.length,11);
  assert.deepEqual(evidence.failures,[],'Owned temporary presentation must expose, fail closed and restore through actual preparation');
}

async function assertPhysicalCaptionNativeSeamControls() {
  if(process.platform!=='win32')return;
  // Compile the actual driver control flow with every extern replaced by a bounded inert seam.
  // No user32 entry point remains, no real window exists and no native input is sent.
  let source=callerSource.split("    Add-Type -TypeDefinition @'\n")[1]?.split("\n'@")[0];
  assert.ok(source,'Actual native driver source required');
  let replaced=0;
  source=source.replace(/^  \[DllImport[^\n]+\] public static extern (.+?) (\w+)\((.*)\);$/gm,
    (line,type,name,params)=>{
      replaced++;
      const args=params.split(',').filter(x=>x.trim()).map(part=>{
        const words=part.trim().split(/\s+/);return (['out','ref'].includes(words[0])?words[0]+' ':'')+words.at(-1);
      }).join(', ');
      if(line.includes('kernel32.dll'))return '  public static '+type+' '+name+'('+params+') { throw new InvalidOperationException("Kernel admission must not run in the direct Activate seam"); }';
      return '  public static '+type+' '+name+'('+params+') { return Seam.'+name+'('+args+'); }';
    });
  assert.ok(replaced>=20 && !source.includes('[DllImport'),'All native externs must be inert in seam controls');
  const seam=`
  public static class Seam {
    public static string Mode; public static int Moves, Downs, Ups, UpAttempts;
    public static IntPtr Context = new IntPtr(-2); public static Point Cursor;
    public static List<uint> Flags = new List<uint>();
    public static void Reset(string mode) { Mode=mode;Moves=Downs=Ups=UpAttempts=0;Context=new IntPtr(-2);Cursor=new Point();Flags.Clear(); }
    public static bool Identity() { return !(Mode=="stale-after-move" && Moves>0); }
    public static bool EnumWindows(EnumProc callback, IntPtr parameter) { return callback(new IntPtr(444),parameter); }
    public static uint GetWindowThreadProcessId(IntPtr window, out uint pid) { pid=window==new IntPtr(444)?77u:88u;return 1; }
    public static IntPtr GetForegroundWindow() { return new IntPtr(444); }
    public static bool IsWindowVisible(IntPtr window) { return true; }
    public static bool IsIconic(IntPtr window) { return false; }
    public static bool GetWindowRect(IntPtr window, out Rect rect) { rect=new Rect {Left=20,Top=30,Right=820,Bottom=630};return true; }
    public static int GetClassName(IntPtr window, StringBuilder text, int count) { text.Append("Chrome_WidgetWin_1");return 18; }
    public static IntPtr WindowFromPoint(Point point) { return new IntPtr(444); }
    public static IntPtr WindowFromPhysicalPoint(Point point) { return new IntPtr(Mode=="covered" || (Mode=="covered-after-down" && Downs>0)?555:444); }
    public static IntPtr GetAncestor(IntPtr window, uint flags) { return window; }
    public static bool GetGUIThreadInfo(uint thread, ref GuiInfo info) { info.Capture=new IntPtr(Mode=="capture-after-move" && Moves>0?555:0);return true; }
    public static short GetAsyncKeyState(int key) { return (short)(Mode=="held-after-move" && Moves>0 && key==2?Int16.MinValue:0); }
    public static IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result) { result=new UIntPtr(Mode=="noncaption-after-move" && Moves>0?1u:2u);return new IntPtr(1); }
    public static bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags) { return true; }
    public static IntPtr GetWindowLongPtr64(IntPtr window, int index) { return IntPtr.Zero; }
    public static int GetWindowLong32(IntPtr window, int index) { return 0; }
    public static int GetSystemMetrics(int index) { return index==78?1920:index==79?1080:0; }
    public static bool GetCursorPos(out Point point) { point=Cursor;return true; }
    public static bool GetPhysicalCursorPos(out Point point) { point=Cursor;return Mode!="cursor-unavailable"; }
    public static IntPtr SetThreadDpiAwarenessContext(IntPtr context) { if(Mode=="context-unavailable")return IntPtr.Zero;var old=Context;Context=context;return old; }
    public static IntPtr GetThreadDpiAwarenessContext() { return Mode=="context-mismatch"?new IntPtr(-2):Context; }
    public static bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second) { return first==second; }
    public static bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorProc callback, IntPtr parameter) { var rect=new Rect {Right=Mode=="desktop-invalid"?1:1920,Bottom=1080};return callback(new IntPtr(1),IntPtr.Zero,ref rect,parameter); }
    public static uint SendInput(uint count, Input[] input, int size) {
      uint sent=0;
      foreach(var item in input) {
        uint flag=item.Data.Mouse.Flags;Flags.Add(flag);
        if(flag==0xC001) { Moves++;Cursor=new Point {X=(int)Math.Round(item.Data.Mouse.X*1919.0/65535)+(Mode=="cursor-mismatch"?1:0),Y=(int)Math.Round(item.Data.Mouse.Y*1079.0/65535)}; }
        if(flag==2) { Downs++; }
        if(flag==4) { UpAttempts++;if(Mode=="up-partial" && UpAttempts==1)break;Ups++; }
        sent++;
      }
      return sent;
    }
  }
`;
  source=source.slice(0,source.lastIndexOf('}'))+seam+'\n}';
  const script="$ErrorActionPreference='Stop';Add-Type -TypeDefinition @'\n"+source+"\n'@\n"+`
$taskFailures=@();$taskRows=@()
foreach($taskMode in @('cursor-mismatch','cursor-unavailable','context-unavailable','context-mismatch','desktop-invalid','stale-after-move','capture-after-move','held-after-move','noncaption-after-move','covered','covered-after-down','up-partial','valid')){
  [LastStandAwayWindowProbe+Seam]::Reset($taskMode)
  $taskResult=[LastStandAwayWindowProbe]::Activate(77,'444',20,30,800,600,[Func[bool]]{[LastStandAwayWindowProbe+Seam]::Identity()})
  $taskDown=[LastStandAwayWindowProbe+Seam]::Downs;$taskUp=[LastStandAwayWindowProbe+Seam]::Ups
  $taskPass=$false
  if($taskMode -eq 'valid'){$taskPass=$taskResult.accepted -and $taskDown -eq 1 -and $taskUp -eq 1 -and $taskResult.input.sent -eq 3 -and $taskResult.physical.restored}
  elseif($taskMode -eq 'covered-after-down'){$taskPass=-not $taskResult.accepted -and $taskDown -eq 1 -and $taskUp -eq 0 -and -not $taskResult.input.balanced}
  elseif($taskMode -eq 'up-partial'){$taskPass=-not $taskResult.accepted -and $taskDown -eq 1 -and $taskUp -eq 1 -and $taskResult.input.cleanupSent -eq 1 -and $taskResult.input.balanced}
  else{$taskPass=-not $taskResult.accepted -and $taskDown -eq 0 -and $taskUp -eq 0}
  $taskRows+=@{mode=$taskMode;passed=$taskPass;down=$taskDown;up=$taskUp;reason=$taskResult.reason;flags=@([LastStandAwayWindowProbe+Seam]::Flags.ToArray())}
  if(-not $taskPass){$taskFailures+=$taskMode}
}
@{fixture='compiled inert extern seams; no native GREEN';rows=$taskRows;failures=$taskFailures}|ConvertTo-Json -Depth 8 -Compress
if($taskFailures.Count -gt 0){throw ('Physical native seam assertion failed: '+($taskFailures -join ','))}
`;
  const result=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',
    '$taskScript=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($taskScript))'],
  {input:script,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,windowsHide:true});
  const evidence=JSON.parse(result);
  assert.equal(evidence.rows.length,13);assert.deepEqual(evidence.failures,[]);
  console.log('ST_LS_PHYSICAL_SEAM='+JSON.stringify(evidence));
}

async function assertPhysicalCaptionDynamicSeamControls() {
  if(process.platform!=='win32')return;
  // Dynamic faults execute the actual compiled driver. Every native extern is
  // inert before Add-Type; no real HWND, browser, cursor or SendInput exists.
  let source=callerSource.split("    Add-Type -TypeDefinition @'\n")[1]?.split("\n'@")[0];
  assert.ok(source,'Actual native driver source required for dynamic proof');
  let replaced=0;
  source=source.replace(/^  \[DllImport[^\n]+\] public static extern (.+?) (\w+)\((.*)\);$/gm,
    (line,type,name,params)=>{
      replaced++;
      const args=params.split(',').filter(x=>x.trim()).map(part=>{
        const words=part.trim().split(/\s+/);return (['out','ref'].includes(words[0])?words[0]+' ':'')+words.at(-1);
      }).join(', ');
      if(line.includes('kernel32.dll'))return '  public static '+type+' '+name+'('+params+') { throw new InvalidOperationException("Kernel admission must not run in the direct Activate seam"); }';
      return '  public static '+type+' '+name+'('+params+') { return Seam.'+name+'('+args+'); }';
    });
  assert.ok(replaced>=20 && !source.includes('[DllImport'),'All dynamic-control externs must be inert');
  const seam=`
  public static class Seam {
    public static string Stage, Drift; public static int Moves, Downs, Ups, UpAttempts, WindowDrifts, DesktopDrifts;
    public static IntPtr Context = new IntPtr(-2); public static Point Cursor;
    public static List<uint> Flags = new List<uint>();
    public static void Reset(string stage, string drift) { Stage=stage;Drift=drift;Moves=Downs=Ups=UpAttempts=WindowDrifts=DesktopDrifts=0;Context=new IntPtr(-2);Cursor=new Point();Flags.Clear(); }
    public static bool Changed() { return Stage=="after-move" && Moves>0 || Stage=="after-down" && Downs>0 || Stage=="cleanup" && UpAttempts>0; }
    public static bool Identity() { return true; }
    public static bool EnumWindows(EnumProc callback, IntPtr parameter) { return callback(new IntPtr(444),parameter); }
    public static uint GetWindowThreadProcessId(IntPtr window, out uint pid) { pid=window==new IntPtr(444)?77u:88u;return 1; }
    public static IntPtr GetForegroundWindow() { return new IntPtr(444); }
    public static bool IsWindowVisible(IntPtr window) { return true; }
    public static bool IsIconic(IntPtr window) { return false; }
    public static bool GetWindowRect(IntPtr window, out Rect rect) {
      rect=new Rect {Left=20,Top=30,Right=820,Bottom=630};
      if(Changed() && Drift.StartsWith("window-")) {
        WindowDrifts++;
        if(Drift=="window-left") { rect.Left+=3;rect.Right+=3; }
        if(Drift=="window-top") { rect.Top+=3;rect.Bottom+=3; }
        if(Drift=="window-width") rect.Right+=3;
        if(Drift=="window-height") rect.Bottom+=3;
      }
      return true;
    }
    public static int GetClassName(IntPtr window, StringBuilder text, int count) { text.Append("Chrome_WidgetWin_1");return 18; }
    public static IntPtr WindowFromPoint(Point point) { return new IntPtr(444); }
    public static IntPtr WindowFromPhysicalPoint(Point point) { return new IntPtr(444); }
    public static IntPtr GetAncestor(IntPtr window, uint flags) { return window; }
    public static bool GetGUIThreadInfo(uint thread, ref GuiInfo info) { info.Capture=IntPtr.Zero;return true; }
    public static short GetAsyncKeyState(int key) { return 0; }
    public static IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result) { result=new UIntPtr(2);return new IntPtr(1); }
    public static bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags) { return true; }
    public static IntPtr GetWindowLongPtr64(IntPtr window, int index) { return IntPtr.Zero; }
    public static int GetWindowLong32(IntPtr window, int index) { return 0; }
    public static int GetSystemMetrics(int index) { return index==78?1920:index==79?1080:0; }
    public static bool GetCursorPos(out Point point) { point=Cursor;return true; }
    public static bool GetPhysicalCursorPos(out Point point) { point=Cursor;return true; }
    public static IntPtr SetThreadDpiAwarenessContext(IntPtr context) { var old=Context;Context=context;return old; }
    public static IntPtr GetThreadDpiAwarenessContext() { return Context; }
    public static bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second) { return first==second; }
    public static bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorProc callback, IntPtr parameter) {
      var rect=new Rect {Right=1920,Bottom=1080};
      if(Changed() && (Drift.StartsWith("desktop-") || Drift=="monitor-layout")) {
        DesktopDrifts++;
        if(Drift=="desktop-left") { rect.Left-=100;rect.Right-=100; }
        if(Drift=="desktop-top") { rect.Top-=100;rect.Bottom-=100; }
        if(Drift=="desktop-width") rect.Right+=100;
        if(Drift=="desktop-height") rect.Bottom+=100;
        if(Drift=="monitor-layout") {
          if(!callback(new IntPtr(1),IntPtr.Zero,ref rect,parameter))return false;
          var second=new Rect {Left=-800,Top=0,Right=0,Bottom=600};
          return callback(new IntPtr(2),IntPtr.Zero,ref second,parameter);
        }
      }
      return callback(new IntPtr(1),IntPtr.Zero,ref rect,parameter);
    }
    public static uint SendInput(uint count, Input[] input, int size) {
      uint sent=0;
      foreach(var item in input) {
        uint flag=item.Data.Mouse.Flags;Flags.Add(flag);
        if(flag==0xC001) { Moves++;Cursor=new Point {X=(int)Math.Round(item.Data.Mouse.X*1919.0/65535),Y=(int)Math.Round(item.Data.Mouse.Y*1079.0/65535)}; }
        if(flag==2) Downs++;
        if(flag==4) { UpAttempts++;if(Stage=="cleanup" && UpAttempts==1)break;Ups++; }
        sent++;
      }
      return sent;
    }
  }
`;
  source=source.slice(0,source.lastIndexOf('}'))+seam+'\n}';
  const script="$ErrorActionPreference='Stop';Add-Type -TypeDefinition @'\n"+source+"\n'@\n"+`
$taskFailures=@();$taskRows=@()
foreach($taskStage in @('after-move','after-down','cleanup')){
  foreach($taskDrift in @('window-left','window-top','window-width','window-height','desktop-left','desktop-top','desktop-width','desktop-height','monitor-layout')){
    [LastStandAwayWindowProbe+Seam]::Reset($taskStage,$taskDrift)
    $taskResult=[LastStandAwayWindowProbe]::Activate(77,'444',20,30,800,600,[Func[bool]]{[LastStandAwayWindowProbe+Seam]::Identity()})
    $taskMove=[LastStandAwayWindowProbe+Seam]::Moves;$taskDown=[LastStandAwayWindowProbe+Seam]::Downs;$taskUp=[LastStandAwayWindowProbe+Seam]::Ups;$taskAttempts=[LastStandAwayWindowProbe+Seam]::UpAttempts
    $taskExpectedDown=1;if($taskStage -eq 'after-move'){$taskExpectedDown=0}
    $taskExpectedAttempts=0;if($taskStage -eq 'cleanup'){$taskExpectedAttempts=1}
    $taskExpectedReason='native-input-count-rejected';if($taskStage -eq 'after-move'){$taskExpectedReason='post-move-physical-proof-rejected'}
    $taskFlags=@([LastStandAwayWindowProbe+Seam]::Flags.ToArray());$taskExpectedFlags=@(49153)
    if($taskStage -ne 'after-move'){$taskExpectedFlags+=2};if($taskStage -eq 'cleanup'){$taskExpectedFlags+=4}
    $taskProof=$taskResult.physical
    $taskExpectedSent=1+$taskExpectedDown
    $taskDrifts=[LastStandAwayWindowProbe+Seam]::DesktopDrifts;if($taskDrift.StartsWith('window-')){$taskDrifts=[LastStandAwayWindowProbe+Seam]::WindowDrifts}
    $taskPass=-not $taskResult.accepted -and $taskResult.attempted -and $taskResult.status -eq 'rejected' -and $taskResult.reason -eq $taskExpectedReason -and
      $taskMove -eq 1 -and $taskDown -eq $taskExpectedDown -and $taskUp -eq 0 -and $taskAttempts -eq $taskExpectedAttempts -and $taskDrifts -gt 0 -and
      ($taskFlags -join ',') -eq ($taskExpectedFlags -join ',') -and $taskResult.input.size -eq 40 -and $taskResult.input.expectedSize -eq 40 -and $taskResult.input.count -eq 3 -and
      $taskResult.input.sent -eq $taskExpectedSent -and $taskResult.input.cleanupSent -eq 0 -and $taskResult.input.balanced -eq ($taskStage -eq 'after-move') -and
      $taskProof.context -eq 'PER_MONITOR_AWARE_V2' -and $taskProof.entered -and $taskProof.verified -and $taskProof.restored -and [LastStandAwayWindowProbe+Seam]::Context -eq [IntPtr](-2) -and
      $taskProof.moveSent -eq 1 -and $taskProof.downSent -eq $taskExpectedDown -and $taskProof.upSent -eq 0
    if($taskStage -eq 'after-move'){$taskPass=$taskPass -and $null -eq $taskProof.beforeDown -and $null -eq $taskProof.beforeUp}
    else {
      $taskP=$taskProof.beforeDown
      $taskPass=$taskPass -and $taskP.status -eq 'proved' -and $taskP.stage -eq 'before-down' -and $taskP.rootHwnd -eq '444' -and $taskP.rootPid -eq 77 -and $taskP.x -eq 420 -and $taskP.y -eq 46 -and
        $taskP.hitTest -eq 2 -and $taskP.capture -eq '0' -and $taskP.keysClear -and $taskP.rechecked -and $taskP.cursorMeasured -and $taskP.contextVerified -and $taskP.desktopUnchanged -and $taskP.geometryUnchanged
      if($taskStage -eq 'after-down'){$taskPass=$taskPass -and $null -eq $taskProof.beforeUp}
      else {
        $taskP=$taskProof.beforeUp
        $taskPass=$taskPass -and $taskP.status -eq 'proved' -and $taskP.stage -eq 'before-up' -and $taskP.rootHwnd -eq '444' -and $taskP.rootPid -eq 77 -and $taskP.x -eq 420 -and $taskP.y -eq 46 -and
          $taskP.hitTest -eq 2 -and $taskP.capture -eq '0' -and $taskP.keysClear -and $taskP.rechecked -and $taskP.cursorMeasured -and $taskP.contextVerified -and $taskP.desktopUnchanged -and $taskP.geometryUnchanged
      }
    }
    $taskId=$taskStage+':'+$taskDrift
    $taskRows+=@{id=$taskId;passed=$taskPass;driftMeasurements=$taskDrifts;move=$taskMove;down=$taskDown;up=$taskUp;upAttempts=$taskAttempts;flags=$taskFlags;result=$taskResult;restoredContext=[LastStandAwayWindowProbe+Seam]::Context.ToInt64()}
    if(-not $taskPass){$taskFailures+=$taskId}
  }
}
@{fixture='compiled inert dynamic geometry/desktop controls; no native GREEN';rows=$taskRows;failures=$taskFailures}|ConvertTo-Json -Depth 14 -Compress
if($taskFailures.Count -gt 0){throw ('Dynamic physical seam assertion failed: '+($taskFailures -join ','))}
`;
  const result=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',
    '$taskScript=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($taskScript))'],
  {input:script,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,windowsHide:true});
  const evidence=JSON.parse(result);
  assert.equal(evidence.rows.length,27);assert.deepEqual(evidence.failures,[]);
  console.log('ST_LS_DYNAMIC_PHYSICAL_SEAM='+JSON.stringify(evidence));
}

async function assertCurrentDeploymentHitSelection() {
  const unique=marker=>{
    const index=callerSource.indexOf(marker);
    assert.ok(index>=0 && callerSource.lastIndexOf(marker)===index,'One actual maintained source marker required: '+marker.trim());
    return index;
  };
  const guardBegin=unique('  const throwObserverFailure=');
  const guardEnd=unique('  const check = (condition, name, detail) => {');
  assert.ok(guardEnd>guardBegin,'Actual maintained observer guard declaration required');
  const observerGuard=callerSource.slice(guardBegin,guardEnd);
  const untilBegin=unique('    const until=async(items,start,predicate,seconds=110)=>{');
  const untilEnd=unique('    const focused=');
  const begin=unique("    await screenshot('00-garage');await phaseMatrix('garage');");
  const end=unique('    await page.waitForTimeout(750);');
  assert.ok(untilBegin>0 && untilEnd>untilBegin && begin>0 && end>begin,'Actual maintained baseline hit caller required');
  const run=new Function('assert','Date','page','hits','native','output','screenshot','phaseMatrix','mark','gameClick','check','startMotion','observerError',
    'journey','encounters','callbackRecords','cues','modelOracle',
    'return (async()=>{const player=true;const {observeFirstCannonImpact,observeFreshCannonAudio}=journey;'+
    observerGuard+'let motion;'+callerSource.slice(untilBegin,untilEnd)+callerSource.slice(begin,end)+'return {first,firstSound};})();');
  const oracle=journey.readBoundEncounterOracle()['repair:20'];
  const firstCannon=Object.values(oracle).find(row=>row.cannon>0);
  assert.equal(firstCannon.cannon,1);
  const current={load:16,timeOrigin:1791536368822,scope:'healthy'};
  const hit={tick:firstCannon.tick,cannonDamage:20,firstFoeHull:10,kills:firstCannon.kills,t:3000,...current};
  const old={...hit,load:15,timeOrigin:1791536308831.7};
  const fresh={...hit,t:4000};
  const deployed={...current,t:1010,action:'deploy',phase:'battle',profileVersion:'last-stand-waves-v1',saveState:'ready',
    runId:7,sessionRun:1,tick:0,activeTier:1,fittingId:'repair',cannonDamage:20,paused:false,speed:1};
  const model={...current,...oracle[0],t:1000,action:'deploy',run:1,fitting:'repair',rules:'last-stand-waves-v1:playable-prototype-v1'};
  const callback={...current,id:1,run:1,fromTick:firstCannon.tick-5,timestamp:4.25,previousTimestamp:3.75,
    priorPending:0,elapsed:.5,focused:true,applicationPaused:false,paused:false,failed:false};
  const cannon={...callback,action:'cue',cue:'cannon',tick:firstCannon.tick,steps:5,ordinal:1,
    played:true,reason:'played',admittedAt:4.25,t:3995};
  const callbackRecords=[{...callback,action:'begin',tick:callback.fromTick,steps:0,pending:.5,t:3990},cannon,
    {...cannon,cue:'impact',ordinal:2,t:3997},
    {...callback,action:'end',tick:callback.fromTick+10,steps:10,pending:0,t:4010}];
  const cues=[{...current,t:3996,text:'ST_LS_AUDIO event=cannon\n'},{...current,t:3998,text:'ST_LS_AUDIO event=impact\n'}];
  const cases=[
    {name:'old-document-before-boundary',before:[old],during:[],reject:true},
    {name:'same-document-before-boundary',before:[hit],during:[],reject:true},
    {name:'wrong-load-after-boundary',before:[],during:[{...fresh,load:15}],reject:true},
    {name:'wrong-origin-after-boundary',before:[],during:[{...fresh,timeOrigin:old.timeOrigin}],reject:true},
    {name:'wrong-damage-current',before:[],during:[{...fresh,cannonDamage:30}],reject:true,impactMismatch:true},
    {name:'fresh-current-during-deploy',before:[old,hit],during:[fresh],reject:false},
  ];
  const rows=[],failures=[];
  for(const fixture of cases) {
    const hits=[...fixture.before];let now=1000,deployCalls=0,selected,error;
    const page={evaluate:async()=>{},waitForTimeout:async ms=>{assert.equal(ms,40);now+=ms;}};
    const deploy=async(name,action)=>{
      assert.equal(name,'Deploy');assert.equal(action,'deploy');deployCalls++;
      hits.push(...fixture.during);return deployed;
    };
    try {selected=await run(assert,{now:()=>now},page,hits,{context:{}},'explicit-inert-output',
      async()=>{},async()=>{},async()=>now,deploy,(ok,name)=>assert.ok(ok,name),async()=>null,undefined,
      journey,[model],callbackRecords,cues,{'1:repair:20':oracle});}
    catch(cause){
      if(fixture.impactMismatch)assert.match(cause.message,/First authoritative cannon impact differs from deployment\/oracle/);
      else if(cause.message!=='Expected real runtime observation absent')throw cause;
      error=cause;
    }
    assert.equal(deployCalls,1,'Actual baseline Deploy caller must execute');
    const passed=fixture.reject?Boolean(error):selected?.first===fresh;
    if(error)assert.equal(now-1000,fixture.impactMismatch?0:45000,
      'Actual polling retains45s for absent hits; an observed contradictory impact fails immediately');
    if(!fixture.reject){
      assert.equal(selected.firstSound.events[0],cues[0]);assert.equal(selected.firstSound.events[1],cues[1]);
      assert.equal(selected.firstSound.callback.begin,callbackRecords[0]);
      assert.equal(selected.firstSound.callback.end,callbackRecords.at(-1));
    }
    const row={name:fixture.name,passed,rejected:Boolean(error),selected:selected??null,elapsedMs:now-1000,deployCalls};
    rows.push(row);if(!passed)failures.push(row);
  }
  console.log('ST_LS_CURRENT_DEPLOYMENT_HIT_SELECTION='+JSON.stringify({rows,failures,
    actualCaller:callerSource.slice(begin,end),actualUntil:callerSource.slice(untilBegin,untilEnd),fixture:'inert records/clock; no browser state or audio injection'}));
  assert.equal(failures.length,0,'Actual baseline selector must reject stale deployment/document hits and accept the fresh current hit');
  // Exercise the captured polling entry directly: Deploy precedes it in the
  // larger baseline excerpt, so this makes no pre-Deploy rejection claim.
  const observedUntil=new Function('observerError','Date','page',observerGuard+callerSource.slice(untilBegin,untilEnd)+
    'return until([],0,()=>false,45);');
  const firstError=new Error('declared first observer failure');
  let clockReads=0,waits=0,continued=0;
  await assert.rejects(async()=>{
    await observedUntil(firstError,{now:()=>{clockReads++;return 1000;}},
      {waitForTimeout:async()=>{waits++;assert.fail('Observer failure must reject before polling');}});
    continued++;
  },error=>error===firstError,'Actual polling entry must preserve the first observer error identity');
  assert.equal(clockReads,0,'Observer failure must reject before reading the polling clock');
  assert.equal(waits,0,'Observer failure must reject before waiting for a hit');
  assert.equal(continued,0,'Rejected polling cannot reach a later fixture continuation');
  console.log('ST_LS_CURRENT_DEPLOYMENT_OBSERVER_GUARD='+JSON.stringify({clockReads,waits,continued,
    actualGuard:observerGuard,fixture:'inert first-error identity at actual polling entry; no pre-Deploy or native qualification'}));
}

async function assertOriginalNativeForegroundPreconditions() {
  const focusedBegin=callerSource.indexOf('    const focused=async label=>{');
  const focusedEnd=callerSource.indexOf('    const screenshot=',focusedBegin);
  const awayBegin=callerSource.indexOf('    const away=async(',callerSource.indexOf('export async function runLastStandJourney('));
  const awayEnd=callerSource.indexOf('    const saveAudio=',awayBegin);
  assert.ok(focusedBegin>0 && focusedEnd>focusedBegin && awayBegin>0 && awayEnd>awayBegin);
  const gateBegin=callerSource.indexOf('async function waitForOwnedNativeForeground(');
  const gateEnd=callerSource.indexOf('\nexport async function activateOwnedNativeWindow(',gateBegin);
  const outcomes=[],failures=[];
  const runCase=async(caller,fault)=>{
    const root={pid:41001,ppid:41000,created:'inert-owned-process-epoch'};
    const bounds={left:10,top:10,width:1280,height:720,windowState:'normal'};
    const window={...bounds,hwnd:'41002',pid:root.pid,kind:'Chrome_WidgetWin_1',measured:true,visible:true,minimized:false};
    const foreign={hwnd:'61002',pid:61001};let foreground=fault==='positive'?{hwnd:window.hwnd,pid:root.pid}:foreign;
    let focused=true,auxCreated=0,activations=0,time=0,closed=false;
    const report={},browser={},owner={root,profile:'explicit-inert-owned-profile',executable:'explicit-inert-executable'};
    const document={hidden:false,hasFocus:()=>focused,visibilityState:'visible'};
    const contextForVM={document,performance:{now:()=>time,timeOrigin:100000}};
    const evaluate=async(expression,arg)=>runInNewContext(typeof expression==='function'?'('+expression.toString()+')(arg)':expression,{...contextForVM,arg});
    const page={context:()=>native.context,isClosed:()=>false,bringToFront:async()=>{focused=true;},evaluate,
      waitForFunction:async(predicate,arg)=>assert.ok(await evaluate(predicate,arg),'Honest inert document predicate'),
      waitForTimeout:async ms=>{time+=ms;}};
    const other={context:()=>native.context,isClosed:()=>closed,goto:async()=>{},bringToFront:async()=>{focused=false;},close:async()=>{closed=true;}};
    const session={send:async method=>{
      if(method==='Target.getTargetInfo')return {targetInfo:{type:'page',targetId:'inert-original-target',browserContextId:'inert-owned-context'}};
      if(method==='Browser.getWindowForTarget')return {windowId:41,bounds};
      if(method==='Target.createTarget'){auxCreated++;return {targetId:'inert-auxiliary-target'};}
      throw new Error('Unexpected inert native command '+method);
    },detach:async()=>{}};
    const native={browser,context:{newCDPSession:async()=>session,waitForEvent:async()=>other}};
    owner.context=native.context;browser.newBrowserCDPSession=async()=>session;
    const registry=new WeakMap([[browser,owner]]);
    const activate=async({role})=>{
      if(role==='original-precondition'){
        activations++;
        if(fault==='refusal')throw new Error('declared owned original establishment refusal');
        foreground=fault==='mismatch-pid'?{hwnd:window.hwnd,pid:foreign.pid}:{hwnd:foreign.hwnd,pid:root.pid};
      }else foreground=role==='original'?{hwnd:window.hwnd,pid:root.pid}:foreign;
    };
    // On broken source this dependency is never reached; actual caller admission
    // itself is the RED. On candidate source execute the new maintained gate.
    const ensure=gateBegin<0?async()=>{throw new Error('declared owned original establishment refusal');}:
      new Function('assert','process','ownedBrowserWindows','ownedProcessIdentity','ownedNativeWindowSnapshot',
        'bindOwnedNativeWindow','activateOwnedNativeWindow','retainWindowFailure','windowError',
        callerSource.slice(gateBegin,gateEnd).replace('export async function','async function')+'return ensureOwnedNativeForeground;')(
        assert,{platform:'win32'},registry,()=>root,()=>({foreground:{...foreground},windows:[window],dropped:0}),journey.bindOwnedNativeWindow,
        activate,(r,key,value)=>(r[key]??=[]).push(value),error=>({name:error.name,message:error.message}));
    const focusedCaller=new Function('process','native','page','report','check','ensureOwnedNativeForeground',
      callerSource.slice(focusedBegin,focusedEnd)+'return focused("inert native baseline");');
    const awayCaller=new Function('process','native','page','observation','check','mark','noReplay','report','output',
      'retainAwayFailure','cleanupAwayAuxiliary','activateOwnedNativeWindow','ensureOwnedNativeForeground','trace',
      callerSource.slice(awayBegin,awayEnd)+'return away("blur",10500);');
    const before={documentFocused:focused,documentHidden:document.hidden,nativeForeground:{...foreground}};
    let error;
    try{
      if(caller==='focused')await focusedCaller({platform:'win32'},native,page,report,(ok,name)=>assert.ok(ok,name),ensure);
      else await awayCaller({platform:'win32'},native,page,async()=>({inert:true}),(ok,name)=>assert.ok(ok,name),async()=>time,
        async()=>{},report,'explicit-inert-output',async()=>{},async({other})=>other?.close(),activate,ensure,[]);
    }catch(cause){error=cause;}
    const row={caller,fault,before,actualGate:gateBegin>=0,blocked:Boolean(error),error:error?.message,auxCreated,activations};
    outcomes.push(row);
    if(fault==='positive'){
      assert.equal(error,undefined);assert.equal(activations,0,'Positive exact foreground must not send physical input');
      assert.equal(report.native_foreground_preconditions.at(-1).status,'verified');
    }else{
      if(!error || (caller==='away' && auxCreated!==0))failures.push(row);
      if(error)assert.match(error.message,/establishment refusal|foreground.*verification|foreground.*mismatch/i);
    }
    return row;
  };
  for(const caller of ['focused','away'])for(const fault of ['refusal','mismatch-hwnd','mismatch-pid'])await runCase(caller,fault);
  console.log('ST_LS_ORIGINAL_FOREGROUND_CONTROLS='+JSON.stringify(outcomes));
  assert.equal(failures.length,0,'Actual helper must block DOM-focused baseline and auxiliary creation when original native foreground establishment is refused or mismatched');
  await runCase('focused','positive');await runCase('away','positive');
  console.log('ST_LS_ORIGINAL_FOREGROUND_POSITIVE='+JSON.stringify(outcomes.slice(-2)));
}

async function assertOwnedNativeForegroundDriver() {
  if(process.platform!=='win32')return;
  const {chromium}=await import(pathToFileURL(resolve('node_modules/@playwright/test/index.mjs')).href);
  const output=mkdtempSync(join(journey.admitEvidenceParent(),'native-foreground-guard-'));
  console.log('ST_LS_NATIVE_FOREGROUND='+output);
  const report={status:'running',fixture:'owned inert document; native foreground only; no gameplay/audio acceptance',
    events:[],snapshots:[],window_failures:[]};
  const begin=callerSource.indexOf('    const away=async(',callerSource.indexOf('export async function runLastStandJourney(')),end=callerSource.indexOf('    const saveAudio=',begin);
  assert.ok(begin>0 && end>begin,'Actual maintained away body required');
  writeFileSync(join(output,'actual-away-source.txt'),callerSource.slice(begin,end));
  const run=new Function('native','page','observation','check','mark','noReplay','report','output',
    'retainAwayFailure','cleanupAwayAuxiliary','activateOwnedNativeWindow','ensureOwnedNativeForeground','trace',callerSource.slice(begin,end)+'return away("blur",10500);');
  let native,page,other,original,marks=0,closes=0;
  const persist=()=>writeFileSync(join(output,'native-foreground-observation.json'),JSON.stringify(report,null,2));
  const observe=async label=>{
    const witness={window_failures:[]};
    await journey.retainAwayFailure({native,page,other:other??page,kind:'blur',report:witness,output,
      error:new Error('Passive native-foreground regression witness: '+label)});
    const record=witness.window_failures[0];record.label=label;report.snapshots.push(record);persist();
    assert.equal(record.ownership.status,'bound','Actual owned process/profile/context required');
    assert.equal(record.native.status,'observed','Actual native foreground capability required');
    for(const item of [record.original,record.auxiliary]) {
      assert.equal(item.status,'observed');assert.equal(item.native_window.status,'bound','Unique owned native HWND required');
    }
    assert.deepEqual(record.diagnostic_errors,[]);
    return record;
  };
  const created=aux=>{
    other=aux;
    const goto=aux.goto.bind(aux);
    aux.goto=async(...args)=>{
      const result=await goto(...args);
      await placeOwnedInertWindow({native,page:aux,report,role:'foreground-auxiliary',output});
      return result;
    };
    const close=aux.close.bind(aux);
    aux.close=async()=>{closes++;await observe('before-exact-aux-cleanup');await close();};
  };
  try {
    native=await journey.ownedChrome(chromium,output);page=native.context.pages()[0];page.setDefaultTimeout(10000);
    await page.setViewportSize({width:1280,height:720});
    await page.exposeFunction('__stNativeForegroundEvent',event=>{report.events.push(event);});
    await page.goto('data:text/html,'+encodeURIComponent('<!doctype html><title>Owned native foreground fixture</title><button style="width:200px;height:100px">Inert focus target</button><script>for(const kind of ["focus","blur","visibilitychange","pointerdown","pointerup"])addEventListener(kind,e=>window.__stNativeForegroundEvent({kind,hidden:document.hidden,focused:document.hasFocus(),trusted:e.isTrusted,t:performance.now(),timeOrigin:performance.timeOrigin}));</script>'));
    await placeOwnedInertWindow({native,page,report,role:'foreground-original',output});
    await journey.activateOwnedNativeWindow({native,page,report,kind:'setup',role:'foreground-original'});
    await page.bringToFront();await page.mouse.click(40,40);
    await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10000});
    await journey.ensureOwnedNativeForeground({native,page,report,kind:'guard-baseline',role:'original-precondition'});
    const pre=await observe('focused-visible-precondition');
    assert.equal(pre.original.document.hidden,false);assert.equal(pre.original.document.focused,true);
    assert.equal(pre.native.foreground.hwnd,pre.original.native_window.window.hwnd);
    assert.equal(pre.native.foreground.pid,pre.ownership.root.pid);
    native.context.on('page',created);
    const result=await run(native,page,async()=>({fixture:'inert; no gameplay state'}),
      (condition,name)=>assert.ok(condition,name),async()=>{
        const record=await observe(++marks===1?'actual-away-begin':'actual-original-recovery');
        const target=marks===1?record.auxiliary:record.original;
        assert.equal(record.native.foreground.hwnd,target.native_window.window.hwnd,
          marks===1?'Actual auxiliary HWND must be OS foreground during away':'Actual original HWND must be OS foreground on return');
        assert.equal(record.native.foreground.pid,record.ownership.root.pid);
        if(marks===1){assert.equal(record.original.document.hidden,false);assert.equal(record.original.document.focused,false);}
        else {assert.equal(record.original.document.hidden,false);assert.equal(record.original.document.focused,true);}
        return page.evaluate('performance.now()');
      },async()=>{report.inertNoReplaySeam=true;},report,output,journey.retainAwayFailure,
      journey.cleanupAwayAuxiliary,journey.activateOwnedNativeWindow,journey.ensureOwnedNativeForeground,report.events);
    assert.equal(marks,2);assert.equal(closes,1);assert.equal(other.isClosed(),true);
    assert.ok(result.recovered-result.begin>=10500,'Unchanged explicit away interval required');
    assert.equal(report.native_foreground_preconditions.length,2);
    assert.ok(report.native_foreground_preconditions.every(item=>item.status==='verified' && !item.activationNeeded &&
      item.after.foreground.hwnd===item.window.hwnd && item.after.foreground.pid===item.owner.root.pid));
    report.result=result;report.status='pass';persist();
  } catch(error){original=error;report.status='fail';report.error={name:error.name,message:error.message,stack:error.stack};persist();throw error;}
  finally {
    if(native)native.context.off('page',created);
    try {if(native)await native.close();
      const receipt=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
      const cleanup=JSON.parse(readFileSync(join(output,'browser-cleanup.json'),'utf8'));
      report.cleanup={receipt,result:cleanup};assert.equal(receipt.status,'removed');assert.ok(!existsSync(receipt.profile));
      assert.equal(cleanup.status,'stopped');assert.deepEqual(cleanup.tree.remaining,[]);
    } catch(error){report.cleanup_error=String(error);if(!original)throw error;}
    finally {report.marks=marks;report.closes=closes;persist();}
  }
}

async function assertNativeLaunchOptions() {
  const begin=callerSource.indexOf('export async function ownedChrome(');
  const end=callerSource.indexOf('\nfunction frameTiming',begin);
  assert.ok(begin>0 && end>begin,'Actual maintained native launcher is required');
  const source=callerSource.slice(begin,end).replace('export async function','async function');
  for(const platform of ['win32','linux']) {
    let captured;
    const stop=new Error('owned spawn options observed');
    const launch=runInNewContext(source+';ownedChrome',{
      process:{platform,env:{ProgramFiles:'C:/Program Files'}},join,assert,
      existsSync:()=>true,mkdtempSync:()=>'/owned-disposable-profile',tmpdir:()=>'/tmp',
      nativeChromeArgs:()=>['maintained-arguments'],
      spawn:(executable,args,options)=>{captured={executable,args,options};throw stop;},
    });
    await assert.rejects(launch({executablePath:()=>'/pinned/non-windows/chromium'},'/owned-output'),error=>error===stop);
    assert.equal(captured.options.windowsHide,platform!=='win32',
      'Only actual headed interactive Windows Chrome is visible; non-Windows launch option remains unchanged');
    assert.equal(JSON.stringify(captured.options.stdio),JSON.stringify(['ignore','pipe','pipe']));
    assert.equal(captured.executable,platform==='win32'
      ? join('C:/Program Files','Google/Chrome/Application/chrome.exe'):'/pinned/non-windows/chromium');
  }
  assert.match(callerSource,/maxBuffer:4\*1024\*1024,windowsHide:true/,'Noninteractive PowerShell remains hidden');
  assert.match(callerSource,/detached:true,stdio:'ignore',windowsHide:true/,'Background owned supervisor remains hidden');
  assert.ok(!journey.nativeChromeArgs('owned-guard-profile').some(value=>
    /disable-background|disable-renderer-backgrounding|disable-features=.*(?:Occlusion|IntensiveWakeUp)/i.test(value)),
    'Native startup cannot bypass browser idle or occlusion behavior');
  console.log('ST_LS_NATIVE_LAUNCH_SAFEGUARDS='+JSON.stringify({captured_platforms:['win32','linux'],
    hidden_noninteractive_helpers:true,native_idle_occlusion_preserved:true,native_linux_executed:false}));
}

async function assertPrecleanupNativeAdmission(setupSource=readFileSync(resolve('scripts/ci/lastStandBackground.test.mjs'),'utf8')) {
  const begin=setupSource.indexOf('  const episode=async fault=>{'),end=setupSource.indexOf('    const activation=new Error(',begin);
  const gateBegin=callerSource.indexOf('async function waitForOwnedNativeForeground(');
  const gateEnd=callerSource.indexOf('\nexport async function activateOwnedNativeWindow(',gateBegin);
  assert.ok(begin>0 && end>begin && gateBegin>0 && gateEnd>gateBegin,'Actual precleanup setup and maintained native gate required');
  const run=new Function('page','native','report','journey','observedPage','assert',
    setupSource.slice(begin,end)+'return precondition;};return episode(false);');
  const rows=[],failures=[];
  for(const fault of ['already-foreground','activation-required','wrong-browser-owner','wrong-page-owner',
    'wrong-process-owner','activation-refused','mismatch-hwnd','mismatch-pid']) {
    const root={pid:41001,ppid:41000,created:'inert-owned-process-epoch'};
    const bounds={left:10,top:10,width:1280,height:720,windowState:'normal'};
    const window={...bounds,hwnd:'41002',pid:root.pid,kind:'Chrome_WidgetWin_1',measured:true,visible:true,minimized:false};
    const foreign={hwnd:'61002',pid:61001},report={},browser={},order=[];
    let foreground=fault==='already-foreground'?{hwnd:window.hwnd,pid:root.pid}:{...foreign};
    let activations=0,gateCalls=0,domWaits=0,nativeDocumentWaits=0,gateCompleted=false,error;
    const document={hidden:false,hasFocus:()=>true,visibilityState:'visible'};
    const evaluate=async(expression,arg)=>runInNewContext(typeof expression==='function'?'('+expression.toString()+')(arg)':expression,
      {document,performance:{now:()=>1000,timeOrigin:100000},arg});
    const session={send:async method=>{
      if(method==='Target.getTargetInfo')return {targetInfo:{type:'page',targetId:'inert-original-target',browserContextId:'inert-owned-context'}};
      if(method==='Browser.getWindowForTarget')return {windowId:41,bounds};
      throw new Error('Unexpected inert setup command '+method);
    },detach:async()=>{}};
    const native={browser,context:{newCDPSession:async()=>session}};browser.newBrowserCDPSession=async()=>session;
    const owner={root,profile:'explicit-inert-owned-profile',executable:'explicit-inert-executable',context:native.context};
    const registry=new WeakMap(fault==='wrong-browser-owner'?[]:[[browser,owner]]);
    const page={context:()=>fault==='wrong-page-owner'?{}:native.context,isClosed:()=>false,evaluate,
      bringToFront:async()=>{order.push('bringToFront');},mouse:{click:async(x,y)=>{assert.equal(x,40);assert.equal(y,40);order.push('click');}},
      waitForFunction:async(predicate,arg,options)=>{
        if(gateCompleted){domWaits++;order.push('dom-wait');}else{nativeDocumentWaits++;order.push('native-document-wait');}
        assert.equal(options.timeout,10000);assert.ok(await evaluate(predicate,arg),'Honest inert DOM predicate');}};
    const actualGate=new Function('assert','process','ownedBrowserWindows','ownedProcessIdentity','ownedNativeWindowSnapshot',
      'bindOwnedNativeWindow','activateOwnedNativeWindow','retainWindowFailure','windowError',
      callerSource.slice(gateBegin,gateEnd).replace('export async function','async function')+'return ensureOwnedNativeForeground;')(
      assert,{platform:'win32'},registry,()=>fault==='wrong-process-owner'?{...root,created:'wrong-process-epoch'}:root,
      ()=>({foreground:{...foreground},windows:[window],dropped:0}),journey.bindOwnedNativeWindow,
      async({native:target,page:targetPage,role})=>{
        assert.equal(target,native);assert.equal(targetPage,page);assert.equal(role,'precleanup-precondition');
        activations++;order.push('owned-activation');
        if(fault==='activation-refused')assert.fail('declared exact-owned activation refusal');
        foreground=fault==='mismatch-hwnd'?{hwnd:foreign.hwnd,pid:root.pid}:
          fault==='mismatch-pid'?{hwnd:window.hwnd,pid:foreign.pid}:{hwnd:window.hwnd,pid:root.pid};
      },(r,key,value)=>(r[key]??=[]).push(value),cause=>({name:cause.name,message:cause.message}));
    const ensure=async args=>{gateCalls++;order.push('native-gate');const result=await actualGate(args);
      gateCompleted=true;order.push('native-verified');return result;};
    try {await run(page,native,report,{ensureOwnedNativeForeground:ensure},async()=>({document:await evaluate(()=>
      ({hidden:document.hidden,focused:document.hasFocus()}))}),assert);}
    catch(cause){error=cause;}
    const positive=['already-foreground','activation-required'].includes(fault),record=report.native_foreground_preconditions?.at(-1);
    const passed=positive?!error && gateCalls===1 && gateCompleted && domWaits===1 && nativeDocumentWaits===1 && record?.status==='verified' &&
      record.after.foreground.hwnd===window.hwnd && record.after.foreground.pid===root.pid &&
      order.indexOf('native-verified')<order.indexOf('dom-wait') && activations===(fault==='activation-required'?1:0):
      error?.name==='AssertionError' && gateCalls===1 && !gateCompleted && domWaits===0 && record?.status==='refused';
    const row={fault,passed:Boolean(passed),error:error?.message,order,gateCalls,domWaits,nativeDocumentWaits,activations,
      documentOnlyFocused:true,beforeNative:fault==='already-foreground'?{hwnd:window.hwnd,pid:root.pid}:foreign,afterNative:foreground};
    rows.push(row);if(!passed)failures.push(row);
  }
  console.log('ST_LS_PRECLEANUP_NATIVE_ADMISSION='+JSON.stringify({rows,failures,actualSetup:setupSource.slice(begin,end),
    actualGate:callerSource.slice(gateBegin,gateEnd),fixture:'honest inert ownership/native/document records; actual gate and setup; no native PASS or gameplay claim'}));
  assert.equal(failures.length,0,'Actual precleanup setup must verify exact owned native admission before its DOM wait and reject false document-only admission');
}

test('native document readiness retains original caller admission controls',async()=>{
  await assertPrecleanupNativeAdmission();
  await assertOriginalNativeForegroundPreconditions();
});

test('native document readiness waits after one admitted activation and revalidates exact ownership',async()=>{
  const gateBegin=callerSource.indexOf('export async function ensureOwnedNativeForeground(');
  const helperBegin=callerSource.indexOf('async function waitForOwnedNativeForeground(');
  const gateEnd=callerSource.indexOf('\nexport async function ownedChrome(',gateBegin);
  const focusedBegin=callerSource.indexOf('    const focused=async label=>{');
  const focusedEnd=callerSource.indexOf('    const screenshot=',focusedBegin);
  assert.ok(gateBegin>0 && gateEnd>gateBegin && focusedBegin>0 && focusedEnd>focusedBegin);
  const rows=[];
  for(const entry of ['focused','auxiliary','already-foreground'])for(const fault of ['delayed-visible','never-visible',
    'never-focused','new-document','hidden-again','reused-process','changed-target','changed-context','changed-window',
    'changed-hwnd','foreign-foreground-pid','foreign-foreground-hwnd']) {
    const root={pid:41001,ppid:41000,start:'inert-process-epoch',exe:'inert-browser.exe'};
    const bounds={left:10,top:10,width:1044,height:788,windowState:'normal'};
    const window={...bounds,hwnd:'41002',pid:root.pid,kind:'Chrome_WidgetWin_1',measured:true,visible:true,minimized:false};
    const target={type:'page',targetId:'inert-selected-page',browserContextId:'inert-context'};
    const report={},browser={},order=[];
    let foreground=entry==='already-foreground'?{pid:root.pid,hwnd:window.hwnd}:{pid:61001,hwnd:'61002'};
    let hidden=true,focused=true,t=8525,timeOrigin=100000,waited=false,activations=0,waits=0,detaches=0;
    const document={get hidden(){return hidden;},hasFocus:()=>focused,get visibilityState(){return hidden?'hidden':'visible';}};
    const evaluate=async(expression,arg)=>runInNewContext(typeof expression==='function'?'('+expression.toString()+')(arg)':expression,
      {document,performance:{now:()=>t,get timeOrigin(){return timeOrigin;}},arg});
    const session={send:async method=>{
      if(method==='Target.getTargetInfo')return {targetInfo:{...target,
        ...(waited&&fault==='changed-target'?{targetId:'foreign-page'}:{}),
        ...(waited&&fault==='changed-context'?{browserContextId:'foreign-context'}:{})}};
      if(method==='Browser.getWindowForTarget')return {windowId:waited&&fault==='changed-window'?99:41,bounds};
      assert.fail('Unexpected inert CDP method '+method);
    },detach:async()=>{detaches++;}};
    const native={browser,context:{newCDPSession:async()=>session}};browser.newBrowserCDPSession=async()=>session;
    const owner={root,profile:'inert-owned-profile',executable:root.exe,context:native.context};
    const page={context:()=>native.context,isClosed:()=>false,evaluate,bringToFront:async()=>{order.push('tab-selection');},
      waitForFunction:async(predicate,arg,options)=>{
        waits++;assert.equal(options.timeout,10000,'Retain the existing action timeout');
        if(waited){assert.ok(await evaluate(predicate,arg));return;}
        order.push('wait-document');assert.equal(await evaluate(predicate,arg),false,'The initial sample is genuinely hidden');
        waited=true;t=8992;hidden=fault==='never-visible';focused=fault!=='never-focused';
        if(fault==='new-document')timeOrigin++;
        if(!await evaluate(predicate,arg))throw new Error('inert document readiness timeout');
        if(fault==='hidden-again')hidden=true;
      }};
    const snapshot=(observedOwner,activate)=>{
      assert.equal(observedOwner,owner);
      if(activate){activations++;order.push('physical-activation');foreground={pid:root.pid,hwnd:window.hwnd};return {accepted:true};}
      order.push(waited?'native-recheck':'native-before');
      return {dropped:0,windows:[{...window,...(waited&&fault==='changed-hwnd'?{hwnd:'41003'}:{})}],
        foreground:waited&&fault==='foreign-foreground-pid'?{pid:61001,hwnd:window.hwnd}:
          waited&&fault==='foreign-foreground-hwnd'?{pid:root.pid,hwnd:'61002'}:{...foreground}};
    };
    const actual=new Function('assert','process','ownedBrowserWindows','ownedProcessIdentity','ownedNativeWindowSnapshot',
      'bindOwnedNativeWindow','assertOwnedNativeActivation','retainWindowFailure','windowError',
      callerSource.slice(helperBegin>=0?helperBegin:gateBegin,gateEnd).replaceAll('export async function','async function')+
      'return {ensureOwnedNativeForeground,activateOwnedNativeWindow};')(
      assert,{platform:'win32'},new WeakMap([[browser,owner]]),()=>{
        order.push(waited?'identity-recheck':'identity-before');return waited&&fault==='reused-process'?{...root,start:'reused-epoch'}:root;
      },snapshot,journey.bindOwnedNativeWindow,result=>assert.equal(result.accepted,true),
      (record,key,value)=>(record[key]??=[]).push(value),error=>({name:error.name,message:error.message}));
    const focusedCaller=new Function('process','native','page','report','check','ensureOwnedNativeForeground',
      callerSource.slice(focusedBegin,focusedEnd)+'return focused("inert delayed native visibility");');
    let error;
    try {
      if(entry==='auxiliary')await actual.activateOwnedNativeWindow({native,page,report,kind:'blur',role:'auxiliary'});
      else await focusedCaller({platform:'win32'},native,page,report,(ok,name)=>assert.ok(ok,name),actual.ensureOwnedNativeForeground);
    }catch(cause){error=cause;}
    const records=[...(report.native_activations??[]),...(report.native_foreground_preconditions??[])];
    const row={entry,fault,activations,waits,detaches,order,error:error?.message};rows.push(row);
    if(fault==='delayed-visible'){
      assert.equal(error,undefined,`${entry}: delayed genuine visibility must be awaited after exact native admission`);
      assert.ok(records.every(record=>record.status==='verified' && !record.document.hidden && record.document.focused));
      for(const record of records){
        assert.equal(record.document.timeOrigin,100000);assert.equal(record.after.foreground.pid,root.pid);
        assert.equal(record.after.foreground.hwnd,window.hwnd);
      }
      assert.ok(order.lastIndexOf('identity-recheck')>order.indexOf('wait-document'));
      assert.ok(order.lastIndexOf('native-recheck')>order.indexOf('wait-document'));
    }else {
      assert.ok(error,`${entry}/${fault}: document readiness cannot bypass exact ownership or foreground binding`);
      assert.ok(records.every(record=>record.status==='refused'),`${entry}/${fault}: failed readiness must not publish verified records`);
    }
    assert.equal(activations,entry==='already-foreground'?0:1,'Never retry activation or send additional input');
    assert.equal(detaches,entry==='focused'?4:2,'Every opened page/browser session is detached');
  }
  console.log('ST_LS_NATIVE_DOCUMENT_READINESS='+JSON.stringify({rows,fixture:'actual maintained callers with inert delayed document/native records; no browser or input'}));
});

test('Linux current-source qualification reaches fresh model compilation', () => {
  const begin=callerSource.indexOf('function qualifyCurrentEncounterSource(sources) {');
  const end=callerSource.indexOf('\nfunction canonicalEncounterCsv(',begin);
  assert.ok(begin>0 && end>begin,'The maintained current-source qualifier is required');
  const root=resolve('.');
  const completeSources=Object.fromEntries(WAVE_ORACLE_SOURCES.map(name=>[name,
    createHash('sha256').update(readFileSync(join(root,'campaign-unity/Unity/Assets/Scripts',name),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
  // Explicit inert Linux-host dispatch fixture. Export/source checks use real
  // files; compiler bytes/output below are mocks, never a compilation receipt.
  const exercise=({fresh=true,rows=13904,fields=13,compilerError=false,drift=false,
    subset=false,missingExport=false,wrongExport=false,dependencyDrift=false}={})=>{
    let compiled=0,toolRevision=0;
    const written=[];
    const sources=subset?Object.fromEntries(Object.entries(completeSources).slice(0,2)):{...completeSources};
    const manifestPath=join(root,'client/public/last-stand/asset-manifest.json');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    const receiptPath=join(root,manifest.source.receipt);
    const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
    const dependency='Content/LastStandEnemyCatalog.cs',entry=`Unity/Assets/Scripts/${dependency}`;
    if(missingExport)delete receipt.sourceFiles[entry];
    if(wrongExport)receipt.sourceFiles[entry].sha256='0'.repeat(64);
    const fixtureBytes=path=>{
      if(path===receiptPath)return Buffer.from(JSON.stringify(receipt));
      if(path===manifestPath)return Buffer.from(JSON.stringify({...manifest,source:{...manifest.source,
        receiptSha256:createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}}));
      return readFileSync(path);
    };
    const tools={mono:'/usr/bin/mono',csc:'/usr/lib/mono/4.5/mcs.exe'};
    const digest=path=>createHash('sha256').update(Object.values(tools).includes(path)
      ? Buffer.from(`inert-linux-tool-${toolRevision}`):fixtureBytes(path)).digest('hex');
    const context={assert,process:{platform:'linux'},ROOT:root,join,Object,sources,
      ENCOUNTER_COMPILATION_SOURCES:WAVE_ORACLE_SOURCES,
      encounterOracleToolchain:()=>tools,fileHash:digest,randomUUID:()=> 'inert-linux-qualifier',
      admitEvidenceParent:()=>tmpdir(),mkdirSync:()=>{},
      readFileSync:(path,...args)=>path.endsWith('model-oracle/binding.json') || path.endsWith('model-oracle\\binding.json')
        ? JSON.stringify({fresh_host_compilation:fresh,comparison:{rows,fields_per_row:fields}}):fixtureBytes(path).toString('utf8'),
      writeFileSync:(path,text)=>written.push({path,record:JSON.parse(text)}),
      buildEncounterOracle:()=>{compiled++;if(compilerError)throw new Error('Inert compiler failed');},
      changeTool:()=>{toolRevision++;},
      changeDependency:()=>{sources[dependency]='1'.repeat(64);receipt.sourceFiles[entry].sha256=sources[dependency];}};
    runInNewContext('let currentEncounterQualification;let qualifyingCurrentEncounter=false;'+
      callerSource.slice(begin,end)+'\nqualifyCurrentEncounterSource(sources);'+
      (drift?'changeTool();':'')+(dependencyDrift?'changeDependency();':'')+'qualifyCurrentEncounterSource(sources);',context);
    assert.equal(compiled,1,'Current inputs qualify once; cached inputs must still be checked');
    assert.equal(written.length,1);
    assert.equal(written[0].record.baseline.rows,13904);
    assert.equal(written[0].record.baseline.fields_per_row,13);
    return written[0].record;
  };
  assert.deepEqual(exercise().identity.sources,completeSources,
    'Inert Linux dispatch must bind all actual sources before fresh compilation and strict baseline admission');
  for(const invalid of [{fresh:false},{rows:13903},{fields:12}])assert.throws(()=>exercise(invalid),/baseline|parity/i);
  assert.throws(()=>exercise({compilerError:true}),/compiler failed/i);
  assert.throws(()=>exercise({drift:true}),/inputs drifted/i);
  assert.throws(()=>exercise({subset:true}),/compilation source closure/i);
  assert.throws(()=>exercise({missingExport:true}),/absent from genuine export/i);
  assert.throws(()=>exercise({wrongExport:true}),/absent from genuine export/i);
  assert.throws(()=>exercise({dependencyDrift:true}),/inputs drifted/i);
});

test('background guards reject frozen ticks and require separate native blur and hidden evidence', async () => {
  await assertPrecleanupNativeAdmission();
  await assertOriginalNativeForegroundPreconditions();
  const frozen=background();frozen.after.tick=20;
  assert.throws(()=>journey.validateBackgroundInterval(frozen), /background|elapsed|tick/i);
  assert.doesNotThrow(()=>journey.validateBackgroundInterval(background()));
  const blur=background();blur.kind='blur';blur.events=[event(1010,'blur',false,false),event(1350,'focus',false,true)];
  assert.doesNotThrow(()=>journey.validateBackgroundInterval(blur));
  for(const mutate of [x=>x.events=[],x=>x.kind='blur',x=>x.after.load=2,x=>x.after.timeOrigin++,
    x=>x.after.paused=true,x=>x.after.tick=38,x=>x.after.catchingUp=true,x=>x.after.callbackSteps=129,
    x=>x.after.hp=119,x=>x.after.kills=1,x=>x.after.cannon=1,x=>x.oracle=null]) {
    const invalid=background();mutate(invalid);assert.throws(()=>journey.validateBackgroundInterval(invalid));
  }
  const bundle=journey.encounterOraclePackage(),bound=journey.readBoundEncounterOracle();
  const reference=gunzipSync(Buffer.from(bundle.gzip_base64,'base64'));
  const digest=raw=>createHash('sha256').update(raw).digest('hex');
  const noBOM=reference.subarray(3),bom=Buffer.from([0xef,0xbb,0xbf]);
  assert.ok(reference.subarray(0,3).equals(bom),'The original portable raw-byte reference is unchanged');
  assert.equal(digest(reference),bundle.output_sha256);
  assert.equal(noBOM.toString('utf8').split('\r\n').length-1,13904);
  assert.ok(noBOM.toString('utf8').split('\r\n').slice(0,-1).every(line=>line.split(',').length===13));
  // Execute the actual maintained compilation caller's admission statement on
  // the exact bytes of the preserved first failure (reference[3:]). This is an
  // explicit serialization fixture, never a replacement model/compiler output.
  const admissionBegin=callerSource.indexOf("  const raw=execute('run',[exe]);");
  const admissionEnd=callerSource.indexOf('  for(const [path,sha]of Object.entries(before))',admissionBegin);
  assert.ok(admissionBegin>0 && admissionEnd>admissionBegin,'Actual compiler admission statement is required');
  const actualAdmission=new Function('execute','exe','writeFileSync','join','directory','hash','assert',
    'ENCOUNTER_ORACLE_PACKAGE','admitEncounterOracleOutput',callerSource.slice(admissionBegin,admissionEnd)+
    'return typeof admission === "undefined" ? null : admission;');
  const admitThroughCaller=raw=>actualAdmission(()=>raw,'fixture-exe',()=>{},join,'explicit-serialization-fixture',
    digest,assert,bundle,journey.admitEncounterOracleOutput);
  assert.doesNotThrow(()=>admitThroughCaller(noBOM),
    'Actual production admission must accept the unchanged first failed non-BOM CSV bytes');
  assert.deepEqual(admitThroughCaller(noBOM).profiles,bound);
  // Real maintained caller regression: compiler/run failures cannot stand in
  // for admission. Retain the natural redirected bytes and encoding receipt.
  const parent=process.env.LAST_STAND_JOURNEY_GUARD_EVIDENCE??tmpdir();mkdirSync(parent,{recursive:true});
  const output=mkdtempSync(join(parent,'compiled-model-'));
  console.log('ST_LS_MODEL_ORACLE='+output);
  let compiled;
  assert.doesNotThrow(()=>{compiled=journey.buildEncounterOracle(output);},
    'Fresh unchanged model output must admit one optional leading UTF-8 BOM');
  assert.deepEqual(compiled,bound,'All compiled profile/model fields must equal the unchanged reference');
  const binding=JSON.parse(readFileSync(join(output,'model-oracle/binding.json'),'utf8'));
  if(['win32','linux'].includes(process.platform)) {
    const raw=readFileSync(join(output,'model-oracle/actual-model.csv'));
    assert.equal(binding.output_sha256,digest(raw),'Actual raw output hash must be retained');
    assert.ok(binding.comparison,'The maintained caller must retain explicit encoding/comparison provenance');
    assert.equal(binding.comparison.actual.raw_sha256,digest(raw));
    assert.equal(binding.comparison.reference.raw_sha256,bundle.output_sha256);
    assert.equal(binding.comparison.canonical_sha256,digest(noBOM));
    assert.equal(binding.comparison.encoding,'UTF-8');
    assert.equal(binding.comparison.normalization,'one optional leading EF BB BF only');
    assert.equal(binding.comparison.rows,13904);
    assert.equal(binding.comparison.fields_per_row,13);
    assert.equal(binding.fresh_host_compilation,true);
  }
  assert.equal(binding.host,process.platform);
  for(const raw of [reference,noBOM]) {
    const admitted=journey.admitEncounterOracleOutput(raw);
    assert.deepEqual(admitted.profiles,bound);
    assert.deepEqual(admitThroughCaller(raw),admitted,'Actual caller must share the same strict admission');
    assert.equal(admitted.comparison.actual.raw_sha256,digest(raw));
    assert.equal(admitted.comparison.actual.leading_utf8_bom,raw===reference);
    assert.equal(admitted.comparison.canonical_sha256,digest(noBOM));
  }
  const changedHull=Buffer.from(noBOM);changedHull[13]='1'.charCodeAt(0);
  for(const corrupt of [changedHull,Buffer.concat([bom,reference]),Buffer.concat([Buffer.from(' '),noBOM]),
    Buffer.concat([noBOM,Buffer.from(' ')]),noBOM.subarray(0,-2),
    Buffer.from(noBOM.toString('utf8').replace(/\r\n/g,'\n')),Buffer.concat([noBOM.subarray(0,20),bom,noBOM.subarray(20)]),
    Buffer.concat([Buffer.from([0xff]),noBOM.subarray(1)])])
    {
      assert.throws(()=>journey.admitEncounterOracleOutput(corrupt),/model|reference|CSV|UTF-8|bytes/i);
      assert.throws(()=>admitThroughCaller(corrupt),/model|reference|CSV|UTF-8|bytes/i);
    }
  assert.throws(()=>journey.admitEncounterOracleOutput(noBOM,{...bundle,output_sha256:digest(noBOM)}),/reference|bytes/i);
  assert.throws(()=>journey.admitEncounterOracleOutput(noBOM,bundle,
    {...bundle.source_lf_sha256,'EncounterModel.cs':'0'.repeat(64)}),/source|binding/i);
  assert.match(callerSource,/const admission=admitEncounterOracleOutput\(raw\);/,
    'The real compiler caller must use the maintained serialization boundary');
  assert.deepEqual(bound['repair:20'][20],oracle[20]);assert.deepEqual(bound['repair:20'][28],oracle[28]);
  assert.throws(()=>journey.readBoundEncounterOracle({...bundle,output_sha256:'0'.repeat(64)}),/reference|bytes/i);
  const wrongSource={...bundle.source_lf_sha256,'EncounterModel.cs':'0'.repeat(64)};
  assert.throws(()=>journey.readBoundEncounterOracle(bundle,wrongSource),/source|binding/i);
  const broken=structuredClone(bundle);broken.source_lf_sha256['EncounterProfile.cs']='0'.repeat(64);
  assert.throws(()=>journey.readBoundEncounterOracle(broken),/source|binding/i);

  // Exact unchanged owner ticks20/21 prove the real cadence seam: return the
  // actually paired tick20 with its own timestamp; never relabel it as tick21.
  const cadence=witness();let actual;
  await assert.doesNotReject(async()=>{actual=await callObserved(cadence);},'Actual caller must accept differing producer cadences');
  assert.equal(actual.tick,20);assert.equal(actual.t,1000);assert.equal(actual.loop.tick,20);
  assert.equal(actual.loop.t,1000.01);assert.equal(actual.loop.runId,19);
  journey.validateModelObservation(actual,cadence.model);
  const waiting=witness();waiting.states.splice(-2,1);
  waiting.onWait=()=>{waiting.now=2005;waiting.encounters.push(waiting.encounter(40));waiting.states.push(waiting.state(40));};
  assert.equal((await callObserved(waiting)).tick,40,'A missing pair awaits actual subsequent producer records');
  assert.ok(waiting.waits>0);
  for(const mutate of [x=>x.encounters.at(-1).load=2,x=>x.states.forEach(s=>s.load=2),
    x=>x.origin++,x=>x.encounters.at(-1).timeOrigin++,x=>x.states.forEach(s=>s.timeOrigin++),
    x=>x.states.forEach(s=>s.sessionRun=2),x=>x.encounters.at(-1).run=2,
    x=>x.states.at(-2).runId=18,x=>x.now=5000,x=>x.states.splice(-2,1),
    x=>x.states.at(-2).hull--,x=>x.states.at(-2).kills++,x=>x.states.at(-2).paused=true,
    x=>x.states.at(-2).t=999,x=>x.encounters.at(-1).t=1100,
    x=>x.encounters.shift(),x=>x.states[0].runId=18]) {
    const invalid=witness();mutate(invalid);
    await assert.rejects(async()=>callObserved(invalid),/coherent|observation|clock|pair|counter/i);
  }
  // The real console caller associates only observed session-run provenance.
  const consoleBegin=callerSource.indexOf("    page.on('console', message => {");
  const consoleEnd=callerSource.indexOf("    page.on('pageerror'",consoleBegin);
  assert.ok(consoleBegin>0 && consoleEnd>consoleBegin);
  let consoleHandler;const records={states:[],encounters:[],hits:[],layouts:[],cues:[],callbackRecords:[]};
  new Function('page','messages','load','scope','states','encounters','hits','layouts','cues','trace','callbackRecords','retainRuntimeObservation','retainObserverFailure',
    callerSource.slice(consoleBegin,consoleEnd))({on:(name,handler)=>{consoleHandler=handler;}},[],1,'healthy',
    records.states,records.encounters,records.hits,records.layouts,records.cues,[],records.callbackRecords,
    journey.retainRuntimeObservation,(_record,error)=>{throw error;});
  const emit=(tag,record,t=1000,timeOrigin=100000)=>consoleHandler({type:()=> 'log',location:()=>({}),
    text:()=> 'ST_TEST_RUNTIME '+JSON.stringify({t,timeOrigin,text:tag+JSON.stringify(record)})});
  emit('ST_ENC_STATE ',cadence.encounter(20));emit('ST_LS_STATE ',cadence.state(20),1000.01);
  assert.equal(records.states.at(-1).sessionRun,1);
  emit('ST_LS_STATE ',cadence.state(21),1050,200000);
  assert.equal(records.states.at(-1).sessionRun,null,'Different document cannot borrow the prior observed run');
  await assertOwnedCaptionProofControls();
  await assertPhysicalCaptionProofControls();
  await assertOwnedCaptionExposureControls();
  await assertPhysicalCaptionNativeSeamControls();
  await assertPhysicalCaptionDynamicSeamControls();
  await assertOwnedNativeStartup();
  await assertNativeLaunchOptions();
  await assertConfiguredRejoinBoundary();
  await assertPrecleanupWindowDiagnostics();
  await assertOwnedNativeForegroundDriver();
});

test('background guards reject counted explicit Pause and automatic foreground resume', async () => {
  // The charged-time observation is otherwise an exact actual-model tick 228.
  // Model-shape rejection cannot accidentally stand in for paused-time proof.
  const charged=pause();Object.assign(charged.after,oracle[228]);
  assert.throws(()=>journey.validateExplicitPause(charged), /pause|elapsed|tick/i);
  assert.doesNotThrow(()=>journey.validateExplicitPause(pause()));
  for(const mutate of [x=>x.returned.paused=false,x=>x.returned.hull=119,x=>x.returned.kills=1,
    x=>x.returned.terminalElapsed=.1,x=>x.resumed.tick++,x=>x.resumed.t=9000,x=>x.events=[]]) {
    const invalid=pause();mutate(invalid);assert.throws(()=>journey.validateExplicitPause(invalid));
  }
  const keys=['keydown','keyup'].map(kind=>({kind,area:'gameplay-keyboard',code:'Enter',target:'unity-canvas',focused:true,hidden:false}));
  const actions=[{name:'Pause',keys:['Enter']}];
  assert.doesNotThrow(()=>journey.validateKeyboardGameplayInput(keys,actions));
  for(const invalid of [[],[...keys,...keys],keys.map(x=>({...x,hidden:true})),keys.map(x=>({...x,target:'last-stand-return'})),
    keys.map(x=>({...x,code:'Space'})),[...keys,{kind:'pointerdown',area:'gameplay-keyboard'}]])
    assert.throws(()=>journey.validateKeyboardGameplayInput(invalid,actions));
  const pausedPair=witness();pausedPair.states.pop();pausedPair.encounters.at(-1).paused=true;
  pausedPair.encounters.at(-1).action='pause';pausedPair.encounters.at(-1).reason='user';pausedPair.states.at(-1).paused=true;
  pausedPair.now=11055;
  const observed=await callObserved(pausedPair,{action:'pause',paused:true});
  assert.equal(observed.t,1000,'Immutable paused pair keeps the real emission timestamp');
  assert.ok(observed.paused);
  await assert.rejects(async()=>callObserved(pausedPair,{action:'pause',paused:false}),/coherent|pair|observation/i);
  const resumedPair=witness();resumedPair.encounters.at(-1).action='pause';
  resumedPair.encounters.push(resumedPair.encounter(40));resumedPair.states.push(resumedPair.state(40));resumedPair.now=2055;
  const resumeEvent=await callObserved(resumedPair,{action:'pause',paused:false,minT:1000,run:1});
  assert.equal(resumeEvent.tick,20,'Resume anchor remains the real action pair after later ticks');
  assert.equal(resumeEvent.t,1000);
  // Every material caller awaits this same boundary; ad-hoc latest-array
  // merges may not bypass document/run/tick admission for Pause or intervals.
  assert.doesNotMatch(callerSource,/=(?:\s*)observation\(/);
  assert.match(callerSource,/const layoutPause=await battleLayouts\(/);
  assert.match(callerSource,/pauseBefore=layoutPause\?\.before\?\?await observation\(/);
  assert.match(callerSource,/pausedObservation=layoutPause\?\.paused\?\?await observation\(/);
  assert.match(callerSource,/resumed=await observation\(/);
  assert.match(callerSource,/const pauseAfter=await observation\(/);
  assert.match(callerSource,/resumed,after:pauseAfter,events:trace,oracle:reference\(resumed\)/);
  assert.match(callerSource,/const before=await observation\(/);
  assert.match(callerSource,/const after=await observation\(/);
});

test('background guards reject duplicate terminal staging and manual Claim awards', async () => {
  const duplicate=terminal();duplicate.states.splice(1,0,{...duplicate.states[0]});
  assert.throws(()=>journey.validateTerminalOwnership(duplicate), /terminal|staging|duplicate/i);
  assert.doesNotThrow(()=>journey.validateTerminalOwnership(terminal()));
  for(const mutate of [x=>x.states.push({...x.states.at(-1)}),x=>x.claimed.credits=2,
    x=>x.pending.pendingDefeat.reward=2,x=>x.states[0].wallet=1,x=>x.states[1].saveState='failed',
    x=>x.controls[0].active=x.controls[0].interactable=true]) {
    const invalid=terminal();mutate(invalid);assert.throws(()=>journey.validateTerminalOwnership(invalid));
  }
  const bytes={'asset-manifest.json':'1'.repeat(64),'Build/player.wasm':'2'.repeat(64),'index.html':'3'.repeat(64)};
  assert.doesNotThrow(()=>journey.assertPackagedRuntimeParity(bytes,{...bytes}));
  for(const after of [{...bytes,'Build/player.wasm':'0'.repeat(64)},Object.fromEntries(Object.entries(bytes).slice(1)),
    {...bytes,'ui-native-binding.json':'4'.repeat(64)}])
    assert.throws(()=>journey.assertPackagedRuntimeParity(bytes,after),/runtime|drift/i);
  const ended=witness(),last=Object.values(ended.model).at(-1);
  ended.encounters=[ended.encounters[0],{...ended.encounter(last.tick),action:'terminal'},
    {...ended.encounter(0),t:last.tick*50+500,status:'Fitting',action:'return'}];
  ended.states=[ended.states[0],{...ended.state(last.tick),phase:'settling',runId:0,pendingRunId:19},
    {...ended.state(0),t:last.tick*50+500.01,phase:'result',runId:0,pendingRunId:19}];
  ended.now=last.tick*50+1000;
  const terminalPair=await callObserved(ended,{status:'Defeated',minT:1000,run:1});
  assert.equal(terminalPair.tick,last.tick);assert.equal(terminalPair.loop.pendingRunId,19);
  journey.validateModelObservation(terminalPair,ended.model);
  const another={...ended,encounters:structuredClone(ended.encounters),states:structuredClone(ended.states)};
  another.encounters.at(-1).run=2;another.states.at(-1).sessionRun=2;
  await assert.rejects(async()=>callObserved(another,{status:'Defeated',minT:1000,run:1}),/coherent|pair|observation/i);
  // Current wave runs finalize without a legacy PendingDefeat. Both real
  // terminal callers must forward the fresh pre-terminal pair, observed result,
  // stored envelope and raw streams to the source-bound terminal validator.
  for(const [before,result,saved,proof,oracle] of [
    ['terminalBefore','naturalResult','naturalSaved','naturalProof','terminalOracle'],
    ['backgroundBefore','backgroundResult','backgroundFinal','backgroundProof','backgroundOracle'],
  ]) {
    assert.match(callerSource,new RegExp(`const ${before}=await observation\\(`));
    assert.match(callerSource,new RegExp(`const ${result}=await until\\(states,`));
    assert.match(callerSource,new RegExp(`const ${saved}=JSON\\.parse\\(await page\\.evaluate`));
    const begin=callerSource.indexOf(`    const ${proof}=validateWaveTerminal(`);
    const end=callerSource.indexOf(';',begin);
    assert.ok(begin>0 && end>begin,'Actual maintained wave terminal proof caller required');
    const inputs=Object.fromEntries([before,result,saved,'states','encounters','layouts',oracle].map(name=>[name,{name}]));
    const invoke=new Function(...Object.keys(inputs),'validateWaveTerminal',
      callerSource.slice(begin,end+1)+`return ${proof};`);
    assert.deepEqual(invoke(...Object.values(inputs),value=>value),{
      before:inputs[before],result:inputs[result],saved:inputs[saved],states:inputs.states,
      encounters:inputs.encounters,layouts:inputs.layouts,oracle:inputs[oracle],
    });
  }
});

async function assertNativeAudioBoundaries() {
  const begin=callerSource.indexOf('    const noReplay=async('),end=callerSource.indexOf('    const saveAudio=',begin);
  assert.ok(begin>0 && end>begin,'Actual maintained away/noReplay caller required');
  const run=new Function('native','page','observation','check','mark','report','output','trace','cues','states','encounters','load',
    'energy','validateNoReplayAudio','validateAwayAudioReturn','reference','activateOwnedNativeWindow',
    'ensureOwnedNativeForeground','retainAwayFailure','cleanupAwayAuxiliary','kind','callbackRecords',
    callerSource.slice(begin,end)+'return away(kind,6000);');
  const oracle=journey.readBoundEncounterOracle()['repair:20'];
  const identity={load:16,timeOrigin:100000,scope:'healthy'},loopRun=3,sessionRun=1;
  const loss=1000,returned=7250,recovered=9500,rows=[],failures=[];
  const cases=['fresh-current','quiet-return','background-energy','foreground-gap-energy','background-cue',
    'unmatched-return-cue','duplicate-return-cue','old-model-tick','catch-up-callback','paused-callback','muted-callback',
    'wrong-cue-load','wrong-cue-origin','missing-loss','missing-return','element-loss','element-return',
    'stale-loss','wrong-boundary-load','wrong-boundary-origin','invalid-boundary-clock','short-real-unfocused-span'];
  for(const kind of ['blur','hidden'])for(const fault of cases) {
    const trace=[],cues=[],states=[],encounters=[],callbackRecords=[],report={lifecycle:[]},windows=[];
    const before={...oracle[700],...identity,t:900,run:sessionRun,fitting:'repair',paused:false,
      loop:{runId:loopRun,cannonDamage:20}};
    let time=950,focused=true,hidden=false,closed=false,marks=0,auxClosed=0,auxCreated=0;
    const event=(type,t,values={})=>({kind:type,t,...identity,globalTarget:true,target:'',focused:false,hidden:kind==='hidden',...values});
    const emitLoss=()=>{
      let e=event(kind==='blur'?'blur':'visibilitychange',loss);
      if(fault==='missing-loss')return;
      if(fault==='element-loss')e.globalTarget=false;
      if(fault==='stale-loss')e.t=800;
      if(fault==='wrong-boundary-load')e.load=15;
      if(fault==='wrong-boundary-origin')e.timeOrigin--;
      if(fault==='invalid-boundary-clock')e.t=NaN;
      trace.push(e);
    };
    const populateReturn=()=>{
      if(fault!=='missing-return'){
        const t=fault==='short-real-unfocused-span'?3000:returned;
        trace.push(event('focus',t,{focused:true,hidden:false,globalTarget:fault!=='element-return'}));
        if(kind==='hidden')trace.push(event('visibilitychange',t,{focused:true,hidden:false,globalTarget:fault!=='element-return'}));
      }
      encounters.push({...oracle[842],...identity,t:returned+.2,run:sessionRun,action:'visibility',focused:true,
        applicationPaused:false,catchingUp:false,paused:false,failed:false});
      for(let tick=842;tick<=888;tick++)states.push({tick,hull:oracle[tick].hp,kills:oracle[tick].kills,
        ...identity,t:returned+(tick-842)*50+30,action:'session',phase:'battle',runId:loopRun,sessionRun,
        cannonDamage:20,paused:false,muted:false,saveState:'ready'});
      if(fault!=='quiet-return')for(const tick of [855,875]) {
        const t=returned+(tick-842)*50+29;
        const admission={...identity,id:tick,run:sessionRun,fromTick:tick-1,timestamp:t/1000,
          previousTimestamp:t/1000-.05,elapsed:.05,priorPending:0,speed:1,focused:true,
          applicationPaused:false,paused:false,failed:false};
        callbackRecords.push({...admission,action:'begin',t:t-.1,tick:tick-1,steps:0,pending:.05,age:0},
          {...admission,action:'end',t:t+1.1,tick,steps:1,pending:0,age:.0012});
        cues.push({t,...identity,text:'ST_LS_AUDIO event=cannon\n'},
          {t:t+.1,...identity,text:'ST_LS_AUDIO event='+(oracle[tick].kills>oracle[tick-1].kills?'destruction':'impact')+'\n'});
      }
      if(fault==='background-cue')cues.push({t:2000,...identity,text:'ST_LS_AUDIO event=defeat\n'});
      if(fault==='unmatched-return-cue')cues.push({t:returned+100,...identity,text:'ST_LS_AUDIO event=purchase\n'});
      if(fault==='duplicate-return-cue')cues.push({...cues[0]});
      if(fault==='old-model-tick')for(const s of states)s.tick=842;
      if(fault==='catch-up-callback')states[13].t=states[12].t+800;
      if(fault==='paused-callback')states[13].paused=true;
      if(fault==='muted-callback')states[13].muted=true;
      if(fault==='wrong-cue-load')for(const c of cues)c.load=15;
      if(fault==='wrong-cue-origin')for(const c of cues)c.timeOrigin--;
    };
    const other={goto:async()=>{},bringToFront:async()=>{focused=false;hidden=kind==='hidden';emitLoss();},
      close:async()=>{closed=true;auxClosed++;}};
    const native={context:{newPage:async()=>{auxCreated++;return other;},waitForEvent:async()=>other},
      browser:{newBrowserCDPSession:async()=>({send:async()=>{auxCreated++;},detach:async()=>{}})}};
    const page={bringToFront:async()=>{if(!focused){populateReturn();time=returned;}focused=true;hidden=false;},
      waitForFunction:async predicate=>{
        if(predicate.includes('!document.hasFocus()'))assert.ok(!focused && hidden===(kind==='hidden'));
        else {assert.ok(focused && !hidden);if(marks)time=recovered;}
      },waitForTimeout:async ms=>{assert.equal(ms,6000);time+=ms;}};
    const samples=[];for(let t=loss+200;t<=recovered;t+=20) {
      const current=fault!=='quiet-return' && ((t>=returned+680 && t<=returned+900)||(t>=returned+1680 && t<=returned+1900));
      samples.push({t,rms:current?.02:0});
    }
    if(fault==='background-energy')samples.find(s=>s.t===2000).rms=.02;
    if(fault==='foreground-gap-energy')samples.find(s=>s.t===7400).rms=.02;
    const energy=async(a,b)=>{const selected=samples.filter(s=>a<=s.t && s.t<=b);windows.push([a,b]);
      return {samples:selected.length,maximum_rms:Math.max(...selected.map(s=>s.rms)),mean_rms:0};};
    let error;
    try {await run(native,page,async()=>before,(ok,name)=>assert.ok(ok,name),async()=>{marks++;return marks===1?(time=1250):recovered;},
      report,'explicit-inert-output',trace,cues,states,encounters,identity.load,energy,journey.validateNoReplayAudio,
      journey.validateAwayAudioReturn,()=>oracle,async()=>{},async()=>{assert.ok(focused && !hidden);},async()=>{},
      async({other,session})=>{await other?.close();await session?.detach();},kind,callbackRecords);}
    catch(cause){error=cause;}
    assert.equal(auxCreated,1);assert.equal(auxClosed,1);assert.ok(closed,'Actual maintained cleanup always executes');
    const reject=!['fresh-current','quiet-return'].includes(fault),boundary=report.lifecycle.at(-1)?.boundary;
    const passed=reject?error?.name==='AssertionError':!error && boundary?.loss?.t===loss &&
      boundary?.returned?.t===returned && windows[0]?.[0]===loss+200 && windows[0]?.[1]<=recovered;
    const row={kind,fault,passed:Boolean(passed),error:error?.message,windows,auxCreated,auxClosed};rows.push(row);
    if(!passed)failures.push(row);
    if(!reject && !error && boundary) {
      assert.equal(report.lifecycle.at(-1).boundary.loss.t,loss);
      assert.equal(report.lifecycle.at(-1).boundary.returned.t,returned);
      assert.ok(windows[0][0]===loss+200 && windows[0][1]<=recovered,'Actual loss plus unchanged200ms tail governs silence');
    }
  }
  console.log('ST_LS_NATIVE_AUDIO_BOUNDARIES='+JSON.stringify({rows,failures,actualCaller:callerSource.slice(begin,end),
    fixture:'honest inert native/document clocks, source-bound current model, synthetic records only; no gameplay/audio injection'}));
  assert.equal(failures.length,0,'Actual away/noReplay must accept silent background with fresh foreground events and reject stale/replay/invalid boundaries');
}

async function assertNativeAudioTerminalReturns() {
  const begin=callerSource.indexOf('    const noReplay=async('),end=callerSource.indexOf('    const saveAudio=',begin);
  const selectorBegin=callerSource.indexOf('export function validateAwayAudioReturn(');
  const selectorEnd=callerSource.indexOf('\n// Compile the unchanged deterministic owner',selectorBegin);
  assert.ok(begin>0 && end>begin && selectorBegin>0 && selectorEnd>selectorBegin,'Actual maintained away/noReplay and selector required');
  const selector=new Function('assert','validateModelObservation',callerSource.slice(selectorBegin,selectorEnd)
    .replace(/^export /,'')+'return validateAwayAudioReturn;')(assert,journey.validateModelObservation);
  const run=new Function('native','page','observation','check','mark','report','output','trace','cues','states','encounters','load',
    'energy','validateNoReplayAudio','validateAwayAudioReturn','reference','activateOwnedNativeWindow',
    'ensureOwnedNativeForeground','retainAwayFailure','cleanupAwayAuxiliary','kind','callbackRecords',
    callerSource.slice(begin,end)+'return away(kind,6000);');
  const oracle=journey.readBoundEncounterOracle()['repair:20'],terminalTick=Object.values(oracle).at(-1).tick;
  assert.equal(oracle[terminalTick].status,'Defeated');assert.equal(oracle[terminalTick].hp,0);
  const identity={load:16,timeOrigin:100000,scope:'healthy'},loopRun=3,sessionRun=1;
  const loss=1000,returned=7250,recovered=9500,rows=[],failures=[];
  const cases=['fresh-terminal','fresh-short-terminal-tail','background-cue','background-energy','foreground-gap-energy',
    'stale-terminal','catch-up-terminal','duplicate-defeat','unmatched-terminal','muted-terminal','paused-terminal',
    'wrong-pending-run','wrong-session-run','wrong-terminal-model','missing-terminal','wrong-terminal-status',
    'defeat-before-terminal','duplicate-staging','missing-staging','wrong-cue-load','wrong-cue-origin',
    'wrong-terminal-load','wrong-terminal-origin','invalid-terminal-elapsed','long-terminal-callback','wrong-terminal-step-count'];
  for(const kind of ['blur','hidden'])for(const fault of cases) {
    const trace=[],cues=[],states=[],encounters=[],callbackRecords=[],report={lifecycle:[]},windows=[];
    const before={...oracle[terminalTick-130],...identity,t:900,run:sessionRun,fitting:'repair',paused:false,
      loop:{runId:loopRun,cannonDamage:20}};
    let time=950,focused=true,hidden=false,closed=false,marks=0,auxClosed=0,auxCreated=0;
    const event=(type,t,values={})=>({kind:type,t,...identity,globalTarget:true,target:'',focused:false,hidden:kind==='hidden',...values});
    const populateReturn=()=>{
      trace.push(event('focus',returned,{focused:true,hidden:false}));
      if(kind==='hidden')trace.push(event('visibilitychange',returned,{focused:true,hidden:false}));
      const admission={...oracle[terminalTick-2],...identity,t:returned+.2,run:sessionRun,action:'visibility',focused:true,
        applicationPaused:false,catchingUp:false,paused:false,failed:false};encounters.push(admission);
      const tail=fault==='fresh-short-terminal-tail'?.2:0,nextTime=returned+110+tail*1000;
      for(let tick=terminalTick-2;tick<terminalTick;tick++)states.push({tick,hull:oracle[tick].hp,kills:oracle[tick].kills,
        ...identity,t:returned+(tick-terminalTick+2)*50+10,action:'session',phase:'battle',runId:loopRun,pendingRunId:0,
        sessionRun,cannonDamage:20,paused:false,muted:false,saveState:'ready'});
      const terminal={...oracle[terminalTick],...identity,t:nextTime-.8,run:sessionRun,action:'terminal',focused:true,
        applicationPaused:false,catchingUp:false,paused:false,failed:false,callbackSteps:1,terminalElapsed:tail};
      const staged={tick:terminalTick,hull:0,kills:oracle[terminalTick].kills,...identity,t:nextTime,action:'defeat-staged',
        phase:'settling',runId:0,pendingRunId:loopRun,sessionRun,cannonDamage:20,paused:false,muted:false,saveState:'ready'};
      const a=oracle[terminalTick-1],b=oracle[terminalTick],cannon=b.cannon-a.cannon;
      const weapons=cannon+b.launcher-a.launcher,killed=b.kills-a.kills;
      const names=[...Array(cannon).fill('cannon'),...Array(killed).fill('destruction'),
        ...Array(weapons-killed+b.closeHits-a.closeHits+b.rangedHits-a.rangedHits).fill('impact')];
      names.forEach((name,i)=>cues.push({t:nextTime-1+i*.01,...identity,text:'ST_LS_AUDIO event='+name+'\n'}));
      const defeat={t:nextTime-.4,...identity,text:'ST_LS_AUDIO event=defeat\n'};cues.push(defeat);
      const callback={...identity,id:1,run:sessionRun,fromTick:terminalTick-1,timestamp:(nextTime-1.1)/1000,
        previousTimestamp:(nextTime-1.1)/1000-.05-tail,elapsed:.05+tail,priorPending:0,speed:1,
        focused:true,applicationPaused:false,paused:false,failed:false};
      callbackRecords.push({...callback,action:'begin',t:nextTime-1.1,tick:terminalTick-1,steps:0,pending:.05+tail,age:0},
        {...callback,action:'end',t:nextTime+.1,tick:terminalTick,steps:1,pending:tail,age:.0012});
      encounters.push(terminal);states.push(staged);
      if(fault==='background-cue')cues.push({t:2000,...identity,text:'ST_LS_AUDIO event=defeat\n'});
      if(fault==='stale-terminal')terminal.t=returned-1;
      if(fault==='catch-up-terminal'){admission.catchingUp=true;terminal.callbackSteps=128;}
      if(fault==='duplicate-defeat')cues.push({...defeat});
      if(fault==='unmatched-terminal')cues.push({...defeat,text:'ST_LS_AUDIO event=purchase\n'});
      if(fault==='muted-terminal')staged.muted=true;
      if(fault==='paused-terminal')staged.paused=true;
      if(fault==='wrong-pending-run')staged.pendingRunId++;
      if(fault==='wrong-session-run')terminal.run++;
      if(fault==='wrong-terminal-model')terminal.hp=1;
      if(fault==='missing-terminal')encounters.pop();
      if(fault==='wrong-terminal-status')terminal.status='Limit';
      if(fault==='defeat-before-terminal')defeat.t=nextTime-.9;
      if(fault==='duplicate-staging')states.push({...staged,t:nextTime+.1});
      if(fault==='missing-staging')states.pop();
      if(fault==='wrong-cue-load')defeat.load--;
      if(fault==='wrong-cue-origin')defeat.timeOrigin--;
      if(fault==='wrong-terminal-load')terminal.load--;
      if(fault==='wrong-terminal-origin')terminal.timeOrigin--;
      if(fault==='invalid-terminal-elapsed')terminal.terminalElapsed=NaN;
      if(fault==='long-terminal-callback')staged.t=states[1].t+550;
      if(fault==='wrong-terminal-step-count')terminal.callbackSteps++;
    };
    const other={goto:async()=>{},bringToFront:async()=>{focused=false;hidden=kind==='hidden';
      trace.push(event(kind==='blur'?'blur':'visibilitychange',loss));},close:async()=>{closed=true;auxClosed++;}};
    const native={context:{newPage:async()=>{auxCreated++;return other;},waitForEvent:async()=>other},
      browser:{newBrowserCDPSession:async()=>({send:async()=>{auxCreated++;},detach:async()=>{}})}};
    const page={bringToFront:async()=>{if(!focused){populateReturn();time=returned;}focused=true;hidden=false;},
      waitForFunction:async predicate=>{if(predicate.includes('!document.hasFocus()'))assert.ok(!focused && hidden===(kind==='hidden'));
        else {assert.ok(focused && !hidden);if(marks)time=recovered;}},
      waitForTimeout:async ms=>{assert.equal(ms,6000);time+=ms;}};
    const energy=async(a,b)=>{
      const first=returned+(fault==='fresh-short-terminal-tail'?310:110)-1,samples=[];
      for(let t=loss+200;t<=recovered;t+=20)samples.push({t,rms:t>=first?.02:0});
      if(fault==='background-energy')samples.find(s=>s.t===2000).rms=.02;
      if(fault==='foreground-gap-energy')samples.find(s=>s.t===7300).rms=.02;
      const selected=samples.filter(s=>a<=s.t && s.t<=b);windows.push([a,b]);
      return {samples:selected.length,maximum_rms:Math.max(...selected.map(s=>s.rms)),mean_rms:0};
    };
    let error;
    try {await run(native,page,async()=>before,(ok,name)=>assert.ok(ok,name),async()=>{marks++;return marks===1?(time=1250):recovered;},
      report,'explicit-inert-output',trace,cues,states,encounters,identity.load,energy,journey.validateNoReplayAudio,
      selector,()=>oracle,async()=>{},async()=>{assert.ok(focused && !hidden);},async()=>{},
      async({other,session})=>{await other?.close();await session?.detach();},kind,callbackRecords);}
    catch(cause){error=cause;}
    assert.equal(auxCreated,1);assert.equal(auxClosed,1);assert.ok(closed,'Actual maintained cleanup always executes');
    const reject=!['fresh-terminal','fresh-short-terminal-tail'].includes(fault),boundary=report.lifecycle.at(-1)?.boundary;
    const passed=reject?error?.name==='AssertionError':!error && boundary?.loss?.t===loss && boundary?.returned?.t===returned &&
      windows[0]?.[0]===loss+200 && windows[0]?.[1]===returned+(fault==='fresh-short-terminal-tail'?310:110)-1;
    const row={kind,fault,passed:Boolean(passed),error:error?.message,windows,auxCreated,auxClosed};rows.push(row);
    if(!passed)failures.push(row);
  }
  console.log('ST_LS_NATIVE_AUDIO_TERMINAL_RETURNS='+JSON.stringify({rows,failures,terminalTick,
    actualCaller:callerSource.slice(begin,end),actualSelector:callerSource.slice(selectorBegin,selectorEnd),
    fixture:'honest inert current-document terminal records and actual source-bound model; no gameplay or rendered-audio qualification'}));
  assert.equal(failures.length,0,'Actual away/noReplay must admit only source-supported fresh foreground terminal cues');
}

test('background guards reject replay cues and empty rendered audio evidence', async () => {
  await assertCurrentDeploymentHitSelection();
  await assertNativeAudioBoundaries();
  await assertNativeAudioTerminalReturns();
  const quiet={samples:12,maximum_rms:0,mean_rms:0};
  assert.throws(()=>journey.validateNoReplayAudio({energy:{...quiet,maximum_rms:.002},cues:[]}), /replay|silent/i);
  assert.doesNotThrow(()=>journey.validateNoReplayAudio({energy:quiet,cues:[]}));
  for(const invalid of [{energy:{...quiet,samples:0},cues:[]},{energy:quiet,cues:['defeat']},
    {energy:{...quiet,maximum_rms:NaN},cues:[]},{energy:{...quiet,samples:4},cues:[]}])
    assert.throws(()=>journey.validateNoReplayAudio(invalid));
});

// Additional fixture-boundary assertions run inside the first original named
// guard. The unchanged Python gate therefore also rejects a restored old seam.
async function assertConfiguredRejoinBoundary() {
  const roomQuery='?select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at&id=eq.room-rejoin-fixture';
  const configuredOrigin='https://configured-parent.invalid';
  const roomPath='/rest/v1/rooms'+roomQuery;
  const stockRoom={id:'room-rejoin-fixture',code:'BACK',seed:17,
    options:{maxPlayers:2,maxWind:10,gravity:.15},
    players:[{id:'player-rejoin-fixture',name:'Ranger',color:'#e84d4d',ready:true}],status:'active'};
  const initializer='var sb=createClient(`'+configuredOrigin+'`,`sb_publishable_local_fixture`);export{sb as supabase};';
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const graphFor=source=>({schema:'singedterra-browser-bundle-graph/v1',base:'/singedTerra/',chunks:[{
    fileName:'assets/supabase-fixture.js',sha256:sha(source),facadeModuleId:'client/src/lib/supabase.ts',
    modules:['client/src/lib/supabase.ts']}],assets:[]});
  const routeProbe=(url,method='GET')=>{
    const effects=[];
    return {effects,request:()=>({url:()=>url,method:()=>method}),
      fulfill:async response=>effects.push(['fulfill',response]),
      continue:async()=>effects.push(['continue']),abort:async reason=>effects.push(['abort',reason])};
  };
  async function parentFixture(run,{source=initializer,graph,redirect=false}={}) {
    const hits=[];
    const server=createServer((request,response)=>{
      hits.push({path:request.url,method:request.method});
      if(request.url==='/singedTerra/battle-console-bundle-graph.json') {
        if(redirect){response.writeHead(302,{Location:'/sink'});response.end();}
        else response.end(typeof graph==='string'?graph:JSON.stringify(graph));
      } else if(request.url==='/singedTerra/assets/supabase-fixture.js')response.end(source);
      else {response.writeHead(404);response.end();}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const base=new URL('http://127.0.0.1:'+server.address().port+'/singedTerra/');
    try {
      if(typeof source==='function')source=source(base);
      graph??=graphFor(source);
      await run(base,hits);
    }
    finally {server.closeAllConnections();await new Promise(done=>server.close(done));}
  }
  async function assertDenied(route,base,state) {
    await assert.rejects(journey.routeLastStandRequest(route,base,state));
    assert.deepEqual(route.effects,[],'Denied request cannot fulfil, abort or continue through the seam');
  }

  async function configuredFixtureFulfillment() {
    await parentFixture(async(base,hits)=>{
      // Before the correction there is no binder. The actual existing route still
      // runs and fails this fulfilment oracle at its external-origin guard.
      const rejoinBinding=journey.bindConfiguredRejoinFixture
        ? await journey.bindConfiguredRejoinFixture(base) : undefined;
      const route=routeProbe(configuredOrigin+roomPath);
      let boundaryError;
      try {await journey.routeLastStandRequest(route,base,{rejoin:true,rejoinBinding});}
      catch(error){boundaryError=error;}
      assert.equal(route.effects[0]?.[0],'fulfill',
        'Exact source-bound configured room GET must be fulfilled locally; '+(boundaryError?.message??'no fulfilment'));
      assert.equal(route.effects.length,1);
      assert.deepEqual(route.effects[0][1],{status:200,contentType:'application/json',body:JSON.stringify(stockRoom)});
      assert.equal(route.effects.filter(([effect])=>effect==='continue').length,0);
      assert.deepEqual(hits,[{path:'/singedTerra/battle-console-bundle-graph.json',method:'GET'},
        {path:'/singedTerra/assets/supabase-fixture.js',method:'GET'}]);
    });
  }

  async function configuredFixtureDenials() {
    assert.equal(typeof journey.bindConfiguredRejoinFixture,'function','Source-bound parent binder is required for negative controls');
    await parentFixture(async(base,hits)=>{
      const rejoinBinding=await journey.bindConfiguredRejoinFixture(base);
      const good={rejoin:true,rejoinBinding};
      for(const [url,method,state] of [
        ['https://outside.invalid'+roomPath,'GET',good],
        ['https://another.supabase.co'+roomPath,'GET',good],
        [configuredOrigin+roomPath,'POST',good],
        [configuredOrigin+roomPath,'OPTIONS',good],
        [configuredOrigin+'/rest/v1/room'+roomQuery,'GET',good],
        [configuredOrigin+roomPath+'&extra=1','GET',good],
        [configuredOrigin+'/rest/v1/rooms?id=eq.room-rejoin-fixture&select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at','GET',good],
        [configuredOrigin+'/rest/v1/rooms'+roomQuery.replace('room-rejoin-fixture','other'),'GET',good],
        [configuredOrigin+'/functions/v1/complete_verified_deployment','GET',good],
        [configuredOrigin+'/singedTerra/last-stand/index.html','GET',good],
        [configuredOrigin+roomPath,'GET',{...good,rejoin:false}],
        [configuredOrigin+roomPath,'GET',{rejoin:true}],
        [configuredOrigin+roomPath,'GET',{rejoin:true,rejoinBinding:{base:base.href,origin:configuredOrigin}}],
        [configuredOrigin+roomPath,'GET',{rejoin:true,rejoinBinding:{}}],
      ])await assertDenied(routeProbe(url,method),base,state);
      await assertDenied(routeProbe(configuredOrigin+roomPath),new URL('http://localhost:'+base.port+'/singedTerra/'),good);
      assert.equal(hits.length,2,'Only the two normal parent asset reads reach loopback transport');
    });
  }

  async function configuredBindingDenials() {
    assert.equal(typeof journey.bindConfiguredRejoinFixture,'function','Source-bound parent binder is required for malformed evidence controls');
    const altered=structuredClone(graphFor(initializer));altered.chunks[0].sha256='0'.repeat(64);
    const ambiguous=structuredClone(graphFor(initializer));ambiguous.chunks.push({...ambiguous.chunks[0]});
    const escaped=structuredClone(graphFor(initializer));escaped.chunks[0].fileName='../escaped.js';
    const wrongModule=structuredClone(graphFor(initializer));wrongModule.chunks[0].facadeModuleId='client/src/other.ts';
    const externalChunk=structuredClone(graphFor(initializer));externalChunk.chunks[0].fileName='https://outside.invalid/chunk.js';
    for(const options of [{graph:'{'},{graph:{...graphFor(initializer),schema:'unexpected'}},
      {graph:{...graphFor(initializer),base:'/other/'}},{graph:altered},{source:initializer+'// drift',graph:graphFor(initializer)},
      {graph:ambiguous},{graph:escaped},{graph:wrongModule},{graph:externalChunk},{redirect:true},
      {source:initializer.replace(configuredOrigin,'https://user:private@configured-parent.invalid')},
      {source:initializer.replace(configuredOrigin,'http://configured-parent.invalid')},
      {source:initializer.replace(configuredOrigin,configuredOrigin+'/private')},
      {source:initializer.replace(configuredOrigin,configuredOrigin+'?unexpected=1')},
      {source:initializer.replace('sb_publishable_local_fixture','sb_secret_disallowed')},
      {source:initializer.replace('export{sb as supabase}','export{wrong as supabase}')},
      {source:'var sb=createClient(getOrigin(),`sb_publishable_local_fixture`);export{sb as supabase};'},
    ])await parentFixture(async base=>assert.rejects(journey.bindConfiguredRejoinFixture(base)),options);
  }

  async function defaultFixturePreservation() {
    const base=new URL('http://localhost:4173/singedTerra/');
    const stock=routeProbe(base.origin+roomPath);
    await journey.routeLastStandRequest(stock,base,{rejoin:true});
    assert.deepEqual(stock.effects,[['fulfill',{status:200,contentType:'application/json',body:JSON.stringify(stockRoom)}]]);
    const asset=routeProbe(new URL('last-stand/index.html',base).href);
    await journey.routeLastStandRequest(asset,base,{rejoin:false,rejoinBinding:{}});
    assert.deepEqual(asset.effects,[['continue']]);
    await assertDenied(routeProbe('https://outside.invalid'+roomPath),base,{rejoin:true});
  }
  async function defaultBindingCompatibility() {
    const localInitializer=base=>'var sb=createClient(`'+base.origin+'`,`e2e-public-anon-key`);export{sb as supabase};';
    await parentFixture(async(base,hits)=>{
      let rejoinBinding,bindingError;
      try {rejoinBinding=await journey.bindConfiguredRejoinFixture(base);}
      catch(error){bindingError=error;}
      assert.equal(bindingError,undefined,'Source-bound same-origin default initializer must complete before rejoin routing');
      assert.equal(rejoinBinding,undefined,'Same-origin default must grant no external fixture capability');
      const route=routeProbe(base.origin+roomPath);
      await journey.routeLastStandRequest(route,base,{rejoin:true,rejoinBinding});
      assert.deepEqual(route.effects,[['fulfill',{status:200,contentType:'application/json',body:JSON.stringify(stockRoom)}]]);
      await assertDenied(routeProbe(configuredOrigin+roomPath),base,{rejoin:true,rejoinBinding});
      assert.deepEqual(hits,[{path:'/singedTerra/battle-console-bundle-graph.json',method:'GET'},
        {path:'/singedTerra/assets/supabase-fixture.js',method:'GET'}]);
    },{source:localInitializer});
    for(const source of [
      base=>localInitializer(base).replace(base.origin,configuredOrigin),
      base=>localInitializer(base).replace(base.origin,'http://localhost:'+base.port),
      base=>localInitializer(base).replace(base.origin,base.origin.replace('://','://user:fixture@')),
      base=>localInitializer(base).replace(base.origin,base.origin+'?unexpected=1'),
      base=>localInitializer(base).replace(base.origin,base.origin+'#unexpected'),
      base=>localInitializer(base).replace('http:','http\\x3a'),
      base=>localInitializer(base).replace('`'+base.origin+'`','getOrigin()'),
      base=>localInitializer(base).replace('e2e-public-anon-key','unexpected-key'),
    ])await parentFixture(async base=>assert.rejects(journey.bindConfiguredRejoinFixture(base)),{source});
    const drifted=graphFor(initializer);drifted.chunks[0].sha256='0'.repeat(64);
    await parentFixture(async base=>assert.rejects(journey.bindConfiguredRejoinFixture(base)),{source:localInitializer,graph:drifted});
  }
  async function binderReadBoundaries() {
    for(const kind of ['advertised','stream','deadline']) {
      const source=kind==='deadline'?initializer:'/*'+' '.repeat(2*1024*1024)+'*/;'+initializer;
      const graph=graphFor(source),hits=[],sockets=new Set(),timers=new Set();
      let capability,error,elapsed,completed=false,contentLength;
      const server=createServer((request,response)=>{
        hits.push({path:request.url,method:request.method});
        if(request.url==='/singedTerra/battle-console-bundle-graph.json')response.end(JSON.stringify(graph));
        else if(request.url==='/singedTerra/assets/supabase-fixture.js') {
          if(kind==='advertised') {
            response.setHeader('Content-Length',Buffer.byteLength(source));
            contentLength=response.getHeader('Content-Length');response.end(source);completed=true;
          } else {
            contentLength=response.getHeader('Content-Length');
            response.write(source.slice(0,1));
            if(kind==='deadline') {
              const timer=setTimeout(()=>{
                timers.delete(timer);response.end(source.slice(1));completed=true;
              },15_250);
              timers.add(timer);
            } else {response.end(source.slice(1));completed=true;}
          }
        } else {response.writeHead(404);response.end();}
      });
      server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
      await new Promise(done=>server.listen(0,'127.0.0.1',done));
      const base=new URL('http://127.0.0.1:'+server.address().port+'/singedTerra/'),started=performance.now();
      try {
        try {capability=await journey.bindConfiguredRejoinFixture(base);}
        catch(cause){error=cause;}
        elapsed=performance.now()-started;
      } finally {
        for(const timer of timers)clearTimeout(timer);timers.clear();
        const closed=[...sockets].map(socket=>new Promise(done=>socket.once('close',done)));
        server.closeAllConnections();await Promise.all([new Promise(done=>server.close(done)),...closed]);
      }
      const observation={kind,validGraphAndChunk:true,sourceBytes:Buffer.byteLength(source),
        contentLength:contentLength??null,completed,capabilityReturned:capability!==undefined,
        errorName:error?.name??null,errorMessage:error?.message??null,elapsedMs:elapsed,
        hits,timersRemaining:timers.size,socketsRemaining:sockets.size,serverListening:server.listening};
      console.log('ST_LS_BINDER_BOUNDARY='+JSON.stringify(observation));
      assert.deepEqual(hits,[{path:'/singedTerra/battle-console-bundle-graph.json',method:'GET'},
        {path:'/singedTerra/assets/supabase-fixture.js',method:'GET'}]);
      assert.equal(timers.size,0);assert.equal(sockets.size,0);assert.equal(server.listening,false);
      assert.ok(error,'Binder '+kind+' boundary must reject valid over-limit transport before returning capability');
      assert.equal(capability,undefined,'Rejected binder read must return no external fixture capability');
      if(kind==='deadline') {
        assert.equal(error.name,'AbortError');assert.equal(completed,false);
        assert.ok(elapsed>=14_000,'Real15000ms binder deadline must be exercised');
      } else {
        assert.match(error.message,/Parent build size limit/);
        assert.ok(Buffer.byteLength(source)>2*1024*1024);
        if(kind==='advertised')assert.ok(contentLength>2*1024*1024);
        else assert.equal(contentLength,undefined,'Stream control cannot advertise Content-Length');
      }
    }
  }
  await defaultBindingCompatibility();
  await configuredFixtureFulfillment();
  await configuredFixtureDenials();
  await configuredBindingDenials();
  await defaultFixturePreservation();
  await binderReadBoundaries();
}


test('inert placement uses the observed owned monitor instead of emulated screen dimensions',async()=>{
  for(const origin of [{left:0,top:0},{left:-1280,top:-200}]){
    const f=inertPlacementFixture({origin});await f.run();
    assert.deepEqual(f.requests,[{left:origin.left+20,top:origin.top+20,width:1024,height:760}]);
    assert.equal(f.screenReads,0,'Emulated page.screen must never authorize native placement');
    assert.equal(f.probes,2);assert.equal(f.fronts,1);assert.equal(f.detaches,2);
  }
});
test('inert placement rejects unsafe or mismatched ownership and geometry before tab activation',async()=>{
  for(const fault of ['foreign','ambiguous','unmeasured','missing-workarea','small-workarea','unsafe-workarea',
    'cdp-native-mismatch','post-size','post-window','post-native','post-monitor','stale-process']){
    const f=inertPlacementFixture({fault});await assert.rejects(f.run(),undefined,fault);
    assert.equal(f.fronts,0,fault+' must not activate the tab');assert.equal(f.detaches,2);
    assert.equal(f.requests.length,fault.startsWith('post-')?1:0,fault+' mutation boundary');
  }
});
function inertPlacementFixture({origin={left:0,top:0},fault}={}){
  const root={pid:77,ppid:55,start:'exact-owned-start',exe:'owned-chrome'},receipt={pid:77,root,profile:'/inert-profile'};
  const workarea={...origin,width:1064,height:800};
  let bounds={left:origin.left+10,top:origin.top+10,width:1044,height:788,windowState:'normal'};
  const f={requests:[],screenReads:0,probes:0,fronts:0,detaches:0},report={};
  const session={send:async()=>({targetInfo:{type:'page',targetId:'owned-target',browserContextId:'owned-context'}}),detach:async()=>{f.detaches++;}};
  const browserSession={send:async(method,args)=>{
    if(method==='Browser.setWindowBounds'){
      f.requests.push({...args.bounds});bounds={...bounds,...args.bounds,width:Math.min(args.bounds.width,1044)};
      if(fault==='post-size')bounds.width--;return {};
    }
    return {windowId:fault==='post-window' && f.requests.length?2:1,bounds:{...bounds}};
  },detach:async()=>{f.detaches++;}};
  const native={context:{newCDPSession:async()=>session},browser:{newBrowserCDPSession:async()=>browserSession}};
  const page={context:()=>native.context,isClosed:()=>false,url:()=> 'data:text/html,inert',bringToFront:async()=>{f.fronts++;},
    evaluate:async fn=>{if(String(fn).includes('screen.')){f.screenReads++;return {left:0,top:0,width:1280,height:720};}
      return {hidden:true,focused:false,visibility:'hidden',t:1,timeOrigin:2};}};
  const probe=(pid,owner)=>{
    f.probes++;assert.equal(pid,root.pid);assert.equal(JSON.stringify(owner),JSON.stringify(receipt));
    if(fault==='stale-process')throw new Error('Owned process changed');
    const item={...bounds,pid,hwnd:'444',kind:'Chrome_WidgetWin_1',visible:true,minimized:false,measured:true,workarea:{...workarea}};
    if(fault==='foreign')item.pid++;
    if(fault==='unmeasured')item.measured=false;
    if(fault==='missing-workarea')delete item.workarea;
    if(fault==='small-workarea')item.workarea.width=400;
    if(fault==='unsafe-workarea')item.workarea.left=Number.MAX_SAFE_INTEGER;
    if(fault==='cdp-native-mismatch' || fault==='post-native' && f.requests.length)item.width--;
    if(fault==='post-monitor' && f.requests.length)item.workarea.left++;
    return fault==='ambiguous'?[item,{...item,hwnd:'445'}]:[item];
  };
  const fn=runInNewContext('('+placeOwnedInertWindow.toString()+')',{
    assert,journey,readFileSync:()=>JSON.stringify(receipt),join:(...p)=>p.join('/'),nativeWindowObservation:probe,
  });
  f.run=()=>fn({native,page,report,role:'foreground-original',output:'/inert-output'});return f;
}

test('inert placement native probe preserves physical context and exact process admission',()=>{
  if(process.platform!=='win32')return;
  let script;
  const observe=new Function('assert','Buffer','execFileSync','return ('+nativeWindowObservation.toString()+');')(
    assert,Buffer,(_exe,args)=>{script=Buffer.from(args.at(-1),'base64').toString('utf16le');return '[]';});
  observe(77,{pid:77,root:{pid:77,start:'2026-10-23T00:00:00.0000000Z',exe:'C:\\owned\\chrome.exe'},profile:'C:\\owned\\profile'});
  const nativeBlock=script.match(/    Add-Type -TypeDefinition @'\n([\s\S]+?)\n'@/);assert.ok(nativeBlock);
  const bodies={
    SetThreadDpiAwarenessContext:'if(context.ToInt64()==-4){if(Mode=="dpi-denied")return IntPtr.Zero;var old=Context;Context=context;return old;}Restores++;if(Mode=="restore-denied")return IntPtr.Zero;Context=context;return new IntPtr(-4);',
    GetThreadDpiAwarenessContext:'return Mode=="dpi-mismatch" && Context.ToInt64()==-4?new IntPtr(-3):Context;',
    AreDpiAwarenessContextsEqual:'return first==second;',
    MonitorFromWindow:'if(flags!=0)throw new Exception("Monitor fallback forbidden");return Mode=="monitor-missing"?IntPtr.Zero:new IntPtr(9);',
    GetMonitorInfo:'if(info.Size!=40)throw new Exception("Monitor structure mismatch");info.Work=new Rect {Left=-1280,Top=-200,Right=-216,Bottom=600};return Mode!="monitor-failure";',
    EnumWindows:'callback(new IntPtr(444),IntPtr.Zero);return Mode!="enumeration-failure";',
    GetWindowThreadProcessId:'pid=77;return 1;',IsWindowVisible:'return true;',IsIconic:'return false;',
    GetWindowRect:'rect=new Rect {Left=-1270,Top=-190,Right=-226,Bottom=598};return true;',
    GetClassName:'text.Append("Chrome_WidgetWin_1");return 18;',GetWindowText:'text.Append("Inert owned fixture");return 19;',
  };
  let replaced=0;
  let source=nativeBlock[1].replace(/^  \[DllImport[^\n]+\] public static extern (.+?) (\w+)\((.*)\);$/gm,
    (_line,type,name,params)=>{assert.ok(bodies[name],'Inert implementation required: '+name);replaced++;
      return '  public static '+type+' '+name+'('+params+') { '+bodies[name]+' }';});
  assert.equal(replaced,Object.keys(bodies).length);assert.ok(!source.includes('[DllImport'));
  source=source.replace('public class LastStandNativeWindowProbe {','public class LastStandNativeWindowProbe {\npublic static string Mode; public static IntPtr Context; public static int Restores;');
  const action=script.replace(nativeBlock[0],'');
  const setup=["$ErrorActionPreference='Stop'",'function Get-CimInstance { param($ClassName,$Filter)',
    ' $global:queries++'," $stamp=[DateTime]::Parse('2026-10-23T00:00:00.0000000Z').ToUniversalTime()",
    " if($mode -eq 'identity-before' -or ($mode -eq 'identity-after' -and $global:queries -eq 2)){$stamp=$stamp.AddSeconds(1)}",
    " $command='--user-data-dir=C:\\owned\\profile';if($mode -eq 'profile-mismatch'){$command='--user-data-dir=C:\\foreign\\profile'}",
    " [pscustomobject]@{CreationDate=$stamp;ExecutablePath='C:\\owned\\chrome.exe';CommandLine=$command}",'}',
    "Add-Type -TypeDefinition @'",source,"'@",'$rows=@()',
    "foreach($mode in @('valid','dpi-denied','dpi-mismatch','restore-denied','monitor-missing','monitor-failure','identity-before','identity-after','profile-mismatch','enumeration-failure')){",
    ' [LastStandNativeWindowProbe]::Mode=$mode;[LastStandNativeWindowProbe]::Context=[IntPtr](-2);[LastStandNativeWindowProbe]::Restores=0',
    ' $global:queries=0;$answer=$null;$failure=$null',
    ' try{$answer=& {'+action+'}}catch{$failure=$_.Exception.Message}',
    ' $rows+=@{mode=$mode;answer=$answer;error=$failure;queries=$global:queries;restores=[LastStandNativeWindowProbe]::Restores;context=[LastStandNativeWindowProbe]::Context.ToInt64()}',
    '}',"@{fixture='all native/provider calls inert';rows=$rows}|ConvertTo-Json -Depth 6 -Compress",
  ].join('\n');
  const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    '$taskScript=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($taskScript))'],
    {input:setup,encoding:'utf8',timeout:10000,maxBuffer:1024*1024,windowsHide:true}));
  console.log('ST_LS_INERT_PLACEMENT_PROBE='+JSON.stringify(result));
  for(const row of result.rows){
    if(['valid','monitor-missing','monitor-failure'].includes(row.mode)){
      assert.equal(row.error,null,row.mode);assert.equal(row.queries,2);
      const windows=JSON.parse(row.answer);assert.ok(Array.isArray(windows),'Native probe must preserve its array contract');
      const item=windows[0];
      assert.equal(item.hwnd,'444');
      if(row.mode==='valid')assert.deepEqual(item.workarea,{left:-1280,top:-200,width:1064,height:800});
      else assert.equal(item.workarea,null,'Unavailable monitor must never become guessed coordinates');
    }else assert.ok(row.error,row.mode+' must refuse');
    assert.equal(row.restores,['dpi-denied','identity-before','profile-mismatch'].includes(row.mode)?0:1,row.mode);
    assert.equal(row.context,row.mode==='restore-denied'?-4:-2,row.mode);
  }
});

test('native activation pins process admission and keeps provider latency outside inserted input', () => {
  if(process.platform!=='win32')return;
  const begin=callerSource.indexOf('function ownedNativeWindowSnapshot(');
  const end=callerSource.indexOf('// Passive observations precede',begin);
  assert.ok(begin>=0 && end>begin);
  let actualScript;
  const makeCapture=clock=>new Function('assert','process','Buffer','powershell','uptime',
    callerSource.slice(begin,end)+'return ownedNativeWindowSnapshot;')(
      assert,{platform:'win32'},Buffer,script=>{actualScript=script;return '{}';},clock);
  const owner={root:{pid:77,ppid:55,start:'2026-10-23T00:00:00.0000000Z',exe:'C:\\owned\\chrome.exe'},profile:'C:\\owned\\profile'};
  for(const value of [-1,0,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>makeCapture(()=>value)(owner),/monotonic origin/);
  const capture=makeCapture(()=>1000);
  capture({root:{pid:77,ppid:55,start:'2026-10-23T00:00:00.0000000Z',exe:'C:\\owned\\chrome.exe'},
    profile:'C:\\owned\\profile'},{hwnd:'444',left:20,top:30,width:800,height:600});
  let source=actualScript.split("    Add-Type -TypeDefinition @'\n")[1]?.split("\n'@")[0];
  assert.ok(source,'Actual emitted native source required');
  let replaced=0;
  source=source.replace(/^  \[DllImport[^\n]+\] public static extern (.+?) (\w+)\((.*)\);$/gm,
    (line,type,name,params)=>{
      replaced++;
      const args=params.split(',').filter(x=>x.trim()).map(part=>{
        const words=part.trim().split(/\s+/);
        return (['out','ref'].includes(words[0])?words[0]+' ':'')+words.at(-1);
      }).join(', ');
      return '  public static '+type+' '+name+'('+params+') { return Seam.'+name+'('+args+'); }';
    });
  assert.ok(replaced>=20 && !source.includes('[DllImport'),'Every OS call must be inert');
  const tick=String.fromCharCode(96);
  let seam=assertPhysicalCaptionNativeSeamControls.toString().split('const seam='+tick)[1]?.split(tick+';')[0];
  assert.ok(seam);
  seam=seam.replace('public static string Mode;',
    'public static int Opens, Closes, Checks; public static bool Pinned, Exited; public static string Mode;')
    .replace('Mode=mode;Moves=', 'Mode=mode;Opens=Closes=Checks=0;Pinned=Exited=false;Moves=')
    .replace('public static bool Identity()',[
    'public static IntPtr OpenProcess(uint access, bool inherit, uint pid) {',
    '  Opens++;if(access!=0x101000 || inherit || pid!=77)throw new InvalidOperationException("Unexpected process authority");',
    '  if(Mode=="missing" || Mode=="access-denied")return IntPtr.Zero;Pinned=true;return new IntPtr(900);',
    '}',
    'public static bool CloseHandle(IntPtr handle) {',
    '  if(handle!=new IntPtr(900) || !Pinned)throw new InvalidOperationException("Unexpected handle release");',
    '  Closes++;Pinned=false;return true;',
    '}',
    'public static uint GetProcessId(IntPtr handle) { Checks++;if(Mode=="check-exception" && Checks>1)throw new InvalidOperationException("Injected kernel query failure");return Mode=="pid-mismatch"?88u:77u; }',
    'public static bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user) {',
    '  created=1000000+(Mode=="creation-drift" && Moves>0?1:0);exited=kernel=user=0;return Mode!="time-unavailable";',
    '}',
    'public static bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder image, ref int size) {',
    '  image.Append(Mode=="exe-mismatch"?"C:\\\\foreign\\\\chrome.exe":"C:\\\\owned\\\\chrome.exe");',
    '  size=image.Length;return Mode!="image-unavailable";',
    '}',
    'public static uint WaitForSingleObject(IntPtr handle, uint timeout) {',
    '  if(timeout!=0 || handle!=new IntPtr(900) || !Pinned)throw new InvalidOperationException("Unbounded or unpinned wait");',
    '  return Exited || Mode=="exit-before-admission" || (Mode=="exit-after-move" && Moves>0)?0u:258u;',
    '}',
    'public static ulong GetTickCount64() {',
    '  return (ulong)(Mode=="budget-future"?999999:Mode=="budget-expired"?1009000:(Mode=="budget-after-move" && Moves>0 || Mode=="budget-after-down" && Downs>0)?1009000:1000100);',
    '}',
    'public static bool Identity()'].join('\n'));
  source=source.slice(0,source.lastIndexOf('}'))+seam+'\n}';
  const nativeBlock=actualScript.match(/    Add-Type -TypeDefinition @'\n[\s\S]+?\n'@/)[0];
  const action=actualScript.replace(nativeBlock,'');
  const setup=[
    "$ErrorActionPreference='Stop'",
    "$taskMode='valid';$global:taskQueries=0;$global:taskInsideDown=0;$global:taskQueryWithoutPin=0",
    'function Get-CimInstance {',
    '  param($ClassName,$Filter)',
    '  $global:taskQueries++',
    "  if($taskMode -eq 'provider-exception'){throw 'Injected CIM admission failure'}",
    "  $kind='LastStandAwayWindowProbe+Seam' -as [type]",
    '  if($kind){',
    '    if([LastStandAwayWindowProbe+Seam]::Downs -gt [LastStandAwayWindowProbe+Seam]::Ups){$global:taskInsideDown++}',
    '    if(-not [LastStandAwayWindowProbe+Seam]::Pinned){$global:taskQueryWithoutPin++}',
    "    if($taskMode -eq 'exit-during-admission' -or $taskMode -eq 'pid-reuse'){[LastStandAwayWindowProbe+Seam]::Exited=$true}",
    '  }else{$global:taskQueryWithoutPin++}',
    "  $stamp=[DateTime]::Parse('2026-10-23T00:00:00.0000000Z').ToUniversalTime()",
    "  if($taskMode -eq 'start-mismatch'){$stamp=$stamp.AddSeconds(1)}",
    '  $command=\'"C:\\owned\\chrome.exe" --user-data-dir=C:\\owned\\profile\'',
    '  if($taskMode -eq \'profile-mismatch\'){$command=\'"C:\\owned\\chrome.exe" --user-data-dir=C:\\foreign\\profile\'}',
    "  [pscustomobject]@{ProcessId=77;CreationDate=$stamp;ExecutablePath='C:\\owned\\chrome.exe';CommandLine=$command}",
    '}',
  ].join('\n');
  // Run actual emitted admission/control flow; every provider/native call is inert.
  const script=setup+"\nAdd-Type -TypeDefinition @'\n"+source+"\n'@\n"+[
    '$rows=@()',
    "foreach($taskMode in @('valid','budget-after-down','missing','access-denied','exit-before-admission','provider-exception','check-exception','exit-during-admission','pid-reuse','pid-mismatch','start-mismatch','profile-mismatch','exe-mismatch','time-unavailable','image-unavailable','creation-drift','exit-after-move','budget-expired','budget-after-move','budget-future')){",
    '  [LastStandAwayWindowProbe+Seam]::Reset($taskMode)',
    '  $global:taskQueries=0;$global:taskInsideDown=0;$global:taskQueryWithoutPin=0;$answer=$null;$failure=$null',
    '  try{$answer=& {'+action+'}|ConvertFrom-Json}catch{$failure=$_.Exception.Message}',
    '  $rows+=@{mode=$taskMode;accepted=($answer.accepted -eq $true);reason=$answer.reason;error=$failure;',
    '    providerCalls=$global:taskQueries;providerDuringDown=$global:taskInsideDown;providerWithoutPin=$global:taskQueryWithoutPin;',
    '    opens=[LastStandAwayWindowProbe+Seam]::Opens;closes=[LastStandAwayWindowProbe+Seam]::Closes;',
    '    pinned=[LastStandAwayWindowProbe+Seam]::Pinned;checks=[LastStandAwayWindowProbe+Seam]::Checks;',
    '    moves=[LastStandAwayWindowProbe+Seam]::Moves;downs=[LastStandAwayWindowProbe+Seam]::Downs;ups=[LastStandAwayWindowProbe+Seam]::Ups}',
    '}',
    "@{fixture='actual emitted script with all OS/provider calls inert';rows=$rows}|ConvertTo-Json -Depth 5 -Compress",
  ].join('\n');
  const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    '$taskScript=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($taskScript))'],
    {input:script,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,windowsHide:true});
  const evidence=JSON.parse(raw),good=evidence.rows[0];
  console.log('ST_LS_PINNED_IDENTITY='+JSON.stringify(evidence));
  assert.equal(good.accepted,true,'Valid exact admitted process must retain activation behavior');
  assert.equal(good.providerDuringDown,0,'No potentially slow provider query may run with this call’s button held');
  assert.equal(good.providerWithoutPin,0,'Full profile/start admission must occur while the kernel object is pinned');
  assert.equal(good.providerCalls,1,'Only full admission uses the provider; later proofs use the same kernel handle');
  assert.ok(good.checks>=5,'Fresh kernel identity checks must remain at existing input gates');
  assert.equal(good.opens,1);assert.equal(good.closes,1);assert.equal(good.downs,1);assert.equal(good.ups,1);
  const released=evidence.rows.find(row=>row.mode==='budget-after-down');
  assert.ok(released.accepted && released.downs===1 && released.ups===1 && released.closes===1 && !released.pinned,'Budget expiry must never suppress an otherwise safe owned release');
  for(const row of evidence.rows.slice(2)){
    assert.equal(row.accepted,false,'Refuse '+row.mode);
    assert.equal(row.downs,0,'Do not insert down for '+row.mode);
    assert.equal(row.ups,0,'Do not send unowned up for '+row.mode);
    assert.equal(row.pinned,false,'Release every successfully acquired handle for '+row.mode);
    assert.equal(row.opens,1,'Never reacquire a replacement PID for '+row.mode);
    assert.equal(row.closes,['missing','access-denied'].includes(row.mode)?0:1,'Close only an acquired handle for '+row.mode);
  }
});

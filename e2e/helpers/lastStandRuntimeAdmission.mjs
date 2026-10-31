import { join, resolve, dirname } from 'node:path';
import { ROOT, fileHash, admitEvidenceParent, hash } from './lastStandJourneyHost.mjs';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ownedProcessIdentity } from './lastStandProcessOwnership.mjs';


export function classifyConsole(messages) {
  const errors = [];
  for (let i = 0; i < messages.length; i++) {
    const { text, type } = messages[i], lower = text.trim().toLowerCase();
    if (type === 'error' || /exception|uncaught/.test(lower) ||
      (lower.startsWith('[unitycache]') && /not stored in the browser cache|failed|error:/.test(lower)) ||
      lower.startsWith('error:') || /shader is not supported/.test(lower) ||
      (/shader/.test(lower) && /error|failed/.test(lower))) errors.push(messages[i]);
  }
  return errors;
}


export function packagedRuntimeSnapshot() {
  const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(Object.keys(manifest.files).length,16,'Complete packaged runtime inventory required');
  const files={'client/public/last-stand/asset-manifest.json':fileHash(manifestPath),
    [manifest.source.receipt]:fileHash(join(ROOT,manifest.source.receipt)),
    'campaign-unity/docs/last-stand-web/source-lock.json':fileHash(join(ROOT,'campaign-unity/docs/last-stand-web/source-lock.json'))};
  assert.equal(files[manifest.source.receipt],manifest.source.receiptSha256,'Packaged receipt bytes differ');
  assert.equal(files['campaign-unity/docs/last-stand-web/source-lock.json'],manifest.source.sourceLockSha256,'Packaged source-lock bytes differ');
  for(const [path,expected]of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256})) {
    assert.ok(/^[A-Za-z0-9_./-]+$/.test(path) && path.split('/').every(part=>part && part!=='.' && part!=='..'),'Packaged path escaped');
    const relativePath=`client/public/last-stand/${path}`,actual=fileHash(join(ROOT,relativePath));
    assert.equal(actual,expected,'Packaged runtime/wrapper bytes differ: '+path);files[relativePath]=actual;
  }
  const uiBinding='campaign-unity/docs/last-stand-ui/ui-native-binding.json';
  if(existsSync(join(ROOT,uiBinding)))files[uiBinding]=fileHash(join(ROOT,uiBinding));
  return files;
}

export function assertPackagedRuntimeParity(before,after) {
  assert.deepEqual(after,before,'Packaged runtime/source bytes drifted during journey');
}


const t21ParentBindings=new Map();

export async function bindT21ServedParent(base) {
  let binding=t21ParentBindings.get(base.href),files=binding?.files;
  if(!files && process.env.ST_SHOP_PARENT_FIXTURE) {
    const path=resolve(process.env.ST_SHOP_PARENT_FIXTURE);admitEvidenceParent(path);
    const fixture=JSON.parse(readFileSync(path,'utf8'));
    const authorityPath=join(dirname(admitEvidenceParent()),'245-t21-external-parent-fixture-release.json');
    assert.equal(fileHash(authorityPath),'a5ec014f70a1e1c1f58e04b127bcc92ee7318305df5fbc4c9958895637c00c23','External parent fixture release differs');
    assert.ok(fixture.status==='pass' && fixture.exit===0 && fixture.effective_environment.VITE_BASE===base.pathname &&
      fixture.effective_environment.VITE_SUPABASE_URL===base.origin && fixture.effective_environment.VITE_SUPABASE_ANON_KEY==='e2e-public-anon-key',
      'Configured parent fixture compilation or owned origin differs');
    for(const name of ['source','dependencies','tools','production','runtime'])assert.deepEqual(fixture[name+'Before'],fixture[name+'After'],'Parent fixture inputs drifted');
    files=Object.fromEntries(Object.entries(fixture.outputFiles).map(([name,item])=>[name,item.sha256]));
    const listenerPath=resolve(process.env.ST_SHOP_LISTENER_RECEIPT??'');admitEvidenceParent(listenerPath);
    const listener=JSON.parse(readFileSync(listenerPath,'utf8'));
    assert.equal(Number(base.port),listener.port,'Fixture listener port differs');assert.equal(base.hostname,'127.0.0.1','Fixture listener host differs');
    assert.equal(resolve(listener.directory),resolve(fixture.fixture_outdir),'Fixture listener serves another directory');
    assert.deepEqual(ownedProcessIdentity(listener.root.pid),listener.root,'Fixture listener process differs');
    binding={label:fixture.label,fixture_binding_sha256:fileHash(path),graph_sha256:fixture.graph_sha256,files,listener};
  }
  if(!files)return null;
  const served={};
  for(const [path,expected] of Object.entries(files)) {
    const response=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200,'Bound parent leaf status/redirect refused');
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),expected,'Served parent leaf differs: '+path);
    served[path]={sha256:hash(bytes),size:bytes.length};
  }
  return {...binding,served};
}

function bindT21Parent(base) {
  const evidence=admitEvidenceParent();
  assert.ok(process.env.ST_SHOP_EVIDENCE_ROOT,'Root parent adapter requires the released external scope');
  const releasePath=join(dirname(evidence),'242-t21-material-release.json');
  assert.equal(fileHash(releasePath),'7ef02671edba4fd70e6027ab1d98b2768c4bccdb0cbad63c27ebcad1f65a9b1f','T21 process/source release differs');
  const release=JSON.parse(readFileSync(releasePath,'utf8'));
  const frozen=release.qualified_prerequisites.find(item=>item.path.endsWith('FROZEN-MANIFEST.json'));
  assert.ok(frozen,'Qualified T20 closed seal absent');assert.equal(fileHash(frozen.path),frozen.sha256,'T20 closed seal differs');
  const seal=JSON.parse(readFileSync(frozen.path,'utf8')),outputPath=join(dirname(frozen.path),'production-output.json');
  assert.equal(fileHash(outputPath),seal.members['production-output.json'].sha256,'Retained production output differs');
  const output=JSON.parse(readFileSync(outputPath,'utf8'));
  assert.equal(fileHash(output.retainedGraph.path),output.retainedGraph.sha256,'Retained production graph differs');
  assert.equal(fileHash(join(ROOT,'client/dist/battle-console-bundle-graph.json')),output.retainedGraph.sha256,'Current production graph differs');
  const graph=JSON.parse(readFileSync(output.retainedGraph.path,'utf8'));
  assert.ok(graph.schema==='singedterra-browser-bundle-graph/v1' && graph.base==='/' && Object.keys(output.outputFiles).length===91,
    'Complete genuine T20 root production output absent');
  for(const [path,sha] of Object.entries(output.outputFiles))assert.equal(fileHash(join(ROOT,'client/dist',path)),sha,'Current production leaf differs: '+path);
  const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
  assert.equal(fileHash(manifestPath),release.current_packaged_runtime['asset-manifest.json'].sha256,'Released Shop manifest differs');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(fileHash(join(ROOT,manifest.source.receipt)),manifest.source.receiptSha256,'Current genuine export receipt differs');
  assert.equal(fileHash(join(ROOT,'campaign-unity/docs/last-stand-web/source-lock.json')),manifest.source.sourceLockSha256,'Current export source lock differs');
  const listenerPath=resolve(process.env.ST_SHOP_LISTENER_RECEIPT??'');admitEvidenceParent(listenerPath);
  const listener=JSON.parse(readFileSync(listenerPath,'utf8'));
  assert.equal(base.hostname,'127.0.0.1','Owned root listener host differs');assert.equal(Number(base.port),listener.port,'Owned root listener port differs');
  assert.deepEqual(ownedProcessIdentity(listener.root.pid),listener.root,'Owned listener process differs');
  const binding={production_output_sha256:fileHash(outputPath),graph_sha256:output.retainedGraph.sha256,
    export_receipt_sha256:manifest.source.receiptSha256,source_lock_sha256:manifest.source.sourceLockSha256,
    files:output.outputFiles,listener};t21ParentBindings.set(base.href,binding);return binding;
}

export function admitJourneyBase(baseURL) {
  const base = new URL(baseURL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname) && base.protocol === 'http:', 'Only local production artifacts admitted');
  if(base.pathname==='/' && process.env.ST_SHOP_PARENT_BASE==='/') {
    if(!t21ParentBindings.has(base.href))bindT21Parent(base);
  } else assert.equal(base.pathname, '/singedTerra/', 'Journey requires the approved production base path');
  assert.ok(!base.username && !base.password && !base.search && !base.hash,'Journey base cannot contain credentials or navigation signals');
  return base;
}


export async function fetchBoundRuntime(base, path, {timeoutMs=15_000,maxBytes=128*1024*1024}={}) {
  admitJourneyBase(base.href);
  assert.ok(typeof path==='string' && /^[A-Za-z0-9_./-]+$/.test(path) &&
    path.split('/').every(part=>part && part!=='.' && part!=='..'),'Runtime path escaped base');
  const target=new URL(`last-stand/${path}`,base);
  assert.ok(target.origin===base.origin && target.pathname.startsWith(`${base.pathname}last-stand/`),'Runtime path escaped base');
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs>0 && timeoutMs<=15_000,'Invalid preflight timeout');
  assert.ok(Number.isInteger(maxBytes) && maxBytes>0 && maxBytes<=128*1024*1024,'Invalid preflight size limit');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(new Error('Preflight timeout')),timeoutMs);
  let reader;
  try {
    const response=await fetch(target,{redirect:'manual',signal:controller.signal});
    assert.equal(response.status,200,'Preflight status/redirect refused');
    assert.equal(response.url,target.href,'Preflight final origin/path differs');
    assert.ok(Number(response.headers.get('content-length')??0)<=maxBytes,'Preflight response size limit');
    reader=response.body.getReader(); const chunks=[];let size=0;
    while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;
      assert.ok(size<=maxBytes,'Preflight response size limit');chunks.push(Buffer.from(value));}
    return {status:response.status,bytes:Buffer.concat(chunks,size)};
  } finally {clearTimeout(timer);controller.abort();if(reader)await reader.cancel().catch(()=>{});}
}

export function assertServedBytes(response, expected) {
  assert.ok(response.status===200 && hash(response.bytes)===expected, 'Served runtime/wrapper bytes differ');
}

export function assertUnityReady(ready) {
  assert.ok(ready?.action==='ready' && ready.phase==='garage' && ready.wallet===0 && ready.level===0 && ready.saveState==='ready', 'Genuine Unity scene readiness absent');
}

const configuredRejoinBindings=new WeakMap();

export async function bindConfiguredRejoinFixture(base) {
  admitJourneyBase(base.href);
  // Read normal parent build evidence only from the admitted loopback base.
  // Never evaluate the module, retain its key, or admit a caller-supplied origin.
  const read=async path=>{
    assert.ok(typeof path==='string' && /^[A-Za-z0-9_./-]+$/.test(path) &&
      path.split('/').every(part=>part && part!=='.' && part!=='..'),'Parent build path refused');
    const target=new URL(path,base);
    assert.ok(target.origin===base.origin && target.pathname.startsWith(base.pathname),'Parent build path escaped base');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
    let reader;
    try {
      const response=await fetch(target,{redirect:'manual',signal:controller.signal});
      assert.ok(response.status===200 && response.url===target.href,'Parent build status/redirect refused');
      assert.ok(Number(response.headers.get('content-length')??0)<=2*1024*1024,'Parent build size limit');
      reader=response.body.getReader();const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
        assert.ok(size<=2*1024*1024,'Parent build size limit');chunks.push(Buffer.from(value));}
      return Buffer.concat(chunks,size);
    } finally {clearTimeout(timer);controller.abort();if(reader)await reader.cancel().catch(()=>{});}
  };
  const graph=JSON.parse((await read('battle-console-bundle-graph.json')).toString('utf8'));
  assert.ok(graph.schema==='singedterra-browser-bundle-graph/v1' && graph.base===base.pathname && Array.isArray(graph.chunks),'Parent build graph refused');
  const chunks=graph.chunks.filter(chunk=>chunk.facadeModuleId==='client/src/lib/supabase.ts' &&
    Array.isArray(chunk.modules) && chunk.modules.includes('client/src/lib/supabase.ts'));
  assert.equal(chunks.length,1,'Parent configuration chunk must be unique');
  const chunk=chunks[0],bytes=await read(chunk.fileName);
  assert.ok(typeof chunk.sha256==='string' && /^[a-f0-9]{64}$/i.test(chunk.sha256) &&
    hash(bytes)===chunk.sha256.toLowerCase(),'Parent configuration chunk digest differs');
  const initializer=bytes.toString('utf8').match(/(?:^|;)var ([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\((`[^`$\r\n\\]+`|"[^"\r\n\\]+"|'[^'\r\n\\]+'),(`(?:sb_publishable_[\w-]+|e2e-public-anon-key|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)`|"(?:sb_publishable_[\w-]+|e2e-public-anon-key|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"|'(?:sb_publishable_[\w-]+|e2e-public-anon-key|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)')\);export\{\1 as supabase\};\s*$/);
  assert.ok(initializer,'Static public parent initializer absent');
  const key=initializer[3].slice(1,-1),publishable=/^sb_publishable_[\w-]+$/.test(key);
  let legacyAnon=false;
  // Classify bundled public configuration only, never authenticate a JWT or
  // read a user session. No key or claims escape this source-bound operation.
  if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const parts=key.split('.'),decoded=parts.map(part=>Buffer.from(part,'base64url'));
      const header=JSON.parse(decoded[0].toString('utf8')),claims=JSON.parse(decoded[1].toString('utf8'));
      legacyAnon=decoded.every((part,index)=>part.toString('base64url')===parts[index]) && decoded[2].length===32 &&
        header!==null && !Array.isArray(header) && header.alg==='HS256' && header.typ==='JWT' &&
        claims!==null && !Array.isArray(claims) && claims.iss==='supabase' && claims.role==='anon';
    } catch { /* Malformed or non-public configuration is refused below. */ }
  }
  assert.ok(publishable || legacyAnon || key==='e2e-public-anon-key','Static public parent key refused');
  let configured;
  try {configured=new URL(initializer[2].slice(1,-1));}catch{assert.fail('Static public parent origin refused');}
  assert.ok(!configured.username && !configured.password &&
    configured.pathname==='/' && !configured.search && !configured.hash,'Static public parent origin refused');
  // The original same-origin E2E build needs no external fixture capability.
  if(configured.origin===base.origin)return undefined;
  assert.ok(configured.protocol==='https:' && (publishable || legacyAnon),
    'Static public parent origin refused');
  const binding=Object.freeze({});
  configuredRejoinBindings.set(binding,{base:base.href,origin:configured.origin});
  return binding;
}

export async function routeLastStandRequest(route, base, {fault,rejoin,rejoinBinding}={}) {
  const request=route.request(),url=new URL(request.url());
  const binding=configuredRejoinBindings.get(rejoinBinding);
  const roomQuery='?select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at&id=eq.room-rejoin-fixture';
  if(rejoin && request.method()==='GET' && url.pathname==='/rest/v1/rooms' && url.search===roomQuery &&
    (url.origin===base.origin || (binding?.base===base.href && url.origin===binding.origin))) return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({id:'room-rejoin-fixture',code:'BACK',seed:17,
      options:{maxPlayers:2,maxWind:10,gravity:.15},players:[{id:'player-rejoin-fixture',name:'Ranger',color:'#e84d4d',ready:true}],status:'active'})});
  assert.equal(url.origin,base.origin,'No external backend or production traffic permitted');
  assert.equal(request.method(),'GET','Unexpected backend or non-GET transport refused');
  assert.ok(!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/functions/v1/'),'Unexpected backend endpoint refused');
  assert.ok(url.pathname.startsWith(base.pathname),'Transport escaped admitted product base');
  if(base.pathname==='/') {
    const binding=t21ParentBindings.get(base.href);assert.ok(binding,'Root transport has no qualified parent binding');
    const path=url.pathname==='/'?'index.html':url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1);
    assert.ok(Object.hasOwn(binding.files,path),'Root transport is outside exact production membership');
  }
  if(fault && url.pathname===fault) return route.abort('failed');
  return route.continue();
}

export function classifyBrowserEvidence(messages, failures, httpErrors, expectedFaults=[]) {
  const expected=[],accepted=[],requestErrors=[];
  const matches=(item,entry)=>item.load===entry.load && item.scope===entry.scope;
  const failedRequest=entry=>failures.filter(item=>matches(item,entry) && item.url===entry.url && item.method==='GET' &&
    item.resource_type===entry.resourceType && item.response_status===null && item.failure==='net::ERR_FAILED').length===1;
  const stackLines=text=>typeof text==='string'?text.split('\n').map(line=>line.trim()).filter(Boolean):[];
  const boundBootstrap=(text,entry,header)=>{
    const lines=stackLines(text),prefixes=[`at instantiateAsync (${entry.frameworkURL}:`,`at createWasm (${entry.frameworkURL}:`,
      `at ${entry.frameworkURL}:`,`at ${entry.loaderURL}:`];
    return lines.length===5 && lines[0]===header && prefixes.every((prefix,i)=>lines[i+1].startsWith(prefix) &&
      (i<2?/^\d+:\d+\)$/:/^\d+:\d+$/).test(lines[i+1].slice(prefix.length)));
  };
  const wasmConsoles=new Map();
  for(const entry of expectedFaults)if(entry.scope==='wasm-fault' && entry.resourceType==='fetch' && entry.url.endsWith('.wasm') &&
    [entry.documentURL,entry.frameworkURL,entry.loaderURL].every(value=>typeof value==='string') && failedRequest(entry)){
    const candidates=messages.filter(item=>matches(item,entry) && item.type==='error' && item.location?.url===entry.documentURL &&
      boundBootstrap(item.text,entry,'Last Stand load failed TypeError: Failed to fetch'));
    if(candidates.length===1)wasmConsoles.set(entry,candidates[0]);
  }
  const consoleErrors=classifyConsole(messages).filter(item=>{
    const fault=expectedFaults.find(entry=>matches(item,entry) && failedRequest(entry) &&
      ((entry.consoleTexts??[]).includes(item.text) || wasmConsoles.get(entry)===item ||
        (item.text==='Failed to load resource: net::ERR_FAILED' && item.location?.url===entry.url)));
    if(fault){expected.push(item);return false;}return true;
  });
  for(const failure of failures) {
    const success=`[UnityCache] '${failure.url}' successfully revalidated and served from the browser cache`;
    if(failure.failure==='net::ERR_ABORTED' && failure.response_status===304 && failure.method==='GET' && failure.resource_type==='fetch' && failure.url.endsWith('.data') &&
      messages.some(item=>item.type==='log' && item.load===failure.load && item.scope===failure.scope && item.text===success))accepted.push(failure);
    else if(expectedFaults.some(entry=>matches(failure,entry) && failure.url===entry.url && failure.method==='GET' &&
      failure.failure==='net::ERR_FAILED' && failure.response_status===null && failure.resource_type===entry.resourceType))expected.push(failure);
    else requestErrors.push(failure);
  }
  const unexpectedHTTP=httpErrors.filter(item=>{
    const fault=[...wasmConsoles].find(([entry,message])=>matches(item,entry) && item.kind==='pageerror' &&
      item.text==='TypeError: Failed to fetch' && boundBootstrap(item.stack,entry,'TypeError: Failed to fetch') &&
      stackLines(item.stack).join('\n')===stackLines(message.text.slice('Last Stand load failed '.length)).join('\n') &&
      httpErrors.filter(other=>matches(other,entry) && other.kind==='pageerror' && other.text==='TypeError: Failed to fetch').length===1);
    if(fault){expected.push(item);return false;}return true;
  });
  return { consoleErrors,requestErrors,httpErrors:unexpectedHTTP,accepted,expected };
}

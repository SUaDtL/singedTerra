export {changeLastStandSetting,lastStandDeploymentControl,validateKeyboardSubmit} from './lastStandJourneyActions.mjs';
import {admitJourneyPage,deployObservedJourney,purchaseJourneyCannon} from './lastStandJourneyRuntime.mjs';
export {admitJourneyPage,runWaveJourneyTest,deployObservedJourney,purchaseJourneyCannon} from './lastStandJourneyRuntime.mjs';
import {bindJourneyConsole} from './lastStandRuntimeObservation.mjs';
export {bindJourneyConsole} from './lastStandRuntimeObservation.mjs';
import { captureBackgroundCheckpoint, captureWaveTerminal, observeNaturalTerminal, collectHiddenWaveResult, retainHiddenWaveTerminal, checkProceduralJourneyCues, saveJourneyCannonAudio } from './lastStandJourneyRuntime.mjs';
export {observeReturnedWave,captureBackgroundCheckpoint,prepareSettlingInteraction,collectWaveResult,captureWaveTerminal,observeNaturalTerminal,collectHiddenWaveResult,retainHiddenWaveTerminal,checkProceduralJourneyCues,saveJourneyCannonAudio} from './lastStandJourneyRuntime.mjs';
import {createJourneyActions,changeLastStandSetting} from './lastStandJourneyActions.mjs';
export {createJourneyActions} from './lastStandJourneyActions.mjs';
export const LAST_STAND_HELPER_INPUTS=Object.freeze(['e2e/helpers/lastStandJourneyActions.mjs','e2e/helpers/lastStandEncounterOracle.mjs',
  'e2e/helpers/lastStandJourneyHost.mjs',
  'e2e/helpers/lastStandJourneyRuntime.mjs',
  'e2e/helpers/lastStandMediaCapture.mjs',
  'e2e/helpers/lastStandNativeDriver.mjs',
  'e2e/helpers/lastStandProcessOwnership.mjs',
  'e2e/helpers/lastStandProcessSupervisor.mjs',
  'e2e/helpers/lastStandRuntimeAdmission.mjs',
  'e2e/helpers/lastStandRuntimeObservation.mjs',
  'e2e/helpers/lastStandWaveGuards.mjs']);
import { observeJourneyRuntime, checkJourneyAudioReturn, runJourneyAway, focusJourneyDocument, throwJourneyObserverFailure, prepareJourneyPause, startBaselineCapture, measureBaselineImpact, observeUpgradedImpact } from './lastStandJourneyRuntime.mjs';
export {observeJourneyRuntime,checkJourneyAudioReturn,runJourneyAway,focusJourneyDocument,throwJourneyObserverFailure,prepareJourneyPause,startBaselineCapture,observeBaselineImpact,measureBaselineImpact,observeUpgradedImpact} from './lastStandJourneyRuntime.mjs';
import { readFileSync, openSync, writeSync, closeSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runTool, ROOT, fileHash, hash, admitEvidenceParent, SAVE_KEY, TITLE, SELECTION_KEY } from './lastStandJourneyHost.mjs';
import { join, resolve, dirname } from 'node:path';
import { packagedRuntimeSnapshot, assertServedBytes, classifyBrowserEvidence, assertPackagedRuntimeParity, admitJourneyBase, bindT21ServedParent, fetchBoundRuntime, routeLastStandRequest, bindConfiguredRejoinFixture, assertUnityReady } from './lastStandRuntimeAdmission.mjs';
import { randomUUID } from 'node:crypto';
import { ownedChrome, ensureOwnedNativeForeground, activateOwnedNativeWindow, retainAwayFailure, cleanupAwayAuxiliary } from './lastStandNativeDriver.mjs';
import { startMotion, AUDIO_CAPTURE, FRAME_PROBE, measureRenderedAudioEnergy, decodedAudio, frameTiming, retainRenderedAudioDiagnostics } from './lastStandMediaCapture.mjs';
import { nativeIntervalEvents, elapsedTicks, validateExplicitPause, validateBackgroundInterval } from './lastStandRuntimeObservation.mjs';
import { lastStandJourneySection, lastStandViewportPartition, LAST_STAND_ENTRY_ROUTES, LAST_STAND_VIEWPORTS as VIEWPORTS } from './lastStandMatrix.mjs';
import { release, arch } from 'node:os';
import { buildEncounterOracle } from './lastStandEncounterOracle.mjs';
import { buildWaveOracle } from './lastStandWaveOracle.mjs';
import { lastStandJourneyTimeBudget } from './lastStandProcessSupervisor.mjs';
import { assertWaveSavePreserved, assertIdleWaveSave, validateCheckpointResume, validateWaveAbandonSave } from './lastStandWaveGuards.mjs';
// Versioned diagnostics contract; player actions and state remain in production owners.
const OBSERVATION_CONTRACTS=[1,2,3].map(version=>JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v'+version+'.json',import.meta.url),'utf8')));

// T-21 uses the existing real controls and passive game observations. It has a
// distinct entry so the original full classic/background journey stays intact.
const SHOP_RUNTIME_PROBE = `(() => {
  const original = console.log;
  console.log = function(...args) {
    const text = args.map(String).join(' ');
    original.apply(this,args);
    if (['ST_LS_SHOP_STATE ','ST_LS_SHOP_PURCHASE ','ST_LS_SHOP_COMBAT ',
      'ST_LS_STATE ','ST_ENC_STATE ','ST_LS_HUD_LAYOUT '].some(tag=>text.includes(tag)))
      original.call(console,'ST_TEST_SHOP '+JSON.stringify({text,t:performance.now(),timeOrigin:performance.timeOrigin}));
  };
})();`;

export const SHOP_PLAYER_INPUTS = [...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandJourney.mjs','scripts/last-stand-playable-loop.mjs',
  'campaign-unity/Tools/verify_last_stand_loop.py','campaign-unity/Tools/last_stand_shop/test_shop_player.py',
  'campaign-unity/Tools/last_stand_shop/test_shop_player_portable.py',
  'campaign-unity/Tools/last_stand_shop/test_shop_delivery.py',
  'campaign-unity/Tools/last_stand_shop/test_shop_journey_guards.py',
  'campaign-unity/Tools/last_stand_shop/test_shop_artifact_guards.py',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json'];

// Full graphics observations exceed V8's single-string limit during the complete
// presentation matrix. Preserve every value, streaming JSON in bounded batches.
const presentationWriterAdapters={openSync,writeSync,closeSync,JSON};
export function writeShopPresentationJson(path,value,overrides={}){
  const {openSync,writeSync,closeSync,JSON}={...presentationWriterAdapters,...overrides};
  const fd=openSync(path,'w'),stack=new Set();let parts=[],length=0;
  const flush=()=>{if(length){writeSync(fd,parts.join(''));parts=[];length=0;}};
  const emit=text=>{if(length+text.length>1024*1024)flush();parts.push(text);length+=text.length;};
  const omitted=value=>value===undefined||typeof value==='function'||typeof value==='symbol';
  const visit=value=>{
    if(value&&typeof value.toJSON==='function')value=value.toJSON();
    if(value===null||typeof value!=='object'){emit(JSON.stringify(value)??'null');return;}
    if(stack.has(value))throw new TypeError('Circular presentation observation');
    stack.add(value);
    if(Array.isArray(value)){
      emit('[');for(let i=0;i<value.length;i++){if(i)emit(',');visit(value[i]);}emit(']');
    }else{
      emit('{');let first=true;
      for(const [key,item]of Object.entries(value)){if(omitted(item))continue;
        if(!first)emit(',');first=false;emit(JSON.stringify(key)+':');visit(item);}
      emit('}');
    }
    stack.delete(value);
  };
  try{visit(value);flush();}finally{closeSync(fd);}
}

// Admit the complete current controls and scroll fields without repairing a
// truncated Unity log. Geometry qualification additionally checks raw graphics.
export function readShopControlObservation(raw) {
  const tag=OBSERVATION_CONTRACTS[0].tag;
  assert.ok(typeof raw==='string' && raw.startsWith(tag),'Expected actual HUD control emission');
  const payload=raw.slice(tag.length),boundary=payload.indexOf(',"graphics":[');
  assert.ok(boundary>0,'Complete controls must precede the graphics array');
  const complete=JSON.parse(payload);
  // JSON.parse alone silently keeps the last repeated key. Refuse duplicates
  // before projecting evidence, including escaped spellings of the same key.
  const objects=[];
  for(let i=0;i<payload.length;i++){
    const c=payload[i];
    if(c==='{'||c==='[')objects.push(c==='{'?new Set():null);
    else if(c==='}'||c===']')objects.pop();
    else if(c==='"'){
      const start=i;for(i++;i<payload.length;i++){if(payload[i]==='\\')i++;else if(payload[i]==='"')break;}
      let after=i+1;while(/\s/.test(payload[after]??'')&&after<payload.length)after++;
      if(payload[after]===':'){
        const key=JSON.parse(payload.slice(start,i+1)),keys=objects.at(-1);
        assert.ok(keys&&!keys.has(key),'Duplicate JSON key: '+key);keys.add(key);
      }
    }
  }
  const contract=OBSERVATION_CONTRACTS[Object.hasOwn(complete,'schema')?2:Object.hasOwn(complete,'plannerControls')?1:0];
  if(Object.hasOwn(complete,'schema'))assert.equal(complete.schema,'singedterra-last-stand-observation/v3','Unknown HUD observation schema');
  const prefix=JSON.parse(payload.slice(0,boundary)+'}');
  const {header,tail}=contract;
  assert.deepEqual(Object.keys(prefix).filter(key=>!tail.includes(key)).sort(),[...header].sort(),'Exact complete controls header');
  // Research/history offsets follow graphics in the Unity record. A truncated
  // packet cannot qualify those panes: keep the raw failure rather than infer it.
  assert.deepEqual(Object.keys(complete).sort(),[...header,'graphics',...tail].sort(),'Exact current HUD observation');
  assert.ok(Array.isArray(complete.graphics),'Complete observed graphics required');
  const fields={...prefix,...Object.fromEntries(tail.map(key=>[key,complete[key]]))};
  assert.ok(fields.coordinates==='top-left' && typeof fields.phase==='string' && typeof fields.selection==='string');
  for(const name of contract.numeric)
    assert.ok(Number.isFinite(fields[name]) && fields[name]>=0,'Finite control coordinate: '+name);
  assert.ok(fields.width>0 && fields.height>0 && fields.pixelRatio>0);
  const names=contract.inventories.map(({field,names})=>[field,names]);
  const allNames=new Set();
  for(const [key,expected]of names) {
    const items=fields[key];assert.ok(Array.isArray(items) && items.length===expected.length,'Complete '+key);
    assert.deepEqual(items.map(item=>item.name).sort(),[...expected].sort(),'Unique known '+key);
    for(const item of items) {
      assert.ok(!allNames.has(item.name),'Control identity appears in one owner');allNames.add(item.name);
      assert.deepEqual(Object.keys(item).sort(),[...contract.controlStrings,...contract.controlNumbers,...contract.controlBooleans].sort());
      for(const name of contract.controlStrings)assert.equal(typeof item[name],'string');
      for(const name of contract.controlNumbers)assert.ok(Number.isFinite(item[name]),'Finite control bounds');
      assert.ok(item.width>=0 && item.height>=0 && typeof item.active==='boolean' && typeof item.interactable==='boolean');
    }
  }
  return {...fields,observationScope:'complete-controls-only',graphicsTruncated:false,raw};
}

// Use the catalog card's actual inline arrow and observe the equipped identity.
// Legacy ToggleFitting controls are retained only for old comparison surfaces.
export async function selectLastStandFitting({fitting,click,currentLayout,currentState,waitFor}) {
  assert.ok(['repair','launcher'].includes(fitting),'Known shipped player fitting required');
  assert.equal(currentState()?.menu,'','Inline fitting selection requires the actual garage');
  await waitFor(()=>Array.isArray(currentLayout()?.controls));
  const selected=()=>currentState()?.fittingId===fitting;
  if(!selected()) {
    const arrow=fitting==='launcher'?'FittingNext':'FittingPrevious';
    assert.ok(currentLayout().controls.some(item=>item.name===arrow&&item.active&&item.interactable),
      'Inline fitting arrow is visibly available');
    await click(arrow);await waitFor(selected);
  }
  assert.ok(selected(),'Actual fitting identity is selected');
  assert.equal(currentState().menu,'','Fitting arrows do not open a menu');
  const controls=currentLayout().controls;
  const previous=controls.filter(item=>item.name==='FittingPrevious'&&item.active),
    next=controls.filter(item=>item.name==='FittingNext'&&item.active);
  assert.equal(previous.length,1);assert.equal(next.length,1,'One pair of inline fitting arrows is visible');
  assert.equal(previous[0].interactable,fitting==='launcher','Current fitting has the correct previous endpoint');
  assert.equal(next[0].interactable,fitting==='repair','Current fitting has the correct next endpoint');
  assert.ok(controls.filter(item=>item.name==='ToggleFitting').every(item=>!item.active),
    'Legacy fitting toggle is hidden in the actual garage');
}

export function validateCompactCombatControls(layout){
  assert.ok(['battle','settling'].includes(layout.phase),'Actual combat layout required');
  assert.ok(layout.settingsControls.every(item=>!item.active),'Combat inspection requires closed settings');
  assert.deepEqual(layout.controls.filter(item=>item.active).map(item=>item.name).sort(),
    ['Menu','SpeedMinus','SpeedRate','SpeedPlus'].sort(),'Combat shows the floating Menu and one speed group');
  assert.deepEqual(layout.shopControls.filter(item=>item.active).map(item=>item.name),['ShopEntry'],
    'Combat exposes the separate real Upgrades entry');
  for(const name of ['Menu','SpeedRate'])assert.ok(layout.controls.some(item=>item.name===name&&item.interactable),
    'Combat action remains operable: '+name);
  assert.ok(layout.shopControls.find(item=>item.name==='ShopEntry').interactable,'Combat Upgrades remains operable');
  return layout;
}

// Small passive runtime witness, separate from the intentionally stable HUD
// control inventory. Imported-scene checks independently project module bounds.
export function validateFittingCalloutObservation(value,{visible,fitting,width,height}={}) {
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Actual fitting callout object required');
  assert.deepEqual(Object.keys(value).sort(),['visible','target','width','height','pixelRatio','anchorWorld','projectedAnchor','endpointScreen'].sort(),
    'Exact fitting callout observation shape');
  assert.equal(typeof value.visible,'boolean');assert.equal(typeof value.target,'string');
  for(const name of ['width','height'])assert.ok(Number.isInteger(value[name])&&value[name]>0,'Positive callout viewport '+name);
  assert.ok(Number.isFinite(value.pixelRatio)&&value.pixelRatio>0,'Positive callout pixel ratio');
  for(const [name,keys] of [['anchorWorld',['x','y','z']],['projectedAnchor',['x','y','z']],['endpointScreen',['x','y']]]){
    assert.ok(value[name]&&typeof value[name]==='object');assert.deepEqual(Object.keys(value[name]).sort(),[...keys].sort());
    for(const key of keys)assert.ok(Number.isFinite(value[name][key]),'Finite callout '+name+'.'+key);
  }
  if(visible!==undefined)assert.equal(value.visible,visible,'Callout has the required actual visibility');
  if(width!==undefined)assert.equal(value.width,width,'Callout belongs to current viewport width');
  if(height!==undefined)assert.equal(value.height,height,'Callout belongs to current viewport height');
  if(value.visible){
    const targets={repair:'Attachment_Repair',launcher:'Attachment_Launcher'};
    assert.ok(Object.values(targets).includes(value.target),'Callout names an authored fitting module');
    if(fitting!==undefined){assert.ok(Object.hasOwn(targets,fitting));assert.equal(value.target,targets[fitting],'Callout targets the actual equipped module');}
    assert.ok(value.projectedAnchor.z>0,'Visible callout projects in front of camera');
    for(const [key,limit] of [['x',value.width],['y',value.height]]){
      assert.ok(value.projectedAnchor[key]>=0&&value.projectedAnchor[key]<=limit,'Visible module anchor lies in viewport');
      assert.ok(Math.abs(value.endpointScreen[key]-value.projectedAnchor[key])<=1,'Callout endpoint agrees with projected module anchor');
    }
  }else{
    assert.equal(value.target,'','Hidden callout cannot identify a stale module');
    assert.deepEqual(value.projectedAnchor,{x:0,y:0,z:0});assert.deepEqual(value.endpointScreen,{x:0,y:0});
  }
  return value;
}

async function bindShopPlayerRuntime(baseURL) {
  const base=new URL(baseURL);
  assert.ok(base.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname) &&
    ['/', '/singedTerra/'].includes(base.pathname) && !base.username && !base.password && !base.search && !base.hash,
    'Shop journey requires a local parent artifact');
  const validation={};
  for(const name of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
    validation[name]=runTool(process.execPath,[join(ROOT,'scripts/assets',name)],{cwd:ROOT,encoding:'utf8'});
  const before=packagedRuntimeSnapshot();
  const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const documentaryPath=join(ROOT,'campaign-unity/docs/last-stand-mechanics-shop/shop-native-binding.json');
  const documentary=JSON.parse(readFileSync(documentaryPath,'utf8'));
  const receiptPath=join(ROOT,manifest.source.receipt),receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
  assert.equal(documentary.schema,'singedterra-last-stand-shop-binding/v1');
  assert.equal(documentary.nativeReceipt,false);
  assert.equal(documentary.package.manifestSha256,fileHash(manifestPath),'Shop binding predates this runtime');
  assert.equal(documentary.package.sanitizedReceiptSha256,fileHash(receiptPath));
  assert.equal(documentary.export.rawReceiptSha256,receipt.rawReceiptSha256);
  assert.equal(documentary.approvedShop['ST-LS-SHOP-SPEC'].normative_sha256,
    'c9e287036f5dab0320c9e9f99d5027cef1cfd224b45da023e45f962efd5cf1d0');
  assert.equal(documentary.approvedShop['ST-LS-SHOP-PLAN'].normative_sha256,
    '2f62410c9735e1d9e3fde6a9149e21a010e67ebbd2b501164f1554786f4e9a64');
  const binding={manifest_sha256:fileHash(manifestPath),receipt_sha256:fileHash(receiptPath),
    shop_binding_sha256:fileHash(documentaryPath),source_lock_sha256:manifest.source.sourceLockSha256,
    source_inventory_sha256:manifest.source.sourceInventorySha256,build:manifest.source.build,
    validation,input_files:Object.fromEntries(SHOP_PLAYER_INPUTS.map(path=>[path,fileHash(join(ROOT,path))])),served:{}};
  for(const [path,expected]of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256,
    'asset-manifest.json':fileHash(manifestPath)})) {
    assert.ok(/^[A-Za-z0-9_./-]+$/.test(path) && path.split('/').every(part=>part && part!=='.' && part!=='..'));
    const target=new URL(`last-stand/${path}`,base),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);let reader;
    try {
      const response=await fetch(target,{redirect:'manual',signal:controller.signal});
      assert.equal(response.status,200,'Shop runtime body unavailable');assert.equal(response.url,target.href);
      assert.ok(Number(response.headers.get('content-length')??0)<=128*1024*1024);
      reader=response.body.getReader();const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
        assert.ok(size<=128*1024*1024,'Shop runtime body exceeds existing bound');chunks.push(Buffer.from(value));}
      const bytes=Buffer.concat(chunks,size);assertServedBytes({status:response.status,bytes},expected);
      binding.served[path]={sha256:hash(bytes),bytes:size};
    } finally {clearTimeout(timer);controller.abort();if(reader)await reader.cancel().catch(()=>{});}
  }
  return {base,binding,before,documentaryPath};
}

export function assertHistoricalShopRuntime(receipt) {
  assert.equal(receipt?.schema,'singedterra-last-stand-export/v2','Historical Shop requires an explicit export receipt');
  assert.equal(receipt.status,'pass');assert.equal(receipt.complete,true);
  assert.ok(receipt.sourceFiles && typeof receipt.sourceFiles==='object' && !Array.isArray(receipt.sourceFiles),
    'Historical Shop requires an explicit source inventory');
  assert.ok(Object.keys(receipt.sourceFiles).some(path=>path.endsWith('/EncounterModel.cs')),
    'Historical Shop requires its actual combat source inventory');
  assert.ok(!Object.keys(receipt.sourceFiles).some(path=>path.endsWith('/LastStandWaveCatalog.cs')),
    'Historical v3/manual-Claim Shop journey cannot qualify current wave gameplay. '+
    'Run node scripts/last-stand-first-session.mjs <fresh-evidence-directory> for current earned wave/Shop input evidence; '+
    'run campaign-unity/Tools/last_stand_waves/test_checkpoint_store.py and '+
    'campaign-unity/Tools/last_stand_shop/test_shop_persistence.py for current storage fault coverage.');
}

export async function runLastStandShopJourney({baseURL,chromium,fitting}) {
  assert.ok(['launcher','repair'].includes(fitting),'Unknown Shop fitting');
  assertHistoricalShopRuntime(JSON.parse(readFileSync(resolve(ROOT,'campaign-unity/docs/last-stand-web/receipt-sanitized.json'),'utf8')));
  if(['background-storage','background-native'].includes(process.env.ST_SHOP_QUALIFICATION))
    return runShopRecoveryJourney({baseURL,chromium,fitting});
  const parent=admitEvidenceParent(process.env.ST_SHOP_TEST_EVIDENCE);
  assert.ok(process.env.ST_SHOP_TEST_EVIDENCE,'Shop journey needs an explicit fresh evidence parent');
  mkdirSync(parent,{recursive:true});
  const output=join(parent,`shop-${fitting}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(output);const path=join(output,'result.json');
  const track=fitting==='launcher'?'launcherAttack':'fieldRepair',eventKind=fitting==='launcher'?'Launcher':'Repair';
  const amount=fitting==='launcher'?16:4;
  const presentationStates=process.env.ST_SHOP_QUALIFICATION==='presentation-states';
  const presentationOverflow=process.env.ST_SHOP_QUALIFICATION==='presentation-overflow';
  const presentationRequested=presentationStates || presentationOverflow || process.env.ST_SHOP_QUALIFICATION==='presentation';
  const records={shopStates:[],purchases:[],combat:[],states:[],encounters:[],controlsOnly:[],storage:[],runtime:[],input:[]};
  const report={schema:'singedterra-shop-player/v1',status:'running',fitting,track,normal_speed:true,
    storage_scope:'fresh task-owned isolated profile',seeded:false,native_window_focus_claim:false,
    execution_mode:'shop-headless',owner_acceptance:false,actions:[],checks:[],screenshots:[],witnesses:{},records};
  if(presentationStates){report.schema='singedterra-shop-presentation-states/v1';report.seeded=true;
    report.fixture_scope='valid v1 capped-permanent compatibility and real storage denial; never earned-fund vertical evidence';records.storageEvents=[];}
  if(presentationOverflow){report.schema='singedterra-shop-overflow-diagnostic/v1';
    report.diagnostic_scope='real garage overflow inputs only; never complete vertical or presentation qualification';}
  const messages=[],failures=[],httpErrors=[];let native,page,bound,load=0,observerError,originalError,presentation,motion;
  const persist=(complete=false)=>{
    if(presentationRequested){const latest=report.presentation?.frames.at(-1);
      writeFileSync(join(output,'progress.json'),JSON.stringify({status:report.status,
        witnesses:Object.keys(report.witnesses),frames:report.presentation?.frames.length??0,
        latest_frame:latest?{phase:latest.phase,category:latest.category,viewport:latest.viewport,treatment:latest.treatment??'reading'}:null,
        error:report.error??null}));if(!complete)return;}
    if(presentationRequested){writeShopPresentationJson(path,report);writeShopPresentationJson(join(output,'console.json'),messages);}
    else{writeFileSync(path,JSON.stringify(report,null,2));writeFileSync(join(output,'console.json'),JSON.stringify(messages,null,2));}};
  const check=(condition,label,detail)=>{if(observerError)throw observerError;
    report.checks.push({name:label,pass:Boolean(condition),detail});assert.ok(condition,label);};
  const until=async(items,start,predicate,seconds=10)=>{
    const deadline=Date.now()+seconds*1000;
    while(Date.now()<deadline){if(observerError)throw observerError;
      const item=items.slice(start).findLast(value=>value.load===load && predicate(value));
      if(item)return item;await page.waitForTimeout(40);}
    if(observerError)throw observerError;throw new Error('Required real Shop observation absent within '+seconds+' seconds');
  };
  const current=items=>items.findLast(value=>value.load===load);
  const witness=(name,value)=>{report.witnesses[name]=structuredClone(value);persist();return value;};
  try {
    bound=await bindShopPlayerRuntime(baseURL);report.binding=bound.binding;report.base_url=bound.base.href;
    native=await ownedChrome(chromium,output,report.execution_mode);page=native.context.pages()[0];page.setDefaultTimeout(10000);
    report.browser_launch=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    report.browser_version=native.browser.version();await page.setViewportSize({width:1366,height:768});
    await page.addInitScript(SHOP_RUNTIME_PROBE);await page.addInitScript(INPUT_PROBE);
    if(presentationStates)await page.addInitScript(SHOP_STORAGE_PROBE+
      '\nwindow.__stShopPresentationInitialStorage=window.__stShopStorage.snapshot("before-app");');
    page.on('console',message=>{
      const raw=message.text();messages.push({type:message.type(),text:raw,location:message.location(),load,scope:'shop'});
      try {
        if(raw.startsWith('ST_TEST_SHOP ')) {
          const observation=JSON.parse(raw.slice('ST_TEST_SHOP '.length));
          const envelope={...observation,load,seq:records.runtime.length};records.runtime.push(envelope);
          for(const [tag,key]of [['ST_LS_SHOP_STATE ','shopStates'],['ST_LS_SHOP_PURCHASE ','purchases'],
            ['ST_LS_SHOP_COMBAT ','combat'],['ST_LS_STATE ','states'],['ST_ENC_STATE ','encounters'],['ST_LS_HUD_LAYOUT ','controlsOnly']]) {
            if(!observation.text.includes(tag))continue;
            const value=key==='controlsOnly'?readShopControlObservation(observation.text):JSON.parse(observation.text.split(tag)[1].split('\n')[0]);
            records[key].push({...value,
              t:observation.t,timeOrigin:observation.timeOrigin,load,seq:envelope.seq});
          }
        } else if(raw.startsWith('ST_TEST_INPUT '))records.input.push({...JSON.parse(raw.slice('ST_TEST_INPUT '.length)),load});
        else if(presentationStates && raw.startsWith('ST_TEST_STORAGE '))records.storageEvents.push({
          ...JSON.parse(raw.slice('ST_TEST_STORAGE '.length)),load,emittedRaw:raw});
      } catch(error){observerError??=error;const failure={raw,error:String(error),load};
        report.observer_failure??=failure;(report.observer_failures??=[]).push(failure);report.status='failed';persist();}
    });
    page.on('pageerror',error=>httpErrors.push({kind:'pageerror',text:String(error),load,scope:'shop'}));
    page.on('requestfailed',async request=>{const response=await request.response().catch(()=>null);
      failures.push({url:request.url(),failure:request.failure()?.errorText,method:request.method(),
        resource_type:request.resourceType(),response_status:response?.status()??null,load,scope:'shop'});});
    page.on('response',response=>{if(response.status()>=400)httpErrors.push({kind:'http',status:response.status(),url:response.url(),load,scope:'shop'});});
    await native.context.route('**/*',route=>{
      const target=new URL(route.request().url());
      return target.origin===bound.base.origin?route.continue():route.abort('blockedbyclient');
    });
    const storage=async label=>{
      const value=await page.evaluate(key=>({raw:localStorage.getItem(key),t:performance.now(),timeOrigin:performance.timeOrigin}),SAVE_KEY);
      const item={label,...value,load,data:value.raw===null?null:JSON.parse(value.raw)};records.storage.push(item);persist();return item;
    };
    const screenshot=async label=>{const file=label+'.png';await page.screenshot({path:join(output,file)});
      report.screenshots.push({file,sha256:fileHash(join(output,file)),load});};
    const click=async name=>{
      if(observerError)throw observerError;
      await page.bringToFront();
      if(process.platform==='win32' && report.execution_mode!=='shop-headless')
        await ensureOwnedNativeForeground({native,page,report,kind:name,role:'shop-input-precondition'});
      await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10000});
      const layout=current(records.controlsOnly),canvas=await page.locator('#unity-canvas').boundingBox();
      check(layout?.coordinates==='top-left' && canvas,'Current real HUD geometry');
      const candidates=[...layout.controls,...layout.shopControls,...layout.settingsControls].filter(item=>item.name===name && item.active && item.interactable);
      check(candidates.length===1,'One actual enabled control: '+name);
      const control=candidates[0];check(control.width*canvas.width/layout.width>=44-.01 && control.height*canvas.height/layout.height>=44-.01,
        'Actual control has a 44 CSS pixel target: '+name);
      const x=canvas.x+(control.x+control.width/2)*canvas.width/layout.width,
        y=canvas.y+(control.y+control.height/2)*canvas.height/layout.height;
      await page.evaluate("window.__stInputArea='gameplay'");
      const before=await page.evaluate('performance.now()');
      await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(150);
      if(presentation && !presentationStates && name.startsWith('ShopCard_'))await presentation.pressed(name);
      await page.mouse.up();
      report.actions.push({name,x,y,load,before,after:await page.evaluate('performance.now()'),layoutSeq:layout.seq});
      if(observerError)throw observerError;persist();
    };
    const card=state=>state.cards.find(item=>item.key===track);
    const fit=async()=>{
      await selectLastStandFitting({fitting,click,currentLayout:()=>current(records.controlsOnly),currentState:()=>current(records.states),
        waitFor:predicate=>until(records.states,0,()=>predicate())});
      check(card(current(records.shopStates)).eligible,'Selected fitting is eligible for its actual shop track');
    };
    const open=async()=>{
      let start=records.shopStates.length;await click('ShopEntry');await until(records.shopStates,start,state=>state.open);
      const category=fitting==='launcher'?'Attack':'Utility';
      if(current(records.shopStates).category!==category){start=records.shopStates.length;await click('ShopTab'+category);
        await until(records.shopStates,start,state=>state.open && state.category===category);}
    };
    const loadGame=async(expectedPhase='garage')=>{load++;await page.goto(new URL('last-stand/',bound.base).href,{waitUntil:'domcontentloaded'});
      await until(records.states,0,state=>state.action==='ready',60);await until(records.shopStates,0,state=>state.phase===expectedPhase);};
    await loadGame();
    if(presentationOverflow){
      witness('initial_storage',await storage('initial'));await fit();
      presentation=await createShopPresentation({page,native,output,report,records,current,until,click,load:()=>load,persist});
      await open();await presentation.overflowProbe();await presentation.close();
      report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors);
      check(!report.browser_evidence.consoleErrors.length && !report.browser_evidence.requestErrors.length &&
        !report.browser_evidence.httpErrors.length,'Overflow diagnostic browser remains error free');
      check(!records.purchases.length && !records.combat.length,'Overflow diagnostic never buys or deploys');
      assertPackagedRuntimeParity(bound.before,packagedRuntimeSnapshot());
      check(fileHash(bound.documentaryPath)===report.binding.shop_binding_sha256,'Overflow documentary binding stayed fixed');
      check(SHOP_PLAYER_INPUTS.every(item=>fileHash(join(ROOT,item))===report.binding.input_files[item]),'Overflow diagnostic source stayed fixed');
      report.status='pass';
    }else if(presentationStates){
      assert.equal(fitting,'repair');const legacy={version:1,credits:1,permanentLevel:3,nextRunId:1,lastFinalizedRunId:0,pendingDefeat:null};
      report.fixture_raw=JSON.stringify(legacy);report.fixture_origin='declared pre-existing v1 compatibility fixture in a fresh task-owned profile';
      report.initial_storage=await page.evaluate(()=>window.__stShopPresentationInitialStorage);
      report.pre_fixture_storage=await page.evaluate(()=>window.__stShopStorage.snapshot('before-fixture'));
      await page.evaluate(raw=>window.__stShopStorage.seed(raw),report.fixture_raw);await loadGame('workshop');
      report.migrated_storage=await page.evaluate(()=>window.__stShopStorage.snapshot('migrated-cap'));
      presentation=await createShopPresentation({page,native,output,report,records,current,until,click,load:()=>load,persist});
      await open();await presentation.category('Attack');
      check(current(records.shopStates).cards.find(c=>c.key==='cannonAttack').p===3,'Actual v1 migration retains capped Cannon level');
      report.capped_state=structuredClone(current(records.shopStates));await presentation.stateMatrix('capped');
      await presentation.category('Defense');report.denied_before=structuredClone(current(records.shopStates));
      await presentation.reveal('ShopCard_armorBuy');await page.evaluate(()=>window.__stShopStorage.mode('denied'));
      await click('ShopCard_armorBuy');await until(records.states,0,s=>s.saveState==='retry');
      report.denied_state=structuredClone(current(records.states));report.denied_shop=structuredClone(current(records.shopStates));
      report.denied_storage=await page.evaluate(()=>window.__stShopStorage.snapshot('denied-permanent'));
      await presentation.stateMatrix('save-disabled');
      await page.evaluate(()=>window.__stShopStorage.mode('pass'));await click('RetrySave');await until(records.states,0,s=>s.action==='save-recovered'&&s.saveState==='ready');
      report.recovered_state=structuredClone(current(records.states));
      report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors);
      check(!report.browser_evidence.consoleErrors.length && !report.browser_evidence.requestErrors.length &&
        !report.browser_evidence.httpErrors.length,'Fixture browser remains error free');
      assertPackagedRuntimeParity(bound.before,packagedRuntimeSnapshot());
      check(SHOP_PLAYER_INPUTS.every(item=>fileHash(join(ROOT,item))===report.binding.input_files[item]),'Presentation-state source stayed fixed');
      report.status='pass';
    } else {
    const initial=await storage('initial');witness('initial_storage',initial);
    check(initial.data===null || (initial.data.credits===0 && initial.data.pendingDefeat===null &&
      Object.values(initial.data.permanentLevels).every(value=>value===0)),'Fresh profile has no rewards or levels');
    await fit();
    if(presentationRequested){presentation=await createShopPresentation({page,native,output,report,records,current,until,click,
      load:()=>load,persist});await open();await presentation.matrix('garage');await presentation.close();}
    let start=records.shopStates.length;await click('Deploy');
    const deploy=witness('deploy',await until(records.shopStates,start,state=>state.hasActiveLedger && state.tick===0));
    check(deploy.scrap===0 && deploy.cards.every(item=>item.n===0 && item.p===0),'Actual first run starts empty');
    if(presentation){await open();await presentation.matrix('running');await presentation.close();}
    await until(records.shopStates,start,state=>state.uniqueKills>=2 && state.scrap>=5,80);
    start=records.states.length;await click('SpeedRate');await until(records.states,start,state=>state.paused);
    await open();if(presentation){await presentation.matrix('paused');await presentation.category(fitting==='launcher'?'Attack':'Utility');
      await presentation.reveal('ShopCard_'+track+'Buy');motion=await startMotion(native.context,page,output);
      report.presentation.media_begin=await presentation.clock();await page.waitForTimeout(300);}
    const before=witness('temporary_before',current(records.shopStates));witness('temporary_card_before',card(before));
    check(card(before).canPurchase && card(before).nextPrice===5,'Earned funds enable the five-Scrap purchase');
    const purchaseStart=records.purchases.length,stateStart=records.shopStates.length;await click('ShopCard_'+track+'Buy');
    const purchase=witness('temporary_purchase',await until(records.purchases,purchaseStart,item=>item.actionId==='ShopCard_'+track+'Buy'));
    check(purchase.accepted && purchase.chargedScrap===5,'Actual temporary purchase accepted once');
    const after=witness('temporary_after',await until(records.shopStates,stateStart,state=>card(state)?.n===1));
    check(after.scrap===before.scrap-5 && card(after).nextPrice===10,'Exact settled debit and next independent price');
    if(presentation)await presentation.purchaseFocus('ShopCard_'+track+'Buy');
    await screenshot('temporary-purchase');start=records.states.length;await click('SpeedRate');await until(records.states,start,state=>!state.paused);
    witness('temporary_effect',await until(records.combat,0,item=>item.runId===deploy.runId && item.tick>purchase.tick &&
      item.events.some(event=>event.kind===eventKind && event.amount===amount),65));
    if(presentation){await screenshot('temporary-effect');await page.waitForTimeout(500);report.presentation.media_end=await presentation.clock();
      const media=report.presentation.media=await motion.encode();motion=null;
      const frames=JSON.parse(readFileSync(join(output,media.raw),'utf8')).frames;
      media.frame_sha256=Object.fromEntries(frames.map(frame=>{
        assert.match(frame.file,/^frame-\d{6}\.jpg$/);return [frame.file,fileHash(join(output,dirname(media.raw),frame.file))];}));}
    const defeated=witness('defeat',await until(records.encounters,0,state=>state.action==='terminal' && state.status==='Defeated',190));
    const pending=witness('result',await until(records.states,0,state=>state.phase==='result' && state.pendingRunId===deploy.runId));
    witness('terminal',await until(records.shopStates,0,state=>state.phase==='result' && state.hasFinalAccounting && state.finalAccounting.runId===deploy.runId));
    if(presentation)await presentation.terminal();
    witness('claim_before',(await storage('claim-before')).data);await screenshot('ordinary-defeat');
    check(defeated.hp===0 && pending.wallet===0,'Natural defeat has not auto-claimed');
    start=records.states.length;await click('Claim');await until(records.states,start,state=>state.phase==='workshop' && state.wallet===1);
    witness('claim_after',(await storage('claim-after')).data);
    await open();if(presentation){await presentation.matrix('workshop');await presentation.category(fitting==='launcher'?'Attack':'Utility');
      await presentation.reveal('ShopCard_'+track+'Buy');}
    witness('permanent_before',current(records.shopStates));
    witness('permanent_card_before',card(current(records.shopStates)));
    start=records.shopStates.length;await click('ShopCard_'+track+'Buy');
    const permanentAfter=witness('permanent_state_after',await until(records.shopStates,start,state=>card(state)?.p===1));
    witness('permanent_card_after',card(permanentAfter));
    witness('permanent_after',(await storage('permanent-after')).data);await screenshot('permanent-investment');
    load++;await page.reload({waitUntil:'domcontentloaded'});await until(records.states,0,state=>state.action==='ready',60);
    await until(records.shopStates,0,state=>state.phase==='garage');witness('reload',(await storage('reload')).data);
    await fit();start=records.shopStates.length;await click('Deploy');
    const redeploy=witness('redeploy',await until(records.shopStates,start,state=>state.hasActiveLedger && state.tick===0));
    witness('redeploy_card',card(redeploy));
    witness('permanent_effect',await until(records.combat,0,item=>item.runId===redeploy.runId && item.tick>0 &&
      item.events.some(event=>event.kind===eventKind && event.amount===amount),80));
    await screenshot('permanent-effect');await storage('second-run');
    check(redeploy.scrap===0 && redeploy.cards.every(item=>item.n===0) && card(redeploy).p===1,'Redeploy retains only the permanent investment');
    report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors);
    check(!report.browser_evidence.consoleErrors.length && !report.browser_evidence.requestErrors.length &&
      !report.browser_evidence.httpErrors.length,'Browser and runtime remain error free',report.browser_evidence);
    assertPackagedRuntimeParity(bound.before,packagedRuntimeSnapshot());
    check(fileHash(bound.documentaryPath)===report.binding.shop_binding_sha256,'Shop documentary binding stayed fixed');
    check(SHOP_PLAYER_INPUTS.every(item=>fileHash(join(ROOT,item))===report.binding.input_files[item]),'Journey source stayed fixed');
    report.status='pass';
    }
  } catch(error){originalError=error;report.status='failed';report.error=String(error);report.stack=error.stack;}
  finally {
    try{if(motion)await motion.stop();}catch(error){report.motion_cleanup_error=String(error);report.status='failed';}
    try{if(page && !page.isClosed() && originalError)await page.screenshot({path:join(output,'failure.png')});}
    catch(error){report.screenshot_error=String(error);}
    try{if(native)await native.close();report.cleanup='complete';}
    catch(error){report.cleanup_error=String(error);report.status='failed';}
    persist(true);
  }
  return {path,status:report.status};
}

// Presentation is an opt-in observer over the same unseeded player journey.
// The diagnostic identifies rendered regions; PNG pixels supply contrast.
async function createShopPresentation({page,native,output,report,records,current,until,click,load,persist}) {
  const sharp=(await import('sharp')).default;
  const proof=report.presentation={schema:'singedterra-shop-presentation/v1',frames:[],inputs:[],
    viewports:[[720,640],[1920,1080],[1366,768],[390,844],[844,390]],owner_acceptance:false};
  let context={};
  await page.evaluate(()=>window.addEventListener('wheel',e=>console.log('ST_TEST_INPUT '+JSON.stringify({kind:e.type,
    area:window.__stInputArea,t:performance.now(),timeOrigin:performance.timeOrigin,x:e.clientX,y:e.clientY,
    deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,trusted:e.isTrusted,target:e.target?.id,
    focused:document.hasFocus(),hidden:document.hidden})),{capture:true,passive:true}));
  const clock=()=>page.evaluate('({t:performance.now(),timeOrigin:performance.timeOrigin})');
  const actual=()=>JSON.parse(current(records.controlsOnly).raw.slice('ST_LS_HUD_LAYOUT '.length));
  const state=()=>current(records.shopStates);
  const pause=()=>Boolean(current(records.states)?.paused);
  const waitPaint=async()=>{await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await page.waitForTimeout(100);};
  const rect=(item,layout,canvas)=>({x:canvas.x+item.x*canvas.width/layout.width,
    y:canvas.y+item.y*canvas.height/layout.height,width:item.width*canvas.width/layout.width,height:item.height*canvas.height/layout.height});
  const inside=(a,b)=>a.x>=b.x-.75 && a.y>=b.y-.75 && a.x+a.width<=b.x+b.width+.75 && a.y+a.height<=b.y+b.height+.75;
  const luminance=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
    .reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const screenshot=async(context)=>{
    await waitPaint();const observation=current(records.controlsOnly),layout=actual(),canvas=await page.locator('#unity-canvas').boundingBox();
    assert.ok(!observation.graphicsTruncated && layout.graphics.length>50,'Full actual graphics required');
    const before=await clock(),file=`matrix-${String(proof.frames.length).padStart(3,'0')}-${context.phase}-${context.category}.png`;
    await page.screenshot({path:join(output,file)});const after=await clock();
    const {data,info}=await sharp(join(output,file)).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const viewport=page.viewportSize(),sx=info.width/viewport.width,sy=info.height/viewport.height;
    const pixel=(x,y)=>{const offset=(y*info.width+x)*info.channels;return [...data.subarray(offset,offset+3)];};
    const texts=[];
    for(const graphic of layout.graphics.filter(g=>g.active && g.kind==='Text' && g.text.trim())){
      const box=rect(graphic,layout,canvas),clip=graphic.hasClip?rect(graphic.clip,layout,canvas):canvas;
      const full=inside(box,clip) && inside(box,canvas),visible=box.x+box.width>clip.x && box.x<clip.x+clip.width &&
        box.y+box.height>clip.y && box.y<clip.y+clip.height;
      const measurement={path:graphic.path,text:graphic.text,box,clip,full,visible,font_css:graphic.fontCssSize,
        preferred_height_css:graphic.preferredHeightCss};
      if(full){
        const expected=['r','g','b'].map(k=>255*graphic.color[k]*graphic.tint[k]);
        const pixels=[];for(let y=Math.max(0,Math.ceil(box.y*sy));y<Math.min(info.height,Math.floor((box.y+box.height)*sy));y++)
          for(let x=Math.max(0,Math.ceil(box.x*sx));x<Math.min(info.width,Math.floor((box.x+box.width)*sx));x++){
            const rgb=pixel(x,y);pixels.push({x,y,rgb,d:Math.hypot(...rgb.map((c,i)=>c-expected[i])),l:luminance(rgb)});}
        const core=pixels.filter(p=>p.d<=28).sort((a,b)=>a.d-b.d);
        assert.ok(core.length>=3,'Actual glyph core absent: '+graphic.path+' '+graphic.text);
        // Choose the closest rendered core and local background outside the
        // antialiasing edge, within the same text box on the actual texture.
        const foreground=core[Math.floor(core.length*.1)],backgrounds=[];
        for(const glyph of core.filter((_,i)=>i%Math.max(1,Math.floor(core.length/40))===0)){
          const nearby=[];
          for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
            const x=glyph.x+dx,y=glyph.y+dy;
            if(x<Math.ceil(box.x*sx)+1||x>=Math.floor((box.x+box.width)*sx)-1||y<Math.ceil(box.y*sy)+1||y>=Math.floor((box.y+box.height)*sy)-1)continue;
            const rgb=pixel(x,y);if(Math.hypot(...rgb.map((c,i)=>c-expected[i]))<=65)continue;
            const patch=[];for(let py=y-1;py<=y+1;py++)for(let px=x-1;px<=x+1;px++)patch.push(pixel(px,py));
            if([0,1,2].every(channel=>Math.max(...patch.map(p=>p[channel]))-Math.min(...patch.map(p=>p[channel]))<=10))
              nearby.push({x,y,rgb,l:luminance(rgb),patch,anchor:{x:glyph.x,y:glyph.y}});
          }
          // A uniform 3x3 patch excludes one-pixel antialiasing edges while
          // admitting the real background gradient/texture at each glyph.
          // Retain its worst contrast, never the dominant colour of the panel.
          if(nearby.length){nearby.sort((a,b)=>contrast(foreground.rgb,a.rgb)-contrast(foreground.rgb,b.rgb));backgrounds.push(nearby[0]);}
        }
        assert.ok(backgrounds.length,'Actual local text background absent: '+graphic.path);
        backgrounds.sort((a,b)=>contrast(foreground.rgb,a.rgb)-contrast(foreground.rgb,b.rgb));
        const background=backgrounds[0];measurement.contrast={ratio:contrast(foreground.rgb,background.rgb),
          foreground,background,core_pixels:core.length,background_regions:backgrounds.length,
          method:'rendered glyph core against lowest-contrast local 3x3 background patch within 6 pixels; maximum per-channel patch range 10'};
      }
      texts.push(measurement);
    }
    const controls=[...layout.controls,...layout.shopControls].filter(c=>c.active).map(c=>({name:c.name,
      enabled:c.interactable,box:rect(c,layout,canvas),label:c.accessibleLabel}));
    const shell=await page.evaluate(()=>{const r=document.querySelector('#last-stand-return'),b=r.getBoundingClientRect(),s=getComputedStyle(r);
      return {return:{x:b.x,y:b.y,width:b.width,height:b.height,font:parseFloat(s.fontSize),color:s.color,background:s.backgroundColor},
        scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
        scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,active:document.activeElement?.id};});
    const frame={...context,file,sha256:fileHash(join(output,file)),viewport,canvas,load:load(),before,after,
      layout_seq:observation.seq,state_seq:state().seq,loop_seq:current(records.states).seq,paused:pause(),
      scroll_offset:layout.scrollOffset,maximum_scroll:layout.maximumScrollOffset,selection:layout.selection,texts,controls,shell};
    proof.frames.push(frame);persist();
    assert.ok(texts.every(t=>!t.full || t.font_css>=14-.01),'Rendered text smaller than 14 CSS pixels: '+file);
    assert.ok(texts.every(t=>!t.full || t.preferred_height_css<=t.box.height+1),'Rendered text vertically truncated: '+file);
    assert.ok(texts.every(t=>!t.full || t.contrast.ratio>=4.5),'Rendered text contrast below 4.5: '+file+' '+
      texts.filter(t=>t.full&&t.contrast.ratio<4.5).map(t=>t.path+':'+t.contrast.ratio.toFixed(2)).join(', '));
    assert.ok(controls.every(c=>c.box.width>=43.99&&c.box.height>=43.99),'Rendered targets smaller than 44 CSS pixels');
    assert.ok(shell.scrollWidth<=shell.clientWidth && shell.scrollHeight<=shell.clientHeight,'Outer page overflow');
    if(context.comparison_frame){
      const prior=proof.frames.find(f=>f.file===context.comparison_frame),control=controls.find(c=>c.name===context.focused_control);
      assert.ok(prior && control && frame.selection===control.name,'Focus comparison must name the actual selected control');
      const previous=await sharp(join(output,prior.file)).removeAlpha().raw().toBuffer();let changed=0,samples=0;
      const box=control.box;
      for(let y=Math.ceil(box.y);y<Math.floor(box.y+box.height);y++)for(let x=Math.ceil(box.x);x<Math.floor(box.x+box.width);x++){
        if(x>box.x+6 && x<box.x+box.width-6 && y>box.y+6 && y<box.y+box.height-6)continue;
        const offset=(y*info.width+x)*info.channels;const distance=Math.hypot(...[0,1,2].map(c=>data[offset+c]-previous[offset+c]));
        samples++;if(distance>30)changed++;
      }
      frame.focus_pixels={changed,samples,threshold:30,band_css:6};
      assert.ok(changed>=10,'Keyboard focus has no visible changed frame pixels');
    }
    return frame;
  };
  const category=async(name)=>{
    if(state().category!==name){const start=records.shopStates.length;await click('ShopTab'+name);
      await until(records.shopStates,start,s=>s.open&&s.category===name);}
    await waitPaint();
  };
  const key=async(code)=>{
    const before=await clock(),layout=current(records.controlsOnly),inputStart=records.input.length;
    await page.evaluate("window.__stInputArea='shop-presentation-keyboard'");
    await page.keyboard.down(code);await page.waitForTimeout(90);await page.keyboard.up(code);await waitPaint();
    proof.inputs.push({...context,kind:'keyboard',code,before,after:await clock(),load:load(),layout_before:layout.seq,
      layout_after:current(records.controlsOnly).seq,input_start:inputStart,input_end:records.input.length,
      selection_before:layout.selection,selection_after:current(records.controlsOnly).selection,state_after:state().seq});
  };
  const keyboard=async()=>{
    // Focusing the native Return link does not activate it or navigate away.
    const comparison=proof.frames.at(-1)?.file;
    let seen=[],stable=false;
    const enabled=()=>[...actual().controls,...actual().shopControls].filter(c=>c.active&&c.interactable).map(c=>c.name).sort();
    // Genuine kills can enable a Buy after Tab has already passed its position.
    // Admit one complete traversal only when its start/end inventory agrees.
    // Three bounded cycles retain every transition; stable failures never retry.
    for(let cycle=0;cycle<3&&!stable;cycle++){
      await page.locator('#last-stand-return').focus();seen=[];const before=enabled();
      for(let n=0;n<20;n++){
        await key('Tab');const selected=actual().selection;
        if(await page.locator('#last-stand-return').evaluate(e=>document.activeElement===e))break;
        assert.ok(selected,'Tab must select a real control');assert.ok(!seen.includes(selected),'Tab traversal cycled before Return');seen.push(selected);
        if(cycle===0&&n===0)await screenshot({phase:context.phase,category:state().category,treatment:'keyboard-focus',
          focused_control:selected,comparison_frame:comparison});
      }
      const after=enabled();stable=JSON.stringify(before)===JSON.stringify(after);
      (proof.keyboard_inventories??=[]).push({...context,cycle,before,after,seen:[...seen],stable});
      if(stable)assert.deepEqual([...seen].sort(),after,'Real Tab traversal reaches every enabled control once');
    }
    assert.ok(stable,'Enabled input inventory did not settle within three real Tab cycles');
    await key('Tab');await key('Tab');
    assert.equal(actual().selection,seen[1],'Tab enters the second control');
    await page.keyboard.down('Shift');await key('Tab');await page.keyboard.up('Shift');
    assert.equal(actual().selection,seen[0],'Shift+Tab reverses the real in-canvas traversal');
    // Activate a category with Enter; this exercises submit without buying or
    // changing the authoritative economy during the layout matrix.
    await page.locator('#last-stand-return').focus();
    for(let n=0;n<20 && actual().selection!=='ShopTabDefense';n++)await key('Tab');
    assert.equal(actual().selection,'ShopTabDefense');const start=records.shopStates.length;await key('Enter');
    await until(records.shopStates,start,s=>s===state()&&s.open&&s.category==='Defense');
  };
  const touch=async()=>{
    const session=await native.context.newCDPSession(page);const layout=current(records.controlsOnly),canvas=await page.locator('#unity-canvas').boundingBox();
    const control=layout.shopControls.find(c=>c.name==='ShopTabUtility'),box=rect(control,layout,canvas);
    const x=box.x+box.width/2,y=box.y+box.height/2,before=await clock(),inputStart=records.input.length,stateStart=records.shopStates.length;
    await page.evaluate("window.__stInputArea='shop-presentation-touch'");
    await session.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await page.waitForTimeout(100);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});await session.detach();
    await until(records.shopStates,stateStart,s=>s===state()&&s.open&&s.category==='Utility');await waitPaint();
    proof.inputs.push({...context,kind:'touch',name:control.name,x,y,before,after:await clock(),load:load(),layout_before:layout.seq,
      layout_after:current(records.controlsOnly).seq,input_start:inputStart,input_end:records.input.length,state_after:state().seq});
  };
  const scroll=async(delta)=>{
    const layout=actual(),canvas=await page.locator('#unity-canvas').boundingBox();
    const viewport=layout.graphics.find(g=>g.path.endsWith('ShopViewport')&&g.active);
    assert.ok(viewport,'Actual clipped viewport present');const box=rect(viewport,layout,canvas),before=await clock();
    await page.evaluate("window.__stInputArea='shop-presentation-wheel'");
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,delta);await page.waitForTimeout(230);await waitPaint();
    proof.inputs.push({...context,kind:'wheel',delta,before,after:await clock(),load:load(),offset_before:layout.scrollOffset,
      offset_after:actual().scrollOffset,layout_after:current(records.controlsOnly).seq});
    if(Math.abs(actual().scrollOffset-layout.scrollOffset)<.01 &&
      (delta>0&&layout.scrollOffset<layout.maximumScrollOffset-.8 || delta<0&&layout.scrollOffset>.8)){
      const begin=await clock(),inputStart=records.input.length,x=box.x+box.width/2,y=box.y+box.height*.7;
      await page.evaluate("window.__stInputArea='shop-presentation-drag'");
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-Math.sign(delta)*Math.min(80,box.height*.4),{steps:8});
      await page.mouse.up();await waitPaint();
      proof.inputs.push({...context,kind:'drag',before:begin,after:await clock(),load:load(),input_start:inputStart,input_end:records.input.length,
        offset_before:layout.scrollOffset,offset_after:actual().scrollOffset,layout_after:current(records.controlsOnly).seq});
      assert.ok(Math.abs(actual().scrollOffset-layout.scrollOffset)>.01,'Neither wheel nor pointer drag moves the actual clipped Shop panel');
    }
  };
  const reveal=async(name)=>{
    for(let n=0;n<15;n++){
      const layout=actual(),control=layout.shopControls.find(c=>c.name===name),graphic=layout.graphics.find(g=>g.path.endsWith('/'+name)&&g.active);
      assert.ok(control?.active && graphic,'Expected fitted card exists');
      if(!graphic.hasClip || inside(control,graphic.clip))return;
      await dragScroll(control.y<graphic.clip.y?control.y-graphic.clip.y-1:
        control.y+control.height-graphic.clip.y-graphic.clip.height+1);
    }
    throw new Error('Real scrolling did not reveal '+name);
  };
  const dragScroll=async(amount)=>{
    const layout=actual(),observation=current(records.controlsOnly),canvas=await page.locator('#unity-canvas').boundingBox();
    const viewport=layout.graphics.find(g=>g.path.endsWith('ShopViewport')&&g.active),box=rect(viewport,layout,canvas);
    const sign=Math.sign(amount),distance=Math.min(Math.abs(amount),box.height-16),x=box.x+box.width/2;
    const y=sign>0?box.y+box.height-2:box.y+2,before=await clock(),inputStart=records.input.length;
    assert.ok(distance>0,'Actual viewport has room for a bounded drag');
    await page.evaluate("window.__stInputArea='shop-presentation-drag'");
    await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(40);
    // Cross the native threshold first, then move the actual requested distance.
    await page.mouse.move(x,y-sign*12,{steps:2});await page.waitForTimeout(40);
    await page.mouse.move(x,y-sign*(12+distance),{steps:4});await page.mouse.up();await waitPaint();
    proof.inputs.push({...context,kind:'drag',before,after:await clock(),load:load(),input_start:inputStart,input_end:records.input.length,
      layout_before:observation.seq,offset_before:layout.scrollOffset,offset_after:actual().scrollOffset,
      layout_after:current(records.controlsOnly).seq});
    assert.ok(Math.abs(actual().scrollOffset-layout.scrollOffset)>.01,'Real target-directed drag did not move the clipped panel');
  };
  const compactGestures=async(name=report.fitting==='launcher'?'Attack':'Defense')=>{
    const replay=proof.compact_scroll={category:name,gestures:[]};
    const initial=state(),saveBefore=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),purchases=records.purchases.length;
    for(const kind of ['wheel','mouse-drag','touch-drag']){
      // The real category intent resets scroll; never assign content position.
      await category(name==='Attack'?'Defense':'Attack');await category(name);
      const layout=actual(),observation=current(records.controlsOnly),canvas=await page.locator('#unity-canvas').boundingBox();
      assert.equal(layout.scrollOffset,0,'Category intent resets the actual scroll position');
      assert.ok(layout.maximumScrollOffset>0,'Compact replay requires genuinely clipped cards');
      const viewport=layout.graphics.find(g=>g.path.endsWith('ShopViewport')&&g.active),box=rect(viewport,layout,canvas);
      const controls=layout.shopControls.filter(c=>c.active&&c.name.startsWith('ShopCard_'));
      const target=controls.at(-1),targetBox=rect(target,layout,canvas);
      assert.ok(targetBox.height<=box.height,'Complete lower Buy must fit inside the actual viewport');
      const before=await clock(),inputStart=records.input.length,attempts=[];
      // Each gesture stays inside the real viewport. A small native-threshold
      // reserve is added to the remaining observed clipping; repeated gestures
      // are bounded by the actual scroll range and must each make progress.
      const inset=4,thresholdReserve=16,available=box.height-inset*2;
      assert.ok(available>thresholdReserve,'Viewport must allow a bounded native drag');
      const limit=Math.ceil(layout.maximumScrollOffset*canvas.height/layout.height/(available-thresholdReserve))+2;
      assert.ok(limit<=30,'Overflow replay exceeds the bounded real scroll range');
      await page.evaluate(area=>window.__stInputArea=area,'shop-presentation-'+kind);
      for(let step=0;step<limit;step++){
        const observed=actual(),observedViewport=observed.graphics.find(g=>g.path.endsWith('ShopViewport')&&g.active);
        const observedTarget=observed.shopControls.find(c=>c.name===target.name);
        if(inside(observedTarget,observedViewport))break;
        const targetRect=rect(observedTarget,observed,canvas),viewportRect=rect(observedViewport,observed,canvas);
        const remaining=Math.max(1,targetRect.y+targetRect.height-viewportRect.y-viewportRect.height+2);
        const distance=Math.min(available,remaining+thresholdReserve),x=viewportRect.x+viewportRect.width/2,
          y=viewportRect.y+viewportRect.height-inset,endY=y-distance;
        assert.ok(endY>=viewportRect.y+inset && y<=viewportRect.y+viewportRect.height-inset,'Gesture endpoints stay inside viewport');
        const attempt={x,y,endY,distance,remaining,offset_before:observed.scrollOffset,
          layout_before:current(records.controlsOnly).seq,input_start:records.input.length};
        if(kind==='wheel'){
          await page.mouse.move(x,y);await page.mouse.wheel(0,distance*3);await page.waitForTimeout(230);
        }else if(kind==='mouse-drag'){
          await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(100);
          await page.mouse.move(x,endY,{steps:8});await page.waitForTimeout(100);await page.mouse.up();
        }else{
          const session=await native.context.newCDPSession(page);
          try{await session.send('Emulation.setTouchEmulationEnabled',{enabled:true});
            await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
            await page.waitForTimeout(100);
            for(let part=1;part<=8;part++){
              await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-distance*part/8,id:1}]});
              await page.waitForTimeout(20);}
            await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          }finally{await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});await session.detach();}
        }
        await waitPaint();attempt.offset_after=actual().scrollOffset;attempt.layout_after=current(records.controlsOnly).seq;
        attempt.input_end=records.input.length;attempts.push(attempt);
        assert.ok(attempt.offset_after>attempt.offset_before,'Each real overflow gesture must make observed progress');
      }
      await waitPaint();const afterLayout=actual(),afterObservation=current(records.controlsOnly),after=await clock();
      const actualTarget=afterLayout.shopControls.find(c=>c.name===target.name);
      const item={kind,before,after,load:load(),target:target.name,offset_before:layout.scrollOffset,offset_after:afterLayout.scrollOffset,
        layout_before:observation,layout_after:afterObservation,inputs:records.input.slice(inputStart),attempts};
      replay.gestures.push(item);
      assert.ok(afterLayout.scrollOffset>0,'Real '+kind+' did not move the compact panel');
      assert.ok(inside(actualTarget,afterLayout.graphics.find(g=>g.path.endsWith('ShopViewport')&&g.active)),
        'Real '+kind+' did not reveal the complete lower Buy target');
      item.frame=(await screenshot({phase:'garage',category:name,treatment:kind+'-scroll'})).file;
    }
    replay.save_unchanged=saveBefore===await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
    replay.no_purchase=records.purchases.length===purchases;
    replay.no_model_change=state().phase===initial.phase&&state().scrap===initial.scrap&&
      state().cards.every(c=>{const old=initial.cards.find(x=>x.key===c.key);return c.n===old.n&&c.p===old.p;})&&!pause();
    assert.ok(replay.save_unchanged&&replay.no_purchase&&replay.no_model_change,'Scrolling changed save, economy or pause');
    proof.compact_scroll=replay;
    writeFileSync(join(output,'compact-scroll-replay.json'),JSON.stringify({build:report.binding.build,fitting:report.fitting,
      binding:report.binding,replay},null,2));
    await category(name==='Attack'?'Defense':'Attack');await category('Attack');
    return replay;
  };
  const overflowProbe=async()=>{
    context={phase:'garage',viewport:{width:844,height:390}};
    await page.setViewportSize(context.viewport);await waitPaint();
    const canvas=await page.locator('#unity-canvas').boundingBox();
    await until(records.controlsOnly,0,l=>Math.abs(l.width/l.pixelRatio-canvas.width)<1 && Math.abs(l.height/l.pixelRatio-canvas.height)<1);
    proof.overflow_probes=[];
    for(const name of ['Attack','Defense','Utility']){
      await category(name);const layout=actual();
      proof.overflow_probes.push(layout.maximumScrollOffset>0?await compactGestures(name):
        {category:name,maximum_scroll:layout.maximumScrollOffset,layout_seq:current(records.controlsOnly).seq,not_overflowing:true});
    }
    assert.ok(proof.overflow_probes.some(item=>item.gestures?.length===3),'Probe requires actual overflowing cards');
    writeFileSync(join(output,'overflow-probe.json'),JSON.stringify({binding:report.binding,fitting:report.fitting,
      probes:proof.overflow_probes},null,2));
  };
  const matrix=async(phase)=>{
    // Replay the previously unusable running layout first. The corrected 720
    // panel fits its cards; the short landscape profile still has real overflow.
    const profiles=phase==='running'?[...proof.viewports].sort((a,b)=>(b[0]===720)-(a[0]===720)):proof.viewports;
    for(const [width,height]of profiles){
      context={phase,viewport:{width,height}};
      await page.setViewportSize({width,height});await waitPaint();
      const canvas=await page.locator('#unity-canvas').boundingBox();
      await until(records.controlsOnly,0,l=>Math.abs(l.width/l.pixelRatio-canvas.width)<1 && Math.abs(l.height/l.pixelRatio-canvas.height)<1);
      if(phase==='garage'&&width===844&&height===390)await compactGestures();
      for(const name of ['Attack','Defense','Utility']){
        await category(name);if(actual().scrollOffset>0)await scroll(-10000);
        const seen=new Set();
        for(let n=0;n<30;n++){
          const frame=await screenshot({phase,category:name});
          for(const t of frame.texts.filter(t=>t.full))seen.add(t.path);
          const remaining=frame.texts.filter(t=>t.path.includes('ShopCard_')&&!seen.has(t.path));
          if(!remaining.length)break;
          const target=remaining[0];assert.ok(target.box.height<=target.clip.height+.75,'Actual text cannot fit inside the card viewport');
          const desired=target.box.y<target.clip.y?target.box.y-target.clip.y-1:
            target.box.y+target.box.height-target.clip.y-target.clip.height+1;
          await dragScroll(desired);
        }
        const required=actual().graphics.filter(g=>g.active&&g.kind==='Text'&&g.text.trim()&&g.path.includes('ShopCard_')).map(g=>g.path);
        assert.ok(required.every(path=>seen.has(path)),'Every card text region must be reachable in '+phase+'/'+name+'/'+width+'x'+height);
      }
      if(phase==='running'&&width===720&&height===640){
        const frames=proof.frames.filter(f=>f.phase===phase&&f.viewport.width===width&&f.viewport.height===height);
        for(const frame of frames){
          const texts=frame.texts.filter(t=>t.path.includes('ShopCard_'));
          assert.ok(texts.length&&texts.every(t=>t.full),'Running720 must show complete upgrade information together');
          for(const control of frame.controls.filter(c=>c.name.startsWith('ShopCard_'))){
            const text=texts.find(t=>t.path.endsWith('/'+control.name+'Text'));
            assert.ok(text&&inside(control.box,text.clip),'Running720 must show each complete Buy with its information');
          }
        }
        writeFileSync(join(output,'running720-reading-replay.json'),JSON.stringify({build:report.binding.build,
          fitting:report.fitting,binding:report.binding,frames},null,2));
      }
      await keyboard();await touch();
      assert.equal(state().phase,phase==='running'||phase==='paused'?'battle':phase,'Matrix stays in its real phase');
      assert.equal(pause(),phase==='paused','Matrix does not pause or resume gameplay');
      await close();const start=records.shopStates.length;await click('ShopEntry');await until(records.shopStates,start,s=>s.open);
    }
    await page.setViewportSize({width:1366,height:768});await waitPaint();persist();
  };
  const close=async()=>{const start=records.shopStates.length;await click('ShopClose');
    await until(records.shopStates,start,s=>!s.open);await waitPaint();
    proof.inputs.push({...context,kind:'close-return',load:load(),layout_after:current(records.controlsOnly).seq,selection:actual().selection});
    assert.equal(actual().selection,'ShopEntry','Close returns to its entry control');};
  const terminal=async()=>{await waitPaint();const layout=actual(),enabled=[...layout.controls,...layout.shopControls].filter(c=>c.active&&c.interactable);
    assert.ok(enabled.some(c=>c.name===layout.selection),'Terminal focus is a valid live control');
    assert.ok(!layout.selection.startsWith('ShopCard_'),'Terminal cannot retain a purchase selection');
    proof.terminal={layout_seq:current(records.controlsOnly).seq,state_seq:state().seq,selection:layout.selection,load:load()};};
  const purchaseFocus=async(name)=>{await waitPaint();const layout=actual(),control=layout.shopControls.find(c=>c.name===name);
    const selected=[...layout.controls,...layout.shopControls].find(c=>c.name===layout.selection);
    assert.ok(selected?.active && selected.interactable,'Purchase refresh retains valid focus');
    if(control.interactable)assert.equal(layout.selection,name,'Refresh retains the selected enabled Buy');
    proof.purchase_focus={name,layout_seq:current(records.controlsOnly).seq,state_seq:state().seq,selection:layout.selection};};
  const stateMatrix=async(label)=>{
    for(const [width,height]of proof.viewports){context={phase:label,viewport:{width,height}};
      await page.setViewportSize({width,height});await waitPaint();
      const canvas=await page.locator('#unity-canvas').boundingBox();
      await until(records.controlsOnly,0,l=>Math.abs(l.width/l.pixelRatio-canvas.width)<1 && Math.abs(l.height/l.pixelRatio-canvas.height)<1);
      if(actual().scrollOffset>0)await scroll(-10000);
      const seenText=new Set(),seenControls=new Set();let complete=false;
      for(let step=0;step<30;step++){
        const frame=await screenshot({phase:label,category:state().category}),layout=actual();
        for(const text of frame.texts.filter(text=>text.full))seenText.add(text.path);
        const controls=frame.controls.map(control=>{
          const graphic=layout.graphics.find(g=>g.active&&g.path.endsWith('/'+control.name));
          const clip=graphic?.hasClip?rect(graphic.clip,layout,frame.canvas):frame.canvas;
          if(inside(control.box,clip)&&inside(control.box,frame.canvas))seenControls.add(control.name);
          return {...control,clip};});
        const missingText=frame.texts.filter(text=>!seenText.has(text.path));
        const missingControls=controls.filter(control=>!seenControls.has(control.name));
        if(!missingText.length&&!missingControls.length){complete=true;break;}
        const target=missingText[0]??missingControls[0];
        assert.ok(target.box.height<=target.clip.height+.75,'State region must fit inside its actual viewport');
        await dragScroll(target.box.y<target.clip.y?target.box.y-target.clip.y-1:
          target.box.y+target.box.height-target.clip.y-target.clip.height+1);
      }
      assert.ok(complete,'Every state text and control must be rendered in '+label+'/'+width+'x'+height);
    }
    await page.setViewportSize({width:1366,height:768});await waitPaint();};
  const pressed=async(name)=>screenshot({phase:state().phase==='battle'?(pause()?'paused':'running'):state().phase,
    category:state().category,treatment:'pointer-pressed',pressed_control:name});
  return {matrix,category,reveal,close,terminal,clock,purchaseFocus,stateMatrix,pressed,overflowProbe};
}

// Faults affect only the real prototype Storage calls in the owned document.
// Snapshot reads bypass the induced fault and retain the actual persisted bytes;
// they do not tell the application that an unconfirmed write succeeded.
// T22 adds document visibility to passive emissions without overwriting the
// engine's separate focused field or changing the T21/native probes.
const SHOP_RECOVERY_PROBE = SHOP_RUNTIME_PROBE.replace(
  'timeOrigin:performance.timeOrigin}',
  'timeOrigin:performance.timeOrigin,documentHidden:document.hidden,documentFocused:document.hasFocus()}');

const SHOP_STORAGE_PROBE = `(() => {
  const key='singedTerra.lastStand.prototype.v1', config='__stShopStorageFault';
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  let mode=get.call(sessionStorage,config)||'pass', written=false, prior=null;
  const emit=value=>console.log('ST_TEST_STORAGE '+JSON.stringify({...value,mode,t:value.t??performance.now(),timeOrigin:value.timeOrigin??performance.timeOrigin}));
  Storage.prototype.getItem=function(name){
    if(this!==localStorage||name!==key)return get.call(this,name);
    const actual=get.call(this,name);
    if(mode==='uncertain'&&written){emit({op:'get',actual,outcome:'throw'});throw new Error('T22 owned readback denial');}
    const value=mode==='mismatch'&&written?prior:actual;
    emit({op:'get',actual,value,outcome:'return'});return value;
  };
  Storage.prototype.setItem=function(name,value){
    if(this!==localStorage||name!==key)return set.call(this,name,value);
    const before=get.call(this,name);
    if(mode==='denied'){emit({op:'set',before,value:String(value),actual:before,outcome:'throw'});throw new Error('T22 owned write denial');}
    if(!written)prior=before;
    set.call(this,name,value);written=true;
    emit({op:'set',before,value:String(value),actual:get.call(this,name),outcome:'stored'});
  };
  window.__stShopStorage={
    mode(value){if(!['pass','denied','uncertain','mismatch'].includes(value))throw new Error('Unknown bounded fault');
      mode=value;written=false;prior=null;set.call(sessionStorage,config,value);emit({op:'mode'});},
    seed(raw){if(raw===null)remove.call(localStorage,key);else set.call(localStorage,key,raw);
      emit({op:'fixture',actual:get.call(localStorage,key)});},
    snapshot(label){const raw=get.call(localStorage,key);const value={op:'snapshot',label,raw,t:performance.now(),timeOrigin:performance.timeOrigin};
      emit(value);return value;}
  };
  emit({op:'install'});
})();`;

export function persistShopRecovery({output,path,report,records,messages,load,write=writeFileSync}) {
    // Serializing the growing observations during combat advances the real game
    // while this driver is blocked. Keep checkpoints small; finally flushes all
    // evidence after either a completed journey or a caught failure.
    const lastCheck=report.checks.at(-1);
    write(join(output,'progress.json'),JSON.stringify({
      schema:'singedterra-shop-recovery-progress/v1',status:report.status,load,
      actions:report.actions.length,checks:report.checks.length,messages:messages.length,
      last_action:report.actions.at(-1)?.name?.slice(0,128)??null,
      last_check:lastCheck?{name:lastCheck.name.slice(0,256),pass:lastCheck.pass}:null,
      error:(report.error??report.observer_failure?.error??'').slice(0,1024),
      records:Object.fromEntries(Object.entries(records).map(([key,rows])=>[key,rows.length])),
    },null,2));
    if(report.status==='running')return;
    write(path,JSON.stringify(report,null,2));
    write(join(output,'console.json'),JSON.stringify(messages,null,2));
  }

const recoveryAdapters={process,admitEvidenceParent,mkdirSync,join,randomUUID,writeFileSync,bindShopPlayerRuntime,classifyBrowserEvidence};
export async function runShopRecoveryJourney({baseURL,chromium,fitting},overrides={}) {
  const {process,admitEvidenceParent,mkdirSync,join,randomUUID,writeFileSync,bindShopPlayerRuntime,classifyBrowserEvidence}={...recoveryAdapters,...overrides};
  assert.equal(fitting,'repair','Recovery has one declared fitting');
  const nativeMode=process.env.ST_SHOP_QUALIFICATION==='background-native';
  assert.ok(process.env.ST_SHOP_TEST_EVIDENCE,'Recovery needs a fresh evidence parent');
  const parent=admitEvidenceParent(process.env.ST_SHOP_TEST_EVIDENCE);
  mkdirSync(parent,{recursive:true});
  const output=join(parent,`shop-recovery-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(output);const path=join(output,'result.json');
  const records={runtime:[],shopStates:[],purchases:[],combat:[],states:[],encounters:[],controlsOnly:[],input:[],storage:[],storageEvents:[],clocks:[],geometry:[]};
  const report={schema:'singedterra-shop-recovery/v2',verification_method:'compiled-and-browser/v1',status:'running',execution_mode:nativeMode?'native':'shop-headless',
    normal_speed:true,storage_scope:'fresh task-owned isolated profile',native_qualified:false,
    native_window_focus_claim:false,owner_acceptance:false,native_intervals:[],
    limitations:['Native blur/hidden browser observations remain unqualified.'],
    fixture_scope:'v1 compatibility and storage conflict only; fresh unseeded gameplay follows',
    actions:[],checks:[],storage_cases:{},gameplay:{},records};
  const messages=[],failures=[],httpErrors=[];let native,page,bound,load=0,observerError,originalError;
  const persist=()=>persistShopRecovery({output,path,report,records,messages,load,write:writeFileSync});
  const check=(condition,name)=>{if(observerError)throw observerError;report.checks.push({name,pass:Boolean(condition)});assert.ok(condition,name);};
  const current=items=>items.findLast(item=>item.load===load);
  const until=async(items,start,predicate,seconds=10)=>{
    const deadline=Date.now()+seconds*1000;
    while(Date.now()<deadline){if(observerError)throw observerError;
      const item=items.slice(start).findLast(value=>value.load===load&&predicate(value));
      if(item)return item;await page.waitForTimeout(40);}
    throw new Error('Required recovery observation absent: '+predicate+' within '+seconds+' seconds');
  };
  try {
    bound=await bindShopPlayerRuntime(baseURL);report.binding=bound.binding;report.base_url=bound.base.href;
    // The Python owner binds and validates both actual Editor runs before launch;
    // final admission re-reads every artifact against current compiled sources.
    report.compiled_boundaries=JSON.parse(process.env.ST_SHOP_COMPILED_BOUNDARIES??'null');
    check(report.compiled_boundaries?.schema==='singedterra-shop-compiled-boundaries/v1','Source-bound compiled boundary evidence supplied');
    native=await ownedChrome(chromium,output,report.execution_mode);page=native.context.pages()[0];page.setDefaultTimeout(10000);
    report.browser_launch=JSON.parse(readFileSync(join(output,'browser-profile.json'),'utf8'));
    report.browser_version=native.browser.version();await page.setViewportSize({width:1366,height:768});
    await page.addInitScript(SHOP_RECOVERY_PROBE);await page.addInitScript(INPUT_PROBE);await page.addInitScript(SHOP_STORAGE_PROBE);
    const documentLoads=new Map(),loadOrigins=new Map();
    const observationLoad=value=>{
      if(!Number.isFinite(value.timeOrigin)||value.timeOrigin<=0||!Number.isInteger(load)||load<=0)
        throw new Error('Recovery observation has no actual document identity');
      if(documentLoads.has(value.timeOrigin))return documentLoads.get(value.timeOrigin);
      if(loadOrigins.has(load))throw new Error('Recovery load already belongs to another document');
      documentLoads.set(value.timeOrigin,load);loadOrigins.set(load,value.timeOrigin);return load;
    };
    page.on('console',message=>{
      const raw=message.text();messages.push({type:message.type(),text:raw,location:message.location(),load,scope:'shop-recovery'});
      try {
        if(raw.startsWith('ST_TEST_SHOP ')) {
          const observation=JSON.parse(raw.slice('ST_TEST_SHOP '.length));
          const originLoad=observationLoad(observation);
          messages.at(-1).load=originLoad;
          const envelope={...observation,load:originLoad,seq:records.runtime.length,order:messages.length};records.runtime.push(envelope);
          for(const [tag,key]of [['ST_LS_SHOP_STATE ','shopStates'],['ST_LS_SHOP_PURCHASE ','purchases'],
            ['ST_LS_SHOP_COMBAT ','combat'],['ST_LS_STATE ','states'],['ST_ENC_STATE ','encounters'],['ST_LS_HUD_LAYOUT ','controlsOnly']]) {
            if(!observation.text.includes(tag))continue;
            const value=key==='controlsOnly'?readShopControlObservation(observation.text):JSON.parse(observation.text.split(tag)[1].split('\n')[0]);
            records[key].push({...value,t:observation.t,timeOrigin:observation.timeOrigin,load:originLoad,seq:envelope.seq,order:envelope.order,
              documentHidden:observation.documentHidden,documentFocused:observation.documentFocused});
          }
        } else if(raw.startsWith('ST_TEST_INPUT ')){
          const value=JSON.parse(raw.slice(14)),originLoad=observationLoad(value);messages.at(-1).load=originLoad;
          records.input.push({...value,load:originLoad});
        } else if(raw.startsWith('ST_TEST_STORAGE ')){
          const value=JSON.parse(raw.slice(16)),originLoad=observationLoad(value);messages.at(-1).load=originLoad;
          records.storageEvents.push({...value,load:originLoad,seq:records.storageEvents.length,order:messages.length,emittedRaw:raw});
        } else if(raw.startsWith('ST_TEST_GEOMETRY ')){
          const value=JSON.parse(raw.slice(17)),originLoad=observationLoad(value);messages.at(-1).load=originLoad;
          records.geometry.push({...value,load:originLoad,emittedRaw:raw});
        }
      } catch(error){observerError??=error;report.observer_failure={raw,error:String(error),load};persist();}
    });
    page.on('pageerror',error=>httpErrors.push({kind:'pageerror',text:String(error),load,scope:'shop-recovery'}));
    page.on('requestfailed',async request=>{const response=await request.response().catch(()=>null);
      failures.push({url:request.url(),failure:request.failure()?.errorText,method:request.method(),resource_type:request.resourceType(),
        response_status:response?.status()??null,load,scope:'shop-recovery'});});
    page.on('response',response=>{if(response.status()>=400)httpErrors.push({kind:'http',status:response.status(),url:response.url(),load,scope:'shop-recovery'});});
    await native.context.route('**/*',route=>new URL(route.request().url()).origin===bound.base.origin?route.continue():route.abort('blockedbyclient'));
    const storage=async label=>{
      const value=await page.evaluate(label=>window.__stShopStorage.snapshot(label),label);
      const item={...value,load:observationLoad(value),data:value.raw===null?null:JSON.parse(value.raw)};records.storage.push(item);return item;
    };
    const clock=async label=>{
      const value=await page.evaluate(label=>({label,t:performance.now(),timeOrigin:performance.timeOrigin,hidden:document.hidden,focused:document.hasFocus()}),label);
      const item={...value,load:observationLoad(value)};records.clocks.push(item);return item;
    };
    const snapshot=async label=>({state:structuredClone(current(records.states)),shop:structuredClone(current(records.shopStates)),
      encounter:structuredClone(current(records.encounters)),storage:await storage(label),clock:await clock(label)});
    const mode=async value=>page.evaluate(value=>window.__stShopStorage.mode(value),value);
    const {placeOwned,collectNative,click}=createShopRecoveryActions({get native(){return native;},get page(){return page;},get report(){return report;},get records(){return records;},get load(){return load;},get observerError(){return observerError;},get current(){return current;},get check(){return check;},get persist(){return persist;},get until(){return until;},get nativeMode(){return nativeMode;}});
    const loadGame=async()=>{load++;await page.goto(new URL('last-stand/',bound.base).href,{waitUntil:'domcontentloaded'});
      if(nativeMode){
        if(load===1)await placeOwned(page,-3300,1616,'original');
        const before=await clock('native-tab-before');await page.bringToFront();const after=await clock('native-tab-after');
        (report.native_tab_selections??=[]).push({before,after});
        if(load===1)await collectNative(activateOwnedNativeWindow,{native,page,kind:'setup',role:'original'});
        await collectNative(ensureOwnedNativeForeground,{native,page,kind:'load-'+load,role:'original'});
      }
      await until(records.states,0,state=>state.action==='ready',60);await until(records.shopStates,0,()=>true);};
    const away=async(kind,paused=false)=>{
      await page.bringToFront();await collectNative(ensureOwnedNativeForeground,{native,page,kind,role:'original-precondition'});
      const before=current(records.encounters),shopBefore=current(records.shopStates);
      check(before.status==='Running'&&before.paused===paused,'Native interval begins in the intended actual model state');
      let other,session,awayError;const inputStart=records.input.length;
      const interval={kind,paused,before,shop_before:shopBefore};report.native_intervals.push(interval);persist();
      try {
        if(kind==='blur'){
          session=await native.browser.newBrowserCDPSession();const created=native.context.waitForEvent('page');
          await session.send('Target.createTarget',{url:'about:blank',newWindow:true});other=await created;
          await placeOwned(other,-1650,1300,'auxiliary-blur');
        } else other=await native.context.newPage();
        await other.goto('about:blank');await other.bringToFront();
        if(kind==='blur')await collectNative(activateOwnedNativeWindow,{native,page:other,kind,role:'auxiliary'});
        await page.waitForFunction(kind==='blur'?'!document.hidden && !document.hasFocus()':'document.hidden && !document.hasFocus()');
        interval.begin=await clock('native-'+kind+'-begin');await page.waitForTimeout(10500);
        interval.end=await clock('native-'+kind+'-end');
        await page.bringToFront();
        if(kind==='blur')await collectNative(activateOwnedNativeWindow,{native,page,kind,role:'original'});
        await collectNative(ensureOwnedNativeForeground,{native,page,kind,role:'original-return'});
        interval.returned=await clock('native-'+kind+'-returned');
        interval.after=await until(records.encounters,0,item=>item.paused===paused&&!item.catchingUp&&
          (paused?item.t>=interval.end.t:item.t>=interval.returned.t),10);
        interval.shop_after=current(records.shopStates);interval.events=records.input.slice(inputStart);
        nativeIntervalEvents(kind,before,interval.after,interval.events);
        if(paused)check(['tick','hp','kills','terminalElapsed'].every(key=>before[key]===interval.after[key]),'Actual hidden Pause excludes time');
        else elapsedTicks(before,interval.after);
        interval.status='pass';persist();
      } catch(error){awayError=error;interval.status='failed';interval.error=String(error);
        await retainAwayFailure({native,page,other,kind,report,output,error,capture:{scope:'Shop native recovery'}});throw error;
      } finally {await cleanupAwayAuxiliary({other,session,report,kind,primaryError:awayError});}
      return interval;
    };
    const fixture=async(raw,fault='pass')=>{await mode(fault);await page.evaluate(raw=>window.__stShopStorage.seed(raw),raw);await loadGame();};
    const open=async category=>{
      if(!current(records.shopStates).open){const start=records.shopStates.length;await click('ShopEntry');await until(records.shopStates,start,state=>state.open);}
      if(current(records.shopStates).category!==category){const start=records.shopStates.length;await click('ShopTab'+category);
        await until(records.shopStates,start,state=>state.open&&state.category===category);}
    };
    const deployedLedger=async runId=>until(records.shopStates,0,state=>state.load===load&&state.runId===runId&&
      state.hasActiveLedger&&state.tick===0&&state.phase==='battle'&&state.mode==='Run'&&state.spendable&&state.cards.length===6);
    const terminalReady=async(deploy)=>{
      const encounterDeploy=records.encounters.findLast(row=>row.load===load&&row.timeOrigin===deploy.timeOrigin&&row.action==='deploy');
      check(encounterDeploy&&encounterDeploy.t<=deploy.t,'Actual current encounter deploy precedes the Shop ledger');
      const encounter=await until(records.encounters,0,value=>value===current(records.encounters)&&
        value.load===load&&value.timeOrigin===deploy.timeOrigin&&value.run===encounterDeploy.run&&
        value.status==='Running'&&!value.failed&&!value.paused&&!value.catchingUp&&value.callbackSteps<=128&&
        value.documentHidden===false&&value.documentFocused===true&&value.tick>encounterDeploy.tick&&
        value.kills>0&&value.hp>=100&&value.hp<120,90);
      const observed=await clock('terminal-ready');
      check(observed.load===load&&observed.timeOrigin===encounter.timeOrigin&&!observed.hidden&&observed.focused&&
        observed.t>=encounter.t&&observed.t-encounter.t<=1000,'Fresh living settled combat before terminal-away transition');
      return {deploy:encounterDeploy,encounter,clock:observed};
    };
    const claimReady=async(runId,timeOrigin)=>{
      const layout=await until(records.controlsOnly,0,value=>{
        const state=current(records.states);
        return state?.phase==='result'&&state.saveState==='ready'&&state.pendingRunId===runId&&
          state.load===load&&state.timeOrigin===timeOrigin&&value.load===load&&value.timeOrigin===timeOrigin&&
          value===current(records.controlsOnly)&&value.phase==='result'&&
          value.controls.some(row=>row.name==='Claim'&&row.active&&row.interactable);
      },10);
      const state=current(records.states),stored=await storage('claim-ready-'+runId);
      check(stored.load===load&&stored.timeOrigin===timeOrigin&&stored.data?.pendingDefeat?.runId===runId&&
        stored.data.pendingDefeat.reward===1,'Actual result has exactly one pending manual reward');
      return {state,layout,storage:stored};
    };
    const captureFailure=async(caseRecord,label)=>{
      const value=await snapshot(label);caseRecord.failure=value.state;caseRecord.failed_shop=value.shop;caseRecord.failed_storage=value.storage;
      check(value.state.saveState==='retry','Unconfirmed '+label+' remains retryable');persist();
    };
    const recover=async(caseRecord,label,reload=true)=>{
      caseRecord.retry_failed_action=await click('RetrySave');
      const again=await snapshot(label+'-repeat-failure');caseRecord.repeated_failure=again;
      check(again.state.saveState==='retry','Repeated '+label+' Retry does not publish');
      await mode('pass');caseRecord.retry_action=await click('RetrySave');
      await until(records.states,0,state=>state.action==='save-recovered'&&state.saveState==='ready'||state.action==='deploy'&&state.saveState==='ready');
      caseRecord.recovered=await snapshot(label+'-recovered');
      if(reload){await loadGame();caseRecord.reload=await snapshot(label+'-reload');}
      persist();
    };
    const permanent=async(label,fault)=>{
      await open('Defense');const item=report.storage_cases[label]={fault,before:await snapshot(label+'-before')};
      await mode(fault);item.action=await click('ShopCard_armorBuy');await captureFailure(item,label);
      await recover(item,label);return item;
    };
    await loadGame();report.initial=await snapshot('initial');
    report.storage_estimate=await page.evaluate(async()=>({observed:await navigator.storage.estimate(),t:performance.now(),timeOrigin:performance.timeOrigin}));
    const legacy={version:1,credits:2,permanentLevel:1,nextRunId:7,lastFinalizedRunId:5,
      pendingDefeat:{runId:6,elapsedTicks:120,kills:2,reward:1}};
    const migration=report.storage_cases['migration-denied']={fault:'denied',fixture:JSON.stringify(legacy)};
    await fixture(migration.fixture,'denied');await captureFailure(migration,'migration-denied');await recover(migration,'migration-denied');
    const claim=report.storage_cases['claim-uncertain']={fault:'uncertain',before:await snapshot('claim-uncertain-before')};
    await mode('uncertain');claim.action=await click('Claim');await captureFailure(claim,'claim-uncertain');await recover(claim,'claim-uncertain');
    await permanent('permanent-denied','denied');await permanent('permanent-uncertain','uncertain');
    const richLegacy=JSON.stringify({...legacy,credits:4,permanentLevel:0,pendingDefeat:null});
    await fixture(richLegacy);await permanent('permanent-mismatch','mismatch');
    await fixture(richLegacy);await open('Defense');
    const conflict=report.storage_cases['external-conflict']={fault:'denied',before:await snapshot('conflict-before')};
    await mode('denied');conflict.action=await click('ShopCard_armorBuy');await captureFailure(conflict,'conflict');
    const external={...conflict.before.storage.data,credits:9};conflict.external_raw=JSON.stringify(external);
    await page.evaluate(raw=>window.__stShopStorage.seed(raw),conflict.external_raw);await mode('pass');
    conflict.retry_action=await click('RetrySave');conflict.blocked=await snapshot('conflict-blocked');
    conflict.retry_failed_action=await click('RetrySave');conflict.repeated_failure=await snapshot('conflict-repeat');
    check(conflict.blocked.state.saveState==='blocked'&&conflict.repeated_failure.state.saveState==='blocked','External conflict stays blocked');
    await loadGame();conflict.reload=await snapshot('conflict-reload');persist();

    // A new null save separates storage compatibility money from real run income.
    await fixture(null);const game=report.gameplay;game.initial=await snapshot('gameplay-initial');
    await selectLastStandFitting({fitting:'repair',click,currentLayout:()=>current(records.controlsOnly),currentState:()=>current(records.states),
      waitFor:predicate=>until(records.states,0,()=>predicate())});
    const reservation=report.storage_cases['reservation-denied']={fault:'denied',before:await snapshot('reservation-before')};
    await mode('denied');reservation.action=await click('Deploy');await captureFailure(reservation,'reservation-denied');
    await recover(reservation,'reservation-denied',false);
    game.deploy=await deployedLedger(1);
    check(game.deploy&&game.deploy.scrap===0&&game.deploy.cards.every(item=>item.p===0&&item.n===0),'Fresh run has no seeded income or levels');
    await until(records.shopStates,0,state=>state.hasActiveLedger&&state.uniqueKills>=2&&state.scrap>=5,80);
    if(nativeMode){await away('blur');await away('hidden');}
    let start=records.states.length;game.pause_action=await click('SpeedRate');await until(records.states,start,state=>state.paused);
    await open('Utility');
    // Background continuation may already have drained every elapsed step.
    // Label the observed settled input honestly; RunSettle separately proves
    // the mandatory old-stat 128-step refusal/no-queue boundary for both fittings.
    game.purchase_boundary={kind:'caught-up',encounter:current(records.encounters)};
    game.temporary_before=current(records.shopStates);
    const purchaseStart=records.purchases.length;game.purchase_action=await click('ShopCard_fieldRepairBuy');
    game.purchase=await until(records.purchases,purchaseStart,item=>item.actionId==='ShopCard_fieldRepairBuy');
    game.temporary_after=await until(records.shopStates,0,state=>state.cards.find(item=>item.key==='fieldRepair').n===1&&state.version===game.purchase.resultVersion);
    check(game.purchase.accepted&&game.purchase.chargedScrap===5,'One earned five-Scrap purchase');
    game.close_action=await click('ShopClose');game.closed=await snapshot('shop-closed');
    await open('Utility');game.reopened=await snapshot('shop-reopened');
    const pause=report.pause={before:current(records.states),start:await clock('pause-start')};
    if(nativeMode)await away('hidden',true);else await page.waitForTimeout(10500);
    pause.end=await clock('pause-end');pause.after=current(records.states);
    pause.elapsed_ms=pause.end.t-pause.start.t;
    check(pause.elapsed_ms>=10000&&pause.before.tick===pause.after.tick&&pause.after.paused,'Elapsed explicit Pause preserves model tick');
    start=records.states.length;game.resume_action=await click('SpeedRate');await until(records.states,start,state=>!state.paused);
    // Keep the actual resume boundary, before subsequent normal-speed ticks.
    pause.resumed=records.states.slice(start).find(state=>state.load===load&&!state.paused);
    const encounterStart=records.encounters.length;await page.waitForTimeout(1200);
    pause.following=await until(records.encounters,encounterStart,state=>state.tick>pause.resumed.tick&&!state.paused);
    game.effect=await until(records.combat,0,item=>item.load===load&&item.runId===game.deploy.runId&&item.tick>game.purchase.tick&&
      item.events.some(event=>event.kind==='Repair'&&event.amount===4),65);
    const defeatCase=report.storage_cases['defeat-uncertain']={fault:'uncertain',before:await snapshot('defeat-before')};
    await mode('uncertain');game.defeat=await until(records.encounters,0,state=>state.action==='terminal'&&state.status==='Defeated',190);
    // The same document retains earlier reservation retries. Wait for the
    // current run's save observation emitted after this terminal boundary.
    await until(records.states,0,state=>state.saveState==='retry'&&state.timeOrigin===game.defeat.timeOrigin&&
      state.runId===game.deploy.runId&&state.tick===game.defeat.tick&&state.t>=game.defeat.t&&state.seq>game.defeat.seq);
    await captureFailure(defeatCase,'defeat-uncertain');
    game.terminal=await until(records.shopStates,0,state=>state.hasFinalAccounting&&state.finalAccounting.runId===game.deploy.runId);
    await recover(defeatCase,'defeat-uncertain',false);game.result=await snapshot('gameplay-result');
    game.refreshes=[];
    // Real UI refreshes must not restage defeat or mint a second reward.
    for(let index=0;index<3;index++){await changeLastStandSetting({control:'SettingsMute',click,
      currentLayout:()=>current(records.controlsOnly),currentState:()=>current(records.states),
      readValue:()=>current(records.states).muted,waitFor:predicate=>until(records.states,0,()=>predicate())});
      game.refreshes.push(await snapshot('terminal-refresh-'+index));}
    game.claim_ready=await claimReady(game.deploy.runId,game.deploy.timeOrigin);
    game.claim_action=await click('Claim');await until(records.states,0,state=>state.phase==='workshop'&&state.wallet===1);
    game.claimed=await snapshot('gameplay-claimed');
    await loadGame();game.reload=await snapshot('gameplay-reload');
    await selectLastStandFitting({fitting:'repair',click,currentLayout:()=>current(records.controlsOnly),currentState:()=>current(records.states),
      waitFor:predicate=>until(records.states,0,()=>predicate())});
    game.redeploy_action=await click('Redeploy');game.redeploy=await deployedLedger(2);
    await page.waitForTimeout(500);await loadGame();game.unfinished_reload=await snapshot('unfinished-reload');
    check(game.redeploy.scrap===0&&game.redeploy.cards.every(item=>item.n===0)&&game.unfinished_reload.state.wallet===1,'Redeploy and unfinished reload do not carry temporary state or mint reward');
    // Separate ordinary browser terminal run. Report its actual last events,
    // including zero final-step kills. Bound RunIncome proves the controlled
    // final-kill accounting case; it cannot replace hidden/manual-Claim proof.
    const finalCase=report.terminal_case={before:await snapshot('final-step-before'),purchases:[]};
    await selectLastStandFitting({fitting:'repair',click,currentLayout:()=>current(records.controlsOnly),currentState:()=>current(records.states),
      waitFor:predicate=>until(records.states,0,()=>predicate())});
    finalCase.deploy_action=await click('Redeploy');
    finalCase.deploy=await deployedLedger(3);
    let terminalOther,terminalError;
    try {
      if(nativeMode){
        finalCase.pre_hide=await terminalReady(finalCase.deploy);
        const inputStart=records.input.length;
        terminalOther=await native.context.newPage();await terminalOther.goto('about:blank');await terminalOther.bringToFront();
        await page.waitForFunction('document.hidden && !document.hasFocus()');
        finalCase.terminal_away={begin:await clock('terminal-away-begin'),status:'running',input_start:inputStart};
        check(finalCase.terminal_away.begin.t>=finalCase.pre_hide.clock.t&&
          finalCase.terminal_away.begin.t-finalCase.pre_hide.clock.t<=2000,'Terminal hide follows the actual ready combat promptly');
      }
      finalCase.defeat=await until(records.encounters,0,state=>state.action==='terminal'&&state.status==='Defeated',190);
      finalCase.terminal=await until(records.shopStates,0,state=>state.hasFinalAccounting&&state.finalAccounting.runId===3);
      finalCase.final_step={combat:records.combat.findLast(row=>row.load===load&&row.runId===3&&row.tick===finalCase.defeat.tick)};
      finalCase.claim_ready=await claimReady(finalCase.deploy.runId,finalCase.deploy.timeOrigin);
      finalCase.result=await snapshot('final-step-result');
      if(nativeMode){
        await page.waitForTimeout(1000);const away=finalCase.terminal_away;
        away.staged=await snapshot('terminal-still-away');away.end=await clock('terminal-away-end');
        await page.bringToFront();await collectNative(ensureOwnedNativeForeground,{native,page,kind:'terminal-return',role:'original-return'});
        away.returned=await clock('terminal-returned');away.events=records.input.slice(away.input_start);away.status='observed';
      }
    } catch(error){terminalError=error;throw error;}
    finally {if(terminalOther)await cleanupAwayAuxiliary({other:terminalOther,report,kind:'terminal-away',primaryError:terminalError});}
    finalCase.claim_action=await click('Claim');
    await until(records.states,0,state=>state.phase==='workshop'&&state.wallet===2);
    finalCase.claimed=await snapshot('final-step-claimed');
    check(finalCase.final_step.combat?.tick===finalCase.defeat.tick,'Actual final combat observation retained without an invented kill');
    report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors);
    check(!report.browser_evidence.consoleErrors.length&&!report.browser_evidence.requestErrors.length&&!report.browser_evidence.httpErrors.length,'Recovery browser and runtime remain error free');
    assertPackagedRuntimeParity(bound.before,packagedRuntimeSnapshot());
    check(fileHash(bound.documentaryPath)===report.binding.shop_binding_sha256,'Recovery documentary binding stayed fixed');
    check(SHOP_PLAYER_INPUTS.every(item=>fileHash(join(ROOT,item))===report.binding.input_files[item]),'Recovery journey source stayed fixed');
    if(nativeMode){report.native_qualified=true;report.native_window_focus_claim=true;report.limitations=[];}
    report.status='pass';
  } catch(error){originalError=error;report.status='failed';report.error=String(error);report.stack=error.stack;}
  finally {
    try{if(page&&!page.isClosed()&&originalError)await page.screenshot({path:join(output,'failure.png')});}catch(error){report.screenshot_error=String(error);}
    try{if(native)await native.close();report.cleanup='complete';}catch(error){report.cleanup_error=String(error);report.status='failed';}
    // Classify retained errors even when an earlier required boundary is absent.
    report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors);
    if(report.browser_evidence.consoleErrors.length||report.browser_evidence.requestErrors.length||report.browser_evidence.httpErrors.length)
      report.status='failed';
    if(report.status!=='pass'){report.native_qualified=false;report.native_window_focus_claim=false;}
    persist();
  }
  return {path,status:report.status};
}

// This observer is passive. Keyboard samples are explicitly classified by area;
// gameplay still rejects every keyboard/cancel edge and matches every pointer pair.
const INPUT_PROBE = `(() => {
  window.__stInputArea = 'outer';
  window.addEventListener('st:splash-dismissed', () => { window.__stSplashDismissed = true; });
  for (const kind of ['pointerdown','pointerup','pointercancel','keydown','keyup','focus','blur','visibilitychange']) {
    window.addEventListener(kind, e => console.log('ST_TEST_INPUT ' + JSON.stringify({kind:e.type,
      area:window.__stInputArea,t:performance.now(),timeOrigin:performance.timeOrigin,x:e.clientX,y:e.clientY,button:e.button,
      code:e.code,target:e.target && e.target.id || '',globalTarget:e.target===window || e.target===document,
      focused:document.hasFocus(),hidden:document.hidden})),
      {capture:true,passive:true});
  }
})();`;

// Stamp existing runtime observations at emission in the document clock. This
// observer never sends a Unity action, substitutes state or changes focus.
const RUNTIME_PROBE = `(() => {
  const original = console.log;
  console.log = function(...args) {
    const text = args.map(String).join(' ');
    const t = performance.now(), timeOrigin = performance.timeOrigin;
    original.apply(this,args);
    if (['ST_ENC_STATE ','ST_ENC_CALLBACK ','ST_LS_STATE ','ST_LS_HIT ','ST_LS_HUD_LAYOUT ','ST_LS_AUDIO event='].some(tag=>text.includes(tag)))
      original.call(console,'ST_TEST_RUNTIME '+JSON.stringify({t,timeOrigin,text}));
  };
})();`;

export function validateGameplayInput(trace, actions) {
  const gameplay = trace.filter(item => item.area === 'gameplay');
  assert.ok(!gameplay.some(item => ['pointercancel','keydown','keyup'].includes(item.kind)), 'Gameplay keyboard/cancel edge forbidden');
  const edges = gameplay.filter(item => ['pointerdown','pointerup'].includes(item.kind));
  assert.equal(edges.length, actions.length * 2, 'Every native gameplay pointer edge must be planned');
  actions.forEach((action, i) => ['pointerdown','pointerup'].forEach((kind, offset) => {
    const edge = edges[i * 2 + offset];
    assert.equal(edge.kind, kind); assert.equal(edge.button, 0); assert.equal(edge.target, 'unity-canvas');
    assert.ok(edge.focused && !edge.hidden, 'Gameplay pointer must be natively focused/visible');
    for (const axis of ['x','y']) assert.ok(Math.abs(edge[axis] - action[axis]) <= .1, 'Gameplay pointer coordinate mismatch');
  }));
  return { matched:true, actions:actions.length, observed_edges:edges.length,
    outer_keyboard_edges:trace.filter(item=>item.area==='outer' && item.kind.startsWith('key')).length };
}

export function validateKeyboardGameplayInput(trace,actions) {
  const edges=trace.filter(item=>item.area==='gameplay-keyboard');
  assert.ok(!edges.some(item=>item.kind.startsWith('pointer')),'Keyboard action received a pointer edge');
  const keys=edges.filter(item=>['keydown','keyup'].includes(item.kind));
  const planned=actions.flatMap(action=>action.keys.flatMap(code=>['keydown','keyup'].map(kind=>({code,kind}))));
  assert.equal(keys.length,planned.length,'Every gameplay keyboard edge must be planned');
  keys.forEach((edge,i)=>{
    assert.equal(edge.kind,planned[i].kind);assert.equal(edge.code,planned[i].code);
    assert.equal(edge.target,'unity-canvas');assert.ok(edge.focused && !edge.hidden,'Gameplay keyboard must be natively focused/visible');
  });
  return {actions:actions.length,observed_edges:keys.length,matched:true};
}

export async function retainJourneyOutcome(report, cleanup, persist, originalError) {
  let cleanupError,persistError,persistFailed=false;
  try{await cleanup();}catch(error){cleanupError=error;report.status='failed';report.cleanup_error=String(error);}
  finally{
    try{await persist();}catch(error){persistFailed=true;persistError=error;report.status='failed';report.persist_error=String(error);}
  }
  if(originalError)throw originalError;
  if(cleanupError)throw cleanupError;
  if(persistFailed)throw persistError;
}

export function persistLastStandJourneyEvidence(report,observations,write,diagnose=message=>console.error(message)) {
  const {messages,failures,httpErrors,expectedFaults,observerFailures,
    states,encounters,callbackRecords,hits,layouts,cues,trace,requests}=observations;
  let firstError,failed=false;
  const failure=(stage,error)=>{
    if(!failed)firstError=error;failed=true;report.status='failed';
    report.persist_error??=String(error);
    (report.persistence_errors??=[]).push({stage,error:String(error),stack:error?.stack??String(error)});
  };
  const attempt=(stage,action)=>{try{action();}catch(error){failure(stage,error);}};
  // Each independent record gets an attempt even when classification or an
  // earlier write fails. Missing evidence always leaves a failed qualification.
  attempt('browser-classification',()=>{report.browser_evidence=classifyBrowserEvidence(messages,failures,httpErrors,expectedFaults);});
  if(observerFailures.length)attempt('observer-failures.json',()=>write('observer-failures.json',observerFailures));
  for(const [name,data]of [
    ['console.json',messages],['runtime-telemetry.json',{states,encounters,callbackRecords,hits,layouts,cues}],
    ['input-trace.json',trace],['requests.json',{requests,failures,httpErrors}],['result.json',report],
  ])attempt(name,()=>write(name,data));
  if(failed){
    // Full-report failure still gets a small independent diagnostic and stderr;
    // neither claims that the missing raw records were retained successfully.
    const brief=value=>value===undefined?undefined:String(value).slice(0,2000);
    const compact=()=>({status:'failed',error:brief(report.error),cleanup_error:brief(report.cleanup_error),persist_error:brief(report.persist_error),
      persistence_errors:report.persistence_errors.map(({stage,error,stack})=>({stage,error:error.slice(0,1000),stack:stack.slice(0,2000)}))});
    attempt('persistence-failure.json',()=>write('persistence-failure.json',compact()));
    attempt('stderr',()=>diagnose('LAST_STAND_LOOP_PERSISTENCE_FAILURE='+JSON.stringify(compact())));
    throw firstError;
  }
}

export const LAST_STAND_JOURNEY_INPUTS=Object.freeze([...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandJourney.mjs','e2e/last-stand-playable-loop.spec.ts',
  'e2e/helpers/lastStandControlReveal.mjs',
  'e2e/helpers/lastStandTierJourney.mjs','campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'scripts/last-stand-playable-loop.mjs','campaign-unity/Tools/verify_last_stand_loop.py',
  '.github/workflows/ci.yml','scripts/ci/ciWorkflow.test.mjs','scripts/ci/lastStandQualification.mjs',
  'e2e/helpers/lastStandMatrix.mjs','scripts/ci/browserMatrix.mjs','scripts/ci/lastStandMatrixResult.mjs',
  'e2e/helpers/lastStandWaveOracle.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  'scripts/ci/lastStandWaveQualification.mjs','scripts/ci/lastStandWaveMatrixResult.mjs']);

export function lastStandQualificationProfile(name='windows-player',host=process.platform) {
  assert.ok(['windows-player','linux-functional'].includes(name),'Unknown Last Stand qualification profile');
  assert.equal(host,name==='windows-player'?'win32':'linux','Qualification profile is incompatible with the actual host');
  return Object.freeze({name,nativeMedia:name==='windows-player'});
}

// This lifecycle qualifies effects, mute and missed-event suppression. Select
// its channel scope through ordinary controls before measuring audio; music's
// behavior during a pause is separately qualified by the controls journey.
export async function configureEffectsOnlyJourneyAudio({click,currentLayout,readPreferences,check}) {
  await click('Menu','menu');
  await click('MenuSettings','menu');
  const music=()=>currentLayout().settingsControls.filter(item=>item.name==='MusicEnabled' && item.active && item.interactable);
  check(music().length===1 && music()[0].label==='AMBIENT MUSIC: ON','effects-only setup observes enabled ambient music');
  const changed=await click('MusicEnabled','preferences');
  const preferences=await readPreferences();
  check(changed.musicEnabled===false && changed.preferencesState==='ready' && preferences?.musicEnabled===false &&
    preferences.muted===false && preferences.masterVolume===100 && preferences.effectsVolume===100 &&
    music().length===1 && music()[0].label==='AMBIENT MUSIC: OFF',
    'effects-only lifecycle uses confirmed real music-off setting with effects unchanged',preferences);
  await click('SettingsClose','menu-close');
  check(!currentLayout().settingsControls.some(item=>item.active),'effects-only setup closes the actual settings modal');
  return {scope:'effects only; music disabled through its real persisted control',preferences};
}

export function validateCancelledReturn({before,confirmed,cancelled,layout,saveBefore,saveAfter}) {
  for(const item of [confirmed,cancelled]) {
    assert.equal(item.load,before.load,'Return cancellation stays in the same document');
    assert.equal(item.timeOrigin,before.timeOrigin,'Return cancellation cannot reload the document');
    assert.equal(item.runId,before.runId,'Return cancellation preserves the active run');
    assert.equal(item.wallet,before.wallet,'Return cancellation cannot award or spend salvage');
    assert.equal(item.pendingRunId,before.pendingRunId,'Return cancellation cannot stage a reward');
    assert.equal(item.phase,'battle');assert.equal(item.paused,true);
  }
  assert.ok(before.runId>0 && confirmed.action==='confirmation' && confirmed.menu==='confirm');
  assert.ok(cancelled.action==='confirmation-cancel' && cancelled.menu==='menu');
  assert.ok(confirmed.t>=before.t && cancelled.t>=confirmed.t,'Return observations retain actual event order');
  for(const key of ['tick','hull','kills']) assert.equal(cancelled[key],confirmed[key],'Cancelled modal preserves '+key);
  assert.equal(layout.selection,'ConfirmCancel','Destructive confirmation initially focuses Cancel');
  assert.equal(layout.load,before.load);assert.equal(layout.timeOrigin,before.timeOrigin);
  assert.ok(layout.settingsControls.some(item=>item.name==='ConfirmCancel' && item.active && item.interactable));
  assert.equal(saveAfter,saveBefore,'Return cancellation leaves stored progression unchanged');
  return {before,confirmed,cancelled,initialSelection:layout.selection};
}

export async function runLastStandJourney({ baseURL, chromium, retiredCampaignRecord, entrypoint, profileName }) {
  const qualification=lastStandQualificationProfile(profileName),player=qualification.nativeMedia;
  const sectionName=process.env.LAST_STAND_JOURNEY_SECTION;
  const shard=['entry','recovery'].includes(sectionName) && process.env.LAST_STAND_JOURNEY_SHARD===''?undefined:process.env.LAST_STAND_JOURNEY_SHARD;
  const section=lastStandJourneySection(sectionName,{profile:qualification.name,shard});
  const matrix=lastStandViewportPartition(shard,{profile:qualification.name});
  const base = admitJourneyBase(baseURL);
  if(player){runTool('ffmpeg', ['-version']); runTool('ffprobe', ['-version']);}
  const parent = admitEvidenceParent(process.env.LAST_STAND_EVIDENCE_PARENT);
  mkdirSync(parent, { recursive:true });
  const output = join(parent, `journey-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(output);
  const resultPath = join(output, 'result.json');
  const report = { title:TITLE, status:'running', entrypoint, checks:[], actions:[], keyboard_actions:[], screenshots:[], audio:[],
    normal_speed:true, storage_scope:'isolated same-origin task profile', owner_listened:false,
    owner_visual_acceptance:false, owner_motion_acceptance:false, windows_window_acceptance:false,
    focus_scope:player?'separate native visible-window blur and hidden tab':'hidden tab; native blur separately required from Windows', device_performance_claim:false, url_origin:base.origin,
    visual_measurements:{controls:'actual HUD bounds converted once to CSS pixels',panels:'unmeasured in browser telemetry',
      fonts:'unmeasured in browser telemetry',contrast:'unmeasured in browser telemetry',focus_treatment:'matched screenshots awaiting rendered review'},
    viewport_partition:{shard:matrix.shard,section:section.name,viewports:section.lifecycle?matrix.viewports.map(v=>v.name):[],
      phase_viewports:section.name==='entry'?[]:matrix.phaseViewports.map(v=>v.name),
      entry_viewports:section.entry?matrix.entryViewports.map(v=>v.name):[],gameplay_viewport:section.entry || section.lifecycle?matrix.captureViewport.name:null},
    lifecycle:[],qualification:{profile:qualification.name,host:process.platform,release:release(),arch:arch(),
      functional:'pending',rendered_audio:player?'pending':'unexecuted-requires-windows',
      native_blur:player?'pending':'unexecuted-requires-windows',capture_cadence:player?'pending':'unexecuted-requires-windows',
      procedural_cues:player?'pending':'unexecuted-requires-windows',
      merge_ready:false} };
  const states=[], encounters=[], callbackRecords=[], hits=[], layouts=[], cues=[], messages=[], trace=[], failures=[], httpErrors=[], requests=[], expectedFaults=[];
  let native, page, motion, modelOracle, load=0, scope='healthy', fault, rejoin=false, rejoinBinding, originalError;
  const observerFailures=[];let observerError;
  const throwObserverFailure=()=>throwJourneyObserverFailure(observerError);
  let lastResultWrite=-Infinity;
  const check = (condition, name, detail) => {
    throwObserverFailure();
    const observation={name,pass:Boolean(condition),detail};
    report.checks.push(observation);
    // Keep every assertion durable without repeatedly rewriting accumulated
    // screenshots/layouts. Failure and the existing finally retain full state.
    appendFileSync(resultPath+'.checks.ndjson',JSON.stringify(observation)+'\n');
    if(!condition || Date.now()-lastResultWrite>=1000) {
      writeShopPresentationJson(resultPath,report);lastResultWrite=Date.now();
    }
    assert.ok(condition,name);
  };
  const write = createJourneyEvidenceWriter(output);
  const retainObserverFailure=(record,error)=>{
    observerError??=error;originalError??=error;report.status='failed';
    report.error=`${originalError.name}: ${originalError.message}`;
    const failure={...record,error:String(error),stack:error.stack??String(error),persistence_errors:[]};
    observerFailures.push(failure);report.observer_failures=observerFailures;
    // Event callbacks cannot throw into the main async try. Retain the full
    // received record synchronously, then let the main checkpoints reject.
    for(const [name,data]of [['observer-failures.json',observerFailures],['console.json',messages],['result.json',report]]){
      try{write(name,data);}catch(persistError){
        failure.persistence_errors.push({file:name,error:String(persistError),stack:persistError.stack??String(persistError)});
      }
    }
  };
  try {
    const localBefore=packagedRuntimeSnapshot();report.packaged_before=localBefore;
    report.parent_artifact=await bindT21ServedParent(base);
    buildEncounterOracle(output); // Retain complete historical model parity separately.
    const waveOracle=buildWaveOracle(output);modelOracle=waveOracle.profiles;report.wave_model=waveOracle.binding;
    report.contract='last-stand-waves/v2';
    const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    const receiptPath=join(ROOT,manifest.source.receipt);
    const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
    check(fileHash(receiptPath)===manifest.source.receiptSha256,'exact sanitized export receipt admitted');
    check(receipt.complete && receipt.status==='pass' && receipt.sourceBeforeSha256===receipt.sourceAfterSha256,
      'genuine export has complete identical before/after source closure');
    check(fileHash(join(ROOT,'campaign-unity/docs/last-stand-web/source-lock.json'))===manifest.source.sourceLockSha256,
      'exact source lock admitted');
    check(receipt.build===manifest.source.build && receipt.sourceAfterSha256===manifest.source.sourceInventorySha256,
      'runtime and current source receipt agree');
    check(Object.keys(manifest.files).length===16,'complete sixteen-leaf public runtime inventory');
    report.binding={manifest_sha256:fileHash(manifestPath), receipt_sha256:fileHash(receiptPath),
      source_lock_sha256:manifest.source.sourceLockSha256, source_inventory_sha256:receipt.sourceAfterSha256,
      build:receipt.build, sourceHead:receipt.sourceHead, wrapper_sha256:manifest.wrapperSha256,
      current_head:runTool('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
      input_files:Object.fromEntries(LAST_STAND_JOURNEY_INPUTS.map(path=>[path,fileHash(join(ROOT,path))])),
      portable_text_inputs:Object.fromEntries(LAST_STAND_JOURNEY_INPUTS.map(path=>[path,hash(readFileSync(join(ROOT,path),'utf8').replace(/\r\n/g,'\n'))])),served:{}};
    for (const [path, expected] of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256})) {
      const response=await fetchBoundRuntime(base,path);
      const bytes=response.bytes;
      assertServedBytes(response,expected);
      check(true,`served exact runtime/wrapper bytes: ${path}`);
      report.binding.served[path]={sha256:hash(bytes),bytes:bytes.length};
    }
    native=await ownedChrome(chromium,output,'native',lastStandJourneyTimeBudget().browserMs); page=native.context.pages()[0];
    admitJourneyPage(page);
    if(process.env.LAST_STAND_INDUCE_CLEANUP_FAILURE==='1')check(false,'bounded induced failure after owned browser startup');
    report.browser_version=native.browser.version();
    await page.setViewportSize({width:1280,height:720});
    if(player){await page.addInitScript(AUDIO_CAPTURE);await page.addInitScript(FRAME_PROBE);}
    await page.addInitScript(INPUT_PROBE);await page.addInitScript(RUNTIME_PROBE);
    bindJourneyConsole({page,messages,readIdentity:()=>({load,scope}),records:{states,encounters,hits,layouts,cues,callbackRecords},trace,retainObserverFailure});
    page.on('pageerror',error=>httpErrors.push({scope,load,kind:'pageerror',text:String(error),stack:error.stack}));
    page.on('request',request=>requests.push({url:request.url(),load,scope}));
    page.on('requestfailed',async request=>{
      const response=await request.response().catch(()=>null);
      failures.push({url:request.url(),failure:request.failure()?.errorText,method:request.method(),
        resource_type:request.resourceType(),response_status:response?.status()??null,load,scope});
    });
    page.on('response',response=>{if(response.status()>=400) httpErrors.push({scope,load,kind:'http',status:response.status(),url:response.url()});});
    await native.context.route('**/*',async route=>{
      try {await routeLastStandRequest(route,base,{fault,rejoin,rejoinBinding});}
      catch(error){httpErrors.push({scope,load,kind:'boundary',url:route.request().url(),text:String(error)});await route.abort('blockedbyclient');}
    });
    const {until,keyboardFocus,resize,phaseMatrix,armGameClick,gameClick,gameKey,liveBattleLayouts,battleLayouts}=createJourneyActions({get throwObserverFailure(){return throwObserverFailure;},get page(){return page;},get focused(){return focused;},get check(){return check;},get layouts(){return layouts;},get trace(){return trace;},get load(){return load;},get screenshot(){return screenshot;},get states(){return states;},get report(){return report;},get matrix(){return matrix;},get captureViewport(){return captureViewport;},get encounters(){return encounters;},get player(){return player;},get observation(){return observation;},get mark(){return mark;},get reference(){return reference;}});
    const focused=label=>focusJourneyDocument({native,page,report,check},label);
    const screenshot=async name=>{
      const path=join(output,`${name}.png`); await page.screenshot({path});
      report.screenshots.push({file:`${name}.png`,sha256:fileHash(path),viewport:page.viewportSize(),load,scope,
        state:states.at(-1)?.load===load?states.at(-1):null,layout:layouts.at(-1)?.load===load?layouts.at(-1):null});
    };
    const outerPointer=async locator=>{
      await page.evaluate("window.__stInputArea='outer'"); await focused('outer pointer');
      await locator.scrollIntoViewIfNeeded(); const box=await locator.boundingBox(); assert.ok(box,'Outer control missing');
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
    };

    const dismissSplash=async()=>{
      const splash=page.locator('#st-splash');
      if(await splash.count()) {await outerPointer(splash); await splash.waitFor({state:'detached'});
        check(await page.evaluate('window.__stSplashDismissed===true'),'splash dismissed by native control lifecycle');}
      await page.locator('#lobby').waitFor({state:'visible'});
    };
    const goto=async suffix=>{
      const target=new URL(suffix,base);
      // Different startup signals need a new document; changing only the hash
      // would leave the existing Lobby owner alive and never resolve startup.
      if(page.url().startsWith(base.href))await page.goto('about:blank');
      load++;await page.goto(target.href,{waitUntil:'domcontentloaded'});await focused('navigation');
    };
    const openCampaigns=async()=>{
      const rail=page.locator('.command-center__category-rail').getByRole('button',{name:'Campaigns',exact:true});
      if(await rail.isVisible()) await outerPointer(rail);
      else {await outerPointer(page.getByRole('button',{name:'Modes',exact:true}));
        await outerPointer(page.getByRole('navigation',{name:'Modes',exact:true}).getByRole('button',{name:'Campaigns',exact:true}));
        await outerPointer(page.getByRole('button',{name:'Close Modes',exact:true}));}
    };
    const selected=async item=>{
      const target=page.locator(`[data-command-item="${item}"][aria-current="true"]`);
      await target.waitFor({state:'visible'});check(await target.count()===1,`route selects ${item}`);
    };
    const setRouteState=async({remembered,record,session}={})=>{
      await page.evaluate(async({key,remembered,record,session})=>{
        sessionStorage.clear();localStorage.clear();
        if(remembered)sessionStorage.setItem(key,JSON.stringify(remembered));
        if(session)localStorage.setItem('singedterra:session',JSON.stringify(session));
        await new Promise((done,reject)=>{const request=indexedDB.open('singedterra-campaign',1);
          request.onupgradeneeded=()=>request.result.createObjectStore('campaign-runs');request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{const db=request.result;const tx=db.transaction('campaign-runs','readwrite');
            const store=tx.objectStore('campaign-runs');store.clear();if(record)store.put(record,'ash-road-local');
            tx.oncomplete=()=>{db.close();done();};tx.onerror=()=>reject(tx.error);};});
      },{key:SELECTION_KEY,remembered,record,session});
    };
    let ashBytes,originalAsh,start,restored;
    const ash={categoryId:'campaigns',itemId:'ash-road'},skirmish={categoryId:'skirmishes',itemId:'standard'};
    if(section.entry || section.lifecycle){
    await goto(''); await dismissSplash();
    await selected('first-salvo');check(true,'global fresh startup remains Skirmishes');
    await openCampaigns(); await selected('last-stand');
    check(!requests.some(r=>r.url.includes('/last-stand/Build/')),'zero Unity runtime payload before ordinary launch');
    check(await page.locator('[data-last-stand-loss-disclosure]').innerText()===await page.locator('[data-last-stand-loss-disclosure]').textContent(), 'entry loss disclosure is rendered');
    check((await page.locator('[data-last-stand-loss-disclosure]').innerText()).includes('last confirmed wave checkpoint'),'entry disclosure explains saved wave resume');
    check(await page.locator('[data-command-item="ash-road"]').count()===0,'retired campaign has no library entry');
    await goto('');await dismissSplash();await selected('last-stand');
    report.routes=[{name:'fresh Campaigns',selected:'last-stand'},{name:'remembered Last Stand',selected:'last-stand'}];
    }
    if(section.entry){
    const routeCases=[
      {name:'retired save cannot promote a removed campaign',record:retiredCampaignRecord,suffix:'',expected:'first-salvo'},
      {name:'remembered retired campaign selects Last Stand',remembered:ash,suffix:'',expected:'last-stand'},
      {name:'legacy Ash Road route selects Last Stand',suffix:'#campaigns/ash-road',expected:'last-stand'},
      {name:'remembered Skirmishes',remembered:skirmish,suffix:'',expected:'standard'},
      {name:'Return before remembered Ash Road',remembered:ash,suffix:'#campaigns/last-stand',expected:'last-stand'},
      {name:'validated ST1 before remembered Ash Road',remembered:ash,suffix:'#challenge=ST1-CW-16',expected:'imported-challenge'},
      {name:'invite before validated ST1',remembered:ash,suffix:'?join=ab12#challenge=ST1-CW-16',expected:'online'},
      {name:'invite before explicit Return',remembered:ash,suffix:'?join=ab12#campaigns/last-stand',expected:'online'},
      {name:'rejoin before validated ST1',remembered:ash,session:{roomId:'room-rejoin-fixture',roomCode:'BACK',playerId:'player-rejoin-fixture'},suffix:'#challenge=ST1-CW-16',expected:'online'},
      {name:'invalid mixed signals recover retired selection',remembered:ash,suffix:'?join=bad!#challenge=ST1-CW-17',expected:'last-stand'},
      {name:'invalid Return spelling recovers retired selection',remembered:ash,suffix:'#campaigns/last-stand/invalid',expected:'last-stand'},
    ];
    assert.deepEqual(routeCases.map(({name,expected})=>({name,selected:expected})),LAST_STAND_ENTRY_ROUTES,
      'Exact original startup-routing inventory required');
    for(const fixture of routeCases){
      rejoin=Boolean(fixture.session);
      if(rejoin)rejoinBinding=await bindConfiguredRejoinFixture(base);
      await setRouteState(fixture);await goto(fixture.suffix);await dismissSplash();
      await selected(fixture.expected);
      check(await page.locator('[data-command-item="ash-road"]').count()===0,'retired campaign cannot reappear through startup signals');
      report.routes.push({name:fixture.name,selected:fixture.expected});
    }
    rejoin=false;
    report.campaign_entry=[];
    for(const viewport of matrix.entryViewports) {
      await page.setViewportSize({width:viewport.width,height:viewport.height});await setRouteState();
      await goto('');await dismissSplash();await openCampaigns();await selected('last-stand');
      const order=await page.locator('.command-center__library-items .command-center__item').evaluateAll(items=>items.map(item=>item.dataset.commandItem));
      check(order.length===1 && order[0]==='last-stand',`${viewport.name}: Last Stand is the only campaign`,order);
      const primary=page.getByRole('link',{name:'Launch Last Stand',exact:true});await keyboardFocus(primary);
      await primary.scrollIntoViewIfNeeded();const bounds=await primary.boundingBox();
      check(bounds && bounds.width>=44 && bounds.height>=44 && bounds.x>=0 && bounds.x+bounds.width<=viewport.width && bounds.y>=0 && bounds.y+bounds.height<=viewport.height,
        `${viewport.name}: actual primary launch visible and reachable`,bounds);
      check(await primary.evaluate(element=>element.classList.contains('command-center__primary-action')),`${viewport.name}: primary Campaigns action`);
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${viewport.name}: Campaigns has no horizontal overflow`);
      await screenshot(`entry-${viewport.name}`);report.campaign_entry.push({viewport,order,bounds});
    }
    }
    if(section.entry || section.lifecycle){
    await page.setViewportSize({width:1280,height:720});
    await setRouteState({record:retiredCampaignRecord,remembered:ash});await goto('');await dismissSplash();await selected('last-stand');
    check(await page.locator('[data-command-item="ash-road"]').count()===0,'retired campaign has no start or resume entry');
    ashBytes=async()=>page.evaluate(async()=>new Promise((done,reject)=>{
      const request=indexedDB.open('singedterra-campaign',1);request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,read=db.transaction('campaign-runs').objectStore('campaign-runs').get('ash-road-local');
        read.onerror=()=>{db.close();reject(read.error);};read.onsuccess=()=>{db.close();done(JSON.stringify(read.result));};};
    }));
    originalAsh=await ashBytes();check(originalAsh===JSON.stringify(retiredCampaignRecord),'opaque retired campaign record preserved on startup');
    report.retired_campaign_preservation={before_sha256:hash(originalAsh),native_return:'MISSING until keyboard passes',
      retirement:'MISSING until native Return'};
    if(!section.entry)Object.assign(report.retired_campaign_preservation,{native_return:'unexecuted-in-lifecycle-section',
      retirement:'unexecuted-in-lifecycle-section'});
    const launch=page.getByRole('link',{name:'Launch Last Stand',exact:true});
    await keyboardFocus(launch); const before=states.length;
    await page.keyboard.press('Enter');await page.locator('#unity-canvas').waitFor();await focused('Unity ordinary launch');
    const ready=await until(states,before,item=>item.action==='ready',60);
    assertUnityReady(ready);
    check(true,'genuine Unity scene ready after player launch',ready);
    const afterLaunchAsh=await ashBytes();check(afterLaunchAsh===originalAsh,'retired campaign bytes preserved through real Last Stand launch');
    report.retired_campaign_preservation.after_launch_sha256=hash(afterLaunchAsh);
    check(requests.some(r=>r.url.endsWith('.wasm')) && requests.some(r=>r.url.endsWith('.data')),'ordinary launch requests real Unity payload');
    report.renderer=await page.evaluate(()=>{const canvas=document.querySelector('#unity-canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)return{available:false};const info=gl.getExtension('WEBGL_debug_renderer_info');return{available:true,vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),unmasked_renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null};});
    check(report.renderer.available,'actual WebGL renderer observed',report.renderer);
    }
    // Loaded after this module is initialized: both maintained journeys share
    // the same measured target/clipping oracle without an eager module cycle.

    if(section.lifecycle)for(const viewport of matrix.viewports)await resize(viewport);
    const captureViewport=matrix.captureViewport;

    if(section.lifecycle)await resize(captureViewport);

    const mark=()=>page.evaluate('performance.now()');
    const energy=(begin,end,min=5)=>player?measureRenderedAudioEnergy(page,begin,end,check,min,{report,load,scope}):null;
    const observation=options=>observeJourneyRuntime({encounters,states,load,check,page},options);
    const reference=observed=>modelOracle[`${observed.loop.activeTier}:${observed.fitting}:${observed.loop.cannonDamage}`];
    const noReplay=(begin,end,interval)=>checkJourneyAudioReturn({energy,report,cues,load,states,encounters,callbackRecords,reference,check},begin,end,interval);
    const away=(kind,ms,options)=>runJourneyAway({native,page,observation,check,mark,noReplay,report,output,trace,motion},kind,ms,options);
    const saveAudio=async(name,windows)=>{
      const captured=await page.evaluate('window.__stAudioCapture.finish()');
      check(captured.supported && !captured.errors.length && captured.captures.length,`${name}: actual rendered WebAudio capture`,captured.errors);
      const result=[];
      for(const [i,item]of captured.captures.entries()){
        const bytes=Buffer.from(item.audio,'base64');check(item.started!==null && bytes.length>1000,`${name}: admitted audio bytes`);
        const file=`${name}-audio-${i}.webm`;writeFileSync(join(output,file),bytes);
        const evidence={file,sha256:hash(bytes),bytes:bytes.length,started:item.started,sample_count:item.samples.length,mime:item.mime,decoded_cues:{}};
        for(const [cue,[begin,end]]of Object.entries(windows??{})){
          const decoded=decodedAudio(join(output,file),(begin-item.started)/1000,(end-begin)/1000);
          check(decoded.rms>.0005,`${name}: decoded recorded ${cue} non-silent`,decoded);evidence.decoded_cues[cue]=decoded;
        }
        report.audio.push(evidence);result.push(evidence);
      }return result;
    };

    // Ordinary Return and reload preserve the checkpoint; only explicit
    // abandon destroys it. Exercise both through the actual native controls.
    if(section.entry){
    await gameClick('Deploy','deploy');await page.waitForTimeout(1200);
    const returnBefore=states.at(-1),returnSave=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
    await keyboardFocus(page.locator('#last-stand-return'));await page.keyboard.press('Enter');
    await page.locator('[data-last-stand-command-view]').waitFor();
    check(await page.locator('#st-splash').count()===0,'Return reaches Campaigns without splash interception');
    check(assertWaveSavePreserved(JSON.parse(returnSave),JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),'ordinary Return preserves complete checkpoint');
    check(await ashBytes()===originalAsh,'retired campaign bytes preserved through native Last Stand Return');
    report.retired_campaign_preservation.native_return='observed unchanged';
    await selected('last-stand');
    const campaignItems=await page.locator('.command-center__library-items [data-command-item]').evaluateAll(items=>items.map(item=>item.dataset.commandItem));
    check(campaignItems.length===1&&campaignItems[0]==='last-stand','native Return offers only Last Stand');
    report.retired_campaign_preservation.retirement='observed Last Stand only';
    start=states.length;await outerPointer(page.locator('[data-command-action]'));
    restored=await until(states,start,item=>item.action==='ready',60);
    check(restored.hasCheckpoint && restored.runId===returnBefore.runId && restored.phase==='garage',
      'unfinished Return offers explicit saved-run resume',restored);
    await resize(captureViewport);await gameClick('Deploy','resume');
    const checkpoint=JSON.parse(returnSave).checkpoint;
    await page.waitForTimeout(1200);
    check(states.at(-1).paused && states.at(-1).tick===checkpoint.encounter.tick,'Return resume waits paused at saved state');
    await gameClick('Menu','menu');await gameClick('MenuAbandon','confirmation');
    const confirmation=states.at(-1),confirmationLayout=layouts.at(-1);
    check(confirmationLayout.selection==='ConfirmCancel','new run initially focuses Cancel');
    const cancelled=await gameClick('ConfirmCancel','confirmation-cancel');
    check(cancelled.runId===restored.runId && cancelled.paused &&
      assertWaveSavePreserved(JSON.parse(returnSave),JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),'Cancel preserves complete checkpoint');
    report.lifecycle.push({kind:'new-run-cancel',confirmation,cancelled,layout:confirmationLayout,saved:returnSave});
    await gameClick('SettingsClose','menu-close');
    if(player){await gameClick('SpeedRate','session',item=>!item.paused);await liveBattleLayouts();}
    const beforeReload=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});
    restored=await until(states,start,item=>item.action==='ready',60);
    check(restored.hasCheckpoint && ['garage','workshop'].includes(restored.phase) && restored.runId===returnBefore.runId &&
      assertWaveSavePreserved(JSON.parse(beforeReload),JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),
      'unfinished reload preserves complete checkpoint',restored);
    await gameClick('Menu','menu');await gameClick('MenuAbandon','confirmation');await gameClick('ConfirmProceed','abandon');
    check(!states.at(-1).hasCheckpoint && states.at(-1).wallet===JSON.parse(beforeReload).credits,'confirmed new run keeps banked progress');
    }
    if(section.lifecycle){
    report.effects_only_audio=await configureEffectsOnlyJourneyAudio({click:gameClick,currentLayout:()=>layouts.at(-1),
      readPreferences:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('singedTerra.lastStand.preferences.v1'))),check});
    const {startAudio,deployed,motionStart,first,firstHit,firstSound}=await startBaselineCapture({screenshot,phaseMatrix,hits,mark,gameClick,check,player,page,native,output,
      setMotion:value=>{motion=value;},encounters,callbackRecords,cues,modelOracle,until});
    const {sound,layoutPause}=await measureBaselineImpact({page,player,energy,check,battleLayouts,firstSound});
    const {pauseBefore,paused,pausedObservation}=await prepareJourneyPause({player,check,layoutPause,gameClick,layouts,states,until,mark,page,energy,observation,gameKey});
    const pauseStart=await mark();await page.waitForTimeout(1200);const pauseSound=await energy(pauseStart+150,await mark());
    check(states.at(-1).tick===paused.tick,'pause stops combat ticks');
    if(player)check(pauseSound.maximum_rms<.0005,'pause stops effects with ambient music explicitly disabled',pauseSound);
    if(player)await phaseMatrix('explicit-pause');await away('hidden',10500);const returned=await observation({paused:true,run:pausedObservation.run});
    await gameKey('SpeedRate','session',item=>!item.paused);
    const resumed=await observation({action:'pause',paused:false,minT:returned.t,run:returned.run});
    const resumeStart=await mark();await until(encounters,0,item=>item.load===load && item.t>=resumeStart+700 && !item.paused && !item.catchingUp,8);
    const pauseAfter=await observation({minT:resumeStart+700,run:resumed.run});
    report.lifecycle.push({kind:'explicit-pause',evidence:validateExplicitPause({before:pauseBefore,paused:pausedObservation,returned,
      resumed,after:pauseAfter,events:trace,oracle:reference(resumed)})});
    if(layoutPause)Object.assign(layoutPause,{resumed,after:pauseAfter,paused_ms:resumed.t-pausedObservation.t});
    const resumeSound=await energy(resumeStart,await mark());if(player)check(resumeSound.maximum_rms<=Math.max(.005,sound.maximum_rms*2),'resume has no deferred burst',resumeSound);
    const focusStartMs=await mark(),awayWindows=[];
    report.focus_obligations={hidden_tab:'required',visible_window_blur:process.platform==='win32'?'required':'unexecuted on this portable headless host'};
    for(const kind of process.platform==='win32'?['blur','hidden']:['hidden']) {
      const interval=await away(kind,6000);
      await until(encounters,0,item=>item.load===load && item.t>=interval.recovered+500 && !item.catchingUp && item.status==='Running',8);
      const after=await observation({minT:interval.recovered+500,run:interval.before.run});report.lifecycle.push({kind,evidence:validateBackgroundInterval({...interval,kind,after,events:trace,oracle:reference(after)})});
      awayWindows.push([kind,interval.begin,interval.recovered]);
    }
    const hiddenStart=awayWindows[0][1],hiddenEnd=awayWindows.at(-1)[2],postFocus=await mark();
    // First qualify a short earned boundary before the later natural terminal.
    // The separate 10–12-hour endurance obligation is not implied by this run.
    await page.waitForTimeout(16000);
    await until(states,0,item=>item.load===load && item.completedWave>=2 && item.saveState==='ready',90);
    const captureEnd=await mark();
    await gameKey('SpeedRate','session',item=>item.paused);
    const savedWave=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    const savedState=states.at(-1);
    assertIdleWaveSave(savedWave);
    check(savedWave.version===6 && savedWave.checkpoint?.encounter.completedWave>=2 && savedWave.pendingDefeat===null &&
      savedWave.credits===savedState.wallet && savedState.checkpointWave===savedWave.checkpoint.encounter.completedWave,
      'cleared waves atomically bank rewards and complete checkpoints',savedWave);
    check(!layouts.at(-1).controls.some(item=>item.name==='Claim' && item.active && item.interactable),
      'wave rewards require no manual Claim');
    await screenshot('02-checkpoint');await phaseMatrix('checkpoint');
    if(player){
    const frames=await page.evaluate('window.__stFrameProbe.stop()');
    const active=[['first-foe-before-impact',motionStart,firstHit],['first-hit-through-pause',firstHit,pauseStart],
      ['resumed-before-focus-loss',resumeStart,focusStartMs],['resumed-after-focus-loss',postFocus,captureEnd]];
    write('animation-frame-timestamps.json',{clock:'page performance.now milliseconds',timestamps:frames,active_windows:active,
      nonactive_windows:[['explicit-pause',pauseStart,resumeStart],...awayWindows]});
    report.frame_timing={capture_active:Object.fromEntries(active.map(([name,begin,end])=>[name,frameTiming(frames,begin,end)])),
      raw:'animation-frame-timestamps.json',raw_sha256:fileHash(join(output,'animation-frame-timestamps.json'))};
    check(Object.values(report.frame_timing.capture_active).every(item=>item.p95_ms<=50 && item.p99_ms<=100 && item.max_ms<=250),
      'active cadence: 50 ms p95, 100 ms p99, 250 ms maximum',report.frame_timing.capture_active);
    report.motion=await motion.encode();motion=null;
    const firstAudio=await saveJourneyCannonAudio({saveAudio,name:'first-run',sound:firstSound});
    const offset=(firstAudio[0].started-motionStart)/1000,movie=join(output,'normal-speed-repair-with-audio.mp4');
    runTool('ffmpeg',['-hide_banner','-nostdin','-i',join(output,report.motion.file),...(offset>=0?['-itsoffset',offset.toFixed(3)]:['-ss',(-offset).toFixed(3)]),
      '-i',join(output,firstAudio[0].file),'-c:v','copy','-c:a','aac','-b:a','160k',movie]);
    const streams=JSON.parse(runTool('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,start_time,duration,nb_read_frames','-of','json',movie])).streams;
    const video=streams.find(item=>item.codec_type==='video'),audio=streams.find(item=>item.codec_type==='audio');
    check(Number(video.nb_read_frames)===report.motion.encoded_frames && Math.abs(Number(video.duration)-report.motion.encoded_duration_seconds)<=.25 && Number(audio.nb_read_frames)>0,
      'audio mux preserves real frame count and duration',streams);
    report.playable_capture={file:'normal-speed-repair-with-audio.mp4',sha256:fileHash(movie),audio_alignment_seconds:offset,
      video_frames:Number(video.nb_read_frames),video_duration_seconds:Number(video.duration),audio_source:firstAudio[0].file};
    const reviewStart=(postFocus-motionStart)/1000,reviewDuration=(captureEnd+750-postFocus)/1000;
    check(reviewStart>=0 && reviewDuration>=15,'uninterrupted busy combat review segment');
    const reviewMovie=join(output,'active-play-review-with-audio.mp4');
    runTool('ffmpeg',['-hide_banner','-nostdin','-i',movie,'-ss',reviewStart.toFixed(3),'-t',reviewDuration.toFixed(3),
      '-fps_mode','passthrough','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',reviewMovie]);
    const reviewStream=JSON.parse(runTool('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',reviewMovie])).streams[0];
    check(Number(reviewStream.nb_read_frames)>0,'busy review retains real captured frames');
    report.active_play_review={file:'active-play-review-with-audio.mp4',sha256:fileHash(reviewMovie),source:report.playable_capture.file,
      start_seconds:reviewStart,duration_seconds:reviewDuration,encoded_frames:Number(reviewStream.nb_read_frames),edit:'single hard trim, passthrough timestamps'};
    }
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});await focused('checkpoint reload');
    restored=await until(states,start,item=>item.action==='ready',60);
    check(['garage','workshop'].includes(restored.phase) && restored.hasCheckpoint && restored.runId===savedWave.checkpoint.runId,
      'saved wave survives reload and awaits explicit Resume',restored);
    await phaseMatrix('resume-ready');
    const resumedCheckpoint=await deployObservedJourney({gameClick,states,layouts},'resume');await page.waitForTimeout(1200);
    await gameClick('Menu','menu');
    const stableCheckpoint=states.at(-1),storedAfterResume=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    const observedClock=await page.evaluate(()=>({t:performance.now(),timeOrigin:performance.timeOrigin}));
    const resumeProof=validateCheckpointResume({saved:savedWave,resumed:resumedCheckpoint,stable:stableCheckpoint,stored:storedAfterResume,observedClock});
    check(true,'Resume restores saved state paused without offline catch-up',resumeProof);
    report.lifecycle.push({kind:'checkpoint-resume',...resumeProof});
    await gameClick('SettingsClose','menu-close');await phaseMatrix('resumed');
    await gameClick('Menu','menu');await gameClick('MenuAbandon','confirmation');
    check(layouts.at(-1).selection==='ConfirmCancel','abandon initially focuses Cancel');
    await gameClick('ConfirmProceed','abandon');
    const abandoned=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    check(validateWaveAbandonSave({before:savedWave,after:abandoned}),'confirmed abandon keeps banked rewards and finalizes run');
    report.lifecycle.push({kind:'checkpoint-abandon',before:savedWave,after:abandoned});
    for(const viewport of matrix.viewports)await resize(viewport);await phaseMatrix('garage-after-abandon');
    await resize(VIEWPORTS.find(item=>item.name==='compact'));const purchaseStart=await mark();
    await gameClick('ShopEntry','hud-layout',item=>item.shopControls.some(control=>control.name==='ShopClose'&&control.active));
    if(!layouts.at(-1).shopControls.some(item=>item.name==='ShopCard_cannonAttackBuy'&&item.active))
      await gameClick('ShopTabAttack','hud-layout',item=>item.shopControls.some(control=>control.name==='ShopCard_cannonAttackBuy'&&control.active));
    const bought=await purchaseJourneyCannon({gameKey,check,savedWave});
    await gameClick('ShopClose','hud-layout',item=>!item.shopControls.some(control=>control.name==='ShopClose'&&control.active));
    await page.waitForTimeout(600);if(player)check((await energy(purchaseStart,await mark())).maximum_rms>.0005,'rendered purchase cue measured');
    await screenshot('05-purchased');if(player)await saveAudio('workshop',{purchase:[purchaseStart,await mark()]});
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});await focused('purchase reload');
    const again=await until(states,start,item=>item.action==='ready',60);
    check(again.level===1 && again.wallet===savedWave.credits-2 && again.pendingRunId===0 && !again.hasCheckpoint,'purchase reload retains permanent level and spent balance',again);
    check(states.at(-1).fittingId==='repair'&&layouts.at(-1).graphics.some(item=>item.active&&item.path.endsWith('/GarageFittingName')&&item.text.toUpperCase().includes('FIELD REPAIR')),'same repair fitting retained after upgrade in its visible garage card');
    await resize(captureViewport);const hitStart=hits.length;const upgradedDeployment=await deployObservedJourney({gameClick,states,layouts});
    const noCaptureStart=player?await page.evaluate('window.__stFrameProbe.start()'):null;
    const {upgradedHit,upgradedSound}=await observeUpgradedImpact({deployed:upgradedDeployment,start:hitStart,hits,encounters,callbackRecords,cues,
      oracle:modelOracle[`${upgradedDeployment.activeTier}:${upgradedDeployment.fittingId}:${upgradedDeployment.cannonDamage}`],until,check,player,page,write,report,noCaptureStart});
    await screenshot('07-upgraded-first-hit');
    const nextBoundary=states.at(-1).completedWave+1;
    const interval=await away('hidden',12000);
    await until(states,0,item=>item.load===load && item.completedWave>=nextBoundary && item.saveState==='ready',60);
    await captureBackgroundCheckpoint({observation,reference,interval,gameKey,page,check,report,phaseMatrix,nextBoundary});
    const quietStart=await mark();await page.waitForTimeout(900);await noReplay(quietStart,await mark());
    await gameKey('SpeedRate','session',item=>!item.paused);
    const {naturalResult,naturalSaved,naturalProof}=await observeNaturalTerminal({observation,states,reference,check,player,armGameClick,until,load,phaseMatrix,gameClick,page,encounters,layouts,report,matrix});
    await phaseMatrix('result');
    if(player)await saveJourneyCannonAudio({saveAudio,name:'second-run',sound:upgradedSound,staged:naturalProof.staged});
    const continued=await gameKey('Claim','continue');
    check(continued.wallet===naturalSaved.credits && continued.pendingRunId===0 && !continued.hasCheckpoint,
      'Continue cannot pay a second reward');
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});await focused('terminal reload');
    const finalReload=await until(states,start,item=>item.action==='ready',60);
    check(!finalReload.hasCheckpoint && finalReload.runId===0 && finalReload.pendingRunId===0 &&
      assertWaveSavePreserved(naturalSaved,JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),
      'finalized natural defeat cannot resume after reload');
    report.lifecycle.push({kind:'terminal-reload',saved:JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)),state:finalReload});
    await deployObservedJourney({gameClick,states,layouts});
    const backgroundBefore=await observation(),backgroundOracle=reference(backgroundBefore);
    const backgroundExpected=Object.values(backgroundOracle).at(-1),backgroundStart=states.length;
    check(backgroundExpected.status==='Defeated','background actual wave model has natural terminal');
    const {interval:terminalAway,result:backgroundResult}=await collectHiddenWaveResult({away,until,states,before:backgroundBefore,start:backgroundStart,expectedTerminal:backgroundExpected,trace});
    const {saved:backgroundFinal,proof:backgroundProof}=await captureWaveTerminal({before:backgroundBefore,result:backgroundResult,page,states,encounters,layouts,oracle:backgroundOracle});
    const continuation=retainHiddenWaveTerminal({interval:terminalAway,before:backgroundBefore,proof:backgroundProof,trace,callbackRecords,states,cues});
    const reconciledAt=await mark();
    await noReplay(terminalAway.begin+200,reconciledAt,{...terminalAway,kind:'hidden',recovered:reconciledAt});
    report.lifecycle.push({kind:'wave-terminal',mode:'hidden',interval:terminalAway,evidence:backgroundProof,continuation});
    check(true,'background natural defeat finalizes checkpoint once without payout',backgroundProof);
    const savedTerminalBytes=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
    for(let i=0;i<2;i++)await away('hidden',6000);
    check(assertWaveSavePreserved(JSON.parse(savedTerminalBytes),JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),
      'repeated foreground returns cannot award or resurrect finalized run');
    await phaseMatrix('background-result');await gameKey('Claim','continue');
    report.qualification.natural_terminal='pass';
    checkProceduralJourneyCues({messages,player,check,report});

    }
    if(section.recovery){
    if(!section.lifecycle){
      await goto('');await dismissSplash();await selected('first-salvo');
      await openCampaigns();await selected('last-stand');
      check(!requests.some(r=>r.url.includes('/last-stand/Build/')),'zero Unity runtime payload before ordinary launch');
    }
    // Loader and wasm faults: real error UI, keyboard Return, and ordinary Retry.
    for(const extension of ['.loader.js','.wasm']){
      scope=extension==='.wasm'?'wasm-fault':'loader-fault';
      const manifest=JSON.parse(readFileSync(join(ROOT,'client/public/last-stand/asset-manifest.json'),'utf8'));
      const leaf=Object.keys(manifest.files).find(path=>path.endsWith(extension));
      fault=new URL(`last-stand/${leaf}`,base).pathname;
      expectedFaults.push({scope,load:load+1,url:new URL(fault,base).href,resourceType:extension==='.wasm'?'fetch':'script',
        consoleTexts:extension==='.loader.js'?['Last Stand load failed Unity loader unavailable']:[],
        ...(extension==='.wasm'?{documentURL:new URL('last-stand/',base).href,
          frameworkURL:new URL('last-stand/'+Object.keys(manifest.files).find(path=>path.endsWith('.framework.js')),base).href,
          loaderURL:new URL('last-stand/'+Object.keys(manifest.files).find(path=>path.endsWith('.loader.js')),base).href}:{})});
      await goto('last-stand/');await page.locator('#error').waitFor({state:'visible'});
      check((await page.locator('#status').innerText())==='Scene could not load',`${scope}: visible failure`);
      check(await page.locator('#last-stand-return').getAttribute('href')==='../#campaigns/last-stand',`${scope}: independent native return href`);
      await keyboardFocus(page.locator('#last-stand-return'));await screenshot(scope);
      for(const viewport of matrix.phaseViewports) {
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        const boxes=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          targets:['#last-stand-return','#retry','#error','#status'].map(selector=>({selector,
            bounds:document.querySelector(selector).getBoundingClientRect().toJSON()}))}));
        check(boxes.scrollWidth<=boxes.width,`${scope}: wrapper fault has no horizontal overflow`,boxes);
        for(const item of boxes.targets)check(item.bounds.width>0 && item.bounds.height>0 && item.bounds.x>=0 && item.bounds.right<=boxes.width &&
          item.bounds.y>=0 && item.bounds.bottom<=boxes.height,`${scope}: ${item.selector} remains readable/reachable`,item);
        await screenshot(`${scope}-${viewport.name}`);
      }
      fault=null;scope='healthy';start=states.length;await outerPointer(page.getByRole('link',{name:'Retry',exact:true}));
      await until(states,start,item=>item.action==='ready',60);check(true,`${extension}: real Retry recovered genuine scene`);
      await keyboardFocus(page.locator('#last-stand-return'));await page.keyboard.press('Enter');
      await page.locator('[data-last-stand-command-view]').waitFor();check(await page.locator('#st-splash').count()===0,'failure recovery Return has no splash');
    }
    for(const probe of ['corrupt','blocked']){
      scope=`storage-${probe}`;
      // Store only malformed test bytes or deny this key's writes, without substituting a save.
      await page.evaluate(({key,probe})=>{localStorage.removeItem(key);if(probe==='corrupt')localStorage.setItem(key,'{bad json');},{key:SAVE_KEY,probe});
      if(probe==='blocked')await page.addInitScript(key=>{
        const original=Storage.prototype.setItem;window.__stDenySaveWrites=true;
        Storage.prototype.setItem=function(name,...args){if(name===key && window.__stDenySaveWrites)throw new DOMException('blocked by isolated test','SecurityError');return original.call(this,name,...args);};
      },SAVE_KEY);
      start=states.length;await goto('last-stand/');const broken=await until(states,start,item=>item.action==='ready',60);
      check(broken.saveState!=='ready',`${probe}: storage failure shown honestly`,broken);
      check(!layouts.at(-1).controls.some(item=>item.name==='Deploy' && item.active && item.interactable),`${probe}: economic deployment blocked`);
      await screenshot(`storage-${probe}`);await phaseMatrix(`storage-${probe}`);
      if(probe==='blocked')await page.evaluate('window.__stDenySaveWrites=false');
      const retry=await gameClick('RetrySave',probe==='corrupt'?'save-error':'save-recovered');
      if(probe==='blocked')check(retry.saveState==='ready','blocked writes recover through real Retry');
      else {
        check(retry.saveState!=='ready','corrupt Retry preserves blocked state');
        check(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)==='{bad json','corrupt bytes preserved by Retry');
      }
      const returnURL=page.url(),returnStateStart=states.length;
      await keyboardFocus(page.locator('#last-stand-return'));await page.keyboard.press('Enter');
      if(probe==='corrupt'){
        const refused=await until(states,returnStateStart,item=>item.action==='navigation-unavailable',8);
        check(refused.saveState!=='ready' && page.url()===returnURL &&
          await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)==='{bad json',
          'corrupt save refuses native Return and preserves the unconfirmed record',refused);
      }else{
        await page.locator('[data-last-stand-command-view]').waitFor();
        check(await page.locator('#st-splash').count()===0,'recovered confirmed save permits native Return');
      }
    }
    }
    scope='healthy';
    report.input_trace=validateGameplayInput(trace,report.actions);
    report.keyboard_trace=validateKeyboardGameplayInput(trace,report.keyboard_actions);
    const {consoleErrors,requestErrors,httpErrors:unexpectedHTTP,accepted,expected}=classifyBrowserEvidence(messages,failures,httpErrors,expectedFaults);
    report.accepted_cache_revalidations=accepted;report.console_classification={errors:consoleErrors};
    report.expected_fault_observations=expected;
    check(!consoleErrors.length && !requestErrors.length && !unexpectedHTTP.length,
      'no unclassified browser/Unity/shader/request errors in any scope',{consoleErrors,requestErrors,httpErrors:unexpectedHTTP});
    throwObserverFailure();
    report.qualification.functional=section.name!=='full'?'viewport-section-pass':matrix.shard?'viewport-shard-pass':'pass';
    if(player)for(const key of ['rendered_audio','native_blur','capture_cadence'])report.qualification[key]='pass';
    report.status='pass';return{resultPath,output,report};
  } catch(error) {
    originalError??=error;
    report.status='failed';report.error=`${originalError.name}: ${originalError.message}`;
    await retainRenderedAudioDiagnostics(page,report,{load,scope,kind:'failure-current-document'});
    if(page)await page.screenshot({path:join(output,'failure-screen.png'),timeout:5000}).then(()=>{report.failure_screen={file:'failure-screen.png',sha256:fileHash(join(output,'failure-screen.png'))};}).catch(error=>{report.failure_screen_error=String(error);});
    throw error;
  } finally {
    try {
      if(report.packaged_before) {
        if(report.parent_artifact)assert.deepEqual((await bindT21ServedParent(base)).served,report.parent_artifact.served,'Served parent artifact drifted');
        report.packaged_after=packagedRuntimeSnapshot();
        assertPackagedRuntimeParity(report.packaged_before,report.packaged_after);
        report.binding??={served:{}};report.binding.served_after={};
        const manifest=JSON.parse(readFileSync(join(ROOT,'client/public/last-stand/asset-manifest.json'),'utf8'));
        for(const [path,expected]of Object.entries({...manifest.files,'index.html':manifest.wrapperSha256})) {
          const response=await fetchBoundRuntime(base,path);assertServedBytes(response,expected);
          report.binding.served_after[path]={sha256:hash(response.bytes),bytes:response.bytes.length};
        }
        if(Object.keys(report.binding.served).length===17)
          assert.deepEqual(report.binding.served_after,report.binding.served,'Served runtime bytes drifted during journey');
        else report.served_recheck_scope='Preflight admission was incomplete; original failure retained, after bytes checked against the manifest';
      }
    } catch(error) {
      report.status='failed';report.runtime_drift_error=String(error);originalError??=error;
    }
    if(observerError)report.status='failed';
    try{await retainJourneyOutcome(report,async()=>{
      if(motion)await motion.stop().catch(error=>{report.motion_cleanup_error=String(error);});
      if(native)await native.close();
    },()=>persistJourneyFinalEvidence({report,observations:{messages,failures,httpErrors,expectedFaults,observerFailures,
      states,encounters,callbackRecords,hits,layouts,cues,trace,requests},write,output}),originalError);}catch(error){throw originalError??error;}
    // A callback can arrive while cleanup awaits. Its first error still
    // wins after cleanup and persistence complete, even after a return.
    throwObserverFailure();
  }
}

export {lastStandViewportPartition} from './lastStandMatrix.mjs';
export {admitEvidenceParent} from './lastStandJourneyHost.mjs';
export {closeLastStandOwnedBrowsers,nativeChromeArgs,retainAwayFailure,cleanupAwayAuxiliary,bindOwnedNativeWindow,assertOwnedNativeActivation,ensureOwnedNativeForeground,activateOwnedNativeWindow,ownedChrome,createLastStandNativeDriver} from './lastStandNativeDriver.mjs';
export {retainRuntimeObservation,observeRuntimePair,validateAdmittedClock,waveIntervalEvents,validateModelObservation,observeFirstCannonImpact,observeFreshCannonAudio,validateSettlingTransition,validateBackgroundInterval,validateExplicitPause,validateTerminalOwnership,validateNoReplayAudio,validateAwayAudioReturn,createRuntimeObservation} from './lastStandRuntimeObservation.mjs';
export {encounterOraclePackage,encounterOracleToolchain,readBoundEncounterOracle,admitEncounterOracleOutput,encounterCompilationSourceBinding,buildEncounterOracle,createEncounterOracle} from './lastStandEncounterOracle.mjs';
export {processTable,ownedProcessIdentity,collectOwnedDescendants,stopOwnedProcessTree,removeOwnedProfile} from './lastStandProcessOwnership.mjs';
export {lastStandJourneyTimeBudget,ownedSupervisorLifetimeLimit,publishOwnedSupervisorJson,finishOwnedSupervisorCleanup,startOwnedSupervisor,watchOwnedProcess,createLastStandProcessSupervisor} from './lastStandProcessSupervisor.mjs';
export {retainRenderedAudioDiagnostics,measureRenderedAudioEnergy,AUDIO_CAPTURE,createLastStandMediaCapture} from './lastStandMediaCapture.mjs';
export {classifyConsole,packagedRuntimeSnapshot,assertPackagedRuntimeParity,admitJourneyBase,fetchBoundRuntime,assertServedBytes,assertUnityReady,bindConfiguredRejoinFixture,routeLastStandRequest,classifyBrowserEvidence} from './lastStandRuntimeAdmission.mjs';
export {isWaveResultFor,assertWaveStillHidden,validateHiddenWaveTerminal,validateBackgroundWaveTerminal,assertIdleWaveSave,WAVE_FITTINGS,assertWaveCheckpointEdition,assertWaveStateEdition,assertWaveRestoredState,validateBackgroundCheckpoint,assertWaveSavePreserved,validateWaveAbandonSave,validateWaveTerminal,validateCheckpointResume} from './lastStandWaveGuards.mjs';

export function createShopRecoveryActions(runtime) {
    const placeOwned=async(target,left,width,role)=>{
      assert.equal(target.context(),runtime.native.context,'Only this task browser may be placed');
      let session,browserSession;
      try {
        session=await runtime.native.context.newCDPSession(target);browserSession=await runtime.native.browser.newBrowserCDPSession();
        const {targetInfo}=await session.send('Target.getTargetInfo');
        const before=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        assert.equal(before.bounds.windowState,'normal');const requested={left,top:10,width,height:988};
        await browserSession.send('Browser.setWindowBounds',{windowId:before.windowId,bounds:requested});
        const after=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        assert.equal(after.windowId,before.windowId);for(const key of Object.keys(requested))assert.equal(after.bounds[key],requested[key]);
        (runtime.report.native_window_placements??=[]).push({role,target:targetInfo.targetId,before,requested,after});
      } finally {for(const value of [session,browserSession])if(value)await value.detach();}
    };
    const collectNative=async(operation,options)=>{
      // The shared helpers retain a bounded diagnostic history. Each recovery
      // input needs its own genuine witness, including refused/cleanup records.
      const observations={};
      try{return await operation({...options,report:observations});}
      finally {for(const [key,value]of Object.entries(observations)){
        if(Array.isArray(value))(runtime.report[key]??=[]).push(...value);
        else runtime.report[key]=(runtime.report[key]??0)+value; // Shared helpers emit dropped counts.
      }}
    };
    const click=async(name)=>{
      if(runtime.observerError)throw runtime.observerError;
      await runtime.page.bringToFront();
      if(runtime.nativeMode)await collectNative(runtime.ensureOwnedNativeForeground??ensureOwnedNativeForeground,{native:runtime.native,page:runtime.page,kind:name,role:'shop-recovery-input'});
      await runtime.page.waitForFunction('!document.hidden && document.hasFocus()');
      const layout=runtime.current(runtime.records.controlsOnly);
      const measurement=await runtime.page.evaluate(layoutSeq=>{
        const {x,y,width,height}=document.querySelector('#unity-canvas').getBoundingClientRect();
        const value={x,y,width,height,layoutSeq,t:performance.now(),timeOrigin:performance.timeOrigin};
        console.log('ST_TEST_GEOMETRY '+JSON.stringify(value));return value;
      },layout.seq);
      const canvas=await runtime.until(runtime.records.geometry,0,row=>row.t===measurement.t&&row.layoutSeq===layout.seq);
      const controls=[...layout.controls,...layout.shopControls,...layout.settingsControls].filter(item=>item.name===name&&item.active&&item.interactable);
      runtime.check(controls.length===1,'One actual recovery control: '+name);const control=controls[0];
      runtime.check(control.width*canvas.width/layout.width>=43.99&&control.height*canvas.height/layout.height>=43.99,'Recovery target at least 44 CSS pixels');
      const x=canvas.x+(control.x+control.width/2)*canvas.width/layout.width,y=canvas.y+(control.y+control.height/2)*canvas.height/layout.height;
      await runtime.page.evaluate("window.__stInputArea='gameplay'");const before=await runtime.page.evaluate('performance.now()');
      await runtime.page.mouse.move(x,y);await runtime.page.mouse.down();await runtime.page.waitForTimeout(150);await runtime.page.mouse.up();
      const after=await runtime.page.evaluate('performance.now()');
      const up=await runtime.until(runtime.records.input,0,row=>row.kind==='pointerup'&&row.t>=before&&row.t<=after&&Math.abs(row.x-x)<1&&Math.abs(row.y-y)<1);
      const index=runtime.report.actions.length;runtime.report.actions.push({name,x,y,load:runtime.load,before,after,layoutSeq:layout.seq,
        timeOrigin:layout.timeOrigin,pointer_up_t:up.t,canvas});
      await runtime.page.waitForTimeout(80);runtime.persist();return index;
    };

  return {placeOwned,collectNative,click};
}

export function createJourneyEvidenceWriter(output,overrides={}) {
  return (name,value)=>writeShopPresentationJson((overrides.join??join)(output,name),value,overrides);
}
export function persistJourneyFinalEvidence({report,observations,write,output,logger=console}) {
  try {persistLastStandJourneyEvidence(report,observations,write,message=>logger.error(message));}
  finally {logger.log(`LAST_STAND_LOOP_EVIDENCE=${output}`);}
}

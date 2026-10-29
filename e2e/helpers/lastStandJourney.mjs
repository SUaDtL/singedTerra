// Versioned diagnostics contract; player actions and state remain in production owners.
const OBSERVATION_CONTRACT=JSON.parse(readFileSync(new URL('../../campaign-unity/Tools/contracts/last-stand-observation-v1.json',import.meta.url),'utf8'));
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
const SHOP_PLAYER_INPUTS = ['e2e/helpers/lastStandJourney.mjs','scripts/last-stand-playable-loop.mjs',
  'campaign-unity/Tools/verify_last_stand_loop.py','campaign-unity/Tools/last_stand_shop/test_shop_player.py',
  'campaign-unity/Tools/last_stand_shop/test_shop_journey_guards.py',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json'];

// Full graphics observations exceed V8's single-string limit during the complete
// presentation matrix. Preserve every value, streaming JSON in bounded batches.
export function writeShopPresentationJson(path,value){
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
  const tag=OBSERVATION_CONTRACT.tag;
  assert.ok(typeof raw==='string' && raw.startsWith(tag),'Expected actual HUD control emission');
  const payload=raw.slice(tag.length),boundary=payload.indexOf(',"graphics":[');
  assert.ok(boundary>0,'Complete controls must precede the graphics array');
  const prefix=JSON.parse(payload.slice(0,boundary)+'}');
  const {header,tail}=OBSERVATION_CONTRACT;
  assert.deepEqual(Object.keys(prefix).filter(key=>!tail.includes(key)).sort(),[...header].sort(),'Exact complete controls header');
  // Research/history offsets follow graphics in the Unity record. A truncated
  // packet cannot qualify those panes: keep the raw failure rather than infer it.
  const complete=JSON.parse(payload);
  assert.deepEqual(Object.keys(complete).sort(),[...header,'graphics',...tail].sort(),'Exact current HUD observation');
  assert.ok(Array.isArray(complete.graphics),'Complete observed graphics required');
  const fields={...prefix,...Object.fromEntries(tail.map(key=>[key,complete[key]]))};
  assert.ok(fields.coordinates==='top-left' && typeof fields.phase==='string' && typeof fields.selection==='string');
  for(const name of OBSERVATION_CONTRACT.numeric)
    assert.ok(Number.isFinite(fields[name]) && fields[name]>=0,'Finite control coordinate: '+name);
  assert.ok(fields.width>0 && fields.height>0 && fields.pixelRatio>0);
  const names=OBSERVATION_CONTRACT.inventories.map(({field,names})=>[field,names]);
  const allNames=new Set();
  for(const [key,expected]of names) {
    const items=fields[key];assert.ok(Array.isArray(items) && items.length===expected.length,'Complete '+key);
    assert.deepEqual(items.map(item=>item.name).sort(),[...expected].sort(),'Unique known '+key);
    for(const item of items) {
      assert.ok(!allNames.has(item.name),'Control identity appears in one owner');allNames.add(item.name);
      assert.deepEqual(Object.keys(item).sort(),[...OBSERVATION_CONTRACT.controlStrings,...OBSERVATION_CONTRACT.controlNumbers,...OBSERVATION_CONTRACT.controlBooleans].sort());
      for(const name of OBSERVATION_CONTRACT.controlStrings)assert.equal(typeof item[name],'string');
      for(const name of OBSERVATION_CONTRACT.controlNumbers)assert.ok(Number.isFinite(item[name]),'Finite control bounds');
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

// Exercise the visible settings surface and return with the owner's manual
// pause/rate intact. The caller supplies the actual setting observation.
export async function changeLastStandSetting({control,click,currentLayout,currentState,readValue,waitFor}) {
  const tabs={SettingsMute:0,DisplayEffects:1};
  assert.ok(Object.hasOwn(tabs,control),'Known settings action required');
  const before={...currentState()};
  assert.equal(before?.menu,'','Settings journey starts at the actual game');
  assert.equal(typeof before.paused,'boolean');assert.ok(Number.isFinite(before.selectedSpeed)&&before.selectedSpeed>=0);
  const original=readValue();assert.equal(typeof original,'boolean','Actual setting value required');
  const available=name=>currentLayout().settingsControls.some(item=>item.name===name&&item.active&&item.interactable);
  await click('Menu');await waitFor(()=>currentState()?.menu==='menu'&&available('MenuSettings'));
  await click('MenuSettings');await waitFor(()=>currentState()?.menu==='settings'&&available('SettingsTab'+tabs[control]));
  await click('SettingsTab'+tabs[control]);await waitFor(()=>available(control));
  await click(control);await waitFor(()=>readValue()===!original);
  await click('SettingsClose');await waitFor(()=>currentState()?.menu==='');
  assert.equal(currentState().paused,before.paused,'Settings close preserves the manual pause');
  assert.equal(currentState().selectedSpeed,before.selectedSpeed,'Settings changes preserve the selected game speed');
  assert.equal(readValue(),!original,'Actual setting remains changed after closing');
  return currentState();
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

async function runShopRecoveryJourney({baseURL,chromium,fitting}) {
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
  const persist=()=>{
    // Serializing the growing observations during combat advances the real game
    // while this driver is blocked. Keep checkpoints small; finally flushes all
    // evidence after either a completed journey or a caught failure.
    const lastCheck=report.checks.at(-1);
    writeFileSync(join(output,'progress.json'),JSON.stringify({
      schema:'singedterra-shop-recovery-progress/v1',status:report.status,load,
      actions:report.actions.length,checks:report.checks.length,messages:messages.length,
      last_action:report.actions.at(-1)?.name?.slice(0,128)??null,
      last_check:lastCheck?{name:lastCheck.name.slice(0,256),pass:lastCheck.pass}:null,
      error:(report.error??report.observer_failure?.error??'').slice(0,1024),
      records:Object.fromEntries(Object.entries(records).map(([key,rows])=>[key,rows.length])),
    },null,2));
    if(report.status==='running')return;
    writeFileSync(path,JSON.stringify(report,null,2));
    writeFileSync(join(output,'console.json'),JSON.stringify(messages,null,2));
  };
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
    const placeOwned=async(target,left,width,role)=>{
      assert.equal(target.context(),native.context,'Only this task browser may be placed');
      let session,browserSession;
      try {
        session=await native.context.newCDPSession(target);browserSession=await native.browser.newBrowserCDPSession();
        const {targetInfo}=await session.send('Target.getTargetInfo');
        const before=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        assert.equal(before.bounds.windowState,'normal');const requested={left,top:10,width,height:988};
        await browserSession.send('Browser.setWindowBounds',{windowId:before.windowId,bounds:requested});
        const after=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        assert.equal(after.windowId,before.windowId);for(const key of Object.keys(requested))assert.equal(after.bounds[key],requested[key]);
        (report.native_window_placements??=[]).push({role,target:targetInfo.targetId,before,requested,after});
      } finally {for(const value of [session,browserSession])if(value)await value.detach();}
    };
    const collectNative=async(operation,options)=>{
      // The shared helpers retain a bounded diagnostic history. Each recovery
      // input needs its own genuine witness, including refused/cleanup records.
      const observations={};
      try{return await operation({...options,report:observations});}
      finally {for(const [key,value]of Object.entries(observations)){
        if(Array.isArray(value))(report[key]??=[]).push(...value);
        else report[key]=(report[key]??0)+value; // Shared helpers emit dropped counts.
      }}
    };
    const click=async(name)=>{
      if(observerError)throw observerError;
      await page.bringToFront();
      if(nativeMode)await collectNative(ensureOwnedNativeForeground,{native,page,kind:name,role:'shop-recovery-input'});
      await page.waitForFunction('!document.hidden && document.hasFocus()');
      const layout=current(records.controlsOnly);
      const measurement=await page.evaluate(layoutSeq=>{
        const {x,y,width,height}=document.querySelector('#unity-canvas').getBoundingClientRect();
        const value={x,y,width,height,layoutSeq,t:performance.now(),timeOrigin:performance.timeOrigin};
        console.log('ST_TEST_GEOMETRY '+JSON.stringify(value));return value;
      },layout.seq);
      const canvas=await until(records.geometry,0,row=>row.t===measurement.t&&row.layoutSeq===layout.seq);
      const controls=[...layout.controls,...layout.shopControls,...layout.settingsControls].filter(item=>item.name===name&&item.active&&item.interactable);
      check(controls.length===1,'One actual recovery control: '+name);const control=controls[0];
      check(control.width*canvas.width/layout.width>=43.99&&control.height*canvas.height/layout.height>=43.99,'Recovery target at least 44 CSS pixels');
      const x=canvas.x+(control.x+control.width/2)*canvas.width/layout.width,y=canvas.y+(control.y+control.height/2)*canvas.height/layout.height;
      await page.evaluate("window.__stInputArea='gameplay'");const before=await page.evaluate('performance.now()');
      await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
      const after=await page.evaluate('performance.now()');
      const up=await until(records.input,0,row=>row.kind==='pointerup'&&row.t>=before&&row.t<=after&&Math.abs(row.x-x)<1&&Math.abs(row.y-y)<1);
      const index=report.actions.length;report.actions.push({name,x,y,load,before,after,layoutSeq:layout.seq,
        timeOrigin:layout.timeOrigin,pointer_up_t:up.t,canvas});
      await page.waitForTimeout(80);persist();return index;
    };
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

// Passive probes translated verbatim from the historical artifact verifier.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, readdirSync, readlinkSync, realpathSync, lstatSync, openSync, writeSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { tmpdir, release, arch, uptime } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { buildWaveOracle, WAVE_ORACLE_SOURCES } from './lastStandWaveOracle.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const SAVE_KEY = 'singedTerra.lastStand.prototype.v1';
const SELECTION_KEY = 'singedterra.command-center.selection.v1';
const TITLE = 'Last Stand wave checkpoints survive Return and reload before a stronger redeploy';
import {LAST_STAND_VIEWPORTS as VIEWPORTS, lastStandViewportPartition, lastStandJourneySection, LAST_STAND_ENTRY_ROUTES} from './lastStandMatrix.mjs';
export {lastStandViewportPartition} from './lastStandMatrix.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = path => hash(readFileSync(path));
const delay = ms => new Promise(done => setTimeout(done, ms));
const ownedBrowsers = new Set();
const ownedBrowserWindows = new WeakMap();
export async function closeLastStandOwnedBrowsers() {
  const errors=[];for (const close of [...ownedBrowsers])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Owned browser cleanup failed');
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

// Associate loop records with the session run actually preceding them in this
// console stream. Progression runId and EncounterSession.run are different
// domains; their deploy records below establish the association, not equality.
export function retainRuntimeObservation(observation,load,scope,{states,encounters,hits,layouts,cues,callbackRecords}) {
  if(observation.text.includes('ST_ENC_CALLBACK ')) {
    assert.ok(Array.isArray(callbackRecords),'Callback observations require their dedicated owner');
    callbackRecords.push({...JSON.parse(observation.text.split('ST_ENC_CALLBACK ')[1].split('\n')[0]),
      t:observation.t,timeOrigin:observation.timeOrigin,load,scope});
  }
  for(const [tag,items] of [['ST_LS_STATE ',states],['ST_ENC_STATE ',encounters],['ST_LS_HIT ',hits],['ST_LS_HUD_LAYOUT ',layouts]]) {
    if(!observation.text.includes(tag))continue;
    const item={...JSON.parse(observation.text.split(tag)[1].split('\n')[0]),
      t:observation.t,timeOrigin:observation.timeOrigin,load,scope};
    if(tag==='ST_LS_STATE ') {
      const session=encounters.at(-1);
      item.sessionRun=session?.load===load && session.timeOrigin===observation.timeOrigin ? session.run : null;
    }
    items.push(item);
  }
  if(observation.text.includes('ST_LS_AUDIO event='))cues.push({...observation,load,scope});
}

export async function observeRuntimePair({encounters,states,load,clock,wait,check,options={}}) {
  const initial=await clock(),deadline=Date.now()+8000;
  const documentRecord=item=>item?.load===load && item.timeOrigin===initial.timeOrigin;
  const loopRun=item=>item?.runId || item?.pendingRunId || 0;
  let detail;
  while(true) {
    const now=await clock(),latest=encounters.at(-1),current=states.at(-1);
    check(Number.isFinite(now.t) && Number.isFinite(now.timeOrigin) && now.timeOrigin===initial.timeOrigin && now.t>=initial.t,
      'coherent observation document clock',{initial,now});
    const encounter=options.status || options.action ? encounters.findLast(item=>documentRecord(item) &&
      (options.status===undefined || item.status===options.status) && (options.action===undefined || item.action===options.action) &&
      (options.paused===undefined || item.paused===options.paused) && item.run===latest?.run && item.t>=(options.minT??0)) : latest;
    const deployment=encounters.findLast(item=>documentRecord(item) && item.run===encounter?.run && item.action==='deploy');
    const deployedState=deployment && states.find(item=>documentRecord(item) && item.sessionRun===deployment.run &&
      ['deploy','resume'].includes(item.action) && item.tick===deployment.tick && item.t>=deployment.t && item.runId>0);
    const state=states.findLast(item=>documentRecord(item) && item.sessionRun===encounter?.run && item.tick===encounter?.tick &&
      item.t>=encounter.t && loopRun(item)===loopRun(current));
    detail={options,now,latest,current,encounter,state,deployment,deployedState};
    const identity=documentRecord(latest) && documentRecord(current) && documentRecord(encounter) && state &&
      Number.isInteger(encounter.run) && encounter.run>=0 && current.sessionRun===encounter.run &&
      (options.run===undefined || encounter.run===options.run) && encounter.t<=now.t && state.t<=now.t &&
      encounter.t>=(options.minT??0) && (options.action===undefined || encounter.action===options.action) &&
      (options.paused===undefined || encounter.paused===options.paused);
    // Active streams report at second boundaries. An older active report must
    // await a real new pair; immutable Pause/Fitting and requested action/terminal
    // witness retain their actual event clock without inventing a fresh stamp.
    const fresh=encounter && (options.action!==undefined || encounter.paused || encounter.status!=='Running' || now.t-encounter.t<=1000);
    const runBound=encounter?.status==='Fitting' || (deployedState && loopRun(state)===deployedState.runId);
    if(identity && fresh && runBound) {
      check(encounter.hp===state.hull && encounter.kills===state.kills && encounter.paused===state.paused &&
        (options.status!==undefined || encounter.paused===current.paused),
        'coherent actual loop/session observation counters',detail);
      return {...encounter,hull:state.hull,loop:state};
    }
    if(now.t-initial.t>=8000 || Date.now()>=deadline) {
      check(false,'coherent actual loop/session observation pair absent within bounded wait',detail);
      throw new Error('Actual runtime observation pair absent');
    }
    await wait(40);
  }
}

function sameDocument(before, after) {
  for (const item of [before,after]) {
    assert.ok(Number.isFinite(item?.t) && Number.isFinite(item.timeOrigin), 'Invalid observation clock');
    const maximum=Number.isInteger(item.wave) && item.wave>0 ? 2147483647 : 3600;
    assert.ok(Number.isSafeInteger(item.tick) && item.tick>=0 && item.tick<=maximum, 'Invalid observed tick');
  }
  assert.equal(after.load,before.load,'Background observation crossed documents');
  assert.equal(after.timeOrigin,before.timeOrigin,'Background observation clock changed');
  assert.equal(after.run,before.run,'Background observation crossed runs');
  assert.ok(after.t>=before.t,'Observation clock moved backward');
}
function nativeIntervalEvents(kind,before,after,events) {
  assert.ok(['blur','hidden'].includes(kind),'Unknown background interval');
  const admitted=events.filter(e=>e.load===before.load && e.timeOrigin===before.timeOrigin && e.t>=before.t && e.t<=after.t);
  assert.ok(admitted.some(e=>kind==='blur' ? e.kind==='blur' && !e.hidden && !e.focused :
    e.kind==='visibilitychange' && e.hidden && !e.focused), 'Missing separate native background focus/visibility event');
  assert.ok(admitted.some(e=>!e.hidden && e.focused && ['focus','visibilitychange'].includes(e.kind)),
    'Missing native foreground recovery event');
}
function elapsedTicks(before,after) {
  sameDocument(before,after);
  if(isWaveObservation(before) || isWaveObservation(after))return validateAdmittedClock(before,after);
  const expected=(after.t-before.t)/50, actual=after.tick-before.tick;
  // Fractional carry at two observed fixed-step boundaries is below one tick.
  assert.ok(actual>0 && Math.abs(actual-expected)<=1.01, 'Background elapsed tick reconciliation differs');
  assert.ok(!after.paused && !after.catchingUp,'Background continuation paused or retained unresolved debt');
  assert.ok(Number.isInteger(after.callbackSteps) && after.callbackSteps>=0 && after.callbackSteps<=128,
    'Background callback step budget exceeded');
}
function isWaveObservation(item){return Number.isInteger(item?.wave) && item.wave>0 || /^last-stand-waves-v[12]:/.test(item?.rules??'');}
export function validateAdmittedClock(before,after) {
  sameDocument(before,after);
  for(const item of [before,after]){
    assert.match(item.rules??'',/^last-stand-waves-v[12]:/);assert.ok(Number.isInteger(item.wave) && item.wave>0);
    assert.equal(item.scope,'healthy');assert.equal(item.status,'Running');
    assert.equal(item.paused,false);assert.equal(item.catchingUp,false);assert.equal(item.failed,false);
    assert.equal(item.selectedSpeed,1);assert.equal(item.effectiveSpeed,1);
    assert.ok(Number.isFinite(item.clockTimestamp) && item.clockTimestamp>=0 &&
      Number.isFinite(item.clockPending) && item.clockPending>=0 && item.clockPending<.05,
      'Active wave observation requires its actual admitted clock and sub-step carry');
    assert.ok(Number.isInteger(item.callbackSteps) && item.callbackSteps>=0 && item.callbackSteps<=128,
      'Background callback step budget exceeded');
  }
  assert.equal(after.rules,before.rules);
  const elapsed=after.clockTimestamp-before.clockTimestamp,ticks=after.tick-before.tick;
  assert.ok(elapsed>0 && ticks>0 && Math.abs(ticks*.05-(elapsed+before.clockPending-after.clockPending))<=1e-6,
    'Admitted elapsed time, fixed ticks and retained carry differ');
  return {basis:'admitted-clock/v1',elapsed_ms:elapsed*1000,ticks,initial_carry:before.clockPending,final_carry:after.clockPending};
}
export function waveIntervalEvents(before,after,events) {
  return events.filter(item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    item.globalTarget===true && ['blur','focus','visibilitychange'].includes(item.kind) && item.t>=before.t && item.t<=after.t);
}
const MODEL_FIELDS=['tick','hp','kills','spawned','cannon','launcher','healed','closeHits','rangedHits','alive','status'];
export function validateModelObservation(observed,oracle) {
  assert.ok(oracle && Object.hasOwn(oracle,observed.tick),'Source-bound model oracle tick absent');
  const expected=oracle[observed.tick];
  if(expected.rulesVersion){
    assert.ok(observed.rules?.startsWith(expected.rulesVersion+':'),'Source oracle rules differ');
    assert.equal(observed.contentVersion,expected.contentVersion,'Source oracle content differs');
    assert.equal(observed.economyVersion,expected.economyVersion,'Source oracle economy differs');
    for(const key of ['mortarDamage','railgunDamage'])assert.equal(observed[key],expected[key],'Source oracle effect differs: '+key);
  }
  for(const key of MODEL_FIELDS)assert.equal(observed[key],expected[key],'Source-bound model '+key+' differs');
  if(Object.hasOwn(expected,'mortar'))for(const key of ['scattergun','mortar','railgun'])
    assert.equal(observed[key],expected[key],'Source-bound armament '+key+' differs');
  if(Object.hasOwn(expected,'wave'))for(const key of ['wave','completedWave'])
    assert.equal(observed[key],expected[key],'Source-bound wave '+key+' differs');
}
const sameDeploymentDocument=(item,deployed)=>item.load===deployed.load && item.timeOrigin===deployed.timeOrigin && item.scope===deployed.scope;
function cannonDeployment(deployed,encounters,oracle){
  assert.ok(Number.isSafeInteger(deployed.load) && deployed.load>0 && Number.isFinite(deployed.timeOrigin) && deployed.timeOrigin>0 &&
    Number.isFinite(deployed.t) && deployed.t>=0 && deployed.scope==='healthy' &&
    Number.isSafeInteger(deployed.runId) && Number.isSafeInteger(deployed.sessionRun),
    'Cannon proof requires explicit current document, scope and run identities');
  assert.ok(deployed.action==='deploy' && deployed.phase==='battle' && deployed.saveState==='ready' &&
    ['last-stand-waves-v1','last-stand-waves-v2'].includes(deployed.profileVersion) && deployed.runId>0 && deployed.sessionRun>0 && deployed.tick===0 &&
    deployed.activeTier===1 && deployed.fittingId==='repair' && [20,30].includes(deployed.cannonDamage),
    'First cannon proof requires its actual current repair deployment');
  const models=encounters.filter(item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun && item.action==='deploy');
  assert.ok(models.length===1 && models[0].t<=deployed.t && models[0].tick===0 && models[0].fitting==='repair' &&
    models[0].rules.startsWith(deployed.profileVersion+':'),'First cannon proof requires its raw same-run model deployment');
  validateModelObservation(models[0],oracle);
}
function cannonCallback(item,deployed,records){
  const group=records.filter(row=>sameDeploymentDocument(row,deployed) && row.run===deployed.sessionRun && row.id===item.id);
  const starts=group.filter(row=>row.action==='begin'),ends=group.filter(row=>row.action==='end');
  assert.ok(starts.length===1 && ends.length===1,'Cannon evidence requires one complete actual callback');
  const begin=starts[0],end=ends[0];
  assert.ok(Number.isSafeInteger(begin.id) && begin.id>0 && Number.isSafeInteger(begin.fromTick) && begin.fromTick>=0,
    'Cannon callback requires its actual positive identity and integral tick');
  assert.ok([begin,end].every(row=>['t','timestamp','previousTimestamp','elapsed','priorPending','pending'].every(key=>
    Number.isFinite(row[key]) && row[key]>=0) && row.timestamp>=row.previousTimestamp &&
    Math.abs(row.elapsed-(row.timestamp-row.previousTimestamp))<=1e-9) &&
    begin.priorPending===end.priorPending,'Cannon callback clocks and retained carry must be finite, monotonic and consistent');
  assert.ok(begin.t>=deployed.t && begin.t<=item.t && item.t<=end.t && begin.fromTick===end.fromTick &&
    begin.tick===begin.fromTick && end.tick===begin.fromTick+end.steps && Number.isInteger(end.steps) && end.steps>0 && end.steps<=128 &&
    begin.fromTick<item.tick && item.tick<=end.tick && begin.timestamp===end.timestamp &&
    begin.previousTimestamp===end.previousTimestamp,'Cannon evidence must belong to its actual bounded run callback');
  return {begin,end,group};
}
export async function observeFirstCannonImpact({deployed,start,hits,encounters,callbackRecords,oracle,until}){
  cannonDeployment(deployed,encounters,oracle);
  const expected=Object.values(oracle).find(row=>row.cannon>0);
  assert.ok(expected?.cannon===1 && oracle[expected.tick-1]?.cannon===0,'First cannon event absent from source-bound oracle');
  const hit=await until(hits,start,item=>sameDeploymentDocument(item,deployed) && item.t>=deployed.t,45);
  assert.ok(hit.tick===expected.tick && hit.cannonDamage===deployed.cannonDamage && hit.kills===expected.kills &&
    hit.firstFoeHull===Math.max(0,30-deployed.cannonDamage),'First authoritative cannon impact differs from deployment/oracle');
  await until(callbackRecords,0,item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun &&
    item.action==='end' && item.t>=hit.t && item.fromTick<hit.tick && item.tick>=hit.tick,8);
  const starts=callbackRecords.filter(item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun &&
    item.action==='begin' && item.t>=deployed.t && item.t<=hit.t && item.fromTick<hit.tick);
  const begin=starts.at(-1);assert.ok(begin,'First impact has no authoritative callback');
  cannonCallback({...hit,id:begin.id},deployed,callbackRecords);
  assert.equal(hits.slice(start).filter(item=>sameDeploymentDocument(item,deployed) && item.t>=deployed.t && item.tick===hit.tick).length,1,
    'First authoritative impact cannot be duplicated');
  return hit;
}
export async function observeFreshCannonAudio({deployed,encounters,callbackRecords,cues,oracle,until}){
  cannonDeployment(deployed,encounters,oracle);
  const current=item=>sameDeploymentDocument(item,deployed) && item.run===deployed.sessionRun && item.t>=deployed.t;
  const cannon=await until(callbackRecords,0,item=>current(item) && item.action==='cue' && item.cue==='cannon' && item.played &&
    callbackRecords.some(next=>current(next) && next.action==='cue' && next.id===item.id && next.tick===item.tick && next.ordinal===item.ordinal+1 && next.played) &&
    callbackRecords.some(end=>current(end) && end.id===item.id && end.action==='end'),45);
  const {begin,end,group}=cannonCallback(cannon,deployed,callbackRecords);
  const a=oracle[cannon.tick-1],b=oracle[cannon.tick];
  assert.ok(a && b && b.cannon-a.cannon===1 && [0,1].includes(b.kills-a.kills),'Played cannon must match an actual oracle event');
  assert.ok(Number.isSafeInteger(cannon.ordinal) && cannon.ordinal>0 &&
    group.filter(item=>item.action==='cue' && item.ordinal===cannon.ordinal).length===1,
    'Played cannon requires one unique identified admission');
  const companion=group.filter(item=>item.action==='cue' && item.ordinal===cannon.ordinal+1);
  assert.equal(companion.length,1,'Played cannon needs one admitted impact/destruction companion');
  const attempts=[cannon,companion[0]],expected=['cannon',b.kills>a.kills?'destruction':'impact'];
  assert.ok(begin.focused && !begin.applicationPaused && !begin.paused && !begin.failed && begin.priorPending<.05 && begin.elapsed<=.5 && end.elapsed<=.5,
    'Fresh cannon sound cannot come from hidden, paused or retained-debt callbacks');
  const events=attempts.map((item,index)=>{
    assert.ok(item.cue===expected[index] && item.played===true && item.reason==='played' && item.tick===cannon.tick && item.fromTick===begin.fromTick &&
      item.timestamp===begin.timestamp && item.previousTimestamp===begin.previousTimestamp && item.steps===item.tick-item.fromTick &&
      item.steps>=1 && item.steps<=10 && item.timestamp-item.previousTimestamp<=.5 && Number.isFinite(item.admittedAt) &&
      item.admittedAt>=item.timestamp && item.admittedAt-item.previousTimestamp<=.5 && item.t>=begin.t && item.t<=end.t,
      'Cannon/impact audio requires its fresh actual playback admission');
    const next=group.filter(row=>row.action==='cue' && row.t>item.t).sort((x,y)=>x.t-y.t)[0];
    const played=cues.filter(row=>sameDeploymentDocument(row,deployed) && row.t>=item.t && row.t<=(next?.t??end.t) &&
      row.text.trim()==='ST_LS_AUDIO event='+item.cue);
    assert.equal(played.length,1,'Each admitted sound requires one actual played-event observation');return played[0];
  });
  assert.ok(cannon.t<=events[0].t && events[0].t<=companion[0].t && companion[0].t<=events[1].t &&
    companion[0].admittedAt>=cannon.admittedAt,'Played cannon and companion must retain actual chronological admission and log order');
  return {begin:Math.max(deployed.t,events[0].t-500),end:events[1].t+750,deployed,callback:{begin,end},attempts,events};
}
export function validateSettlingTransition({before,result,states,layouts,encounters,oracle}) {
  assert.ok(Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) && Number.isFinite(before.t) &&
    before.status==='Running' && !before.paused && !before.failed && !before.catchingUp &&
    before.loop?.phase==='battle' && before.loop.runId>0 && before.loop.wallet===0,
    'Settling requires the actual current unfinished battle');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const {loop,hull,...original}=before;
  assert.deepEqual(encounters.find(item=>current(item) && item.run===before.run && item.t===before.t && item.action===before.action),original,
    'Settling starting observation differs from actual telemetry');
  assert.deepEqual(states.find(item=>current(item) && item.t===loop.t && item.action===loop.action),loop,
    'Settling starting loop differs from actual telemetry');
  validateModelObservation(before,oracle);
  assert.ok(result && current(result) && result.sessionRun===before.run && result.action==='result' &&
    result.phase==='result' && Number.isFinite(result.t) && result.t>before.t && result.runId===0 &&
    result.pendingRunId===loop.runId && result.wallet===0 && result.saveState==='ready',
    'Settling requires one saved pending manual result without an award');
  assert.deepEqual(states.find(item=>current(item) && item.action==='result' && item.t===result.t),result,
    'Settling result differs from actual telemetry');
  const terminals=encounters.filter(item=>current(item) && item.run===before.run && item.action==='terminal' &&
    item.t>=before.t && item.t<result.t);
  assert.equal(terminals.length,1,'Settling requires one actual terminal');const terminal=terminals[0];
  assert.ok(terminal.status==='Defeated' && !terminal.paused && !terminal.failed && !terminal.catchingUp,
    'Settling terminal is not eligible');validateModelObservation(terminal,oracle);
  const interval=states.filter(item=>current(item) && item.t>=terminal.t && item.t<=result.t);
  assert.ok(interval.length && interval.every(item=>item.sessionRun===before.run && item.runId===0 &&
    item.pendingRunId===loop.runId && item.wallet===0 && !['claim','purchase','deploy','redeploy'].includes(item.action)),
    'Settling awarded or performed an automatic action');
  const staged=interval.filter(item=>item.action==='defeat-staged');
  assert.ok(staged.length===1 && staged[0].phase==='settling' && staged[0].tick===terminal.tick,
    'Settling requires unique current-run staging');
  // Layout is emitted just before its staging state. Anchor it to the actual
  // terminal, rather than requiring the opposite log-notification order.
  const observed=layouts.filter(item=>current(item) && item.phase==='settling' && item.t>=terminal.t && item.t<result.t);
  assert.ok(observed.length && observed.every(item=>Array.isArray(item.controls) &&
    item.controls.some(control=>control.name==='Claim') &&
    !item.controls.some(control=>control.name==='Claim' && control.active && control.interactable)) &&
    observed.some(item=>item.controls.some(control=>control.name==='SpeedRate' && control.active && control.interactable)),
    'Settling layout absent or Claim enabled before the manual result');
  return {before,terminal,staged:staged[0],result,layouts:observed};
}
export function validateBackgroundInterval({kind,before,after,events,oracle}) {
  const clock=elapsedTicks(before,after),observedEvents=clock?waveIntervalEvents(before,after,events):events;
  nativeIntervalEvents(kind,before,after,observedEvents);
  assert.equal(before.status,'Running','Background interval must start with an active model');
  assert.equal(after.status,'Running','Use terminal ownership oracle for terminal intervals');
  validateModelObservation(before,oracle);validateModelObservation(after,oracle);
  return {kind,elapsed_ms:after.t-before.t,ticks:after.tick-before.tick,events:observedEvents,...(clock?{clock,before,after}:{})};
}
export function validateExplicitPause({before,paused,returned,resumed,after,events,oracle}) {
  sameDocument(before,paused);sameDocument(paused,returned);sameDocument(returned,resumed);
  assert.ok(paused.paused && returned.paused && paused.reason==='user' && returned.reason==='user',
    'Explicit Pause changed on foreground return');
  assert.ok(returned.t-paused.t>=10000,'Explicit Pause requires ten seconds away');
  for(const key of ['tick','hull','kills','terminalElapsed']) {
    assert.equal(returned[key],paused[key],'Explicit Pause changed '+key);
    assert.equal(resumed[key],paused[key],'Resume counted paused '+key);
  }
  // Unity can acknowledge focus while the tab is still hidden. The frozen
  // paused model sample need not follow visibility, but actual visible return
  // must precede the user's measured Resume. Counters stay bound above.
  const clock=elapsedTicks(resumed,after),observedEvents=clock?waveIntervalEvents(paused,resumed,events):events;
  nativeIntervalEvents('hidden',paused,resumed,observedEvents);
  if(clock)for(const item of [paused,returned,resumed]){
    assert.equal(item.scope,resumed.scope);assert.equal(item.rules,resumed.rules);
    assert.ok(Number.isFinite(item.clockTimestamp) && item.clockTimestamp>=paused.clockTimestamp && item.clockTimestamp<=resumed.clockTimestamp);
    assert.equal(item.clockPending,resumed.clockPending,'Pause and Resume preserve the admitted fractional carry');
  }
  validateModelObservation(paused,oracle);validateModelObservation(after,oracle);
  return {paused_ms:resumed.t-paused.t,resumed_ticks:after.tick-resumed.tick,...(clock?{clock,before,paused,returned,resumed,after,events:observedEvents}:{})};
}
export function validateTerminalOwnership({runId,beforeWallet,states,pending,claimed,controls}) {
  assert.ok(Number.isInteger(runId) && runId>0,'Terminal run identity absent');
  const staged=states.filter(s=>s.action==='defeat-staged'),result=states.filter(s=>s.action==='result'),claims=states.filter(s=>s.action==='claim');
  assert.equal(staged.length,1,'Duplicate or missing terminal staging');
  assert.equal(result.length,1,'Duplicate or missing terminal result');
  assert.equal(claims.length,1,'Duplicate or missing manual Claim');
  assert.ok(states.indexOf(staged[0])<states.indexOf(result[0]) && states.indexOf(result[0])<states.indexOf(claims[0]),
    'Terminal/Claim ordering differs');
  for(const s of states.filter(s=>states.indexOf(s)<states.indexOf(claims[0]))) {
    assert.equal(s.wallet,beforeWallet,'Premature terminal award');
    assert.equal(s.pendingRunId,runId,'Terminal pending identity changed');
    assert.equal(s.saveState,'ready','Terminal persistence not ready');
  }
  assert.equal(pending?.pendingDefeat?.runId,runId,'Persisted pending run differs');
  assert.equal(pending.pendingDefeat.reward,1,'Persisted terminal reward differs');
  assert.equal(claims[0].wallet,beforeWallet+1,'Manual Claim wallet differs');
  assert.equal(claims[0].pendingRunId,0,'Claim left a pending award');
  assert.equal(claims[0].saveState,'ready','Claim persistence not ready');
  assert.equal(claimed?.credits,beforeWallet+1,'Persisted Claim wallet differs');
  assert.ok(!claimed.pendingDefeat,'Claim persisted a repeated award');
  assert.ok(!controls.some(c=>c.name==='Claim' && c.active && c.interactable),'Repeated Claim remains available');
  assert.ok(!states.some(s=>['deploy','purchase'].includes(s.action)),'Automatic terminal action');
  return {runId,staging:staged.length,results:result.length,claims:claims.length};
}
export function validateNoReplayAudio({energy,cues}) {
  assert.ok(Number.isInteger(energy?.samples) && energy.samples>=5,'Empty or insufficient rendered audio evidence');
  assert.ok(Number.isFinite(energy.maximum_rms) && energy.maximum_rms>=0 && energy.maximum_rms<.0005,
    'Rendered background/return audio must be silent without replay');
  assert.ok(Array.isArray(cues) && cues.length===0,'Background/return replay cue observed');
  return energy;
}

// A native return can precede its bookkeeping mark by several fresh model
// callbacks. Admit those cues only against the current source-bound model;
// the real away span and the gap before the first eligible cue remain silent.
export function validateAwayAudioReturn({kind,before,begin,recovered,ms,events,cues,states,encounters,callbackRecords,oracle}) {
  assert.ok(['blur','hidden'].includes(kind) && Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) &&
    [before.t,begin,recovered,ms].every(Number.isFinite) && ms>0 && before.t<=begin && begin<recovered,
    'Invalid native audio interval identity/clock');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const global=events.filter(e=>current(e) && e.globalTarget===true && ['blur','focus','visibilitychange'].includes(e.kind));
  assert.ok(global.every(e=>Number.isFinite(e.t) && typeof e.hidden==='boolean' && typeof e.focused==='boolean'),
    'Invalid global native audio event');
  const loss=global.find(e=>before.t<=e.t && e.t<=begin && !e.focused &&
    (kind==='blur'?e.kind==='blur' && !e.hidden:e.kind==='visibilitychange' && e.hidden));
  let returned,modelFocusReturn;
  if(loss && kind==='blur')returned=global.find(e=>e.t>loss.t && e.t<=recovered && e.kind==='focus' && e.focused && !e.hidden);
  if(loss && kind==='hidden'){
    // Browser focus and visibility notifications may arrive in either order.
    // Require both genuine global witnesses, then their coherent completion.
    const eligible=global.filter(e=>e.t>loss.t && e.t<=recovered);
    const focus=eligible.find(e=>e.kind==='focus' && e.focused),visible=eligible.find(e=>e.kind==='visibilitychange' && !e.hidden);
    if(focus && visible)returned=eligible.find(e=>e.t>=Math.max(focus.t,visible.t) && e.focused && !e.hidden);
  }
  assert.ok(loss && returned,'Current global native audio loss/return boundary absent');
  // Unity may acknowledge focus while the document is still hidden. Only the
  // model boundary uses that actual focus; cues still wait for visible return.
  modelFocusReturn=kind==='blur'?returned:global.findLast(e=>e.t>loss.t && e.t<=returned.t && e.kind==='focus' && e.focused);
  assert.ok(modelFocusReturn && !global.some(e=>e.t>modelFocusReturn.t && e.t<=returned.t && !e.focused),
    'Current uninterrupted native focus boundary absent');
  assert.ok(returned.t-loss.t>=ms,'Actual native unfocused audio span is shorter than the declared interval');
  const observed=cues.filter(c=>current(c) && c.t>=loss.t+200 && c.t<=recovered);
  assert.ok(observed.every(c=>Number.isFinite(c.t)),'Invalid current audio cue clock');
  const returnCues=observed.filter(c=>c.t>=returned.t),callbacks=[];
  const waveRun=['last-stand-waves-v1','last-stand-waves-v2'].includes(before.loop?.profileVersion);
  // The current controller retains its wave profile after ReturnToInspection
  // removes the model. Its finalized result has explicit absent-clock/run fields;
  // it is a silent lifecycle boundary, never an archived combat callback lane.
  const idleModel=item=>current(item) && item.run===before.run && item.status==='Fitting' &&
    item.rules==='playable-prototype-v1' && item.tick===0 && item.wave===0 && item.completedWave===0 &&
    item.locked===false && item.clockTimestamp===-1 && item.clockPending===-1 && item.callbackSteps===0 &&
    item.paused===false && item.failed===false && item.catchingUp===false;
  const idleLoop=(item,phase)=>current(item) && item.sessionRun===before.run && item.profileVersion===before.loop.profileVersion &&
    item.phase===phase && item.saveState==='ready' && item.runId===0 && item.pendingRunId===0 &&
    item.activeTier===0 && item.hasCheckpoint===false && item.tick===0 && item.wave===0 && item.completedWave===0;
  const idleWaveResult=waveRun && idleModel(before) && idleLoop(before.loop,'result') && before.loop.t>=before.t;
  assert.equal(waveRun,typeof before.rules==='string' && /^last-stand-waves-v[12]:/.test(before.rules) || idleWaveResult,
    'Native audio interval wave profile and model rules disagree');
  if(idleWaveResult){
    const during=item=>current(item) && item.t>=before.t && item.t<=recovered;
    const {loop,hull,...model}=before;
    assert.deepEqual(encounters.find(item=>current(item) && item.run===before.run && item.t===before.t && item.action===before.action),model,
      'Idle interval requires its actual model observation');
    assert.deepEqual(states.find(item=>current(item) && item.t===loop.t && item.action===loop.action),loop,
      'Idle interval requires its actual paired result observation');
    const results=states.filter(item=>current(item) && item.sessionRun===before.run && item.action==='result' && item.t<=recovered);
    assert.ok(results.length===1 && idleLoop(results[0],'result') && Number.isFinite(results[0].t) &&
      results[0].t<=loop.t && loop.t<=loss.t,'Idle interval requires the first raw finalized result before native loss');
    const finalized=results[0];
    // ReturnToInspection emits its cleared model and synchronous session HUD
    // before the controller publishes result. Retain and prove that prefix;
    // a later research refresh must not hide any subsequent activity.
    const idleState=item=>item.t<finalized.t ? item.action==='session' && idleLoop(item,'settling') &&
      item.hull===model.hp && item.kills===0 && item.paused===false : idleLoop(item,'result');
    assert.ok(Array.isArray(callbackRecords) && !callbackRecords.some(during) && !cues.some(during) &&
      encounters.filter(during).every(idleModel) && states.filter(during).every(idleState),
      'Finalized idle result cannot admit combat callbacks, cues or an active lifecycle');
  }
  const attempts=waveRun?(callbackRecords??[]).filter(c=>current(c) && c.action==='cue' && c.t>=returned.t && c.t<=recovered):[];
  const observations=waveRun?attempts:returnCues;
  const playedByAttempt=new Map();
  if(waveRun){
    // A fully omitted silent group must not erase model events. Only fresh,
    // foreground, non-indebted callbacks with an unmuted source state qualify
    // for this obligation; old background debt is still deliberately discarded.
    for(const begin of (callbackRecords??[]).filter(c=>current(c) && c.run===before.run && c.action==='begin' &&
      c.t>=returned.t && c.t<=recovered && c.focused===true && c.applicationPaused===false && c.paused===false &&
      c.failed===false && c.elapsed>=0 && c.elapsed<=.5 && c.priorPending>=0 && c.priorPending<.05)){
      const end=callbackRecords.find(c=>current(c) && c.run===begin.run && c.id===begin.id && c.action==='end' && c.t<=recovered);
      const prior=states.findLast(c=>current(c) && c.sessionRun===begin.run && c.tick===begin.fromTick && c.t<=begin.t);
      const a=oracle[begin.fromTick],b=oracle[end?.tick];
      if(end && end.steps>0 && end.steps<=10 && prior?.phase==='battle' && prior.muted===false && prior.saveState==='ready' && a && b &&
        (b.cannon>a.cannon || b.launcher>a.launcher || (b.scattergun??0)>(a.scattergun??0) ||
         b.closeHits>a.closeHits || b.rangedHits>a.rangedHits || b.status==='Defeated'))
        assert.ok(attempts.some(c=>c.id===begin.id && c.run===begin.run),'Current-wave model callback is missing all cue decisions');
    }
    const played=attempts.filter(c=>c.played===true);
    assert.equal(played.length,returnCues.length,'Current-wave playback requires one exact cue decision per played line');
    for(const [i,attempt] of played.entries()){
      const cue=returnCues[i],next=attempts[attempts.indexOf(attempt)+1];
      assert.ok(cue.text.match(/^ST_LS_AUDIO event=(\w+)\s*$/)?.[1]===attempt.cue && cue.t>=attempt.t &&
        (!next || cue.t<=next.t),'Played cue order/name differs from its playback decision');
      playedByAttempt.set(attempt,cue);
    }
  }
  if(observations.length) {
    const resumed=encounters.find(e=>current(e) && e.run===before.run && e.action==='visibility' &&
      e.t>=modelFocusReturn.t && e.t<=observations[0].t && e.focused && !e.applicationPaused);
    assert.ok(resumed && !resumed.paused && !resumed.failed && !resumed.catchingUp,
      'Current reconciled foreground model boundary absent');
    validateModelObservation(resumed,oracle);
    const finalizedWave=s=>s.runId===0 && s.pendingRunId===0 && s.hasCheckpoint===false &&
      s.profileVersion===before.loop.profileVersion && s.activeTier===before.loop.activeTier && s.fittingId===before.fitting;
    if(waveRun)assert.ok(before.wave>0 && before.rules?.startsWith(before.loop.profileVersion+':') && resumed.rules===before.rules,
      'Current wave callback requires its exact model profile');
    const runLoops=states.filter(s=>current(s) && s.sessionRun===before.run &&
      (waveRun && s.action==='defeat-staged'?finalizedWave(s):(s.runId || s.pendingRunId)===before.loop.runId) && s.t<=recovered &&
      ['session','defeat-staged'].includes(s.action));
    const loops=runLoops.filter(s=>s.t>=resumed.t);
    assert.ok(Array.isArray(callbackRecords),'Return cues require actual callback admission records');
    const records=callbackRecords.filter(c=>current(c) && c.run===before.run && c.t<=recovered);
    const groups=new Map();
    for(const cue of observations) {
      const admitted=records.findLast(c=>c.action==='begin' && c.t<=cue.t && (!waveRun || c.id===cue.id));
      const ends=admitted?records.filter(c=>c.action==='end' && c.id===admitted.id):[];
      const completed=ends[0];
      assert.ok(admitted && completed && ends.length===1 && Number.isInteger(admitted.id) && admitted.id>0 &&
        records.filter(c=>c.action==='begin' && c.id===admitted.id).length===1 &&
        admitted.t>=returned.t && completed.t>=cue.t && completed.t>=admitted.t &&
        !records.some(c=>c.action==='begin' && c.t>admitted.t && c.t<completed.t),
        'Return cue lacks a unique current foreground callback');
      for(const key of ['fromTick','timestamp','previousTimestamp','elapsed','priorPending','speed'])
        assert.equal(completed[key],admitted[key],'Callback admission changed: '+key);
      assert.ok([admitted.t,completed.t,admitted.timestamp,admitted.previousTimestamp,admitted.elapsed,
        admitted.priorPending,admitted.pending,completed.pending,admitted.speed,admitted.age,completed.age].every(Number.isFinite) &&
        admitted.previousTimestamp>=0 && admitted.elapsed>=0 && admitted.elapsed<=.5 && admitted.age>=0 && completed.age>=admitted.age &&
        Math.abs(admitted.timestamp-admitted.previousTimestamp-admitted.elapsed)<1e-7 &&
        admitted.priorPending>=0 && admitted.priorPending<.05 && admitted.speed>0 &&
        admitted.pending>0 && admitted.pending<=admitted.priorPending+admitted.elapsed*admitted.speed+1e-7 &&
        completed.pending>=0 && (completed.pending<.05 || oracle[completed.tick]?.status==='Defeated') &&
        Number.isInteger(admitted.fromTick) && admitted.fromTick>=resumed.tick && admitted.tick===admitted.fromTick && admitted.steps===0 &&
        Number.isInteger(completed.steps) && completed.steps>0 && completed.steps<=10 &&
        completed.tick===admitted.fromTick+completed.steps &&
        Math.abs(admitted.pending-completed.pending-completed.steps*.05)<1e-7 &&
        (waveRun || (admitted.elapsed+admitted.age)*1000+cue.t-admitted.t<=500) &&
        [admitted,completed].every(c=>c.focused===true && c.applicationPaused===false && c.paused===false && c.failed===false),
        'Return cue lacks a fresh eligible foreground model callback');
      const previous=runLoops.findLast(s=>s.tick===admitted.fromTick && s.t<=admitted.t);
      const next=loops.find(s=>s.tick===completed.tick && s.t>=cue.t && s.t<=completed.t);
      const terminals=next?.action==='defeat-staged' && previous?encounters.filter(e=>current(e) &&
        e.run===before.run && e.action==='terminal' && e.tick===next.tick && e.t>admitted.t && e.t<=next.t):[];
      const terminal=terminals[0];
      assert.ok(next && previous && next.tick>previous.tick && previous.tick>=resumed.tick &&
        previous.phase==='battle' && !previous.paused && !previous.muted && previous.saveState==='ready' &&
        previous.cannonDamage===before.loop.cannonDamage && previous.hull===oracle[previous.tick]?.hp &&
        previous.kills===oracle[previous.tick]?.kills &&
        (next.phase==='battle' || terminal && next.phase==='settling') && !next.paused && !next.muted && next.saveState==='ready' &&
        next.cannonDamage===before.loop.cannonDamage,
        'Return callback lacks current source-bound before/after model states');
      if(terminal) {
        // AdvanceAt retains elapsed after the final combat step. Wave runs
        // finalize before PlayDefeat; archived runs retain PendingDefeat.
        assert.ok(terminals.length===1 && previous.phase==='battle' && oracle[previous.tick]?.status==='Running' &&
          terminal.status==='Defeated' && terminal.focused && !terminal.applicationPaused && !terminal.paused &&
          !terminal.failed && !terminal.catchingUp && Number.isFinite(terminal.terminalElapsed) &&
          terminal.terminalElapsed>=0 && terminal.terminalElapsed<=.48 &&
          Number.isInteger(terminal.callbackSteps) && terminal.callbackSteps>0 && terminal.callbackSteps<=128 &&
          terminal.callbackSteps===next.tick-previous.tick && next.runId===0 && before.loop.runId>0 &&
          (waveRun?finalizedWave(next) && terminal.rules===before.rules && terminal.wave>0:next.pendingRunId===before.loop.runId) &&
          loops.filter(s=>s.action==='defeat-staged' && s.tick===next.tick).length===1,
          'Return defeat lacks a unique current eligible terminal/staging transition');
        validateModelObservation(terminal,oracle);
      }
      const admission=encounters.findLast(e=>current(e) && e.run===before.run && e.t<=cue.t);
      assert.ok(admission?.focused && !admission.applicationPaused && !admission.paused && !admission.failed &&
        !admission.catchingUp,'Background/catch-up return cue observed');
      assert.ok(oracle[next.tick] && next.hull===oracle[next.tick].hp && next.kills===oracle[next.tick].kills,
        'Return callback differs from current source-bound model');
      const group=groups.get(admitted)??{previous,next,terminal,admitted,completed,cues:[],attempts:[]};
      if(waveRun){
        assert.ok(cue.run===before.run && Number.isInteger(cue.ordinal) && cue.ordinal===group.attempts.length+1 &&
          (!cue.played || playedByAttempt.get(cue)?.t<=completed.t) &&
          cue.fromTick===admitted.fromTick && cue.timestamp===admitted.timestamp && cue.previousTimestamp===admitted.previousTimestamp &&
          Number.isInteger(cue.tick) && cue.tick>admitted.fromTick && cue.tick<=completed.tick &&
          Number.isInteger(cue.steps) && cue.steps===cue.tick-admitted.fromTick &&
          (!group.attempts.length || cue.tick>=group.attempts.at(-1).tick && cue.t>=group.attempts.at(-1).t) &&
          Number.isFinite(cue.admittedAt) && cue.admittedAt>=0 && cue.admittedAt>=admitted.timestamp+admitted.age &&
          cue.admittedAt<=completed.timestamp+completed.age &&
          (!group.attempts.length || cue.admittedAt>=group.attempts.at(-1).admittedAt) &&
          (cue.played===true && cue.reason==='played' && cue.admittedAt-cue.previousTimestamp<=.5 ||
           cue.played===false && cue.reason==='expired' && cue.admittedAt-cue.previousTimestamp>.5),
          'Invalid, stale or foreign current-wave cue decision');
        group.attempts.push(cue);if(cue.played)group.cues.push(playedByAttempt.get(cue));
      }else group.cues.push(cue);
      groups.set(admitted,group);
    }
    for(const {previous,next,terminal,admitted,completed,cues:actual,attempts:decisions} of groups.values()) {
      const expected=[];
      for(let tick=previous.tick+1;tick<=next.tick;tick++) {
        const a=oracle[tick-1],b=oracle[tick];assert.ok(a && b,'Return model event tick absent');
        const cannon=b.cannon-a.cannon,weapons=cannon+b.launcher-a.launcher,killed=b.kills-a.kills;
        assert.ok(cannon>=0 && weapons>=killed && killed>=0,'Invalid source-bound return model event counters');
        const tickNames=[...Array(cannon).fill('cannon'),...Array(killed).fill('destruction'),
          ...Array(weapons-killed+b.closeHits-a.closeHits+b.rangedHits-a.rangedHits).fill('impact')];
        if(waveRun){
          // This maintained return lane qualifies repair/launcher model counters.
          // A burst oracle must expose individual target events before it can qualify Scattergun audio.
          assert.equal((b.scattergun??0)-(a.scattergun??0),0,'Return cue oracle lacks individual Scattergun target events');
          const witnessed=decisions.filter(c=>c.tick===tick && c.cue!=='defeat').map(c=>c.cue);
          assert.deepEqual(witnessed.sort(),[...tickNames].sort(),'Cue decision differs from its exact model tick');
        }
        expected.push(...tickNames);
      }
      const names=waveRun?decisions.map(c=>c.cue):actual.map(c=>c.text.match(/^ST_LS_AUDIO event=(\w+)\s*$/)?.[1]);
      const ordered=waveRun?decisions:actual;
      if(terminal) {
        assert.ok(names.at(-1)==='defeat' && ordered.at(-1).t>=terminal.t &&
          ordered.slice(0,-1).every(c=>c.t<=terminal.t), 'Return terminal cue ordering differs');
        expected.push('defeat');
      }
      assert.deepEqual(names.sort(),expected.sort(),'Unmatched, stale or duplicate background/return replay cue');
      callbacks.push({from:previous.tick,to:next.tick,t:next.t,admitted,completed,cues:actual,...(waveRun?{attempts:decisions}:{})});
    }
  }
  const end=returnCues[0]?.t??recovered;
  return {begin:loss.t+200,end,cues:observed.filter(c=>c.t<end || !returnCues.length),
    boundary:{kind,loss,returned,model_focus_return:modelFocusReturn,bookkeeping_recovered:recovered,unfocused_ms:returned.t-loss.t,callbacks}};
}

// Compile the unchanged deterministic owner, rather than maintaining a second
// JavaScript simulation. The ordinary evidence binds exact source/tool bytes.
export function encounterOraclePackage() { return structuredClone(ENCOUNTER_ORACLE_PACKAGE); }
const ENCOUNTER_UTF8_BOM=Buffer.from([0xef,0xbb,0xbf]);
let currentEncounterQualification;
let qualifyingCurrentEncounter=false;
export function encounterOracleToolchain(platform=process.platform) {
  assert.ok(['win32','linux'].includes(platform),'Current model compilation requires Windows or Linux');
  if(platform==='linux')return {mono:'/usr/bin/mono',csc:'/usr/lib/mono/4.5/mcs.exe'};
  const editor='C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Data/MonoBleedingEdge';
  return {mono:join(editor,'bin/mono.exe'),csc:join(editor,'lib/mono/msbuild/Current/bin/Roslyn/csc.exe')};
}
function qualifyCurrentEncounterSource(sources) {
  assert.deepEqual(Object.keys(sources),ENCOUNTER_COMPILATION_SOURCES,'Current model compilation source closure differs');
  const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const receiptPath=join(ROOT,manifest.source.receipt);
  const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
  const lockPath=join(ROOT,'campaign-unity/docs/last-stand-web/source-lock.json');
  assert.equal(fileHash(receiptPath),manifest.source.receiptSha256,'Current model export receipt binding differs');
  assert.equal(fileHash(lockPath),manifest.source.sourceLockSha256,'Current model export source lock differs');
  assert.ok(receipt.complete && receipt.status==='pass' && receipt.build===manifest.source.build &&
    receipt.sourceBeforeSha256===receipt.sourceAfterSha256 &&
    receipt.sourceAfterSha256===manifest.source.sourceInventorySha256,'Current model export is incomplete');
  for(const [name,sha] of Object.entries(sources))assert.deepEqual(
    receipt.sourceFiles[`Unity/Assets/Scripts/${name}`],{mode:'lf-text',sha256:sha},'Current model absent from genuine export');
  const tools=Object.fromEntries(Object.values(encounterOracleToolchain()).map(path=>[path,fileHash(path)]));
  const identity={sources:{...sources},tools,manifest_sha256:fileHash(manifestPath),receipt_sha256:fileHash(receiptPath),source_lock_sha256:fileHash(lockPath)};
  if(currentEncounterQualification) {
    assert.deepEqual(identity,currentEncounterQualification.identity,'Qualified current model inputs drifted');return;
  }
  // Re-enter the existing compiler with the immutable historical reference as
  // the comparison provenance. Its actual source/tool inputs remain current.
  if(qualifyingCurrentEncounter)return;
  const parent=admitEvidenceParent();
  const output=join(parent,`current-model-qualification-${randomUUID()}`);mkdirSync(output);
  qualifyingCurrentEncounter=true;
  try {
    buildEncounterOracle(output);
    const binding=JSON.parse(readFileSync(join(output,'model-oracle/binding.json'),'utf8'));
    assert.ok(binding.fresh_host_compilation && binding.comparison.rows===13904 && binding.comparison.fields_per_row===13,
      'Current model complete historical baseline parity absent');
    writeFileSync(join(output,'current-source-admission.json'),JSON.stringify({identity,
      export_build:receipt.build,source_inventory_sha256:receipt.sourceAfterSha256,
      export_toolchain:receipt.toolchain,compiler_tools_separate_from_export_toolchain:true,
      baseline:binding.comparison,qualification:'actual current-source compilation and full immutable baseline parity'},null,2));
    currentEncounterQualification={identity,output};
  } finally {qualifyingCurrentEncounter=false;}
}
function canonicalEncounterCsv(raw) {
  assert.ok(Buffer.isBuffer(raw),'Actual model CSV must be raw UTF-8 bytes');
  return raw.subarray(raw.subarray(0,3).equals(ENCOUNTER_UTF8_BOM)?3:0);
}
function readEncounterReferenceBytes(bundle,sourceHashes) {
  assert.equal(bundle.format,'st-last-stand-actual-model-oracle/1','Unknown model reference format');
  const sources=sourceHashes??Object.fromEntries(Object.keys(bundle.source_lf_sha256).map(name=>[name,
    hash(readFileSync(join(ROOT,'campaign-unity/Unity/Assets/Scripts',name),'utf8').replace(/\r\n/g,'\n'))]));
  if(sourceHashes===undefined) {
    assert.deepEqual(bundle,ENCOUNTER_ORACLE_PACKAGE,'Historical model reference package changed');
    qualifyCurrentEncounterSource(encounterCompilationSourceBinding().source_lf_sha256);
    Object.assign(sources,bundle.source_lf_sha256);
  }
  assert.deepEqual(sources,bundle.source_lf_sha256,'Model reference/source binding differs');
  const raw=gunzipSync(Buffer.from(bundle.gzip_base64,'base64'));
  assert.equal(hash(raw),bundle.output_sha256,'Compiled model reference bytes differ');
  return raw;
}
function parseEncounterCsv(raw) {
  const text=canonicalEncounterCsv(raw).toString('utf8');
  assert.ok(text.endsWith('\r\n'),'Actual model CSV final CRLF absent');
  const profiles={};
  for(const line of text.slice(0,-2).split('\r\n')) {
    const [fitting,damage,...values]=line.split(','),status=values.pop(),numbers=values.map(Number);
    assert.ok(['repair','launcher'].includes(fitting) && ['20','30','40','50'].includes(damage) && numbers.length===10 &&
      values.every(v=>/^(?:0|[1-9]\d*)$/.test(v)) && numbers.every(Number.isSafeInteger) &&
      ['Running','Defeated','Limit'].includes(status),'Malformed actual model reference');
    const [tick,hp,kills,spawned,cannon,launcher,healed,closeHits,rangedHits,alive]=numbers;
    const profile=profiles[`${fitting}:${damage}`]??={};assert.ok(!Object.hasOwn(profile,tick),'Duplicate model reference tick');
    assert.equal(tick,Object.keys(profile).length,'Missing model reference tick');
    profile[tick]={tick,hp,kills,spawned,cannon,launcher,healed,closeHits,rangedHits,alive,status};
  }
  assert.equal(Object.keys(profiles).length,8,'Incomplete actual model reference');return profiles;
}
export function readBoundEncounterOracle(bundle=ENCOUNTER_ORACLE_PACKAGE,sourceHashes) {
  return parseEncounterCsv(readEncounterReferenceBytes(bundle,sourceHashes));
}
// One serialization admission boundary for both the real compiled caller and
// deterministic encoding fixtures. Preserve raw reference/output provenance;
// only one optional leading UTF-8 BOM is excluded from exact byte comparison.
export function admitEncounterOracleOutput(raw,bundle=ENCOUNTER_ORACLE_PACKAGE,sourceHashes) {
  const reference=readEncounterReferenceBytes(bundle,sourceHashes);
  const expected=canonicalEncounterCsv(reference),actual=canonicalEncounterCsv(raw);
  assert.ok(actual.equals(expected),'Fresh actual model CSV bytes differ from portable reference after optional UTF-8 BOM');
  const profiles=parseEncounterCsv(raw),bound=parseEncounterCsv(reference);
  assert.deepEqual(profiles,bound,'Fresh actual model differs from portable reference');
  const bytes=buffer=>({raw_sha256:hash(buffer),bytes:buffer.length,
    leading_utf8_bom:buffer.subarray(0,3).equals(ENCOUNTER_UTF8_BOM)});
  return {profiles,comparison:{encoding:'UTF-8',normalization:'one optional leading EF BB BF only',
    reference:bytes(reference),actual:bytes(raw),canonical_sha256:hash(actual),
    rows:Object.values(profiles).reduce((count,profile)=>count+Object.keys(profile).length,0),fields_per_row:13}};
}
// Both actual-model compilers consume the same maintained domain closure. The
// historical CSV still retains its original two-source provenance and bytes.
const ENCOUNTER_COMPILATION_SOURCES=WAVE_ORACLE_SOURCES;
export function encounterCompilationSourceBinding() {
  const manifestPath=join(ROOT,'client/public/last-stand/asset-manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  return {source_lf_sha256:Object.fromEntries(ENCOUNTER_COMPILATION_SOURCES.map(name=>[name,
    hash(readFileSync(join(ROOT,'campaign-unity/Unity/Assets/Scripts',name),'utf8').replace(/\r\n/g,'\n'))])),
    export_binding:{manifest_sha256:fileHash(manifestPath),receipt_sha256:manifest.source.receiptSha256,
      source_lock_sha256:manifest.source.sourceLockSha256,source_inventory_sha256:manifest.source.sourceInventorySha256,
      wrapper_sha256:manifest.wrapperSha256,build:manifest.source.build}};
}
export function buildEncounterOracle(output) {
  const bound=readBoundEncounterOracle();
  const {mono,csc}=encounterOracleToolchain();
  const sources=ENCOUNTER_COMPILATION_SOURCES.map(name=>join(ROOT,'campaign-unity/Unity/Assets/Scripts',name));
  for(const path of [mono,csc,...sources])assert.ok(existsSync(path),'Actual model oracle prerequisite absent: '+path);
  const directory=join(output,'model-oracle');mkdirSync(directory);
  const driver=join(directory,'Program.cs'),exe=join(directory,'EncounterOracle.exe');
  const text=`using System; using SingedTerra.Encounter;
class Program { static void Main() {
 Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.Out.NewLine="\\r\\n";
 System.Threading.Thread.CurrentThread.CurrentCulture=System.Globalization.CultureInfo.InvariantCulture;
 foreach(bool launcher in new[]{false,true}) foreach(int damage in new[]{20,30,40,50}) {
 var m=new EncounterModel(launcher,EncounterProfile.PlayablePrototype,damage);
 while(true) { Console.WriteLine(string.Join(",",launcher?"launcher":"repair",damage,m.Tick,m.Hull,m.Kills,m.Spawned,
 m.CannonShots,m.LauncherShots,m.Restored,m.CloseHits,m.RangedHits,m.ActiveCount,m.Status));
 if(m.Status!=EncounterStatus.Running)break; m.Step(); }
} } }`;
  writeFileSync(driver,text);
  const before=Object.fromEntries([mono,csc,...sources,driver].map(path=>[path,fileHash(path)]));
  const commands=[];
  const execute=(name,args)=>{
    const result=spawnSync(mono,args,{cwd:ROOT,encoding:null,timeout:120000,maxBuffer:32*1024*1024});
    writeFileSync(join(directory,`${name}.stdout.txt`),result.stdout??Buffer.alloc(0));
    writeFileSync(join(directory,`${name}.stderr.txt`),result.stderr??Buffer.alloc(0));
    commands.push({argv:[mono,...args],cwd:ROOT,exit:result.status,error:result.error?String(result.error):null,
      stdout:`${name}.stdout.txt`,stderr:`${name}.stderr.txt`,executable_sha256:fileHash(mono),
      launch_file_sha256:fileHash(args[0]),stdout_sha256:fileHash(join(directory,`${name}.stdout.txt`)),
      stderr_sha256:fileHash(join(directory,`${name}.stderr.txt`))});
    writeFileSync(join(directory,'commands.json'),JSON.stringify({inputs:before,commands},null,2));
    assert.ok(!result.error && result.status===0,`Actual model ${name} failed; inspect retained stdout/stderr`);return result.stdout;
  };
  execute('compile',[csc,'-nologo',...(process.platform==='linux'?['-langversion:7.2']:[]),`-out:${exe}`,...sources,driver]);
  const raw=execute('run',[exe]);writeFileSync(join(directory,'actual-model.csv'),raw);
  const admission=admitEncounterOracleOutput(raw);
  for(const [path,sha]of Object.entries(before))assert.equal(fileHash(path),sha,'Model oracle source/tool drift');
  const {profiles,comparison}=admission;
  writeFileSync(join(directory,'binding.json'),JSON.stringify({inputs:before,commands,source_binding:encounterCompilationSourceBinding(),exe_sha256:fileHash(exe),
    output_sha256:hash(raw),comparison,profiles:Object.keys(profiles),host:process.platform,fresh_host_compilation:true,
    authority:'unchanged EncounterModel stepped at each actual tick'},null,2));
  assert.deepEqual(profiles,bound,'Fresh actual model differs from portable reference');return profiles;
}

// Actual pinned Windows Mono/Roslyn output; source LF hashes admit portable checkouts.
// Never regenerate this reference during a passing journey.
const ENCOUNTER_ORACLE_PACKAGE = {"format":"st-last-stand-actual-model-oracle/1","compiled_host":"Windows","output_sha256":"0109fbc1295db5045a7c884bfaf4f19c54d501ff2b2bee270831915f6bc7162e","source_lf_sha256":{"EncounterModel.cs":"d091a7a03efbea2c14157408066b08776ba72c29cddf17aa3f5e1699a7c00eef","EncounterProfile.cs":"4c684de9d42cfbf83fab3841ddc464077f2cc72a58cc465a5ede5966f79fc57d"},"compile_binding":{"inputs":{"C:\\Users\\brenn\\singedTerra-engine-lab\\tools\\unity-6000.3.24f1\\Editor\\Data\\MonoBleedingEdge\\bin\\mono.exe":"9ecd7416cde22b93ca1648ca698540131a6aec562c7e5008864c2a94a2b864db","C:\\Users\\brenn\\singedTerra-engine-lab\\tools\\unity-6000.3.24f1\\Editor\\Data\\MonoBleedingEdge\\lib\\mono\\msbuild\\Current\\bin\\Roslyn\\csc.exe":"7228085c2028c2426f8ae4272c9ba7efdcaa76b08b8ea8ea9168c203bb0bcb15","C:\\Users\\brenn\\st-art-pr\\campaign-unity\\Unity\\Assets\\Scripts\\EncounterModel.cs":"d091a7a03efbea2c14157408066b08776ba72c29cddf17aa3f5e1699a7c00eef","C:\\Users\\brenn\\st-art-pr\\campaign-unity\\Unity\\Assets\\Scripts\\EncounterProfile.cs":"4c684de9d42cfbf83fab3841ddc464077f2cc72a58cc465a5ede5966f79fc57d","C:\\Users\\brenn\\codearbiter-review-integration-20261006\\ui-t09-author-20261008\\model-oracle\\Program.cs":"b0088957aa28b88f4d95d09bee3bff1e7d62a5f57675e3e50a14f36f565149fc"},"exe_sha256":"402d81c515a4dfe4cbf4c353f2debab3a3c18e76b8902df49a2f1698217e455e","output_sha256":"0109fbc1295db5045a7c884bfaf4f19c54d501ff2b2bee270831915f6bc7162e","profiles":["repair:20","repair:30","repair:40","repair:50","launcher:20","launcher:30","launcher:40","launcher:50"],"authority":"unchanged EncounterModel stepped at each actual tick"},"gzip_base64":"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"};

function runTool(tool, args, options = {}) {
  return execFileSync(tool, args, { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options });
}

function powershell(script) {
  const boundedScript="$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';\n"+script;
  const command='[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);& ([ScriptBlock]::Create([Console]::In.ReadToEnd()))';
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
    {input:Buffer.from(boundedScript,'utf8'),encoding:'utf8',timeout:10_000,maxBuffer:4*1024*1024,windowsHide:true});
}
export function processTable() {
  if(process.platform==='win32') return JSON.parse(powershell(`@(
    Get-CimInstance Win32_Process | Where-Object { $_.CreationDate -and $_.ExecutablePath } | ForEach-Object { [pscustomobject]@{
      pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; start=$_.CreationDate.ToUniversalTime().ToString('o'); exe=$_.ExecutablePath
    } }) | ConvertTo-Json -Compress`));
  assert.equal(process.platform,'linux','Owned process supervision requires Windows or Linux');
  return readdirSync('/proc').filter(name=>/^\d+$/.test(name)).flatMap(name=>{
    try {const stat=readFileSync(`/proc/${name}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
      let exe;try{exe=readlinkSync(`/proc/${name}/exe`);}catch{}
      return [{pid:Number(name),ppid:Number(fields[1]),start:fields[19],exe}];
    } catch {return [];}
  });
}
const hasProcessExecutable=identity=>typeof identity?.exe==='string' && identity.exe.length>0;
const sameProcess=(left,right)=>hasProcessExecutable(left) && hasProcessExecutable(right) && left.pid===right.pid && left.start===right.start && left.exe===right.exe;
export function ownedProcessIdentity(pid) {
  assert.ok(Number.isInteger(pid) && pid>0,'Invalid owned PID');
  const identity=processTable().find(item=>item.pid===pid);assert.ok(identity,'Owned process identity absent');return identity;
}
// processTable supplies UTC Windows creation stamps or Linux monotonic start ticks.
// Keep their domains separate and retain every supplied fractional digit.
function processStartClock(start) {
  if(typeof start!=='string')return null;
  if(/^(0|[1-9]\d*)$/.test(start))return {domain:'linux-ticks',value:BigInt(start)};
  const stamp=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,7})Z$/.exec(start);
  if(!stamp)return null;
  const seconds=Date.parse(`${stamp[1]}.000Z`);
  if(!Number.isFinite(seconds) || new Date(seconds).toISOString().slice(0,19)!==stamp[1])return null;
  return {domain:'windows-utc',value:BigInt(seconds)*10000n+BigInt(stamp[2].padEnd(7,'0'))};
}
function bornUnderParent(child,parent) {
  const childClock=processStartClock(child.start),parentClock=processStartClock(parent.start);
  return childClock && parentClock && childClock.domain===parentClock.domain && childClock.value>=parentClock.value;
}
export function collectOwnedDescendants(table, known) {
  const identities=new Map(known.filter(item=>hasProcessExecutable(item) && (item.depth??0)===0).map(item=>[item.pid,item]));
  const adopt=(candidates,requireLiveParent)=>{
    let changed=true;
    while(changed){changed=false;for(const item of candidates){
      const parent=identities.get(item.ppid);
      if(parent && hasProcessExecutable(item) && !identities.has(item.pid) && bornUnderParent(item,parent) &&
        (!requireLiveParent || table.some(candidate=>sameProcess(candidate,parent)))) {
        identities.set(item.pid,{...item,depth:(parent.depth??0)+1});changed=true;
      }
    }};
  };
  // Revalidate retained ancestry before it reaches destructive selection. A
  // recorded valid parent can have exited; fresh adoption requires it live.
  adopt(known,false);adopt(table,true);return [...identities.values()];
}
export async function stopOwnedProcessTree(identities) {
  let known=identities,remaining=[];const stopped=[],deadline=Date.now()+15_000;
  do {
    const table=processTable();known=collectOwnedDescendants(table,known);
    remaining=known.filter(item=>table.some(current=>sameProcess(item,current)));
    if(!remaining.length)break;
    const targets=[...remaining].sort((a,b)=>(b.depth??0)-(a.depth??0));
    if(process.platform==='win32') {
      const encoded=Buffer.from(JSON.stringify(targets)).toString('base64');
      powershell(`$targets=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
        foreach($target in $targets){$current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$target.pid)
          if($current -and $current.CreationDate.ToUniversalTime().ToString('o') -eq $target.start -and $current.ExecutablePath -eq $target.exe){
            try {Stop-Process -Id $target.pid -Force -ErrorAction Stop}
            catch {$after=Get-CimInstance Win32_Process -Filter ('ProcessId='+$target.pid)
              if($after -and $after.CreationDate.ToUniversalTime().ToString('o') -eq $target.start -and $after.ExecutablePath -eq $target.exe){throw}}
          }}`);
    } else for(const target of targets) {
      if(processTable().some(item=>sameProcess(item,target)))try{process.kill(target.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
    stopped.push(...targets);await delay(150);
  } while(Date.now()<deadline);
  const table=processTable();remaining=known.filter(item=>table.some(current=>sameProcess(item,current)));
  assert.equal(remaining.length,0,'Owned process descendants remain');return {known,stopped,remaining};
}
export function removeOwnedProfile(profile) {
  const tempRoot=realpathSync(tmpdir()),target=resolve(profile),rel=relative(tempRoot,target);
  assert.ok(!isAbsolute(rel) && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith('st-ls-chrome-'),'Profile containment failed');
  if(!existsSync(target))return;
  assert.ok(!lstatSync(target).isSymbolicLink() && realpathSync(target)===target,'Profile resolved containment failed');
  if(process.platform==='win32') {
    const data=Buffer.from(JSON.stringify({target,tempRoot})).toString('base64');
    powershell(`$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'))|ConvertFrom-Json
      $target=(Resolve-Path -LiteralPath $data.target -ErrorAction Stop).Path
      if([IO.Path]::GetDirectoryName($target) -ne $data.tempRoot -or -not [IO.Path]::GetFileName($target).StartsWith('st-ls-chrome-')){throw 'Profile containment failed'}
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop`);
  } else rmSync(target,{recursive:true});
  assert.ok(!existsSync(target),'Owned profile remains');
}
export function lastStandJourneyTimeBudget(host=process.platform,{served=false}={}) {
  assert.ok(['win32','linux'].includes(host),'Unsupported journey budget host');
  // Native qualification reached the hidden natural terminal at 28.5 minutes,
  // before loader/wasm and storage recovery matrices or final retention. Admit
  // 40 minutes total; individual action, gameplay and media guards stay fixed.
  const testMs=host==='win32'?2_400_000:3_600_000,startupMs=served?0:180_000;
  // Test/browser clocks start after webServer setup; the standalone owner
  // starts before it and must also admit owned-tree cleanup.
  // Software-rendered Linux Unity frames can occupy the page thread beyond
  // the Windows DOM allowance. Keep each read/capture bounded independently.
  return Object.freeze({testMs,startupMs,actionMs:host==='linux'?60_000:10_000,browserMs:testMs+40_000,
    runnerMs:testMs+startupMs+5_000,supervisorMs:testMs+startupMs+50_000,
    pythonMs:testMs+180_000+100_000});
}
export function ownedSupervisorLifetimeLimit(host=process.platform) {
  return ['win32','linux'].includes(host)?lastStandJourneyTimeBudget(host).supervisorMs+10_000:640_000;
}
export function publishOwnedSupervisorJson(path,value) {
  const text=JSON.stringify(value,null,2),pending=`${path}.pending-${randomUUID()}`;
  let fd,created=false;
  try {
    fd=openSync(pending,'wx');created=true;
    writeFileSync(fd,text);closeSync(fd);fd=undefined;
    renameSync(pending,path);
  } catch(error) {
    if(fd!==undefined)try{closeSync(fd);}catch{}
    if(created)try{unlinkSync(pending);}catch{}
    throw error;
  }
}
export async function finishOwnedSupervisorCleanup(options,known) {
  const cleanup={tree:await stopOwnedProcessTree(known)};
  if(options.profile)removeOwnedProfile(options.profile);
  else {
    cleanup.profiles=[];
    const scan=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Evidence symlink refused');
      if(entry.isDirectory())scan(path);else if(entry.name==='browser-profile.json'){
        const receipt=JSON.parse(readFileSync(path,'utf8'));
        if(receipt.status==='removed' || !existsSync(receipt.profile))continue;
        assert.ok(cleanup.tree.known.some(item=>sameProcess(item,receipt.root)),'Profile browser ownership not in supervised tree');
        removeOwnedProfile(receipt.profile);cleanup.profiles.push({profile:receipt.profile,root:receipt.root,removed:true});
      }
    }};scan(options.output);
  }
  cleanup.profile_removed=options.profile?!existsSync(options.profile):null;return cleanup;
}
export function startOwnedSupervisor(child, output, profile, lifetimeMs=640_000, expectedRoot) {
  assert.ok(Number.isInteger(lifetimeMs) && lifetimeMs>0 && lifetimeMs<=ownedSupervisorLifetimeLimit(),'Invalid owned lifetime');
  admitEvidenceParent(output);
  assert.ok(Number.isInteger(child.pid) && child.pid>0,'Owned spawn did not return a PID');
  const table=processTable(),root=table.find(item=>item.pid===child.pid),owner=table.find(item=>item.pid===process.pid);
  assert.ok(root && owner,'Owned process exited before supervision admission');
  assert.equal(root.ppid,owner.pid,'Owned child ancestry mismatch');
  assert.ok(typeof root.exe==='string' && root.exe.length>0 && typeof owner.exe==='string' && owner.exe.length>0,'Owned executable identity absent');
  if(expectedRoot)assert.ok(sameProcess(root,expectedRoot),'Owned child identity changed before supervision admission');
  const id=randomUUID().slice(0,8),path=join(output,`supervisor-${id}.json`);
  const options={root,owner,profile,output,lifetimeMs,path,known:collectOwnedDescendants(table,[{...root,depth:0}])};
  publishOwnedSupervisorJson(path,options);
  const watcher=spawn(process.execPath,[join(ROOT,'scripts/last-stand-playable-loop.mjs'),'--watch-owner',path],
    {detached:true,stdio:'ignore',windowsHide:true});watcher.unref();
  const resultPath=`${path}.result.json`,stopPath=`${path}.stop`;
  return {path,resultPath,root,stop:async()=>{
    try {
      writeFileSync(stopPath,'stop');const deadline=Date.now()+35_000;
      while(!existsSync(resultPath) && Date.now()<deadline)await delay(100);
      assert.ok(existsSync(resultPath),'Owned supervisor result absent');
      const result=JSON.parse(readFileSync(resultPath,'utf8'));
      assert.ok(sameProcess(result.root,options.root) && result.root.ppid===options.root.ppid,'Owned supervisor result root mismatch');
      assert.ok(sameProcess(result.owner,options.owner) && result.owner.ppid===options.owner.ppid,'Owned supervisor result owner mismatch');
      assert.equal(result.profile,options.profile,'Owned supervisor result profile mismatch');
      assert.equal(result.status,'stopped',`Owned cleanup failed: ${result.error}`);
      assert.ok(Array.isArray(result.tree?.remaining) && result.tree.remaining.length===0,'Owned supervisor result did not confirm complete cleanup');
      if(profile)assert.equal(result.profile_removed,true,'Owned supervisor result did not confirm profile removal');
      return result;
    } catch(error) {
      // The parent retains the original admitted identities even if the watcher
      // cannot retain observations or publish a complete result. Failure stays
      // failure after this bounded, identity-checked cleanup attempt.
      try{error.fallback_cleanup=await finishOwnedSupervisorCleanup(options,options.known);}
      catch(cleanup){error.cleanup_error=String(cleanup);}
      throw error;
    }
  }};
}
export async function watchOwnedProcess(options) {
  admitEvidenceParent(options.output);
  assert.ok(relative(options.output,options.path).startsWith('supervisor-'),'Supervisor receipt containment failed');
  let known=options.known,reason='owner-exit',admitted=false,failure;const begin=Date.now(),result={status:'running',root:options.root,owner:options.owner,profile:options.profile};
  try {
    assert.equal(options.root.ppid,options.owner.pid,'Supervisor root was not created by its recorded owner');
    assert.ok(options.root.exe && options.owner.exe,'Owned executable identity absent');
    assert.ok(Number.isInteger(options.lifetimeMs) && options.lifetimeMs>0 && options.lifetimeMs<=ownedSupervisorLifetimeLimit(),'Invalid owned lifetime');
    admitted=true;
    while(true){const table=processTable();known=collectOwnedDescendants(table,known);
      publishOwnedSupervisorJson(`${options.path}.observed.json`,{known,observedAt:new Date().toISOString()});
      if(existsSync(`${options.path}.stop`)){reason='requested-stop';break;}
      if(!table.some(item=>sameProcess(item,options.owner)))break;
      if(!table.some(item=>sameProcess(item,options.root))){reason='root-exit';break;}
      if(Date.now()-begin>options.lifetimeMs){reason='timeout';break;}
      await delay(200);
    }
  } catch(error){failure=error;result.status='failed';result.error=String(error);result.known=known;}
  finally {
    result.reason=reason;
    if(admitted)try {
      Object.assign(result,await finishOwnedSupervisorCleanup(options,known));
      if(result.status!=='failed')result.status='stopped';
    } catch(error){failure??=error;result.status='failed';result.error??=String(error);result.cleanup_error=String(error);result.known=known;}
    try{publishOwnedSupervisorJson(`${options.path}.result.json`,result);}
    catch(error){if(failure){failure.publication_error=String(error);throw failure;}throw error;}
  }
}

export function nativeChromeArgs(profile, mode='native') {
  assert.ok(['native','shop-headless'].includes(mode),'Only the explicit Shop headless option is admitted');
  return [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
    '--window-size=1616,988', ...(process.platform==='win32' && mode==='native'?[]:['--headless=new']), 'about:blank'];
}
const windowError=error=>({name:String(error?.name??'Error').slice(0,100),
  message:String(error?.message??error).slice(0,1000),stack:String(error?.stack??'').slice(0,4000)});
function retainWindowFailure(report,key,value) {
  const records=report[key]??=[];records.push(value);
  if(records.length>8){records.shift();report[key+'_dropped']=(report[key+'_dropped']??0)+1;}
}
function ownedNativeWindowSnapshot(owner, activation=null) {
  assert.equal(process.platform,'win32','Native HWND observation is unavailable on this host');
  const startedUptimeMs=Math.floor(uptime())*1000;
  assert.ok(Number.isSafeInteger(startedUptimeMs) && startedUptimeMs>0,'Native subprocess monotonic origin unavailable');
  const encoded=Buffer.from(JSON.stringify({root:owner.root,profile:owner.profile,activation,startedUptimeMs})).toString('base64');
  return JSON.parse(powershell(`$owner=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class LastStandAwayWindowProbe {

  // One noninheritable kernel object stays pinned across full CIM admission.
  // Later checks never reacquire a PID or invoke a provider while input is held.
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint GetProcessId(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", EntryPoint="QueryFullProcessImageNameW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder image, ref int size);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
  [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
  public sealed class ProcessPin : IDisposable {
    IntPtr handle; readonly uint pid; readonly string exe; long created;
    ProcessPin(IntPtr value, uint processId, string executable) { handle=value;pid=processId;exe=executable; }
    public static ProcessPin Open(uint pid, string exe) {
      if (pid == 0 || String.IsNullOrEmpty(exe)) throw new InvalidOperationException("Missing owned kernel identity");
      var handle=OpenProcess(0x101000, false, pid); // QUERY_LIMITED_INFORMATION | SYNCHRONIZE
      if (handle == IntPtr.Zero) throw new InvalidOperationException("Owned process handle unavailable");
      var pin=new ProcessPin(handle,pid,exe);
      try {
        long exited, kernel, user;
        if (!GetProcessTimes(handle,out pin.created,out exited,out kernel,out user) || !pin.Check())
          throw new InvalidOperationException("Owned kernel identity mismatch");
        return pin;
      } catch { pin.Dispose(); throw; }
    }
    public bool Check() {
      long fresh, exited, kernel, user; var image=new StringBuilder(32768); int size=image.Capacity;
      return handle != IntPtr.Zero && WaitForSingleObject(handle,0) == 258 && GetProcessId(handle) == pid &&
        GetProcessTimes(handle,out fresh,out exited,out kernel,out user) && fresh == created &&
        QueryFullProcessImageName(handle,0,image,ref size) && String.Equals(image.ToString(),exe,StringComparison.OrdinalIgnoreCase);
    }
    public void Dispose() {
      if (handle == IntPtr.Zero) return;
      if (!CloseHandle(handle)) throw new InvalidOperationException("Owned process handle release failed");
      handle=IntPtr.Zero;
    }
  }
  public static bool CanBeginInput(ulong startedUptimeMs) {
    ulong now=GetTickCount64();
    // Node/libuv uptime and this clock share GetTickCount64 on Windows.
    // Floor at the parent is conservative and includes spawn/Add-Type/admission.
    // Reserve at least two seconds of the unchanged ten-second subprocess bound.
    return startedUptimeMs > 0 && now >= startedUptimeMs && now-startedUptimeMs < 8000;
  }
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GuiInfo {
    public uint Size, Flags; public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret; public Rect CaretRect;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
    public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KeyboardInput {
    public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct HardwareInput { public uint Message; public ushort Low, High; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
    [FieldOffset(0)] public MouseInput Mouse;
    [FieldOffset(0)] public KeyboardInput Keyboard;
    [FieldOffset(0)] public HardwareInput Hardware;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint Type; public InputUnion Data; }
  public class CaptionProof {
    public string status, hwnd, rootHwnd, capture; public uint pid, rootPid;
    public int x, y, hitTest; public bool keysClear, rechecked;
    public string stage; public bool cursorMeasured, contextVerified, desktopUnchanged, geometryUnchanged;
  }
  public class Geometry { public int left, top, width, height; }
  public class Mapping { public int x, y; }
  public class OwnedPresentationProof {
    public string method = "owned-HWND_TOPMOST/HWND_NOTOPMOST/SWP_NOACTIVATE/NOMOVE/NOSIZE/NOOWNERZORDER";
    public bool attempted, applied, restored, normalBefore, normalAfter, ownerTreeVerified;
    public string restoreError; public CaptionProof[] normalProbes;
  }
  public class ActivationOutcome {
    public string status, reason; public bool attempted, accepted;
    public object placement, inputState, input, snapshot;
    public CaptionProof caption; public CaptionProof[] probes; public PhysicalProof physical;
  }
  public class PhysicalProof {
    public string context = "PER_MONITOR_AWARE_V2";
    public bool entered, verified, restored; public Geometry geometry, desktop; public Mapping mapping;
    public uint moveSent, downSent, upSent; public CaptionProof beforeDown, beforeUp;
    public OwnedPresentationProof presentation;
  }
  public delegate bool MonitorProc(IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorProc callback, IntPtr parameter);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPhysicalPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong32(IntPtr window, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] input, int size);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetPhysicalCursorPos(out Point point);
  static bool PhysicalContext() {
    return AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), new IntPtr(-4));
  }
  static Geometry PhysicalDesktop() {
    int count = 0, left = Int32.MaxValue, top = Int32.MaxValue, right = Int32.MinValue, bottom = Int32.MinValue;
    bool invalid = false;
    bool observed = EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr parameter) => {
      if (++count > 16 || rect.Right <= rect.Left || rect.Bottom <= rect.Top) { invalid = true; return false; }
      left = Math.Min(left, rect.Left); top = Math.Min(top, rect.Top);
      right = Math.Max(right, rect.Right); bottom = Math.Max(bottom, rect.Bottom); return true;
    }, IntPtr.Zero);
    long width = (long)right-left, height = (long)bottom-top;
    if (!observed || invalid || count == 0 || width <= 1 || height <= 1 || width > 65536 || height > 65536) return null;
    return new Geometry { left = left, top = top, width = (int)width, height = (int)height };
  }
  static bool SameGeometry(Geometry first, Geometry second) {
    return first != null && second != null && first.left == second.left && first.top == second.top &&
      first.width == second.width && first.height == second.height;
  }
  public static Mapping MapPhysicalPoint(Geometry desktop, int x, int y) {
    // Normalized virtual-desktop endpoints; subtract signed origins before scaling.
    // Ambiguous subpixel desktops refuse. Actual GetPhysicalCursorPos is still required after the move.
    if (desktop == null || desktop.width <= 1 || desktop.height <= 1 || desktop.width > 65536 || desktop.height > 65536 ||
        x < desktop.left || y < desktop.top || (long)x >= (long)desktop.left+desktop.width || (long)y >= (long)desktop.top+desktop.height) return null;
    return new Mapping { x = (int)Math.Round(((long)x-desktop.left)*65535.0/(desktop.width-1), MidpointRounding.AwayFromZero),
      y = (int)Math.Round(((long)y-desktop.top)*65535.0/(desktop.height-1), MidpointRounding.AwayFromZero) };
  }
  static bool ValidWindow(uint owner, IntPtr window, int left, int top, int width, int height, bool temporaryTopmost = false) {
    uint pid; GetWindowThreadProcessId(window, out pid); Rect rect;
    var kind = new StringBuilder(128); GetClassName(window, kind, kind.Capacity);
    long style = IntPtr.Size == 8 ? GetWindowLongPtr64(window, -20).ToInt64() : GetWindowLong32(window, -20);
    return pid == owner && IsWindowVisible(window) && !IsIconic(window) && (style & 8) == (temporaryTopmost ? 8 : 0) &&
      kind.ToString() == "Chrome_WidgetWin_1" && GetWindowRect(window, out rect) &&
      rect.Left == left && rect.Top == top && rect.Right-rect.Left == width && rect.Bottom-rect.Top == height;
  }
  static bool InputStateClear(out string capture, out int[] pressed) {
    var info = new GuiInfo { Size = (uint)Marshal.SizeOf(typeof(GuiInfo)) };
    capture = "unavailable"; var keys = new List<int>();
    if (!GetGUIThreadInfo(0, ref info)) { pressed = keys.ToArray(); return false; }
    capture = info.Capture.ToInt64().ToString();
    foreach (int key in new int[] { 1, 2, 4, 5, 6, 16, 17, 18, 91, 92 })
      if ((GetAsyncKeyState(key) & 0x8000) != 0) keys.Add(key);
    pressed = keys.ToArray(); return info.Capture == IntPtr.Zero && keys.Count == 0;
  }
  static CaptionProof ProbeCaption(uint owner, IntPtr window, int x, int y) {
    var proof = new CaptionProof { status = "covered", hwnd = window.ToInt64().ToString(), pid = owner,
      x = x, y = y, capture = "unchecked", hitTest = 0 };
    var root = GetAncestor(WindowFromPhysicalPoint(new Point { X = x, Y = y }), 2); uint pid;
    GetWindowThreadProcessId(root, out pid); proof.rootHwnd = root.ToInt64().ToString(); proof.rootPid = pid;
    if (root != window || pid != owner) return proof;
    proof.status = "noncaption";
    if (x < Int16.MinValue || x > Int16.MaxValue || y < Int16.MinValue || y > Int16.MaxValue) {
      proof.status = "coordinate-unavailable"; return proof;
    }
    UIntPtr hit;
    var packed = new IntPtr(unchecked((int)(((uint)(ushort)y << 16) | (ushort)x)));
    // WM_NCHITTEST, exact HWND, SMTO_ABORTIFHUNG|SMTO_ERRORONEXIT; never broadcast.
    if (SendMessageTimeoutW(window, 0x84, UIntPtr.Zero, packed, 0x22, 200, out hit) == IntPtr.Zero) {
      proof.status = "hit-test-unavailable"; return proof;
    }
    proof.hitTest = unchecked((int)hit.ToUInt64());
    if (proof.hitTest == 2) proof.status = "proved"; // HTCAPTION only.
    return proof;
  }
  public static object Activate(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, Func<bool> inputBudget = null) {
    var physical = new PhysicalProof(); IntPtr previous = IntPtr.Zero;
    try { previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) {
      return new { status = "refused", reason = "physical-API-unavailable", attempted = false, accepted = false, physical = physical };
    }
    try {
      // Microsoft documents PMv2 raw pixels and reversible thread-only context. CDP bounds remain a separate documentary binding.
      physical.entered = previous != IntPtr.Zero;
      physical.verified = physical.entered && PhysicalContext();
      if (!physical.verified) return new { status = "refused", reason = "physical-DPI-context-unavailable", attempted = false, accepted = false, physical = physical };
      Rect rect;
      if (GetWindowRect(new IntPtr(Int64.Parse(handle)), out rect)) physical.geometry = new Geometry {
        left = rect.Left, top = rect.Top, width = rect.Right-rect.Left, height = rect.Bottom-rect.Top };
      physical.desktop = PhysicalDesktop();
      return ActivatePhysical(owner, handle, left, top, width, height, identity, physical, inputBudget);
    } finally {
      if (previous != IntPtr.Zero) physical.restored = SetThreadDpiAwarenessContext(previous) != IntPtr.Zero &&
        AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), previous);
      if (physical.entered && !physical.restored) throw new InvalidOperationException("Previous thread DPI context restoration failed");
    }
  }
  static CaptionProof ReprovePhysical(uint owner, IntPtr window, Geometry geometry, PhysicalProof physical, int x, int y, Func<bool> identity, bool release, string stage) {
    Point cursor;
    bool prepared = physical.presentation != null && physical.presentation.applied && !physical.presentation.restored;
    if (!identity() || !PhysicalContext() || !ValidWindow(owner, window, geometry.left, geometry.top, geometry.width, geometry.height, prepared) ||
        !SameGeometry(physical.desktop, PhysicalDesktop()) || !GetPhysicalCursorPos(out cursor) || cursor.X != x || cursor.Y != y) return null;
    var proof = ProbeCaption(owner, window, cursor.X, cursor.Y);
    if (proof.status != "proved") return null;
    string capture; int[] pressed;
    if (!release) {
      proof.keysClear = InputStateClear(out capture, out pressed); proof.capture = capture;
      if (!proof.keysClear) return null;
    } else {
      var info = new GuiInfo { Size = (uint)Marshal.SizeOf(typeof(GuiInfo)) };
      if (!GetGUIThreadInfo(0, ref info) || (info.Capture != IntPtr.Zero && info.Capture != window)) return null;
      foreach (int key in new int[] { 2, 4, 5, 6, 16, 17, 18, 91, 92 })
        if ((GetAsyncKeyState(key) & 0x8000) != 0) return null;
      proof.capture = info.Capture.ToInt64().ToString(); proof.keysClear = true;
    }
    proof.rechecked = true; proof.cursorMeasured = true; proof.contextVerified = true;
    proof.geometryUnchanged = true; proof.desktopUnchanged = true; proof.stage = stage; return proof;
  }
  static bool OwnedPresentationTree(uint owner, IntPtr window) {
    if (GetAncestor(window, 3) != window) return false;
    bool owned = true;
    bool observed = EnumWindows((candidate, parameter) => {
      if (GetAncestor(candidate, 3) == window) {
        uint pid; GetWindowThreadProcessId(candidate, out pid);
        if (pid != owner) { owned = false; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return observed && owned;
  }
  static object ActivatePhysical(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, PhysicalProof physical, Func<bool> inputBudget) {
    var result = ActivateCaption(owner, handle, left, top, width, height, identity, physical, false, inputBudget);
    if (result.reason != "no-uncovered-owned-caption" || result.attempted) return result;
    var window = new IntPtr(Int64.Parse(handle));
    var preparation = new OwnedPresentationProof { normalProbes = result.probes };
    physical.presentation = preparation;
    preparation.normalBefore = identity() && PhysicalContext() &&
      ValidWindow(owner, window, left, top, width, height) && SameGeometry(physical.desktop, PhysicalDesktop());
    preparation.ownerTreeVerified = preparation.normalBefore && OwnedPresentationTree(owner, window);
    if (!preparation.ownerTreeVerified) { result.reason = "owned-presentation-precondition-rejected"; return result; }
    try {
      // Synchronous, owned-only exposure; no foreground authority and no geometry change.
      // A successful API return is insufficient: the actual temporary style must be observed.
      preparation.attempted = true;
      bool placed = SetWindowPos(window, new IntPtr(-1), 0, 0, 0, 0, 0x213);
      preparation.applied = placed && identity() && PhysicalContext() && OwnedPresentationTree(owner, window) &&
        ValidWindow(owner, window, left, top, width, height, true) && SameGeometry(physical.desktop, PhysicalDesktop());
      if (!preparation.applied) result.reason = "owned-presentation-preparation-rejected";
      else result = ActivateCaption(owner, handle, left, top, width, height, identity, physical, true, inputBudget);
    } finally {
      // Restore only the same still-owned HWND. A refusal/error cannot become accepted activation.
      bool restoreAccepted = false;
      try {
        if (preparation.attempted && identity() && OwnedPresentationTree(owner, window) &&
            (ValidWindow(owner, window, left, top, width, height) || ValidWindow(owner, window, left, top, width, height, true)))
          restoreAccepted = SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, 0x213);
      } catch (Exception error) { preparation.restoreError = error.Message; }
      preparation.normalAfter = identity() && PhysicalContext() && OwnedPresentationTree(owner, window) &&
        ValidWindow(owner, window, left, top, width, height) && SameGeometry(physical.desktop, PhysicalDesktop());
      preparation.restored = restoreAccepted && preparation.normalAfter;
      if (!preparation.restored) {
        result.accepted = false; result.status = result.attempted ? "rejected" : "refused";
        result.reason = "owned-presentation-restoration-rejected";
      }
      result.snapshot = Read(owner);
    }
    if (result.accepted) {
      uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
      if (GetForegroundWindow() != window || foregroundPid != owner) {
        result.accepted = false; result.status = "rejected"; result.reason = "native-foreground-after-restoration-rejected";
      }
    }
    return result;
  }
  static ActivationOutcome ActivateCaption(uint owner, string handle, int left, int top, int width, int height, Func<bool> identity, PhysicalProof physical, bool prepared, Func<bool> inputBudget) {
    var window = new IntPtr(Int64.Parse(handle)); var probes = new List<CaptionProof>();
    CaptionProof caption = null; bool placed = false, placementAttempted = false, attempted = false, balanced = true;
    uint sent = 0, cleanupSent = 0; int size = Marshal.SizeOf(typeof(Input)), expectedSize = IntPtr.Size == 8 ? 40 : 28;
    string capture = "unchecked"; int[] pressed = new int[0];
    Func<string, bool, ActivationOutcome> finish = (reason, accepted) => new ActivationOutcome { status = accepted ? "accepted" : (attempted ? "rejected" : "refused"),
      reason = reason, attempted = attempted, accepted = accepted,
      placement = new { attempted = placementAttempted, accepted = placed, method = prepared ? "tracked-owned-temporary-presentation" : "HWND_TOP/SWP_NOACTIVATE/NOMOVE/NOSIZE/NOOWNERZORDER/ASYNCWINDOWPOS" },
      caption = caption, probes = probes.ToArray(), physical = physical,
      inputState = new { capture = capture, pressed = pressed },
      input = new { size = size, expectedSize = expectedSize, count = 3, sent = sent, balanced = balanced, cleanupSent = cleanupSent }, snapshot = Read(owner) };
    if (!identity() || !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-owned-window", false);
    // Refuse different coordinate descriptions; never scale CDP or DWM bounds heuristically.
    if (!SameGeometry(physical.geometry, new Geometry { left = left, top = top, width = width, height = height }) || physical.desktop == null)
      return finish("physical-geometry-or-desktop-unavailable", false);
    if (!InputStateClear(out capture, out pressed)) return finish("capture-or-held-input-state", false);
    if (size != expectedSize) return finish("native-INPUT-layout-unavailable", false);
    // This bounded normal placement preserves geometry and never grants foreground authority.
    placementAttempted = true;
    placed = prepared || SetWindowPos(window, IntPtr.Zero, 0, 0, 0, 0, 0x4213);
    if (!placed) return finish("normal-owned-placement-rejected", false);
    System.Threading.Thread.Sleep(100);
    if (!identity() || !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-after-placement", false);
    foreach (int yOffset in new int[] { 16, 24, 36, 48 }) {
      foreach (int percent in new int[] { 50, 65, 80 }) {
        int x = left + width * percent / 100, y = top + yOffset;
        if (y >= top + height) continue;
        var probe = ProbeCaption(owner, window, x, y); probes.Add(probe);
        if (probe.status == "proved") { caption = probe; break; }
      }
      if (caption != null) break;
    }
    if (caption == null) return finish("no-uncovered-owned-caption", false);
    physical.mapping = MapPhysicalPoint(physical.desktop, caption.x, caption.y);
    if (physical.mapping == null)
      return finish("caption-screen-coordinate-unavailable", false);
    var move = new Input[1];
    move[0].Data.Mouse = new MouseInput { X = physical.mapping.x, Y = physical.mapping.y, Flags = 0xC001 };
    // Recheck process/profile, exact geometry, point/root/HTCAPTION and global input state immediately before input.
    if (!identity() || !PhysicalContext() || !SameGeometry(physical.desktop, PhysicalDesktop()) ||
        !ValidWindow(owner, window, left, top, width, height, prepared)) return finish("stale-before-input", false);
    caption = ProbeCaption(owner, window, caption.x, caption.y);
    if (caption.status != "proved") return finish("caption-changed-before-input", false);
    caption.keysClear = InputStateClear(out capture, out pressed); caption.capture = capture;
    if (!caption.keysClear) return finish("capture-or-held-input-before-input", false);
    if (inputBudget != null && !inputBudget()) return finish("native-input-budget-exhausted", false);
    caption.rechecked = true; attempted = true;
    physical.moveSent = SendInput(1, move, size); sent = physical.moveSent;
    if (physical.moveSent != 1) return finish("native-move-count-rejected", false);
    // No button event is possible until the actual physical cursor and exact owned caption are re-proven after moving.
    physical.beforeDown = ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, false, "before-down");
    if (physical.beforeDown == null) return finish("post-move-physical-proof-rejected", false);
    if (inputBudget != null && !inputBudget()) return finish("native-input-budget-exhausted", false);
    var down = new Input[1]; down[0].Data.Mouse.Flags = 2;
    physical.downSent = SendInput(1, down, size); sent += physical.downSent; balanced = physical.downSent == 0;
    if (physical.downSent != 1) return finish("native-down-count-rejected", false);
    try {
      physical.beforeUp = ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, true, "before-up");
      if (physical.beforeUp != null) {
        var up = new Input[1]; up[0].Data.Mouse.Flags = 4;
        physical.upSent = SendInput(1, up, size); sent += physical.upSent; balanced = physical.upSent == 1;
      }
    } finally {
      // Release only this call's inserted down and only after the same physical ownership/caption/capture proof.
      if (!balanced && ReprovePhysical(owner, window, physical.geometry, physical, caption.x, caption.y, identity, true, "cleanup-up") != null) {
        var release = new Input[1]; release[0].Data.Mouse.Flags = 4;
        cleanupSent = SendInput(1, release, size); balanced = cleanupSent == 1;
      }
    }
    if (sent != 3) return finish("native-input-count-rejected", false);
    for (int wait = 0; wait < 50 && GetForegroundWindow() != window; wait++) System.Threading.Thread.Sleep(10);
    uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
    bool verified = GetForegroundWindow() == window && foregroundPid == owner;
    return finish(verified ? "exact-owned-caption-foreground" : "native-foreground-verification-rejected", verified);
  }
  public static object Read(uint owner) {
    var windows = new List<object>(); int dropped = 0;
    EnumWindows((window, parameter) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == owner) {
        if (windows.Count == 12) { dropped++; return true; }
        Rect rect; bool measured = GetWindowRect(window, out rect);
        var kind = new StringBuilder(128); GetClassName(window, kind, kind.Capacity);
        windows.Add(new { hwnd = window.ToInt64().ToString(), pid = pid,
          visible = IsWindowVisible(window), minimized = IsIconic(window), measured = measured,
          kind = kind.ToString(), left = rect.Left, top = rect.Top,
          width = rect.Right - rect.Left, height = rect.Bottom - rect.Top });
      }
      return true;
    }, IntPtr.Zero);
    var foreground = GetForegroundWindow(); uint foregroundPid;
    GetWindowThreadProcessId(foreground, out foregroundPid);
    return new { windows = windows.ToArray(), dropped = dropped,
      foreground = new { hwnd = foreground.ToInt64().ToString(), pid = foregroundPid } };
  }
}
'@
    $pin=[LastStandAwayWindowProbe+ProcessPin]::Open($owner.root.pid,$owner.root.exe)
    try {
      # The same live kernel object spans this exact start/exe/profile admission.
    $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owner.root.pid)
    if(-not $current -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $owner.root.start -or $current.ExecutablePath -ne $owner.root.exe){throw 'Owned native process identity mismatch'}
    $argument='--user-data-dir='+$owner.profile
    if(-not ($current.CommandLine.Contains('"'+$argument+'"') -or $current.CommandLine.Split(' ').Contains($argument))){throw 'Owned native profile mismatch'}
      if(-not $pin.Check()){throw 'Owned process exited or changed during admission'}
      if($owner.activation){
        $a=$owner.activation
        $identityCheck={return $pin.Check()}
        $inputBudget={return [LastStandAwayWindowProbe]::CanBeginInput($owner.startedUptimeMs)}
        [LastStandAwayWindowProbe]::Activate($owner.root.pid,$a.hwnd,$a.left,$a.top,$a.width,$a.height,[Func[bool]]$identityCheck,[Func[bool]]$inputBudget)|ConvertTo-Json -Depth 8 -Compress
      } else {[LastStandAwayWindowProbe]::Read($owner.root.pid)|ConvertTo-Json -Depth 5 -Compress}
    } finally {$pin.Dispose()}`));
}
// Passive observations precede auxiliary cleanup. Each document is sampled in
// sequence; native foreground is not an inference about document focus.
export async function retainAwayFailure({native,page,other,kind,report,output,error,capture=null}) {
  const record={stage:'before-aux-cleanup',kind,observed_at_utc:new Date().toISOString(),
    primary_error:windowError(error),capture,ownership:{status:'refused'},native:{status:'unavailable'},
    original:{status:'unavailable'},auxiliary:{status:'unavailable'},diagnostic_errors:[]};
  retainWindowFailure(report,'window_failures',record);
  let owner;
  try {
    owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Original page ownership mismatch');
    assert.equal(other.context(),owner.context,'Auxiliary page ownership mismatch');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    if(output)assert.equal(resolve(output),resolve(owner.output),'Owned diagnostic output mismatch');
    record.ownership={status:'bound',root:owner.root,profile:owner.profile,executable:owner.executable};
  } catch(failure){record.diagnostic_errors.push({scope:'ownership',...windowError(failure)});return record;}
  let browserSession;
  try {
    browserSession=await native.browser.newBrowserCDPSession();
    for(const [name,target]of [['original',page],['auxiliary',other]]) {
      let session;
      try {
        session=await native.context.newCDPSession(target);
        const {targetInfo}=await session.send('Target.getTargetInfo');
        const window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
        const document=await target.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
          visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin,
          url:location.href.slice(0,500),title:document.title.slice(0,200)}));
        record[name]={status:'observed',target:{targetId:targetInfo.targetId,type:targetInfo.type,
          browserContextId:targetInfo.browserContextId??null,url:targetInfo.url.slice(0,500)},
          window,document:{...document,closed:target.isClosed()}};
      } catch(failure){record.diagnostic_errors.push({scope:name,...windowError(failure)});}
      finally {if(session)await session.detach().catch(failure=>record.diagnostic_errors.push({scope:name+'-detach',...windowError(failure)}));}
    }
  } catch(failure){record.diagnostic_errors.push({scope:'browser-session',...windowError(failure)});}
  finally {if(browserSession)await browserSession.detach().catch(failure=>record.diagnostic_errors.push({scope:'browser-session-detach',...windowError(failure)}));}
  try {
    record.native={status:'observed',...ownedNativeWindowSnapshot(owner)};
    for(const name of ['original','auxiliary']) {
      const item=record[name],bounds=item.window?.bounds;
      const matches=record.native.windows.filter(candidate=>bounds && candidate.kind==='Chrome_WidgetWin_1' && candidate.measured &&
        candidate.left===bounds.left && candidate.top===bounds.top && candidate.width===bounds.width && candidate.height===bounds.height);
      item.native_window=matches.length===1?{status:'bound',window:matches[0]}:
        {status:'unavailable',reason:'No unique owned HWND matches observed CDP bounds',matches:matches.length};
    }
  } catch(failure){record.diagnostic_errors.push({scope:'native-window',...windowError(failure)});}
  writeFileSync(join(owner.output,'window-failure-before-cleanup.json'),JSON.stringify({window_failures:report.window_failures},null,2));
  return record;
}
export async function cleanupAwayAuxiliary({other,session,report,kind,primaryError}) {
  let first;
  for(const [stage,close]of [['auxiliary-close',()=>other.close()],['away-session-detach',()=>session?.detach()]]) {
    try {await close();}
    catch(error){first??=error;retainWindowFailure(report,'auxiliary_cleanup_failures',{kind,stage,...windowError(error)});}
  }
  if(first && !primaryError)throw first;
}

export function bindOwnedNativeWindow(snapshot,bounds,pid) {
  assert.ok(snapshot && snapshot.dropped===0 && Array.isArray(snapshot.windows),'Complete native ownership observation required');
  assert.ok(Number.isInteger(pid) && pid>0 && bounds && bounds.windowState==='normal','Owned normal native window required');
  assert.ok(['left','top','width','height'].every(key=>Number.isInteger(bounds[key])) && bounds.width>0 && bounds.height>0,
    'Complete CDP window bounds required');
  const matches=snapshot.windows.filter(item=>item.pid===pid && item.kind==='Chrome_WidgetWin_1' &&
    item.measured && item.visible && !item.minimized && ['left','top','width','height'].every(key=>item[key]===bounds[key]));
  assert.equal(matches.length,1,'No unique visible owned HWND matches the selected CDP window');
  assert.match(matches[0].hwnd,/^[1-9][0-9]*$/,'Invalid observed owned HWND');
  return matches[0];
}
export function assertOwnedNativeActivation(result,window,pid) {
  assert.ok(result?.attempted && result.accepted && result.status==='accepted',
    `Owned native foreground capability rejected: ${result?.reason??result?.status??'unavailable'}`);
  const proof=result.caption,input=result.input;
  assert.ok(proof?.status==='proved' && proof.rechecked && proof.keysClear && proof.capture==='0',
    'Owned caption proof or clear native input state unavailable');
  assert.equal(proof.hitTest,2,'Actual native point must be HTCAPTION');
  assert.equal(proof.hwnd,window.hwnd,'Caption HWND is not the selected owned window');
  assert.equal(proof.pid,pid,'Caption PID ownership mismatch');
  assert.equal(proof.rootHwnd,window.hwnd,'Actual WindowFromPoint/GetAncestor is covered or unowned');
  assert.equal(proof.rootPid,pid,'Actual point root PID ownership mismatch');
  assert.ok(Number.isInteger(proof.x) && Number.isInteger(proof.y) && proof.x>=window.left &&
    proof.y>=window.top && proof.x<window.left+window.width && proof.y<window.top+window.height,
    'Observed caption point is outside the exact owned geometry');
  assert.ok(input && [28,40].includes(input.size) && input.size===input.expectedSize &&
    input.count===3 && input.sent===3 && input.balanced,'Exact balanced native INPUT layout/count required');
  const physical=result.physical;
  assert.ok(physical?.context==='PER_MONITOR_AWARE_V2' && physical.entered && physical.verified && physical.restored,
    'Verified and restored physical thread DPI context required');
  if(physical.presentation) {
    assert.ok(physical.presentation.attempted && physical.presentation.normalBefore &&
      physical.presentation.ownerTreeVerified && physical.presentation.applied &&
      physical.presentation.restored && physical.presentation.normalAfter && !physical.presentation.restoreError,
    'Tracked owned presentation must start normal, expose only owned windows and restore normal before acceptance');
  }
  assert.ok(physical.geometry && ['left','top','width','height'].every(key=>
    Number.isInteger(physical.geometry[key]) && physical.geometry[key]===window[key]),
  'Physical window geometry must match the separately bound owned window');
  const desktop=physical.desktop,mapping=physical.mapping;
  assert.ok(desktop && ['left','top','width','height'].every(key=>Number.isInteger(desktop[key])) &&
    desktop.width>1 && desktop.height>1 && desktop.width<=65536 && desktop.height<=65536 &&
    proof.x>=desktop.left && proof.y>=desktop.top && proof.x<desktop.left+desktop.width && proof.y<desktop.top+desktop.height,
  'Unambiguous physical virtual desktop and contained point required');
  assert.ok(mapping && Number.isInteger(mapping.x) && Number.isInteger(mapping.y) &&
    mapping.x===Math.round((proof.x-desktop.left)*65535/(desktop.width-1)) &&
    mapping.y===Math.round((proof.y-desktop.top)*65535/(desktop.height-1)),
  'Physical absolute mapping must include signed virtual desktop origins');
  assert.ok(physical.moveSent===1 && physical.downSent===1 && physical.upSent===1,
    'Separately verified physical move/down/up counts required');
  for(const [key,stage]of [['beforeDown','before-down'],['beforeUp','before-up']]) {
    const point=physical[key];
    assert.ok(point?.status==='proved' && point.stage===stage && point.cursorMeasured && point.contextVerified &&
      point.desktopUnchanged && point.geometryUnchanged && point.keysClear && point.rechecked,
    'Fresh actual physical cursor proof required immediately '+stage);
    assert.ok(point.x===proof.x && point.y===proof.y && point.hwnd===window.hwnd && point.pid===pid &&
      point.rootHwnd===window.hwnd && point.rootPid===pid && point.hitTest===2 &&
      (point.capture==='0' || (key==='beforeUp' && point.capture===window.hwnd)),
    'Physical cursor must remain at the exact owned HTCAPTION with only owned release capture');
  }
  const observed=bindOwnedNativeWindow(result.snapshot,{...window,windowState:'normal'},pid);
  assert.equal(observed.hwnd,window.hwnd,'Owned HWND changed during native activation');
  assert.equal(result.snapshot.foreground?.pid,pid,'Owned native foreground PID verification failed');
  assert.equal(result.snapshot.foreground?.hwnd,window.hwnd,'Owned native foreground HWND verification failed');
}
async function waitForOwnedNativeForeground({owner,page,session,browserSession,record}) {
  record.documentBefore=await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  assert.ok(Number.isFinite(record.documentBefore.timeOrigin) && record.documentBefore.timeOrigin>0 &&
    Number.isFinite(record.documentBefore.t) && record.documentBefore.t>=0,'Owned document clock required');
  // Native activation can precede Chrome's real visibilitychange. Observe the
  // same document within the existing action bound; do not reactivate it.
  await page.waitForFunction(origin=>performance.timeOrigin===origin && !document.hidden &&
    document.visibilityState==='visible' && document.hasFocus(),record.documentBefore.timeOrigin,{timeout:10_000});
  record.document=await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),
    visibility:document.visibilityState,t:performance.now(),timeOrigin:performance.timeOrigin}));
  assert.equal(record.document.timeOrigin,record.documentBefore.timeOrigin,'Owned document changed during foreground admission');
  assert.ok(Number.isFinite(record.document.t) && record.document.t>=record.documentBefore.t,'Owned document clock regressed');
  assert.ok(!record.document.hidden && record.document.visibility==='visible' && record.document.focused,
    'Owned original document must be visible and focused');
  assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
  const {targetInfo}=await session.send('Target.getTargetInfo');
  assert.equal(targetInfo.type,'page','Owned foreground target type changed');
  assert.equal(targetInfo.targetId,record.target.targetId,'Owned foreground target changed');
  assert.equal(targetInfo.browserContextId,record.target.browserContextId,'Owned foreground browser context changed');
  const currentWindow=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
  assert.deepEqual(currentWindow,record.cdp_window,'Owned foreground CDP window binding changed');
  record.after=ownedNativeWindowSnapshot(owner);
  const observed=bindOwnedNativeWindow(record.after,currentWindow.bounds,owner.root.pid);
  assert.equal(observed.hwnd,record.window.hwnd,'Owned foreground HWND binding changed');
  assert.equal(record.after.foreground?.pid,owner.root.pid,'Owned native foreground PID verification failed');
  assert.equal(record.after.foreground?.hwnd,record.window.hwnd,'Owned native foreground HWND verification failed');
}

export async function ensureOwnedNativeForeground({native,page,report,kind,role}) {
  const record={kind,role,utc:new Date().toISOString(),status:'refused',activationNeeded:false};
  retainWindowFailure(report,'native_foreground_preconditions',record);
  let session,browserSession;
  try {
    assert.equal(process.platform,'win32','Owned native foreground capability unavailable');
    const owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Selected page ownership mismatch');
    assert.ok(!page.isClosed(),'Selected owned page is closed');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    record.owner={root:owner.root,profile:owner.profile,executable:owner.executable};
    session=await owner.context.newCDPSession(page);browserSession=await native.browser.newBrowserCDPSession();
    const {targetInfo}=await session.send('Target.getTargetInfo');
    assert.ok(targetInfo.type==='page' && targetInfo.targetId && targetInfo.browserContextId,'Owned page target binding unavailable');
    record.target={targetId:targetInfo.targetId,browserContextId:targetInfo.browserContextId};
    record.cdp_window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.ok(Number.isInteger(record.cdp_window.windowId),'Actual CDP window identity required');
    record.before=ownedNativeWindowSnapshot(owner);
    record.window=bindOwnedNativeWindow(record.before,record.cdp_window.bounds,owner.root.pid);
    record.activationNeeded=record.before.foreground?.pid!==owner.root.pid || record.before.foreground?.hwnd!==record.window.hwnd;
    if(record.activationNeeded)await activateOwnedNativeWindow({native,page,report,kind,role});
    await waitForOwnedNativeForeground({owner,page,session,browserSession,record});
    record.status='verified';return record;
  } catch(error){record.error=windowError(error);throw error;}
  finally {
    for(const [scope,value]of [['foreground-page-detach',session],['foreground-browser-detach',browserSession]])
      if(value)await value.detach().catch(error=>retainWindowFailure(report,'native_activation_cleanup_failures',{scope,...windowError(error)}));
  }
}

export async function activateOwnedNativeWindow({native,page,report,kind,role}) {
  const record={kind,role,utc:new Date().toISOString(),status:'refused',method:'owned-caption-SendInput',attempts:0};
  retainWindowFailure(report,'native_activations',record);
  let session,browserSession;
  try {
    assert.equal(process.platform,'win32','Owned native foreground capability unavailable');
    const owner=ownedBrowserWindows.get(native?.browser);
    assert.ok(owner && owner.context===native.context,'Task-created browser ownership mismatch');
    assert.equal(page.context(),owner.context,'Selected page ownership mismatch');
    assert.ok(!page.isClosed(),'Selected owned page is closed');
    assert.deepEqual(ownedProcessIdentity(owner.root.pid),owner.root,'Owned browser process identity mismatch');
    record.owner={root:owner.root,profile:owner.profile,executable:owner.executable};
    session=await owner.context.newCDPSession(page);browserSession=await native.browser.newBrowserCDPSession();
    const {targetInfo}=await session.send('Target.getTargetInfo');
    assert.ok(targetInfo.type==='page' && targetInfo.targetId && targetInfo.browserContextId,'Owned page target binding unavailable');
    record.target={targetId:targetInfo.targetId,browserContextId:targetInfo.browserContextId};
    record.cdp_window=await browserSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
    assert.ok(Number.isInteger(record.cdp_window.windowId),'Actual CDP window identity required');
    record.before=ownedNativeWindowSnapshot(owner);
    record.window=bindOwnedNativeWindow(record.before,record.cdp_window.bounds,owner.root.pid);
    record.activation=ownedNativeWindowSnapshot(owner,record.window);
    record.attempts=record.activation.attempted?1:0;
    assertOwnedNativeActivation(record.activation,record.window,owner.root.pid);
    await waitForOwnedNativeForeground({owner,page,session,browserSession,record});
    record.status='verified';
    return record;
  } catch(error){record.error=windowError(error);throw error;}
  finally {
    for(const [scope,value]of [['selected-page-detach',session],['activation-browser-detach',browserSession]])
      if(value)await value.detach().catch(error=>retainWindowFailure(report,'native_activation_cleanup_failures',{scope,...windowError(error)}));
  }
}

export async function ownedChrome(chromium, output, mode='native', lifetimeMs=640_000) {
  const executable = process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
    : chromium.executablePath();
  assert.ok(existsSync(executable), `Native Chromium prerequisite absent: ${executable}`);
  const profile = mkdtempSync(join(tmpdir(), 'st-ls-chrome-'));
  const args = nativeChromeArgs(profile,mode);
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: process.platform !== 'win32' });
  let log = '', browser, closed = false, supervisor, ownedRoot;
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  child.on('error', error => { log += String(error); });
  const receipt = status => writeFileSync(join(output, 'browser-profile.json'), JSON.stringify({
    profile, status, pid: child.pid, root:supervisor?.root??ownedRoot, executable, args, launch_mode:mode,
    focus: mode==='shop-headless'?'headless actual document, noDefaults:true':'native default context, noDefaults:true',
    ownership: 'task-created process and temporary profile' }, null, 2));
  const close = async () => {
    if (closed) return;
    try {
      if(browser)await Promise.race([browser.newBrowserCDPSession().then(session=>session.send('Browser.close')).catch(()=>{}),delay(2000)]);
      if(supervisor) {
        const cleanup=await supervisor.stop();writeFileSync(join(output,'browser-cleanup.json'),JSON.stringify(cleanup,null,2));
      } else {
        assert.ok(ownedRoot,'Owned startup child identity was not admitted');
        await stopOwnedProcessTree([{...ownedRoot,depth:0}]);
        removeOwnedProfile(profile);
      }
      if(browser)await Promise.race([browser.close().catch(()=>{}),delay(2000)]);
      receipt('removed');closed=true;ownedBrowsers.delete(close);if(browser)ownedBrowserWindows.delete(browser);
    } catch(error){receipt('cleanup-failed');throw error;}
    finally{writeFileSync(join(output,'native-chrome.log'),log);}
  };
  try {
    const candidate=ownedProcessIdentity(child.pid);
    assert.equal(candidate.ppid,process.pid,'Owned child ancestry mismatch');
    assert.ok(typeof candidate.exe==='string' && candidate.exe.length>0,'Owned executable identity absent');
    ownedRoot=candidate;
    receipt('active');
    supervisor=startOwnedSupervisor(child,output,profile,lifetimeMs,ownedRoot);
    receipt('active');
    ownedBrowsers.add(close);
    const active = join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20_000;
    let port;
    while (true) {
      assert.ok(child.exitCode === null && Date.now() < deadline, 'Owned Chrome did not expose loopback CDP');
      if(existsSync(active)){
        const contents=readFileSync(active,'utf8');
        if(contents.includes('\n')){
          port=Number(contents.split('\n')[0]);
          assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid owned CDP port');
          break;
        }
      }
      await delay(50);
    }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 20_000 });
    assert.equal(browser.contexts().length, 1, 'One native default context required');
    const context=browser.contexts()[0];
    // CDP can become available before Chromium publishes its original tab.
    // Wait for that tab so every caller retains the same native page and focus.
    if(context.pages().length===0)await context.waitForEvent('page',{timeout:20_000});
    ownedBrowserWindows.set(browser,{root:supervisor.root,profile,executable,context,output});
    return { browser, context, close };
  } catch (error) {try{await close();}catch(cleanup){error.cleanup_error=String(cleanup);}throw error;}
}

function frameTiming(frames, begin, end) {
  const selected = frames.filter(t => begin <= t && t <= end);
  assert.ok(selected.length >= 30, 'Too few actual animation frames');
  const gaps = selected.slice(1).map((t, i) => t - selected[i]);
  assert.ok(gaps.every(gap => Number.isFinite(gap) && gap > 0), 'Invalid rAF timestamp gap');
  const sorted = [...gaps].sort((a, b) => a - b);
  return { callbacks: selected.length, observed_seconds: (selected.at(-1) - selected[0]) / 1000,
    median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * .95) - 1],
    p99_ms: sorted[Math.ceil(sorted.length * .99) - 1], max_ms: sorted.at(-1),
    gaps_over_50ms: gaps.filter(x => x > 50).length, gaps_over_100ms: gaps.filter(x => x > 100).length };
}

async function startMotion(context, page, output) {
  const directory = join(output, 'normal-speed-repair'); mkdirSync(directory);
  const session = await context.newCDPSession(page);
  const frames = []; let stopped = false;
  session.on('Page.screencastFrame', async event => {
    if (!stopped) {
      const file = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
      writeFileSync(join(directory, file), Buffer.from(event.data, 'base64'));
      frames.push({ file, timestamp: event.metadata.timestamp, metadata: event.metadata });
    }
    await session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 900, everyNthFrame: 2 });
  const stop = async () => {
    if (stopped) return;
    await session.send('Page.stopScreencast'); stopped = true; await session.detach();
    writeFileSync(join(directory, 'frames.json'), JSON.stringify({ method: 'actual independent CDP frames', frames }, null, 2));
  };
  return { stop, encode: async () => {
    await stop(); assert.ok(frames.length >= 2, 'Missing real CDP frames');
    assert.ok(frames.every(frame=>Number.isFinite(frame.timestamp)),'Invalid CDP timestamp');
    // Preserve raw delivery order above. Asynchronously encoded CDP frames can
    // arrive out of capture order; present all of them by their native stamps.
    const presentation=frames.map((frame,index)=>({frame,index})).sort((a,b)=>a.frame.timestamp-b.frame.timestamp);
    const ordered=presentation.map(item=>item.frame);
    const durations = ordered.slice(1).map((frame, i) => frame.timestamp - ordered[i].timestamp);
    assert.ok(durations.every(x => Number.isFinite(x) && x > 0), 'Non-increasing CDP timestamps');
    const lines = ['ffconcat version 1.0'];
    durations.forEach((duration, i) => lines.push(`file '${ordered[i].file}'`, 'option framerate 1000', `duration ${duration.toFixed(9)}`));
    lines.push(`file '${ordered.at(-1).file}'`, 'option framerate 1000');
    writeFileSync(join(directory, 'timeline.txt'), `${lines.join('\n')}\n`);
    const movie = join(output, 'normal-speed-repair.mp4');
    const encoded = runTool('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'concat', '-safe', '0', '-i', 'timeline.txt',
      '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', movie], { cwd: directory, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    writeFileSync(join(directory, 'ffmpeg.log'), encoded);
    const stream = JSON.parse(runTool('ffprobe', ['-v','error','-select_streams','v:0','-count_frames',
      '-show_entries','stream=nb_read_frames,duration','-of','json', movie])).streams[0];
    const duration = durations.reduce((a,b) => a+b,0);
    assert.equal(Number(stream.nb_read_frames), frames.length, 'Encoded movie dropped/duplicated independent CDP frames');
    assert.ok(Math.abs(Number(stream.duration) - duration) <= .25, 'Movie time differs from native timestamps');
    return { file: 'normal-speed-repair.mp4', sha256: fileHash(movie), frames: frames.length,
      encoded_frames: Number(stream.nb_read_frames), duration_seconds: duration,
      encoded_duration_seconds: Number(stream.duration), minimum_frame_seconds: Math.min(...durations),
      maximum_frame_seconds: Math.max(...durations), raw: 'normal-speed-repair/frames.json',
      raw_sha256: fileHash(join(directory, 'frames.json')), mode: 'normal speed from captured timestamps',
      presentation_order:presentation.map(item=>item.index),timeline:'normal-speed-repair/timeline.txt',
      timeline_sha256:fileHash(join(directory,'timeline.txt')) };
  } };
}

function decodedAudio(path, begin, duration) {
  const pcm = runTool('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i',path,
    '-ss',Math.max(0,begin).toFixed(3),'-t',duration.toFixed(3),'-vn','-ac','1','-ar','16000','-f','s16le','-']);
  assert.ok(pcm.length >= 3200, 'Recorded WebAudio decode missing/too short');
  let power = 0, peak = 0;
  for (let i=0;i+1<pcm.length;i+=2) { const value=pcm.readInt16LE(i); power+=value*value; peak=Math.max(peak,Math.abs(value)); }
  return { samples: pcm.length/2, rms: Math.sqrt(power/(pcm.length/2))/32768, peak:peak/32768,
    method:'ffmpeg decoded captured rendered Opus to mono 16 kHz PCM' };
}

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
async function bindT21ServedParent(base) {
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

export function admitEvidenceParent(candidate) {
  const legacyRoot=resolve(ROOT,'campaign-unity/Evidence/last-stand-playable-loop/t06');
  const releasedRoot=process.env.ST_SHOP_EVIDENCE_ROOT;
  if(releasedRoot)assert.equal(resolve(releasedRoot),
    'C:\\Users\\brenn\\codearbiter-review-integration-20261006\\mechanics-shop-feature-20261009\\t21-evidence',
    'External evidence root is outside the released T21 scope');
  const explicitLegacy=candidate && !relative(legacyRoot,resolve(candidate)).startsWith('..') &&
    !isAbsolute(relative(legacyRoot,resolve(candidate)));
  const evidenceRoot = releasedRoot && !explicitLegacy ? resolve(releasedRoot) : legacyRoot;
  const parent = resolve(candidate ?? evidenceRoot);
  const parentRelative = relative(evidenceRoot, parent);
  assert.ok(!isAbsolute(parentRelative) && !parentRelative.startsWith('..'), 'Evidence parent escaped task root');
  assert.equal(realpathSync(evidenceRoot),evidenceRoot,'Evidence root resolved containment failed');
  let ancestor=parent;while(!existsSync(ancestor))ancestor=dirname(ancestor);
  const actual=resolve(realpathSync(ancestor),relative(ancestor,parent)),actualRelative=relative(evidenceRoot,actual);
  assert.ok(!isAbsolute(actualRelative) && !actualRelative.startsWith('..'),'Evidence resolved containment escaped task root');
  return parent;
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
// Serialized into the current document. Observe only: no start/resume/finish calls.
function renderedAudioSnapshot({withSamples=false}={}) {
  const observer=window.__stAudioCapture,captures=observer?.captures??[],errors=observer?.errors??[];
  const finite=value=>Number.isFinite(value)?value:null;
  const bounds=items=>items.reduce((result,item)=>Number.isFinite(item.t)
    ?{first:Math.min(result?.first??item.t,item.t),last:Math.max(result?.last??item.t,item.t)}:result,null);
  const samples=captures.flatMap(capture=>capture.samples);
  const diagnostics={schema_version:1,observed_at_ms:performance.now(),time_origin_ms:performance.timeOrigin,
    document:{pathname:location.pathname.slice(0,500),hidden:document.hidden,focused:document.hasFocus()},
    present:Boolean(observer),supported:observer?.supported??null,error_count:errors.length,
    errors:errors.slice(0,8).map(error=>String(error).slice(0,500)),errors_truncated:Math.max(0,errors.length-8),
    capture_count:captures.length,captures_truncated:Math.max(0,captures.length-8),
    sample_count:samples.length,sample_bounds:bounds(samples),
    captures:captures.slice(0,8).map((capture,index)=>({index,
      context_state:capture.context?.state??null,context_time:finite(capture.context?.currentTime),sample_rate:finite(capture.context?.sampleRate),
      recorder_state:capture.recorder?.state??null,started:finite(capture.started),finish_count:finite(capture.finish_count),
      timer:{active:capture.timer_active??null,started:finite(capture.timer_started),stopped:finite(capture.timer_stopped),
        ticks:finite(capture.timer_ticks),last_tick:finite(capture.last_timer_tick)},
      sample_count:capture.samples.length,sample_bounds:bounds(capture.samples)}))};
  // Keep the original absent-observer read error, rather than inventing samples.
  return {diagnostics,samples:withSamples?window.__stAudioCapture.captures.flatMap(c=>c.samples):undefined};
}
function retainAudioDiagnostic(report, diagnostic) {
  if(!report)return;
  const retained=report.audio_diagnostics??=[];retained.push(diagnostic);
  if(retained.length>16){retained.shift();report.audio_diagnostics_dropped=(report.audio_diagnostics_dropped??0)+1;}
}
export async function retainRenderedAudioDiagnostics(page, report, observation={}) {
  let diagnostic;
  try {diagnostic=(await page.evaluate(renderedAudioSnapshot)).diagnostics;}
  catch(error) {diagnostic={schema_version:1,present:null,supported:null,capture_count:null,sample_count:null,
    diagnostic_error:String(error).slice(0,500)};}
  const retained={...diagnostic,...observation};retainAudioDiagnostic(report,retained);return retained;
}
export async function measureRenderedAudioEnergy(page, begin, end, check, min=5, {report,load,scope}={}) {
  let observed;
  const window={begin,end,min,inclusive:true,samples:null,sample_bounds:null};
  try {observed=await page.evaluate(renderedAudioSnapshot,{withSamples:true});}
  catch(error) {
    await retainRenderedAudioDiagnostics(page,report,{load,scope,kind:'energy-window',window});
    throw error;
  }
  const samples=observed.samples,selected=samples.filter(item=>begin<=item.t && item.t<=end);
  const diagnostic={...observed.diagnostics,load,scope,kind:'energy-window',window:{...window,samples:selected.length,
    sample_bounds:selected.reduce((result,item)=>({first:Math.min(result?.first??item.t,item.t),last:Math.max(result?.last??item.t,item.t)}),null)}};
  retainAudioDiagnostic(report,diagnostic);
  check(selected.length>=min,'enough measured rendered WebAudio samples',diagnostic);
  return{samples:selected.length,maximum_rms:Math.max(...selected.map(item=>item.rms)),mean_rms:selected.reduce((sum,item)=>sum+item.rms,0)/selected.length};
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

export const LAST_STAND_JOURNEY_INPUTS=Object.freeze(['e2e/helpers/lastStandJourney.mjs','e2e/last-stand-playable-loop.spec.ts',
  'e2e/helpers/lastStandControlReveal.mjs',
  'e2e/helpers/lastStandTierJourney.mjs','campaign-unity/Tools/contracts/last-stand-observation-v1.json',
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

export function lastStandDeploymentControl(state,layout) {
  assert.ok(state && layout,'Deployment requires actual state and layout');
  assert.ok(['garage','workshop'].includes(state.phase),'Deployment requires an inspection phase');
  assert.equal(layout.phase,state.phase,'Deployment state and layout must agree');
  assert.equal(state.saveState,'ready');assert.equal(typeof state.hasCheckpoint,'boolean');
  assert.ok(Number.isInteger(state.load) && state.load>0 && Number.isFinite(state.timeOrigin) && state.timeOrigin>0);
  assert.equal(state.scope,'healthy');
  for(const key of ['load','timeOrigin','scope'])assert.equal(layout[key],state[key],'Deployment document identity must agree: '+key);
  const name=state.phase==='garage'?'Deploy':'Redeploy';
  const controls=layout.controls?.filter(item=>['Deploy','Redeploy'].includes(item.name) && item.active);
  assert.equal(controls?.length,1,'Exactly one primary deployment control must be active');
  assert.equal(controls[0].name,name,'Primary control must belong to the observed phase');
  assert.equal(controls[0].interactable,true,'Primary deployment control must be enabled');
  assert.equal(controls[0].label,state.hasCheckpoint?'RESUME RUN':'DEPLOY','Primary control must match checkpoint intent');
  return name;
}

export function validateKeyboardSubmit({name,prepared,state,layout,navigation,documentState}) {
  assert.ok(prepared && state && layout && navigation && documentState,'Keyboard submit requires actual preparation and observations');
  assert.ok(Number.isInteger(prepared.load) && prepared.load>0 && Number.isFinite(prepared.timeOrigin) && prepared.timeOrigin>0);
  assert.equal(prepared.scope,'healthy');
  for(const item of [state,layout,navigation])for(const key of ['load','timeOrigin','scope'])
    assert.equal(item[key],prepared[key],'Keyboard submit document identity changed: '+key);
  assert.equal(state.phase,prepared.phase);assert.equal(layout.phase,prepared.phase);
  assert.equal(navigation.kind,'keydown');assert.equal(navigation.code,'Tab');
  assert.ok(['unity-canvas','last-stand-return'].includes(navigation.target) && navigation.focused && !navigation.hidden,
    'Keyboard navigation must belong to the visible focused document');
  assert.ok([prepared.t,navigation.t,layout.t,documentState.t].every(Number.isFinite) &&
    navigation.t>=prepared.t && layout.t>=navigation.t && documentState.t>=navigation.t,
    'Keyboard selection must follow the actual final navigation edge');
  assert.equal(documentState.timeOrigin,prepared.timeOrigin);assert.equal(documentState.focused,true);
  assert.equal(layout.selection,name,'Keyboard focus moved away from the requested control before Enter');
  const controls=[...layout.controls,...layout.shopControls,...layout.settingsControls]
    .filter(item=>item.name===name && item.active && item.interactable);
  assert.equal(controls.length,1,'Keyboard submit requires one currently enabled selected target');
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

export function isWaveResultFor(before,item) {
  return item?.action==='result' && item.phase==='result' && item.sessionRun===before.run &&
    item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    Number.isFinite(item.t) && item.t>=before.t;
}
export function assertWaveStillHidden(before,begin,events) {
  assert.ok(!events.some(item=>item.load===before.load && item.timeOrigin===before.timeOrigin &&
    item.scope===before.scope && item.globalTarget===true && item.kind==='visibilitychange' &&
    item.t>=begin && !item.hidden),'Hidden terminal wait observed a premature native visibility return');
}
export function validateHiddenWaveTerminal({interval,evidence,events=interval?.events}) {
  const {before,terminal,staged,result}=evidence;
  assert.ok(interval && Number.isFinite(interval.begin) && Number.isFinite(interval.recovered) &&
    interval.before.t<=interval.begin && interval.begin<interval.recovered);
  for(const key of ['load','timeOrigin','scope','run'])assert.equal(interval.before[key],before[key]);
  assert.deepEqual(events,waveIntervalEvents(interval.before,{...interval.before,t:interval.recovered},events),
    'Hidden terminal requires its exact bounded native visibility events');
  assert.ok(events.every((event,index)=>Number.isFinite(event.t) && (!index || event.t>=events[index-1].t)));
  const loss=events.find(item=>item.kind==='visibilitychange' && item.hidden && !item.focused);
  const visible=loss && events.find(item=>item.t>loss.t && item.kind==='visibilitychange' && !item.hidden);
  assert.ok(loss && visible && loss.t<=interval.begin && visible.t<=interval.recovered &&
    loss.t<terminal.t && terminal.t<=staged.t && staged.t<=result.t && result.t<visible.t,
    'Terminal, durable staging and exact result must finish before the first actual visibility return');
  assert.ok(isWaveResultFor(before,result),'Hidden terminal requires the exact same-session result transition');
  return {loss,visible};
}
// The loaded-page contract permits throttled callbacks and reconciliation on
// ordinary return. Keep that outcome separate from actual hidden persistence.
export function validateBackgroundWaveTerminal({interval,evidence,events=interval?.events,callbackRecords=[],states=[],cues=[]}) {
  const {before,terminal,result}=evidence;
  assert.deepEqual(interval?.before,before,'Background interval starts at the source-bound model observation');
  const current=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope;
  const loss=events?.find(item=>current(item) && item.globalTarget===true &&
    item.kind==='visibilitychange' && item.hidden && !item.focused);
  const visible=loss && events.find(item=>current(item) && item.globalTarget===true &&
    item.kind==='visibilitychange' && !item.hidden && item.t>loss.t);
  if(visible && result.t<visible.t){
    validateHiddenWaveTerminal({interval,evidence,events});return {completion:'hidden'};
  }
  assert.ok(interval && Number.isFinite(interval.begin) && Number.isFinite(interval.recovered));
  for(const key of ['load','timeOrigin','scope','run'])assert.equal(interval.before[key],before[key]);
  assert.deepEqual(events,waveIntervalEvents(before,{...before,t:interval.recovered},events),
    'Deferred terminal requires its exact bounded native visibility events');
  assert.ok(events.every((event,index)=>Number.isFinite(event.t) && (!index || event.t>=events[index-1].t)));
  const requiredMs=(terminal.tick-before.tick)*50+1500;
  assert.ok(before.selectedSpeed===1 && Number.isSafeInteger(terminal.tick) && terminal.tick>before.tick &&
    Number.isSafeInteger(before.tick) && interval.ms===requiredMs && loss && visible &&
    before.t<=loss.t && loss.t<=interval.begin && visible.t>=interval.begin+requiredMs &&
    visible.t<=interval.recovered,
    'Deferred terminal requires the full oracle-derived 1x hidden interval before its first native return');
  assert.ok(events.some(item=>item.globalTarget===true && item.t>=visible.t && item.t<=interval.recovered &&
    item.focused===true && item.hidden===false),'Deferred terminal requires actual native foreground return');
  assert.ok(isWaveResultFor(before,result) && result.t>=visible.t && result.t<=visible.t+60000,
    'Deferred terminal must finish within the bounded foreground catch-up window');
  const callbacks=callbackRecords.filter(item=>current(item) && item.run===before.run &&
    ['begin','end'].includes(item.action) && item.fromTick>=before.tick && item.t>=before.t && item.t<=result.t);
  const starts=callbacks.filter(item=>item.action==='begin'),ends=callbacks.filter(item=>item.action==='end');
  assert.ok(starts.length>0 && starts.length===ends.length,'Deferred terminal requires complete admitted callback pairs');
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;
  let tick=before.tick,pending=before.clockPending,timestamp=before.clockTimestamp;
  for(let i=0;i<starts.length;i++){
    const a=starts[i],b=ends[i];
    assert.ok(a.id===b.id && a.run===b.run && a.t<=b.t && (!i || ends[i-1].t<=a.t) &&
      (!i || a.id>starts[i-1].id),'Deferred callbacks retain exact identity and ordering');
    for(const row of [a,b])assert.ok(row.paused===false && row.failed===false && row.speed===before.selectedSpeed &&
      Number.isFinite(row.pending) && row.pending>=0 && Number.isFinite(row.elapsed) && row.elapsed>=0 &&
      near(row.timestamp-row.previousTimestamp,row.elapsed),'Deferred callback admission must remain unpaused and monotonic');
    assert.ok(a.fromTick===tick && b.fromTick===tick && a.tick===tick && a.steps===0 &&
      Number.isInteger(b.steps) && b.steps>=0 && b.steps<=128 && b.tick===tick+b.steps,
      'Deferred callback must preserve the 128-step cap and every model tick');
    // Sub-tick admissions do not emit callback records. Their monotonic clock
    // gap adds time but cannot hide a step because fromTick must still match.
    const gap=a.previousTimestamp-timestamp;
    assert.ok(Number.isFinite(gap) && gap>=-1e-6 &&
      (gap<=1e-6 || (pending+1e-9<.05 && a.priorPending+1e-9<.05)) &&
      near(a.priorPending,pending+Math.max(0,gap)*before.selectedSpeed) && near(b.priorPending,a.priorPending) &&
      near(a.pending,a.priorPending+a.elapsed*a.speed) && near(b.pending,a.pending-b.steps*.05) &&
      near(a.timestamp,b.timestamp) && near(a.previousTimestamp,b.previousTimestamp) && near(a.elapsed,b.elapsed),
      'Deferred callbacks must conserve admitted elapsed time and retained debt');
    tick=b.tick;pending=b.pending;timestamp=b.timestamp;
  }
  assert.equal(tick,terminal.tick,'Deferred callbacks must reach the independently verified terminal tick');
  assert.ok(starts.at(-1).t<=terminal.t && terminal.t<=ends.at(-1).t,
    'Terminal must belong to the final measured callback');
  const during=item=>current(item) && item.t>=before.t && item.t<=result.t;
  assert.ok(states.filter(item=>during(item)&&item.sessionRun===before.run).every(item=>
    item.saveState==='ready' && !item.checkpointBlocked && (!['battle','settling'].includes(item.phase) || item.paused===false)),
    'Deferred terminal cannot hide an automatic pause or failed checkpoint');
  assert.ok(!cues.some(item=>current(item) && item.t>=loss.t+200 && item.t<=result.t),
    'Deferred terminal cannot replay background or catch-up cues');
  return {completion:'after-native-return',callbacks};
}
// These ordinary-player journeys never fund research. Only its idle clock and
// transaction revisions may advance during Return, reload or explicit Resume.
// A funded project needs the separate research journey's completion evidence.
export function assertIdleWaveSave(saved) {
  assert.ok(saved?.version===5||saved?.version===6,'Supported wave/profile envelope required');
  if(saved.version===6&&saved.checkpoint)assertWaveCheckpointEdition(saved.checkpoint);
  if(saved.version===5&&saved.checkpoint){
    const {encounter:e,shop:s}=saved.checkpoint;
    assert.equal(e?.rulesVersion,'last-stand-waves-v1','Archive envelope cannot contain current rules');
    assert.ok(Number.isInteger(e.tier)&&e.tier>=1&&e.tier<=2&&Number.isInteger(e.fitting)&&e.fitting>=0&&e.fitting<=2,'Archive content range');
    assert.ok(!Object.hasOwn(saved.checkpoint,'contentVersion'),'Archive checkpoint has no explicit content field');
    for(const key of ['mortarShots','railgunShots','nextMortarTick','nextRailgunTick','mortarDamage','railgunDamage'])
      assert.ok(!Object.hasOwn(e,key),'Current weapon field in archive envelope');
    if(s){
      assert.ok(s.version===undefined||s.version===1||s.version===2,'Archive shop schema');
      if(s.economyVersion!==undefined)assert.ok(['long-run-economy-v1','research-farming-economy-v2','research-farming-economy-v3'].includes(s.economyVersion),'Archive economy');
      for(const key of ['tier','rewardWave','defeatedMask'])assert.ok(!Object.hasOwn(s,key),'Current ledger field in archive envelope');
      for(const levels of [s.permanentLevels,s.runPurchases])if(levels)
        for(const key of ['mortarAttack','railgunAttack'])assert.ok(!Object.hasOwn(levels,key),'Current upgrade in archive envelope');
    }
  }
  assert.ok(Number.isSafeInteger(saved.revision)&&saved.revision>0);
  const r=saved.research;assert.equal(r?.version,1);assert.equal(r.catalogVersion,'research-v1');
  assert.ok(Number.isSafeInteger(r.revision)&&r.revision>=0);
  assert.ok(Number.isSafeInteger(r.lastObservedUtcMilliseconds)&&r.lastObservedUtcMilliseconds>=0);
  assert.equal(r.nextProjectIdentity,1);assert.equal(r.completionSequence,0);
  const empty=Object.fromEntries(['gameSpeed','salvageRecovery','researchSpeed','scrapLogistics'].map(key=>[key,0]));
  assert.deepEqual(r.completedRanks,empty,'Ordinary wave qualification uses no research grants');
  assert.deepEqual(r.partials,Object.fromEntries(Object.keys(empty).map(key=>[key,null])));
  assert.deepEqual(r.slots,[{active:null,queued:null},{active:null,queued:null}]);
  assert.equal(saved.history?.version,1);
}
export const WAVE_FITTINGS=Object.freeze(['launcher','repair','scattergun','mortar','railgun']);
export function assertWaveCheckpointEdition(checkpoint){
  const e=checkpoint?.encounter,s=checkpoint?.shop;
  assert.ok(e&&s,'Complete checkpoint edition required');
  const current=e.rulesVersion==='last-stand-waves-v2';
  assert.equal(e.rulesVersion,current?'last-stand-waves-v2':'last-stand-waves-v1','Unknown wave rules');
  assert.equal(checkpoint.contentVersion,current?'last-stand-content-v2':'last-stand-content-v1','Mixed content edition');
  assert.ok(current?s.economyVersion==='combat-depth-economy-v4':
    ['long-run-economy-v1','research-farming-economy-v2','research-farming-economy-v3'].includes(s.economyVersion),'Mixed economy edition');
  assert.ok(Number.isInteger(e.tier)&&e.tier>=1&&e.tier<=(current?4:2),'Tier outside saved edition');
  assert.ok(Number.isInteger(e.fitting)&&e.fitting>=0&&e.fitting<(current?5:3),'Fitting outside saved edition');
  const fields=['mortarShots','railgunShots','nextMortarTick','nextRailgunTick','mortarDamage','railgunDamage'];
  for(const key of fields)if(current)assert.ok(Number.isSafeInteger(e[key])&&e[key]>=0,'Missing weapon state: '+key);
  else assert.ok(!Object.hasOwn(e,key),'New weapon state in legacy edition');
  if(current){
    assert.ok(e.nextMortarTick>=1&&e.nextRailgunTick>=1,'Invalid initial armament due tick');
    assert.ok(e.mortarDamage>=18&&e.railgunDamage>=40,'Invalid armament damage');
  }
  return {rulesVersion:e.rulesVersion,contentVersion:checkpoint.contentVersion,economyVersion:s.economyVersion};
}
export function assertWaveStateEdition(state,saved){
  if(saved.version!==6)return; // Historical reader fixtures retain their envelope.
  const edition=assertWaveCheckpointEdition(saved.checkpoint);
  assert.equal(state.profileVersion,edition.rulesVersion);
  assert.equal(state.contentVersion,edition.contentVersion);
  assert.equal(state.economyVersion,edition.economyVersion);
  return edition;
}
export function assertWaveRestoredState(state,saved){
  const edition=assertWaveStateEdition(state,saved);
  if(!edition)return;
  if(edition.rulesVersion==='last-stand-waves-v2')for(const key of ['mortarShots','railgunShots','mortarDamage','railgunDamage'])
    assert.equal(state[key],saved.checkpoint.encounter[key],'Restored armament differs: '+key);
}
export function validateBackgroundCheckpoint({interval,after,checkpointState:state,saved}) {
  assertIdleWaveSave(saved);
  const cp=saved.checkpoint,e=cp?.encounter;
  assert.ok(e&&state&&after?.loop&&interval?.before,'A separate paused checkpoint witness is required');
  for(const row of [interval.before,after,after.loop,state]) {
    assert.ok(Number.isSafeInteger(row.load)&&row.load>0&&Number.isFinite(row.timeOrigin)&&row.timeOrigin>0);
    assert.ok(Number.isFinite(row.t)&&row.t>=0&&typeof row.scope==='string'&&row.scope.length>0);
    for(const key of ['load','timeOrigin','scope'])assert.equal(row[key],after[key],'Checkpoint witnesses share one document');
  }
  assert.ok(Number.isSafeInteger(after.run)&&after.run>0);assert.equal(after.run,interval.before.run);
  assert.equal(after.loop.sessionRun,after.run);assert.equal(state.sessionRun,after.run);
  assert.ok(Number.isSafeInteger(cp.runId)&&cp.runId>0);assert.equal(cp.runId,after.loop.runId);assert.equal(state.runId,cp.runId);
  assert.ok(Number.isFinite(interval.begin)&&Number.isFinite(interval.recovered)&&interval.before.t<=interval.begin&&interval.begin<interval.recovered);
  assert.ok(after.t>=interval.recovered&&after.loop.t>=after.t&&state.t>=after.loop.t,'Paused checkpoint must follow the running return witness');
  assert.equal(after.loop.paused,false);assert.equal(state.action,'session');assert.equal(state.phase,'battle');
  assert.equal(state.saveState,'ready');assert.equal(state.paused,true);assert.equal(state.speed,0);
  assert.equal(state.hasCheckpoint,true);assert.equal(state.checkpointBlocked,false);assert.equal(state.pendingRunId,0);
  assert.equal(saved.pendingDefeat,null);assert.equal(state.wallet,saved.credits,'Durable balance must match its paused checkpoint witness');
  assert.ok(Number.isSafeInteger(e.completedWave)&&e.completedWave>0&&e.completedWave>=after.completedWave);
  assert.equal(e.wave,e.completedWave,'A saved checkpoint names its completed cohort');
  assert.equal(state.completedWave,e.completedWave);assert.equal(state.checkpointWave,e.completedWave);assert.equal(state.wave,e.completedWave+1);
  assert.ok(Number.isSafeInteger(e.tick)&&e.tick>0&&Number.isSafeInteger(state.tick)&&state.tick>=e.tick&&state.tick>=after.tick);
  assert.ok(['last-stand-waves-v1','last-stand-waves-v2'].includes(e.rulesVersion));assertWaveStateEdition(state,saved);assertWaveStateEdition(after.loop,saved);assert.equal(state.profileVersion,e.rulesVersion);assert.equal(after.loop.profileVersion,e.rulesVersion);
  assert.equal(state.activeTier,e.tier);assert.equal(after.loop.activeTier,e.tier);
  assert.equal(state.fittingId,WAVE_FITTINGS[e.fitting]);assert.equal(state.fittingId,after.fitting);
  assert.equal(state.cannonDamage,e.committedCannonDamage);assert.equal(state.cannonDamage,after.loop.cannonDamage);
  assert.equal(saved.history.current?.runId,cp.runId);assert.equal(saved.history.current.highestClearedWave,e.completedWave);
  return true;
}
export function assertWaveSavePreserved(before,after) {
  assertIdleWaveSave(before);assertIdleWaveSave(after);
  assert.ok(after.revision>=before.revision,'Profile revision cannot roll back');
  assert.ok(after.research.revision>=before.research.revision,'Research revision cannot roll back');
  assert.ok(after.research.lastObservedUtcMilliseconds>=before.research.lastObservedUtcMilliseconds,'Qualification requires a stable host clock');
  assert.ok(after.research.revision-before.research.revision<=after.revision-before.revision);
  const project=r=>{const {revision,lastObservedUtcMilliseconds,...rest}=r;return rest;};
  assert.deepEqual(project(after.research),project(before.research),'Idle clock cannot alter research');
  assert.deepEqual({...after,revision:before.revision,research:before.research},before,
    'Clock reconciliation cannot rewrite the checkpoint, history, wallet, upgrades or unlocks');
  return true;
}
export function validateWaveAbandonSave({before,after}) {
  assertIdleWaveSave(before);assertIdleWaveSave(after);assert.ok(before.checkpoint);
  assert.equal(after.checkpoint,null);assert.equal(after.lastFinalizedRunId,before.checkpoint.runId);
  assert.ok(after.revision>before.revision,'Finalization is a durable transaction');
  const prior=before.history,current=prior.current,history=after.history,final=history.recent?.at(-1);
  assert.ok(current&&final);assert.equal(current.runId,before.checkpoint.runId);
  assert.equal(history.current,null);assert.equal(history.lastFinalizedRunId,current.runId);
  assert.equal(final.finishReason,'abandon');assert.equal(final.runId,current.runId);
  const measured=['activeMilliseconds','pausedMilliseconds','closedMilliseconds','speedMilliseconds'];
  const stable=record=>Object.fromEntries(Object.entries(record).filter(([key])=>!measured.includes(key)&&key!=='finishReason'));
  assert.deepEqual(stable(final),stable(current),'Abandon cannot change banked history or frozen build context');
  for(const key of measured.slice(0,3))assert.ok(Number.isSafeInteger(final[key])&&final[key]>=current[key]);
  assert.equal(final.speedMilliseconds.length,10);
  final.speedMilliseconds.forEach((value,index)=>assert.ok(Number.isSafeInteger(value)&&value>=current.speedMilliseconds[index]));
  assert.equal(final.speedMilliseconds.reduce((sum,value)=>sum+value,0),final.activeMilliseconds);
  assert.deepEqual(history.recent,[...prior.recent,final].slice(-20),'Append exactly one bounded run summary');
  const aggregate=(old,tier)=>({tier,runs:(old?.runs??0)+1,bestWave:Math.max(old?.bestWave??0,final.highestClearedWave),
    ...Object.fromEntries(['activeMilliseconds','repeatableSalvage','milestoneSalvage','researchBonusSalvage'].map(key=>[key,(old?.[key]??0)+final[key]]))});
  assert.deepEqual(history.lifetime,aggregate(prior.lifetime,0));
  const tiers=prior.tiers.map(row=>row.tier===final.tier?aggregate(row,row.tier):row);
  if(!prior.tiers.some(row=>row.tier===final.tier))tiers.push(aggregate(null,final.tier));
  assert.deepEqual(history.tiers,tiers,'Finalization updates only the matching tier aggregate');
  assertWaveSavePreserved(before,{...after,checkpoint:before.checkpoint,lastFinalizedRunId:before.lastFinalizedRunId,history:before.history});
  return true;
}
export function validateWaveTerminal({before,result,saved,states,encounters,layouts,oracle}) {
  assert.ok(Number.isInteger(before?.load) && Number.isFinite(before.timeOrigin) && Number.isFinite(before.t) &&
    before.loop?.runId>0 && before.status==='Running' && before.loop.phase==='battle' &&
    !before.paused && !before.failed && !before.catchingUp);
  const {loop,hull,...encounterBefore}=before;
  assert.deepEqual(encounters.find(item=>item.load===before.load && item.timeOrigin===before.timeOrigin &&
    item.run===before.run && item.action===before.action && item.t===before.t),encounterBefore,'Actual pre-terminal observation required');
  assert.deepEqual(states.find(item=>item.load===loop.load && item.timeOrigin===loop.timeOrigin &&
    item.action===loop.action && item.t===loop.t),loop,'Actual pre-terminal loop state required');
  assert.equal(loop.load,before.load);assert.equal(loop.timeOrigin,before.timeOrigin);assert.equal(loop.scope,before.scope);
  assert.equal(loop.sessionRun,before.run);assert.equal(loop.tick,before.tick);assert.equal(hull,before.hp);
  assert.equal(loop.hull,before.hp);assert.equal(loop.kills,before.kills);assert.equal(loop.saveState,'ready');
  validateModelObservation(before,oracle);
  const same=item=>item.load===before.load && item.timeOrigin===before.timeOrigin && item.scope===before.scope &&
    Number.isFinite(item.t) && item.t>=before.t;
  const terminals=encounters.filter(item=>same(item) && item.run===before.run && item.action==='terminal');
  assert.equal(terminals.length,1,'Exactly one actual terminal tick required');
  const terminal=terminals[0];validateModelObservation(terminal,oracle);
  assert.equal(terminal.status,'Defeated');assert.equal(terminal.hp,0);
  assert.ok(terminal.t>before.t && !terminal.paused && !terminal.failed && !terminal.catchingUp);
  const run=states.filter(item=>same(item) && item.sessionRun===before.run);
  const staged=run.filter(item=>item.action==='defeat-staged');
  assert.equal(staged.length,1,'Exactly one durable terminal staging required');
  const stage=staged[0];assert.equal(stage.phase,'settling');assert.equal(stage.tick,terminal.tick);
  assert.equal(stage.kills,terminal.kills);assert.equal(stage.hull,0);assert.equal(stage.saveState,'ready');
  assert.equal(stage.runId,0);assert.equal(stage.pendingRunId,0);assert.equal(stage.hasCheckpoint,false);
  assert.ok(stage.t>=terminal.t && result.t>=stage.t && same(result));
  assert.equal(result.action,'result');assert.equal(result.sessionRun,before.run);
  assert.deepEqual(states.find(item=>same(item) && item.action==='result' && item.t===result.t),result,
    'Actual same-session result required');
  assert.equal(result.phase,'result');assert.equal(result.saveState,'ready');
  assert.equal(result.runId,0);assert.equal(result.pendingRunId,0);assert.equal(result.hasCheckpoint,false);
  assert.equal(result.wallet,stage.wallet);
  assertIdleWaveSave(saved);assert.equal(saved.checkpoint,null);assert.equal(saved.pendingDefeat,null);
  assert.equal(saved.lastFinalizedRunId,before.loop.runId);assert.equal(saved.credits,stage.wallet);
  const geometry=layouts.filter(item=>same(item) && item.phase==='settling' && item.t>=terminal.t && item.t<=result.t);
  assert.ok(geometry.length && geometry.every(item=>!item.controls.some(c=>c.name==='Claim' && c.active && c.interactable)),
    'No result acknowledgement before terminal feedback settles');
  const latestBank=states.filter(item=>same(item) && item.sessionRun===before.run && item.t<=stage.t && item.action==='wave-committed').at(-1)??before.loop;
  // A simultaneous final kill/death may bank that last cohort once in the same
  // atomic transaction, but still requires its actual same-session bank record.
  // Ordinary defeat cannot mint an additional death reward.
  assert.equal(latestBank.completedWave,terminal.completedWave,'Terminal requires the final completed wave bank');
  assert.equal(stage.wallet,latestBank.wallet,'Defeat cannot add a second wave reward');
  assert.ok(!run.some(item=>item.action==='claim'),'Wave runs cannot create a legacy reward claim');
  return {before,terminal,staged:stage,result,saved,layouts:geometry};
}

export function validateCheckpointResume({saved,resumed,stable,stored,observedClock}) {
  assertIdleWaveSave(saved);
  const checkpoint=saved.checkpoint,e=checkpoint?.encounter;
  assert.ok(checkpoint && e && e.hull>0,'A living saved boundary is required');
  assertWaveSavePreserved(saved,stored);
  for(const state of [resumed,stable]) {
    assertWaveRestoredState(state,saved);
    assert.equal(state.phase,'battle');assert.equal(state.saveState,'ready');
    assert.equal(state.runId,checkpoint.runId);assert.equal(state.activeTier,e.tier);
    assert.equal(state.fittingId,WAVE_FITTINGS[e.fitting]);
    assert.equal(state.profileVersion,e.rulesVersion);assert.equal(state.hasCheckpoint,true);
    assert.equal(state.checkpointBlocked,false);assert.equal(state.checkpointWave,e.completedWave);
    assert.equal(state.completedWave,e.completedWave);assert.equal(state.wave,e.completedWave+1);
    assert.equal(state.tick,e.tick);assert.equal(state.hull,e.hull);assert.equal(state.kills,e.kills);
    assert.equal(state.cannonDamage,e.committedCannonDamage);assert.equal(state.wallet,saved.credits);
    assert.equal(state.pendingRunId,0);assert.equal(state.paused,true);assert.equal(state.speed,0);
  }
  assert.equal(resumed.action,'resume');assert.ok(stable.t>=resumed.t+1000 && observedClock?.t>=stable.t,
    'Fresh actual state must remain paused after at least one real second');
  assert.equal(resumed.load,stable.load);assert.equal(resumed.timeOrigin,stable.timeOrigin);
  assert.equal(observedClock.timeOrigin,resumed.timeOrigin);
  return {saved,resumed,stable,stored,observedClock};
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
  const throwObserverFailure=()=>{if(observerError)throw observerError;};
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
  const write = (name, data) => writeShopPresentationJson(join(output,name),data);
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
    page.setDefaultTimeout(lastStandJourneyTimeBudget().actionMs);
    if(process.env.LAST_STAND_INDUCE_CLEANUP_FAILURE==='1')check(false,'bounded induced failure after owned browser startup');
    report.browser_version=native.browser.version();
    await page.setViewportSize({width:1280,height:720});
    if(player){await page.addInitScript(AUDIO_CAPTURE);await page.addInitScript(FRAME_PROBE);}
    await page.addInitScript(INPUT_PROBE);await page.addInitScript(RUNTIME_PROBE);
    page.on('console', message => {
      const raw=message.text(),record={type:message.type(),text:raw,location:message.location(),load,scope,time:Date.now()};
      messages.push(record);
      try{
        if(raw.startsWith('ST_TEST_RUNTIME ')) {
          const observation=JSON.parse(raw.slice('ST_TEST_RUNTIME '.length));
          retainRuntimeObservation(observation,load,scope,{states,encounters,hits,layouts,cues,callbackRecords});
        } else if(raw.startsWith('ST_TEST_INPUT ')) {
          trace.push({...JSON.parse(raw.slice('ST_TEST_INPUT '.length)),load,scope});
        }
      }catch(error){retainObserverFailure(record,error);}
    });
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
    const until=async(items,start,predicate,seconds=110)=>{
      throwObserverFailure();
      const deadline=Date.now()+seconds*1000;
      while(Date.now()<deadline) {throwObserverFailure();const found=items.slice(start).filter(predicate);if(found.length)return found.at(-1);await page.waitForTimeout(40);}
      throwObserverFailure();
      throw new Error('Expected real runtime observation absent');
    };
    const focused=async label=>{
      // Linux functional verification needs the actual document's current
      // focus/visibility. Avoid activating and polling an already focused tab.
      // Windows still performs its separate native foreground proof below.
      if(process.platform==='linux' && await page.evaluate('!document.hidden && document.hasFocus()')){
        check(true,`${label}: document focus and visibility`);return;
      }
      await page.bringToFront();
      if(process.platform==='win32')await ensureOwnedNativeForeground({native,page,report,kind:label,role:'original-precondition'});
      await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10_000});
      check(await page.evaluate('!document.hidden && document.hasFocus()'),`${label}: ${process.platform==='win32'?'native':'document'} focus and visibility`);
    };
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
    const keyboardFocus=async locator=>{
      if(process.platform==='linux'){
        // Read one current document snapshot per keyboard boundary. Separate
        // locator calls each wait on the software-rendered Unity document.
        const inspect=()=>locator.evaluate(element=>{
          window.__stInputArea='outer';
          const style=getComputedStyle(element);
          return {focused:!document.hidden && document.hasFocus(),active:element===document.activeElement,
            isReturn:element.id==='last-stand-return',canvas:!!document.getElementById('unity-canvas'),
            outline:style.outlineStyle,width:parseFloat(style.outlineWidth)};
        });
        let before=await inspect();
        if(!before.focused){await focused('outer keyboard');before=await inspect();}
        check(before.focused,'outer keyboard: document focus and visibility');
        if(before.isReturn && before.active && before.canvas){
          await page.keyboard.press('Tab');
          check(await page.locator('#unity-canvas').evaluate(element=>element===document.activeElement),
            'native Tab enters actual Unity before Return escape');
        }
        if(before.canvas)await page.keyboard.press('Shift+Tab');
        let current=await inspect();
        for(let i=0;i<50 && !current.active;i++){await page.keyboard.press('Tab');current=await inspect();}
        check(current.focused && current.active,'outer control reachable by native Tab');
        check(current.outline!=='none' && current.width>=2,'visible keyboard focus indicator',current);
        return;
      }
      await page.evaluate("window.__stInputArea='outer'");
      await focused('outer keyboard');
      // Try the browser's previous-control path from the focused canvas first.
      // No DOM focus or pointer reset may hide a Unity keyboard trap.
      if(await page.locator('#unity-canvas').count())await page.keyboard.press('Shift+Tab');
      for(let i=0;i<50;i++){if(await locator.evaluate(element=>element===document.activeElement))break;await page.keyboard.press('Tab');}
      check(await locator.evaluate(element=>element===document.activeElement),'outer control reachable by native Tab');
      const style=await locator.evaluate(element=>({outline:getComputedStyle(element).outlineStyle,width:parseFloat(getComputedStyle(element).outlineWidth)}));
      check(style.outline!=='none' && style.width>=2,'visible keyboard focus indicator',style);
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
    const {tierJourneyControlGeometry}=await import('./lastStandTierJourney.mjs');
    const {revealLastStandControl}=await import('./lastStandControlReveal.mjs');
    const hudControls=layout=>[...layout.controls,...layout.shopControls,...layout.settingsControls];
    const projectedControls=(layout,canvas)=>tierJourneyControlGeometry({...layout,graphicsTruncated:false,
      // retainRuntimeObservation already parsed the complete original record.
      // Serialize its observed graphics only for the shared reader boundary.
      raw:'ST_LS_HUD_LAYOUT '+JSON.stringify({graphics:layout.graphics})},canvas);
    const measureControls=async()=>{
      const {canvas,pixels}=await page.locator('#unity-canvas').evaluate(element=>{
        const box=element.getBoundingClientRect(),visible=getComputedStyle(element).visibility==='visible' && box.width>0 && box.height>0;
        return {canvas:visible?{x:box.x,y:box.y,width:box.width,height:box.height}:null,
          pixels:{width:element.width,height:element.height}};
      });
      assert.ok(canvas);
      const layout=layouts.at(-1);check(layout?.coordinates==='top-left','real HUD top-left convention');
      check(Math.abs(layout.width-pixels.width)<=1 && Math.abs(layout.height-pixels.height)<=1,'HUD dimensions use actual canvas backing pixels',{canvas,pixels,layout});
      const projected=projectedControls(layout,canvas);
      return {canvas,layout,projected};
    };
    const geometry=async(name,{reveal=false,requireFull=true}={})=>{
      const start=trace.length,originalLoad=load;
      const {canvas,layout,projected}=reveal?await revealLastStandControl({name,page,geometry:measureControls,
        assertUninterrupted:()=>assert.ok(load===originalLoad&&!trace.slice(start).some(event=>event.globalTarget&&
          (event.kind==='blur'||event.kind==='visibilitychange'&&event.hidden)),
        'Scroll reveal refuses document, focus or visibility loss')}):await measureControls();
      if(requireFull)check(projected.some(item=>item.name===name && item.full),`real HUD ${name} is completely visible inside its actual viewport`);
      const control=hudControls(layout).filter(item=>item.name===name && item.active && item.interactable);
      check(control.length===1,`operable real HUD ${name}`);return{canvas,layout,item:control[0]};
    };
    const resize=async(viewport,{capture=true}={})=>{
      const start=layouts.length;await page.setViewportSize({width:viewport.width,height:viewport.height});
      await page.waitForTimeout(400);
      const pixels=await page.locator('#unity-canvas').evaluate(element=>({width:element.width,height:element.height}));
      if(Math.abs(layouts.at(-1).width-pixels.width)>1 || Math.abs(layouts.at(-1).height-pixels.height)>1)
        await until(layouts,start,item=>Math.abs(item.width-pixels.width)<=1 && Math.abs(item.height-pixels.height)<=1,8);
      await geometry('Menu');
      const outer=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,nav:document.querySelector('#last-stand-nav').getBoundingClientRect().toJSON(),
        link:document.querySelector('#last-stand-return').getBoundingClientRect().toJSON(),
        loss:document.querySelector('#last-stand-loss').getBoundingClientRect().toJSON()}));
      check(outer.scrollWidth<=outer.width && outer.scrollHeight<=outer.height,'wrapper has no overflow',outer);
      for(const box of [outer.link,outer.loss])check(box.x>=0 && box.right<=outer.width && box.y>=0 && box.bottom<=outer.nav.bottom,'Return and disclosure stay reachable',box);
      await keyboardFocus(page.locator('#last-stand-return'));
      if(capture)await screenshot(`layout-${viewport.name}-${states.at(-1).phase}-${report.screenshots.length}`);
    };
    if(section.lifecycle)for(const viewport of matrix.viewports)await resize(viewport);
    const captureViewport=matrix.captureViewport;
    const phaseMatrix=async label=>{
      const phase=states.at(-1).phase,paused=states.at(-1).paused;
      for(const viewport of matrix.phaseViewports) {
        // The named phase capture below also records this inspected layout.
        await resize(viewport,{capture:false});check(states.at(-1).phase===phase && states.at(-1).paused===paused,`${label}: same actual phase across profiles`);
        await screenshot(`${label}-${viewport.name}`);
      }
      if(page.viewportSize().width!==captureViewport.width || page.viewportSize().height!==captureViewport.height)
        await resize(captureViewport);
    };
    if(section.lifecycle)await resize(captureViewport);
    const armGameClick=async(name,action,predicate=()=>true)=>{
      await focused('gameplay pointer');const {canvas,layout,item}=await geometry(name,{reveal:true});
      await page.evaluate("window.__stInputArea='gameplay'");
      const point={x:canvas.x+(item.x+item.width/2)*canvas.width/layout.width,y:canvas.y+(item.y+item.height/2)*canvas.height/layout.height};
      await page.mouse.move(point.x,point.y);await page.waitForTimeout(80);
      const armedTrace=trace.length,armedLoad=load,armedViewport=page.viewportSize();let used=false;
      return async()=>{
        assert.ok(!used && load===armedLoad,'prepared pointer is single-use in its original document');used=true;
        assert.ok(JSON.stringify(page.viewportSize())===JSON.stringify(armedViewport),'prepared pointer refuses changed viewport geometry');
        assert.ok(!trace.slice(armedTrace).some(event=>event.globalTarget &&
          (event.kind==='blur' || event.kind==='visibilitychange' && event.hidden)),
          'prepared pointer refuses intervening native focus or visibility loss');
        const documentState=await page.evaluate(()=>{
          const element=document.getElementById('unity-canvas'),box=element?.getBoundingClientRect();
          return {focused:!document.hidden && document.hasFocus(),timeOrigin:performance.timeOrigin,
            canvas:box?{x:box.x,y:box.y,width:box.width,height:box.height,pixelWidth:element.width,pixelHeight:element.height}:null};
        });
        assert.ok(documentState.focused && documentState.timeOrigin===layout.timeOrigin,'prepared pointer remains in its visibly focused document');
        const current=layouts.at(-1),state=states.at(-1),box=documentState.canvas;
        assert.ok(current && state && current.load===armedLoad && state.load===armedLoad &&
          current.timeOrigin===layout.timeOrigin && state.timeOrigin===layout.timeOrigin && current.phase===state.phase &&
          Number.isFinite(current.t) && current.t>=layout.t && current.width===layout.width && current.height===layout.height,
          'prepared pointer requires the current same-document layout');
        assert.ok(box && ['x','y','width','height'].every(key=>Number.isFinite(box[key]) && Math.abs(box[key]-canvas[key])<.5) &&
          box.pixelWidth===current.width && box.pixelHeight===current.height,'prepared pointer refuses changed Canvas geometry');
        const targets=hudControls(current).filter(control=>control.name===name && control.active && control.interactable);
        assert.equal(targets.length,1,'prepared pointer requires one currently enabled target');const target=targets[0];
        assert.ok(['x','y','width','height'].every(key=>Number.isFinite(target[key])) && target.width>0 && target.height>0 &&
          target.x>=0 && target.y>=0 && target.x+target.width<=current.width+.5 && target.y+target.height<=current.height+.5,
          'prepared pointer target must be within the actual Canvas');
        assert.ok(projectedControls(current,canvas).some(item=>item.name===name && item.full),
          'prepared pointer requires the complete target in its current actual viewport');
        const resolved={x:box.x+(target.x+target.width/2)*box.width/current.width,
          y:box.y+(target.y+target.height/2)*box.height/current.height};
        const layoutAction=action==='hud-layout',rows=layoutAction?layouts:states,start=rows.length;
        await page.mouse.move(resolved.x,resolved.y);
        await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
        report.actions.push({name,action,...resolved,hold_ms:150,resolved_layout:{load:current.load,timeOrigin:current.timeOrigin,
          phase:current.phase,t:current.t,target:{x:target.x,y:target.y,width:target.width,height:target.height}}});
        const observed=await until(rows,start,item=>item.load===armedLoad && item.timeOrigin===layout.timeOrigin &&
          (layoutAction?Number.isFinite(item.t)&&item.t>=current.t:item.action===action) && predicate(item),8);
        check(true,'prepared pointer used the actual current enabled target',{name,...resolved,phase:current.phase});return observed;
      };
    };
    const gameClick=async(...args)=>(await armGameClick(...args))();
    const gameKey=async(name,action,predicate=()=>true)=>{
      const {layout:prepared}=await geometry(name,{requireFull:false}),navigationStart=trace.length;
      await keyboardFocus(page.locator('#last-stand-return'));
      await page.keyboard.press('Tab');
      check(await page.locator('#unity-canvas').evaluate(element=>document.activeElement===element),'native Tab enters actual Unity controls');
      const ordered=hudControls(layouts.at(-1)).filter(item=>item.active && item.interactable).sort((a,b)=>Math.abs(a.y-b.y)>.5?a.y-b.y:a.x-b.x);
      const index=ordered.findIndex(item=>item.name===name);check(index>=0,'keyboard target is actually enabled');
      await page.evaluate("window.__stInputArea='gameplay-keyboard'");
      const keys=[];for(let i=0;i<index;i++){await page.keyboard.press('Tab');keys.push('Tab');}
      const navigation=trace.slice(navigationStart).findLast(item=>item.kind==='keydown' && item.code==='Tab');
      check(navigation && Number.isFinite(navigation.t),'actual final keyboard navigation edge is observed');
      // Await the first fresh projection, never re-navigate or wait for a wrong
      // selection to become the requested target. The exact owner is checked below.
      await until(layouts,0,item=>item.load===navigation.load && item.timeOrigin===navigation.timeOrigin &&
        item.scope===navigation.scope && item.t>=navigation.t,8);
      await screenshot(`keyboard-focus-${name}-${report.screenshots.length}`);
      const {canvas:keyboardCanvas}=await geometry(name);
      const documentState=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,t:performance.now(),
        focused:!document.hidden && document.hasFocus() && document.activeElement===document.getElementById('unity-canvas')}));
      validateKeyboardSubmit({name,prepared,state:states.at(-1),layout:layouts.at(-1),documentState,navigation});
      check(projectedControls(layouts.at(-1),keyboardCanvas).some(item=>item.name===name&&item.full),
        'Keyboard submit requires the complete target in its current actual viewport');
      const start=states.length,encStart=encounters.length;
      await page.keyboard.down('Enter');await page.waitForTimeout(150);await page.keyboard.up('Enter');keys.push('Enter');
      const observed=await until(states,start,item=>item.action===action && predicate(item),8);
      report.keyboard_actions.push({name,action,keys,hold_ms:150,visible_order:ordered.map(item=>item.name)});
      const activations=name==='SpeedRate'?encounters.slice(encStart).filter(item=>item.action==='pause'):
        states.slice(start).filter(item=>item.action===action);
      check(activations.length===1,'one actual owner receives each keyboard activation',activations);
      await page.evaluate("window.__stInputArea='outer'");return observed;
    };
    const mark=()=>page.evaluate('performance.now()');
    const energy=(begin,end,min=5)=>player?measureRenderedAudioEnergy(page,begin,end,check,min,{report,load,scope}):null;
    const observation=async options=>observeRuntimePair({encounters,states,load,check,options,
      clock:()=>page.evaluate(()=>({t:performance.now(),timeOrigin:performance.timeOrigin})),wait:ms=>page.waitForTimeout(ms)});
    const reference=observed=>modelOracle[`${observed.loop.activeTier}:${observed.fitting}:${observed.loop.cannonDamage}`];
    const noReplay=async(begin,end,interval)=>{
      const selected=interval?validateAwayAudioReturn({...interval,cues,states,encounters,callbackRecords,oracle:reference(interval.before)}):
        {begin,end,cues:cues.filter(item=>item.load===load && begin<=item.t && item.t<=end)};
      const measured=await energy(selected.begin,selected.end),observedCues=selected.cues;
      if(measured===null){
        check(observedCues.length===0,'functional telemetry has no background/return replay cue',observedCues);
        const result={rendered_audio:'unexecuted-requires-windows',cues:observedCues};
        report.lifecycle.push({kind:'no-replay-telemetry',begin:selected.begin,end:selected.end,...result,boundary:selected.boundary});return result;
      }
      const result=validateNoReplayAudio({energy:measured,cues:observedCues});report.lifecycle.push({kind:'no-replay',
        begin:selected.begin,end:selected.end,energy:result,cues:observedCues,boundary:selected.boundary});return result;
    };
    const away=async(kind,ms,{waitHidden}={})=>{
      const traceStart=trace.length;const before=await observation();let other,session,awayError;
      await page.bringToFront();
      await page.waitForFunction('!document.hidden && document.hasFocus()',null,{timeout:10000});
      if(process.platform==='win32')await ensureOwnedNativeForeground({native,page,report,kind,role:'original-precondition'});
      if(kind==='blur') {
        check(process.platform==='win32','Real visible window-blur capability is required; headless focus emulation is not player evidence');
        session=await native.browser.newBrowserCDPSession();
        const created=native.context.waitForEvent('page');
        await session.send('Target.createTarget',{url:'about:blank',newWindow:true});other=await created;
      } else other=await native.context.newPage();
      try {
        await other.goto('about:blank');await other.bringToFront();
        if(kind==='blur')await activateOwnedNativeWindow({native,page:other,report,kind,role:'auxiliary'});
        await page.waitForFunction(kind==='blur'?'!document.hidden && !document.hasFocus()':'document.hidden && !document.hasFocus()',null,{timeout:10000});
        const begin=await mark();await page.waitForTimeout(ms);
        if(waitHidden){assert.equal(kind,'hidden');await waitHidden({before,begin});}
        await page.bringToFront();
        if(kind==='blur')await activateOwnedNativeWindow({native,page,report,kind,role:'original'});
        await page.waitForFunction('!document.hidden && document.hasFocus()');
        const recovered=await mark();await noReplay(begin+200,recovered,{kind,before,begin,recovered,ms,events:trace.slice(traceStart)});
        return {before,begin,recovered,...(waitHidden?{ms,events:waveIntervalEvents(before,{...before,t:recovered},trace.slice(traceStart))}:{})};
      } catch(error) {
        awayError=error;
        try {await retainAwayFailure({native,page,other,kind,report,output,error,
          capture:{motion_handle_present:typeof motion==='undefined'?null:Boolean(motion),cdp_capture_state:'unknown'}});}
        catch(failure){const errors=report.window_diagnostic_failures??=[];
          errors.push({kind,name:String(failure?.name??'Error').slice(0,100),message:String(failure?.message??failure).slice(0,1000),
            stack:String(failure?.stack??'').slice(0,4000)});if(errors.length>8){errors.shift();report.window_diagnostic_failures_dropped=(report.window_diagnostic_failures_dropped??0)+1;}}
        throw error;
      } finally {await cleanupAwayAuxiliary({other,session,report,kind,primaryError:awayError});}
    };
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
    const liveBattleLayouts=async()=>{
      if(!player)return;
      // Focus-only notifications do not advance the model clock. Use fresh
      // actual AdvanceAt tick reports for the strict elapsed comparison.
      const before=await observation({action:'tick',minT:await mark()});
      check(before.loop.phase==='battle' && !before.paused,'Windows live layout starts in active battle');
      await phaseMatrix('battle');
      const after=await observation({action:'tick',minT:await mark()});
      check(after.loop.phase==='battle' && !after.paused,'Windows live layout remains active battle');
      elapsedTicks(before,after);validateModelObservation(before,reference(before));validateModelObservation(after,reference(after));
      report.lifecycle.push({kind:'live-battle-layout',scope:'existing unfinished reload run',
        viewports:matrix.phaseViewports.map(item=>item.name),before,after});
    };
    const battleLayouts=async()=>{
      // Slow Linux inspection can exceed a whole battle. Windows retains its
      // live native/media matrix; Linux uses the real public Pause control.
      if(player){await screenshot('01-base-first-hit');return;}
      const before=await observation();
      check(before.loop.phase==='battle' && !before.paused,'layout inspection starts in active battle');
      await gameClick('SpeedRate','session',item=>item.phase==='battle' && item.paused);
      const paused=await observation({action:'pause',paused:true,minT:before.t,run:before.run});
      check(paused.loop.phase==='battle','layout inspection paused actual battle');
      validateModelObservation(paused,reference(paused));
      await screenshot('01-base-first-hit');await phaseMatrix('battle');
      const returned=await observation({paused:true,run:paused.run});
      sameDocument(paused,returned);
      check(returned.loop.phase==='battle' && returned.paused,'layout inspection remains paused battle');
      for(const key of ['tick','hull','kills','terminalElapsed']){
        check(returned[key]===paused[key],'paused layout changed '+key,{paused,returned});
      }
      // Keep the same real Pause for mute/input inspection and the explicit
      // hidden-Pause proof below; its final keyboard Resume uses the original
      // counter/time/model oracle. One matrix covers the same paused geometry.
      const record={kind:'paused-battle-layout',covers:['paused battle','explicit Pause'],
        viewports:matrix.phaseViewports.map(item=>item.name),before,paused,returned};
      report.lifecycle.push(record);return record;
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
    await screenshot('00-garage');await phaseMatrix('garage');
    const baselineHitStart=hits.length;
    const startAudio=await mark();const deployed=await gameClick('Deploy','deploy');
    check(deployed.phase==='battle' && deployed.cannonDamage===20,'normal-speed automatic baseline deployed',deployed);
    if(player){await page.evaluate('window.__stFrameProbe.start()');motion=await startMotion(native.context,page,output);}const motionStart=await mark();
    const first=await observeFirstCannonImpact({deployed,start:baselineHitStart,hits,encounters,callbackRecords,
      oracle:modelOracle[`${deployed.activeTier}:${deployed.fittingId}:${deployed.cannonDamage}`],until});const firstHit=first.t;
    check(first.firstFoeHull===10,'first base cannon leaves identical 30 HP foe at 10 HP',first);
    const firstSound=player?await observeFreshCannonAudio({deployed,encounters,callbackRecords,cues,
      oracle:modelOracle[`${deployed.activeTier}:${deployed.fittingId}:${deployed.cannonDamage}`],until}):null;
    if(player)check(true,'baseline fresh cannon/impact admission bound independently of authoritative hit',firstSound);
    await page.waitForTimeout(750);const sound=player?await energy(firstSound.begin,firstSound.end):null;
    if(player)check(sound.maximum_rms>.0005,'rendered cannon/impact output measured',sound);const layoutPause=await battleLayouts();
    const changeSetting=control=>changeLastStandSetting({control,click:name=>gameClick(name,'hud-layout'),
      currentLayout:()=>layouts.at(-1),currentState:()=>states.at(-1),readValue:()=>states.at(-1).muted,
      waitFor:predicate=>until(layouts,0,()=>predicate(),8)});
    const muted=await changeSetting('SettingsMute');check(muted.muted,'actual mute state enabled');const muteStart=await mark();await page.waitForTimeout(1200);
    const mute=await energy(muteStart+150,await mark());if(player)check(mute.maximum_rms<.0005,'mute suppresses rendered output',mute);
    const unmuted=await changeSetting('SettingsMute');check(!unmuted.muted,'actual mute state disabled');
    const pauseBefore=layoutPause?.before??await observation();
    const paused=layoutPause?.paused??await gameKey('SpeedRate','session',item=>item.paused);
    const pausedObservation=layoutPause?.paused??await observation({action:'pause',paused:true,minT:pauseBefore.t,run:pauseBefore.run});
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
    const firstAudio=await saveAudio('first-run',{'cannon-impact':[firstSound.begin,firstSound.end]});
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
    const resumedCheckpoint=await gameClick(lastStandDeploymentControl(states.at(-1),layouts.at(-1)),'resume');await page.waitForTimeout(1200);
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
    const bought=await gameKey('ShopCard_cannonAttackBuy','purchase');check(bought.wallet===savedWave.credits-2 && bought.level===1 && bought.cannonDamage===30,'two salvage commits Cannon Attack level1',bought);
    await gameClick('ShopClose','hud-layout',item=>!item.shopControls.some(control=>control.name==='ShopClose'&&control.active));
    await page.waitForTimeout(600);if(player)check((await energy(purchaseStart,await mark())).maximum_rms>.0005,'rendered purchase cue measured');
    await screenshot('05-purchased');if(player)await saveAudio('workshop',{purchase:[purchaseStart,await mark()]});
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});await focused('purchase reload');
    const again=await until(states,start,item=>item.action==='ready',60);
    check(again.level===1 && again.wallet===savedWave.credits-2 && again.pendingRunId===0 && !again.hasCheckpoint,'purchase reload retains permanent level and spent balance',again);
    check(states.at(-1).fittingId==='repair'&&layouts.at(-1).graphics.some(item=>item.active&&item.path.endsWith('/GarageFittingName')&&item.text.toUpperCase().includes('FIELD REPAIR')),'same repair fitting retained after upgrade in its visible garage card');
    await resize(captureViewport);const hitStart=hits.length;const upgradedDeployment=await gameClick(lastStandDeploymentControl(states.at(-1),layouts.at(-1)),'deploy');
    const noCaptureStart=player?await page.evaluate('window.__stFrameProbe.start()'):null;
    const upgradedHit=await observeFirstCannonImpact({deployed:upgradedDeployment,start:hitStart,hits,encounters,callbackRecords,
      oracle:modelOracle[`${upgradedDeployment.activeTier}:${upgradedDeployment.fittingId}:${upgradedDeployment.cannonDamage}`],until});const noCaptureEnd=upgradedHit.t;
    if(player){
    const noCaptureFrames=await page.evaluate('window.__stFrameProbe.stop()');write('animation-frame-no-capture-timestamps.json',{timestamps:noCaptureFrames,active_window:[noCaptureStart,noCaptureEnd]});
    report.frame_timing.no_capture_active=frameTiming(noCaptureFrames,noCaptureStart,noCaptureEnd);
    const captured=report.frame_timing.capture_active['first-foe-before-impact'],uncaptured=report.frame_timing.no_capture_active;
    check(captured.p95_ms<=uncaptured.p95_ms*1.5+5,'screencast pre-impact p95 within 50 percent plus5ms',{captured,uncaptured});
    }
    check(upgradedHit.firstFoeHull===0 && upgradedHit.kills>=1,'same first foe one-hit defeated by real 30 damage',upgradedHit);
    const upgradedSound=player?await observeFreshCannonAudio({deployed:upgradedDeployment,encounters,callbackRecords,cues,
      oracle:modelOracle[`${upgradedDeployment.activeTier}:${upgradedDeployment.fittingId}:${upgradedDeployment.cannonDamage}`],until}):null;
    if(player)check(true,'upgraded fresh cannon/impact admission bound independently of authoritative hit',upgradedSound);
    await screenshot('07-upgraded-first-hit');
    const nextBoundary=states.at(-1).completedWave+1;
    const interval=await away('hidden',12000);
    await until(states,0,item=>item.load===load && item.completedWave>=nextBoundary && item.saveState==='ready',60);
    const afterBackground=await observation({minT:interval.recovered,run:interval.before.run});validateModelObservation(afterBackground,reference(afterBackground));
    const checkpointState=await gameKey('SpeedRate','session',item=>item.paused);
    const backgroundSaved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    validateBackgroundCheckpoint({interval,after:afterBackground,checkpointState,saved:backgroundSaved});
    check(backgroundSaved.checkpoint?.encounter.completedWave>=nextBoundary && backgroundSaved.credits===checkpointState.wallet &&
      backgroundSaved.pendingDefeat===null,'background wave rewards and checkpoint share one durable save');
    report.lifecycle.push({kind:'background-wave',interval,after:afterBackground,checkpointState,saved:backgroundSaved});
    await phaseMatrix('background-checkpoint');
    const quietStart=await mark();await page.waitForTimeout(900);await noReplay(quietStart,await mark());
    await gameKey('SpeedRate','session',item=>!item.paused);
    const terminalBefore=await observation(),terminalStart=states.length,terminalOracle=reference(terminalBefore);
    const expectedTerminal=Object.values(terminalOracle).at(-1);
    check(expectedTerminal.status==='Defeated','current wave oracle has a natural terminal');
    let terminalPaused,terminalResumed;
    if(player){
      const prepared=await armGameClick('SpeedRate','session',item=>item.phase==='settling' && item.paused);
      await until(states,terminalStart,item=>item.load===load && item.phase==='settling',
        (expectedTerminal.tick-terminalBefore.tick)*.05+30);
      terminalPaused=await prepared();await phaseMatrix('settling');
      terminalResumed=await gameClick('SpeedRate','session',item=>item.phase==='settling' && !item.paused);
    }
    const naturalResult=await until(states,terminalStart,item=>isWaveResultFor(terminalBefore,item),
      (expectedTerminal.tick-terminalBefore.tick)*.05+30);
    const naturalSaved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    const naturalProof=validateWaveTerminal({before:terminalBefore,result:naturalResult,saved:naturalSaved,
      states,encounters,layouts,oracle:terminalOracle});
    report.lifecycle.push({kind:'wave-terminal',mode:'foreground',evidence:naturalProof,
      ...(player?{interaction:{paused:terminalPaused,resumed:terminalResumed,viewports:matrix.phaseViewports.map(v=>v.name)}}:{})});
    check(true,'natural defeat finalizes checkpoint without a second payout',naturalProof);
    await phaseMatrix('result');
    if(player)await saveAudio('second-run',{'cannon-impact':[upgradedSound.begin,upgradedSound.end],
      defeat:[naturalProof.staged.t-250,naturalProof.staged.t+750]});
    const continued=await gameKey('Claim','continue');
    check(continued.wallet===naturalSaved.credits && continued.pendingRunId===0 && !continued.hasCheckpoint,
      'Continue cannot pay a second reward');
    start=states.length;load++;await page.reload({waitUntil:'domcontentloaded'});await focused('terminal reload');
    const finalReload=await until(states,start,item=>item.action==='ready',60);
    check(!finalReload.hasCheckpoint && finalReload.runId===0 && finalReload.pendingRunId===0 &&
      assertWaveSavePreserved(naturalSaved,JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))),
      'finalized natural defeat cannot resume after reload');
    report.lifecycle.push({kind:'terminal-reload',saved:JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)),state:finalReload});
    await gameClick(lastStandDeploymentControl(states.at(-1),layouts.at(-1)),'deploy');
    const backgroundBefore=await observation(),backgroundOracle=reference(backgroundBefore);
    const backgroundExpected=Object.values(backgroundOracle).at(-1),backgroundStart=states.length;
    check(backgroundExpected.status==='Defeated','background actual wave model has natural terminal');
    const terminalAway=await away('hidden',(backgroundExpected.tick-backgroundBefore.tick)*50+1500,{
      waitHidden:async({before,begin})=>assertWaveStillHidden(before,begin,trace)});
    const backgroundResult=await until(states,backgroundStart,item=>isWaveResultFor(backgroundBefore,item),60);
    const backgroundFinal=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    const backgroundProof=validateWaveTerminal({before:backgroundBefore,result:backgroundResult,saved:backgroundFinal,
      states,encounters,layouts,oracle:backgroundOracle});
    terminalAway.before=backgroundBefore;
    terminalAway.events=waveIntervalEvents(backgroundBefore,{...backgroundBefore,t:terminalAway.recovered},trace);
    const continuation=validateBackgroundWaveTerminal({interval:terminalAway,evidence:backgroundProof,callbackRecords,states,cues});
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
    const cueNames=messages.filter(item=>!item.text.startsWith('ST_TEST_RUNTIME ') && item.text.includes('ST_LS_AUDIO event='))
      .map(item=>item.text.split('ST_LS_AUDIO event=')[1].split('\n')[0]);
    if(player){
      check(['cannon','impact','destruction','defeat','purchase'].every(cue=>cueNames.includes(cue)),'all five procedural cues admitted',cueNames);
      report.qualification.procedural_cues='pass';
    }

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
    },()=>{
      try{persistLastStandJourneyEvidence(report,{messages,failures,httpErrors,expectedFaults,observerFailures,
        states,encounters,callbackRecords,hits,layouts,cues,trace,requests},write,message=>console.error(message));}
      finally{console.log(`LAST_STAND_LOOP_EVIDENCE=${output}`);}
    },originalError);}catch(error){throw originalError??error;}
    // A callback can arrive while cleanup awaits. Its first error still
    // wins after cleanup and persistence complete, even after a return.
    throwObserverFailure();
  }
}
const FRAME_PROBE = "(() => {\n  let active = false;\n  let frames = [];\n  let generation = 0;\n  function sample(t, current) {\n    if (!active || current !== generation) return;\n    if (frames.length < 30000) frames.push(t);\n    requestAnimationFrame(next => sample(next, current));\n  }\n  window.__stFrameProbe = {\n    start() {\n      frames = []; active = true; generation++;\n      const current = generation;\n      requestAnimationFrame(t => sample(t, current));\n      return performance.now();\n    },\n    stop() { active = false; generation++; return frames; }\n  };\n})()";
export const AUDIO_CAPTURE = "(() => {\n  const original = AudioNode.prototype.connect;\n  const originalDisconnect = AudioNode.prototype.disconnect;\n  const captures = [];\n  const byContext = new WeakMap();\n  const mirrored = new WeakMap();\n  const supported = typeof MediaRecorder !== 'undefined' &&\n    MediaRecorder.isTypeSupported('audio/webm;codecs=opus');\n  window.__stAudioCapture = {supported, captures, errors: []};\n  if (!supported) return;\n  AudioNode.prototype.connect = function(...args) {\n    const result = original.apply(this, args);\n    if (args[0] !== this.context.destination) return result;\n    try {\n      let capture = byContext.get(this.context);\n      if (!capture) {\n        const stream = this.context.createMediaStreamDestination();\n        const analyser = this.context.createAnalyser();\n        analyser.fftSize = 2048;\n        const chunks = [];\n        const recorder = new MediaRecorder(stream.stream, {mimeType:'audio/webm;codecs=opus'});\n        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };\n        recorder.onerror = e => window.__stAudioCapture.errors.push(String(e.error || e));\n        capture = {stream, analyser, recorder, chunks, samples: [], started: null, context:this.context,\n          timer_active:false, timer_started:null, timer_stopped:null, timer_ticks:0, last_timer_tick:null, finish_count:0};\n        byContext.set(this.context, capture);\n        captures.push(capture);\n        const context = this.context;\n        const startIfRunning = () => {\n          if (context.state === 'running' && recorder.state === 'inactive' && capture.started === null) {\n            capture.started = performance.now();\n            recorder.start(1000);\n          }\n        };\n        context.addEventListener('statechange', startIfRunning);\n        startIfRunning();\n        const values = new Float32Array(analyser.fftSize);\n        capture.timer_started = performance.now();\n        capture.timer = setInterval(() => {\n          analyser.getFloatTimeDomainData(values);\n          let power = 0, peak = 0;\n          for (const value of values) { power += value * value; peak = Math.max(peak, Math.abs(value)); }\n          capture.timer_ticks++; capture.last_timer_tick = performance.now();\n          if (capture.samples.length < 30000)\n            capture.samples.push({t:capture.last_timer_tick, rms:Math.sqrt(power / values.length), peak});\n        }, 20);\n        capture.timer_active = true;\n      }\n      const outputIndex = args.length > 1 ? args[1] : 0;\n      original.call(this, capture.stream, outputIndex);\n      original.call(this, capture.analyser, outputIndex);\n      mirrored.set(this, capture);\n    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }\n    return result;\n  };\n  AudioNode.prototype.disconnect = function(...args) {\n    const result = originalDisconnect.apply(this, args);\n    const capture = mirrored.get(this);\n    if (!capture) return result;\n    if (!args.length) { mirrored.delete(this); return result; }\n    if (typeof args[0] === 'number' || args[0] !== this.context.destination) return result;\n    try {\n      const mirrorArgs = [capture.stream, ...args.slice(1)];\n      originalDisconnect.apply(this, mirrorArgs);\n      mirrorArgs[0] = capture.analyser;\n      originalDisconnect.apply(this, mirrorArgs);\n    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }\n    return result;\n  };\n  window.__stAudioCapture.finish = async () => {\n    const result = [];\n    for (const capture of captures) {\n      clearInterval(capture.timer);\n      capture.timer_active = false; capture.timer_stopped = performance.now(); capture.finish_count++;\n      if (capture.recorder.state !== 'inactive') {\n        await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });\n      }\n      const bytes = new Uint8Array(await new Blob(capture.chunks, {type:'audio/webm'}).arrayBuffer());\n      let binary = '';\n      for (let i = 0; i < bytes.length; i += 16384)\n        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));\n      result.push({audio:btoa(binary), samples:capture.samples, started:capture.started,\n        bytes:bytes.length, mime:'audio/webm;codecs=opus'});\n    }\n    return {supported, errors:window.__stAudioCapture.errors, captures:result};\n  };\n})();";

// Packaged WebGL qualification through ordinary input in disposable profiles.
// Rejection files are labeled negative fixtures; no gameplay save is seeded.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {admitJourneyBase,packagedRuntimeSnapshot,assertPackagedRuntimeParity,fetchBoundRuntime,
  assertServedBytes,LAST_STAND_HELPER_INPUTS} from '../e2e/helpers/lastStandJourney.mjs';
import {createLastStandBrowserActor,lastStandObservedControls} from '../e2e/helpers/lastStandBrowserActor.mjs';
import {WAVE_JOURNEY_PROBE} from '../e2e/helpers/lastStandWaveJourney.mjs';

const root=resolve(import.meta.dirname,'..'),saveKey='singedTerra.lastStand.prototype.v1';
const preferenceKey='singedTerra.lastStand.preferences.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const BACKUP_HEADER='SINGED_TERRA_LAST_STAND_BACKUP 1\n',BACKUP_LIMIT=128*1024;
const inputs=[...new Set(['scripts/last-stand-continuity.mjs','scripts/ci/lastStandContinuity.test.mjs',
  'e2e/helpers/lastStandBrowserActor.mjs','e2e/helpers/lastStandJourney.mjs',...LAST_STAND_HELPER_INPUTS,
  'e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandWaveJourney.mjs',
  ...[1,2,3,4].map(version=>'campaign-unity/Tools/contracts/last-stand-observation-v'+version+'.json'),
  ...['LastStandProgressionBackup','LastStandLoopContinuity','LastStandSettingsHud','LastStandGuidance',
    'LastStandStore','LastStandProgression','LastStandSaveJson','LastStandProgressionSave','LastStandResearchPresentation',
    'Platform/LastStandUnityBackupTransport','Platform/LastStandBackupTransport'].map(name=>'campaign-unity/Unity/Assets/Scripts/'+name+'.cs'),
  'campaign-unity/Unity/Assets/Plugins/WebGL/LastStandBackup.jslib',
  'campaign-unity/Unity/Assets/Plugins/WebGL/LastStandStorage.jslib'])];
export const continuityInputHashes=(sourceRoot=root)=>Object.fromEntries(inputs.map(path=>[path,sha(readFileSync(resolve(sourceRoot,path)))]));

// This inspects observed download framing; production owns full save admission.
export function decodeObservedBackup(bytes){
  assert.ok(bytes instanceof Uint8Array&&bytes.length>BACKUP_HEADER.length&&bytes.length<=BACKUP_LIMIT,'Bounded backup bytes');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  assert.ok(text.startsWith(BACKUP_HEADER),'Exact backup framing without a BOM');
  const raw=text.slice(BACKUP_HEADER.length),profile=JSON.parse(raw);
  assert.ok(profile&&typeof profile==='object'&&!Array.isArray(profile),'Backup contains a profile object');
  return {raw,profile};
}
export function continuityRejectionFixtures(document){
  const {profile}=decodeObservedBackup(document),encode=value=>Buffer.from(BACKUP_HEADER+JSON.stringify(value));
  assert.ok(Number.isSafeInteger(profile.version)&&profile.version>0);
  return [
    {id:'malformed-json',bytes:Buffer.from(BACKUP_HEADER+'{')},
    {id:'invalid-utf8',bytes:Buffer.concat([Buffer.from(BACKUP_HEADER),Buffer.from([0xff])])},
    {id:'future-format',bytes:Buffer.from(BACKUP_HEADER.replace(' 1\n',' 2\n')+JSON.stringify(profile))},
    {id:'future-save',bytes:encode({...profile,version:profile.version+1})},
    {id:'unknown-field',bytes:encode({...profile,continuityUnexpected:true})},
    {id:'oversize',bytes:Buffer.alloc(BACKUP_LIMIT+1,0x61)}
  ].map(row=>({...row,scope:'Synthetic rejection fixture; format/version variants reference an actual export. Never valid or earned progression evidence.'}));
}
export function assertContinuityProgress(expected,actual){
  // Fresh/one-wave profiles have no running research. Reconcile advances only
  // these bookkeeping fields. Every other field, including history, is compared.
  const stable=value=>{const copy=structuredClone(value);delete copy.revision;
    if(copy.research){delete copy.research.revision;delete copy.research.lastObservedUtcMilliseconds;}return copy;};
  assert.deepEqual(stable(actual),stable(expected),'Gameplay progress and research remain exact apart from clock bookkeeping');
}
export function continuityResumeControl(layout){
  const candidates=lastStandObservedControls(layout).filter(item=>['Deploy','Redeploy'].includes(item.name)&&item.active&&item.interactable);
  assert.equal(candidates.length,1,'Exactly one available checkpoint resume action');
  assert.equal(candidates[0].label,'RESUME RUN','Checkpoint action must explicitly offer resume');
  return candidates[0].name;
}

async function main(){
  const base=admitJourneyBase(process.env.E2E_LIVE_URL??'http://127.0.0.1:4174/singedTerra/');
  assert.ok(['127.0.0.1','localhost'].includes(base.hostname)&&base.port==='4174','Use the sole current localhost preview on port 4174');
  for(const tool of ['verify-last-stand-source.mjs','verify-last-stand.mjs'])
    execFileSync(process.execPath,[resolve(root,'scripts/assets',tool)],{cwd:root,stdio:'pipe'});
  const packaged=packagedRuntimeSnapshot(),inputHashes=continuityInputHashes();
  const runtime=JSON.parse(readFileSync(resolve(root,'client/public/last-stand/asset-manifest.json')));
  for(const [path,expected] of Object.entries({...runtime.files,'index.html':runtime.wrapperSha256}))
    assertServedBytes(await fetchBoundRuntime(base,path),expected);
  const output=resolve(process.argv[2]??resolve(root,'campaign-unity/Evidence/player-continuity',new Date().toISOString().replace(/[:.]/g,'-')));
  mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
  const report={schema:'last-stand-continuity-browser/v1',status:'running',packaged,inputs:inputHashes,
    scope:'Packaged WebGL, isolated profiles, ordinary trusted controls, real browser file choosers/downloads, earned wave-one checkpoint and screenshots. Synthetic invalid files test refusal only. Not Windows/Android pickers, hardware audio, device/thermal/endurance, owner acceptance or hosted CI.',
    runs:[],checks:[],downloads:[],imports:[],rejectionFixtures:[]};
  const resultPath=resolve(output,'result.json'),persist=()=>writeFileSync(resultPath,JSON.stringify(report,null,2));
  const check=(name,fn)=>{fn();report.checks.push({name,pass:true});persist();};
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});const contexts=[];
  const createContext=async()=>{const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,
    hasTouch:true,acceptDownloads:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
    contexts.push(context);await context.addInitScript(WAVE_JOURNEY_PROBE);return context;};
  const createActor=(context,id,saveState='ready')=>createLastStandBrowserActor({context,id,saveState,report,output,base,persist});
  const controls=actor=>lastStandObservedControls(actor.layout());
  const graphic=(actor,name)=>JSON.parse(actor.layout().raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics
    .find(item=>item.active&&item.path.endsWith('/'+name));
  const text=(actor,name)=>graphic(actor,name)?.text??'';
  const control=(actor,name)=>controls(actor).find(item=>item.name===name);
  const rawSave=actor=>actor.page.evaluate(key=>localStorage.getItem(key),saveKey);
  const preferences=actor=>actor.page.evaluate(key=>localStorage.getItem(key),preferenceKey);
  const closeMenu=async actor=>{if(actor.state().menu){await actor.click('SettingsClose');await actor.until(()=>actor.state().menu==='');}};
  const openSave=async actor=>{await closeMenu(actor);await actor.click('Menu');await actor.click('MenuSettings');await actor.click('SettingsTab3');
    await actor.until(()=>control(actor,'DataExport')?.active);};
  const exportBackup=async(actor,id)=>{
    const before=await rawSave(actor);
    const [download]=await Promise.all([actor.page.waitForEvent('download',{timeout:15000}),actor.click('DataExport')]);
    assert.equal(await download.failure(),null);assert.match(download.suggestedFilename(),/^last-stand-backup-\d{8}-\d{6}\.laststand$/);
    const temporary=await download.path();assert.ok(temporary);assert.ok(statSync(temporary).size<=BACKUP_LIMIT,'Bound before reading download');
    const bytes=readFileSync(temporary),decoded=decodeObservedBackup(bytes),after=await rawSave(actor);
    assert.ok(decoded.raw===before||decoded.raw===after,'Export must equal observed confirmed profile bytes');
    const path=resolve(output,id+'.laststand');await download.saveAs(path);assert.equal(sha(readFileSync(path)),sha(bytes));
    const record={id,path,bytes:bytes.length,sha256:sha(bytes),suggestedFilename:download.suggestedFilename(),profile:decoded.profile};
    report.downloads.push(record);persist();return record;
  };
  const chooseBackup=async(actor,file,expected='preview')=>{
    assert.ok(statSync(file.path).size<=BACKUP_LIMIT+1,'Only bounded qualification files can reach the picker');
    const stateStart=actor.run.states.length;
    const [chooser]=await Promise.all([actor.page.waitForEvent('filechooser',{timeout:15000}),actor.click('DataImport')]);
    assert.equal(chooser.isMultiple(),false);
    const before=await rawSave(actor);await chooser.setFiles(file.path);
    await actor.until(()=>actor.run.states.slice(stateStart).some(state=>state.action==='backup-preview'));
    await actor.until(()=>expected==='preview'?actor.state().menu==='backup-preview':actor.state().menu!=='backup-preview');
    const after=await rawSave(actor);
    check(file.id+' file admission does not replace progress',()=>{
      if(expected==='preview')assert.equal(after,before,'Preview admission must be read-only');
      else assertContinuityProgress(JSON.parse(before),JSON.parse(after));
    });
    report.imports.push({id:file.id,path:file.path,sha256:sha(readFileSync(file.path)),expected,via:'real browser filechooser',
      beforeSha256:sha(before),afterSha256:sha(after),state:actor.state()});persist();
  };
  const returnGarage=async(actor,label)=>{
    const before=await actor.stored(label+'-before');assert.ok(before.checkpoint);
    await openSave(actor);check(label+' live combat prevents import',()=>assert.equal(control(actor,'DataImport').interactable,false));
    await actor.click('DataGarage');await actor.until(()=>actor.state().menu==='confirm');await actor.click('ConfirmCancel');
    check(label+' cancelling Return to garage keeps live session',()=>assert.equal(actor.state().phase,'battle'));
    await openSave(actor);await actor.click('DataGarage');await actor.click('ConfirmProceed');
    await actor.until(()=>actor.state().phase==='garage'&&actor.state().menu==='save');
    const after=await actor.stored(label+'-after');
    check(label+' keeps the confirmed checkpoint and resources with current status',()=>{
      assert.deepEqual(after.checkpoint,before.checkpoint);assert.equal(after.credits,before.credits);
      assert.match(text(actor,'SettingsBody'),/Checkpoint kept/);assert.doesNotMatch(text(actor,'SettingsBody'),/Restore cancelled/);
    });
    return after;
  };
  const resumePaused=async(actor,expected,label)=>{
    await closeMenu(actor);await actor.click(continuityResumeControl(actor.layout()));await actor.until(()=>actor.state().phase==='battle'&&actor.state().paused);
    const resumed=actor.state();await actor.page.waitForTimeout(1100);await actor.click('Menu');
    check(label+' explicitly resumes the checkpoint paused without combat catch-up',()=>{
      const stable=actor.state(),encounter=expected.checkpoint.encounter;
      for(const state of [resumed,stable]){assert.equal(state.paused,true);assert.equal(state.tick,encounter.tick);
        assert.equal(state.hull,encounter.hull);assert.equal(state.completedWave,encounter.completedWave);assert.equal(state.checkpointWave,encounter.completedWave);}
    });
    assert.deepEqual((await actor.stored(label)).checkpoint,expected.checkpoint);
  };
  try{
    const context=await createContext();let actor=await createActor(context,'continuity');
    check('current v4 packet and fresh profile are present',()=>{assert.equal(actor.layout().schema,'singedterra-last-stand-observation/v4');assert.equal(actor.state().wallet,0);assert.equal(actor.state().hasCheckpoint,false);});
    await actor.click('Menu');check('fresh profile has an actionable optional introduction',()=>assert.equal(control(actor,'MenuGuidance').label,'LEARN THE CONTROLS'));
    await actor.click('MenuGuidance');await actor.until(()=>actor.state().menu==='help');await actor.shot('first-session-help');
    await openSave(actor);
    check('fresh save hides a nonexistent previous-save action',()=>assert.equal(control(actor,'DataPrevious').active,false));
    const fresh=await exportBackup(actor,'fresh-profile');assert.equal(fresh.profile.checkpoint,null);
    for(const dismissal of ['close-button','escape']){
      await chooseBackup(actor,fresh);const before=await rawSave(actor);
      if(dismissal==='close-button')await closeMenu(actor);
      else{
        const start=actor.run.inputs.length;await actor.page.keyboard.press('Escape');
        await actor.until(()=>actor.state().menu==='');
        await actor.until(()=>actor.run.inputs.slice(start).some(event=>event.kind==='keyup'),5);
        const edges=actor.run.inputs.slice(start).filter(event=>['keydown','keyup'].includes(event.kind));
        assert.deepEqual(edges.map(event=>event.kind),['keydown','keyup']);
        assert.ok(edges.every(event=>event.trusted&&event.code==='Escape'));
        actor.run.actions.push({name:'escape-preview',at:Date.now(),inputStart:start,inputEnd:actor.run.inputs.length});
      }
      await openSave(actor);const after=await actor.stored(dismissal+'-cancelled-preview');
      check(dismissal+' cancels preview and removes stale restore instructions',()=>{
        assertContinuityProgress(JSON.parse(before),after);assert.match(text(actor,'SettingsBody'),/cancelled/);
        assert.doesNotMatch(text(actor,'SettingsBody'),/Review the backup before replacing/);
        assert.equal(control(actor,'BackupReplace').active,false);assert.equal(control(actor,'DataPrevious').active,false);
      });
    }
    await actor.click('SettingsTab2');await actor.click('TutorialTips');await actor.click('PurchaseSuggestions');
    const retainedPreferences=await preferences(actor);
    await closeMenu(actor);await actor.click('Menu');
    check('tips and spending suggestions can both be disabled while Help remains available',()=>{
      assert.equal(actor.state().tutorialTips,false);assert.equal(actor.state().purchaseSuggestions,false);
      assert.equal(control(actor,'MenuGuidance').active,false);assert.equal(control(actor,'MenuHelp').interactable,true);
    });

    const titles=['Controls & game speed','Waves & rewards','Returning to your run','Tiers & fittings',
      'Run & permanent upgrades','Using the Research Lab','Local saves & backups'];
    for(const [label,viewport] of [['desktop',{width:1280,height:800}],['portrait',{width:390,height:844}],['short',{width:568,height:266}]]){
      await actor.page.setViewportSize(viewport);await actor.geometry();await closeMenu(actor);
      if(label==='short')for(const width of [500,568]){
        await actor.page.setViewportSize({width,height:266});
        // The host header wraps differently at 500px. Bound the actual game
        // canvas, not the outer page height, to the declared minimum profile.
        const host=await actor.page.locator('#unity-canvas').boundingBox();assert.ok(host);
        await actor.page.setViewportSize({width,height:Math.ceil(host.y+142)});const compact=await actor.geometry();
        check(width+'px compact action captions fit without word wrapping',()=>{
          assert.equal(Math.round(compact.canvas.height),142,'Declared compact game height');
          for(const id of ['DeployText','ShopEntryText','ResearchEntryText']){
            const observed=graphic(actor,id);assert.ok(observed&&observed.preferredWidthCss<=observed.width+.5,id+' fits one line');
            assert.ok(observed.fontCssSize>=14,id+' retains readable type');
          }
        });await actor.shot(width===568?'short-garage':'short-minimum-garage');
      }
      await actor.click('Menu');await actor.click('MenuHelp');
      for(let step=0;step<6&&control(actor,'HelpPrevious').interactable;step++)await actor.click('HelpPrevious');
      for(let index=0;index<titles.length;index++){
        await actor.until(()=>text(actor,'SelectionName')===titles[index]);
        check(label+' Help topic '+(index+1)+' has specific guidance and a bounded selector',()=>{
          assert.ok(text(actor,'SettingsBody').length>80);assert.match(text(actor,'SettingsDetail'),new RegExp('Topic '+(index+1)+' of 7'));
          assert.equal(control(actor,'HelpPrevious').interactable,index>0);assert.equal(control(actor,'HelpNext').interactable,index<6);
          if(index===6)assert.match(text(actor,'SettingsBody'),/Settings > Save/);
        });
        await actor.shot(label+'-help-'+(index+1));if(index<6)await actor.click('HelpNext',{touch:label!=='desktop'});
      }
      await actor.click('HelpAction',{touch:label!=='desktop'});await actor.until(()=>actor.state().menu==='save');
      const measured=await actor.geometry();
      check(label+' backup Help action opens working Save controls',()=>{
        assert.match(text(actor,'SettingsBody'),/PROGRESS SAVED/);assert.equal(control(actor,'DataExport').interactable,true);assert.equal(control(actor,'DataImport').interactable,true);
        if(label==='short')assert.equal(Math.round(measured.canvas.height),142,'Exercise the declared 142px canvas');
      });
      const exported=await exportBackup(actor,label+'-save');await chooseBackup(actor,exported);
      const before=await rawSave(actor);await actor.shot(label+'-restore-preview');
      check(label+' preview separates current progress, backup and replacement warning',()=>{
        const body=text(actor,'SettingsBody');for(const phrase of ['ON THIS DEVICE','IN THIS BACKUP','PERMANENT UPGRADES','CURRENT RESEARCH','BACKUP RESEARCH','never added together'])assert.ok(body.includes(phrase));
      });
      assert.equal(await rawSave(actor),before,'Inspection must not write the profile');await actor.click('BackupCancel',{touch:label!=='desktop'});
      const cancelled=await actor.stored(label+'-cancelled');
      check(label+' cancelling preview preserves gameplay',()=>assertContinuityProgress(JSON.parse(before),cancelled));
      await actor.shot(label+'-save-actions');
    }

    await actor.page.setViewportSize({width:1280,height:800});await actor.geometry();await closeMenu(actor);await actor.click('Deploy');
    await actor.until(()=>actor.state().phase==='battle');await actor.until(()=>actor.state().completedWave>=1,100);
    await actor.click('SpeedRate');await actor.until(()=>actor.state().paused);const earned=await actor.stored('earned-wave-one');
    check('ordinary combat earns a real checkpoint',()=>{assert.ok(earned.checkpoint.encounter.completedWave>=1);assert.ok(earned.credits>fresh.profile.credits);});
    const garage=await returnGarage(actor,'earned-return');await actor.shot('earned-checkpoint-save');
    const checkpoint=await exportBackup(actor,'earned-checkpoint');assert.deepEqual(checkpoint.profile.checkpoint,garage.checkpoint);
    await chooseBackup(actor,fresh);const previewRaw=await rawSave(actor);await actor.shot('different-progress-preview');
    check('comparison discloses an older backup before replacing earned progress',()=>{
      assert.match(text(actor,'SettingsBody'),/Wave [1-9][0-9]* completed/);assert.match(text(actor,'SettingsBody'),/No active checkpoint/);
    });
    await actor.click('BackupCancel');assertContinuityProgress(JSON.parse(previewRaw),await actor.stored('different-preview-cancelled'));
    await chooseBackup(actor,fresh);const predecessor=await rawSave(actor);await actor.click('BackupReplace');
    await actor.until(()=>actor.state().action==='backup-restored'&&actor.state().saveState==='ready');
    const restoredFresh=await actor.stored('fresh-restored');
    check('explicit Replace restores the imported gameplay rather than adding rewards',()=>assertContinuityProgress(fresh.profile,restoredFresh));
    check('checkpoint-free restoration offers a valid continuation and retained predecessor',()=>{
      assert.doesNotMatch(text(actor,'SettingsBody'),/Resume your checkpoint/);assert.match(text(actor,'SettingsBody'),/Close this menu to continue/);
      assert.equal(control(actor,'DataPrevious').active,true);assert.equal(control(actor,'DataPrevious').interactable,true);
    });
    assert.equal(await preferences(actor),retainedPreferences);
    assert.equal(await actor.page.evaluate(()=>localStorage.getItem('singedTerra.lastStand.restore.v1')),predecessor,'Exact predecessor is retained independently');
    await actor.click('DataPrevious');await actor.until(()=>actor.state().menu==='backup-preview');await actor.shot('previous-save-preview');
    await actor.click('BackupReplace');await actor.until(()=>actor.state().action==='backup-restored'&&actor.state().saveState==='ready');
    const recovered=await actor.stored('previous-save-restored');assertContinuityProgress(JSON.parse(predecessor),recovered);
    check('Previous Save restores the retained checkpoint and leaves device preferences intact',()=>{assert.deepEqual(recovered.checkpoint,checkpoint.profile.checkpoint);assert.equal(actor.state().tutorialTips,false);assert.equal(actor.state().purchaseSuggestions,false);});
    await closeMenu(actor);await actor.page.setViewportSize({width:568,height:266});await actor.geometry();await actor.shot('short-resume-garage');
    const recoveryBefore=await rawSave(actor);
    for(const [key,field] of [['End','SaveStatus'],['Home','PhaseHeading']]){
      const start=actor.run.inputs.length;await actor.page.keyboard.press(key);
      await actor.until(()=>{
        const row=graphic(actor,field);return row?.hasClip&&row.y>=row.clip.y-.5&&row.y+row.height<=row.clip.y+row.clip.height+.5;
      });
      await actor.until(()=>actor.run.inputs.slice(start).some(event=>event.kind==='keyup'),5);
      const edges=actor.run.inputs.slice(start).filter(event=>['keydown','keyup'].includes(event.kind));
      assert.deepEqual(edges.map(event=>event.kind),['keydown','keyup']);assert.ok(edges.every(event=>event.trusted&&event.code===key));
      actor.run.actions.push({name:'recovery-'+key,at:Date.now(),inputStart:start,inputEnd:actor.run.inputs.length});
      check('short recovery '+key+' reveals complete '+field,()=>{
        const row=graphic(actor,field);assert.ok(row.height+1>=row.preferredHeightCss);assert.ok(row.text.length>0);
      });await actor.shot('short-recovery-'+key.toLowerCase());
    }
    assert.equal(await rawSave(actor),recoveryBefore,'Reading the checkpoint summary does not change gameplay');
    await actor.page.setViewportSize({width:1280,height:800});await actor.geometry();
    await actor.reload();await resumePaused(actor,recovered,'reload-resume');await returnGarage(actor,'resumed-return');
    await actor.page.close();actor=await createActor(context,'reopened');
    await resumePaused(actor,recovered,'closed-tab-resume');await returnGarage(actor,'closed-tab-return');
    for(const file of report.downloads)check(file.id+' download survives close and reload',()=>assert.equal(sha(readFileSync(file.path)),file.sha256));

    mkdirSync(resolve(output,'rejection-fixtures'));
    for(const fixture of continuityRejectionFixtures(readFileSync(checkpoint.path))){
      const path=resolve(output,'rejection-fixtures',fixture.id+'.laststand');writeFileSync(path,fixture.bytes,{flag:'wx'});
      report.rejectionFixtures.push({id:fixture.id,path,bytes:fixture.bytes.length,sha256:sha(fixture.bytes),scope:fixture.scope,derivedFrom:checkpoint.sha256});
      const before=await actor.stored(fixture.id+'-before');await chooseBackup(actor,{...fixture,path},'refusal');
      const after=await actor.stored(fixture.id+'-after');
      check(fixture.id+' is refused without changing the gameplay save',()=>{
        assertContinuityProgress(before,after);assert.equal(control(actor,'BackupReplace').active,false);
        assert.match(text(actor,'SettingsBody'),/could not be read|supported Last Stand backup|damaged|unsupported/);
      });await actor.shot(fixture.id+'-refused');
    }

    await chooseBackup(actor,checkpoint);const ownerBefore=await rawSave(actor);
    const second=await createActor(context,'second-tab','blocked');await openSave(second);
    check('a second real tab cannot import or replace the owned save',()=>{
      assert.equal(second.state().saveState,'blocked');assert.match(text(second,'SettingsBody'),/SAVE ACCESS UNAVAILABLE|Another Last Stand tab|This tab cannot save/);
      assert.equal(control(second,'DataImport').interactable,false);assert.equal(control(second,'BackupReplace').active,false);
    });await second.shot('ownership-refused');await second.click('DataRetry');
    assert.equal(second.state().saveState,'blocked');assert.equal(await rawSave(second),ownerBefore);await second.page.close();
    await actor.click('BackupCancel');assertContinuityProgress(JSON.parse(ownerBefore),await actor.stored('owner-preview-kept'));
    await context.close();

    const portableContext=await createContext(),portable=await createActor(portableContext,'portable-restore');await openSave(portable);
    await chooseBackup(portable,checkpoint);await portable.click('BackupReplace');
    await portable.until(()=>portable.state().action==='backup-restored'&&portable.state().saveState==='ready');
    const imported=await portable.stored('portable-restored');assertContinuityProgress(checkpoint.profile,imported);
    check('downloaded file restores through the real picker into a second empty isolated profile',()=>{
      assert.deepEqual(imported.checkpoint,checkpoint.profile.checkpoint);assert.equal(portable.state().tutorialTips,true);assert.equal(portable.state().purchaseSuggestions,true);
    });await portable.shot('portable-restored');await resumePaused(portable,imported,'portable-resume');
    for(const run of report.runs)check(run.id+' has no browser errors',()=>assert.deepEqual(run.errors,[]));
    assertPackagedRuntimeParity(packaged,packagedRuntimeSnapshot());assert.deepEqual(continuityInputHashes(),inputHashes);
    report.status='pass';
  }catch(error){
    report.status='failed';report.error=String(error.stack??error);process.exitCode=1;report.failureScreenshots=[];
    for(const context of contexts)for(const page of context.pages())if(!page.isClosed()){
      const path=resolve(output,'failure-'+report.failureScreenshots.length+'.png');
      try{await page.screenshot({path});report.failureScreenshots.push({path,sha256:sha(readFileSync(path)),viewport:page.viewportSize()});}
      catch(captureError){report.failureScreenshots.push({path,error:String(captureError)});}
    }
  }
  finally{for(const context of contexts)await context.close().catch(()=>{});await browser.close();persist();
    console.log(JSON.stringify({status:report.status,checks:report.checks.length,result:resultPath,error:report.error}));}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  await main().catch(error=>{console.error(error);process.exitCode=1;});

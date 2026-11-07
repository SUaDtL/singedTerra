import assert from 'node:assert/strict';
import {elapsedTicks,validateModelObservation,sameDocument} from './lastStandRuntimeObservation.mjs';
import {tierJourneyControlGeometry} from './lastStandTierJourney.mjs';
import {revealObservedLastStandControl} from './lastStandControlReveal.mjs';

// The caller supplies live state through getters; host adapters can be inert in tests.
export function createJourneyActions(runtime) {
  const context=Object.create({assert,process,Date,validateKeyboardSubmit,elapsedTicks,validateModelObservation,sameDocument},Object.getOwnPropertyDescriptors(runtime));
  const until=context.until??(async(items,start,predicate,seconds=110)=>{
      context.throwObserverFailure();
      const deadline=context.Date.now()+seconds*1000;
      while(context.Date.now()<deadline) {context.throwObserverFailure();const found=items.slice(start).filter(predicate);if(found.length)return found.at(-1);await context.page.waitForTimeout(40);}
      context.throwObserverFailure();
      throw new Error('Expected real runtime observation absent');
    });

  const keyboardFocus=context.keyboardFocus??(async locator=>{
      if(context.process.platform==='linux'){
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
        if(!before.focused){await context.focused('outer keyboard');before=await inspect();}
        context.check(before.focused,'outer keyboard: document focus and visibility');
        if(before.isReturn && before.active && before.canvas){
          await context.page.keyboard.press('Tab');
          context.check(await context.page.locator('#unity-canvas').evaluate(element=>element===document.activeElement),
            'native Tab enters actual Unity before Return escape');
        }
        if(before.canvas)await context.page.keyboard.press('Shift+Tab');
        let current=await inspect();
        for(let i=0;i<50 && !current.active;i++){await context.page.keyboard.press('Tab');current=await inspect();}
        context.check(current.focused && current.active,'outer control reachable by native Tab');
        context.check(current.outline!=='none' && current.width>=2,'visible keyboard focus indicator',current);
        return;
      }
      await context.page.evaluate("window.__stInputArea='outer'");
      await context.focused('outer keyboard');
      // Try the browser's previous-control path from the focused canvas first.
      // No DOM focus or pointer reset may hide a Unity keyboard trap.
      if(await context.page.locator('#unity-canvas').count())await context.page.keyboard.press('Shift+Tab');
      for(let i=0;i<50;i++){if(await locator.evaluate(element=>element===document.activeElement))break;await context.page.keyboard.press('Tab');}
      context.check(await locator.evaluate(element=>element===document.activeElement),'outer control reachable by native Tab');
      const style=await locator.evaluate(element=>({outline:getComputedStyle(element).outlineStyle,width:parseFloat(getComputedStyle(element).outlineWidth)}));
      context.check(style.outline!=='none' && style.width>=2,'visible keyboard focus indicator',style);
    });

  const hudControls=context.hudControls??(layout=>[...layout.controls,...layout.shopControls,...layout.settingsControls]);

  const projectedControls=context.projectedControls??((layout,canvas)=>tierJourneyControlGeometry({...layout,graphicsTruncated:false,
      // retainRuntimeObservation already parsed the complete original record.
      // Serialize its observed graphics only for the shared reader boundary.
      raw:'ST_LS_HUD_LAYOUT '+JSON.stringify({graphics:layout.graphics})},canvas));

  const measureControls=context.measureControls??(async()=>{
      const {canvas,pixels}=await context.page.locator('#unity-canvas').evaluate(element=>{
        const box=element.getBoundingClientRect(),visible=getComputedStyle(element).visibility==='visible' && box.width>0 && box.height>0;
        return {canvas:visible?{x:box.x,y:box.y,width:box.width,height:box.height}:null,
          pixels:{width:element.width,height:element.height}};
      });
      context.assert.ok(canvas);
      const layout=context.layouts.at(-1);context.check(layout?.coordinates==='top-left','real HUD top-left convention');
      context.check(Math.abs(layout.width-pixels.width)<=1 && Math.abs(layout.height-pixels.height)<=1,'HUD dimensions use actual canvas backing pixels',{canvas,pixels,layout});
      const projected=projectedControls(layout,canvas);
      return {canvas,layout,projected};
    });

  const geometry=context.geometry??(async(name,{reveal=false,requireFull=true}={})=>{
      const {canvas,layout,projected}=reveal?await revealObservedLastStandControl({name,page:context.page,geometry:measureControls,
        trace:context.trace,readLoad:()=>context.load}):await measureControls();
      if(requireFull)context.check(projected.some(item=>item.name===name && item.full),`real HUD ${name} is completely visible inside its actual viewport`);
      const control=hudControls(layout).filter(item=>item.name===name && item.active && item.interactable);
      context.check(control.length===1,`operable real HUD ${name}`);return{canvas,layout,item:control[0]};
    });

  const resize=context.resize??(async(viewport,{capture=true}={})=>{
      const start=context.layouts.length;await context.page.setViewportSize({width:viewport.width,height:viewport.height});
      await context.page.waitForTimeout(400);
      const pixels=await context.page.locator('#unity-canvas').evaluate(element=>({width:element.width,height:element.height}));
      if(Math.abs(context.layouts.at(-1).width-pixels.width)>1 || Math.abs(context.layouts.at(-1).height-pixels.height)>1)
        await until(context.layouts,start,item=>Math.abs(item.width-pixels.width)<=1 && Math.abs(item.height-pixels.height)<=1,8);
      await geometry('Menu');
      const outer=await context.page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,nav:document.querySelector('#last-stand-nav').getBoundingClientRect().toJSON(),
        link:document.querySelector('#last-stand-return').getBoundingClientRect().toJSON(),
        loss:document.querySelector('#last-stand-loss').getBoundingClientRect().toJSON()}));
      context.check(outer.scrollWidth<=outer.width && outer.scrollHeight<=outer.height,'wrapper has no overflow',outer);
      for(const box of [outer.link,outer.loss])context.check(box.x>=0 && box.right<=outer.width && box.y>=0 && box.bottom<=outer.nav.bottom,'Return and disclosure stay reachable',box);
      await keyboardFocus(context.page.locator('#last-stand-return'));
      if(capture)await context.screenshot(`layout-${viewport.name}-${context.states.at(-1).phase}-${context.report.screenshots.length}`);
    });

  const phaseMatrix=context.phaseMatrix??(async label=>{
      const phase=context.states.at(-1).phase,paused=context.states.at(-1).paused;
      for(const viewport of context.matrix.phaseViewports) {
        // The named phase capture below also records this inspected layout.
        await resize(viewport,{capture:false});context.check(context.states.at(-1).phase===phase && context.states.at(-1).paused===paused,`${label}: same actual phase across profiles`);
        await context.screenshot(`${label}-${viewport.name}`);
      }
      if(context.page.viewportSize().width!==context.captureViewport.width || context.page.viewportSize().height!==context.captureViewport.height)
        await resize(context.captureViewport);
    });

  const armGameClick=context.armGameClick??(async(name,action,predicate=()=>true)=>{
      await context.focused('gameplay pointer');const {canvas,layout,item}=await geometry(name,{reveal:true});
      await context.page.evaluate("window.__stInputArea='gameplay'");
      const point={x:canvas.x+(item.x+item.width/2)*canvas.width/layout.width,y:canvas.y+(item.y+item.height/2)*canvas.height/layout.height};
      await context.page.mouse.move(point.x,point.y);await context.page.waitForTimeout(80);
      const armedTrace=context.trace.length,armedLoad=context.load,armedViewport=context.page.viewportSize();let used=false;
      return async()=>{
        context.assert.ok(!used && context.load===armedLoad,'prepared pointer is single-use in its original document');used=true;
        context.assert.ok(JSON.stringify(context.page.viewportSize())===JSON.stringify(armedViewport),'prepared pointer refuses changed viewport geometry');
        context.assert.ok(!context.trace.slice(armedTrace).some(event=>event.globalTarget &&
          (event.kind==='blur' || event.kind==='visibilitychange' && event.hidden)),
          'prepared pointer refuses intervening native focus or visibility loss');
        const documentState=await context.page.evaluate(()=>{
          const element=document.getElementById('unity-canvas'),box=element?.getBoundingClientRect();
          return {focused:!document.hidden && document.hasFocus(),timeOrigin:performance.timeOrigin,
            canvas:box?{x:box.x,y:box.y,width:box.width,height:box.height,pixelWidth:element.width,pixelHeight:element.height}:null};
        });
        context.assert.ok(documentState.focused && documentState.timeOrigin===layout.timeOrigin,'prepared pointer remains in its visibly focused document');
        const current=context.layouts.at(-1),state=context.states.at(-1),box=documentState.canvas;
        context.assert.ok(current && state && current.load===armedLoad && state.load===armedLoad &&
          current.timeOrigin===layout.timeOrigin && state.timeOrigin===layout.timeOrigin && current.phase===state.phase &&
          Number.isFinite(current.t) && current.t>=layout.t && current.width===layout.width && current.height===layout.height,
          'prepared pointer requires the current same-document layout');
        context.assert.ok(box && ['x','y','width','height'].every(key=>Number.isFinite(box[key]) && Math.abs(box[key]-canvas[key])<.5) &&
          box.pixelWidth===current.width && box.pixelHeight===current.height,'prepared pointer refuses changed Canvas geometry');
        const targets=hudControls(current).filter(control=>control.name===name && control.active && control.interactable);
        context.assert.equal(targets.length,1,'prepared pointer requires one currently enabled target');const target=targets[0];
        context.assert.ok(['x','y','width','height'].every(key=>Number.isFinite(target[key])) && target.width>0 && target.height>0 &&
          target.x>=0 && target.y>=0 && target.x+target.width<=current.width+.5 && target.y+target.height<=current.height+.5,
          'prepared pointer target must be within the actual Canvas');
        context.assert.ok(projectedControls(current,canvas).some(item=>item.name===name && item.full),
          'prepared pointer requires the complete target in its current actual viewport');
        const resolved={x:box.x+(target.x+target.width/2)*box.width/current.width,
          y:box.y+(target.y+target.height/2)*box.height/current.height};
        const layoutAction=action==='hud-layout',rows=layoutAction?context.layouts:context.states,start=rows.length;
        await context.page.mouse.move(resolved.x,resolved.y);
        await context.page.mouse.down();await context.page.waitForTimeout(150);await context.page.mouse.up();
        context.report.actions.push({name,action,...resolved,hold_ms:150,resolved_layout:{load:current.load,timeOrigin:current.timeOrigin,
          phase:current.phase,t:current.t,target:{x:target.x,y:target.y,width:target.width,height:target.height}}});
        const observed=await until(rows,start,item=>item.load===armedLoad && item.timeOrigin===layout.timeOrigin &&
          (layoutAction?Number.isFinite(item.t)&&item.t>=current.t:item.action===action) && predicate(item),8);
        context.check(true,'prepared pointer used the actual current enabled target',{name,...resolved,phase:current.phase});return observed;
      };
    });

  const gameClick=context.gameClick??(async(...args)=>(await armGameClick(...args))());

  const gameKey=context.gameKey??(async(name,action,predicate=()=>true)=>{
      const {layout:prepared}=await geometry(name,{requireFull:false}),navigationStart=context.trace.length;
      await keyboardFocus(context.page.locator('#last-stand-return'));
      await context.page.keyboard.press('Tab');
      context.check(await context.page.locator('#unity-canvas').evaluate(element=>document.activeElement===element),'native Tab enters actual Unity controls');
      const ordered=hudControls(context.layouts.at(-1)).filter(item=>item.active && item.interactable).sort((a,b)=>Math.abs(a.y-b.y)>.5?a.y-b.y:a.x-b.x);
      const index=ordered.findIndex(item=>item.name===name);context.check(index>=0,'keyboard target is actually enabled');
      await context.page.evaluate("window.__stInputArea='gameplay-keyboard'");
      const keys=[];for(let i=0;i<index;i++){await context.page.keyboard.press('Tab');keys.push('Tab');}
      const navigation=context.trace.slice(navigationStart).findLast(item=>item.kind==='keydown' && item.code==='Tab');
      context.check(navigation && Number.isFinite(navigation.t),'actual final keyboard navigation edge is observed');
      // Await the first fresh projection, never re-navigate or wait for a wrong
      // selection to become the requested target. The exact owner is checked below.
      await until(context.layouts,0,item=>item.load===navigation.load && item.timeOrigin===navigation.timeOrigin &&
        item.scope===navigation.scope && item.t>=navigation.t,8);
      await context.screenshot(`keyboard-focus-${name}-${context.report.screenshots.length}`);
      const {canvas:keyboardCanvas}=await geometry(name);
      const documentState=await context.page.evaluate(()=>({timeOrigin:performance.timeOrigin,t:performance.now(),
        focused:!document.hidden && document.hasFocus() && document.activeElement===document.getElementById('unity-canvas')}));
      context.validateKeyboardSubmit({name,prepared,state:context.states.at(-1),layout:context.layouts.at(-1),documentState,navigation});
      context.check(projectedControls(context.layouts.at(-1),keyboardCanvas).some(item=>item.name===name&&item.full),
        'Keyboard submit requires the complete target in its current actual viewport');
      const start=context.states.length,encStart=context.encounters.length;
      await context.page.keyboard.down('Enter');await context.page.waitForTimeout(150);await context.page.keyboard.up('Enter');keys.push('Enter');
      const observed=await until(context.states,start,item=>item.action===action && predicate(item),8);
      context.report.keyboard_actions.push({name,action,keys,hold_ms:150,visible_order:ordered.map(item=>item.name)});
      const activations=name==='SpeedRate'?context.encounters.slice(encStart).filter(item=>item.action==='pause'):
        context.states.slice(start).filter(item=>item.action===action);
      context.check(activations.length===1,'one actual owner receives each keyboard activation',activations);
      await context.page.evaluate("window.__stInputArea='outer'");return observed;
    });

  const liveBattleLayouts=context.liveBattleLayouts??(async()=>{
      if(!context.player)return;
      // Focus-only notifications do not advance the model clock. Use fresh
      // actual AdvanceAt tick reports for the strict elapsed comparison.
      const before=await context.observation({action:'tick',minT:await context.mark()});
      context.check(before.loop.phase==='battle' && !before.paused,'Windows live layout starts in active battle');
      await phaseMatrix('battle');
      const after=await context.observation({action:'tick',minT:await context.mark()});
      context.check(after.loop.phase==='battle' && !after.paused,'Windows live layout remains active battle');
      context.elapsedTicks(before,after);context.validateModelObservation(before,context.reference(before));context.validateModelObservation(after,context.reference(after));
      context.report.lifecycle.push({kind:'live-battle-layout',scope:'existing unfinished reload run',
        viewports:context.matrix.phaseViewports.map(item=>item.name),before,after});
    });

  const battleLayouts=context.battleLayouts??(async()=>{
      // Slow Linux inspection can exceed a whole battle. Windows retains its
      // live native/media matrix; Linux uses the real public Pause control.
      if(context.player){await context.screenshot('01-base-first-hit');return;}
      const before=await context.observation();
      context.check(before.loop.phase==='battle' && !before.paused,'layout inspection starts in active battle');
      await gameClick('SpeedRate','session',item=>item.phase==='battle' && item.paused);
      const paused=await context.observation({action:'pause',paused:true,minT:before.t,run:before.run});
      context.check(paused.loop.phase==='battle','layout inspection paused actual battle');
      context.validateModelObservation(paused,context.reference(paused));
      await context.screenshot('01-base-first-hit');await phaseMatrix('battle');
      const returned=await context.observation({paused:true,run:paused.run});
      context.sameDocument(paused,returned);
      context.check(returned.loop.phase==='battle' && returned.paused,'layout inspection remains paused battle');
      for(const key of ['tick','hull','kills','terminalElapsed']){
        context.check(returned[key]===paused[key],'paused layout changed '+key,{paused,returned});
      }
      // Keep the same real Pause for mute/input inspection and the explicit
      // hidden-Pause proof below; its final keyboard Resume uses the original
      // counter/time/model oracle. One matrix covers the same paused geometry.
      const record={kind:'paused-battle-layout',covers:['paused battle','explicit Pause'],
        viewports:context.matrix.phaseViewports.map(item=>item.name),before,paused,returned};
      context.report.lifecycle.push(record);return record;
    });
  return {until,keyboardFocus,hudControls,projectedControls,measureControls,geometry,resize,phaseMatrix,armGameClick,gameClick,gameKey,liveBattleLayouts,battleLayouts};
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

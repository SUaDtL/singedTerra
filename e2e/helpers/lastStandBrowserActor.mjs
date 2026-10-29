// Shared ordinary-input actor for isolated declared-development player journeys.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readShopControlObservation} from './lastStandJourney.mjs';
import {tierJourneyControlGeometry} from './lastStandTierJourney.mjs';
const key='singedTerra.lastStand.prototype.v1';
export const lastStandObservedControls=layout=>['controls','shopControls','settingsControls','researchControls','historyControls'].flatMap(key=>layout?.[key]??[]);
const controls=lastStandObservedControls;

export async function createLastStandBrowserActor({context,id,report,output,base,persist,saveState='ready'}){
    const page=await context.newPage(),run={id,actions:[],inputs:[],states:[],layouts:[],shops:[],storage:[],screenshots:[],errors:[],encounters:[],combat:[],callouts:[],audio:[]};report.runs.push(run);
    let state,layout,shop,error;
    page.on('pageerror',value=>run.errors.push(String(value)));
    page.on('console',message=>{
      const raw=message.text();if(message.type()==='error')run.errors.push(raw);
      try{
        for(const [tag,field] of [['ST_ENC_STATE ','encounters'],['ST_LS_SHOP_COMBAT ','combat'],['ST_LS_FITTING_CALLOUT ','callouts']])
          if(raw.startsWith(tag))run[field].push(JSON.parse(raw.slice(tag.length)));
        if(raw.startsWith('ST_LS_AUDIO event='))run.audio.push(raw.slice('ST_LS_AUDIO event='.length));
        if(raw.startsWith('ST_WAVE_INPUT '))run.inputs.push(JSON.parse(raw.slice(14)));
        if(raw.startsWith('ST_LS_STATE ')){state=JSON.parse(raw.slice(12));run.states.push({at:Date.now(),...state});}
        if(raw.startsWith('ST_LS_SHOP_STATE ')){shop=JSON.parse(raw.slice(17));run.shops.push({at:Date.now(),...shop});}
        if(raw.startsWith('ST_LS_HUD_LAYOUT ')){layout=readShopControlObservation(raw);run.layouts.push({at:Date.now(),...layout});}
      }catch(value){error??=value;run.rejectedTelemetry??=raw;}
    });
    const until=async(predicate,seconds=20)=>{
      const deadline=Date.now()+seconds*1000;while(Date.now()<deadline){if(error)throw error;if(predicate())return;await page.waitForTimeout(40);}
      throw new Error(id+' missing observation: '+JSON.stringify(state));
    };
    const stored=async label=>{const raw=await page.evaluate(key=>localStorage.getItem(key),key);const value=raw===null?null:JSON.parse(raw);run.storage.push({label,at:Date.now(),value});return value;};
    const geometry=async()=>{
      const pixels=await page.locator('#unity-canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
      await until(()=>layout&&Math.abs(layout.width-pixels.width)<1&&Math.abs(layout.height-pixels.height)<1,10);
      const canvas=await page.locator('#unity-canvas').boundingBox();assert.ok(canvas);
      return {layout,canvas,targets:tierJourneyControlGeometry(layout,canvas)};
    };
    const click=async (name,{touch=false}={})=>{
      await until(()=>controls(layout).some(item=>item.name===name&&item.active&&item.interactable));
      for(let attempt=0;attempt<50;attempt++){
        const observed=await geometry(),item=controls(observed.layout).find(item=>item.name===name&&item.active&&item.interactable);
        assert.ok(item,'Current action '+name);const target=observed.targets.find(item=>item.name===name);assert.ok(target,'Scoped modal target '+name);
        const point=item=>({x:observed.canvas.x+(item.x+item.width/2)*observed.canvas.width/observed.layout.width,
          y:observed.canvas.y+(item.y+item.height/2)*observed.canvas.height/observed.layout.height});
        if(!target.full){
          const center=point(target.clip);await page.mouse.move(center.x,center.y);
          await page.mouse.wheel(0,(item.y<target.clip.y?-1:1)*Math.min(180,target.clip.height/2));
          await page.waitForTimeout(100);continue;
        }
        const center=point(item),start=run.inputs.length;
        if(touch)await page.touchscreen.tap(center.x,center.y);else await page.mouse.click(center.x,center.y,{delay:90});
        await until(()=>run.inputs.slice(start).some(event=>event.kind==='pointerup'),5);
        const edges=run.inputs.slice(start).filter(event=>['pointerdown','pointerup'].includes(event.kind));
        assert.deepEqual(edges.map(event=>event.kind),['pointerdown','pointerup']);
        assert.ok(edges.every(event=>event.trusted&&event.target==='unity-canvas'&&Math.abs(event.x-center.x)<1&&Math.abs(event.y-center.y)<1));
        run.actions.push({name,label:item.label,...center,at:Date.now(),inputKind:touch?'touch':'mouse',inputStart:start,inputEnd:run.inputs.length});
        await page.waitForTimeout(120);return;
      }
      throw new Error('Ordinary scrolling could not reveal '+name);
    };
    const shot=async label=>{await geometry();const path=resolve(output,id+'-'+label+'.png');await page.screenshot({path});
      run.screenshots.push({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),viewport:page.viewportSize(),state,layout});persist();};
    const select=async track=>{
      if(controls(layout).some(item=>item.name==='ResearchBack'&&item.active&&item.interactable))await click('ResearchBack');
      await click('ResearchProject-'+track);
    };
    const load=async(expectedSaveState,reload=false)=>{
      state=layout=shop=undefined;
      const stateStart=run.states.length;
      (run.loads??=[]).push({at:Date.now(),reload,expectedSaveState,stateStart});
      if(reload)await page.reload();else await page.goto(new URL('last-stand/',base).href);
      await until(()=>run.states.slice(stateStart).some(value=>value.action==='ready'),60);
      await until(()=>state?.saveState===expectedSaveState&&layout);await geometry();
    };
    await load(saveState);
    return {page,run,until,stored,click,shot,select,geometry,reload:()=>load('ready',true),state:()=>state,layout:()=>layout,shop:()=>shop};
  }

import assert from 'node:assert/strict';

const controls=layout=>['controls','shopControls','settingsControls']
  .flatMap(key=>layout[key]??[]);
const sameBox=(a,b)=>a&&b&&['x','y','width','height'].every(key=>Number.isFinite(a[key])&&Math.abs(a[key]-b[key])<.5);

// Shared ordinary-input preparation. The caller supplies the existing measured
// clipping/reach oracle; this helper never changes Unity state or scroll offsets.
export async function revealLastStandControl({name,page,geometry,assertUninterrupted=()=>{}}){
  let measured=await geometry();
  const initial=measured,viewport=page.viewportSize();
  const guard=async current=>{
    assertUninterrupted();
    const {layout,canvas}=current,base=initial.layout;
    assert.ok(layout.load===base.load&&layout.timeOrigin===base.timeOrigin&&layout.scope===base.scope&&layout.phase===base.phase&&
      Number.isFinite(layout.t)&&layout.t>=base.t&&layout.width===base.width&&layout.height===base.height,
    'Scroll reveal requires current same-document layout');
    assert.deepEqual(page.viewportSize(),viewport,'Scroll reveal refuses changed viewport');
    assert.ok(sameBox(canvas,initial.canvas),'Scroll reveal refuses changed Canvas geometry');
    const documentState=await page.evaluate(()=>{
      const element=document.getElementById('unity-canvas'),box=element?.getBoundingClientRect();
      return {focused:!document.hidden&&document.hasFocus(),timeOrigin:performance.timeOrigin,
        canvas:box?{x:box.x,y:box.y,width:box.width,height:box.height,pixelWidth:element.width,pixelHeight:element.height}:null};
    });
    assert.ok(documentState.focused&&documentState.timeOrigin===base.timeOrigin,
      'Scroll reveal requires the original visibly focused document');
    assert.ok(sameBox(documentState.canvas,canvas)&&documentState.canvas.pixelWidth===layout.width&&
      documentState.canvas.pixelHeight===layout.height,'Scroll reveal requires current Canvas backing pixels');
    assertUninterrupted();
    const enabled=controls(layout).filter(item=>item.name===name&&item.active&&item.interactable);
    assert.equal(enabled.length,1,'Scroll reveal requires one currently enabled target: '+name);
    const projected=current.projected.filter(item=>item.name===name);
    assert.equal(projected.length,1,'Scroll reveal requires the actual target viewport: '+name);
    assert.deepEqual(projected[0].clip,initial.projected.find(item=>item.name===name)?.clip,
      'Scroll reveal refuses changed target viewport');
    return {item:enabled[0],target:projected[0]};
  };
  for(let attempt=0;attempt<40;attempt++){
    const {item,target}=await guard(measured);
    if(target.full)return measured;
    const {layout,canvas}=measured,clip=target.clip,sign=item.y<clip.y?-1:1;
    const field=(layout.settingsControls??[]).includes(item)?'settingsScrollOffset':'scrollOffset';
    const before=layout[field];assert.ok(Number.isFinite(before),'Actual scroll owner offset required');
    const x=canvas.x+(clip.x+clip.width/2)*canvas.width/layout.width;
    const y=canvas.y+(clip.y+clip.height/2)*canvas.height/layout.height;
    await page.mouse.move(x,y);
    await guard(await geometry());
    await page.mouse.wheel(0,sign*Math.min(180,clip.height*canvas.height/layout.height/2));
    let progressed=false;
    for(let poll=0;poll<125;poll++){
      await page.waitForTimeout(40);measured=await geometry();await guard(measured);
      if(measured.layout.t>layout.t&&sign*(measured.layout[field]-before)>.5){progressed=true;break;}
    }
    assert.ok(progressed,'Ordinary wheel did not move the actual target scroll owner: '+name);
  }
  assert.fail('Target could not be fully revealed by ordinary scrolling: '+name);
}

// Both maintained journeys reject focus/document loss during ordinary scrolling.
export function revealObservedLastStandControl({name,page,geometry,trace,readLoad}) {
  const start=trace.length,originalLoad=readLoad();
  return revealLastStandControl({name,page,geometry,assertUninterrupted:()=>assert.ok(readLoad()===originalLoad&&
    !trace.slice(start).some(event=>event.globalTarget&&(event.kind==='blur'||event.kind==='visibilitychange'&&event.hidden)),
    'Scroll reveal refuses document, focus or visibility loss')});
}

export function findLastStandSettingsViewport(graphics) {
  return graphics.find(g=>g.active&&g.path.endsWith('/SettingsViewport')&&['Image','LastStandConsoleSurface'].includes(g.kind));
}

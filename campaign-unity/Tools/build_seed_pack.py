"""ST-KIT-02 Ashfall Outpost. Original, deterministic scenery and enemy art.
Run with Blender --background --python this_file.py in a NEW workspace.
Never regenerate over artist edits. No gameplay, economy or dependency installs.
"""
from pathlib import Path
import bpy, math, random, json, hashlib, numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
assert not (R/'ArtSource/Ashfall_Outpost_02.blend').exists(), 'Refuse source overwrite'
assert not list((R/'Exports/FBX').glob('*.fbx')), 'Refuse export overwrite'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system='METRIC'; bpy.context.scene.unit_settings.scale_length=1
rng=random.Random(220926); M={}; entries=[]; active=None; current=None

def material(name, rgb, metal=0, rough=.7, texture=False):
    m=bpy.data.materials.new('ST2_'+name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if texture:
        gen=np.random.default_rng(sum(map(ord,name))+2026); n=256
        noise=gen.random((n,n)); low=np.repeat(np.repeat(gen.random((32,32)),8,0),8,1)
        pixels=np.ones((n,n,4),dtype=np.float32)
        pixels[:,:,:3]=np.clip(np.array(rgb)[None,None,:]**(1/2.2)*(.79+.12*noise[:,:,None]+.15*low[:,:,None]),0,1)
        im=bpy.data.images.new('ST2_'+name+'_BaseColor',width=n,height=n,alpha=False)
        im.pixels.foreach_set(pixels.ravel()); im.filepath_raw=str(R/'Textures'/(im.name+'.png')); im.file_format='PNG'; im.save(); im.pack()
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=im
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    M[name]=m; return m
material('Oxide',(.30,.09,.045),.35,.72,True); material('Olive',(.25,.27,.15),.25,.75,True)
material('Sand',(.46,.36,.21),.15,.8,True); material('Concrete',(.30,.29,.25),0,.95,True)
material('Earth',(.17,.13,.085),0,1,True); material('Steel',(.075,.09,.095),.65,.5)
material('Edge',(.17,.19,.18),.55,.48); material('Rubber',(.023,.027,.025),0,.91)
material('Ivory',(.70,.65,.44),.05,.65); material('Amber',(.90,.28,.025),.25,.35)
material('Optic',(.035,.32,.35),.3,.24); material('Char',(.055,.042,.033),0,1)

def empty(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); active.objects.link(o); o.parent=parent; o.location=loc; return o

def begin(id,title,category,desc):
    global active,current
    active=bpy.data.collections.new(id); bpy.context.scene.collection.children.link(active)
    root=empty(id); current={'id':id,'title':title,'category':category,'description':desc,'root':root,'collection':active}
    entries.append(current); return root

def finish(o,name,mat,parent,bevel=0):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    active.objects.link(o); o.parent=parent; o.data.materials.append(M[mat])
    if bevel:
        b=o.modifiers.new('Edge highlights','BEVEL'); b.width=bevel; b.segments=1
        b=o.modifiers.new('Face normals','WEIGHTED_NORMAL'); b.keep_sharp=True
    return o

def box(name,loc,size,mat,parent,bevel=.025,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1); o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.location=loc; o.rotation_euler=rot; return finish(o,name,mat,parent,bevel)

def cyl(name,loc,r,depth,mat,parent,axis='Z',n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth)
    o=bpy.context.object; o.location=loc
    o.rotation_euler=({'X':(0,math.pi/2,0),'Y':(math.pi/2,0,0),'Z':(0,0,0)})[axis]
    return finish(o,name,mat,parent,.012 if r>.09 else 0)

def mesh(name,verts,faces,mat,parent):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); active.objects.link(o); o.parent=parent; me.materials.append(M[mat]); return o

def beam(name,a,b,r,mat,parent):
    a,b=Vector(a),Vector(b); o=cyl(name,(a+b)*.5,r,(b-a).length,mat,parent,n=8)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o

def hull(name,levels,mat,parent):
    verts=[]
    for z,w,l,c in levels:
        verts.extend([(x,y,z) for x,y in [(-w+c,-l),(w-c,-l),(w,-l+c),(w,l-c),(w-c,l),(-w+c,l),(-w,l-c),(-w,-l+c)]])
    faces=[tuple(reversed(range(8))),tuple(range(len(verts)-8,len(verts)))]
    for j in range(len(levels)-1):
        for i in range(8): a=j*8+i; b=j*8+(i+1)%8; faces.append((a,b,b+8,a+8))
    o=mesh(name,verts,faces,mat,parent); mod=o.modifiers.new('Armor edges','BEVEL');mod.width=.035;mod.segments=1;return o

def socket(name,loc,parent):
    o=empty(name,loc,parent); o.empty_display_type='ARROWS';o.empty_display_size=.25;return o

def vents(parent,loc,count=5,axis='Y'):
    x,y,z=loc
    for i in range(count): box('Vent', (x,y+i*.14,z),(.65,.045,.025),'Steel',parent,.003)

def tracks(parent,w=1.3,l=1.65):
    for sign,side in [(-1,'L'),(1,'R')]:
        t=empty('Track_'+side,parent=parent)
        box('Continuous belt',(sign*w,0,.48),(.55,l*2+.8,.90),'Rubber',t,.18)
        for y in [-l,-l*.5,0,l*.5,l]:
            cyl('Road wheel',(sign*(w+.29),y,.48),.32,.10,'Edge',t,'X')
            cyl('Hub',(sign*(w+.36),y,.48),.10,.04,'Ivory',t,'X',8)
        for y in np.linspace(-l-.12,l+.12,12):
            for z in [.045,.92]: box('Tread',(sign*w,float(y),z),(.59,.14,.055),'Steel',t,.006)
        box('Fender',(sign*w,0,1.0),(.75,l*2+.85,.10),'Oxide',parent)

def barrel(parent,loc,length=1.5,r=.10):
    pivot=empty('GunPitch',loc,parent); recoil=empty('BarrelRecoil',parent=pivot)
    cyl('Breech',(0,.05,0),r*2,.45,'Edge',recoil,'Y')
    cyl('Barrel',(0,length*.5,0),r,length,'Steel',recoil,'Y')
    cyl('Muzzle ring',(0,length,0),r*1.35,.16,'Ivory',recoil,'Y')
    cyl('Muzzle bore',(0,length+.087,0),r*.78,.01,'Rubber',recoil,'Y')
    socket('Muzzle',(0,length+.10,0),recoil); return pivot

p=begin('ST2-E01','Tick scout','enemy','Four-wheel scout silhouette; separate wheel pivots and sensor yaw.')
hull('Scout hull',[(.44,.68,1.15,.22),(.93,.80,1.20,.25),(1.18,.52,.72,.19)],'Oxide',p)
for s in [-1,1]:
    for y in [-.78,.78]:
        w=empty('Wheel_'+('L' if s<0 else 'R')+('_Front' if y>0 else '_Rear'),(s*.91,y,.39),p)
        cyl('Tire',(0,0,0),.39,.30,'Rubber',w,'X',16);cyl('Rim',(s*.16,0,0),.23,.025,'Edge',w,'X')
    box('Headlight',(s*.43,1.00,.94),(.22,.055,.11),'Amber',p,.015)
t=empty('SensorYaw',(0,0,1.2),p);box('Sensor head',(0,0,.13),(.62,.44,.28),'Steel',t)
box('Sensor slit',(0,.235,.16),(.42,.018,.06),'Optic',t,.005);socket('AimPoint',(0,0,.15),t)
vents(p,(0,-.7,1.17));beam('Antenna',(-.4,-.5,1.14),(-.4,-.5,1.85),.015,'Steel',p)

p=begin('ST2-E02','Ram crawler','enemy','Low tracked wedge with visible plow and independent turret/muzzle pivots.')
tracks(p,1.25,1.60);hull('Crawler hull',[(.50,1.05,1.78,.25),(1.25,1.16,1.80,.25),(1.55,.81,1.23,.32)],'Oxide',p)
box('Ram blade',(0,2.0,.65),(2.80,.30,.80),'Edge',p,.05,(.22,0,0))
for x in [-1.05,-.7,0,.7,1.05]:box('Ram rib',(x,2.18,.65),(.07,.07,.68),'Ivory',p,.01,(.22,0,0))
t=empty('TurretYaw',(0,.05,1.50),p);cyl('Ring',(0,0,.02),.72,.12,'Steel',t)
hull('Turret',[(.05,.7,.63,.2),(.51,.56,.50,.22)],'Oxide',t)
barrel(t,(0,.5,.25),1.05,.13);socket('AimPoint',(0,0,.3),t);vents(p,(0,-1.23,1.56))

p=begin('ST2-E03','Kiln mortar carrier','enemy','Long artillery chassis with a raised short tube; art only, no firing rules.')
tracks(p,1.45,1.95);hull('Long chassis',[(.55,1.20,2.10,.23),(1.15,1.27,2.04,.25)],'Olive',p)
box('Cab',(0,1.27,1.5),(1.9,1.10,.72),'Oxide',p,.14)
box('Cab visor',(0,1.84,1.61),(1.26,.02,.15),'Rubber',p,.01)
t=empty('TurretYaw',(0,-.58,1.2),p);cyl('Turntable',(0,0,.05),.83,.15,'Edge',t, n=20)
for s in [-1,1]:box('Cradle',(s*.49,0,.50),(.20,.8,.86),'Olive',t,.06)
g=barrel(t,(0,0,.83),1.30,.29);g.rotation_euler[0]=math.radians(52)
for s in [-1,1]:
    box('Side bin',(s*1.15,-.76,1.38),(.30,1.45,.40),'Oxide',p)
    cyl('Exhaust',(s*.87,-1.75,1.53),.10,.65,'Steel',p)
socket('AimPoint',(0,0,.65),t)

p=begin('ST2-E04','Stilt walker','enemy','Six-legged machine with individually named hip/knee pivots; static seed pose.')
hull('Walker core',[(1.42,.75,.92,.3),(2.0,1.0,1.1,.36),(2.30,.65,.8,.3)],'Oxide',p)
for s in [-1,1]:
    for i,y in enumerate([-.85,0,.85]):
        hip=empty('Hip_'+('L' if s<0 else 'R')+str(i),(s*.70,y,1.73),p)
        beam('Upper strut',(0,0,0),(s*.8,y*.32,-.28),.12,'Edge',hip)
        k=empty('Knee',(s*.8,y*.32,-.28),hip);cyl('Knee cap',(0,0,0),.20,.22,'Ivory',k,'Y')
        beam('Lower strut',(0,0,0),(s*.4,y*.22,-1.28),.105,'Steel',k)
        box('Foot',(s*.4,y*.22,-1.37),(.48,.55,.16),'Rubber',k,.04)
t=empty('TurretYaw',(0,.15,2.25),p);box('Sensor turret',(0,0,.15),(.90,.65,.36),'Steel',t,.08)
box('Eye',(0,.34,.19),(.55,.018,.09),'Amber',t,.004);barrel(t,(0,.34,.05),.72,.065)
socket('AimPoint',(0,0,.17),t)
p=begin('ST2-E05','Tripod sentry','enemy','Stationary three-foot gun platform; yaw, pitch and recoil hooks.')
for a in [0,120,240]:
    a=math.radians(a);x,y=math.cos(a),math.sin(a)
    beam('Support',(x*.32,y*.32,1.0),(x*1.23,y*1.23,.19),.12,'Steel',p)
    box('Foot',(x*1.23,y*1.23,.10),(.55,.60,.20),'Edge',p,.04)
cyl('Pedestal',(0,0,.85),.33,1.20,'Oxide',p);t=empty('TurretYaw',(0,0,1.45),p)
box('Shield',(0,.18,.34),(1.40,.25,.82),'Oxide',t,.07)
barrel(t,(0,.35,.44),1.18,.12);socket('AimPoint',(0,0,.38),t)
box('Ammo box',(.77,-.25,.17),(.42,.70,.45),'Olive',t,.035)

def terrain(id,title,fn):
    p=begin(id,title,'terrain','8 m modular surface. Blender +Z up; north is +Y. Height borders documented in catalog.')
    n=20;verts=[];faces=[]
    for j in range(n+1):
        for i in range(n+1):
            x,y=i*8/n-4,j*8/n-4;verts.append((x,y,fn(x,y)))
    for j in range(n):
        for i in range(n):a=j*(n+1)+i;faces.extend([(a,a+1,a+n+2),(a,a+n+2,a+n+1)])
    o=mesh('Ground surface',verts,faces,'Earth',p)
    for name,loc in [('Snap_N',(0,4,fn(0,4))),('Snap_S',(0,-4,fn(0,-4))),('Snap_E',(4,0,fn(4,0))),('Snap_W',(-4,0,fn(-4,0)))]:socket(name,loc,p)
    current['grid_m']=8;return p

def edge_fade(x,y):return max(0,1-(abs(x)/4)**6)*max(0,1-(abs(y)/4)**6)
terrain('ST2-T01','Ash ground tile',lambda x,y:.09*math.sin(x*1.8)*math.cos(y*1.3)*edge_fade(x,y))
terrain('ST2-T02','Earth berm tile',lambda x,y:1.35*math.exp(-(y/.95)**2)*max(0,1-(abs(x)/4)**4)*max(0,1-(abs(y)/4)**4))
terrain('ST2-T03','Impact crater tile',lambda x,y:(.40*math.exp(-((math.hypot(x,y)-2.15)/.45)**2)-.65*math.exp(-(math.hypot(x,y)/1.35)**4))*edge_fade(x,y))

def rock(parent,loc,size):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for v in o.data.vertices:v.co*=rng.uniform(.86,1.13)
    low=min(v.co.z for v in o.data.vertices)
    for v in o.data.vertices:v.co.z-=low
    o.location=loc;o.rotation_euler.z=rng.random()*6.28;return finish(o,'Fractured basalt','Concrete',parent)

p=begin('ST2-T04','Basalt cluster','terrain','Small faceted cluster, base at ground level; separate rocks in source.')
for loc,size in [((0,0,0),(1.15,.9,.8)),((1.25,.3,0),(.7,.65,.5)),((-.9,.5,0),(.55,.45,.4)),((.35,-.9,0),(.42,.6,.35))]:rock(p,loc,size)
p=begin('ST2-T05','Broken escarpment','terrain','Eight-meter rocky visual boundary; not a traversability or cover rule.')
for i in range(6):rock(p,(-3.25+i*1.3,rng.uniform(-.3,.3),0),(.95,.85,rng.uniform(1.3,2.1)))
p=terrain('ST2-T06','Two-meter rise ramp',lambda x,y:(y+4)/4)
current['description']='8 m ramp rising from south 0 m to north 2 m. Only compatible height edges connect; sides slope.'
p=begin('ST2-T07','Charred tree stand','terrain','Three stylized burned trunks; decoration without collision or resource rules.')
for x,y,h in [(-.7,.15,3.8),(.85,.4,2.6),(.4,-.8,1.7)]:
    beam('Trunk',(x,y,.1),(x+.15,y,h),.19,'Char',p)
    beam('Broken limb',(x+.08,y,h*.57),(x-.6,y+.05,h*.85),.08,'Char',p)
    beam('Broken limb',(x+.1,y,h*.7),(x+.6,y+.2,h*.94),.07,'Char',p)
    for a in [0,2.1,4.2]:beam('Root',(x,y,.22),(x+math.cos(a)*.6,y+math.sin(a)*.6,.025),.09,'Char',p)

p=begin('ST2-B01','Observation bunker','building','Low concrete bunker with embrasure, roof vents, door and attachment anchors.')
hull('Bunker shell',[(0,3,2.35,.25),(2.3,2.8,2.15,.30)],'Concrete',p)
box('Roof',(0,0,2.45),(6.2,5,.34),'Concrete',p,.06)
box('Vision recess',(0,2.175,1.7),(3.60,.06,.38),'Rubber',p,.03)
box('Recess brow',(0,2.31,1.99),(4.05,.38,.15),'Edge',p)
box('Rear door',(0,-2.21,1.03),(1.1,.12,2.05),'Steel',p,.03)
for x in [-.8,.8]:cyl('Roof vent',(x,-1,2.8),.2,.48,'Steel',p);cyl('Vent cap',(x,-1,3.06),.32,.08,'Edge',p)
socket('RoofMount',(0,0,2.62),p);socket('DoorAnchor',(0,-2.40,0),p)

p=begin('ST2-B02','Corrugated field depot','building','Arched depot with roller door; surface-only seed, not an interior kit.')
box('Foundation',(0,0,.12),(7,8.6,.24),'Concrete',p)
box('Depot body',(0,0,1.45),(6.5,8,2.7),'Olive',p,.04)
verts=[];faces=[];n=16
for y in [-4.12,4.12]:
    for i in range(n+1):a=i*math.pi/n;verts.append((3.40*math.cos(a),y,2.7+1.38*math.sin(a)))
faces=[tuple(reversed(range(n+1))),tuple(range(n+1,2*(n+1)))]
for i in range(n):faces.append((i,i+1,i+n+2,i+n+1))
mesh('Arched roof',verts,faces,'Oxide',p)
for y in np.linspace(-4,4,13):
    for i in range(12):
        a,b=i*math.pi/12,(i+1)*math.pi/12
        beam('Roof rib',(3.43*math.cos(a),float(y),2.71+1.4*math.sin(a)),(3.43*math.cos(b),float(y),2.71+1.4*math.sin(b)),.026,'Edge',p)
box('Roller door',(0,4.035,1.28),(3.35,.07,2.45),'Steel',p,.01)
for z in np.linspace(.3,2.4,10):box('Door slat',(0,4.086,float(z)),(3.25,.02,.035),'Edge',p,.002)
for x in [-2.8,2.8]:box('Window',(x,4.05,1.8),(.65,.08,.6),'Rubber',p)
socket('DoorAnchor',(0,4.35,0),p)

p=begin('ST2-B03','Relay mast','building','Cross-braced tower with directional dish and a named antenna yaw pivot.')
for a in [0,2.0944,4.1888]:
    x,y=math.cos(a),math.sin(a);box('Footing',(x*1.4,y*1.4,.15),(.65,.65,.30),'Concrete',p)
    beam('Mast leg',(x*1.4,y*1.4,.30),(x*.35,y*.35,6.5),.10,'Steel',p)
for z in [1,2.5,4,5.5]:
    r=1.4-(z/6.5)*1.05;r2=1.4-((z+1.3)/6.5)*1.05
    for i in range(3):
        a,b=i*math.tau/3,(i+1)*math.tau/3
        beam('Cross brace',(r*math.cos(a),r*math.sin(a),z),(r2*math.cos(b),r2*math.sin(b),z+1.3),.035,'Edge',p)
t=empty('AntennaYaw',(0,0,6),p);box('Dish mount',(0,0,.05),(.5,.55,.5),'Olive',t)
verts=[(0,.38,.48)];faces=[]
for j in range(1,5):
    r=j*.26
    for i in range(20):a=i*math.tau/20;verts.append((r*math.cos(a),.38+r*r*.40,.48+r*math.sin(a)))
for i in range(20):faces.append((0,1+(i+1)%20,1+i))
for j in range(3):
    for i in range(20):a=1+j*20+i;b=1+j*20+(i+1)%20;faces.append((a,b,b+20,a+20))
o=mesh('Dish reflector',verts,faces,'Ivory',t);mod=o.modifiers.new('Dish backing','SOLIDIFY');mod.thickness=.05
beam('Feed arm',(0,.42,.48),(0,1.15,.48),.04,'Steel',t);cyl('Feed horn',(0,1.12,.48),.12,.18,'Oxide',t,'Y')
box('Control cabinet',(0,0,.62),(.8,.6,1.2),'Olive',p);socket('AntennaAnchor',(0,0,7.5),p)

p=begin('ST2-B04','Workshop ruin','building','L-shaped ruined workshop with broken roof beams and rubble, no destruction simulation.')
box('Slab',(0,0,.12),(7,5,.24),'Concrete',p)
for x,h in [(-3,2.8),(-1.5,3.1),(0,2.2),(1.5,1.1),(2.65,.55)]:
    box('Broken rear wall',(x,-2,h*.5+.24),(1.4,.35,h),'Concrete',p,.02)
for y,h in [(-1.2,2.6),(0,1.75),(1.2,.9)]:box('Side wall',(-3.1,y,h*.5+.24),(.35,1.15,h),'Concrete',p)
for x in [-2.7,-1.3]:beam('Roof beam',(x,-2,3.2),(x,1.25,2.1),.10,'Steel',p)
for i in range(9):rock(p,(rng.uniform(-2.4,2.4),rng.uniform(-1.3,1.5),.24),(.32,.27,rng.uniform(.12,.30)))
for x in [-.4,.15]:beam('Exposed rebar',(x,-2,1.9),(x+.15,-2.03,2.7),.02,'Steel',p)

p=begin('ST2-B05','Elevated reserve tank','building','Industrial tank on a four-leg cradle with plumbing, ladder and valve.')
for x in [-1.1,1.1]:
    for y in [-1.4,1.4]:box('Leg',(x,y,1.15),(.18,.18,2.3),'Steel',p);box('Foot',(x,y,.10),(.48,.48,.20),'Concrete',p)
cyl('Tank',(0,0,2.8),1.25,3.6,'Olive',p,'Y',24)
for y in [-1.75,1.75]:cyl('Tank end',(0,y,2.8),1.28,.10,'Edge',p,'Y',24)
for y in [-1,1]:cyl('Strap',(0,y,2.8),1.275,.10,'Oxide',p,'Y',24)
beam('Outlet',(1,1.4,2.15),(1,1.4,.55),.10,'Steel',p);cyl('Valve',(1.18,1.4,.95),.25,.04,'Oxide',p,'X',12)
for z in np.linspace(.4,3.8,10):beam('Ladder rung',(-1.43,-.32,float(z)),(-1.43,.32,float(z)),.025,'Edge',p)
for y in [-.32,.32]:beam('Ladder rail',(-1.43,y,.2),(-1.43,y,4.1),.035,'Steel',p)

p=begin('ST2-P01','Drum cluster','prop','Three separate industrial drums with banding; scenery only.')
for x,y,mat in [(-.45,0,'Oxide'),(.4,.3,'Olive'),(.15,-.65,'Sand')]:
    cyl('Drum',(x,y,.55),.38,1.1,mat,p,n=16)
    for z in [.10,.33,.82,1.06]:cyl('Drum band',(x,y,z),.397,.045,'Edge',p,n=16)
    cyl('Bung',(x+.14,y,1.115),.055,.03,'Steel',p,n=8)
p=begin('ST2-P02','Four-meter fence','prop','4 m repeating rigid fence panel; end snap anchors, no collision assigned.')
for x in [-2,2]:box('Post',(x,0,1.18),(.15,.15,2.36),'Steel',p)
for z in [.35,2.1]:box('Rail',(0,0,z),(4,.09,.10),'Edge',p)
for x in np.linspace(-1.8,1.8,13):beam('Mesh vertical',(float(x),0,.4),(float(x),0,2.06),.012,'Steel',p)
for z in np.linspace(.45,2.0,8):beam('Mesh horizontal',(-1.93,.01,float(z)),(1.93,.01,float(z)),.012,'Steel',p)
socket('Snap_W',(-2,0,0),p);socket('Snap_E',(2,0,0),p)
p=begin('ST2-P03','Pipe elbow','prop','Industrial bent pipe with flanged ends; reusable service-yard dressing.')
beam('Pipe A',(-1.1,0,.42),(0,0,.42),.22,'Olive',p);beam('Pipe B',(0,0,.42),(0,1.1,.42),.22,'Olive',p)
for loc,axis in [((-1.1,0,.42),'X'),((0,1.1,.42),'Y')]:cyl('Flange',loc,.34,.1,'Oxide',p,axis,n=16)
for x in [-.8,-.2]:box('Cradle',(x,0,.12),(.16,.7,.24),'Concrete',p)
p=begin('ST2-P04','Tripod work light','prop','Portable two-lamp floodlight with a mast pivot; no realtime lights attached.')
for a in [0,2.0944,4.1888]:beam('Leg',(0,0,.5),(.7*math.cos(a),.7*math.sin(a),.05),.04,'Steel',p)
beam('Mast',(0,0,.2),(0,0,2.9),.045,'Edge',p)
t=empty('LampYaw',(0,0,2.85),p);box('Crossbar',(0,0,0),(1.3,.09,.09),'Steel',t)
for x in [-.5,.5]:box('Lamp case',(x,0,.08),(.52,.22,.38),'Oxide',t);box('Lamp glass',(x,.12,.08),(.41,.018,.26),'Ivory',t,.014)
p=begin('ST2-P05','Cable reel','prop','Large industrial reel on small feet, baked cable rings rather than simulation.')
cyl('Cable coil',(0,0,.75),.62,.84,'Rubber',p,'X',20)
for x in [-.47,.47]:
    cyl('Reel side',(x,0,.75),.76,.075,'Sand',p,'X',20);cyl('Hub',(x*1.14,0,.75),.13,.14,'Steel',p,'X')
    box('Foot',(x,0,.10),(.24,1.35,.20),'Concrete',p)
for x in np.linspace(-.37,.37,10):cyl('Cable winding',(float(x),0,.75),.638,.026,'Steel',p,'X',20)
p=begin('ST2-P06','Wayfinding post','prop','Two-direction field sign with geometric hazard badge; no text localization dependency.')
box('Post',(0,0,1.3),(.12,.12,2.6),'Steel',p)
for z,s,mat in [(2.25,1,'Ivory'),(1.72,-1,'Oxide')]:
    v=[(-.65,-.06,z-.18),(.45,-.06,z-.18),(.72,-.06,z),(.45,-.06,z+.18),(-.65,-.06,z+.18)]
    o=mesh('Arrow',[(s*x,y,zz) for x,y,zz in v],[tuple(range(5))],mat,p);mod=o.modifiers.new('Sign thickness','SOLIDIFY');mod.thickness=.07
box('Foot',(0,0,.07),(.6,.6,.14),'Concrete',p)
p=begin('ST2-P07','Abandoned crawler hull','prop','Rusting empty wreck with tilted hatch and broken running gear; noninteractive seed.')
hull('Wreck shell',[(.25,1.15,1.9,.25),(.9,1.2,1.8,.30),(1.1,.9,1.3,.30)],'Oxide',p)
box('Empty turret well',(0,0,1.115),(1.3,1.4,.025),'Rubber',p,.02)
box('Displaced hatch',(.95,.35,1.18),(.9,.8,.09),'Edge',p,.025,(0,.55,.3))
for s in [-1,1]:
    for y in [-1.3,-.5,.4,1.25]:cyl('Bare wheel',(s*1.28,y,.4),.32,.12,'Steel',p,'X')
for i in range(5):box('Scattered plate',(rng.uniform(-1.5,1.5),rng.uniform(-2.2,2.2),.035),(.36,.22,.05),'Oxide',p,.01,(0,0,rng.random()*6))

# Explicit planar UVs, preserving separate editable component meshes in the source.
for entry in entries:
    for o in entry['collection'].objects:
        if o.type!='MESH':continue
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for face in o.data.polygons:
            axis=max(range(3),key=lambda a:abs(face.normal[a]));a,b=[i for i in range(3) if i!=axis]
            for li in face.loop_indices:
                v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[a]*.55,v[b]*.55)
    for o in entry['collection'].objects:o.name=entry['id']+'__'+o.name
    entry['collection'].hide_render=True
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(R/'ArtSource/Ashfall_Outpost_02.blend'))

import re, bmesh
catalog=[]; dg=bpy.context.evaluated_depsgraph_get()
def clean_name(o):return re.sub(r'\.\d+$','',o.name.split('__',1)[-1])
def path_of(o):return (path_of(o.parent)+'/' if o.parent else '')+o.name

def export_entry(entry,lod=0):
    c=bpy.data.collections.new('EXPORT');bpy.context.scene.collection.children.link(c);mapping={}
    originals=list(entry['collection'].objects)
    for o in originals:
        if o.type=='EMPTY':
            d=o.copy();c.objects.link(d);d.name=clean_name(o);mapping[o]=d
    for o,d in mapping.items():d.parent=mapping.get(o.parent);d.matrix_basis=o.matrix_basis.copy()
    for o in originals:
        if o.type!='MESH':continue
        me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg)
        d=bpy.data.objects.new('Surface',me);c.objects.link(d);d.parent=mapping[o.parent];d.matrix_basis=o.matrix_basis.copy()
    bpy.context.view_layer.update()
    for parent in list(mapping.values()):
        children=[o for o in parent.children if o.type=='MESH']
        if not children:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in children:o.select_set(True)
        bpy.context.view_layer.objects.active=children[0]
        if len(children)>1:bpy.ops.object.join()
        obj=bpy.context.object;obj.name=parent.name+'_Mesh'
        if lod:
            dec=obj.modifiers.new('Seed LOD reduction','DECIMATE');dec.ratio=.46;bpy.ops.object.modifier_apply(modifier=dec.name)
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bad=[f for f in bm.faces if f.calc_area()<1e-10]
        if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
        bm.to_mesh(obj.data);bm.free();obj.data.update()
    bpy.context.view_layer.update();objects=list(c.objects);meshes=[o for o in objects if o.type=='MESH']
    coords=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    lo=[min(v[a] for v in coords) for a in range(3)];hi=[max(v[a] for v in coords) for a in range(3)]
    tri=sum(len(o.data.polygons) for o in meshes);assert tri>0 and all(math.isfinite(v) for v in lo+hi)
    ident=entry['id']+('_LOD1' if lod else '')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    fbx=R/'Exports/FBX'/(ident+'.fbx');glb=R/'Exports/GLB'/(ident+'.glb')
    bpy.ops.export_scene.fbx(filepath=str(fbx),use_selection=True,object_types={'EMPTY','MESH'},apply_scale_options='FBX_SCALE_ALL',axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False,use_triangles=True,path_mode='STRIP')
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
    item={k:entry[k] for k in ['id','title','category','description']}
    item.update(export_id=ident,lod=lod,triangles=tri,meshes=len(meshes),bounds_min=lo,bounds_max=hi,fbx='Exports/FBX/'+fbx.name,glb='Exports/GLB/'+glb.name)
    item['sha256']={f.suffix[1:]:hashlib.sha256(f.read_bytes()).hexdigest() for f in [fbx,glb]}
    item['nodes']=[{'path':path_of(o),'position_blender_m':list(o.matrix_world.translation)} for o in objects if o.type=='EMPTY']
    item['materials']=sorted({s.material.name for o in meshes for s in o.material_slots if s.material})
    item['grid_m']=entry.get('grid_m',0);catalog.append(item)
    for o in objects:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(c);print('EXPORTED',ident,tri,flush=True)

for entry in entries:
    export_entry(entry)
    if entry['category']=='enemy':export_entry(entry,1)
matdata=[]
for m in M.values():
    p=m.node_tree.nodes.get('Principled BSDF');tex=[n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE']
    matdata.append({'name':m.name,'color':list(m.diffuse_color),'metallic':p.inputs['Metallic'].default_value,'roughness':p.inputs['Roughness'].default_value,'texture':('Textures/'+tex[0].name+'.png') if tex else ''})
(R/'catalog.json').write_text(json.dumps({'schema':1,'pack':'ST-KIT-02','title':'Ashfall Outpost','units':'meters','blender_forward':'+Y','blender_up':'+Z','unity_wrapper_forward':'-Z','items':catalog,'materials':matdata},indent=2),encoding='utf-8')
# Source opens as a spaced parts bench; exports remain ground-centered at origin.
for i,e in enumerate(entries):
    e['collection'].hide_render=False;e['root'].location=((i%6)*12,-(i//6)*14,0)
bpy.context.view_layer.update()
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=70;area.spaces.active.region_3d.view_location=(30,-20,0)
bpy.ops.object.select_all(action='DESELECT');entries[0]['root'].select_set(True)
bpy.context.view_layer.objects.active=entries[0]['root']
bpy.ops.wm.save_as_mainfile(filepath=str(R/'ArtSource/Ashfall_Outpost_02.blend'))
print('ST_KIT02_GENERATED',len(entries),'assets',len(catalog),'exports',flush=True)

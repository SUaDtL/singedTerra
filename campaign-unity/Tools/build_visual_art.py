"""Author the new ST-VIS-01 enemy models and terrain textures; never replace saved art.
Run through Blender --background --python. Existing output/source is refused.
"""
from pathlib import Path
import bpy, math, json, hashlib
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Unity/Assets/Art/VisualReview'
SOURCE = ROOT / 'ArtSource/VisualReview_01.blend'
if OUT.exists() or SOURCE.exists():
    raise RuntimeError('Visual art already exists; preserve it and use a fresh task copy')
OUT.mkdir(parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
materials = {}
for name, rgb, metallic, rough in [
    ('EnemyArmor',(.36,.23,.13),.4,.72), ('EnemyGunmetal',(.105,.13,.14),.7,.55),
    ('EnemyTrack',(.055,.059,.056),.25,.88), ('EnemyMark',(.77,.60,.31),.2,.65),
    ('EnemyOptic',(.12,.38,.42),.5,.3), ('EnemyRanged',(.31,.36,.33),.45,.68)]:
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=rough
    materials[name]=m
roots=[]; current=None

def attach(ob,name,mat,bevel=.025):
    ob.name=name;ob.parent=current;ob.data.materials.append(materials[mat])
    if bevel:
        b=ob.modifiers.new('Machined edges','BEVEL');b.width=bevel;b.segments=2
        ob.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return ob

def box(name,loc,size,mat='EnemyArmor',bevel=.025,rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rotation: ob.rotation_euler=rotation
    return attach(ob,name,mat,bevel)

def cylinder(name,loc,radius,depth,mat='EnemyGunmetal',axis='X',sides=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=depth,location=loc)
    ob=bpy.context.object
    if axis=='X':ob.rotation_euler[1]=math.pi/2
    if axis=='Y':ob.rotation_euler[0]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return attach(ob,name,mat,.008)

def wedge(name,width,length,low,high,mat):
    v=[(-width/2,-length/2,low),(width/2,-length/2,low),(width/2,length/2,low),(-width/2,length/2,low),
       (-width*.40,-length*.40,high),(width*.40,-length*.40,high),(width*.36,length*.40,high*.87),(-width*.36,length*.40,high*.87)]
    f=[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    return attach(ob,name,mat,.045)

for ranged in (False,True):
    code='STV-E02' if ranged else 'STV-E01'
    current=bpy.data.objects.new(code,None);bpy.context.collection.objects.link(current);roots.append(current)
    mat='EnemyRanged' if ranged else 'EnemyArmor'
    wedge('SlopedHull',1.58,2.58,.30,.94,mat)
    box('LowerSill',(0,0,.36),(1.60,2.52,.25),'EnemyGunmetal',.055)
    for sign in (-1,1):
        box('TrackBelt',(sign*.92,0,.35),(.36,2.83,.62),'EnemyTrack',.16)
        box('Fender',(sign*.92,0,.73),(.45,2.85,.10),mat,.04)
        for n,y in enumerate((-.99,-.5,0,.5,.99)):
            wheel=cylinder('Wheel_%s_%s'%(sign,n),(sign*1.108,y,.35),.24,.028)
            hub=cylinder('Hub',(sign*1.13,y,.35),.075,.032,'EnemyMark',sides=8)
            spoke=box('WheelSpoke',(sign*1.151,y,.35),(.016,.35,.037),'EnemyMark',.004)
            bpy.context.view_layer.update()
            for child in (hub,spoke):
                world=child.matrix_world.copy();child.parent=wheel;child.matrix_world=world
        for y in np.linspace(-1.15,1.15,9):
            box('TreadShoe',(sign*.94,float(y),.062),(.38,.10,.045),'EnemyGunmetal',.01)
        box('NoseLamp',(sign*.53,1.1,.84),(.20,.09,.12),'EnemyOptic',.02)
        box('TowLug',(sign*.59,1.25,.45),(.13,.14,.10),'EnemyMark',.015)
    for y in (-.82,-.64,-.46):box('EngineLouvre',(0,y,.96),(.86,.06,.025),'EnemyGunmetal',.008)
    cylinder('Hatch',(0,.10,1.00),.35,.08,mat,'Z',16)
    if ranged:
        box('Turret',(0,.25,1.13),(1.20,1.13,.42),mat,.14)
        cylinder('GunSleeve',(0,1.18,1.16),.13,1.23,axis='Y',sides=16)
        cylinder('Muzzle',(0,1.88,1.16),.18,.22,'EnemyGunmetal','Y',16)
        cylinder('Bore',(0,1.995,1.16),.11,.008,'EnemyTrack','Y',16)
        box('RangeFinder',(.44,.44,1.37),(.21,.34,.13),'EnemyOptic',.015)
    else:
        box('ForwardShield',(0,1.14,.76),(1.33,.19,.43),mat,.06,(-.25,0,0))
        box('ObservationSlit',(0,.47,1.015),(.56,.12,.10),'EnemyOptic',.015)
        for sign in (-1,1):
            box('NoseChevron',(sign*.17,1.252,.79),(.45,.025,.060),'EnemyMark',.006,(0,sign*.38,0))
    cylinder('Aerial',(-.50,-.54,1.33),.015,.70,'EnemyGunmetal','Z',8)
    current.location.x=(4 if ranged else 0)

bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
manifest={'schema':1,'scope':'ST-VIS-01 art','blender':bpy.app.version_string,'models':[]}
for root in roots:
    root.location=(0,0,0);bpy.context.view_layer.update()
    for ob in root.children_recursive:
        if ob.type=='MESH':
            bpy.context.view_layer.objects.active=ob
            for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    groups={}
    for ob in list(root.children):
        if ob.type=='MESH' and not ob.name.startswith('Wheel_'):
            groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for mat,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        ob=objects[0];ob.name=root.name+'_'+mat
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02)
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root]+list(root.children_recursive):ob.select_set(True)
    bpy.context.view_layer.objects.active=root
    target=OUT/(root.name+'.fbx')
    bpy.ops.export_scene.fbx(filepath=str(target),use_selection=True,object_types={'MESH','EMPTY'},
        axis_forward='-Z',axis_up='Y',apply_unit_scale=True,bake_space_transform=False,
        add_leaf_bones=False,bake_anim=False,path_mode='RELATIVE')
    manifest['models'].append({'id':root.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'nominal_triangles':sum(len(p.vertices)-2 for ob in root.children_recursive if ob.type=='MESH' for p in ob.data.polygons)})

def png(name,rgb):
    h,w=rgb.shape[:2];rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:3]=np.clip(rgb,0,1)
    image=bpy.data.images.new(name,width=w,height=h,alpha=True)
    image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(OUT/(name+'.png'))
    image.file_format='PNG';image.save();bpy.data.images.remove(image)

size=2048;rng=np.random.default_rng(7201)
y,x=np.mgrid[0:size,0:size].astype(np.float32);x=x/(size-1)*128-64;y=y/(size-1)*128-64

def noise(cells):
    grid=rng.random((cells+1,cells+1),dtype=np.float32)
    a=np.linspace(0,cells-.001,size,dtype=np.float32);i=a.astype(np.int32);t=a-i;t=t*t*(3-2*t)
    return (grid[i[:,None],i[None,:]]*(1-t[:,None])*(1-t[None,:])+
            grid[i[:,None]+1,i[None,:]]*t[:,None]*(1-t[None,:])+
            grid[i[:,None],i[None,:]+1]*(1-t[:,None])*t[None,:]+
            grid[i[:,None]+1,i[None,:]+1]*t[:,None]*t[None,:])

n=.48*noise(9)+.27*noise(29)+.16*noise(100)+.09*noise(550)
grain=rng.random((size,size),dtype=np.float32)
scar=np.exp(-((x+3)**2+(y-1)**2)/100)*.18
road=np.exp(-((y-.22*x-1.5*np.sin(x*.12))/2.7)**4)*.10
ruts=np.exp(-((y-.22*x-1.5*np.sin(x*.12)-1.15)/.22)**2)*.12
ruts+=np.exp(-((y-.22*x-1.5*np.sin(x*.12)+1.15)/.22)**2)*.12
value=.66+n*.38+grain*.07-scar-road-ruts
for name,base in [('GroundAsh',(.37,.30,.22)),('GroundIron',(.27,.29,.275))]:
    rgb=value[:,:,None]*np.array(base,dtype=np.float32)
    rgb+=(grain>.995)[:,:,None]*.065
    png(name,rgb)
# A modest shared wear texture keeps vehicle paint from reading as glossy plastic.
wear=np.clip(.67+.25*n+.10*grain,0,1)
png('VehicleWear',np.repeat(wear[:,:,None],3,axis=2))
manifest['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
manifest['textures']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.glob('*.png')}
(OUT/'art-receipt.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('ST_VIS_ART_PASS '+json.dumps(manifest))

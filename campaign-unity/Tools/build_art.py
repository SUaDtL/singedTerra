"""ST-ART-01: editable original tank and clearing. No gameplay rules."""
from pathlib import Path
import bpy, math, random, json
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'Unity/Assets/Art'; SRC=ROOT/'ArtSource'
OUT.mkdir(parents=True,exist_ok=True); SRC.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
rng=random.Random(2083); materials={}; roots={}
def material(name,color,metal=0,rough=.65):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    materials[name]=m;return m
armor=material('Armor',(0.34,.32,.21),.5,.65)
edge=material('Edge',(.21,.23,.20),.65,.5)
steel=material('Steel',(.13,.145,.14),.75,.5)
rubber=material('Rubber',(.045,.052,.048),.1,.85)
brass=material('Brass',(.57,.34,.12),.65,.5)
white=material('Marking',(.73,.67,.47),.1,.8)
lens=material('Optic',(.08,.27,.29),.5,.25)
dirt=material('Earth',(.22,.18,.135),0,.95)
concrete=material('Concrete',(.29,.28,.25),0,.9)
wood=material('Wood',(.23,.13,.065),0,.9)
black=material('Soot',(.07,.065,.055),0,1)
def root(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent
    roots[name]=o;return o
def finish(o,name,mat,parent,bevel=0):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if bevel:
        b=o.modifiers.new('Manufactured edge bevel','BEVEL');b.width=bevel;b.segments=2
        b.affect='EDGES'
        n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True
    return o
def box(name,loc,size,mat,parent,bevel=.035,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=rot
    return finish(o,name,mat,parent,bevel)
def cylinder(name,loc,r,depth,mat,parent,axis='Z',vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object
    if axis=='X':o.rotation_euler[1]=math.pi/2
    if axis=='Y':o.rotation_euler[0]=math.pi/2
    return finish(o,name,mat,parent,.012)
def hull_mesh(name,levels,mat,parent):
    # Octagonal cross-sections define real sloping armor instead of stacked cubes.
    v=[]
    for z,w,l,c in levels:
        v.extend([(x,y,z) for x,y in [(-w+c,-l),(w-c,-l),(w,-l+c),(w,l-c),(w-c,l),(-w+c,l),(-w,l-c),(-w,-l+c)]])
    f=[tuple(reversed(range(8))),tuple(range(len(v)-8,len(v)))]
    for j in range(len(levels)-1):
        for i in range(8):a=j*8+i;b=j*8+(i+1)%8;f.append((a,b,b+8,a+8))
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,parent,.045)
def textured(m,name,base,size=512,ground=False):
    gen=np.random.default_rng(2083+(1 if ground else 0));n=gen.random((size,size))
    low=gen.random((size//16,size//16));low=np.repeat(np.repeat(low,16,0),16,1)
    shade=(.78+.30*n+.18*low)
    rgb=np.array(base)[None,None,:]*shade[:,:,None]
    chips=gen.random((size,size))>.991
    for dy in range(3):chips|=np.roll(chips,1,axis=0)&(n>.5)
    if not ground:rgb[chips]=np.array([.11,.12,.10])
    image=bpy.data.images.new(name,width=size,height=size,alpha=True)
    pixels=np.ones((size,size,4),np.float32);pixels[:,:,:3]=np.clip(rgb,0,1)
    image.pixels.foreach_set(pixels.ravel());image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save()
    node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    m.node_tree.links.new(node.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
textured(armor,'Armor_BaseColor',(.40,.38,.25))
textured(dirt,'Earth_BaseColor',(.30,.255,.195),1024,True)
tank=root('StarterTank_A');hull=root('Hull',tank)
left=root('Track_Left',tank);right=root('Track_Right',tank)
turret=root('TurretYaw',tank);barrel=root('BarrelRecoil',turret)
slot=root('AttachmentSocket',turret);repair=root('Attachment_Repair',slot);launcher=root('Attachment_Launcher',slot)
hull_mesh('Sloped lower hull',[(.50,1.22,2.65,.35),(1.13,1.53,2.90,.35),(1.45,1.44,2.48,.45)],armor,hull)
hull_mesh('Upper deck',[(1.28,1.48,2.55,.30),(1.73,1.22,1.90,.45)],armor,hull)
box('Glacis seam',(0,2.45,1.45),(2.20,.06,.06),edge,hull,.01)
for x in [-1,1]:
    box('Fender', (x*1.72,0,1.52),(.88,5.9,.12),armor,hull,.045)
    for y in [-1.9,-.63,.63,1.9]:
        box('Side skirt',(x*2.06,y,1.16),(.095,1.15,.67),armor,hull,.035)
        for yy in [-.43,.43]:cylinder('Skirt fastener',(x*2.125,y+yy,1.35),.04,.035,brass,hull,'X',8)
    box('Front lamp case',(x*1.13,2.38,1.54),(.35,.28,.24),steel,hull,.055)
    box('Front lamp',(x*1.13,2.54,1.55),(.25,.025,.13),white,hull,.02)
for sign,part in [(-1,left),(1,right)]:
    x=sign*1.70
    for y in np.linspace(-1.9,1.9,6):
        cylinder('Road wheel rubber',(x,y,.69),.47,.52,rubber,part,'X')
        cylinder('Road wheel rim',(x+sign*.29,y,.69),.34,.045,edge,part,'X')
        cylinder('Road wheel hub',(x+sign*.33,y,.69),.12,.08,brass,part,'X',12)
        for a in range(6):
            ang=a*math.tau/6
            cylinder('Wheel bolt',(x+sign*.32,y+.245*math.cos(ang),.69+.245*math.sin(ang)),.025,.03,steel,part,'X',6)
    for y in [-2.35,2.35]:cylinder('Sprocket',(x,y,.80),.51,.56,steel,part,'X',16)
    # Individual tread shoes form a continuous capsule-shaped belt.
    path=[]
    for y in np.linspace(-2.35,2.35,23,endpoint=False):path.append((y,.17,0))
    for a in np.linspace(-math.pi/2,math.pi/2,11,endpoint=False):path.append((2.35+.63*math.cos(a),.80+.63*math.sin(a),a+math.pi/2))
    for y in np.linspace(2.35,-2.35,23,endpoint=False):path.append((y,1.43,math.pi))
    for a in np.linspace(math.pi/2,3*math.pi/2,11,endpoint=False):path.append((-2.35+.63*math.cos(a),.80+.63*math.sin(a),a+math.pi/2))
    for i,(y,z,ang) in enumerate(path):
        box('Tread shoe %02d'%i,(x,y,z),(.79,.205,.13),steel,part,.018,(ang,0,0))
        box('Rubber tread pad',(x,y,z-.075*math.cos(ang)),(.50,.135,.075),rubber,part,.016,(ang,0,0))
for y in np.linspace(-2.20,-1.0,9):box('Engine grille',(0,y,1.71),(1.12,.052,.04),steel,hull,.006)
for x in [-.83,.83]:
    cylinder('Exhaust pipe',(x,-2.39,1.53),.12,.80,steel,hull,'Z')
    cylinder('Exhaust cap',(x,-2.39,1.95),.16,.065,steel,hull)
box('Rear stowage',(0,-2.44,1.08),(1.65,.40,.48),edge,hull,.06)
for x in [-.80,.80]:
    cylinder('Tow eye',(x,2.63,.82),.12,.08,steel,hull,'Y',16)
cylinder('Turret ring',(0,0,1.72),1.06,.20,steel,turret,vertices=48)
hull_mesh('Cast turret',[(1.79,1.19,1.28,.42),(2.35,1.27,1.23,.49),(2.67,.90,.88,.34)],armor,turret)
box('Mantlet',(0,1.18,2.17),(.92,.53,.65),edge,turret,.12)
for y,r,d,m in [(1.63,.26,.70,steel),(2.18,.205,.52,armor),(3.19,.145,1.78,steel),(4.15,.205,.28,edge),(4.35,.17,.20,steel)]:
    cylinder('Cannon segment',(0,y,2.23),r,d,m,barrel,'Y',32)
for y in [2.43,3.51,4.08]:cylinder('Barrel band',(0,y,2.23),.185,.09,brass,barrel,'Y',24)
cylinder('Dark muzzle bore',(0,4.46,2.23),.118,.008,rubber,barrel,'Y',32)
cylinder('Commander hatch',(-.38,-.15,2.68),.43,.15,edge,turret,vertices=32)
cylinder('Hatch inset',(-.38,-.15,2.77),.34,.03,armor,turret,vertices=32)
box('Hatch handle',(-.38,-.16,2.86),(.23,.07,.045),steel,turret,.016)
box('Optics hood',(.42,.59,2.61),(.49,.28,.23),edge,turret,.04)
box('Optics glass',(.42,.745,2.61),(.34,.016,.11),lens,turret,.014)
box('Turret rear basket',(0,-1.37,2.11),(1.75,.55,.48),steel,turret,.05)
for x in np.linspace(-.75,.75,7):box('Basket brace',(x,-1.665,2.12),(.045,.06,.39),edge,turret,.01)
cylinder('Antenna base',(-.82,-.62,2.57),.10,.15,steel,turret)
cylinder('Antenna',(-.82,-.62,3.29),.012,1.36,steel,turret,vertices=8)
for side in [-1,1]:
    for y in [-.62,-.15,.32]:
        box('Turret cheek plate',(side*1.15,y,2.20),(.095,.38,.41),edge,turret,.025, (0,side*.20,0))
        cylinder('Plate fixing',(side*1.22,y,2.28),.025,.035,brass,turret,'X',8)
box('Repair base',(1.34,-.40,2.07),(.74,.86,.16),steel,repair,.035)
box('Repair housing',(1.34,-.43,2.36),(.65,.68,.45),armor,repair,.07)
for y in [-.65,-.47,-.29]:box('Repair ventilation',(1.68,y,2.34),(.025,.085,.25),steel,repair,.005)
cylinder('Service reservoir',(1.31,-.85,2.40),.19,.49,brass,repair,'Z',16)
box('Service indicator',(1.35,-.067,2.40),(.34,.025,.065),lens,repair,.006)
box('Launcher foot',(1.34,-.40,2.07),(.74,.86,.16),steel,launcher,.035)
box('Launcher cradle',(1.34,-.40,2.31),(.48,.72,.35),edge,launcher,.045)
for x in [1.12,1.53]:
    for z in [2.50,2.84]:
        cylinder('Auxiliary launch tube',(x,-.28,z),.145,1.08,armor,launcher,'Y',16)
        cylinder('Launch collar',(x,.28,z),.175,.11,brass,launcher,'Y',16)
        cylinder('Launch aperture',(x,.344,z),.11,.014,rubber,launcher,'Y',16)
def label(text,loc,size,parent,rotation):
    curve=bpy.data.curves.new('Painted stencil','FONT');curve.body=text;curve.size=size;curve.extrude=.001
    o=bpy.data.objects.new('Stencil '+text,curve);bpy.context.collection.objects.link(o)
    o.location=loc;o.rotation_euler=rotation;o.parent=parent;o.data.materials.append(white)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o.select_set(False)
label('01',(2.12,.20,1.00),.36,hull,(math.pi/2,0,math.pi/2))
label('01',(-.38,2.925,.90),.36,hull,(math.pi/2,0,math.pi))
# Reposition articulated pivots while preserving the authored world positions.
def pivot(obj,loc):
    bpy.context.view_layer.update()
    children=[(c,c.matrix_world.copy()) for c in obj.children]
    obj.location=loc;bpy.context.view_layer.update()
    for c,m in children:c.matrix_world=m
    bpy.context.view_layer.update()
bpy.context.view_layer.update();pivot(turret,(0,0,1.77));pivot(barrel,(0,1.17,.46))
# Socket local position stays zero; both variants share the same authored mount.
env=root('Clearing_A');ground=root('Ground',env);props=root('PerimeterProps',env)
v=[];faces=[];N=64
for iy in range(N+1):
    for ix in range(N+1):
        x=(ix/N-.5)*56;y=(iy/N-.5)*56;r=math.hypot(x,y)
        z=(math.sin(x*.57)*math.cos(y*.37)*.25+math.sin(x*.18+y*.16)*.40)*min(1,max(0,(r-4)/6))-.035
        v.append((x,y,z))
for y in range(N):
    for x in range(N):a=y*(N+1)+x;faces.extend([(a,a+1,a+N+2),(a,a+N+2,a+N+1)])
me=bpy.data.meshes.new('Sculpted clearing');me.from_pydata(v,[],faces);me.update()
o=bpy.data.objects.new('Clearing soil',me);bpy.context.collection.objects.link(o);finish(o,'Clearing soil',dirt,ground)
uv=me.uv_layers.new(name='GroundUV')
for p in me.polygons:
    for idx in p.loop_indices:
        co=me.vertices[me.loops[idx].vertex_index].co;uv.data[idx].uv=(co.x/5,co.y/5)
for i in range(110):
    a=rng.random()*math.tau;r=rng.uniform(8,25);x,y=math.cos(a)*r,math.sin(a)*r
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,.10))
    o=bpy.context.object;o.scale=(rng.uniform(.10,.65),rng.uniform(.10,.65),rng.uniform(.12,.5))
    o.rotation_euler=(rng.random(),rng.random(),rng.random()*6.28);finish(o,'Basalt rubble',concrete,props)
for sign in [-1,1]:
    for i in range(8):
        y=-10+i*.77;x=sign*(8.4+.08*i)
        for row in range(2):box('Earthwork sandbag',(x+row*.05,y+(row%2)*.27,.24+row*.32),(.55,.90,.38),armor,props,.16,(0,0,sign*.12))
    box('Broken retaining wall',(sign*12,-9,.75),(3.5,.45,1.7),concrete,props,.08,(0,sign*.07,sign*.24))
    for i in range(3):box('Exposed reinforcement',(sign*12+(-1+i)*.70,-9,1.9),(.035,.035,.90),steel,props,.006,(.05,.04,0))
for x,y,a in [(-9,7,.3),(10,8,-.4),(-13,-5,.1)]:
    box('Crate',(x,y,.43),(1.0,.75,.85),wood,props,.04,(0,0,a))
    for side in [-1,1]:box('Crate metal band',(x+side*.34,y,.44),(.06,.78,.88),steel,props,.008,(0,0,a))
for x in [-1.7,1.7]:
    for y in np.linspace(-12,-3.4,38):box('Track impression',(x,y,.012),(.83,.14,.014),black,ground,0)
# UVs for reusable tiled armor material; applied only to authored mesh surfaces.
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and o!=bpy.data.objects.get('Clearing soil'):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
# .blend keeps all separate editable parts and non-destructive bevel modifiers.
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'StarterTank_and_Clearing.blend'))
# Combine only static pieces sharing parent/material for modest runtime draw calls.
for owner in [hull,left,right,turret,barrel,repair,launcher,ground,props]:
    groups={}
    for ob in list(owner.children):
        if ob.type=='MESH':groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for mat_name, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:
            bpy.context.view_layer.objects.active=ob
            for mod in list(ob.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
            ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=owner.name+'_'+mat_name

def export_tree(obj, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [obj]+list(obj.children_recursive):
        ob.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.fbx(filepath=str(OUT/filename),use_selection=True,
        object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',
        apply_unit_scale=True,bake_space_transform=False,add_leaf_bones=False,
        bake_anim=False,path_mode='RELATIVE',use_mesh_modifiers=True)

export_tree(tank,'StarterTank_A.fbx')
export_tree(env,'Clearing_A.fbx')
manifest={'scope':'ST-ART-01 original editable tank and clearing; no gameplay',
    'blender':bpy.app.version_string,'seed':2083,
    'materials':{n:{'color':list(m.diffuse_color),'metallic':m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value,
        'roughness':m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value} for n,m in materials.items()},
    'exports':['StarterTank_A.fbx','Clearing_A.fbx'],
    'source':'ArtSource/StarterTank_and_Clearing.blend'}
manifest['runtime_meshes']=sum(o.type=='MESH' for o in bpy.context.scene.objects)
manifest['runtime_triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
(OUT/'art-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('ST_ART_EXPORT_OK '+json.dumps({'meshes':manifest['runtime_meshes'],'triangles':manifest['runtime_triangles'],'exports':manifest['exports']}))
